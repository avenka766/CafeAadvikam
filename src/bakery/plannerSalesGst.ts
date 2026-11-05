import {financialPercent} from '@/lib/financialRounding';
export const salesMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function gstBuyerError(name: string, gstin: string): string | undefined {
  if (!name.trim() || !gstin.trim()) return 'Enter the registered GST name and GST number.';
  if (!/^[A-Z0-9]{15}$/.test(gstin.trim().toUpperCase())) return 'Enter a GST number with 15 letters and digits.';
}

/** New Planner Sales invoices add GST once, to the whole bill after discount. */
export function calculatePlannerSalesGst(subtotal: number, discount: number, enabled: boolean, rate: number, supplyType: 'intra' | 'inter' = 'intra') {
  const taxableValue = salesMoney(Math.max(0, subtotal - discount));
  const totalTax = enabled ? (Number.isFinite(taxableValue) && Number.isFinite(rate) && rate >= 0 ? financialPercent(taxableValue,rate) : NaN) : 0;
  const cgst = supplyType === 'intra' ? salesMoney(totalTax / 2) : 0;
  const sgst = supplyType === 'intra' ? salesMoney(totalTax - cgst) : 0;
  return { taxableValue, totalTax, cgst, sgst, igst: supplyType === 'inter' ? totalTax : 0, total: salesMoney(taxableValue + totalTax) };
}
