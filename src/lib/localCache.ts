// EGRESS FIX (2026-08-21): persists already-fetched data locally so a page
// reload / browser restart doesn't need to re-download the full historical
// window again — see orderStore.ts and bakeryStore.ts for how this gets
// used.
//
// OFFLINE FIX (2026-09-01): rebuilt on top of `idb-keyval` instead of the
// original hand-rolled raw-IndexedDB wrapper — same DB name / object store
// name (so any browser's existing cached data keeps working, nothing to
// migrate), same tiny "get/set one JSON blob by key" surface, same function
// signatures, so every existing call site is untouched. Switching to a real,
// well-tested library here (rather than hand-rolling more raw IndexedDB
// calls) is what src/lib/offlineQueue.ts's write queue is built on next to.
//
// Every function here is best-effort and never throws: a cache miss, a
// browser that blocks IndexedDB (e.g. some private-browsing modes), or any
// other failure just means "proceed as if there's nothing cached" — this
// must never be able to break the app's actual data loading, only skip an
// optimization when it isn't available.

import { get, set, createStore, type UseStore } from 'idb-keyval';

const DB_NAME = 'cafe_aadvikam_local_cache';
const STORE_NAME = 'kv';

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

/** Best-effort read. Returns null on any miss or failure — never throws. */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const s = getStore();
    if (!s) return null;
    const value = await get<T>(key, s);
    return value ?? null;
  } catch {
    return null;
  }
}

/** Best-effort write. Silently does nothing on failure — never throws. */
export async function setCached<T>(key: string, value: T): Promise<void> {
  try {
    const s = getStore();
    if (!s) return;
    await set(key, value, s);
  } catch {
    // best-effort — a failed write just means no cache benefit next load
  }
}
