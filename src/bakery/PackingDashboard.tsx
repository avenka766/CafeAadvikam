import { useState, useEffect, useMemo } from 'react';
import { Package, Loader2, ChevronDown, ChevronUp, Truck, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch } from './types';
import { cn } from '@/lib/utils';

function PackingOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitDispatch, deleteDispatchEntry } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const [expanded, setExpanded] = useState(order.status === 'packed');
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [qty, setQty] = useState('');
  const [branch, setBranch] = useState<Branch>('VRSNB');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const preparedItems = order.preparedItems || [];
  const dispatchLog = order.dispatchLog || [];
  const selectedPrepared = preparedItems[selectedItemIdx];

  // ── Stock calc: available = prepared - already dispatched for this item
  const stockByItem = useMemo(() => {
    const result: Record<string, { prepared: number; dispatched: number; available: number }> = {};
    preparedItems.forEach(p => {
      const dispatched = dispatchLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      result[p.itemName] = {
        prepared: p.quantityPrepared,
        dispatched,
        available: p.quantityPrepared - dispatched,
      };
    });
    return result;
  }, [preparedItems, dispatchLog]);

  const selectedStock = selectedPrepared ? stockByItem[selectedPrepared.itemName] : null;
  const qtyNum = Number(qty);
  const overStock = selectedStock ? qtyNum > selectedStock.available : false;
  const noStock = selectedStock ? selectedStock.available <= 0 : false;

  const branchColor: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700 border-blue-200',
    SNB:   'bg-amber-100 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const handleDispatch = async () => {
    if (!currentUser || !selectedPrepared || qtyNum <= 0) return;
    setSubmitting(true);
    await submitDispatch(order.id, {
      itemName: selectedPrepared.itemName,
      quantity: qtyNum,
      branch,
      dispatchedAt: new Date().toISOString(),
      dispatchedBy: currentUser.displayName,
    });
    setSubmitting(false);
    setQty('');
  };

  const handleDelete = async (entryId: string) => {
    setDeleting(entryId);
    await deleteDispatchEntry(order.id, entryId);
    setDeleting(null);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border',
              order.status === 'dispatched'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-purple-100 text-purple-700 border-purple-200')}>
              {order.status === 'dispatched' ? 'DISPATCHED' : 'READY TO PACK'}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground">
            {preparedItems.map(p => `${p.itemName} ×${p.quantityPrepared}`).join(', ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">

          {/* ── Stock Overview ─────────────────────────────── */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Stock Available</p>
            <div className="space-y-2">
              {preparedItems.map((p, idx) => {
                const stock = stockByItem[p.itemName];
                const pct = stock.prepared > 0 ? Math.round((stock.available / stock.prepared) * 100) : 0;
                const isSelected = idx === selectedItemIdx;
                return (
                  <button
                    key={p.itemId}
                    onClick={() => { setSelectedItemIdx(idx); setQty(''); }}
                    className={cn(
                      'w-full rounded-xl border p-3 text-left transition-all',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/40'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn('size-3.5 rounded-full border-2 flex items-center justify-center',
                          isSelected ? 'border-primary' : 'border-muted-foreground/40')}>
                          {isSelected && <span className="size-1.5 rounded-full bg-primary" />}
                        </span>
                        <span className="text-sm font-body font-semibold text-foreground">{p.itemName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {stock.available <= 0
                          ? <span className="text-[10px] font-body font-bold text-destructive flex items-center gap-1"><AlertTriangle className="size-3" /> Out of Stock</span>
                          : stock.available < stock.prepared * 0.2
                          ? <span className="text-[10px] font-body font-bold text-amber-600">Low Stock</span>
                          : <span className="text-[10px] font-body font-bold text-emerald-600">In Stock</span>
                        }
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          stock.available <= 0 ? 'bg-destructive'
                          : stock.available < stock.prepared * 0.2 ? 'bg-amber-400'
                          : 'bg-emerald-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-body text-muted-foreground">
                      <span>Prepared: <strong className="text-foreground">{stock.prepared}</strong></span>
                      <span>Dispatched: <strong className="text-destructive">{stock.dispatched}</strong></span>
                      <span>Available: <strong className={stock.available <= 0 ? 'text-destructive' : 'text-emerald-600'}>{stock.available}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Dispatch Form ──────────────────────────────── */}
          {selectedPrepared && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Dispatch — {selectedPrepared.itemName}
              </p>

              {/* Warning if out of stock */}
              {noStock && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 mb-2">
                  <AlertTriangle className="size-4 text-destructive shrink-0" />
                  <p className="text-[11px] font-body text-destructive font-semibold">No stock available for {selectedPrepared.itemName}</p>
                </div>
              )}

              <div className="flex gap-2 mb-2">
                <div className="w-24">
                  <input
                    type="number"
                    min={0.01}
                    step={0.25}
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    placeholder="Qty"
                    className={cn(
                      'w-full h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2',
                      overStock ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-primary/30'
                    )}
                  />
                </div>
                <select value={branch} onChange={e => setBranch(e.target.value as Branch)}
                  className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Over-stock warning */}
              {overStock && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                  <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-body text-amber-700 font-semibold">
                    Qty ({qtyNum}) exceeds available stock ({selectedStock?.available}). You can still dispatch but stock will go negative.
                  </p>
                </div>
              )}

              <button
                onClick={handleDispatch}
                disabled={submitting || !qty || qtyNum <= 0}
                className={cn(
                  'w-full h-11 rounded-xl text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50',
                  noStock ? 'bg-amber-500' : 'bg-emerald-600'
                )}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
                {noStock ? '⚠️ Force Dispatch to ' : 'Dispatch to '}{branch}
              </button>
            </div>
          )}

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
                        {d.itemName} × {d.quantity}
                      </p>
                      <p className="text-[10px] font-body text-muted-foreground">
                        {new Date(d.dispatchedAt).toLocaleString('en-IN')} · {d.dispatchedBy}
                      </p>
                    </div>
                    <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border shrink-0', branchColor[d.branch])}>
                      {d.branch}
                    </span>
                    {/* ✅ Delete button — restores stock on delete */}
                    <button
                      onClick={() => handleDelete(d.id)}
                      disabled={deleting === d.id}
                      title="Delete and restore stock"
                      className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {deleting === d.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-body text-muted-foreground mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Deleting a log entry restores the quantity back to available stock.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PackingDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();

  // ✅ Load data immediately on mount
  useEffect(() => { fetchOrders(); }, []);

  const packingOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  // Branch totals across all orders
  const branchTotals: Record<string, number> = {};
  packingOrders.forEach(o =>
    (o.dispatchLog || []).forEach(d => {
      branchTotals[d.branch] = (branchTotals[d.branch] || 0) + d.quantity;
    })
  );

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Packing</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Pack & dispatch to branches</p>
        </div>
        <div className="bg-purple-100 border border-purple-200 text-purple-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
          {orders.filter(o => o.status === 'packed').length} To Pack
        </div>
      </div>

      {/* Branch dispatch summary */}
      {Object.keys(branchTotals).length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {BRANCHES.map(b => (
            <div key={b} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="font-display font-bold text-lg tabular-nums">{branchTotals[b] || 0}</p>
              <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{b}</p>
              <p className="text-[9px] font-body text-muted-foreground">dispatched</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
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
