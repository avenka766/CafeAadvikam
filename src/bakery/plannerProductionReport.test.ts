import {expect, it, vi} from 'vitest';
import * as XLSX from 'xlsx';
import {buildProductionDispatchSheet, type ProductionReportMovement} from './plannerProductionReport';
import {generatePreparedExcelReport} from './reportExport';
import type {DispatchEntry} from './types';

const output = vi.hoisted(() => ({writeFile: vi.fn()}));
vi.mock('xlsx', async importOriginal => ({
  ...await importOriginal<typeof XLSX>(),
  writeFile: output.writeFile,
}));

function fixtureRows() {
  const dispatch = (id: string, itemName: string, quantity: number, unit: 'kg' | 'pcs', isExtra: boolean, dispatchedAt = '2026-11-11T13:00:00Z'): DispatchEntry =>
    ({id, itemName, quantity, unit, isExtra, branch: 'SNB', dispatchedAt, dispatchedBy: 'Planner'});
  const movement = (item_slug: string, unit: string, business_date: string, delta: number, reason = 'closing_stock', created_at = `${business_date}T12:00:00Z`): ProductionReportMovement =>
    ({item_slug, item_name: item_slug, unit, business_date, delta, reason, created_at});
  return buildProductionDispatchSheet({
    productionRows: [{itemName: 'Bun', unit: 'pcs', totalRequested: 10, preparedTotal: 30}],
    dispatches: [
      dispatch('1', 'Bun (pcs)', 8, 'pcs', false),
      dispatch('2', 'BUN', 2, 'pcs', true),
      dispatch('3', 'Bun', 1.25, 'kg', true),
      dispatch('4', 'Cake', 0.5, 'kg', true),
      dispatch('5', 'Future', 4, 'pcs', true, '2026-11-11T18:30:00Z'),
    ],
    movements: [
      movement('bun', 'pcs', '2026-11-01', 100),
      movement('bun', 'pcs', '2026-11-10', 6),
      movement('bun', 'pcs', '2026-11-11', 12, 'production_carryover'),
      movement('bun', 'pcs', '2026-11-11', -10, 'dispatch'),
      movement('bun', 'pcs', '2026-11-12', 5),
      movement('bun', 'kg', '2026-11-11', 2.5),
    ],
    from: '2026-11-11', to: '2026-11-11', stockCutoff: '2026-11-08T00:00:00Z',
    categoryFor: () => 'Bakery',
  });
}

it('uses the report end-date balance and counts each extra in dispatch totals once', () => {
  const rows = fixtureRows();
  expect(rows).toHaveLength(3);
  expect(rows.find(row => row.Item === 'Bun' && row.Unit === 'pcs')).toEqual({
    Category: 'Bakery', Item: 'Bun', Unit: 'pcs', Requested: 10, 'Closing Stock': 8,
    Produced: 12, 'Regular Dispatch': 8, 'Extra Dispatch': 2, 'Total Dispatched': 10,
  });
  expect(rows.find(row => row.Item === 'Bun' && row.Unit === 'kg')).toMatchObject({
    Requested: 0, 'Closing Stock': 2.5, 'Extra Dispatch': 1.25, 'Total Dispatched': 1.25,
  });
  expect(rows.find(row => row.Item === 'Cake')).toMatchObject({
    Requested: 0, 'Closing Stock': 0, 'Extra Dispatch': 0.5, 'Total Dispatched': 0.5,
  });
});

it('writes numeric cells and an Excel filter in both report downloads', async () => {
  const sections = [{
    prefix: 'Reports',
    sheets: [{name: 'Production & Dispatch', rows: [], fallback: 'No data',
      loadRows: async () => fixtureRows(), filterRows: true, skipAutomaticTotals: true}],
  }];
  for (const combined of [false, true]) {
    await generatePreparedExcelReport({
      filename: 'planner.xlsx',
      sections: combined ? [...sections, {prefix: 'Other', sheets: []}] : sections,
    });
    const workbook = output.writeFile.mock.lastCall![0] as XLSX.WorkBook;
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet['!autofilter']?.ref).toBe('A1:I4');
    expect(sheet.D1.v).toBe('Requested');
    expect(sheet.E1.v).toBe('Closing Stock');
    expect(sheet.E2.t).toBe('n');
    expect(sheet['!cols']?.[4].wch).toBeGreaterThan(12);
    expect(sheet['!ref']).toBe('A1:I4');
  }
});
