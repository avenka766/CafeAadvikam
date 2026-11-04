import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock('../dispatchInvoice',()=>({saveDispatchInvoice:m.save,printDispatchInvoice:vi.fn(),recordFromRow:vi.fn()}));
vi.mock('@/lib/desktopBilling',()=>({automaticDesktopBilling:()=>false}));
vi.mock('@/lib/supabase',()=>({supabase:{from:m.from,rpc:m.rpc},fetchAllRows:vi.fn()}));
vi.mock('@/branch/cakeDispatchSync',()=>({ensureCakeDispatchIncoming:vi.fn(),cakeIncomingDispatchId:vi.fn()}));
import {runCakeDispatchAndInvoiceCore} from '../PackingCakeOrdersTab';
const cake=(id:string,branch:'SNB'|'VRSNB')=>({id,branch,customer_name:'Fixture',cake_kg:'1',prepared_quantity:1,order_value:500} as any);
beforeEach(()=>{m.from.mockReset();m.rpc.mockReset();m.save.mockReset().mockImplementation(async()=>({invoiceNo:'TO/1'}));});
it('saves each branch cake group atomically with invoice and stock evidence',async()=>{
 await runCakeDispatchAndInvoiceCore({orders:[cake('snb','SNB'),cake('vrsnb','VRSNB')],dispatchedBy:'Planner',discountPct:0});
 expect(m.save).toHaveBeenCalledTimes(2);expect(m.save.mock.calls[0][0]).toMatchObject({scope:'Cake',desktopCakeOrders:[{id:'snb'}],dispatchEntryIds:[{orderId:'snb',dispatchEntryId:'snb'}]});
 expect(m.from).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it('stops on an uncertain save without running separate cake/stock mutations',async()=>{
 m.save.mockRejectedValue(Error('Confirmation lost'));
 await expect(runCakeDispatchAndInvoiceCore({orders:[cake('snb','SNB')],dispatchedBy:'Planner',discountPct:0})).rejects.toThrow('Confirmation lost');
 expect(m.from).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
