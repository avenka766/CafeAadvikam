import {fetchAllRows} from '@/lib/fetchAllRows';
export async function loadReceiverSharedRecords(branch:string){
 const [invoices,returns,waste,operations]=await Promise.all([
  fetchAllRows('snb_purchase_invoices',q=>q.select('id,supplier_name,invoice_number,invoice_date,total_amount,balance_amount,sync_status,created_at').order('created_at',{ascending:false}),{cursorColumn:'created_at'}),
  fetchAllRows('snb_purchase_returns',q=>q.select('id,return_no,supplier_name,invoice_number,return_date,reason_type,settlement_type,total_amount,status,created_at').order('created_at',{ascending:false}),{cursorColumn:'created_at'}),
  fetchAllRows('branch_waste_logs',q=>q.select('id,log_type,item_name,quantity,unit,reason,verified_by,created_by_username,created_at').eq('branch',branch).order('created_at',{ascending:false}),{cursorColumn:'created_at'}),
  fetchAllRows('branch_operation_records',q=>q.select('id,record_type,record_no,amount,status,payload,created_at').eq('branch',branch).in('record_type',['purchase_invoice','purchase_return','waste','waste_log','damage','dump','transfer_out','stock_update']).order('created_at',{ascending:false}),{cursorColumn:'created_at'}),
 ]);
 const failures=[invoices.error,returns.error,waste.error,operations.error].filter(Boolean);
 if(failures.length)throw Error(`Shared records are incomplete: ${failures.join(' | ')}`);
 if(!Array.isArray(operations.data))throw Error('Shared operations returned an incomplete response.');
 return [invoices,returns,waste,operations] as const;
}
export function sharedOperationIdentity(row:{id:string;type:string;reference:string;party:string;amount?:number|null}){
 // Supplier invoice numbers are not globally unique; unnumbered stock logs are distinct records.
 return /Purchase Invoice|Purchase Return/.test(row.type)&&row.reference!=='-'
  ?JSON.stringify([row.type,row.reference,row.party,row.amount])
  :JSON.stringify([row.type,row.id]);
}
