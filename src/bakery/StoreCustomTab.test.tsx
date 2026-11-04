import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),rpc:vi.fn(),load:vi.fn(),print:vi.fn()}));
vi.mock('@/lib/supabase',()=>({fetchAllRows:m.fetch,supabase:{rpc:m.rpc}}));
vi.mock('./storeStockStore',()=>({useStoreStockStore:()=>({items:[],loaded:true,load:m.load})}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(select:any)=>select({currentUser:{id:'fixture-store',displayName:'Fixture'}})}));
vi.mock('@/lib/printViaIframe',()=>({printViaIframe:m.print}));
import StoreCustomTab from './StoreCustomTab';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{localStorage.clear();m.fetch.mockReset().mockResolvedValue({data:[],error:null});m.rpc.mockReset();m.print.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
it('recovers an uncertain deduction from the actual screen without printing an unconfirmed slip',async()=>{
 const pending={request:'same-request',items:[{id:'stock',quantity:2,unit:'kg'}],reason:'Internal use'};
 localStorage.setItem('store-custom-deduction:fixture-store',JSON.stringify(pending));
 m.rpc.mockResolvedValue({data:{batch_id:pending.request,rows:[{id:'saved',item_name:'Flour',item_id:'stock',quantity:2,unit:'kg',reason:pending.reason,deducted_by:'Fixture',created_at:new Date().toISOString(),batch_id:pending.request}]},error:null});
 await act(async()=>root.render(<StoreCustomTab/>));expect(host.textContent).toContain('A deduction request needs confirmation');
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Check & retry saved deduction')!;
 await act(async()=>button.click());expect(m.rpc).toHaveBeenCalledWith('record_store_custom_deduction_v1',{p_request:pending.request,p_items:pending.items,p_reason:pending.reason});
 expect(host.textContent).not.toContain('A deduction request needs confirmation');expect(localStorage.length).toBe(0);expect(m.print).not.toHaveBeenCalled();
});
it('does not substitute partial deduction history for complete records',async()=>{
 m.fetch.mockResolvedValue({data:[{item_name:'Partial record'}],error:'Statement timeout'});
 await act(async()=>root.render(<StoreCustomTab/>));expect(host.textContent).toContain('Deduction history could not load completely');expect(host.textContent).not.toContain('Partial record');
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Retry deduction history')).toBeTruthy();
});
