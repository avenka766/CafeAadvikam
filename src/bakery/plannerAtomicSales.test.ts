import {afterEach,expect,it,vi} from 'vitest';
import {supabase} from '@/lib/supabase';
import {saveWalkinBillSecure,changeWalkinBillAtomic,walkinExpectedSnapshot,type WalkinBillRow} from './dispatchInvoice';
const bill:WalkinBillRow={id:'bill',billNo:'SALES/26-27/1',items:[{itemName:'Sweet',quantity:2,unit:'pcs',price:10,lineTotal:20}],subtotal:20,discountType:'none',discountValue:0,discountAmount:0,total:20,paymentMode:'cash',cashierName:'Planner',status:'active',createdAt:'2026-11-02T00:00:00Z',customerName:'Fixture',customerMobile:null,isGstInvoice:false,gstSupplyType:'intra',cancelledAt:null,cancelledReason:null};
afterEach(()=>vi.restoreAllMocks());
it('reuses the same immutable request identity after a lost bill response',async()=>{
 const rpc=vi.spyOn(supabase,'rpc').mockReturnValueOnce({single:async()=>({data:null,error:Error('network')})} as never).mockReturnValueOnce({single:async()=>({data:{id:'bill',bill_no:bill.billNo,items:bill.items,total:20},error:null})} as never);
 await expect(saveWalkinBillSecure(bill,'same-request')).rejects.toThrow('network');await saveWalkinBillSecure(bill,'same-request');
 expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(rpc.mock.calls[1][1]).toMatchObject({p_request_id:'same-request',p_sale:{items:[{stockSlug:'sweet'}]}});
});
it('sends the original snapshot and stock identity to one atomic edit call',async()=>{
 const rpc=vi.spyOn(supabase,'rpc').mockReturnValue({single:async()=>({data:{id:'bill',bill_no:bill.billNo,items:bill.items,total:30},error:null})} as never);
 await changeWalkinBillAtomic(bill,'edit',{...bill,total:30},'Customer correction','edit-request');
 expect(rpc).toHaveBeenCalledExactlyOnceWith('change_walkin_bill_atomic_v1',expect.objectContaining({p_request_id:'edit-request',p_expected:walkinExpectedSnapshot(bill),p_original_slugs:['sweet'],p_reason:'Customer correction'}));
});
it('keeps a failed cancellation as an error rather than reporting it saved',async()=>{
 vi.spyOn(supabase,'rpc').mockReturnValue({single:async()=>({data:null,error:{message:'BILL_CHANGED: reload'}})} as never);
 await expect(changeWalkinBillAtomic(bill,'cancel',{},'Wrong bill','cancel-request')).rejects.toThrow('BILL_CHANGED');
});
