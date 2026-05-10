// src/branch/BranchDashboard.tsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { Package, Settings, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from './branchStore';
import { StatCard, TabBar } from './components';
import { StockTab }    from './tabs/StockTab';
import { BillTab }     from './tabs/BillTab';
import { SettingsTab } from './tabs/SettingsTab';
import type { Branch } from './types';
import { BRANCH_COLORS } from './types';

type TabId = 'stock' | 'bill' | 'settings';

const TABS = [
  { id: 'stock'    as const, label: 'Stock',      icon: Package },
  { id: 'bill'     as const, label: 'Bill',       icon: Receipt },
  { id: 'settings' as const, label: 'Thresholds', icon: Settings },
];

const POLL_INTERVAL = 30_000;

interface Props { branch: Branch }

export default function BranchDashboard({ branch }: Props) {
  const { stock, sales, incoming, loading, fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems } =
    useBranchStore();

  const [tab, setTab] = useState<TabId>('stock');
  // Ref to the interval so we can clear it without capturing stale state
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollRef.current) return; // already running
    pollRef.current = setInterval(() => {
      // FIX: Skip poll if tab is hidden or browser is offline — prevents
      // piling up timed-out requests (seen as 43s/60s timeouts in the HAR).
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      fetchBranchData(branch);
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    // Initial load
    fetchBranchData(branch);
    syncIncomingFromDispatches(branch);
    seedBranchItems(branch);  // no-op after first run per branch per session
    cleanOldData();            // no-op after first run per hour

    startPolling();

    // Pause polling when the tab goes to background, resume when visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBranchData(branch); // immediate refresh on tab focus
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Pause when offline, resume + refresh when back online
    const handleOnline  = () => { fetchBranchData(branch); startPolling(); };
    const handleOffline = () => stopPolling();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [branch]);

  const branchStock    = stock[branch]    || [];
  const branchSales    = sales[branch]    || [];
  const branchIncoming = incoming[branch] || [];
  const colors         = BRANCH_COLORS[branch];

  const availableStock = branchStock.filter((s) => s.quantity > 0);

  // Stable today string with midnight rollover
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
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className={cn('px-4 pt-4 pb-3 border-b', colors.bg)}>
        <h1 className={cn('font-display text-2xl font-bold', colors.text)}>
          {branch} Branch
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long', day: '2-digit', month: 'short',
          })}
        </p>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <StatCard label="In Stock"   value={availableStock.length} color={colors.text} />
        <StatCard label="Sold Today" value={totalTodayQty}         color="text-blue-700" />
      </div>

      <div className="mx-4 mb-3">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="px-4 space-y-3">
        {tab === 'stock'    && <StockTab    branch={branch} branchStock={branchStock} branchIncoming={branchIncoming} loading={loading} />}
        {tab === 'bill'     && <BillTab     branch={branch} branchStock={branchStock} />}
        {tab === 'settings' && <SettingsTab branch={branch} branchStock={branchStock} />}
      </div>
    </div>
  );
}
