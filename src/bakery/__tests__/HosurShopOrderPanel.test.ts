// src/bakery/__tests__/HosurShopOrderPanel.test.ts
import { describe, it, expect } from 'vitest';
import { isOrderBillable } from '../HosurShopOrderPanel';

// Regression coverage for the 2026-09-13 duplicate-bill incident
// (project_hosur_duplicate_rebill memory): the Bulk Bill / "Select all
// fully-dispatched" list had no lower bound excluding an order that was
// already fully billed, so it kept reoffering already-billed orders
// indefinitely — selecting-all and running Bulk Bill re-billed 43 of them,
// ₹63,104 of duplicate credit across 15 shops. isOrderBillable is the fix.
describe('isOrderBillable', () => {
  it('is false for an order with no items at all', () => {
    expect(isOrderBillable([])).toBe(false);
  });

  it('is false for a partially-dispatched order (not everything sent yet)', () => {
    const items = [{ dispatchedQuantity: 1, quantity: 2, receivedQuantity: 0 }];
    expect(isOrderBillable(items)).toBe(false);
  });

  it('is true for a fully-dispatched order that has never been billed', () => {
    const items = [{ dispatchedQuantity: 2, quantity: 2, receivedQuantity: 0 }];
    expect(isOrderBillable(items)).toBe(true);
  });

  it('is false for an order that is fully dispatched AND already fully billed — the incident case', () => {
    // Exactly what every duplicated order looked like on 2026-09-13:
    // dispatchedQuantity caught up to quantity, and receivedQuantity (what
    // was already billed) caught up to dispatchedQuantity too. Nothing left
    // to bill, so it must not be selectable again.
    const items = [{ dispatchedQuantity: 2, quantity: 2, receivedQuantity: 2 }];
    expect(isOrderBillable(items)).toBe(false);
  });

  it('is true again once a real second batch dispatches more than what was already billed', () => {
    const items = [{ dispatchedQuantity: 5, quantity: 5, receivedQuantity: 2 }];
    expect(isOrderBillable(items)).toBe(true);
  });

  it('is true if ANY item on a multi-item order still has unbilled stock, even if others are fully billed', () => {
    const items = [
      { dispatchedQuantity: 2, quantity: 2, receivedQuantity: 2 }, // fully billed already
      { dispatchedQuantity: 3, quantity: 3, receivedQuantity: 1 }, // real unbilled stock
    ];
    expect(isOrderBillable(items)).toBe(true);
  });

  it('is not fooled by floating-point noise just under the epsilon', () => {
    const items = [{ dispatchedQuantity: 2.0005, quantity: 2, receivedQuantity: 2 }];
    expect(isOrderBillable(items)).toBe(false);
  });
});
