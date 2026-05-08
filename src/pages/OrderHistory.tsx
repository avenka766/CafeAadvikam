import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import { History, CalendarDays } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';

export default function OrderHistory() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [filter, setFilter] = useState<'all' | 'today' | 'served' | 'cancelled'>('all');

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const isToday = (dateStr: string) => new Date(dateStr).toDateString() === new Date().toDateString();

  const filtered = useMemo(() => {
    let list = [...orders];
    if (currentUser?.role === 'order_taker') {
      list = list.filter((o) => o.createdBy === currentUser.username);
    }
    switch (filter) {
      case 'today': list = list.filter((o) => isToday(o.createdAt)); break;
      case 'served': list = list.filter((o) => o.status === 'served'); break;
      case 'cancelled': list = list.filter((o) => o.status === 'cancelled'); break;
    }
    return list;
  }, [orders, filter, currentUser]);

  const todayTotal = orders.filter((o) => isToday(o.createdAt) && o.status === 'served').reduce((sum, o) => sum + o.total, 0);
  const todayCount = orders.filter((o) => isToday(o.createdAt)).length;

  const FILTERS = [
    { key: 'all' as const, label: 'All Orders' },
    { key: 'today' as const, label: 'Today' },
    { key: 'served' as const, label: 'Completed' },
    { key: 'cancelled' as const, label: 'Cancelled' },
  ];

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className="px-4 pt-4 pb-2 flex gap-3">
        <div className="flex-1 bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Today</span>
          </div>
          <p className="font-display text-xl font-bold text-foreground tabular-nums">{todayCount}</p>
          <p className="text-[10px] font-body text-muted-foreground">orders</p>
        </div>
        <div className="flex-1 bg-primary/5 border border-primary/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-body font-semibold text-primary uppercase">Revenue</span>
          </div>
          <p className="font-display text-xl font-bold text-primary tabular-nums">{formatCurrency(todayTotal)}</p>
          <p className="text-[10px] font-body text-muted-foreground">served today</p>
        </div>
      </div>

      <div className="sticky top-14 z-30 bg-background border-b border-border px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn('px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0', filter === f.key ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card border border-border text-foreground active:scale-95')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <History className="size-16 mb-4 opacity-30" />
            <p className="font-body font-semibold text-lg">No orders found</p>
            <p className="text-sm font-body mt-1">Orders will appear here after they are placed.</p>
          </div>
        ) : (
          filtered.map((order) => <OrderCard key={order.id} order={order} />)
        )}
      </div>
    </div>
  );
}
