// src/bakery/StoreDashboard.tsx (Redesigned)
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package,
  Warehouse, Plus, Pencil, Trash2, AlertTriangle,
  Search, X, Check, RefreshCw, Flame,
  Printer, Truck, Mail, MapPin, ShoppingBag, FileText, ShoppingCart,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import { calculateMaterials } from './recipeDefinitions';
import { resolveRecipeKey } from './itemMatcher';
import type { BakeryOrder } from './types';
import { cn } from '@/lib/utils';
import {
  useStoreStockStore, getAllRecipeMaterials, normaliseName,
  type StockUnit, type StockItem,
} from './storeStockStore';
import { useSupplierStore, type Supplier } from './supplierStore';
import InvoiceTab from './InvoiceTab';
import { useInvoiceStore } from './invoiceStore';
import StoreAnalyticsTab from './StoreAnalyticsTab';
import StoreCustomTab from './StoreCustomTab';
import PurchaseOrderTab from './PurchaseOrderTab';
import { searchItems, getSuppliersForItem, getAllSupplierNames, getItemsForSupplier } from './storeItemMaster';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function mat(order: BakeryOrder) {
  const allMats: { material: string; quantity: number; unit: string }[] = [];
  for (const item of order.items) {
    const key = resolveRecipeKey(item.itemId, item.itemName);
    if (!key) continue;
    // BUG #1 FIX: pass the recipe KEY (string) not the definition object.
    // calculateMaterials(itemId, quantity, unit) looks up RECIPE_DEFINITIONS[itemId] internally.
    const unit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
    const mats = calculateMaterials(key, item.quantity, unit);
    for (const m of mats) {
      const existing = allMats.find(x => x.material === m.material);
      if (existing) existing.quantity = parseFloat((existing.quantity + m.quantity).toFixed(4));
      else allMats.push({ ...m });
    }
  }
  return allMats;
}

