import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({download:vi.fn()}));
vi.mock('@/lib/excelDownload',async original=>({...await original<any>(),downloadExcelWorkbook:m.download}));
import {HistoryTab} from './AdminSNBDashboard';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;let host:HTMLDivElement,root:Root;
beforeEach(()=>{m.download.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const report=(bills:any[],loading=false)=>({operationBills:bills,operationReturns:[],loading,error:'',refreshedAt:loading?null:'loaded',refresh:vi.fn()});
it('paginates visible history while exporting every bill and its full item contribution',async()=>{
 const bills=Array.from({length:205},(_,i)=>({billNo:`SNB-${i+1}`,createdAt:'2026-10-16T10:00:00Z',salesperson:'Fixture',biller:'Cashier',total:10,discount:0,paymentMode:'cash',items:[{itemName:'Bun',unit:'pcs',quantity:1,lineTotal:10,price:10}]}));
 await act(async()=>root.render(<HistoryTab fromDate="2026-10-16" toDate="2026-10-16" dbReports={report(bills)}/>));
 expect(host.querySelector('table tbody')?.querySelectorAll('tr')).toHaveLength(100);expect(host.textContent).toContain('205 bills · Page 1 of 3');
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent==='Next')!.click();});expect(host.textContent).toContain('Page 2 of 3');
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Export Excel'))!.click();});
 const sheets=m.download.mock.calls[0][1];expect(sheets.find((s:any)=>s.name==='Branch History').rows).toHaveLength(205);const items=sheets.find((s:any)=>s.name==='Bill Items').rows;expect(items).toHaveLength(205);expect(items.reduce((n:number,r:any)=>n+r.SalesContribution,0)).toBe(2050);
});
it('distinguishes loading live data from a genuinely empty date range',async()=>{
 await act(async()=>root.render(<HistoryTab fromDate="2026-10-16" toDate="2026-10-16" dbReports={report([],true)}/>));expect(host.textContent).toContain('Loading live history');expect(host.textContent).not.toContain('No history records');
});
