import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff'}})}}));
import {confirmPackingReturn} from './packingReturnConfirmation';
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();});
it('retries the saved physical quantity instead of capturing it again after a lost response',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Disconnected'}}).mockResolvedValue({data:{id:'return',status:'posted',duplicate:true}});
 await expect(confirmPackingReturn({id:'return',item_name:'Bun'},2,'Returned')).rejects.toThrow('confirmation was lost');const request=m.rpc.mock.calls[0][1];
 await confirmPackingReturn({id:'return',item_name:'Bun'},3,'Changed');expect(m.rpc.mock.calls[1][1]).toEqual(request);expect(localStorage.length).toBe(0);
});
it('does not start confirmation without a durable saved request',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});await expect(confirmPackingReturn({id:'return',item_name:'Bun'},2,'')).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
it('clears a rolled-back rejection so a corrected request can be entered',async()=>{
 m.rpc.mockResolvedValue({error:{code:'P0001',message:'RETURN_VARIANCE_REQUIRES_DISPUTE'}});await expect(confirmPackingReturn({id:'return',item_name:'Bun'},1,'')).rejects.toThrow('RETURN_VARIANCE');expect(localStorage.length).toBe(0);
});
