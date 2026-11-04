import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/desktopBilling',()=>({automaticDesktopBilling:()=>false,billingSnapshot:vi.fn(),desktopCheckoutIdentity:vi.fn(),finishDesktopCheckout:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{from:m.from},fetchAllRows:async(table:any,cb:any)=>cb(m.from(table))}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'fixture'}})}}));
vi.mock('../dispatchInvoice',()=>({saveDispatchInvoice:m.save}));
vi.mock('../packingCounter',()=>({getPackingCounterStatus:async()=>({isOpen:true})}));
vi.mock('@/pages/HosurDashboard',()=>({BRANCH:'Hosur',mapBill:vi.fn(),mapBillItem:vi.fn(),cleanPhone:vi.fn(),notifyAdmin:vi.fn(),buildBillMessage:vi.fn(),nextBillNo:vi.fn(),createWhatsappQrMedia:vi.fn(),createWhatsappBillDocument:vi.fn(),createWhatsappBillImage:vi.fn(),uploadWhatsappMedia:vi.fn(),safeMediaFileName:vi.fn(),base64MediaBlob:vi.fn()}));
import {runHosurDispatchAndBillCore,runHosurLeftoverDispatchCore} from '../hosurBillingBridge';
const payload={order:{id:'order',orderNumber:'H1',shopId:'shop',shopName:'Fixture',shopWhatsapp:'123'},billItems:[{id:'item',itemName:'Bun',unit:'pcs' as const,quantity:5,unitPrice:100,knownReceivedQuantity:2,receivedQuantity:5}],charges:[],payment:{paymentType:'credit' as const,dueDate:'2026-12-01'},gst:null,userName:'Fixture',appliedLeftovers:[]};
beforeEach(()=>{localStorage.clear();m.save.mockReset().mockResolvedValue({id:'invoice',invoiceNo:'SALES/1',workflowDuplicate:true});m.from.mockReset();});
it('invoices only the new batch and sends its cumulative stock targets in one save',async()=>{
 const result=await runHosurDispatchAndBillCore(payload);expect(result.billNo).toBe('SALES/1');
 expect(m.save.mock.calls[0][0]).toMatchObject({items:[{quantity:3,lineTotal:300}],desktopHosurBilling:{targets:[{id:'item',base:2,target:5}]}});expect(m.from).not.toHaveBeenCalled();
});
it('does not delete an invoice or apply client-side stock changes when confirmation is lost',async()=>{
 m.save.mockRejectedValue(Error('Confirmation lost'));await expect(runHosurDispatchAndBillCore(payload)).rejects.toThrow('Confirmation lost');expect(m.from).not.toHaveBeenCalled();
});
it('keeps a confirmed sale successful when notification lookup fails',async()=>{
 m.save.mockResolvedValue({id:'invoice',invoiceNo:'SALES/1',workflowResult:{hosurBillId:'bill'}});
 const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,single:async()=>({error:Error('Lookup unavailable')}),then:(resolve:any)=>Promise.resolve({error:Error('Lookup unavailable')}).then(resolve)};m.from.mockReturnValue(chain);
 expect(await runHosurDispatchAndBillCore(payload)).toMatchObject({billNo:'SALES/1',whatsappStatus:'failed',invoice:{id:'invoice'}});
 expect(m.from.mock.calls.map(c=>c[0])).toEqual(['hosur_bills','hosur_bill_items']);
});
it('creates a leftover order and consumes its pool inside the same invoice request',async()=>{
 await runHosurLeftoverDispatchCore({shop:{id:'shop',shopName:'Fixture',whatsappNumber:'123',address:null},leftoverRowId:'pool',itemName:'Bun',unit:'pcs',qty:2,price:100,payment:payload.payment,userName:'Fixture',reason:'manual_entry'});
 expect(m.save.mock.calls[0][0].desktopHosurBilling).toMatchObject({newOrder:{itemName:'Bun',quantity:2},appliedLeftovers:[{leftoverId:'pool',qty:2}]});expect(m.from).not.toHaveBeenCalled();
});
