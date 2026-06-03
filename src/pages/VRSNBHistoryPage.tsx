// src/pages/VRSNBHistoryPage.tsx
// VRSNB Admin → History: Cafe orders + VRSNB branch sales
import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { cn, formatCurrency } from '@/lib/utils';
import { History, IndianRupee, ShoppingBag } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import EmptyState from '@/components/ui/EmptyState';

export default function VRSNBHistoryPage() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, fetchBranchData } = useBranchStore();
  const [mode, setMode] = useState<'cafe' | 'vrsnb'>('cafe');
  const [filter, setFilter] = useState<'all' | 'today' | 'served' | 'cancelled'>('all');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { fetchBranchData('VRSNB'); }, [fetchBranchData]);

  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();

  // Cafe orders
  const cafeFiltered = useMemo(() => {
    let list = [...orders];
    switch (filter) {
      case 'today':     list = list.filter(o => isToday(o.createdAt)); break;
      case 'served':    list = list.filter(o => o.status === 'served'); break;
      case 'cancelled': list = list.filter(o => o.status === 'cancelled'); break;
    }
    return list;
  }, [orders, filter]);

  // VRSNB branch sales
  const vrsnbSales = useMemo(() => {
    let list = [...(sales['VRSNB'] || [])].sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
    if (filter === 'today') list = list.filter(s => isToday(s.soldAt));
    return list;
  }, [sales, filter]);

  const todayTotal = orders.filter(o => isToday(o.createdAt) && o.status === 'served').reduce((s, o) => s + o.total, 0);
  const vrsnbTodayQty = (sales['VRSNB'] || []).filter(s => isToday(s.soldAt)).reduce((a, s) => a + s.quantitySold, 0);

  const FILTERS = [
    { key: 'all' as const, label: 'All' },
    { key: 'today' as const, label: 'Today' },
    { key: 'served' as const, label: 'Completed' },
    { key: 'cancelled' as const, label: 'Cancelled' },
  ];

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      <div className="px-4 pt-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <History className="size-5 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">History</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <IndianRupee className="size-4 text-primary mx-auto mb-1" />
            <p className="font-display text-xl font-bold tabular-nums">{formatCurrency(todayTotal)}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cafe Today</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <ShoppingBag className="size-4 text-blue-600 mx-auto mb-1" />
            <p className="font-display text-xl font-bold tabular-nums text-blue-700">{vrsnbTodayQty}</p>
            <p className="text-[10px] text-blue-600 uppercase font-semibold">VRSNB Qty Today</p>
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button onClick={() => setMode('cafe')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all', mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground')}>
          ☕ Cafe
        </button>
        <button onClick={() => setMode('vrsnb')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all', mode === 'vrsnb' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground')}>
          🥐 VRSNB
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn('px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all', filter === f.key ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {mode === 'cafe' && (
          cafeFiltered.length === 0 ? (
            <EmptyState icon="🕐" message="No orders found" sub="Orders will appear here once placed." />
          ) : (
            cafeFiltered.map(order => <OrderCard key={order.id} order={order} />)
          )
        )}
        {mode === 'vrsnb' && (
          vrsnbSales.length === 0 ? (
            <EmptyState icon="🛒" message="No VRSNB sales found" sub="Sales will appear here once items are billed." />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y">
                {vrsnbSales.slice(0, 100).map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{s.itemName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.soldBy}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-blue-600">×{s.quantitySold}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
