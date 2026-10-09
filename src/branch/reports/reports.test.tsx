import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { REPORT_SOURCES, loadReportSource, reportBounds, type ReportSnapshot } from './reportSources';
import { buildReportSections, expandSection } from './reportModel';
import { buildReportWorkbook } from './reportWorkbook';
import { BranchReportView } from '@/components/admin/VrsnbBranchReports';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ fetchAllRows: mocks.fetch }));
function fixture(): ReportSnapshot {
  const s: ReportSnapshot = Object.fromEntries(REPORT_SOURCES.map(source => [source.id, { rows: [], status: 'ready', error: '' }]));
  s.bills.rows = [{ id: 'b1', branch: 'VRSNB', bill_no: 'B1', total: 90, discount: 10, created_at: '2026-10-01T00:00:00Z' }];
  s.billItems.rows = [{ id: 'i1', bill_id: 'b1', branch: 'VRSNB', bill_no: 'B1', item_name: 'Laddu', quantity: 2, unit: 'pcs', line_total: 100 }];
  s.catalog.rows = [{ branch: 'VRSNB', name: 'Laddu', category: 'Sweets', uom: 'pcs' }];
  s.operations.rows = [{ branch: 'VRSNB', record_type: 'bill', payload: { id: 'mirror', billNo: 'B1', total: 90 } }];
  s.legacy.rows = [{ id: 'dup', branch: 'VRSNB', bill_no: 'B1', quantity_sold: 2, unit_price: 50 }];
  s.cafe.rows = [
    { id: 'c1', branch: 'Cafe', order_number: 1, total: 60, status: 'served', payment_type: 'cash', created_at: '2026-10-01T10:00:00Z', items: [{ menuItem: { name: 'Tea', price: 30, category: 'Drinks' }, quantity: 2 }] },
    { id: 'c2', branch: 'Cafe', order_number: 2, total: 999, status: 'cancelled', payment_type: 'cash', items: [] },
  ];
  s.returns.rows = [{ id: 'r1', branch: 'VRSNB', return_no: 'R1', amount: 45, items: [{ itemName: 'Laddu', quantity: 1, unit: 'pcs', lineTotal: 50 }] }];
  return s;
}

