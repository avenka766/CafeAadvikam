import { useMemo, useEffect, useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useShallow } from 'zustand/react/shallow'; // STORE-01 FIX: granular selectors
import { useBranchStore } from '@/branch/branchStore';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, ShoppingBag, IndianRupee, Clock,
  Package, XCircle, RefreshCw, Wifi, Download,
  LayoutDashboard, Store, Filter, FileText, Bell,
  ClipboardList, Calendar, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Branch } from '@/branch/types';
import { BRANCHES } from '@/branch/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import StaffActivityLog from '@/bakery/StaffActivityLog';
import DayEndReport from '@/bakery/DayEndReport';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import AdminAdvanceTab from '@/components/admin/AdminAdvanceTab';
import KitchenWasteLogTab from '@/components/KitchenWasteLogTab';

const CHART_COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899'];

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
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6"
        style={{ background: 'hsl(var(--primary))' }} />
      <div className={cn('size-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', color)}>{icon}</div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">{label}</p>
    </div>
  );
}

function StatusBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn('rounded-xl p-3 text-center', color)}>
      <p className="font-display text-2xl font-bold tabular-nums">{count}</p>
      <p className="text-[10px] font-body font-bold uppercase tracking-wide mt-0.5">{label}</p>
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

// ─── CAFE DASHBOARD TAB (today only) ─────────────────────────────────────────
function CafeDashboardTab() {
  // STORE-01 FIX: granular selector — only re-renders when orders or polling changes
  const { orders, polling } = useOrderStore(
    useShallow(s => ({ orders: s.orders, polling: s.polling }))
  );

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

// ─── CAFE VIEW (Dashboard / Sales / Reports sub-tabs) ────────────────────────
function CafeView() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'waste'>('dashboard');

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports'   as const, label: 'Reports',   icon: FileText },
    { id: 'waste'     as const, label: 'Waste Log', icon: Trash2 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition',
              tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            )}
          >
            <t.icon className="size-3" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <CafeDashboardTab />}
      {tab === 'reports'   && <CafeReportsTab />}
      {tab === 'waste'     && <KitchenWasteLogTab />}
    </div>
  );
}

