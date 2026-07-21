// src/bakery/StoreDashboard.tsx (Redesigned)
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package,
  Warehouse, Plus, Pencil, Trash2, AlertTriangle,
  Search, X, Check, RefreshCw, Flame,
  Printer, Truck, Mail, MapPin, ShoppingBag, FileText, BarChart2, MinusCircle, ChefHat,
  History, WalletCards, Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import { useRecipeStore } from './recipeStore';
import { useBakeryItemsStore } from './bakeryItemsStore';
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
import StoreReportTab from './StoreReportTab';
import RecipeManagement from './RecipeManagement';
import { searchItems, getSuppliersForItem, getAllSupplierNames, getItemsForSupplier } from './storeItemMaster';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from './notificationStore';
import type { DeductionContext } from './storeStockStore';
import { pcsToKg, resolveItemWeightGrams } from './itemMatcher';

type StoreDashboardTab = 'orders' | 'history' | 'inventory' | 'suppliers' | 'invoices' | 'analytics' | 'custom' | 'closure' | 'report' | 'recipes';
const STORE_TABS: StoreDashboardTab[] = ['orders', 'history', 'inventory', 'suppliers', 'invoices', 'analytics', 'custom', 'closure', 'report', 'recipes'];
const STORE_ORDER_CATEGORIES = ['Sweets', 'Savouries', 'Bakery', 'Cookies', 'Others'] as const;
type StoreOrderCategory = typeof STORE_ORDER_CATEGORIES[number];

