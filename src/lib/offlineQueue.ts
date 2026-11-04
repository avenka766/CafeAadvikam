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

import { get as idbGet, set as idbSet, createStore, type UseStore } from 'idb-keyval';
import { create } from 'zustand';

export interface QueuedMutation {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  // AUDIT FIX (2026-09-09): identity of whoever was actually logged in when
  // this write was queued — captured once, at enqueue time, never touched
  // again. A queued entry has no owner check of its own otherwise: on a
  // shared device (a branch counter, a shared tablet) staff commonly log
  // out and a DIFFERENT person logs in before the queue gets a chance to
  // flush on reconnect. Without this, flush() would silently replay Staff
  // A's queued write under Staff B's now-active session — every gated RPC
  // this app has (see this session's security work) attributes the write to
  // whoever's session is live AT REPLAY TIME, not who actually did the
  // work, which is a real audit-trail integrity gap on top of just being
  // surprising. Optional so existing IndexedDB entries from before this
  // field existed still deserialize fine (treated as "no known owner",
  // never blocked — same as today's behavior for them).
  staffId?: string | null;
  staffUsername?: string | null;
  anonymous?: boolean;
}

// A single shape rather than a discriminated union ({ ok: true } | { ok:
// false; error }) — this project builds with strictNullChecks off (see
// tsconfig.json), which disables TS's discriminated-union narrowing
// entirely, so `if (result.ok) ... else result.error` would fail to
// typecheck. `error` is simply optional instead; always present when
// `ok` is false, always absent when `ok` is true, same contract, no
// narrowing required to read it safely.
type ReplayResult = { ok: boolean; error?: string };
type ReplayHandler = (kind: string, payload: unknown, requestId: string) => Promise<ReplayResult>;

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

const STORAGE_ERROR = 'Offline storage is unavailable. Keep this window open; offline changes are not safely saved until storage recovers.';
let storageWrites: Promise<void> = Promise.resolve();
let archiveWrites:Promise<void>=Promise.resolve();
async function readQueue(): Promise<QueuedMutation[]> {
  const target = getStore();
  if (!target) throw new Error(STORAGE_ERROR);
  const value = await idbGet<QueuedMutation[]>(QUEUE_KEY, target);
  if (value !== undefined && !Array.isArray(value)) throw new Error('Offline queue data is unreadable. Keep this window open and contact Admin.');
  return value ?? [];
}
async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  // Serialize snapshots so an earlier, slower write cannot replace newer bills.
  const snapshot = structuredClone(queue);
  const write = storageWrites.catch(() => {}).then(async () => {
    const target = getStore();
    if (!target) throw new Error(STORAGE_ERROR);
    await idbSet(QUEUE_KEY, snapshot, target);
  });
  storageWrites = write;
  return write;
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
  return crypto.randomUUID();
}

