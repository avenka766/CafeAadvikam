// src/bakery/StoreDashboard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package, Scale, Hash,
  Warehouse, Plus, Pencil, Trash2, AlertTriangle,
  Search, X, Check, RefreshCw,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import { RECIPE_DEFINITIONS, calculateMaterials } from './recipeDefinitions';
import { resolveRecipeKey } from './itemMatcher';
import type { BakeryOrder, BakeryOrderItem } from './types';
import { cn } from '@/lib/utils';
import {
  useStoreStockStore, getAllRecipeMaterials, normaliseName,
  type StockUnit, type StockItem,
} from './storeStockStore';

function getOutputUnit(item: BakeryOrderItem): 'kg' | 'pcs' | 'loaf' | null {
  const key = resolveRecipeKey(item.itemId, item.itemName);
  if (!key) return null;
  return (RECIPE_DEFINITIONS[key].outputUnit as 'kg' | 'pcs' | 'loaf') ?? null;
}
function getOutputQty(item: BakeryOrderItem): number | null {
  const key = resolveRecipeKey(item.itemId, item.itemName);
  return key ? (RECIPE_DEFINITIONS[key]?.outputQty ?? null) : null;
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
  const { deductMaterials } = useStoreStockStore();
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);

  // FIX-1: itemQtys is initialised once from the order snapshot at mount time.
  // The ref guard ensures re-renders from the 15s poll never re-initialise it,
  // so whatever the user types stays intact between refreshes.
  const initialised = useRef(false);
  const [itemQtys, setItemQtys] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!initialised.current) {
      setItemQtys(Object.fromEntries(order.items.map(i => [i.itemId, String(i.quantity)])));
      initialised.current = true;
    }
  }, [order.items]);

  const [calculatedMats, setCalculatedMats] = useState<{ material: string; quantity: number; unit: string }[]>([]);
  const [calcForItem, setCalcForItem] = useState('');
  const [calcUnit, setCalcUnit] = useState<string | null>(null);
  const [calcQtyUsed, setCalcQtyUsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(order.status !== 'pending');
  const [sendError, setSendError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const selectedItem = order.items[selectedItemIdx];
  const selectedOutputUnit = selectedItem ? getOutputUnit(selectedItem) : null;
  const selectedOutputQty  = selectedItem ? getOutputQty(selectedItem)  : null;
  const hasRecipe = selectedItem
    ? !!(resolveRecipeKey(selectedItem.itemId, selectedItem.itemName))
    : false;

  const handleCalculate = async () => {
    if (!selectedItem) return;
    const qty = parseFloat(itemQtys[selectedItem.itemId] ?? String(selectedItem.quantity)) || 0;
    if (qty <= 0) return;
    setSaving(true);
    setCalcError(null);
    try {
      await updateExpectedOutput(order.id, qty);
      const recipeKey = resolveRecipeKey(selectedItem.itemId, selectedItem.itemName) ?? selectedItem.itemId;

      // FIX-2: calculateMaterials already does: qty / recipe.outputQty × each ingredient.
      // The third argument (unit) was silently ignored by the function — passing it gave
      // false confidence that unit conversion was happening. We pass the output unit only
      // for labelling; the actual scaling is purely ratio-based (qty ÷ outputQty), which
      // is correct as long as qty and outputQty are in the same unit — which they are,
      // since outputUnit on the recipe and the input qty come from the same item definition.
      const mats = calculateMaterials(recipeKey, qty, selectedOutputUnit ?? 'kg');
      setCalculatedMats(mats);
      setCalcForItem(selectedItem.itemName);
      setCalcUnit(selectedOutputUnit);
      setCalcQtyUsed(qty);
    } catch {
      setCalcError('Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToBaker = async () => {
    setSending(true);
    setSendError(null);
    try {
      // Deduct all calculated materials from raw stock
      if (calculatedMats.length > 0) {
        const deductions = calculatedMats.map(m => ({ name: m.material, qty: m.quantity }));
        const warn = await deductMaterials(deductions);
        if (warn) console.warn('Stock deduction note:', warn);
      }
      await sendToBaker(order.id);
      setSent(true);
    } catch {
      setSendError('Failed to send — please try again.');
    } finally {
      setSending(false);
    }
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
                const outUnit = getOutputUnit(item);
                const outQty  = getOutputQty(item);
                const isSelected = idx === selectedItemIdx;
                const hasRec  = !!(resolveRecipeKey(item.itemId, item.itemName));
                const isCustom = !!item.isCustom;
                const pcsLabel = item.originalPcs != null
                  ? `${item.originalPcs} pcs → ${item.quantity} kg`
                  : null;
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
                        {pcsLabel && (
                          <p className="text-[10px] font-body text-blue-600">📦 {pcsLabel}</p>
                        )}
                        {!isCustom && outUnit && outQty && <p className="text-[10px] font-body text-muted-foreground">1 batch = {outQty} {outUnit}</p>}
                        {!isCustom && !hasRec && <p className="text-[10px] font-body text-amber-600">⚠ No recipe — will be treated as custom</p>}
                        {isCustom && <p className="text-[10px] font-body text-amber-600">Special order — no recipe needed</p>}
                      </div>
                    </div>
                    <span className="text-xs font-body font-bold text-primary">×{item.quantity}{item.originalPcs == null ? ' ordered' : ' kg'}</span>
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
              {selectedItem.isCustom || (!hasRecipe && !selectedItem.isCustom) ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[10px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    {selectedItem.isCustom ? '✦ CUSTOM' : '⚠ NO RECIPE'}
                  </span>
                  <span className="text-xs font-body text-amber-700">
                    {selectedItem.isCustom
                      ? 'No recipe for custom items — send directly to baker.'
                      : 'No recipe found — item will be sent to baker as custom.'}
                  </span>
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
                  {calcError && <p className="text-xs font-body text-destructive">{calcError}</p>}
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
            <>
              <button onClick={handleSendToBaker} disabled={sending}
                className="w-full h-11 rounded-xl bg-orange-500 text-white text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Send to Baker
              </button>
              {sendError && <p className="text-xs font-body text-destructive text-center">{sendError}</p>}
            </>
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

// ─── Raw Stock Inventory Tab ─────────────────────────────────────────────────

const UNITS: StockUnit[] = ['kg', 'L', 'g', 'pcs', 'nos', 'bunch', 'ltr'];

function StockRow({ item, onEdit, onDelete }: {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onDelete: (id: string) => void;
}) {
  const isLow = item.quantity <= item.minThreshold;
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all",
      isLow ? "bg-red-50 border-red-200" : "bg-card border-border"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isLow && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
          <span className="text-sm font-body font-semibold text-foreground truncate">{item.name}</span>
        </div>
        <span className="text-[10px] font-body text-muted-foreground">
          Min: {item.minThreshold} {item.unit}
          {isLow && <span className="text-red-600 font-bold ml-1">LOW STOCK</span>}
        </span>
      </div>
      <span className={cn("text-sm font-body font-bold tabular-nums px-2 py-0.5 rounded-lg",
        isLow ? "text-red-700 bg-red-100" : "text-primary bg-primary/10"
      )}>
        {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)} {item.unit}
      </span>
      <button onClick={() => onEdit(item)} className="size-7 flex items-center justify-center rounded-lg hover:bg-muted active:scale-90 transition-all">
        <Pencil className="size-3.5 text-muted-foreground" />
      </button>
      <button onClick={() => onDelete(item.id)} className="size-7 flex items-center justify-center rounded-lg hover:bg-red-50 active:scale-90 transition-all">
        <Trash2 className="size-3.5 text-red-400" />
      </button>
    </div>
  );
}

function AddItemModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (name: string, unit: StockUnit, qty: number, min: number) => Promise<void>;
}) {
  const recipeMats = useMemo(() => getAllRecipeMaterials(), []);
  const { items: existingItems } = useStoreStockStore();
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<StockUnit>('kg');
  const [qty, setQty] = useState('0');
  const [min, setMin] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Suggestions from recipe materials not yet in stock
  const suggestions = useMemo(() => {
    const q = search.toLowerCase();
    return recipeMats
      .filter(m => {
        const alreadyAdded = existingItems.some(e => normaliseName(e.name) === normaliseName(m.name));
        return !alreadyAdded && (q === '' || m.name.toLowerCase().includes(q));
      })
      .slice(0, 40);
  }, [recipeMats, existingItems, search]);

  const selectSuggestion = (m: { name: string; unit: StockUnit }) => {
    setName(m.name);
    setUnit(m.unit);
    setSearch(m.name);
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    const q = parseFloat(qty); const m = parseFloat(min);
    if (isNaN(q) || q < 0) { setError('Invalid quantity'); return; }
    if (isNaN(m) || m < 0) { setError('Invalid minimum'); return; }
    setSaving(true); setError('');
    await onSave(name, unit, q, m);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-background rounded-t-2xl px-4 pt-4 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-bold text-foreground">Add Stock Item</h3>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
        </div>

        {/* Name with recipe suggestion */}
        <div className="relative">
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Name</label>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setName(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Type or pick from recipe materials…"
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-background border border-border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
              {suggestions.map(s => (
                <button key={s.name} onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm font-body hover:bg-muted flex items-center justify-between">
                  <span>{s.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{s.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Unit */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNITS.map(u => (
              <button key={u} onClick={() => setUnit(u)}
                className={cn("px-3 py-1.5 rounded-xl border text-xs font-body font-semibold transition-all",
                  unit === u ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:border-primary/40")}>
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Qty + Min side by side */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Current Stock ({unit})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Low Stock Alert ({unit})</label>
            <input type="number" min={0} step={0.1} value={min} onChange={e => setMin(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        {error && <p className="text-xs font-body text-destructive">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Add to Stock
        </button>
      </div>
    </div>
  );
}

function EditItemModal({ item, onClose, onSave }: {
  item: StockItem;
  onClose: () => void;
  onSave: (updates: Partial<Pick<StockItem, 'name' | 'unit' | 'quantity' | 'minThreshold'>>) => Promise<void>;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [min, setMin] = useState(String(item.minThreshold));
  const [unit, setUnit] = useState<StockUnit>(item.unit);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const q = parseFloat(qty); const m = parseFloat(min);
    if (isNaN(q) || isNaN(m)) return;
    setSaving(true);
    await onSave({ quantity: q, minThreshold: m, unit });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-background rounded-t-2xl px-4 pt-4 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="font-display font-bold text-foreground">{item.name}</h3>
            <p className="text-[10px] font-body text-muted-foreground">Update stock quantity or threshold</p>
          </div>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNITS.map(u => (
              <button key={u} onClick={() => setUnit(u)}
                className={cn("px-3 py-1.5 rounded-xl border text-xs font-body font-semibold transition-all",
                  unit === u ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:border-primary/40")}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Stock ({unit})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Low Alert ({unit})</label>
            <input type="number" min={0} step={0.1} value={min} onChange={e => setMin(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

function StoreInventoryTab() {
  const { items, loaded, loading, load, addItem, updateItem, deleteItem } = useStoreStockStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const lowStockItems = items.filter(i => i.quantity <= i.minThreshold);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => !q || i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-3">
      {/* Low stock banner */}
      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-body font-bold text-red-700">{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low</p>
            <p className="text-[10px] font-body text-red-600">{lowStockItems.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ingredients…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => load()} disabled={loading}
          className="size-9 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90 transition-all">
          <RefreshCw className={cn("size-3.5 text-muted-foreground", loading && "animate-spin")} />
        </button>
        <button onClick={() => setShowAdd(true)}
          className="h-9 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95 transition-all">
          <Plus className="size-3.5" /> Add
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl p-2.5 text-center">
          <p className="font-display text-lg font-bold text-foreground">{items.length}</p>
          <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold">Total Items</p>
        </div>
        <div className={cn("border rounded-xl p-2.5 text-center", lowStockItems.length > 0 ? "bg-red-50 border-red-200" : "bg-card border-border")}>
          <p className={cn("font-display text-lg font-bold", lowStockItems.length > 0 ? "text-red-600" : "text-foreground")}>{lowStockItems.length}</p>
          <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold">Low Stock</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-2.5 text-center">
          <p className="font-display text-lg font-bold text-foreground">{items.filter(i => i.quantity > i.minThreshold).length}</p>
          <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold">OK</p>
        </div>
      </div>

      {/* List */}
      {loading && !loaded ? (
        <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <Warehouse className="size-10 opacity-20" />
          <p className="text-sm font-body">{items.length === 0 ? 'No ingredients yet — tap Add' : 'No matches'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Low stock first */}
          {lowStockItems.length > 0 && (
            <>
              <p className="text-[10px] font-body font-bold text-red-600 uppercase">⚠ Low Stock</p>
              {lowStockItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())).map(i => (
                <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={deleteItem} />
              ))}
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mt-2">All Stock</p>
            </>
          )}
          {filtered.filter(i => i.quantity > i.minThreshold).map(i => (
            <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={deleteItem} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSave={async (name, unit, qty, min) => {
            await addItem(name, unit, qty, min);
          }}
        />
      )}
      {editItem && (
        <EditItemModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (updates) => {
            await updateItem(editItem.id, updates);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Modified OrderCard with stock deduction on Send to Baker ────────────────

function OrdersTab() {
  const { orders, fetchOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const id = setInterval(() => fetchOrders(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const pending    = orders.filter(o => o.status === 'pending');
  const inProgress = orders.filter(o => ['baking','packed','dispatched'].includes(o.status));

  if (initialLoading) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
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
  );
}

export default function StoreDashboard() {
  const { orders } = useBakeryStore();
  const { items: stockItems } = useStoreStockStore();
  const [tab, setTab] = useState<'orders' | 'inventory'>('orders');

  const pending    = orders.filter(o => o.status === 'pending');
  const lowStock   = stockItems.filter(i => i.quantity <= i.minThreshold);

  const tabs = [
    { id: 'orders',    label: 'Orders',    badge: pending.length > 0 ? String(pending.length) : null },
    { id: 'inventory', label: 'Inventory', badge: lowStock.length > 0 ? String(lowStock.length) : null, badgeColor: 'bg-red-500' },
  ] as const;

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold text-foreground">Store Dashboard</h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders · manage raw stock · send to baker</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-semibold transition-all',
              tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}>
            {t.id === 'orders' ? <Store className="size-3.5" /> : <Warehouse className="size-3.5" />}
            {t.label}
            {t.badge && (
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white min-w-[18px] text-center',
                t.badgeColor ?? 'bg-amber-500')}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'orders'    && <OrdersTab />}
      {tab === 'inventory' && <StoreInventoryTab />}
    </div>
  );
}
