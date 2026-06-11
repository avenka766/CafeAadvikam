// src/branch/tabs/ReportsTab.tsx
import { useState, useMemo, useEffect } from 'react';
import { Download, Filter, Wallet, ClipboardCheck, Package, Truck, ShoppingCart, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadCSV, fmtDate, EmptyState } from '../components';
import { useBranchStore } from '../branchStore';
import type { BranchAdvanceOrder, IncomingStock, StockItem } from '../branchStore';
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


function formatQty(value: number, unit?: string) {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.abs(safe % 1) < 0.001 ? String(Math.round(safe)) : safe.toFixed(2);
  return `${rounded} ${unit ?? 'kg'}`;
}

function BranchDailyClosureTab({
  branch,
  branchSales,
  branchStock,
  branchIncoming,
}: {
  branch: Branch;
  branchSales: SaleRecord[];
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
}) {
  const todayISO = toLocalDateString(new Date().toISOString());
  const [date, setDate] = useState(todayISO);

  const salesToday = useMemo(() => branchSales.filter(s => {
    if (toLocalDateString(s.soldAt) !== date) return false;
    return (s.paymentMethod ?? '') !== 'credit_collection';
  }), [branchSales, date]);

  // BUG-M4 FIX: credit_collection rows are excluded from salesToday (to avoid double-counting
  // as new sales), but the cash they bring in IS real money collected on this day. Track them
  // separately so the closure summary can show both Sales Revenue and Credit Collected.
  const creditCollectionsToday = useMemo(() => branchSales.filter(s =>
    toLocalDateString(s.soldAt) === date && (s.paymentMethod ?? '') === 'credit_collection'
  ), [branchSales, date]);

  const creditCollectedRevenue = creditCollectionsToday.reduce(
    (s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0
  );

  const suppliesToday = useMemo(() => branchIncoming.filter(i => toLocalDateString(i.receivedAt) === date), [branchIncoming, date]);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem>();
    for (const item of branchStock) map.set(item.itemName, item);
    return map;
  }, [branchStock]);

  const soldByItem = useMemo(() => {
    const map = new Map<string, { itemName: string; quantity: number; revenue: number; payments: Record<string, number> }>();
    for (const sale of salesToday) {
      const ex = map.get(sale.itemName) ?? { itemName: sale.itemName, quantity: 0, revenue: 0, payments: {} };
      const revenue = (sale.unitPrice ?? 0) * sale.quantitySold;
      const method = (sale.paymentMethod ?? 'cash').toLowerCase();
      ex.quantity += sale.quantitySold;
      ex.revenue += revenue;
      ex.payments[method] = (ex.payments[method] ?? 0) + revenue;
      map.set(sale.itemName, ex);
    }
    return map;
  }, [salesToday]);

  const suppliedByItem = useMemo(() => {
    const map = new Map<string, { itemName: string; quantity: number; unit: 'kg' | 'pcs'; confirmed: number; pending: number }>();
    for (const inc of suppliesToday) {
      const ex = map.get(inc.itemName) ?? { itemName: inc.itemName, quantity: 0, unit: inc.unit ?? 'kg', confirmed: 0, pending: 0 };
      ex.quantity += inc.quantity;
      if (inc.confirmed) ex.confirmed += 1; else ex.pending += 1;
      map.set(inc.itemName, ex);
    }
    return map;
  }, [suppliesToday]);

  const closureRows = useMemo(() => {
    const names = new Set<string>();
    branchStock.forEach(s => names.add(s.itemName));
    salesToday.forEach(s => names.add(s.itemName));
    suppliesToday.forEach(i => names.add(i.itemName));
    return Array.from(names).map(itemName => {
      const stockItem = stockMap.get(itemName);
      const sold = soldByItem.get(itemName);
      const supplied = suppliedByItem.get(itemName);
      const unit = stockItem?.unit ?? supplied?.unit ?? 'kg';
      return {
        itemName,
        unit,
        suppliedQty: supplied?.quantity ?? 0,
        soldQty: sold?.quantity ?? 0,
        salesValue: sold?.revenue ?? 0,
        remaining: stockItem?.quantity ?? 0,
        threshold: stockItem?.minThreshold ?? 0,
        confirmation: supplied ? `${supplied.confirmed} confirmed · ${supplied.pending} pending` : '—',
      };
    }).sort((a, b) => (b.soldQty + b.suppliedQty) - (a.soldQty + a.suppliedQty) || a.itemName.localeCompare(b.itemName));
  }, [branchStock, salesToday, suppliesToday, stockMap, soldByItem, suppliedByItem]);

  const totalSoldQty = salesToday.reduce((s, r) => s + r.quantitySold, 0);
  const totalRevenue = salesToday.reduce((s, r) => s + ((r.unitPrice ?? 0) * r.quantitySold), 0);
  const totalSuppliedQty = suppliesToday.reduce((s, r) => s + r.quantity, 0);
  const lowStock = branchStock.filter(s => s.quantity <= s.minThreshold).length;
  const outOfStock = branchStock.filter(s => s.quantity <= 0).length;

  const paymentBreakdown = useMemo(() => {
    const b: Record<string, number> = { cash: 0, upi: 0, card: 0, credit: 0 };
    for (const s of salesToday) {
      const method = (s.paymentMethod ?? 'cash').toLowerCase();
      const revenue = (s.unitPrice ?? 0) * s.quantitySold;
      if (method in b) b[method] += revenue;
      else b.cash += revenue;
    }
    return b;
  }, [salesToday]);

  const handleDownload = async () => {
    const XLSX = await import('@/lib/safeSpreadsheet');
    const wb = XLSX.utils.book_new();
    const addSheet = (rows: Record<string, unknown>[], name: string) => {
      const data = rows.length ? rows : [{ Note: 'No data' }];
      const ws = XLSX.utils.json_to_sheet(data);
      if (rows.length) ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2 }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet([
      { Metric: 'Date', Value: date },
      { Metric: 'Branch', Value: branch },
      { Metric: 'Sold Quantity', Value: totalSoldQty },
      { Metric: 'Sales Value', Value: totalRevenue },
      { Metric: 'Credit Collected', Value: creditCollectedRevenue },
      { Metric: 'Total Cash In', Value: totalRevenue + creditCollectedRevenue },
      { Metric: 'Supplied Quantity', Value: totalSuppliedQty },
      { Metric: 'Stock Items', Value: branchStock.length },
      { Metric: 'Low Stock Items', Value: lowStock },
      { Metric: 'Out of Stock Items', Value: outOfStock },
      { Metric: 'Cash Sales', Value: paymentBreakdown.cash },
      { Metric: 'UPI Sales', Value: paymentBreakdown.upi },
      { Metric: 'Card Sales', Value: paymentBreakdown.card },
      { Metric: 'Credit Sales', Value: paymentBreakdown.credit },
    ], 'Closure Summary');

    addSheet(closureRows.map(r => ({
      Item: r.itemName,
      Supplied: r.suppliedQty,
      Sold: r.soldQty,
      'Sales Value': r.salesValue,
      'Remaining Stock': r.remaining,
      Unit: r.unit,
      Threshold: r.threshold,
      'Supply Confirmation': r.confirmation,
    })), 'Sold vs Remaining');

    addSheet(suppliesToday.map((r, i) => ({
      'S.No': i + 1,
      Time: new Date(r.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      Item: r.itemName,
      Quantity: r.quantity,
      Unit: r.unit,
      Confirmed: r.confirmed ? 'Yes' : 'No',
      'Dispatched By': r.dispatchedBy,
    })), 'Supplied Today');

    addSheet(salesToday.map((r, i) => ({
      'S.No': i + 1,
      Time: new Date(r.soldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      Item: r.itemName,
      Sold: r.quantitySold,
      'Unit Price': r.unitPrice ?? 0,
      Revenue: (r.unitPrice ?? 0) * r.quantitySold,
      Payment: r.paymentMethod ?? '',
      'Bill No': r.billNo ?? '',
      'Sold By': r.soldBy,
    })), 'Sales Transactions');

    XLSX.writeFile(wb, `${branch}_Daily_Closure_${date}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-200 ring-1 ring-white/10">
                <ClipboardCheck className="size-3.5" /> Daily Closure · {branch}
              </div>
              <h3 className="font-display text-2xl font-black md:text-3xl">Sold today vs remaining stock</h3>
              <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-300">
                Day-end report for branch staff: how much was supplied, how much was sold, and what is remaining now.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <input
                type="date"
                value={date}
                max={todayISO}
                onChange={e => setDate(e.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/20"
              />
              <button onClick={handleDownload} className="h-12 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 shadow active:scale-95">
                Export Excel
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <ShoppingCart className="mb-2 size-5 text-emerald-600" />
            <p className="text-2xl font-black tabular-nums text-slate-950">{formatQty(totalSoldQty)}</p>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Sold Today</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">{formatCurrency(totalRevenue)}</p>
            {/* BUG-M4 FIX: show credit collections separately so cash-in is not understated */}
            {creditCollectedRevenue > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-blue-600">+{formatCurrency(creditCollectedRevenue)} credit collected</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Truck className="mb-2 size-5 text-blue-600" />
            <p className="text-2xl font-black tabular-nums text-slate-950">{formatQty(totalSuppliedQty)}</p>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Supplied Today</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{suppliesToday.length} received lines</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Package className="mb-2 size-5 text-slate-700" />
            <p className="text-2xl font-black tabular-nums text-slate-950">{branchStock.length}</p>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Stock Items</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">live remaining balance</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mb-2 size-5 text-red-600" />
            <p className="text-2xl font-black tabular-nums text-red-700">{lowStock}</p>
            <p className="text-[11px] font-black uppercase tracking-widest text-red-500">Low Stock</p>
            <p className="mt-1 text-xs font-semibold text-red-600">{outOfStock} out of stock</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <p className="text-base font-black text-slate-950">Daily closure item sheet</p>
              <p className="text-xs font-semibold text-slate-500">Remaining stock is the current live balance.</p>
            </div>
            <button onClick={handleDownload} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm active:scale-95">
              <Download className="size-3.5" /> Excel
            </button>
          </div>
          {closureRows.length === 0 ? <EmptyState message="No stock or sales data found for this closure date." /> : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-white text-[11px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                  <tr>
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3 text-right">Supplied</th>
                    <th className="px-5 py-3 text-right">Sold</th>
                    <th className="px-5 py-3 text-right">Remaining</th>
                    <th className="px-5 py-3 text-right">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {closureRows.map(r => {
                    const low = r.remaining <= r.threshold;
                    return (
                      <tr key={r.itemName} className={cn('hover:bg-slate-50', low && 'bg-amber-50/50')}>
                        <td className="px-5 py-3 font-black text-slate-950">{r.itemName}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-blue-700">{formatQty(r.suppliedQty, r.unit)}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{formatQty(r.soldQty, r.unit)}</td>
                        <td className={cn('px-5 py-3 text-right text-lg font-black tabular-nums', low ? 'text-red-700' : 'text-slate-950')}>{formatQty(r.remaining, r.unit)}</td>
                        <td className="px-5 py-3 text-right font-black tabular-nums text-slate-950">{formatCurrency(r.salesValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-base font-black text-slate-950">Payment split</p>
              <p className="text-xs font-semibold text-slate-500">Sales collected today.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {[
                ['Cash', paymentBreakdown.cash],
                ['UPI', paymentBreakdown.upi],
                ['Card', paymentBreakdown.card],
                ['Credit', paymentBreakdown.credit],
              ].map(([label, amount]) => (
                <div key={label as string} className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label as string}</p>
                  <p className="text-lg font-black tabular-nums text-slate-950">{formatCurrency(amount as number)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-base font-black text-slate-950">Supplied from store</p>
              <p className="text-xs font-semibold text-slate-500">What reached this branch today.</p>
            </div>
            {suppliesToday.length === 0 ? <EmptyState message="No supplies received on this date." /> : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-auto">
                {suppliesToday.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{s.itemName}</p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {new Date(s.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {s.dispatchedBy}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black tabular-nums text-blue-700">{formatQty(s.quantity, s.unit)}</p>
                      <p className={cn('text-[10px] font-black', s.confirmed ? 'text-emerald-700' : 'text-amber-700')}>{s.confirmed ? 'Confirmed' : 'Pending'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsTab({ branch, branchSales, advanceOrders = [] }: Props) {
  const { creditSales, fetchCreditSales, stock, incoming } = useBranchStore();
  const [reportView, setReportView] = useState<'sales' | 'closure' | 'advance'>('sales');
  const [reportType, setReportType] = useState<'item' | 'branch'>('item');

  const todayISO = toLocalDateString(new Date().toISOString());
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo,   setDateTo]   = useState(todayISO);

  const branchStock = stock[branch] || [];
  const branchIncoming = incoming[branch] || [];

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
    const XLSX = await import('@/lib/safeSpreadsheet');
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
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted">
        <button onClick={() => setReportView('sales')}
          className={cn('py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition',
            reportView === 'sales' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
          📊 Sales
        </button>
        <button onClick={() => setReportView('closure')}
          className={cn('py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition',
            reportView === 'closure' ? 'bg-slate-950 text-white shadow' : 'text-muted-foreground')}>
          <ClipboardCheck className="size-4" /> Daily Closure
        </button>
        <button onClick={() => setReportView('advance')}
          className={cn('py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition',
            reportView === 'advance' ? 'bg-amber-500 text-white shadow' : 'text-muted-foreground')}>
          <Wallet className="size-4" /> Advance
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

      {/* ── Daily Closure view ─────────────────────────────────────────── */}
      {reportView === 'closure' && (
        <BranchDailyClosureTab branch={branch} branchSales={branchSales} branchStock={branchStock} branchIncoming={branchIncoming} />
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
            })}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
