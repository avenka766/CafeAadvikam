// src/bakery/BakerDashboard.tsx  (Redesigned)
import { useState, useEffect, useRef } from 'react';
import { ChefHat, Send, Loader2, ChevronDown, ChevronUp, CheckCircle2, Flame, Clock } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import type { PreparedItem } from './types';
import { cn } from '@/lib/utils';

// ─── Active baking card ───────────────────────────────────────────────────────
function ActiveBakeCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitPrepared } = useBakeryStore();
  const [expanded, setExpanded] = useState(true);

  const initialised = useRef(false);
  const [prepQty, setPrepQty] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!initialised.current) {
      setPrepQty(Object.fromEntries(order.items.map(i => [i.itemId, String(i.quantity)])));
      initialised.current = true;
    }
  }, [order.items]);

  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // BUG #15 FIX: was >= 0 which allowed submitting 0 qty, stalling packing permanently.
  const valid = order.items.every(i => prepQty[i.itemId] !== '' && Number(prepQty[i.itemId]) > 0);

  const handleSend = async () => {
    setSubmitting(true); setError(null);
    const prepared: PreparedItem[] = order.items.map(item => ({
      itemId: item.itemId, itemName: item.itemName,
      quantityPrepared: Number(prepQty[item.itemId] ?? item.quantity),
      preparedAt: new Date().toISOString(),
      dispatchUnit: item.dispatchUnit ?? 'kg',
    }));
    try {
      await submitPrepared(order.id, prepared);
      setDone(true);
    } catch {
      setError('Failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      done ? 'border-emerald-200 bg-emerald-50/40' : 'border-orange-200 bg-orange-50/20'
    )}>
      {/* Card header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0',
          done ? 'bg-emerald-100' : 'bg-orange-100'
        )}>
          {done
            ? <CheckCircle2 className="size-5 text-emerald-600" />
            : <Flame className="size-5 text-orange-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">Order #{order.orderNumber}</span>
            <span className={cn(
              'text-[9px] font-body font-bold px-2 py-0.5 rounded-full border',
              done
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            )}>
              {done ? '✓ SENT TO PACKING' : '🔥 BAKING'}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {order.items.map(i => i.itemName).join(' · ')}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="size-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-orange-100 px-4 pb-4 pt-3 space-y-4">
          {/* Items */}
          <div className="space-y-2.5">
            {order.items.map(item => {
              const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
              return (
                <div key={item.itemId}
                  className="flex items-center gap-3 bg-background rounded-xl border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{meta?.icon ?? '🍬'}</span>
                      <p className="text-sm font-body font-semibold text-foreground truncate">{item.itemName}</p>
                      {item.isCustom && (
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">CUSTOM</span>
                      )}
                    </div>
                    <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                      Requested: <span className="font-bold text-foreground">{item.quantity}{item.dispatchUnit === 'pcs' ? ' pcs' : ' kg'}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <input
                      type="number" min={0} step={0.25}
                      value={prepQty[item.itemId] ?? item.quantity}
                      onChange={e => setPrepQty(p => ({ ...p, [item.itemId]: e.target.value }))}
                      disabled={done}
                      className="w-20 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                    />
                    <span className="text-[9px] font-body font-bold text-muted-foreground">
                      {item.dispatchUnit === 'pcs' ? 'pcs' : 'kg'} prepared
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* U-14 FIX: show special order notes so baker never misses custom instructions */}
          {order.notes && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <span className="text-amber-600 text-base leading-none mt-0.5">📋</span>
              <div>
                <p className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-wide mb-0.5">Special Instructions</p>
                <p className="text-sm font-body text-amber-900">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Expected output */}
          {order.expectedOutput && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
              <span className="text-[11px] font-body text-primary">🎯 Store target: <strong>{order.expectedOutput} units</strong></span>
            </div>
          )}

          {error && <p className="text-xs font-body text-destructive text-center">{error}</p>}

          <button onClick={handleSend} disabled={submitting || done || !valid}
            className={cn(
              'w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50',
              done
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-orange-500 text-white shadow-lg shadow-orange-200'
            )}>
            {submitting
              ? <Loader2 className="size-4 animate-spin" />
              : done
              ? <><CheckCircle2 className="size-4" /> Sent to Packing</>
              : <><Send className="size-4" /> Send to Packing</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Completed card ───────────────────────────────────────────────────────────
function CompletedCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const isDispatched = order.status === 'dispatched';

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden opacity-75">
      <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-8 rounded-xl flex items-center justify-center shrink-0',
          isDispatched ? 'bg-emerald-100' : 'bg-purple-100'
        )}>
          <CheckCircle2 className={cn('size-4', isDispatched ? 'text-emerald-600' : 'text-purple-600')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">#{order.orderNumber}</span>
            <span className={cn(
              'text-[9px] font-body font-bold px-2 py-0.5 rounded-full border',
              isDispatched
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-purple-100 text-purple-700 border-purple-200'
            )}>
              {isDispatched ? 'DISPATCHED' : 'AT PACKING'}
            </span>
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">
            {order.preparedItems?.map(p => `${p.itemName} ×${p.quantityPrepared}`).join(' · ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {expanded && order.preparedItems && (
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          {order.preparedItems.map((p, i) => (
            <div key={i} className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">{p.itemName}</span>
              <span className="font-bold text-foreground">{p.quantityPrepared} {p.dispatchUnit ?? 'kg'}</span>
            </div>
          ))}
          {order.sentToPackingAt && (
            <p className="text-[10px] font-body text-muted-foreground pt-1 border-t border-border/50 mt-2">
              <Clock className="size-3 inline mr-1" />
              {new Date(order.sentToPackingAt).toLocaleString('en-IN')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BakerDashboard() {
  const { orders, fetchOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const id = setInterval(() => fetchOrders(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const bakingOrders    = orders.filter(o => o.status === 'baking');
  const completedOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
            <h1 className="font-display text-2xl font-bold text-foreground">Baker</h1>
          </div>
          {bakingOrders.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 bg-orange-100 border border-orange-200 text-orange-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
              <Flame className="size-3.5" />
              {bakingOrders.length} to bake
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 grid grid-cols-3 gap-2 mb-5">
        {[
          { label: 'To Bake',   value: bakingOrders.length,    color: bakingOrders.length > 0 ? 'text-orange-600' : 'text-muted-foreground', bg: bakingOrders.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-card border-border' },
          { label: 'At Packing',value: completedOrders.filter(o => o.status === 'packed').length, color: 'text-purple-600', bg: 'bg-card border-border' },
          { label: 'Dispatched',value: completedOrders.filter(o => o.status === 'dispatched').length, color: 'text-emerald-600', bg: 'bg-card border-border' },
        ].map(s => (
          <div key={s.label} className={cn('border rounded-2xl p-3 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {initialLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-xs font-body text-muted-foreground">Loading orders…</p>
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {bakingOrders.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="size-3.5 text-orange-500" />
                <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Active — Ready to Bake</p>
              </div>
              {bakingOrders.map(o => <ActiveBakeCard key={o.id} order={o} />)}
            </div>
          )}

          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Completed</p>
              </div>
              {completedOrders.map(o => <CompletedCard key={o.id} order={o} />)}
            </div>
          )}

          {bakingOrders.length === 0 && completedOrders.length === 0 && (
            <div className="flex flex-col items-center py-24 gap-4">
              <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                <ChefHat className="size-10 text-muted-foreground opacity-30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-body font-semibold text-foreground">No orders yet</p>
                <p className="text-xs font-body text-muted-foreground mt-1">Orders will appear here once the store sends them</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
