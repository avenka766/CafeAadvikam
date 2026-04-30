import { useState, useEffect } from 'react';
import { Store, Calculator, ChevronDown, ChevronUp, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { RECIPE_MAP, BAKERY_ITEMS } from './types';
import type { BakeryOrder, MaterialRequirement } from './types';
import { cn } from '@/lib/utils';

// Calculate materials for a single item at given quantity
function calcItemMaterials(itemId: string, qty: number): MaterialRequirement[] {
  const recipe = RECIPE_MAP[itemId];
  if (!recipe || qty <= 0) return [];
  return recipe.map(mat => ({ ...mat, quantity: mat.quantity * qty }));
}

function OrderCard({ order }: { order: BakeryOrder }) {
  const { updateExpectedOutput, sendToBaker } = useBakeryStore();

  // Per-item state: which item is selected and its qty (auto from order)
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [itemQtys, setItemQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(order.items.map(i => [i.itemId, i.quantity]))
  );
  const [calculatedMaterials, setCalculatedMaterials] = useState<MaterialRequirement[]>([]);
  const [calculatedForItem, setCalculatedForItem] = useState<string>('');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(order.status !== 'pending');

  const selectedItem = order.items[selectedItemIdx];
  const selectedMeta = selectedItem ? BAKERY_ITEMS.find(b => b.id === selectedItem.itemId) : null;

  const handleCalculate = async () => {
    if (!selectedItem) return;
    setSaving(true);
    const qty = itemQtys[selectedItem.itemId] ?? selectedItem.quantity;
    await updateExpectedOutput(order.id, qty);
    setCalculatedMaterials(calcItemMaterials(selectedItem.itemId, qty));
    setCalculatedForItem(selectedItem.itemName);
    setSaving(false);
  };

  const handleSendToBaker = async () => {
    setSending(true);
    await sendToBaker(order.id);
    setSending(false);
    setSent(true);
  };

  const statusColor: Record<string, string> = {
    pending:    'bg-amber-100 text-amber-700 border-amber-200',
    baking:     'bg-orange-100 text-orange-700 border-orange-200',
    packed:     'bg-purple-100 text-purple-700 border-purple-200',
    dispatched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const statusLabel: Record<string, string> = {
    pending: 'NEW', baking: 'BAKING', packed: 'PACKED', dispatched: 'DISPATCHED',
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header row */}
      <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', statusColor[order.status] || statusColor.pending)}>
              {statusLabel[order.status] || order.status}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground">
            {order.items.map(i => `${i.itemName} ×${i.quantity}`).join(', ')}
          </p>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {order.createdBy.split(' | ')[0]} · {new Date(order.createdAt).toLocaleString('en-IN')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">

          {/* Step 1: Select item from this order */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
              Step 1 — Select Item to Calculate
            </p>
            <div className="space-y-1.5">
              {order.items.map((item, idx) => {
                const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
                const isSelected = idx === selectedItemIdx;
                return (
                  <button
                    key={item.itemId}
                    onClick={() => { setSelectedItemIdx(idx); setCalculatedMaterials([]); setCalculatedForItem(''); }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-muted/30 hover:border-primary/40'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('size-4 rounded-full border-2 flex items-center justify-center shrink-0',
                        isSelected ? 'border-primary' : 'border-muted-foreground/40')}>
                        {isSelected && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      <span className="text-sm font-body font-semibold text-foreground">
                        {meta?.icon} {item.itemName}
                      </span>
                    </div>
                    <span className="text-xs font-body font-bold text-primary">×{item.quantity} ordered</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Qty (auto-populated, editable) */}
          {selectedItem && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Step 2 — Quantity to Produce ({selectedMeta?.name})
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    min={1}
                    value={itemQtys[selectedItem.itemId] ?? selectedItem.quantity}
                    onChange={e => setItemQtys(prev => ({ ...prev, [selectedItem.itemId]: Number(e.target.value) }))}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-[10px] font-body text-muted-foreground mt-1">
                    Auto-filled from order ({selectedItem.quantity} ordered). Edit if needed.
                  </p>
                </div>
                <button
                  onClick={handleCalculate}
                  disabled={saving || !selectedItem}
                  className="h-10 px-4 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all shrink-0"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Calculator className="size-3.5" />}
                  Calculate
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Materials result */}
          {calculatedMaterials.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Materials Needed — {calculatedForItem} ×{itemQtys[selectedItem?.itemId || ''] ?? selectedItem?.quantity}
              </p>
              <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
                {calculatedMaterials.map((mat, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-body text-foreground">{mat.material}</span>
                    <span className="text-sm font-body font-bold tabular-nums text-primary">
                      {mat.quantity.toLocaleString('en-IN')} {mat.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send to Baker */}
          {order.status === 'pending' && !sent && (
            <button
              onClick={handleSendToBaker}
              disabled={sending}
              className="w-full h-11 rounded-xl bg-orange-500 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Send to Baker
            </button>
          )}

          {(order.status !== 'pending' || sent) && (
            <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-orange-50 border border-orange-200">
              <CheckCircle2 className="size-4 text-orange-500" />
              <p className="text-sm font-body font-semibold text-orange-700">
                {order.status === 'baking' ? 'Sent to Baker — currently baking'
                  : order.status === 'packed' ? 'Baked — ready for packing'
                  : 'Dispatched to branches'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StoreDashboard() {
  const { orders, fetchOrders, loading } = useBakeryStore();

  // ✅ Load data immediately on mount
  useEffect(() => { fetchOrders(); }, []);

  const pending = orders.filter(o => o.status === 'pending');
  const inProgress = orders.filter(o => ['baking', 'packed', 'dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Store Dashboard</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders · calculate materials · send to baker</p>
        </div>
        <div className="bg-amber-100 border border-amber-200 text-amber-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
          {pending.length} New
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">New Orders</p>
              <div className="space-y-3">{pending.map(o => <OrderCard key={o.id} order={o} />)}</div>
            </div>
          )}
          {inProgress.length > 0 && (
            <div>
              <p className="text-xs font-body font-bold text-muted-foreground uppercase mb-2">In Progress / Done</p>
              <div className="space-y-3">{inProgress.map(o => <OrderCard key={o.id} order={o} />)}</div>
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
