// src/pages/AdminSNBDashboard.tsx
// Admin Dashboard 2 – SNB Admin: SNB branch only
import EmptyState from '@/components/ui/EmptyState';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import { useMemo, useEffect, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { useOrderStore } from '@/stores/orderStore';
import { useNotificationStore } from '@/bakery/notificationStore';
import type { AdminNotification } from '@/bakery/notificationStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Package,
  Download, Filter, BarChart3,
  Bell, CreditCard, Truck, Scale, CheckCheck, Loader2,
  ChevronDown, ChevronUp, Trash2,
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

  const stockPie = [
    { name: 'OK', value: inStock, color: COLORS[1] },
    { name: 'Low', value: lowStock, color: '#ef4444' },
  ].filter(d => d.value > 0);

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
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['today', '7d', '30d'] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold transition-all', dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Revenue" value={formatCurrency(totalRevenue)} sub="SNB branch" color="bg-amber-50 text-amber-700" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Items Sold" value={String(totalQty)} sub={`${filteredSales.length} txns`} color="bg-blue-50 text-blue-700" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Txn" value={formatCurrency(avgTxnValue)} color="bg-primary/10 text-primary" />
        <KPI icon={<Package className="size-4" />} label="Low Stock" value={String(lowStock)} sub={`of ${stockItems.length} items`} color={lowStock > 0 ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'} />
      </div>

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
      <BakeryReportsMerged branch="SNB" />

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

// ── SNB Alert Notification Card ───────────────────────────────────────────────
const SNB_ALERT_TYPE_META: Record<string, {
  label: string; icon: React.ElementType;
  cardBorder: string; iconBg: string; iconColor: string; badgeCls: string;
}> = {
  credit_sale: {
    label: 'Credit Sale',
    icon: CreditCard,
    cardBorder: 'border-red-300',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    badgeCls: 'bg-red-100 text-red-700 border-red-300',
  },
  packing_discrepancy: {
    label: 'Packing Discrepancy',
    icon: Scale,
    cardBorder: 'border-orange-300',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    badgeCls: 'bg-orange-100 text-orange-700 border-orange-200',
  },
};

function SNBAlertCard({ n, onDelete }: { n: AdminNotification; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { markRead, deleteNotification } = useNotificationStore();
  const meta = SNB_ALERT_TYPE_META[n.type];
  if (!meta) return null;
  const Icon = meta.icon;

  const handleOpen = () => {
    setExpanded(v => !v);
    if (!n.isRead) markRead(n.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(n.id);
    onDelete(n.id);
  };

  return (
    <div className={cn('rounded-xl border overflow-hidden', meta.cardBorder, !n.isRead && 'shadow-md')}>
      <button onClick={handleOpen} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition">
        <div className={cn('size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', meta.iconBg)}>
          <Icon className={cn('size-4', meta.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('text-sm font-semibold', !n.isRead && 'text-foreground')}>{n.title}</p>
            {!n.isRead && <span className="size-2 rounded-full bg-blue-500 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleDelete}
            className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition"
          >
            <Trash2 className="size-3.5" />
          </button>
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && n.meta && (
        <div className="px-4 pb-3 pt-1 border-t border-dashed border-muted bg-muted/20">
          {n.type === 'credit_sale' && (() => {
            const m = n.meta as { customerName?: string; amount?: number; billNo?: string; branch?: string; soldBy?: string; dueDate?: string | null };
            return (
              <div className="space-y-1.5 text-sm">
                {m.customerName && <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{m.customerName}</span></div>}
                {m.amount !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-red-700">{formatCurrency(m.amount)}</span></div>}
                {m.branch && <div className="flex justify-between"><span className="text-muted-foreground">Branch</span><span className="font-medium">{m.branch}</span></div>}
                {m.soldBy && <div className="flex justify-between"><span className="text-muted-foreground">Sold By</span><span className="font-medium">{m.soldBy}</span></div>}
                {m.dueDate && <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span className="font-medium text-amber-700">{new Date(m.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>}
                {m.billNo && <div className="flex justify-between"><span className="text-muted-foreground">Bill No</span><span className="font-medium font-mono text-xs">{m.billNo}</span></div>}
              </div>
            );
          })()}
          {n.type === 'packing_discrepancy' && (() => {
            const m = n.meta as { branch?: string; orderNumber?: string; items?: { itemName: string; dispatched: number; requested: number; unit: string }[] };
            return (
              <div className="space-y-2">
                {m.branch && <p className="text-xs font-semibold text-muted-foreground">Branch: {m.branch} · Order {m.orderNumber}</p>}
                {(m.items || []).map((item, i) => {
                  const diff = item.requested - item.dispatched;
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate mr-2">{item.itemName}</span>
                      <span className={cn('text-xs font-bold tabular-nums px-2 py-0.5 rounded-full', diff > 0 ? 'bg-red-100 text-red-700' : diff < 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                        {diff > 0 ? `−${diff} short` : diff < 0 ? `+${Math.abs(diff)} extra` : '✓'} ({item.unit})
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── SNB Today's Deliveries ────────────────────────────────────────────────────
function SNBDeliveryAlerts() {
  const { advanceOrders, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const todayDeliveries = useMemo(() =>
    (advanceOrders['SNB'] || []).filter(o =>
      o.deliveryDate === todayStr && o.status === 'pending'
    ), [advanceOrders, todayStr]);

  if (todayDeliveries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="size-4 text-blue-600" />
        <p className="text-sm font-bold text-blue-800">Deliveries Due Today</p>
        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{todayDeliveries.length}</span>
      </div>
      {todayDeliveries.map(order => (
        <div key={order.id} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-blue-900">{order.customerName || 'Customer'}</p>
                <span className="text-[10px] font-bold bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">SNB</span>
              </div>
              <p className="text-xs text-blue-700 mt-0.5">
                {order.items.map(i => `${i.itemName} ×${i.quantity}`).join(', ')}
              </p>
              <p className="text-[10px] text-blue-600 mt-1">
                Balance due: <span className="font-bold">{formatCurrency(order.balanceDue)}</span>
                {' · '}By: {order.soldBy}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums text-blue-900">{formatCurrency(order.balanceDue)}</p>
              <p className="text-[10px] text-blue-600">balance</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SNB Alerts Tab ────────────────────────────────────────────────────────────
// Shows Credit, Today's Deliveries, and Packing Discrepancy — SNB Branch only
function SNBAlertsTab() {
  const { notifications, loaded, loading, load, markAllRead } = useNotificationStore();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  // Filter: credit_sale and packing_discrepancy scoped to SNB only
  const alertNotifications = useMemo(() => notifications.filter(n => {
    if (deletedIds.has(n.id)) return false;
    const branch = (n.meta as { branch?: string })?.branch ?? '';
    if (n.type === 'credit_sale') return branch === 'SNB';
    if (n.type === 'packing_discrepancy') return branch === 'SNB';
    return false;
  }), [notifications, deletedIds]);

  const unreadCount = alertNotifications.filter(n => !n.isRead).length;

  const handleDelete = (id: string) => setDeletedIds(prev => new Set([...prev, id]));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-amber-600" />
          <h2 className="font-display text-base font-bold">Alerts</h2>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">{unreadCount} new</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted text-muted-foreground"
          >
            <CheckCheck className="size-3" />Mark all read
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground -mt-2">Showing alerts for SNB Branch only</p>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Today's Deliveries */}
      {!loading && <SNBDeliveryAlerts />}

      {/* Credit Sales section */}
      {!loading && alertNotifications.some(n => n.type === 'credit_sale') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-red-600" />
            <p className="text-sm font-bold text-red-800">Credit Sales</p>
          </div>
          {alertNotifications.filter(n => n.type === 'credit_sale').map(n => (
            <SNBAlertCard key={n.id} n={n} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Packing Discrepancy section */}
      {!loading && alertNotifications.some(n => n.type === 'packing_discrepancy') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-orange-600" />
            <p className="text-sm font-bold text-orange-800">Packing Discrepancies</p>
          </div>
          {alertNotifications.filter(n => n.type === 'packing_discrepancy').map(n => (
            <SNBAlertCard key={n.id} n={n} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {!loading && alertNotifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Bell className="size-6 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending credit, delivery, or packing alerts for SNB.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminSNBDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'credit' | 'alerts'>('dashboard');
  const { startPolling, stopPolling } = useOrderStore();
  const { notifications, loaded, load } = useNotificationStore();
  const { advanceOrders, fetchBranchData } = useBranchStore();

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { if (!loaded) load(); fetchBranchData('SNB'); }, [loaded, load, fetchBranchData]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Badge: unread credit/packing for SNB + today's SNB deliveries
  const alertBadge = useMemo(() => {
    const notifCount = notifications.filter(n => {
      if (n.isRead) return false;
      const branch = (n.meta as { branch?: string })?.branch ?? '';
      if (n.type === 'credit_sale') return branch === 'SNB';
      if (n.type === 'packing_discrepancy') return branch === 'SNB';
      return false;
    }).length;
    const deliveryCount = (advanceOrders['SNB'] || []).filter(o => o.deliveryDate === todayStr && o.status === 'pending').length;
    return notifCount + deliveryCount;
  }, [notifications, advanceOrders, todayStr]);

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
      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        {([
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'reports',   label: '📋 Reports'   },
          { id: 'credit',    label: '💳 Credit'    },
          { id: 'alerts',    label: '🔔 Alerts'    },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 relative py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
              tab === t.id ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
            {t.id === 'alerts' && alertBadge > 0 && (
              <span className="absolute -top-1 -right-1 size-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                {alertBadge > 9 ? '9+' : alertBadge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="px-4 space-y-4">
        {tab === 'dashboard' && <SNBBakeryDashboardTab />}
        {tab === 'reports'   && <SNBReportsTab />}
        {tab === 'credit'    && <AdminCreditTab branches={['SNB']} accentColor="text-amber-600" />}
        {tab === 'alerts'    && <SNBAlertsTab />}
      </div>
    </div>
  );
}
