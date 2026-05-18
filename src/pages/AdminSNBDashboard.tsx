// src/pages/AdminSNBDashboard.tsx
// Admin Dashboard 2 – SNB Admin: SNB branch only
import { useMemo, useEffect, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { useOrderStore } from '@/stores/orderStore';
import { cn } from '@/lib/utils';
import { Download, Filter } from 'lucide-react';

// ── SNB Bakery Dashboard Tab ──────────────────────────────────────────────────
function SNBBakeryDashboardTab() {
  const { stock, sales, fetchBranchData } = useBranchStore();
  useEffect(() => { fetchBranchData('SNB'); }, [fetchBranchData]);
  const today = new Date().toDateString();
  const todaySales = useMemo(() => (sales['SNB'] || []).filter(s => new Date(s.soldAt).toDateString() === today), [sales, today]);
  const totalQty = todaySales.reduce((a, s) => a + s.quantitySold, 0);
  const stockItems = stock['SNB'] || [];
  const lowStock = stockItems.filter(s => s.quantity <= s.minThreshold).length;
  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    todaySales.forEach(s => map.set(s.itemName, (map.get(s.itemName) || 0) + s.quantitySold));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [todaySales]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="font-display text-2xl font-bold tabular-nums text-amber-700">{totalQty}</p>
          <p className="text-[10px] font-semibold uppercase text-amber-600">Qty Sold</p>
        </div>
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
        <h3 className="font-display text-base font-bold mb-3">Today's Top Items – SNB</h3>
        {topItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sales today</p>
        ) : (
          <div className="space-y-2">
            {topItems.map(([item, qty], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                <p className="flex-1 text-sm font-medium truncate">{item}</p>
                <span className="text-sm font-bold tabular-nums">{qty}</span>
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
  const snbSales = useMemo(() => (sales['SNB'] || []).sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()), [sales]);
  const allItems = useMemo(() => [...new Set(snbSales.map(s => s.itemName))].sort(), [snbSales]);
  const filtered = useMemo(() => snbSales.filter(s => {
    if (filterItem && s.itemName !== filterItem) return false;
    if (filterDate && new Date(s.soldAt).toDateString() !== new Date(filterDate).toDateString()) return false;
    return true;
  }), [snbSales, filterItem, filterDate]);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((s, i) => ({ 'S.No': i + 1, 'Item': s.itemName, 'Qty': s.quantitySold, 'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'Sold By': s.soldBy }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'SNB Sales');
    XLSX.writeFile(wb, `SNB_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2"><Filter className="size-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Filters – SNB Branch</h3></div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filterItem} onChange={e => setFilterItem(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2">
            <option value="">All Items</option>
            {allItems.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background col-span-2" />
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">{filtered.length} records</p>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"><Download className="size-3" />Excel</button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No sales found.</p>
        ) : (
          <div className="divide-y">
            {filtered.slice(0, 50).map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{s.itemName}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-amber-600">×{s.quantitySold}</span>
              </div>
            ))}
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
  const snbSales = useMemo(() => sales['SNB'] || [], [sales]);
  const filtered = useMemo(() => {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    return snbSales.filter(sale => { const d = new Date(sale.soldAt); return d >= s && d <= e; });
  }, [snbSales, startDate, endDate]);
  const totalQty = filtered.reduce((a, s) => a + s.quantitySold, 0);
  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(s => map.set(s.itemName, (map.get(s.itemName) || 0) + s.quantitySold));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((s, i) => ({ 'S.No': i + 1, 'Item': s.itemName, 'Qty': s.quantitySold, 'Sold At': new Date(s.soldAt).toLocaleString('en-IN'), 'By': s.soldBy }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }]), 'SNB Report');
    XLSX.writeFile(wb, `SNB_Report_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm">Date Range – SNB Branch</h3>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">{filtered.length} records · {totalQty} qty</p>
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted"><Download className="size-3" />Excel</button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-3">Top Items (SNB)</h3>
        {topItems.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data</p> : (
          <div className="space-y-2">
            {topItems.slice(0, 10).map(([item, qty], i) => (
              <div key={item} className="flex items-center gap-3">
                <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
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

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminSNBDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'sales' | 'reports'>('dashboard');
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
        {([{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'sales', label: '🛒 Sales' }, { id: 'reports', label: '📋 Reports' }] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex-1 py-2.5 rounded-xl text-xs font-body font-semibold transition-all duration-200', tab === t.id ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 space-y-4">
        {tab === 'dashboard' && <SNBBakeryDashboardTab />}
        {tab === 'sales' && <SNBBakerySalesTab />}
        {tab === 'reports' && <SNBBakeryReportsTab />}
      </div>
    </div>
  );
}
