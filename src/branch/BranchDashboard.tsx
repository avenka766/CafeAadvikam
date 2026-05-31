// src/branch/BranchDashboard.tsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { Package, Settings, Receipt, History } from 'lucide-react';
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
  // B10 FIX: these heavy operations must only run once per branch change,
  // not on every React re-render / Strict Mode double-invoke.
  const initializedRef = useRef<Branch | null>(null);

  const branchStock      = stock[branch]           || [];
  const branchIncoming   = incoming[branch]        || [];
  const branchAdvance    = advanceOrders?.[branch] || [];
  const branchSales      = sales[branch]           || [];
  const branchThresholds = thresholds[branch]      || {};
  const colors           = BRANCH_COLORS[branch];

  useEffect(() => {
    fetchBranchData(branch);

    // B10 FIX: syncIncomingFromDispatches and seedBranchItems are expensive one-time
    // operations.  Only run them when the branch actually changes, not on every re-render.
    if (initializedRef.current !== branch) {
      initializedRef.current = branch;
      syncIncomingFromDispatches(branch, true); // force=true on first load
      seedBranchItems(branch);
      cleanOldData();
    }

    // ── Supabase Realtime: instant updates on stock/incoming/sales changes ──
    // subscribeToStock returns an unsubscribe fn; store it for cleanup.
    const unsubscribe = subscribeToStock(branch);

    // ── 3-second safety-net poll ────────────────────────────────────────────
    // Realtime covers DB-triggered changes; the poll catches any edge cases
    // (network hiccup, Realtime lag) so the UI is never more than 3s stale.
    const id = setInterval(() => fetchBranchData(branch), 3_000);

    // ── Incoming sync: every 60s (guarded internally to 60s minimum) ────────
    const syncId = setInterval(() => syncIncomingFromDispatches(branch), 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(id);
      clearInterval(syncId);
    };
  }, [branch]);

  const availableStock = branchStock.filter((s) => s.quantity > 0);

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

  // STAT-FIX: show number of sales transactions today, not raw quantity sum.
  const totalTodayQty = useMemo(
    () => todaySalesLog.length,
    [todaySalesLog],
  );

  // Revenue today — sum of unitPrice × quantitySold for all today's sales
  const totalTodayRevenue = useMemo(
    () => todaySalesLog.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0),
    [todaySalesLog],
  );

  return (
    // LAYOUT-FIX: Use flex-col + min-h-0 so BillTab (which uses flex-1) can fill
    // the full viewport height. pb-28 only applies to non-bill tabs to clear the bottom nav.
    <div className="bg-background flex flex-col" style={{ minHeight: '100dvh' }}>
      <div className={cn('px-4 pt-14 pb-3 border-b shrink-0', colors.bg)}>
        <h1 className={cn('font-display text-2xl font-bold', colors.text)}>
          {branch} Branch
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
        </p>
      </div>

      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <StatCard label="In Stock"      value={availableStock.length}                                                          color={colors.text} />
        <StatCard label="Sales Today"   value={totalTodayQty}                                                                  color="text-blue-700" />
        <StatCard label="Revenue Today" value={`₹${totalTodayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}  color="text-emerald-700" />
      </div>

      <div className="mx-4 mb-3">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Tabs kept mounted so cart state survives tab switches */}
      <div className={cn('px-4 pb-28 space-y-3', tab === 'bill' && 'hidden')}>
        <div className={tab !== 'stock'    ? 'hidden' : undefined}>
          <StockTab branch={branch} branchStock={branchStock} branchIncoming={branchIncoming}
            branchThresholds={branchThresholds} loading={loading} />
        </div>
        <div className={tab !== 'history'  ? 'hidden' : undefined}>
          <HistoryTab branchSales={branchSales} />
        </div>
        <div className={tab !== 'settings' ? 'hidden' : undefined}>
          <SettingsTab branch={branch} branchStock={branchStock} />
        </div>
      </div>
      {/* BillTab outside padded wrapper — needs flex-1 to fill all remaining height */}
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'bill' && 'hidden')}>
        <BillTab branch={branch} branchStock={branchStock} advanceOrders={branchAdvance} />
      </div>
    </div>
  );
}