describe('Sales report integrity', () => {
  it('keeps return headers and their items out of sales while retaining a separate return register', () => {
    const snapshot = fixture();
    snapshot.bills.rows.push({ id: 'return-header', branch: 'VRSNB', bill_no: 'VRSNB-RET-0001', bill_type: 'return', total: 45, status: 'returned' });
    snapshot.billItems.rows.push({ bill_id: 'return-header', bill_no: 'VRSNB-RET-0001', item_name: 'Laddu', quantity: 1, line_total: 45 });
    const sections = buildReportSections(snapshot, ['VRSNB']);
    expect(sections[0].rows[0]['Recorded sales (INR)']).toBe(90);
    expect(sections[0].rows[0]['Sales less returns (INR)']).toBe(45);
    expect(sections.find(s => s.id === 'bills')!.rows).toHaveLength(1);
    expect(sections.find(s => s.id === 'billItems')!.rows).toHaveLength(1);
    expect(sections.find(s => s.id === 'returns')!.rows).toHaveLength(1);
  });
  it('reconciles category/item revenue with discounted bills and refunds, without duplicate sales', () => {
    const sections = buildReportSections(fixture(), ['Cafe', 'VRSNB']);
    const summary = sections[0].rows;
    expect(summary.find(r => r.Branch === 'VRSNB')?.['Recorded sales (INR)']).toBe(90);
    expect(summary.find(r => r.Branch === 'Cafe')?.['Recorded sales (INR)']).toBe(60);
    const top = sections.find(s => s.id === 'topItems')!.rows;
    expect(top[0]).toMatchObject({ Item: 'Tea', 'Net revenue (INR)': 60, Rank: 1 });
    expect(top.find(r => r.Item === 'Laddu')).toMatchObject({ 'Allocated sales (INR)': 90, 'Returns (INR)': 45, 'Net revenue (INR)': 45 });
    expect(sections.find(s => s.id === 'categories')!.rows.reduce((sum, r) => sum + Number(r['Net revenue (INR)']), 0)).toBe(105);
  });
  it('keeps cancelled Cafe orders in the detail register while excluding their revenue', () => {
    const sections = buildReportSections(fixture(), ['Cafe', 'VRSNB']);
    expect(sections.find(s => s.id === 'cafe')!.rows).toHaveLength(2);
    expect(sections.find(s => s.id === 'sales')!.rows).toHaveLength(2);
  });
  it('does not show fabricated zero summaries when a source fails', () => {
    const s = fixture(); s.bills.status = 'error'; s.bills.error = 'Timed out';
    const sections = buildReportSections(s, ['Cafe', 'VRSNB']);
    expect(sections[0].rows[0]['Recorded sales (INR)']).toBeNull();
    expect(sections.find(s => s.id === 'topItems')!.rows[0].Status).toContain('Waiting');
  });
  it('keeps nested detail links and notes longer than an Excel cell', () => {
    const sections = expandSection({ id: 'x', title: 'Test', sourceId: 'x', group: 'Sales', description: '' }, [{ id: 'parent', branch: 'Cafe', notes: 'x'.repeat(32000), items: [{ name: 'Tea', quantity: 2 }] }]);
    expect(String(sections[0].rows[0].Notes).length).toBe(30000);
    expect(String(sections[0].rows[0]['Notes continued 2']).length).toBe(2000);
    expect(sections[1].rows[0]['Parent ID']).toBe('parent');
  });
  it('excludes purchases, supplier payments and deposits from requested report sources', () => {
    expect(REPORT_SOURCES.some(s => /purchase|supplier|deposit/.test(s.id + s.table) && s.id !== 'operations')).toBe(false);
    const s = buildReportSections(fixture(), ['Cafe']);
    expect(s.some(row => /Supplier invoices|Supplier payments|Bank deposits/.test(row.title))).toBe(false);
  });
  it('uses exact India boundaries and rejects invalid dates', () => {
    expect(reportBounds('2026-10-01', '2026-10-01').until).toBe('2026-10-01T18:30:00.000Z');
    expect(() => reportBounds('2026-02-30', '2026-03-02')).toThrow();
  });
  it('queries the real catalogue key and preserves branch scope', async () => {
    const calls: unknown[][] = [];
    mocks.fetch.mockImplementation(async (_table, build, options) => {
      const q: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['select', 'eq', 'order']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
      build(q); expect(options.maxRows).toBe(Infinity); return { data: [], error: null };
    });
    await loadReportSource(REPORT_SOURCES.find(s => s.id === 'catalog')!, ['VRSNB'], '2026-10-01', '2026-10-01', {}, () => false);
    expect(calls).toContainEqual(['eq', 'branch', 'VRSNB']); expect(calls).toContainEqual(['order', 'barcode', { ascending: true }]);
  });
  it('exports every record, identifiers as text and numbers as numbers in a real XLSX workbook', () => {
    const s = fixture(); const sections = buildReportSections(s, ['Cafe', 'VRSNB']);
    sections.push({ id: 'large', title: 'Export all rows', group: 'Sales', description: 'Test', sourceId: 'bills', rows: Array.from({ length: 121 }, (_, i) => ({ ID: `000${i}`, 'Bank Account': '00123456789', Amount: i + .5, Notes: '=SUM(A1:A9)' })) });
    const book = buildReportWorkbook(sections, { from: '2026-10-01', to: '2026-10-01', branches: ['Cafe', 'VRSNB'], generatedBy: 'Test', loadedAt: '2026-10-01', snapshot: s });
    const read = XLSX.read(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const sheet = read.Sheets['Export all rows'];
    const rows = XLSX.utils.sheet_to_json(sheet, { range: 4 });
    expect(rows).toHaveLength(121);
    expect(rows[0]).toMatchObject({ ID: '0000', 'Bank Account': '00123456789', Amount: .5, Notes: '=SUM(A1:A9)' });
    expect(sheet['!autofilter']).toBeTruthy();
    expect(read.SheetNames[0]).toBe('Contents');
    expect(read.SheetNames.some(n => n.startsWith('Category revenue'))).toBe(true);
  });
  it('renders category navigation and disables export until loading completes', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); const root = createRoot(host);
    const props = { fromDate: '2026-10-01', toDate: '2026-10-01', reportBranches: ['Cafe', 'VRSNB'] as ('Cafe' | 'VRSNB')[], userName: 'Test', report: { snapshot: fixture(), loading: true, error: '', loadedAt: '', refresh: vi.fn() } };
    await act(async () => root.render(<BranchReportView {...props} />));
    const exportButton = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Download complete Excel'))!;
    expect(exportButton.disabled).toBe(true);
    await act(async () => root.render(<BranchReportView {...props} report={{ ...props.report, loading: false, loadedAt: '2026-10-01' }} />));
    const categories = Array.from(host.querySelectorAll('nav button')).find(b => b.textContent?.startsWith('Category revenue'))!;
    await act(async () => (categories as HTMLButtonElement).click());
    expect(host.querySelector('table')?.textContent).toContain('Drinks');
    expect(host.querySelector('table')?.textContent).toContain('Sweets');
    await act(async () => root.unmount());
  });
});
