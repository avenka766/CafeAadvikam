// src/components/admin/AdvanceClosingReportTab.tsx
// SNB Admin dashboard: Advance Order Closing Report — date range, grouped by day,
// matching the layout of the sample closing sheet (per-order table + Sales/Advance/Receipt summary).
import { useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useBranchStore } from '@/branch/branchStore';
import { downloadExcelWorkbook } from '@/lib/excelDownload';

interface Props {
  fromDate: string;
  toDate: string;
}

const BRANCH = 'SNB' as const;

const money = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function modeLabel(mode: string | null | undefined) {
  return (mode ?? '').toUpperCase() || '-';
}

function isCash(mode: string | null | undefined) { return (mode ?? '').toLowerCase() === 'cash'; }
function isUpi(mode: string | null | undefined) { return (mode ?? '').toLowerCase() === 'upi'; }

export default function AdvanceClosingReportTab({ fromDate, toDate }: Props) {
  const { advanceOrders, fetchBranchData } = useBranchStore();

  useEffect(() => {
    fetchBranchData(BRANCH);
  }, [fetchBranchData]);

  const orders = advanceOrders[BRANCH] || [];

  // Group by the day the order was PLACED (advance collected that day).
  // Orders whose balance was collected on a different day (fullyPaidAt) still show
  // their advance leg here; the day their balance closes shows up as that day's
  // "balance collected" contribution via fullyPaidAt.
  const byDay = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    const groups = new Map<string, typeof orders>();

    orders.forEach((o) => {
      const placedKey = dateKey(o.createdAt);
      const placedDate = new Date(o.createdAt);
      if (from && placedDate < from) return;
      if (to && placedDate > to) return;
      if (!groups.has(placedKey)) groups.set(placedKey, []);
      groups.get(placedKey)!.push(o);
    });

    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders, fromDate, toDate]);

  const exportAll = () => {
    const worksheets = byDay.map(([day, dayOrders]) => ({
      name: day,
      rows: dayOrders.map((o, i) => {
        const balance = Math.max(0, o.subtotal - o.advanceAmount);
        return {
          'Sl No': i + 1,
          'Order': o.customerName ?? o.id,
          'Total Bill Value': o.subtotal,
          'Advance': o.advanceAmount,
          'Balance': balance,
          'Advance Mode': modeLabel(o.advanceMethod),
          'Balance Mode': modeLabel(o.balanceMethod),
          'Status': o.status,
          'Delivery Date': o.deliveryDate ?? '',
        };
      }),
    }));
    downloadExcelWorkbook(`advance-closing-report-${fromDate}-to-${toDate}.xls`, worksheets);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">
          {fromDate} to {toDate} · {byDay.reduce((s, [, o]) => s + o.length, 0)} advance orders
        </p>
        <button
          onClick={exportAll}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-950 text-white font-bold"
        >
          <Download className="size-3.5" /> Export All (Excel)
        </button>
      </div>

      {byDay.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          No advance orders placed in this date range.
        </div>
      ) : (
        byDay.map(([day, dayOrders]) => {
          const cashSales = dayOrders.reduce((s, o) => s + (isCash(o.balanceMethod) ? Math.max(0, o.subtotal - o.advanceAmount) : 0), 0);
          const upiSales = dayOrders.reduce((s, o) => s + (isUpi(o.balanceMethod) ? Math.max(0, o.subtotal - o.advanceAmount) : 0), 0);
          const advancesFromSalesOrder = dayOrders.reduce((s, o) => s + o.advanceAmount, 0);
          const totalSales = cashSales + upiSales + advancesFromSalesOrder;

          const todayCashAdvance = dayOrders.reduce((s, o) => s + (isCash(o.advanceMethod) ? o.advanceAmount : 0), 0);
          const todayUpiAdvance = dayOrders.reduce((s, o) => s + (isUpi(o.advanceMethod) ? o.advanceAmount : 0), 0);

          const totalCash = cashSales + todayCashAdvance;
          const totalUpi = upiSales + todayUpiAdvance;
          const totalReceipt = totalCash + totalUpi;

          return (
            <div key={day} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-950 text-white text-sm font-bold">
                {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="p-2">Sl No</th>
                      <th className="p-2">Order</th>
                      <th className="p-2 text-right">Total Bill Value</th>
                      <th className="p-2 text-right">Advance</th>
                      <th className="p-2 text-right">Balance</th>
                      <th className="p-2">Advance Mode</th>
                      <th className="p-2">Balance Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayOrders.map((o, i) => {
                      const balance = Math.max(0, o.subtotal - o.advanceAmount);
                      return (
                        <tr key={o.id} className="border-t border-border">
                          <td className="p-2 font-bold">{i + 1}</td>
                          <td className="p-2">{o.customerName ?? o.id}</td>
                          <td className="p-2 text-right tabular-nums">{money(o.subtotal)}</td>
                          <td className="p-2 text-right tabular-nums">{o.advanceAmount > 0 ? money(o.advanceAmount) : '-'}</td>
                          <td className="p-2 text-right tabular-nums">{balance > 0 ? money(balance) : '-'}</td>
                          <td className="p-2 uppercase text-xs font-semibold">{modeLabel(o.advanceMethod)}</td>
                          <td className="p-2 uppercase text-xs font-semibold">{modeLabel(o.balanceMethod)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                      <td className="p-2" colSpan={2}>Total</td>
                      <td className="p-2 text-right tabular-nums">{money(dayOrders.reduce((s, o) => s + o.subtotal, 0))}</td>
                      <td className="p-2 text-right tabular-nums">{money(advancesFromSalesOrder)}</td>
                      <td className="p-2 text-right tabular-nums">{money(dayOrders.reduce((s, o) => s + Math.max(0, o.subtotal - o.advanceAmount), 0))}</td>
                      <td className="p-2" colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Sales</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Cash Sales</span><span className="font-bold tabular-nums">{money(cashSales)}</span></div>
                    <div className="flex justify-between"><span>UPI Sales</span><span className="font-bold tabular-nums">{money(upiSales)}</span></div>
                    <div className="flex justify-between"><span>Advances from Sales Order</span><span className="font-bold tabular-nums">{money(advancesFromSalesOrder)}</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1"><span className="font-bold">Total Sales</span><span className="font-bold tabular-nums">{money(totalSales)}</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Advance</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Today Cash Advance</span><span className="font-bold tabular-nums">{money(todayCashAdvance)}</span></div>
                    <div className="flex justify-between"><span>Today UPI Advance</span><span className="font-bold tabular-nums">{money(todayUpiAdvance)}</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Receipt</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Total Cash Sales + Advance</span><span className="font-bold tabular-nums">{money(totalCash)}</span></div>
                    <div className="flex justify-between"><span>Total UPI Sales + Advance</span><span className="font-bold tabular-nums">{money(totalUpi)}</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1"><span className="font-bold">Total Sales + Advance</span><span className="font-bold tabular-nums">{money(totalReceipt)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
