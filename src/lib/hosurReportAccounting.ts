import {calculatePlannerSalesGst} from '@/bakery/plannerSalesGst';
const money=(n:number)=>Math.round(n*100)/100;
export function invoiceTax(row:Record<string,any>){
 const items=Array.isArray(row.items)?row.items:[];
 const rate=Number(items.find((i:any)=>i.gstPct!=null)?.gstPct??5);
 const invoiceValue=Number(row.total||0),enabled=row.is_gst_invoice===true;
 const exclusive=items.some((i:any)=>i.gstPricing==='exclusive');
 const base=exclusive?Math.max(0,Number(row.subtotal||0)-Number(row.discount_amount||0)):enabled?invoiceValue/(1+rate/100):invoiceValue;
 const tax=calculatePlannerSalesGst(base,0,enabled,rate,row.gst_supply_type==='inter'?'inter':'intra');
 return {taxableValue:tax.taxableValue,cgst:tax.cgst,sgst:tax.sgst,igst:tax.igst,invoiceValue, itemSubtotal:Number(row.subtotal??items.reduce((n:number,i:any)=>n+Number(i.lineTotal||0),0))};
}
export function aggregateInvoiceTax(rows:Record<string,any>[]){
 if(!rows.length)return undefined;
 return rows.map(invoiceTax).reduce((a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,money(a[k as keyof typeof a]+b[k as keyof typeof b])])) as ReturnType<typeof invoiceTax>);
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
