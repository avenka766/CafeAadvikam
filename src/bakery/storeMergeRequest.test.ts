import {beforeEach,expect,it,vi} from 'vitest';
import type {BakeryOrder} from './types';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {saveStoreMerge} from './storeMergeRequest';
const orders=[{id:'one',items:[{itemId:'a',itemName:'Bun',quantity:2}],status:'accepted',producedItems:[]} as unknown as BakeryOrder];
beforeEach(()=>{localStorage.clear();mocks.rpc.mockReset();});
it('reuses its durable request after a lost response',async()=>{
 mocks.rpc.mockResolvedValueOnce({error:{message:'Network failure'}}).mockResolvedValueOnce({data:{order:{id:'one'},removed_ids:[]}});
 await expect(saveStoreMerge('staff',orders,orders[0].items,[],null)).rejects.toThrow('Network failure');
 expect(localStorage.length).toBe(1);const first=mocks.rpc.mock.calls[0][1];
 await saveStoreMerge('staff',orders,orders[0].items,[],null);expect(mocks.rpc.mock.calls[1][1]).toEqual(first);expect(localStorage.length).toBe(0);
});
it('retains the full request when the server confirmation is incomplete',async()=>{
 mocks.rpc.mockResolvedValue({data:{order:{id:'wrong'},removed_ids:[]}});await expect(saveStoreMerge('staff',orders,orders[0].items,[],null)).rejects.toThrow('incomplete');expect(localStorage.length).toBe(1);
});
it('does not contact the server without durable local storage',async()=>{
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk unavailable');});
 try{await expect(saveStoreMerge('staff',orders,orders[0].items,[],null)).rejects.toThrow('Disk unavailable');expect(mocks.rpc).not.toHaveBeenCalled();}finally{storage.mockRestore();}
});