// ─── BAKERY DASHBOARD TAB (today only) ───────────────────────────────────────
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
      const totalRevenue = todaySales.reduce((a, s) => {
        const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
        return a + unitPrice * s.quantitySold;
      }, 0);
      const stockCount = (stock[branch] || []).length;
      const lowStock = (stock[branch] || []).filter(s => s.quantity <= s.minThreshold).length;
      return { branch, totalQty, totalRevenue, stockCount, lowStock, salesCount: todaySales.length };
    });
  }, [sales, stock, today]);

  const totalRevenue = branchStats.reduce((a, b) => a + b.totalRevenue, 0);
  const totalQty = branchStats.reduce((a, b) => a + b.totalQty, 0);

  const allTodaySales = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    BRANCHES.forEach(branch => {
      (sales[branch] || [])
        .filter(s => new Date(s.soldAt).toDateString() === today)
        .forEach(s => {
          const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
          const ex = map.get(s.itemName);
          if (ex) { ex.qty += s.quantitySold; ex.revenue += unitPrice * s.quantitySold; }
          else map.set(s.itemName, { qty: s.quantitySold, revenue: unitPrice * s.quantitySold });
        });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  }, [sales, today]);

  const BRANCH_PILL: Record<Branch, string> = {
    VRSNB: 'bg-blue-50 border-blue-200 text-blue-700',
    SNB: 'bg-amber-50 border-amber-200 text-amber-700',
    Hosur: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };

  const barData = branchStats.map(b => ({ branch: b.branch, revenue: b.totalRevenue, qty: b.totalQty }));
  const maxRev = Math.max(...branchStats.map(b => b.totalRevenue), 1);

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 col-span-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Today's Total Revenue</p>
          <p className="font-display text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalQty} items sold across {BRANCHES.length} branches</p>
        </div>
        {branchStats.map(b => (
          <div key={b.branch} className={cn('border rounded-xl p-3', BRANCH_PILL[b.branch as Branch])}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1">{b.branch}</p>
            <p className="font-display text-xl font-bold tabular-nums">{formatCurrency(b.totalRevenue)}</p>
            <p className="text-[10px] mt-0.5 opacity-80">{b.totalQty} items · {b.salesCount} txns</p>
            {b.lowStock > 0 && <p className="text-[9px] mt-0.5 font-medium text-red-600">⚠ {b.lowStock} low stock</p>}
          </div>
        ))}
      </div>

      {/* Branch Revenue Bar Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1">Branch Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Today's revenue by branch</p>
        <div className="space-y-3">
          {branchStats.map((b, i) => (
            <div key={b.branch}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">{b.branch}</span>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(b.totalRevenue)}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{b.totalQty} items</span>
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded-full">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.round((b.totalRevenue / maxRev) * 100)}%`,
                  background: CHART_COLORS[i],
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Items */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Today · all branches</p>
        {allTodaySales.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2">
            {allTodaySales.map(([item, v], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground'
                )}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item}</p>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(v.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{v.qty} sold</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── BAKERY SALES TAB ────────────────────────────────────────────────────────
function BakerySalesTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [filterBranch, setFilterBranch] = useState<Branch | 'all'>('all');
  const [filterItem, setFilterItem] = useState('');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    BRANCHES.forEach(b => fetchBranchData(b));
  }, [fetchBranchData]);

  const allSales = useMemo(() => {
    const result: Array<{ id: string; branch: Branch; itemName: string; quantitySold: number; soldAt: string; soldBy: string; unitPrice: number }> = [];
    BRANCHES.forEach(branch => {
      (sales[branch] || []).forEach(s => result.push({
        ...s, branch,
        unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
      }));
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

  const totalRevenue = filtered.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = filtered.reduce((a, s) => a + s.quantitySold, 0);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const autoWidth = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2 }));
    };
    const rows = filtered.map((s, i) => ({
      'S.No': i + 1, 'Branch': s.branch, 'Item': s.itemName,
      'Qty Sold': s.quantitySold, 'Unit Price': s.unitPrice,
      'Revenue': s.unitPrice * s.quantitySold,
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      'Sold By': s.soldBy,
      'Payment': (s as typeof s & { paymentMethod?: string | null }).paymentMethod || '-',
    }));
    const ws = rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.json_to_sheet([{ Note: 'No sales match selected filters' }]);
    if (rows.length > 0) autoWidth(ws, rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bakery Sales');
    XLSX.writeFile(wb, `BakerySales_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const BRANCH_PILL: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700',
    SNB: 'bg-amber-100 text-amber-700',
    Hosur: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Revenue</p>
          <p className="font-display text-xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Items Sold</p>
          <p className="font-display text-xl font-bold tabular-nums">{totalQty}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Filters</h3>
          </div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted">
            <Download className="size-3" />Excel
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value as Branch | 'all')}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2">
            <option value="all">All Branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterItem} onChange={e => setFilterItem(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background">
            <option value="">All Items</option>
            {allItems.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} records · {totalQty} items · {formatCurrency(totalRevenue)}</p>
      </div>

      {/* Sales List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No sales match your filters.</p>
        ) : (
          <div className="divide-y">
            {filtered.slice(0, 50).map(s => {
              const lineRevenue = s.unitPrice * s.quantitySold;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.itemName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', BRANCH_PILL[s.branch])}>{s.branch}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(lineRevenue)}</p>
                    <p className="text-[10px] text-muted-foreground">×{s.quantitySold} sold</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── CAFE REPORTS TAB (custom range) ─────────────────────────────────────────
function CafeReportsTab() {
  // STORE-01 FIX: select only what this component needs
  const orders = useOrderStore(s => s.orders);

  const todayISO = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);

  const rangeOrders = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
    return orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  }, [orders, dateFrom, dateTo]);

  const served = rangeOrders.filter(o => o.status === 'served');
  const cancelled = rangeOrders.filter(o => o.status === 'cancelled');
  const totalRevenue = served.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = served.length > 0 ? Math.round(totalRevenue / served.length) : 0;
  const totalDiscount = served.reduce((s, o) => s + o.discount, 0);
  const dineInCount   = served.filter(o => o.orderType === 'dine_in').length;
  const takeawayCount = served.filter(o => o.orderType === 'takeaway').length;

  const staffOrders  = useMemo(() => served.filter(o => o.orderSource === 'staff'), [served]);
  const qrOrders     = useMemo(() => served.filter(o => o.orderSource === 'qr'),    [served]);
  const staffRevenue = staffOrders.reduce((s, o) => s + o.total, 0);
  const qrRevenue    = qrOrders.reduce((s, o) => s + o.total, 0);

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

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    served.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.id);
      if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
      else { map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity }); }
    }));
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [served]);

  const topItemsByRevenue = useMemo(() =>
    [...topItems].sort((a, b) => b.revenue - a.revenue).slice(0, 8)
      .map(i => ({ name: i.name.length > 14 ? i.name.slice(0, 14) + '…' : i.name, revenue: i.revenue, qty: i.qty })),
    [topItems]);

  const dailyRevenue = useMemo(() => {
    const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);
    if (days > 31) return [];
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(dateFrom);
      d.setDate(d.getDate() + i);
      const dateStr = d.toDateString();
      const rev = served.filter(o => new Date(o.createdAt).toDateString() === dateStr).reduce((s, o) => s + o.total, 0);
      result.push({ date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: rev });
    }
    return result;
  }, [served, dateFrom, dateTo]);

  const orderTypeData = [
    { name: 'Dine In', value: dineInCount },
    { name: 'Takeaway', value: takeawayCount },
  ].filter(d => d.value > 0);

  // FIX: rangeLabel must be at component scope — used in both render JSX (lines ~818, ~869)
  // AND inside handleDownload. Previously it was only inside handleDownload (wrong scope).
  const rangeLabel = dateFrom === dateTo
    ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const handleDownload = async () => {
    const XLSX = await import('xlsx');

    const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`;
    // rangeLabel is now defined at component scope above — accessible here too

    const PAYMENT_LABELS_LOCAL: Record<string, string> = {
      cash: 'Cash', upi: 'UPI', card: 'Card', part_payment: 'Split Payment', unpaid: 'Unpaid',
    };

    const autoWidth = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2 }));
    };

    const addSheet = (wb: ReturnType<typeof XLSX.utils.book_new>, data: Record<string, unknown>[], name: string, fallback: string) => {
      const rows = data.length > 0 ? data : [{ Note: fallback }];
      const ws = XLSX.utils.json_to_sheet(rows);
      if (data.length > 0) autoWidth(ws, data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    // ── Sheet 1: Sales Report ────────────────────────────────────────────────
    const salesRows = served.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      const gst5    = Math.round((o.total - gstBase) * 100) / 100;
      const cashAmt = o.paymentType === 'cash'  ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.cash || 0) : 0;
      const upiAmt  = o.paymentType === 'upi'   ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.upi  || 0) : 0;
      const cardAmt = o.paymentType === 'card'  ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.card || 0) : 0;
      return {
        'S.No':              i + 1,
        'Order ID':          `#${String(o.orderNumber).padStart(3, '0')}`,
        'Source':            o.orderSource === 'qr' ? 'QR' : 'Staff',
        'Date':              new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Time':              new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'Order Type':        o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        'Table No':          o.tableNumber || '-',
        'Customer':          o.customerName || '-',
        'Items Ordered':     o.items.map(ci => ci.menuItem.name).join(', '),
        'Total Qty':         o.items.reduce((s, ci) => s + ci.quantity, 0),
        'Item-wise Breakup': o.items.map(ci => `${ci.menuItem.name} x${ci.quantity} = ₹${ci.menuItem.price * ci.quantity}`).join(' | '),
        'Subtotal (₹)':      o.subtotal,
        'Discount (₹)':      o.discount,
        'Total Amount (₹)':  o.total,
        'Taxable Amt (₹)':   gstBase,
        'GST 5% (₹)':        gst5,
        'CGST 2.5% (₹)':     Math.round((gst5 / 2) * 100) / 100,
        'SGST 2.5% (₹)':     Math.round((gst5 / 2) * 100) / 100,
        'Payment Type':      PAYMENT_LABELS_LOCAL[o.paymentType || 'unpaid'],
        'Cash (₹)':          cashAmt || '-',
        'UPI (₹)':           upiAmt  || '-',
        'Card (₹)':          cardAmt || '-',
        'Biller':            o.billedBy || '-',
      };
    });

    // ── Sheet 2: Cancelled Orders ────────────────────────────────────────────
    const cancelRows = cancelled.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      const gst5    = Math.round((o.total - gstBase) * 100) / 100;
      return {
        'S.No':              i + 1,
        'Order ID':          `#${String(o.orderNumber).padStart(3, '0')}`,
        'Source':            o.orderSource === 'qr' ? 'QR' : 'Staff',
        'Date':              new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Time':              new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'Order Type':        o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        'Table No':          o.tableNumber || '-',
        'Customer':          o.customerName || '-',
        'Items':             o.items.map(ci => `${ci.menuItem.name} x${ci.quantity}`).join(', '),
        'Total Amount (₹)':  o.total,
        'Taxable Amt (₹)':   gstBase,
        'GST 5% (₹)':        gst5,
        'CGST 2.5% (₹)':     Math.round((gst5 / 2) * 100) / 100,
        'SGST 2.5% (₹)':     Math.round((gst5 / 2) * 100) / 100,
        'Cancel Reason':     o.cancelReason || '-',
        'Biller':            o.billedBy || '-',
      };
    });

    // ── Sheet 3: CGST 2.5% (per-order breakdown) ────────────────────────────
    const cgstRows = served.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'CGST 2.5% (₹)':    Math.round(((o.total - gstBase) / 2) * 100) / 100,
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 4: SGST 2.5% (per-order breakdown) ────────────────────────────
    const sgstRows = served.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'SGST 2.5% (₹)':    Math.round(((o.total - gstBase) / 2) * 100) / 100,
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 5: GST Summary ─────────────────────────────────────────────────
    const taxableTotal = Math.round((totalRevenue / 1.05) * 100) / 100;
    const gstCollected = Math.round((totalRevenue - taxableTotal) * 100) / 100;
    const cgstTotal    = Math.round((gstCollected / 2) * 100) / 100;

    const gstRows = [
      { 'Metric': 'Period',                       'Value': rangeLabel },
      { 'Metric': 'Total Orders (Served)',         'Value': served.length },
      { 'Metric': '',                             'Value': '' },
      { 'Metric': 'Total Revenue (incl. GST) (₹)', 'Value': totalRevenue },
      { 'Metric': 'Taxable Amount (₹)',            'Value': taxableTotal },
      { 'Metric': 'Total GST @ 5% (₹)',            'Value': gstCollected },
      { 'Metric': 'CGST @ 2.5% (₹)',               'Value': cgstTotal },
      { 'Metric': 'SGST @ 2.5% (₹)',               'Value': cgstTotal },
    ];

    // ── Sheet 6: Payment Breakdown ───────────────────────────────────────────
    let totalCash = 0, totalUpi = 0, totalCard = 0;
    served.forEach(o => {
      if (o.paymentType === 'cash') totalCash += o.total;
      else if (o.paymentType === 'upi') totalUpi += o.total;
      else if (o.paymentType === 'card') totalCard += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        totalCash += o.paymentBreakdown.cash; totalUpi += o.paymentBreakdown.upi; totalCard += o.paymentBreakdown.card;
      }
    });
    const payRows = [
      { 'Payment Method': 'Cash',  'Orders': served.filter(o => o.paymentType === 'cash'  || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.cash || 0) > 0)).length, 'Amount (₹)': totalCash },
      { 'Payment Method': 'UPI',   'Orders': served.filter(o => o.paymentType === 'upi'   || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.upi  || 0) > 0)).length, 'Amount (₹)': totalUpi  },
      { 'Payment Method': 'Card',  'Orders': served.filter(o => o.paymentType === 'card'  || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.card || 0) > 0)).length, 'Amount (₹)': totalCard },
      { 'Payment Method': 'TOTAL', 'Orders': served.length, 'Amount (₹)': totalRevenue },
    ];

    // ── Sheet 7: Top Items ───────────────────────────────────────────────────
    const itemRows = topItems.map((item, i) => ({
      'Rank':        i + 1,
      'Item Name':   item.name,
      'Qty Sold':    item.qty,
      'Revenue (₹)': item.revenue,
    }));

    // ── Sheet 8: Daily Closing ───────────────────────────────────────────────
    const closingRows = [
      { 'Metric': 'Period',                  'Value': rangeLabel },
      { 'Metric': 'Total Orders (Served)',   'Value': served.length },
      { 'Metric': 'Cancelled Orders',        'Value': cancelled.length },
      { 'Metric': 'Total Revenue (₹)',       'Value': totalRevenue },
      { 'Metric': 'Taxable Amount (₹)',      'Value': taxableTotal },
      { 'Metric': 'GST Collected 5% (₹)',    'Value': gstCollected },
      { 'Metric': 'CGST 2.5% (₹)',           'Value': cgstTotal },
      { 'Metric': 'SGST 2.5% (₹)',           'Value': cgstTotal },
      { 'Metric': 'Total Discounts (₹)',     'Value': totalDiscount },
      { 'Metric': 'Avg Order Value (₹)',     'Value': avgOrderValue },
      { 'Metric': '',                        'Value': '' },
      { 'Metric': 'SOURCE BREAKDOWN',        'Value': '' },
      { 'Metric': 'Staff Orders',            'Value': staffOrders.length },
      { 'Metric': 'Staff Revenue (₹)',       'Value': staffRevenue },
      { 'Metric': 'QR Orders',              'Value': qrOrders.length },
      { 'Metric': 'QR Revenue (₹)',         'Value': qrRevenue },
      { 'Metric': '',                        'Value': '' },
      { 'Metric': 'PAYMENT BREAKDOWN',       'Value': '' },
      { 'Metric': 'Cash (₹)',               'Value': totalCash },
      { 'Metric': 'UPI (₹)',                'Value': totalUpi  },
      { 'Metric': 'Card (₹)',               'Value': totalCard },
      { 'Metric': '',                        'Value': '' },
      { 'Metric': 'ORDER TYPE',              'Value': '' },
      { 'Metric': 'Dine In',                'Value': dineInCount },
      { 'Metric': 'Takeaway',               'Value': takeawayCount },
      { 'Metric': '',                        'Value': '' },
      { 'Metric': 'CANCELLATIONS',           'Value': '' },
      { 'Metric': 'Cancelled Orders',        'Value': cancelled.length },
      { 'Metric': 'Lost Revenue (₹)',        'Value': cancelled.reduce((s, o) => s + o.total, 0) },
    ];

    const wb = XLSX.utils.book_new();
    addSheet(wb, salesRows,   'Sales Report',      'No served orders');
    addSheet(wb, cancelRows,  'Cancelled Orders',  'No cancellations');
    addSheet(wb, cgstRows,    'CGST 2.5%',         'No data');
    addSheet(wb, sgstRows,    'SGST 2.5%',         'No data');
    addSheet(wb, gstRows,     'GST Summary',       'No data');
    addSheet(wb, payRows,     'Payment Breakdown', 'No data');
    addSheet(wb, itemRows,    'Top Items',         'No items sold');
    addSheet(wb, closingRows, 'Daily Closing',     'No data');
    XLSX.writeFile(wb, `CafeAadvikam_Report_${dateLabel}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Date Range</span>
          </div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition">
            <Download className="size-3" />Excel
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing: <span className="font-semibold text-foreground">{rangeLabel}</span>
          {' · '}{served.length} orders · {formatCurrency(totalRevenue)}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(totalRevenue)} color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Orders Served" value={String(served.length)} color="bg-accent/20 text-accent-foreground" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<XCircle className="size-4" />} label="Cancelled" value={String(cancelled.length)} color="bg-red-50 text-red-700" />
      </div>

      {/* Payment breakdown */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3">Payment Breakdown</h3>
        <div className="space-y-2">
          <PaymentRow label="💵 Cash" amount={paymentTotals.cash} total={totalRevenue} />
          <PaymentRow label="📱 UPI" amount={paymentTotals.upi} total={totalRevenue} />
          <PaymentRow label="💳 Card" amount={paymentTotals.card} total={totalRevenue} />
        </div>
      </div>

      {/* GST */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3">GST Summary</h3>
        {totalRevenue === 0 ? (
          <p className="text-sm font-body text-muted-foreground text-center py-4">No data for this range</p>
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

      {/* Daily Revenue Chart */}
      {dailyRevenue.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Daily Revenue Trend</h3>
          <p className="text-[10px] text-muted-foreground mb-4">{rangeLabel}</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={dailyRevenue}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Order Type Split */}
      {orderTypeData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Order Type Split</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={orderTypeData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                    <Cell fill={CHART_COLORS[0]} />
                    <Cell fill={CHART_COLORS[2]} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {orderTypeData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-3 rounded-full" style={{ background: CHART_COLORS[i === 0 ? 0 : 2] }} />
                  <div>
                    <p className="text-xs font-semibold">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.value} orders</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top items */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-1">Top Items by Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-4">Revenue · sales quantity shown alongside</p>
        {topItemsByRevenue.length === 0 ? (
          <p className="text-sm font-body text-muted-foreground text-center py-4">No sales in this range</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(topItemsByRevenue.length * 30, 150)}>
              <BarChart data={topItemsByRevenue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-3">
              {topItems.slice(0, 5).map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={cn('size-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                    i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                  <p className="flex-1 text-xs font-medium truncate">{item.name}</p>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-primary tabular-nums">{formatCurrency(item.revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{item.qty} sold</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Order transactions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground">Order Transactions</h3>
          <span className="text-xs text-muted-foreground">{rangeOrders.length} total</span>
        </div>
        {rangeOrders.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No orders in this range.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {rangeOrders.slice(0, 100).map(o => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">#{o.orderNumber}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold',
                      o.status === 'served' ? 'bg-emerald-100 text-emerald-700' :
                      o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      o.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    )}>{o.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(o.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {o.paymentType !== 'unpaid' && ` · ${o.paymentType}`}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums">{formatCurrency(o.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BAKERY REPORTS TAB (custom range + summary + transactions) ───────────────
function BakeryReportsTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [reportType, setReportType] = useState<'item' | 'branch'>('item');
  const [filterBranch, setFilterBranch] = useState<Branch | 'all'>('all');

  const todayISO = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);

  useEffect(() => {
    BRANCHES.forEach(b => fetchBranchData(b));
  }, [fetchBranchData]);

  const allSales = useMemo(() => {
    const result: Array<{ id: string; branch: Branch; itemName: string; quantitySold: number; soldAt: string; soldBy: string; unitPrice: number }> = [];
    BRANCHES.forEach(branch => {
      (sales[branch] || []).forEach(s => result.push({
        ...s, branch,
        unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
      }));
    });
    return result.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales]);

  const rangeSales = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
    return allSales.filter(s => {
      const t = new Date(s.soldAt).getTime();
      if (t < from.getTime() || t > to.getTime()) return false;
      if (filterBranch !== 'all' && s.branch !== filterBranch) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo, filterBranch]);

  const itemReport = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    rangeSales.forEach(s => {
      const ex = map.get(s.itemName);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [rangeSales]);

  const branchReport = useMemo(() => {
    const map = new Map<Branch, { qty: number; revenue: number }>();
    rangeSales.forEach(s => {
      const ex = map.get(s.branch);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.branch, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [rangeSales]);

  const totalRevenue = itemReport.reduce((a, [, v]) => a + v.revenue, 0);
  const totalQty = itemReport.reduce((a, [, v]) => a + v.qty, 0);

  const rangeLabel = dateFrom === dateTo
    ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const BRANCH_COLORS: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700',
    SNB: 'bg-amber-100 text-amber-700',
    Hosur: 'bg-emerald-100 text-emerald-700',
  };

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`;
    const autoWidth = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2 }));
    };
    const addSheet = (wb: ReturnType<typeof XLSX.utils.book_new>, data: Record<string, unknown>[], name: string, fallback: string) => {
      const rows = data.length > 0 ? data : [{ Note: fallback }];
      const ws = XLSX.utils.json_to_sheet(rows);
      if (data.length > 0) autoWidth(ws, data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    const summaryRows = [
      { 'Metric': 'Period', 'Value': `${dateFrom} to ${dateTo}` },
      { 'Metric': 'Branch Filter', 'Value': filterBranch },
      { 'Metric': 'Transactions', 'Value': rangeSales.length },
      { 'Metric': 'Total Revenue', 'Value': formatCurrency(totalRevenue) },
      { 'Metric': 'Total Qty Sold', 'Value': totalQty },
    ];
    const itemRows = itemReport.map(([item, v], i) => ({ 'Rank': i + 1, 'Item': item, 'Revenue': v.revenue, 'Qty Sold': v.qty }));
    const branchRows = branchReport.map(([branch, v]) => ({
      'Branch': branch, 'Revenue': v.revenue, 'Qty Sold': v.qty,
      'Revenue Share %': totalRevenue > 0 ? `${Math.round((v.revenue / totalRevenue) * 100)}%` : '0%',
    }));
    const txRows = rangeSales.map((s, i) => ({
      'S.No': i + 1, 'Branch': s.branch, 'Item': s.itemName,
      'Qty Sold': s.quantitySold, 'Unit Price': s.unitPrice,
      'Revenue': s.unitPrice * s.quantitySold,
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      'Sold By': s.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    addSheet(wb, summaryRows, 'Summary', 'No data');
    addSheet(wb, itemRows, 'Item-wise', 'No sales for this range');
    addSheet(wb, branchRows, 'Branch-wise', 'No sales for this range');
    addSheet(wb, txRows, 'Transactions', 'No transactions');
    XLSX.writeFile(wb, `BakeryReport_${dateLabel}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 col-span-2">
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Total Revenue</p>
          <p className="font-display text-2xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalQty} items · {rangeSales.length} transactions · {rangeLabel}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Filters</span>
          </div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition">
            <Download className="size-3" />Excel
          </button>
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value as Branch | 'all')}
          className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background">
          <option value="all">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background" />
          </div>
        </div>
      </div>

      {/* Item / Branch Report */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
          {(['item', 'branch'] as const).map(r => (
            <button key={r} onClick={() => setReportType(r)}
              className={cn('text-xs px-3 py-1 rounded-lg capitalize font-medium transition',
                reportType === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              {r}-wise
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          {reportType === 'item' ? (
            itemReport.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No sales for this range.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-1.5">Item</th>
                    <th className="text-right py-1.5 text-primary font-semibold">Revenue</th>
                    <th className="text-right py-1.5">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {itemReport.map(([item, v]) => (
                    <tr key={item}>
                      <td className="py-2 text-sm">{item}</td>
                      <td className="py-2 text-right font-bold text-primary tabular-nums">{formatCurrency(v.revenue)}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums text-xs">{v.qty}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right text-primary">{formatCurrency(totalRevenue)}</td>
                    <td className="py-2 text-right text-muted-foreground text-xs">{totalQty}</td>
                  </tr>
                </tbody>
              </table>
            )
          ) : (
            branchReport.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No sales for this range.</p>
            ) : (
              <div className="space-y-3 py-2">
                {branchReport.map(([branch, v]) => {
                  const pct = totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 100) : 0;
                  return (
                    <div key={branch} className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', BRANCH_COLORS[branch as Branch])}>{branch}</span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-primary">{formatCurrency(v.revenue)}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{v.qty} items ({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(totalRevenue)}</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground">Sale Transactions</h3>
          <span className="text-xs text-muted-foreground">{rangeSales.length} records</span>
        </div>
        {rangeSales.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No transactions in this range.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {rangeSales.slice(0, 100).map(s => {
              const lineRev = s.unitPrice * s.quantitySold;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.itemName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', BRANCH_COLORS[s.branch])}>{s.branch}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">· {s.soldBy}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(lineRev)}</p>
                    <p className="text-[10px] text-muted-foreground">×{s.quantitySold} sold</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── BAKERY VIEW (Dashboard / Sales sub-tabs) ────────────────────────────────
function BakeryView() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'activity' | 'dayend'>('dashboard');

  useEffect(() => {
    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { id: 'dashboard' as const, label: 'Overview',  icon: LayoutDashboard },
    { id: 'reports'   as const, label: 'Reports',   icon: FileText         },
    { id: 'activity'  as const, label: 'Activity',  icon: ClipboardList    },
    { id: 'dayend'    as const, label: 'Day-End',   icon: Calendar         },
  ];

  const unread = 0;
  const pendingInvoices = 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 whitespace-nowrap flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-[11px] font-medium transition',
              tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
            )}
          >
            <t.icon className="size-3" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <BakeryDashboardTab />}
      {tab === 'reports'   && <BakeryReportsMerged branch="all" />}
      {tab === 'activity'  && <StaffActivityLog />}
      {tab === 'dayend'    && <DayEndReport />}
    </div>
  );
}

// ─── MAIN ADMIN DASHBOARD ────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [mode, setMode] = useState<'cafe' | 'bakery' | 'credit' | 'advance'>('cafe');
  // BUG-03 FIX: single polling registration at root — previously registered twice
  // (CafeDashboardTab + CafeReportsTab both called startPolling, driving ref count to 2).
  // STORE-01 FIX: granular selector — stable action refs, no re-renders from unrelated state
  const { startPolling, stopPolling } = useOrderStore(
    useShallow(s => ({ startPolling: s.startPolling, stopPolling: s.stopPolling }))
  );
  useEffect(() => {
    startPolling(60); // 60-day window for admin reports
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div className="dashboard-screen min-h-[100dvh] bg-transparent pt-0 pb-6">
      {/* ── Page header ── */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">Admin Portal</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Dashboard</h1>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Cafe / Bakery / Credit / Advance toggle */}
      <div className="mx-4 my-4 grid grid-cols-2 gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button
          onClick={() => setMode('cafe')}
          className={cn(
            'py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          ☕ Cafe
        </button>
        <button
          onClick={() => setMode('bakery')}
          className={cn(
            'py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'bakery' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          🥐 Bakery
        </button>
        <button
          onClick={() => setMode('credit')}
          className={cn(
            'py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'credit' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          💳 Credit
        </button>
        <button
          onClick={() => setMode('advance')}
          className={cn(
            'py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'advance' ? 'bg-amber-500 text-white shadow-soft' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          🏷️ Advance
        </button>
      </div>

      <div className="px-4 space-y-4">
        {mode === 'cafe'   && <CafeView />}
        {mode === 'bakery' && <BakeryView />}
        {mode === 'credit' && (
          <AdminCreditTab
            branches={['Cafe', 'VRSNB', 'SNB', 'Hosur']}
          />
        )}
        {mode === 'advance' && (
          <AdminAdvanceTab branches={['Cafe', 'VRSNB', 'SNB', 'Hosur']} />
        )}
      </div>

      <div className="px-4 mt-6">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'hsl(var(--muted)/0.5)' }}>
          <Package className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs font-body text-muted-foreground">Data retained for last 60 days. Older records are automatically purged.</p>
        </div>
      </div>
    </div>
  );
}
