import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency } from '@/lib/utils';
import { History, CalendarDays, IndianRupee } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';

export default function OrderHistory() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [filter, setFilter] = useState<'all' | 'today' | 'served' | 'cancelled'>('all');

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();

  const filtered = useMemo(() => {
    let list = [...orders];
    if (currentUser?.role === 'order_taker') list = list.filter(o => o.createdBy === currentUser.username);
    switch (filter) {
      case 'today':     list = list.filter(o => isToday(o.createdAt)); break;
      case 'served':    list = list.filter(o => o.status === 'served'); break;
      case 'cancelled': list = list.filter(o => o.status === 'cancelled'); break;
    }
    return list;
  }, [orders, filter, currentUser]);

  const todayTotal = orders
    .filter(o => isToday(o.createdAt) && o.status === 'served')
    .reduce((s, o) => s + o.total, 0);
  const todayCount = orders.filter(o => isToday(o.createdAt)).length;

  const FILTERS = [
    { key: 'all'       as const, label: 'All Orders' },
    { key: 'today'     as const, label: 'Today' },
    { key: 'served'    as const, label: 'Completed' },
    { key: 'cancelled' as const, label: 'Cancelled' },
  ];

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">

      {/* ── Page header ── */}
      <div className="px-4 pt-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <History className="size-5 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">Order History</h1>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="kpi-card">
            <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <CalendarDays className="size-4 text-primary" />
            </div>
            <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{todayCount}</p>
            <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">
              Today's Orders
            </p>
          </div>
          {currentUser?.role !== 'kitchen' && currentUser?.role !== 'order_taker' && (
            <div className="kpi-card" style={{ background: 'linear-gradient(135deg, hsl(164 52% 26% / 0.08), hsl(164 52% 26% / 0.04))', borderColor: 'hsl(164 52% 26% / 0.2)' }}>
              <div className="size-8 rounded-xl bg-primary/15 flex items-center justify-center mb-2">
                <IndianRupee className="size-4 text-primary" />
              </div>
              <p className="font-display text-2xl font-bold text-primary tabular-nums leading-none">{formatCurrency(todayTotal)}</p>
              <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">
                Revenue Today
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95',
              filter === f.key
                ? 'text-primary-foreground shadow-teal'
                : 'bg-card border border-border text-foreground'
            )}
            style={filter === f.key ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className="px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
              <History className="size-10 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="font-body font-semibold text-foreground">No orders found</p>
              <p className="text-sm font-body text-muted-foreground mt-1">Orders will appear here after they are placed.</p>
            </div>
          </div>
        ) : (
          filtered.map(order => <OrderCard key={order.id} order={order} />)
        )}
      </div>
    </div>
  );
}
