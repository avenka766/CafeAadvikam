import {act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({send:vi.fn(),request:{method:'finance_record_supplier',args:{p_request:'fixture-payment-uuid',p_supplier:'fixture-supplier',p_amount:50}},supplier:{id:'fixture-supplier',name:'Isolated supplier',balance:100,balance_verified:true,invoices:[]}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(select:any)=>select({currentUser:{id:'isolated-finance',role:'finance'},logout:vi.fn()})}));
vi.mock('@/audit/useAuditReport',()=>({useAuditReport:()=>({snapshot:{},loading:false,errors:[],ready:29,retrySource:vi.fn()})}));
vi.mock('@/audit/AuditVisuals',()=>({AuditVisuals:()=>null}));
vi.mock('@/finance/data',async original=>({...await original<any>(),loadFinanceRecords:async(source:string)=>source==='suppliers'?[fixture.supplier]:[],sendFinanceRequest:fixture.send}));
vi.mock('@/finance/FinancePayment',()=>({FinancePayment:({onSave}:{onSave:(r:unknown)=>void})=><button onClick={()=>onSave(fixture.request)}>Save isolated payment</button>}));
vi.mock('@/finance/workbook',()=>({exportFinanceWorkbook:vi.fn()}));
import FinanceDashboard from '@/pages/FinanceDashboard';
it('retains an uncertain payment across a restart and retries the identical request before allowing another payment',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);localStorage.clear();fixture.send.mockRejectedValueOnce(Error('Response lost')).mockResolvedValueOnce({receipt:'FIN-FIXTURE',already_saved:true});
 let root:ReturnType<typeof createRoot>|null=null;const host=document.createElement('div');document.body.appendChild(host);
 const render=async()=>{root=createRoot(host);await act(async()=>root!.render(<MemoryRouter><FinanceDashboard/></MemoryRouter>));};
 const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button,`button ${text}`).toBeDefined();await act(async()=>button!.click());};
 try{
  await render();await click('Supplier accounts');await click('Record payment');await click('Save isolated payment');
  expect(JSON.parse(localStorage.getItem('finance-pending:isolated-finance')!)).toEqual(fixture.request);expect(host.textContent).toContain('A payment request needs confirmation');
  await act(async()=>root!.unmount());await render();expect(host.textContent).toContain('A payment request needs confirmation');
  await click('Check & retry saved request');expect(fixture.send).toHaveBeenCalledTimes(2);expect(fixture.send.mock.calls[0][0]).toEqual(fixture.send.mock.calls[1][0]);expect(localStorage.getItem('finance-pending:isolated-finance')).toBeNull();expect(host.textContent).toContain('FIN-FIXTURE');
 }finally{await act(async()=>root?.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();}
});
