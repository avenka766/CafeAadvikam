import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),sync:vi.fn(),stock:{} as any,ops:{} as any}));
vi.mock('./branchStore',()=>({hydrateBranchDataFromCache:async()=>{},useBranchStore:(select:any)=>select(m.stock)}));
vi.mock('./branchOpsStore',()=>({money:(v:number)=>String(v),useBranchOpsStore:Object.assign((select:any)=>select(m.ops),{persist:{hasHydrated:()=>true,onFinishHydration:()=>()=>{},rehydrate:async()=>{}}})}));
vi.mock('@/stores/authStore',()=>({useAuthStore:()=>({currentUser:{id:'staff',username:'Fixture',role:'branch_snb'},logout:vi.fn()})}));
vi.mock('@/lib/platform',()=>({isNativeApp:()=>false}));
vi.mock('@/stores/snbTabStripStore',()=>({useSnbTabStripStore:(select:any)=>select({expanded:true})}));
vi.mock('./tabs/BranchBillingProTab',()=>({default:()=> <div>Billing fixture</div>}));
vi.mock('./tabs/SettingsTab',()=>({SettingsTab:()=>null}));
vi.mock('./tabs/ReportsTab',()=>({ReportsTab:()=>null}));
vi.mock('./tabs/PaymentModeEditTab',()=>({PaymentModeEditTab:()=>null}));
vi.mock('./tabs/BranchBusinessModules',()=>{
 const Empty=()=>null;return {AdvanceCakeOrdersTab:Empty,AdminNotificationsBranchTab:Empty,AuditLogsTab:Empty,BankTab:Empty,BranchAdminKpiStrip:Empty,BranchBillHistoryProTab:Empty,CashierClosureTab:()=> <div>Closure fixture</div>,CurrentCashTab:Empty,PurchaseOrderTab:Empty,PurchasePayTab:Empty,PurchaseTab:Empty,ReturnsTab:Empty,SalespersonReportTab:Empty};
});
import BranchDashboard from './BranchDashboard';
beforeEach(()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.useFakeTimers();m.fetch.mockReset().mockResolvedValue(undefined);m.sync.mockReset().mockResolvedValue(undefined);
 m.stock={stock:{SNB:[]},sales:{SNB:[]},advanceOrders:{SNB:[]},thresholds:{SNB:{}},loading:false,fetchBranchData:m.fetch,syncIncomingFromDispatches:m.sync,cleanOldData:vi.fn(),seedBranchItems:vi.fn(),subscribeToStock:()=>()=>{}};
 m.ops={advanceCakeOrders:[],notifications:[],refreshSalespeople:vi.fn()};
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();});
it('opens billing without downloading credit/payment history or unrelated report data',async()=>{
 await act(async()=>root.render(<MemoryRouter><BranchDashboard branch="SNB"/></MemoryRouter>));await act(()=>vi.advanceTimersByTimeAsync(1000));
 expect(host.textContent).toContain('Billing fixture');expect(m.fetch).toHaveBeenCalledTimes(1);expect(m.fetch.mock.calls[0]).toEqual(['SNB',false,['stock','thresholds','advance']]);
});
it('lets closure own its session reads instead of fetching all branch slices',async()=>{
 await act(async()=>root.render(<MemoryRouter initialEntries={['/?tab=closure']}><BranchDashboard branch="SNB"/></MemoryRouter>));await act(()=>vi.advanceTimersByTimeAsync(1000));
 expect(host.textContent).toContain('Closure fixture');expect(m.fetch.mock.calls[0]).toEqual(['SNB',false,['advance']]);
});
it('does not refetch dispatch history on every quick return to the browser',async()=>{
 await act(async()=>root.render(<MemoryRouter><BranchDashboard branch="SNB"/></MemoryRouter>));await act(()=>vi.advanceTimersByTimeAsync(1000));
 await act(async()=>{for(let n=0;n<5;n++)document.dispatchEvent(new Event('visibilitychange'));});
 expect(m.fetch).toHaveBeenCalledTimes(1);expect(m.sync).toHaveBeenCalledTimes(1);
 await act(()=>vi.advanceTimersByTimeAsync(60_000));await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await act(()=>vi.advanceTimersByTimeAsync(200));
 expect(m.fetch).toHaveBeenCalledTimes(2);expect(m.sync).toHaveBeenCalledTimes(2);
});
