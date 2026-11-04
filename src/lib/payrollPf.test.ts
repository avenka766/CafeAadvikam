import {expect,it} from 'vitest';
import {payrollPf,payrollHistoryRoster} from './payrollPf';
it('uses 60% earnings, capped at 3000, from November while preserving earlier months',()=>{
 expect(payrollPf(10000,2026,11)).toBe(720);expect(payrollPf(5000,2026,11)).toBe(360);
 expect(payrollPf(100000,2026,11)).toBe(3000);expect(payrollPf(10000,2026,10)).toBe(1200);
 expect(()=>payrollPf(NaN)).toThrow();
});
it('retains archived people with monthly history without adding unrelated former employees',()=>{
 expect(payrollHistoryRoster([{id:'active'},{id:'left_person',isActive:false},{id:'other',isActive:false}],{'left_person_1':{}}).map(e=>e.id)).toEqual(['active','left_person']);
 expect(payrollHistoryRoster([{id:'other',isActive:false}],{},true)).toHaveLength(1);
});
