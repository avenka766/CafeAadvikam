import {expect,it} from 'vitest';
import {buildAuditDetails} from './details';
import {auditReference} from './references';
import {sortAuditRows} from './sorting';
import {auditWorkbook} from './export';
import {AUDIT_SOURCES,type AuditRaw,type AuditSnapshot} from './sources';
const snapshot=(parts:Record<string,AuditRaw[]>):AuditSnapshot=>Object.fromEntries(AUDIT_SOURCES.map(s=>[s.id,{rows:parts[s.id]||[],status:'ready',error:''}]));
it('keeps missing attendance unmarked and exposes salary deductions, inactive staff and contract teams',()=>{
 const s=snapshot({employees:[{id:'E1',name:'Test employee',branch:'Cafe Aadvikam',payment_mode:'Bala team',gross_salary:30000,is_active:false,created_at:'2026-09-01'}],attendance:[{id:'a1',employee_id:'E1',attendance_date:'2026-10-01',half:true,bf:true},{id:'a2',employee_id:'E1',attendance_date:'2026-10-02',absent:true}],contract_teams:[{id:'t',name:'Bala team'}],salary_records:[{id:'s',employee_id:'E1',year:2026,month:10,net_salary:10000,finalized:true}],salary_advances:[{id:'adv',employee_id:'E1',amount:100,given_date:'2026-10-01',cleared:false}],salary_deductions:[{id:'d',employee_id:'E1',year:2026,month:10,deduct_pf:true}]});
 const r=buildAuditDetails(s,'2026-10-01','2026-10-03');
 expect(r.attendanceSummary[0]).toMatchObject({employee:'Test employee',branch:'Cafe',halfDays:1,absentDays:1,payDays:.5,unmarkedDays:1});
 expect(r.salary[0]).toMatchObject({employee:'Test employee',period:'2026-10',status:'Finalized',net_salary:10000});
 expect(r.teams[0]).toMatchObject({people:1,activePeople:0,gross:0});expect(r.deductions[0].deduct_pf).toBe('Yes');expect(r.advances[0].status).toBe('Outstanding');
 expect(auditWorkbook(s,'2026-10-01','2026-10-03','All').find(x=>x.name==='Daily attendance')?.rows).toHaveLength(2);
});
it('deduplicates Hosur invoice mirrors and unified credit repayments without losing detail',()=>{
 const s=snapshot({branch_credits:[{id:'c',branch:'SNB',bill_no:'SNB-22',customer_name:'Buyer',subtotal:100,amount_paid:30,credit_amount:70,due_date:'2026-10-01',created_at:'2026-10-01'},{id:'h',branch:'Hosur',source:'hosur',source_id:'hb',subtotal:50,credit_amount:20}],hosur_credit:[{id:'hl',bill_id:'hb',balance_amount:20}],branch_payments:[{id:'p',branch:'SNB',bill_no:'SNB-22',credit_sale_id:'c',amount:30,payment_mode:'cash',created_at:'2026-10-02T01:00:00Z'}],credit_receipts:[{id:'p2',branch:'SNB',credit_sale_id:'c',amount:30,payment_mode:'cash',created_at:'2026-10-02T01:00:01Z'}],credit_invoices:[{id:'ci',bill_id:'CAFE-1',customer_name:'Cafe buyer',branch:'Cafe',invoice_total:80,allocated_paid:30,current_balance:50,issued_at:'2026-10-01'}]});
 const r=buildAuditDetails(s,'2026-10-01','2026-10-03','2026-10-03');expect(r.credit).toHaveLength(3);expect(r.payments).toHaveLength(1);expect(r.payments[0]).toMatchObject({customer:'Buyer',invoice:'SNB-22',amount:30});expect(r.credit[0].overdue).toBe('Overdue');expect(r.credit[2]).toMatchObject({invoice:'CAFE-1',balance:50});
});
it('uses real invoice/GSR numbers and labels stock balances without inventing a document',()=>{
 const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';const s=snapshot({dispatches:[{id,invoice_no:'TO/26-27/123'}]});
 expect(auditReference('stock_movements',{id:'m',reference_id:id},s)).toBe('TO/26-27/123');
 expect(auditReference('stock_movements',{id:'m',metadata:{gsr_no:'GSR-42'}},s)).toBe('GSR-42');
 expect(auditReference('stock_balances',{id,item_name:'Rusk'},s)).toBe('Current stock · Rusk');
 expect(auditReference('other',{id},s)).toBe('No document number recorded');
});
it('sorts the entire register numerically and naturally, with stable equal rows and empty values last',()=>{
 const rows=[{n:10,name:'Bill-10'},{n:2,name:'Bill-2'},{n:null,name:''},{n:10,name:'Bill-1'}];
 expect(sortAuditRows(rows,{key:'n',direction:'desc'},(r,k)=>r[k as 'n']).map(r=>r.n)).toEqual([10,10,2,null]);
 expect(sortAuditRows(rows,{key:'name',direction:'asc'},(r,k)=>r[k as 'name']).map(r=>r.name)).toEqual(['Bill-1','Bill-2','Bill-10','']);
 expect(rows[0].n).toBe(10);
});
