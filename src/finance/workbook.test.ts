import {describe,it,expect} from 'vitest';
import {financeWorkbook} from './workbook';
import {buildAuditFinance} from '@/audit/finance';
import {auditReference} from '@/audit/references';
import {previousPayrollMonth} from './data';
describe('Finance reports',()=>{
 it('uses the last completed calendar month and human Finance receipt numbers',()=>{expect(previousPayrollMonth('2026-10-24')).toBe('2026-09');expect(previousPayrollMonth('2026-01-01')).toBe('2025-12');expect(auditReference('finance_entries',{receipt_no:42},{})).toBe('FIN-42');});
 it('counts supplier and salary payments once and keeps balance adjustments out of money movement',()=>{
  const rows=[{id:'pay',kind:'supplier_payment',branch:'Store',paid_on:'2026-10-24',amount:100,receipt_no:1},{id:'salary',kind:'salary_payment',branch:'SNB',paid_on:'2026-10-24',amount:200,receipt_no:2},{id:'adjust',kind:'supplier_balance',branch:'Store',paid_on:'2026-10-24',amount:500,receipt_no:3}];
  const report=buildAuditFinance({finance_entries:{rows,status:'ready',error:''}},'2026-10-01','2026-10-31');
  expect(report.entries.reduce((n,r)=>n+r.cashOut,0)).toBe(300);expect(report.entries.reduce((n,r)=>n+r.expense,0)).toBe(200);expect(report.entries.reduce((n,r)=>n+r.revenue,0)).toBe(0);
 });
 it('exports separate scopes, original GRN numbers and payment allocations as numeric amounts',()=>{
  const report=buildAuditFinance({},'2026-10-01','2026-10-31');const sheets=financeWorkbook({from:'2026-10-01',to:'2026-10-31',month:'2026-09',branch:'SNB',report,suppliers:[{id:'supplier',name:'Supplier',balance:300,invoices:[{id:'grn',grn:'GSR-77',total:500,paid:200}]}],payroll:[{id:'e',branch:'SNB',net:100,status:'Paid'},{id:'f',branch:'VRSNB',net:200}],history:[{receipt:'FIN-1',unit:'SNB',party:'Supplier',kind:'supplier_payment',snapshot:{allocations:[{grn:'GSR-77',amount:200}]}}]});
  expect(sheets.length).toBe(30);expect(sheets.find(s=>s.name==='Monthly payroll')?.rows).toHaveLength(1);expect(sheets.find(s=>s.name==='Store GRNs current')?.rows[0]).toMatchObject({grn:'GSR-77',balance:300});expect(sheets.find(s=>s.name==='GRN payment allocations')?.rows[0]).toMatchObject({grn:'GSR-77',amount:200});
 });
});
