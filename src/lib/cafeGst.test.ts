import { describe, it, expect } from 'vitest';
import { calculateCafeGst, cafeEligibleSubtotal, savedCafeGst, summarizeCafeGst, cafeGstCollection } from './cafeGst';
import type { Order } from '@/types';

const bill = (overrides: Partial<Order> = {}): Order => ({
  id: 'test', orderNumber: 1, orderType: 'takeaway', items: [],
  subtotal: 100, discount: 0, discountType: 'flat', discountValue: 0,
  status: 'served', paymentType: 'cash', createdBy: 'test',
  createdAt: '2026-10-04T06:00:00Z', updatedAt: '2026-10-04T06:00:00Z',
  ...calculateCafeGst(100), ...overrides,
});
describe('Additional Cafe GST', () => {
  it('defaults to 5% GST on items after discount, excluding parcel charges', () => {
    expect(calculateCafeGst(100)).toMatchObject({ total: 105, gstAmount: 5, cgstAmount: 2.5, sgstAmount: 2.5 });
    expect(calculateCafeGst(100, 20, 10)).toMatchObject({ taxableAmount: 80, gstAmount: 4, total: 94, roundOff: 0 });
    expect(calculateCafeGst(100, 0, 10)).toMatchObject({ taxableAmount: 100, gstAmount: 5, total: 115 });
    expect(calculateCafeGst(40, 0, 10, true, 0)).toMatchObject({ taxableAmount: 0, gstAmount: 0, total: 50 });
    expect(calculateCafeGst(0, 0, 10)).toMatchObject({ taxableAmount: 0, gstAmount: 0, total: 10 });
  });
  it('turns GST off without changing the base amount', () => {
    expect(calculateCafeGst(100, 20, 10, false)).toMatchObject({ total: 90, gstEnabled: false, gstRate: 0, gstAmount: 0 });
  });
  it('keeps the split equal to total tax for fractional prices and avoids double rounding', () => {
    const tax = calculateCafeGst(20.1);
    expect(tax.gstAmount).toBe(1.01);
    expect(tax.cgstAmount + tax.sgstAmount).toBe(tax.gstAmount);
    expect(tax.total).toBe(21);
    expect(calculateCafeGst(1, 1)).toMatchObject({ total: 0, gstAmount: 0 });
  });
  it('does not add GST again to prices marked inclusive, including mixed bills and discounts', () => {
    const items = [
      { menuItem: { id: 'coffee', price: 40, gstApplicable: false }, quantity: 1 },
      { menuItem: { id: 'food', price: 100, gstApplicable: true }, quantity: 1 },
    ];
    expect(cafeEligibleSubtotal(items)).toBe(100);
    expect(calculateCafeGst(40, 0, 0, true, 0)).toMatchObject({ total: 40, gstAmount: 0, taxableAmount: 0 });
    expect(calculateCafeGst(140, 14, 0, true, cafeEligibleSubtotal(items))).toMatchObject({ total: 131, gstAmount: 4.5, taxableAmount: 90 });
    expect(cafeEligibleSubtotal(items, [{ id: 'coffee', gstApplicable: true }, { id: 'food', gstApplicable: true }])).toBe(140);
  });
  it('does not invent GST on a legacy receipt or recompute a saved snapshot', () => {
    expect(savedCafeGst({})).toMatchObject({ gstEnabled: false, gstAmount: 0 });
    expect(savedCafeGst({ gstEnabled: true, gstRate: 5, gstAmount: 8, cgstAmount: 4, sgstAmount: 4 })).toMatchObject({ gstAmount: 8 });
  });
  it('excludes cancelled, unpaid, old and GST-off bills from the collection report', () => {
    const rows = [bill(), bill({ status: 'cancelled' }), bill({ paymentType: 'unpaid' }),
      bill({ ...calculateCafeGst(100,0,0,false) }), bill({ gstEnabled: undefined, gstAmount: undefined })];
    expect(summarizeCafeGst(rows)).toEqual({ billed: 5, collected: 5, credit: 0, cgst: 2.5, sgst: 2.5, extraCollected: 5 });
  });
  it('separates credit tax from money received, including wallet plus credit payments', () => {
    expect(cafeGstCollection(bill({ paymentType: 'credit' }))).toMatchObject({ billed: 5, collected: 0, credit: 5 });
    expect(cafeGstCollection(bill({ paymentType: 'part_payment', paymentBreakdown: { cash: 0, upi: 0, card: 0, wallet: 63, credit: 42 } })))
      .toMatchObject({ billed: 5, collected: 3, credit: 2, cgst: 1.5, sgst: 1.5 });
  });
  it('counts payments already received while the kitchen is still preparing the order', () => {
    expect(cafeGstCollection(bill({ status: 'preparing' }))).toMatchObject({ collected: 5 });
  });
  it('distinguishes GST from actual extra collection after whole-rupee rounding', () => {
    expect(cafeGstCollection(bill({ subtotal: 10, ...calculateCafeGst(10) }))).toMatchObject({ collected: 0.5, extraCollected: 1 });
  });
});

