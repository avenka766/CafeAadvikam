import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), single: vi.fn(), cancel: vi.fn(), pending: vi.fn(), revise: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from, rpc: m.rpc }, fetchAllRows: vi.fn() }));
vi.mock('../branchTransferCancellation', () => ({ cancelBranchTransfer: m.cancel }));
vi.mock('../dispatchInvoiceRevision', () => ({ hasPendingDispatchInvoiceRevision: m.pending, reviseDispatchInvoice: m.revise }));
import { cancelDispatchInvoice, returnDispatchInvoiceItems, updateDispatchInvoice } from '../dispatchInvoice';
beforeEach(() => {
  vi.clearAllMocks();
  m.pending.mockReturnValue(false);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: m.single };
  m.from.mockReturnValue(query);
  m.single.mockResolvedValue({ data: { id: 'invoice', scope: 'SNB', status: 'unpaid', discount_pct: 0,
    items: [{ itemName: 'Burfi', unit: 'kg', quantity: 0.5, unitPrice: 100, lineTotal: 50 }] } });
  m.rpc.mockImplementation(() => m.single());
});
it('rejects invalid edits before reading or changing any remote records', async () => {
  const result = await updateDispatchInvoice({ invoiceId: 'invoice', editedBy: 'Fixture', updatedDiscountPct: 0,
    updatedItems: [{ itemName: 'Bun', unit: 'pcs', quantity: Infinity, unitPrice: 10, lineTotal: Infinity }] });
  expect(result).toHaveProperty('error'); expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects the combined return exceeding the available quantity without writing stock or invoices', async () => {
  const result = await returnDispatchInvoiceItems({ invoiceId: 'invoice', returnedBy: 'Fixture', returns: [
    { itemName: 'Burfi', unit: 'kg', qty: 0.3 }, { itemName: 'BURFI', unit: 'kg', qty: 0.3 },
  ] });
  expect(result).toHaveProperty('error', expect.stringContaining("Can't return"));
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledExactlyOnceWith('get_dispatch_invoice_for_change_v1', expect.anything());
});
it('does not allow a 5 gram over-return through the old 10 gram tolerance', async () => {
  const result = await returnDispatchInvoiceItems({ invoiceId: 'invoice', returnedBy: 'Fixture',
    returns: [{ itemName: 'Burfi', unit: 'kg', qty: 0.505 }] });
  expect(result).toHaveProperty('error', expect.stringContaining("Can't return"));
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledExactlyOnceWith('get_dispatch_invoice_for_change_v1', expect.anything());
});
it('rejects fractional piece returns before accessing the database', async () => {
  const result = await returnDispatchInvoiceItems({ invoiceId: 'invoice', returnedBy: 'Fixture',
    returns: [{ itemName: 'Bun', unit: 'pcs', qty: 0.5 }] });
  expect(result).toHaveProperty('error', expect.stringContaining('whole numbers'));
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it('routes internal branch cancellation through one transaction instead of claiming the header first', async () => {
  m.cancel.mockResolvedValue({ id: 'invoice', status: 'cancelled', scope: 'SNB' });
  const result = await cancelDispatchInvoice({ invoiceId: 'invoice', reason: 'Wrong dispatch' });
  expect(result).toHaveProperty('ok', true); expect(m.cancel).toHaveBeenCalledTimes(1);
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledWith('get_dispatch_invoice_for_change_v1',{p_invoice:'invoice'});
});
it('does not start cancellation when invoice lookup reports an expired session or missing record', async()=>{
 for(const message of ['SESSION_REQUIRED','INVOICE_NOT_FOUND']){
  m.rpc.mockResolvedValue({data:null,error:{message}});
  expect(await cancelDispatchInvoice({invoiceId:'invoice'})).toEqual({error:message});
 }
 expect(m.cancel).not.toHaveBeenCalled();expect(m.revise).not.toHaveBeenCalled();
});
it('recovers a committed full return before validating against its now-empty invoice', async () => {
  m.pending.mockReturnValue(true);
  m.single.mockResolvedValue({data:{id:'invoice',scope:'Hosur',status:'cancelled',items:[],total:0,discount_pct:0}});
  m.revise.mockResolvedValue({id:'invoice',scope:'Hosur',status:'cancelled',items:[],total:0,revision_duplicate:true});
  const result=await returnDispatchInvoiceItems({invoiceId:'invoice',returnedBy:'Fixture',returns:[{itemName:'Bun',unit:'pcs',qty:2}]});
  expect(result).toHaveProperty('ok',true);expect(m.revise).toHaveBeenCalledTimes(1);
});
