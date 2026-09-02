// src/pages/AdminAlertsPage.tsx
// CHANGE 17: Improved UI — enhanced header with alert counts and branch filter.
// The underlying AdminNotificationsTab handles grouping, mark-read, resolve.

import { useMemo, useState } from 'react';
import AdminNotificationsTab from '@/bakery/AdminNotificationsTab';
import { useNotificationStore } from '@/bakery/notificationStore';
import { Bell, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Branch } from '@/branch/types';
import { BRANCHES, BRANCH_LABELS } from '@/branch/types';
import { cn } from '@/lib/utils';

export default function AdminAlertsPage() {
  const { notifications } = useNotificationStore();
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');

  // AUDIT FIX (2026-09-02): AdminNotification has no top-level `branch`
  // field, but several push* helpers (pushPackingDiscrepancy, pushCreditSale,
  // pushStockMovement, ...) do store it inside `meta.branch`. The branch
  // filter pills below were fully interactive but never actually filtered
  // anything — this now filters by meta.branch when present; a notification
  // type with no branch in its meta (e.g. price/recipe/store-item changes,
  // which aren't branch-specific) always shows regardless of the filter,
  // since it's not incorrect for any branch view to include them.
  const filteredNotifications = useMemo(() => {
    if (branchFilter === 'all') return notifications;
    return notifications.filter(n => {
      const metaBranch = (n.meta as Record<string, unknown> | undefined)?.branch;
      return metaBranch == null || metaBranch === branchFilter;
    });
  }, [notifications, branchFilter]);

  // AUDIT FIX (2026-09-02): "Pending" and "Unread" were computed with the
  // exact same filter (`!n.isRead`), so they always showed the identical
  // number under two different labels — removed the redundant "Pending"
  // tile below rather than inventing a distinct meaning this app doesn't
  // actually track.
  const summary = useMemo(() => ({
    total: filteredNotifications.length,
    unread: filteredNotifications.filter(n => !n.isRead).length,
    resolved: filteredNotifications.filter(n => n.isRead).length,
  }), [filteredNotifications]);

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      {/* Header */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">Admin Portal</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Alerts</h1>
            <p className="text-xs font-body text-muted-foreground mt-1">Credit, discrepancy, stock and invoice alerts from all branches.</p>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Bell className="size-4" />, label: 'Total Alerts', value: summary.total, tone: 'bg-slate-50 border-slate-200 text-slate-700' },
          { icon: <AlertTriangle className="size-4" />, label: 'Unread', value: summary.unread, tone: summary.unread > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500' },
          { icon: <CheckCircle2 className="size-4" />, label: 'Resolved', value: summary.resolved, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
        ].map(({ icon, label, value, tone }) => (
          <div key={label} className={cn('flex items-center gap-2 rounded-2xl border px-4 py-3', tone)}>
            <div className="shrink-0">{icon}</div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
              <p className="text-lg font-black tabular-nums leading-none">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Branch filter */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto">
        <button onClick={() => setBranchFilter('all')}
          className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition', branchFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
          All Branches
        </button>
        {BRANCHES.map(branch => (
          <button key={branch} onClick={() => setBranchFilter(branch)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition', branchFilter === branch ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>
            {BRANCH_LABELS[branch]}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 space-y-4">
        <AdminNotificationsTab branchFilter={branchFilter} />
      </div>
    </div>
  );
}
