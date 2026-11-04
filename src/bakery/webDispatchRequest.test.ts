import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'fixture'}})}}));
import {saveWebDispatch,pendingRegularDispatch} from './webDispatchRequest';
const input={p_invoice:{p_scope:'Cake',p_total:500},p_hosur:null,p_cakes:[{id:'cake',order_value:500}]};
beforeEach(()=>{localStorage.clear();m.rpc.mockReset();});
it('blocks a reopened batch with new entry IDs until the original dispatch is recovered',async()=>{
 const regular={p_invoice:{p_scope:'SNB',p_total:20,p_regular_actions:[{orderId:'order',dispatchEntryId:'first'}]},p_hosur:null,p_cakes:[]};
 m.rpc.mockResolvedValueOnce({error:{message:'Connection lost'}});await expect(saveWebDispatch(regular)).rejects.toThrow();
 await expect(saveWebDispatch({...regular,p_invoice:{...regular.p_invoice,p_regular_actions:[{orderId:'order',dispatchEntryId:'second'}]}})).rejects.toThrow('Recover saved dispatch');expect(m.rpc).toHaveBeenCalledTimes(1);
 m.rpc.mockResolvedValue({data:{id:'invoice',invoice_no:'TO/1',total:20}});await saveWebDispatch(pendingRegularDispatch(['order'])!);expect(m.rpc.mock.calls[1][1]).toEqual(m.rpc.mock.calls[0][1]);expect(pendingRegularDispatch(['order'])).toBeNull();
});
it('uses the physical batch identity for regular dispatch recovery',async()=>{
 const regular={p_invoice:{p_scope:'SNB',p_total:20,p_regular_actions:[{dispatchEntryId:'entry'}]},p_hosur:null,p_cakes:[]};
 m.rpc.mockResolvedValueOnce({error:{message:'Connection lost'}}).mockResolvedValueOnce({data:{id:'invoice',invoice_no:'TO/1',total:20}});
 await expect(saveWebDispatch(regular)).rejects.toThrow('confirmation was lost');const original=m.rpc.mock.calls[0][1];
 await saveWebDispatch(regular);expect(m.rpc.mock.calls[1][1]).toEqual(original);expect(localStorage.length).toBe(0);
});
it('reuses a durable identity after a lost response without changing invoice data',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Failed to fetch'}}).mockResolvedValueOnce({data:{id:'invoice',invoice_no:'TO/1',total:500}});
 await expect(saveWebDispatch(input)).rejects.toThrow('confirmation was lost');const id=m.rpc.mock.calls[0][1].p_request;
 expect(localStorage.length).toBe(1);expect((await saveWebDispatch(input)).invoice_no).toBe('TO/1');expect(m.rpc.mock.calls[1][1].p_request).toBe(id);expect(localStorage.length).toBe(0);
});
it('blocks changes to an uncertain save and retains malformed confirmations',async()=>{
 m.rpc.mockResolvedValue({data:{id:'invoice',invoice_no:'TO/1',total:499}});
 await expect(saveWebDispatch(input)).rejects.toThrow('incomplete');
 await expect(saveWebDispatch({...input,p_invoice:{...input.p_invoice,p_total:600}})).rejects.toThrow('awaiting confirmation');expect(m.rpc).toHaveBeenCalledTimes(1);expect(localStorage.length).toBe(1);
});
it('blocks duplicate submissions and conflicting in-flight payment details',async()=>{
 let release!:(x:unknown)=>void;m.rpc.mockReturnValue(new Promise(r=>{release=r;}));
 const first=saveWebDispatch(input),second=saveWebDispatch(input);
 await expect(saveWebDispatch({...input,p_invoice:{...input.p_invoice,p_total:600}})).rejects.toThrow('different details');
 release({data:{id:'invoice',invoice_no:'TO/1',total:500}});await Promise.all([first,second]);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not make a financial call if local persistence fails',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});
 await expect(saveWebDispatch(input)).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
