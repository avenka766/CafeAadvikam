// src/bakery/__tests__/plannerMath.test.ts
import { describe, it, expect } from 'vitest';
import { computeMergedSummary, autoSplitForItem, passesProductionCutoff } from '../PlannerDashboard';
import { vrsnbPacketGrams, pcsToKgForItem, kgToPcsForItem, kgToPcs, VRSNB_DEFAULT_PACKET_GRAMS } from '../itemMatcher';
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

  it('buckets an order with no targetBranch via bucketFor (SNB fallback, per the 2026-08-07 fix)', () => {
    const order = makeOrder('x', 'SNB', [{ itemName: 'Buns', quantity: 10 }]);
    order.targetBranch = undefined;
    const merged = computeMergedSummary([order]);
    expect(merged).toHaveLength(1);
    expect(merged[0].perBranch.SNB).toBe(10);
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

  it('handles zero production without dividing by zero (empty split — nobody gets any)', () => {
    const orders = [makeOrder('snb-1', 'SNB', [{ itemName: 'Buns', quantity: 100 }])];
    const split = autoSplitForItem(orders, 'Buns', 0);
    expect(split['snb-1'] ?? 0).toBe(0);
  });
});

describe('VRSNB pcs → kg helpers', () => {
  const wg = (weightGrams?: number, itemName = 'Mystery Cookie', itemId = 'manual-1') => ({ itemId, itemName, weightGrams });

  it('vrsnbPacketGrams prefers a stored weight, then the name, then catalogue, then the default', () => {
    expect(vrsnbPacketGrams(wg(150))).toBe(150);
    expect(vrsnbPacketGrams(wg(undefined, 'Banana Chips (200g)'))).toBe(200);
    expect(vrsnbPacketGrams(wg(undefined, 'Coconut Biscuit', 'vrsnb-2095'))).toBe(200); // barcode 2090–2108
    expect(vrsnbPacketGrams(wg(undefined, 'Totally Unknown Item', 'manual-9'))).toBe(VRSNB_DEFAULT_PACKET_GRAMS);
  });

  it('pcsToKgForItem converts using the resolved packet weight', () => {
    expect(pcsToKgForItem(wg(200), 10)).toBe(2);
    expect(pcsToKgForItem(wg(200), 7)).toBe(1.4);
    expect(pcsToKgForItem(wg(200), 0)).toBe(0);
  });

  it('kgToPcsForItem ROUNDS to nearest packet (Production Entry), while kgToPcs still FLOORS (Packing)', () => {
    expect(kgToPcsForItem(wg(200), 2.05)).toBe(10);
    expect(kgToPcsForItem(wg(200), 2.14)).toBe(11);
    expect(kgToPcsForItem(wg(200), 2.16)).toBe(11);
    // lock Packing's opposite behaviour so a future edit to one can't silently change the other
    expect(kgToPcs(2.05, 200)).toBe(10);
    expect(kgToPcs(2.16, 200)).toBe(10);
  });
});

describe('passesProductionCutoff', () => {
  const T = (iso: string) => new Date(iso).getTime();

  it('passes everything when there is no cutoff yet', () => {
    expect(passesProductionCutoff({ storeConfirmedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' }, null)).toBe(true);
  });

  it('gates a store-confirmed order on storeConfirmedAt', () => {
    const cutoff = T('2026-09-10T17:30:00Z');
    expect(passesProductionCutoff({ storeConfirmedAt: '2026-09-10T10:00:00Z', createdAt: '2026-09-09T00:00:00Z' }, cutoff)).toBe(false);
    expect(passesProductionCutoff({ storeConfirmedAt: '2026-09-10T18:00:00Z', createdAt: '2026-09-09T00:00:00Z' }, cutoff)).toBe(true);
  });

  it('falls back to createdAt for a Planned batch with no storeConfirmedAt', () => {
    const cutoff = T('2026-09-10T17:30:00Z');
    expect(passesProductionCutoff({ storeConfirmedAt: undefined, createdAt: '2026-09-09T00:00:00Z' }, cutoff)).toBe(false);
    expect(passesProductionCutoff({ storeConfirmedAt: undefined, createdAt: '2026-09-10T20:00:00Z' }, cutoff)).toBe(true);
  });
});
