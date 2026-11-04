import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
import {saveStoreRelease,type StoreReleaseInput} from './storeReleaseRequest';
const input:StoreReleaseInput={p_order:'order',p_expected_items:[{item:'fixture'}],p_indexes:[0],p_materials:[{id:'stock',quantity:2,unit:'kg'}],p_mode:'confirm'};
beforeEach(()=>{localStorage.clear();rpc.mockReset();});
it('retries a lost response with the persisted original materials and request',async()=>{
 rpc.mockRejectedValueOnce(Error('Response lost'));await expect(saveStoreRelease('staff',input)).rejects.toThrow();
 rpc.mockResolvedValueOnce({data:{source:{id:'order'},released:{id:'split'},stock:[]},error:null});
 await saveStoreRelease('staff',{...input,p_materials:[{id:'stock',quantity:99,unit:'kg'}]});
 expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(localStorage.length).toBe(0);
});
it('does not send before durable storage succeeds',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});
 try{await expect(saveStoreRelease('staff',input)).rejects.toThrow('Disk full');expect(rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('keeps incomplete confirmations and scopes requests to the operator',async()=>{
 rpc.mockResolvedValue({data:{},error:null});await expect(saveStoreRelease('one',input)).rejects.toThrow('incomplete');await expect(saveStoreRelease('two',input)).rejects.toThrow();
 expect(rpc.mock.calls[0][1].p_request).not.toBe(rpc.mock.calls[1][1].p_request);expect(localStorage.length).toBe(2);
});
