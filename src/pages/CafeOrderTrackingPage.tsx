import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CAFE_CONFIG } from '@/constants/config';
import { formatTime, cn } from '@/lib/utils';
import {
  Leaf, Clock, CheckCircle2, ChefHat, Bell,
  Loader2, AlertCircle, MapPin,
} from 'lucide-react';
import type { Order, OrderStatus, OrderType, CartItem, PaymentType, PaymentBreakdown, OrderSource } from '@/types';

const STATUS_STEPS: { key: OrderStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'pending', label: 'Order Received', icon: <Bell className="size-5" />, color: 'text-amber-600 bg-amber-100 border-amber-300' },
  { key: 'preparing', label: 'Being Prepared', icon: <ChefHat className="size-5" />, color: 'text-blue-600 bg-blue-100 border-blue-300' },
  { key: 'ready', label: 'Ready for Pickup', icon: <CheckCircle2 className="size-5" />, color: 'text-emerald-600 bg-emerald-100 border-emerald-300' },
];

function dbRowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    orderNumber: row.order_number as number,
    tableNumber: row.table_number as number | undefined,
    orderType: row.order_type as OrderType,
    items: (row.items as CartItem[]) || [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    discountType: row.discount_type as 'percentage' | 'flat',
    discountValue: Number(row.discount_value),
    total: Number(row.total),
    status: row.status as OrderStatus,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    notes: row.notes as string | undefined,
    customerName: row.customer_name as string | undefined,
    paymentType: (row.payment_type as PaymentType) || 'unpaid',
    paymentBreakdown: row.payment_breakdown as PaymentBreakdown | undefined,
    billedBy: row.billed_by as string | undefined,
    cancelReason: row.cancel_reason as string | undefined,
    orderSource: (row.order_source as OrderSource) || 'staff',
  };
}

export default function OrderTrackingPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('id');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) {
      setError('No order ID provided');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchErr || !data) {
        setError('Order not found');
        setLoading(false);
        return;
      }

      setOrder(dbRowToOrder(data as Record<string, unknown>));
      setLoading(false);
    };

    fetchOrder();

    // EGRESS FIX: Raised from 5 s → 30 s. A customer watching their order status
    // does not need sub-second updates; 30 s is acceptable and cuts this page's
    // per-visit egress by 83 %.
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (data) {
        setOrder(dbRowToOrder(data as Record<string, unknown>));
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [orderId]);

  const currentStepIdx = useMemo(() => {
    if (!order) return -1;
    if (order.status === 'served') return 3; // past ready
    return STATUS_STEPS.findIndex(s => s.key === order.status);
  }, [order]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-sm font-body text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="size-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">{error || 'Order Not Found'}</h1>
          <p className="text-sm font-body text-muted-foreground">
            Please check your order link and try again.
          </p>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const isServed = order.status === 'served';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,hsl(164 52% 18%) 0%,hsl(164 52% 12%) 40%,hsl(var(--background)) 100%)' }}>
      {/* ── Hero header ── */}
      <div className="px-5 pt-12 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, hsl(34 80% 52%), transparent)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <Leaf className="size-5 text-white/70" />
            <span className="text-sm font-body font-medium text-white/70">{CAFE_CONFIG.name}</span>
          </div>
          <p className="text-xs font-body font-semibold text-white/50 uppercase tracking-widest mb-1">Order Number</p>
          <p className="font-display text-6xl font-bold text-white leading-none">
            #{String(order.orderNumber).padStart(3, '0')}
          </p>
          <div className="flex items-center gap-4 mt-4">
            {order.tableNumber && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <MapPin className="size-3.5 text-white/80" />
                <span className="text-sm font-body font-semibold text-white">Table {order.tableNumber}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-white/50" />
              <span className="text-sm font-body text-white/60">{formatTime(order.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-6 pb-8 space-y-4">
        {/* ── Status tracker ── */}
        {isCancelled ? (
          <div className="bg-card border-2 border-red-300 rounded-3xl p-7 text-center shadow-lifted animate-fade-up">
            <div className="size-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-8 text-red-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-red-700 mb-1">Order Cancelled</h2>
            {order.cancelReason && (
              <p className="text-sm font-body text-muted-foreground mt-1">Reason: {order.cancelReason}</p>
            )}
          </div>
        ) : isServed ? (
          <div className="bg-card border-2 border-emerald-300 rounded-3xl p-7 text-center shadow-lifted animate-fade-up"
            style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.06),rgba(16,185,129,0.02))' }}>
            <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="size-8 text-emerald-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-emerald-700 mb-1">Enjoy Your Meal! 🍽️</h2>
            <p className="text-sm font-body text-muted-foreground">Thank you for dining with us!</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-3xl p-6 shadow-lifted animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-bold text-foreground">Live Status</h2>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-body font-semibold text-emerald-700">Live</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-border" />
              <div className="absolute left-[22px] top-0 w-0.5 bg-primary transition-all duration-1000 ease-out"
                style={{ height: `${Math.max(0, currentStepIdx) * 50}%` }} />
              <div className="space-y-8">
                {STATUS_STEPS.map((step, idx) => {
                  const isActive = idx === currentStepIdx;
                  const isPast = idx < currentStepIdx;
                  return (
                    <div key={step.key} className="flex items-center gap-4 relative">
                      <div className={cn(
                        'size-11 rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all duration-300 z-10',
                        isActive ? step.color + ' shadow-lifted scale-110' : isPast ? 'bg-primary/10 text-primary border-primary' : 'bg-muted text-muted-foreground border-border'
                      )}>
                        {isPast ? <CheckCircle2 className="size-5" /> : step.icon}
                      </div>
                      <div className="flex-1">
                        <p className={cn('text-base font-body font-bold',
                          isActive ? 'text-foreground' : isPast ? 'text-primary' : 'text-muted-foreground')}>
                          {step.label}
                        </p>
                        {isActive && (
                          <p className="text-xs font-body text-muted-foreground mt-0.5">
                            {step.key === 'pending' && '✅ Order received by kitchen'}
                            {step.key === 'preparing' && '👨‍🍳 Our chefs are preparing your food'}
                            {step.key === 'ready' && '🔔 Your order is ready — please collect!'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Items ── */}
        <div className="bg-card border border-border rounded-3xl p-5 shadow-soft animate-fade-up delay-100">
          <h3 className="font-display text-lg font-bold text-foreground mb-3">Your Items</h3>
          <div className="space-y-2">
            {order.items.map(ci => (
              <div key={ci.menuItem.id} className="flex justify-between text-sm font-body py-1.5 border-b border-border/50 last:border-0">
                <span className="text-foreground">
                  <span className="font-bold text-primary tabular-nums mr-1">{ci.quantity}×</span>{ci.menuItem.name}
                </span>
              </div>
            ))}
          </div>
          {order.notes && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-body text-muted-foreground bg-muted px-3 py-2 rounded-xl">📝 {order.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Leaf className="size-3.5 text-primary" />
            <p className="font-display text-sm font-semibold text-foreground">{CAFE_CONFIG.name}</p>
          </div>
          <p className="text-xs font-body text-muted-foreground">{CAFE_CONFIG.address}</p>
          <p className="text-xs font-body text-muted-foreground mt-0.5">{CAFE_CONFIG.type} · {CAFE_CONFIG.hours}</p>
        </div>
      </div>
    </div>
  );
}
