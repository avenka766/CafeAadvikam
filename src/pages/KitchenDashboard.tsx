import { useState, useMemo, useEffect, useCallback } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { formatCurrency, formatTime, cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/constants/config';
import type { OrderStatus } from '@/types';
import {
  Wifi, Inbox, Clock, MapPin, User as UserIcon,
  ChefHat, Bell, CheckCircle2, QrCode, UserCheck,
  Volume2, VolumeX,
} from 'lucide-react';

const KITCHEN_TABS: { key: OrderStatus | 'active'; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'active',    label: 'Active',    icon: <ChefHat className="size-4" />,       color: 'bg-primary text-primary-foreground' },
  { key: 'pending',   label: 'New',       icon: <Bell className="size-4" />,           color: 'bg-amber-500 text-white' },
  { key: 'preparing', label: 'Cooking',   icon: <ChefHat className="size-4" />,        color: 'bg-blue-500 text-white' },
  { key: 'ready',     label: 'Ready',     icon: <CheckCircle2 className="size-4" />,   color: 'bg-emerald-500 text-white' },
];

function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* ignore audio errors */ }
}

export default function KitchenDashboard() {
  const { orders, updateOrderStatus, startPolling, stopPolling, polling } = useOrderStore();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'active'>('active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  const pendingCount = todayOrders.filter(o => o.status === 'pending').length;

  // Sound alert for new orders
  const checkNewOrders = useCallback(() => {
    if (soundEnabled && pendingCount > lastOrderCount && lastOrderCount > 0) {
      playNewOrderSound();
    }
    setLastOrderCount(pendingCount);
  }, [pendingCount, lastOrderCount, soundEnabled]);

  useEffect(() => { checkNewOrders(); }, [checkNewOrders]);

  const filtered = useMemo(() => {
    if (activeTab === 'active') {
      return todayOrders.filter(o => o.status === 'pending' || o.status === 'preparing' || o.status === 'ready');
    }
    return todayOrders.filter(o => o.status === activeTab);
  }, [todayOrders, activeTab]);

  const getElapsedMins = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.floor(diff / 60000);
  };

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus(orderId, newStatus);
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Header bar */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="size-5 text-primary" />
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Kitchen</h1>
            <div className="flex items-center gap-1.5">
              <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
              <span className="text-[10px] font-body text-muted-foreground">
                {polling ? 'Live · 3s refresh' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn('size-9 rounded-lg flex items-center justify-center transition-all', soundEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}
          >
            {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300 animate-pulse">
              <Bell className="size-3.5 text-amber-700" />
              <span className="text-xs font-body font-bold text-amber-800">{pendingCount} New</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-2">
          {KITCHEN_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'active'
              ? todayOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length
              : todayOrders.filter(o => o.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-body font-bold whitespace-nowrap transition-all shrink-0',
                  isActive ? tab.color + ' shadow-md' : 'bg-card border border-border text-foreground active:scale-95'
                )}
              >
                {tab.icon}
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

      {/* Orders grid */}
      <div className="px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Inbox className="size-16 mb-4 opacity-30" />
            <p className="font-body font-semibold text-lg">No orders</p>
            <p className="text-sm font-body mt-1">
              {activeTab === 'pending' ? 'Waiting for new orders...' : 'All clear!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(order => {
              const elapsed = getElapsedMins(order.createdAt);
              const isUrgent = order.status === 'pending' && elapsed > 5;
              const isOld = order.status === 'preparing' && elapsed > 15;

              return (
                <div
                  key={order.id}
                  className={cn(
                    'bg-card rounded-2xl border-2 overflow-hidden transition-all',
                    order.status === 'pending' && 'border-amber-400 shadow-lg shadow-amber-100',
                    order.status === 'preparing' && 'border-blue-400',
                    order.status === 'ready' && 'border-emerald-400',
                    isUrgent && 'animate-pulse border-red-400 shadow-red-100',
                  )}
                >
                  {/* Order header */}
                  <div className={cn(
                    'px-4 py-3 flex items-center justify-between',
                    order.status === 'pending' && 'bg-amber-50',
                    order.status === 'preparing' && 'bg-blue-50',
                    order.status === 'ready' && 'bg-emerald-50',
                  )}>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-2xl font-bold text-foreground">
                        #{String(order.orderNumber).padStart(3, '0')}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', ORDER_STATUS_COLORS[order.status])}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <span className="text-[10px] font-body text-muted-foreground flex items-center gap-1">
                          {order.orderSource === 'qr' ? <><QrCode className="size-3" />QR Order</> : <><UserCheck className="size-3" />Staff</>}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn('flex items-center gap-1 text-xs font-body font-bold', isUrgent || isOld ? 'text-red-600' : 'text-muted-foreground')}>
                        <Clock className="size-3" />
                        {elapsed}m ago
                      </div>
                      <p className="text-[10px] font-body text-muted-foreground">{formatTime(order.createdAt)}</p>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="px-4 py-2 flex flex-wrap gap-2 text-xs font-body text-muted-foreground border-b border-border/50">
                    {order.orderType === 'dine_in' && order.tableNumber && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full font-semibold">
                        <MapPin className="size-3" />Table {order.tableNumber}
                      </span>
                    )}
                    {order.orderType === 'takeaway' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent-foreground rounded-full font-semibold">📦 Takeaway</span>
                    )}
                    {order.customerName && (
                      <span className="flex items-center gap-1"><UserIcon className="size-3" />{order.customerName}</span>
                    )}
                  </div>

                  {/* Items — large text for kitchen readability */}
                  <div className="px-4 py-3 space-y-1.5">
                    {order.items.map(ci => (
                      <div key={ci.menuItem.id} className="flex items-start gap-2">
                        <span className="text-base font-body font-bold text-primary shrink-0 w-8 text-right tabular-nums">{ci.quantity}×</span>
                        <span className="text-base font-body font-semibold text-foreground leading-tight">{ci.menuItem.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="px-4 pb-2">
                      <p className="text-xs font-body bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">
                        ⚠️ {order.notes}
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="px-4 py-3 border-t border-border/50 flex gap-2">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, 'preparing')}
                        className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-md"
                      >
                        <ChefHat className="size-4" />
                        Start Cooking
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, 'ready')}
                        className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-md"
                      >
                        <CheckCircle2 className="size-4" />
                        Mark Ready
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <div className="flex-1 py-3 rounded-xl bg-emerald-100 text-emerald-700 font-body font-bold text-sm flex items-center justify-center gap-2">
                        <CheckCircle2 className="size-4" />
                        Ready for Pickup
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
