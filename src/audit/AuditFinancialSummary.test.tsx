import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {AuditFinancialSummary} from './AuditFinancialSummary';
import {buildAuditFinance} from './finance';
import {AUDIT_SOURCES,type AuditSnapshot} from './sources';
it('shows the selected range, keeps Total last during sorting and offers the three detail views',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const snapshot:AuditSnapshot=Object.fromEntries(AUDIT_SOURCES.map(s=>[s.id,{rows:[],status:'ready',error:''}]));const rootHost=document.createElement('div');const root=createRoot(rootHost);
 try{await act(async()=>root.render(<AuditFinancialSummary snapshot={snapshot} report={buildAuditFinance(snapshot,'2026-10-15','2026-10-23')} from="2026-10-15" to="2026-10-23" branch="All" loading={false} complete/>));expect(rootHost.textContent).toContain('15-10-2026 to 23-10-2026');expect(rootHost.textContent).toContain('Not recorded');const table=rootHost.querySelector('table')!;expect(table.querySelector('tfoot')?.textContent).toContain('Total');await act(async()=>table.querySelector<HTMLButtonElement>('th button')!.click());expect(table.querySelector('tbody tr')?.textContent).not.toContain('Total');expect(table.lastElementChild?.tagName).toBe('TFOOT');for(const label of ['Purchase invoices','Expense details','Salary records'])expect([...rootHost.querySelectorAll('button')].some(b=>b.textContent===label)).toBe(true);await act(async()=>[...rootHost.querySelectorAll('button')].find(b=>b.textContent==='Salary records')!.click());expect(rootHost.textContent).toContain('Whole saved salary months');}
 finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
