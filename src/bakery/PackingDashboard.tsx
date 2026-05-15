// src/bakery/PackingDashboard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Loader2, ChevronDown, ChevronUp, Truck,
  AlertTriangle, CheckCircle2, ClipboardCheck, Lock, Unlock,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch, PreparedItem } from './types';
import { kgToPcs } from './itemMatcher';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PackedEntry {
  itemId:      string;
  itemName:    string;
  qty:         number;
  confirmed:   boolean;
  weightGrams?: number;
  dispatchUnit?: 'pcs' | 'kg';
  confirmedPcs?: number;
}

// ─── Per-item dispatch row ────────────────────────────────────────────────────
function DispatchRow({
  itemName, available, onDispatch, submitting, defaultBranch, unit,
}: {
  itemName:      string;
  available:     number;
  onDispatch:    (qty: number, branch: Branch) => Promise<void>;
  submitting:    boolean;
  defaultBranch?: Branch;
  unit?: 'pcs' | 'kg';
}) {
  const [qty, setQty] = useState('');
  const branch    = defaultBranch ?? 'VRSNB';
  const qtyNum    = parseFloat(qty) || 0;
  const overQty   = qtyNum > available;
  const unitLabel = unit === 'pcs' ? 'pcs' : 'kg';

  const handle = async () => {
    if (qtyNum <= 0) return;
    await onDispatch(qtyNum, branch);
    setQty('');
  };

  return (
    <div className="space-y-2 py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body font-semibold text-foreground">{itemName}</span>
        <span className={cn(
          'text-xs font-body font-bold',
          available <= 0 ? 'text-destructive' : 'text-emerald-600',
        )}>
          {available} {unitLabel} available
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex items-center">
          <input
            type="number" min={0.01} step={unit === 'pcs' ? 1 : 0.25} placeholder="Qty"
            value={qty} onChange={e => setQty(e.target.value)}
            className={cn(
              'w-24 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2',
              overQty ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-primary/30',
            )}
          />
          <span className="absolute -bottom-4 left-0 right-0 text-center text-[9px] font-body font-bold text-muted-foreground">
            {unitLabel}
          </span>
        </div>
        <div className="flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm font-body font-semibold flex items-center">
          🏪 {branch}
        </div>
        <button
          onClick={handle}
          disabled={submitting || qtyNum <= 0 || available <= 0}
          className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-body font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all shrink-0"
        >
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
          Send
        </button>
      </div>
      {overQty && (
        <p className="text-[10px] font-body text-amber-600 flex items-center gap-1 mt-4">
          <AlertTriangle className="size-3" /> Exceeds available stock
        </p>
      )}
    </div>
  );
}

