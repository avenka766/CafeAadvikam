// src/hooks/useCafeOrderRows.ts
//
// BUG FIX (audit 2026-08-10): the VRSNB Admin dashboard's "Sales and Returns
// Log" table only ever listed rows built from branchBills/legacySalesRows
// (VRSNB's own retail-till tables) — even after useCafeOrderSales.ts taught
// the page's Overview KPI cards to include Cafe's dine-in sales, this log
// table kept showing "No sales or return records" for Cafe, contradicting
// the non-zero Gross Sales figure shown just above it. This hook returns
// individual Cafe order rows (not just aggregate totals) shaped so they can
// be spliced directly into that same log table's row list.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CafeOrderRow = {
  id: string;
  billNo: string;
  createdAt: string;
  customer: string;
  person: string;
  total: number;
  paymentType: string;
};

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useCafeOrderRows(fromDate: string, toDate: string, enabled: boolean): CafeOrderRow[] {
  const [rows, setRows] = useState<CafeOrderRow[]>([]);

  useEffect(() => {
    if (!enabled || !isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
      setRows([]);
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, created_at, customer_name, billed_by, created_by, total, payment_type')
        .eq('status', 'served')
        .neq('payment_type', 'unpaid')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59.999`)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (!active || error || !data) { if (!error) setRows([]); return; }
      setRows((data as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        billNo: row.order_number != null ? `CAFE-${String(row.order_number).padStart(4, '0')}` : String(row.id),
        createdAt: String(row.created_at ?? ''),
        customer: (row.customer_name as string) || '-',
        person: (row.billed_by as string) || (row.created_by as string) || '-',
        total: Number(row.total ?? 0),
        paymentType: (row.payment_type as string) || '-',
      })));
    })();
    return () => { active = false; };
  }, [fromDate, toDate, enabled]);

  return rows;
}
