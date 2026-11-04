import {auditReference} from './references';
import type {AuditRaw,AuditSnapshot,AuditSourceId} from './sources';
export type AuditCategory='Sales'|'Receipts'|'Refunds'|'Expenses'|'Purchases'|'Supplier payments'|'Advances'|'Cake orders'|'Stock supplied'|'Bank transfers'|'Credit balances'|'Stock'|'Reference'|'Cash closures'|'Tax invoices'|'Payroll';
export type AuditEntry={id:string;source:AuditSourceId;sourceId:string;branch:string;category:AuditCategory;date:string;reference:string;party:string;status:string;mode:string;amount:number;revenue:number;cashIn:number;cashOut:number;purchase:number;expense:number;tax:number;orderValue:number;outstanding:number;payable:number;items:AuditRaw[];raw:AuditRaw};
export type AuditIssue={severity:'Review'|'Missing'|'Mismatch';branch:string;reference:string;source:string;message:string;amount?:number};
export const isAuditSalesEntry=(entry:AuditEntry)=>['Sales','Receipts','Refunds','Credit balances'].includes(entry.category)||entry.revenue!==0||entry.cashIn!==0;
const val=(r:AuditRaw,...keys:string[])=>{for(const key of keys)if(r[key]!=null&&r[key]!=='')return r[key];return undefined;};
const text=(r:AuditRaw,...keys:string[])=>String(val(r,...keys)??'');
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const cancelled=(r:AuditRaw)=>/cancel|void|deleted|rejected/i.test(text(r,'status'));
const istFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
const istDay=(value:unknown)=>{const s=String(value??'');if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return Number.isFinite(d.getTime())?istFormatter.format(d):'';};
export const auditDay=istDay;
export function buildAuditFinance(snapshot:AuditSnapshot,from:string,to:string){
 const entries:AuditEntry[]=[];const issues:AuditIssue[]=[];const data=(source:AuditSourceId)=>snapshot[source]?.rows||[];
 const within=(date:unknown)=>{const day=istDay(date);return !!day&&day>=from&&day<=to;};
 const issue=(source:string,r:AuditRaw,message:string,severity:AuditIssue['severity']='Review',amount?:number)=>issues.push({source,branch:text(r,'branch','scope')||(source.startsWith('hosur_')?'Hosur':source.startsWith('snb_')?'SNB':source.startsWith('vrsnb_')?'VRSNB':source.startsWith('store_')?'Store':source.startsWith('planner_')?'Planner':'Business'),reference:auditReference(source,r,snapshot),message,severity,amount});
 const add=(source:AuditSourceId,r:AuditRaw,category:AuditCategory,patch:Partial<AuditEntry>={})=>{
  const e:AuditEntry={id:source+':'+r.id+':'+entries.length,source,sourceId:String(r.id),branch:text(r,'branch','scope')||'Business',category,date:text(r,'created_at','invoice_date','delivery_date','given_date'),reference:auditReference(source,r,snapshot),party:text(r,'customer_name','supplier_name','shop_name','hosur_shop_name','salesperson','entered_by','created_by'),status:text(r,'status'),mode:text(r,'payment_mode','payment_method','payment_type'),amount:num(val(r,'total','total_amount','amount','grand_total','subtotal')),revenue:0,cashIn:0,cashOut:0,purchase:0,expense:0,tax:0,orderValue:0,outstanding:0,payable:0,items:Array.isArray(r.items)?r.items:Array.isArray(r.line_items)?r.line_items:[],raw:r,...patch};entries.push(e);return e;
 };
 const unique=(source:AuditSourceId,key:(r:AuditRaw)=>string)=>{const map=new Map<string,AuditRaw>();for(const r of [...data(source)].sort((a,b)=>text(b,'updated_at','created_at').localeCompare(text(a,'updated_at','created_at'))||String(a.id).localeCompare(String(b.id)))){const k=key(r);if(map.has(k)){issue(source,r,'Duplicate business reference: only the latest record is counted; all originals remain in source sheets.','Review',num(r.total));continue;}map.set(k,r);}return [...map.values()];};
 for(const r of data('finance_entries')){
  const cost=['salary_payment','other_expense'].includes(String(r.kind));const paid=cost||['supplier_payment','employee_advance'].includes(String(r.kind));
  add('finance_entries',r,cost?'Expenses':r.kind==='supplier_payment'?'Supplier payments':r.kind==='branch_handover'?'Bank transfers':r.kind==='employee_advance'?'Payroll':'Reference',{date:String(r.paid_on),reference:r.receipt_no!=null?`FIN-${r.receipt_no}`:String(r.reference),party:String(r.party||r.snapshot?.payee||r.snapshot?.name||''),mode:String(r.mode),status:r.voided_at?'Voided':'Recorded',amount:num(r.amount),cashOut:paid&&!r.voided_at?num(r.amount):0,expense:cost&&!r.voided_at?num(r.amount):0});
 }
 const headerRows=unique('branch_bills',r=>`${r.branch}:${r.bill_no}`);const headers=new Map(headerRows.map(r=>[`${r.branch}:${r.bill_no}`,r]));
 const returns=data('branch_returns');const returnNos=new Set(returns.map(r=>`${r.branch}:${r.return_no}`));
 const branchItems=new Map<string,AuditRaw[]>();for(const i of data('branch_items')){const key=String(i.bill_id);branchItems.set(key,[...(branchItems.get(key)||[]),i]);}
 for(const r of headerRows){
  const isReturn=r.bill_type==='return'||r.source==='return'||/\bRET[-/]/i.test(String(r.bill_no));
  const active=!cancelled(r)&&!isReturn;const total=num(r.total);const items=branchItems.get(String(r.id))||[];
  add('branch_bills',r,isReturn?'Reference':'Sales',{revenue:active?total:0,tax:active?num(r.tax):0,items});
  if(active&&!items.length&&total!==0)issue('branch_bills',r,'No item rows found for this bill. Bill total is retained; item analysis is incomplete.','Missing',total);
  if(isReturn&&!returnNos.has(`${r.branch}:${r.bill_no}`)&&!cancelled(r)){issue('branch_bills',r,'Legacy return is present only in bill headers; deducted once and shown separately.');add('branch_bills',r,'Refunds',{revenue:-Math.abs(total),amount:Math.abs(total)});}
 }
 for(const r of unique('branch_returns',r=>`${r.branch}:${r.return_no||r.id}`)){const amount=Math.abs(num(r.amount));add('branch_returns',r,'Refunds',{reference:text(r,'return_no'),party:`Original ${text(r,'bill_no')}`,revenue:/-ADV-REF-/i.test(text(r,'return_no'))?0:-amount,cashOut:/cash|upi|card|bank/i.test(text(r,'payment_mode'))?Math.abs(num(r.refund_amount??r.amount)):0,amount});}
 for(const r of data('branch_payments')){
  const mode=text(r,'payment_mode');const refund=/refund/i.test(text(r,'payment_purpose'));const nonCash=/credit|wallet|advance_adjust/i.test(mode);const amount=num(r.amount);
  const original=headers.get(`${r.branch}:${r.bill_no}`);const valid=!cancelled(r);
  const coveredRefund=refund&&returns.some(x=>x.branch===r.branch&&x.bill_no===r.bill_no&&Math.abs(num(x.refund_amount??x.amount)-Math.abs(amount))<0.01);
  add('branch_payments',r,'Receipts',{cashIn:valid&&!refund&&!nonCash?Math.max(0,amount):0,cashOut:valid&&refund&&!coveredRefund&&!nonCash?Math.abs(amount):0});
  if(original&&cancelled(original))issue('branch_payments',r,'Receipt links to a cancelled bill. Recorded money movement is retained; review its reversal or refund.');
 }
 // Dedicated receipt tables can contain older payments absent from the unified register.
 for(const source of ['credit_receipts','advance_receipts'] as const)for(const r of data(source)){
  const parentKey=source==='credit_receipts'?'credit_sale_id':'advance_order_id';
  const mirror=data('branch_payments').some(p=>p.branch===r.branch&&p[parentKey]===r[parentKey]&&Math.abs(num(p.amount)-num(r.amount))<0.01&&Math.abs(Date.parse(p.created_at)-Date.parse(r.created_at))<60000);
  if(!mirror){const refund=/refund/.test(String(r.payment_stage||r.payment_purpose));const cash=!/credit|wallet/.test(String(r.payment_mode));add(source,r,'Receipts',{cashIn:cash&&!refund?num(r.amount):0,cashOut:cash&&refund?num(r.amount):0});}
 }
 for(const r of data('cafe_orders')){
  const active=!cancelled(r)&&['served','running'].includes(String(r.status));const balance=r.order_source==='balance';const paid=active&&!/unpaid/i.test(text(r,'payment_type'));
  const total=num(val(r,'full_amount','total'));const revenue=active&&!balance&&r.status==='served'?total:0;
  const breakdown=r.payment_breakdown;const mode=text(r,'payment_type');
  let received=paid?(breakdown?num(breakdown.cash)+num(breakdown.upi)+num(breakdown.card):mode==='advance'?num(r.advance_amount):/credit|wallet/.test(mode)?0:num(r.total)):0;
  if(mode==='part_payment'&&!breakdown){received=0;issue('cafe_orders',r,'Split-payment details are missing. Cash collection was not guessed.','Missing');}
  add('cafe_orders',r,balance?'Receipts':'Sales',{branch:'Cafe',reference:String(r.order_number),revenue,cashIn:received,tax:revenue?num(r.gst_amount):0,outstanding:active&&!data('branch_credits').some(c=>String(c.source_id)===String(r.id))?num(r.balance_due):0,amount:balance?num(r.total):total});
 }
 const walkin=unique('planner_sales',r=>String(r.bill_no));const salesNumbers=new Set(walkin.map(r=>String(r.bill_no)));
 for(const r of walkin){const active=!cancelled(r);const subtotal=num(r.subtotal);const discount=num(r.discount_amount);const total=num(r.total);const exclusive=r.is_gst_invoice&&(r.items||[]).some((i:AuditRaw)=>i.gstPricing==='exclusive');const tax=r.is_gst_invoice?(r.items||[]).filter((i:AuditRaw)=>i.unit!=='charge').reduce((sum:number,i:AuditRaw)=>{const taxable=num(i.lineTotal)*(subtotal>0?Math.max(0,subtotal-discount)/subtotal:0);const rate=num(i.gstPct);return sum+(i.gstPricing==='exclusive'?taxable*rate/100:taxable*rate/(100+rate));},0):0;
  add('planner_sales',r,'Sales',{branch:'Planner',revenue:active?total:0,cashIn:active&&/cash|upi|card|bank/i.test(text(r,'payment_mode'))?total:0,tax:active?money(tax):0});
 }
 const dispatch=unique('dispatches',r=>String(r.invoice_no));const hosurLedger=new Map(data('hosur_credit').map(r=>[String(r.bill_id),r]));
 for(const r of dispatch){const internal=['SNB','VRSNB','Cake'].includes(String(r.scope));const active=!cancelled(r);const duplicate=!internal&&salesNumbers.has(String(r.invoice_no));
  add('dispatches',r,internal?'Stock supplied':within(r.created_at)?'Sales':'Receipts',{date:within(r.created_at)?String(r.created_at):String(r.paid_at),branch:r.scope==='Hosur'?'Hosur':r.scope==='Cake'?'Planner':internal?String(r.scope):'Planner',reference:String(r.invoice_no),revenue:active&&!internal&&!duplicate&&within(r.created_at)?num(r.total):0,cashIn:active&&!internal&&!duplicate&&r.scope!=='Hosur'&&r.status==='paid'&&within(r.paid_at||r.created_at)?num(r.total):0});
  if(duplicate)issue('dispatches',r,'Invoice also exists in Planner sales; counted once from the Sales bill.');
 }
 const dispatchNos=new Set(dispatch.map(r=>String(r.invoice_no)));
 for(const r of data('hosur_bills')){const ledger=hosurLedger.get(String(r.id));const initial=ledger?Math.max(0,num(r.subtotal)-num(ledger.opening_amount)):num(r.credit_amount)===0&&data('hosur_collections').every(p=>p.bill_id!==r.id)?num(r.paid_amount):0;
  add('hosur_bills',r,'Reference',{branch:'Hosur',cashIn:!cancelled(r)&&within(r.confirmed_at||r.created_at)?initial:0,reference:text(r,'invoice_no','bill_no')});
  const references=String(r.invoice_no||'').split(',').map(value=>value.trim()).filter(Boolean);
  const missing=references.filter(reference=>!dispatchNos.has(reference));
  if(!cancelled(r)&&(!references.length||missing.length))issue('hosur_bills',r,`Linked dispatch reference${missing.length===1?'':'s'} not loaded in this date range${missing.length?': '+missing.join(', '):''}. Review invoice date/link; this reference is not added as a second sale.`,'Review',num(r.subtotal));
 }
 for(const r of data('hosur_collections'))add('hosur_collections',r,'Receipts',{branch:'Hosur',cashIn:num(r.amount_collected),amount:num(r.amount_collected)});
 for(const r of data('credit_payments'))add('credit_payments',r,'Receipts',{branch:'Cafe',date:text(r,'paid_at'),cashIn:cancelled(r)?0:num(r.amount)});
 for(const r of data('branch_credits'))add('branch_credits',r,'Credit balances',{outstanding:cancelled(r)||/settled/.test(String(r.status))?0:num(r.credit_amount),amount:num(r.credit_amount)});
 for(const r of data('hosur_credit'))add('hosur_credit',r,'Credit balances',{branch:'Hosur',outstanding:cancelled(r)||data('branch_credits').some(c=>c.source==='hosur'&&String(c.source_id)===String(r.bill_id))?0:num(r.balance_amount),amount:num(r.balance_amount)});
 for(const r of data('branch_advances'))add('branch_advances',r,'Advances',{orderValue:within(r.created_at)&&!cancelled(r)?num(r.subtotal):0,outstanding:cancelled(r)||r.finalized_in_main||r.cancelled_in_main||r.status==='completed'?0:num(r.balance_due),amount:num(r.subtotal)});
 for(const r of data('planner_advances')){const active=!cancelled(r);const initial=within(r.created_at);const final=r.status==='paid'&&within(r.paid_at);const advance=num(r.advance_amount);const total=num(r.total);
  add('planner_advances',r,'Advances',{branch:'Planner',reference:String(r.fy_seq),amount:total,orderValue:active&&initial?total:0,revenue:active&&final?total:0,cashIn:active?(initial?advance:0)+(final?Math.max(0,total-advance):0):0,outstanding:active&&r.status!=='paid'?num(r.balance_amount):0,date:final?String(r.paid_at):String(r.created_at)});
 }
 for(const r of data('cake_orders'))add('cake_orders',r,'Cake orders',{amount:num(r.order_value),orderValue:within(r.created_at)&&!cancelled(r)?num(r.order_value):0});
 const purchaseIds=new Set<string>();const purchaseRefs=new Set<string>();
 for(const source of ['snb_purchases','vrsnb_purchases','store_purchases'] as const)for(const r of data(source)){
  const branch=source==='snb_purchases'?'SNB':source==='store_purchases'?'Store':r.branch||'VRSNB';const amount=num(val(r,'total_amount','grand_total'));purchaseIds.add(String(r.id));purchaseRefs.add(`${branch}:${r.invoice_number}`);
  add(source,r,'Purchases',{branch,amount,purchase:cancelled(r)?0:amount,payable:cancelled(r)?0:Math.max(0,r.balance_amount!=null?num(r.balance_amount):amount-num(r.paid_amount)),items:source==='snb_purchases'?data('snb_purchase_items').filter(i=>String(i.purchase_invoice_id)===String(r.id)):source==='vrsnb_purchases'?data('vrsnb_purchase_items').filter(i=>String(i.invoice_id)===String(r.id)):Array.isArray(r.line_items)?r.line_items:[],date:text(r,'invoice_date','delivery_date','created_at')});
  if(/pending_review|draft/i.test(text(r,'status','purchase_status')))issue(source,r,'Purchase invoice awaits review; included as a recorded purchase, not an approved expense.');
 }
 for(const source of ['snb_supplier_payments','vrsnb_supplier_payments'] as const)for(const r of data(source))add(source,r,'Supplier payments',{branch:source==='snb_supplier_payments'?'SNB':r.branch||'VRSNB',cashOut:num(r.amount),date:text(r,'payment_date','created_at')});
 for(const r of data('purchase_returns'))add('purchase_returns',r,'Purchases',{branch:'SNB',amount:-num(r.total_amount),purchase:cancelled(r)?0:-num(r.total_amount),date:text(r,'return_date','created_at')});
 for(const r of data('operations')){
  const p=(r.payload||{}) as AuditRaw;const amount=num(val(p,'amount','total')??r.amount);const type=String(r.record_type);const cancelledRow=cancelled(r)||cancelled(p);
  if(type==='expense')add('operations',r,'Expenses',{amount,expense:cancelledRow?0:amount,cashOut:cancelledRow?0:amount,date:text(p,'expenseDate')||r.created_at,party:text(p,'description','category'),mode:text(p,'mode','paymentMode'),reference:auditReference('operations',r,snapshot),items:[],raw:{...r,payload:p}});
  else if(type==='purchase_invoice'){
   if(purchaseIds.has(String(p.dbId||p.id))||purchaseRefs.has(`${r.branch}:${p.invoiceNo}`))continue;
   const key=`${r.branch}:${p.invoiceNo||p.id}`;if(purchaseRefs.has(key))continue;purchaseRefs.add(key);
   add('operations',r,'Purchases',{purchase:cancelledRow?0:amount,amount,date:text(p,'invoiceDate','createdAt')||r.created_at,party:text(p,'supplier'),reference:text(p,'invoiceNo')||r.record_no,items:Array.isArray(p.items)?p.items:[]});
   issue('operations',r,'Purchase exists only in the operation register; included once and requires invoice-ledger review.','Review',amount);
  }else if(type==='bank_deposit'){
   const bankRecords=[...data('snb_deposits'),...data('vrsnb_deposits')];if(bankRecords.some(d=>String(d.id)===String(p.id)))continue;
   add('operations',r,'Bank transfers',{amount,date:text(p,'depositDate')||r.created_at,mode:text(p,'paymentMode')});
  }else if(type==='cash_movement')add('operations',r,'Reference',{amount,date:text(p,'dateTime')||r.created_at,party:text(p,'purpose'),mode:text(p,'paymentMode')});
 }
 for(const source of ['snb_deposits','vrsnb_deposits'] as const)for(const r of data(source))add(source,r,'Bank transfers',{branch:source==='snb_deposits'?'SNB':r.branch||'VRSNB',date:text(r,'deposit_date','created_at')});
 for(const r of data('stock_balances'))add('stock_balances',r,'Stock',{party:String(r.item_name),amount:0});
 for(const r of data('stock_movements'))add('stock_movements',r,'Stock',{party:String(r.item_name),amount:0});
 for(const source of ['branch_closures','admin_closures','snb_closures','vrsnb_closures','hosur_closures'] as const)for(const r of data(source)){
  const branch=source==='snb_closures'?'SNB':source==='hosur_closures'?'Hosur':r.branch||'VRSNB';const difference=num(val(r,'difference','difference_amount'));
  add(source,r,'Cash closures',{branch,date:String(r.closure_date),reference:String(r.closure_date),party:text(r,'cashier','closed_by'),amount:difference});
  if(Math.abs(difference)>0.01)issue(source,{...r,branch},`Cash closure variance ${difference.toFixed(2)}. Review counted cash against expected cash.`,'Mismatch',difference);
  if(Math.abs(num(r.upi_difference))>0.01)issue(source,{...r,branch},`UPI closure variance ${num(r.upi_difference).toFixed(2)}.`,'Mismatch',num(r.upi_difference));
 }
 for(const r of data('tax_invoices')){
  const reference=text(r,'reference_no');const linked=!!reference&&(salesNumbers.has(reference)||dispatchNos.has(reference)||[...headers.values()].some(h=>h.bill_no===reference));
  add('tax_invoices',r,'Tax invoices',{branch:'Planner',date:String(r.invoice_date),reference:String(r.invoice_no),party:String(r.buyer_name||''),amount:num(r.total)});
  if(!linked)issue('tax_invoices',r,'Tax invoice has no matching sales reference in this scope. Shown as a document for review, not silently added as another sale.','Missing',num(r.total));
 }
 for(const r of data('salary_records'))add('salary_records',r,'Payroll',{branch:r.branch==='Cafe Aadvikam'?'Cafe':r.branch||'Payroll',date:`${r.year}-${String(r.month).padStart(2,'0')}-01`,party:String(r.employee_name||r.employee_id),reference:`Salary ${r.month}/${r.year}`,amount:num(r.net_salary)});
 for(const r of data('salary_advances'))add('salary_advances',r,'Reference',{branch:r.branch==='Cafe Aadvikam'?'Cafe':r.branch||'Payroll',amount:num(r.amount),date:text(r,'given_date'),party:String(r.employee_name||r.employee_id)});
 for(const r of data('bill_references')){const h=headers.get(`${r.branch}:${r.record_no}`);if(!h)issue('bill_references',r,'Secondary register bill has no matching main-ledger bill in this range; not silently added to sales.','Missing',num(r.amount));else if(Math.abs(num(h.total)-num(r.amount))>0.01)issue('bill_references',r,`Secondary amount ${num(r.amount).toFixed(2)} differs from main ledger ${num(h.total).toFixed(2)}. Main ledger counted once.`,'Mismatch',num(r.amount));}
 const sum=(field:keyof AuditEntry)=>money(entries.reduce((total,e)=>total+num(e[field]),0));
 const totals={sales:sum('revenue'),collected:sum('cashIn'),paidOut:sum('cashOut'),purchases:sum('purchase'),expenses:sum('expense'),tax:sum('tax'),outstanding:sum('outstanding'),payables:sum('payable'),netCash:money(sum('cashIn')-sum('cashOut')),recordedSurplus:money(sum('revenue')-sum('tax')-sum('purchase')-sum('expense')),refunds:money(entries.filter(e=>e.category==='Refunds').reduce((s,e)=>s+e.amount,0)),stockSupplied:money(entries.filter(e=>e.category==='Stock supplied'&&!cancelled(e.raw)).reduce((s,e)=>s+e.amount,0)),cakeOrderValue:money(entries.filter(e=>e.category==='Cake orders').reduce((s,e)=>s+e.orderValue,0)),advanceOrderValue:money(entries.filter(e=>e.category==='Advances').reduce((s,e)=>s+e.orderValue,0))};
 const branchNames=[...new Set(entries.map(e=>e.branch))];const byBranch=branchNames.map(branch=>{const own=entries.filter(e=>e.branch===branch);return {branch,sales:money(own.reduce((s,e)=>s+e.revenue,0)),collected:money(own.reduce((s,e)=>s+e.cashIn,0)),spending:money(own.reduce((s,e)=>s+e.cashOut,0)),purchases:money(own.reduce((s,e)=>s+e.purchase,0)),expenses:money(own.reduce((s,e)=>s+e.expense,0))};});
 const dailyMap=new Map<string,{day:string;sales:number;receipts:number;spending:number}>();for(const e of entries){const day=istDay(e.date);if(!day||day<from||day>to)continue;const row=dailyMap.get(day)||{day,sales:0,receipts:0,spending:0};row.sales=money(row.sales+e.revenue);row.receipts=money(row.receipts+e.cashIn);row.spending=money(row.spending+e.cashOut);dailyMap.set(day,row);}
 return {entries:entries.sort((a,b)=>a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference,undefined,{numeric:true})),issues,totals,byBranch,daily:[...dailyMap.values()].sort((a,b)=>a.day.localeCompare(b.day))};
}
