import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
import {sendFinanceRequest} from './data';
const request={method:'finance_record_supplier' as const,args:{p_request:'stable-payment-request'}};
beforeEach(()=>rpc.mockReset());
it.each(['08006','08007','40003','XX000','PGRST000',undefined])('preserves the payment request when completion is uncertain (%s)',async code=>{
 rpc.mockResolvedValue({data:null,error:{message:'Connection interrupted',code}});
 await expect(sendFinanceRequest(request)).rejects.toMatchObject({rejected:false});
});
it.each(['P0001','23505','23514','22003','42501'])('recognizes a definitive database rejection (%s)',async code=>{
 rpc.mockResolvedValue({data:null,error:{message:'Rejected by database',code}});
 await expect(sendFinanceRequest(request)).rejects.toMatchObject({rejected:true});
});
it('keeps a response without a receipt unresolved',async()=>{
 rpc.mockResolvedValue({data:{},error:null});
 await expect(sendFinanceRequest(request)).rejects.toThrow('No payment receipt');
});
