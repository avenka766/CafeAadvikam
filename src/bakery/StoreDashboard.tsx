// src/bakery/StoreDashboard.tsx — UPDATED
// Uses RECIPE_DEFINITIONS from Excel data; supports kg / pcs / loaf orders
import { useState, useEffect } from 'react';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package, Scale, Hash,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import { RECIPE_DEFINITIONS, calculateMaterials } from './recipeDefinitions';
import type { BakeryOrder } from './types';
import { cn } from '@/lib/utils';

function getOutputUnit(itemId: string): 'kg' | 'pcs' | 'loaf' | null {
  const r = RECIPE_DEFINITIONS[itemId];
  if (!r) return null;
  return (r.outputUnit as 'kg' | 'pcs' | 'loaf') ?? null;
}
function getOutputQty(itemId: string): number | null {
  return RECIPE_DEFINITIONS[itemId]?.outputQty ?? null;
}
const UNIT_ICONS: Record<string, React.ReactNode> = {
  kg:   <Scale   className="size-3 shrink-0" />,
  pcs:  <Hash    className="size-3 shrink-0" />,
  loaf: <Package className="size-3 shrink-0" />,
};
const UNIT_LABELS: Record<string, string> = {
  kg:   'kg (kilograms)',
  pcs:  'pcs (pieces)',
  loaf: 'loaves',
};

function OrderCard({ order }: { order: BakeryOrder }) {
  const { updateExpectedOutput, sendToBaker } = useBakeryStore();
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);
  const [itemQtys, setItemQtys] = useState<Record<string, string>>(
    () => Object.fromEntries(order.items.map(i => [i.itemId, String(i.quantity)]))
  );
  const [calculatedMats, setCalculatedMats] = useState<{ material: string; quantity: number; unit: string }[]>([]);
  const [calcForItem, setCalcForItem] = useState('');
  const [calcUnit, setCalcUnit] = useState<string | null>(null);
  const [calcQtyUsed, setCalcQtyUsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(order.status !== 'pending');

  const selectedItem = order.items[selectedItemIdx];
  const selectedMeta = selectedItem ? BAKERY_ITEMS.find(b => b.id === selectedItem.itemId) : null;
  const selectedOutputUnit = selectedItem ? getOutputUnit(selectedItem.itemId) : null;
  const selectedOutputQty  = selectedItem ? getOutputQty(selectedItem.itemId)  : null;
  const hasRecipe = selectedItem ? !!RECIPE_DEFINITIONS[selectedItem.itemId] : false;

  const handleCalculate = async () => {
    if (!selectedItem) return;
    const qty = parseFloat(itemQtys[selectedItem.itemId] ?? String(selectedItem.quantity)) || 0;
    if (qty <= 0) return;
    setSaving(true);
    await updateExpectedOutput(order.id, qty);
    const mats = calculateMaterials(selectedItem.itemId, qty, selectedOutputUnit ?? 'kg');
    setCalculatedMats(mats);
    setCalcForItem(selectedItem.itemName);
    setCalcUnit(selectedOutputUnit);
    setCalcQtyUsed(qty);
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
  const statusLabel: Record<string, string> = { pending:'NEW', baking:'BAKING', packed:'PACKED', dispatched:'DISPATCHED' };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', statusColor[order.status] ?? statusColor.pending)}>
              {statusLabel[order.status] ?? order.status}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground">{order.items.map(i => `${i.itemName} ×${i.quantity}`).join(', ')}</p>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">{order.createdBy.split(' | ')[0]} · {new Date(order.createdAt).toLocaleString('en-IN')}</p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Step 1 */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Step 1 — Select Item</p>
            <div className="space-y-1.5">
              {order.items.map((item, idx) => {
                const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
                const outUnit = getOutputUnit(item.itemId);
                const outQty  = getOutputQty(item.itemId);
                const isSelected = idx === selectedItemIdx;
                const hasRec = !!RECIPE_DEFINITIONS[item.itemId];
                const isCustom = !!item.isCustom;
                return (
                  <button key={item.itemId} onClick={() => { setSelectedItemIdx(idx); setCalculatedMats([]); setCalcForItem(''); }}
                    className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/40')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('size-4 rounded-full border-2 flex items-center justify-center shrink-0', isSelected ? 'border-primary' : 'border-muted-foreground/40')}>
                        {isSelected && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-body font-semibold text-foreground">{meta?.icon} {item.itemName}</span>
                          {isCustom && (
                            <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">✦ CUSTOM</span>
                          )}
                        </div>
                        {!isCustom && outUnit && outQty && <p className="text-[10px] font-body text-muted-foreground">1 batch = {outQty} {outUnit}</p>}
                        {!isCustom && !hasRec && <p className="text-[10px] font-body text-amber-600">⚠ No recipe — add via Admin</p>}
                        {isCustom && <p className="text-[10px] font-body text-amber-600">Special order — no recipe needed</p>}
                      </div>
                    </div>
                    <span className="text-xs font-body font-bold text-primary">×{item.quantity} ordered</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 */}
          {selectedItem && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Step 2 — Qty to Produce{selectedOutputUnit && <span className="ml-1 normal-case text-primary">({selectedOutputUnit})</span>}
              </p>
              {selectedItem.isCustom ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[10px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">✦ CUSTOM</span>
                  <span className="text-xs font-body text-amber-700">No recipe for custom items — send directly to baker.</span>
                </div>
              ) : (
                <>
                  {selectedOutputUnit && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-primary/5 rounded-lg border border-primary/20">
                      {UNIT_ICONS[selectedOutputUnit]}
                      <span className="text-xs font-body text-primary font-semibold">Measured in {UNIT_LABELS[selectedOutputUnit]}</span>
                      {selectedOutputQty && <span className="ml-auto text-[10px] font-body text-muted-foreground">1 batch = {selectedOutputQty} {selectedOutputUnit}</span>}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input type="number" min={0.01} step={selectedOutputUnit === 'kg' ? 0.5 : 1}
                        value={itemQtys[selectedItem.itemId] ?? String(selectedItem.quantity)}
                        onChange={e => setItemQtys(prev => ({ ...prev, [selectedItem.itemId]: e.target.value }))}
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <p className="text-[10px] font-body text-muted-foreground mt-1">Auto-filled from order ({selectedItem.quantity} ordered). Edit if needed.</p>
                    </div>
                    <button onClick={handleCalculate} disabled={saving || !hasRecipe} title={!hasRecipe ? 'No recipe data for this item' : undefined}
                      className="h-10 px-4 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all shrink-0">
                      {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Calculator className="size-3.5" />}
                      Calculate
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3 — Results */}
          {calculatedMats.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">
                Materials Needed — {calcForItem} ×{calcQtyUsed}{calcUnit ? ` ${calcUnit}` : ''}
              </p>
              <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
                {calculatedMats.map((mat, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-body text-foreground">{mat.material}</span>
                    <span className="text-sm font-body font-bold tabular-nums text-primary">
                      {mat.quantity % 1 === 0 ? mat.quantity.toLocaleString('en-IN') : mat.quantity.toFixed(3)} {mat.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.status === 'pending' && !sent && (
            <button onClick={handleSendToBaker} disabled={sending}
              className="w-full h-11 rounded-xl bg-orange-500 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
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
  useEffect(() => { fetchOrders(); }, []);
  const pending    = orders.filter(o => o.status === 'pending');
  const inProgress = orders.filter(o => ['baking','packed','dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Store Dashboard</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders · calculate materials · send to baker</p>
        </div>
        <div className="bg-amber-100 border border-amber-200 text-amber-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">{pending.length} New</div>
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
