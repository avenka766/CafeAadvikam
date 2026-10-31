import type {buildAuditFinance} from '@/audit/finance';
import type {AuditRaw,AuditSnapshot} from '@/audit/sources';
import type {ReportSheet} from '@/lib/exportAdminReport';
import {financeDepartmentData} from './department';
import {otherExpenseColumns,handoverColumns,payableColumns,employeeBalanceColumns,closureColumns,taxColumns} from './departmentColumns';
import {creditColumns,paymentColumns,accountColumns,advanceColumns} from '@/audit/detailColumns';
export type FinanceExport={from:string;to:string;month:string;branch:string;report:ReturnType<typeof buildAuditFinance>;suppliers:AuditRaw[];payroll:AuditRaw[];history:AuditRaw[];snapshot?:AuditSnapshot;payables?:AuditRaw[];employeeBalances?:AuditRaw[]};
const sheet=(name:string,rows:AuditRaw[],scope:string,keys?:string[]):ReportSheet=>({name,title:`${name} · ${scope}`,columns:(keys||[...new Set(rows.flatMap(r=>Object.keys(r)))]).map(k=>({key:k,header:k.replaceAll('_',' ')})),rows:rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='object'&&v!==null?JSON.stringify(v):v])))});
export function financeWorkbook(data:FinanceExport){
 const {from,to,month,branch,report,suppliers,payroll,history}=data;const scope=`${from} to ${to} IST · ${branch}`;
 const entries=report.entries.filter(r=>branch==='All'||r.branch===branch);const salary=payroll.filter(r=>branch==='All'||(r.branch==='Cafe Aadvikam'?'Cafe':r.branch)===branch);const payments=history.filter(r=>branch==='All'||r.unit===branch);
 const entryKeys=['date','branch','category','reference','party','mode','amount','cashIn','cashOut','revenue','purchase','expense','status','source','sourceId'];
 const sheets:ReportSheet[]=[sheet('Read me',[
  {section:'Report scope',detail:scope},
  {section:'Collections',detail:'Actual recorded receipts; credit sales are not cash receipts. Branch receipts do not prove handover to Central Finance.'},
  {section:'Outstanding',detail:'Supplier balances and GRNs show CURRENT positions across ALL dates; adjustments replace the entered total instead of adding old GRNs twice.'},
  {section:'GRN review',detail:'Pending GRNs are included as recorded obligations. Review their status before payment.'},
  {section:'Payroll scope',detail:`Existing monthly payroll cycle ${month}. Paid snapshots are immutable. Unmarked days have no paid attendance. Bank account details are confidential.`},
  {section:'Payments',detail:'Finance history uses payment dates. A payment receipt records bookkeeping, not an automatic bank transfer. FIN receipts are separate from sales numbers.'},
  {section:'Cash flow',detail:'Collections less recorded payments is neither profit nor bank balance. Deposits are internal transfers, not additional income.'}
  ,{section:'Department records',detail:'Other expenses and employee advances record payments already made. Handovers acknowledge internal transfers without adding income. Voided expense receipts retain their original amount and correction reason but have zero included expense. Payables and employee balances are current all-date positions. Legacy advance-history clearance flags do not establish the current balance.'}
 ],scope,['section','detail']),sheet('Business unit summary',report.byBranch.filter(r=>branch==='All'||r.branch===branch),scope),sheet('Collections all',entries.filter(r=>r.cashIn!==0),scope,entryKeys)];
 for(const unit of ['SNB','VRSNB','Hosur','Planner','Cafe'])sheets.push(sheet(`${unit} collections`,entries.filter(r=>r.cashIn!==0&&r.branch===unit),scope,entryKeys));
 sheets.push(sheet('Expenses',entries.filter(r=>r.category==='Expenses'),scope,entryKeys),sheet('Supplier money paid',entries.filter(r=>r.category==='Supplier payments'),scope,entryKeys),sheet('Bank transfers',entries.filter(r=>r.category==='Bank transfers'),scope,entryKeys),sheet('Purchase invoices',entries.filter(r=>r.purchase!==0),scope,entryKeys),sheet('Store suppliers current',suppliers.map(({invoices,...s})=>s),'Current · all Store suppliers',['name','phone','grn_total','grn_paid','adjustment','balance','balance_verified','grns','archived','id']),sheet('Store GRNs current',suppliers.flatMap(s=>(s.invoices||[]).map((i:AuditRaw)=>({...i,supplier:s.name,supplier_id:s.id,balance:Number(i.total)-Number(i.paid)}))),'Current · all Store suppliers',['grn','invoice','supplier','date','status','total','paid','balance','supplier_id','id']),sheet('Monthly payroll',salary,`${month} · ${branch}`,['name','branch','department','year','month','days','present','half','week_off','unmarked','gross','earned','canteen','advance','uniform','other','esi','pf','deductions','net','status','receipt','paid_amount','bank','account','ifsc']),sheet('Finance receipt history',payments,scope,['receipt','paid_on','kind','party','unit','amount','unallocated','mode','reference','note','recorded_by','created_at','snapshot','id']),sheet('GRN payment allocations',payments.filter(r=>r.kind==='supplier_payment').flatMap(r=>(r.snapshot?.allocations||[]).map((i:AuditRaw)=>({...i,receipt:r.receipt,supplier:r.party,paid_on:r.paid_on}))),scope,['receipt','supplier','paid_on','grn','amount','id']),sheet('Balance adjustments',payments.filter(r=>r.kind==='supplier_balance').map(r=>({...r,previous_balance:r.snapshot?.before?.balance,verified_current_balance:r.snapshot?.requested_amount})),scope,['receipt','party','paid_on','previous_balance','verified_current_balance','amount','note','recorded_by']),sheet('Reconciliation attention',report.issues,scope));
 const department=financeDepartmentData(data.snapshot||{},suppliers,data.payables||[],data.employeeBalances||[],history,from,to,branch);
 const append=(name:string,rows:AuditRaw[],columns:{key:string;label:string}[],caption=scope)=>sheets.push({name,title:`${name} · ${caption}`,columns:columns.map(c=>({key:c.key,header:c.label})),rows:rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='object'&&v!==null?JSON.stringify(v):v])))});
 append('Other organization expenses',department.expenses,otherExpenseColumns);
 append('Branch handovers',department.handovers,handoverColumns);
 append('Current supplier payables',department.payables,payableColumns,'Current balances · '+branch);
 append('Current employee advances',department.employees,employeeBalanceColumns,'Current balances · '+branch);
 append('Employee advance payments',department.advancePayments,handoverColumns.filter(c=>c.key!=='received_by'));
 append('Employee advance history',department.advanceHistory,advanceColumns);
 append('Credit invoice balances',department.credit,creditColumns,'Current positions through '+to+' · '+branch);
 append('Credit repayments',department.creditPayments,paymentColumns);
 append('Credit account balances',department.creditAccounts,accountColumns,'Current positions through '+to+' · '+branch);
 append('Cash closure review',department.closures,closureColumns);
 append('Tax document register',department.tax,taxColumns);
 return sheets;
}
export async function exportFinanceWorkbook(data:FinanceExport){
 await new Promise<void>((resolve,reject)=>{const worker=new Worker(new URL('./workbook.worker.ts',import.meta.url),{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error('Excel preparation timed out. Use a shorter date range.'));},180000);const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onerror=e=>{finish();reject(Error(e.message));};worker.onmessage=(e:MessageEvent<{bytes?:ArrayBuffer;error?:string}>)=>{finish();if(e.data.error||!e.data.bytes){reject(Error(e.data.error||'No workbook produced.'));return;}const url=URL.createObjectURL(new Blob([e.data.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Finance_${data.from}_${data.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);resolve();};worker.postMessage(data);});
}
