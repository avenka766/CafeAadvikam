import { buildSalesAnalytics } from './salesAnalytics';
import { REPORT_SOURCES, type ReportSnapshot, type SourceRow } from './reportSources';

export type ReportValue = string | number | boolean | null;
export type ReportRow = Record<string, ReportValue>;
export type ReportSection = { id: string; title: string; group: string; description: string; sourceId: string; rows: ReportRow[] };
const names: Record<string, string> = {
  bill: 'Bill history', advance_final_bill: 'Advance final bills', return: 'Return history',
  purchase_invoice: 'Supplier invoices', purchase_payment: 'Purchase payments', supplier_payment: 'Supplier payments',
  purchase_order: 'Purchase orders', expense: 'Expenses', bank_deposit: 'Bank deposits',
  advance_order: 'Cake & custom advances', cash_movement: 'Cash movements', counter_opening: 'Counter openings',
  cashier_closure: 'Cashier closure history', quotation: 'Quotations', waste_log: 'Waste history',
  complaint: 'Complaint history', audit_log: 'Audit trail', notification: 'Notifications',
  supplier: 'Supplier directory', cashier_profile: 'Cashier directory', salesperson: 'Salesperson directory',
  stock_count_report: 'Stock count history', stock_variance: 'Stock variance history', store_order: 'Store orders',
  hold_bill: 'Held bills', credit_sale: 'Credit history',
};
export function label(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bId\b/g, 'ID').replace(/\bUpi\b/g, 'UPI').replace(/\bGst\b/g, 'GST');
}
export function indiaDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}

// Every scalar survives, including unfamiliar fields added by newer database
// versions. Nested arrays become linked detail sections rather than JSON cells.
export function expandSection(section: Omit<ReportSection, 'rows'>, records: SourceRow[]): ReportSection[] {
  const children = new Map<string, SourceRow[]>();
  const rows = records.map((record, index) => {
    const output: ReportRow = {};
    const parent = { Branch: record.branch || record.Branch || '', 'Parent ID': record.id || record.ID || record.record_id || index + 1,
      'Parent reference': record.bill_no || record.billNo || record.order_number || record.invoiceNo || record.reference || '' };
    const visit = (key: string, value: unknown) => {
      if (Array.isArray(value)) {
        output[`${key} count`] = value.length;
        const list = children.get(key) || [];
        value.forEach((item, i) => list.push({ ...parent, 'Line number': i + 1,
          ...(item !== null && typeof item === 'object' && !Array.isArray(item) ? item : { Value: item }) }));
        children.set(key, list);
      } else if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([child, item]) => visit(key ? `${key} / ${label(child)}` : label(child), item));
      } else {
        const scalar = value === undefined ? null : value as ReportValue;
        // Excel has a 32,767-character cell limit. Preserve long notes in
        // explicitly labelled continuation columns instead of truncating them.
        if (typeof scalar === 'string' && scalar.length > 30000) {
          for (let offset = 0; offset < scalar.length; offset += 30000) output[offset ? `${key} continued ${offset / 30000 + 1}` : key] = scalar.slice(offset, offset + 30000);
        } else output[key] = scalar;
      }
    };
    Object.entries(record).forEach(([key, value]) => visit(label(key), value));
    return output;
  });
  const result: ReportSection[] = [{ ...section, rows }];
  for (const [key, list] of children) {
    result.push(...expandSection({ ...section, id: `${section.id}/${key}`, title: `${section.title} — ${key.toLowerCase()}`,
      description: `One row per detail. Parent ID links to ${section.title}. ${section.description}` }, list));
  }
  return result;
}

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function payload(row: SourceRow): SourceRow {
  return row.payload && typeof row.payload === 'object' ? row.payload as SourceRow : {};
}
function canonicalSales(snapshot: ReportSnapshot): SourceRow[] {
  const bills = new Map<string, SourceRow>();
  for (const row of snapshot.operations?.rows || []) {
    if (!['bill', 'advance_final_bill'].includes(String(row.record_type)) || row.status === 'Deleted') continue;
    const p = payload(row);
    bills.set(`${row.branch}|${p.billNo}`, { branch: row.branch, date: p.createdAt, reference: p.billNo, total: n(p.total),
      discount: n(p.discount), status: p.status, customer: p.creditCustomerName, cashier: p.biller, source: 'Branch bill history', id: p.id });
  }
  for (const row of (snapshot.bills?.rows || []).filter(row => row.bill_type !== 'return')) bills.set(`${row.branch}|${row.bill_no}`, {
    branch: row.branch, date: row.created_at, reference: row.bill_no, total: n(row.total), discount: n(row.discount),
    status: row.status || 'Recorded', customer: row.customer_name, cashier: row.biller || row.cashier_username,
    source: 'Branch bill', id: row.id,
  });
  const result = [...bills.values()];
  for (const row of snapshot.cafe?.rows || []) {
    if (row.status !== 'served' || row.payment_type === 'unpaid') continue;
    result.push({ branch: 'Cafe', date: row.created_at, reference: `CAFE-${String(row.order_number).padStart(4, '0')}`,
      total: n(row.total), discount: n(row.discount), status: row.status, customer: row.customer_name,
      cashier: row.billed_by || row.created_by, source: 'Cafe served order', id: row.id });
  }
  for (const row of snapshot.legacy?.rows || []) {
    if (row.bill_no && bills.has(`${row.branch}|${row.bill_no}`)) continue;
    result.push({ branch: row.branch, date: row.sold_at, reference: row.bill_no || row.id,
      total: n(row.quantity_sold) * n(row.unit_price), discount: 0, status: 'Legacy item', cashier: row.sold_by,
      source: 'Legacy sale item', id: row.id });
  }
  return result.filter(row => !/cancel|void|deleted|returned/i.test(String(row.status)));
}

