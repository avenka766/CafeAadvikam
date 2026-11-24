import {supabase} from './supabase';
import type { AttendanceTimes } from './attendanceHours';
export interface PayrollDay {present:boolean;half:boolean;woff:boolean;absent:boolean;bf:boolean;lunch:boolean;dinner:boolean}
export async function savePayrollDay(employeeId:string,year:number,month:number,day:number,value:PayrollDay,mealsOnly=false) {
 const payload={employee_id:employeeId,year,month,day,...(mealsOnly?{bf:value.bf,lunch:value.lunch,dinner:value.dinner}:value)};
 const {error}=await supabase.from('attendance').upsert(payload,{onConflict:'employee_id,year,month,day'});
 if(error)throw new Error(error.message||'Attendance could not be saved.');
}
export async function savePayrollTimes(employeeId: string, year: number, month: number, day: number, value: AttendanceTimes) {
  const { error } = await supabase.from('attendance').upsert({
    employee_id: employeeId, year, month, day, in_time: value.in_time ?? null, out_time: value.out_time ?? null,
  }, { onConflict: 'employee_id,year,month,day' });
  if (error) throw new Error(error.message || 'Shift times could not be saved.');
}

export async function savePayrollDeduction(employeeId:string,year:number,month:number,value:{deductAdvance:boolean;deductOther:boolean;deductUniform:boolean;deductESI:boolean;deductPF:boolean}) {
 const {error}=await supabase.from('deduction_decisions').upsert({employee_id:employeeId,year,month,deduct_advance:value.deductAdvance,deduct_other:value.deductOther,deduct_uniform:value.deductUniform,deduct_esi:value.deductESI,deduct_pf:value.deductPF},{onConflict:'employee_id,year,month'});
 if(error)throw new Error(error.message||'Deductions could not be saved.');
}

export async function savePayrollAttendanceImport(year: number, month: number, rows: readonly {
  employeeId: string;
  day: number;
  value: PayrollDay;
}[]) {
  if (!rows.length) return;
  const payload = rows.map(({ employeeId, day, value }) => ({ employee_id: employeeId, year, month, day, ...value }));
  const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'employee_id,year,month,day' });
  if (error) throw new Error(error.message || 'Attendance import could not be saved.');
}
