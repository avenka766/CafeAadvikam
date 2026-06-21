import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Branch } from '@/branch/types';

export type LedgerClosureRow = {
  branch: Branch;
  closure_date: string;
  bill_count: number | string;
  sales_total: number | string;
  credit_billed: number | string;
  discounts: number | string;
  tax_total: number | string;
  cash_total: number | string;
  upi_total: number | string;
  card_total: number | string;
  credit_collected: number | string;
  advance_collected: number | string;
  advance_balance_collected: number | string;
};

export type LedgerSavedClosure = {
  id: string;
  branch: Branch;
  closure_date: string;
  cashier: string;
  opening_cash: number | string;
  cash_total: number | string;
  upi_total: number | string;
  card_total: number | string;
  credit_billed: number | string;
  credit_collected: number | string;
  advance_collected: number | string;
  advance_balance_collected: number | string;
  refunds: number | string;
  expenses: number | string;
  purchase_payments?: number | string;
  discounts: number | string;
  bill_count: number | string;
  duplicate_prints: number | string;
  expected_cash: number | string;
  actual_cash: number | string;
  difference: number | string;
  notes: string | null;
  created_at: string;
};

export type LedgerOperationRecord = {
  id: string;
  branch: Branch;
  record_type: string;
  record_id: string;
  record_no: string | null;
  amount: number | string | null;
  status: string | null;
  actor: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LedgerBillHeader = {
  id: string;
  branch: Branch;
  bill_no: string;
  invoice_no: number | string;
  bill_type: string;
  salesperson: string | null;
  biller: string | null;
  total: number | string;
  tendered: number | string;
  balance: number | string;
  discount: number | string;
  tax: number | string;
  created_at: string;
};

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

function dateRange(fromDate: string, toDate: string) {
  return {
    from: `${fromDate}T00:00:00`,
    to: `${toDate}T23:59:59.999`,
  };
}

export function useBranchLedger(fromDate: string, toDate: string, branches?: Branch[]) {
  const [closureRows, setClosureRows] = useState<LedgerClosureRow[]>([]);
  const [savedClosures, setSavedClosures] = useState<LedgerSavedClosure[]>([]);
  const [operationRecords, setOperationRecords] = useState<LedgerOperationRecord[]>([]);
  const [billHeaders, setBillHeaders] = useState<LedgerBillHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // HYGIENE FIX: JSON.stringify(branches) in useEffect deps creates a new string reference on every
  // render when branches is passed as a new array literal, causing the effect to re-fire continuously.
  // Use a stable sorted-join string instead, which is identity-stable for the same set of branches.
  const branchesKey = branches && branches.length > 0 ? [...branches].sort().join(',') : '';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const { from, to } = dateRange(fromDate, toDate);
      const branchList = branches && branches.length > 0 ? branches : null;

      let closureQuery = supabase.from('branch_daily_closure_ledger').select('*').gte('closure_date', fromDate).lte('closure_date', toDate);
      let savedClosureQuery = supabase.from('branch_daily_closures').select('*').gte('closure_date', fromDate).lte('closure_date', toDate).order('closure_date', { ascending: false });
      let operationsQuery = supabase.from('branch_operation_records').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(5000);
      let billsQuery = supabase.from('branch_bill_headers').select('id, branch, bill_no, invoice_no, bill_type, salesperson, biller, total, tendered, balance, discount, tax, created_at').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(5000);

      if (branchList) {
        closureQuery = closureQuery.in('branch', branchList);
        savedClosureQuery = savedClosureQuery.in('branch', branchList);
        operationsQuery = operationsQuery.in('branch', branchList);
        billsQuery = billsQuery.in('branch', branchList);
      }

      const [closureRes, savedRes, operationsRes, billsRes] = await Promise.all([
        closureQuery,
        savedClosureQuery,
        operationsQuery,
        billsQuery,
      ]);

      if (!active) return;
      const firstError = [closureRes.error, savedRes.error, operationsRes.error, billsRes.error].find(Boolean);
      if (firstError) {
        setError(firstError.message || 'Unable to load branch ledger data.');
        setLoading(false);
        return;
      }

      setClosureRows((closureRes.data || []) as LedgerClosureRow[]);
      setSavedClosures((savedRes.data || []) as LedgerSavedClosure[]);
      setOperationRecords((operationsRes.data || []) as LedgerOperationRecord[]);
      setBillHeaders((billsRes.data || []) as LedgerBillHeader[]);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [fromDate, toDate, branchesKey, branches]);

  const closureByBranchDate = useMemo(() => {
    const map = new Map<string, LedgerClosureRow>();
    closureRows.forEach((row) => map.set(`${row.branch}:${row.closure_date}`, row));
    return map;
  }, [closureRows]);

  const savedClosureByBranchDate = useMemo(() => {
    const map = new Map<string, LedgerSavedClosure>();
    savedClosures.forEach((row) => {
      const key = `${row.branch}:${row.closure_date}`;
      if (!map.has(key)) map.set(key, row);
    });
    return map;
  }, [savedClosures]);

  return {
    loading,
    error,
    closureRows,
    savedClosures,
    operationRecords,
    billHeaders,
    closureByBranchDate,
    savedClosureByBranchDate,
    toNumber,
  };
}