interface OfflineQueueState {
  pending: QueuedMutation[];
  flushing: boolean;
  hydrated: boolean;
  storageError: string | null;
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
  storageError: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
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
    set({storageError:null});
    } catch {set({hydrated:false,storageError:STORAGE_ERROR});}
  },

  // Called by a write path's failure handler when `!navigator.onLine` — see
  // branchOpsStore.ts's mirrorOperationRecord and branchStore.ts's write
  // functions for real call sites. The optimistic local state those callers
  // already applied stands as-is; this only guarantees the write itself
  // isn't lost.
  enqueue: async (kind, payload) => {
    await get().hydrate();
    if (!get().hydrated) throw new Error(get().storageError || STORAGE_ERROR);
    // AUDIT FIX (2026-09-09): capture who's actually logged in right now, so
    // flush() can refuse to replay this under a DIFFERENT person's session
    // later. Dynamic import — authStore already doesn't import this module,
    // so a static import would be safe too, but this keeps the two modules
    // decoupled the same way the rest of this file is deliberately
    // store-agnostic (see the file header).
    const { useAuthStore } = await import('@/stores/authStore');
    const currentUser = useAuthStore.getState().currentUser;
    const anonymous=!currentUser?.id&&kind==='cafe_order_submit';
    if(!currentUser?.id&&!anonymous)throw Error('Sign in before saving this offline action. No request was sent.');
    const entry: QueuedMutation = {
      id: makeId(),
      kind,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
      staffId: currentUser?.id ?? null,
      staffUsername: currentUser?.username ?? null,
      anonymous,
    };
    const next = [...get().pending, entry];
    set({ pending: next });
    try {await writeQueue(next); set({storageError:null});}
    catch {set({storageError:STORAGE_ERROR}); throw new Error(STORAGE_ERROR);}
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
    if (get().flushing || !navigator.onLine) return;
    // Acquire before the first await: online events and timers may race.
    set({flushing:true});
    try {
      await get().hydrate();
      if (!get().hydrated || !get().pending.length) return;
      const {useAuthStore} = await import('@/stores/authStore');
      const activeStaffId = useAuthStore.getState().currentUser?.id ?? null;
      const queue = get().pending;
      await writeQueue(queue);
      set({storageError:null});
      const blockedKinds = new Set<string>();
      for (const entry of queue) {
        // Logout/account switching during an in-flight upload must stop the batch.
        if ((useAuthStore.getState().currentUser?.id ?? null) !== activeStaffId) break;
        if (blockedKinds.has(entry.kind)) continue;

        // A queued write with a known owner that doesn't match whoever's
        // logged in right now is left queued, untouched, rather than
        // silently replayed under the wrong person's session — same
        // "stop this kind, don't lose ordering" treatment as a real
        // failure below, so a later same-kind entry can't jump ahead of it.
        // Legacy entries without an owner remain available for reconciliation.
        // Explicit public QR requests replay only while still signed out.
        if(!entry.staffId&&(!entry.anonymous||activeStaffId)){
          const remaining=get().pending.map(e=>e.id===entry.id?{...e,attempts:e.attempts+1,lastError:entry.anonymous?'Sign out to retry this customer QR order under its original public context.':'This older offline action has no recorded operator. Admin must reconcile it before replay; the original data is preserved.'}:e);
          set({pending:remaining});await writeQueue(remaining);blockedKinds.add(entry.kind);continue;
        }
        if (entry.staffId && entry.staffId !== activeStaffId) {
          blockedKinds.add(entry.kind);
          continue;
        }

        const handler = replayHandlers.get(entry.kind);
        if (!handler) {
          // Lazy-loaded dashboards may not have registered their replay code yet.
          // Retain the original write until that dashboard can handle it.
          const remaining = get().pending.map(e => e.id === entry.id
            ? { ...e, attempts: e.attempts + 1, lastError: 'Open the dashboard where this change was made, then retry sync.' } : e);
          set({ pending: remaining });
          await writeQueue(remaining);
          blockedKinds.add(entry.kind);
          continue;
        }
        let result: ReplayResult;
        try { result = await handler(entry.kind, entry.payload, entry.id); }
        catch (error) { result = { ok: false, error: error instanceof Error ? error.message : 'Sync failed. Please retry.' }; }
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
    } catch {set({storageError:STORAGE_ERROR});}
    finally {
      set({ flushing: false });
    }
  },

  discard: async (id) => {
    const task=archiveWrites.catch(()=>{}).then(async()=>{
      if(get().flushing)throw Error('Wait for synchronization to finish before archiving a saved action.');
      set({flushing:true});
      try{
        const entry=get().pending.find(e=>e.id===id);if(!entry)return;
        const {useAuthStore}=await import('@/stores/authStore');const user=useAuthStore.getState().currentUser;
        if(!(['admin','owner'].includes(user?.role||'')||entry.staffId&&entry.staffId===user?.id||entry.anonymous&&!user))throw Error('Only the original operator or Admin can archive this action for reconciliation.');
        try{
          const target=getStore();if(!target)throw Error(STORAGE_ERROR);
          const archived=await idbGet<unknown[]>('discarded',target)??[];
          if(!Array.isArray(archived))throw Error(STORAGE_ERROR);
          await idbSet('discarded',[...archived.filter(e=>(e as {id?:string}).id!==id),{...entry,archivedAt:new Date().toISOString(),archivedBy:user?.id??null}],target);
          const next=get().pending.filter(e=>e.id!==id);await writeQueue(next);set({pending:next,storageError:null});
        }catch{set({storageError:STORAGE_ERROR});throw Error(STORAGE_ERROR);}
      }finally{set({flushing:false});}
    });
    archiveWrites=task;await task;
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
