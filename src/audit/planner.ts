import type {AuditRaw,AuditSnapshot,AuditSourceId} from './sources';
import {auditDay} from './finance';
const arr=(value:unknown):AuditRaw[]=>Array.isArray(value)?value:[];
const itemName=(r:AuditRaw)=>r.itemName||r.item_name||r.name||r.menuItem?.name||'Item';
const itemsText=(items:unknown)=>arr(items).map(i=>`${itemName(i)} × ${i.quantity??i.qty??''} ${i.unit||i.sellUnit||''}`).join('; ');
const active=(r:AuditRaw)=>!/cancel|void|rejected/i.test(String(r.status));
const tag=(r:AuditRaw)=>/^([A-Za-z]+-ADV-\d+)\s*\|/.exec(String(r.notes||''))?.[1]||'';
export function buildAuditPlanner(snapshot:AuditSnapshot,from:string,to:string){
 const rows=(source:AuditSourceId)=>snapshot[source]?.rows||[];const within=(date:unknown)=>{const d=auditDay(date);return d&&d>=from&&d<=to;};
 const orderMap=new Map(rows('planner_orders').map(o=>[String(o.id),o]));const invoiceOrders=new Map<string,Set<string>>();
 const link=(invoice:string,order:string)=>{if(!invoice||!order)return;const set=invoiceOrders.get(invoice)||new Set<string>();set.add(order);invoiceOrders.set(invoice,set);};
 for(const incoming of rows('branch_incoming'))if(incoming.invoice_no&&incoming.advance_order_no)link(String(incoming.invoice_no),String(incoming.advance_order_no));
 for(const invoice of rows('dispatches'))for(const ref of arr(invoice.dispatch_entry_ids)){
  const order=orderMap.get(String(ref.orderId));const entry=arr(order?.dispatch_log).find(e=>e.id===ref.dispatchEntryId&&!e.isExtra);
  // Exact saved dispatch IDs only. Never associate orders just because item/customer names match.
  if(order&&entry)link(String(invoice.invoice_no),tag(order));
  const cake=rows('cake_orders').find(c=>String(c.id)===String(ref.orderId));if(cake)link(String(invoice.invoice_no),String(cake.order_no||cake.id));
 }
 const walkinNos=new Set(rows('planner_sales').map(r=>r.bill_no));const invoices:AuditRaw[]=[];const lines:AuditRaw[]=[];
 const addInvoice=(r:AuditRaw,type:string,invoice:string,source:string)=>{
  const incoming=rows('branch_incoming').filter(i=>i.invoice_no===invoice);const hosur=rows('hosur_bills').find(h=>h.invoice_no===invoice);
  const dispatchDetails=incoming.length?incoming.map(i=>`${i.item_name} × ${i.quantity} ${i.unit||''}: ${i.return_requested?'Return requested':i.disputed?'Disputed':i.confirmed?'Received':'Awaiting receipt'}`).join('; '):source==='planner_sales'?'Counter sale':type==='Hosur'?(hosur?`Hosur bill ${hosur.bill_no||hosur.invoice_no} · ${hosur.status||'Recorded'}`:'No receipt confirmation linked'):'No branch receipt linked in this scope';
  const itemRows=arr(r.items);invoices.push({id:`${source}:${r.id}`,date:auditDay(r.created_at),type,invoice,order:[...(invoiceOrders.get(invoice)||[])].join(', ')||'—',branch:r.scope||'Planner',customer:r.customer_name||r.hosur_shop_name||'',phone:r.customer_phone||r.customer_mobile||r.hosur_shop_phone||'',total:r.total,status:r.status||'Recorded',dispatchedBy:r.dispatched_by||r.cashier_name||'',items:itemsText(itemRows),dispatchDetails});
  itemRows.forEach((i,index)=>lines.push({id:`${source}:${r.id}:${index}`,date:auditDay(r.created_at),type,invoice,order:[...(invoiceOrders.get(invoice)||[])].join(', ')||'—',item:itemName(i),quantity:i.quantity??i.qty,unit:i.unit||i.sellUnit||'pcs',rate:i.rate??i.unitPrice??i.unit_price??i.price??i.menuItem?.price,amount:i.lineTotal??i.line_total??i.total,invoiceStatus:r.status||'Recorded',dispatchDetails}));
 };
 rows('planner_sales').forEach(r=>addInvoice(r,'Sales / Festival',String(r.bill_no),'planner_sales'));
 rows('planner_advances').filter(r=>r.status==='paid'&&active(r)&&within(r.paid_at)).forEach(r=>{link(String(r.fy_seq),String(r.fy_seq));addInvoice({...r,created_at:r.paid_at},'Planner advance settlement',String(r.fy_seq),'planner_advances');});
 rows('dispatches').filter(r=>!walkinNos.has(r.invoice_no)).forEach(r=>addInvoice(r,r.scope==='Hosur'?'Hosur':r.scope==='Sales'?'Sales / Festival':'Branch / cake TO',String(r.invoice_no),'dispatches'));
 const orders:AuditRaw[]=[];const seen=new Set<string>();
 const appendOrder=(r:AuditRaw,kind:string,number:string,value:unknown,source:string)=>{
  const linked=rows('dispatches').filter(i=>active(i)&&invoiceOrders.get(String(i.invoice_no))?.has(number));
  if(!within(r.created_at)&&!linked.length)return;
  const key=`${r.branch||'Planner'}:${number}`;if(seen.has(key)){const existing=orders.find(o=>o.key===key);if(existing&&kind==='Cake')existing.kind='Advance / cake';return;}seen.add(key);
  const receipts=rows('branch_incoming').filter(i=>linked.some(d=>d.invoice_no===i.invoice_no)&&(!i.advance_order_no||i.advance_order_no===number));
  const dispatchStatus=!linked.length?'No dispatch invoice linked':receipts.some(i=>i.return_requested)?'Return requested':receipts.some(i=>i.disputed)?'Receipt disputed':receipts.length&&receipts.every(i=>i.confirmed)?'Dispatched · received':receipts.length?'Dispatched · awaiting receipt':'Dispatch invoice issued';
  orders.push({id:`${source}:${r.id}`,key,kind,date:auditDay(r.created_at),branch:r.branch||'Planner',order:number,invoice:source==='planner_advances'&&r.status==='paid'?String(r.fy_seq):linked.map(i=>i.invoice_no).join(', ')||'No linked invoice in selected range',customer:r.customer_name||'',phone:r.customer_phone||r.mobile||'',value,advance:r.advance_amount,balance:r.balance_due??r.balance_amount,delivery:r.delivery_date,status:r.status||'Recorded',dispatchStatus,items:itemsText(r.items)||[r.flavor,r.cake_kg].filter(Boolean).join(' · '),dispatchDetails:linked.map(i=>`${i.invoice_no}: ${itemsText(i.items)} · ${auditDay(i.created_at)}`).join('\n')||'No linked dispatch in selected range'});
 };
 rows('branch_advances').forEach(r=>appendOrder(r,'Advance',String(r.order_no),r.subtotal,'branch_advances'));
 rows('cake_orders').forEach(r=>{const parent=rows('branch_advances').find(a=>String(a.id)===String(r.source_order_id)||a.order_no===r.order_no);appendOrder({...r,branch:parent?.branch||r.branch},'Cake',String(parent?.order_no||r.order_no||'Cake order without number'),parent?.subtotal??r.order_value,'cake_orders');});
 rows('planner_advances').forEach(r=>appendOrder(r,'Planner advance',String(r.fy_seq),r.total,'planner_advances'));
 return {invoices,lines,orders};
}
