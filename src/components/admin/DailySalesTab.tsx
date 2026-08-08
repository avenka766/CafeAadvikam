// src/components/admin/DailySalesTab.tsx
// SNB Admin dashboard: Daily Sales — month drill-down, day-by-day Gross & Net Sales,
// Discount Value, Credit Bills Value, Advance Received (by mode) and Advance Closed (by mode).
// Reads directly from the live source tables (not the closure snapshot), so today's numbers
// stay accurate even before the cashier saves a closure.
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { downloadExcelWorkbook } from '@/lib/excelDownload';

const BRANCH = 'SNB' as const;

const money = (n: number) =>
  `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pad2(n: number) { return String(n).padStart(2, '0'); }

function dateKeyFromIso(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

async function fetchAllRows(
  table: string,
  columns: string,
  fromIso: string,
  toIso: string,
) {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('branch', BRANCH)
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

type BillRow = { created_at: string; subtotal: number | null; tax: number | null; discount: number | null; bill_type: string | null; status: string | null };
type ReturnRow = { created_at: string; amount: number | null; reason: string | null };
type CreditRow = { created_at: string; credit_amount: number | null };
type AdvanceRow = { created_at: string; amount: number | null; payment_mode: string | null; payment_stage: string | null };

type DayRow = {
  day: number;
  date: string;
  grossSales: number;
  discount: number;
  netSales: number;
  creditBillsValue: number;
  advanceReceived: { cash: number; upi: number; card: number; other: number; total: number };
  advanceClosed: { cash: number; upi: number; card: number; other: number; total: number };
};

function modeKey(mode: string | null | undefined): 'cash' | 'upi' | 'card' | 'other' {
  const m = (mode || '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'upi') return 'upi';
  if (m === 'card') return 'card';
  return 'other';
}

// Advance-order cancellation refunds are logged into branch_return_records with
// a distinctive reason so they are not counted as ordinary sales returns here —
// no branch_bill_headers "gross sales" row is ever created for an advance order
// until it closes (bill_type='advance_final'), so subtracting the cancellation
// refund from Net Sales would understate a day that never had that value counted.
function isAdvanceCancellationRefund(reason: string | null | undefined) {
  return /advance order cancelled|cancelled advance order/i.test(reason || '');
}

export default function DailySalesTab() {
  const [month, setMonth] = useState(currentMonthValue());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<DayRow[]>([]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    setMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [y, m] = month.split('-').map(Number);
        const monthStart = new Date(y, m - 1, 1);
        const monthEndExclusive = new Date(y, m, 1);
        const fromIso = monthStart.toISOString();
        const toIso = monthEndExclusive.toISOString();
        const daysInMonth = new Date(y, m, 0).getDate();

        const [bills, returns, credits, advances] = await Promise.all([
          fetchAllRows('branch_bill_headers', 'created_at,subtotal,tax,discount,bill_type,status', fromIso, toIso) as Promise<BillRow[]>,
          fetchAllRows('branch_return_records', 'created_at,amount,reason', fromIso, toIso) as Promise<ReturnRow[]>,
          fetchAllRows('branch_credit_sales', 'created_at,credit_amount', fromIso, toIso) as Promise<CreditRow[]>,
          fetchAllRows('branch_advance_payments', 'created_at,amount,payment_mode,payment_stage', fromIso, toIso) as Promise<AdvanceRow[]>,
        ]);
        if (cancelled) return;

        const days = new Map<string, DayRow>();
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${y}-${pad2(m)}-${pad2(d)}`;
          days.set(key, {
            day: d,
            date: key,
            grossSales: 0,
            discount: 0,
            netSales: 0,
            creditBillsValue: 0,
            advanceReceived: { cash: 0, upi: 0, card: 0, other: 0, total: 0 },
            advanceClosed: { cash: 0, upi: 0, card: 0, other: 0, total: 0 },
          });
        }

        bills.forEach((b) => {
          if (b.bill_type === 'advance_final') return; // already counted when the advance was collected
          if (b.bill_type === 'return') return; // reversal record, not a new sale
          if (b.status === 'cancelled') return;
          const key = dateKeyFromIso(b.created_at);
          const row = days.get(key);
          if (!row) return;
          row.grossSales += Number(b.subtotal || 0) + Number(b.tax || 0);
          row.discount += Number(b.discount || 0);
        });

        const dailyReturns = new Map<string, number>();
        returns.forEach((r) => {
          if (isAdvanceCancellationRefund(r.reason)) return;
          const key = dateKeyFromIso(r.created_at);
          dailyReturns.set(key, (dailyReturns.get(key) || 0) + Number(r.amount || 0));
        });

        days.forEach((row, key) => {
          const returnTotal = dailyReturns.get(key) || 0;
          row.netSales = Math.max(0, row.grossSales - row.discount - returnTotal);
        });

        credits.forEach((c) => {
          const key = dateKeyFromIso(c.created_at);
          const row = days.get(key);
          if (!row) return;
          row.creditBillsValue += Number(c.credit_amount || 0);
        });

        advances.forEach((a) => {
          const key = dateKeyFromIso(a.created_at);
          const row = days.get(key);
          if (!row) return;
          const amount = Number(a.amount || 0);
          const mk = modeKey(a.payment_mode);
          if (a.payment_stage === 'advance' || a.payment_stage === 'advance_topup') {
            row.advanceReceived[mk] += amount;
            row.advanceReceived.total += amount;
          } else if (a.payment_stage === 'balance') {
            row.advanceClosed[mk] += amount;
            row.advanceClosed.total += amount;
          }
        });

        setRows(Array.from(days.values()));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [month]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    grossSales: acc.grossSales + r.grossSales,
    discount: acc.discount + r.discount,
    netSales: acc.netSales + r.netSales,
    creditBillsValue: acc.creditBillsValue + r.creditBillsValue,
    advanceReceivedTotal: acc.advanceReceivedTotal + r.advanceReceived.total,
    advanceClosedTotal: acc.advanceClosedTotal + r.advanceClosed.total,
  }), { grossSales: 0, discount: 0, netSales: 0, creditBillsValue: 0, advanceReceivedTotal: 0, advanceClosedTotal: 0 }), [rows]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [month]);

  const exportExcel = () => {
    const worksheetRows = rows
      .filter((r) => r.grossSales > 0 || r.creditBillsValue > 0 || r.advanceReceived.total > 0 || r.advanceClosed.total > 0)
      .map((r) => ({
        Date: r.date,
        'Gross Sales': r.grossSales,
        'Discount': r.discount,
        'Net Sales': r.netSales,
        'Credit Bills Value': r.creditBillsValue,
        'Advance Received - Cash': r.advanceReceived.cash,
        'Advance Received - UPI': r.advanceReceived.upi,
        'Advance Received - Card': r.advanceReceived.card,
        'Advance Received - Other': r.advanceReceived.other,
        'Advance Received - Total': r.advanceReceived.total,
        'Advance Closed - Cash': r.advanceClosed.cash,
        'Advance Closed - UPI': r.advanceClosed.upi,
        'Advance Closed - Card': r.advanceClosed.card,
        'Advance Closed - Other': r.advanceClosed.other,
        'Advance Closed - Total': r.advanceClosed.total,
      }));
    downloadExcelWorkbook(`snb-daily-sales-${month}.xls`, [{ name: monthLabel, rows: worksheetRows }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="grid size-8 place-items-center rounded-lg border border-border bg-white text-slate-600">
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-[10rem] text-center text-sm font-black text-slate-900">{monthLabel}</div>
          <button onClick={() => shiftMonth(1)} className="grid size-8 place-items-center rounded-lg border border-border bg-white text-slate-600">
            <ChevronRight className="size-4" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold"
          />
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
        >
          <Download className="size-3.5" /> Export (Excel)
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Gross Sales" value={money(totals.grossSales)} />
        <SummaryCard label="Discount" value={money(totals.discount)} />
        <SummaryCard label="Net Sales" value={money(totals.netSales)} />
        <SummaryCard label="Credit Bills" value={money(totals.creditBillsValue)} />
        <SummaryCard label="Advance Received" value={money(totals.advanceReceivedTotal)} />
        <SummaryCard label="Advance Closed" value={money(totals.advanceClosedTotal)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-950 text-left text-[10px] uppercase tracking-wide text-white">
              <th className="p-2">Date</th>
              <th className="p-2 text-right">Gross Sales</th>
              <th className="p-2 text-right">Discount</th>
              <th className="p-2 text-right">Net Sales</th>
              <th className="p-2 text-right">Credit Bills</th>
              <th className="p-2 text-right">Adv. Received (Cash)</th>
              <th className="p-2 text-right">Adv. Received (UPI)</th>
              <th className="p-2 text-right">Adv. Received (Card)</th>
              <th className="p-2 text-right">Adv. Received (Total)</th>
              <th className="p-2 text-right">Adv. Closed (Cash)</th>
              <th className="p-2 text-right">Adv. Closed (UPI)</th>
              <th className="p-2 text-right">Adv. Closed (Card)</th>
              <th className="p-2 text-right">Adv. Closed (Total)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="p-6 text-center text-sm text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="p-6 text-center text-sm text-muted-foreground">No data for this month.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.date} className="border-t border-border">
                  <td className="p-2 font-bold text-slate-700">
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.grossSales > 0 ? money(r.grossSales) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.discount > 0 ? money(r.discount) : '-'}</td>
                  <td className="p-2 text-right tabular-nums font-bold">{r.netSales > 0 ? money(r.netSales) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.creditBillsValue > 0 ? money(r.creditBillsValue) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceReceived.cash > 0 ? money(r.advanceReceived.cash) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceReceived.upi > 0 ? money(r.advanceReceived.upi) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceReceived.card > 0 ? money(r.advanceReceived.card) : '-'}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-indigo-700">{r.advanceReceived.total > 0 ? money(r.advanceReceived.total) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceClosed.cash > 0 ? money(r.advanceClosed.cash) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceClosed.upi > 0 ? money(r.advanceClosed.upi) : '-'}</td>
                  <td className="p-2 text-right tabular-nums">{r.advanceClosed.card > 0 ? money(r.advanceClosed.card) : '-'}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-emerald-700">{r.advanceClosed.total > 0 ? money(r.advanceClosed.total) : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right tabular-nums">{money(totals.grossSales)}</td>
                <td className="p-2 text-right tabular-nums">{money(totals.discount)}</td>
                <td className="p-2 text-right tabular-nums">{money(totals.netSales)}</td>
                <td className="p-2 text-right tabular-nums">{money(totals.creditBillsValue)}</td>
                <td className="p-2 text-right tabular-nums" colSpan={3} />
                <td className="p-2 text-right tabular-nums text-indigo-700">{money(totals.advanceReceivedTotal)}</td>
                <td className="p-2 text-right tabular-nums" colSpan={3} />
                <td className="p-2 text-right tabular-nums text-emerald-700">{money(totals.advanceClosedTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}
