// src/branch/BranchDashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { Package, ShoppingCart, Settings, AlertTriangle, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from './branchStore';
import { StatCard, TabBar } from './components';
import { StockTab }    from './tabs/StockTab';
import { SalesTab }    from './tabs/SalesTab';
import { BillTab }     from './tabs/BillTab';
import { SettingsTab } from './tabs/SettingsTab';
import type { Branch } from './types';
import { BRANCH_COLORS } from './types';

type TabId = 'stock' | 'sales' | 'bill' | 'settings';

const TABS = [
  { id: 'stock'    as const, label: 'Stock',      icon: Package },
  { id: 'sales'    as const, label: 'Sales Log',  icon: ShoppingCart },
  { id: 'bill'     as const, label: 'Bill',       icon: Receipt },
  { id: 'settings' as const, label: 'Thresholds', icon: Settings },
];

interface Props { branch: Branch }

export default function BranchDashboard({ branch }: Props) {
  const { stock, sales, incoming, loading, fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems } =
    useBranchStore();

  const [tab, setTab] = useState<TabId>('stock');

  const branchStock    = stock[branch]    || [];
  const branchSales    = sales[branch]    || [];
  const branchIncoming = incoming[branch] || [];
  const colors         = BRANCH_COLORS[branch];

  useEffect(() => {
    // Initial load
    fetchBranchData(branch);
    syncIncomingFromDispatches(branch);
    seedBranchItems(branch);
    cleanOldData();

    // Auto-refresh every 30 seconds
    const id = setInterval(() => {
      fetchBranchData(branch);
      syncIncomingFromDispatches(branch);
    }, 30_000);

    return () => clearInterval(id);
  }, [branch]);

  const lowStockItems = branchStock.filter((s) => s.quantity <= s.minThreshold);
  const today         = new Date().toDateString();

  const todaySalesLog = useMemo(
    () => branchSales.filter((s) => new Date(s.soldAt).toDateString() === today),
    [branchSales, today],
  );

  const totalTodayQty = useMemo(
    () => todaySalesLog.reduce((a, s) => a + s.quantitySold, 0),
    [todaySalesLog],
  );

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Header */}
      <div className={cn('px-4 pt-4 pb-3 border-b', colors.bg)}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={cn('font-display text-2xl font-bold', colors.text)}>
              {branch} Branch
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long', day: '2-digit', month: 'short',
              })}
            </p>
          </div>
        </div>

        {lowStockItems.length > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">
              {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} below threshold:{' '}
              {lowStockItems.map((i) => i.itemName).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <StatCard label="In Stock"   value={branchStock.length}  color={colors.text} />
        <StatCard label="Sold Today" value={totalTodayQty}       color="text-blue-700" />
        <StatCard
          label="Low Stock" value={lowStockItems.length}
          color={lowStockItems.length > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
      </div>

      {/* Tab bar */}
      <div className="mx-4 mb-3">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="px-4 space-y-3">
        {tab === 'stock'    && <StockTab    branch={branch} branchStock={branchStock} branchIncoming={branchIncoming} loading={loading} />}
        {tab === 'sales'    && <SalesTab    branch={branch} branchStock={branchStock} todaySalesLog={todaySalesLog}   totalTodayQty={totalTodayQty} />}
        {tab === 'bill'     && <BillTab     branch={branch} branchStock={branchStock} />}
        {tab === 'settings' && <SettingsTab branch={branch} branchStock={branchStock} />}
      </div>
    </div>
  );
}
