import type { Order } from '@/types';

export const CAFE_GST_COLUMNS = 'gst_enabled, gst_rate, taxable_amount, cgst_amount, sgst_amount, gst_amount';
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** GST is added only to taxable items; parcel charges stay outside the tax base. */
export function calculateCafeGst(subtotal: number, discount = 0, parcelCharges = 0, enabled = true, eligibleSubtotal = subtotal) {
  const baseAmount = money(Math.max(0, subtotal + parcelCharges - discount));
  const eligible = Math.min(Math.max(0, eligibleSubtotal), Math.max(0, subtotal));
  const eligibleDiscount = subtotal > 0 ? money(discount * eligible / subtotal) : 0;
  const taxableAmount = money(Math.max(0, eligible - eligibleDiscount));
  const gstAmount = enabled ? money(taxableAmount * 0.05) : 0;
  const cgstAmount = money(gstAmount / 2);
  const sgstAmount = money(gstAmount - cgstAmount);
  const total = Math.round(money(baseAmount + gstAmount));
  return { gstEnabled: enabled, gstRate: enabled ? 5 : 0, taxableAmount, cgstAmount, sgstAmount, gstAmount, total,
    roundOff: money(total - baseAmount - gstAmount) };
}

/** Use the latest menu flag for a draft; saved bills keep their item snapshot. */
export function cafeEligibleSubtotal(items: Array<{ menuItem: { id: string; price: number; gstApplicable?: boolean }; quantity: number }>, menu?: Array<{ id: string; gstApplicable?: boolean }>) {
  const current = menu ? new Map(menu.map(item => [item.id, item.gstApplicable !== false])) : null;
  return money(items.reduce((sum, item) => sum + ((current?.get(item.menuItem.id) ?? (item.menuItem.gstApplicable !== false)) ? item.menuItem.price * item.quantity : 0), 0));
}

export function cafeGstColumns(tax: ReturnType<typeof calculateCafeGst>) {
  return { gst_enabled: tax.gstEnabled, gst_rate: tax.gstRate, taxable_amount: tax.taxableAmount,
    cgst_amount: tax.cgstAmount, sgst_amount: tax.sgstAmount, gst_amount: tax.gstAmount };
}

/** Receipts use the saved snapshot; never add today's tax to an old bill. */
export function savedCafeGst(order: Pick<Order, 'gstEnabled' | 'gstRate' | 'gstAmount' | 'cgstAmount' | 'sgstAmount' | 'taxableAmount'>) {
  return { gstEnabled: order.gstEnabled === true, gstRate: Number(order.gstRate || 0),
    gstAmount: Number(order.gstAmount || 0), cgstAmount: Number(order.cgstAmount || 0),
    sgstAmount: Number(order.sgstAmount || 0), taxableAmount: Number(order.taxableAmount || 0) };
}

/** Tax collected at billing; a credit balance is not cash received. */
export function cafeGstCollection(order: Order) {
  const tax = savedCafeGst(order);
  const billed = tax.gstEnabled && order.status !== 'cancelled' &&
    !['unpaid', 'advance'].includes(order.paymentType) && order.orderSource !== 'balance';
  if (!billed) return { billed: 0, collected: 0, credit: 0, cgst: 0, sgst: 0, extraCollected: 0 };
  const paid = order.paymentType === 'credit' ? 0 : order.paymentType === 'part_payment'
    ? ['cash', 'upi', 'card', 'wallet'].reduce((sum, key) =>
      sum + Number(order.paymentBreakdown?.[key as keyof NonNullable<Order['paymentBreakdown']>] || 0), 0)
    : order.total;
  const fraction = order.total > 0 ? Math.min(1, Math.max(0, paid / order.total)) : 0;
  const collected = money(tax.gstAmount * fraction);
  const cgst = money(tax.cgstAmount * fraction);
  return { billed: tax.gstAmount, collected, credit: money(tax.gstAmount - collected),
    cgst, sgst: money(collected - cgst),
    extraCollected: money((order.total - Math.round(Math.max(0, Number(order.subtotal || 0) + Number(order.parcelCharges || 0) - Number(order.discount || 0)))) * fraction) };
}

export function summarizeCafeGst(orders: Order[]) {
  const totals = orders.reduce((sum, order) => {
    const row = cafeGstCollection(order);
    return { billed: sum.billed + row.billed, collected: sum.collected + row.collected,
      credit: sum.credit + row.credit, cgst: sum.cgst + row.cgst, sgst: sum.sgst + row.sgst,
      extraCollected: sum.extraCollected + row.extraCollected };
  }, { billed: 0, collected: 0, credit: 0, cgst: 0, sgst: 0, extraCollected: 0 });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, money(value)])) as typeof totals;
}
