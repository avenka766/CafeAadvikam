// src/pages/AdminAlertsPage.tsx
// CHANGE 17: Improved UI — enhanced header with alert counts and branch filter.
// The underlying AdminNotificationsTab handles grouping, mark-read, resolve.

import { useMemo, useState } from 'react';
import AdminNotificationsTab from '@/bakery/AdminNotificationsTab';
import { useNotificationStore } from '@/bakery/notificationStore';
import { Bell, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { Branch } from '@/branch/types';
import { BRANCHES, BRANCH_LABELS } from '@/branch/types';
import { cn } from '@/lib/utils';

export default function AdminAlertsPage() {
  const { notifications } = useNotificationStore();
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');

  const summary = useMemo(() => ({
    total: notifications.length,
    unread: notifications.filter(n => !n.read).length,
    resolved: notifications.filter(n => n.resolved).length,
    pending: notifications.filter(n => !n.resolved).length,
  }), [notifications]);

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
          { icon: <Clock className="size-4" />, label: 'Pending', value: summary.pending, tone: summary.pending > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500' },
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
        <AdminNotificationsTab />
      </div>
    </div>
  );
}
