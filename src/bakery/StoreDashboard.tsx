import { useState, useEffect } from 'react';
import { Store, Calculator, ChevronDown, ChevronUp, ArrowRight, Loader2 } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { RECIPE_MAP, BAKERY_ITEMS } from './types';
import type { BakeryOrder, MaterialRequirement } from './types';
import { cn } from '@/lib/utils';

function calcMaterials(order: BakeryOrder, expectedOutput: number): MaterialRequirement[] {
  const aggregated: Record<string, MaterialRequirement> = {};
  for (const line of order.items) {
    const recipe = RECIPE_MAP[line.itemId];
    if (!recipe) continue;
    const units = expectedOutput > 0 ? expectedOutput : line.quantity;
    for (const mat of recipe) {
      const total = mat.quantity * units;
      if (aggregated[mat.material]) {
        aggregated[mat.material].quantity += total;
      } else {
        aggregated[mat.material] = { ...mat, quantity: total };
      }
    }
  }
  return Object.values(aggregated);
}

function OrderCard({ order }: { order: BakeryOrder }) {
  const { updateExpectedOutput, sendToBaker } = useBakeryStore();
  const [expanded, setExpanded] = useState(false);
  const [expectedQty, setExpectedQty] = useState(order.expectedOutput ?? 0);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const handleCalculate = async () => {
    setSaving(true);
    await updateExpectedOutput(order.id, expectedQty);
    setMaterials(calcMaterials(order, expectedQty));
    setSaving(false);
  };

  const handleSendToBaker = async () => {
    setSending(true);
    await sendToBaker(order.id);
    setSending(false);
  };

  useEffect(() => {
    if (order.expectedOutput && order.expectedOutput > 0) {
      setMaterials(calcMaterials(order, order.expectedOutput));
    }
  }, [order]);

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    processing: 'bg-blue-100 text-blue-700 border-blue-200',
    baking: 'bg-orange-100 text-orange-700 border-orange-200',
    packed: 'bg-purple-100 text-purple-700 border-purple-200',
    dispatched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
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
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', statusColor[order.status])}>
              {order.status.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground">
            {order.items.map(i => `${i.itemName}×${i.quantity}`).join(', ')}
          </p>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {new Date(order.createdAt).toLocaleString('en-IN')} · by {order.createdBy}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 space-y-3 pt-3">
          {/* Items */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Order Items</p>
            <div className="space-y-1">
              {order.items.map((item, i) => {
                const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
                return (
                  <div key={i} className="flex justify-between text-sm font-body">
                    <span className="text-foreground">{meta?.icon} {item.itemName}</span>
                    <span className="font-bold tabular-nums">× {item.quantity}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expected Output */}
          {order.status === 'pending' && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Expected Output Quantity</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={expectedQty || ''}
                  onChange={e => setExpectedQty(Number(e.target.value))}
                  placeholder="Total units to produce"
                  className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={handleCalculate}
                  disabled={!expectedQty || saving}
                  className="h-10 px-4 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Calculator className="size-3.5" />}
                  Calculate
                </button>
              </div>
            </div>
          )}

          {/* Materials List */}
          {materials.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Required Materials</p>
              <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
                {materials.map((mat, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-body text-foreground">{mat.material}</span>
                    <span className="text-sm font-body font-bold tabular-nums text-primary">
                      {mat.quantity.toLocaleString()} {mat.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send to Baker */}
          {order.status === 'pending' && materials.length > 0 && (
            <button
              onClick={handleSendToBaker}
              disabled={sending}
              className="w-full h-11 rounded-xl bg-orange-500 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Send to Baker
            </button>
          )}

          {order.status !== 'pending' && (
            <p className="text-[11px] font-body text-center text-muted-foreground">
              {order.status === 'baking' ? '🍞 Currently being baked' : order.status === 'packed' ? '📦 Packed, ready for dispatch' : '✅ Dispatched'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function StoreDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();

  useEffect(() => { fetchOrders(); }, []);

  const pending = orders.filter(o => o.status === 'pending');
  const active = orders.filter(o => ['baking', 'packed', 'dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Store Dashboard</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders & calculate materials</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-amber-100 border border-amber-200 text-amber-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
            {pending.length} Pending
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">New Orders</p>
              <div className="space-y-3">
                {pending.map(o => <OrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div>
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">In Progress / Done</p>
              <div className="space-y-3">
                {active.map(o => <OrderCard key={o.id} order={o} />)}
              </div>
            </div>
          )}

          {orders.length === 0 && (
            <div className="flex flex-col items-center py-20 text-muted-foreground gap-3">
              <Store className="size-10 opacity-20" />
              <p className="text-sm font-body">No orders yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
