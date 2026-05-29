// src/pages/AdminSNBDashboard.tsx
// Admin Dashboard 2 – SNB Admin: SNB branch only
import EmptyState from '@/components/ui/EmptyState';
import BakeryReportsMerged from '@/bakery/BakeryReportsMerged';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import { useMemo, useEffect, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { useOrderStore } from '@/stores/orderStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Download, Filter } from 'lucide-react';

// ── SNB Bakery Dashboard Tab ──────────────────────────────────────────────────
function SNBBakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);
  const today = new Date().toDateString();

  const todaySales = useMemo(() =>
    (sales['SNB'] || []).map(s => ({
      ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
    })).filter(s => new Date(s.soldAt).toDateString() === today),
    [sales, today]);

  const totalRevenue = todaySales.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty = todaySales.reduce((a, s) => a + s.quantitySold, 0);
  const stockItems = stock['SNB'] || [];
  const lowStock = stockItems.filter(s => s.quantity <= s.minThreshold).length;

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    todaySales.forEach(s => {
      const ex = map.get(s.itemName);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  }, [todaySales]);

  const maxRev = Math.max(...topItems.map(([, v]) => v.revenue), 1);

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Today's Revenue – SNB</p>
        <p className="font-display text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        <p className="text-xs text-muted-foreground mt-1">{totalQty} items sold · {todaySales.length} transactions</p>
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
        <p className="text-[10px] text-muted-foreground mb-3">Today · SNB branch</p>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2.5">
            {topItems.map(([item, v], i) => (
              <div key={item}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('size-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                      i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                    <p className="text-sm font-medium truncate">{item}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(v.revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{v.qty} sold</p>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.round((v.revenue / maxRev) * 100)}%` }} />
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

// ── SNB Bakery Sales Tab ──────────────────────────────────────────────────────
function SNBBakerySalesTab() {
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
          <div className="flex items-center gap-2"><Filter className="size-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Filters – SNB</h3></div>
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

// ── SNB Bakery Reports Tab ────────────────────────────────────────────────────
function SNBBakeryReportsTab() {
  const { sales, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const snbSales = useMemo(() =>
    (sales['SNB'] || []).map(s => ({
      ...s, unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
    })), [sales]);

  const filtered = useMemo(() => {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    return snbSales.filter(sale => { const d = new Date(sale.soldAt); return d >= s && d <= e; });
  }, [snbSales, startDate, endDate]);

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
      'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'By': s.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'SNB Report');
    XLSX.writeFile(wb, `SNB_Report_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Total Revenue – SNB</p>
        <p className="font-display text-2xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
        <p className="text-xs text-muted-foreground mt-1">{totalQty} items · {filtered.length} transactions</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Date Range – SNB</h3>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"><Download className="size-3" />Excel</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1">Top Items by Revenue</h3>
        <p className="text-[10px] text-muted-foreground mb-3">SNB branch</p>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        ) : (
          <div className="table-scroll-container"><div className="table-inner-scroll"><table className="w-full text-sm" style={{minWidth:'600px'}}>
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-1.5">Item</th>
                <th className="text-right py-1.5 text-primary font-semibold">Revenue</th>
                <th className="text-right py-1.5">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topItems.slice(0, 10).map(([item, v]) => (
                <tr key={item}>
                  <td className="py-2 text-sm truncate max-w-[140px]">{item}</td>
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
          </table></div></div>
        )}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminSNBDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'reports' | 'credit'>('dashboard');
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
      <div className="mx-4 my-4 flex gap-1 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        {([
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'reports',   label: '📋 Reports'   },
          { id: 'credit',    label: '💳 Credit'     },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-xs font-body font-semibold transition-all duration-200',
              tab === t.id ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 space-y-4">
        {tab === 'dashboard' && <SNBBakeryDashboardTab />}
        {tab === 'reports'   && <BakeryReportsMerged branch="SNB" />}
        {tab === 'credit'    && (
          <AdminCreditTab
            branches={['SNB']}
            accentColor="text-amber-600"
          />
        )}
      </div>
    </div>
  );
}
