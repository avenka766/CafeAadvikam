// src/hooks/useCafeOrderSales.ts
//
// BUG FIX (2026-08-10): VRSNB Admin Dashboard's "Cafe" scope (and its
// "overall" scope, which combines Cafe + VRSNB) always showed Cafe sales as
// zero. Root cause: VRSNB/SNB retail billing writes to branch_bill_headers /
// branch_daily_closure_ledger (see useBranchLedger.ts), but Cafe's dine-in
// billing (BillingDashboard.tsx, tables/KOT, "Cafe Aadvikam" receipts) is a
// completely separate, older schema — the `orders` table (see
// stores/orderStore.ts) — that the VRSNB Admin dashboard's sales math never
// queried at all. This hook fetches Cafe's real completed sales directly
// from `orders`, independent of that other pipeline, so it can be added
// into the combined totals wherever Cafe is in scope.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CafeOrderSalesSummary = {
  grossSales: number;
  billsCount: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  otherSales: number; // wallet/advance/anything not cash-upi-card-credit
  loading: boolean;
  error: string;
  // Bumped by the caller to force a fresh re-fetch on demand (a manual
  // "Refresh" button) without needing fromDate/toDate/enabled to change —
  // this hook otherwise only ever re-queries when one of those changes, so
  // it can silently lag behind real Cafe `orders` activity between refetches.
  refresh: () => void;
};

const EMPTY: Omit<CafeOrderSalesSummary, 'refresh'> = {
  grossSales: 0, billsCount: 0, cashSales: 0, upiSales: 0, cardSales: 0,
  creditSales: 0, otherSales: 0, loading: false, error: '',
};

type PaymentBreakdown = { cash?: number; upi?: number; card?: number; wallet?: number; credit?: number } | null;

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// A "real, collected" Cafe sale: status 'served' (the till has actually
// closed this order out) and not left as 'unpaid' (a small number of
// served-but-unpaid rows exist for complimentary/staff orders and shouldn't
// count as revenue).
export function useCafeOrderSales(fromDate: string, toDate: string, enabled: boolean): CafeOrderSalesSummary {
  const [summary, setSummary] = useState<Omit<CafeOrderSalesSummary, 'refresh'>>(EMPTY);
  // Bumped by refresh() to force the effect below to re-run on demand,
  // without needing fromDate/toDate/enabled to change.
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) { setSummary(EMPTY); return; }
    if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
      setSummary({ ...EMPTY, error: 'Select a valid From Date and To Date.' });
      return;
    }
    let active = true;
    (async () => {
      setSummary((prev) => ({ ...prev, loading: true, error: '' }));
      const { data, error } = await supabase
        .from('orders')
        .select('total, payment_type, payment_breakdown')
        .eq('status', 'served')
        .neq('payment_type', 'unpaid')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59.999`)
        .limit(20000);
      if (!active) return;
      if (error) {
        setSummary({ ...EMPTY, error: error.message || 'Unable to load Cafe sales.' });
        return;
      }
      const rows = (data ?? []) as { total: number | string | null; payment_type: string | null; payment_breakdown: PaymentBreakdown }[];
      let grossSales = 0, cashSales = 0, upiSales = 0, cardSales = 0, creditSales = 0, otherSales = 0;
      for (const row of rows) {
        const total = Number(row.total ?? 0);
        grossSales += total;
        const breakdown = row.payment_breakdown;
        if (row.payment_type === 'part_payment' && breakdown) {
          cashSales += Number(breakdown.cash ?? 0);
          upiSales += Number(breakdown.upi ?? 0);
          cardSales += Number(breakdown.card ?? 0);
          creditSales += Number(breakdown.credit ?? 0);
          otherSales += Number(breakdown.wallet ?? 0);
        } else if (row.payment_type === 'cash') cashSales += total;
        else if (row.payment_type === 'upi') upiSales += total;
        else if (row.payment_type === 'card') cardSales += total;
        else if (row.payment_type === 'credit') creditSales += total;
        else otherSales += total; // wallet, advance, anything else
      }
      setSummary({
        grossSales, billsCount: rows.length, cashSales, upiSales, cardSales,
        creditSales, otherSales, loading: false, error: '',
      });
    })();
    return () => { active = false; };
  }, [fromDate, toDate, enabled, refreshToken]);

  return { ...summary, refresh };
}