function storeOrderCategory(item: BakeryOrder['items'][number], liveItems: ReturnType<typeof useBakeryItemsStore.getState>['items']): StoreOrderCategory {
  const normalizedName = normaliseName(item.itemName);
  const liveCategory = liveItems.find(entry => entry.id === item.itemId || normaliseName(entry.name) === normalizedName)?.category;
  const fallbackCategory = BAKERY_ITEMS.find(entry => entry.id === item.itemId || normaliseName(entry.name) === normalizedName)?.category;
  const category = liveCategory || fallbackCategory;
  return STORE_ORDER_CATEGORIES.includes(category as StoreOrderCategory) && category !== 'Others'
    ? category as StoreOrderCategory
    : 'Others';
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function matForItem(item: BakeryOrder['items'][number]) {
  const recipeStore = useRecipeStore.getState();
  const recipe = recipeStore.getRecipe(item.itemId, item.itemName);
  const weightGrams = item.weightGrams ?? resolveItemWeightGrams(item.itemId, item.itemName);
  const recipeUsesWeight = recipe?.outputUnit === 'kg' && weightGrams != null;
  const quantity = item.dispatchUnit === 'pcs'
    ? recipeUsesWeight
      ? item.weightGrams != null
        ? item.quantity
        : (pcsToKg(item.itemName, item.quantity, weightGrams) ?? item.quantity)
      : (item.originalPcs ?? item.quantity)
    : item.quantity;
  const unit = item.dispatchUnit === 'pcs' && !recipeUsesWeight ? 'pcs' : 'kg';
  return recipeStore.calculateMaterials(item.itemId, item.itemName, quantity, unit);
}

function recipeIssueForItem(item: BakeryOrder['items'][number]): string | null {
  const recipe = useRecipeStore.getState().getRecipe(item.itemId, item.itemName);
  if (!recipe) return 'No recipe is linked to this item name or item code.';
  if (!recipe.outputQty || recipe.outputQty <= 0) return 'Recipe found, but its output quantity is missing.';
  if (recipe.materials.length === 0) return 'Recipe found, but no raw materials have been added.';
  if (item.quantity <= 0) return 'Recipe found, but the ordered quantity is invalid.';

  const orderUnit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
  const weightGrams = item.weightGrams ?? resolveItemWeightGrams(item.itemId, item.itemName);
  if (recipe.outputUnit === 'kg' && orderUnit === 'pcs' && weightGrams == null) {
    return 'Recipe found in kg, but this order is in pcs and the packet weight is missing.';
  }
  if (recipe.outputUnit && recipe.outputUnit !== orderUnit && !(recipe.outputUnit === 'loaf' && orderUnit === 'pcs')) {
    return `Recipe output unit (${recipe.outputUnit}) does not match the order unit (${orderUnit}).`;
  }
  return 'Recipe found, but its raw materials could not be calculated.';
}

// ─── Rounding helper — rounds raw material quantities to nearest 0.05 ─────────
// e.g. 2.23 kg → 2.25 kg, 0.06 g → 0.10 g (practical kitchen measures)
function roundToNice(value: number): number {
  return Math.round(value / 0.05) * 0.05;
}

function fmtMatQty(quantity: number): string {
  const rounded = roundToNice(quantity);
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
}

function inputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayWindow(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(`${date}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}

function fmtMoney(value: number) {
  return `Rs ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtAuditQty(value: number) {
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 6 });
}

function AttachmentPreview({ name, dataUrl }: { name?: string; dataUrl?: string }) {
  if (!name && !dataUrl) return null;
  return (
    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
      <p className="mb-2 text-[10px] font-body font-bold uppercase tracking-wide text-amber-700">Cake Reference Image</p>
      {dataUrl ? (
        <a href={dataUrl} target="_blank" rel="noreferrer" className="block">
          <img src={dataUrl} alt={name || 'Cake reference'} className="max-h-48 w-full rounded-xl bg-white object-contain" />
        </a>
      ) : (
        <p className="text-xs font-body font-semibold text-amber-900">{name}</p>
      )}
      {name && <p className="mt-1 truncate text-[10px] font-body font-bold text-amber-800">{name}</p>}
    </div>
  );
}

// ─── Print helper (per-item) ──────────────────────────────────────────────────
function printItemRecipe(
  order: BakeryOrder,
  item: BakeryOrder['items'][number],
  mats: { material: string; quantity: number; unit: string }[],
) {
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (!printWindow) { window.alert('Popup blocked — please allow popups for this site to print.'); return; }

  const qtyLabel = item.dispatchUnit === 'pcs'
    ? `${item.originalPcs ?? item.quantity} pcs${item.originalPcs != null && item.weightGrams != null ? ` → ${item.quantity} kg` : ''}`
    : `${item.quantity} kg`;

  const matsHtml = mats.map(m => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #eee;">${m.material}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">
        ${fmtMatQty(m.quantity)} ${m.unit}
      </td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order #${order.orderNumber} – ${item.itemName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: auto; margin: 8mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; line-height: 1.25; }
        h1 { font-size: 16px; font-weight: 700; margin-bottom: 1px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 4px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; margin-left: 6px; }
        .qty { font-size: 13px; font-weight: 700; color: #111; margin: 6px 0 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        thead th { text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #888; border-bottom: 2px solid #e5e7eb; }
        thead th:last-child { text-align: right; }
        section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #888; margin-bottom: 8px; }
        .footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #aaa; text-align: center; }
      </style>
    </head>
    <body>
      <h1>${item.itemName}${order.targetBranch ? `<span class="badge">${order.targetBranch}</span>` : ''}</h1>
      <p class="sub">Order #${order.orderNumber} · Printed: ${new Date().toLocaleString('en-IN')}</p>
      <p class="qty">Quantity: ${qtyLabel}</p>

      ${mats.length > 0 ? `
      <section>
        <h2>Raw Materials Required</h2>
        <table>
          <thead><tr><th>Material</th><th>Quantity</th></tr></thead>
          <tbody>${matsHtml}</tbody>
        </table>
      </section>` : '<p style="color:#888;font-size:12px;">No recipe found for this item.</p>'}

      <div class="footer">Cafe Aadvikam · Store Recipe Sheet</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
}

// ─── Stock Units ──────────────────────────────────────────────────────────────
const UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
  { value: 'kg', label: 'KG' },
  { value: 'ltr', label: 'Ltr' },
  { value: 'pcs', label: 'Pcs' },
  { value: 'nos', label: 'Nos' },
  { value: 'bunch', label: 'Bunch' },
];
function toAllowedStockUnit(raw?: string): StockUnit {
  const u = (raw || '').trim().toLowerCase();
  if (u.startsWith('kg') || u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') return 'kg';
  if (u === 'l' || u === 'lt' || u === 'ltr' || u === 'litre' || u === 'liter' || u === 'ml') return 'ltr';
  if (u === 'nos' || u === 'no' || u === 'number') return 'nos';
  if (u === 'bunch') return 'bunch';
  return 'pcs';
}

function stockUnitLabel(unit: StockUnit | string): string {
  return UNIT_OPTIONS.find(u => u.value === unit)?.label ?? String(unit);
}

// ─── Item Row (per-item raw materials + stock status) ────────────────────────
function ItemRow({ order, item, category, selectionEnabled = false, selected = false, onToggle }: {
  order: BakeryOrder;
  item: BakeryOrder['items'][number];
  category: StoreOrderCategory;
  selectionEnabled?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const [showMats, setShowMats] = useState(false);
  const mats = matForItem(item);
  const hasMats = mats.length > 0;
  const recipeIssue = hasMats ? null : recipeIssueForItem(item);
  const { items: stockItems } = useStoreStockStore();

  // Check each recipe material against current inventory
  const matStatus = useMemo(() => {
    return mats.map(m => {
      const stock = stockItems.find(s => normaliseName(s.name) === normaliseName(m.material));
      if (!stock) return { status: 'unknown' as const, stock: null };
      // Convert recipe qty to stock unit for comparison
      let needed = m.quantity;
      const from = m.unit.toLowerCase();
      const to   = stock.unit.toLowerCase();
      if (from === 'g'  && to === 'kg')  needed = needed / 1000;
      if (from === 'kg' && to === 'g')   needed = needed * 1000;
      if (needed > stock.quantity) return { status: 'out' as const, stock };
      if (stock.quantity <= stock.minThreshold) return { status: 'low' as const, stock };
      return { status: 'ok' as const, stock };
    });
  }, [mats, stockItems]);

  const anyOut = matStatus.some(s => s.status === 'out');
  const anyLow = !anyOut && matStatus.some(s => s.status === 'low');

  return (
    <div className={cn(
      "rounded-xl border bg-muted/30 overflow-hidden",
      selected ? "border-primary bg-primary/5" : anyOut ? "border-red-300" : anyLow ? "border-amber-300" : "border-border"
    )}>
      {/* Item header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {selectionEnabled && <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${item.itemName}`} className="size-4 shrink-0 accent-primary" />}
        <span className="text-base leading-none shrink-0">
          {BAKERY_ITEMS.find(b => b.id === item.itemId)?.icon ?? '🍬'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-semibold text-foreground">{item.itemName}</p>
          <span className="mt-1 inline-flex rounded-md bg-background px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground ring-1 ring-border">{category}</span>
          {item.originalPcs != null && item.weightGrams != null && (
            <p className="text-[10px] font-body text-blue-600">
              {item.originalPcs} pcs → {item.quantity} kg
            </p>
          )}
          <AttachmentPreview name={item.attachmentName} dataUrl={item.attachmentDataUrl} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {anyOut && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> OUT OF STOCK
            </span>
          )}
          {anyLow && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> LOW
            </span>
          )}
          <p className="text-sm font-body font-bold tabular-nums text-foreground">
            {item.originalPcs != null && item.weightGrams != null
              ? `${item.quantity} kg`
              : `${item.quantity}${item.dispatchUnit === 'pcs' ? ' pcs' : ' kg'}`}
          </p>
        </div>
      </div>

      {!hasMats && recipeIssue && (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-body text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-bold">Recipe not shown</p>
            <p>{recipeIssue} Stock will not be deducted for this item.</p>
          </div>
        </div>
      )}

      {/* Raw materials toggle */}
      {hasMats && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setShowMats(v => !v)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 text-xs font-body font-semibold active:scale-[0.99]",
              anyOut ? "bg-red-50 text-red-700" : anyLow ? "bg-amber-50 text-amber-700" : "bg-primary/5 text-primary"
            )}
          >
            <div className="flex items-center gap-1.5">
              <Calculator className="size-3.5" />
              Raw materials ({mats.length} ingredients)
              {anyOut && <span className="text-[9px] font-bold">— check stock!</span>}
            </div>
            {showMats ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {showMats && (
            <>
              <div className="divide-y divide-border/50">
                {mats.map((m, i) => {
                  const s = matStatus[i];
                  return (
                    <div key={i} className={cn(
                      "flex items-center justify-between px-3 py-2",
                      s.status === 'out' ? "bg-red-50" : s.status === 'low' ? "bg-amber-50" : "bg-background"
                    )}>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {s.status === 'out' && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
                        {s.status === 'low' && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                        <span className={cn(
                          "text-sm font-body",
                          s.status === 'out' ? "text-red-700 font-semibold" : "text-foreground"
                        )}>{m.material}</span>
                        {/* Stock status badge */}
                        {s.status === 'out' && s.stock && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
                            Only {s.stock.quantity % 1 === 0 ? s.stock.quantity : s.stock.quantity.toFixed(2)} {s.stock.unit} left
                          </span>
                        )}
                        {s.status === 'unknown' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
                            Not in stock list
                          </span>
                        )}
                        {s.status === 'low' && s.stock && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                            Low: {s.stock.quantity % 1 === 0 ? s.stock.quantity : s.stock.quantity.toFixed(2)} {s.stock.unit}
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-body font-bold tabular-nums ml-2 shrink-0",
                        s.status === 'out' ? "text-red-700" : "text-foreground"
                      )}>
                        {fmtMatQty(m.quantity)} {m.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-border/40">
                <button
                  onClick={() => printItemRecipe(order, item, mats)}
                  className="w-full h-9 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-body font-semibold flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-primary/10 transition-all"
                >
                  <Printer className="size-3.5" />
                  Print Recipe Sheet
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Order Card ──────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: BakeryOrder }) {
  const { sendToBaker, acceptOrder } = useBakeryStore();
  const { deductMaterials } = useStoreStockStore();
  const bakeryItems = useBakeryItemsStore(s => s.items);
  const currentUser = useAuthStore(s => s.currentUser);

  const [expanded,   setExpanded]   = useState(true);
  const [accepting,  setAccepting]  = useState(false);
  const [accepted,   setAccepted]   = useState(order.status !== 'pending');
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(order.status !== 'pending' && order.status !== 'processing');
  const [sendError,  setSendError]  = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const sendRequest = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    setAccepted(order.status !== 'pending');
    setSent(order.status !== 'pending' && order.status !== 'processing');
  }, [order.status]);

  useEffect(() => {
    setSelectedIndexes(current => current.filter(index => index < order.items.length));
    sendRequest.current = null;
  }, [order.items]);

  const categorizedItems = useMemo(() => STORE_ORDER_CATEGORIES.map(category => ({
    category,
    items: order.items.map((item, index) => ({ item, index, category: storeOrderCategory(item, bakeryItems) })).filter(entry => entry.category === category),
  })).filter(group => group.items.length > 0), [order.items, bakeryItems]);

  const selectedEntries = useMemo(() => selectedIndexes
    .map(index => ({ item: order.items[index], index }))
    .filter((entry): entry is { item: BakeryOrder['items'][number]; index: number } => Boolean(entry.item)), [selectedIndexes, order.items]);

  const handleAccept = async () => {
    setAccepting(true); setSendError(null);
    try {
      await acceptOrder(order.id);
      setAccepted(true);
    } catch {
      setSendError('Failed to accept — please try again.');
    } finally {
      setAccepting(false);
    }
  };

  // Collect all materials across items for stock deduction on send
  const allMats = useMemo(() => {
    const combined: { material: string; quantity: number; unit: string }[] = [];
    for (const { item } of selectedEntries) {
      for (const m of matForItem(item)) {
        const existing = combined.find(x => x.material === m.material);
        if (existing) existing.quantity = parseFloat((existing.quantity + m.quantity).toFixed(4));
        else combined.push({ ...m });
      }
    }
    return combined;
  }, [selectedEntries]);

  // Bug 1 fix: anyOut must be computed in OrderCard scope (was only defined in ItemRow)
  const { items: stockItems } = useStoreStockStore();
  const anyOut = useMemo(() => {
    for (const { item } of selectedEntries) {
      const mats = matForItem(item);
      for (const m of mats) {
        const stock = stockItems.find(s => normaliseName(s.name) === normaliseName(m.material));
        if (!stock) continue;
        let needed = m.quantity;
        const from = m.unit.toLowerCase();
        const to   = stock.unit.toLowerCase();
        if (from === 'g'  && to === 'kg')  needed /= 1000;
        if (from === 'kg' && to === 'g')   needed *= 1000;
        if (needed > stock.quantity) return true;
      }
    }
    return false;
  }, [selectedEntries, stockItems]);

  const handleSendToBaker = async () => {
    if (sent || selectedIndexes.length === 0) return;
    setSending(true); setSendError(null); setSendNotice(null);
    try {
      const signature = [...selectedIndexes].sort((a, b) => a - b).join(',');
      if (!sendRequest.current || sendRequest.current.signature !== signature) {
        sendRequest.current = { signature, id: crypto.randomUUID() };
      }
      const result = await sendToBaker(order.id, selectedIndexes, sendRequest.current.id);
      setSent(result.remainingCount === 0);

      // Deduct only the selected lines after the atomic Baker send succeeds.
      if (allMats.length > 0) {
        const ctx: DeductionContext = {
          orderId:     order.id,
          orderNumber: order.orderNumber ?? order.id,
          deductedBy:  currentUser?.displayName ?? 'Store',
        };
        const warn = await deductMaterials(
          allMats.map(m => ({ name: m.material, qty: m.quantity, unit: m.unit })), // BUG-FIX: pass unit
          ctx,
        );
        if (warn) console.warn('Stock deduction note:', warn);
      }
      setSelectedIndexes([]);
      sendRequest.current = null;
      setSendNotice(result.remainingCount > 0
        ? `${selectedEntries.length} selected item${selectedEntries.length === 1 ? '' : 's'} sent to Baker. ${result.remainingCount} item${result.remainingCount === 1 ? '' : 's'} remain in this Store order.`
        : 'All selected items were sent to Baker.');
    } catch (sendFailure) {
      setSendError(sendFailure instanceof Error ? sendFailure.message : 'Failed to send selected items. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const branchColor: Record<string, string> = {
    VRSNB: 'bg-blue-50 text-blue-700 border-blue-200',
    SNB:   'bg-amber-50 text-amber-700 border-amber-200',
    Hosur: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  const toggleIndex = (index: number) => {
    setSendError(null);
    setSendNotice(null);
    setSelectedIndexes(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index]);
  };

  const toggleCategory = (indexes: number[]) => {
    const allSelected = indexes.every(index => selectedIndexes.includes(index));
    setSelectedIndexes(current => allSelected
      ? current.filter(index => !indexes.includes(index))
      : Array.from(new Set([...current, ...indexes])));
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
            {accepted && !sent && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                Accepted at Store
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
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2.5">
          {accepted && !sent && <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">Select the items to send now. Unselected items will remain in this Store order.</p>}

          {categorizedItems.map(group => {
            const groupIndexes = group.items.map(entry => entry.index);
            const allGroupSelected = groupIndexes.every(index => selectedIndexes.includes(index));
            return <section key={group.category} className="space-y-2 rounded-xl border border-border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2"><span className="text-xs font-black text-foreground">{group.category}</span><span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{group.items.length}</span></div>
                {accepted && !sent && <button type="button" onClick={() => toggleCategory(groupIndexes)} className="text-[10px] font-bold text-primary hover:underline">{allGroupSelected ? 'Clear category' : 'Select category'}</button>}
              </div>
              {group.items.map(({ item, index, category }) => <ItemRow
                key={`${item.itemId}-${index}`}
                order={order}
                item={item}
                category={category}
                selectionEnabled={accepted && !sent}
                selected={selectedIndexes.includes(index)}
                onToggle={() => toggleIndex(index)}
              />)}
            </section>;
          })}

          {accepted && !sent && selectedEntries.length > 0 && <div className="overflow-hidden rounded-xl border border-primary/20 bg-card">
            <div className="flex items-center justify-between bg-primary/5 px-3 py-2"><p className="text-xs font-black text-primary">Selected for Baker</p><span className="text-[10px] font-bold text-primary">{selectedEntries.length} item{selectedEntries.length === 1 ? '' : 's'}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-xs">
              <thead className="bg-muted/40 text-left text-[9px] uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Quantity</th><th className="w-10"></th></tr></thead>
              <tbody>{selectedEntries.map(({ item, index }) => <tr key={`${item.itemId}-${index}`} className="border-t border-border"><td className="px-3 py-2 font-semibold">{item.itemName}</td><td className="px-3 py-2 text-muted-foreground">{storeOrderCategory(item, bakeryItems)}</td><td className="px-3 py-2 text-right font-bold">{item.quantity} {item.dispatchUnit || 'kg'}</td><td className="px-2 py-1"><button type="button" onClick={() => toggleIndex(index)} title="Remove selection" className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><X className="size-3.5" /></button></td></tr>)}</tbody>
            </table></div>
          </div>}

          {sendError && <p className="text-xs font-body text-destructive text-center pt-1">{sendError}</p>}
          {sendNotice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">{sendNotice}</p>}
          {anyOut && selectedEntries.length > 0 && <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">One or more selected recipes need more stock. Review the ingredient warnings before sending.</p>}

          {!accepted ? (
            <button onClick={handleAccept} disabled={accepting}
              className="w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 mt-1 cafe-gradient text-primary-foreground shadow-md">
              {accepting
                ? <Loader2 className="size-4 animate-spin" />
                : <><CheckCircle2 className="size-4" /> Accept Order</>}
            </button>
          ) : (
            <button onClick={handleSendToBaker} disabled={sending || sent || selectedEntries.length === 0}
              className={cn(
                'w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 mt-1',
                sent ? 'bg-emerald-100 text-emerald-700' : 'cafe-gradient text-primary-foreground shadow-md'
              )}>
              {sending
                ? <Loader2 className="size-4 animate-spin" />
                : sent
                ? <><CheckCircle2 className="size-4" /> Sent to Baker</>
                : selectedEntries.length === 0
                ? <>Select Items to Send</>
                : <><ArrowRight className="size-4" /> Send {selectedEntries.length} Selected Item{selectedEntries.length === 1 ? '' : 's'} to Baker</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stock Row ────────────────────────────────────────────────────────────────
function StockRow({ item, onEdit, onDelete }: { item: StockItem; onEdit: (i: StockItem) => void; onDelete: (id: string) => void }) {
  const isNegative = item.quantity < 0;
  const isLow = !isNegative && item.quantity <= item.minThreshold;
  const suppliers = useMemo(() => getSuppliersForItem(item.name), [item.name]);
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-all',
      isNegative ? 'bg-red-100 border-red-400' : isLow ? 'bg-red-50 border-red-200' : 'bg-card border-border'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {(isNegative || isLow) && <AlertTriangle className={cn('size-3 shrink-0', isNegative ? 'text-red-700' : 'text-red-500')} />}
          <span className="text-sm font-body font-semibold text-foreground truncate">{item.name}</span>
        </div>
        <p className="text-[10px] font-body text-muted-foreground">
          Min: {item.minThreshold} {item.unit}
          {isNegative && <span className="text-red-700 font-bold ml-1.5">NEGATIVE — RESTOCK NEEDED</span>}
          {isLow && <span className="text-red-600 font-bold ml-1.5">LOW</span>}
          {suppliers.length > 0 && <span className="text-primary font-semibold ml-1.5">· {suppliers.join(', ')}</span>}
        </p>
      </div>
      <span className={cn(
        'text-sm font-body font-bold tabular-nums px-2.5 py-1 rounded-lg',
        isNegative ? 'text-red-800 bg-red-200' : isLow ? 'text-red-700 bg-red-100' : 'text-primary bg-primary/10'
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
function AddItemModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, unit: StockUnit, qty: number, min: number, suppliers: string[]) => Promise<void> }) {
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
      unit: toAllowedStockUnit(m.uom),
      category: m.category,
      suppliers: m.suppliers,
    }));
    // Recipe materials not already in master list
    const q = search.toLowerCase();
    const recipeSugs = recipeMats.filter(m => {
      const added = existingItems.some(e => normaliseName(e.name) === normaliseName(m.name));
      const inMaster = masterItems.some(x => normaliseName(x.name) === normaliseName(m.name));
      return !added && !inMaster && (q === '' || m.name.toLowerCase().includes(q));
    }).map(m => ({ name: m.name, unit: toAllowedStockUnit(m.unit), category: 'Recipe', suppliers: [] as string[] }));
    return [...masterItems, ...recipeSugs].slice(0, 50);
  }, [recipeMats, existingItems, search]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    const q = parseFloat(qty), m = parseFloat(min);
    if (isNaN(q) || q < 0 || isNaN(m) || m < 0) { setError('Invalid quantity or minimum'); return; }
    setSaving(true); setError('');
    try {
      await onSave(name, unit, q, m, selectedSuppliers);
      onClose();
    } catch {
      setError('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-24 space-y-4" onClick={e => e.stopPropagation()}>
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
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ml-2">{stockUnitLabel(s.unit)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNIT_OPTIONS.map(({ value, label }) => (
              <button key={value} onClick={() => setUnit(value)}
                className={cn('px-3 py-2 rounded-xl border text-xs font-body font-semibold transition-all',
                  unit === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/40')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Stock ({stockUnitLabel(unit)})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Low Alert ({stockUnitLabel(unit)})</label>
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
    setSaving(true);
    try {
      await onSave({ quantity: q, minThreshold: m, unit });
      onClose();
    } catch {
      // silent — parent shows errors via its own mechanism
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-24 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-3" />
        <div className="flex items-center justify-between">
          <div><h3 className="font-display font-bold text-foreground">{item.name}</h3><p className="text-[10px] font-body text-muted-foreground">Update stock</p></div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Unit</label>
          <div className="flex gap-2 flex-wrap">
            {UNIT_OPTIONS.map(({ value, label }) => (<button key={value} onClick={() => setUnit(value)} className={cn('px-3 py-2 rounded-xl border text-xs font-body font-semibold transition-all', unit === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground')}>{label}</button>))}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Stock ({stockUnitLabel(unit)})</label>
            <input type="number" min={0} step={0.1} value={qty} onChange={e => setQty(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Low Alert ({stockUnitLabel(unit)})</label>
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

// ─── Inline Deductions view (used inside Inventory tab) ──────────────────────
interface InvDeductionRow {
  id: string; orderNumber: string; materialName: string;
  quantityDeducted: number; unit: string;
  stockBefore: number; stockAfter: number;
  deductedBy: string; deductedAt: string;
}

function InlineDeductionsView() {
  const [rows, setRows]       = useState<InvDeductionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const from = new Date(today); from.setHours(0,0,0,0);
    const to   = new Date(today); to.setHours(23,59,59,999);
    const { data, error } = await supabase
      .from('store_material_deductions')
      .select('id, order_number, material_name, quantity_deducted, unit, stock_before, stock_after, deducted_by, deducted_at')
      .gte('deducted_at', from.toISOString())
      .lte('deducted_at', to.toISOString())
      .order('deducted_at', { ascending: false });
    if (!error && data) {
      setRows(data.map((r: Record<string, unknown>) => ({
        id:               r.id as string,
        orderNumber:      r.order_number as string,
        materialName:     r.material_name as string,
        quantityDeducted: Number(r.quantity_deducted),
        unit:             r.unit as string,
        stockBefore:      Number(r.stock_before),
        stockAfter:       Number(r.stock_after),
        deductedBy:       (r.deducted_by as string) ?? '—',
        deductedAt:       r.deducted_at as string,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 2 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => r.materialName.toLowerCase().includes(q) || r.orderNumber.includes(q)) : rows;
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by material or order #…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={load} disabled={loading}
          className="size-10 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90">
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      <p className="text-[10px] font-body text-muted-foreground px-1">
        Showing today's deductions. For full history go to Reports → Deductions.
      </p>

      {loading && <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
          <MinusCircle className="size-10 opacity-20" />
          <p className="text-sm font-body">No deductions recorded today.</p>
          <p className="text-[11px] font-body text-center">Deductions appear here when you tap "Send to Baker".</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {filtered.map((r, i) => {
            const isNeg = r.stockAfter < 0;
            return (
              <div key={r.id} className={cn(
                'px-4 py-3 flex items-start gap-3 border-b border-border last:border-0',
                i % 2 === 0 ? 'bg-card' : 'bg-muted/20'
              )}>
                <div className={cn('size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', isNeg ? 'bg-red-100' : 'bg-amber-50')}>
                  <MinusCircle className={cn('size-3.5', isNeg ? 'text-red-600' : 'text-amber-600')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-body font-bold text-foreground truncate">{r.materialName}</p>
                    {isNeg && (
                      <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        NEGATIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-body font-semibold text-foreground mt-0.5">
                    −{r.quantityDeducted % 1 === 0 ? r.quantityDeducted : r.quantityDeducted.toFixed(3)}{' '}
                    <span className="font-normal text-muted-foreground">{r.unit}</span>
                    <span className="text-muted-foreground font-normal ml-2 text-[10px]">
                      ({r.stockBefore.toFixed(2)} → <span className={isNeg ? 'text-red-600 font-bold' : ''}>{r.stockAfter.toFixed(2)}</span> {r.unit})
                    </span>
                  </p>
                  <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                    Order #{r.orderNumber} · {r.deductedBy} · {new Date(r.deductedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────
function StoreInventoryTab() {
  const { items, loaded, loading, load, addItem, updateItem, deleteItem, bulkImportFromRecipes } = useStoreStockStore();
  const { pushStoreItemChange } = useNotificationStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editItem, setEditItem]     = useState<StockItem | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importToast, setImportToast] = useState<{ added: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [stockView, setStockView]   = useState<'all' | 'low'>('all');

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const result = await bulkImportFromRecipes();
      if (result.error) {
        setImportError(result.error);
      } else {
        setImportToast({ added: result.added, skipped: result.skipped });
        setTimeout(() => setImportToast(null), 4000);
      }
    } catch {
      setImportError('Import failed — please try again.');
    } finally {
      setImporting(false);
    }
  };

  const negativeItems = items.filter(i => i.quantity < 0);
  const lowItems = items.filter(i => i.quantity >= 0 && i.quantity <= i.minThreshold);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = stockView === 'low' ? lowItems : items;
    return base.filter(i => !q || i.name.toLowerCase().includes(q));
  }, [items, lowItems, search, stockView]);

  const actor = currentUser?.displayName || currentUser?.username || 'Store user';
  const notifyStockChange = async (action: 'created' | 'updated', itemId: string, itemName: string, summary: string) => {
    await pushStoreItemChange({ action, itemId, itemName, category: summary, changedBy: actor });
  };

  return (
    <div className="space-y-3">
      {/* Sub-tab switcher: All / Low Stock */}
      <div className="flex gap-1 bg-muted/60 p-1 rounded-xl">
        <button
          onClick={() => setStockView('all')}
          className={cn(
            'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all',
            stockView === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          All Stock
          <span className="ml-1 text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded-full">{items.length}</span>
        </button>
        <button
          onClick={() => setStockView('low')}
          className={cn(
            'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all flex items-center justify-center gap-1',
            stockView === 'low'
              ? 'bg-red-600 text-white shadow-sm'
              : (lowItems.length > 0 || negativeItems.length > 0)
              ? 'text-red-600 hover:bg-red-50'
              : 'text-muted-foreground'
          )}
        >
          <AlertTriangle className="size-3" />
          Low/Neg
          {(lowItems.length + negativeItems.length) > 0 && (
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
              stockView === 'low' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
            )}>{lowItems.length + negativeItems.length}</span>
          )}
        </button>
      </div>

      {/* Stock list views */}
      <>
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

          {stockView === 'all' && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: items.length, color: 'text-foreground' },
                { label: 'Negative', value: negativeItems.length, color: negativeItems.length > 0 ? 'text-red-700' : 'text-muted-foreground', bg: negativeItems.length > 0 ? 'bg-red-100 border-red-300' : '' },
                { label: 'Low Stock', value: lowItems.length, color: lowItems.length > 0 ? 'text-red-600' : 'text-muted-foreground', bg: lowItems.length > 0 ? 'bg-red-50 border-red-200' : '' },
              ].map(s => (
                <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
                  <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {stockView === 'low' && (lowItems.length + negativeItems.length) === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
              <CheckCircle2 className="size-10 text-emerald-500 opacity-60" />
              <p className="text-sm font-body font-semibold text-emerald-700">All stock levels are OK!</p>
            </div>
          )}

          {importError && <p className="text-xs font-body text-destructive px-1">{importError}</p>}
          {importToast && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-body text-emerald-700">Imported {importToast.added} items, skipped {importToast.skipped} existing.</p>
            </div>
          )}

          {loading && !loaded
            ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            : (() => {
                const displayList = stockView === 'low' ? [...negativeItems, ...lowItems] : filtered;
                return displayList.length === 0 && !(stockView === 'low' && (lowItems.length + negativeItems.length) === 0)
                  ? <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                      <Warehouse className="size-10 opacity-20" />
                      <p className="text-sm font-body">{items.length === 0 ? 'No ingredients yet — tap Add' : 'No matches'}</p>
                    </div>
                  : <div className="space-y-2">
                      {displayList.map(i => (
                        <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={async (id) => {
                          const item = items.find(row => row.id === id);
                          await deleteItem(id);
                          if (item) await notifyStockChange('updated', item.id, item.name, `archived from store stock by ${actor}`);
                        }} />
                      ))}
                    </div>;
              })()
          }
        </>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onSave={async (n, u, q, m, suppliers) => {
        const before = items.length;
        const err = await addItem(n, u, q, m, suppliers);
        if (!err) {
          const created = useStoreStockStore.getState().items.find(item => normaliseName(item.name) === normaliseName(n));
          await notifyStockChange('created', created?.id || n, n, `stock ${q} ${u}, low alert ${m}`);
        }
        if (err || useStoreStockStore.getState().items.length === before) console.warn('[StoreInventoryTab] stock add note:', err);
      }} />}
      {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={async (u) => {
        const before = editItem;
        const err = await updateItem(editItem.id, u);
        if (!err) {
          const qtyNote = u.quantity !== undefined ? `stock ${before.quantity} ${before.unit} to ${u.quantity} ${u.unit || before.unit}` : 'details changed';
          await notifyStockChange('updated', before.id, before.name, qtyNote);
        }
        setEditItem(null);
        if (err) console.warn('[StoreInventoryTab] stock update failed:', err);
      }} />}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
function OrdersTab() {
  const { orders, fetchOrders, subscribe: subscribeOrders } = useBakeryStore();
  const { load: loadStock, subscribe: subscribeStock } = useStoreStockStore();
  const { loadAllItems, subscribe: subscribeBakeryItems } = useBakeryItemsStore();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    loadStock();
    void loadAllItems();
    const unsubOrders = subscribeOrders();
    const unsubStock  = subscribeStock();
    const unsubBakeryItems = subscribeBakeryItems();
    return () => { unsubOrders(); unsubStock(); unsubBakeryItems(); };
  }, [fetchOrders, loadStock, loadAllItems, subscribeOrders, subscribeStock, subscribeBakeryItems]);

  const pending = orders.filter(o => o.status === 'pending' || o.status === 'processing');

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await fetchOrders(true, true); } finally { setRefreshing(false); }
  };

  const downloadExcel = () => {
    const rows: string[][] = [
      ['Order #', 'Status', 'Branch', 'Item', 'Quantity', 'Unit', 'Created At'],
    ];
    for (const o of pending) {
      for (const item of o.items) {
        rows.push([
          String(o.orderNumber),
          o.status,
          o.targetBranch ?? '',
          item.itemName,
          String(item.quantity),
          item.dispatchUnit ?? 'pcs',
          new Date(o.createdAt).toLocaleString('en-IN'),
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pending-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printAllOrders = () => {
    const rows = pending.map(o => `
      <tr class="order-header">
        <td colspan="4"><strong>Order #${o.orderNumber}</strong> &nbsp;
          ${o.targetBranch ? `<span class="branch">${o.targetBranch}</span>` : ''}
          <span class="time">${new Date(o.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </td>
      </tr>
      ${o.items.map(item => `
        <tr>
          <td style="padding-left:24px">${item.itemName}</td>
          <td>${item.quantity} ${item.dispatchUnit ?? 'pcs'}</td>
          <td>${o.status}</td>
          <td>${o.targetBranch ?? '—'}</td>
        </tr>
      `).join('')}
    `).join('');

    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Pending Orders — ${new Date().toLocaleDateString('en-IN')}</title>
      <style>
        body { font-family: sans-serif; font-size: 13px; margin: 24px; color: #111; }
        h2 { margin: 0 0 8px; }
        p.sub { color: #666; font-size: 11px; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f5; border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
        td { border: 1px solid #eee; padding: 5px 10px; }
        tr.order-header td { background: #fff8e1; font-weight: bold; border-top: 2px solid #e0c040; }
        .branch { background: #e3f0ff; color: #1a56c4; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
        .time { color: #888; font-size: 11px; margin-left: 8px; font-weight: normal; }
        @media print { body { margin: 8px; } }
      </style>
    </head><body>
      <h2>Pending Orders</h2>
      <p class="sub">Printed: ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp; ${pending.length} order${pending.length !== 1 ? 's' : ''}</p>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Status</th><th>Branch</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  if (initialLoading) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      {/* Export / Print header bar */}
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-body font-bold text-muted-foreground uppercase flex-1">
          {pending.length} Pending Order{pending.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => void refreshNow()}
          disabled={refreshing}
          className="h-8 px-3 rounded-xl border border-border bg-card text-xs font-body font-semibold flex items-center gap-1.5 disabled:cursor-wait disabled:opacity-60 hover:bg-muted transition-colors active:scale-95"
        >
          <RefreshCw className={cn('size-3.5 text-primary', refreshing && 'animate-spin')} /> Refresh
        </button>
        <button
          onClick={downloadExcel}
          disabled={pending.length === 0}
          className="h-8 px-3 rounded-xl border border-border bg-card text-xs font-body font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-muted transition-colors active:scale-95"
        >
          <Download className="size-3.5 text-emerald-600" /> Excel
        </button>
        <button
          onClick={printAllOrders}
          disabled={pending.length === 0}
          className="h-8 px-3 rounded-xl border border-border bg-card text-xs font-body font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:bg-muted transition-colors active:scale-95"
        >
          <Printer className="size-3.5 text-primary" /> Print All
        </button>
      </div>

      {pending.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2"><Flame className="size-3.5 text-amber-500" /><p className="text-xs font-body font-bold text-muted-foreground uppercase">New Orders</p></div>
          {pending.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
      {pending.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-4">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><Store className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No new orders</p><p className="text-xs font-body text-muted-foreground mt-1">Orders already sent to baker are now in History</p></div>
        </div>
      )}
    </>
  );
}

function StoreHistoryTab() {
  const { orders, fetchOrders, subscribe: subscribeOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const unsubOrders = subscribeOrders();
    return () => unsubOrders();
  }, [fetchOrders, subscribeOrders]);

  const historyOrders = orders.filter(o => ['baking', 'partially_packed', 'packed', 'dispatched'].includes(o.status));

  if (initialLoading) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h3 className="font-display text-lg font-bold text-foreground">Orders Sent To Baker</h3>
        </div>
        <p className="text-xs font-body text-muted-foreground mt-1">In progress, packed and dispatched orders stay here for store follow-up.</p>
      </div>

      {historyOrders.length > 0 ? (
        <div className="space-y-2">
          {historyOrders.map(o => <OrderCard key={o.id} order={o} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center py-24 gap-4 rounded-3xl border border-border bg-card">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><History className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No sent orders yet</p><p className="text-xs font-body text-muted-foreground mt-1">Once a new order is sent to baker, it moves here.</p></div>
        </div>
      )}
    </div>
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
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, field, placeholder, type = 'text' }: { label: string; field: keyof SupplierFormData; placeholder?: string; type?: string }) => (
    <div>
      <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">{label}</label>
      <input type={type} value={form[field]} onChange={e => set(field)(e.target.value)} placeholder={placeholder}
        className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-24 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

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

interface StoreAutoDeductionRow {
  id: string;
  orderNumber: string;
  materialName: string;
  quantityDeducted: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
  deductedBy: string | null;
}

interface StoreCustomDeductionRow {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  reason: string;
  deductedBy: string | null;
}

function StoreDailyClosureTab() {
  const { invoices, loaded: invoicesLoaded, load: loadInvoices } = useInvoiceStore();
  const [date, setDate] = useState(inputDate(new Date()));
  const [autoRows, setAutoRows] = useState<StoreAutoDeductionRow[]>([]);
  const [customRows, setCustomRows] = useState<StoreCustomDeductionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadClosure = useCallback(async () => {
    const { from, to } = dayWindow(date);
    setLoading(true);
    try {
      const [autoRes, customRes] = await Promise.all([
        supabase
          .from('store_material_deductions')
          .select('id, order_number, material_name, quantity_deducted, unit, stock_before, stock_after, deducted_by')
          .gte('deducted_at', from)
          .lte('deducted_at', to)
          .order('deducted_at', { ascending: false }),
        supabase
          .from('store_custom_deductions')
          .select('id, item_name, quantity, unit, reason, deducted_by')
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: false }),
      ]);

      setAutoRows((autoRes.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        orderNumber: String(r.order_number ?? ''),
        materialName: String(r.material_name ?? ''),
        quantityDeducted: Number(r.quantity_deducted ?? 0),
        unit: String(r.unit ?? ''),
        stockBefore: Number(r.stock_before ?? 0),
        stockAfter: Number(r.stock_after ?? 0),
        deductedBy: (r.deducted_by as string) ?? null,
      })));

      setCustomRows((customRes.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        itemName: String(r.item_name ?? ''),
        quantity: Number(r.quantity ?? 0),
        unit: String(r.unit ?? ''),
        reason: String(r.reason ?? ''),
        deductedBy: (r.deducted_by as string) ?? null,
      })));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { if (!invoicesLoaded) loadInvoices(); }, [invoicesLoaded, loadInvoices]);
  useEffect(() => { loadClosure(); }, [loadClosure]);

  const invoicesToday = invoices.filter(inv => inputDate(new Date(inv.createdAt)) === date);
  const invoiceTotal = invoicesToday.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);
  const pendingInvoices = invoicesToday.filter(inv => inv.status === 'pending_review').length;

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <WalletCards className="size-4 text-primary" />
              <h3 className="font-display text-lg font-bold text-foreground">Store Daily Closure</h3>
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1">Daily summary of store deductions and invoices added.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              max={inputDate(new Date())}
              onChange={e => setDate(e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={loadClosure} className="size-10 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-muted">
              <RefreshCw className={cn('size-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Recipe Deductions', value: autoRows.length, sub: 'Sent to baker stock cuts' },
          { label: 'Custom Deductions', value: customRows.length, sub: 'Manual store removals' },
          { label: 'Invoices Added', value: invoicesToday.length, sub: `${pendingInvoices} pending review` },
          { label: 'Invoice Value', value: fmtMoney(invoiceTotal), sub: 'Bills entered today' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
            <p className="font-display text-xl font-bold text-foreground mt-1">{card.value}</p>
            <p className="text-[10px] font-body text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <h4 className="text-sm font-body font-bold text-foreground">Recipe Deductions</h4>
          <div className="mt-3 space-y-2">
            {autoRows.length === 0 ? <p className="text-xs font-body text-muted-foreground py-6 text-center">No recipe deductions for this date.</p> : autoRows.map(row => (
              <div key={row.id} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-body font-bold text-foreground">{row.materialName}</p>
                    <p className="text-[11px] font-body text-muted-foreground">Order #{row.orderNumber} - {row.deductedBy ?? 'Store'}</p>
                  </div>
                  <p className="text-sm font-body font-bold text-red-600">-{fmtAuditQty(row.quantityDeducted)} {row.unit}</p>
                </div>
                <p className="text-[10px] font-body text-muted-foreground mt-2">Stock: {fmtAuditQty(row.stockBefore)} -&gt; {fmtAuditQty(row.stockAfter)} {row.unit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <h4 className="text-sm font-body font-bold text-foreground">Custom Deductions</h4>
          <div className="mt-3 space-y-2">
            {customRows.length === 0 ? <p className="text-xs font-body text-muted-foreground py-6 text-center">No custom deductions for this date.</p> : customRows.map(row => (
              <div key={row.id} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-body font-bold text-foreground">{row.itemName}</p>
                    <p className="text-[11px] font-body text-muted-foreground">{row.reason}</p>
                  </div>
                  <p className="text-sm font-body font-bold text-orange-600">-{row.quantity} {row.unit}</p>
                </div>
                <p className="text-[10px] font-body text-muted-foreground mt-2">By {row.deductedBy ?? 'Store'}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <h4 className="text-sm font-body font-bold text-foreground">Invoices Added</h4>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {invoicesToday.length === 0 ? <p className="text-xs font-body text-muted-foreground py-6 text-center md:col-span-2">No invoices added for this date.</p> : invoicesToday.map(inv => (
            <div key={inv.id} className="rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-body font-bold text-foreground">{inv.invoiceNumber}</p>
                  <p className="text-[11px] font-body text-muted-foreground">{inv.supplierName} - {inv.lineItems.length} items</p>
                </div>
                <p className="text-sm font-body font-bold text-foreground">{fmtMoney(inv.grandTotal)}</p>
              </div>
              <p className="text-[10px] font-body font-bold uppercase text-muted-foreground mt-2">{inv.status.replace('_', ' ')}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoreDashboard() {
  const [searchParams] = useSearchParams();
  const recipes = useRecipeStore((state) => state.recipes);
  const { loadRecipes, subscribe: subscribeRecipes } = useRecipeStore();
  const { orders } = useBakeryStore();
  const { items: stockItems } = useStoreStockStore();
  const { suppliers } = useSupplierStore();
  const { invoices, loaded: invLoaded, load: loadInvoices } = useInvoiceStore();

  useEffect(() => { if (!invLoaded) loadInvoices(); }, [invLoaded, loadInvoices]);
  useEffect(() => { void loadRecipes(); return subscribeRecipes(); }, [loadRecipes, subscribeRecipes]);
  void recipes;

  const requestedTab = searchParams.get('tab') as StoreDashboardTab | null;
  const tab: StoreDashboardTab = requestedTab && STORE_TABS.includes(requestedTab) ? requestedTab : 'orders';
  const pending    = orders.filter(o => o.status === 'pending' || o.status === 'processing');
  const sentOrders = orders.filter(o => ['baking','partially_packed','packed','dispatched'].includes(o.status));
  const uniqueStockItems = useMemo(() => {
    const byName = new Map<string, typeof stockItems[number]>();
    stockItems.forEach((item) => {
      const key = normaliseName(item.name);
      const existing = byName.get(key);
      if (!existing || String(item.id).localeCompare(String(existing.id)) > 0) byName.set(key, item);
    });
    return Array.from(byName.values());
  }, [stockItems]);
  const lowStock   = uniqueStockItems.filter(i => i.quantity <= i.minThreshold);
  const pendingInv = invoices.filter(i => i.status === 'pending_review').length;

  const tabs = [
    { id: 'orders',    label: 'Orders',             description: 'Baker queue',        icon: Package,     badge: pending.length > 0 ? String(pending.length) : null, badgeColor: 'bg-amber-500' },
    { id: 'history',   label: 'History',            description: 'Sent to baker',      icon: History,     badge: sentOrders.length > 0 ? String(sentOrders.length) : null, badgeColor: 'bg-emerald-500' },
    { id: 'inventory', label: 'Inventory',          description: 'Raw stock control',  icon: Warehouse,   badge: lowStock.length > 0 ? String(lowStock.length) : null, badgeColor: 'bg-red-500' },
    { id: 'suppliers', label: 'Suppliers',          description: 'Vendor directory',   icon: Truck,       badge: suppliers.length > 0 ? String(suppliers.length) : null, badgeColor: 'bg-primary' },
    { id: 'invoices',  label: 'Invoices',           description: 'Bills & reviews',    icon: FileText,    badge: pendingInv > 0 ? String(pendingInv) : null, badgeColor: 'bg-orange-500' },
    { id: 'analytics', label: 'Analytics',          description: 'Stock insights',     icon: Calculator,  badge: null, badgeColor: '' },
    { id: 'custom',    label: 'Custom',             description: 'Manual planning',    icon: ShoppingBag, badge: null, badgeColor: '' },
    { id: 'closure',   label: 'Daily Closure',       description: 'Deductions & bills', icon: WalletCards, badge: null, badgeColor: '' },
    { id: 'report',    label: 'Reports',            description: 'History & exports',  icon: BarChart2,   badge: null, badgeColor: '' },
    { id: 'recipes',   label: 'Recipe Management', description: 'Items & formulas',   icon: ChefHat,     badge: null, badgeColor: '' },
  ] as const;

  const activeTab = tabs.find(t => t.id === tab) ?? tabs[0];
  const ActiveIcon = activeTab.icon;

  return (
    <div className="dashboard-screen min-h-[100dvh] bg-transparent pb-24">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6 py-4">
        <main className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-border bg-card/90 shadow-soft px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-11 rounded-2xl cafe-gradient text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                    <ActiveIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest">Store</p>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">{activeTab.label}</h2>
                    <p className="text-xs font-body text-muted-foreground mt-0.5">{activeTab.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                  <div className="rounded-2xl border border-border bg-background px-3 py-2 text-center">
                    <p className="font-display text-lg font-bold text-foreground">{pending.length}</p>
                    <p className="text-[9px] font-body font-bold uppercase text-muted-foreground">Orders</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-3 py-2 text-center">
                    <p className={cn('font-display text-lg font-bold', lowStock.length > 0 ? 'text-red-600' : 'text-foreground')}>{lowStock.length}</p>
                    <p className="text-[9px] font-body font-bold uppercase text-muted-foreground">Low Stock</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-3 py-2 text-center">
                    <p className={cn('font-display text-lg font-bold', pendingInv > 0 ? 'text-orange-600' : 'text-foreground')}>{pendingInv}</p>
                    <p className="text-[9px] font-body font-bold uppercase text-muted-foreground">Invoices</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden">
              {tab === 'orders'    && <OrdersTab />}
              {tab === 'history'   && <StoreHistoryTab />}
              {tab === 'inventory' && <StoreInventoryTab />}
              {tab === 'suppliers' && <SuppliersTab />}
              {tab === 'invoices'  && <InvoiceTab />}
              {tab === 'analytics' && <StoreAnalyticsTab />}
              {tab === 'custom'    && <StoreCustomTab />}
              {tab === 'closure'   && <StoreDailyClosureTab />}
              {tab === 'report'    && <StoreReportTab />}
              {tab === 'recipes'   && <RecipeManagement embedded storeMode />}
            </div>
          </main>
        </div>
    </div>
  );
}
