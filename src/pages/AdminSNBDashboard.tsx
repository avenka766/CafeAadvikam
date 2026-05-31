// src/pages/AdminSNBDashboard.tsx
// Admin Dashboard 2 – SNB Admin: SNB branch only
import EmptyState from '@/components/ui/EmptyState';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import AdminAdvanceTab from '@/components/admin/AdminAdvanceTab';
import { useMemo, useEffect, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { useOrderStore } from '@/stores/orderStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Package,
  Download, Filter, BarChart3,
} from 'lucide-react';

const COLORS = ['#C5973E', '#2D7D6F', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'];

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

// ── SNB Bakery Dashboard Tab ──────────────────────────────────────────────────
function SNBBakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today');
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  const allSales = useMemo(() => (sales['SNB'] || []).map(s => ({
    ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
  })), [sales]);

  const filteredSales = useMemo(() => allSales.filter(s => new Date(s.soldAt) >= cutoff), [allSales, cutoff]);
  const totalRevenue = filteredSales.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = filteredSales.reduce((a, s) => a + s.quantitySold, 0);
  const stockItems = stock['SNB'] || [];
  const lowStock = stockItems.filter(s => s.quantity <= s.minThreshold).length;
  const inStock = stockItems.filter(s => s.quantity > s.minThreshold).length;
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
  const stockPie = [
    { name: 'OK', value: inStock, color: COLORS[1] },
    { name: 'Low', value: lowStock, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Sold by person breakdown
  const soldByData = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filteredSales.forEach(s => {
      const ex = map.get(s.soldBy);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.soldBy, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, v], i) => ({ name, ...v, color: COLORS[i % COLORS.length] }));
  }, [filteredSales]);

  return (
    <div className="space-y-4">
      {/* Date toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['today', '7d', '30d'] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Revenue" value={formatCurrency(totalRevenue)} sub="SNB branch" color="bg-amber-50 text-amber-700" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Items Sold" value={String(totalQty)} sub={`${filteredSales.length} txns`} color="bg-blue-50 text-blue-700" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Txn" value={formatCurrency(avgTxnValue)} color="bg-primary/10 text-primary" />
        <KPI icon={<Package className="size-4" />} label="Low Stock" value={String(lowStock)} sub={`of ${stockItems.length} items`} color={lowStock > 0 ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Revenue Trend */}
      {dateRange !== 'today' && dailyData.some(d => d.revenue > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <TrendingUp className="size-4 text-amber-600" />Revenue Trend – SNB
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">Daily revenue over selected period</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="snbGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke={COLORS[0]} strokeWidth={2} fill="url(#snbGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily qty trend */}
      {dateRange !== 'today' && dailyData.some(d => d.qty > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <BarChart3 className="size-4 text-amber-600" />Items Sold per Day
          </h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="qty" name="Qty Sold" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items bar chart */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
          <p className="text-[10px] text-muted-foreground mb-3">SNB branch · {dateRange === 'today' ? 'Today' : dateRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</p>
          <ResponsiveContainer width="100%" height={Math.max(topItems.length * 32, 160)}>
            <BarChart data={topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items progress list */}
      {topItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Item Performance</h3>
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
                      <p className="text-sm font-bold tabular-nums text-amber-700">{formatCurrency(item.revenue)}</p>
                      <p className="text-[10px] text-muted-foreground">{item.qty} sold</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.round((item.revenue / maxRev) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sold-by breakdown */}
      {soldByData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Sales by Staff</h3>
          <div className="flex items-center gap-3">
            {soldByData.length <= 4 && (
              <ResponsiveContainer width="45%" height={130}>
                <PieChart>
                  <Pie data={soldByData} dataKey="revenue" cx="50%" cy="50%" outerRadius={55} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {soldByData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex-1 space-y-2">
              {soldByData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <p className="text-xs font-medium flex-1 truncate">{d.name}</p>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums">{formatCurrency(d.revenue)}</p>
                    <p className="text-[9px] text-muted-foreground">{d.qty} items</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stock health */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-3 flex items-center gap-2">
          <Package className="size-4 text-amber-600" />Stock Health – SNB
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

// ── SNB Reports + Sales Combined Tab ─────────────────────────────────────────
function SNBReportsTab() {
  const { sales, fetchBranchData } = useBranchStore();
  const [filterItem, setFilterItem] = useState('');
  const [filterDate, setFilterDate] = useState('');
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);

  const snbSales = useMemo(() =>
    (sales['SNB'] || []).map(s => ({
      ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
    })).sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()),
    [sales]);

  const allItems = useMemo(() => [...new Set(snbSales.map(s => s.itemName))].sort(), [snbSales]);

  const filtered = useMemo(() => snbSales.filter(s => {
    if (filterItem && s.itemName !== filterItem) return false;
    if (filterDate && new Date(s.soldAt).toDateString() !== new Date(filterDate).toDateString()) return false;
    return true;
  }), [snbSales, filterItem, filterDate]);

  const totalRevenue = filtered.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = filtered.reduce((a, s) => a + s.quantitySold, 0);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((s, i) => ({
      'S.No': i + 1, 'Item': s.itemName, 'Qty': s.quantitySold,
      'Unit Price': s.unitPrice, 'Revenue': s.unitPrice * s.quantitySold,
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'Sold By': s.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'SNB Sales');
    XLSX.writeFile(wb, `SNB_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* BakeryReportsMerged handles charts + analytics */}
      <BakeryReportsMerged branch="SNB" />

      {/* Sales log section merged below */}
      <div className="pt-2 border-t border-border">
        <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-widest mb-3">Sales Log</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Revenue</p>
            <p className="font-display text-xl font-bold text-amber-700 tabular-nums">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Items Sold</p>
            <p className="font-display text-xl font-bold tabular-nums">{totalQty}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3 mb-4">
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
                      <p className="text-sm font-bold tabular-nums text-amber-700">{formatCurrency(lineRev)}</p>
                      <p className="text-[10px] text-muted-foreground">×{s.quantitySold} sold</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminSNBDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'credit' | 'advance'>('dashboard');
  const { startPolling, stopPolling } = useOrderStore();
  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-amber-600 uppercase tracking-widest mb-1">SNB Admin</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Dashboard</h1>
          </div>
          <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[11px] font-bold">SNB Branch</span>
        </div>
      </div>
      <div className="mx-4 my-4 grid grid-cols-2 gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        {([
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'reports',   label: '📋 Reports'   },
          { id: 'credit',    label: '💳 Credit'    },
          { id: 'advance',   label: '🏷️ Advance'   },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
              tab === t.id
                ? t.id === 'advance' ? 'bg-amber-500 text-white shadow-soft' : 'bg-card shadow-soft text-foreground'
                : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 space-y-4">
        {tab === 'dashboard' && <SNBBakeryDashboardTab />}
        {tab === 'reports'   && <SNBReportsTab />}
        {tab === 'credit'    && <AdminCreditTab branches={['SNB']} accentColor="text-amber-600" />}
        {tab === 'advance'   && <AdminAdvanceTab branches={['SNB']} />}
      </div>
    </div>
  );
}
