import {beforeEach,expect,it,vi} from 'vitest';
const fetch=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase',()=>({supabase:{},fetchAllRows:fetch}));
vi.mock('@/lib/realtimeChannel',()=>({makeSingletonSubscriber:()=>()=>()=>{}}));
beforeEach(()=>{fetch.mockReset();vi.resetModules();});
it('keeps failed recipe loads retryable rather than marking seed data as live',async()=>{
 const {useRecipeStore:store}=await import('./recipeStore');
 fetch.mockResolvedValueOnce({data:[{item_id:'partial'}],error:'statement timeout'});
 await store.getState().loadRecipes();expect(store.getState().loaded).toBe(false);expect(store.getState().error).toContain('timeout');expect(store.getState().recipes.partial).toBeUndefined();
 fetch.mockResolvedValueOnce({data:[{item_id:'live',output_qty:2,output_unit:'kg',materials:[]}],error:null});
 await store.getState().loadRecipes();expect(store.getState().loaded).toBe(true);expect(store.getState().recipes.live.source).toBe('database');expect(store.getState().error).toBeNull();
});
it('makes concurrent callers await the same live recipe load',async()=>{
 const {useRecipeStore:store}=await import('./recipeStore');let finish:(r:unknown)=>void;
 fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const one=store.getState().loadRecipes();let secondFinished=false;const two=store.getState().loadRecipes().then(()=>{secondFinished=true;});
 await Promise.resolve();expect(secondFinished).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
 finish!({data:[],error:null});await Promise.all([one,two]);expect(secondFinished).toBe(true);
});
