import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),enqueue:vi.fn(),handler:null as null|((k:string,p:unknown,id:string)=>Promise<{ok:boolean;error?:string}>)}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc,from:mocks.from},fetchAllRows:vi.fn()}));
vi.mock('@/lib/realtimeChannel',()=>({makeSingletonSubscriber:()=>()=>()=>{}}));
vi.mock('./recipeStore',()=>({useRecipeStore:{getState:()=>({getAllMaterials:()=>[]})}}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{getState:()=>({enqueue:mocks.enqueue})},registerReplayHandler:(_k:string,h:typeof mocks.handler)=>{mocks.handler=h;}}));
import {queueStoreStockEdit,useStoreStockStore as store} from './storeStockStore';
beforeEach(()=>{mocks.rpc.mockReset();mocks.from.mockReset();mocks.enqueue.mockReset();store.setState({items:[]});});
it('persists the new replay contract before any stock call',async()=>{
 await queueStoreStockEdit({id:'stock',quantityDelta:2});
 expect(mocks.enqueue).toHaveBeenCalledWith('store_stock_edit',{id:'stock',quantityDelta:2,replayVersion:2});expect(mocks.rpc).not.toHaveBeenCalled();
});
it('retries quantity and metadata together with the identical queue identity',async()=>{
 const payload={id:'stock',quantityDelta:2,minThreshold:3,category:'packing',replayVersion:2};
 mocks.rpc.mockResolvedValueOnce({error:{message:'Response lost'}}).mockResolvedValueOnce({data:{item:{id:'stock'},already_saved:true},error:null});
 expect((await mocks.handler!('store_stock_edit',payload,'persisted-id')).ok).toBe(false);
 expect((await mocks.handler!('store_stock_edit',payload,'persisted-id')).ok).toBe(true);
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc).toHaveBeenLastCalledWith('apply_store_stock_edit_once_v1',{p_request:'persisted-id',p_id:'stock',p_delta:2,p_fields:{min_threshold:3,item_category:'packing'}});
});
it('preserves legacy uncertain adjustments for reconciliation without reapplying them',async()=>{
 const result=await mocks.handler!('store_stock_edit',{id:'stock',quantityDelta:2},'old-id');
 expect(result.ok).toBe(false);expect(result.error).toContain('original entry is preserved');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps an incomplete confirmation pending',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:null});
 expect((await mocks.handler!('store_stock_edit',{id:'stock',quantityDelta:2,replayVersion:2},'id')).ok).toBe(false);
});
it('does not overwrite a stock movement that happens after the freshness check',async()=>{
 store.setState({items:[{id:'stock',name:'Flour',unit:'kg',quantity:10,minThreshold:1,category:'raw'}]});
 const filters:unknown[][]=[];
 mocks.from.mockImplementation(()=>{
  let updating=false;const q:any={select:()=>q,update:()=>{updating=true;return q;},eq:(...args:unknown[])=>{if(updating)filters.push(args);return q;},maybeSingle:async()=>({data:updating?null:{quantity:10},error:null})};return q;
 });
 expect(await store.getState().updateQuantity('stock',12)).toContain('Stock changed');expect(filters).toContainEqual(['quantity',10]);expect(store.getState().items[0].quantity).toBe(10);
 expect(await store.getState().updateItem('stock',{quantity:12})).toContain('Stock changed');expect(store.getState().items[0].quantity).toBe(10);
});
