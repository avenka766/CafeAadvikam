// src/pages/AdminVRSNBDashboard.tsx
// Admin Dashboard 1 – VRSNB Admin: Cafe + VRSNB branch only
import EmptyState from '@/components/ui/EmptyState';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import KitchenWasteLogTab from '@/components/KitchenWasteLogTab';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import AdminAdvanceTab from '@/components/admin/AdminAdvanceTab';
import { useMemo, useEffect, useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Clock,
  RefreshCw, Wifi, Download, Filter,
  LayoutDashboard, FileText, Trash2, BarChart3, Package,
  ArrowUpRight,
} from 'lucide-react';

const COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'];

function KPI({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6" style={{ background: 'hsl(var(--primary))' }} />
      <div className={cn('size-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', color)}>{icon}</div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
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

// ── Cafe Dashboard Tab ─────────────────────────────────────────────────────────
function CafeDashboardTab() {
  const { orders, polling } = useOrderStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today');

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  const filteredOrders = useMemo(() => orders.filter(o => new Date(o.createdAt) >= cutoff), [orders, cutoff]);
  const served = filteredOrders.filter(o => o.status === 'served');
  const todayStr = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);

  const totalRevenue = served.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = served.length > 0 ? Math.round(totalRevenue / served.length) : 0;

  const peakHour = useMemo(() => {
    const hours: Record<number, number> = {};
    served.forEach(o => { const h = new Date(o.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; });
    let max = 0, maxH = 0;
    Object.entries(hours).forEach(([h, c]) => { if (Number(c) > max) { max = Number(c); maxH = Number(h); } });
    return max === 0 ? 'N/A' : `${maxH > 12 ? maxH - 12 : maxH || 12}${maxH >= 12 ? 'PM' : 'AM'}`;
  }, [served]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    served.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.id);
      const rev = ci.menuItem.price * ci.quantity;
      if (ex) { ex.qty += ci.quantity; ex.revenue += rev; }
      else map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: rev });
    }));
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8)
      .map(i => ({ ...i, name: i.name.length > 14 ? i.name.slice(0, 14) + '…' : i.name }));
  }, [served]);

  const pay = useMemo(() => {
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

  const payPieData = [
    { name: 'Cash', value: pay.cash, color: COLORS[0] },
    { name: 'UPI', value: pay.upi, color: COLORS[1] },
    { name: 'Card', value: pay.card, color: COLORS[2] },
  ].filter(p => p.value > 0);

  // Hourly orders chart
  const hourlyData = useMemo(() => {
    const map: Record<number, number> = {};
    served.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      map[h] = (map[h] || 0) + 1;
    });
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`,
      orders: map[h] || 0,
    })).filter((_, h) => h >= 6 && h <= 22);
  }, [served]);

  // Daily revenue trend
  const dailyData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toDateString();
      const rev = orders.filter(o => new Date(o.createdAt).toDateString() === dateStr && o.status === 'served').reduce((s, o) => s + o.total, 0);
      return { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: rev };
    });
  }, [orders, dateRange]);

  // Order type split
  const dineIn = served.filter(o => o.orderType === 'dine_in').length;
  const takeaway = served.filter(o => o.orderType !== 'dine_in').length;
  const orderTypePie = [
    { name: 'Dine In', value: dineIn, color: COLORS[0] },
    { name: 'Takeaway', value: takeaway, color: COLORS[2] },
  ].filter(d => d.value > 0);

  const pending = todayOrders.filter(o => o.status === 'pending').length;
  const preparing = todayOrders.filter(o => o.status === 'preparing').length;
  const ready = todayOrders.filter(o => o.status === 'ready').length;
  const cancelled = todayOrders.filter(o => o.status === 'cancelled').length;

  return (
    <div className="space-y-4">
      {/* Live indicator + date toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
          <span className="text-xs text-muted-foreground">{polling ? 'Live' : 'Offline'}</span>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {(['today', '7d', '30d'] as const).map(r => (
            <button key={r} onClick={() => setDateRange(r)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
              {r === 'today' ? 'Today' : r === '7d' ? '7D' : '30D'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Revenue" value={formatCurrency(totalRevenue)} sub={`${served.length} orders`} color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Orders" value={String(served.length)} sub={`avg ${formatCurrency(avgOrderValue)}`} color="bg-accent/20 text-accent-foreground" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Order" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<Clock className="size-4" />} label="Peak Hour" value={peakHour} color="bg-amber-50 text-amber-700" />
      </div>

      {/* Live order status */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <RefreshCw className="size-4 text-primary" />Live Order Status
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <StatusBadge label="Pending" count={pending} color="bg-amber-100 text-amber-800" />
          <StatusBadge label="Preparing" count={preparing} color="bg-blue-100 text-blue-800" />
          <StatusBadge label="Ready" count={ready} color="bg-emerald-100 text-emerald-800" />
          <StatusBadge label="Cancelled" count={cancelled} color="bg-red-100 text-red-800" />
        </div>
      </div>

      {/* Revenue Trend */}
      {dateRange !== 'today' && dailyData.some(d => d.revenue > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Revenue Trend
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">Cafe sales over time</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="cafeGradVRSNB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cafeGradVRSNB)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hourly order heatmap */}
      {hourlyData.some(d => d.orders > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />Orders by Hour
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">When customers order most</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 8 }} interval={1} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="orders" name="Orders" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Breakdown */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-3">Payment Breakdown</h3>
        {totalRevenue === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No payment data</p>
        ) : (
          <div className="space-y-2">
            <PaymentRow label="💵 Cash" amount={pay.cash} total={totalRevenue} />
            <PaymentRow label="📱 UPI" amount={pay.upi} total={totalRevenue} />
            <PaymentRow label="💳 Card" amount={pay.card} total={totalRevenue} />
          </div>
        )}
      </div>

      {/* Order type split pie */}
      {orderTypePie.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Order Type Split</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={140}>
              <PieChart>
                <Pie data={orderTypePie} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {orderTypePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} orders`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {orderTypePie.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-3 rounded-full shrink-0" style={{ background: d.color }} />
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

      {/* Top items by revenue — bar chart */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
          <p className="text-[10px] text-muted-foreground mb-3">Cafe · {dateRange === 'today' ? 'Today' : dateRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</p>
          <ResponsiveContainer width="100%" height={Math.max(topItems.length * 32, 160)}>
            <BarChart data={topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items by qty list */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Top Selling (by Quantity)</h3>
          <div className="space-y-2">
            {[...topItems].sort((a, b) => b.qty - a.qty).map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item.name}</p>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{item.qty} sold</p>
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cafe Reports Tab ───────────────────────────────────────────────────────────
function CafeReportsTab() {
  const { orders } = useOrderStore();
  const [mode, setMode] = useState<'today' | 'custom'>('today');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const filtered = useMemo(() => {
    if (mode === 'today') {
      const today = new Date().toDateString();
      return orders.filter(o => new Date(o.createdAt).toDateString() === today && o.status === 'served');
    }
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    return orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= s && d <= e && o.status === 'served';
    });
  }, [orders, mode, startDate, endDate]);

  const totalRevenue = filtered.reduce((s, o) => s + o.total, 0);
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filtered.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.id);
      if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
      else map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity });
    }));
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  // Category revenue breakdown
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(o => o.items.forEach(ci => {
      const cat = (ci.menuItem as typeof ci.menuItem & { category?: string }).category ?? 'Other';
      map.set(cat, (map.get(cat) ?? 0) + ci.menuItem.price * ci.quantity);
    }));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [filtered]);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((o, i) => ({
      'S.No': i + 1, 'Order#': o.orderNumber,
      'Type': o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
      'Total': o.total, 'Payment': o.paymentType,
      'Date': new Date(o.createdAt).toLocaleDateString('en-IN'),
      'Items': o.items.map(ci => `${ci.menuItem.name}×${ci.quantity}`).join(', '),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Cafe Sales');
    XLSX.writeFile(wb, `CafeSales_VRSNB_Admin_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const chartItems = topItems.slice(0, 10).map(i => ({ ...i, name: i.name.length > 14 ? i.name.slice(0, 14) + '…' : i.name }));

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          {(['today', 'custom'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={cn('flex-1 py-2 rounded-xl text-sm font-semibold transition-all', mode === m ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
              {m === 'today' ? 'Today' : 'Custom'}
            </button>
          ))}
        </div>
        {mode === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{filtered.length} orders · {formatCurrency(totalRevenue)}</p>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted">
            <Download className="size-3" />Excel
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-primary tabular-nums">{filtered.length}</p>
          <p className="text-[9px] font-semibold uppercase text-muted-foreground mt-0.5">Orders</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold tabular-nums">{topItems.reduce((a, i) => a + i.qty, 0)}</p>
          <p className="text-[9px] font-semibold uppercase text-muted-foreground mt-0.5">Items Sold</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-emerald-700 tabular-nums">{formatCurrency(filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0)}</p>
          <p className="text-[9px] font-semibold uppercase text-emerald-600 mt-0.5">Avg Order</p>
        </div>
      </div>

      {/* Category revenue pie */}
      {categoryData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Revenue by Category</h3>
          <div className="flex gap-3 items-center">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={65} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatCurrency(v), '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {categoryData.slice(0, 6).map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <p className="text-xs font-medium truncate flex-1">{d.name}</p>
                  <p className="text-xs font-bold tabular-nums">{formatCurrency(d.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top items bar chart */}
      {chartItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Top Items by Quantity</h3>
          <ResponsiveContainer width="100%" height={Math.max(chartItems.length * 30, 160)}>
            <BarChart data={chartItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
              <Tooltip />
              <Bar dataKey="qty" name="Qty Sold" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Item revenue table */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Item Revenue Breakdown</h3>
          <div className="space-y-2">
            {topItems.slice(0, 10).map((item, i) => {
              const pct = totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0;
              return (
                <div key={item.name}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('size-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <span className="text-sm font-bold">{formatCurrency(item.revenue)}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── VRSNB Bakery Dashboard ────────────────────────────────────────────────────
function VRSNBBakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today');
  useEffect(() => { fetchBranchData('VRSNB'); }, [fetchBranchData]);

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  const allSales = useMemo(() => (sales['VRSNB'] || []).map(s => ({
    ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
  })), [sales]);

  const filteredSales = useMemo(() => allSales.filter(s => new Date(s.soldAt) >= cutoff), [allSales, cutoff]);
  const totalQty = filteredSales.reduce((a, s) => a + s.quantitySold, 0);
  const totalRevenue = filteredSales.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const stockItems = stock['VRSNB'] || [];
  const lowStock = stockItems.filter(s => s.quantity <= s.minThreshold).length;
  const avgTxnValue = filteredSales.length > 0 ? Math.round(totalRevenue / filteredSales.length) : 0;

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filteredSales.forEach(s => {
      const ex = map.get(s.itemName);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
      .map(([name, v]) => ({ name: name.length > 16 ? name.slice(0, 16) + '…' : name, ...v }));
  }, [filteredSales]);

  // Daily revenue trend
  const dailyData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toDateString();
      const rev = allSales.filter(s => new Date(s.soldAt).toDateString() === dateStr).reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
      const qty = allSales.filter(s => new Date(s.soldAt).toDateString() === dateStr).reduce((a, s) => a + s.quantitySold, 0);
      return { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: rev, qty };
    });
  }, [allSales, dateRange]);

  // Stock health pie
  const inStock = stockItems.filter(s => s.quantity > s.minThreshold).length;
  const stockPie = [
    { name: 'OK', value: inStock, color: COLORS[0] },
    { name: 'Low', value: lowStock, color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['today', '7d', '30d'] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Revenue" value={formatCurrency(totalRevenue)} sub="VRSNB branch" color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Items Sold" value={String(totalQty)} sub={`${filteredSales.length} txns`} color="bg-blue-50 text-blue-700" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Txn" value={formatCurrency(avgTxnValue)} color="bg-emerald-50 text-emerald-700" />
        <KPI icon={<Package className="size-4" />} label="Low Stock" value={String(lowStock)} sub={`of ${stockItems.length} items`} color={lowStock > 0 ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Revenue trend */}
      {dateRange !== 'today' && dailyData.some(d => d.revenue > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Revenue Trend – VRSNB
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">Daily revenue over selected period</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="vrsnbGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[2]} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS[2]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke={COLORS[2]} strokeWidth={2} fill="url(#vrsnbGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily qty trend */}
      {dateRange !== 'today' && dailyData.some(d => d.qty > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />Items Sold per Day
          </h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="qty" name="Qty Sold" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items bar chart */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
          <p className="text-[10px] text-muted-foreground mb-3">VRSNB branch · {dateRange === 'today' ? 'Today' : dateRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</p>
          <ResponsiveContainer width="100%" height={Math.max(topItems.length * 32, 160)}>
            <BarChart data={topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue vs Qty dual view */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Revenue vs Quantity</h3>
          <div className="space-y-2.5">
            {topItems.map((item, i) => {
              const maxRev = Math.max(...topItems.map(t => t.revenue), 1);
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('size-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                      <p className="text-sm font-medium truncate">{item.name}</p>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(item.revenue)}</p>
                      <p className="text-[10px] text-muted-foreground">{item.qty} sold</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round((item.revenue / maxRev) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stock health */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-3 flex items-center gap-2">
          <Package className="size-4 text-primary" />Stock Health
        </h3>
        <div className="flex items-center gap-4">
          {stockPie.length > 0 && (
            <ResponsiveContainer width="45%" height={120}>
              <PieChart>
                <Pie data={stockPie} dataKey="value" cx="50%" cy="50%" outerRadius={50} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                  {stockPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Items</span><span className="font-bold">{stockItems.length}</span></div>
            <div className="flex justify-between text-sm"><span className="text-emerald-600">In Stock</span><span className="font-bold text-emerald-700">{inStock}</span></div>
            <div className="flex justify-between text-sm"><span className="text-red-600">Low / Out</span><span className="font-bold text-red-700">{lowStock}</span></div>
          </div>
        </div>
      </div>

      {/* Low stock alerts */}
      {lowStock > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-display text-base font-bold text-red-700 mb-2">⚠ Low Stock Alerts</h3>
          <div className="space-y-1">
            {stockItems.filter(s => s.quantity <= s.minThreshold).map(s => (
              <div key={s.id} className="flex justify-between text-sm">
                <span className="text-red-700">{s.itemName}</span>
                <span className="font-bold text-red-800 tabular-nums">{s.quantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── VRSNB Bakery Sales Tab ────────────────────────────────────────────────────
function VRSNBBakerySalesTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [filterItem, setFilterItem] = useState('');
  const [filterDate, setFilterDate] = useState('');
  useEffect(() => { fetchBranchData('VRSNB'); }, [fetchBranchData]);
  const vrsnbSales = useMemo(() => (sales['VRSNB'] || [])
    .map(s => ({ ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0 }))
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()), [sales]);
  const allItems = useMemo(() => [...new Set(vrsnbSales.map(s => s.itemName))].sort(), [vrsnbSales]);
  const filtered = useMemo(() => vrsnbSales.filter(s => {
    if (filterItem && s.itemName !== filterItem) return false;
    if (filterDate && new Date(s.soldAt).toDateString() !== new Date(filterDate).toDateString()) return false;
    return true;
  }), [vrsnbSales, filterItem, filterDate]);

  const totalRevenue = filtered.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = filtered.reduce((a, s) => a + s.quantitySold, 0);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((s, i) => ({
      'S.No': i + 1, 'Item': s.itemName, 'Qty Sold': s.quantitySold,
      'Unit Price': s.unitPrice, 'Revenue': s.unitPrice * s.quantitySold,
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'Sold By': s.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'VRSNB Sales');
    XLSX.writeFile(wb, `VRSNB_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
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
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Filter className="size-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Filters – VRSNB</h3></div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"><Download className="size-3" />Excel</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filterItem} onChange={e => setFilterItem(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2">
            <option value="">All Items</option>
            {allItems.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2" />
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} records · {totalQty} items · {formatCurrency(totalRevenue)}</p>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon="📊" message="No sales found" sub="Sales will appear here once items are billed." />
        ) : (
          <div className="divide-y">
            {filtered.slice(0, 50).map(s => {
              const lineRev = s.unitPrice * s.quantitySold;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.itemName}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
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

// ── Cafe Sub-View ─────────────────────────────────────────────────────────────
function CafeView() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'waste'>('dashboard');
  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports'   as const, label: 'Reports',   icon: FileText },
    { id: 'waste'     as const, label: 'Waste Log', icon: Trash2 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('shrink-0 whitespace-nowrap flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
              tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>
            <t.icon className="size-3" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <CafeDashboardTab />}
      {tab === 'reports'   && <CafeReportsTab />}
      {tab === 'waste'     && <KitchenWasteLogTab />}
    </div>
  );
}

// ── VRSNB Bakery Sub-View ────────────────────────────────────────────────────
function VRSNBBakeryView() {
  const [tab, setTab] = useState<'dashboard' | 'sales' | 'reports'>('dashboard');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto">
        {([
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'sales',     label: '🧾 Sales'     },
          { id: 'reports',   label: '📋 Reports'   },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('shrink-0 flex-1 py-2 rounded-lg text-xs font-semibold transition-all', tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <VRSNBBakeryDashboardTab />}
      {tab === 'sales'     && <VRSNBBakerySalesTab />}
      {tab === 'reports'   && <BakeryReportsMerged branch="VRSNB" />}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminVRSNBDashboard() {
  const [mode, setMode] = useState<'cafe' | 'bakery' | 'credit' | 'advance'>('cafe');
  const { startPolling, stopPolling } = useOrderStore();
  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">VRSNB Admin</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Dashboard</h1>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
      <div className="mx-4 my-4 grid grid-cols-2 gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button onClick={() => setMode('cafe')} className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          ☕ Cafe
        </button>
        <button onClick={() => setMode('bakery')} className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'bakery' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          🥐 Bakery
        </button>
        <button onClick={() => setMode('credit')} className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'credit' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          💳 Credit
        </button>
        <button onClick={() => setMode('advance')} className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'advance' ? 'bg-amber-500 text-white shadow-soft' : 'text-muted-foreground hover:text-foreground')}>
          🏷️ Advance
        </button>
      </div>
      <div className="px-4 space-y-4">
        {mode === 'cafe'    && <CafeView />}
        {mode === 'bakery'  && <VRSNBBakeryView />}
        {mode === 'credit'  && <AdminCreditTab branches={['Cafe', 'VRSNB']} accentColor="text-blue-700" />}
        {mode === 'advance' && <AdminAdvanceTab branches={['Cafe', 'VRSNB']} />}
      </div>
    </div>
  );
}
