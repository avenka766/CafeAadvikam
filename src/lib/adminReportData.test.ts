import { describe, expect, it } from 'vitest';
import { chronological, fetchAdminRows } from './adminReportData';
import { reportBounds } from '@/branch/reports/reportSources';
describe('Admin report completeness', () => {
  it('retains every bill and item across pages with identical timestamps', async () => {
    const rows = Array.from({ length: 2501 }, (_, n) => ({ id: String(n).padStart(5, '0'), created_at: '2026-09-06T06:00:00Z' }));
    const result = await fetchAdminRows(() => {
      let cursor = '';
      return { order: () => ({ gt: (_key: string, value: string) => { cursor = value; return { limit: async (n: number) => ({ data: rows.filter(r => r.id > cursor).slice(0,n), error: null }) }; }, limit: async (n: number) => ({ data: rows.slice(0,n), error: null }) }) };
    });
    expect(result.error).toBeNull(); expect(result.data).toEqual(rows);
  });
  it('sorts September from 1 to 30 without changing recorded dates or bill numbers', () => {
    const rows = [{ billNo: 4918, createdAt: '2026-09-30T07:08:13Z' }, { billNo: 4915, createdAt: '2026-09-06T06:46:36Z' }, { billNo: 1717, createdAt: '2026-09-01T12:59:00Z' }];
    expect(chronological(rows).map(r=>r.billNo)).toEqual([1717,4915,4918]);
    expect(rows[0].billNo).toBe(4918);
  });
  it('includes the whole last day in India, including sub-millisecond timestamps', () => {
    expect(reportBounds('2026-09-01','2026-09-30')).toMatchObject({ from:'2026-09-01T00:00:00+05:30', until:'2026-09-30T18:30:00.000Z' });
  });
});
