import { useCallback, useEffect, useMemo, useState } from 'react';
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

function isValidLedgerDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function useBranchLedger(fromDate: string, toDate: string, branches?: Branch[]) {
  const [closureRows, setClosureRows] = useState<LedgerClosureRow[]>([]);
  const [savedClosures, setSavedClosures] = useState<LedgerSavedClosure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // HYGIENE FIX: JSON.stringify(branches) in useEffect deps creates a new string reference on every
  // render when branches is passed as a new array literal, causing the effect to re-fire continuously.
  // Use a stable sorted-join string instead, which is identity-stable for the same set of branches.
  const branchesKey = branches && branches.length > 0 ? [...branches].sort().join(',') : '';
  // Bumped by refresh() to force the effect below to re-run on demand,
  // without needing fromDate/toDate/branches to change.
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setClosureRows([]);
      setSavedClosures([]);
      if (!isValidLedgerDate(fromDate) || !isValidLedgerDate(toDate) || fromDate > toDate) {
        setLoading(false);
        setError('Select a valid From Date and To Date.');
        return;
      }

      setLoading(true);
      setError('');
      const branchList = branches && branches.length > 0 ? branches : null;

      // PERF FIX (2026-09-26): "all the dashboard and tabs are getting
      // [statement timeout], always" — branch_daily_closure_ledger (the
      // view this used to query directly) computes its 3 GROUP BY CTEs
      // over the ENTIRE branch_bill_headers/branch_sale_payments/
      // branch_return_records tables with no filter, THEN applies
      // closure_date/branch filtering — confirmed via EXPLAIN ANALYZE this
      // is a full Seq Scan + aggregate of all ~38,000+ rows in the two big
      // tables on every single call, regardless of how narrow the
      // requested range is (this hook is used across nearly every Owner/
      // Admin/branch dashboard tab, so this was the dominant, systemic
      // cause of the app-wide "canceling statement due to statement
      // timeout" reports). branch_daily_closure_ledger_ranged() is the
      // same aggregation with the date/branch filter pushed inside each
      // CTE so Postgres can use the existing (branch, created_at DESC)
      // indexes — verified byte-for-byte identical output against the old
      // view before switching, and ~15x faster (1617ms -> 104ms for a
      // 7-day range) with a gap that only grows favorably as these tables
      // keep growing (the old view got linearly slower forever; this one
      // scales with the filtered range, not total table size).
      const buildClosureQuery = () => supabase.rpc('branch_daily_closure_ledger_ranged', {
        p_from_date: fromDate,
        p_to_date: toDate,
        p_branches: branchList,
      });
      const buildSavedClosureQuery = () => {
        let q = supabase.from('branch_daily_closures').select('id, branch, closure_date, cashier, opening_cash, cash_total, upi_total, card_total, credit_billed, credit_collected, advance_collected, advance_balance_collected, refunds, expenses, purchase_payments, discounts, bill_count, duplicate_prints, expected_cash, actual_cash, difference, notes, created_at').gte('closure_date', fromDate).lte('closure_date', toDate).order('closure_date', { ascending: false });
        if (branchList) q = q.in('branch', branchList);
        return q;
      };

      let [closureRes, savedRes] = await Promise.all([
        buildClosureQuery(),
        buildSavedClosureQuery(),
      ]);

      // RESILIENCE: a transient "statement timeout" under concurrent load (seen when
      // several dashboard queries fire together) otherwise silently zeroes out this
      // hook's data with no visible loading/error recovery. One retry after a short
      // backoff (against freshly-built query objects — Postgrest builders are
      // single-use thenables) clears it in practice — matches the retry pattern
      // already used for the paginated fetches in AdminDashboard.tsx.
      if ((closureRes.error || savedRes.error) && active) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        [closureRes, savedRes] = await Promise.all([buildClosureQuery(), buildSavedClosureQuery()]);
      }

      if (!active) return;
      const firstError = [closureRes.error, savedRes.error].find(Boolean);
      if (firstError) {
        setClosureRows([]);
        setSavedClosures([]);
        setError(firstError.message || 'Unable to load branch ledger data.');
        setLoading(false);
        return;
      }

      setClosureRows((closureRes.data || []) as LedgerClosureRow[]);
      setSavedClosures((savedRes.data || []) as LedgerSavedClosure[]);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  // EGRESS FIX: `branches` was listed alongside `branchesKey` in deps.
  // Because callers pass a new array literal each render, React sees a new
  // reference every time and re-fires this effect — triggering 4 heavy
  // queries (branch_daily_closure_ledger, branch_daily_closures,
  // branch_operation_records, branch_bill_headers) in an infinite loop.
  // `branchesKey` is already a stable sorted-join string that captures the
  // same information, so `branches` must be removed from deps here.
  }, [fromDate, toDate, branchesKey, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
    refresh,
    closureRows,
    savedClosures,
    closureByBranchDate,
    savedClosureByBranchDate,
    toNumber,
  };
}
