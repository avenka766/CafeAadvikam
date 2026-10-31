import {auditDay} from './finance';
import {auditReference} from './references';
import type {AuditRaw,AuditSnapshot,AuditSourceId} from './sources';
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const branch=(value:unknown)=>value==='Cafe Aadvikam'?'Cafe':String(value||'Payroll');
const cancelled=(r:AuditRaw)=>/cancel|void|reversed|rejected/i.test(String(r.status||''));
export function buildAuditDetails(snapshot:AuditSnapshot,from:string,to:string,today=auditDay(new Date().toISOString())){
 const rows=(source:AuditSourceId)=>snapshot[source]?.rows||[];
 const employees=new Map(rows('employees').map(e=>[String(e.id),e]));
 const staff=(r:AuditRaw)=>{const e=employees.get(String(r.employee_id))||{};return {employee:r.employee_name||e.name||r.employee_id,employeeId:r.employee_id,branch:branch(r.branch||e.branch),department:r.department||e.department||'',team:r.contract_team||e.payment_mode||''};};
 const credit:AuditRaw[]=[];
 for(const r of rows('branch_credits'))credit.push({...r,id:`branch:${r.id}`,source:'Branch credit',invoice:auditReference('branch_credits',r,snapshot),customer:r.customer_name,phone:r.customer_phone,date:auditDay(r.created_at),due:r.due_date,total:n(r.subtotal),paid:n(r.amount_paid),balance:cancelled(r)||r.status==='settled'?0:n(r.credit_amount),status:r.status});
 for(const r of rows('hosur_credit')){
  if(rows('branch_credits').some(c=>c.source==='hosur'&&String(c.source_id)===String(r.bill_id)))continue;
  credit.push({...r,id:`hosur:${r.id}`,source:'Hosur credit',branch:'Hosur',invoice:r.bill_no,customer:r.shop_name,phone:'',date:auditDay(r.created_at),due:r.due_date,total:n(r.opening_amount),paid:n(r.paid_amount),balance:cancelled(r)?0:n(r.balance_amount)});
 }
 for(const r of rows('credit_invoices'))credit.push({...r,id:`account:${r.id}`,source:'Credit account invoice',invoice:auditReference('credit_invoices',r,snapshot),customer:r.customer_name,phone:r.mobile,date:r.business_date||auditDay(r.issued_at),due:r.due_date,total:n(r.invoice_total),paid:n(r.allocated_paid),balance:cancelled(r)?0:n(r.current_balance)});
 credit.forEach(r=>{r.overdue=r.balance>0&&r.due&&r.due<today?'Overdue':r.balance>0?'Outstanding':'Settled';});
 const payments:AuditRaw[]=[];const unified=rows('branch_payments').filter(p=>p.credit_sale_id||/credit/i.test(String(p.payment_purpose)));
 const pushPayment=(r:AuditRaw,source:AuditSourceId)=>{
  const parent=rows('branch_credits').find(c=>c.id===r.credit_sale_id)||rows('hosur_credit').find(c=>c.id===r.ledger_id)||rows('credit_accounts').find(c=>c.id===r.account_id)||{};
  payments.push({...r,id:`${source}:${r.id}`,branch:r.branch||parent.branch||(source==='hosur_collections'?'Hosur':'Cafe'),invoice:auditReference(source,r,snapshot),date:auditDay(r.paid_at||r.created_at),customer:r.customer_name||parent.customer_name||parent.shop_name||'',phone:parent.customer_phone||parent.mobile||'',amount:n(r.amount??r.amount_collected),mode:r.payment_mode,status:r.status||'Recorded',collector:r.collected_by||r.collector_username||''});
 };
 unified.forEach(r=>pushPayment(r,'branch_payments'));
 for(const r of rows('credit_receipts')){if(!unified.some(p=>p.branch===r.branch&&p.credit_sale_id===r.credit_sale_id&&n(p.amount)===n(r.amount)&&Math.abs(Date.parse(p.created_at)-Date.parse(r.created_at))<60000))pushPayment(r,'credit_receipts');}
 rows('hosur_collections').forEach(r=>{if(!unified.some(p=>p.branch==='Hosur'&&p.bill_no===rows('hosur_credit').find(c=>c.id===r.ledger_id)?.bill_no&&n(p.amount)===n(r.amount_collected)&&Math.abs(Date.parse(p.created_at)-Date.parse(r.created_at))<60000))pushPayment(r,'hosur_collections');});
 rows('credit_payments').forEach(r=>pushPayment(r,'credit_payments'));
 const attendance:AuditRaw[]=rows('attendance').map(r=>({...r,...staff(r),date:r.attendance_date||`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`,mark:r.present?'Present':r.half?'Half day':r.woff?'Week off':r.absent?'Absent':'Unmarked',presentDays:r.present?1:0,halfDays:r.half?1:0,weekOffDays:r.woff?1:0,absentDays:r.absent?1:0,breakfast:r.bf?'Yes':'No',lunch:r.lunch?'Yes':'No',dinner:r.dinner?'Yes':'No'}));
 const dayCount=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
 const attendanceSummary:AuditRaw[]=rows('employees').map(e=>{
  const own=attendance.filter(a=>a.employee_id===e.id);const count=(key:string)=>own.reduce((s,r)=>s+n(r[key]),0);const marked=new Set(own.filter(r=>r.mark!=='Unmarked').map(r=>r.date)).size;
  // Missing records are unmarked, never inferred to be absences. Only count dates after joining when known.
  const joined=auditDay(e.created_at);const eligibleStart=joined&&joined>from?joined:from;const eligibleDays=eligibleStart>to?0:Math.min(dayCount,Math.round((Date.parse(to)-Date.parse(eligibleStart))/86400000)+1);
  return {id:e.id,...staff({employee_id:e.id}),active:e.is_active===false?'Inactive':'Active',presentDays:count('presentDays'),halfDays:count('halfDays'),weekOffDays:count('weekOffDays'),absentDays:count('absentDays'),payDays:count('presentDays')+count('halfDays')*.5+count('weekOffDays'),unmarkedDays:Math.max(0,eligibleDays-marked),meals:own.reduce((s,a)=>s+Number(a.breakfast==='Yes')+Number(a.lunch==='Yes')+Number(a.dinner==='Yes'),0)};
 });
 const salary:AuditRaw[]=rows('salary_records').map(r=>({...r,...staff(r),period:`${r.year}-${String(r.month).padStart(2,'0')}`,gross:r.gross_salary??employees.get(String(r.employee_id))?.gross_salary,status:r.finalized?'Finalized':'Draft'}));
 const advances:AuditRaw[]=rows('salary_advances').map(r=>({...r,...staff(r),date:r.given_date,status:r.cleared?'Cleared':'Outstanding'}));
 const staffRows:AuditRaw[]=rows('employees').map(e=>({...e,...staff({employee_id:e.id}),active:e.is_active===false?'Inactive':'Active'}));
 const teams:AuditRaw[]=rows('contract_teams').map(t=>({id:t.id,team:t.name,people:staffRows.filter(e=>e.team===t.name).length,activePeople:staffRows.filter(e=>e.team===t.name&&e.is_active!==false).length,gross:staffRows.filter(e=>e.team===t.name&&e.is_active!==false).reduce((s,e)=>s+n(e.gross_salary),0)}));
 const deductions:AuditRaw[]=rows('salary_deductions').map(r=>({...r,...staff(r),period:`${r.year}-${String(r.month).padStart(2,'0')}`,...Object.fromEntries(['deduct_advance','deduct_uniform','deduct_other','deduct_esi','deduct_pf'].map(key=>[key,r[key]?'Yes':'No']))}));
 const accounts:AuditRaw[]=rows('credit_accounts').map(r=>({...r,customer:r.customer_name,phone:r.mobile,balance:n(r.current_balance)}));
 const allocations:AuditRaw[]=rows('credit_allocations').map(r=>({...r,invoice:auditReference('credit_allocations',r,snapshot),customer:r.customer_name,date:auditDay(r.paid_at)}));
 return {credit,payments,accounts,allocations,attendance,attendanceSummary,salary,advances,staff:staffRows,teams,deductions};
}
