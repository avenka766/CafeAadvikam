import {describe,it,expect} from 'vitest';
import {buildAuditFinance} from './finance';
import {AUDIT_SOURCES,type AuditSnapshot,type AuditRaw} from './sources';
import {auditWorkbook} from './export';
const date='2026-10-22T05:00:00Z';const range=['2026-10-22','2026-10-22'] as const;
const snapshot=(parts:Record<string,AuditRaw[]>):AuditSnapshot=>Object.fromEntries(AUDIT_SOURCES.map(s=>[s.id,{rows:parts[s.id]||[],status:'ready',error:''}]));
const bill=(id:string,total:number,patch:AuditRaw={})=>({id,branch:'SNB',bill_no:'SNB-'+id,total,status:'original',created_at:date,...patch});
it('matches every invoice in a cumulative Hosur bill without adding another sale',()=>{
 const r=buildAuditFinance(snapshot({dispatches:[{id:'d1',scope:'Hosur',invoice_no:'SALES/1',total:20,status:'paid',created_at:date},{id:'d2',scope:'Hosur',invoice_no:'SALES/2',total:30,status:'paid',created_at:date}],hosur_bills:[{id:'h',invoice_no:'SALES/1, SALES/2',subtotal:50,paid_amount:0,credit_amount:50,created_at:date}]}),...range);
 expect(r.totals.sales).toBe(50);expect(r.issues.filter(i=>i.source==='hosur_bills')).toEqual([]);
});
it('identifies only the missing Hosur link and labels its business unit',()=>{
 const r=buildAuditFinance(snapshot({dispatches:[{id:'d1',scope:'Hosur',invoice_no:'SALES/1',total:20,status:'paid',created_at:date}],hosur_bills:[{id:'h',invoice_no:'SALES/1, SALES/OLD',subtotal:50,credit_amount:50,created_at:date}]}),...range);
 const issue=r.issues.find(i=>i.source==='hosur_bills')!;expect(issue.branch).toBe('Hosur');expect(issue.message).toContain('SALES/OLD');expect(issue.message).not.toContain('SALES/1');
});
it('excludes legacy balances already finalized or cancelled in the main register without inventing receipts',()=>{
 const base={branch:'SNB',subtotal:100,balance_due:60,status:'pending',created_at:date};
 const r=buildAuditFinance(snapshot({branch_advances:[{...base,id:'final',finalized_in_main:true},{...base,id:'cancelled',cancelled_in_main:true},{...base,id:'open'}]}),...range);
 expect(r.totals.outstanding).toBe(60);expect(r.totals.collected).toBe(0);expect(r.totals.sales).toBe(0);
});
it('separates credit reduction from money refunded on a sales return',()=>{
 const r=buildAuditFinance(snapshot({branch_returns:[{id:'r',branch:'SNB',return_no:'SNB-RET-1',amount:60,refund_amount:10,credit_adjusted:50,payment_mode:'cash',created_at:date}]}),...range);
 const row=r.entries.find(e=>e.category==='Refunds')!;expect(row.revenue).toBe(-60);expect(row.cashOut).toBe(10);
});
it('treats an advance cancellation as returned money rather than negative sales',()=>{
 const r=buildAuditFinance(snapshot({branch_returns:[{id:'r',branch:'SNB',return_no:'SNB-ADV-REF-1',amount:100,payment_mode:'cash',created_at:date}]}),...range);
 const row=r.entries.find(e=>e.category==='Refunds')!;expect(row.revenue).toBe(0);expect(row.cashOut).toBe(100);
});
it('counts the actual partial credit refund only once when a payment mirror exists',()=>{
 const r=buildAuditFinance(snapshot({branch_returns:[{id:'r',branch:'SNB',bill_no:'SNB-1',return_no:'SNB-RET-1',amount:60,refund_amount:10,credit_adjusted:50,payment_mode:'cash',created_at:date}],branch_payments:[{id:'p',branch:'SNB',bill_no:'SNB-1',amount:10,payment_mode:'cash',payment_purpose:'refund',created_at:date}]}),...range);
 expect(r.totals.paidOut).toBe(10);
});
describe('Audit finance reconciliation',()=>{
 it('counts branch credit sales as revenue, returns once, and receipt mirrors once',()=>{
  const data=snapshot({branch_bills:[bill('1',100),bill('2',200,{bill_type:'credit'}),bill('3',20,{bill_type:'return',source:'return',bill_no:'SNB-RET-1'})],branch_returns:[{id:'return',branch:'SNB',bill_no:'SNB-1',return_no:'SNB-RET-1',amount:20,payment_mode:'cash',created_at:date}],branch_payments:[{id:'p',branch:'SNB',credit_sale_id:'credit',amount:50,payment_mode:'cash',payment_purpose:'credit_settlement',created_at:date}],credit_receipts:[{id:'p2',branch:'SNB',credit_sale_id:'credit',amount:50,payment_mode:'cash',created_at:date}]});
  const r=buildAuditFinance(data,...range);expect(r.totals.sales).toBe(280);expect(r.totals.collected).toBe(50);expect(r.totals.paidOut).toBe(20);
 });
 it('does not count TO, cake job values or deposits as external sales or expenses',()=>{
  const r=buildAuditFinance(snapshot({dispatches:[{id:'d',scope:'SNB',invoice_no:'TO/1',total:500,status:'paid',created_at:date}],cake_orders:[{id:'c',branch:'SNB',order_value:1200,created_at:date,status:'accepted'}],snb_deposits:[{id:'bank',amount:700,deposit_date:'2026-10-22'}]}),...range);
  expect(r.totals.sales).toBe(0);expect(r.totals.expenses).toBe(0);expect(r.totals.paidOut).toBe(0);expect(r.totals.stockSupplied).toBe(500);expect(r.totals.cakeOrderValue).toBe(1200);
 });
 it('keeps cafe balance receipts separate from original sales and counts credit sales',()=>{
  const r=buildAuditFinance(snapshot({cafe_orders:[{id:'o',order_number:1,total:100,full_amount:100,status:'served',payment_type:'advance',advance_amount:40,created_at:date},{id:'b',order_number:2,total:60,status:'served',payment_type:'cash',order_source:'balance',created_at:date},{id:'c',order_number:3,total:200,status:'served',payment_type:'credit',created_at:date}]}),...range);
  expect(r.totals.sales).toBe(300);expect(r.totals.collected).toBe(100);
 });
 it('recognizes Planner advance revenue only at final payment and includes old-order collections',()=>{
  const r=buildAuditFinance(snapshot({planner_advances:[{id:'a',total:1000,advance_amount:300,balance_amount:0,status:'paid',created_at:'2026-10-01T05:00:00Z',paid_at:date},{id:'b',total:600,advance_amount:100,balance_amount:500,status:'advance',created_at:date}]}),...range);
  expect(r.totals.sales).toBe(1000);expect(r.totals.collected).toBe(800);expect(r.totals.advanceOrderValue).toBe(600);expect(r.totals.outstanding).toBe(500);
 });
 it('does not double count purchase-register copies or duplicate invoice headers',()=>{
  const r=buildAuditFinance(snapshot({branch_bills:[bill('a',100,{bill_no:'SNB-1'}),bill('b',100,{bill_no:'SNB-1'})],snb_purchases:[{id:'pi',invoice_number:'I-1',total_amount:200,paid_amount:200,balance_amount:0,invoice_date:'2026-10-22'}],operations:[{id:'op',branch:'SNB',record_type:'purchase_invoice',payload:{dbId:'pi',invoiceNo:'I-1',total:200},created_at:date}]}),...range);
  expect(r.totals.sales).toBe(100);expect(r.totals.purchases).toBe(200);expect(r.totals.payables).toBe(0);expect(r.issues.some(i=>i.message.includes('Duplicate'))).toBe(true);
 });
 it('keeps Hosur credit mirrors out of consolidated receivables',()=>{
  const r=buildAuditFinance(snapshot({branch_credits:[{id:'c',branch:'Hosur',source:'hosur',source_id:'hb',credit_amount:300,status:'pending'}],hosur_credit:[{id:'hc',bill_id:'hb',balance_amount:300}]}),...range);expect(r.totals.outstanding).toBe(300);
 });
 it('retains missing bill references as exceptions rather than invented sales',()=>{
  const r=buildAuditFinance(snapshot({bill_references:[{id:'op',branch:'SNB',record_no:'SNB-999',amount:80,created_at:date}]}),...range);expect(r.totals.sales).toBe(0);expect(r.issues[0].severity).toBe('Missing');
 });
 it('exports every source row past 1000 and splits long JSON without loss',()=>{
  const rows=Array.from({length:1201},(_,i)=>({id:String(i),bill_no:'SALES/'+i,total:1,payment_mode:'cash',created_at:date,status:'active',notes:i===0?'x'.repeat(65000):''}));
  const sheets=auditWorkbook(snapshot({planner_sales:rows}),...range,'All');expect(sheets.find(s=>s.name==='planner_sales')!.rows).toHaveLength(1201);const parts=sheets.find(s=>s.name==='Original JSON 1')!.rows.filter(r=>r.source==='planner_sales'&&r.id==='0');expect(JSON.parse(parts.map(p=>p.json).join('')).notes).toHaveLength(65000);
 });
 it('uses IST dates including the final evening of the selected date',()=>{
  const r=buildAuditFinance(snapshot({planner_advances:[{id:'a',total:500,advance_amount:100,status:'advance',created_at:'2026-10-21T19:00:00Z'}]}),...range);expect(r.totals.collected).toBe(100);
 });
});

