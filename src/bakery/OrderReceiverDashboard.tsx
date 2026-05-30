// ─── OrderReceiverDashboard — Branch-locked, role-driven ─────────────────────
// receiver_vrsnb → VRSNB branch only, VRSNB items only
// receiver_snb   → SNB branch only,   SNB items only
// receiver_hosur → Hosur branch only, Hosur/SNB items only
//
// Each receiver has:
//   • New Order tab  — place today's requirement
//   • History tab    — view past orders for their branch
//   • Notifications tab — packing discrepancies (short OR excess) for their branch

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Send, History, Bell, MapPin, Package, AlertTriangle, CheckCircle2, ArrowUp, ArrowDown } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from './notificationStore';
import type { Branch } from './types';
import BranchStockForm from './BranchStockForm';
import BranchRecentOrders from './BranchRecentOrders';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

// ── Branch config ──────────────────────────────────────────────────────────────

interface BranchMeta {
  branch: Branch;
  label: string;
  icon: string;
  dot: string;
  ring: string;
  pill: string;
  pillText: string;
  headerBg: string;
}

const BRANCH_META: Record<string, BranchMeta> = {
  receiver_vrsnb: {
    branch:    'VRSNB',
    label:     'VRSNB Order',
    icon:      '🏙️',
    dot:       'bg-blue-500',
    ring:      'ring-blue-400',
    pill:      'bg-blue-50 border-blue-200',
    pillText:  'text-blue-700',
    headerBg:  'from-blue-50 to-background',
  },
  receiver_snb: {
    branch:    'SNB',
    label:     'SNB Order',
    icon:      '🏪',
    dot:       'bg-amber-500',
    ring:      'ring-amber-400',
    pill:      'bg-amber-50 border-amber-200',
    pillText:  'text-amber-700',
    headerBg:  'from-amber-50 to-background',
  },
  receiver_hosur: {
    branch:    'Hosur',
    label:     'Hosur Order',
    icon:      '🌿',
    dot:       'bg-emerald-500',
    ring:      'ring-emerald-400',
    pill:      'bg-emerald-50 border-emerald-200',
    pillText:  'text-emerald-700',
    headerBg:  'from-emerald-50 to-background',
  },
};

type TabKey = 'order' | 'history' | 'notifications';

// ── Notification item ─────────────────────────────────────────────────────────

interface DiscrepancyItem {
  itemName: string;
  requested: number;
  dispatched: number;
  unit: string;
}

interface RemainderItem {
  itemName:      string;
  remainderKg:   number;
  dispatchedPcs: number;
  preparedKg:    number;
}

