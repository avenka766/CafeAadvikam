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
          fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems } =
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
    // The branchStore.syncIncomingFromDispatches also has an internal 5-min guard (B5 fix).
    if (initializedRef.current !== branch) {
      initializedRef.current = branch;
      syncIncomingFromDispatches(branch);
      seedBranchItems(branch);
      cleanOldData();
    }

    const id = setInterval(() => fetchBranchData(branch), 30_000);
    return () => clearInterval(id);
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

  const totalTodayQty = useMemo(
    () => todaySalesLog.reduce((a, s) => a + s.quantitySold, 0),
    [todaySalesLog],
  );

  return (
    <div className="bg-background pt-14 pb-28">
      <div className={cn('px-4 pt-4 pb-3 border-b', colors.bg)}>
        <h1 className={cn('font-display text-2xl font-bold', colors.text)}>
          {branch} Branch
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
        </p>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <StatCard label="In Stock"   value={availableStock.length} color={colors.text} />
        <StatCard label="Sold Today" value={totalTodayQty}         color="text-blue-700" />
      </div>

      <div className="mx-4 mb-3">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Tabs kept mounted so cart state survives tab switches */}
      <div className="px-4 space-y-3">
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
      {/* BillTab outside padded wrapper — needs full height, no extra padding */}
      <div className={tab !== 'bill' ? 'hidden' : undefined}>
        <BillTab branch={branch} branchStock={branchStock} advanceOrders={branchAdvance} />
      </div>
    </div>
  );
}
