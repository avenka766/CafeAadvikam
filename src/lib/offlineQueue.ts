// OFFLINE FIX (2026-09-01): a persisted queue of writes that failed while the
// browser had no network connection. Each entry is a self-contained retry
// action: a `kind` label (for the pending-count UI and logging) plus a
// `run()` closure that re-attempts the original Supabase call. Entries are
// stored in IndexedDB (via idb-keyval, same as localCache.ts) so a queued
// write survives a page reload or the browser being closed mid-outage — not
// just an in-memory array that would be lost the moment the tab closes.
//
// This module is deliberately generic and knows nothing about branches,
// bills, or stock — callers (branchOpsStore.ts's mirrorOperationRecord,
// branchStore.ts's write-path functions, etc.) decide what "kind" means and
// build the retry closure themselves. See the Stage B call sites for the
// actual wiring.
//
// A queued entry's `run()` closure is NOT itself persisted (a function can't
// be serialized into IndexedDB) — only its `payload` is. On reconnect this
// module calls the CALLER-supplied `replay(kind, payload)` dispatcher (set
// once via `setReplayHandler`) to reconstruct and re-attempt the write. This
// keeps the queue itself dependency-free of any particular store.

import { get, set as idbSet, createStore, type UseStore } from 'idb-keyval';
import { create } from 'zustand';

