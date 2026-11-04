import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),filters:[] as unknown[][],fail:false,actor:0}));
function query(table:string){const q:any={select:()=>q,neq:()=>q,eq:(...args:unknown[])=>{mocks.filters.push([table,'eq',...args]);return q;},gte:(...args:unknown[])=>{mocks.filters.push([table,'gte',...args]);return q;},lt:(...args:unknown[])=>{mocks.filters.push([table,'lt',...args]);return q;},order:()=>q,limit:()=>q,then:(resolve:any)=>Promise.resolve(mocks.fail?{data:null,error:{message:'Timeout'}}:{data:[],error:null}).then(resolve)};return q;}
vi.mock('@/lib/supabase',()=>({supabase:{from:mocks.from,rpc:mocks.rpc},fetchAllRows:async(table:string,build:any)=>{build(query(table));return {data:[],error:null};}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:`staff-${mocks.actor}`}})}}));
vi.mock('@/stores/branchCatalogStore',()=>({useBranchCatalogStore:{getState:()=>({items:{SNB:[],VRSNB:[]},loadCatalog:async()=>{}})}}));
vi.mock('@/bakery/bakeryStore',()=>({isAdvanceOrderTagged:()=>false,parseAdvanceOrderNotes:()=>null}));
vi.mock('@/lib/localCache',()=>({getCached:vi.fn(),setCached:vi.fn()}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{getState:()=>({})},registerReplayHandler:()=>{}}));
import {useBranchStore as store} from './branchStore';
beforeEach(()=>{mocks.actor++;mocks.fail=false;mocks.filters=[];mocks.from.mockReset().mockImplementation(query);});
it('coalesces simultaneous scope requests and avoids fresh repeat downloads',async()=>{
 await Promise.all([store.getState().fetchBranchData('SNB',false,['stock']),store.getState().fetchBranchData('SNB',false,['stock','credit'])]);
 expect(mocks.from.mock.calls.map(call=>call[0])).toEqual(['branch_stock','branch_credit_sales','branch_credit_sales']);
 await store.getState().fetchBranchData('SNB',false,['stock']);expect(mocks.from).toHaveBeenCalledTimes(3);
});
it('loads requested credit data even immediately after a stock-only refresh',async()=>{
 await store.getState().fetchBranchData('SNB',false,['stock']);await store.getState().fetchBranchData('SNB',false,['credit']);
 expect(mocks.from.mock.calls.map(call=>call[0])).toEqual(['branch_stock','branch_credit_sales','branch_credit_sales']);
});
it('does not erase working stock or cache a failed read as successful',async()=>{
 store.setState({stock:{...store.getState().stock,SNB:[{itemName:'Bun',quantity:10,reservedQuantity:0,availableQuantity:10,unit:'pcs',minThreshold:0,price:10}]}});
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{mocks.fail=true;await store.getState().fetchBranchData('SNB',false,['stock']);expect(store.getState().stock.SNB[0].quantity).toBe(10);
 mocks.fail=false;await store.getState().fetchBranchData('SNB',false,['stock']);expect(mocks.from).toHaveBeenCalledTimes(2);}finally{log.mockRestore();}
});
it('supports bounded closure credit reads without downloading lifetime history',async()=>{
 await store.getState().fetchCreditSales('SNB','2026-11-02T18:30:00Z','2026-11-03T18:30:00Z');await store.getState().fetchCreditPayments('SNB','2026-11-02T18:30:00Z','2026-11-03T18:30:00Z');
 for(const table of ['branch_credit_sales','branch_credit_payments']){expect(mocks.filters).toContainEqual([table,'gte','created_at','2026-11-02T18:30:00Z']);expect(mocks.filters).toContainEqual([table,'lt','created_at','2026-11-03T18:30:00Z']);}
});
