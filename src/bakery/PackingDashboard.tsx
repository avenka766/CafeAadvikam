import { useState, useEffect, useMemo } from 'react';
import {
  Package, Loader2, ChevronDown, ChevronUp, Truck,
  AlertTriangle, CheckCircle2, ClipboardCheck, Lock, Unlock,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch, PreparedItem } from './types';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PackedEntry {
  itemId:   string;
  itemName: string;
  qty:      number;
  confirmed: boolean;
}

// ─── Per-item dispatch row inside Dispatch Panel ────────────────────────────
function DispatchRow({\n  itemName, available, onDispatch, submitting, defaultBranch, unit,\n}: {\n  itemName:      string;\n  available:     number;\n  onDispatch:    (qty: number, branch: Branch) => Promise<void>;\n  submitting:    boolean;\n  defaultBranch?: Branch;\n  unit?: 'pcs' | 'kg';\n}) {
  const [qty, setQty] = useState('');\n  const branch = defaultBranch ?? 'VRSNB';\n  const qtyNum  = parseFloat(qty) || 0;\n  const overQty = qtyNum > available;\n  const unitLabel = unit === 'pcs' ? 'pcs' : 'kg';

  const handle = async () => {\n    if (qtyNum <= 0) return;\n    await onDispatch(qtyNum, branch);\n    setQty('');\n  };\n\n  return (\n    <div className=\"space-y-2 py-3 border-b border-border last:border-0\">\n      <div className=\"flex items-center justify-between\">\n        <span className=\"text-sm font-body font-semibold text-foreground\">{itemName}</span>\n        <span className={cn(\n          'text-xs font-body font-bold',\n          available <= 0 ? 'text-destructive' : 'text-emerald-600',\n        )}>\n          {available} {unitLabel} available\n        </span>\n      </div>\n      <div className=\"flex gap-2\">\n        <div className=\"relative flex items-center\">\n          <input\n            type=\"number\" min={0.01} step={unit === 'pcs' ? 1 : 0.25} placeholder=\"Qty\"\n            value={qty} onChange={e => setQty(e.target.value)}\n            className={cn(\n              'w-24 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2',\n              overQty ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-primary/30',\n            )}\n          />\n          <span className=\"absolute -bottom-4 left-0 right-0 text-center text-[9px] font-body font-bold text-muted-foreground\">\n            {unitLabel}\n          </span>\n        </div>\n        <div className=\"flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm font-body font-semibold flex items-center\">\n          🏪 {branch}\n        </div>\n        <button\n          onClick={handle}\n          disabled={submitting || qtyNum <= 0 || available <= 0}\n          className=\"h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-body font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all shrink-0\"\n        >\n          {submitting ? <Loader2 className=\"size-3.5 animate-spin\" /> : <Truck className=\"size-3.5\" />}\n          Send\n        </button>\n      </div>\n      {overQty && (\n        <p className=\"text-[10px] font-body text-amber-600 flex items-center gap-1 mt-4\">\n          <AlertTriangle className=\"size-3\" /> Exceeds available stock\n        </p>\n      )}\n    </div>\n  );\n}

// ─── Single order card ──────────────────────────────────────────────────────
function PackingOrderCard({
  order,
}: {
  order: ReturnType<typeof useBakeryStore.getState>['orders'][0];
}) {
  const { submitDispatch } = useBakeryStore();
  const { currentUser } = useAuthStore();

  const [expanded,  setExpanded]  = useState(order.status === 'packed');
  const [dispatchingItems, setDispatchingItems] = useState<Set<string>>(new Set());

  // ── Phase 1: Pack confirmation state ──────────────────────────────────────
  // Pre-populate from preparedItems (set by baker)
  const [packedEntries, setPackedEntries] = useState<PackedEntry[]>(() =>
    (order.preparedItems || []).map(p => ({
      itemId:    p.itemId,
      itemName:  p.itemName,
      qty:       p.quantityPrepared,
      confirmed: false,
    }))
  );

  // Look up isCustom from original order items
  const isCustomItem = (itemId: string) =>
    order.items.find(i => i.itemId === itemId)?.isCustom ?? false;

  const allConfirmed = packedEntries.length > 0 && packedEntries.every(e => e.confirmed);

  const confirmEntry = (idx: number) => {
    setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, confirmed: true } : e));
  };
  const unconfirmEntry = (idx: number) => {
    setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, confirmed: false } : e));
  };
  const updateEntryQty = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) {
      setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, qty: n, confirmed: false } : e));
    }
  };

  // ── Phase 2: Dispatch ─────────────────────────────────────────────────────
  const preparedItems = order.preparedItems || [];
  const dispatchLog   = order.dispatchLog   || [];

  const stockByItem = useMemo(() => {
    const result: Record<string, { prepared: number; dispatched: number; available: number }> = {};
    preparedItems.forEach(p => {
      const dispatched = dispatchLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      result[p.itemName] = {
        prepared:   p.quantityPrepared,
        dispatched,
        available:  p.quantityPrepared - dispatched,
      };
    });
    return result;
  }, [preparedItems, dispatchLog]);

  const allDispatched = preparedItems.length > 0 &&
    preparedItems.every(p => (stockByItem[p.itemName]?.available ?? 1) <= 0);

  const branchColor: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700 border-blue-200',
    SNB:   'bg-amber-100 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const handleDispatch = async (itemName: string, qty: number, branch: Branch, unit?: 'pcs' | 'kg') => {
    if (!currentUser) return;
    // Block if any dispatch for this order is already in-flight (prevents race conditions)
    if (dispatchingItems.size > 0) return;
    setDispatchingItems(prev => new Set(prev).add(itemName));
    await submitDispatch(order.id, {
      itemName,
      quantity: qty,
      unit: unit ?? 'kg',
      branch,
      dispatchedAt: new Date().toISOString(),
      dispatchedBy: currentUser.displayName,
    });
    setDispatchingItems(prev => { const s = new Set(prev); s.delete(itemName); return s; });
  };

  // Status badge
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
      {/* Header */}
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

          {/* ── TARGET BRANCH BANNER ─────────────────────────── */}
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

          {/* ── PHASE 1: Packing confirmation ────────────────── */}
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
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-body text-muted-foreground shrink-0">
                      Packed qty:
                    </label>
                    <input
                      type="number" min={0.01} step={0.25}
                      value={entry.qty}
                      onChange={e => updateEntryQty(idx, e.target.value)}
                      disabled={entry.confirmed}
                      className="w-24 h-8 px-2 rounded-lg border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-[10px] font-body font-bold text-blue-600">
                      {(() => {
                        const orderItem = order.items.find(i => i.itemId === entry.itemId);
                        return orderItem?.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
                      })()}
                    </span>
                    <span className="text-[10px] font-body text-muted-foreground">
                      Baker prepared: {order.preparedItems?.find(p => p.itemId === entry.itemId)?.quantityPrepared ?? '—'}
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
                </div>
              ))}
            </div>

            {/* All confirmed banner */}
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

          {/* ── PHASE 2: Dispatch (locked until all confirmed) ── */}
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
                const stock = stockByItem[p.itemName];
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
                      onDispatch={(qty, branch) => handleDispatch(p.itemName, qty, branch, p.dispatchUnit ?? order.items.find(i => i.itemId === p.itemId)?.dispatchUnit ?? 'kg')}
                      submitting={dispatchingItems.size > 0}
                      defaultBranch={order.targetBranch}
                      unit={p.dispatchUnit ?? order.items.find(i => i.itemId === p.itemId)?.dispatchUnit ?? 'kg'}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Dispatch Log ───────────────────────────────── */}
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

          {/* All dispatched */}
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

// ─── Main dashboard ─────────────────────────────────────────────────────────
export default function PackingDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();
  useEffect(() => { fetchOrders(); }, []);

  const packingOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  // Today's dispatch totals per branch
  const branchTotals: Record<Branch, number> = { VRSNB: 0, SNB: 0, Hosur: 0 };
  const today = new Date().toDateString();
  packingOrders.forEach(o =>
    (o.dispatchLog || []).forEach(d => {
      if (new Date(d.dispatchedAt).toDateString() === today)
        branchTotals[d.branch] = (branchTotals[d.branch] || 0) + d.quantity;
    })
  );

  const toPackCount      = packingOrders.filter(o => o.status === 'packed').length;
  const dispatchedCount  = packingOrders.filter(o => o.status === 'dispatched').length;

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

      {loading ? (
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
