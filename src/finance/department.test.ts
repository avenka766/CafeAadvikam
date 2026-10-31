import {describe,it,expect} from 'vitest';
import {buildAuditFinance} from '@/audit/finance';
import {financeDepartmentData,financeLedgerRows} from './department';
import {financeWorkbook} from './workbook';
describe('Finance department records',()=>{
 it('counts paid expenses and advances once, excludes voids, and keeps handovers out of income',()=>{
  const rows=[{id:'expense',receipt_no:1,kind:'other_expense',amount:100,paid_on:'2026-10-24',branch:'SNB',snapshot:{payee:'Electricity office'}},{id:'void',receipt_no:2,kind:'other_expense',amount:80,paid_on:'2026-10-24',branch:'SNB',voided_at:'2026-10-24'},{id:'handover',receipt_no:3,kind:'branch_handover',amount:300,paid_on:'2026-10-24',branch:'SNB'},{id:'advance',receipt_no:4,kind:'employee_advance',amount:50,paid_on:'2026-10-24',branch:'SNB'}];
  const report=buildAuditFinance({finance_entries:{rows,status:'ready',error:''}},'2026-10-01','2026-10-31');
  expect(report.totals.paidOut).toBe(150);expect(report.totals.expenses).toBe(100);expect(report.totals.collected).toBe(0);expect(report.totals.sales).toBe(0);expect(report.entries.find(r=>r.sourceId==='expense')?.party).toBe('Electricity office');
 });
 it('preserves current all-date payable positions, filters branches and retains void history',()=>{
  const history=[{id:'v',kind:'other_expense',unit:'SNB',amount:80,voided_at:'2026-10-24',snapshot:{payee:'Vendor',bill_number:'V-1',category:'Water'}}];
  expect(financeLedgerRows(history)[0]).toMatchObject({party:'Vendor',bill_number:'V-1',status:'Voided',effective_amount:0});
  const data=financeDepartmentData({},[{id:'s',name:'Store supplier',balance:200,balance_verified:false}],[{id:'old',branch:'SNB',invoice:'SNB-OLD',balance:25,date:'2025-01-01'}],[],history,'2026-10-01','2026-10-24','SNB','2026-10-24');
  expect(data.payables).toHaveLength(1);expect(data.payables[0]).toMatchObject({invoice:'SNB-OLD',age_band:'Over 90 days',balance:25});expect(data.expenses[0].status).toBe('Voided');
 });
 it('exports detail sheets without counting handovers as sales and keeps missing-bill explanations',()=>{
  const history=[{id:'e',receipt:'FIN-2',kind:'other_expense',unit:'SNB',amount:12,snapshot:{payee:'Fixture',no_bill_reason:'No receipt supplied',category:'Transport'}}];const report=buildAuditFinance({},'2026-10-01','2026-10-24');
  const sheets=financeWorkbook({from:'2026-10-01',to:'2026-10-24',month:'2026-09',branch:'All',report,suppliers:[],payroll:[],history});
  expect(sheets).toHaveLength(30);expect(sheets.find(s=>s.name==='Other organization expenses')?.rows[0]).toMatchObject({party:'Fixture',no_bill_reason:'No receipt supplied',effective_amount:12});expect(sheets.find(s=>s.name==='Branch handovers')?.rows).toHaveLength(0);
 });
 it('labels exact organization supplier names as internal without changing their balances or guessing other vendors',()=>{
  const rows=[{id:'a',branch:'SNB',supplier:'VRSNB Foods LLP',balance:100},{id:'b',branch:'SNB',supplier:'VRSNB Foods Distributor',balance:50}];const report=financeDepartmentData({},[],rows,[],[],'2026-10-01','2026-10-24','All');
  expect(report.payables[0]).toMatchObject({account_type:'Internal organization',balance:100});expect(report.payables[1]).toMatchObject({account_type:'Supplier account',balance:50});
 });
});
