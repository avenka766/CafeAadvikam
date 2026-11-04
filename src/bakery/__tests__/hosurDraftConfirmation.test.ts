import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc,from:m.from},fetchAllRows:m.fetch}));
vi.mock('@/pages/HosurDashboard',()=>({BRANCH:'Hosur',mapBill:(v:any)=>v,mapBillItem:(v:any)=>v,cleanPhone:()=>'',notifyAdmin:vi.fn(),buildBillMessage:()=>'',nextBillNo:vi.fn(),createWhatsappQrMedia:vi.fn(),createWhatsappBillDocument:vi.fn(),createWhatsappBillImage:vi.fn(),uploadWhatsappMedia:vi.fn(),safeMediaFileName:vi.fn(),base64MediaBlob:vi.fn()}));
import {runHosurConfirmBillCore,type HosurConfirmBillPayload} from '../hosurBillingBridge';
const bill={id:'bill',orderId:'order',shopId:'shop',shopName:'Fixture',shopWhatsapp:'123',billNo:'HOSUR/1',invoiceNo:'SALES/1',subtotal:100};
const input={bill,items:[{itemName:'Untrusted item',quantity:99,unit:'pcs',unitPrice:1,lineTotal:99}],paymentType:'partial',paidAmount:25,paymentMode:'upi',dueDate:'2026-12-01',userName:'Untrusted actor',userRole:'owner'} as HosurConfirmBillPayload;
beforeEach(()=>{m.rpc.mockReset();m.from.mockReset();m.fetch.mockReset();});
it('sends only payment intent and relies on the server for bill items and attribution',async()=>{
 m.rpc.mockResolvedValue({data:{bill,duplicate:true}});m.fetch.mockResolvedValue({data:[{itemName:'Canonical item',quantity:10}],error:null});
 const result=await runHosurConfirmBillCore(input);expect(m.rpc).toHaveBeenCalledWith('confirm_hosur_draft_once_v1',{p_bill:'bill',p_payment_type:'partial',p_paid_amount:25,p_payment_mode:'upi',p_due_date:'2026-12-01',p_expected_subtotal:100});expect(result.items).toEqual([{itemName:'Canonical item',quantity:10}]);expect(m.from).not.toHaveBeenCalled();
});
it('keeps a committed confirmation successful when print data cannot load',async()=>{
 m.rpc.mockResolvedValue({data:{bill,duplicate:false}});m.fetch.mockResolvedValue({data:[],error:'Timeout'});
 const result=await runHosurConfirmBillCore(input);expect(result.bill.id).toBe('bill');expect(result.notificationWarning).toBe('Timeout');expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.from).not.toHaveBeenCalled();
});
it('propagates a failed commit without applying any client-side ledger changes',async()=>{
 m.rpc.mockResolvedValue({error:Error('Atomic commit failed')});await expect(runHosurConfirmBillCore(input)).rejects.toThrow('Atomic commit failed');expect(m.fetch).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
});
