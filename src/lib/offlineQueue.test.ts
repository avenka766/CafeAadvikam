import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: 'staff-a', disk: new Map<string, unknown>() }));
vi.mock('idb-keyval', () => ({ createStore: () => ({}), get: async (key: string) => mocks.disk.get(key), set: async (key: string, value: unknown) => { mocks.disk.set(key, structuredClone(value)); } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ currentUser: { id: mocks.owner, username: mocks.owner } }) } }));
describe('Offline queue safety', () => {
  beforeEach(() => { vi.resetModules(); mocks.disk.clear(); mocks.owner = 'staff-a'; Object.defineProperty(globalThis, 'indexedDB', { value: {}, configurable: true }); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
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
});
