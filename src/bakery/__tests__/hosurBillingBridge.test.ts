// src/bakery/__tests__/hosurBillingBridge.test.ts
import { describe, it, expect } from 'vitest';
import { computePaymentSplit, hasUnbilledQuantity } from '../hosurBillingBridge';

describe('computePaymentSplit', () => {
  it('full payment: paid = total, credit = 0, status paid', () => {
    const result = computePaymentSplit(1000, { paymentType: 'full' });
    expect(result).toEqual({ paid: 1000, credit: 0, status: 'paid' });
  });

  it('credit: paid = 0, credit = total, status credit_open', () => {
    const result = computePaymentSplit(1000, { paymentType: 'credit', dueDate: '2026-08-01' });
    expect(result).toEqual({ paid: 0, credit: 1000, status: 'credit_open' });
  });

  it('partial: splits paid/credit correctly, status partial_credit', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 400, dueDate: '2026-08-01' });
    expect(result).toEqual({ paid: 400, credit: 600, status: 'partial_credit' });
  });

  it('partial payment covering the full amount becomes status paid', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 1000 });
    expect(result.credit).toBe(0);
    expect(result.status).toBe('paid');
  });

  it('clamps a negative or missing paidAmount to 0', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: -50 });
    expect(result.paid).toBe(0);
    expect(result.credit).toBe(1000);
  });

  it('clamps an overpaid amount to the total (never negative credit)', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 5000 });
    expect(result.paid).toBe(1000);
    expect(result.credit).toBe(0);
  });
});

// Regression coverage for the 2026-09-13 duplicate-bill incident
// (project_hosur_duplicate_rebill memory): a stale re-run of billing for an
// order that hadn't actually received anything new since it was last billed
// silently re-added the same items, doubling 43 Hosur shops' credit by
// ₹63,104 total. hasUnbilledQuantity is the guard that now stops it.
describe('hasUnbilledQuantity', () => {
  it('refuses a brand-new bill call with no matching current rows (first bill for this order)', () => {
    // A first-ever bill has nothing in hosur_order_items.received_quantity
    // yet, so the map is empty — any positive receivedQuantity must count as new.
    const items = [{ id: 'i1', receivedQuantity: 2 }];
    expect(hasUnbilledQuantity(items, new Map())).toBe(true);
  });

  it('refuses a stale repeat where every item exactly matches what is already billed', () => {
    // This is the exact shape of the incident: the same cumulative
    // dispatchedQuantity (2kg cake) submitted a second time.
    const items = [{ id: 'i1', receivedQuantity: 2 }];
    const current = new Map([['i1', 2]]);
    expect(hasUnbilledQuantity(items, current)).toBe(false);
  });

  it('allows a genuine second batch where one item grew', () => {
    const items = [
      { id: 'i1', receivedQuantity: 2 }, // unchanged since last bill
      { id: 'i2', receivedQuantity: 5 }, // grew from 3 -> 5, real new stock
    ];
    const current = new Map([['i1', 2], ['i2', 3]]);
    expect(hasUnbilledQuantity(items, current)).toBe(true);
  });

  it('is not fooled by floating-point noise just under the epsilon', () => {
    const items = [{ id: 'i1', receivedQuantity: 2.0005 }];
    const current = new Map([['i1', 2]]);
    expect(hasUnbilledQuantity(items, current)).toBe(false);
  });

  it('allows a real increase even a fraction of a unit above the epsilon', () => {
    const items = [{ id: 'i1', receivedQuantity: 2.02 }];
    const current = new Map([['i1', 2]]);
    expect(hasUnbilledQuantity(items, current)).toBe(true);
  });

  it('refuses when an item somehow decreased (no stray "new" from a correction)', () => {
    const items = [{ id: 'i1', receivedQuantity: 1 }];
    const current = new Map([['i1', 2]]);
    expect(hasUnbilledQuantity(items, current)).toBe(false);
  });
});
