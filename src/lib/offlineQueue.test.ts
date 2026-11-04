import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: 'staff-a' as string|null, disk: new Map<string, unknown>(), failWrite:false, failRead:false }));
vi.mock('idb-keyval', () => ({ createStore: () => ({}), get: async (key: string) => {if(mocks.failRead)throw Error('blocked');return mocks.disk.get(key);}, set: async (key: string, value: unknown) => { if(mocks.failWrite)throw Error('disk full');mocks.disk.set(key, structuredClone(value)); } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ currentUser: mocks.owner?{ id: mocks.owner, username: mocks.owner }:null }) } }));
describe('Offline queue safety', () => {
  beforeEach(() => { vi.resetModules(); mocks.disk.clear(); mocks.owner = 'staff-a'; mocks.failRead=false;mocks.failWrite=false; Object.defineProperty(globalThis, 'indexedDB', { value: {}, configurable: true }); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
  it('retains writes when their lazy dashboard handler has not loaded', async () => {
    const { useOfflineQueueStore } = await import('./offlineQueue');
    await useOfflineQueueStore.getState().enqueue('unloaded', { qty: 3 });
    await useOfflineQueueStore.getState().flush();
    expect(useOfflineQueueStore.getState().pending).toHaveLength(1);
    expect(useOfflineQueueStore.getState().pending[0].lastError).toContain('Open the dashboard');
  });
  it('persists offline writes, restores after reload and replays only for the original staff member', async () => {
    let module = await import('./offlineQueue');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await module.useOfflineQueueStore.getState().enqueue('sale', { qty: 2 });
    vi.resetModules(); module = await import('./offlineQueue');
    await module.useOfflineQueueStore.getState().hydrate();
    const replay = vi.fn(async () => ({ ok: true })); module.registerReplayHandler('sale', replay);
    await module.useOfflineQueueStore.getState().flush(); expect(replay).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); mocks.owner = 'staff-b';
    await module.useOfflineQueueStore.getState().flush(); expect(replay).not.toHaveBeenCalled();
    mocks.owner = 'staff-a'; await module.useOfflineQueueStore.getState().flush();
    expect(replay).toHaveBeenCalledTimes(1); expect(module.useOfflineQueueStore.getState().pending).toHaveLength(0);
  });
  it('keeps a failed write but lets unrelated operations sync', async () => {
    const { useOfflineQueueStore: store, registerReplayHandler } = await import('./offlineQueue');
    registerReplayHandler('broken', async () => { throw new Error('No connection'); });
    registerReplayHandler('good', async () => ({ ok: true }));
    await store.getState().enqueue('broken', {}); await store.getState().enqueue('good', {});
    await store.getState().flush(); expect(store.getState().pending.map(p => p.kind)).toEqual(['broken']);
  });
  it('replays the same persisted request identity after an uncertain response and reload',async()=>{
    let module=await import('./offlineQueue');
    await module.useOfflineQueueStore.getState().enqueue('stock', {quantityDelta:2});
    const id=module.useOfflineQueueStore.getState().pending[0].id;
    const first=vi.fn(async()=>({ok:false,error:'Response lost'}));module.registerReplayHandler('stock',first);
    await module.useOfflineQueueStore.getState().flush();expect(first).toHaveBeenCalledWith('stock',{quantityDelta:2},id);
    vi.resetModules();module=await import('./offlineQueue');await module.useOfflineQueueStore.getState().hydrate();
    const retry=vi.fn(async()=>({ok:true}));module.registerReplayHandler('stock',retry);
    await module.useOfflineQueueStore.getState().flush();expect(retry).toHaveBeenCalledWith('stock',{quantityDelta:2},id);
    expect(module.useOfflineQueueStore.getState().pending).toHaveLength(0);
  });
  it('rejects an unsafe save and retains its in-memory payload when disk is full',async()=>{
    const {useOfflineQueueStore:store}=await import('./offlineQueue');await store.getState().hydrate();mocks.failWrite=true;
    await expect(store.getState().enqueue('sale',{amount:100})).rejects.toThrow('not safely saved');
    expect(store.getState().pending[0].payload).toEqual({amount:100});expect(store.getState().storageError).toBeTruthy();
    mocks.failWrite=false;await store.getState().enqueue('note',{});expect(store.getState().storageError).toBeNull();
    expect((mocks.disk.get('queue') as unknown[])).toHaveLength(2);
  });
  it('does not overwrite unreadable persisted entries with an empty queue',async()=>{
    const {useOfflineQueueStore:store}=await import('./offlineQueue');mocks.failRead=true;
    await expect(store.getState().enqueue('sale',{})).rejects.toThrow('storage');
    expect(mocks.disk.has('queue')).toBe(false);expect(store.getState().hydrated).toBe(false);
  });
  it('sends a queued payment only once when two reconnect flushes race',async()=>{
    const {useOfflineQueueStore:store,registerReplayHandler}=await import('./offlineQueue');
    await store.getState().enqueue('payment',{});let finish:(v:{ok:boolean})=>void;
    const replay=vi.fn(()=>new Promise<{ok:boolean}>(resolve=>{finish=resolve;}));registerReplayHandler('payment',replay);
    const first=store.getState().flush();const second=store.getState().flush();
    await vi.waitFor(()=>expect(replay).toHaveBeenCalledTimes(1));finish!({ok:true});await Promise.all([first,second]);expect(replay).toHaveBeenCalledTimes(1);
  });
  it('stops a running batch when the operator changes during its first upload',async()=>{
    const {useOfflineQueueStore:store,registerReplayHandler}=await import('./offlineQueue');
    await store.getState().enqueue('payment',{});await store.getState().enqueue('payment',{});
    const replay=vi.fn(async()=>{mocks.owner='staff-b';return {ok:true};});registerReplayHandler('payment',replay);
    await store.getState().flush();expect(replay).toHaveBeenCalledTimes(1);expect(store.getState().pending).toHaveLength(1);
  });
  it('does not replay an unidentified legacy entry under a new operator',async()=>{
    mocks.disk.set('queue',[{id:'legacy',kind:'payment',payload:{amount:100},attempts:0,createdAt:'2026-01-01',lastError:null}]);
    const {useOfflineQueueStore:store,registerReplayHandler}=await import('./offlineQueue');const replay=vi.fn(async()=>({ok:true}));registerReplayHandler('payment',replay);
    await store.getState().flush();expect(replay).not.toHaveBeenCalled();expect(store.getState().pending[0].lastError).toContain('original data is preserved');
  });
  it('allows explicit customer QR recovery only in the original anonymous context',async()=>{
    mocks.owner=null;const {useOfflineQueueStore:store,registerReplayHandler}=await import('./offlineQueue');
    await expect(store.getState().enqueue('payment',{})).rejects.toThrow('Sign in');
    await store.getState().enqueue('cafe_order_submit',{});const replay=vi.fn(async()=>({ok:true}));registerReplayHandler('cafe_order_submit',replay);
    mocks.owner='staff-a';await store.getState().flush();expect(replay).not.toHaveBeenCalled();
    mocks.owner=null;await store.getState().flush();expect(replay).toHaveBeenCalledTimes(1);
  });
  it('archives the original payload before removing a failed action from automatic sync',async()=>{
    const {useOfflineQueueStore:store}=await import('./offlineQueue');await store.getState().enqueue('payment',{amount:100});const entry=store.getState().pending[0];
    await store.getState().discard(entry.id);expect(store.getState().pending).toHaveLength(0);
    expect(mocks.disk.get('discarded')).toMatchObject([{id:entry.id,payload:{amount:100},archivedBy:'staff-a'}]);
  });
  it('keeps the action pending when the archive cannot be saved or a different operator tries to remove it',async()=>{
    const {useOfflineQueueStore:store}=await import('./offlineQueue');await store.getState().enqueue('payment',{amount:100});const id=store.getState().pending[0].id;
    mocks.owner='staff-b';await expect(store.getState().discard(id)).rejects.toThrow('original operator');expect(store.getState().pending).toHaveLength(1);
    mocks.owner='staff-a';mocks.failWrite=true;await expect(store.getState().discard(id)).rejects.toThrow('not safely saved');expect(store.getState().pending).toHaveLength(1);
  });

});
