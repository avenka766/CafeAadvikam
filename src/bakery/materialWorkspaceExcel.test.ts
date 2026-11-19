import { describe, expect, it, vi } from 'vitest';
import type { MaterialLine, PurchaseData, PurchaseOrder, Receipt, StockData } from './materialWorkspace';
import { purchaseSheets, readMaterialWorkbook, stockHeadings, stockSheets } from './materialWorkspaceExcel';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const baseLine: MaterialLine = { stock_id: 'sugar', name: 'Sugar', quantity: 100, unit: 'kg', price: 45 };
const purchase: PurchaseOrder = {
  id: 'po', number: 1, supplier_id: 'supplier', supplier: 'Supplier A', status: 'received',
  lines: [baseLine, { stock_id: 'flour', name: 'Flour', quantity: 20, unit: 'kg', price: 31 }],
  automatic: false, expected_date: null, notes: '', created_at: '2026-11-11T19:00:00Z',
  created_by: 'GRN', reviewed_at: '2026-11-12T08:00:00Z', reviewed_by: 'Owner', review_note: null, version: 4,
};
const receipt: Receipt = {
  id: 'receipt', number: 1, po_id: 'po', inward_date: '2026-11-13', supplier_invoice: 'INV-112',
  created_at: '2026-11-14T06:00:00Z', supplier_invoice_date: '2026-11-13', created_by: 'GRN',
  delivery_reference: '', notes: '', lines: [{ ...baseLine, quantity: 98, price: 46 }],
};
const data: PurchaseData = { orders: [purchase], receipts: [receipt], materials: [], suppliers: [], catalogue: [] };

describe('Stock and GRN Excel workbooks', () => {
  it('puts each item on its own PO row and uses the India calendar date', () => {
    const sheets = purchaseSheets(data, '2026-11-12', '2026-11-13');
    expect(sheets.map(sheet => sheet.name)).toEqual(['Daily PO Report', 'Approved Status', 'GRN']);
    expect(sheets[0].rows.map(row => row.slice(4, 8))).toEqual([['Sugar', 100, 'kg', 45], ['Flour', 20, 'kg', 31]]);
    expect(sheets[1].rows.map(row => row[8])).toEqual(['Approved', 'Approved']);
    expect(sheets[2].rows[0].slice(4, 13)).toEqual(['Sugar', 100, 'kg', 45, 'GRN-000001', '14 Nov 2026', '13 Nov 2026', 98, 46]);
  });

  it('filters the GRN by inward date even when its PO is older', () => {
    const [daily, approval, grn] = purchaseSheets(data, '2026-11-13', '2026-11-13');
    expect(daily.rows).toEqual([]);
    expect(approval.rows).toEqual([]);
    expect(grn.rows).toHaveLength(1);
  });

  it('shows stock limits and records a multi-material issue under a single recipe', () => {
    const stock: StockData = { materials: [], opening: [
      { name: 'Sugar', quantity: 3, unit: 'kg', minimum: 5, maximum: 10, captured_at: '2026-11-12T18:30:00Z' },
      { name: 'Flour', quantity: 15, unit: 'kg', minimum: 2, maximum: 12, captured_at: '2026-11-12T18:30:00Z' },
    ], outward: [{ id: 'issue', section: 'Sweets', recipe: 'Mysore Pak', reason: 'Production', created_at: receipt.created_at,
      created_by: 'Stock', lines: purchase.lines.map(({ name, unit }) => ({ name, unit, quantity: 1, before: 3, after: 2 })) }] };
    const [opening, outward] = stockSheets(stock, '2026-11-13');
    expect(opening.rows.map(row => row[4])).toEqual(['Below minimum', 'Above maximum']);
    expect(outward.rows.map(row => row.slice(1, 6))).toEqual([
      ['Sweets', 'Mysore Pak', 'Sugar', 1, 'kg'], ['Sweets', 'Mysore Pak', 'Flour', 1, 'kg'],
    ]);
  });

  it('reads the edit baseline from the workbook and identifies bad rows', async () => {
    const { utils, write } = await import('xlsx');
    const file = (row: Array<string | number>) => {
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([stockHeadings, row]), 'Raw Material Import');
      return { name: 'Stock.xlsx', size: 100, arrayBuffer: async () => write(book, { type: 'array', bookType: 'xlsx' }) } as File;
    };
    expect(await readMaterialWorkbook(file(['Sugar', 10, 'kg', 5, 25, 8]), 'stock')).toEqual([
      { name: 'Sugar', quantity: 10, unit: 'kg', minimum: 5, maximum: 25, expected: 8 },
    ]);
    await expect(readMaterialWorkbook(file(['Sugar', 'wrong', 'kg']), 'stock')).rejects.toThrow('Row 2 has an invalid Qty');
  });
});

