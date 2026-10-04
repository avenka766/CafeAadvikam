import { supabase, fetchAllRows } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export const FESTIVAL_PRODUCTION_TABLE = 'planner_festival_production';
export type FestivalEntry = {
  id: string; business_date: string; festival_name: string; item_name: string;
  catalog_branch: 'SNB' | 'VRSNB' | null; catalog_barcode: number | null;
  quantity: number; unit: 'kg' | 'pcs'; notes: string; recorded_by: string; recorded_by_name: string; created_at: string;
};
export type FestivalInput = Pick<FestivalEntry, 'business_date' | 'festival_name' | 'item_name' | 'catalog_branch' | 'catalog_barcode' | 'quantity' | 'unit' | 'notes'>;
export function festivalToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function validateFestivalInput(input: FestivalInput): string {
  if (!input.item_name.trim() || input.item_name.trim().length > 240) return 'Enter an item name (up to 240 characters).';
  if (!input.festival_name.trim() || input.festival_name.trim().length > 120) return 'Enter a festival or batch name (up to 120 characters).';
  if (!['kg', 'pcs'].includes(input.unit)) return 'Choose kg or pcs.';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 1000000000) return 'Enter a positive production quantity.';
  if (input.unit === 'pcs' && !Number.isInteger(input.quantity)) return 'Pieces must be a whole number.';
  if (Math.abs(input.quantity * 1000 - Math.round(input.quantity * 1000)) > 0.000001) return 'Use no more than three decimal places for kilograms.';
  const date = new Date(`${input.business_date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.business_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.business_date || input.business_date > festivalToday()) return 'Choose a valid production date, today or earlier.';
  if (input.notes.length > 2000) return 'Keep notes within 2,000 characters.';
  return '';
}
export async function saveFestivalProduction(id: string, input: FestivalInput) {
  const validation = validateFestivalInput(input);
  if (validation) throw new Error(validation);
  const { error } = await supabase.from(FESTIVAL_PRODUCTION_TABLE).insert({ id, ...input });
  if (!error) return;
  if (error.code === '23505') {
    // Retry after a lost response reuses the same UUID and cannot double count.
    const existing = await supabase.from(FESTIVAL_PRODUCTION_TABLE).select('id').eq('id', id).maybeSingle();
    if (!existing.error && existing.data?.id === id) return;
  }
  throw new Error(error.message);
}
export async function fetchFestivalProduction(from: string, to: string) {
  if (!from || !to || from > to) throw new Error('Choose a valid report date range.');
  const { data, error } = await fetchAllRows<FestivalEntry>(FESTIVAL_PRODUCTION_TABLE, query => query.select('*')
    .gte('business_date', from).lte('business_date', to).order('created_at', { ascending: false }).order('id', { ascending: false }), { maxRows: Infinity });
  if (error) throw new Error(error);
  return data.map(row => ({ ...row, quantity: Number(row.quantity) }));
}
export function festivalSummary(rows: FestivalEntry[]) {
  const totals = new Map<string, { Festival: string; Item: string; 'Catalogue branch': string; Unit: string; Quantity: number; Entries: number }>();
  rows.forEach(row => {
    const key = JSON.stringify([row.festival_name, row.item_name, row.catalog_branch, row.unit]);
    const total = totals.get(key) || { Festival: row.festival_name, Item: row.item_name, 'Catalogue branch': row.catalog_branch || 'Custom item', Unit: row.unit, Quantity: 0, Entries: 0 };
    total.Quantity = Math.round((total.Quantity + row.quantity) * 1000) / 1000; total.Entries++;
    totals.set(key, total);
  });
  return [...totals.values()];
}
export function festivalWorkbook(rows: FestivalEntry[], from: string, to: string) {
  const book = XLSX.utils.book_new();
  const details = rows.map(row => ({ Date: row.business_date, Festival: row.festival_name, Item: row.item_name,
    'Catalogue branch': row.catalog_branch || 'Custom item', Barcode: row.catalog_barcode == null ? '' : String(row.catalog_barcode), Quantity: row.quantity, Unit: row.unit,
    'Recorded by': row.recorded_by_name, Notes: row.notes, 'Recorded at (UTC)': row.created_at, 'Entry ID': row.id }));
  for (const [name, data] of [['Summary', festivalSummary(rows)], ['Entry details', details]] as const) {
    const headers = data.length ? Object.keys(data[0]) : ['Status'];
    const sheet = XLSX.utils.aoa_to_sheet([['Festival Production'], [`${from} to ${to}. Separate from normal production, dispatch and closing stock.`], [], headers,
      ...(data.length ? data.map(row => headers.map(key => (row as Record<string, unknown>)[key])) : [['No festival production in this range.']])]);
    sheet['!cols'] = headers.map(key => ({ wch: key === 'Notes' || key === 'Item' ? 40 : key.includes('ID') || key.includes('at') ? 30 : 22 }));
    sheet['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }));
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: data.length + 3, c: headers.length - 1 } }) };
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return book;
}
export function downloadFestivalReport(rows: FestivalEntry[], from: string, to: string) {
  XLSX.writeFile(festivalWorkbook(rows, from, to), `Festival_Production_${from}_to_${to}.xlsx`, { compression: true });
}
