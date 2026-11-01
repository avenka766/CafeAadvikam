import {describe,it,expect} from 'vitest';
import {payrollWeekOffLimit} from './payrollWeekOff';
describe('monthly week-off allowance',()=>{
 it('uses six only in the approved November 2026 month',()=>{
  const employee={department:'ADMIN',weekOffOverrides:{'2026-11':6}};
  expect(payrollWeekOffLimit(employee,2026,11)).toBe(6);
  expect(payrollWeekOffLimit(employee,2026,10)).toBe(4);
  expect(payrollWeekOffLimit(employee,2026,12)).toBe(4);
  expect(payrollWeekOffLimit(employee,2027,11)).toBe(4);
 });
 it('preserves calendar-based Admin and normal department allowances',()=>{
  expect(payrollWeekOffLimit({department:'ADMIN'},2026,11)).toBe(5);
  expect(payrollWeekOffLimit({department:'ADMIN OFFICE STAFFS'},2026,10)).toBe(4);
  expect(payrollWeekOffLimit({department:'Packing'},2026,11)).toBe(4);
 });
 it('rejects invalid overrides and keeps the normal rule',()=>{
  expect(payrollWeekOffLimit({department:'ADMIN',weekOffOverrides:{'2026-11':6.5}},2026,11)).toBe(5);
 });
});
