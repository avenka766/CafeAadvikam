import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {prepareCreditAction,executeCreditAction} from './creditActionRequest';
const args={p_branch:'SNB',p_credit_sale_id:'sale',p_amount:100,p_payment_mode:'cash'};
beforeEach(()=>{localStorage.clear();mocks.rpc.mockReset();});
it('keeps the same payment request across a lost response and a reload',async()=>{
 const first=prepareCreditAction('staff','collect',args);mocks.rpc.mockResolvedValueOnce({error:{message:'Response lost'}});
 expect((await executeCreditAction(first)).error).toBeTruthy();
 const retry=prepareCreditAction('staff','collect',args);expect(retry.p_request).toBe(first.p_request);
 mocks.rpc.mockResolvedValueOnce({data:{paymentId:'payment',creditAmount:200,amountPaid:100}});await executeCreditAction(retry);
 expect(localStorage.length).toBe(0);expect(prepareCreditAction('staff','collect',args).p_request).not.toBe(first.p_request);
});
it('blocks calls when local persistence fails',()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Storage failed');});
 try{expect(()=>prepareCreditAction('staff','collect',args)).toThrow('Storage failed');expect(mocks.rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('retains a request without a confirmed payment identity',async()=>{
 const request=prepareCreditAction('staff','collect',args);mocks.rpc.mockResolvedValue({data:{}});
 expect((await executeCreditAction(request)).error?.message).toContain('incomplete');expect(localStorage.length).toBe(1);
});
it('does not blindly replay old queued collections without a request reference',async()=>{
 expect((await executeCreditAction(undefined)).error?.message).toContain('reconciliation');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps staff requests separate and confirms the correct discount sale',async()=>{
 const a=prepareCreditAction('a','discount',{p_credit_sale_id:'sale'}),b=prepareCreditAction('b','discount',{p_credit_sale_id:'sale'});expect(a.p_request).not.toBe(b.p_request);
 mocks.rpc.mockResolvedValue({data:{id:'other'}});expect((await executeCreditAction(a)).error).toBeTruthy();expect(localStorage.length).toBe(2);
});
