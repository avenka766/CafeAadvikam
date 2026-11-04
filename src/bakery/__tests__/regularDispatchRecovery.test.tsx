import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({pending:vi.fn(),save:vi.fn(),load:vi.fn(),dispatch:vi.fn(),done:vi.fn()}));
vi.mock('../webDispatchRequest',()=>({pendingRegularDispatch:m.pending,saveWebDispatch:m.save}));
vi.mock('@/lib/desktopBilling',async original=>({...await original<any>(),automaticDesktopBilling:()=>false}));
vi.mock('@/stores/branchCatalogStore',()=>({useBranchCatalogStore:()=>({items:{SNB:[{name:'Bun',price:10,active:true}],VRSNB:[],Hosur:[]},loadCatalog:m.load})}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:vi.fn(),from:vi.fn()},fetchAllRows:vi.fn()}));
import {DispatchReviewModal} from '../PlannerDashboard';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;let host:HTMLDivElement,root:Root;
beforeEach(()=>{m.pending.mockReset();m.save.mockReset();m.load.mockReset().mockResolvedValue(undefined);m.dispatch.mockReset();m.done.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
it('recovers the original invoice and blocks a replacement batch without dispatching the goods again',async()=>{
 const pending={p_invoice:{p_scope:'SNB',p_total:20,p_regular_actions:[{orderId:'order',dispatchEntryId:'original'}]},p_hosur:null,p_cakes:[]};m.pending.mockReturnValue(pending);
 m.save.mockImplementation(async()=>{m.pending.mockReturnValue(null);return {id:'invoice',invoice_no:'TO/26-27/1',scope:'SNB',items:[{itemName:'Bun',unit:'pcs',quantity:2,unitPrice:10,lineTotal:20}],subtotal:20,discount_pct:0,discount_amount:0,round_off:0,total:20,status:'paid',created_at:'2026-11-03T10:00:00Z',dispatch_entry_ids:[],is_gst_invoice:false};});
 await act(async()=>root.render(<DispatchReviewModal scope="SNB" dispatchedBy="Fixture" actions={[{orderId:'order',dispatchEntryId:'replacement',itemName:'Bun',quantity:2,unit:'pcs'}]} onDispatch={m.dispatch} onClose={()=>{}} onDone={m.done}/>));
 const confirm=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Confirm Dispatch'))!;expect(confirm.disabled).toBe(true);
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Recover saved dispatch')!.click();});
 expect(m.save).toHaveBeenCalledWith(pending);expect(m.dispatch).not.toHaveBeenCalled();expect(m.done).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('TO/26-27/1');
});
