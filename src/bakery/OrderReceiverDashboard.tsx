// ─── OrderReceiverDashboard (Redesigned) ─────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Send, History, ClipboardList, MapPin, Circle } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BRANCHES } from './types';
import type { Branch } from './types';
import { BRANCH_COLOR } from './receiverConstants';
import BranchStockForm from './BranchStockForm';
import BranchRecentOrders from './BranchRecentOrders';
import { cn } from '@/lib/utils';

const BRANCH_ACCENT: Record<Branch, { dot: string; ring: string; pill: string; pillText: string; icon: string }> = {
  VRSNB: { dot: 'bg-blue-500',    ring: 'ring-blue-400',   pill: 'bg-blue-50 border-blue-200',   pillText: 'text-blue-700',   icon: '🏙️' },
  SNB:   { dot: 'bg-amber-500',   ring: 'ring-amber-400',  pill: 'bg-amber-50 border-amber-200', pillText: 'text-amber-700',  icon: '🏪' },
  Hosur: { dot: 'bg-emerald-500', ring: 'ring-emerald-400',pill: 'bg-emerald-50 border-emerald-200', pillText: 'text-emerald-700', icon: '🌿' },
};

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
  const [activeTab, setActiveTab] = useState<Branch>(BRANCHES[0]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<'form' | 'history'>('form');

  const stableFetch = useCallback(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    stableFetch();
    const id = setInterval(stableFetch, 15_000);
    return () => clearInterval(id);
  }, [stableFetch]);
  useEffect(() => { if (refreshKey > 0) stableFetch(); }, [refreshKey, stableFetch]);

  const today        = new Date().toDateString();
  const todayOrders  = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  // BUG #11 FIX: show stats for the ACTIVE branch tab, not all branches combined.
  // Previously pendingCount/doneCount were global totals — misleading in a branch-specific view.
  const branchOrders  = orders.filter(o => o.targetBranch === activeTab);
  const pendingCount  = branchOrders.filter(o => o.status === 'pending').length;
  const doneCount     = branchOrders.filter(o => o.status === 'dispatched').length;
  const branchPending = (b: Branch) => orders.filter(o => o.status === 'pending' && o.targetBranch === b).length;

  const accent = BRANCH_ACCENT[activeTab];

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">

      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
          <h1 className="font-display text-2xl font-bold text-foreground leading-tight">Order Receiver</h1>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-body font-semibold text-muted-foreground">Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 grid grid-cols-3 gap-2.5 mb-5">
        {[
          { label: "Today", value: branchOrders.filter(o => new Date(o.createdAt).toDateString() === today).length, color: 'text-foreground', bg: 'bg-card' },
          { label: "Pending", value: pendingCount, color: pendingCount > 0 ? 'text-amber-600' : 'text-foreground', bg: pendingCount > 0 ? 'bg-amber-50' : 'bg-card' },
          { label: "Dispatched", value: doneCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className={cn('border border-border rounded-2xl p-3.5 text-center', s.bg)}>
            <p className={cn('font-display text-2xl font-bold tabular-nums leading-none', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Branch tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-2">
          {BRANCHES.map(b => {
            const pend   = branchPending(b);
            const active = activeTab === b;
            const a      = BRANCH_ACCENT[b];
            return (
              <button key={b} onClick={() => { setActiveTab(b); setView('form'); }}
                className={cn(
                  'flex-1 relative flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all duration-200 active:scale-[0.97]',
                  active
                    ? cn('bg-card border-border shadow-sm ring-2', a.ring)
                    : 'bg-card border-border text-muted-foreground'
                )}>
                <span className="text-xl leading-none">{a.icon}</span>
                <span className="text-[11px] font-body font-bold text-foreground">{b}</span>
                {pend > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {pend}
                  </span>
                )}
                {active && <span className={cn('w-4 h-0.5 rounded-full', a.dot)} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* View toggle */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 bg-muted/60 p-1 rounded-xl">
          {([
            { key: 'form',    icon: Send,         label: 'New Order' },
            { key: 'history', icon: History,      label: 'History' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setView(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-semibold transition-all',
                view === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Branch context banner */}
      <div className="px-4 mb-3">
        <div className={cn('flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border', accent.pill)}>
          <MapPin className={cn('size-3.5 shrink-0', accent.pillText)} />
          <p className={cn('text-xs font-body font-bold flex-1', accent.pillText)}>
            {activeTab} Branch · {view === 'form' ? 'Enter today\'s requirement' : 'Recent orders'}
          </p>
          {branchPending(activeTab) > 0 && (
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-lg border', accent.pill, accent.pillText)}>
              {branchPending(activeTab)} pending
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4">
        {view === 'form' && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {BRANCHES.map(b => (
              <div key={b} className={b === activeTab ? '' : 'hidden'}>
                <BranchStockForm branch={b} onSubmitted={() => { setRefreshKey(k => k + 1); setView('history'); }} />
              </div>
            ))}
          </div>
        )}
        {view === 'history' && (
          loading
            ? <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            : <BranchRecentOrders branch={activeTab} />
        )}
      </div>
    </div>
  );
}
