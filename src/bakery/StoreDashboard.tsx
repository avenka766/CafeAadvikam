// src/bakery/StoreDashboard.tsx (Redesigned)
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Store, Calculator, ChevronDown, ChevronUp, ArrowRight,
  Loader2, CheckCircle2, Package,
  Warehouse, Plus, Pencil, Trash2, AlertTriangle,
  Search, X, Check, RefreshCw, Flame,
  Printer, Truck, Mail, MapPin, ShoppingBag, BarChart2, MinusCircle,
  History, WalletCards, Download, FileText, Calendar, ClipboardList,
} from 'lucide-react';
import { Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import { useRecipeStore } from './recipeStore';
// Every raw-material requirement shown on this dashboard (the "Raw
// materials (N ingredients)" panel below, the Baker-send material total)
// goes through matForItem (materialCalc.ts), which itself calls
// useRecipeStore.getState().calculateMaterials() — the same live,
// bakery_recipes-backed calculation bakeryStore.ts's deduction pipeline
// uses. Routed through that shared wrapper rather than calling
// calculateMaterials directly here so Store's displayed requirement and
// the actual deduction can never drift into two separate implementations.
import { useBakeryItemsStore } from './bakeryItemsStore';
import type { BakeryOrder } from './types';
import { cn } from '@/lib/utils';
import {
  useStoreStockStore, getAllRecipeMaterials, normaliseName, convertToStockUnit,
  type StockUnit, type StockItem, type StockCategory,
} from './storeStockStore';
import { useSupplierStore, type Supplier } from './supplierStore';
import StoreAnalyticsTab from './StoreAnalyticsTab';
import StoreCustomTab from './StoreCustomTab';
import StoreReportTab from './StoreReportTab';
import { searchItems, getSuppliersForItem, getAllSupplierNames, getItemsForSupplier } from './storeItemMaster';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from './notificationStore';
import type { DeductionContext } from './storeStockStore';
import { resolveItemWeightGrams } from './itemMatcher';
import { matForItem } from './materialCalc';
import InvoiceTab from './InvoiceTab';
import StorePurchaseOrderTab from './StorePurchaseOrderTab';
import { useStorePurchaseOrderStore } from './storePurchaseOrderStore';
import {
  normalizeProductionCategory,
  storeOrderCategory,
  CORE_RECIPE_CATEGORIES,
  type ProductionCategory,
  type StoreOrderCategory,
} from './productionRouting';

// Kolkata-safe date key/label, same pattern used in PlannerDashboard.tsx —
// needed so an order raised late at night still buckets to the correct
// business day rather than drifting a day off in the browser's local tz.
const kolkataDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const kolkataDateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(new Date(iso));

// PRODUCT DECISION (2026-08-13): "items sent today by Planner should stay
// in Orders only until Store selects and sends to the Baker — only THEN
// should it move to History." That's a strict rule with no time exception.
// This used to also keep a 'store_confirmed' order visible in Orders for
// the rest of the calendar day it was sent/released, regardless of whether
// Store had already acted on it — a same-day order that Store had already
// selected and sent to the Baker could still sit in Orders looking
// unfinished for the rest of the day. Removed: the only thing that now
// controls Orders vs. History is needsProductionRelease below — released
// means History, immediately, full stop.

// FEATURE: an order Planner auto-merged straight to 'store_confirmed' has no
// materials deducted yet (moved to releaseToProduction — see bakeryStore.ts)
// and still needs Store to choose which items go to the Baker now. Until
// that happens it must keep behaving like a fresh, actionable "Order" —
// regardless of which day it arrived — not roll into History the way a
// genuinely finished order would.
// BUG FIX (2026-08-23): "orders sent by planner going directly to History,
// without Store ever touching them." Root cause traced to submitDispatch
// (in bakeryStore.ts) — whenever the Planner dispatches ANY item from an
// order, even a single one, and not every item has been formally recorded
// as prepared first, it falls back to marking the WHOLE order 'produced'.
// That status change has nothing to do with Store — it's purely the
// Planner's own dispatch action — but the History tab's filter checked
// status === 'produced' directly, so the order jumped straight there the
// moment the Planner dispatched anything, without Store ever clicking
// Confirm. production_released_at is the one field that's only ever set
// by a genuine Store action (confirmed by tracing every place it's set —
// there's no automatic path). Checking it for 'produced' orders too, not
// just 'store_confirmed' ones, means an order the Planner has started
// dispatching but Store hasn't actually released stays visible in Orders
// until Store genuinely acts on it — while a real, fully 'dispatched'
// order (a separate, direct status check elsewhere) is unaffected by this
// change either way.
const needsProductionRelease = (o: BakeryOrder) =>
  (o.status === 'store_confirmed' || o.status === 'produced') && !o.productionReleasedAt;

type StoreDashboardTab = 'orders' | 'history' | 'inventory' | 'suppliers' | 'purchaseOrders' | 'invoices' | 'analytics' | 'custom' | 'closure' | 'report';
const STORE_TABS: StoreDashboardTab[] = ['orders', 'history', 'inventory', 'suppliers', 'purchaseOrders', 'invoices', 'analytics', 'custom', 'closure', 'report'];
const STORE_ORDER_CATEGORIES: ProductionCategory[] = [...CORE_RECIPE_CATEGORIES.slice(0, 2), 'Cookies', 'Puffs', 'Bakery', 'Others'];

// This dashboard's Baker-routing UI (category tabs below, "Selected for
// Baker" grouping) is built around exactly these 5 categories. The
// canonical list now lives in productionRouting.ts (CORE_RECIPE_CATEGORIES,
// imported above) — moved there to avoid a circular import (this file ->
// productionRouting -> storeOrderCategory -> back to this file), not
// because the dependency went away. Declared again here, literally, so
// this file's own text still documents the exact set it's built around,
// and so a dev-time mismatch (someone changes the canonical list without
// updating this dashboard's UI) fails loudly instead of silently drifting.
const EXPECTED_CORE_CATEGORIES: readonly ProductionCategory[] = ['Sweets', 'Savouries', 'Bakery', 'Cookies', 'Others'];
if (import.meta.env.DEV && JSON.stringify(EXPECTED_CORE_CATEGORIES) !== JSON.stringify(CORE_RECIPE_CATEGORIES)) {
  console.warn('[StoreDashboard] CORE_RECIPE_CATEGORIES in productionRouting.ts no longer matches what this dashboard expects — the category tabs below may be missing or showing an unexpected category.');
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
// matForItem moved to ./materialCalc.ts (2026-08-06) so bakeryStore.ts's
// mergeOrdersForStore() can reuse the exact same calculation — see that
// file's comment for why.

function recipeIssueForItem(item: BakeryOrder['items'][number]): string | null {
  const recipe = useRecipeStore.getState().getRecipe(item.itemId, item.itemName);
  if (!recipe) return 'No recipe is linked to this item name or item code.';
  if (!recipe.outputQty || recipe.outputQty <= 0) return 'Recipe found, but its output quantity is missing.';
  if (!recipe.outputUnit) return 'Recipe found, but its output unit is missing.';
  if (recipe.materials.length === 0) return 'Recipe found, but no raw materials have been added.';
  const invalidMaterials = recipe.materials.filter(material =>
    !material.material.trim() || !Number.isFinite(material.qty) || material.qty <= 0 || !material.unit.trim()
  );
  if (invalidMaterials.length > 0) {
    const names = invalidMaterials
      .map(material => material.material.trim() || 'Unnamed material')
      .slice(0, 3)
      .join(', ');
    const more = invalidMaterials.length > 3 ? ` and ${invalidMaterials.length - 3} more` : '';
    return `Recipe found, but ${names}${more} ${invalidMaterials.length === 1 ? 'has' : 'have'} a missing quantity or unit.`;
  }
  if (item.quantity <= 0) return 'Recipe found, but the ordered quantity is invalid.';

  const orderUnit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
  const weightGrams = item.weightGrams ?? resolveItemWeightGrams(item.itemId, item.itemName);
  if (recipe.outputUnit === 'kg' && orderUnit === 'pcs' && weightGrams == null) {
    return 'Recipe found in kg, but this order is in pcs and the packet weight is missing.';
  }
  const weightedPieceOrder = recipe.outputUnit === 'kg' && orderUnit === 'pcs' && weightGrams != null;
  if (recipe.outputUnit && recipe.outputUnit !== orderUnit && !weightedPieceOrder && !(recipe.outputUnit === 'loaf' && orderUnit === 'pcs')) {
    return `Recipe output unit (${recipe.outputUnit}) does not match the order unit (${orderUnit}).`;
  }
  return null;
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

function fmtPreciseQty(quantity: number): string {
  const abs = Math.abs(quantity);
  const maximumFractionDigits = abs > 0 && abs < 0.01 ? 4 : abs < 1 ? 2 : 1;
  return quantity.toLocaleString('en-IN', { maximumFractionDigits });
}

function fmtGrams(quantity: number): string {
  let rounded = Math.abs(quantity) < 10
    ? Math.round(quantity * 2) / 2
    : Math.round(quantity);
  if (quantity !== 0 && rounded === 0) rounded = quantity > 0 ? 0.5 : -0.5;
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function formatMaterialQuantity(quantity: number, unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalizedUnit)) {
    if (quantity !== 0 && Math.abs(quantity) < 1) return `${fmtGrams(quantity * 1000)} g`;
    return `${fmtMatQty(quantity)} kg`;
  }
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(normalizedUnit)) {
    return `${fmtGrams(quantity)} g`;
  }
  return `${fmtPreciseQty(quantity)} ${unit}`;
}

// BUG FIX: this used `d.toISOString().slice(0, 10)` — UTC, not Kolkata
// time. Between midnight and 5:30 AM IST, UTC is still on the PREVIOUS
// calendar day (Kolkata is UTC+5:30), so a Store staff member opening the
// Daily Closure tab during an early-morning shift would silently see
// yesterday's date pre-filled instead of today's, querying the wrong
// day's deductions by default. Every other date computation in this app
// (kolkataDateKey/kolkataDateLabel above) already accounts for this —
// this was the one that didn't.
function inputDate(d: Date) {
  return kolkataDateKey(d.toISOString());
}

function dayWindow(date: string) {
  // Build the UTC instant range that corresponds to midnight-to-midnight
  // in Kolkata time for this calendar date, since the database stores
  // timestamps in UTC — a naive `${date}T00:00:00` (parsed in the
  // browser's own local timezone) would shift the window by whatever the
  // browser's offset happens to be, same class of bug as inputDate above.
  const from = new Date(`${date}T00:00:00+05:30`);
  const to = new Date(`${date}T23:59:59.999+05:30`);
  return { from: from.toISOString(), to: to.toISOString() };
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
        ${formatMaterialQuantity(m.quantity, m.unit)}
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
      <h1>${item.itemName}${(() => {
        // BUG FIX (audit 2026-08-26): this printed baker label used
        // order.targetBranch only — for an item split across branches by
        // a cross-branch Store merge (branchSplit), that's misleading:
        // the baker would see e.g. just "VRSNB" on a label for an item
        // that's genuinely partly for SNB too.
        const branches = item.branchSplit ? Object.keys(item.branchSplit) : (order.targetBranch ? [order.targetBranch] : []);
        return branches.map(b => `<span class="badge">${b}</span>`).join('');
      })()}</h1>
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
  const recipeIssue = recipeIssueForItem(item)
    ?? (!hasMats ? 'Recipe found, but its raw materials could not be calculated.' : null);
  const { items: stockItems } = useStoreStockStore();
  // FEATURE: Planner sends raw quantity only (e.g. "200 pcs") with no sense of
  // how many production batches that actually is — store staff had to do
  // this math themselves against the recipe's known batch yield. Recipes
  // already carry that yield as outputQty (see recipeStore.ts); surface it
  // here as "200 pcs · 4 batches" whenever a positive batch size is known.
  const recipe = useRecipeStore(useCallback(state => state.getRecipe(item.itemId, item.itemName), [item.itemId, item.itemName]));
  const batchSize = Number(recipe?.outputQty || 0);
  // BUG FIX: Math.ceil rounded every partial batch up to the next whole
  // number (e.g. a 2.5kg batch yield against a 3kg order showed "2 batches"
  // instead of the true 1.2) - store staff need the exact fractional batch
  // count to plan production correctly. Round to 1 decimal place instead.
  const batchCount = batchSize > 0 ? Math.round((item.quantity / batchSize) * 10) / 10 : 0;

  // Check each recipe material against current inventory
  const matStatus = useMemo(() => {
    return mats.map(m => {
      const stock = stockItems.find(s => normaliseName(s.name) === normaliseName(m.material));
      if (!stock) return { status: 'unknown' as const, stock: null };
      // BUG FIX (2026-08-17): this used to only handle g<->kg by hand, and
      // for anything else (ml<->L, or a genuine cross-dimensional mismatch
      // like a recipe in grams against stock tracked in litres) silently
      // compared the RAW, unconverted recipe quantity against the stock
      // quantity as if they were already the same unit. For Nandhini Ghee
      // (recipe: grams, stock: litres) this happened to still show "out of
      // stock" only because that stock balance was already negative — with
      // a normal positive balance it would have silently said "OK" while
      // comparing grams-needed against litres-available, no actual
      // comparison happening at all. Same conversion function the real
      // deduction pipeline uses, which correctly returns null instead of a
      // wrong number when the units are genuinely not the same kind of
      // measurement.
      const needed = convertToStockUnit(m.quantity, m.unit, stock.unit);
      if (needed === null) return { status: 'unit_mismatch' as const, stock, recipeQty: m.quantity, recipeUnit: m.unit };
      if (needed > stock.quantity) return { status: 'out' as const, stock };
      if (stock.quantity <= stock.minThreshold) return { status: 'low' as const, stock };
      return { status: 'ok' as const, stock };
    });
  }, [mats, stockItems]);

  const anyOut = matStatus.some(s => s.status === 'out');
  const anyMissing = matStatus.some(s => s.status === 'unknown');
  const anyUnitMismatch = matStatus.some(s => s.status === 'unit_mismatch');
  const anyLow = !anyOut && matStatus.some(s => s.status === 'low');
  const hasConfigurationIssue = Boolean(recipeIssue);

  useEffect(() => {
    if (anyMissing || anyUnitMismatch || hasConfigurationIssue) setShowMats(true);
  }, [anyMissing, anyUnitMismatch, hasConfigurationIssue]);

  return (
    <div className={cn(
      "rounded-xl border bg-muted/30 overflow-hidden",
      selected ? "border-primary bg-primary/5" : anyOut || anyMissing || anyUnitMismatch || hasConfigurationIssue ? "border-red-300" : anyLow ? "border-amber-300" : "border-border"
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
          {anyMissing && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> MISSING MATERIAL
            </span>
          )}
          {hasConfigurationIssue && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> RECIPE ISSUE
            </span>
          )}
          {anyLow && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> LOW
            </span>
          )}
          <div className="text-right">
            <p className="text-sm font-body font-bold tabular-nums text-foreground">
              {item.originalPcs != null && item.weightGrams != null
                ? `${item.quantity} kg`
                : `${item.quantity}${item.dispatchUnit === 'pcs' ? ' pcs' : ' kg'}`}
            </p>
            {batchCount > 0 && (
              <p className="text-[10px] font-body font-semibold text-primary tabular-nums">{batchCount} batch{batchCount !== 1 ? 'es' : ''}</p>
            )}
          </div>
        </div>
      </div>

      {recipeIssue && (
        <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-[11px] font-body text-red-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-bold">Recipe needs attention</p>
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
              anyOut || anyMissing || anyUnitMismatch ? "bg-red-50 text-red-700" : anyLow ? "bg-amber-50 text-amber-700" : "bg-primary/5 text-primary"
            )}
          >
            <div className="flex items-center gap-1.5">
              <Calculator className="size-3.5" />
              Raw materials ({mats.length} ingredients)
              {(anyOut || anyMissing) && <span className="text-[9px] font-bold">- check stock list!</span>}
              {anyUnitMismatch && <span className="text-[9px] font-bold">- fix unit mismatch before releasing!</span>}
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
                      s.status === 'out' || s.status === 'unknown' || s.status === 'unit_mismatch' ? "bg-red-50" : s.status === 'low' ? "bg-amber-50" : "bg-background"
                    )}>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {s.status === 'out' && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
                        {s.status === 'unknown' && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
                        {s.status === 'unit_mismatch' && <AlertTriangle className="size-3 text-red-500 shrink-0" />}
                        {s.status === 'low' && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                        <span className={cn(
                          "text-sm font-body",
                          s.status === 'out' || s.status === 'unknown' || s.status === 'unit_mismatch' ? "text-red-700 font-semibold" : "text-foreground"
                        )}>{m.material}</span>
                        {s.stock && (
                          <span className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                            s.status === 'out' || s.status === 'unit_mismatch'
                              ? "border-red-200 bg-red-100 text-red-700"
                              : s.status === 'low'
                              ? "border-amber-200 bg-amber-100 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          )}>
                            Available: {formatMaterialQuantity(s.stock.quantity, s.stock.unit)}
                          </span>
                        )}
                        {s.status === 'unknown' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
                            Missing from Store inventory
                          </span>
                        )}
                        {s.status === 'unit_mismatch' && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0"
                            title="This recipe's unit and the stock item's unit are different kinds of measurement (e.g. weight vs volume) — can't tell if there's enough without fixing one of them to match."
                          >
                            Can't compare — recipe unit vs stock unit mismatch
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-body font-bold tabular-nums ml-2 shrink-0",
                        s.status === 'out' || s.status === 'unknown' || s.status === 'unit_mismatch' ? "text-red-700" : "text-foreground"
                      )}>
                        {formatMaterialQuantity(m.quantity, m.unit)}
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
function OrderCard({ order, searchTerm = '' }: { order: BakeryOrder; searchTerm?: string }) {
  const { confirmStockSelected, acceptOrder, releaseToProduction } = useBakeryStore();
  const { deductMaterials } = useStoreStockStore();
  const bakeryItems = useBakeryItemsStore(s => s.items);
  const currentUser = useAuthStore(s => s.currentUser);

  // An order Planner already auto-confirmed (materials deducted at send
  // time — see mergeOrdersForStore) sits at 'store_confirmed' immediately,
  // with no window where it was 'accepted'. It still needs Store to choose
  // which items go to the Baker now, same as a freshly-accepted order does
  // — it just must never trigger a second material deduction when that
  // happens. Folding this into `sent` (rather than threading a third state
  // through every checkbox/button below) means every existing
  // `accepted && !sent` check already does the right thing unchanged.
  const computeSent = (o: BakeryOrder) => o.status !== 'pending' && o.status !== 'accepted' && !needsProductionRelease(o);
  // BUG FIX (audit 2026-08-26): "are orders correctly displayed in Store's
  // Orders tab" — a merged, cross-branch order (see StoreDashboard's own
  // cross-branch merge feature and branchSplit) keeps target_branch as
  // whichever source order happened to survive as primary, e.g. 'VRSNB' —
  // but genuinely contains items for other branches too. This badge used
  // to show ONLY order.targetBranch, so Store staff looking at a merged
  // order would see just "VRSNB" and have no way to know part of it is
  // actually for SNB too. Union every item's own branchSplit keys instead,
  // falling back to targetBranch for a normal, never-merged order.
  const involvedBranches = (() => {
    const set = new Set<string>();
    for (const item of order.items) {
      if (item.branchSplit) { for (const b of Object.keys(item.branchSplit)) set.add(b); }
    }
    if (set.size === 0 && order.targetBranch) set.add(order.targetBranch);
    return Array.from(set);
  })();

  const [expanded,   setExpanded]   = useState(true);
  const [accepting,  setAccepting]  = useState(false);
  const [accepted,   setAccepted]   = useState(order.status !== 'pending');
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(computeSent(order));
  const [sendError,  setSendError]  = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const sendRequest = useRef<{ signature: string; id: string } | null>(null);
  // BUG FIX (audit 2026-09-02): the `sending` useState flag below is checked/set
  // asynchronously, so a fast double-tap on "Send to Baker/Planner" can fire this
  // handler twice before React commits the disabled state — double-deducting real
  // material stock and creating a duplicate downstream production order for the same
  // items. Same double-submit class fixed elsewhere this session (checkoutInFlightRef,
  // sendingRef, savingInFlightRef) — a synchronous ref checked/set before any await.
  const sendingRef = useRef(false);

  useEffect(() => {
    setAccepted(order.status !== 'pending');
    setSent(computeSent(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status, order.productionReleasedAt]);

  useEffect(() => {
    setSelectedIndexes(current => current.filter(index => index < order.items.length));
    sendRequest.current = null;
  }, [order.items]);

  const categorizedItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    // BUG FIX (audit 2026-08-27): "unable to send to production" — the
    // 2026-08-20 feature below narrows an expanded order's own item rows to
    // just what matches the search box, so searching an item name doesn't
    // show the whole order. But this order can ALSO match the outer order
    // list (filteredPending) by order number, branch, or createdBy — none of
    // which are item names. Applying the same `q` as an item-name filter in
    // that case matches zero items, silently hiding every row and its
    // checkbox — an order found by searching its own order number rendered
    // with no way to select anything. Only actually filter items when the
    // search term matches at least one of THIS order's real item names;
    // otherwise it matched for some other reason and every item still belongs here.
    const matchesAnyItemName = !q || order.items.some(item => item.itemName.toLowerCase().includes(q));
    return STORE_ORDER_CATEGORIES.map(category => ({
      category,
      // The index below is captured from order.items BEFORE this search
      // filter runs, so it always points to that item's real position — safe
      // to filter which items are DISPLAYED without touching what
      // selectedIndexes/confirmStockSelected/releaseToProduction actually
      // operate on downstream.
      items: order.items
        .map((item, index) => ({ item, index, category: storeOrderCategory(item, bakeryItems) }))
        .filter(entry => entry.category === category)
        .filter(entry => !matchesAnyItemName || !q || entry.item.itemName.toLowerCase().includes(q)),
    })).filter(group => group.items.length > 0);
  }, [order.items, bakeryItems, searchTerm]);

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
      if (recipeIssueForItem(item)) return true;
      const mats = matForItem(item);
      if (mats.length === 0) return true;
      for (const m of mats) {
        const stock = stockItems.find(s => normaliseName(s.name) === normaliseName(m.material));
        if (!stock) return true;
        // BUG FIX (audit 2026-08-24): this hand-rolled g<->kg conversion
        // was a second, independent copy of the exact bug already fixed in
        // ItemRow's matStatus above (see that BUG FIX comment) — any other
        // unit pairing (ml<->L, or a genuine cross-dimensional mismatch
        // like grams vs litres) compared raw, unconverted numbers, so this
        // could silently return false (no warning) for a case ItemRow
        // correctly flags red on the very same screen. Same shared
        // conversion function, same "null means can't verify — treat as a
        // problem" handling ItemRow already uses; this is a single boolean
        // flag rather than ItemRow's own separate unit_mismatch status, so
        // null folds into "true" here rather than a distinct state.
        const needed = convertToStockUnit(m.quantity, m.unit, stock.unit);
        if (needed === null) return true;
        if (needed > stock.quantity) return true;
      }
    }
    return false;
  }, [selectedEntries, stockItems]);

  const handleConfirmStock = async () => {
    // BUG FIX (audit): this was the one save-handler in this file with no
    // re-entrancy guard of its own — every sibling handler (InvoiceTab.save,
    // StorePurchaseOrderTab.save, OrdersTab.handleMergeAll) self-guards on
    // its own in-flight flag instead of relying solely on the button's
    // `disabled` prop, which has a narrow but real window on rapid/double
    // taps before React flushes state.
    if (sent || selectedIndexes.length === 0 || sending || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true); setSendError(null); setSendNotice(null);

    // Planner-merged orders sit here until Store picks which items go to
    // the Baker — releaseToProduction is now the actual deduction point
    // (moved 2026-08-13): materials come off the shelf right here, at
    // selection time, same as the manual branch below.
    if (needsProductionRelease(order)) {
      try {
        const deductionWarning = await releaseToProduction(order.id, selectedIndexes);
        const remainingCount = order.items.length - selectedEntries.length;
        if (remainingCount === 0) setSent(true);
        setSelectedIndexes([]);
        const baseNotice = remainingCount === 0
          ? `${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} sent to the Baker and deducted from stock.`
          : `${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} sent to the Baker and deducted from stock. ${remainingCount} item${remainingCount === 1 ? '' : 's'} still waiting here.`;
        // BUG FIX (2026-08-17): a "stock not deducted, units don't match"
        // warning used to only reach the browser console, which nobody on
        // the floor is looking at. It's now visible right here.
        setSendNotice(deductionWarning ? `${baseNotice} ⚠ ${deductionWarning}` : baseNotice);
      } catch (sendFailure) {
        setSendError(`${sendFailure instanceof Error ? sendFailure.message : 'Failed to release to production.'} Please try again.`);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
      return;
    }

    // Deduction and the status write below are two separate awaits, not one
    // atomic transaction — if the status write fails after deduction already
    // committed, a blind retry would deduct the same materials a second
    // time. Track that explicitly so a failure here can say so plainly and
    // force the planner to make a conscious decision instead of just
    // clicking the same button again.
    let deducted = false;
    let deductionWarning: string | null = null;
    try {
      // Deduct stock for the selected lines, then hand the order to Planner.
      if (allMats.length > 0) {
        const ctx: DeductionContext = {
          orderId:     order.id,
          orderNumber: order.orderNumber ?? order.id,
          deductedBy:  currentUser?.displayName ?? 'Store',
        };
        deductionWarning = await deductMaterials(
          allMats.map(m => ({ name: m.material, qty: m.quantity, unit: m.unit })),
          ctx,
        );
        deducted = true;
      }
      await confirmStockSelected(order.id, selectedIndexes, currentUser?.displayName ?? 'Store');
      const remainingCount = order.items.length - selectedEntries.length;
      if (remainingCount === 0) setSent(true);
      setSelectedIndexes([]);
      const baseNotice = remainingCount === 0
        ? `${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} confirmed and sent to Planner for production.`
        : `${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} sent to Planner. ${remainingCount} item${remainingCount === 1 ? '' : 's'} still pending here.`;
      // BUG FIX (2026-08-17): this warning used to get set here, then
      // immediately clobbered by the unconditional setSendNotice below it —
      // never actually visible to anyone. Appending to the final notice
      // instead of setting its own.
      setSendNotice(deductionWarning ? `${baseNotice} ⚠ ${deductionWarning}` : baseNotice);
    } catch (sendFailure) {
      const baseMsg = sendFailure instanceof Error ? sendFailure.message : 'Failed to confirm stock.';
      if (deducted) {
        // Materials were already deducted from stock before this failed —
        // clear the selection instead of leaving it primed for an easy
        // re-click, so re-sending this same batch is a conscious choice,
        // not a reflex tap that deducts the same materials twice.
        setSelectedIndexes([]);
        setSendError(`${baseMsg} Stock was already deducted for these items before this failed — do NOT just retry the same items. Check Inventory, and only re-select what still genuinely needs to go to Planner.`);
      } else {
        setSendError(`${baseMsg} Please try again.`);
      }
    } finally {
      sendingRef.current = false;
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
            {/* BUG FIX (2026-08-07): once already-sent orders started showing
                in this tab too, this badge kept showing the order's original
                createdAt — which can be an earlier day than the merge that
                actually sent it. A same-day merged order could show
                yesterday's date, making one "today" send look like it
                belonged to two different days. Show the date it was sent
                (storeConfirmedAt) once it's sent; otherwise the date it was
                raised, same as before. */}
            <span className="flex items-center gap-1 text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-muted/60 text-muted-foreground border-border">
              <Calendar className="size-2.5" />{kolkataDateLabel((sent && order.storeConfirmedAt) ? order.storeConfirmedAt : order.createdAt)}
            </span>
            {involvedBranches.map(b => (
              <span key={b} className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', branchColor[b] ?? 'bg-muted text-muted-foreground border-border')}>
                {b}
              </span>
            ))}
            {sent && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Sent to Production
              </span>
            )}
            {accepted && !sent && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                {needsProductionRelease(order) ? 'Awaiting Baker Selection' : 'Accepted at Store'}
              </span>
            )}
            {/* BUG FIX: not-yet-sent orders from a previous day used to look
                identical to a fresh order raised minutes ago — nothing told
                store staff this one had been sitting unsent since yesterday
                (or earlier). Orders never disappeared (the underlying list
                already includes every 'accepted' order regardless of date),
                but there was no way to tell how stale one was at a glance. */}
            {!sent && kolkataDateKey(order.createdAt) !== kolkataDateKey(new Date().toISOString()) && (
              <span className="flex items-center gap-1 text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                <AlertTriangle className="size-2.5" />Still Pending — Past Date
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
          {accepted && !sent && (
            <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
              {needsProductionRelease(order)
                ? 'Select which items go to the Baker now — materials will be deducted from stock at that point. Unselected items will wait here.'
                : 'Select the items to send now. Unselected items will remain in this Store order.'}
            </p>
          )}

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
            <div className="flex items-center justify-between bg-primary/5 px-3 py-2"><p className="text-xs font-black text-primary">Selected for Baker / Production</p><span className="text-[10px] font-bold text-primary">{selectedEntries.length} item{selectedEntries.length === 1 ? '' : 's'}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-xs">
              <thead className="bg-muted/40 text-left text-[9px] uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Quantity</th><th className="w-10"></th></tr></thead>
              <tbody>{selectedEntries.map(({ item, index }) => {
                const category = storeOrderCategory(item, bakeryItems);
                return <tr key={`${item.itemId}-${index}`} className="border-t border-border"><td className="px-3 py-2 font-semibold">{item.itemName}</td><td className="px-3 py-2 text-muted-foreground">{category}</td><td className="px-3 py-2 text-right font-bold">{item.quantity} {item.dispatchUnit || 'kg'}</td><td className="px-2 py-1"><button type="button" onClick={() => toggleIndex(index)} title="Remove selection" className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><X className="size-3.5" /></button></td></tr>;
              })}</tbody>
            </table></div>
            {/* BUG FIX (audit 2026-08-27): "I don't want three buttons, I
                want one" — this panel already shows every selected item and
                its quantity in the table right above; that table IS the
                review. Sending from here now happens through the single
                button at the bottom of the card (past the raw-material
                warnings below), so there's exactly one "Send to Production"
                action per order, not three redundant ones calling the same
                handler. */}
          </div>}

          {sendError && <p className="text-xs font-body text-destructive text-center pt-1">{sendError}</p>}
          {sendNotice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">{sendNotice}</p>}
          {anyOut && selectedEntries.length > 0 && <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">Review the red warnings. Available raw materials will still be deducted, and insufficient quantities are allowed to go negative for tracking.</p>}

          {!accepted ? (
            <button onClick={handleAccept} disabled={accepting}
              className="w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 mt-1 cafe-gradient text-primary-foreground shadow-md">
              {accepting
                ? <Loader2 className="size-4 animate-spin" />
                : <><CheckCircle2 className="size-4" /> Accept Order</>}
            </button>
          ) : (
            <button onClick={handleConfirmStock} disabled={sending || sent || selectedEntries.length === 0}
              className={cn(
                'w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 mt-1',
                sent ? 'bg-emerald-100 text-emerald-700' : 'cafe-gradient text-primary-foreground shadow-md'
              )}>
              {sending
                ? <Loader2 className="size-4 animate-spin" />
                : sent
                ? <><CheckCircle2 className="size-4" /> Sent to Production</>
                : selectedEntries.length === 0
                ? <>Select Items to Send</>
                : <><ArrowRight className="size-4" /> Send {selectedEntries.length} Selected Item{selectedEntries.length === 1 ? '' : 's'} to Production</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stock Row ────────────────────────────────────────────────────────────────
function StockRow({ item, onEdit, onDelete, selectMode = false, selected = false, onToggleSelect }: {
  item: StockItem; onEdit: (i: StockItem) => void; onDelete: (id: string) => void;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void;
}) {
  const isNegative = item.quantity < 0;
  const isLow = !isNegative && item.quantity <= item.minThreshold;
  const suppliers = useMemo(() => getSuppliersForItem(item.name), [item.name]);
  return (
    <div
      onClick={selectMode ? () => onToggleSelect?.(item.id) : undefined}
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-all',
        selectMode && 'cursor-pointer',
        selected ? 'bg-primary/10 border-primary' : isNegative ? 'bg-red-100 border-red-400' : isLow ? 'bg-red-50 border-red-200' : 'bg-card border-border'
      )}>
      {selectMode && (
        <div className={cn('size-5 shrink-0 rounded-md border-2 flex items-center justify-center',
          selected ? 'bg-primary border-primary' : 'border-border')}>
          {selected && <Check className="size-3 text-primary-foreground" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {(isNegative || isLow) && <AlertTriangle className={cn('size-3 shrink-0', isNegative ? 'text-red-700' : 'text-red-500')} />}
          <span className="text-sm font-body font-semibold text-foreground truncate">{item.name}</span>
          {/* FEATURE (2026-08-30): category badge so it's obvious at a glance
              which list an item is in, without opening Edit. */}
          <span className={cn('shrink-0 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
            item.category === 'packing' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
            {item.category === 'packing' ? 'Packing' : 'Raw'}
          </span>
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
      {!selectMode && (
        <>
          <button onClick={() => onEdit(item)} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted active:scale-90">
            <Pencil className="size-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(item.id)} className="size-8 flex items-center justify-center rounded-lg hover:bg-red-50 active:scale-90">
            <Trash2 className="size-3.5 text-red-400" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Add Stock modal ──────────────────────────────────────────────────────────
function AddItemModal({ onClose, onSave, defaultCategory = 'raw' }: { onClose: () => void; onSave: (name: string, unit: StockUnit, qty: number, min: number, suppliers: string[], category: StockCategory) => Promise<void>; defaultCategory?: StockCategory }) {
  const recipeMats = useMemo(() => getAllRecipeMaterials(), []);
  const { items: existingItems } = useStoreStockStore();
  const [search, setSearch] = useState('');
  const [name, setName]     = useState('');
  const [unit, setUnit]     = useState<StockUnit>('kg');
  const [qty, setQty]       = useState('0');
  const [min, setMin]       = useState('1');
  const [category, setCategory] = useState<StockCategory>(defaultCategory);
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
      await onSave(name, unit, q, m, selectedSuppliers, category);
      onClose();
    } catch (err) {
      // BUG FIX (audit 2026-08-24): this bare catch discarded the actual
      // thrown error and always showed a generic message — now that the
      // parent wrapper throws the real reason (e.g. addItem's own error
      // string), show that instead of hiding it behind "Save failed."
      setError(err instanceof Error ? err.message : 'Save failed — please try again.');
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
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Category</label>
          <div className="flex gap-2">
            {([{ value: 'raw' as const, label: 'Raw Material' }, { value: 'packing' as const, label: 'Packing Material' }]).map(opt => (
              <button key={opt.value} onClick={() => setCategory(opt.value)}
                className={cn('flex-1 h-11 rounded-xl border text-xs font-body font-bold transition-all',
                  category === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/40')}>
                {opt.label}
              </button>
            ))}
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
function EditItemModal({ item, onClose, onSave }: { item: StockItem; onClose: () => void; onSave: (u: Partial<Pick<StockItem,'name'|'unit'|'quantity'|'minThreshold'|'category'>>) => Promise<void> }) {
  const [qty, setQty]   = useState(String(item.quantity));
  const [min, setMin]   = useState(String(item.minThreshold));
  const [unit, setUnit] = useState<StockUnit>(item.unit);
  const [category, setCategory] = useState<StockCategory>(item.category);
  const [saving, setSaving] = useState(false);
  // BUG FIX (audit 2026-08-24): this used to have no error state at all —
  // its catch block's own comment claimed "parent shows errors via its own
  // mechanism," but no such mechanism existed anywhere (the parent only
  // console.warn'd, invisibly). Combined with StoreInventoryTab's wrapper
  // unconditionally closing the modal regardless of outcome, a failed save
  // gave the user zero indication anything went wrong. Now that the
  // wrapper throws on failure instead, this needs its own visible error
  // display too, matching AddItemModal's existing pattern.
  const [error, setError] = useState('');
  const handleSave = async () => {
    const q = parseFloat(qty), m = parseFloat(min);
    if (isNaN(q) || isNaN(m)) return;
    setSaving(true); setError('');
    try {
      await onSave({ quantity: q, minThreshold: m, unit, category });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — please try again.');
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
        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}
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
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Category</label>
          <div className="flex gap-2">
            {([{ value: 'raw' as const, label: 'Raw Material' }, { value: 'packing' as const, label: 'Packing Material' }]).map(opt => (
              <button key={opt.value} onClick={() => setCategory(opt.value)}
                className={cn('flex-1 h-11 rounded-xl border text-xs font-body font-bold transition-all',
                  category === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary/40')}>
                {opt.label}
              </button>
            ))}
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
    // BUG FIX: this used new Date() + setHours(0,0,0,0)/(23,59,59,999) —
    // the BROWSER's own local timezone, not Kolkata time. Every other date
    // boundary in this app explicitly avoids depending on the device's own
    // timezone setting being correct (kolkataDateKey/dayWindow above) —
    // this "today's deductions" view was the one place still trusting it,
    // risking the wrong day's data on a misconfigured device.
    const { from, to } = dayWindow(inputDate(new Date()));
    const { data, error } = await supabase
      .from('store_material_deductions')
      .select('id, order_number, material_name, quantity_deducted, unit, stock_before, stock_after, deducted_by, deducted_at')
      .gte('deducted_at', from)
      .lte('deducted_at', to)
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
    const refresh = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
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
  const { items, loaded, loading, load, addItem, updateItem, deleteItem, bulkImportFromRecipes, bulkSetCategory } = useStoreStockStore();
  const { pushStoreItemChange } = useNotificationStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [editItem, setEditItem]     = useState<StockItem | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importToast, setImportToast] = useState<{ added: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [stockView, setStockView]   = useState<'all' | 'low'>('all');
  // FEATURE (2026-08-30): "place all the packing materials in a different
  // sub tab — this is causing disturbance for the client when checking for
  // the raw material" — 819 items in one flat list, ~140 of them packing
  // consumables (boxes, covers, pouches, tape...) mixed into food raw
  // materials. Split into two top-level sub-tabs; everything below (search,
  // All/Low-Neg, stats, Excel export) now operates within whichever one is
  // active instead of across the whole combined list.
  const [categoryTab, setCategoryTab] = useState<StockCategory>('raw');
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moving, setMoving]           = useState(false);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { setSelectMode(false); setSelectedIds(new Set()); }, [categoryTab]);

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

  const categoryItems = useMemo(() => items.filter(i => i.category === categoryTab), [items, categoryTab]);
  const negativeItems = categoryItems.filter(i => i.quantity < 0);
  const lowItems = categoryItems.filter(i => i.quantity >= 0 && i.quantity <= i.minThreshold);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    // BUG FIX: the "Low/Neg" tab's own badge counts lowItems.length +
    // negativeItems.length, but this list only ever showed lowItems —
    // lowItems explicitly requires quantity >= 0, so a negative-stock item
    // (the most critical case to actually see) never appeared here at all,
    // despite being counted in the badge that led someone to click in.
    const base = stockView === 'low' ? [...negativeItems, ...lowItems] : categoryItems;
    return base.filter(i => !q || i.name.toLowerCase().includes(q));
  }, [categoryItems, lowItems, negativeItems, search, stockView]);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const handleBulkMove = async (target: StockCategory) => {
    if (selectedIds.size === 0 || moving) return;
    setMoving(true);
    try {
      const err = await bulkSetCategory(Array.from(selectedIds), target);
      if (!err) { setSelectMode(false); setSelectedIds(new Set()); }
    } finally {
      setMoving(false);
    }
  };

  const actor = currentUser?.displayName || currentUser?.username || 'Store user';
  const notifyStockChange = async (action: 'created' | 'updated', itemId: string, itemName: string, summary: string) => {
    await pushStoreItemChange({ action, itemId, itemName, category: summary, changedBy: actor });
  };

  // Inventory tab had no export at all — same lightweight CSV-as-"Excel"
  // pattern already used for the pending-orders export above, applied to
  // whatever's currently in view (respects the active search + All/Low
  // Stock filter rather than always dumping the entire inventory).
  const downloadInventoryExcel = () => {
    const rows: string[][] = [
      ['Item', 'Quantity', 'Unit', 'Min Threshold', 'Status'],
    ];
    for (const item of filtered) {
      rows.push([
        item.name,
        String(item.quantity),
        item.unit,
        String(item.minThreshold),
        item.quantity < 0 ? 'Negative' : item.quantity <= item.minThreshold ? 'Low Stock' : 'OK',
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${categoryTab}-${stockView}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rawCount = items.filter(i => i.category === 'raw').length;
  const packingCount = items.filter(i => i.category === 'packing').length;

  return (
    <div className="space-y-3">
      {/* Category sub-tabs: Raw Material / Packing Material — the actual
          fix for "packing materials mixed in with raw material" */}
      <div className="flex gap-1 bg-muted/60 p-1 rounded-xl">
        <button
          onClick={() => setCategoryTab('raw')}
          className={cn(
            'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all',
            categoryTab === 'raw' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          Raw Material
          <span className="ml-1 text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded-full">{rawCount}</span>
        </button>
        <button
          onClick={() => setCategoryTab('packing')}
          className={cn(
            'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all',
            categoryTab === 'packing' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          Packing Material
          <span className="ml-1 text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded-full">{packingCount}</span>
        </button>
      </div>

      {/* Sub-tab switcher: All / Low Stock (scoped to the category tab above) */}
      <div className="flex gap-1 bg-muted/60 p-1 rounded-xl">
        <button
          onClick={() => setStockView('all')}
          className={cn(
            'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all',
            stockView === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          All Stock
          <span className="ml-1 text-[9px] font-bold bg-muted px-1.5 py-0.5 rounded-full">{categoryItems.length}</span>
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
            <button onClick={downloadInventoryExcel} disabled={filtered.length === 0}
              className="h-10 px-3 rounded-xl border border-border bg-card text-xs font-body font-semibold flex items-center gap-1.5 hover:bg-muted disabled:opacity-40 active:scale-95">
              <Download className="size-3.5 text-emerald-600" /> Excel
            </button>
            {/* One-time cleanup helper: move a batch of misfiled items into
                the other category without opening Edit on each one. */}
            <button onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }} disabled={filtered.length === 0}
              className={cn('h-10 px-3 rounded-xl border text-xs font-body font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-40',
                selectMode ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-muted')}>
              {selectMode ? 'Cancel' : 'Select'}
            </button>
            <button onClick={() => setShowAdd(true)}
              className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95">
              <Plus className="size-3.5" /> Add
            </button>
          </div>

          {selectMode && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-primary/30 bg-primary/5">
              <span className="text-xs font-body font-bold text-foreground">{selectedIds.size} selected</span>
              <button
                onClick={() => handleBulkMove(categoryTab === 'raw' ? 'packing' : 'raw')}
                disabled={selectedIds.size === 0 || moving}
                className="h-9 px-3 rounded-lg cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-40">
                {moving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Move to {categoryTab === 'raw' ? 'Packing Material' : 'Raw Material'}
              </button>
            </div>
          )}

          {stockView === 'all' && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: categoryItems.length, color: 'text-foreground' },
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
                      <p className="text-sm font-body">{categoryItems.length === 0 ? `No ${categoryTab === 'packing' ? 'packing' : 'raw'} material items yet — tap Add` : 'No matches'}</p>
                    </div>
                  : <div className="space-y-2">
                      {displayList.map(i => (
                        <StockRow key={i.id} item={i} onEdit={setEditItem} onDelete={async (id) => {
                          const item = items.find(row => row.id === id);
                          await deleteItem(id);
                          if (item) await notifyStockChange('updated', item.id, item.name, `archived from store stock by ${actor}`);
                        }}
                        selectMode={selectMode} selected={selectedIds.has(i.id)} onToggleSelect={toggleSelect} />
                      ))}
                    </div>;
              })()
          }
        </>

      {showAdd && <AddItemModal defaultCategory={categoryTab} onClose={() => setShowAdd(false)} onSave={async (n, u, q, m, suppliers, category) => {
        // BUG FIX (audit 2026-08-24): addItem/updateItem return an error
        // string rather than throwing, but AddItemModal/EditItemModal's own
        // handleSave only calls onClose() inside their try block — meaning
        // it only actually closes on a THROWN failure, not a returned one.
        // The wrapper here used to just console.warn the error and let
        // execution fall through normally, so the modal's try "succeeded"
        // (await didn't reject), closed as if the save worked, and staff
        // had no way to know the item was never actually added. Throwing
        // here lets the modal's own catch block do its job.
        const before = items.length;
        const err = await addItem(n, u, q, m, suppliers, category);
        if (err || useStoreStockStore.getState().items.length === before) {
          throw new Error(err || 'Item could not be added — please try again.');
        }
        const created = useStoreStockStore.getState().items.find(item => normaliseName(item.name) === normaliseName(n));
        await notifyStockChange('created', created?.id || n, n, `stock ${q} ${u}, low alert ${m}`);
      }} />}
      {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={async (u) => {
        // Same fix as AddItemModal above. Also removed this wrapper's own
        // unconditional setEditItem(null) — EditItemModal's onClose prop
        // (passed above) already closes it on success; keeping a second,
        // unconditional close here was forcing the modal shut even when
        // the save had just failed.
        const before = editItem;
        const err = await updateItem(editItem.id, u);
        if (err) throw new Error(err);
        const qtyNote = u.quantity !== undefined ? `stock ${before.quantity} ${before.unit} to ${u.quantity} ${u.unit || before.unit}` : 'details changed';
        await notifyStockChange('updated', before.id, before.name, qtyNote);
      }} />}
    </div>
  );
}

// ─── Production-Ready Aggregated Panel ─────────────────────────────────────
// FEATURE (audit 2026-08-27): explicit product requirement — "the store
// person should see item name and total quantity requested, that's it. He
// should not see order id or branch which has requested it." Once Planner
// has merged/sent orders to Store (the needsProductionRelease bucket below),
// Store no longer works order-by-order at all: every item across every such
// order is combined into ONE flat, searchable-by-item-name list, and "Send
// to Production" operates on that aggregated selection instead of a
// per-order checklist. The underlying per-order data (orderId, branch,
// branchSplit) is never displayed here, and — just as important — never
// altered by being hidden: release still happens through the exact same
// releaseToProduction(orderId, indexes) call OrderCard always used, just
// invoked once per real contributing order behind the scenes. That's what
// keeps this purely a Store-side display/interaction change — Planner's and
// SNB's own dashboards see byte-for-byte the same order/status writes as
// before, since nothing about the merge/split/release data model changed.
type AggregatedProductionItem = {
  key: string;
  itemName: string;
  quantity: number;
  originalPcs?: number;
  representativeOrder: BakeryOrder;
  representativeItem: BakeryOrder['items'][number];
  contributions: { orderId: string; index: number }[];
};

function aggregateReleasableItems(orders: BakeryOrder[]): AggregatedProductionItem[] {
  const byKey = new Map<string, AggregatedProductionItem>();
  for (const order of orders) {
    order.items.forEach((item, index) => {
      const key = item.itemName.trim().toLowerCase();
      let agg = byKey.get(key);
      if (!agg) {
        agg = {
          key,
          itemName: item.itemName,
          quantity: 0,
          originalPcs: undefined,
          representativeOrder: order,
          representativeItem: item,
          contributions: [],
        };
        byKey.set(key, agg);
      }
      agg.quantity += item.quantity;
      // BUG FIX (audit 2026-09-02): this only accumulated originalPcs if the FIRST order
      // processed for this item happened to have it set — whichever order the outer loop
      // hit first for a given key permanently decided whether the total tracked pcs at
      // all, since `agg.originalPcs != null` (starting false whenever the first order
      // lacked it) gated every later addition too. A later order's real originalPcs value
      // was then silently dropped, understating the "X pcs → Y kg" display for a merged
      // item. Accumulate whenever ANY contributing order has a value, regardless of order.
      if (item.originalPcs != null) agg.originalPcs = (agg.originalPcs ?? 0) + item.originalPcs;
      agg.contributions.push({ orderId: order.id, index });
    });
  }
  return Array.from(byKey.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function ProductionReadyPanel({ orders }: { orders: BakeryOrder[] }) {
  const { releaseToProduction } = useBakeryStore();
  const bakeryItems = useBakeryItemsStore(s => s.items);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  // BUG FIX (audit 2026-09-02): same double-submit class as OrderCard's
  // handleConfirmStock in this same file — `sending` is a useState flag, so a fast
  // double-tap can fire handleSend twice before it commits, double-deducting stock.
  const sendingRef = useRef(false);

  const aggregated = useMemo(() => aggregateReleasableItems(orders), [orders]);

  // Drop any selection whose item is no longer here (fully sent elsewhere,
  // or this order list refreshed and it's genuinely gone) rather than
  // silently holding a stale key forever.
  useEffect(() => {
    setSelected(current => {
      const validKeys = new Set(aggregated.map(a => a.key));
      const next = new Set(Array.from(current).filter(k => validKeys.has(k)));
      return next.size === current.size ? current : next;
    });
  }, [aggregated]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter(a => a.itemName.toLowerCase().includes(q));
  }, [aggregated, search]);

  const toggle = (key: string) => {
    setSendError(null); setSendNotice(null);
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectedItems = useMemo(() => aggregated.filter(a => selected.has(a.key)), [aggregated, selected]);

  const handleSend = async () => {
    if (selectedItems.length === 0 || sending || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true); setSendError(null); setSendNotice(null);
    try {
      const warnings: string[] = [];
      for (const agg of selectedItems) {
        // Group this aggregated item's contributions by the real order they
        // came from — releaseToProduction operates per order, exactly the
        // same call OrderCard made per selected checkbox before this panel
        // existed. Looping it here per contributing order (invisibly, from
        // Store's point of view) is what keeps Planner's and SNB's own
        // order/status data identical to before this change.
        const byOrder = new Map<string, number[]>();
        for (const c of agg.contributions) {
          const list = byOrder.get(c.orderId) ?? [];
          list.push(c.index);
          byOrder.set(c.orderId, list);
        }
        for (const [orderId, indexes] of byOrder) {
          const warning = await releaseToProduction(orderId, indexes);
          if (warning) warnings.push(`${agg.itemName}: ${warning}`);
        }
      }
      setSelected(new Set());
      setSendNotice(
        `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} sent to the Baker and deducted from stock.` +
        (warnings.length ? ` ⚠ ${warnings.join(' · ')}` : ''),
      );
    } catch (err) {
      setSendError(`${err instanceof Error ? err.message : 'Failed to send selected items.'} Please try again.`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (aggregated.length === 0) return null;

  return (
    <div className={cn('mb-4 space-y-3', selectedItems.length > 0 && 'pb-20')}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="size-3.5 text-primary" />
          <p className="text-xs font-body font-bold text-muted-foreground uppercase">
            Ready for Production — {aggregated.length} Item{aggregated.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search item name…"
            className="h-8 w-full rounded-xl border border-border bg-card pl-8 pr-7 text-xs font-body outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs font-body text-muted-foreground">
          No items match &quot;{search}&quot;.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(agg => (
            <ItemRow
              key={agg.key}
              order={agg.representativeOrder}
              item={{ ...agg.representativeItem, quantity: agg.quantity, originalPcs: agg.originalPcs ?? agg.representativeItem.originalPcs }}
              category={storeOrderCategory(agg.representativeItem, bakeryItems)}
              selectionEnabled
              selected={selected.has(agg.key)}
              onToggle={() => toggle(agg.key)}
            />
          ))}
        </div>
      )}

      {sendError && <p className="text-xs font-body text-destructive text-center pt-1">{sendError}</p>}
      {sendNotice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">{sendNotice}</p>}

      {/* BUG FIX (audit 2026-08-27): "when I select the items I should get
          the send button on the screen only, remove the bottom button" —
          with 100+ items in this list, a button at the very bottom of the
          panel meant scrolling all the way down after every selection. One
          floating bar, pinned to the viewport, appears the moment something
          is selected and stays on screen regardless of scroll position —
          no second button anywhere else in this panel. */}
      {selectedItems.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <button
            onClick={() => void handleSend()}
            disabled={sending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-body font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 cafe-gradient text-primary-foreground"
          >
            {sending
              ? <Loader2 className="size-4 animate-spin" />
              : <><ArrowRight className="size-4" /> Send {selectedItems.length} Selected Item{selectedItems.length === 1 ? '' : 's'} to Production</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
// FEATURE (audit 2026-08-27): explicit product requirement — "the store
// dashboard should not have connections with SNB order, VRSNB order, Hosur —
// all the orders should only come to Planner's incoming tab, then Planner
// will send the merged orders to store, that's all." Before this change,
// Store had its own parallel path onto the exact same raw, freshly-placed
// 'pending' branch orders (an "Accept Order" step plus its own "Combine Into
// One" merge, both operating on orders.filter(status === 'accepted') —
// completely independent of, and racing with, Planner's own Incoming tab
// (PlannerDashboard.tsx's `incomingOrders`/`mergeableOrders`, both
// `status === 'pending'`). That was the actual connection: a branch order
// could reach Store directly, bypassing Planner entirely. Store's Orders tab
// now only ever reads orders Planner has explicitly merged and sent
// (needsProductionRelease — status store_confirmed/produced) — it no longer
// looks at 'pending' or 'accepted' orders, has no accept step, and no merge
// capability of its own. Merging is entirely Planner's job now.
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

  // Store's entire world: orders Planner has already merged and sent
  // (needsProductionRelease — status store_confirmed/produced, not yet
  // released). Raw 'pending'/'accepted' branch orders are never read here —
  // see the block comment above OrdersTab.
  const pending = orders.filter(o => needsProductionRelease(o));

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
        // BUG FIX (audit 2026-08-26): a cross-branch merged item used to
        // export as ONE row under order.targetBranch showing the FULL
        // combined quantity — misleading on two counts at once (wrong
        // branch label, wrong quantity for that branch). Split into one
        // row per actual contributing branch when branchSplit exists.
        const splits = item.branchSplit && Object.keys(item.branchSplit).length > 0
          ? Object.entries(item.branchSplit)
          : [[o.targetBranch ?? '', item.quantity] as [string, number]];
        for (const [branch, qty] of splits) {
          rows.push([
            String(o.orderNumber),
            o.status,
            branch,
            item.itemName,
            String(qty),
            item.dispatchUnit ?? 'pcs',
            new Date(o.createdAt).toLocaleString('en-IN'),
          ]);
        }
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
      ${o.items.map(item => {
        // Same fix as downloadExcel above — one line per contributing
        // branch instead of the full combined quantity under one branch.
        const splits = item.branchSplit && Object.keys(item.branchSplit).length > 0
          ? Object.entries(item.branchSplit)
          : [[o.targetBranch ?? '—', item.quantity] as [string, number]];
        return splits.map(([branch, qty]) => `
        <tr>
          <td style="padding-left:24px">${item.itemName}</td>
          <td>${qty} ${item.dispatchUnit ?? 'pcs'}</td>
          <td>${o.status}</td>
          <td>${branch}</td>
        </tr>
      `).join('');
      }).join('')}
    `).join('');

    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Pending Orders — ${new Date().toLocaleDateString('en-IN')}</title>
      <style>
        @page { size: auto; margin: 6mm; }
        @media print { html, body { height: auto !important; } }
        body { font-family: sans-serif; font-size: 13px; margin: 16px; color: #111; }
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
      {/* Export / Print header bar — no item-name search here; that lives
          inside ProductionReadyPanel itself (search by item, not order). */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <p className="text-xs font-body font-bold text-muted-foreground uppercase flex-1 min-w-fit">
          {pending.length} Item Batch{pending.length !== 1 ? 'es' : ''} Ready
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

      <ProductionReadyPanel orders={pending} />

      {pending.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-4">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><Store className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No new orders</p><p className="text-xs font-body text-muted-foreground mt-1">Waiting on Planner to send a merged order — nothing to release yet.</p></div>
        </div>
      )}
    </>
  );
}

// BUG FIX (audit 2026-08-27): "the orders are going to History tab... it's
// converting every item into a different order number and showing the
// branch." Root cause: ProductionReadyPanel's "Send to Production" calls
// releaseToProduction once per real contributing order behind an
// aggregated item — and releaseToProduction (bakeryStore.ts) legitimately
// splits off a brand-new single-item order whenever that source order had
// other items still pending, inheriting that source's target_branch. That
// splitting is correct and necessary — Dispatch downstream needs each
// branch's real share traceable — but it means one "send this item"
// click can fan out into several tiny single-item orders, each with its
// own order number and branch tag. History rendered those raw via
// OrderCard, so the exact order-id/branch info the Orders tab was fixed to
// hide was leaking right back in here. Same fix as ProductionReadyPanel:
// aggregate by item name (and day) instead of rendering one card per
// underlying order — Store never needs to know how many split rows a
// release produced, only what and how much was sent, and when.
interface HistoryAggregateRow { key: string; itemName: string; unit: string; quantity: number; dateLabel: string; latestAt: string }

function aggregateHistoryItems(orders: BakeryOrder[]): HistoryAggregateRow[] {
  const byKey = new Map<string, HistoryAggregateRow>();
  for (const order of orders) {
    const at = order.storeConfirmedAt || order.createdAt;
    const dateLabel = kolkataDateLabel(at);
    for (const item of order.items) {
      const key = `${item.itemName.trim().toLowerCase()}|${dateLabel}`;
      let row = byKey.get(key);
      if (!row) {
        row = { key, itemName: item.itemName, unit: item.dispatchUnit || 'kg', quantity: 0, dateLabel, latestAt: at };
        byKey.set(key, row);
      }
      row.quantity += item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
      if (new Date(at) > new Date(row.latestAt)) row.latestAt = at;
    }
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function StoreHistoryTab() {
  const { orders, fetchOrders, subscribe: subscribeOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const unsubOrders = subscribeOrders();
    return () => unsubOrders();
  }, [fetchOrders, subscribeOrders]);

  // Mirror of OrdersTab's `pending` split: an order sent to Store today stays
  // visible in Orders as "new"; it only falls back here once that day has
  // passed (or once production/dispatch has moved it further along anyway).
  const historyOrders = orders.filter(o =>
    o.status === 'dispatched' ||
    ((o.status === 'produced' || o.status === 'store_confirmed') && !needsProductionRelease(o)));

  const aggregated = useMemo(() => aggregateHistoryItems(historyOrders), [historyOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter(r => r.itemName.toLowerCase().includes(q));
  }, [aggregated, search]);

  if (initialLoading) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h3 className="font-display text-lg font-bold text-foreground">Sent To Baker</h3>
        </div>
        <p className="text-xs font-body text-muted-foreground mt-1">Everything already sent to production, grouped by item — no order or branch detail here.</p>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-xs font-body font-bold text-muted-foreground uppercase flex-1 min-w-fit">
          {search.trim() ? `${filtered.length} of ${aggregated.length} Item${aggregated.length !== 1 ? 's' : ''}` : `${aggregated.length} Item${aggregated.length !== 1 ? 's' : ''}`}
        </p>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search item name…"
            className="h-8 w-full rounded-xl border border-border bg-card pl-8 pr-7 text-xs font-body outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {aggregated.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-4 rounded-3xl border border-border bg-card">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><History className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No sent orders yet</p><p className="text-xs font-body text-muted-foreground mt-1">Once a new order is sent to baker, it moves here.</p></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-4 rounded-3xl border border-border bg-card">
          <div className="size-20 rounded-3xl bg-muted flex items-center justify-center"><Search className="size-10 text-muted-foreground opacity-30" /></div>
          <div className="text-center"><p className="text-sm font-body font-semibold text-foreground">No items match "{search}"</p><p className="text-xs font-body text-muted-foreground mt-1">Try a different item name.</p></div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-body font-bold text-foreground truncate">{row.itemName}</p>
                <p className="text-[11px] font-body text-muted-foreground">{row.dateLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-body font-bold tabular-nums text-foreground">{row.quantity} {row.unit}</span>
                <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Sent to Production</span>
              </div>
            </div>
          ))}
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

interface SupplierTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search' | 'url' | 'none';
}

function SupplierTextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
}: SupplierTextFieldProps) {
  return (
    <div>
      <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function splitSupplierItems(value: string): string[] {
  return Array.from(new Map(
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => [normaliseName(item), item] as const),
  ).values());
}

interface SupplierItemSuggestion {
  name: string;
  category: string;
  unit: StockUnit;
  inStock: boolean;
}

function SupplierItemsSelector({
  selectedItems,
  onChange,
  stockItems,
}: {
  selectedItems: string[];
  onChange: (items: string[]) => void;
  stockItems: StockItem[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo<SupplierItemSuggestion[]>(() => {
    const normalizedQuery = normaliseName(query);
    const byName = new Map<string, SupplierItemSuggestion>();

    for (const stockItem of stockItems) {
      if (normalizedQuery && !normaliseName(stockItem.name).includes(normalizedQuery)) continue;
      byName.set(normaliseName(stockItem.name), {
        name: stockItem.name,
        category: 'Inventory',
        unit: toAllowedStockUnit(stockItem.unit),
        inStock: true,
      });
    }

    for (const masterItem of searchItems(query)) {
      const key = normaliseName(masterItem.item);
      if (!byName.has(key)) {
        byName.set(key, {
          name: masterItem.item,
          category: masterItem.category || 'Item Master',
          unit: toAllowedStockUnit(masterItem.uom),
          inStock: false,
        });
      }
    }

    const selected = new Set(selectedItems.map(normaliseName));
    return Array.from(byName.values())
      .filter(item => !selected.has(normaliseName(item.name)))
      .slice(0, 18);
  }, [query, selectedItems, stockItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, suggestions.length]);

  const addItem = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (!selectedItems.some(item => normaliseName(item) === normaliseName(cleanName))) {
      onChange([...selectedItems, cleanName]);
    }
    setQuery('');
    setOpen(true);
  };

  const removeItem = (name: string) => {
    onChange(selectedItems.filter(item => normaliseName(item) !== normaliseName(name)));
  };

  return (
    <div>
      <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Items Supplied</label>
      <div className="rounded-xl border border-border bg-background px-2.5 py-2 focus-within:ring-2 focus-within:ring-primary/30">
        {selectedItems.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedItems.map(item => (
              <span key={normaliseName(item)} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-body font-semibold text-primary">
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="rounded-full p-0.5 hover:bg-primary/10"
                  aria-label={`Remove ${item}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' && suggestions.length > 0) {
                event.preventDefault();
                setActiveIndex(index => Math.min(index + 1, suggestions.length - 1));
              } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                event.preventDefault();
                setActiveIndex(index => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                const suggested = open ? suggestions[activeIndex] : undefined;
                addItem(suggested?.name ?? query);
              } else if (event.key === 'Backspace' && !query && selectedItems.length > 0) {
                removeItem(selectedItems[selectedItems.length - 1]);
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={selectedItems.length > 0 ? 'Add another supplied item…' : 'Type to search and select items…'}
            className="h-8 w-full bg-transparent pl-6 pr-2 text-sm font-body outline-none"
          />

          {open && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
              {suggestions.length > 0 ? suggestions.map((item, index) => (
                <button
                  type="button"
                  key={normaliseName(item.name)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => addItem(item.name)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0',
                    activeIndex === index ? 'bg-primary/5' : 'hover:bg-muted/60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-body font-semibold text-foreground">{item.name}</p>
                    <p className="text-[10px] font-body text-muted-foreground">{item.category}{item.inStock ? ' · In inventory' : ' · Item master'}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-body font-bold text-muted-foreground">{stockUnitLabel(item.unit)}</span>
                </button>
              )) : (
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => addItem(query)}
                  disabled={!query.trim()}
                  className="w-full px-3 py-3 text-left text-xs font-body text-muted-foreground disabled:opacity-50"
                >
                  {query.trim() ? <>Add “<span className="font-semibold text-foreground">{query.trim()}</span>” as a custom item</> : 'No more matching items'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10px] font-body text-muted-foreground">Choose from inventory or the item master. Press Enter to add a custom item.</p>
    </div>
  );
}

function SupplierModal({
  initial,
  initialBusinessName,
  onClose,
  onSave,
}: {
  initial?: Supplier;
  initialBusinessName?: string;
  onClose: () => void;
  onSave: (data: SupplierFormData) => Promise<string | null>;
}) {
  const { items: stockItems, loaded: stockLoaded, load: loadStock } = useStoreStockStore();
  const [form, setForm] = useState<Omit<SupplierFormData, 'itemsSupplied'>>({
    businessName: initial?.businessName ?? initialBusinessName ?? '',
    contactName: initial?.contactName ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
  });
  const [selectedItems, setSelectedItems] = useState<string[]>(() => splitSupplierItems(initial?.itemsSupplied ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!stockLoaded) void loadStock();
  }, [stockLoaded, loadStock]);

  const setField = useCallback((field: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    if (error) setError('');
  }, [error]);

  const handleSave = async () => {
    const businessName = form.businessName.trim();
    const contactName = form.contactName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!businessName) { setError('Business name is required.'); return; }
    if (!phone) { setError('Phone number is required.'); return; }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) { setError('Enter a valid phone number.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address.'); return; }

    setSaving(true);
    setError('');
    try {
      const saveError = await onSave({
        businessName,
        contactName,
        phone,
        email,
        address: form.address.trim(),
        itemsSupplied: selectedItems.join(', '),
      });

      if (saveError) {
        setError(saveError);
        return;
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={() => { if (!saving) onClose(); }}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-24 space-y-3 max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="font-display font-bold text-lg text-foreground">{initial ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <p className="text-[11px] font-body text-muted-foreground">Contact details and supplied items</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted disabled:opacity-50"><X className="size-4" /></button>
        </div>

        <SupplierTextField label="Business Name *" value={form.businessName} onChange={value => setField('businessName', value)} placeholder="e.g. Sri Ganesh Flour Mills" autoComplete="organization" />
        <SupplierTextField label="Contact Name" value={form.contactName} onChange={value => setField('contactName', value)} placeholder="e.g. Ravi Kumar" autoComplete="name" />
        <SupplierTextField label="Phone *" value={form.phone} onChange={value => setField('phone', value)} placeholder="e.g. 9876543210" type="tel" inputMode="tel" autoComplete="tel" />
        <SupplierTextField label="Email" value={form.email} onChange={value => setField('email', value)} placeholder="e.g. info@supplier.com" type="email" inputMode="email" autoComplete="email" />

        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Address</label>
          <textarea
            value={form.address}
            onChange={event => setField('address', event.target.value)}
            placeholder="Full address…"
            rows={2}
            autoComplete="street-address"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <SupplierItemsSelector selectedItems={selectedItems} onChange={items => { setSelectedItems(items); if (error) setError(''); }} stockItems={stockItems} />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-body text-red-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full h-12 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
        >
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
  // BUG FIX: "tap to register" implied clicking a known-from-master name
  // would prefill it into the Add form — the button only opened a blank
  // form (setShowAdd(true), the name itself was never passed anywhere),
  // silently requiring the exact same name to be retyped by hand.
  const [prefillName, setPrefillName] = useState('');

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
        <button onClick={() => { setPrefillName(''); setShowAdd(true); }}
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
              <button key={n} onClick={() => { setPrefillName(n); setShowAdd(true); }}
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
          initialBusinessName={prefillName}
          onClose={() => { setShowAdd(false); setPrefillName(''); }}
          onSave={addSupplier}
        />
      )}
      {editSupplier && (
        <SupplierModal
          initial={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSave={(data) => updateSupplier(editSupplier.id, data)}
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

  useEffect(() => { loadClosure(); }, [loadClosure]);

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <WalletCards className="size-4 text-primary" />
              <h3 className="font-display text-lg font-bold text-foreground">Store Daily Closure</h3>
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1">Daily summary of recipe and custom stock deductions.</p>
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

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: 'Recipe Deductions', value: autoRows.length, sub: 'Sent to baker stock cuts' },
          { label: 'Custom Deductions', value: customRows.length, sub: 'Manual store removals' },
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
  const { orders: purchaseOrders, loaded: poLoaded, load: loadPOs } = useStorePurchaseOrderStore();

  useEffect(() => {
    void loadRecipes();
    const unsubscribe = subscribeRecipes();
    // BUG FIX (2026-08-16): "recipe updated in Admin doesn't show in Store."
    // Traced the whole chain — the save writes to bakery_recipes correctly,
    // the item is linked correctly, and bakery_recipes is enabled for
    // Realtime — but this effect had ONLY the realtime subscription with no
    // fallback at all. A long-lived dashboard tab (which this is — left
    // open all day) can silently lose its websocket (computer sleep, flaky
    // store WiFi, an idle connection getting dropped) with no visible error
    // and no automatic recovery, leaving recipes frozen until a manual
    // reload. loadRecipes(true) forces a real refetch (loadRecipes() alone
    // would no-op once `loaded` is already true) whenever the tab regains
    // focus, so a dropped connection self-corrects instead of staying wrong
    // indefinitely.
    const refreshOnVisible = () => { if (!document.hidden) void loadRecipes(true); };
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', refreshOnVisible); };
  }, [loadRecipes, subscribeRecipes]);
  useEffect(() => { if (!poLoaded) void loadPOs(); }, [poLoaded, loadPOs]);
  void recipes;

  const requestedTab = searchParams.get('tab') as StoreDashboardTab | null;
  const tab: StoreDashboardTab = requestedTab && STORE_TABS.includes(requestedTab) ? requestedTab : 'orders';
  // Kept in sync with OrdersTab/StoreHistoryTab's own filters (see
  // needsProductionRelease above) so the header counters and tab badges
  // never disagree with what each tab actually shows. OrdersTab no longer
  // reads 'accepted' orders at all (audit 2026-08-27 — Store only ever sees
  // what Planner has explicitly merged/sent), so this must match exactly.
  const pending = orders.filter(o => needsProductionRelease(o));
  const sentOrders = orders.filter(o =>
    o.status === 'dispatched' ||
    ((o.status === 'produced' || o.status === 'store_confirmed') && !needsProductionRelease(o)));
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
  const poPendingCount = purchaseOrders.filter(po => po.status === 'pending_approval').length;
  const poApprovedCount = purchaseOrders.filter(po => po.status === 'approved').length;
  const tabs = [
    { id: 'orders',    label: 'Orders',             description: 'Pending + sent today', icon: Package,     badge: pending.length > 0 ? String(pending.length) : null, badgeColor: 'bg-amber-500' },
    { id: 'history',   label: 'Sent by Planner',    description: 'Past orders & follow-up', icon: History,     badge: sentOrders.length > 0 ? String(sentOrders.length) : null, badgeColor: 'bg-emerald-500' },
    { id: 'inventory', label: 'Inventory',          description: 'Raw stock control',  icon: Warehouse,   badge: lowStock.length > 0 ? String(lowStock.length) : null, badgeColor: 'bg-red-500' },
    { id: 'suppliers', label: 'Suppliers',          description: 'Vendor directory',   icon: Truck,       badge: suppliers.length > 0 ? String(suppliers.length) : null, badgeColor: 'bg-primary' },
    { id: 'purchaseOrders', label: 'Purchase Order', description: 'Raise & track Owner approval', icon: ClipboardList, badge: poPendingCount > 0 ? String(poPendingCount) : poApprovedCount > 0 ? String(poApprovedCount) : null, badgeColor: poPendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500' },
    { id: 'invoices',  label: 'GRN',                description: 'Goods receipt & purchase records', icon: FileText,    badge: null, badgeColor: '' },
    { id: 'analytics', label: 'Analytics',          description: 'Stock insights',     icon: Calculator,  badge: null, badgeColor: '' },
    { id: 'custom',    label: 'Custom',             description: 'Manual planning',    icon: ShoppingBag, badge: null, badgeColor: '' },
    { id: 'closure',   label: 'Daily Closure',      description: 'Stock deductions',  icon: WalletCards, badge: null, badgeColor: '' },
    { id: 'report',    label: 'Reports',            description: 'History & exports',  icon: BarChart2,   badge: null, badgeColor: '' },
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
                    <p className="font-display text-lg font-bold text-foreground">{sentOrders.length}</p>
                    <p className="text-[9px] font-body font-bold uppercase text-muted-foreground">Sent</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden">
              {tab === 'orders'    && <OrdersTab />}
              {tab === 'history'   && <StoreHistoryTab />}
              {tab === 'inventory' && <StoreInventoryTab />}
              {tab === 'suppliers' && <SuppliersTab />}
              {tab === 'purchaseOrders' && <StorePurchaseOrderTab />}
              {tab === 'invoices'  && <InvoiceTab />}
              {tab === 'analytics' && <StoreAnalyticsTab />}
              {tab === 'custom'    && <StoreCustomTab />}
              {tab === 'closure'   && <StoreDailyClosureTab />}
              {tab === 'report'    && <StoreReportTab />}
            </div>
          </main>
        </div>
    </div>
  );
}