it('includes an old external-invoice collection without counting the sale again',()=>{
 const r=buildAuditFinance(snapshot({dispatches:[{id:'old',scope:'Sales',invoice_no:'SALES/OLD',total:100,status:'paid',created_at:'2026-10-21T05:00:00Z',paid_at:date}]}),...range);expect(r.totals.sales).toBe(0);expect(r.totals.collected).toBe(100);expect(r.daily[0].day).toBe('2026-10-22');
});
it('keeps recorded receipts on cancelled bills visible for money reconciliation',()=>{
 const r=buildAuditFinance(snapshot({branch_bills:[bill('c',100,{status:'cancelled'})],branch_payments:[{id:'p',branch:'SNB',bill_no:'SNB-c',amount:100,payment_mode:'cash',created_at:date}]}),...range);expect(r.totals.sales).toBe(0);expect(r.totals.collected).toBe(100);expect(r.issues.some(x=>x.message.includes('cancelled'))).toBe(true);
});
it('preserves GST for inclusive and exclusive marked sales lines',()=>{
 const r=buildAuditFinance(snapshot({planner_sales:[{id:'i',bill_no:'SALES/I',subtotal:105,total:105,status:'active',is_gst_invoice:true,items:[{lineTotal:105,gstPct:5}],created_at:date},{id:'e',bill_no:'SALES/E',subtotal:100,total:105,status:'active',is_gst_invoice:true,items:[{lineTotal:100,gstPct:5,gstPricing:'exclusive'}],created_at:date}]}),...range);expect(r.totals.tax).toBe(10);
});

it('exposes tax documents, closure variances and salary schedules without double-counting income or expenses',()=>{
 const r=buildAuditFinance(snapshot({tax_invoices:[{id:'tax',invoice_no:'GST/1',invoice_date:'2026-10-22',total:105,buyer_name:'Named buyer'}],branch_closures:[{id:'cl',branch:'SNB',closure_date:'2026-10-22',difference:-50}],salary_records:[{id:'sal',employee_id:'e',year:2026,month:10,net_salary:10000}]}),...range);
 expect(r.totals.sales).toBe(0);expect(r.totals.expenses).toBe(0);expect(r.issues.some(i=>i.source==='tax_invoices')).toBe(true);expect(r.issues.some(i=>i.source==='branch_closures'&&i.amount===-50)).toBe(true);expect(r.entries.map(e=>e.category)).toEqual(expect.arrayContaining(['Cash closures','Tax invoices','Payroll']));
});
