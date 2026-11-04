import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
import {pendingCustomDeduction,saveCustomDeduction} from './customDeductionRequest';
const input={items:[{id:'stock',quantity:2,unit:'kg'}],reason:'Internal use'};
beforeEach(()=>{localStorage.clear();rpc.mockReset();});
it('keeps an uncertain request across reload/retry and accepts its saved result once',async()=>{
 rpc.mockRejectedValueOnce(Error('Connection lost'));await expect(saveCustomDeduction('staff',input)).rejects.toThrow('lost');
 const pending=pendingCustomDeduction('staff')!;expect(pending.items).toEqual(input.items);
 rpc.mockResolvedValueOnce({data:{batch_id:pending.request,rows:[{id:'history'}]},error:null});
 await saveCustomDeduction('staff');expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(pendingCustomDeduction('staff')).toBeNull();
});
it('does not replace an uncertain request with edited form data',async()=>{
 rpc.mockResolvedValue({error:{code:'08006',message:'Connection lost'}});
 await expect(saveCustomDeduction('staff',input)).rejects.toThrow();const original=pendingCustomDeduction('staff');
 await expect(saveCustomDeduction('staff',{...input,reason:'Changed'})).rejects.toThrow();expect(pendingCustomDeduction('staff')).toEqual(original);
});
it('does not send when durable storage is unavailable',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Storage full');});
 try{await expect(saveCustomDeduction('staff',input)).rejects.toThrow('Storage full');expect(rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('retains mismatched confirmations but releases a definitively rejected request',async()=>{
 rpc.mockResolvedValueOnce({data:{batch_id:'wrong',rows:[{}]},error:null});await expect(saveCustomDeduction('staff',input)).rejects.toThrow('incomplete');expect(pendingCustomDeduction('staff')).toBeTruthy();
 rpc.mockResolvedValueOnce({error:{code:'P0001',message:'INSUFFICIENT_STOCK'}});await expect(saveCustomDeduction('staff')).rejects.toThrow('INSUFFICIENT');expect(pendingCustomDeduction('staff')).toBeNull();
});
