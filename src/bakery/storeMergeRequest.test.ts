import {beforeEach,expect,it,vi} from 'vitest';
import type {BakeryOrder} from './types';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {partitionStoreMergeOrders,saveStoreMerge} from './storeMergeRequest';
const orders=[{id:'one',items:[{itemId:'a',itemName:'Bun',quantity:2}],status:'accepted',producedItems:[]} as unknown as BakeryOrder];
beforeEach(()=>{localStorage.clear();mocks.rpc.mockReset();});
it('sends compatible Wheat Bread orders together and keeps different weights and rates in separate batches', () => {
 const makeOrder = (id:string,weightGrams:number,advanceUnitPrice:number):BakeryOrder => ({
  ...orders[0], id, items:[{itemId:id,itemName:'Wheat Bread',quantity:3,dispatchUnit:'pcs',weightGrams,advanceUnitPrice}],
 });
 const first=makeOrder('first',400,35), differentWeight=makeOrder('weight',500,35),
  matching=makeOrder('match',400,35), differentRate=makeOrder('rate',400,40), advance=makeOrder('advance',400,35);
 const grouped=partitionStoreMergeOrders([first,differentWeight,matching,differentRate,advance],o=>o===advance);
 expect(grouped).toEqual([[first,matching],[differentWeight],[differentRate],[advance]]);
 expect(first.items[0].quantity).toBe(3);
});
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
