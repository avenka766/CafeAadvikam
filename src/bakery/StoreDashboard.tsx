// src/bakery/StoreDashboard.tsx (Redesigned)
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package, Scale, Hash,
  Warehouse, Plus, Pencil, Trash2, AlertTriangle,
  Search, X, Check, RefreshCw, Download, Flame,
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function mat(order: BakeryOrder) {
  const allMats: { material: string; quantity: number; unit: string }[] = [];
  for (const item of order.items) {
    const key = resolveRecipeKey(item.itemId, item.itemName);
    if (!key) continue;
    const def = RECIPE_DEFINITIONS[key];
    if (!def) continue;
    const mats = calculateMaterials(def, item.quantity);
    for (const m of mats) {
      const existing = allMats.find(x => x.material === m.material);
      if (existing) existing.quantity += m.quantity;
      else allMats.push({ ...m });
    }
  }
  return allMats;
}

// ─── Stock Units ──────────────────────────────────────────────────────────────
const UNITS: StockUnit[] = ['kg', 'L', 'g', 'pcs', 'nos', 'bunch', 'ltr'];

// ─── Order Card ──────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: BakeryOrder }) {
  const { updateExpectedOutput, sendToBaker } = useBakeryStore();
  const { deductMaterials } = useStoreStockStore();

  const [expanded,      setExpanded]      = useState(true);
  const [expectedOut,   setExpectedOut]   = useState('');
  const [sending,       setSending]       = useState(false);
  const [sent,          setSent]          = useState(order.status !== 'pending');
  const [sendError,     setSendError]     = useState<string | null>(null);
  const [showMats,      setShowMats]      = useState(false);

  const initialised = useRef(false);
  useEffect(() => {
    if (!initialised.current) {
      setExpectedOut(order.expectedOutput ?? '');
      setSent(order.status !== 'pending');
      initialised.current = true;
    }
  }, []);

  const calculatedMats = useMemo(() => mat(order), [order]);
  const hasMats        = calculatedMats.length > 0;

  const handleExpectedChange = async (val: string) => {
    setExpectedOut(val);
    if (val !== '' && !isNaN(Number(val)))
      await updateExpectedOutput(order.id, Number(val));
  };

  const handleSendToBaker = async () => {
    setSending(true); setSendError(null);
    try {
      if (calculatedMats.length > 0) {
        const warn = await deductMaterials(calculatedMats.map(m => ({ name: m.material, qty: m.quantity })));
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

  const branchColor: Record<string, string> = {
    VRSNB: 'bg-blue-50 text-blue-700 border-blue-200',
    SNB:   'bg-amber-50 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      sent ? 'border-border bg-card opacity-70' : 'border-primary/20 bg-card shadow-sm'
    )}>
      {/* Card header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20"
        onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0',
          sent ? 'bg-emerald-100' : 'bg-primary/10'
        )}>
          {sent
            ? <CheckCircle2 className="size-5 text-emerald-600" />
            : <Package className="size-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">Order #{order.orderNumber}</span>
            {order.targetBranch && (
              <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', branchColor[order.targetBranch] ?? 'bg-muted text-muted-foreground border-border')}>
                {order.targetBranch}
              </span>
            )}
            {sent && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Sent to Baker ✓
              </span>
            )}
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {order.items.map(i => i.itemName).join(' · ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          {/* Items */}
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{BAKERY_ITEMS.find(b => b.id === item.itemId)?.icon ?? '🍬'}</span>
                  <div>
                    <p className="text-sm font-body font-semibold text-foreground">{item.itemName}</p>
                    {item.originalPcs != null && (
                      <p className="text-[10px] font-body text-blue-600">
                        {item.originalPcs} pcs → {item.quantity} kg
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-body font-bold tabular-nums text-foreground">
                    {item.quantity}{item.dispatchUnit === 'pcs' ? ' pcs' : ' kg'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Expected output */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase shrink-0">Expected output</label>
            <input type="number" min={0} value={expectedOut}
              onChange={e => handleExpectedChange(e.target.value)}
              placeholder="units"
              className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Raw materials toggle */}
          {hasMats && (
            <button onClick={() => setShowMats(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-xs font-body font-semibold text-primary active:scale-[0.99]">
              <div className="flex items-center gap-1.5">
                <Calculator className="size-3.5" />
                Raw materials ({calculatedMats.length} ingredients)
              </div>
              {showMats ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          )}
          {hasMats && showMats && (
            <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border/50">
              {calculatedMats.map((m, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-body text-foreground">{m.material}</span>
                  <span className="text-sm font-body font-bold tabular-nums text-foreground">
                    {m.quantity % 1 === 0 ? m.quantity : m.quantity.toFixed(2)} {m.unit}
                  </span>
                </div>
              ))}
            </div>
          )}

          {sendError && <p className="text-xs font-body text-destructive text-center">{sendError}</p>}

          <button onClick={handleSendToBaker} disabled={sending || sent}
            className={cn(
              'w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50',
              sent ? 'bg-emerald-100 text-emerald-700' : 'cafe-gradient text-primary-foreground shadow-md'
            )}>
            {sending
              ? <Loader2 className="size-4 animate-spin" />
              : sent
              ? <><CheckCircle2 className="size-4" /> Sent to Baker</>
              : <><ArrowRight className="size-4" /> Send to Baker</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stock Row ────────────────────────────────────────────────────────────────
function StockRow({ item, onEdit, onDelete }: { item: StockItem; onEdit: (i: StockItem) => void; onDelete: (id: string) => void }) {
  const isLow = item.quantity <= item.minThreshold;
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-all',
      isLow ? 'bg-red-50 border-red-200' : 'bg-card border-border'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isLow && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
          <span className="text-sm font-body font-semibold text-foreground truncate">{item.name}</span>
        </div>
        <p className="text-[10px] font-body text-muted-foreground">
          Min: {item.minThreshold} {item.unit}
          {isLow && <span className="text-red-600 font-bold ml-1.5">LOW</span>}
        </p>
      </div>
      <span className={cn(
        'text-sm font-body font-bold tabular-nums px-2.5 py-1 rounded-lg',
        isLow ? 'text-red-700 bg-red-100' : 'text-primary bg-primary/10'
      )}>
        {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)} {item.unit}
      </span>
      <button onClick={() => onEdit(item)} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted active:scale-90">
        <Pencil className="size-3.5 text-muted-foreground" />
      </button>
      <button onClick={() => onDelete(item.id)} className="size-8 flex items-center justify-center rounded-lg hover:bg-red-50 active:scale-90">
        <Trash2 className="size-3.5 text-red-400" />
      </button>
    </div>
  );
}

// ─── Add modal ────────────────────────────────────────────────────────────────
function AddItemModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, unit: StockUnit, qty: number, min: number) => Promise<void> }) {
  const recipeMats = useMemo(() => getAllRecipeMaterials(), []);
  const { items: existingItems } = useStoreStockStore();
  const [search, setSearch] = useState('');
  const [name, setName]     = useState('');
  const [unit, setUnit]     = useState<StockUnit>('kg');
  const [qty, setQty]       = useState('0');
  const [min, setMin]       = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [showSug, setShowSug] = useState(false);

  const suggestions = useMemo(() => {
    const q = search.toLowerCase();
    return recipeMats.filter(m => {
      const added = existingItems.some(e => normaliseName(e.name) === normaliseName(m.name));
      return !added && (q === '' || m.name.toLowerCase().includes(q));
    }).slice(0, 40);
  }, [recipeMats, existingItems, search]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    const q = parseFloat(qty), m = parseFloat(min);
    if (isNaN(q) || q < 0 || isNaN(m) || m < 0) { setError('Invalid quantity or minimum'); return; }
    setSaving(true); setError('');
    await onSave(name, unit, q, m);
    setSaving(false); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-3" />
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-foreground">Add Stock Item</h3>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="relative">
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Name</label>
          <input value={search} onChange={e => { setSearch(e.target.value); setName(e.target.value); setShowSug(true); }} onFocus={() => setShowSug(true)}
            placeholder="Type or pick from recipe materials…"
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {showSug && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-background border border-border rounded-xl mt-1 max-h-52 overflow-y-auto shadow-lg">
              {suggestions.map(s => (
                <button key={s.name} onClick={() => { setName(s.name); setUnit(s.unit); setSearch(s.name); setShowSug(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm font-body hover:bg-muted flex items-center justify-between border-b border-border/50 last:border-0">
                  <span>{s.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{s.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNITS.map(u => (
              <button key={u} onClick={() => setUnit(u)}
                className={cn('px-3 py-2 rounded-xl border text-xs font-body font-semibold transition-all',
                  unit === u ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/40')}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Stock ({unit})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Low Alert ({unit})</label>
            <input type="number" min={0} step={0.1} value={min} onChange={e => setMin(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        {error && <p className="text-xs font-body text-destructive">{error}</p>}
        <button onClick={handleSave} disabled={saving}
          className="w-full h-12 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Add to Stock
        </button>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditItemModal({ item, onClose, onSave }: { item: StockItem; onClose: () => void; onSave: (u: Partial<Pick<StockItem,'name'|'unit'|'quantity'|'minThreshold'>>) => Promise<void> }) {
  const [qty, setQty]   = useState(String(item.quantity));
  const [min, setMin]   = useState(String(item.minThreshold));
  const [unit, setUnit] = useState<StockUnit>(item.unit);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    const q = parseFloat(qty), m = parseFloat(min);
    if (isNaN(q) || isNaN(m)) return;
    setSaving(true); await onSave({ quantity: q, minThreshold: m, unit }); setSaving(false); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-3" />
        <div className="flex items-center justify-between">
          <div><h3 className="font-display font-bold text-foreground">{item.name}</h3><p className="text-[10px] font-body text-muted-foreground">Update stock</p></div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNITS.map(u => (<button key={u} onClick={() => setUnit(u)} className={cn('px-3 py-2 rounded-xl border text-xs font-body font-semibold transition-all', unit === u ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground')}>{u}</button>))}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Stock ({unit})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Low Alert ({unit})</label>
            <input type="number" min={0} step={0.1} value={min} onChange={e => setMin(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save Changes
        </button>
      </div>
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────
function StoreInventoryTab() {
  const { items, loaded, loading, load, addItem, updateItem, deleteItem, bulkImportFromRecipes } = useStoreStockStore();
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editItem, setEditItem]     = useState<StockItem | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importToast, setImportToast] = useState<{ added: number; skipped: number } | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const handleImport = async () => {
    setImporting(true);
    const result = await bulkImportFromRecipes();
    setImporting(false);
    if (!result.error) {
      setImportToast({ added: result.added, skipped: result.skipped });
      setTimeout(() => setImportToast(null), 4000);
    }
  };

  const lowItems = items.filter(i => i.quantity <= i.minThreshold);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => !q || i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-3">
      {lowItems.length > 0 && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-body font-bold text-red-700">{lowItems.length} item{lowItems.length > 1 ? 's' : ''} running low</p>
            <p className="text-[10px] font-body text-red-600 mt-0.5">{lowItems.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredients…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => load()} disabled={loading} className="size-10 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90">
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
        <button onClick={handleImport} disabled={importing}
          className="h-10 px-3 rounded-xl border border-primary text-primary text-xs font-body font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-50">
          {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Import
        </button>
        <button onClick={() => setShowAdd(true)}
          className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95">
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {importToast && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          <p className="text-xs font-body text-emerald-700">
            <span className="font-bold">{importToast.added} new ingredients</span> added from recipes
            {importToast.skipped > 0 && <span className="text-emerald-600"> · {importToast.skipped} skipped (already exist)</span>}
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total', value: items.length, color: 'text-foreground' },
          { label: 'Low Stock', value: lowItems.length, color: lowItems.length > 0 ? 'text-red-600' : 'text-muted-foreground', bg: lowItems.length > 0 ? 'bg-red-50 border-red-200' : '' },
          { label: 'OK', value: items.filter(i => i.quantity > i.minThreshold).length, color: 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {loading && !loaded
        ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        : filtered.length === 0
        ? <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
            <Warehouse className="size-10 opacity-20" />
            <p className="text-sm font-body">{items.length === 0 ? 'No ingredients yet — tap Add or Import' : 'No matches'}</p>
          </div>
        : <div className="space-y-2">
            {lowItems.length > 0 && filtered.some(i => i.quantity <= i.minThreshold) && (
              <p className="text-[10px] font-body font-bold text-red-600 uppercase px-1">⚠ Low Stock</p>
            )}
            {filtered.filter(i => i.quantity <= i.minThreshold).map(i => (
              <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={deleteItem} />
            ))}
            {filtered.some(i => i.quantity > i.minThreshold) && lowItems.length > 0 && (
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase px-1 mt-3">All Stock</p>
            )}
            {filtered.filter(i => i.quantity > i.minThreshold).map(i => (
              <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={deleteItem} />
            ))}
          </div>
      }
      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onSave={async (n, u, q, m) => { await addItem(n, u, q, m); }} />}
      {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={async (u) => { await updateItem(editItem.id, u); setEditItem(null); }} />}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
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
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2"><Flame className="size-3.5 text-amber-500" /><p className="text-xs font-body font-bold text-muted-foreground uppercase">New Orders</p></div>
          {pending.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
      {inProgress.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-emerald-500" /><p className="text-xs font-body font-bold text-muted-foreground uppercase">In Progress / Done</p></div>
          {inProgress.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
      {orders.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-4">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><Store className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No orders yet</p><p className="text-xs font-body text-muted-foreground mt-1">Orders appear here once received</p></div>
        </div>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoreDashboard() {
  const { orders } = useBakeryStore();
  const { items: stockItems } = useStoreStockStore();
  const [tab, setTab] = useState<'orders' | 'inventory'>('orders');

  const pending  = orders.filter(o => o.status === 'pending');
  const lowStock = stockItems.filter(i => i.quantity <= i.minThreshold);

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">
      <div className="px-4 pt-5 pb-4">
        <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Store</h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders · manage raw stock · send to baker</p>
      </div>
      <div className="px-4 mb-5">
        <div className="flex gap-1.5 bg-muted/60 p-1.5 rounded-xl">
          {([
            { id: 'orders',    label: 'Orders',    icon: Package,   badge: pending.length > 0 ? String(pending.length) : null, badgeColor: 'bg-amber-500' },
            { id: 'inventory', label: 'Inventory', icon: Warehouse, badge: lowStock.length > 0 ? String(lowStock.length) : null, badgeColor: 'bg-red-500' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-body font-semibold transition-all',
                tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}>
              <t.icon className="size-3.5" />
              {t.label}
              {t.badge && <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white', t.badgeColor)}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4">
        {tab === 'orders'    && <OrdersTab />}
        {tab === 'inventory' && <StoreInventoryTab />}
      </div>
    </div>
  );
}
