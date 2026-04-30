import { useState, useEffect } from 'react';
import { ChefHat, Send, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BAKERY_ITEMS } from './types';
import type { PreparedItem } from './types';
import { cn } from '@/lib/utils';

function BakerOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitPrepared } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const [expanded, setExpanded] = useState(true);
  const [prepQty, setPrepQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(order.status === 'packed');

  const handleSend = async () => {
    setSubmitting(true);
    const preparedItems: PreparedItem[] = order.items.map(item => ({
      itemId: item.itemId,
      itemName: item.itemName,
      quantityPrepared: prepQty[item.itemId] ?? item.quantity,
      preparedAt: new Date().toISOString(),
    }));
    await submitPrepared(order.id, preparedItems);
    setSubmitting(false);
    setDone(true);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            {done && <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">SENT TO PACKING</span>}
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5">
            {order.items.map(i => `${i.itemName}×${i.quantity}`).join(', ')}
          </p>
          {order.expectedOutput && (
            <p className="text-[10px] font-body text-primary mt-0.5">Expected output: {order.expectedOutput} units</p>
          )}
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && !done && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">Enter Prepared Quantity</p>
          {order.items.map(item => {
            const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
            return (
              <div key={item.itemId} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-body font-semibold text-foreground">{meta?.icon} {item.itemName}</p>
                  <p className="text-[10px] font-body text-muted-foreground">Ordered: {item.quantity}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={prepQty[item.itemId] ?? item.quantity}
                  onChange={e => setPrepQty(prev => ({ ...prev, [item.itemId]: Number(e.target.value) }))}
                  className="w-20 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            );
          })}
          <button
            onClick={handleSend}
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-orange-500 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send to Packing
          </button>
        </div>
      )}

      {expanded && done && order.preparedItems && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Prepared Summary</p>
          <div className="space-y-1">
            {order.preparedItems.map((p, i) => (
              <div key={i} className="flex justify-between text-sm font-body">
                <span className="text-foreground">{p.itemName}</span>
                <span className="font-bold text-emerald-600">{p.quantityPrepared} prepared</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-2">
            Sent at {order.sentToPackingAt ? new Date(order.sentToPackingAt).toLocaleString('en-IN') : '—'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function BakerDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();

  useEffect(() => { fetchOrders(); }, []);

  const bakingOrders = orders.filter(o => o.status === 'baking');
  const doneOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Baker Dashboard</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Prepare items & send to Packing</p>
        </div>
        <div className="bg-orange-100 border border-orange-200 text-orange-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
          {bakingOrders.length} To Bake
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {bakingOrders.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">Ready to Bake</p>
              <div className="space-y-3">
                {bakingOrders.map(o => <BakerOrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}
          {doneOrders.length > 0 && (
            <div>
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">Completed</p>
              <div className="space-y-3">
                {doneOrders.map(o => <BakerOrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}
          {bakingOrders.length === 0 && doneOrders.length === 0 && (
            <div className="flex flex-col items-center py-20 text-muted-foreground gap-3">
              <ChefHat className="size-10 opacity-20" />
              <p className="text-sm font-body">No orders assigned to baker yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
