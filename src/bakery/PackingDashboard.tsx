// src/bakery/PackingDashboard.tsx (Redesigned)
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Loader2, ChevronDown, ChevronUp, Truck,
  AlertTriangle, CheckCircle2, ClipboardCheck, Lock,
  BoxSelect, MapPin,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch, PreparedItem } from './types';
import { kgToPcs } from './itemMatcher';
import { cn } from '@/lib/utils';

interface PackedEntry {
  itemId:       string;
  itemName:     string;
  qty:          number;
  confirmed:    boolean;
  weightGrams?: number;
  dispatchUnit?: 'pcs' | 'kg';
  confirmedPcs?: number;
}

const BRANCH_META: Record<Branch, { color: string; bg: string; icon: string }> = {
  VRSNB: { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',    icon: '🏙️' },
  SNB:   { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',  icon: '🏪' },
  Hosur: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '🌿' },
};

// ─── Dispatch Row ─────────────────────────────────────────────────────────────
function DispatchRow({ itemName, available, onDispatch, submitting, defaultBranch, unit }: {
  itemName: string; available: number;
  onDispatch: (qty: number, branch: Branch) => Promise<void>;
  submitting: boolean; defaultBranch?: Branch; unit?: 'pcs' | 'kg';
}) {
  const [qty, setQty]       = useState('');
  const [branch, setBranch] = useState<Branch>(defaultBranch ?? 'VRSNB');
  const qtyNum  = parseFloat(qty) || 0;
  const overQty = qtyNum > available;
  const unitLabel = unit === 'pcs' ? 'pcs' : 'kg';

  const handle = async () => {
    if (qtyNum <= 0) return;
    await onDispatch(qtyNum, branch);
    setQty('');
  };

  return (
    <div className="space-y-2.5 py-3.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body font-semibold text-foreground">{itemName}</span>
        <span className={cn('text-xs font-body font-bold tabular-nums px-2 py-0.5 rounded-lg',
          available <= 0 ? 'text-red-700 bg-red-100' : 'text-emerald-700 bg-emerald-100')}>
          {available} {unitLabel}
        </span>
      </div>
      <div className="flex gap-2 items-center">
        <input type="number" min={0.01} step={unit === 'pcs' ? 1 : 0.25}
          placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)}
          className={cn(
            'w-20 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2',
            overQty ? 'border-red-400 focus:ring-red-200' : 'border-border focus:ring-primary/30'
          )} />
        <span className="text-[10px] font-body font-bold text-muted-foreground">{unitLabel}</span>
        <select value={branch} onChange={e => setBranch(e.target.value as Branch)}
          className="flex-1 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
          {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_META[b].icon} {b}</option>)}
        </select>
        <button onClick={handle} disabled={submitting || qtyNum <= 0 || available <= 0}
          className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-body font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all shrink-0 shadow-sm">
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
          Send
        </button>
      </div>
      {overQty && (
        <p className="text-[10px] font-body text-amber-600 flex items-center gap-1">
          <AlertTriangle className="size-3" /> Exceeds available stock
        </p>
      )}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function PackingOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitDispatch } = useBakeryStore();
  const { currentUser }   = useAuthStore();

  const [expanded,         setExpanded]         = useState(order.status === 'packed');
  const [dispatchingItems, setDispatchingItems] = useState<Set<string>>(new Set());
  const [dispatchError,    setDispatchError]    = useState<string | null>(null);

  const initialised = useRef(false);
  const [packedEntries, setPackedEntries] = useState<PackedEntry[]>([]);
  useEffect(() => {
    if (!initialised.current && order.preparedItems?.length) {
      setPackedEntries(order.preparedItems.map(p => {
        const oi = order.items.find(i => i.itemId === p.itemId);
        return { itemId: p.itemId, itemName: p.itemName, qty: p.quantityPrepared, confirmed: false, weightGrams: oi?.weightGrams, dispatchUnit: oi?.dispatchUnit ?? 'kg' };
      }));
      initialised.current = true;
    }
  }, [order.preparedItems, order.items]);

  const isCustomItem  = (itemId: string) => order.items.find(i => i.itemId === itemId)?.isCustom ?? false;
  const allConfirmed  = packedEntries.length > 0 && packedEntries.every(e => e.confirmed);
  const confirmedCount = packedEntries.filter(e => e.confirmed).length;

  const confirmEntry   = (idx: number) => setPackedEntries(prev => prev.map((e, i) => {
    if (i !== idx) return e;
    const confirmedPcs = e.dispatchUnit === 'pcs' && e.weightGrams != null ? kgToPcs(e.qty, e.weightGrams) ?? undefined : undefined;
    return { ...e, confirmed: true, confirmedPcs };
  }));
  const unconfirmEntry = (idx: number) => setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, confirmed: false, confirmedPcs: undefined } : e));
  const updateEntryQty = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, qty: n, confirmed: false } : e));
  };

  const preparedItems = order.preparedItems || [];
  const dispatchLog   = order.dispatchLog   || [];

  const stockByItem = useMemo(() => {
    const r: Record<string, { prepared: number; dispatched: number; available: number; unit: 'pcs'|'kg' }> = {};
    preparedItems.forEach(p => {
      const entry      = packedEntries.find(e => e.itemId === p.itemId);
      const isPcs      = entry?.dispatchUnit === 'pcs';
      const effectiveQty = isPcs && entry?.confirmedPcs != null ? entry.confirmedPcs : p.quantityPrepared;
      const dispatched = dispatchLog.filter(d => d.itemName === p.itemName).reduce((s, d) => s + d.quantity, 0);
      r[p.itemName] = { prepared: effectiveQty, dispatched, available: effectiveQty - dispatched, unit: isPcs ? 'pcs' : 'kg' };
    });
    return r;
  }, [preparedItems, dispatchLog, packedEntries]);

  const allDispatched = preparedItems.length > 0 && preparedItems.every(p => (stockByItem[p.itemName]?.available ?? 1) <= 0);

  const handleDispatch = async (itemName: string, qty: number, branch: Branch, unit?: 'pcs'|'kg') => {
    if (!currentUser || dispatchingItems.size > 0) return;
    setDispatchingItems(prev => new Set(prev).add(itemName));
    setDispatchError(null);
    try {
      await submitDispatch(order.id, { itemName, quantity: qty, unit: unit ?? 'kg', branch, dispatchedAt: new Date().toISOString(), dispatchedBy: currentUser.displayName });
    } catch {
      setDispatchError('Dispatch failed — please try again.');
    } finally {
      setDispatchingItems(prev => { const s = new Set(prev); s.delete(itemName); return s; });
    }
  };

  // Status
  const statusLabel = allDispatched ? 'DISPATCHED' : allConfirmed ? 'READY' : 'PACKING';
  const statusStyle = allDispatched
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : allConfirmed
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-purple-100 text-purple-700 border-purple-200';

  const branchMeta = order.targetBranch ? BRANCH_META[order.targetBranch] : null;

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      allDispatched ? 'border-border bg-card opacity-70' : 'border-border bg-card shadow-sm'
    )}>
      {/* Header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20" onClick={() => setExpanded(v => !v)}>
        <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0 text-lg',
          allDispatched ? 'bg-emerald-100' : allConfirmed ? 'bg-blue-100' : 'bg-purple-100')}>
          {allDispatched ? '✓' : allConfirmed ? '📦' : '🏷️'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', statusStyle)}>{statusLabel}</span>
            {branchMeta && (
              <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1', branchMeta.bg, branchMeta.color)}>
                {branchMeta.icon} {order.targetBranch}
              </span>
            )}
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {confirmedCount}/{packedEntries.length} confirmed · {preparedItems.map(p => p.itemName).join(', ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-5">

          {/* Branch banner */}
          {branchMeta && (
            <div className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5', branchMeta.bg)}>
              <MapPin className={cn('size-3.5 shrink-0', branchMeta.color)} />
              <div>
                <p className="text-[10px] font-body font-bold uppercase opacity-60">Dispatch for</p>
                <p className={cn('text-sm font-display font-bold', branchMeta.color)}>{order.targetBranch}</p>
              </div>
            </div>
          )}

          {/* Step 1: Confirm packing */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="size-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary-foreground">1</span>
              </div>
              <p className="text-xs font-body font-bold text-foreground">Confirm Packed Quantities</p>
            </div>
            <div className="space-y-2">
              {packedEntries.map((entry, idx) => (
                <div key={entry.itemId} className={cn(
                  'rounded-xl border p-3.5 transition-all',
                  entry.confirmed ? 'border-emerald-200 bg-emerald-50/60' : 'border-border bg-muted/20'
                )}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-body font-semibold text-foreground">{entry.itemName}</span>
                      {isCustomItem(entry.itemId) && (
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">CUSTOM</span>
                      )}
                    </div>
                    {entry.confirmed
                      ? <button onClick={() => unconfirmEntry(idx)} className="text-[10px] font-body font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95">
                          <CheckCircle2 className="size-3" /> Undo
                        </button>
                      : <button onClick={() => confirmEntry(idx)} disabled={entry.qty <= 0}
                          className="text-[10px] font-body font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 disabled:opacity-40">
                          <CheckCircle2 className="size-3" /> Confirm
                        </button>
                    }
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min={0.01} step={0.25} value={entry.qty}
                      onChange={e => updateEntryQty(idx, e.target.value)} disabled={entry.confirmed}
                      className="w-24 h-9 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50" />
                    <span className="text-[10px] font-body text-muted-foreground">kg packed</span>
                    <span className="text-[10px] font-body text-blue-600">
                      · Baker: {order.preparedItems?.find(p => p.itemId === entry.itemId)?.quantityPrepared ?? '—'} kg
                    </span>
                    <span className="text-[10px] font-body text-muted-foreground">
                      · Requested: {(() => {
                        const oi = order.items.find(i => i.itemId === entry.itemId);
                        if (!oi) return '—';
                        return oi.dispatchUnit === 'pcs' && oi.originalPcs != null ? `${oi.originalPcs} pcs` : `${oi.quantity} kg`;
                      })()}
                    </span>
                  </div>
                  {entry.confirmed && entry.dispatchUnit === 'pcs' && entry.confirmedPcs != null && (
                    <div className="mt-2 flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-200">
                      <span className="text-[11px] font-body font-bold text-blue-700">
                        {entry.qty} kg → <span className="text-emerald-700">{entry.confirmedPcs} pcs</span>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Lock/unlock indicator */}
            <div className={cn(
              'mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5',
              allConfirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/40 border-border'
            )}>
              {allConfirmed
                ? <><CheckCircle2 className="size-4 text-emerald-600 shrink-0" /><p className="text-xs font-body font-semibold text-emerald-700">All confirmed — dispatch unlocked!</p></>
                : <><Lock className="size-4 text-muted-foreground shrink-0" /><p className="text-xs font-body text-muted-foreground">Confirm all {packedEntries.length} items to unlock dispatch</p></>
              }
            </div>
          </div>

          {/* Step 2: Dispatch */}
          <div className={cn('rounded-2xl border transition-all',
            allConfirmed ? 'border-emerald-200 bg-emerald-50/20' : 'border-border/50 bg-muted/20 opacity-40 pointer-events-none select-none')}>
            <div className="px-4 pt-3.5 pb-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('size-6 rounded-full flex items-center justify-center shrink-0', allConfirmed ? 'bg-emerald-600' : 'bg-muted')}>
                  <span className="text-[10px] font-bold text-white">2</span>
                </div>
                <p className="text-xs font-body font-bold text-foreground">Dispatch to Branches</p>
                {!allConfirmed && <Lock className="size-3 text-muted-foreground ml-auto" />}
              </div>
              <p className="text-[10px] font-body text-muted-foreground mb-2 pl-8">Enter quantity, select branch, tap Send</p>
            </div>
            <div className="px-4 pb-3">
              {preparedItems.map(p => {
                const stock = stockByItem[p.itemName];
                return (
                  <div key={p.itemId}>
                    {isCustomItem(p.itemId) && (
                      <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 inline-block mb-1">CUSTOM</span>
                    )}
                    <DispatchRow itemName={p.itemName} available={stock?.available ?? 0}
                      onDispatch={async (qty, branch) => {
                        const entry = packedEntries.find(e => e.itemId === p.itemId);
                        await handleDispatch(p.itemName, qty, branch, entry?.dispatchUnit ?? 'kg');
                      }}
                      submitting={dispatchingItems.size > 0}
                      defaultBranch={order.targetBranch} unit={stock?.unit ?? 'kg'} />
                  </div>
                );
              })}
            </div>
          </div>

          {dispatchError && <p className="text-xs font-body text-destructive text-center">{dispatchError}</p>}

          {/* Dispatch log */}
          {dispatchLog.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Dispatch Log</p>
              <div className="space-y-1.5">
                {dispatchLog.map(d => {
                  const bm = BRANCH_META[d.branch];
                  return (
                    <div key={d.id} className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-body font-semibold text-foreground">{d.itemName} × {d.quantity} {d.unit ?? 'kg'}</p>
                        <p className="text-[10px] font-body text-muted-foreground">{new Date(d.dispatchedAt).toLocaleString('en-IN')} · {d.dispatchedBy}</p>
                      </div>
                      <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border shrink-0', bm.bg, bm.color)}>
                        {bm.icon} {d.branch}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allDispatched && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-body font-semibold text-emerald-700">All stock dispatched for this order ✓</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PackingDashboard() {
  const { orders, fetchOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const id = setInterval(() => fetchOrders(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const packingOrders   = orders.filter(o => ['packed','dispatched'].includes(o.status));
  const toPackCount     = packingOrders.filter(o => o.status === 'packed').length;
  const dispatchedCount = packingOrders.filter(o => o.status === 'dispatched').length;

  const today = new Date().toDateString();
  const branchTotals: Record<Branch, number> = { VRSNB: 0, SNB: 0, Hosur: 0 };
  packingOrders.forEach(o => (o.dispatchLog || []).forEach(d => {
    if (new Date(d.dispatchedAt).toDateString() === today)
      branchTotals[d.branch] = (branchTotals[d.branch] || 0) + d.quantity;
  }));

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
            <h1 className="font-display text-2xl font-bold text-foreground">Packing</h1>
          </div>
          <div className="flex gap-2 mt-1">
            {toPackCount > 0 && (
              <span className="bg-purple-100 border border-purple-200 text-purple-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
                {toPackCount} to pack
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats — branch dispatch today */}
      <div className="px-4 grid grid-cols-3 gap-2 mb-5">
        {BRANCHES.map(b => {
          const bm = BRANCH_META[b];
          return (
            <div key={b} className={cn('border rounded-2xl p-3 text-center', branchTotals[b] > 0 ? bm.bg : 'bg-card border-border')}>
              <p className="text-base leading-none mb-1">{bm.icon}</p>
              <p className={cn('font-display text-xl font-bold tabular-nums', branchTotals[b] > 0 ? bm.color : 'text-muted-foreground')}>
                {branchTotals[b] || 0}
              </p>
              <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{b} today</p>
            </div>
          );
        })}
      </div>

      {initialLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-xs font-body text-muted-foreground">Loading…</p>
        </div>
      ) : packingOrders.length > 0 ? (
        <div className="px-4 space-y-3">
          {/* Active packing first */}
          {toPackCount > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BoxSelect className="size-3.5 text-purple-500" />
                <p className="text-xs font-body font-bold text-muted-foreground uppercase">Ready to Pack</p>
              </div>
              {packingOrders.filter(o => o.status === 'packed').map(o => <PackingOrderCard key={o.id} order={o} />)}
            </div>
          )}
          {dispatchedCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <p className="text-xs font-body font-bold text-muted-foreground uppercase">Dispatched</p>
              </div>
              {packingOrders.filter(o => o.status === 'dispatched').map(o => <PackingOrderCard key={o.id} order={o} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center py-24 gap-4 px-4">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
            <Package className="size-10 text-muted-foreground opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-body font-semibold text-foreground">Nothing to pack yet</p>
            <p className="text-xs font-body text-muted-foreground mt-1">Items appear here once the baker sends them</p>
          </div>
        </div>
      )}
    </div>
  );
}
