import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
import {pendingBranchReturn,saveBranchReturn} from './returnRequest';
const input={p_branch:'SNB',p_bill_no:'SNB-1',p_payment_mode:'cash',p_reason:'Fixture',p_items:[{itemName:'Bun',unit:'pcs' as const,quantity:1,price:100,lineTotal:100,tax:0,discount:0}]};
const result={id:'return-id',returnNo:'SNB-RET-1',amount:80,refundAmount:80,creditAdjusted:0,items:[{...input.p_items[0],price:80,lineTotal:80}],createdAt:'2026-11-03T10:00:00Z'};
beforeEach(()=>{localStorage.clear();m.rpc.mockReset();});
it('retains and retries the same return after a lost response',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Response lost'}}).mockResolvedValueOnce({data:result});
 await expect(saveBranchReturn('staff',input)).rejects.toThrow('Response lost');const request=m.rpc.mock.calls[0][1];expect(pendingBranchReturn('staff','SNB','SNB-1')).toEqual(input);
 expect((await saveBranchReturn('staff',input)).amount).toBe(80);expect(m.rpc.mock.calls[1][1]).toEqual(request);expect(localStorage.length).toBe(0);
});
it('blocks changed return details while the original outcome is uncertain',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Response lost'}});await expect(saveBranchReturn('staff',input)).rejects.toThrow();
 await expect(saveBranchReturn('staff',{...input,p_reason:'Different reason'})).rejects.toThrow('awaiting confirmation');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not contact the server if durable request storage fails',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});try{await expect(saveBranchReturn('staff',input)).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('keeps an unreconciled or incomplete confirmation pending',async()=>{
 m.rpc.mockResolvedValue({data:{...result,refundAmount:100}});await expect(saveBranchReturn('staff',input)).rejects.toThrow('incomplete');expect(localStorage.length).toBe(1);
});
