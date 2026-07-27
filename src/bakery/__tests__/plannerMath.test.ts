// src/bakery/__tests__/plannerMath.test.ts
import { describe, it, expect } from 'vitest';
import { computeMergedSummary, autoSplitForItem } from '../PlannerDashboard';
import type { BakeryOrder } from '../types';

function makeOrder(id: string, branch: 'SNB' | 'VRSNB' | 'Hosur', items: { itemName: string; quantity: number; dispatchUnit?: 'pcs' | 'kg'; originalPcs?: number }[]): BakeryOrder {
  return {
    id, orderNumber: id, status: 'pending', createdBy: 'test', createdAt: new Date().toISOString(),
    targetBranch: branch,
    items: items.map((it, i) => ({ itemId: `${id}-${i}`, itemName: it.itemName, quantity: it.quantity, dispatchUnit: it.dispatchUnit ?? 'kg', originalPcs: it.originalPcs })),
  } as unknown as BakeryOrder;
}

describe('computeMergedSummary', () => {
  it('matches the example from the spec: SNB 100 buns/10 rusk/20 cake, VRSNB 50 buns/20 mixture/5 rusk, other 20 buns', () => {
    const orders = [
      makeOrder('snb-1', 'SNB', [
        { itemName: 'Buns', quantity: 100, dispatchUnit: 'pcs', originalPcs: 100 },
        { itemName: 'Rusk', quantity: 10 },
        { itemName: 'Cake', quantity: 20 },
      ]),
      makeOrder('vrsnb-1', 'VRSNB', [
        { itemName: 'Buns', quantity: 50, dispatchUnit: 'pcs', originalPcs: 50 },
        { itemName: 'Mixture', quantity: 20 },
        { itemName: 'Rusk', quantity: 5 },
      ]),
      makeOrder('hosur-1', 'Hosur', [
        { itemName: 'Buns', quantity: 20, dispatchUnit: 'pcs', originalPcs: 20 },
      ]),
    ];
    const merged = computeMergedSummary(orders);
    const byName = Object.fromEntries(merged.map(r => [r.itemName, r]));

    expect(byName['Buns'].totalRequested).toBe(170);
    expect(byName['Rusk'].totalRequested).toBe(15);
    expect(byName['Cake'].totalRequested).toBe(20);
    expect(byName['Mixture'].totalRequested).toBe(20);

    expect(byName['Buns'].perBranch.SNB).toBe(100);
    expect(byName['Buns'].perBranch.VRSNB).toBe(50);
    expect(byName['Buns'].perBranch.Hosur).toBe(20);
  });

  it('returns an empty array for no orders', () => {
    expect(computeMergedSummary([])).toEqual([]);
  });

  it('ignores orders with no targetBranch', () => {
    const order = makeOrder('x', 'SNB', [{ itemName: 'Buns', quantity: 10 }]);
    order.targetBranch = undefined;
    expect(computeMergedSummary([order])).toEqual([]);
  });
});

describe('autoSplitForItem', () => {
  it('splits produced quantity proportionally to each order\'s requested share', () => {
    const orders = [
      makeOrder('snb-1', 'SNB', [{ itemName: 'Buns', quantity: 100, dispatchUnit: 'pcs', originalPcs: 100 }]),
      makeOrder('vrsnb-1', 'VRSNB', [{ itemName: 'Buns', quantity: 50, dispatchUnit: 'pcs', originalPcs: 50 }]),
    ];
    // 150 ordered total, only 120 produced (80% fulfillment) — each order should get 80% of its ask.
    const split = autoSplitForItem(orders, 'Buns', 120);
    expect(split['snb-1']).toBeCloseTo(80, 1);
    expect(split['vrsnb-1']).toBeCloseTo(40, 1);
    expect(split['snb-1'] + split['vrsnb-1']).toBeCloseTo(120, 1);
  });

  it('handles zero production without dividing by zero', () => {
    const orders = [makeOrder('snb-1', 'SNB', [{ itemName: 'Buns', quantity: 100 }])];
    const split = autoSplitForItem(orders, 'Buns', 0);
    expect(split['snb-1']).toBe(0);
  });
});
