import { useCallback, useEffect, useState } from 'react';
import { fetchAllRows } from '@/lib/supabase';
import { uniqueBranchBills } from '@/lib/uniqueBranchBills';
import type { useBranchOpsStore } from '@/branch/branchOpsStore';
import type { Branch } from '@/branch/types';
import type { SaleRecord } from '@/branch/branchStore';
import type { LedgerSavedClosure } from './useBranchLedger';

const recordTypes = {
  bills: ['bill', 'advance_final_bill'], returns: ['return'],
  purchases: ['purchase_invoice'], purchasePayments: ['purchase_payment', 'supplier_payment'],
  expenses: ['expense'], bankDeposits: ['bank_deposit'], wasteLogs: ['waste_log'],
  quotations: ['quotation'], cashierClosures: ['cashier_closure'],
  auditLogs: ['audit_log'], complaints: ['complaint'],
} as const;
type Bucket = keyof typeof recordTypes;
type Records = Pick<ReturnType<typeof useBranchOpsStore.getState>, Bucket>;
export function mergeReportClosures(local: Records['cashierClosures'], saved: LedgerSavedClosure[]): Records['cashierClosures'] {
  const remote = saved.map(row => ({
    id: row.id, branch: row.branch, createdAt: `${row.closure_date}T12:00:00+05:30`,
    cashier: row.cashier, openingCash: Number(row.opening_cash), closingCash: Number(row.actual_cash),
    expectedCash: Number(row.expected_cash), difference: Number(row.difference), cash: Number(row.cash_total),
    upi: Number(row.upi_total), card: Number(row.card_total), returns: Number(row.refunds),
    discounts: Number(row.discounts), billsCount: Number(row.bill_count), duplicateBills: Number(row.duplicate_prints),
    creditSales: Number(row.credit_billed), creditCollections: Number(row.credit_collected), notes: row.notes || '',
  }));
  const seen = new Set<string>();
  return [...remote, ...local].filter(row => {
    const day = new Date(row.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const key = `${row.branch}|${day}|${row.cashier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export type ReportRecord = { branch: Branch; record_type: string; record_id: string; status: string; payload: Record<string, unknown> };

export function buildReportRecords(rows: ReportRecord[]): Records {
  return Object.fromEntries(Object.entries(recordTypes).map(([bucket, types]) => {
    const records = new Map();
    rows.filter(row => (types as readonly string[]).includes(row.record_type)).forEach(row => {
      const key = `${row.branch}|${row.record_id}`;
      if (row.status === 'Deleted') records.delete(key);
      else if (row.payload?.id) records.set(key, { ...row.payload, branch: row.branch });
    });
    const values = [...records.values()];
    return [bucket, bucket === 'bills' ? uniqueBranchBills(values) : values];
  })) as Records;
}

// Read the selected report directly; general application hydration is capped
// and cannot be used as a complete historical report source.
export function useVrsnbReportRecords(fromDate: string, toDate: string, branches: Branch[]) {
  const [data, setData] = useState<Records>(() => buildReportRecords([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [legacySales, setLegacySales] = useState<SaleRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const branchKey = branches.join(',');
  useEffect(() => {
    let active = true;
    setData(buildReportRecords([]));
    setLegacySales([]);
    setError('');
    if (!fromDate || !toDate || fromDate > toDate) {
      setLoading(false);
      setError('Select a valid date range.');
      return;
    }
    setLoading(true);
    void (async () => {
      const rows: ReportRecord[] = [];
      const errors: string[] = [];
      const sales: SaleRecord[] = [];
      // Per-branch requests keep the indexed queries small. Business dates for
      // expenses/deposits may differ from when an entry was recorded.
      for (const branch of branchKey.split(',')) {
        for (const [dateColumn, types] of [
          ['created_at', Object.entries(recordTypes).filter(([key]) => key !== 'expenses' && key !== 'bankDeposits').flatMap(([, values]) => [...values])],
          ['payload->>expenseDate', ['expense']],
          ['payload->>depositDate', ['bank_deposit']],
        ] as const) {
          if (!active) return;
          const isTimestamp = dateColumn === 'created_at';
          try {
            const result = await fetchAllRows<ReportRecord>('branch_operation_records', q => q
              .select('branch,record_type,record_id,status,payload')
              .eq('branch', branch).in('record_type', types)
              .gte(dateColumn, isTimestamp ? `${fromDate}T00:00:00+05:30` : fromDate)
              .lte(dateColumn, isTimestamp ? `${toDate}T23:59:59.999+05:30` : toDate)
              .order('created_at', { ascending: true }).order('record_id', { ascending: true }),
              { maxRows: Infinity });
            rows.push(...result.data);
            if (result.error) errors.push(`${branch}: ${result.error}`);
          } catch (cause) { errors.push(`${branch}: ${cause instanceof Error ? cause.message : String(cause)}`); }
        }
        if (!active) return;
        try {
          const result = await fetchAllRows<Record<string, unknown>>('branch_sales', q => q
            .select('id,branch,item_name,quantity_sold,unit_price,bill_no,sold_at,sold_by,payment_method')
            .eq('branch', branch)
            .gte('sold_at', `${fromDate}T00:00:00+05:30`)
            .lte('sold_at', `${toDate}T23:59:59.999+05:30`)
            .order('sold_at', { ascending: false }).order('id', { ascending: false }), { maxRows: Infinity });
          if (result.error) errors.push(`${branch} sales: ${result.error}`);
          sales.push(...result.data.map(row => ({
            id: String(row.id), branch: branch as Branch, itemName: String(row.item_name),
            quantitySold: Number(row.quantity_sold), unitPrice: Number(row.unit_price || 0),
            billNo: row.bill_no ? String(row.bill_no) : null, soldAt: String(row.sold_at),
            soldBy: String(row.sold_by || '-'), paymentMethod: row.payment_method ? String(row.payment_method) : null,
          })));
        } catch (cause) { errors.push(`${branch} sales: ${cause instanceof Error ? cause.message : String(cause)}`); }
      }
      if (!active) return;
      const records = buildReportRecords(rows);
      const billNumbers = new Set(records.bills.map(bill => `${bill.branch}|${bill.billNo}`));
      setLegacySales(sales.filter(sale => !sale.billNo || !billNumbers.has(`${sale.branch}|${sale.billNo}`)));
      setData(records);
      setError(errors.join(' | '));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [fromDate, toDate, branchKey, revision]);
  return { ...data, legacySales, loading, error, refresh };
}
