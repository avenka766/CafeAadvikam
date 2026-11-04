import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('../webDispatchRequest',()=>({saveWebDispatch:m.save}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc,from:m.from},fetchAllRows:vi.fn()}));
vi.mock('@/lib/desktopBilling',()=>({automaticDesktopBilling:()=>false,captureDesktopBill:vi.fn(),billingSnapshot:vi.fn(),desktopCheckoutIdentity:vi.fn(),finishDesktopCheckout:vi.fn()}));
import {saveDispatchInvoice} from '../dispatchInvoice';
const input={scope:'Hosur' as const,dispatchedBy:'Fixture',hosurShopId:'shop',items:[{itemName:'Bun',unit:'pcs',quantity:2,unitPrice:10,lineTotal:20}],discountPct:0,dispatchEntryIds:[{orderId:'order',dispatchEntryId:'entry'}],desktopActions:[{orderId:'order',dispatchEntryId:'entry',itemName:'Bun',unit:'pcs',quantity:2,stockSlug:'bun'}],desktopHosurBilling:{orderId:'hosur',shopId:'shop',payment:{paymentType:'credit',dueDate:'2026-12-01'}}};
beforeEach(()=>{m.save.mockReset().mockResolvedValue({id:'invoice',invoice_no:'SALES/1',created_at:'2026-11-03'});m.rpc.mockReset();m.from.mockReset();});
it('saves regular dispatch actions, printed items and Hosur payment intent in one transaction',async()=>{
 const saved=await saveDispatchInvoice(input);expect(saved.invoiceNo).toBe('SALES/1');expect(m.save).toHaveBeenCalledTimes(1);expect(m.save.mock.calls[0][0]).toMatchObject({p_invoice:{p_regular_actions:input.desktopActions,p_regular_hosur:input.desktopHosurBilling,p_total:20},p_hosur:null,p_cakes:[]});expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
});
it('does not perform secondary writes when dispatch confirmation is lost',async()=>{
 m.save.mockRejectedValue(Error('Confirmation lost'));await expect(saveDispatchInvoice(input)).rejects.toThrow('Confirmation lost');expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
});