export interface QueuedMutation {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

// A single shape rather than a discriminated union ({ ok: true } | { ok:
// false; error }) — this project builds with strictNullChecks off (see
// tsconfig.json), which disables TS's discriminated-union narrowing
// entirely, so `if (result.ok) ... else result.error` would fail to
// typecheck. `error` is simply optional instead; always present when
// `ok` is false, always absent when `ok` is true, same contract, no
// narrowing required to read it safely.
type ReplayResult = { ok: boolean; error?: string };
type ReplayHandler = (kind: string, payload: unknown) => Promise<ReplayResult>;

const DB_NAME = 'cafe_aadvikam_offline_queue';
const STORE_NAME = 'pending';
const QUEUE_KEY = 'queue';

let store: UseStore | null | undefined;
function getStore(): UseStore | null {
  if (store !== undefined) return store;
  try {
    store = typeof indexedDB === 'undefined' ? null : createStore(DB_NAME, STORE_NAME);
  } catch {
    store = null;
  }
  return store;
}

async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const s = getStore();
    if (!s) return [];
    const value = await get<QueuedMutation[]>(QUEUE_KEY, s);
    return value ?? [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  try {
    const s = getStore();
    if (!s) return;
    await idbSet(QUEUE_KEY, queue, s);
  } catch {
    // best-effort — if this fails the queue only lives in the Zustand store
    // below for the rest of this tab's session, same trade-off localCache.ts
    // already accepts elsewhere in this app.
  }
}

// STAGE B (2026-09-01): a registry rather than a single handler — each store
// that enqueues its own writes (branchOpsStore.ts's mirrorOperationRecord,
// branchStore.ts's write-path functions, ...) registers a handler for its
// own `kind` string at module load time. Keeps this module dependency-free
// of any particular store (no central dispatcher file, no circular imports)
// while still letting multiple independent stores share one queue.
const replayHandlers = new Map<string, ReplayHandler>();
/** Call once per `kind` at module load time (see branchOpsStore.ts/branchStore.ts). */
export function registerReplayHandler(kind: string, handler: ReplayHandler) {
  replayHandlers.set(kind, handler);
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface OfflineQueueState {
  pending: QueuedMutation[];
  flushing: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  enqueue: (kind: string, payload: unknown) => Promise<void>;
  flush: () => Promise<void>;
  // OFFLINE FIX (2026-09-01): once real business-logic RPCs (stock
  // decrements, credit settlement, etc.) started going through this queue —
  // not just simple idempotent upserts — a stuck failed entry became a real
  // possibility (e.g. two offline tills both selling the last unit of an
  // item; whichever replays second gets a genuine "insufficient stock"
  // rejection from the server, not a network error). `flush()` stops at the
  // first failure to preserve ordering, so a permanently-failing entry would
  // silently block every later queued write forever with no way out short of
  // clearing browser storage. `discard()` lets a human — who has actually
  // looked at what failed via OfflineBanner's failure view — remove one
  // entry so the rest of the queue can proceed.
  discard: (id: string) => Promise<void>;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  pending: [],
  flushing: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const persisted = await readQueue();
    // BUG FIX (2026-09-01, found via live testing): this used to blindly
    // overwrite `pending` with whatever was on disk. App.tsx's
    // OfflineQueueBootstrap calls hydrate() once on every app mount, which
    // in practice always finishes long before a real checkout could happen
    // — but if anything ever does enqueue() before this resolves (e.g. a
    // future call site, an HMR-timing edge case, or exactly the race this
    // was caught by during testing), overwriting would silently drop that
    // brand-new entry instead of merging it in. Union by id instead —
    // in-memory wins on a conflicting id, and the merged result is written
    // back so a genuinely new in-memory-only entry survives a reload too.
    const inMemory = get().pending;
    const merged = [...persisted];
    for (const entry of inMemory) {
      if (!merged.some((e) => e.id === entry.id)) merged.push(entry);
    }
    set({ pending: merged, hydrated: true });
    if (merged.length !== persisted.length) await writeQueue(merged);
  },

  // Called by a write path's failure handler when `!navigator.onLine` — see
  // branchOpsStore.ts's mirrorOperationRecord and branchStore.ts's write
  // functions for real call sites. The optimistic local state those callers
  // already applied stands as-is; this only guarantees the write itself
  // isn't lost.
  enqueue: async (kind, payload) => {
    const entry: QueuedMutation = {
      id: makeId(),
      kind,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    };
    const next = [...get().pending, entry];
    set({ pending: next });
    await writeQueue(next);
  },

  // Processes the queue IN ORDER per `kind` and stops THAT kind at its first
  // hard failure — a later queued write of the SAME kind might depend on an
  // earlier one having landed (e.g. two edits to the same waste log), so
  // skipping a failed entry and continuing with later same-kind entries
  // risks applying changes out of order.
  //
  // AUDIT FIX (2026-09-02): this used to be ONE global stop-at-first-failure
  // pass across every kind combined — a single genuinely-stuck entry (e.g.
  // a sale rejected for real, not a transient network blip) permanently
  // blocked every OTHER kind's queued writes too (stock deltas, credit
  // settlements, order submits, ...), even though there's no real ordering
  // dependency BETWEEN different kinds, only within the same kind. Now
  // grouped by kind first, so one stuck kind no longer blocks the rest.
  flush: async () => {
    if (get().flushing) return;
    if (!navigator.onLine) return;
    await get().hydrate();
    const queue = get().pending;
    if (queue.length === 0) return;

    set({ flushing: true });
    try {
      const blockedKinds = new Set<string>();
      for (const entry of queue) {
        if (blockedKinds.has(entry.kind)) continue;

        const handler = replayHandlers.get(entry.kind);
        if (!handler) {
          // No store has registered a handler for this kind — most likely a
          // queued entry left over from an older deploy whose write path
          // changed shape. Drop it rather than blocking every later entry
          // of this kind forever on something no code can ever replay, but
          // log loudly so it isn't silently lost without a trace.
          console.error(`[offlineQueue] no replay handler registered for kind "${entry.kind}" — dropping queued entry ${entry.id}`);
          const remaining = get().pending.filter((e) => e.id !== entry.id);
          set({ pending: remaining });
          await writeQueue(remaining);
          continue;
        }
        const result = await handler(entry.kind, entry.payload);
        if (result.ok) {
          const remaining = get().pending.filter((e) => e.id !== entry.id);
          set({ pending: remaining });
          await writeQueue(remaining);
        } else {
          const errorMessage = result.error ?? 'Unknown error';
          const remaining = get().pending.map((e) =>
            e.id === entry.id ? { ...e, attempts: e.attempts + 1, lastError: errorMessage } : e,
          );
          set({ pending: remaining });
          await writeQueue(remaining);
          // Stop THIS kind here — preserve its own ordering — but let
          // every other kind's entries keep being attempted below.
          blockedKinds.add(entry.kind);
        }
      }
    } finally {
      set({ flushing: false });
    }
  },

  discard: async (id) => {
    const next = get().pending.filter((e) => e.id !== id);
    set({ pending: next });
    await writeQueue(next);
  },
}));

// Wire the real browser online/offline signal — App.tsx's cosmetic-only
// OfflineBanner used to be the only thing listening to this; now a
// reconnect also triggers a real flush attempt. A periodic safety retry
// covers the case where `online` fires (e.g. wifi reassociates) but the
// actual Supabase endpoint is still unreachable for a few more seconds.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void useOfflineQueueStore.getState().flush(); });
  setInterval(() => {
    if (navigator.onLine) void useOfflineQueueStore.getState().flush();
  }, 30_000);
}