export function buildReportSections(snapshot: ReportSnapshot, branches: string[]): ReportSection[] {
  const sales = canonicalSales(snapshot);
  const returnMap = new Map<string, SourceRow>();
  for (const row of snapshot.operations?.rows || []) {
    if (row.record_type !== 'return' || row.status === 'Deleted') continue;
    const p = payload(row); returnMap.set(`${row.branch}|${p.returnNo || p.id}`, { branch: row.branch, amount: p.total });
  }
  for (const row of snapshot.returns?.rows || []) returnMap.set(`${row.branch}|${row.return_no || row.id}`, { branch: row.branch, amount: row.amount ?? row.total ?? row.total_amount ?? row.refund_amount });
  const summary: ReportRow[] = branches.map(branch => {
    const list = sales.filter(row => row.branch === branch);
    const billed = list.reduce((sum, row) => sum + n(row.total), 0);
    const returns = [...returnMap.values()].filter(row => row.branch === branch).reduce((sum, row) => sum + n(row.amount), 0);
    const credit = (snapshot.credits?.rows || []).filter(row => row.branch === branch && row.status !== 'settled').reduce((sum, row) => sum + n(row.credit_amount), 0);
    return { Branch: branch, 'Sale records': list.length, 'Recorded sales (INR)': billed, 'Sales returns (INR)': returns,
      'Sales less returns (INR)': billed - returns, 'Current credit due (INR)': credit };
  });
  const salesSources = ['operations', 'bills', 'cafe', 'legacy'];
  const salesReady = salesSources.every(id => snapshot[id]?.status === 'ready');
  const summaryReady = [...salesSources, 'returns', 'credits'].every(id => snapshot[id]?.status === 'ready');
  if (!summaryReady) summary.forEach(row => {
    Object.keys(row).filter(key => key !== 'Branch').forEach(key => { row[key] = null; });
    row.Status = 'Incomplete — source data missing. See Contents / Data coverage.';
  });
  const result: ReportSection[] = [{ id: 'summary', title: 'Branch comparison', group: 'Overview', sourceId: 'summary',
    description: 'Recorded sales include completed Cafe orders, branch bills and unmatched legacy sale items. Current credit is the balance now, across all dates. Source registers may overlap; do not add them together.', rows: summary }];
  const daily = new Map<string, ReportRow>();
  sales.forEach(row => {
    const date = indiaDate(row.date); const key = `${row.branch}|${date}`;
    const day = daily.get(key) || { Branch: String(row.branch), Date: date, 'Sale records': 0, 'Recorded sales (INR)': 0, 'Discount (INR)': 0 };
    day['Sale records'] = n(day['Sale records']) + 1;
    day['Recorded sales (INR)'] = n(day['Recorded sales (INR)']) + n(row.total);
    day['Discount (INR)'] = n(day['Discount (INR)']) + n(row.discount); daily.set(key, day);
  });
  result.push({ id: 'daily', title: 'Daily sales', group: 'Overview', sourceId: 'summary', description: 'India business dates. Discounts are already included in recorded bill totals.', rows: salesReady ? [...daily.values()].sort((a, b) => String(b.Date).localeCompare(String(a.Date))) : [{ Status: 'Incomplete — sales sources have not all loaded.' }] });
  const analyticsReady = [...salesSources, 'billItems', 'catalog', 'cafeMenu', 'returns'].every(id => snapshot[id]?.status === 'ready');
  if (analyticsReady) result.push(...buildSalesAnalytics(snapshot, sales));
  else for (const [id, title] of [['topItems', 'Top items by revenue'], ['categories', 'Category revenue']]) result.push({ id, title, group: 'Overview', sourceId: 'analytics', description: 'Revenue rankings require complete sales, item and category data.', rows: [{ Status: 'Waiting for complete source data. Check Data coverage.' }] });
  result.push(...expandSection({ id: 'sales', title: 'Sales summary detail', group: 'Sales', sourceId: 'summary', description: 'These records make up the recorded sales summary. Legacy item rows are not counted as separate invoices.' }, sales));
  for (const source of REPORT_SOURCES) {
    const returnIds = new Set((snapshot.bills?.rows || []).filter(row => row.bill_type === 'return').map(row => row.id));
    const records = (snapshot[source.id]?.rows || []).filter(row => source.id === 'bills' ? row.bill_type !== 'return' : source.id === 'billItems' ? !returnIds.has(row.bill_id) : true);
    const description = source.scope === 'current' ? 'Current register across all dates, as at the report refresh. This is not a historical closing balance.' : 'Activity in the selected date range. All values are preserved as recorded.';
    if (source.table === 'branch_operation_records') {
      const defaults = source.types || [];
      const types = [...new Set([...records.map(row => String(row.record_type)), ...defaults])].sort();
      for (const type of types) {
        const title = names[type] || label(type);
        const group = /purchase|supplier_payment/.test(type) ? 'Purchases' : /advance|credit/.test(type) ? 'Credit & advances' : /bill|return|quotation/.test(type) ? 'Sales' : /cash|deposit|expense/.test(type) ? 'Money' : /stock|waste/.test(type) ? 'Stock' : source.group;
        result.push(...expandSection({ id: `${source.id}/${type}`, title, group, sourceId: source.id,
          description: `${description} Deleted records are retained with their record status for audit.` }, records.filter(row => row.record_type === type).map(row => ({
            ...payload(row), branch: row.branch, 'record ID': row.record_id, 'record status': row.status,
            'record type': row.record_type, 'recorded at': row.created_at, 'last synced at': row.updated_at,
            'record metadata': Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'payload' && key !== 'branch')),
          }))));
      }
      if (!types.length) result.push({ id: source.id, title: source.title, group: source.group, sourceId: source.id, description, rows: [] });
    } else result.push(...expandSection({ id: source.id, title: source.title, group: source.group, sourceId: source.id, description }, records));
  }
  return result;
}

export function reportColumns(rows: ReportRow[]) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const rank = (key: string) => key === 'Rank' ? -1 : key === 'Branch' ? 0 : /^(Date|Created At|Sold At|Business Date|Closure Date)$/.test(key) ? 1 : /^(Item|Category|Reference|Bill No|Order Number|Invoice No|Item Name|Name|Customer Name|Supplier)$/.test(key) ? 2 : /^(Net revenue \(INR\)|Revenue share \(%\))$/.test(key) ? 3 : key === 'ID' ? 10 : 5;
  return columns.sort((a, b) => rank(a) - rank(b));
}
