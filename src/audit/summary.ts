import type {buildAuditFinance} from './finance';
import type {AuditRaw} from './sources';
const units=['VRSNB','SNB','Hosur','Planner','Cafe'];
const titles:Record<string,string>={VRSNB:'VRSNB branch',SNB:'SNB branch',Hosur:'Hosur sales',Planner:'Planner sales',Cafe:'Cafe sales'};
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const number=(v:unknown)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function buildAuditSummary(report:ReturnType<typeof buildAuditFinance>,salaryRows:AuditRaw[],from:string,to:string){
 const salaries=salaryRows.filter(r=>String(r.period)>=from.slice(0,7)&&String(r.period)<=to.slice(0,7));
 const salesUnits=[...units,...new Set(report.entries.filter(e=>e.revenue!==0&&!units.includes(e.branch)).map(e=>e.branch))];
 const salesRow=(branch:string,all=false)=>{const rows=report.entries.filter(e=>all||e.branch===branch);const sales=round(rows.filter(e=>e.category!=='Refunds').reduce((s,e)=>s+e.revenue,0));const returns=round(-rows.filter(e=>e.category==='Refunds').reduce((s,e)=>s+e.revenue,0));return {id:branch,branch,label:titles[branch]||branch,sales,returns,netSales:round(sales-returns)};};
 const costUnits=[...units,...new Set([...report.entries.filter(e=>e.purchase!==0||e.expense!==0).map(e=>e.branch),...salaries.map(r=>String(r.branch||'Payroll'))].filter(b=>!units.includes(b)))];
 const costRow=(branch:string,all=false)=>{const entries=report.entries.filter(e=>all||e.branch===branch);const own=salaries.filter(r=>all||r.branch===branch);const known=own.filter(r=>number(r.net_salary)!=null);return {id:branch,branch,label:titles[branch]||branch,purchases:round(entries.reduce((s,e)=>s+e.purchase,0)),expenses:round(entries.reduce((s,e)=>s+e.expense,0)),salary:known.length?round(known.reduce((s,r)=>s+number(r.net_salary)!,0)):null,salaryRecords:own.length,draftSalary:round(known.filter(r=>r.status!=='Finalized').reduce((s,r)=>s+number(r.net_salary)!,0)),missingSalary:own.length-known.length};};
 return {sales:salesUnits.map(b=>salesRow(b)),salesTotal:salesRow('Total',true),costs:costUnits.map(b=>costRow(b)),costTotal:costRow('Total',true),salaries,purchases:report.entries.filter(e=>e.category==='Purchases'),expenses:report.entries.filter(e=>e.category==='Expenses')};
}
