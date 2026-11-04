import {supabase} from './supabase';
export interface PayrollDay {present:boolean;half:boolean;woff:boolean;absent:boolean;bf:boolean;lunch:boolean;dinner:boolean}
export async function savePayrollDay(employeeId:string,year:number,month:number,day:number,value:PayrollDay,mealsOnly=false) {
 const payload={employee_id:employeeId,year,month,day,...(mealsOnly?{bf:value.bf,lunch:value.lunch,dinner:value.dinner}:value)};
 const {error}=await supabase.from('attendance').upsert(payload,{onConflict:'employee_id,year,month,day'});
 if(error)throw new Error(error.message||'Attendance could not be saved.');
}
export async function savePayrollDeduction(employeeId:string,year:number,month:number,value:{deductAdvance:boolean;deductOther:boolean;deductUniform:boolean;deductESI:boolean;deductPF:boolean}) {
 const {error}=await supabase.from('deduction_decisions').upsert({employee_id:employeeId,year,month,deduct_advance:value.deductAdvance,deduct_other:value.deductOther,deduct_uniform:value.deductUniform,deduct_esi:value.deductESI,deduct_pf:value.deductPF},{onConflict:'employee_id,year,month'});
 if(error)throw new Error(error.message||'Deductions could not be saved.');
}
