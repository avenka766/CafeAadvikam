// src/branch/tabs/ReportsTab.tsx
import { useState, useMemo, useEffect } from 'react';
import { Download, Filter, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadCSV, fmtDate, EmptyState } from '../components';
import { useBranchStore } from '../branchStore';
import type { CreditSale, BranchAdvanceOrder } from '../branchStore';
import type { Branch } from '../types';
import type { SaleRecord } from '../branchStore';
import { formatCurrency } from '@/lib/utils';
import { BRANCH_COLORS } from '../types';
import { AdvancePaymentsTab } from './AdvancePaymentsTab';

interface Props {
  branch: Branch;
  branchSales: SaleRecord[];
  advanceOrders?: BranchAdvanceOrder[];
}

// FIX #8 — convert a UTC ISO timestamp to local-date YYYY-MM-DD string
// so the date range filter compares in local time (IST), not UTC.
function toLocalDateString(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ReportsTab({ branch, branchSales, advanceOrders = [] }: Props) {
  const { creditSales, fetchCreditSales } = useBranchStore();
  const [reportView, setReportView] = useState<'sales' | 'advance'>('sales');
  const [reportType, setReportType] = useState<'item' | 'branch'>('item');

  const todayISO = toLocalDateString(new Date().toISOString());
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo,   setDateTo]   = useState(todayISO);

  // Fetch credit sales on mount
  useEffect(() => { fetchCreditSales(branch); }, [branch]);

  // FIX #8 — compare using local date strings instead of epoch milliseconds
  const rangeSales = useMemo(() => {
    return branchSales.filter(s => {
      const localDate = toLocalDateString(s.soldAt);
      if (localDate < dateFrom || localDate > dateTo) return false;
      // Exclude credit_collection rows — they are cash receipts, not new sales
      if ((s.paymentMethod ?? '') === 'credit_collection') return false;
      return true;
    });
  }, [branchSales, dateFrom, dateTo]);

  // Credit sales in range
  const rangeCreditSales = useMemo(() => {
    const branchCredits = creditSales[branch] || [];
    return branchCredits.filter(cs => {
      const localDate = toLocalDateString(cs.createdAt);
      return localDate >= dateFrom && localDate <= dateTo;
    });
  }, [creditSales, branch, dateFrom, dateTo]);

  // ── Aggregations ─────────────────────────────────────────────────────────
  const itemReport = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    rangeSales.forEach(s => {
      const rev = (s.unitPrice ?? 0) * s.quantitySold;
      if (!map[s.itemName]) map[s.itemName] = { qty: 0, revenue: 0 };
      map[s.itemName].qty     += s.quantitySold;
      map[s.itemName].revenue += rev;
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [rangeSales]);

  const branchReport = useMemo(() => {
    const map: Record<string, number> = {};
    rangeSales.forEach(s => {
      const key = s.branch ?? branch;
      map[key] = (map[key] || 0) + s.quantitySold;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rangeSales, branch]);

  const totalQty     = itemReport.reduce((a, [, v]) => a + v.qty, 0);
  const totalRevenue = itemReport.reduce((a, [, v]) => a + v.revenue, 0);

  // Payment breakdown
  const payBreakdown = useMemo(() => {
    const b: Record<string, number> = { cash: 0, upi: 0, card: 0, credit: 0 };
    rangeSales.forEach(s => {
      const pm  = (s.paymentMethod ?? '').toLowerCase();
      const rev = (s.unitPrice ?? 0) * s.quantitySold;
      if (pm in b) b[pm] += rev; else b.cash += rev;
    });
    return b;
  }, [rangeSales]);

  const creditOutstanding = rangeCreditSales
    .filter(cs => cs.status !== 'settled')
    .reduce((a, cs) => a + cs.creditAmount, 0);

  const rangeLabel = dateFrom === dateTo
    ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const colors = BRANCH_COLORS[branch];

  const handleDownloadCSV = async () => {
    const XLSX = await import('xlsx');
    const wb   = XLSX.utils.book_new();
    const aw   = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      ws['!cols'] = Object.keys(data[0]).map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2 }));
    };
    const addSh = (data: Record<string, unknown>[], name: string) => {
      const rows = data.length > 0 ? data : [{ Note: 'No data' }];
      const ws   = XLSX.utils.json_to_sheet(rows);
      if (data.length) aw(ws, data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    // Summary sheet
    addSh([
      { Metric: 'Period',               Value: `${dateFrom} to ${dateTo}` },
      { Metric: 'Branch',               Value: branch },
      { Metric: 'Total Revenue (₹)',    Value: totalRevenue },
      { Metric: 'Total Items Sold',     Value: totalQty },
      { Metric: 'Transactions',         Value: rangeSales.length },
      { Metric: 'Cash Revenue (₹)',     Value: payBreakdown.cash },
      { Metric: 'UPI Revenue (₹)',      Value: payBreakdown.upi },
      { Metric: 'Card Revenue (₹)',     Value: payBreakdown.card },
      { Metric: 'Credit Billed (₹)',    Value: payBreakdown.credit },
      { Metric: 'Credit Outstanding (₹)', Value: creditOutstanding },
    ], 'Summary');

    // Item-wise sheet
    addSh(itemReport.map(([item, v], i) => ({
      Rank: i + 1, Item: item, 'Qty Sold': v.qty,
      'Revenue (₹)': v.revenue,
    })), 'Item-wise');

    // Transactions sheet
    addSh(rangeSales.map((s, i) => ({
      'S.No': i + 1, Item: s.itemName, Qty: s.quantitySold,
      'Unit Price (₹)': s.unitPrice ?? 0,
      'Revenue (₹)': (s.unitPrice ?? 0) * s.quantitySold,
      Payment: s.paymentMethod ?? '',
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      'Sold By': s.soldBy,
      'Bill No': s.billNo ?? '',
    })), 'Transactions');

    // Credit Sales sheet
    addSh(rangeCreditSales.map((cs, i) => ({
      'S.No': i + 1, 'Bill No': cs.billNo, Customer: cs.customerName,
      Phone: cs.customerPhone ?? '',
      Items: cs.items.map(it => `${it.itemName} ×${it.quantity}`).join(', '),
      'Bill Amount (₹)': cs.subtotal, 'Paid Now (₹)': cs.amountPaid,
      'Credit Due (₹)': cs.creditAmount,
      Status: cs.status.charAt(0).toUpperCase() + cs.status.slice(1),
      'Due Date': cs.dueDate ?? '',
      'Billed On': new Date(cs.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      'Billed By': cs.soldBy, Notes: cs.notes ?? '',
    })), 'Credit Sales');

    XLSX.writeFile(wb, `${branch}_Report_${dateFrom}_to_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* ── Top-level tab: Sales / Advance Payments ─────────────────────── */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted">
        <button onClick={() => setReportView('sales')}
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition',
            reportView === 'sales' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
          📊 Sales Reports
        </button>
        <button onClick={() => setReportView('advance')}
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition',
            reportView === 'advance' ? 'bg-amber-500 text-white shadow' : 'text-muted-foreground')}>
          <Wallet className="size-4" /> Advance Payments
          {advanceOrders.filter(o => o.status === 'pending').length > 0 && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              reportView === 'advance' ? 'bg-amber-300 text-amber-900' : 'bg-amber-200 text-amber-800')}>
              {advanceOrders.filter(o => o.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* ── Advance Payments view ────────────────────────────────────────── */}
      {reportView === 'advance' && (
        <AdvancePaymentsTab branch={branch} advanceOrders={advanceOrders} />
      )}

      {/* ── Sales view ──────────────────────────────────────────────────── */}
      {reportView === 'sales' && (<>
      {/* ── Revenue KPI ─────────────────────────────────────────────────── */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
          Total Revenue · {branch}
        </p>
        <p className="font-display text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        <p className="text-xs text-muted-foreground mt-1">{rangeSales.length} transactions · {totalQty} items</p>
        {/* Payment split */}
        {totalRevenue > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[
              { label: '💵 Cash',   val: payBreakdown.cash },
              { label: '📱 UPI',    val: payBreakdown.upi },
              { label: '💳 Card',   val: payBreakdown.card },
              { label: '📋 Credit', val: payBreakdown.credit },
            ].map(p => p.val > 0 && (
              <div key={p.label} className="bg-white/60 rounded-lg px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{p.label}</p>
                <p className="text-xs font-bold tabular-nums text-foreground">{formatCurrency(p.val)}</p>
              </div>
            ))}
          </div>
        )}
        {creditOutstanding > 0 && (
          <div className="mt-2 pt-2 border-t border-primary/10 flex items-center justify-between">
            <span className="text-[11px] text-amber-700 font-semibold">⚠ Credit Outstanding</span>
            <span className="text-sm font-bold text-amber-700 tabular-nums">{formatCurrency(creditOutstanding)}</span>
          </div>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Date Range</span>
          </div>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg hover:bg-muted transition"
          >
            <Download className="size-3" />Excel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">From</label>
            <input
              type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">To</label>
            <input
              type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing: <span className="font-semibold text-foreground">{rangeLabel}</span>
          {' · '}{rangeSales.length} transactions · {totalQty} units · {formatCurrency(totalRevenue)}
        </p>
      </div>

      {/* ── Item / Branch toggle + summary table ────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
          {(['item', 'branch'] as const).map(r => (
            <button
              key={r} onClick={() => setReportType(r)}
              className={cn(
                'text-xs px-3 py-1 rounded-lg capitalize font-medium transition',
                reportType === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {r}-wise
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          {reportType === 'item' ? (
            itemReport.length === 0 ? (
              <EmptyState message="No sales for this period." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-1.5">Item</th>
                    <th className="text-right py-1.5">Revenue</th>
                    <th className="text-right py-1.5 pl-3">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {itemReport.map(([item, v]) => (
                    <tr key={item}>
                      <td className="py-2">{item}</td>
                      <td className="py-2 text-right font-semibold text-primary tabular-nums">{formatCurrency(v.revenue)}</td>
                      <td className="py-2 text-right text-muted-foreground pl-3">{v.qty}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right text-primary">{formatCurrency(totalRevenue)}</td>
                    <td className="py-2 text-right text-muted-foreground pl-3">{totalQty}</td>
                  </tr>
                </tbody>
              </table>
            )
          ) : (
            branchReport.length === 0 ? (
              <EmptyState message="No sales for this period." />
            ) : (
              <div className="space-y-3 py-2">
                {branchReport.map(([b, qty]) => {
                  const pct = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
                  const badgeColor = BRANCH_COLORS[b as Branch]?.badge ?? colors.badge;
                  return (
                    <div key={b} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', badgeColor)}>{b}</span>
                        <span className="font-bold">{qty} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
                  <span>Total</span><span>{totalQty}</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Individual sale transactions ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Sale Transactions</h3>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', colors.badge)}>
            {totalQty} units
          </span>
        </div>
        {rangeSales.length === 0 ? (
          <EmptyState message="No transactions in this period." />
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {rangeSales.map(s => {
              const rev = (s.unitPrice ?? 0) * s.quantitySold;
              const pm  = (s.paymentMethod ?? '').toLowerCase();
              const pmColor = pm === 'cash' ? 'text-emerald-700 bg-emerald-50' : pm === 'upi' ? 'text-blue-700 bg-blue-50' : pm === 'card' ? 'text-violet-700 bg-violet-50' : pm === 'credit' ? 'text-amber-700 bg-amber-50' : 'text-muted-foreground bg-muted';
              return (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.soldAt)} · {s.soldBy}
                    {s.paymentMethod && (
                      <span className={cn('ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded capitalize', pmColor)}>
                        {s.paymentMethod}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right ml-2 shrink-0">
                  <p className="text-sm font-bold text-primary tabular-nums">{formatCurrency(rev)}</p>
                  <p className="text-[10px] text-muted-foreground">×{s.quantitySold}</p>
                </div>
              </div>
              );
            }
            ))}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
