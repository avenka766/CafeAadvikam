import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({write:vi.fn()}));
vi.mock('@/lib/safeSpreadsheet',()=>({utils:{book_new:()=>({Sheets:{},SheetNames:[]}),aoa_to_sheet:(rows:unknown[])=>({rows}),book_append_sheet:(wb:any,sheet:any,name:string)=>{wb.Sheets[name]=sheet;wb.SheetNames.push(name);}},writeFile:m.write}));
import {calcSalary,exportExcel,exportAttendanceExcel,exportAdvanceExcel} from './AttendanceSalary';
it('exports actual PF and bank sheets for only the selected employees, retaining archived names',()=>{
 const e={id:'left_1',name:'Former employee',branch:'SNB' as const,department:'Packing',isActive:false,grossSalary:10000,salaryAdvance:0,uniformDeduction:0,otherDeduction:0,payrollYear:2026,payrollMonth:12};
 const d={deductAdvance:false,deductOther:false,deductUniform:false,deductESI:false,deductPF:true};
 const attendance=Object.fromEntries(Array.from({length:31},(_,i)=>[`${e.id}_${i+1}`,{present:true,half:false,woff:false,absent:false,bf:false,lunch:false,dinner:false}]));
 expect(calcSalary(e,attendance,31,d)).toMatchObject({earned:10000,pfDed:720,net:9280});
 exportExcel([e],attendance,{[e.id]:d},31,'December 2026',()=>d);
 const wb=m.write.mock.calls[0][0];const rows=wb.Sheets['Salary Summary'].rows;
 const headers: string[] = rows.find((row: string[]) => row.includes('Net Payable'));
 const employee: unknown[] = rows.find((row: unknown[]) => row[1] === 'Former employee');
 expect(employee[headers.indexOf('PF (12%)')]).toBe(720);
 expect(employee[headers.indexOf('Net Payable')]).toBe(9280);
 expect(employee[headers.indexOf('Days Absent')]).toBe(0);
 expect(wb.SheetNames).toContain('Salary Summary');
});
it('includes the right team on every sheet and a filterable roster across all three exports',()=>{
 m.write.mockClear();
 const base={id:'a',name:'Same name',branch:'SNB' as const,department:'Packing',grossSalary:10000,salaryAdvance:100,uniformDeduction:0,otherDeduction:0,payrollYear:2026,payrollMonth:11};
 const employees=[{...base,paymentMode:'Bala team'},{...base,id:'b',paymentMode:'Bittu team'}, {...base,id:'c',name:'Direct employee',paymentMode:''}];
 const d={deductAdvance:false,deductOther:false,deductUniform:false,deductESI:false,deductPF:true};
 const att=Object.fromEntries(employees.map(e=>[`${e.id}_1`,{present:true,half:false,woff:false,absent:false,bf:true,lunch:false,dinner:false}]));
 exportExcel(employees,att,{},30,'November 2026',()=>d);
 exportAttendanceExcel(employees,att,{},30,'November 2026',()=>d);
 exportAdvanceExcel(employees,employees.map((e,i)=>({id:`advance${i}`,employeeId:e.id,amount:100,givenDate:'2026-11-01',cleared:false})),'November 2026');
 for(const [wb] of m.write.mock.calls){
  expect(wb.SheetNames).toContain('Contract Teams');
  for(const name of wb.SheetNames){
   const sheet=wb.Sheets[name],filter=sheet['!autofilter'];expect(filter).toBeTruthy();
   expect(sheet.rows[filter.startRow][filter.endColumn]).toBe('Contract Team');
   const teamValues=sheet.rows.slice(filter.startRow+1,filter.endRow+1).map((r:unknown[])=>r[filter.endColumn]);
   expect(teamValues).toContain('Bala team');expect(teamValues).toContain('Bittu team');expect(teamValues).toContain('Direct');
   expect(sheet.rows[filter.endRow+1]?.[1]).not.toBe('Direct employee');
  }
 }
});

it('applies only food to unpaid November salaries and retains paid snapshots', () => {
  const employee = { id: 'a', name: 'Employee', branch: 'SNB' as const, department: 'Packing',
    grossSalary: 18000, salaryAdvance: 100, recordedAdvanceDeduction: 100, uniformDeduction: 20,
    otherDeduction: 30, payrollYear: 2026, payrollMonth: 11 };
  const attendance = { a_1: { present: true, half: false, woff: false, absent: false, bf: true, lunch: false, dinner: false } };
  const decisions = { deductAdvance: true, deductUniform: true, deductOther: true, deductESI: true, deductPF: true };
  expect(calcSalary(employee, attendance, 30, decisions)).toMatchObject({
    earned: 600, totalDed: 10, net: 590, advanceDed: 0, uniformDed: 0, otherDed: 0, esiDed: 0, pfDed: 0,
  });
  const paidSalary = { present: 1, half: 0, week_off: 0, earned: 600, canteen: 10,
    advance: 100, uniform: 20, other: 0, esi: 0, pf: 0, deductions: 130, net: 470 };
  expect(calcSalary({ ...employee, paidSalary }, attendance, 30, decisions)).toMatchObject({
    totalDed: 130, net: 470, advanceDed: 100, uniformDed: 20,
  });
});
