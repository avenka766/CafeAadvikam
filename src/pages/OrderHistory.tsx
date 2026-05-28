import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency } from '@/lib/utils';
import { History, CalendarDays, IndianRupee, ChevronDown } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import EmptyState from '@/components/ui/EmptyState';

// U-09 FIX: number of orders per page to prevent loading thousands of rows into one scroll
const PAGE_SIZE = 20;

export default function OrderHistory() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [filter, setFilter] = useState<'all' | 'today' | 'served' | 'cancelled'>('all');
  // U-09 FIX: date search and pagination state
  const [dateSearch, setDateSearch] = useState('');
  const [page, setPage] = useState(1);

  // Reset page when filter or date changes
  useEffect(() => { setPage(1); }, [filter, dateSearch]);

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
    // U-09 FIX: filter by date if a date is typed
    if (dateSearch) {
      list = list.filter(o => new Date(o.createdAt).toISOString().slice(0, 10) === dateSearch);
    }
    return list;
  }, [orders, filter, currentUser, dateSearch]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = page * PAGE_SIZE < filtered.length;

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

        {/* U-09 FIX: date picker for searching a specific day */}
        <div className="mt-3">
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
            Search by date
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dateSearch}
              onChange={e => setDateSearch(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="flex-1 px-3 py-2 bg-card border border-border rounded-xl text-sm font-body"
            />
            {dateSearch && (
              <button
                onClick={() => setDateSearch('')}
                className="text-xs font-body font-semibold text-primary underline underline-offset-2 whitespace-nowrap active:opacity-70"
              >
                Clear
              </button>
            )}
          </div>
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
          <EmptyState
            icon="🕐"
            message="No orders found"
            sub={dateSearch ? `No orders on ${dateSearch}` : 'Orders will appear here after they are placed.'}
          />
        ) : (
          <>
            <p className="text-xs font-body text-muted-foreground">
              Showing {paginated.length} of {filtered.length} order{filtered.length !== 1 ? 's' : ''}
              {dateSearch ? ` on ${dateSearch}` : ''}
            </p>
            {paginated.map(order => <OrderCard key={order.id} order={order} />)}

            {/* U-09 FIX: "Load more" pagination instead of one endless scroll */}
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="w-full py-3 rounded-xl border border-border text-sm font-body font-semibold text-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <ChevronDown className="size-4" />
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
