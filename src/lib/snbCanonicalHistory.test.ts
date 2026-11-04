import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verified: vi.fn(), rows: vi.fn(), check: vi.fn() }));
vi.mock('./adminReportPaging', () => ({ fetchVerifiedAdminRows: mocks.verified }));
vi.mock('./adminReportData', () => ({ fetchAdminRows: mocks.rows }));
vi.mock('./supabase', () => ({ supabase: {rpc: mocks.check} }));
import { loadSnbCanonicalHistory } from './snbCanonicalHistory';
beforeEach(() => {
  mocks.verified.mockReset(); mocks.rows.mockReset(); mocks.check.mockReset();
  mocks.check.mockResolvedValue({data:{count:1,total:100},error:null});
  mocks.rows.mockResolvedValue({ data: [], error: null });
});
it('includes unpaid credit sales and duplicate prints using main-ledger totals', async () => {
  mocks.verified.mockResolvedValueOnce({ data: [
    { id: 'c', bill_no: 'SNB-1', bill_type: 'credit', status: 'original', total: 100 },
    { id: 'd', bill_no: 'SNB-2', bill_type: 'counter', status: 'duplicate_printed', total: 50 },
    { id: 'x', bill_no: 'SNB-3', bill_type: 'counter', status: 'cancelled', total: 99 },
  ], error: null }).mockResolvedValueOnce({ data: [
    { id: 'i1', bill_id: 'c', line_total: 100 }, { id: 'i2', bill_id: 'd', line_total: 50 },
  ], error: null });
  const result = await loadSnbCanonicalHistory('2026-09-01','2026-09-30');
  expect(result.operationBills.map(b => b.billNo)).toEqual(['SNB-1','SNB-2']);
  expect(result.operationBills[0].paymentMode).toBe('credit');
  expect(result.operationBills.reduce((s,b) => s+b.total,0)).toBe(150);
});
it('blocks a financial report with missing item records', async () => {
  mocks.verified.mockResolvedValueOnce({ data: [{ id: 'c', bill_no: 'SNB-1', bill_type: 'credit', status: 'original', total: 100 }], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  await expect(loadSnbCanonicalHistory('2026-09-01','2026-09-30')).rejects.toThrow('Missing item breakdown');
});
it('cashier data loads verified payment-date rows and preserves ledger cashier identity', async () => {
  mocks.verified.mockResolvedValueOnce({data:[{id:'a',bill_no:'SNB-1',bill_type:'counter',status:'original',total:100,biller:'Old display',cashier_username:'SNB Billing 3',counter_session_id:'counter'}],error:null})
    .mockResolvedValueOnce({data:[{id:'item',bill_id:'a',line_total:100}],error:null})
    .mockResolvedValueOnce({data:[{id:'pay',amount:100,payment_purpose:'bill_collection'}],error:null});
  const result=await loadSnbCanonicalHistory('2026-10-16','2026-10-16',true);
  expect(result.operationBills[0]).toMatchObject({biller:'SNB Billing 3',counterSessionId:'counter'});
  expect(result.cashierPayments).toHaveLength(1);
  expect(mocks.verified).toHaveBeenLastCalledWith('snb_cashier_payments','2026-10-16T00:00:00+05:30','2026-10-16T18:30:00.000Z',{branch:'SNB'});
});

it('blocks export when a new invoice arrives between sales and payment reads',async()=>{
 mocks.verified.mockResolvedValueOnce({data:[{id:'a',bill_no:'SNB-1',status:'original',total:100}],error:null})
 .mockResolvedValueOnce({data:[{id:'item',bill_id:'a',line_total:100}],error:null})
 .mockResolvedValueOnce({data:[],error:null});
 mocks.check.mockResolvedValueOnce({data:{count:2,total:150},error:null});
 await expect(loadSnbCanonicalHistory('2026-10-16','2026-10-16',true)).rejects.toThrow('Sales changed');
});
