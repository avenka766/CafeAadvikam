import {calculatePlannerSalesGst} from '@/bakery/plannerSalesGst';
const money=(n:number)=>Math.round(n*100)/100;
export function invoiceTax(row:Record<string,any>){
 const items=Array.isArray(row.items)?row.items:[];
 const rate=Number(items.find((i:any)=>i.gstPct!=null)?.gstPct??5);
 const invoiceValue=Number(row.total||0),enabled=row.is_gst_invoice===true;
 const exclusive=items.some((i:any)=>i.gstPricing==='exclusive');
 const base=exclusive?Math.max(0,Number(row.subtotal||0)-Number(row.discount_amount||0)):enabled?invoiceValue/(1+rate/100):invoiceValue;
 const tax=calculatePlannerSalesGst(base,0,enabled,rate,row.gst_supply_type==='inter'?'inter':'intra');
 const printedInvoiceValue=Number(row.reportPrintedInvoiceValue??invoiceValue);
 return {taxableValue:tax.taxableValue,cgst:tax.cgst,sgst:tax.sgst,igst:tax.igst,invoiceValue,printedInvoiceValue,ledgerAdjustment:money(invoiceValue-printedInvoiceValue), itemSubtotal:Number(row.subtotal??items.reduce((n:number,i:any)=>n+Number(i.lineTotal||0),0))};
}
export function aggregateInvoiceTax(rows:Record<string,any>[]){
 if(!rows.length)return undefined;
 return rows.map(invoiceTax).reduce((a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,money(a[k as keyof typeof a]+b[k as keyof typeof b])])) as ReturnType<typeof invoiceTax>);
}
/** The shop ledger may retain paise while the individual printed invoices round
 * to rupees. Accept only a value reproduced from saved prices/discounts, or the
 * legacy single-invoice quantity precision conversion (kg stored to 2 decimals).
 * This is a report view: never rewrite the issued invoice or the money ledger. */
export function hosurLedgerTax(rows:Record<string,any>[],ledgerTotal:number,ledgerItems:Record<string,any>[]){
 const saved:Record<string,any>[]=rows.filter(row=>row.status!=='cancelled').map(row=>({...row,reportPrintedInvoiceValue:row.total}));
 const sum=(list:Record<string,any>[])=>money(list.reduce((n,r)=>n+Number(r.total),0));
 let resolved=saved;
 if(Math.abs(sum(saved)-ledgerTotal)>.011){
  const exact=saved.map(row=>{
   const net=money(Number(row.subtotal)-Number(row.discount_amount||0));
   const exclusive=row.is_gst_invoice===true&&row.items?.some((i:any)=>i.gstPricing==='exclusive');
   const rate=Number(row.items?.find((i:any)=>i.gstPct!=null)?.gstPct??5);
   return {...row,total:exclusive?money(net+money(net*rate/100)):net};
  });
  if(Math.abs(sum(exact)-ledgerTotal)<.011)resolved=exact;
  else if(saved.length===1&&!saved[0].is_gst_invoice&&Number(saved[0].discount_amount||0)===0){
   const source=Array.isArray(saved[0].items)?saved[0].items:[];
   const remaining=[...ledgerItems];
   const matched=source.length>0&&source.length===remaining.length&&source.every((i:any)=>{
    const idx=remaining.findIndex(l=>String(l.item_name).trim().toLowerCase()===String(i.itemName).trim().toLowerCase()
     && l.unit===i.unit&&Number(l.unit_price)===Number(i.unitPrice)
     && Number(l.quantity)===(i.unit==='kg'?money(Number(i.quantity)):Number(i.quantity))
     && money(Number(l.quantity)*Number(l.unit_price))===Number(l.line_total));
    if(idx<0)return false;remaining.splice(idx,1);return true;
   });
   if(matched&&Math.abs(money(ledgerItems.reduce((n,i)=>n+Number(i.line_total),0))-ledgerTotal)<.011)
    resolved=[{...saved[0],total:ledgerTotal}];
  }
 }
 return {tax:aggregateInvoiceTax(resolved),invoiceTaxes:Object.fromEntries(resolved.map(r=>[String(r.invoice_no),invoiceTax(r)]))};
}
export function reconcileHosurItems<T extends {lineTotal:number}>(bill:{total:number;itemSubtotal?:number},items:T[]){
 const sum=money(items.reduce((n,i)=>n+i.lineTotal,0));
 if(!items.length&&bill.total!==0)throw Error('Item details are missing for this invoice.');
 if(Math.abs(sum-bill.total)>.011&&(bill.itemSubtotal===undefined||Math.abs(sum-bill.itemSubtotal)>.011))throw Error('Saved item values do not reconcile with the invoice. Review the source records.');
 const target=Math.round(bill.total*100);
 if(sum===0&&target!==0)throw Error('Invoice has no item values to allocate.');
 const raw=items.map(i=>sum?target*i.lineTotal/sum:0),paise=raw.map(Math.floor);
 let remaining=target-paise.reduce((a,b)=>a+b,0);
 for(const i of raw.map((n,i)=>({i,frac:n-paise[i]})).sort((a,b)=>b.frac-a.frac).map(x=>x.i)){if(remaining--<=0)break;paise[i]++;}
 return items.map((item,i)=>({...item,savedItemValue:item.lineTotal,allocation:money(paise[i]/100-item.lineTotal),lineTotal:paise[i]/100}));
}
