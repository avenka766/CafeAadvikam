// EGRESS FIX (2026-08-21): persists already-fetched data locally so a page
// reload / browser restart doesn't need to re-download the full historical
// window again — see orderStore.ts and bakeryStore.ts for how this gets
// used. Deliberately a tiny, self-contained wrapper around the native
// IndexedDB API rather than a new npm dependency, since the actual need
// here is just "get/set one JSON blob by key."
//
// Every function here is best-effort and never throws: a cache miss, a
// browser that blocks IndexedDB (e.g. some private-browsing modes), or any
// other failure just means "proceed as if there's nothing cached" — this
// must never be able to break the app's actual data loading, only skip an
// optimization when it isn't available.

const DB_NAME = 'cafe_aadvikam_local_cache';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Best-effort read. Returns null on any miss or failure — never throws. */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Best-effort write. Silently does nothing on failure — never throws. */
export async function setCached<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // best-effort — a failed write just means no cache benefit next load
  }
}
