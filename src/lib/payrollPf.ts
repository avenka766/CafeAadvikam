/** Unpaid payroll in every month: 12% of 60% of earnings, capped at Rs 1,800.
 * Recorded paid payroll must use its immutable payment snapshot instead.
 */
export function payrollPf(earned: number, year = new Date().getFullYear(), month = new Date().getMonth() + 1): number {
  if (!Number.isFinite(earned) || earned < 0) throw new Error('Invalid PF earnings');
  void year; void month;
  return Math.min(1800, Math.round(earned * 0.6 * 0.12));
}
export function visiblePayrollEmployee(e:{id:string;isActive?:boolean;leftOn?:string},year:number,month:number){
 if(e.isActive!==false||e.id==='emp_import_0062')return true;
 return !!e.leftOn&&`${year}-${String(month).padStart(2,'0')}`<=e.leftOn.slice(0,7);
}
export function payrollHistoryRoster<T extends {id:string; isActive?:boolean}>(employees:T[], attendance:Record<string,unknown>, includeAllArchived=false):T[] {
  const ids=new Set(Object.keys(attendance).map(key=>key.slice(0,key.lastIndexOf('_'))));
  return employees.filter(e=>includeAllArchived||e.isActive!==false||ids.has(e.id));
}
