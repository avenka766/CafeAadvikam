import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({change:vi.fn(),from:vi.fn()}));
vi.mock('../sampleInvoiceRequest',()=>({changeSampleInvoice:m.change}));
vi.mock('@/lib/supabase',()=>({supabase:{from:m.from,rpc:vi.fn()},fetchAllRows:vi.fn()}));
import {markDispatchInvoicePaid,cancelDispatchInvoice,updateDispatchInvoice,type DispatchInvoiceRecord} from '../dispatchInvoice';
const row={id:'sample',invoice_no:'SALES/1',scope:'VRSNB',notes:'Sample Bill',items:[{itemName:'Bun',unit:'pcs',quantity:2,unitPrice:10,lineTotal:20}],total:20,discount_pct:0,status:'paid',dispatch_entry_ids:[],created_at:'2026-11-03'};
beforeEach(()=>{m.change.mockReset().mockResolvedValue(row);m.from.mockReset();const q:any=new Proxy({}, {get:(_t,k)=>k==='single'?async()=>({data:row,error:null}):()=>q});m.from.mockReturnValue(q);});
it('marks sample payment through the atomic workflow without browser stock writes',async()=>{
 expect(await markDispatchInvoicePaid({id:'sample'} as DispatchInvoiceRecord,'Fixture')).toEqual({ok:true});expect(m.change).toHaveBeenCalledWith({id:'sample'},'pay');expect(m.from).not.toHaveBeenCalled();
});
it('routes sample cancellation and generic invoice edits through the same atomic workflow',async()=>{
 expect(await cancelDispatchInvoice({invoiceId:'sample',reason:'Customer cancelled'})).toMatchObject({ok:true});expect(m.change.mock.calls[0][1]).toBe('cancel');
 expect(await updateDispatchInvoice({invoiceId:'sample',updatedItems:row.items,updatedDiscountPct:0,editedBy:'Fixture'})).toMatchObject({ok:true});expect(m.change.mock.calls[1][1]).toBe('edit');expect(m.from.mock.calls.map(c=>c[0])).toEqual(['dispatch_invoices','dispatch_invoices']);
});
