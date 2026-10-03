import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReportRecords, mergeReportClosures, useVrsnbReportRecords, type ReportRecord } from './useVrsnbReportRecords';
import { useCafeOrderRows } from './useCafeOrderRows';

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ fetchAllRows: mock.fetch }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.fetch.mockReset().mockResolvedValue({ data: [], error: null });
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });
const record = (branch: 'Cafe' | 'VRSNB', type: string, id: string, status = 'Active'): ReportRecord => ({
  branch, record_type: type, record_id: id, status, payload: { id, branch, total: 25 },
});

describe('VRSNB report data', () => {
  it('preserves both branches and supplier payment formats, excluding deleted records', () => {
    const rows = buildReportRecords([
      record('Cafe', 'bill', 'same'), record('VRSNB', 'bill', 'same'),
      record('Cafe', 'purchase_payment', 'p1'), record('VRSNB', 'supplier_payment', 'p2'),
      record('Cafe', 'expense', 'deleted', 'Deleted'), record('Cafe', 'expense', 'live'),
    ]);
    expect(rows.bills.map(row => row.branch)).toEqual(['Cafe', 'VRSNB']);
    expect(rows.purchasePayments).toHaveLength(2);
    expect(rows.expenses.map(row => row.id)).toEqual(['live']);
  });

  it('queries both branches, full pagination and the correct business dates', async () => {
    const filters: unknown[][] = [];
    mock.fetch.mockImplementation(async (_table, build, options) => {
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order']) {
        query[method] = (...args) => { filters.push([method, ...args]); return query; };
      }
      build(query);
      expect(options.maxRows).toBe(Infinity);
      return { data: [], error: null };
    });
    function Probe() { useVrsnbReportRecords('2026-09-01', '2026-09-30', ['Cafe', 'VRSNB']); return null; }
    await act(async () => root.render(<Probe />));
    expect(filters).toContainEqual(['eq', 'branch', 'Cafe']);
    expect(filters).toContainEqual(['eq', 'branch', 'VRSNB']);
    expect(filters).toContainEqual(['gte', 'created_at', '2026-09-01T00:00:00+05:30']);
    expect(filters).toContainEqual(['gte', 'payload->>expenseDate', '2026-09-01']);
    expect(filters).toContainEqual(['lte', 'payload->>depositDate', '2026-09-30']);
  });

  it('shows failures while retaining successfully loaded records', async () => {
    mock.fetch.mockResolvedValueOnce({ data: [record('Cafe', 'bill', 'cafe-bill')], error: null })
      .mockResolvedValueOnce({ data: [], error: 'Connection lost' });
    let result: ReturnType<typeof useVrsnbReportRecords>;
    function Probe() { result = useVrsnbReportRecords('2026-09-01', '2026-09-30', ['Cafe']); return null; }
    await act(async () => root.render(<Probe />));
    expect(result!.bills[0].id).toBe('cafe-bill');
    expect(result!.error).toContain('Connection lost');
    expect(result!.loading).toBe(false);
  });

  it('includes older sales without counting bill-backed item rows twice', async () => {
    mock.fetch.mockImplementation(async (table) => ({ data: table === 'branch_sales' ? [
      { id: 'duplicate', bill_no: 'B1', item_name: 'Tea', quantity_sold: 2, unit_price: 10 },
      { id: 'legacy', bill_no: 'B0', item_name: 'Coffee', quantity_sold: 1, unit_price: 20 },
    ] : [{ ...record('Cafe', 'bill', 'bill'), payload: { id: 'bill', billNo: 'B1' } }], error: null }));
    let result: ReturnType<typeof useVrsnbReportRecords>;
    function Probe() { result = useVrsnbReportRecords('2026-09-01', '2026-09-30', ['Cafe']); return null; }
    await act(async () => root.render(<Probe />));
    expect(result!.legacySales.map(row => row.id)).toEqual(['legacy']);
  });

  it('uses saved daily closures even when operation history has no closure mirror', () => {
    const saved = { id: 'saved', branch: 'Cafe', closure_date: '2026-09-02', cashier: 'Cashier', actual_cash: 200, expected_cash: 200 };
    const rows = mergeReportClosures([], [saved as never]);
    expect(rows[0]).toMatchObject({ branch: 'Cafe', closingCash: 200, cashier: 'Cashier' });
    expect(mergeReportClosures(rows, [saved as never])).toHaveLength(1);
  });

  it('does not let an older scope request overwrite a newer one', async () => {
    let resolveOld!: (value: unknown) => void;
    mock.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    let result: ReturnType<typeof useVrsnbReportRecords>;
    function Probe({ branch }: { branch: 'Cafe' | 'VRSNB' }) { result = useVrsnbReportRecords('2026-09-01', '2026-09-30', [branch]); return null; }
    await act(async () => root.render(<Probe branch="Cafe" />));
    await act(async () => root.render(<Probe branch="VRSNB" />));
    await act(async () => resolveOld({ data: [record('Cafe', 'bill', 'old')], error: null }));
    expect(result!.bills).toEqual([]);
    expect(result!.loading).toBe(false);
  });
});

describe('Cafe history rows', () => {
  it('returns individual Cafe bills and clears them when Cafe is deselected', async () => {
    mock.fetch.mockResolvedValue({ data: [{ id: 'order', order_number: 42, total: '120', payment_type: 'cash', items: [] }], error: null });
    let result: ReturnType<typeof useCafeOrderRows>;
    function Probe({ enabled }: { enabled: boolean }) { result = useCafeOrderRows('2026-09-01', '2026-09-30', enabled); return null; }
    await act(async () => root.render(<Probe enabled />));
    expect(result!.rows[0]).toMatchObject({ billNo: 'CAFE-0042', total: 120 });
    await act(async () => root.render(<Probe enabled={false} />));
    expect(result!.rows).toEqual([]);
  });

  it('reports fetch errors instead of presenting a successful empty history', async () => {
    mock.fetch.mockRejectedValue(new Error('Offline'));
    let result: ReturnType<typeof useCafeOrderRows>;
    function Probe() { result = useCafeOrderRows('2026-09-01', '2026-09-30', true); return null; }
    await act(async () => root.render(<Probe />));
    expect(result!.error).toContain('Offline');
    expect(result!.loading).toBe(false);
  });
});
