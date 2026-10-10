import { expect, it } from 'vitest';
import { uniqueBranchBills } from './uniqueBranchBills';
it('counts checkout and browser copies once using the canonical ledger-linked copy', () => {
  const canonical = { id: 'ledger', sourceBillId: 'ledger', branch: 'VRSNB', billNo: 'VRSNB-2483', total: 440, items: [1] };
  const mirror = { ...canonical, id: 'browser', total: 430 };
  for (const copies of [[mirror, canonical], [canonical, mirror]]) {
    const rows = uniqueBranchBills(copies);
    expect(rows).toEqual([canonical]);
    expect(rows.reduce((sum, b) => sum + b.total, 0)).toBe(440);
  }
});
it('keeps separate branches, credit bills and distinct sales', () => {
  const rows = [
    { id: 'a', branch: 'VRSNB', billNo: '100', paymentMode: 'credit' },
    { id: 'b', branch: 'SNB', billNo: '100' },
    { id: 'c', branch: 'VRSNB', billNo: '101' },
  ];
  expect(uniqueBranchBills(rows)).toEqual(rows);
});
it('keeps distinct unnumbered records instead of collapsing missing bill numbers', () => {
  const rows = [{ id: 'a', branch: 'VRSNB' }, { id: 'b', branch: 'VRSNB' }];
  expect(uniqueBranchBills(rows)).toEqual(rows);
});