// ─── Single order card ────────────────────────────────────────────────────────
function PackingOrderCard({
  order,
}: {
  order: ReturnType<typeof useBakeryStore.getState>['orders'][0];
}) {
  const { submitDispatch } = useBakeryStore();
  const { currentUser }   = useAuthStore();

  const [expanded,         setExpanded]         = useState(order.status === 'packed');
  const [dispatchingItems, setDispatchingItems] = useState<Set<string>>(new Set());
  const [dispatchError,    setDispatchError]    = useState<string | null>(null);

  // FIX: packedEntries is initialised once from preparedItems on first mount.
  // The ref guard means the 15s background poll never resets confirmation state
  // the packer has already set (confirmed, qty edits, confirmedPcs conversions).
  const initialised = useRef(false);
  const [packedEntries, setPackedEntries] = useState<PackedEntry[]>([]);
  useEffect(() => {
    if (!initialised.current && order.preparedItems && order.preparedItems.length > 0) {
      setPackedEntries(
        order.preparedItems.map(p => {
          const orderItem = order.items.find(i => i.itemId === p.itemId);
          return {
            itemId:      p.itemId,
            itemName:    p.itemName,
            qty:         p.quantityPrepared,
            confirmed:   false,
            weightGrams: orderItem?.weightGrams ?? undefined,
            dispatchUnit: orderItem?.dispatchUnit ?? 'kg',
          };
        })
      );
      initialised.current = true;
    }
  }, [order.preparedItems, order.items]);

  const isCustomItem = (itemId: string) =>
    order.items.find(i => i.itemId === itemId)?.isCustom ?? false;

  const allConfirmed = packedEntries.length > 0 && packedEntries.every(e => e.confirmed);

  const confirmEntry = (idx: number) => {
    setPackedEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      let confirmedPcs: number | undefined;
      if (e.dispatchUnit === 'pcs' && e.weightGrams != null) {
        confirmedPcs = kgToPcs(e.qty, e.weightGrams) ?? undefined;
      }
      return { ...e, confirmed: true, confirmedPcs };
    }));
  };
  const unconfirmEntry = (idx: number) => {
    setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, confirmed: false, confirmedPcs: undefined } : e));
  };
  const updateEntryQty = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) {
      setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, qty: n, confirmed: false } : e));
    }
  };

  const preparedItems = order.preparedItems || [];
  const dispatchLog   = order.dispatchLog   || [];

  const stockByItem = useMemo(() => {
    const result: Record<string, { prepared: number; dispatched: number; available: number; unit: 'pcs' | 'kg' }> = {};
    preparedItems.forEach(p => {
      const entry      = packedEntries.find(e => e.itemId === p.itemId);
      const isPcs      = entry?.dispatchUnit === 'pcs';
      const effectiveQty = (isPcs && entry?.confirmedPcs != null)
        ? entry.confirmedPcs
        : p.quantityPrepared;
      const dispatched = dispatchLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      result[p.itemName] = {
        prepared:  effectiveQty,
        dispatched,
        available: effectiveQty - dispatched,
        unit:      isPcs ? 'pcs' : 'kg',
      };
    });
    return result;
  }, [preparedItems, dispatchLog, packedEntries]);

  const allDispatched = preparedItems.length > 0 &&
    preparedItems.every(p => (stockByItem[p.itemName]?.available ?? 1) <= 0);

  const branchColor: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700 border-blue-200',
    SNB:   'bg-amber-100 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const handleDispatch = async (itemName: string, qty: number, branch: Branch, unit?: 'pcs' | 'kg') => {
    if (!currentUser) return;
    if (dispatchingItems.size > 0) return;
    setDispatchingItems(prev => new Set(prev).add(itemName));
    setDispatchError(null);
    try {
      await submitDispatch(order.id, {
        itemName,
        quantity: qty,
        unit: unit ?? 'kg',
        branch,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: currentUser.displayName,
      });
    } catch {
      setDispatchError('Dispatch failed — please try again.');
    } finally {
      setDispatchingItems(prev => { const s = new Set(prev); s.delete(itemName); return s; });
    }
  };

  const statusBadge = allDispatched
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : allConfirmed
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-purple-100 text-purple-700 border-purple-200';

  const statusLabel = allDispatched
    ? 'DISPATCHED'
    : allConfirmed
    ? 'READY TO DISPATCH'
    : 'PACKING';

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', statusBadge)}>
              {statusLabel}
            </span>
            {order.targetBranch && (
              <span className={cn(
                'text-[10px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1',
                branchColor[order.targetBranch]
              )}>
                🏪 {order.targetBranch}
              </span>
            )}
          </div>
          <p className="text-[11px] font-body text-muted-foreground">
            {preparedItems.map(p => {
              const orderItem = order.items.find(i => i.itemId === p.itemId);
              const unit = orderItem?.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
              return `${p.itemName} ×${p.quantityPrepared}${unit}`;
            }).join(', ')}
          </p>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {packedEntries.filter(e => e.confirmed).length}/{packedEntries.length} items confirmed packed
          </p>
        </div>
        {expanded
          ? <ChevronUp   className="size-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-5">

          {order.targetBranch && (
            <div className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5',
              branchColor[order.targetBranch],
            )}>
              <span className="text-base">🏪</span>
              <div>
                <p className="text-[10px] font-body font-bold uppercase opacity-70">Pack &amp; Dispatch For</p>
                <p className="text-sm font-display font-bold">{order.targetBranch}</p>
              </div>
            </div>
          )}

          {/* ── PHASE 1: Packing confirmation ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="size-4 text-primary" />
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">
                Step 1 — Confirm Packed Quantities
              </p>
            </div>
            <p className="text-[10px] font-body text-muted-foreground mb-3">
              Verify each item's packed quantity. Confirm all before dispatching.
            </p>

            <div className="space-y-2">
              {packedEntries.map((entry, idx) => (
                <div
                  key={entry.itemId}
                  className={cn(
                    'rounded-xl border p-3 transition-all',
                    entry.confirmed
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-border bg-muted/20',
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-body font-semibold text-foreground">
                        {entry.itemName}
                      </span>
                      {isCustomItem(entry.itemId) && (
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">✦ CUSTOM</span>
                      )}
                    </div>
                    {entry.confirmed
                      ? (
                        <button
                          onClick={() => unconfirmEntry(idx)}
                          className="flex items-center gap-1 text-[10px] font-body font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg hover:bg-emerald-200 transition-colors"
                        >
                          <CheckCircle2 className="size-3" /> Confirmed — Undo
                        </button>
                      ) : (
                        <button
                          onClick={() => confirmEntry(idx)}
                          disabled={entry.qty <= 0}
                          className="flex items-center gap-1 text-[10px] font-body font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle2 className="size-3" /> Confirm
                        </button>
                      )
                    }
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[10px] font-body text-muted-foreground shrink-0">
                      Packed qty (kg):
                    </label>
                    <input
                      type="number" min={0.01} step={0.25}
                      value={entry.qty}
                      onChange={e => updateEntryQty(idx, e.target.value)}
                      disabled={entry.confirmed}
                      className="w-24 h-8 px-2 rounded-lg border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-[10px] font-body text-muted-foreground">
                      kg · Baker prepared: {order.preparedItems?.find(p => p.itemId === entry.itemId)?.quantityPrepared ?? '—'} kg
                    </span>
                    <span className="text-[10px] font-body font-semibold text-blue-600">
                      · Receiver requested: {(() => {
                        const orderItem = order.items.find(i => i.itemId === entry.itemId);
                        if (!orderItem) return '—';
                        if (orderItem.dispatchUnit === 'pcs' && orderItem.originalPcs != null) {
                          return `${orderItem.originalPcs} pcs`;
                        }
                        return `${orderItem.quantity} kg`;
                      })()}
                    </span>
                  </div>
                  {entry.confirmed && entry.dispatchUnit === 'pcs' && entry.confirmedPcs != null && (
                    <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                      <span className="text-[11px] font-body font-bold text-blue-700">
                        ✓ {entry.qty} kg → <span className="text-emerald-700">{entry.confirmedPcs} pcs</span>
                      </span>
                      <span className="text-[10px] font-body text-blue-500 ml-1">
                        (ready to dispatch in pcs)
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {allConfirmed && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <Unlock className="size-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-body font-semibold text-emerald-700">
                  All items confirmed! Dispatch panel is now unlocked below.
                </p>
              </div>
            )}
            {!allConfirmed && (
              <div className="mt-3 flex items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2">
                <Lock className="size-4 text-muted-foreground shrink-0" />
                <p className="text-xs font-body text-muted-foreground">
                  Confirm all {packedEntries.length} item{packedEntries.length !== 1 ? 's' : ''} above to unlock dispatch.
                </p>
              </div>
            )}
          </div>

          {/* ── PHASE 2: Dispatch ── */}
          <div className={cn(
            'rounded-2xl border transition-all',
            allConfirmed ? 'border-emerald-200 bg-emerald-50/30' : 'border-border bg-muted/20 opacity-50 pointer-events-none select-none',
          )}>
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-2 mb-1">
                <Truck className={cn('size-4', allConfirmed ? 'text-emerald-600' : 'text-muted-foreground')} />
                <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">
                  Step 2 — Dispatch to Branches
                </p>
                {!allConfirmed && <Lock className="size-3 text-muted-foreground ml-auto" />}
              </div>
              <p className="text-[10px] font-body text-muted-foreground mb-2">
                Select quantity and branch for each item, then tap Send.
              </p>
            </div>

            <div className="px-4 pb-3">
              {preparedItems.map(p => {
                const stock    = stockByItem[p.itemName];
                const isCustom = isCustomItem(p.itemId);
                return (
                  <div key={p.itemId}>
                    {isCustom && (
                      <div className="pt-2 pb-0.5">
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">✦ CUSTOM</span>
                      </div>
                    )}
                    <DispatchRow
                      itemName={p.itemName}
                      available={stock?.available ?? 0}
                      onDispatch={async (qty, branch) => {
                        const entry = packedEntries.find(e => e.itemId === p.itemId);
                        const unit  = entry?.dispatchUnit ?? 'kg';
                        await handleDispatch(p.itemName, qty, branch, unit);
                      }}
                      submitting={dispatchingItems.size > 0}
                      defaultBranch={order.targetBranch}
                      unit={stock?.unit ?? 'kg'}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {dispatchError && (
            <p className="text-xs font-body text-destructive text-center">{dispatchError}</p>
          )}

          {/* ── Dispatch Log ── */}
          {dispatchLog.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Dispatch Log ({dispatchLog.length} entries)
              </p>
              <div className="space-y-1.5">
                {dispatchLog.map(d => (
                  <div key={d.id} className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-body font-semibold text-foreground">
                        {d.itemName} × {d.quantity} {d.unit ?? 'kg'}
                      </p>
                      <p className="text-[10px] font-body text-muted-foreground">
                        {new Date(d.dispatchedAt).toLocaleString('en-IN')} · {d.dispatchedBy}
                      </p>
                    </div>
                    <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border shrink-0', branchColor[d.branch])}>
                      {d.branch}
                    </span>
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {allDispatched && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-body font-semibold text-emerald-700">
                All stock dispatched for this order.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function PackingDashboard() {
  const { orders, fetchOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);

  // FIX: only show spinner on first load; background polls are silent
  // so PackingOrderCard components are never unmounted and packedEntries
  // confirmation state is preserved between polls.
  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const id = setInterval(() => fetchOrders(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const packingOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  const branchTotals: Record<Branch, number> = { VRSNB: 0, SNB: 0, Hosur: 0 };
  const today = new Date().toDateString();
  packingOrders.forEach(o =>
    (o.dispatchLog || []).forEach(d => {
      if (new Date(d.dispatchedAt).toDateString() === today)
        branchTotals[d.branch] = (branchTotals[d.branch] || 0) + d.quantity;
    })
  );

  const toPackCount     = packingOrders.filter(o => o.status === 'packed').length;
  const dispatchedCount = packingOrders.filter(o => o.status === 'dispatched').length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Packing</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">
            Confirm packed quantities · then dispatch to branches
          </p>
        </div>
        <div className="flex gap-2">
          {toPackCount > 0 && (
            <div className="bg-purple-100 border border-purple-200 text-purple-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
              {toPackCount} To Pack
            </div>
          )}
          {dispatchedCount > 0 && (
            <div className="bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
              {dispatchedCount} Done
            </div>
          )}
        </div>
      </div>

      {/* Today's branch dispatch summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {BRANCHES.map(b => (
          <div key={b} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="font-display font-bold text-lg tabular-nums">{branchTotals[b] || 0}</p>
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{b}</p>
            <p className="text-[9px] font-body text-muted-foreground">today</p>
          </div>
        ))}
      </div>

      {initialLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : packingOrders.length > 0 ? (
        <div className="space-y-3">
          {packingOrders.map(o => <PackingOrderCard key={o.id} order={o} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-muted-foreground gap-3">
          <Package className="size-10 opacity-20" />
          <p className="text-sm font-body">No items ready for packing yet</p>
        </div>
      )}
    </div>
  );
}
