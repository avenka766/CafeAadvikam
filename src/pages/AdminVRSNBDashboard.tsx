// src/pages/AdminVRSNBDashboard.tsx
// Admin Dashboard 1 – VRSNB Admin: Cafe + VRSNB branch only
import EmptyState from '@/components/ui/EmptyState';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import { useMemo, useEffect, useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  IndianRupee, ShoppingBag, TrendingUp, Clock,
  RefreshCw, Wifi, Download, Filter,
} from 'lucide-react';

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6" style={{ background: 'hsl(var(--primary))' }} />
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

// ── Cafe Dashboard Tab ─────────────────────────────────────────────────────────
function CafeDashboardTab() {
  const { orders, polling } = useOrderStore();
  const todayStr = useMemo(() => new Date().toDateString(), []);
  const todayOrders = useMemo(() => orders.filter(o => new Date(o.createdAt).toDateString() === todayStr), [orders, todayStr]);
  const served = todayOrders.filter(o => o.status === 'served');
  const totalRevenue = served.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = served.length > 0 ? Math.round(totalRevenue / served.length) : 0;
  const peakHour = useMemo(() => {
    const hours: Record<number, number> = {};
    served.forEach(o => { const h = new Date(o.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; });
    let max = 0, maxH = 0;
    Object.entries(hours).forEach(([h, c]) => { if (Number(c) > max) { max = Number(c); maxH = Number(h); } });
    return max === 0 ? 'N/A' : `${maxH > 12 ? maxH - 12 : maxH}${maxH >= 12 ? 'PM' : 'AM'}`;
  }, [served]);
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    served.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.id);
      if (ex) ex.qty += ci.quantity;
      else map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity });
    }));
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
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

  const pending = todayOrders.filter(o => o.status === 'pending').length;
  const preparing = todayOrders.filter(o => o.status === 'preparing').length;
  const ready = todayOrders.filter(o => o.status === 'ready').length;
  const cancelled = todayOrders.filter(o => o.status === 'cancelled').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
        <span className="text-xs text-muted-foreground">{polling ? 'Live' : 'Offline'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(totalRevenue)} color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Total Orders" value={String(todayOrders.length)} color="bg-accent/20 text-accent-foreground" />
        <KPI icon={<TrendingUp className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<Clock className="size-4" />} label="Peak Hour" value={peakHour} color="bg-amber-50 text-amber-700" />
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <RefreshCw className="size-4 text-primary" />Live Order Status
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <StatusBadge label="Pending" count={pending} color="bg-amber-100 text-amber-800" />
          <StatusBadge label="Preparing" count={preparing} color="bg-blue-100 text-blue-800" />
          <StatusBadge label="Ready" count={ready} color="bg-emerald-100 text-emerald-800" />
          <StatusBadge label="Cancelled" count={cancelled} color="bg-red-100 text-red-800" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-lg font-bold text-foreground mb-3">Payment Breakdown</h3>
        <div className="space-y-2">
          <PaymentRow label="💵 Cash" amount={pay.cash} total={totalRevenue} />
          <PaymentRow label="📱 UPI" amount={pay.upi} total={totalRevenue} />
          <PaymentRow label="💳 Card" amount={pay.card} total={totalRevenue} />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold text-foreground mb-3">Top Selling Items (Today)</h3>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2">
            {topItems.map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item.name}</p>
                <span className="text-sm font-bold tabular-nums">{item.qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((o, i) => ({
      'S.No': i + 1,
      'Order#': o.orderNumber,
      'Type': o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
      'Total': o.total,
      'Payment': o.paymentType,
      'Date': new Date(o.createdAt).toLocaleDateString('en-IN'),
      'Items': o.items.map(ci => `${ci.menuItem.name}×${ci.quantity}`).join(', '),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Cafe Sales');
    XLSX.writeFile(wb, `CafeSales_VRSNB_Admin_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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
          <div>
            <p className="text-xs text-muted-foreground">{filtered.length} orders · {formatCurrency(totalRevenue)}</p>
          </div>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted">
            <Download className="size-3" />Excel
          </button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-3">Top Items</h3>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        ) : (
          <div className="space-y-2">
            {topItems.slice(0, 10).map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item.name}</p>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{item.qty} sold</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── VRSNB Bakery Dashboard ────────────────────────────────────────────────────
function VRSNBBakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('VRSNB'); }, [fetchBranchData]);
  const today = new Date().toDateString();
  const todaySales = useMemo(() => (sales['VRSNB'] || []).filter(s => new Date(s.soldAt).toDateString() === today), [sales, today]);
  const totalQty = todaySales.reduce((a, s) => a + s.quantitySold, 0);
  const totalRevenue = todaySales.reduce((a, s) => {
    const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
    return a + unitPrice * s.quantitySold;
  }, 0);
  const stockItems = (stock['VRSNB'] || []);
  const lowStock = stockItems.filter(s => s.quantity <= s.minThreshold).length;
  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    todaySales.forEach(s => {
      const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
      const ex = map.get(s.itemName);
      if (ex) { ex.qty += s.quantitySold; ex.revenue += unitPrice * s.quantitySold; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: unitPrice * s.quantitySold });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  }, [todaySales]);

  return (
    <div className="space-y-4">
      {/* Revenue KPI */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Today's Revenue – VRSNB</p>
        <p className="font-display text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        <p className="text-xs text-muted-foreground mt-1">{totalQty} items sold today</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display text-2xl font-bold tabular-nums">{stockItems.length}</p>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">In Stock</p>
        </div>
        <div className={cn('border rounded-xl p-3 text-center', lowStock > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
          <p className={cn('font-display text-2xl font-bold tabular-nums', lowStock > 0 ? 'text-red-700' : 'text-emerald-700')}>{lowStock}</p>
          <p className={cn('text-[10px] font-semibold uppercase', lowStock > 0 ? 'text-red-600' : 'text-emerald-600')}>Low Stock</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Today · VRSNB branch</p>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2">
            {topItems.map(([item, v], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
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




// ── VRSNB Bakery Reports Tab ──────────────────────────────────────────────────
function VRSNBBakeryReportsTab() {
  const { sales, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('VRSNB'); }, [fetchBranchData]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const vrsnbSales = useMemo(() => (sales['VRSNB'] || []).map(s => ({
    ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
  })), [sales]);

  const filtered = useMemo(() => {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    return vrsnbSales.filter(sale => { const d = new Date(sale.soldAt); return d >= s && d <= e; });
  }, [vrsnbSales, startDate, endDate]);

  const totalRevenue = filtered.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = filtered.reduce((a, s) => a + s.quantitySold, 0);

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filtered.forEach(s => {
      const ex = map.get(s.itemName);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filtered]);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((s, i) => ({
      'S.No': i + 1, 'Item': s.itemName, 'Qty': s.quantitySold,
      'Unit Price': s.unitPrice, 'Revenue': s.unitPrice * s.quantitySold,
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'Sold By': s.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'VRSNB Report');
    XLSX.writeFile(wb, `VRSNB_Report_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Revenue KPI */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Total Revenue – VRSNB</p>
        <p className="font-display text-2xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        <p className="text-xs text-muted-foreground mt-1">{totalQty} items · {filtered.length} transactions</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Date Range – VRSNB</h3>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"><Download className="size-3" />Excel</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-3">VRSNB branch</p>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data in range</p>
        ) : (
          <div className="space-y-2">
            {topItems.slice(0, 10).map(([item, v], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item}</p>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(v.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{v.qty} sold</p>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





// ── Cafe Sub-View ─────────────────────────────────────────────────────────────
function CafeView() {
  const [tab, setTab] = useState<'dashboard' | 'reports'>('dashboard');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {([{ id: 'dashboard', label: 'Dashboard' }, { id: 'reports', label: 'Reports' }] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all', tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <CafeDashboardTab />}
      {tab === 'reports' && <CafeReportsTab />}
    </div>
  );
}

// ── VRSNB Bakery Sub-View ────────────────────────────────────────────────────
function VRSNBBakeryView() {
  const [tab, setTab] = useState<'dashboard' | 'reports'>('dashboard');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {([{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'reports', label: '📋 Reports' }] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all', tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <VRSNBBakeryDashboardTab />}
      {tab === 'reports'   && <BakeryReportsMerged branch="VRSNB" />}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminVRSNBDashboard() {
  const [mode, setMode] = useState<'cafe' | 'bakery' | 'credit'>('cafe');
  const { startPolling, stopPolling } = useOrderStore();
  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
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
      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button onClick={() => setMode('cafe')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          ☕ Cafe
        </button>
        <button onClick={() => setMode('bakery')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'bakery' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          🥐 Bakery
        </button>
        <button onClick={() => setMode('credit')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', mode === 'credit' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          💳 Credit
        </button>
      </div>
      <div className="px-4 space-y-4">
        {mode === 'cafe'   && <CafeView />}
        {mode === 'bakery' && <VRSNBBakeryView />}
        {mode === 'credit' && (
          <AdminCreditTab
            branches={['VRSNB']}
            accentColor="text-blue-700"
          />
        )}
      </div>
    </div>
  );
}
