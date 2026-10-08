import { expect, it } from 'vitest';
import { allocateReportItems } from './reportItemAllocation';
it('reconciles discount and rounding exactly to the saved bill total', () => {
  const rows = allocateReportItems([{ lineTotal: 100 }, { lineTotal: 200 }, { lineTotal: 300 }], 571);
  expect(rows.reduce((s, i) => s + Math.round(i.allocatedSales * 100), 0)).toBe(57100);
  expect(rows.reduce((s, i) => s + i.lineTotal, 0)).toBe(600);
});
it('does not discount already adjusted historical lines twice', () => {
  expect(allocateReportItems([{ lineTotal: 3450 }], 3450)[0].billAdjustment).toBe(0);
});
it('handles refunds and zero-value lines without losing a cent', () => {
  expect(allocateReportItems([{ lineTotal: 0 }, { lineTotal: 0 }], -1).map(i => i.allocatedSales)).toEqual([-0.5, -0.5]);
});
