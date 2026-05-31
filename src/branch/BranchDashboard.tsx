// src/branch/BranchDashboard.tsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { Package, Settings, Receipt, History, Bell, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from './branchStore';
import { StatCard, TabBar } from './components';
import { StockTab }   from './tabs/StockTab';
import { BillTab }    from './tabs/BillTab';
import { SettingsTab }from './tabs/SettingsTab';
import { HistoryTab } from './tabs/HistoryTab';
import type { Branch } from './types';
import { BRANCH_COLORS } from './types';

type TabId = 'stock' | 'bill' | 'history' | 'settings';

const TABS = [
  { id: 'stock'   as const, label: 'Stock',     icon: Package },
  { id: 'bill'    as const, label: 'Bill',      icon: Receipt },
  { id: 'history' as const, label: 'History',   icon: History },
  { id: 'settings'as const, label: 'Thresholds',icon: Settings },
];

interface Props { branch: Branch }

export default function BranchDashboard({ branch }: Props) {
  const { stock, sales, incoming, advanceOrders, thresholds, loading,
          fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems,
          subscribeToStock } =
    useBranchStore();

  const [tab, setTab] = useState<TabId>('stock');
  const initializedRef = useRef<Branch | null>(null);

  const branchStock      = stock[branch]           || [];
  const branchIncoming   = incoming[branch]        || [];
  const branchAdvance    = advanceOrders?.[branch] || [];
  const branchSales      = sales[branch]           || [];
  const branchThresholds = thresholds[branch]      || {};
  const colors           = BRANCH_COLORS[branch];

  useEffect(() => {
    fetchBranchData(branch);

    if (initializedRef.current !== branch) {
      initializedRef.current = branch;
      syncIncomingFromDispatches(branch, true);
      seedBranchItems(branch);
      cleanOldData();
    }

    const unsubscribe = subscribeToStock(branch);
    const id = setInterval(() => fetchBranchData(branch), 3_000);
    const syncId = setInterval(() => syncIncomingFromDispatches(branch), 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(id);
      clearInterval(syncId);
    };
  }, [branch]);

  const availableStock = branchStock.filter((s) => s.quantity > 0);
  const lowStockCount = useMemo(
    () => branchStock.filter((s) => s.quantity <= (branchThresholds[s.itemName] ?? s.minThreshold ?? 10)).length,
    [branchStock, branchThresholds],
  );
  const pendingIncoming = branchIncoming.filter((i) => !i.confirmed).length;
  const pendingAdvance = branchAdvance.filter((o) => o.status === 'pending').length;

  const [todayString, setTodayString] = useState(() => new Date().toDateString());
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => setTodayString(new Date().toDateString()), msUntilMidnight + 100);
    return () => clearTimeout(timer);
  }, [todayString]);

  const todaySalesLog = useMemo(
    () => branchSales.filter((s) => new Date(s.soldAt).toDateString() === todayString),
    [branchSales, todayString],
  );

  const totalTodayQty = useMemo(() => todaySalesLog.length, [todaySalesLog]);

  const totalTodayRevenue = useMemo(
    () => todaySalesLog.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0),
    [todaySalesLog],
  );

  return (
    <div className="min-h-0 bg-slate-100 flex flex-col" style={{ height: '100dvh', paddingBottom: 'var(--nav-h, 5.25rem)' }}>
      <div className="shrink-0 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="px-4 pt-4 pb-3 md:px-6">
          <div className="rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white shadow-xl shadow-slate-300/70">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide', colors.badge)}>
                    <Package className="size-3" /> {branch} Branch
                  </span>
                  {pendingIncoming > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">
                      <Package className="size-3" /> {pendingIncoming} incoming
                    </span>
                  )}
                  {pendingAdvance > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800">
                      <Bell className="size-3" /> {pendingAdvance} advance
                    </span>
                  )}
                </div>
                <h1 className="font-display text-2xl font-black tracking-tight md:text-3xl">
                  Billing & Stock Workspace
                </h1>
                <p className="mt-1 text-xs font-medium text-slate-300 md:text-sm">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Today revenue</p>
                <p className="text-2xl font-black tabular-nums text-emerald-300">
                  ₹{totalTodayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 md:px-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard label="In Stock" value={availableStock.length} sub={`${lowStockCount} low`} color="text-slate-950" icon={<Package className="size-4" />} />
            <StatCard label="Sales Today" value={totalTodayQty} sub="transactions" color="text-blue-700" icon={<Receipt className="size-4" />} />
            <StatCard label="Revenue" value={`₹${totalTodayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub="today" color="text-emerald-700" icon={<TrendingUp className="size-4" />} />
            <StatCard label="Alerts" value={lowStockCount + pendingIncoming + pendingAdvance} sub="stock + orders" color="text-orange-700" icon={<Bell className="size-4" />} />
          </div>
        </div>

        <div className="px-4 pb-3 md:px-6">
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto px-4 py-4 md:px-6 space-y-4', tab === 'bill' && 'hidden')}>
        <div className={tab !== 'stock' ? 'hidden' : undefined}>
          <StockTab branch={branch} branchStock={branchStock} branchIncoming={branchIncoming}
            branchThresholds={branchThresholds} loading={loading} />
        </div>
        <div className={tab !== 'history' ? 'hidden' : undefined}>
          <HistoryTab branchSales={branchSales} />
        </div>
        <div className={tab !== 'settings' ? 'hidden' : undefined}>
          <SettingsTab branch={branch} branchStock={branchStock} />
        </div>
      </div>
      <div className={cn('flex flex-col flex-1 min-h-0 px-4 pb-4 md:px-6', tab !== 'bill' && 'hidden')}>
        <BillTab branch={branch} branchStock={branchStock} advanceOrders={branchAdvance} />
      </div>
    </div>
  );
}
