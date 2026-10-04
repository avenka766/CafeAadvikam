import type { ReportSection, ReportRow } from './reportModel';
import type { ReportSnapshot, SourceRow } from './reportSources';

const number = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const normal = (v: unknown) => String(v || '').trim().toLowerCase();
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const array = (v: unknown): SourceRow[] => Array.isArray(v) ? v as SourceRow[] : [];
export function buildSalesAnalytics(snapshot: ReportSnapshot, sales: SourceRow[]): ReportSection[] {
  const catalogue = new Map<string, SourceRow>();
  [...(snapshot.catalog?.rows || []), ...(snapshot.cafeMenu?.rows || [])].forEach(row => catalogue.set(`${row.branch}|${normal(row.name)}`, row));
  const mirrors = new Map<string, SourceRow>();
  const returns = new Map<string, SourceRow>();
  (snapshot.operations?.rows || []).forEach(row => {
    if (row.status === 'Deleted') return;
    const p = (row.payload || {}) as SourceRow;
    if (row.record_type === 'bill' || row.record_type === 'advance_final_bill') mirrors.set(`${row.branch}|${p.billNo}`, p);
    if (row.record_type === 'return') returns.set(`${row.branch}|${p.returnNo || p.id}`, { ...p, branch: row.branch, amount: p.total });
  });
  (snapshot.returns?.rows || []).forEach(row => returns.set(`${row.branch}|${row.return_no || row.id}`, row));
  const items = new Map<string, ReportRow>();
  const cafeById = new Map((snapshot.cafe?.rows || []).map(row => [row.id, row]));
  const legacyById = new Map((snapshot.legacy?.rows || []).map(row => [row.id, row]));
  const linesByBill = new Map<string, SourceRow[]>();
  (snapshot.billItems?.rows || []).forEach(row => {
    const key = `${row.branch}|${row.bill_no}`;
    const list = linesByBill.get(key) || []; list.push(row); linesByBill.set(key, list);
  });
  function allocate(branch: string, lines: SourceRow[], total: number, isReturn = false) {
    const input = lines.length ? lines : [{ item_name: 'Unitemised sale / return', quantity: 0, unit: 'unknown', line_total: total }];
    const weights = input.map(line => Math.max(0, number(line.line_total ?? line.lineTotal ?? line.total ?? (number(line.quantity ?? line.quantity_sold) * number(line.unit_price ?? line.price ?? (line.menuItem as SourceRow)?.price)))));
    const sum = weights.reduce((a, b) => a + b, 0);
    let assigned = 0;
    input.forEach((line, index) => {
      const menu = (line.menuItem || {}) as SourceRow;
      const name = String(line.item_name || line.itemName || menu.name || line.name || 'Unitemised sale / return');
      const catalog = catalogue.get(`${branch}|${normal(name)}`);
      const category = String(line.category || menu.category || catalog?.category || 'Uncategorised');
      const unit = String(line.unit || catalog?.uom || (branch === 'Cafe' ? 'pcs' : 'unknown')).toLowerCase().replace(/^kgs?$/, 'kg');
      const key = `${branch}|${name}|${category}|${unit}`;
      const row = items.get(key) || { Branch: branch, Item: name, Category: category, Unit: unit,
        'Sold quantity': 0, 'Returned quantity': 0, 'Line value before allocation (INR)': 0,
        'Allocated sales (INR)': 0, 'Returns (INR)': 0, 'Net revenue (INR)': 0 };
      const amount = index === input.length - 1 ? money(total - assigned) : money(total * (sum > 0 ? weights[index] / sum : 1 / input.length));
      assigned = money(assigned + amount);
      if (isReturn) {
        row['Returned quantity'] = number(row['Returned quantity']) + number(line.quantity ?? line.quantity_sold);
        row['Returns (INR)'] = money(number(row['Returns (INR)']) + amount);
      } else {
        row['Sold quantity'] = number(row['Sold quantity']) + number(line.quantity ?? line.quantity_sold);
        row['Line value before allocation (INR)'] = money(number(row['Line value before allocation (INR)']) + weights[index]);
        row['Allocated sales (INR)'] = money(number(row['Allocated sales (INR)']) + amount);
      }
      row['Net revenue (INR)'] = money(number(row['Allocated sales (INR)']) - number(row['Returns (INR)']));
      items.set(key, row);
    });
  }
  sales.forEach(sale => {
    let lines: SourceRow[];
    if (sale.source === 'Cafe served order') lines = array(cafeById.get(sale.id)?.items);
    else if (sale.source === 'Legacy sale item') { const row = legacyById.get(sale.id); lines = row ? [row] : []; }
    else {
      lines = linesByBill.get(`${sale.branch}|${sale.reference}`) || [];
      if (!lines.length) lines = array(mirrors.get(`${sale.branch}|${sale.reference}`)?.items);
    }
    allocate(String(sale.branch), lines, number(sale.total));
  });
  returns.forEach(row => allocate(String(row.branch), array(row.items), number(row.amount ?? row.total), true));
  const itemRows = [...items.values()].sort((a, b) => number(b['Net revenue (INR)']) - number(a['Net revenue (INR)']));
  const categories = new Map<string, ReportRow>();
  itemRows.forEach(row => {
    const key = `${row.Branch}|${row.Category}`;
    const category = categories.get(key) || { Branch: row.Branch, Category: row.Category, 'Item / unit combinations': 0,
      'Allocated sales (INR)': 0, 'Returns (INR)': 0, 'Net revenue (INR)': 0 };
    category['Item / unit combinations'] = number(category['Item / unit combinations']) + 1;
    for (const field of ['Allocated sales (INR)', 'Returns (INR)', 'Net revenue (INR)']) category[field] = money(number(category[field]) + number(row[field]));
    categories.set(key, category);
  });
  const categoryRows = [...categories.values()].sort((a, b) => number(b['Net revenue (INR)']) - number(a['Net revenue (INR)']));
  const total = categoryRows.reduce((sum, row) => sum + number(row['Net revenue (INR)']), 0);
  for (const rows of [itemRows, categoryRows]) rows.forEach((row, index) => { row.Rank = index + 1; row['Revenue share (%)'] = total > 0 ? money(number(row['Net revenue (INR)']) / total * 100) : null; });
  const note = 'Ranked by net revenue, not profit. Bill totals (including discounts, tax and charges) are allocated to items in proportion to line value; rounding is reconciled to each bill. Returns in the period are deducted. Missing categories remain Uncategorised. Quantities with different units are kept separate.';
  return [
    { id: 'topItems', title: 'Top items by revenue', group: 'Overview', sourceId: 'analytics', description: note, rows: itemRows },
    { id: 'categories', title: 'Category revenue', group: 'Overview', sourceId: 'analytics', description: note, rows: categoryRows },
  ];
}
