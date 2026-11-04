import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({write:vi.fn()}));
vi.mock('@/lib/safeSpreadsheet',()=>({utils:{book_new:()=>({Sheets:{},SheetNames:[]}),aoa_to_sheet:(rows:unknown[])=>({rows}),book_append_sheet:(wb:any,sheet:any,name:string)=>{wb.Sheets[name]=sheet;wb.SheetNames.push(name);}},writeFile:m.write}));
import {calcSalary,exportExcel} from './AttendanceSalary';
it('exports actual PF and bank sheets for only the selected employees, retaining archived names',()=>{
 const e={id:'left_1',name:'Former employee',branch:'SNB' as const,department:'Packing',isActive:false,grossSalary:10000,salaryAdvance:0,uniformDeduction:0,otherDeduction:0,payrollYear:2026,payrollMonth:11};
 const d={deductAdvance:false,deductOther:false,deductUniform:false,deductESI:false,deductPF:true};
 const attendance=Object.fromEntries(Array.from({length:30},(_,i)=>[`${e.id}_${i+1}`,{present:true,half:false,woff:false,absent:false,bf:false,lunch:false,dinner:false}]));
 expect(calcSalary(e,attendance,30,d)).toMatchObject({earned:10000,pfDed:720,net:9280});
 exportExcel([e],attendance,{[e.id]:d},30,'November 2026',()=>d);
 const wb=m.write.mock.calls[0][0];const rows=wb.Sheets['Salary Summary'].rows;
 expect(rows.some((row:unknown[])=>row[1]==='Former employee'&&row[15]===720&&row[17]===9280)).toBe(true);
 expect(wb.SheetNames).toContain('Salary Summary');
});
