import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
import {saveAdvanceCreation,pendingAdvanceCreation,finishAdvanceCreation} from './advanceCreationRequest';
const input={p_order:{branch:'SNB',customerName:'Fixture',orderValue:100,advanceAmount:40,items:[]},p_receiver:true};
beforeEach(()=>{localStorage.clear();m.rpc.mockReset();});
const confirm=()=>m.rpc.mockImplementation(async(_name,r)=>({data:{order:{...r.p_order,id:r.p_request,orderNo:'SNB-ADV-1'}}}));
it('recovers a lost advance response with the same request and retains it until the form accepts it',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Failed to fetch'}});await expect(saveAdvanceCreation('staff',input)).rejects.toThrow('Recover');
 const id=m.rpc.mock.calls[0][1].p_request;expect(pendingAdvanceCreation('staff','SNB')).toEqual(input);confirm();
 expect((await saveAdvanceCreation('staff',pendingAdvanceCreation('staff','SNB')!)).orderNo).toBe('SNB-ADV-1');expect(m.rpc.mock.calls[1][1].p_request).toBe(id);expect(pendingAdvanceCreation('staff','SNB')).not.toBeNull();
 finishAdvanceCreation('staff','SNB');expect(pendingAdvanceCreation('staff','SNB')).toBeNull();
});
it('blocks changed customer or money details while a prior save is uncertain',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});await expect(saveAdvanceCreation('staff',input)).rejects.toThrow();
 await expect(saveAdvanceCreation('staff',{...input,p_order:{...input.p_order,advanceAmount:50}})).rejects.toThrow('previous advance');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('shares concurrent identical submissions without collecting twice',async()=>{
 let release!:(r:unknown)=>void;m.rpc.mockImplementation((_name,r)=>new Promise(resolve=>{release=()=>resolve({data:{order:{...r.p_order,id:r.p_request,orderNo:'SNB-ADV-1'}}});}));
 const first=saveAdvanceCreation('staff',input),second=saveAdvanceCreation('staff',input);release(null);await Promise.all([first,second]);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not send an advance if durable request storage fails',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});await expect(saveAdvanceCreation('staff',input)).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
it('recovers the current order after an authorized edit while checking the original receipt amounts',async()=>{
 m.rpc.mockImplementation(async(_name,r)=>({data:{duplicate:true,initialOrderValue:100,initialAdvanceAmount:40,order:{...r.p_order,id:r.p_request,orderNo:'SNB-ADV-1',orderValue:150,balanceAmount:110}}}));
 expect((await saveAdvanceCreation('staff',input)).orderValue).toBe(150);expect(m.rpc).toHaveBeenCalledTimes(1);
});
