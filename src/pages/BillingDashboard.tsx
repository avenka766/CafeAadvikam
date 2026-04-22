import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { cn } from '@/lib/utils';
import { Inbox, Wifi } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import type { OrderStatus } from '@/types';

const TABS: { key: OrderStatus | 'all'; label: string; dotColor: string }[] = [
  { key: 'all', label: 'All', dotColor: 'bg-foreground' },
  { key: 'pending', label: 'New', dotColor: 'bg-amber-500' },
  { key: 'preparing', label: 'Preparing', dotColor: 'bg-blue-500' },
  { key: 'ready', label: 'Ready', dotColor: 'bg-emerald-500' },
  { key: 'served', label: 'Served', dotColor: 'bg-gray-400' },
  { key: 'cancelled', label: 'Cancelled', dotColor: 'bg-red-500' },
];

export default function BillingDashboard() {
  const { orders, startPolling, stopPolling, polling } = useOrderStore();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('pending');

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return todayOrders;
    return todayOrders.filter((o) => o.status === activeTab);
  }, [todayOrders, activeTab]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Sync indicator */}
      <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
        <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
        <span className="text-[10px] font-body text-muted-foreground">
          {polling ? 'Live syncing every 3s' : 'Offline'}
        </span>
      </div>

      {/* Status Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? todayOrders.length
              : todayOrders.filter((o) => o.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
                  isActive
                    ? 'cafe-gradient text-primary-foreground shadow-md'
                    : 'bg-card border border-border text-foreground active:scale-95'
                )}
              >
                <span className={cn('size-2 rounded-full', isActive ? 'bg-primary-foreground' : tab.dotColor)} />
                {tab.label}
                {count > 0 && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', isActive ? 'bg-white/20' : 'bg-muted')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders */}
      <div className="px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Inbox className="size-16 mb-4 opacity-30" />
            <p className="font-body font-semibold text-lg">No orders here</p>
            <p className="text-sm font-body mt-1">
              {activeTab === 'pending' ? 'Waiting for new orders from staff...' : `No ${activeTab === 'all' ? '' : activeTab} orders right now`}
            </p>
          </div>
        ) : (
          filtered.map((order) => <OrderCard key={order.id} order={order} showActions />)
        )}
      </div>
    </div>
  );
}
