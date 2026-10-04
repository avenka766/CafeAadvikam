import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { FESTIVAL_PRODUCTION_TABLE, festivalSummary, festivalWorkbook, saveFestivalProduction, validateFestivalInput, type FestivalEntry, type FestivalInput } from '../festivalProduction';
import FestivalProductionPanel from '../FestivalProductionPanel';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), fetch: vi.fn(), from: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from }, fetchAllRows: mocks.fetch }));
vi.mock('@/stores/branchCatalogStore', () => ({ useBranchCatalogStore: () => ({ loadCatalog: mocks.load, items: {
  SNB: [{ name: 'SNB Sweet', barcode: 1, active: true, uom: 'Kgs' }],
  VRSNB: [{ name: 'VRSNB Snack', barcode: 2, active: true, uom: 'Nos' }],
} }) }));
const input: FestivalInput = { business_date: '2026-01-01', festival_name: 'Festival batch', item_name: 'Custom sweet', catalog_branch: null, catalog_barcode: null, quantity: 2.5, unit: 'kg', notes: '' };
beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.fetch.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.from.mockReset().mockImplementation(table => { expect(table).toBe(FESTIVAL_PRODUCTION_TABLE); return { insert: mocks.insert }; });
});
describe('Festival production isolation and quantities', () => {
  it('accepts a free-text item without a catalogue branch or barcode', async () => {
    expect(validateFestivalInput(input)).toBe('');
    await saveFestivalProduction('idempotent-id', input);
    expect(mocks.from).toHaveBeenCalledWith('planner_festival_production');
    expect(mocks.insert).toHaveBeenCalledWith({ id: 'idempotent-id', ...input });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('rejects zero, negative, fractional pieces, invalid and future dates', () => {
    for (const change of [{ quantity: 0 }, { quantity: -1 }, { unit: 'pcs' as const, quantity: 1.5 }, { quantity: .0001 }, { business_date: '2026-02-30' }, { business_date: '2999-01-01' }]) expect(validateFestivalInput({ ...input, ...change })).not.toBe('');
  });
  it('never combines kg and pcs or catalogue branches in its summary', () => {
    const rows = [{ ...input, id: '1' }, { ...input, id: '2', quantity: 3, unit: 'pcs' }, { ...input, id: '3', catalog_branch: 'SNB', catalog_barcode: 1 }] as FestivalEntry[];
    expect(festivalSummary(rows)).toHaveLength(3);
  });
  it('exports every matching festival entry and a separate summary sheet', () => {
    const rows = Array.from({ length: 75 }, (_, i) => ({ ...input, id: String(i), recorded_by_name: 'Planner', created_at: '2026-01-01T10:00:00Z' })) as FestivalEntry[];
    const book = festivalWorkbook(rows, '2026-01-01', '2026-01-01');
    const read = XLSX.read(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
    expect(read.SheetNames).toEqual(['Summary', 'Entry details']);
    expect(XLSX.utils.sheet_to_json(read.Sheets['Entry details'], { range: 3 })).toHaveLength(75);
    expect(XLSX.utils.sheet_to_json(read.Sheets.Summary, { range: 3 })[0]).toMatchObject({ Quantity: 187.5, Unit: 'kg' });
  });
  it('keeps the retry UUID when an insert response is lost and handles an existing entry safely', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'Duplicate id' } });
    mocks.from.mockImplementation(table => { expect(table).toBe(FESTIVAL_PRODUCTION_TABLE); return { insert: mocks.insert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'same-id' }, error: null }) }) }) }; });
    await expect(saveFestivalProduction('same-id', input)).resolves.toBeUndefined();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it('offers both branch catalogues and custom names in the production form', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<FestivalProductionPanel />));
    const picker = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => picker.focus());
    expect(host.textContent).toContain('SNB Sweet'); expect(host.textContent).toContain('VRSNB Snack');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(picker, 'New festival sweet');
      picker.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).toContain('Use “New festival sweet” as a custom item');
    expect(mocks.fetch.mock.calls.every(call => call[0] === 'planner_festival_production')).toBe(true);
    await act(async () => root.unmount()); host.remove();
  });
});
