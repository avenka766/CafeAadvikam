// src/components/admin/AdvanceClosingReportTab.tsx
// SNB Admin dashboard: Advance Order Closing tab.
//
// BUG FIX (2026-08-09): this tab was rebuilt into a full day-by-day
// sales/advance/receipt closing report, reading from `branch_advance_orders`
// (the Order Receiver's reserved-stock advance flow). Two problems with that:
//   1. The user's original, explicit spec for this tab was much simpler -
//      "only show the Pending advance orders - what is the value and how
//      many orders are still pending" - not a full historical closing
//      report. ("i said only to show the Pending advance orders what is the
//      value and how many order are still pending but what have you done.")
//   2. `branch_advance_orders` is a different, mostly-separate table from
//      the actual advance-cake/store/custom order system staff use day to
//      day (BranchBusinessModules.tsx's "Advance Order" tab, which writes to
//      branch_operation_records + cake_master_orders and is what generates
//      the SNB-ADV-### numbers the admin actually references). Reading the
//      wrong table meant the counts/values shown here didn't match reality.
// Rebuilt to source from the real advance-order system (useBranchOpsStore's
// advanceCakeOrders, same data BranchBusinessModules.tsx uses) and to show
// exactly what was asked for: how many advance orders are still pending,
// what they're worth, and the list of those orders so the number is
// actionable - nothing more.
import { useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useBranchStore } from '@/branch/branchStore';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { downloadExcelWorkbook } from '@/lib/excelDownload';

interface Props {
  fromDate: string;
  toDate: string;
}

const BRANCH = 'SNB' as const;

// AUDIT FIX (2026-09-05): "the payment should be round off there should not
// be any decimal points".
const money = (n: number) =>
  `₹${Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function fmtDate(iso: string | undefined) {
  if (!iso) return '-';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdvanceClosingReportTab(_props: Props) {
  const { fetchBranchData } = useBranchStore();
  const { advanceCakeOrders } = useBranchOpsStore();

  useEffect(() => {
    fetchBranchData(BRANCH, false, ['advance']); // EGRESS FIX: this report only reads advance orders
  }, [fetchBranchData]);

  // "Pending" = every advance order that hasn't been fully invoiced or
  // cancelled yet - i.e. still needs a final bill/closing action from the
  // branch. This is a current-state figure, not tied to a date range.
  const pendingOrders = useMemo(
    () => advanceCakeOrders
      .filter((o) => o.branch === BRANCH && o.status !== 'Paid In Full' && o.status !== 'Cancelled')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [advanceCakeOrders],
  );
  const pendingCount = pendingOrders.length;
  const pendingOrderValue = useMemo(() => pendingOrders.reduce((s, o) => s + (o.orderValue || 0), 0), [pendingOrders]);
  const pendingBalanceDue = useMemo(() => pendingOrders.reduce((s, o) => s + (o.balanceAmount || 0), 0), [pendingOrders]);

  const exportPending = () => {
    downloadExcelWorkbook(`snb-pending-advance-orders-${new Date().toISOString().slice(0, 10)}.xls`, [{
      name: 'Pending Advance Orders',
      rows: pendingOrders.map((o, i) => ({
        'Sl No': i + 1,
        'Advance No': o.orderNo,
        'Customer': o.customerName || '-',
        'Status': o.status,
        'Order Value': o.orderValue,
        'Advance Collected': o.advanceAmount,
        'Balance Due': o.balanceAmount,
        'Delivery Date': o.deliveryDate || '',
      })),
    }]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Pending Advance Orders</p>
          <p className="mt-1 text-xl font-black text-amber-900 tabular-nums">{pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Total Order Value (Pending)</p>
          <p className="mt-1 text-xl font-black text-amber-900 tabular-nums">{money(pendingOrderValue)}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Balance Still Due</p>
          <p className="mt-1 text-xl font-black text-amber-900 tabular-nums">{money(pendingBalanceDue)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{pendingCount} advance order{pendingCount === 1 ? '' : 's'} still pending</p>
        <button
          onClick={exportPending}
          disabled={pendingCount === 0}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-950 text-white font-bold disabled:opacity-40"
        >
          <Download className="size-3.5" /> Export (Excel)
        </button>
      </div>

      {pendingCount === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          No pending advance orders - everything is closed out.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="p-2">Sl No</th>
                <th className="p-2">Advance No</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Order Value</th>
                <th className="p-2 text-right">Advance Collected</th>
                <th className="p-2 text-right">Balance Due</th>
                <th className="p-2">Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((o, i) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="p-2 font-bold">{i + 1}</td>
                  <td className="p-2 font-bold text-indigo-700">{o.orderNo}</td>
                  <td className="p-2">{o.customerName || '-'}</td>
                  <td className="p-2 text-xs font-semibold">{o.status}</td>
                  <td className="p-2 text-right tabular-nums">{money(o.orderValue || 0)}</td>
                  <td className="p-2 text-right tabular-nums">{money(o.advanceAmount || 0)}</td>
                  <td className="p-2 text-right tabular-nums">{money(o.balanceAmount || 0)}</td>
                  <td className="p-2">{fmtDate(o.deliveryDate)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                <td className="p-2" colSpan={4}>Total</td>
                <td className="p-2 text-right tabular-nums">{money(pendingOrderValue)}</td>
                <td className="p-2 text-right tabular-nums">{money(pendingOrders.reduce((s, o) => s + (o.advanceAmount || 0), 0))}</td>
                <td className="p-2 text-right tabular-nums">{money(pendingBalanceDue)}</td>
                <td className="p-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
