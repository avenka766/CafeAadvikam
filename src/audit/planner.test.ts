import {expect,it} from 'vitest';
import {buildAuditPlanner} from './planner';
import {AUDIT_SOURCES,type AuditRaw,type AuditSnapshot} from './sources';
const date='2026-10-22T04:00:00Z';
const snapshot=(parts:Record<string,AuditRaw[]>):AuditSnapshot=>Object.fromEntries(AUDIT_SOURCES.map(s=>[s.id,{rows:parts[s.id]||[],status:'ready',error:''}]));
it('links an advance and its cake to the exact TO and shows branch receipt details',()=>{
 const s=snapshot({branch_advances:[{id:'a',branch:'SNB',order_no:'SNB-ADV-1',customer_name:'Named buyer',subtotal:200,created_at:date}],cake_orders:[{id:'cake',branch:'SNB',source_order_id:'a',order_no:'SNB-ADV-1',order_value:200,created_at:date}],planner_orders:[{id:'p',notes:'SNB-ADV-1 | Buyer | 123 | Delivery 2026-10-22 14:00',dispatch_log:[{id:'d',quantity:2}]}],dispatches:[{id:'i',invoice_no:'TO/26-27/123',scope:'SNB',status:'paid',created_at:date,items:[{itemName:'Cake',quantity:2,unit:'pcs',rate:100,lineTotal:200}],dispatch_entry_ids:[{orderId:'p',dispatchEntryId:'d'}]}],branch_incoming:[{id:'in',invoice_no:'TO/26-27/123',advance_order_no:'SNB-ADV-1',item_name:'Cake',quantity:2,unit:'pcs',confirmed:true}]});
 const r=buildAuditPlanner(s,'2026-10-22','2026-10-22');expect(r.orders).toHaveLength(1);expect(r.orders[0]).toMatchObject({kind:'Advance / cake',invoice:'TO/26-27/123',value:200});expect(r.invoices[0].dispatchDetails).toContain('Received');expect(r.lines[0]).toMatchObject({invoice:'TO/26-27/123',order:'SNB-ADV-1',quantity:2,rate:100});
});
it('does not mix orders by matching item names or count a mirrored Sales invoice twice',()=>{
 const r=buildAuditPlanner(snapshot({branch_advances:[{id:'a',branch:'SNB',order_no:'SNB-ADV-1',items:[{itemName:'Cake'}],created_at:date}],planner_orders:[{id:'p',notes:'SNB-ADV-2 | Other buyer',dispatch_log:[{id:'d',isExtra:true}]}],planner_sales:[{id:'s',bill_no:'SALES/9',items:[],created_at:date}],dispatches:[{id:'i',invoice_no:'SALES/9',scope:'Sales',created_at:date},{id:'to',invoice_no:'TO/10',scope:'SNB',created_at:date,items:[{itemName:'Cake'}],dispatch_entry_ids:[{orderId:'p',dispatchEntryId:'d'}]}]}),'2026-10-22','2026-10-22');
 expect(r.invoices.filter(i=>i.invoice==='SALES/9')).toHaveLength(1);expect(r.orders[0].invoice).toBe('No linked invoice in selected range');expect(r.invoices.find(i=>i.invoice==='TO/10')!.order).toBe('—');
});
it('keeps real Hosur invoice numbers and paid Planner advance bill numbers',()=>{
 const r=buildAuditPlanner(snapshot({dispatches:[{id:'h',invoice_no:'HOSUR/12',scope:'Hosur',status:'paid',created_at:date}],planner_advances:[{id:'a',fy_seq:'SALES/13',created_at:date,paid_at:date,status:'paid',total:100}]}),'2026-10-22','2026-10-22');
 expect(r.invoices.map(i=>i.invoice)).toEqual(expect.arrayContaining(['HOSUR/12','SALES/13']));expect(r.orders[0].invoice).toBe('SALES/13');
});
