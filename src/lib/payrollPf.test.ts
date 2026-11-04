import {expect,it} from 'vitest';
import {payrollPf,payrollHistoryRoster,visiblePayrollEmployee} from './payrollPf';
it('uses 60% earnings, capped at 1800, from November while preserving earlier months',()=>{
 expect(payrollPf(10000,2026,11)).toBe(720);expect(payrollPf(5000,2026,11)).toBe(360);
 expect(payrollPf(25000,2026,11)).toBe(1800);expect(payrollPf(100000,2026,11)).toBe(1800);expect(payrollPf(10000,2026,10)).toBe(720);expect(payrollPf(19000,2026,10)).toBe(1368);
 expect(()=>payrollPf(NaN)).toThrow();
});
it('hides legacy left staff except Bapan and retains dated exit history in its payroll period',()=>{
 expect(visiblePayrollEmployee({id:'old',isActive:false},2026,10)).toBe(false);
 expect(visiblePayrollEmployee({id:'emp_import_0062',isActive:false},2026,10)).toBe(true);
 expect(visiblePayrollEmployee({id:'new',isActive:false,leftOn:'2026-11-04'},2026,11)).toBe(true);
 expect(visiblePayrollEmployee({id:'new',isActive:false,leftOn:'2026-11-04'},2026,12)).toBe(false);
});
it('retains archived people with monthly history without adding unrelated former employees',()=>{
 expect(payrollHistoryRoster([{id:'active'},{id:'left_person',isActive:false},{id:'other',isActive:false}],{'left_person_1':{}}).map(e=>e.id)).toEqual(['active','left_person']);
 expect(payrollHistoryRoster([{id:'other',isActive:false}],{},true)).toHaveLength(1);
});
