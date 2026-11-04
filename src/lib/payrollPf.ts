/** Company policy from November 2026: 60% of earned wages, capped at Rs 1,800.
 * Older months retain their original calculation; this is not voluntary PF.
 */
export function payrollPf(earned: number, year = new Date().getFullYear(), month = new Date().getMonth() + 1): number {
  if (!Number.isFinite(earned) || earned < 0) throw new Error('Invalid PF earnings');
  return year * 100 + month >= 202611
    ? Math.min(1800, Math.round(earned * 0.6 * 0.12))
    : Math.min(1800, Math.round(earned * 0.12));
}
export function payrollHistoryRoster<T extends {id:string; isActive?:boolean}>(employees:T[], attendance:Record<string,unknown>, includeAllArchived=false):T[] {
  const ids=new Set(Object.keys(attendance).map(key=>key.slice(0,key.lastIndexOf('_'))));
  return employees.filter(e=>includeAllArchived||e.isActive!==false||ids.has(e.id));
}
