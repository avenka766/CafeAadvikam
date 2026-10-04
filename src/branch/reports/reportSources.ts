import { fetchAllRows } from '@/lib/supabase';
import type { Branch } from '@/branch/types';

export type SourceRow = Record<string, unknown>;
export type ReportSource = {
  id: string; title: string; group: string; table: string; date?: string;
  scope?: 'current'; cafeOnly?: boolean; types?: string[]; excludeTypes?: string[];
  parent?: string; parentColumn?: string; dateOnly?: boolean;
  orFilter?: string;
  orderColumn?: string;
  vrsnbOnly?: boolean; noBranchColumn?: boolean;
};
export type SourceResult = { rows: SourceRow[]; status: 'loading' | 'ready' | 'error'; error: string };
export type ReportSnapshot = Record<string, SourceResult>;
export const REPORT_SOURCES: ReportSource[] = [
  { id: 'bills', title: 'Branch bills', group: 'Sales', table: 'branch_bill_headers', date: 'created_at' },
  { id: 'billItems', title: 'Branch bill items', group: 'Sales', table: 'branch_bill_items', parent: 'bills', parentColumn: 'bill_id' },
  { id: 'payments', title: 'Branch payment receipts', group: 'Money', table: 'branch_sale_payments', date: 'created_at' },
  { id: 'returns', title: 'Branch sales returns', group: 'Sales', table: 'branch_return_records', date: 'created_at' },
  { id: 'legacy', title: 'Branch sales item register', group: 'Sales', table: 'branch_sales', date: 'sold_at' },
  { id: 'cafe', title: 'Cafe orders — all statuses', group: 'Sales', table: 'orders', date: 'created_at', cafeOnly: true },
  { id: 'cafeMenu', title: 'Cafe menu & prices', group: 'Reference', table: 'menu_items', scope: 'current', cafeOnly: true },
  { id: 'credits', title: 'Customer credit ledger', group: 'Credit & advances', table: 'branch_credit_sales', scope: 'current' },
  { id: 'creditPayments', title: 'Credit collections', group: 'Credit & advances', table: 'branch_credit_payments', date: 'created_at' },
  { id: 'catalog', title: 'Branch item catalogue', group: 'Reference', table: 'branch_items', scope: 'current', orderColumn: 'barcode' },
  // Keep every operation type, including types added by later app versions.
  { id: 'operations', title: 'Operation history', group: 'Operations', table: 'branch_operation_records', date: 'created_at', types: ['bill', 'advance_final_bill', 'return', 'bill_duplicate_print'] },
  { id: 'advancePayments', title: 'Advance receipts', group: 'Credit & advances', table: 'branch_advance_payments', date: 'created_at' },
  { id: 'paymentEdits', title: 'Branch payment edits', group: 'Money', table: 'branch_payment_mode_edits', date: 'changed_at' },
  { id: 'cafePaymentEdits', title: 'Cafe payment edits', group: 'Money', table: 'cafe_payment_mode_edits', date: 'changed_at', cafeOnly: true },
];

export function reportBounds(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Choose a valid start and end date.');
  for (const day of [from, to]) {
    const date = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error('Choose a valid calendar date.');
  }
  const next = new Date(`${to}T00:00:00+05:30`);
  next.setTime(next.getTime() + 86400000);
  return { from: `${from}T00:00:00+05:30`, until: next.toISOString(), nextDay: new Date(`${to}T00:00:00Z`).getTime() + 86400000 };
}

export async function loadReportSource(source: ReportSource, branches: Branch[], from: string, to: string, snapshot: ReportSnapshot, cancelled: () => boolean): Promise<SourceResult> {
  const bounds = reportBounds(from, to);
  const rows: SourceRow[] = [];
  const errors: string[] = [];
  const selected = source.cafeOnly ? branches.filter(branch => branch === 'Cafe') : source.vrsnbOnly ? branches.filter(branch => branch === 'VRSNB') : branches;
  for (const branch of selected) {
    const parent = source.parent ? snapshot[source.parent] : null;
    if (parent?.status === 'error') errors.push(`${branch}: related bills could not be fully loaded.`);
    const ids = parent?.rows.filter(row => row.branch === branch).map(row => row.id).filter(Boolean) || [];
    const batches = source.parent ? Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, i * 200 + 200)) : [null];
    for (const batch of batches) {
      if (cancelled()) return { rows: [], status: 'loading', error: '' };
      try {
        const result = await fetchAllRows<SourceRow>(source.table, query => {
          let q = query.select('*');
          if (!source.cafeOnly && !source.noBranchColumn) q = q.eq('branch', branch);
          if (source.types) q = q.in('record_type', source.types);
          if (source.orFilter) q = q.or(source.orFilter);
          if (source.excludeTypes) q = q.not('record_type', 'in', `(${source.excludeTypes.join(',')})`);
          if (batch) q = q.in(source.parentColumn, batch);
          if (source.date) {
            q = q.gte(source.date, source.dateOnly ? from : bounds.from)
              .lt(source.date, source.dateOnly ? new Date(bounds.nextDay).toISOString().slice(0, 10) : bounds.until);
          }
          // A unique final key prevents records with identical timestamps from
          // being lost at a page boundary. No cursor or row-count truncation.
          return q.order(source.orderColumn || 'id', { ascending: true });
        }, { maxRows: Infinity });
        rows.push(...result.data.map(row => ({ ...row, branch })));
        if (result.error) errors.push(`${branch}: ${result.error}`);
      } catch (cause) { errors.push(`${branch}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
  }
  return { rows, status: errors.length ? 'error' : 'ready', error: errors.join(' | ') };
}
