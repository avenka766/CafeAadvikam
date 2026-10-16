import { calculatePlannerSalesGst, salesMoney } from './plannerSalesGst';

type Line = {itemName: string; unit: string; quantity: number; unitPrice: number; lineTotal: number; gstPricing?: 'exclusive'; gstPct?: number};

/** Represent the invoice in Hosur's two-decimal-rate ledger without losing tax or discount. */
export function hosurInvoiceLedgerLines(items: Line[], discountPct: number) {
  const mult = 1 - Math.min(100, Math.max(0, discountPct || 0)) / 100;
  if (!items.some(i => i.gstPricing === 'exclusive')) return items.map(i => ({...i, unitPrice: salesMoney(i.unitPrice * mult)}));
  const subtotal = salesMoney(items.reduce((s, i) => s + i.lineTotal, 0));
  const tax = calculatePlannerSalesGst(subtotal, salesMoney(subtotal * (1 - mult)), true, items.find(i => i.gstPricing === 'exclusive')?.gstPct || 0);
  const lines = items.map(i => ({itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: Math.floor((i.unitPrice * mult + 1e-9) * 100) / 100}));
  const sum = () => salesMoney(lines.reduce((s, i) => s + salesMoney(i.quantity * i.unitPrice), 0));
  // Round each recorded line as the database does; never let rate rounding exceed the taxable amount.
  while (sum() > tax.taxableValue) {
    const line = lines.find(i => i.quantity > 0 && i.unitPrice >= 0.01);
    if (!line) throw new Error('Unable to reconcile discounted invoice rates.');
    line.unitPrice = salesMoney(line.unitPrice - 0.01);
  }
  const adjustment = salesMoney(tax.taxableValue - sum());
  if (adjustment > 0) lines.push({itemName: 'Discount rounding adjustment', unit: 'charge', quantity: 1, unitPrice: adjustment});
  if (tax.totalTax > 0) lines.push({itemName: `GST @ ${items.find(i => i.gstPricing === 'exclusive')?.gstPct}%`, unit: 'charge', quantity: 1, unitPrice: tax.totalTax});
  return lines;
}

/** Keep two-decimal rates and a nonnegative adjustment while matching the issued invoice. */
export function reconcileHosurLedgerTotal(input:ReturnType<typeof hosurInvoiceLedgerLines>,total:number){
 const lines=input.filter(i=>i.quantity>0).map(i=>({...i,unitPrice:Math.floor((i.unitPrice+1e-9)*100)/100}));
 const sum=()=>salesMoney(lines.reduce((s,i)=>s+salesMoney(i.quantity*i.unitPrice),0));
 while(sum()>total){const line=lines.filter(i=>i.unitPrice>=.01).sort((a,b)=>b.quantity-a.quantity)[0];if(!line)throw Error('Hosur invoice amount cannot be reconciled.');line.unitPrice=salesMoney(line.unitPrice-.01);}
 const remainder=salesMoney(total-sum());if(remainder>0)lines.push({itemName:'Invoice rounding adjustment',unit:'charge',quantity:1,unitPrice:remainder});
 return lines;
}
