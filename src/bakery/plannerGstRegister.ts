import {fetchAllRows} from '@/lib/supabase';
import {listGstTaxInvoices} from './gstTaxInvoice';
export async function loadPlannerGstRegister(from:string,to:string){
 const [manual,sales,dispatch]=await Promise.all([listGstTaxInvoices({fromDate:from,toDate:to}),...['bakery_walkin_bills','dispatch_invoices'].map(table=>fetchAllRows<Record<string,any>>(table,q=>q.select('*').eq('is_gst_invoice',true).gte('created_at',from).lt('created_at',to).order('created_at',{ascending:true}).order('id',{ascending:true})))]);
 if(sales.error||dispatch.error)throw Error(sales.error||dispatch.error!);
 const result=[...manual.map(r=>({Source:'Tax invoice','Invoice Number':r.invoiceNo,Date:r.createdAt,Customer:r.buyerName,GSTIN:r.buyerGstin||'',Total:r.total,Status:'Issued',Items:r.items.map(i=>JSON.stringify(i)).join('; ')})),
 ...([sales,dispatch] as const).flatMap((batch,index)=>(batch.data||[]).map((r:any)=>({Source:index?'Dispatch / Hosur':'Planner Sales','Invoice Number':String(r.bill_no||r.invoice_no||''),Date:String(r.created_at),Customer:String(r.customer_name||r.shop_name||''),GSTIN:String(r.buyer_gstin||r.customer_gstin||''),Total:Number(r.total||0),Status:String(r.status||''),Items:JSON.stringify(r.items||[])})))];
 return result.sort((a,b)=>b.Date.localeCompare(a.Date));
}
