export const salesMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** New Planner Sales invoices add GST once, to the whole bill after discount. */
export function calculatePlannerSalesGst(subtotal: number, discount: number, enabled: boolean, rate: number, supplyType: 'intra' | 'inter' = 'intra') {
  const taxableValue = salesMoney(Math.max(0, subtotal - discount));
  const totalTax = enabled ? salesMoney(taxableValue * rate / 100) : 0;
  const cgst = supplyType === 'intra' ? salesMoney(totalTax / 2) : 0;
  const sgst = supplyType === 'intra' ? salesMoney(totalTax - cgst) : 0;
  return { taxableValue, totalTax, cgst, sgst, igst: supplyType === 'inter' ? totalTax : 0, total: salesMoney(taxableValue + totalTax) };
}
