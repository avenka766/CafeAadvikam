import { expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { indexDispatchHistory } from './useDispatchHistoryInvoices';
import { businessFor, type DispatchInvoiceRecord } from './dispatchInvoice';
it('uses the VRSNB legal entity for cake and both advance destination branches', () => {
  for (const scope of ['Cake','SNB','VRSNB'] as const) {
    expect(businessFor(scope).name).toBe('VRSNB Foods LLP');
    expect(businessFor(scope).gstin).toBe('33AAZFV1266C1ZZ');
  }
});
it('links every partial invoice to its order and deduplicates repeated entries', () => {
  const invoices = [
    { id: 'a', invoiceNo: 'TO/26-27/91', status: 'paid', dispatchEntryIds: [{ orderId:'cake' }, { orderId:'cake' }, { orderId:'advance' }] },
    { id: 'b', invoiceNo: 'TO/26-27/92', status: 'paid', dispatchEntryIds: [{ orderId:'advance' }] },
    { id: 'c', invoiceNo: 'TO/26-27/93', status: 'cancelled', dispatchEntryIds: [{ orderId:'advance' }] },
  ] as DispatchInvoiceRecord[];
  const map = indexDispatchHistory(invoices);
  expect(map.get('cake')?.map(i=>i.invoiceNo)).toEqual(['TO/26-27/91']);
  expect(map.get('advance')?.map(i=>i.invoiceNo)).toEqual(['TO/26-27/91','TO/26-27/92']);
});
