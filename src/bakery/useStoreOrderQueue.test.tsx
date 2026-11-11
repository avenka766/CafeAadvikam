import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as {id: string; created_at: string; store_confirmed_at: string}[],
  change: () => {},
  query: vi.fn(),
}));
vi.mock('./bakeryStore', () => ({
  rowToOrder: row => ({id: row.id, createdAt: row.created_at, storeConfirmedAt: row.store_confirmed_at}),
}));
vi.mock('@/lib/supabase', () => ({
  fetchAllRows: async (table, build) => {
    const query = {
      select: () => query, in: () => query, is: () => query,
      or: filter => { mocks.query(table, filter); return query; },
      order: () => query,
    };
    build(query);
    return {data: mocks.rows, error: null};
  },
  supabase: {
    channel: () => ({
      on: (_event, _filter, callback) => {
        mocks.change = callback;
        return {subscribe: () => ({})};
      },
    }),
    removeChannel: async () => {},
  },
}));
import {useStoreOrderQueue} from './useStoreOrderQueue';

function Queue() {
  const {orders} = useStoreOrderQueue();
  return <div>{orders.map(order => order.id).join(', ')}</div>;
}

it('clears the open queue at 11 PM India time and shows newly sent orders via Realtime', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T17:29:59Z'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  mocks.rows = [{id: 'before', created_at: '2026-11-10T10:00:00Z', store_confirmed_at: '2026-11-11T16:00:00Z'}];
  const element = document.createElement('div');
  const root = createRoot(element);
  try {
    await act(async () => root.render(<Queue />));
    expect(element.textContent).toBe('before');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(element.textContent).toBe('');
    expect(mocks.query).toHaveBeenLastCalledWith('bakery_orders', expect.stringContaining('2026-11-11T17:30:00.000Z'));
    mocks.rows.push({id: 'next', created_at: '2026-11-10T10:00:00Z', store_confirmed_at: '2026-11-11T17:30:00Z'});
    await act(async () => {
      mocks.change();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(element.textContent).toBe('next');
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
