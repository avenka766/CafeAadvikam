import {supabase} from '@/lib/supabase';
import type {AuditRaw} from '@/audit/sources';
export type FinanceSource='suppliers'|'payroll'|'entries'|'payables'|'employee_balances';
export const financePageSources:FinanceSource[]=['suppliers','payroll','entries','payables','employee_balances'];
export async function loadFinanceRecords(source:FinanceSource,from:string,to:string,month:string){
 const rows:AuditRaw[]=[];const seen=new Set<string>();let after:string|null=null;
 for(;;){
  const department=source==='payables'||source==='employee_balances';
  const {data,error}=await supabase.rpc(department?'finance_department_page':'finance_records_page',department?{p_source:source,p_after:after}:{p_source:source,p_from:from,p_to:to,p_after:after,p_year:Number(month.slice(0,4)),p_month:Number(month.slice(5,7))});
  if(error)throw Error(error.message);
  if(!data||data.source!==source||!Array.isArray(data.rows))throw Error('Incomplete Finance report response.');
  rows.push(...data.rows);after=data.next;
  if(!after)return rows;
  if(seen.has(after)||!data.rows.length)throw Error('Finance pagination did not advance. Report is incomplete.');seen.add(after);
 }
}
export const financeMoney=(value:unknown)=>`₹${Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const financeUnits=['Central','SNB','VRSNB','Cafe','Hosur','Planner','Store'];
export function previousPayrollMonth(today:string){const date=new Date(`${today}T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1,1);return date.toISOString().slice(0,7);}
export type FinanceRequest={method:'finance_record_supplier'|'finance_pay_salary'|'finance_record_department'|'finance_void_expense';args:Record<string,unknown>};
export async function sendFinanceRequest(request:FinanceRequest){
 const {data,error}=await supabase.rpc(request.method,request.args);
 // Only definitive validation/permission failures release the saved request.
 // Connection loss (08xxx) and unknown completion (40003) can follow a commit.
 if(error)throw Object.assign(Error(error.message),{rejected:!!error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)});
 if(!data?.receipt)throw Error('No payment receipt was returned. Retry the saved request to check it.');
 return data as {receipt:string;already_saved?:boolean;balance?:number;amount?:number};
}
export function financeError(message:string){
 if(message==='ADVANCE_RECORDS_REQUIRE_RECONCILIATION')return 'Salary advance records do not match the employee balance. Reconcile them in Attendance before recording this salary payment.';
 if(message==='CURRENT_BALANCE_NOT_VERIFIED')return 'Set the verified current supplier balance before recording its first payment.';
 if(message==='PAYROLL_MONTH_NOT_CLOSED')return 'This payroll month has not ended. Review it now and record payment after month end.';
 if(message==='INVALID_GRN_AMOUNT_REVIEW_BEFORE_PAYING')return 'A GRN has an invalid total or paid amount. Review its invoice before recording payment.';
 const errors:Record<string,string>={BALANCE_CHANGED_REFRESH_BEFORE_PAYING:'Supplier records changed. Refresh and review the new balance.',PAYROLL_CHANGED_REVIEW_AGAIN:'Attendance or deductions changed. Refresh and review this payroll again.',SALARY_ALREADY_PAID:'This employee already has a payment recorded for this month.',PAYMENT_EXCEEDS_OUTSTANDING:'The payment is more than the supplier’s outstanding balance.',CONFLICTING_ATTENDANCE_MARKS:'Attendance has conflicting day marks. Correct them in Attendance before paying.',PAYMENT_REFERENCE_REQUIRED:'Enter the bank or UPI transaction reference.',BALANCE_MUST_BE_AS_OF_TODAY:'Current outstanding balances must be recorded as of today.'};
 return errors[message]||message;
}
