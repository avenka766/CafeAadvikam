import {act,createElement} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn()}));vi.mock('@/lib/supabase',()=>({fetchAllRows:m.fetch}));
import {collectHosurOrderIds,useHosurShopOrders} from './useHosurShopOrders';import type {ProductionRow} from './PlannerDashboard';import type {BakeryOrder} from './types';
const row=(name:string)=>({itemName:name,unit:'pcs',contributingOrderIds:['production']}) as ProductionRow;
const orders=[{id:'production',targetBranch:'SNB',notes:'HOSUR_ORDER_IDS:shop-order'}] as BakeryOrder[];
const same=(a:string,b:string)=>a===b;
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,result:ReturnType<typeof useHosurShopOrders>;
function Harness({rows}:{rows:ProductionRow[]}){result=useHosurShopOrders(rows,orders,same);return null;}
const render=(rows:ProductionRow[])=>act(async()=>{root.render(createElement(Harness,{rows}));});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
beforeEach(()=>{m.fetch.mockReset().mockImplementation(async(table:string)=>({data:table==='hosur_orders'?[{id:'shop-order',order_number:'H-1',shop_name:'Fixture shop',created_at:'2026-11-04'}]:[{order_id:'shop-order',item_name:'Bun',unit:'pcs',quantity:5,dispatched_quantity:0},{order_id:'shop-order',item_name:'Rusk',unit:'pcs',quantity:8,dispatched_quantity:0}],error:null}));});
it('updates the visible item list when Active/Dispatched rows change under the same shop order',async()=>{
 await render([row('Bun')]);expect(result.shopOrders?.[0]?.items[0].itemName).toBe('Bun');
 await render([row('Rusk')]);expect(result.shopOrders?.[0]?.items[0].itemName).toBe('Rusk');expect(m.fetch).toHaveBeenCalledTimes(4);
});
it('does not fetch again when a background refresh only replaces equivalent row objects',async()=>{
 await render([row('Bun')]);expect(result.shopOrders).toHaveLength(1);await render([row('Bun')]);expect(m.fetch).toHaveBeenCalledTimes(2);
 await act(async()=>result.reload());expect(m.fetch).toHaveBeenCalledTimes(4);
});
it('keeps Hosur provenance on a production order merged into another branch',()=>{
 expect(collectHosurOrderIds(row('Bun'),orders)).toEqual(['shop-order']);
});
it('exposes a failed source and retries only the shop details',async()=>{
 m.fetch.mockResolvedValueOnce({data:[],error:'Statement timeout'});await render([row('Bun')]);expect(result.shopOrders).toBeNull();expect(result.error).toBe('Statement timeout');
 await act(async()=>result.reload());expect(result.error).toBeNull();expect(result.shopOrders?.[0].items[0].itemName).toBe('Bun');expect(m.fetch).toHaveBeenCalledTimes(4);
});
