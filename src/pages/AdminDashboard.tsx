import { useMemo, useEffect, useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, ShoppingBag, IndianRupee, Clock,
  Package, XCircle, RefreshCw, Wifi, Download,
  LayoutDashboard, FileText, Filter, Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Branch } from '@/branch/types';
import { BRANCHES } from '@/branch/types';

// ─── Helpers ────────────────────────────────────────────────────────────────
function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <div className={cn('size-8 rounded-lg flex items-center justify-center mb-2', color)}>{icon}</div>
      <p className="font-display text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn('rounded-lg p-2 text-center', color)}>
      <p className="font-display text-lg font-bold tabular-nums">{count}</p>
      <p className="text-[10px] font-bold uppercase">{label}</p>
    </div>
  );
}

function PaymentRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-body w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-body font-bold tabular-nums shrink-0 w-20 text-right">{formatCurrency(amount)}</span>
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={cn('flex justify-between py-0.5', highlight && 'pl-3')}>
      <span className={cn('text-sm font-body', bold ? 'font-bold text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span className={cn('text-sm font-body tabular-nums', bold ? 'font-bold text-foreground' : highlight ? 'font-semibold text-primary' : 'text-foreground')}>{value}</span>
    </div>
  );
}

// ─── CAFE VIEW ───────────────────────────────────────────────────────────────
function CafeView() {
  const { orders, startPolling, stopPolling, polling } = useOrderStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayStr = useMemo(() => new Date().toDateString(), []);
  const todayOrders = useMemo(() => orders.filter(o => new Date(o.createdAt).toDateString() === todayStr), [orders, todayStr]);

  const served = todayOrders.filter(o => o.status === 'served');
  const pending = todayOrders.filter(o => o.status === 'pending');
  const preparing = todayOrders.filter(o => o.status === 'preparing');
  const ready = todayOrders.filter(o => o.status === 'ready');
  const cancelled = todayOrders.filter(o => o.status === 'cancelled');

  const totalRevenue = served.reduce((s, o) => s + o.total, 0);
  const totalOrders = todayOrders.length;
  const avgOrderValue = served.length > 0 ? Math.round(totalRevenue / served.length) : 0;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    served.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.id);
      if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
      else { map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity }); }
    }));
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [served]);

  const paymentTotals = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    served.forEach(o => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return { cash, upi, card };
  }, [served]);

  const peakHour = useMemo(() => {
    const hours: Record<number, number> = {};
    served.forEach(o => { const h = new Date(o.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; });
    let max = 0, maxH = 0;
    Object.entries(hours).forEach(([h, c]) => { if (Number(c) > max) { max = Number(c); maxH = Number(h); } });
    if (max === 0) return 'N/A';
    return `${maxH > 12 ? maxH - 12 : maxH}${maxH >= 12 ? 'PM' : 'AM'}`;
  }, [served]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
        <span className="text-xs text-muted-foreground">{polling ? 'Live' : 'Offline'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(totalRevenue)} color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Total Orders" value={String(totalOrders)} color="bg-accent/20 text-accent-foreground" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<Clock className="size-4" />} label="Peak Hour" value={peakHour} color="bg-amber-50 text-amber-700" />
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <RefreshCw className="size-4 text-primary" />Live Order Status
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <StatusBadge label="Pending" count={pending.length} color="bg-amber-100 text-amber-800" />
          <StatusBadge label="Preparing" count={preparing.length} color="bg-blue-100 text-blue-800" />
          <StatusBadge label="Ready" count={ready.length} color="bg-emerald-100 text-emerald-800" />
          <StatusBadge label="Cancelled" count={cancelled.length} color="bg-red-100 text-red-800" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3">Payment Breakdown</h3>
        <div className="space-y-2">
          <PaymentRow label="💵 Cash" amount={paymentTotals.cash} total={totalRevenue} />
          <PaymentRow label="📱 UPI" amount={paymentTotals.upi} total={totalRevenue} />
          <PaymentRow label="💳 Card" amount={paymentTotals.card} total={totalRevenue} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3">Top Selling Items</h3>
        {topItems.length === 0 ? (
          <p className="text-sm font-body text-muted-foreground text-center py-4">No sales today yet</p>
        ) : (
          <div className="space-y-2">
            {topItems.map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  i === 0 ? 'gold-gradient text-white' : i < 3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p></div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-body font-bold tabular-nums">{item.qty} sold</p>
                  <p className="text-[10px] font-body text-muted-foreground tabular-nums">{formatCurrency(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3">GST Summary</h3>
        {totalRevenue === 0 ? (
          <p className="text-sm font-body text-muted-foreground text-center py-4">No data</p>
        ) : (() => {
          const taxable = Math.round((totalRevenue / 1.05) * 100) / 100;
          const gst = Math.round((totalRevenue - taxable) * 100) / 100;
          const cgst = Math.round((gst / 2) * 100) / 100;
          const sgst = Math.round((gst / 2) * 100) / 100;
          return (
            <div className="space-y-1.5">
              <Row label="Revenue (incl. GST)" value={formatCurrency(totalRevenue)} bold />
              <Row label="Taxable Amount" value={formatCurrency(taxable)} />
              <Row label="GST @ 5%" value={formatCurrency(gst)} />
              <div className="border-t border-border pt-1.5 mt-1.5">
                <Row label="CGST @ 2.5%" value={formatCurrency(cgst)} highlight />
                <Row label="SGST @ 2.5%" value={formatCurrency(sgst)} highlight />
              </div>
            </div>
          );
        })()}
      </div>

      {cancelled.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-2 flex items-center gap-2">
            <XCircle className="size-4 text-destructive" />Cancelled Orders
          </h3>
          <div className="flex justify-between text-sm font-body mb-2">
            <span className="text-muted-foreground">Count</span>
            <span className="font-bold text-destructive">{cancelled.length}</span>
          </div>
          <div className="flex justify-between text-sm font-body">
            <span className="text-muted-foreground">Lost Revenue</span>
            <span className="font-bold text-destructive">{formatCurrency(cancelled.reduce((s, o) => s + o.total, 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BAKERY DASHBOARD TAB ────────────────────────────────────────────────────
function BakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();

  useEffect(() => {
    BRANCHES.forEach(b => fetchBranchData(b));
  }, [fetchBranchData]);

  const today = new Date().toDateString();

  const branchStats = useMemo(() => {
    return BRANCHES.map(branch => {
      const todaySales = (sales[branch] || []).filter(s => new Date(s.soldAt).toDateString() === today);
      const totalQty = todaySales.reduce((a, s) => a + s.quantitySold, 0);
      const stockCount = (stock[branch] || []).length;
      const lowStock = (stock[branch] || []).filter(s => s.quantity <= s.minThreshold).length;
      return { branch, totalQty, stockCount, lowStock, salesCount: todaySales.length };
    });
  }, [sales, stock, today]);

  const allTodaySales = useMemo(() => {
    const map = new Map<string, number>();
    BRANCHES.forEach(branch => {
      (sales[branch] || [])
        .filter(s => new Date(s.soldAt).toDateString() === today)
        .forEach(s => { map.set(s.itemName, (map.get(s.itemName) || 0) + s.quantitySold); });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sales, today]);

  const BRANCH_COLORS: Record<Branch, string> = {
    VRSNB: 'bg-blue-50 border-blue-200 text-blue-700',
    SNB: 'bg-amber-50 border-amber-200 text-amber-700',
    Hosur: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {branchStats.map(({ branch, totalQty, lowStock }) => (
          <div key={branch} className={cn('border rounded-xl p-3 text-center', BRANCH_COLORS[branch])}>
            <p className="font-display text-lg font-bold tabular-nums">{totalQty}</p>
            <p className="text-[10px] font-semibold uppercase">{branch}</p>
            {lowStock > 0 && (
              <p className="text-[9px] mt-0.5 font-medium text-red-600">⚠ {lowStock} low</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3">Today's Branch Summary</h3>
        <div className="space-y-2">
          {branchStats.map(({ branch, totalQty, salesCount, stockCount, lowStock }) => (
            <div key={branch} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <div>
                <p className="text-sm font-semibold">{branch}</p>
                <p className="text-xs text-muted-foreground">{salesCount} transactions · {stockCount} items in stock</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums">{totalQty} sold</p>
                {lowStock > 0 && <p className="text-[10px] text-red-600">⚠ {lowStock} low stock</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3">Top Items (All Branches)</h3>
        {allTodaySales.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2">
            {allTodaySales.map(([item, qty], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground'
                )}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item}</p>
                <span className="text-sm font-bold tabular-nums">{qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BAKERY SALES TAB (with filters) ────────────────────────────────────────
function BakerySalesTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [filterBranch, setFilterBranch] = useState<Branch | 'all'>('all');
  const [filterItem, setFilterItem] = useState('');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    BRANCHES.forEach(b => fetchBranchData(b));
  }, [fetchBranchData]);

  const allSales = useMemo(() => {
    const result: Array<{ id: string; branch: Branch; itemName: string; quantitySold: number; soldAt: string; soldBy: string }> = [];
    BRANCHES.forEach(branch => {
      (sales[branch] || []).forEach(s => result.push({ ...s, branch }));
    });
    return result.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales]);

  const allItems = useMemo(() => [...new Set(allSales.map(s => s.itemName))].sort(), [allSales]);

  const filtered = useMemo(() => {
    return allSales.filter(s => {
      if (filterBranch !== 'all' && s.branch !== filterBranch) return false;
      if (filterItem && s.itemName !== filterItem) return false;
      if (filterDate && new Date(s.soldAt).toDateString() !== new Date(filterDate).toDateString()) return false;
      return true;
    });
  }, [allSales, filterBranch, filterItem, filterDate]);

  const handleDownload = () => {
    const rows = [
      ['Branch', 'Item', 'Qty Sold', 'Sold At', 'Sold By'],
      ...filtered.map(s => [s.branch, s.itemName, String(s.quantitySold), s.soldAt, s.soldBy]),
    ];
    downloadCSV(rows, `BakerySales_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const BRANCH_PILL: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700',
    SNB: 'bg-amber-100 text-amber-700',
    Hosur: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Filters</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value as Branch | 'all')}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2"
          >
            <option value="all">All Branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={filterItem}
            onChange={e => setFilterItem(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background"
          >
            <option value="">All Items</option>
            {allItems.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{filtered.length} records</p>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"
          >
            <Download className="size-3" />CSV
          </button>
        </div>
      </div>

      {/* Sales table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No sales match your filters.</p>
        ) : (
          <div className="divide-y">
            {filtered.slice(0, 50).map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{s.itemName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', BRANCH_PILL[s.branch])}>{s.branch}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold tabular-nums text-blue-600">×{s.quantitySold}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BAKERY REPORTS TAB ──────────────────────────────────────────────────────
function BakeryReportsTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [reportType, setReportType] = useState<'item' | 'branch'>('item');

  useEffect(() => {
    BRANCHES.forEach(b => fetchBranchData(b));
  }, [fetchBranchData]);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlySales = useMemo(() => {
    const result: Array<{ branch: Branch; itemName: string; quantitySold: number; soldAt: string }> = [];
    BRANCHES.forEach(branch => {
      (sales[branch] || [])
        .filter(s => {
          const d = new Date(s.soldAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .forEach(s => result.push({ ...s, branch }));
    });
    return result;
  }, [sales, currentMonth, currentYear]);

  const itemReport = useMemo(() => {
    const map = new Map<string, number>();
    monthlySales.forEach(s => { map.set(s.itemName, (map.get(s.itemName) || 0) + s.quantitySold); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthlySales]);

  const branchReport = useMemo(() => {
    const map = new Map<Branch, number>();
    monthlySales.forEach(s => { map.set(s.branch, (map.get(s.branch) || 0) + s.quantitySold); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthlySales]);

  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const handleDownload = () => {
    const rows = reportType === 'item'
      ? [['Item', 'Total Qty Sold'], ...itemReport.map(([item, qty]) => [item, String(qty)])]
      : [['Branch', 'Total Qty Sold'], ...branchReport.map(([branch, qty]) => [branch, String(qty)])];
    downloadCSV(rows, `BakeryMonthly_${reportType}_${monthLabel.replace(' ', '_')}.csv`);
  };

  const BRANCH_COLORS: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700',
    SNB: 'bg-amber-100 text-amber-700',
    Hosur: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <div className="flex gap-2">
            {(['item', 'branch'] as const).map(r => (
              <button
                key={r}
                onClick={() => setReportType(r)}
                className={cn(
                  'text-xs px-3 py-1 rounded-lg capitalize font-medium transition',
                  reportType === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {r}-wise
              </button>
            ))}
          </div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-2 py-1 border rounded-lg hover:bg-muted">
            <Download className="size-3" />CSV
          </button>
        </div>

        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground mb-3">Month: {monthLabel}</p>

          {reportType === 'item' ? (
            itemReport.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No sales this month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-1">Item</th>
                    <th className="text-right py-1">Qty Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {itemReport.map(([item, qty]) => (
                    <tr key={item}>
                      <td className="py-2">{item}</td>
                      <td className="py-2 text-right font-semibold">{qty}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{itemReport.reduce((a, [, q]) => a + q, 0)}</td>
                  </tr>
                </tbody>
              </table>
            )
          ) : (
            branchReport.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No sales this month.</p>
            ) : (
              <div className="space-y-3 py-2">
                {branchReport.map(([branch, qty]) => {
                  const total = branchReport.reduce((a, [, q]) => a + q, 0);
                  const pct = total > 0 ? Math.round((qty / total) * 100) : 0;
                  return (
                    <div key={branch} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', BRANCH_COLORS[branch as Branch])}>{branch}</span>
                        <span className="font-bold">{qty} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BAKERY VIEW ─────────────────────────────────────────────────────────────
function BakeryView() {
  const [tab, setTab] = useState<'dashboard' | 'sales' | 'reports'>('dashboard');

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sales' as const, label: 'Sales', icon: Store },
    { id: 'reports' as const, label: 'Reports', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition',
              tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            )}
          >
            <t.icon className="size-3" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <BakeryDashboardTab />}
      {tab === 'sales' && <BakerySalesTab />}
      {tab === 'reports' && <BakeryReportsTab />}
    </div>
  );
}

// ─── MAIN ADMIN DASHBOARD ────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [mode, setMode] = useState<'cafe' | 'bakery'>('cafe');

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className="px-4 pt-4 pb-2">
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm font-body text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mx-4 mb-4 flex gap-1 bg-muted rounded-xl p-1">
        <button
          onClick={() => setMode('cafe')}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-semibold transition',
            mode === 'cafe' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
          )}
        >
          ☕ Cafe
        </button>
        <button
          onClick={() => setMode('bakery')}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-semibold transition',
            mode === 'bakery' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
          )}
        >
          🥐 Bakery
        </button>
      </div>

      <div className="px-4 space-y-4">
        {mode === 'cafe' ? <CafeView /> : <BakeryView />}

        <div className="bg-muted/50 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <p className="text-xs font-body text-muted-foreground">Data retained for last 60 days. Older records are automatically purged.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
