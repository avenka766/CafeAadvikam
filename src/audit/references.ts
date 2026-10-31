import {AUDIT_SOURCES,type AuditRaw,type AuditSnapshot} from './sources';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function auditReference(source:string,row:AuditRaw,snapshot:AuditSnapshot,visited=new Set<string>()):string{
 if(source==='finance_entries'&&row.receipt_no!=null)return `FIN-${row.receipt_no}`;
 for(const r of [row,row.metadata||{},row.payload||{}])for(const key of ['audit_document_number','return_no','return_number','invoice_no','invoice_number','bill_no','billNo','invoiceNo','invoiceNumber','gsr_no','gsr_number','gsrNo','grn_no','grn_number','grnNo','receipt_no','reference_no','reference_number','record_no','order_no','orderNo','report_no','reportNo','fy_seq','supplier_invoice_number','po_number',...(source==='credit_invoices'?['bill_id']:[])]){
  const value=r[key];const internal=key==='record_no'&&[row.id,row.record_id,row.payload?.id].some(id=>id!=null&&String(id)===String(value));if(!internal&&value!=null&&String(value).trim()&&String(value)!=='-'&&!uuid.test(String(value)))return String(value);
 }
 if(visited.has(`${source}:${row.id}`))return 'No document number recorded';visited.add(`${source}:${row.id}`);
 const links=[['credit_sale_id','branch_credits'],['ledger_id','hosur_credit'],['bill_id',source.startsWith('hosur')?'hosur_bills':'branch_bills'],['invoice_id','credit_invoices'],['payment_id','credit_payments'],['invoice_id','dispatches'],['invoice_id','snb_purchases'],['invoice_id','vrsnb_purchases'],['purchase_invoice_id','snb_purchases'],['purchase_invoice_id','vrsnb_purchases'],['reference_id','dispatches'],['reference_id','store_purchases'],['reference_id','snb_purchases'],['reference_id','vrsnb_purchases'],['source_id','dispatches']] as const;
 for(const [field,target] of links){if(row[field]==null||row[field]==='')continue;const parent=(snapshot[target]?.rows||[]).find(p=>String(p.id)===String(row[field])&&(!p.branch||!row.branch||p.branch===row.branch));if(parent){const number=auditReference(target,parent,snapshot,visited);if(number!=='No document number recorded')return number;}}
 if(source==='stock_balances')return `Current stock · ${row.item_name||'Item'}`;
 if(source==='loss_catalog')return `Catalogue item · ${row.name||'Item'} · ${row.barcode??''}`;
 if(source.includes('stock'))return `${source==='stock_adjustments'?'Stock correction':'Stock movement'} · ${row.item_name||'Item'}`;
 if(source.includes('salary'))return `Salary ${row.month?`${row.month}/${row.year}`:'advance'} · ${row.employee_name||row.employee_id||''}`;
 if(source==='employees')return `Employee · ${row.name||row.id}`;
 if(source==='attendance')return `Attendance · ${row.attendance_date||[row.year,String(row.month).padStart(2,'0'),String(row.day).padStart(2,'0')].join('-')} · ${row.employee_name||row.employee_id}`;
 if(source==='contract_teams')return `Team · ${row.name}`;
 if(source==='credit_accounts')return `Credit account · ${row.customer_name||row.mobile||'Customer'}`;
 if(source==='planner_orders')return /^([A-Za-z]+-ADV-\d+)\s*\|/.exec(String(row.notes||''))?.[1]||`Planner order #${row.order_number??'not recorded'}`;
 if(source==='waste_logs')return `${row.log_type||'Waste'} · ${row.item_name||'Item'}`;
 const date=String(row.closure_date||row.deposit_date||row.payment_date||row.created_at||'').slice(0,10);
 const title=AUDIT_SOURCES.find(s=>s.id===source)?.title;
 if(source==='operations')return `${String(row.record_type||'Operation').replaceAll('_',' ')}${date?` · ${date}`:''}`;
 if(title)return `${title}${date?` · ${date}`:''} · no document number recorded`;
 return 'No document number recorded';
}
