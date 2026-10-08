import { describe, expect, it } from 'vitest';
import { branchReportTotals } from './branchReportTotals';
describe('Branch sales reconciliation', () => {
  it('reconciles sales and refunds without deducting a return twice', () => {
    expect(branchReportTotals([{ total: 100, status: 'original' }, { total: 20, status: 'returned' }], 20))
      .toEqual({ totalSales: 100, netSales: 80, returns: 20, orderCount: 1 });
  });
  it('counts duplicate prints once and excludes cancelled bills', () => {
    expect(branchReportTotals([{ total: 50, status: 'duplicate_printed' }, { total: 90, status: 'cancelled' }], 0).totalSales).toBe(50);
  });
  it('retains refund-only ranges instead of inventing sales', () => {
    expect(branchReportTotals([], 20)).toEqual({ totalSales: 0, netSales: -20, returns: 20, orderCount: 0 });
  });
});
