// ─── OrderReceiverDashboard ───────────────────────────────────────────────────
// Main screen for the Order Receiver role.
// Tabs per branch → BranchStockForm → sends requirement to Packing.

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BRANCHES } from './types';
import type { Branch } from './types';
import { BRANCH_COLOR } from './receiverConstants';
import BranchStockForm from './BranchStockForm';
import BranchRecentOrders from './BranchRecentOrders';
import { cn } from '@/lib/utils';

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
  const [activeTab, setActiveTab]   = useState<Branch>(BRANCHES[0]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { fetchOrders(); }, [refreshKey]);

  const todayCount   = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString()).length;
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const branchPending = (b: Branch) =>
    orders.filter(o => o.status === 'pending' && o.targetBranch === b).length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      {/* Page header */}
      <div className="pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold text-foreground">Order Receiver</h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">
          Enter stock requirements per branch → Packing
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Today's",   value: todayCount,   color: 'text-primary' },
          { label: 'Forwarded', value: orders.filter(o => o.status !== 'pending').length, color: 'text-emerald-600' },
          { label: 'Pending',   value: pendingCount, color: pendingCount > 0 ? 'text-amber-600' : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className={cn('font-display font-bold text-xl tabular-nums', color)}>{value}</p>
            <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase leading-tight mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Branch tabs + form */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {BRANCHES.map(b => {
            const pending  = branchPending(b);
            const isActive = activeTab === b;
            const colors   = BRANCH_COLOR[b];
            return (
              <button
                key={b}
                onClick={() => setActiveTab(b)}
                className={cn(
                  'flex-1 py-3 px-2 text-sm font-body transition-all flex items-center justify-center gap-1.5',
                  isActive ? colors.active : `text-muted-foreground ${colors.tab}`,
                )}
              >
                {b}
                {pending > 0 && (
                  <span className={cn(
                    'text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full border leading-none',
                    isActive ? colors.badge : 'bg-muted text-muted-foreground border-border',
                  )}>
                    {pending}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Form — key forces full reset when switching tabs */}
        <BranchStockForm
          key={activeTab}
          branch={activeTab}
          onSubmitted={() => setRefreshKey(k => k + 1)}
        />
      </div>

      {/* Recent requirements for the active branch */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BranchRecentOrders branch={activeTab} />
      )}
    </div>
  );
}