// ─── Print helper ─────────────────────────────────────────────────────────────
function printRecipe(order: BakeryOrder, calculatedMats: { material: string; quantity: number; unit: string }[]) {
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) return;

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.itemName}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">
        ${item.quantity}${item.dispatchUnit === 'pcs' ? ' pcs' : ' kg'}
      </td>
    </tr>
  `).join('');

  const matsHtml = calculatedMats.map(m => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${m.material}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">
        ${m.quantity % 1 === 0 ? m.quantity : m.quantity.toFixed(2)} ${m.unit}
      </td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order #${order.orderNumber} – Recipe Sheet</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 24px; }
        h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; margin-left: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead th { text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #888; border-bottom: 2px solid #e5e7eb; }
        thead th:last-child { text-align: right; }
        section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #888; margin-bottom: 8px; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #aaa; text-align: center; }
      </style>
    </head>
    <body>
      <h1>Order #${order.orderNumber}${order.targetBranch ? `<span class="badge">${order.targetBranch}</span>` : ''}</h1>
      <p class="sub">Printed: ${new Date().toLocaleString('en-IN')}</p>

      <section>
        <h2>Items</h2>
        <table>
          <thead><tr><th>Item</th><th>Qty</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </section>

      ${calculatedMats.length > 0 ? `
      <section>
        <h2>Raw Materials Required</h2>
        <table>
          <thead><tr><th>Material</th><th>Quantity</th></tr></thead>
          <tbody>${matsHtml}</tbody>
        </table>
      </section>` : ''}

      <div class="footer">Cafe Aadvikam · Store Recipe Sheet</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
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

          {/* Print button — shown when mats are expanded */}
          {hasMats && showMats && (
            <button
              onClick={() => printRecipe(order, calculatedMats)}
              className="w-full h-10 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-body font-semibold flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-primary/10 transition-all"
            >
              <Printer className="size-4" />
              Print Recipe Sheet
            </button>
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
  const suppliers = useMemo(() => getSuppliersForItem(item.name), [item.name]);
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
          {suppliers.length > 0 && <span className="text-primary font-semibold ml-1.5">· {suppliers.join(', ')}</span>}
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

// ─── Add Stock modal ──────────────────────────────────────────────────────────
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

  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  const suggestions = useMemo(() => {
    // Items from STORE_ITEM_MASTER (667 real store items)
    const masterItems = searchItems(search).filter(m => {
      return !existingItems.some(e => normaliseName(e.name) === normaliseName(m.item));
    }).map(m => ({
      name: m.item,
      unit: (m.uom.toLowerCase().startsWith('kg') ? 'kg'
        : m.uom.toLowerCase() === 'ltr' || m.uom.toLowerCase() === 'l' ? 'L'
        : m.uom.toLowerCase() === 'g' ? 'g'
        : 'pcs') as StockUnit,
      category: m.category,
      suppliers: m.suppliers,
    }));
    // Recipe materials not already in master list
    const q = search.toLowerCase();
    const recipeSugs = recipeMats.filter(m => {
      const added = existingItems.some(e => normaliseName(e.name) === normaliseName(m.name));
      const inMaster = masterItems.some(x => normaliseName(x.name) === normaliseName(m.name));
      return !added && !inMaster && (q === '' || m.name.toLowerCase().includes(q));
    }).map(m => ({ name: m.name, unit: m.unit, category: 'Recipe', suppliers: [] as string[] }));
    return [...masterItems, ...recipeSugs].slice(0, 50);
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
                <button key={s.name} onClick={() => { setName(s.name); setUnit(s.unit as StockUnit); setSearch(s.name); setShowSug(false); setSelectedSuppliers((s as {suppliers?: string[]}).suppliers ?? []); }}
                  className="w-full text-left px-3 py-2.5 text-sm font-body hover:bg-muted flex items-center justify-between border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(s as {category?: string}).category ?? ''}</span>
                    {((s as {suppliers?: string[]}).suppliers ?? []).length > 0 && (
                      <span className="text-[10px] text-primary ml-2">· {((s as {suppliers?: string[]}).suppliers ?? []).join(', ')}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ml-2">{s.unit}</span>
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
        {selectedSuppliers.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-primary/5 border border-primary/15 rounded-xl">
            <Truck className="size-3.5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-body font-bold text-primary uppercase mb-1">Suppliers for this item</p>
              <div className="flex flex-wrap gap-1">
                {selectedSuppliers.map(s => (
                  <span key={s} className="text-[10px] font-body font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{s}</span>
                ))}
              </div>
            </div>
          </div>
        )}
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

// ─── Edit Stock modal ─────────────────────────────────────────────────────────
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
        <button onClick={() => setShowAdd(true)}
          className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95">
          <Plus className="size-3.5" /> Add
        </button>
      </div>
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

// ─── Supplier Card ────────────────────────────────────────────────────────────
function SupplierCard({ supplier, onEdit, onDelete }: { supplier: Supplier; onEdit: (s: Supplier) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20"
        onClick={() => setExpanded(v => !v)}>
        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-bold text-foreground truncate">{supplier.businessName}</p>
          <p className="text-[11px] font-body text-muted-foreground truncate">{supplier.contactName} · {supplier.phone}</p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2.5">
          {supplier.email && (
            <div className="flex items-center gap-2.5">
              <Mail className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-body text-foreground">{supplier.email}</span>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-start gap-2.5">
              <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-sm font-body text-foreground">{supplier.address}</span>
            </div>
          )}
          {(() => {
            const masterItems = getItemsForSupplier(supplier.businessName);
            const manualItems = supplier.itemsSupplied ? supplier.itemsSupplied.split(',').map(i => i.trim()).filter(Boolean) : [];
            const displayItems = masterItems.length > 0 ? masterItems : manualItems;
            return displayItems.length > 0 ? (
              <div className="flex items-start gap-2.5">
                <ShoppingBag className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">{displayItems.length} items supplied</p>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {displayItems.slice(0, 25).map(item => (
                      <span key={item} className="text-[10px] font-body font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {item}
                      </span>
                    ))}
                    {displayItems.length > 25 && (
                      <span className="text-[10px] font-body text-muted-foreground px-2 py-0.5">+{displayItems.length - 25} more</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onEdit(supplier)}
              className="flex-1 h-9 rounded-xl border border-border text-xs font-body font-semibold text-foreground flex items-center justify-center gap-1.5 hover:bg-muted active:scale-[0.98]">
              <Pencil className="size-3.5" /> Edit
            </button>
            <button onClick={() => onDelete(supplier.id)}
              className="flex-1 h-9 rounded-xl border border-red-200 text-xs font-body font-semibold text-red-600 bg-red-50 flex items-center justify-center gap-1.5 hover:bg-red-100 active:scale-[0.98]">
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supplier Form Modal ──────────────────────────────────────────────────────
interface SupplierFormData {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  itemsSupplied: string;
}

function SupplierModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Supplier;
  onClose: () => void;
  onSave: (data: SupplierFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<SupplierFormData>({
    businessName: initial?.businessName ?? '',
    contactName: initial?.contactName ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    itemsSupplied: initial?.itemsSupplied ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k: keyof SupplierFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.businessName.trim()) { setError('Business name is required'); return; }
    if (!form.phone.trim()) { setError('Phone number is required'); return; }
    setSaving(true); setError('');
    await onSave(form);
    setSaving(false); onClose();
  };

  const Field = ({ label, field, placeholder, type = 'text' }: { label: string; field: keyof SupplierFormData; placeholder?: string; type?: string }) => (
    <div>
      <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">{label}</label>
      <input type={type} value={form[field]} onChange={e => set(field)(e.target.value)} placeholder={placeholder}
        className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-10 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-bold text-lg text-foreground">{initial ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted"><X className="size-4" /></button>
        </div>

        <Field label="Business Name *" field="businessName" placeholder="e.g. Sri Ganesh Flour Mills" />
        <Field label="Contact Name *" field="contactName" placeholder="e.g. Ravi Kumar" />
        <Field label="Phone *" field="phone" placeholder="e.g. 9876543210" type="tel" />
        <Field label="Email" field="email" placeholder="e.g. info@supplier.com" type="email" />

        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Address</label>
          <textarea value={form.address} onChange={e => set('address')(e.target.value)}
            placeholder="Full address…" rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Items Supplied</label>
          <input value={form.itemsSupplied} onChange={e => set('itemsSupplied')(e.target.value)}
            placeholder="e.g. Maida, Sugar, Salt (comma-separated)"
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <p className="text-[10px] font-body text-muted-foreground mt-1">Separate items with commas</p>
        </div>

        {error && <p className="text-xs font-body text-destructive">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full h-12 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {initial ? 'Save Changes' : 'Add Supplier'}
        </button>
      </div>
    </div>
  );
}

// ─── Suppliers Tab ────────────────────────────────────────────────────────────
function SuppliersTab() {
  const { suppliers, loaded, loading, load, addSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      !q ||
      s.businessName.toLowerCase().includes(q) ||
      s.contactName.toLowerCase().includes(q) ||
      s.itemsSupplied.toLowerCase().includes(q) ||
      getItemsForSupplier(s.businessName).some(i => i.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const masterSupplierNames = useMemo(() => getAllSupplierNames(), []);
  const unregisteredMaster = useMemo(() =>
    masterSupplierNames.filter(n =>
      !suppliers.some(s => s.businessName.toLowerCase() === n.toLowerCase())
    ).slice(0, 12),
    [masterSupplierNames, suppliers]
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers or items…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => load()} disabled={loading} className="size-10 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90">
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
        <button onClick={() => setShowAdd(true)}
          className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95">
          <Plus className="size-3.5" /> Add
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded-xl p-2.5 text-center">
          <p className="font-display text-xl font-bold text-foreground">{suppliers.length}</p>
          <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">Registered</p>
        </div>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 text-center">
          <p className="font-display text-xl font-bold text-primary">{masterSupplierNames.length}</p>
          <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">Master List</p>
        </div>
      </div>
      {unregisteredMaster.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-[10px] font-body font-bold text-amber-700 uppercase mb-2">Known from Item Master — tap to register</p>
          <div className="flex flex-wrap gap-1.5">
            {unregisteredMaster.map(n => (
              <button key={n} onClick={() => setShowAdd(true)}
                className="text-[10px] font-body font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 active:scale-95">
                + {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !loaded
        ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        : filtered.length === 0
        ? <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
            <Truck className="size-10 opacity-20" />
            <p className="text-sm font-body">{suppliers.length === 0 ? 'No suppliers yet — tap Add to get started' : 'No matches'}</p>
          </div>
        : <div className="space-y-2">
            {filtered.map(s => (
              <SupplierCard key={s.id} supplier={s} onEdit={setEditSupplier} onDelete={deleteSupplier} />
            ))}
          </div>
      }

      {showAdd && (
        <SupplierModal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => { await addSupplier(data); }}
        />
      )}
      {editSupplier && (
        <SupplierModal
          initial={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSave={async (data) => { await updateSupplier(editSupplier.id, data); setEditSupplier(null); }}
        />
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoreDashboard() {
  const { orders } = useBakeryStore();
  const { items: stockItems } = useStoreStockStore();
  const { suppliers } = useSupplierStore();
  const { invoices, loaded: invLoaded, load: loadInvoices } = useInvoiceStore();
  const [tab, setTab] = useState<'orders' | 'inventory' | 'suppliers' | 'invoices' | 'analytics' | 'custom' | 'purchase'>('orders');

  useEffect(() => { if (!invLoaded) loadInvoices(); }, [invLoaded]);

  const pending    = orders.filter(o => o.status === 'pending');
  const lowStock   = stockItems.filter(i => i.quantity <= i.minThreshold);
  const pendingInv = invoices.filter(i => i.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-28">
      <div className="px-4 pt-5 pb-4">
        <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Store</h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">Review orders · manage raw stock · send to baker</p>
      </div>
      <div className="px-4 mb-5">
        <div className="flex gap-1 bg-muted/60 p-1.5 rounded-xl overflow-x-auto">
          {([
            { id: 'orders',    label: 'Orders',    icon: Package,      badge: pending.length > 0 ? String(pending.length) : null, badgeColor: 'bg-amber-500' },
            { id: 'inventory', label: 'Inventory', icon: Warehouse,    badge: lowStock.length > 0 ? String(lowStock.length) : null, badgeColor: 'bg-red-500' },
            { id: 'purchase',  label: 'PO',        icon: ShoppingCart, badge: null, badgeColor: '' },
            { id: 'suppliers', label: 'Suppliers', icon: Truck,        badge: null, badgeColor: '' },
            { id: 'invoices',  label: 'Invoices',  icon: FileText,     badge: pendingInv > 0 ? String(pendingInv) : null, badgeColor: 'bg-orange-500' },
            { id: 'analytics', label: 'Analytics', icon: Calculator,   badge: null, badgeColor: '' },
            { id: 'custom',    label: 'Custom',    icon: ShoppingBag, badge: null, badgeColor: '' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-[11px] font-body font-semibold transition-all',
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
        {tab === 'purchase'  && <PurchaseOrderTab />}
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'invoices'  && <InvoiceTab />}
        {tab === 'analytics' && <StoreAnalyticsTab />}
        {tab === 'custom'    && <StoreCustomTab />}
      </div>
    </div>
  );
}