function NotificationCard({ n, onRead }: {
  n: { id: string; title: string; body: string; isRead: boolean; createdAt: string; meta?: Record<string, unknown> };
  onRead: (id: string) => void;
}) {
  const meta           = n.meta as { items?: DiscrepancyItem[] | RemainderItem[] } | undefined;
  const items          = meta?.items ?? [];
  const isRemainder    = n.type === 'packing_remainder';
  const remainderItems = isRemainder ? (items as RemainderItem[]) : [];
  const discrepItems   = isRemainder ? [] : (items as DiscrepancyItem[]);

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 space-y-3 transition-all',
        n.isRead ? 'bg-card border-border opacity-70' : 'bg-card border-amber-200 shadow-sm',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0 text-lg',
          n.isRead ? 'bg-muted' : 'bg-amber-50',
        )}>
          <AlertTriangle className={cn('size-4', n.isRead ? 'text-muted-foreground' : 'text-amber-600')} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-body font-bold leading-snug', n.isRead ? 'text-muted-foreground' : 'text-foreground')}>
            {n.title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        {!n.isRead && (
          <span className="size-2 rounded-full bg-amber-500 shrink-0 mt-1" />
        )}
      </div>

      {/* Per-item breakdown — discrepancy type */}
      {!isRemainder && discrepItems.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {discrepItems.map((item, i) => {
            const diff     = item.dispatched - item.requested;
            const isShort  = diff < 0;
            const isExcess = diff > 0;
            const isExact  = diff === 0;
            return (
              <div key={i} className={cn(
                'flex items-center justify-between px-3 py-2 rounded-xl text-xs',
                isShort  ? 'bg-red-50 border border-red-100'    :
                isExcess ? 'bg-amber-50 border border-amber-100' :
                           'bg-emerald-50 border border-emerald-100',
              )}>
                <span className="font-body font-semibold text-foreground truncate flex-1">{item.itemName}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-muted-foreground">
                    req <strong>{item.requested}</strong> {item.unit}
                  </span>
                  {isShort && (
                    <span className="flex items-center gap-0.5 text-red-600 font-bold">
                      <ArrowDown className="size-3" />{Math.abs(diff)} {item.unit} short
                    </span>
                  )}
                  {isExcess && (
                    <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                      <ArrowUp className="size-3" />{diff} {item.unit} extra
                    </span>
                  )}
                  {isExact && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-bold">
                      <CheckCircle2 className="size-3" /> exact
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-item breakdown — remainder type */}
      {isRemainder && remainderItems.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {remainderItems.map((item, i) => {
            const remainderGrams = Math.round(item.remainderKg * 1000);
            return (
              <div key={i} className="px-3 py-2 rounded-xl text-xs bg-amber-50 border border-amber-100">
                <div className="flex items-center justify-between">
                  <span className="font-body font-semibold text-foreground truncate flex-1">{item.itemName}</span>
                  <span className="flex items-center gap-0.5 text-amber-600 font-bold shrink-0 ml-2">
                    <AlertTriangle className="size-3" />{remainderGrams}g at bakery
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {item.preparedKg} kg → <strong>{item.dispatchedPcs} pcs</strong> dispatched · {remainderGrams}g cannot form a whole piece
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!n.isRead && (
        <button
          onClick={() => onRead(n.id)}
          className="w-full py-2 rounded-xl bg-muted text-xs font-body font-semibold text-muted-foreground active:bg-muted/70"
        >
          Mark as read
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
  const { currentUser }                 = useAuthStore();
  const { notifications, loaded, load, markRead, markAllRead } = useNotificationStore();

  const [tab,        setTab]        = useState<TabKey>('order');
  const [refreshKey, setRefreshKey] = useState(0);

  // Derive branch from role
  const role = currentUser?.role as UserRole | undefined;
  const meta = role ? BRANCH_META[role] : null;
  const branch = meta?.branch as Branch | undefined;

  const stableFetch = useCallback(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    stableFetch();
    const id = setInterval(stableFetch, 15_000);
    return () => clearInterval(id);
  }, [stableFetch]);
  useEffect(() => { if (refreshKey > 0) stableFetch(); }, [refreshKey, stableFetch]);

  useEffect(() => {
    if (!loaded) load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load, loaded]);

  // Guard — should never happen if routing is correct
  if (!meta || !branch) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-muted-foreground text-sm">No branch assigned to your account. Please contact admin.</p>
      </div>
    );
  }

  // Stats
  const today        = new Date().toDateString();
  const branchOrders = orders.filter(o => o.targetBranch === branch);
  const todayCount   = branchOrders.filter(o => new Date(o.createdAt).toDateString() === today).length;
  const pendingCount = branchOrders.filter(o => o.status === 'pending').length;
  const doneCount    = branchOrders.filter(o => o.status === 'dispatched').length;

  // Branch-specific packing_discrepancy notifications only
  const branchNotifications = notifications.filter(n =>
    n.type === 'packing_discrepancy' &&
    (n.meta as { branch?: string } | undefined)?.branch === branch,
  );
  const unreadCount = branchNotifications.filter(n => !n.isRead).length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">

      {/* Header */}
      <div className={cn('px-4 pt-5 pb-4 bg-gradient-to-b', meta.headerBg)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{meta.icon}</span>
              <h1 className="font-display text-2xl font-bold text-foreground leading-tight">{meta.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-body font-semibold text-muted-foreground">Live</span>
          </div>
        </div>

        {/* Branch pill */}
        <div className={cn('mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border', meta.pill)}>
          <MapPin className={cn('size-3', meta.pillText)} />
          <span className={cn('text-[11px] font-body font-bold', meta.pillText)}>{branch} Branch</span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 grid grid-cols-3 gap-2.5 mt-4 mb-5">
        {[
          { label: 'Today',      value: todayCount,   color: 'text-foreground',   bg: 'bg-card' },
          { label: 'Pending',    value: pendingCount,  color: pendingCount > 0 ? 'text-amber-600' : 'text-foreground', bg: pendingCount > 0 ? 'bg-amber-50' : 'bg-card' },
          { label: 'Dispatched', value: doneCount,     color: 'text-emerald-600',  bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className={cn('border border-border rounded-2xl p-3.5 text-center', s.bg)}>
            <p className={cn('font-display text-2xl font-bold tabular-nums leading-none', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="px-4 mb-4">
        <div className="flex gap-1 bg-muted/60 p-1 rounded-xl">
          {([
            { key: 'order'         as TabKey, icon: Send,    label: 'New Order' },
            { key: 'history'       as TabKey, icon: History, label: 'History'   },
            { key: 'notifications' as TabKey, icon: Bell,    label: 'Alerts',   badge: unreadCount },
          ]).map(({ key, icon: Icon, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 relative flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-semibold transition-all',
                tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {badge != null && badge > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4">

        {/* ── New Order ── */}
        {tab === 'order' && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <BranchStockForm
              branch={branch}
              onSubmitted={() => { setRefreshKey(k => k + 1); setTab('history'); }}
            />
          </div>
        )}

        {/* ── History ── */}
        {tab === 'history' && (
          loading
            ? <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            : <BranchRecentOrders branch={branch} />
        )}

        {/* ── Notifications ── */}
        {tab === 'notifications' && (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" />
                <p className="text-sm font-body font-bold text-foreground">Packing Discrepancies</p>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-body font-semibold text-muted-foreground underline underline-offset-2"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Info pill */}
            <div className={cn('flex items-start gap-2 px-3.5 py-2.5 rounded-xl border', meta.pill)}>
              <AlertTriangle className={cn('size-3.5 shrink-0 mt-0.5', meta.pillText)} />
              <p className={cn('text-[11px] font-body leading-relaxed', meta.pillText)}>
                You are notified whenever packing sends <strong>fewer</strong> or <strong>more</strong> items than you requested for <strong>{branch}</strong>.
              </p>
            </div>

            {/* Notification list */}
            {branchNotifications.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <CheckCircle2 className="size-10 text-emerald-400 mb-3" />
                <p className="font-body font-semibold text-foreground text-sm">All good!</p>
                <p className="text-xs text-muted-foreground mt-1">No packing discrepancies for {branch} yet.</p>
              </div>
            ) : (
              branchNotifications.map(n => (
                <NotificationCard key={n.id} n={n} onRead={markRead} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
