import { useState, useEffect } from 'react';
import { Package, Send, Loader2, ChevronDown, ChevronUp, Truck } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch } from './types';
import { cn } from '@/lib/utils';

function PackingOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitDispatch } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const [expanded, setExpanded] = useState(order.status === 'packed');
  const [selectedItem, setSelectedItem] = useState(order.preparedItems?.[0]?.itemName || '');
  const [qty, setQty] = useState(1);
  const [branch, setBranch] = useState<Branch>('VRSNB');
  const [submitting, setSubmitting] = useState(false);

  const handleDispatch = async () => {
    if (!currentUser || !selectedItem || qty < 1) return;
    setSubmitting(true);
    await submitDispatch(order.id, {
      itemName: selectedItem,
      quantity: qty,
      branch,
      dispatchedAt: new Date().toISOString(),
      dispatchedBy: currentUser.displayName,
    });
    setSubmitting(false);
    setQty(1);
  };

  const branchColor: Record<Branch, string> = {
    VRSNB: 'bg-blue-100 text-blue-700 border-blue-200',
    SNB: 'bg-amber-100 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border',
              order.status === 'dispatched' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-purple-100 text-purple-700 border-purple-200'
            )}>
              {order.status === 'dispatched' ? 'DISPATCHED' : 'PACKED'}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground">
            {order.preparedItems?.map(p => `${p.itemName}×${p.quantityPrepared}`).join(', ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Prepared items */}
          {order.preparedItems && order.preparedItems.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Prepared Items</p>
              <div className="bg-muted/40 rounded-xl divide-y divide-border/40">
                {order.preparedItems.map((p, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm font-body">
                    <span>{p.itemName}</span>
                    <span className="font-bold">{p.quantityPrepared} units</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dispatch form */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Dispatch to Branch</p>
            <div className="space-y-2">
              <select
                value={selectedItem}
                onChange={e => setSelectedItem(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {order.preparedItems?.map(p => (
                  <option key={p.itemId} value={p.itemName}>{p.itemName}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Number(e.target.value))}
                  placeholder="Qty"
                  className="w-24 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select
                  value={branch}
                  onChange={e => setBranch(e.target.value as Branch)}
                  className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <button
                onClick={handleDispatch}
                disabled={submitting || !selectedItem}
                className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
                Dispatch to {branch}
              </button>
            </div>
          </div>

          {/* Dispatch log */}
          {order.dispatchLog && order.dispatchLog.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Dispatch Log</p>
              <div className="space-y-1.5">
                {order.dispatchLog.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-[11px] font-body font-semibold text-foreground">{d.itemName} × {d.quantity}</p>
                      <p className="text-[10px] font-body text-muted-foreground">{new Date(d.dispatchedAt).toLocaleString('en-IN')}</p>
                    </div>
                    <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', branchColor[d.branch])}>
                      {d.branch}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PackingDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();

  useEffect(() => { fetchOrders(); }, []);

  const packingOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  // Summary stats
  const totalDispatched = packingOrders.reduce((sum, o) => sum + (o.dispatchLog?.length || 0), 0);
  const branchCount: Record<string, number> = {};
  packingOrders.forEach(o => o.dispatchLog?.forEach(d => { branchCount[d.branch] = (branchCount[d.branch] || 0) + d.quantity; }));

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Packing</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Pack items & dispatch to branches</p>
        </div>
        <div className="bg-purple-100 border border-purple-200 text-purple-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
          {orders.filter(o => o.status === 'packed').length} To Pack
        </div>
      </div>

      {/* Branch summary */}
      {Object.keys(branchCount).length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {BRANCHES.map(b => (
            <div key={b} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className="font-display font-bold text-lg tabular-nums">{branchCount[b] || 0}</p>
              <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{b}</p>
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
