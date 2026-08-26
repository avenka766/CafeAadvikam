// src/bakery/PlannerDashboard.tsx
// Replaces the old Production stage (baker/sweet_master/savouries_master/
// cookies_master/puffs_master/bakery_master) and the standalone Packing
// Dashboard. Planner is now the single hub for: merging SNB + VRSNB orders,
// handing merged totals to Store, recording actual production, splitting and
// dispatching to branches, tracking leftovers, and cake dispatch — plus the
// migrated Transfer-In and Daily Closure tools from Packing.
import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList, Layers, Factory, Truck, Cake, PackageCheck,
  ArrowRightLeft, Calendar, Plus, Send, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, FileSpreadsheet, Clock3,
  Store, CreditCard, WalletCards, MessageCircle, Bell, CalendarDays,
  Search, Printer, Receipt, ListPlus, BarChart3, FileText, Minus, IndianRupee,
  ShoppingCart, Percent, Trash2, Scale, PackageMinus, Pencil, RotateCcw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { useBakeryStore, isPlannedOrder, clampQtyForUnit } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, Branch } from './types';
import { BRANCHES, BAKERY_ITEMS } from './types';
import { printHtml } from '@/branch/printUtils';
import { printViaIframe } from '@/lib/printViaIframe';
import PackingTransferInTab from './PackingTransferInTab';
import PackingDailyClosureTab from './PackingDailyClosureTab';
import { exportToExcel } from '@/lib/exportExcel';
import HosurDashboard from '@/pages/HosurDashboard';
import HosurShopOrderPanel, { leftoverReasonLabel } from './HosurShopOrderPanel';
import PackingCakeOrdersTab from './PackingCakeOrdersTab';
import PlannerLeftoverTab, { PlannerTransferOutTab, useLeftoverBalanceMap, recordLeftoverMovement, kolkataToday, qtyFmt, sanitizeQtyForUnit, type LeftoverUnit, useMergedLeftoverCatalog, useMergedCatalogWithPrice, useBranchOnlyCatalog, ItemSearchPicker, type MergedCatalogItem } from './PlannerLeftoverTab';
import { canonicalItemSlug, closingStockItemSlug, parseWeightGrams, pcsToKg, resolveItemWeightGrams } from './itemMatcher';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { useRecipeStore } from './recipeStore';
import { useBranchStore } from '@/branch/branchStore';
import { useNotificationStore } from '@/bakery/notificationStore';
import { printWasteLogBatch } from '@/pages/AdminSNBDashboard';
import {
  businessFor, defaultDiscountPct, saveDispatchInvoice, printDispatchInvoice, listDispatchInvoices, markDispatchInvoicePaid, updateDispatchInvoice,
  type DispatchInvoiceRecord, type DispatchInvoiceItem,
} from './dispatchInvoice';
import { supabase } from '@/lib/supabase';
import { getPackingCounterStatus } from './packingCounter';

// TAB MERGE (2026-08-06): the old standalone 'done' tab ("Leftover / Done" —
// a bare per-order yes/no checkbox with no quantity/item detail) has been
// folded into 'leftover-stock' ("Closing Stock" — the real quantified
// ledger). They were two disconnected systems tracking the same physical
// event; only one tab now, with the order-level "awaiting reconciliation"
// list rendered as a panel inside it. The 'done' key is kept in the type
// (but no longer in TABS/nav) purely so any stale bookmarked URL still
// resolves instead of erroring.
type PlannerTab = 'incoming' | 'sent' | 'merged' | 'planning' | 'production' | 'dispatch' | 'hosur' | 'cake' | 'transfer-in' | 'transfer-out' | 'closure' | 'leftover-stock' | 'invoice' | 'reports' | 'billing' | 'waste' | 'done';
const TABS: { key: PlannerTab; label: string; icon: React.ReactNode }[] = [
  { key: 'incoming',    label: 'Incoming Orders',  icon: <ClipboardList className="size-4" /> },
  { key: 'sent',        label: 'Sent',             icon: <Send className="size-4" /> },
  { key: 'merged',      label: 'Merged Summary',   icon: <Layers className="size-4" /> },
  { key: 'planning',    label: 'Planning',         icon: <ListPlus className="size-4" /> },
  { key: 'production',  label: 'Production Entry', icon: <Factory className="size-4" /> },
  { key: 'dispatch',    label: 'Dispatch',         icon: <Truck className="size-4" /> },
  { key: 'hosur',       label: 'Hosur Shops & Billing', icon: <PackageCheck className="size-4" /> },
  { key: 'cake',        label: 'Cake Dispatch',    icon: <Cake className="size-4" /> },
  { key: 'transfer-in', label: 'Transfer In',      icon: <ArrowRightLeft className="size-4" /> },
  { key: 'transfer-out', label: 'Transfer Out',    icon: <PackageMinus className="size-4" /> },
  { key: 'waste',       label: 'Dump / Damage',    icon: <Trash2 className="size-4" /> },
  { key: 'closure',     label: 'Daily Closure',    icon: <Calendar className="size-4" /> },
  { key: 'leftover-stock', label: 'Closing Stock', icon: <Scale className="size-4" /> },
  { key: 'invoice',     label: 'Invoice',          icon: <Receipt className="size-4" /> },
  { key: 'billing',     label: 'Sales',             icon: <ShoppingCart className="size-4" /> },
  { key: 'reports',     label: 'Reports',          icon: <BarChart3 className="size-4" /> },
];

// 'Planned' is a synthetic bucket alongside the three real branches — proactive
// extra-production batches from the Planning tab aren't tied to a branch until
// Dispatch time, but still need to flow through Merged Summary/Production Entry
// like any other bucket, so every place that used to key strictly on `Branch`
// now also accepts this string.
type MergeBucket = Branch | 'Planned';
const DISPLAY_BUCKETS: readonly MergeBucket[] = [...BRANCHES, 'Planned'];

const BRANCH_META: Record<MergeBucket, { bg: string; text: string; icon: string }> = {
  VRSNB:   { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',    icon: '🏙️' },
  SNB:     { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: '🏪' },
  Hosur:   { bg: 'bg-teal-50 border-teal-200', text: 'text-teal-700', icon: '🌿' },
  Planned: { bg: 'bg-primary/5 border-teal',      text: 'text-primary',    icon: '📋' },
};
// Every order (including Planning-tab batches) resolves to one bucket for
// grouping — never null, so nothing here can be silently mislabeled as SNB.
const bucketFor = (order: Pick<BakeryOrder, 'targetBranch' | 'notes'>): MergeBucket =>
  order.targetBranch ?? (isPlannedOrder(order) ? 'Planned' : 'SNB');

// ─── Merge helper ────────────────────────────────────────────────────────────
interface MergedRow {
  itemName: string;
  unit: 'pcs' | 'kg';
  totalRequested: number;
  perBranch: Partial<Record<MergeBucket, number>>;
  contributingOrderIds: string[];
  // FEATURE (2026-08-09 / #280): only populated by computeMergedSummaryDisplay
  // — when a row folds together more than one distinct raw item name (e.g.
  // "Beetroot Muruku" + "Beetroot Muruku 200gm"), this lists each original
  // name with its own sub-total (and per-branch breakdown) so the Merged
  // Summary tab can show what got combined and let the planner split it back
  // apart if the merge was wrong.
  variants?: { itemName: string; unit: 'pcs' | 'kg'; total: number; perBranch: Partial<Record<MergeBucket, number>> }[];
}

// RETRY-SAFETY FIX (2026-08-06): submitDispatch used to mint a fresh UUID
// for every dispatch entry inside itself, so a genuine client retry (e.g.
// after a network timeout where the request actually succeeded server-side
// but the response never reached the browser) always looked like a brand
// new dispatch to every idempotency guard downstream — duplicating the
// dispatch log entry, the branch_incoming row, and the Closing Stock ledger
// debit. Every dispatch UI now generates its own id(s) via this hook,
// keyed per order, and only clears them on confirmed success — so clicking
// "Dispatch"/"Confirm" again after a failure reuses the SAME id(s), and the
// (now-idempotent) server-side RPC + client-side checks correctly recognize
// it as the same dispatch instead of a new one.
function useStableDispatchIds() {
  const ref = useRef<Map<string, string>>(new Map());
  const getId = useCallback((key: string) => {
    let id = ref.current.get(key);
    if (!id) { id = crypto.randomUUID(); ref.current.set(key, id); }
    return id;
  }, []);
  const reset = useCallback(() => { ref.current.clear(); }, []);
  return { getId, reset };
}

// Item names can differ in case/spacing between orders placed by different
// branches (e.g. "Dilpasand" vs "DILPASAND"). computeMergedSummary already
// groups by a normalized key, but several call sites below used to compare
// with exact `===`, silently dropping branches/dispatches whose casing
// differed. sameItem() is the one place that comparison happens now.
const sameItem = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function computeMergedSummary(orders: BakeryOrder[]): MergedRow[] {
  const rows = new Map<string, MergedRow>();
  for (const order of orders) {
    // DEFENSIVE FIX (audit 2026-08-07): this used to derive the bucket
    // inline and `continue` (silently drop the whole order) whenever
    // target_branch was null and the order wasn't tagged 'Planned' — even
    // though the shared bucketFor() helper right above exists specifically
    // so nothing here is ever silently mislabeled/dropped. Every normal
    // flow (submitOrder, submitPlannedOrder) always sets one or the other,
    // so this wasn't reachable in practice, but a legacy/manually-edited
    // row with a null target_branch would vanish from Merged Summary /
    // Send-to-Store with zero indication. Use bucketFor() so it's handled
    // the same way everywhere instead of two different fallback rules.
    const bucket: MergeBucket = bucketFor(order);
    for (const item of order.items) {
      const unit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
      const key = `${item.itemName.trim().toLowerCase()}__${unit}`;
      const existing = rows.get(key);
      // FEATURE (2026-08-26): "merge across branches too" — same fix as
      // computeMergedSummaryDisplay above: an item with branchSplit came
      // from a cross-branch Store merge, so its quantity needs splitting
      // back across each contributing branch instead of all going to
      // bucketFor(order) alone.
      const splits: Array<[MergeBucket, number]> = item.branchSplit && Object.keys(item.branchSplit).length > 0
        ? Object.entries(item.branchSplit).filter(([, q]) => q) as Array<[MergeBucket, number]>
        : [[bucket, unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity]];
      const totalQty = splits.reduce((s, [, q]) => s + q, 0);
      if (existing) {
        existing.totalRequested += totalQty;
        for (const [splitBucket, splitQty] of splits) existing.perBranch[splitBucket] = (existing.perBranch[splitBucket] || 0) + splitQty;
        if (!existing.contributingOrderIds.includes(order.id)) existing.contributingOrderIds.push(order.id);
      } else {
        const perBranch: Partial<Record<MergeBucket, number>> = {};
        for (const [splitBucket, splitQty] of splits) perBranch[splitBucket] = (perBranch[splitBucket] || 0) + splitQty;
        rows.set(key, {
          itemName: item.itemName,
          unit,
          totalRequested: totalQty,
          perBranch,
          contributingOrderIds: [order.id],
        });
      }
    }
  }
  // BUG FIX: "sometimes unable to select an item" — every downstream
  // consumer (checkboxes, React `key` props, the `selected` Set used for
  // bulk dispatch) treats row.itemName as a unique identifier, but this
  // map is keyed by name+unit together — meaning the exact same item name
  // ordered in kg by one branch and pcs by another produces two separate
  // rows sharing one itemName. That collision meant selecting one variant
  // could silently also affect the other, and gave React two elements
  // with the same key (undefined, intermittent render behavior — matching
  // the "sometimes" in the report). Disambiguate by appending the unit
  // only in the rare case this actually happens, so the vast majority of
  // items (a single unit) are completely unaffected.
  const nameCounts = new Map<string, number>();
  for (const row of rows.values()) {
    const key = row.itemName.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const row of rows.values()) {
    const key = row.itemName.trim().toLowerCase();
    if ((nameCounts.get(key) ?? 0) > 1) {
      row.itemName = `${row.itemName} (${row.unit})`;
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.totalRequested - a.totalRequested);
}

// Strip a trailing packet-weight suffix like "(200g)" / "(1kg)" from a display
// name. Only used once quantities have already been normalised to kg — at
// that point the weight suffix (which described a single packet, not the
// merged total) would be misleading next to a combined multi-kg figure.
function cleanItemDisplayName(name: string): string {
  return name
    .replace(/\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|ml|l)\s*\)/i, '')
    // FEATURE (2026-08-09 / #280): same cleanup for a BARE (no parens)
    // trailing weight — "Beetroot Muruku 200gm" — only stripped once the row
    // has actually been merged with another variant of the same item (see
    // mergeGroup's variants.length > 1 check), never for a lone item.
    .replace(/\s+\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|mls?|ltrs?|l)\.?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function mergeGroupToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

// Grouping key for computeMergedSummaryDisplay only (audit 2026-08-07
// hardening) — deliberately NOT itemMatcher's canonicalItemSlug(), which
// strips the content of ANY parenthetical (weight, pack size, or a real
// qualifier like "(Diwali Pack)"). That's the right behaviour for recipe-key
// lookups, but reused here it would risk silently merging two genuinely
// different catalogue items that only differ by a non-weight qualifier —
// no such collision exists in the catalogue today, but nothing stops one
// being added later. Only weight-pattern parens are stripped; anything else
// stays part of the key, alongside the same case/plural normalisation
// canonicalItemSlug uses, so "Garlic nippat (200g)" and "GARLIC NIPPAT"
// still merge, but "X (Diwali Pack)" and "X (Family Pack)" never would.
function mergeGroupKey(name: string): string {
  const withoutParenWeight = name.replace(/\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|ml|l)\s*\)/gi, '');
  // FIX (2026-08-09 / #280): "Beetroot Muruku" (SNB) vs "Beetroot Muruku
  // 200gm" (VRSNB) used to land as two separate Merged Summary rows — the
  // weight-stripping above only caught a PARENTHESIZED suffix. Branches also
  // just tack the weight on bare, with no parens, so strip that too — but
  // ONLY at the very end of the name, never mid-string, so a real qualifier
  // that happens to contain a number is never touched.
  const withoutTrailingWeight = withoutParenWeight.replace(/\s+\d+(?:\.\d+)?\s*(?:kgs?|gms?|g|mls?|ltrs?|l)\.?\s*$/i, '');
  return withoutTrailingWeight
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(mergeGroupToken)
    .join('-');
}

// DISPLAY-ONLY merge for the Merged Summary / Sent tabs (2026-08-07 fix).
//
// Bug: the same physical item can be ordered in different units by different
// branches — e.g. VRSNB always orders cookies/snacks as packets, so "Garlic
// nippat (200g)" arrives with dispatchUnit 'pcs', while SNB/Hosur/Planning
// enter "GARLIC NIPPAT" directly in kg. computeMergedSummary() above keys
// rows by `name__unit`, so these landed as two disconnected rows (10 pcs
// under VRSNB vs 5 kg under SNB) even though they're the same item.
//
// computeMergedSummary() itself is intentionally left untouched — it also
// feeds computeProductionRows() (Production Entry / Dispatch), where
// autoSplitForItem's proportional split and the pcs↔kg round-trip in
// Packing genuinely depend on one unit per row. Folding units together there
// would silently corrupt produced/dispatched quantities.
//
// Here, for the read-only "what did branches order" summary, it's safe (and
// correct) to fold pcs entries into kg using the packet weight — parsed from
// the item name (e.g. "(200g)") or resolved via resolveItemWeightGrams for
// VRSNB catalogue items that don't spell it out — and show one row per item.
// If a pcs entry's weight genuinely can't be resolved, it's kept as its own
// row rather than guessed at, so a bad conversion never silently appears.
export function computeMergedSummaryDisplay(orders: BakeryOrder[]): MergedRow[] {
  interface RawEntry {
    itemId: string;
    itemName: string;
    unit: 'pcs' | 'kg';
    qty: number;
    grams: number | null; // per-packet grams, only meaningful when unit === 'pcs'
    bucket: MergeBucket;
    orderId: string;
  }
  const groups = new Map<string, RawEntry[]>();
  for (const order of orders) {
    // See matching note in computeMergedSummary above — use the canonical
    // bucketFor() helper instead of a local null-prone fallback.
    const bucket: MergeBucket = bucketFor(order);
    for (const item of order.items) {
      const unit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
      const grams = unit === 'pcs'
        ? (item.weightGrams ?? parseWeightGrams(item.itemName) ?? resolveItemWeightGrams(item.itemId, item.itemName))
        : null;
      const key = mergeGroupKey(item.itemName) || item.itemName.trim().toLowerCase();
      const list = groups.get(key) ?? [];
      // FEATURE (2026-08-26): "merge across branches too" — an item
      // carrying a branchSplit came from a Store Dashboard merge that
      // combined orders from more than one branch; bucketFor(order) alone
      // would incorrectly attribute the WHOLE combined quantity to just
      // the surviving order's own branch. Split it back into one entry
      // per contributing branch instead, using each branch's own qty.
      if (item.branchSplit && Object.keys(item.branchSplit).length > 0) {
        for (const [splitBranch, splitQty] of Object.entries(item.branchSplit)) {
          if (!splitQty) continue;
          const qty = unit === 'pcs' && item.originalPcs != null
            ? Math.round((splitQty / item.quantity) * item.originalPcs * 1000) / 1000
            : splitQty;
          list.push({ itemId: item.itemId, itemName: item.itemName, unit, qty, grams, bucket: splitBranch as MergeBucket, orderId: order.id });
        }
      } else {
        const qty = unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
        list.push({ itemId: item.itemId, itemName: item.itemName, unit, qty, grams, bucket, orderId: order.id });
      }
      groups.set(key, list);
    }
  }

  const rows: MergedRow[] = [];
  const mergeGroup = (list: RawEntry[], unit: 'pcs' | 'kg', convertPcsToKg: boolean) => {
    if (list.length === 0) return;
    let totalRequested = 0;
    const perBranch: Partial<Record<MergeBucket, number>> = {};
    const contributingOrderIds: string[] = [];
    // FEATURE (2026-08-09 / #280): track each distinct raw item name folded
    // into this row, with its own sub-total, so a merge that combined
    // "Beetroot Muruku" + "Beetroot Muruku 200gm" can show both names on
    // hover instead of silently picking one and hiding the other.
    const variantTotals = new Map<string, { itemName: string; unit: 'pcs' | 'kg'; total: number; perBranch: Partial<Record<MergeBucket, number>> }>();
    for (const e of list) {
      const qty = convertPcsToKg && e.unit === 'pcs' && e.grams != null
        ? (pcsToKg(e.itemName, e.qty, e.grams) ?? e.qty)
        : e.qty;
      totalRequested += qty;
      perBranch[e.bucket] = Math.round(((perBranch[e.bucket] || 0) + qty) * 1000) / 1000;
      if (!contributingOrderIds.includes(e.orderId)) contributingOrderIds.push(e.orderId);
      const vKey = `${e.itemName.trim().toLowerCase()}__${e.unit}`;
      const vCur = variantTotals.get(vKey) ?? { itemName: e.itemName.trim(), unit: e.unit, total: 0, perBranch: {} };
      vCur.total = Math.round((vCur.total + qty) * 1000) / 1000;
      vCur.perBranch[e.bucket] = Math.round(((vCur.perBranch[e.bucket] || 0) + qty) * 1000) / 1000;
      variantTotals.set(vKey, vCur);
    }
    const variants = Array.from(variantTotals.values());
    // Prefer the kg-native name for the merged label (already unit-agnostic);
    // fall back to the first entry, stripping any packet-weight suffix once
    // the row has been converted to kg so it doesn't read like a per-packet
    // figure next to a multi-item total. Same cleanup also applies whenever
    // this row folded together more than one distinct raw name — e.g. plain
    // "Beetroot Muruku" merging with "Beetroot Muruku 200gm" — so the label
    // doesn't just show whichever variant happened to be looked up first.
    const nameSource = list.find(e => e.unit === 'kg') ?? list[0];
    const itemName = (convertPcsToKg || variants.length > 1) ? cleanItemDisplayName(nameSource.itemName) : nameSource.itemName;
    rows.push({
      itemName,
      unit,
      totalRequested: Math.round(totalRequested * 1000) / 1000,
      perBranch,
      contributingOrderIds,
      variants: variants.length > 1 ? variants : undefined,
    });
  };

  for (const entries of groups.values()) {
    const kgEntries = entries.filter(e => e.unit === 'kg');
    const convertiblePcs = entries.filter(e => e.unit === 'pcs' && e.grams != null);
    const unresolvedPcs = entries.filter(e => e.unit === 'pcs' && e.grams == null);

    if (kgEntries.length > 0 && convertiblePcs.length > 0) {
      // Mixed units and every pcs entry has a resolvable packet weight —
      // merge into a single kg row. This is the Garlic Nippat case.
      mergeGroup([...kgEntries, ...convertiblePcs], 'kg', true);
    } else {
      mergeGroup(kgEntries, 'kg', false);
      mergeGroup(convertiblePcs, 'pcs', false);
    }
    // Never guess a conversion — anything whose packet weight couldn't be
    // resolved stays as its own untouched pcs row.
    mergeGroup(unresolvedPcs, 'pcs', false);
  }
  // BUG FIX: same fix as computeMergedSummary above — this function can
  // also push two separate rows (kg and pcs) for the same underlying item
  // name when no unit conversion is available between them, producing the
  // same itemName collision.
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.itemName.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const key = row.itemName.trim().toLowerCase();
    if ((nameCounts.get(key) ?? 0) > 1) {
      row.itemName = `${row.itemName} (${row.unit})`;
    }
  }
  return rows.sort((a, b) => b.totalRequested - a.totalRequested);
}

// Category lookup (Sweets / Savouries / Bakery / Cookies / Other) by item name.
const ITEM_CATEGORY_BY_NAME = new Map(BAKERY_ITEMS.map(i => [i.name.trim().toLowerCase(), i.category]));
export function categoryForItem(itemName: string): string {
  return ITEM_CATEGORY_BY_NAME.get(itemName.trim().toLowerCase()) || 'Other';
}
const CATEGORY_ORDER = ['Sweets', 'Savouries', 'Bakery', 'Cookies', 'Other'];

export interface ProductionRow extends MergedRow {
  category: string;
  preparedTotal: number;
  /** 'not_started' = planner hasn't entered anything yet · 'pending' = partially entered, more coming ·
   *  'completed' = baker fully produced this item, ready to dispatch. */
  itemStatus: 'not_started' | 'pending' | 'completed';
}

// Builds merged rows (same shape as computeMergedSummary) but enriched with the
// planner's per-item production status, read from each contributing order's
// producedItems[].status (no schema change needed — reuses the existing jsonb field).
export function computeProductionRows(orders: BakeryOrder[]): ProductionRow[] {
  const merged = computeMergedSummary(orders);
  return merged.map(row => {
    const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id));
    let preparedTotal = 0;
    let anyRecorded = false;
    let allCompleted = contributing.length > 0;
    for (const order of contributing) {
      const item = order.items.find(i => sameItem(i.itemName, row.itemName));
      const prod = item ? order.producedItems?.find(p => p.itemId === item.itemId) : undefined;
      if (prod) {
        anyRecorded = true;
        preparedTotal += prod.quantityPrepared;
        if (prod.status !== 'completed') allCompleted = false;
      } else {
        allCompleted = false;
      }
    }
    const itemStatus: ProductionRow['itemStatus'] = allCompleted ? 'completed' : anyRecorded ? 'pending' : 'not_started';
    return { ...row, category: categoryForItem(row.itemName), preparedTotal, itemStatus };
  });
}

// Proportional auto-split of a produced total across the contributing orders,
// weighted by each order's original requested share for that item.
export function autoSplitForItem(orders: BakeryOrder[], itemName: string, totalProduced: number): Record<string, number> {
  const contributing = orders.filter(o => o.items.some(i => sameItem(i.itemName, itemName)));
  const shares = contributing.map(o => {
    const item = o.items.find(i => sameItem(i.itemName, itemName))!;
    const isPcs = item.dispatchUnit === 'pcs';
    const requested = isPcs && item.originalPcs != null ? item.originalPcs : item.quantity;
    return { orderId: o.id, requested };
  });
  const totalRequested = shares.reduce((s, x) => s + x.requested, 0) || 1;
  const split: Record<string, number> = {};
  for (const s of shares) {
    split[s.orderId] = Math.round((totalProduced * (s.requested / totalRequested)) * 100) / 100;
  }
  return split;
}

// FEATURE (2026-08-26): "orders correctly displayed / dispatchable across
// branches" — companion to autoSplitForItem above, specifically for
// dispatch. Left autoSplitForItem itself untouched since it's also used
// for production-entry splitting, where branch genuinely doesn't matter.
// For a cross-branch merged item, "how much of this order's contribution
// belongs to branch X" is item.branchSplit[X], NOT the item's full
// combined quantity — using the full quantity there would double-count
// the order into every branch's dispatch pool instead of just its own
// real share.
function autoSplitForItemByBranch(orders: BakeryOrder[], itemName: string, branch: Branch, totalToDispatch: number): Record<string, number> {
  const shares: { orderId: string; requested: number }[] = [];
  for (const o of orders) {
    const item = o.items.find(i => sameItem(i.itemName, itemName));
    if (!item) continue;
    if (item.branchSplit && Object.keys(item.branchSplit).length > 0) {
      const share = item.branchSplit[branch];
      if (share) shares.push({ orderId: o.id, requested: share });
    } else if (o.targetBranch === branch) {
      const isPcs = item.dispatchUnit === 'pcs';
      shares.push({ orderId: o.id, requested: isPcs && item.originalPcs != null ? item.originalPcs : item.quantity });
    }
  }
  const totalRequested = shares.reduce((s, x) => s + x.requested, 0) || 1;
  const split: Record<string, number> = {};
  for (const s of shares) {
    split[s.orderId] = Math.round((totalToDispatch * (s.requested / totalRequested)) * 100) / 100;
  }
  return split;
}

// -- Printer Setup modal (2026-08-11) -----------------------------------------
// BUG FIX: "planner dashboard thermal printer issues — nothing prints /
// printer not found" on dispatch invoice / bill / walk-in receipt. Root
// cause: every Planner thermal print (printDispatchInvoice, used directly by
// the Dispatch tab AND by printWalkinBill) only ever called the browser's
// native window.print() via a hidden iframe — that always goes to whichever
// printer Windows has set as its default, with no way to target a specific
// named thermal printer. If the billing PC's thermal roll printer isn't (or
// can't be) set as the OS default, that shows up exactly as reported —
// nothing prints, or the OS print dialog can't find a usable printer. This
// mirrors the identical failure already diagnosed and fixed for the Biller
// dashboard's KOT/Bill printers (see BillingDashboard.tsx's PrinterSetupModal
// + src/lib/qzPrint.ts): QZ Tray, once installed on the machine, lets the app
// send a print job straight to one named printer, silently, no OS dialog.
// printDispatchInvoice (dispatchInvoice.ts) now tries QZ Tray first for
// thermal prints and only falls back to the untouched browser-print path if
// QZ Tray isn't set up — this modal is where the planner picks (once) which
// installed printer is the "planner-bill" role QZ should target.
function PlannerPrinterSetupModal({ onClose }: { onClose: () => void }) {
  const [qzOnline, setQzOnline] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [billPrinter, setBillPrinterState] = useState('');
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    const [{ isQzAvailable, listQzPrinters, getPrinterPref }] = await Promise.all([import('@/lib/qzPrint')]);
    const online = await isQzAvailable();
    setQzOnline(online);
    setPrinters(online ? await listQzPrinters() : []);
    setBillPrinterState(getPrinterPref('planner-bill'));
    setChecking(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (value: string) => {
    const { setPrinterPref } = await import('@/lib/qzPrint');
    setPrinterPref('planner-bill', value);
    setBillPrinterState(value);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="size-11 shrink-0 rounded-2xl bg-slate-100 flex items-center justify-center"><Printer className="size-5 text-slate-700" /></div>
            <div>
              <h2 className="font-display text-lg font-black">Printer Setup</h2>
              <p className="text-sm text-muted-foreground">Send dispatch invoices, bills and walk-in receipts straight to your thermal printer.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-muted"><X className="size-4" /></button>
        </div>

        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', qzOnline ? 'bg-emerald-500' : 'bg-red-500')} />
            <span className="text-sm font-bold">{checking ? 'Checking QZ Tray…' : qzOnline ? 'QZ Tray connected' : 'QZ Tray not detected'}</span>
            <button onClick={() => void refresh()} className="ml-auto text-xs font-bold text-muted-foreground underline">Recheck</button>
          </div>
          {!checking && !qzOnline && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p>
                Install QZ Tray (free, one-time) from <span className="font-bold">qz.io</span> on this printing computer, then click Recheck.
                Until it's installed, prints keep using the old way (whatever printer is set as Windows default) — nothing here is required for printing to keep working.
              </p>
              <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
                <span className="font-bold">Already installed and running, but still shows "not detected"?</span> This is normal the first time — this website talks to QZ Tray over a secure connection your browser doesn't trust yet. Fix it once: open a <span className="font-bold">new browser tab</span>, go to <span className="font-bold">https://localhost:8181</span>, click "Advanced" then "Proceed" on the warning page, then come back here and click Recheck.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-xs font-black uppercase text-muted-foreground">Bill / Receipt Printer</label>
          {qzOnline ? (
            <select value={billPrinter} onChange={(e) => void save(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">
              <option value="">Not set — use Windows default</option>
              {printers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input value={billPrinter} onChange={(e) => void save(e.target.value)} placeholder="Exact printer name from Windows" className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold" />
          )}
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-950 py-3 text-sm font-black text-white">Done</button>
      </div>
    </div>
  );
}

export default function PlannerDashboard({ embedded = false }: { embedded?: boolean } = {}) {
  const { orders, loading, fetchOrders, subscribe, submitOrder } = useBakeryStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as PlannerTab | null;
  const urlTabValid: PlannerTab | null = urlTab && TABS.some(t => t.key === urlTab) ? urlTab : null;
  // BUG FIX (2026-08-12): this whole top-level tab used to be derived purely
  // from the `?tab=` URL param, switched only via WorkspaceChrome's sidebar
  // Links (role==='planner' only) — there was no in-page control at all.
  // Now that Owner Dashboard embeds this component directly as one of ITS
  // OWN tabs (also keyed off a `?tab=` param on the SAME url, e.g.
  // `/owner?tab=planner`), two problems appeared: (1) an owner viewing the
  // embedded Planner tab has no sidebar entry for it at all (that sidebar
  // section is gated to role==='planner'), so they could never navigate off
  // 'incoming' to Dispatch/Hosur/Closing Stock/etc; (2) even for the
  // standalone route, any in-page action that wrote `tab` on this shared
  // param (see HosurUnifiedSection.selectTab below) would silently stomp
  // Owner's own outer tab selection. Fix: keep local `tab` state that always
  // drives the render, add a real in-page tab strip below, and only mirror
  // it into the URL's `tab` key when NOT embedded (so the standalone route's
  // bookmarks / sidebar deep-links keep working, while the embedded view
  // never touches its host's URL param).
  const [localTab, setLocalTab] = useState<PlannerTab>(() => urlTabValid ?? 'incoming');
  useEffect(() => {
    if (!embedded && urlTabValid && urlTabValid !== localTab) setLocalTab(urlTabValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, urlTabValid]);
  const tab = localTab;
  const goToTab = (next: PlannerTab) => {
    setLocalTab(next);
    if (!embedded) {
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    }
  };

  // BUG FIX (2026-08-09): "if we add an extra item and come back to search
  // its gone again" — every tab below is conditionally rendered
  // (`tab === X && <Component/>`), so switching away from Dispatch to any
  // other tab (even just to search/check something) fully UNMOUNTED
  // DispatchTab, wiping every bit of in-progress work in its children —
  // BranchFlatDispatchPanel's staged extra items, ticked-but-not-yet-sent
  // selections, typed quantities, all of it, with zero warning. Once the
  // planner has ever opened Dispatch, keep it mounted permanently (just
  // hidden via CSS when another tab is active) so none of that staged work
  // can ever be silently lost by navigating away and back.
  const [dispatchVisited, setDispatchVisited] = useState(false);
  useEffect(() => { if (tab === 'dispatch') setDispatchVisited(true); }, [tab]);

  useEffect(() => {
    fetchOrders().catch(() => {});
    const unsubscribe = subscribe();
    const refreshOnVisible = () => { if (!document.hidden) fetchOrders(true).catch(() => {}); };
    document.addEventListener('visibilitychange', refreshOnVisible);
    // Realtime handles normal order changes. This bounded, infrequent poll
    // is only a recovery path for a dropped websocket connection that
    // stays undetected because the tab never lost focus (visibilitychange
    // alone doesn't catch that case — restored 2026-08-18, matching the
    // same fix already applied to BranchDashboard.tsx for the identical
    // reason).
    const id = setInterval(() => { if (!document.hidden) fetchOrders(true).catch(() => {}); }, 15 * 60_000);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', refreshOnVisible); clearInterval(id); };
  }, [fetchOrders, subscribe]);

  const incomingOrders   = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const sentOrders        = useMemo(() => orders.filter(o => o.status === 'accepted' || o.status === 'store_confirmed' || o.status === 'produced' || o.status === 'dispatched'), [orders]);
  const mergeableOrders    = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const readyForProduction = useMemo(() => orders.filter(o => o.status === 'store_confirmed'), [orders]);
  const producedOrders    = useMemo(() => orders.filter(o => o.status === 'produced'), [orders]);
  // WORKFLOW CHANGE (2026-08-10): reverted the 2026-08-06 "show everything"
  // change — the owner found that orders never sent to Store (still
  // 'pending'/'accepted') were showing up in Production Entry/Dispatch as if
  // they were today's work, which was confusing since Store hadn't actually
  // received them yet. Production Entry + Dispatch now only source orders
  // once Store has combined + confirmed them (status 'store_confirmed' or
  // later) — the same gate 'Sent'/Reports already use elsewhere.
  // BUG FIX (2026-08-10): "planning orders that has been placed should only
  // show in Dispatch tab -> Custom(Planned)... currently not displaying." A
  // Planning-tab batch (Planned bucket, target_branch null) has no real
  // branch/Store waiting on it the way a VRSNB/SNB/Hosur order does — it's
  // the Planner's own stock plan, sitting at status 'pending' until someone
  // separately visits Merged Summary and clicks "Send to Store". That extra
  // manual detour is exactly why placed plans looked like they'd vanished.
  // Carve Planned-bucket orders out of the store-confirmation gate above
  // (added 2026-08-10 for real branch orders, and still fully in force for
  // them) so a plan shows in Production Entry / Dispatch the moment it's
  // placed, without needing anyone to "send" it anywhere first.
  // REVERTED (2026-08-13): a same-day attempt to also gate this on Store's
  // own productionReleasedAt (StoreDashboard.tsx's needsProductionRelease /
  // releaseToProduction) was wrong — confirmed by the owner: "as soon as
  // the planner sends the orders to store they will be able to enter the
  // production and they will also see the items in dispatch, this is
  // working as I requested." Store's select-and-send checkbox is Store's
  // own internal tracking (Orders vs. History on ITS dashboard only) — it
  // was never meant to block Planner/Baker, who already have full access
  // the instant an order reaches 'store_confirmed'. Back to the 2026-08-10
  // gate exactly as it was.
  const productionSourceOrders = useMemo(
    () => orders.filter(o => ['store_confirmed', 'produced', 'dispatched'].includes(o.status) || (o.status === 'pending' && bucketFor(o) === 'Planned')),
    [orders],
  );
  const activeLeftovers    = useMemo(() => orders.filter(o => (o.leftoverStatus ?? 'pending') === 'pending' && o.status === 'dispatched'), [orders]);
  const doneOrders         = useMemo(() => orders.filter(o => o.leftoverStatus === 'done'), [orders]);

  return (
    // BUG FIX (2026-08-12): dropped the forced `min-h-screen warm-gradient`
    // when embedded — this div used to assume it was always the page root,
    // but Owner Dashboard now nests it inside its own tab body, which left a
    // visible extra-viewport-tall background-color seam under Owner's own
    // background whenever the Planner tab's content was shorter than one
    // screen.
    <div className={embedded ? undefined : 'min-h-screen warm-gradient'}>
      <main className={embedded ? undefined : 'mx-auto max-w-7xl px-4 py-6'}>
        {/* In-page tab strip — ONLY when embedded (e.g. inside Owner
            Dashboard), where it's the sole way to switch top-level Planner
            tabs since there's no sidebar in that context. The standalone
            Planner app already has its own left sidebar nav for this, so
            rendering this strip there too just duplicated it (2026-08-12
            fix — this used to render unconditionally). */}
        {embedded && (
          <div className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto pb-1">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => goToTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors shrink-0',
                  tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {tab === 'incoming' && <IncomingOrdersTab orders={incomingOrders} onAdd={submitOrder} />}
            {tab === 'sent' && <SentOrdersTab orders={sentOrders} />}
            {tab === 'merged' && <MergedSummaryTab orders={mergeableOrders} />}
            {tab === 'planning' && <PlanningTab orders={orders} />}
            {tab === 'production' && <ProductionEntryTab orders={productionSourceOrders} />}
            {dispatchVisited && (
              <div style={{ display: tab === 'dispatch' ? 'block' : 'none' }}>
                <DispatchTab orders={productionSourceOrders} allOrders={orders} />
              </div>
            )}
            {tab === 'hosur' && <HosurUnifiedSection embedded={embedded} />}
            {tab === 'cake' && <PackingCakeOrdersTab mode="planner" />}
            {tab === 'transfer-in' && <PackingTransferInTab />}
            {tab === 'transfer-out' && <PlannerTransferOutTab />}
            {tab === 'waste' && <PlannerWasteLogsTab />}
            {tab === 'closure' && <PackingDailyClosureTab />}
            {tab === 'leftover-stock' && (
              <div className="space-y-6">
                <PlannerLeftoverTab />
                <LeftoverDoneTab active={activeLeftovers} done={doneOrders} />
              </div>
            )}
            {tab === 'invoice' && <InvoiceTab orders={orders} />}
            {tab === 'billing' && <BillingWalkinTab />}
            {tab === 'reports' && <ReportsTab orders={orders} />}
          </>
        )}
      </main>
    </div>
  );
}

// Reusable manual-refresh control for tabs that read from the shared
// `orders` store — the store already auto-polls every 15s in the
// background, but staff asked for a way to pull fresh data on demand
// instead of waiting for the next poll tick. silent+force bypasses the
// freshness throttle without flipping the store's global `loading` flag
// (which would otherwise blank the whole tab behind a full-page spinner).
function RefreshOrdersButton({ className }: { className?: string }) {
  const fetchOrders = useBakeryStore(s => s.fetchOrders);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchOrders(true, true); } finally { setRefreshing(false); }
  };
  return (
    <button
      type="button"
      onClick={() => void handleRefresh()}
      disabled={refreshing}
      title="Refresh orders"
      className={cn('flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60', className)}
    >
      <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> Refresh
    </button>
  );
}

// ─── Tab: Incoming Orders ───────────────────────────────────────────────────
// FEATURE (2026-08-24): "Incoming Orders: Hosur shop name not shown" —
// same HOSUR_ORDER_ID(S) notes-tag pattern used by collectHosurOrderIds/
// the Dispatch tab's shop lookup (see mergeOrdersForStore's collectHosurIds
// for how the tag gets written), extracted into one shared hook so
// Incoming doesn't duplicate its own copy of this parsing+fetch.
function extractHosurOrderIds(notes: string | null | undefined): string[] {
  const text = String(notes ?? '');
  const plural = text.match(/HOSUR_ORDER_IDS:([^|]+)/);
  if (plural?.[1]) return plural[1].split(',').map(s => s.trim()).filter(Boolean);
  const singular = text.match(/HOSUR_ORDER_ID:([^|]+)/);
  return singular?.[1] ? [singular[1].trim()] : [];
}
function useHosurShopNames(orders: BakeryOrder[]): Map<string, string> {
  const [byOrderId, setByOrderId] = useState<Map<string, string>>(new Map());
  // BUG FIX (audit 2026-08-26): same fix as collectHosurOrderIds — gating
  // on targetBranch === 'Hosur' misses a merged order that genuinely
  // carries the Hosur tag in its notes but whose surviving primary branch
  // (target_branch) isn't itself 'Hosur'.
  const hosurIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) extractHosurOrderIds(o.notes).forEach(id => ids.add(id));
    return Array.from(ids);
  }, [orders]);
  const key = hosurIds.join(',');
  useEffect(() => {
    let cancelled = false;
    if (hosurIds.length === 0) { setByOrderId(new Map()); return; }
    (async () => {
      const { data } = await supabase.from('hosur_orders').select('id, shop_name').in('id', hosurIds);
      if (cancelled) return;
      const shopNameById = new Map(((data ?? []) as Record<string, unknown>[]).map(r => [r.id as string, String(r.shop_name ?? 'Unknown shop')]));
      const result = new Map<string, string>();
      for (const o of orders) {
        const ids = extractHosurOrderIds(o.notes);
        if (ids.length === 0) continue;
        result.set(o.id, ids.map(id => shopNameById.get(id) ?? 'Unknown shop').join(', '));
      }
      setByOrderId(result);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable joined id string, not the orders array reference.
  }, [key]);
  return byOrderId;
}

function IncomingOrdersTab({ orders, onAdd }: { orders: BakeryOrder[]; onAdd: ReturnType<typeof useBakeryStore.getState>['submitOrder'] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [branch, setBranch] = useState<Branch>('SNB');
  const [itemName, setItemName] = useState('');
  // FEATURE (2026-08-10): "in the incoming orders tab new order it should
  // show suggestion when we search if we select snb then snb items should
  // show in the suggestion and same if we select vrsnb" — branch-scoped
  // catalog suggestions, same pattern already used by the Dispatch tab's
  // "extra item" form (useBranchOnlyCatalog + ItemSearchPicker). Hosur has no
  // catalog here (returns []), so it stays free-text like before.
  const [selectedSuggestion, setSelectedSuggestion] = useState<MergedCatalogItem | null>(null);
  const branchCatalog = useBranchOnlyCatalog(branch === 'VRSNB' || branch === 'SNB' ? branch : null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<'pcs' | 'kg'>('kg');
  // BUG FIX (audit 2026-08-07): a manually-added pcs item had no way to
  // record its packet weight unless the planner happened to type it into
  // the name itself (e.g. "Garlic Nippat (200g)") — without it, Merged
  // Summary/Sent can't convert this item to kg when the same item also
  // shows up in kg from another branch, so it stays stuck as its own
  // disconnected row (the exact bug fixed today, reopened through this one
  // entry path). Optional field, only shown for pcs, so kg entries and
  // names that already include a weight are unaffected.
  const [packWeightGrams, setPackWeightGrams] = useState('');
  const [saving, setSaving] = useState(false);
  const currentUser = useAuthStore(s => s.currentUser);

  const handleAdd = async () => {
    if (!itemName.trim() || !qty || Number(qty) <= 0) return;
    setSaving(true);
    try {
      const item: BakeryOrderItem = {
        itemId: `manual-${Date.now()}`,
        itemName: itemName.trim(),
        quantity: unit === 'pcs' ? Number(qty) : Number(qty),
        dispatchUnit: unit,
        originalPcs: unit === 'pcs' ? Number(qty) : undefined,
        weightGrams: unit === 'pcs' && packWeightGrams && Number(packWeightGrams) > 0 ? Number(packWeightGrams) : undefined,
      };
      await onAdd([item], currentUser?.displayName || 'Planner', branch, 'Added directly by Planner');
      setItemName(''); setSelectedSuggestion(null); setQty(''); setPackWeightGrams(''); setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-foreground">Incoming Orders ({orders.length})</h2>
        <div className="flex gap-2">
          <RefreshOrdersButton />
          <ExportButton
            disabled={orders.length === 0}
            onClick={() => exportToExcel({
              filename: 'incoming-orders',
              sheetName: 'Incoming Orders',
              title: 'Planner — Incoming Orders',
              columns: [
                { header: 'Order #', key: 'orderNumber' },
                { header: 'Branch', key: 'branch' },
                { header: 'Status', key: 'status' },
                { header: 'Item', key: 'item' },
                { header: 'Qty', key: 'qty' },
                { header: 'Unit', key: 'unit' },
              ],
              rows: orders.flatMap(o => o.items.map(item => ({
                orderNumber: o.orderNumber, branch: o.targetBranch, status: o.status,
                item: item.itemName,
                qty: item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity,
                unit: item.dispatchUnit || 'kg',
              }))),
            })}
          />
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-bold text-white hover:opacity-90">
            <Plus className="size-4" /> Add Order
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <select
              value={branch}
              onChange={e => { setBranch(e.target.value as Branch); setItemName(''); setSelectedSuggestion(null); }}
              className="rounded-xl border border-border px-3 py-2 text-sm"
            >
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <div className="sm:col-span-2">
              <ItemSearchPicker
                value={selectedSuggestion ? selectedSuggestion.name : itemName}
                onChange={(v) => { setItemName(v); setSelectedSuggestion(null); }}
                onSelect={(item) => { setSelectedSuggestion(item); setItemName(item.name); }}
                items={branchCatalog}
                placeholder={branch === 'Hosur' ? 'Item name' : `Item name (${branch} catalog)`}
              />
            </div>
            <div className="flex gap-2">
              <input value={qty} onChange={e => setQty(sanitizeQtyForUnit(e.target.value, unit))} type="number" step={unit === 'pcs' ? 1 : 0.001} placeholder="Qty" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
              <select value={unit} onChange={e => setUnit(e.target.value as 'pcs' | 'kg')} className="rounded-xl border border-border px-2 py-2 text-sm">
                <option value="kg">kg</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
            {unit === 'pcs' && !/\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|ml|l)\s*\)/i.test(itemName) && (
              <input
                value={packWeightGrams}
                onChange={e => setPackWeightGrams(e.target.value)}
                type="number"
                placeholder="Pack weight in g (optional, e.g. 200)"
                className="rounded-xl border border-border px-3 py-2 text-sm sm:col-span-4"
              />
            )}
          </div>
          <button onClick={handleAdd} disabled={saving} className="mt-3 flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit Order
          </button>
        </div>
      )}

      <DayGroupedOrderList orders={orders} badgeLabel="Pending" badgeTone="bg-amber-100 text-amber-700" editable />
    </div>
  );
}

// Groups orders by calendar day (newest day first), each with a day header
// and a running count — used by both Incoming and Sent tabs.
// FEATURE (2026-08-10): "need the ability to edit the incoming orders — we
// should be able to edit the order name, quantity, unit etc." `editable`
// (only ever passed by IncomingOrdersTab — Sent stays read-only, its orders
// have already moved past Store) swaps the plain item bullet list for
// EditableIncomingOrderCard's inline edit form.
function DayGroupedOrderList({ orders, badgeLabel, badgeTone, editable = false }: { orders: BakeryOrder[]; badgeLabel: string | ((o: BakeryOrder) => string); badgeTone: string | ((o: BakeryOrder) => string); editable?: boolean }) {
  const hosurShopNameByOrderId = useHosurShopNames(orders);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; orders: BakeryOrder[] }>();
    for (const order of orders) {
      // BUG FIX: this used to call toLocaleDateString with no timeZone
      // option at all — browser-local time, unlike every other date
      // grouping in this app (kolkataDateKey/kolkataDateLabel). An order
      // created late at night IST could silently group under the wrong
      // calendar day if the browser's own timezone differs from IST (or
      // is simply misconfigured on the device). Key by the actual Kolkata
      // calendar date; keep the same display label format, just computed
      // in the same timezone as the key instead of the browser's own.
      const dayKey = kolkataDateKey(order.createdAt);
      const label = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(order.createdAt));
      const entry = map.get(dayKey) ?? { label, orders: [] };
      entry.orders.push(order);
      map.set(dayKey, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  if (orders.length === 0) return <EmptyState text="Nothing here right now." />;

  return (
    <div className="space-y-5">
      {groups.map(([dayKey, { label: day, orders: dayOrders }]) => (
        <div key={dayKey}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{day}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{dayOrders.length}</span>
          </div>
          <div className="space-y-2">
            {dayOrders.map(order => {
              const label = typeof badgeLabel === 'function' ? badgeLabel(order) : badgeLabel;
              const tone = typeof badgeTone === 'function' ? badgeTone(order) : badgeTone;
              const bucket = bucketFor(order);
              return editable ? (
                <EditableIncomingOrderCard key={order.id} order={order} bucket={bucket} label={label} tone={tone} hosurShopName={hosurShopNameByOrderId.get(order.id)} />
              ) : (
                <div key={order.id} className={cn('rounded-2xl border p-4 shadow-sm', BRANCH_META[bucket].bg)}>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-sm font-black', BRANCH_META[bucket].text)}>
                      {BRANCH_META[bucket].icon} {bucket === 'Planned' ? 'Planned Stock' : bucket} — Order #{order.orderNumber}
                    </span>
                    <span className={cn('rounded-full px-2 py-1 text-[10px] font-black', tone)}>{label}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs font-semibold text-muted-foreground">
                    {order.items.map((item, i) => (
                      <li key={i}>{item.itemName} — {item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity} {item.dispatchUnit || 'kg'}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// One draft row inside the Incoming order edit form — mirrors the fields the
// "Add Order" form itself collects (name/qty/unit), so editing an existing
// item is exactly as capable as creating one in the first place.
interface EditableItemDraft { itemId: string; itemName: string; qty: string; unit: 'pcs' | 'kg'; originalPcs?: number; weightGrams?: number; isCustom?: boolean; attachmentName?: string; attachmentDataUrl?: string }

function draftFromItem(item: BakeryOrderItem): EditableItemDraft {
  return {
    itemId: item.itemId,
    itemName: item.itemName,
    qty: String(item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity),
    unit: item.dispatchUnit === 'pcs' ? 'pcs' : 'kg',
    originalPcs: item.originalPcs,
    weightGrams: item.weightGrams,
    isCustom: item.isCustom,
    attachmentName: item.attachmentName,
    attachmentDataUrl: item.attachmentDataUrl,
  };
}

// A single Incoming order card with a toggleable full edit mode: item name
// (branch-scoped suggestions, same catalog the Add Order form uses),
// quantity, unit — plus adding a brand-new row or removing one entirely —
// per the planner's explicit ask to edit "name, quantity, unit etc." Only
// ever rendered for status==='pending' orders (see DayGroupedOrderList),
// matching updateOrderItems' own guard in bakeryStore.
function EditableIncomingOrderCard({ order, bucket, label, tone, hosurShopName }: {
  order: BakeryOrder; bucket: keyof typeof BRANCH_META; label: string; tone: string; hosurShopName?: string;
}) {
  const { updateOrderItems } = useBakeryStore();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<EditableItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branch: Branch | null = order.targetBranch === 'VRSNB' || order.targetBranch === 'SNB' ? order.targetBranch : null;
  const branchCatalog = useBranchOnlyCatalog(branch);

  const startEdit = () => {
    setDrafts(order.items.map(draftFromItem));
    setError(null);
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setError(null); };

  const updateDraft = (idx: number, patch: Partial<EditableItemDraft>) =>
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  const removeDraft = (idx: number) => setDrafts(prev => prev.filter((_, i) => i !== idx));
  const addDraft = () => setDrafts(prev => [...prev, { itemId: `manual-${Date.now()}-${prev.length}`, itemName: '', qty: '', unit: 'kg' }]);

  const save = async () => {
    setError(null);
    const cleanedRaw = drafts.filter(d => d.itemName.trim() && d.qty && Number(d.qty) > 0);
    if (cleanedRaw.length === 0) { setError('Add at least one item with a name and quantity above 0.'); return; }
    // BUG FIX (audit): "Add item" has no protection against creating a
    // second row for an item that already exists on this order (e.g. typing
    // a name that's a near-duplicate, or clicking Add item twice by
    // mistake) — two separate line entries with the same name/unit would
    // both persist, which is confusing on the order even though most
    // downstream totals (computeProductionRows etc.) sum across an order's
    // items regardless. Merge same name+unit rows into one before saving.
    const mergedByKey = new Map<string, EditableItemDraft>();
    for (const d of cleanedRaw) {
      const k = `${d.itemName.trim().toLowerCase()}|${d.unit}`;
      const existing = mergedByKey.get(k);
      if (existing) {
        // BUG FIX: this used to read existing.qty for the originalPcs
        // fallback AFTER already overwriting it with the summed total a
        // line above — inflating originalPcs by double-counting this
        // draft's own qty a second time (e.g. merging 10+5 pcs produced
        // qty=15 but originalPcs=20, not 15). Capture the pre-update
        // value first, before existing.qty gets reassigned.
        const priorQty = Number(existing.qty) || 0;
        existing.qty = String(priorQty + (Number(d.qty) || 0));
        if (d.unit === 'pcs') existing.originalPcs = (existing.originalPcs ?? priorQty) + (Number(d.qty) || 0);
      } else {
        mergedByKey.set(k, { ...d });
      }
    }
    const cleaned = Array.from(mergedByKey.values());
    const items: BakeryOrderItem[] = cleaned.map(d => ({
      itemId: d.itemId,
      itemName: d.itemName.trim(),
      quantity: Number(d.qty),
      dispatchUnit: d.unit,
      originalPcs: d.unit === 'pcs' ? Number(d.qty) : undefined,
      weightGrams: d.weightGrams,
      isCustom: d.isCustom,
      attachmentName: d.attachmentName,
      attachmentDataUrl: d.attachmentDataUrl,
    }));
    setSaving(true);
    try {
      await updateOrderItems(order.id, items);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', BRANCH_META[bucket].bg)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm font-black', BRANCH_META[bucket].text)}>
          {BRANCH_META[bucket].icon} {bucket === 'Planned' ? 'Planned Stock' : bucket}{hosurShopName ? ` — ${hosurShopName}` : ''} — Order #{order.orderNumber}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-black', tone)}>{label}</span>
          {!editing && (
            <button type="button" onClick={startEdit} className="flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted">
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {!editing ? (
        <ul className="mt-2 space-y-1 text-xs font-semibold text-muted-foreground">
          {order.items.map((item, i) => (
            <li key={i}>{item.itemName} — {item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity} {item.dispatchUnit || 'kg'}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-white p-3">
          {drafts.map((d, idx) => (
            <div key={d.itemId} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <ItemSearchPicker
                value={d.itemName}
                onChange={(v) => updateDraft(idx, { itemName: v })}
                onSelect={(item) => updateDraft(idx, { itemName: item.name })}
                items={branchCatalog}
                placeholder="Item name"
              />
              <input
                value={d.qty} onChange={e => updateDraft(idx, { qty: e.target.value })} type="number" min={0}
                placeholder="Qty" className="w-24 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold"
              />
              <select
                value={d.unit} onChange={e => updateDraft(idx, { unit: e.target.value as 'pcs' | 'kg' })}
                className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold"
              >
                <option value="kg">kg</option>
                <option value="pcs">pcs</option>
              </select>
              <button type="button" onClick={() => removeDraft(idx)} className="flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] font-black text-red-700 hover:bg-red-100">
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addDraft} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-black text-muted-foreground hover:bg-muted">
            <Plus className="size-3.5" /> Add item
          </button>
          {error && <p className="text-[11px] font-bold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={cancel} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Sent ──────────────────────────────────────────────────────────────
function SentOrdersTab({ orders }: { orders: BakeryOrder[] }) {
  // Group sent orders by the calendar day they were actually SENT to Store
  // (storeConfirmedAt), not the day the underlying order was originally
  // created — same primitive used by Production Entry/Dispatch (see
  // groupOrdersByStoreDate above). A merged order can combine a branch
  // request raised yesterday with one raised today; what matters for "Sent"
  // is the single day the merge was sent to Store, so it must not get split
  // across two date headers.
  const dayGroups = useMemo(() => groupOrdersByStoreDate(orders), [orders]);

  const [openKey, setOpenKey] = useState<string>('');
  const activeKey = openKey || dayGroups[0]?.dateKey || '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-foreground">Sent — By Date ({dayGroups.length} day{dayGroups.length === 1 ? '' : 's'})</h2>
        <RefreshOrdersButton />
      </div>
      {dayGroups.length === 0 ? <EmptyState text="Nothing sent yet." /> : (
        <div className="space-y-3">
          {dayGroups.map(group => (
            <SentDayGroup
              key={group.dateKey}
              dayKey={group.dateKey}
              label={group.label}
              orders={group.orders}
              open={activeKey === group.dateKey}
              onToggle={() => setOpenKey(activeKey === group.dateKey ? 'none' : group.dateKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One collapsible "sent date" entry — expands to show only items sent to store that day.
function SentDayGroup({ dayKey, label, orders, open, onToggle }: { dayKey: string; label: string; orders: BakeryOrder[]; open: boolean; onToggle: () => void }) {
  const merged = useMemo(() => computeMergedSummaryDisplay(orders), [orders]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-foreground">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        merged.length === 0 ? <div className="px-4 pb-4"><EmptyState text="Nothing sent for this date." /></div> : (
        <div className="overflow-x-auto border-t border-border">
          <div className="flex justify-end px-4 pt-3">
            <ExportButton
              disabled={merged.length === 0}
              onClick={() => exportToExcel({
                filename: `sent-${dayKey}`, sheetName: 'Sent', title: `Planner — Sent (${label})`,
                columns: [
                  { header: 'Item', key: 'item' },
                  ...DISPLAY_BUCKETS.map(b => ({ header: b, key: b })),
                  { header: 'Total', key: 'total' },
                  { header: 'Unit', key: 'unit' },
                ],
                rows: merged.map(row => Object.fromEntries([
                  ['item', row.itemName],
                  ...DISPLAY_BUCKETS.map(b => [b, row.perBranch[b] ?? '']),
                  ['total', row.totalRequested], ['unit', row.unit],
                ])),
              })}
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                {DISPLAY_BUCKETS.map(b => <th key={b} className="px-4 py-3 text-right">{b}</th>)}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(row => (
                <tr key={`${row.itemName}-${row.unit}`} className="border-t border-border">
                  <td className="px-4 py-3 font-bold text-foreground">{row.itemName}</td>
                  {DISPLAY_BUCKETS.map(b => (
                    <td key={b} className="px-4 py-3 text-right text-muted-foreground">{row.perBranch[b] ? `${row.perBranch[b]} ${row.unit}` : '—'}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-black text-foreground">{row.totalRequested} {row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}
    </div>
  );
}

// ─── Tab: Merged Summary ────────────────────────────────────────────────────
function MergedSummaryTab({ orders }: { orders: BakeryOrder[] }) {
  const { mergeOrdersForStore, updateOrderItems } = useBakeryStore();
  const merged = useMemo(() => computeMergedSummaryDisplay(orders), [orders]);
  // FEATURE (2026-08-24): "no closure-stock indicator" — reuses the same
  // Closing Stock ledger balance/slug matching Extra Produced Item and the
  // Closing Stock tab already use, so "in stock" here means the same thing
  // it means everywhere else in Planner.
  const { balances: closureBalances } = useLeftoverBalanceMap();
  // FEATURE (2026-08-24): "no edit/remove" — a merged row can span several
  // contributing orders, and editing all of them proportionally risks
  // introducing fractional-rounding drift across orders for a decision the
  // audit itself flagged as unresolved. Simpler, lower-risk choice: edit
  // (or remove) the item on whichever single contributing order holds the
  // LARGEST quantity of it — reuses the exact same updateOrderItems() the
  // Incoming tab's own per-order edit card already uses, no new store
  // action needed.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSaving, setRowSaving] = useState<string | null>(null);

  const largestContributor = (row: MergedRow): { order: BakeryOrder; item: BakeryOrderItem } | null => {
    let best: { order: BakeryOrder; item: BakeryOrderItem } | null = null;
    for (const order of orders) {
      if (!row.contributingOrderIds.includes(order.id)) continue;
      for (const item of order.items) {
        if (!sameItem(item.itemName, row.itemName)) continue;
        const qty = item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
        if (!best || qty > (best.item.dispatchUnit === 'pcs' && best.item.originalPcs != null ? best.item.originalPcs : best.item.quantity)) {
          best = { order, item };
        }
      }
    }
    return best;
  };

  const saveRowEdit = async (row: MergedRow, key: string) => {
    const target = largestContributor(row);
    if (!target) { setRowError('Could not find the source order for this item.'); return; }
    const newQty = Number(editValue);
    if (!editValue.trim() || !(newQty > 0)) { setRowError('Enter a quantity above 0.'); return; }
    setRowSaving(key); setRowError(null);
    try {
      const items = target.order.items.map(i => i === target.item
        ? { ...i, quantity: newQty, originalPcs: i.dispatchUnit === 'pcs' ? newQty : undefined }
        : i);
      await updateOrderItems(target.order.id, items);
      setEditingKey(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to save — please try again.');
    } finally {
      setRowSaving(null);
    }
  };

  const removeRow = async (row: MergedRow, key: string) => {
    const target = largestContributor(row);
    if (!target) { setRowError('Could not find the source order for this item.'); return; }
    if (!confirm(`Remove "${row.itemName}" (${target.item.quantity} ${row.unit}) from order #${target.order.orderNumber}?`)) return;
    setRowSaving(key); setRowError(null);
    try {
      const items = target.order.items.filter(i => i !== target.item);
      await updateOrderItems(target.order.id, items);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to remove — please try again.');
    } finally {
      setRowSaving(null);
    }
  };
  const [sendingAll, setSendingAll] = useState(false);
  // BUG FIX (2026-08-25 audit item #5): "Sent tab: quantity inflates" — the
  // audit's own hypothesis was that a planner clicking fast enough could
  // invoke handleSendToStore twice before React actually repaints the
  // button as disabled (setSendingAll(true) runs synchronously first, but
  // the DOM's disabled attribute only updates on the NEXT render, a
  // separate step — state changing isn't the same moment as the screen
  // changing). A plain ref changes immediately, with no render in between,
  // so it closes that window. Same exact pattern already used and proven
  // in DispatchReviewModal's confirm() elsewhere in this file.
  const sendingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // FEATURE (2026-08-09 / #280): "Beetroot Muruku" vs "Beetroot Muruku
  // 200gm" now auto-merge into one row (see mergeGroupKey) — but an auto
  // merge can occasionally be wrong for a genuinely different item that just
  // happens to share a name + weight suffix. Per-row "Unmerge" toggle splits
  // that one row back into its original variant lines, view-only (doesn't
  // touch the underlying orders or the Excel export).
  const [unmergedKeys, setUnmergedKeys] = useState<Set<string>>(new Set());
  const toggleUnmerge = (key: string) => setUnmergedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleSendToStore = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSendingAll(true); setNotice(null); setSendError(null);
    try {
      const ids = Array.from(new Set(merged.flatMap(r => r.contributingOrderIds)));
      const contributing = orders.filter(o => ids.includes(o.id) && o.status === 'pending');
      // Grouped by bucket (VRSNB/SNB/Hosur, or the synthetic 'Planned' bucket
      // for Planning-tab batches) so each gets its own combined Store order.
      const byBranch = new Map<string, string[]>();
      for (const o of contributing) {
        const bucket = bucketFor(o);
        const list = byBranch.get(bucket) ?? [];
        list.push(o.id);
        byBranch.set(bucket, list);
      }
      for (const branchOrderIds of byBranch.values()) {
        await mergeOrdersForStore(branchOrderIds);
      }
      setNotice(`Combined order sent to Store for ${byBranch.size} branch${byBranch.size === 1 ? '' : 'es'}.`);
    } catch (err) {
      // BUG FIX: this had no catch at all — any Supabase failure (e.g. the
      // material-deduction step inside mergeOrdersForStore throwing because
      // Store is out of a raw material) became an unhandled promise
      // rejection. The spinner just stopped with no notice and no error,
      // same silent-failure class as the Combine Orders bug on Store
      // Dashboard's sibling button.
      setSendError(err instanceof Error ? err.message : 'Failed to send to Store — please try again.');
    } finally {
      sendingRef.current = false;
      setSendingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-foreground">Merged Summary</h2>
        <div className="flex gap-2">
          <RefreshOrdersButton />
          <ExportButton
            disabled={merged.length === 0}
            onClick={() => exportToExcel({
              filename: 'merged-summary',
              sheetName: 'Merged Summary',
              title: 'Planner — Merged Order Summary',
              columns: [
                { header: 'Item', key: 'item' },
                ...DISPLAY_BUCKETS.map(b => ({ header: b, key: b })),
                { header: 'Total', key: 'total' },
                { header: 'Unit', key: 'unit' },
              ],
              rows: merged.map(row => Object.fromEntries([
                ['item', row.itemName],
                ...DISPLAY_BUCKETS.map(b => [b, row.perBranch[b] ?? '']),
                ['total', row.totalRequested], ['unit', row.unit],
              ])),
            })}
          />
          <button onClick={handleSendToStore} disabled={sendingAll || merged.length === 0} className="flex items-center gap-1.5 rounded-xl cafe-gradient px-4 py-2 text-xs font-bold text-white shadow-teal disabled:opacity-50">
            {sendingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Merged Order to Store
          </button>
        </div>
      </div>
      {notice && <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-xs font-bold text-teal-700">{notice}</div>}
      {sendError && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-700">{sendError}</div>}
      {rowError && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-700">{rowError}</div>}
      {merged.length === 0 ? <EmptyState text="No pending orders to merge yet." /> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                {DISPLAY_BUCKETS.map(b => <th key={b} className="px-4 py-3 text-right">{b}</th>)}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(row => {
                const key = `${row.itemName}-${row.unit}`;
                const hasVariants = (row.variants?.length ?? 0) > 1;
                const isUnmerged = hasVariants && unmergedKeys.has(key);
                if (isUnmerged) {
                  return (
                    <Fragment key={key}>
                      {row.variants!.map((v, idx) => (
                        <tr key={`${key}-v${idx}`} className={cn('border-t border-border', idx === 0 && 'bg-amber-50/40')}>
                          <td className="px-4 py-3 font-bold text-foreground">
                            {idx === 0 && (
                              <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">split</span>
                            )}
                            {v.itemName}
                          </td>
                          {DISPLAY_BUCKETS.map(b => (
                            <td key={b} className="px-4 py-3 text-right text-muted-foreground">{v.perBranch[b] ? `${v.perBranch[b]} ${v.unit}` : '—'}</td>
                          ))}
                          <td className="px-4 py-3 text-right font-black text-foreground">
                            {v.total} {v.unit}
                            {idx === row.variants!.length - 1 && (
                              <button type="button" onClick={() => toggleUnmerge(key)} className="ml-2 rounded-lg border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800 hover:bg-amber-50">
                                Re-merge
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                }
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="px-4 py-3 font-bold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {row.itemName}
                        {hasVariants && (
                          <span
                            className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-teal-700 cursor-help"
                            title={`Merged from: ${row.variants!.map(v => `${v.itemName} (${v.total} ${v.unit})`).join(', ')}`}
                          >
                            merged
                          </span>
                        )}
                        {(() => {
                          const stock = closureBalances.get(closingStockItemSlug(row.itemName));
                          return stock
                            ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">In stock: {qtyFmt(stock.balance)} {stock.unit}</span>
                            : <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">Not in closing stock</span>;
                        })()}
                      </span>
                    </td>
                    {DISPLAY_BUCKETS.map(b => (
                      <td key={b} className="px-4 py-3 text-right text-muted-foreground">{row.perBranch[b] ? `${row.perBranch[b]} ${row.unit}` : '—'}</td>
                    ))}
                    <td className="px-4 py-3 text-right font-black text-foreground">
                      {editingKey === key ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number" min={0} step="0.001" value={editValue} autoFocus
                            onChange={e => setEditValue(e.target.value)}
                            className="w-20 rounded-lg border border-teal-300 px-2 py-1 text-right text-xs font-bold"
                          />
                          <span className="text-xs font-bold text-muted-foreground">{row.unit}</span>
                          <button type="button" disabled={rowSaving === key} onClick={() => void saveRowEdit(row, key)} className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-black text-white disabled:opacity-50">
                            {rowSaving === key ? '…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setEditingKey(null); setRowError(null); }} className="rounded-lg border border-border px-2 py-1 text-[10px] font-black text-muted-foreground">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          {row.totalRequested} {row.unit}
                          {hasVariants && (
                            <button type="button" onClick={() => toggleUnmerge(key)} className="ml-2 rounded-lg border border-teal-300 px-2 py-0.5 text-[10px] font-black text-teal-800 hover:bg-teal-50">
                              Unmerge
                            </button>
                          )}
                          {!hasVariants && (
                            <span className="ml-2 inline-flex gap-1">
                              <button type="button" title="Edit (applies to the order contributing the most of this item)" onClick={() => { setEditingKey(key); setEditValue(String(row.totalRequested)); setRowError(null); }} className="rounded-lg border border-border p-1 text-muted-foreground hover:bg-muted">
                                <Pencil className="size-3" />
                              </button>
                              <button type="button" disabled={rowSaving === key} title="Remove (from the order contributing the most of this item)" onClick={() => void removeRow(row, key)} className="rounded-lg border border-red-200 p-1 text-red-600 hover:bg-red-50 disabled:opacity-50">
                                <X className="size-3" />
                              </button>
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Planning ───────────────────────────────────────────────────────────
// Proactive, "produce more than what's actually been ordered" planning: the
// planner picks from the combined VRSNB + SNB item catalog (deduped), queues
// quantities, and submits one plan batch. It flows through the exact same
// pipeline as a real order (Merged Summary -> Production Entry) but with no
// branch attached — the branch and quantity are chosen per item at Dispatch
// time, in the "Planned" sub-tab there.
function PlanningTab({ orders }: { orders: BakeryOrder[] }) {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const { submitPlannedOrder } = useBakeryStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch] = useState('');
  // FEATURE (2026-08-26): "add a Batch Calculation sub-tab" — kept as a
  // simple local sub-tab switch rather than a new PlannerTab entry, since
  // the audit and every prior feature request treated "Planning" as one
  // screen; this is a calculator living inside it, not a new top-level
  // workflow with its own data to load/merge/dispatch.
  const [subTab, setSubTab] = useState<'order' | 'batch'>('order');
  const [cart, setCart] = useState<Record<string, { itemName: string; unit: 'pcs' | 'kg'; quantity: number }>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  // FEATURE (2026-08-18): "we should be able to add custom items that
  // aren't in Planner's list." The item picker below was hard-limited to
  // the SNB+VRSNB catalog with no way to type something that isn't in it —
  // genuinely no path existed for a one-off or new item. This reuses the
  // exact same cart/submit mechanism catalog items already use (an order
  // item is just a name+unit+quantity — nothing downstream requires it to
  // be a recognized catalog entry; an unrecognized name safely falls into
  // the 'Others' production category via the same fuzzy-matching every
  // other unmatched item already goes through).
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState<'pcs' | 'kg'>('pcs');
  const [customQty, setCustomQty] = useState('');

  useEffect(() => {
    loadCatalog('SNB').catch(() => {});
    loadCatalog('VRSNB').catch(() => {});
  }, [loadCatalog]);

  // FEATURE (2026-08-23): now the same shared, canonicalItemSlug-based
  // dedup useMergedLeftoverCatalog already used (strips size/weight
  // suffixes and punctuation, not just casing) instead of this file's own
  // separate, weaker copy — see useMergedCatalogWithPrice's comment in
  // PlannerLeftoverTab.tsx for the full reasoning.
  const uniqueItems = useMergedCatalogWithPrice();

  const filtered = useMemo(
    () => uniqueItems.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [uniqueItems, search],
  );

  const setQty = (item: { name: string; unit: 'pcs' | 'kg' }, value: number) => {
    const safe = clampQtyForUnit(value, item.unit);
    setCart(prev => {
      const next = { ...prev };
      if (safe <= 0) delete next[item.name];
      else next[item.name] = { itemName: item.name, unit: item.unit, quantity: safe };
      return next;
    });
  };

  const isCatalogItem = (name: string) => uniqueItems.some(i => i.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addCustomItem = () => {
    const name = customName.trim();
    const qty = Number(customQty);
    if (!name) { setError('Enter a name for the custom item.'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setError('Enter a quantity greater than zero for the custom item.'); return; }
    setQty({ name, unit: customUnit }, qty);
    setCustomName(''); setCustomQty(''); setError('');
  };

  const cartItems = Object.values(cart);

  // Already-submitted plans still sitting as their own 'pending' entry —
  // once merged/sent to Store they move on into Merged Summary/Production
  // Entry like everything else and drop out of this list.
  const plannedOrders = useMemo(() => orders.filter(o => isPlannedOrder(o) && o.status === 'pending'), [orders]);

  const submitPlan = async () => {
    if (cartItems.length === 0) { setError('Add at least one item to the plan.'); return; }
    setSaving(true); setError(''); setNotice(null);
    try {
      const items: BakeryOrderItem[] = cartItems.map((i, idx) => ({
        itemId: `plan-${Date.now()}-${idx}`,
        itemName: i.itemName,
        quantity: i.quantity,
        dispatchUnit: i.unit,
        originalPcs: i.unit === 'pcs' ? i.quantity : undefined,
      }));
      await submitPlannedOrder(items, currentUser?.displayName || 'Planner', notes.trim() || undefined);
      setCart({}); setNotes('');
      setNotice('Production plan submitted. It will show up in Merged Summary, ready to send to Store.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit the plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <ListPlus className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Planning</h2>
            <p className="text-xs font-bold text-muted-foreground font-body">Plan extra production ahead of actual orders. Pick a branch and quantity for each item only when you dispatch it.</p>
          </div>
        </div>
        <RefreshOrdersButton />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setSubTab('order')} className={cn('rounded-xl px-4 py-2 text-xs font-black', subTab === 'order' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
          Add Order
        </button>
        <button type="button" onClick={() => setSubTab('batch')} className={cn('rounded-xl px-4 py-2 text-xs font-black', subTab === 'batch' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
          Batch Calculation
        </button>
      </div>

      {subTab === 'batch' && <BatchCalculationSubTab />}
      {subTab === 'order' && (
      <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3 card-base p-5">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search VRSNB + SNB items</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </label>

          {/* Not in the catalog above? Add it as a one-off custom item —
              still goes through the exact same plan/submit/production flow. */}
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-primary">Not in the list? Add a custom item</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Item name"
                className="h-9 min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex h-9 overflow-hidden rounded-lg border border-border">
                {(['pcs', 'kg'] as const).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setCustomUnit(u)}
                    className={cn('px-3 text-xs font-black', customUnit === u ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <input
                type="number"
                step={customUnit === 'pcs' ? 1 : 0.001}
                value={customQty}
                onChange={e => setCustomQty(e.target.value)}
                placeholder="Qty"
                className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm font-black"
              />
              <button
                type="button"
                onClick={addCustomItem}
                className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-muted-foreground">No items match.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map(item => {
                const current = cart[item.name]?.quantity ?? 0;
                const step = item.unit === 'kg' ? 0.25 : 1;
                return (
                  <article key={item.name} className={cn('rounded-xl border p-3 transition-colors', current > 0 ? 'border-teal bg-primary/5' : 'border-border bg-muted/40')}>
                    <p className="text-sm font-black text-foreground">{item.name}</p>
                    <p className="text-xs font-bold text-muted-foreground">{item.unit} · {item.category}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-card font-black text-foreground hover:bg-muted">-</button>
                      <input type="number" step={item.unit === 'pcs' ? 1 : 0.001} value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
                      <button onClick={() => setQty(item, current + step)} className="size-8 rounded-lg bg-primary font-black text-primary-foreground hover:opacity-90">+</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-3 card-base p-5">
          <div className="flex items-center gap-2"><ListPlus className="size-4 text-primary" /><h3 className="font-display text-lg font-bold text-foreground">Plan Cart</h3></div>
          {cartItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-bold text-muted-foreground">No items queued</div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {cartItems.map(item => (
                <div key={item.itemName} className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-black text-foreground">{item.itemName}</p>
                      {!isCatalogItem(item.itemName) && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary">Custom</span>
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground">{item.quantity} {item.unit}</p>
                  </div>
                  <button onClick={() => setQty({ name: item.itemName, unit: item.unit }, 0)}><X className="size-3.5 text-destructive" /></button>
                </div>
              ))}
            </div>
          )}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold" />
          {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}
          {notice && <p className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{notice}</p>}
          <button onClick={submitPlan} disabled={saving || cartItems.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl cafe-gradient text-sm font-black text-white shadow-teal disabled:opacity-40">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit Plan{cartItems.length > 0 ? ` (${cartItems.length} items)` : ''}
          </button>
        </aside>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-black text-foreground">Already Planned ({plannedOrders.length})</h3>
        <DayGroupedOrderList orders={plannedOrders} badgeLabel="Planned" badgeTone="bg-primary/10 text-primary" />
      </div>
      </>
      )}
    </div>
  );
}

// ─── Date grouping (Production Entry + Dispatch) ────────────────────────────
// Anchors "which date" an order belongs to on storeConfirmedAt — the moment
// Store hands the merged order to production (confirmStock/confirmStockSelected
// in bakeryStore.ts) — not createdAt. This is exactly the planner's own mental
// model ("I send the merged order to store by morning 7... what Store sends to
// production is what I should see, date-wise"). Falls back to createdAt only
// for legacy rows that predate the store_confirmed_at column.
const groupDateKey = (o: Pick<BakeryOrder, 'storeConfirmedAt' | 'createdAt'>) =>
  kolkataDateKey(o.storeConfirmedAt || o.createdAt);

function dateGroupLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

interface DateGroup { dateKey: string; label: string; orders: BakeryOrder[] }

// Splits a flat order list into calendar-day buckets (newest first) — the
// single grouping primitive shared by Production Entry and Dispatch so an
// item pending from an earlier date never silently folds into "today".
function groupOrdersByStoreDate(orders: BakeryOrder[]): DateGroup[] {
  const now = new Date();
  const todayKey = kolkataDateKey(now.toISOString());
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = kolkataDateKey(yesterday.toISOString());
  const map = new Map<string, BakeryOrder[]>();
  for (const o of orders) {
    const key = groupDateKey(o);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return Array.from(map.entries())
    .map(([dateKey, dateOrders]) => ({ dateKey, label: dateGroupLabel(dateKey, todayKey, yesterdayKey), orders: dateOrders }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ─── Tab: Production Entry ──────────────────────────────────────────────────
// Date-wise: each calendar day Store confirmed/sent an order to production
// gets its own collapsible group with its own merged rows, so an item still
// pending from an earlier date stays visible under that date instead of
// getting folded into today's total.
function ProductionEntryTab({ orders }: { orders: BakeryOrder[] }) {
  const [search, setSearch] = useState('');
  // FEATURE (2026-08-24): "date-wise grouping should be removed, add new
  // quantity to old" — computeProductionRows already sums by item across
  // whatever order set it's given; the date split was only ever imposed by
  // this tab partitioning its input by day first. A single call across all
  // orders (no partition) makes "old + new" quantities combine naturally.
  const rows = useMemo(() => computeProductionRows(orders).filter(r => r.itemStatus !== 'completed'), [orders]);
  const totalPending = rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Production Entry <span className="text-sm font-bold text-muted-foreground">({totalPending} items)</span></h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <RefreshOrdersButton />
          <ExportButton
            disabled={totalPending === 0}
            onClick={() => exportToExcel({
              filename: 'production-entry', sheetName: 'Production', title: 'Planner — Production Entry',
              columns: [{ header: 'Category', key: 'category' }, { header: 'Item', key: 'item' }, { header: 'Ordered Qty', key: 'ordered' }, { header: 'Produced So Far', key: 'produced' }, { header: 'Unit', key: 'unit' }, { header: 'Status', key: 'status' }],
              rows: rows.map(row => ({ category: row.category, item: row.itemName, ordered: row.totalRequested, produced: row.preparedTotal, unit: row.unit, status: row.itemStatus })),
            })}
          />
        </div>
      </div>
      <ExtraProducedItemForm />
      {rows.length === 0 && <EmptyState text="No items waiting on production entry." />}
      {rows.length > 0 && (
        <ProductionEntryDateGroup dateKey="all" label="Pending Production" orders={orders} rows={rows} search={search} defaultOpen />
      )}
    </div>
  );
}

// FEATURE (Production Entry — extra/unordered item): every row above this
// form is tied to a real order's items[] — recordProduction has no path for
// something that got made but was never ordered by anyone (see
// computeMergedSummary, which only ever iterates order.items). This form is
// that missing path: it writes straight into the shared Closing Stock pool
// (reason='production_carryover', isExtra=true) instead of onto any specific
// order, so it (a) doesn't need an order to attach to, (b) is immediately
// available for Dispatch to draw from tomorrow, exactly like normal
// production carry-over, and (c) is clearly flagged "extra" everywhere the
// Closing Stock ledger is read — Daily Report, Movement Log, and the Reports
// tab — instead of silently blending into ordinary production totals.
function ExtraProducedItemForm() {
  const currentUser = useAuthStore(s => s.currentUser);
  const staffName = currentUser?.displayName || currentUser?.username || 'Planner Staff';
  const catalog = useMergedLeftoverCatalog();
  const [open, setOpen] = useState(false);
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MergedCatalogItem | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<LeftoverUnit>('kg');
  const [entryDate, setEntryDate] = useState(kolkataToday());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const resetForm = () => { setItemQuery(''); setSelectedItem(null); setQty(''); setUnit('kg'); setReason(''); };

  const submit = async () => {
    setError(''); setMessage('');
    const name = (selectedItem?.name || itemQuery).trim();
    const amount = Number(qty);
    if (!name) { setError('Search and pick (or type) an item first.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity greater than zero.'); return; }
    setSaving(true);
    const result = await recordLeftoverMovement({
      itemName: name, unit, delta: amount, businessDate: entryDate,
      reason: 'production_carryover', recordedBy: staffName, isExtra: true,
      notes: reason.trim() ? `Extra item — ${reason.trim()}` : 'Extra item made but not on any order',
    });
    setSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${name}: ${qtyFmt(amount)} ${unit} recorded as extra production (added to Closing Stock, new balance ${qtyFmt(result.newBalance)} ${unit}).`);
    resetForm();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2 text-xs font-bold text-accent hover:bg-muted/40">
        <Plus className="size-3.5" /> Record an item that was made but isn't on any order
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gold bg-accent/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-foreground">Record Extra Produced Item</h3>
          <p className="text-xs text-muted-foreground">For something made that isn't tied to any order — suggestions come from both SNB and VRSNB catalogues (no duplicates). It's added to Closing Stock immediately and marked "extra" everywhere it's reported.</p>
        </div>
        <button onClick={() => { setOpen(false); resetForm(); setError(''); }} className="rounded-lg p-1.5 hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ItemSearchPicker
            value={selectedItem ? selectedItem.name : itemQuery}
            onChange={(v) => { setItemQuery(v); setSelectedItem(null); }}
            onSelect={(item) => { setSelectedItem(item); setItemQuery(item.name); }}
            items={catalog}
            placeholder="Search item (SNB + VRSNB, no duplicates)…"
          />
        </div>
        <label className="space-y-1">
          <span className="text-xs font-black text-muted-foreground">Quantity</span>
          <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold" placeholder="0" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-black text-muted-foreground">Date</span>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold" />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button onClick={() => setUnit('kg')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', unit === 'kg' ? 'border-teal-700 bg-teal-700 text-white' : 'bg-background')}>Kg / Weight</button>
          <button onClick={() => setUnit('pcs')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', unit === 'pcs' ? 'border-teal-700 bg-teal-700 text-white' : 'bg-background')}>Pcs / Pieces</button>
        </div>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-black text-muted-foreground">Why was this extra made? (optional, shown in the report)</span>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. batch ran over, made for a walk-in sample" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold" />
        </label>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
      {message && <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p>}
      <button onClick={submit} disabled={saving} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl gold-gradient text-sm font-black text-white shadow-gold disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} Record Extra Production
      </button>
    </div>
  );
}

// One collapsible calendar-day group — owns its own qty/save/confirm state so
// the exact same item name pending on two different dates never collides.
function ProductionEntryDateGroup({ label, orders, rows, search, defaultOpen }: {
  dateKey: string; label: string; orders: BakeryOrder[]; rows: ProductionRow[]; search: string; defaultOpen: boolean;
}) {
  // Anything not dated "Today" is a past date still carrying pending items —
  // flag it so it doesn't get mistaken for (or buried under) today's work.
  const isPastDate = label !== 'Today';
  const { recordProduction } = useBakeryStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [open, setOpen] = useState(defaultOpen);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Single unified flow: Save -> ask Completed/Pending -> if Completed, ask again to confirm.
  const [askItem, setAskItem] = useState<ProductionRow | null>(null);
  const [confirmItem, setConfirmItem] = useState<ProductionRow | null>(null);
  // BUG FIX (planner confusion): a merged item row hides which branch's
  // order(s) actually contributed to it within this date. Expanding "Sources"
  // shows every contributing order's branch/plan bucket and its own requested
  // quantity, so the planner always knows exactly what they're producing and
  // for whom before entering a quantity.
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const sourcesFor = (row: ProductionRow) => row.contributingOrderIds
    .map(id => orders.find(o => o.id === id))
    .filter((o): o is BakeryOrder => Boolean(o))
    .map(o => {
      const item = o.items.find(i => sameItem(i.itemName, row.itemName));
      const requested = item ? (item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity) : 0;
      return { orderId: o.id, orderNumber: o.orderNumber, bucket: bucketFor(o), requested };
    });

  const filtered = useMemo(() => rows.filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, ProductionRow[]>();
    for (const r of filtered) { if (!map.has(r.category)) map.set(r.category, []); map.get(r.category)!.push(r); }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [filtered]);

  const doSave = async (row: ProductionRow, status: 'pending' | 'completed') => {
    // BUG FIX: the modal buttons that call this had no disabled-while-saving
    // guard, so a fast double-click/double-tap could invoke doSave twice
    // concurrently for the same row before the first call's DB writes land —
    // both calls would then see the same pre-save "not completed" state and
    // both log the produced quantity into the Closing Stock pool, double
    // counting it. Bail out immediately if a save for this exact row is
    // already in flight.
    if (saving === row.itemName) return;
    // CRITICAL BUG FIX (audit 2026-08-07): this used to loop over EVERY
    // contributing order and unconditionally overwrite its producedItems
    // entry (quantity + status) with a freshly recomputed proportional
    // split — including orders that were already marked 'completed' in an
    // earlier save. Production Entry rows are recomputed live from
    // whichever orders currently match this item, so an item that had
    // already been fully produced and marked Completed could later pick up
    // a brand-new contributing order (e.g. Store just confirmed another
    // branch's order for the same item) and reappear here as "pending".
    // Saving again then silently rewrote the already-completed order(s)'
    // real produced quantity down to a new, smaller proportional share —
    // and if this save was "Pending" (because only the new order needed
    // more baking), it flipped their status back to 'pending' too, even
    // though that stock was already produced and possibly already
    // dispatched. Orders already 'completed' for this item are now locked:
    // excluded entirely from the split and never written to again. Only
    // orders that are still open (never completed) are touched.
    const lockedOrderIds = new Set(
      row.contributingOrderIds.filter(id => {
        const order = orders.find(o => o.id === id);
        const item = order?.items.find(i => sameItem(i.itemName, row.itemName));
        const prod = item ? order?.producedItems?.find(p => p.itemId === item.itemId) : undefined;
        return prod?.status === 'completed';
      }),
    );
    const openOrderIds = row.contributingOrderIds.filter(id => !lockedOrderIds.has(id));
    if (openOrderIds.length === 0) return; // whole row already locked-completed — nothing left to save
    // Default fill (Completed tapped with no typed qty) should only cover
    // what's still outstanding — locked orders' share is already counted
    // in row.preparedTotal, so subtract it instead of re-quoting the full
    // row total (which would double-count what's already been produced).
    const remainingRequested = Math.max(0, Math.round((row.totalRequested - row.preparedTotal) * 100) / 100);
    const enteredQty = qty[row.itemName] ? Number(qty[row.itemName]) : (status === 'completed' ? remainingRequested : 0);
    // BUG FIX (audit item #13): this already silently blocked a zero/
    // negative quantity from actually being written (the underlying data
    // was never at risk), but did so with zero feedback — clicking Save
    // just appeared to do nothing. Now shows why, same setSaveError this
    // function already uses for every other failure path below.
    if (enteredQty <= 0) { setSaveError('Enter a quantity greater than zero before saving.'); return; }
    setSaving(row.itemName);
    setSaveError(null);
    try {
      const openOrders = orders.filter(o => openOrderIds.includes(o.id));
      const split = autoSplitForItem(openOrders, row.itemName, enteredQty);
      // CLOSING STOCK LINK (2026-08-06): every order processed below is, by
      // construction, transitioning fresh (locked/already-completed orders
      // are excluded above) — so any 'completed' save here is always a
      // genuinely new completion, safe to add to the pool without a
      // separate double-count guard.
      let newlyCompletedQty = 0;
      const failed: string[] = [];
      for (const orderId of openOrderIds) {
        const order = orders.find(o => o.id === orderId);
        const item = order?.items.find(i => sameItem(i.itemName, row.itemName));
        if (!order || !item) continue;
        const others = (order.producedItems || []).filter(p => p.itemId !== item.itemId);
        const producedQty = split[orderId] ?? 0;
        const merged: PreparedItem[] = [...others, { itemId: item.itemId, itemName: item.itemName, quantityPrepared: producedQty, preparedAt: new Date().toISOString(), dispatchUnit: item.dispatchUnit, status }];
        // BUG FIX: this used to be a single un-guarded `await` inside the
        // loop — if order 2 of 3 failed, the function threw immediately,
        // leaving order 1 durably saved as 'completed' in the DB but its
        // quantity never reaches the Closing Stock pool below (and it can
        // never be recovered later, since the next save sees order 1 as
        // already-completed and correctly skips re-logging it). Catching
        // per-order lets every order that DID succeed still count toward
        // the pool, and reports exactly which order(s) need a retry instead
        // of silently losing that quantity.
        try {
          await recordProduction(order.id, merged);
          if (status === 'completed') newlyCompletedQty += producedQty;
        } catch {
          failed.push(`#${order.orderNumber}`);
        }
      }
      // Once production is marked complete, the produced quantity becomes
      // available finished-goods stock in the shared Closing Stock pool —
      // ready for Dispatch to draw down (even ahead of fresh production).
      if (newlyCompletedQty > 0.001) {
        const staffName = currentUser?.displayName || currentUser?.username || 'Planner';
        const result = await recordLeftoverMovement({
          itemName: row.itemName,
          unit: row.unit as LeftoverUnit,
          delta: newlyCompletedQty,
          businessDate: kolkataToday(),
          reason: 'production_carryover',
          recordedBy: staffName,
          notes: `Production completed — ${label}`,
        });
        if ('error' in result) {
          console.error('[ProductionEntry] Failed to log production into Closing Stock pool:', result.error);
          failed.push('Closing Stock pool update');
        }
      }
      setQty(v => ({ ...v, [row.itemName]: '' }));
      if (failed.length > 0) {
        setSaveError(`"${row.itemName}" — saved, but ${failed.join(', ')} failed. Please retry so nothing goes missing.`);
      }
    } finally {
      setSaving(null);
      setAskItem(null);
      setConfirmItem(null);
    }
  };

  // While actively searching, hide date groups with no matches so the search
  // reads as global even though rendering stays date-scoped underneath.
  if (search.trim() && filtered.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-black text-foreground">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
          {isPastDate && rows.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
              <AlertTriangle className="size-3" /> Past date — still pending
            </span>
          )}
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          {rows.length === 0 && <EmptyState text="Nothing pending for this date." />}
          {grouped.map(([category, items]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">{category} ({items.length})</p>
              <div className="space-y-2">
                {items.map(row => {
                  const sources = sourcesFor(row);
                  const sourcesOpen = expandedSources === row.itemName;
                  return (
                    <div key={row.itemName} className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-foreground">{row.itemName}</p>
                          <p className="text-xs font-bold text-muted-foreground">
                            Ordered {row.totalRequested} {row.unit}{row.preparedTotal > 0 ? ` · Produced so far ${row.preparedTotal} ${row.unit}` : ''}
                            {row.itemStatus === 'pending' && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">More to come</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() => setExpandedSources(v => v === row.itemName ? null : row.itemName)}
                            className="mt-1 text-[10px] font-black uppercase tracking-wide text-primary hover:underline"
                          >
                            {sourcesOpen ? 'Hide' : 'Show'} sources ({sources.length} order{sources.length === 1 ? '' : 's'})
                          </button>
                        </div>
                        <input type="number" min={0} step={row.unit === 'pcs' ? 1 : 0.001} placeholder="Qty produced" value={qty[row.itemName] ?? ''} onChange={e => setQty(v => ({ ...v, [row.itemName]: sanitizeQtyForUnit(e.target.value, row.unit) }))}
                          className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs font-bold" />
                        <button onClick={() => setAskItem(row)} disabled={saving === row.itemName || !qty[row.itemName]}
                          className="flex items-center gap-1.5 rounded-xl cafe-gradient px-4 py-2 text-xs font-bold text-white shadow-teal disabled:opacity-40">
                          {saving === row.itemName ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save
                        </button>
                      </div>
                      {sourcesOpen && (
                        <div className="mt-2.5 space-y-1 border-t border-border pt-2.5">
                          {sources.map(s => (
                            <div key={s.orderId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] font-bold">
                              <span className="flex items-center gap-1.5">
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-black', BRANCH_META[s.bucket].bg, BRANCH_META[s.bucket].text)}>
                                  {BRANCH_META[s.bucket].icon} {s.bucket === 'Planned' ? 'Planned' : s.bucket}
                                </span>
                                <span className="text-muted-foreground">Order #{s.orderNumber}</span>
                              </span>
                              <span className="text-foreground">{s.requested} {row.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 1: after Save, ask Completed or Pending. */}
      {askItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black text-foreground">"{askItem.itemName}" — {qty[askItem.itemName]} {askItem.unit} entered</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">Is the baker completely done with this item, or still baking more?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button disabled={saving === askItem.itemName} onClick={() => setAskItem(null)} className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200 disabled:opacity-50">Cancel</button>
              <button disabled={saving === askItem.itemName} onClick={() => { doSave(askItem, 'pending'); }} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                {saving === askItem.itemName ? <Loader2 className="size-3.5 animate-spin" /> : <Clock3 className="size-3.5" />} Pending — more coming
              </button>
              <button disabled={saving === askItem.itemName} onClick={() => { setConfirmItem(askItem); setAskItem(null); }} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                <CheckCircle2 className="size-3.5" /> Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Completed needs a second confirmation before it moves to Dispatch. */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black text-foreground">Confirm: mark "{confirmItem.itemName}" as Completed?</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">This sends {qty[confirmItem.itemName] || confirmItem.totalRequested} {confirmItem.unit} to Dispatch and removes it from Production Entry. This can't be undone from here.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button disabled={saving === confirmItem.itemName} onClick={() => setConfirmItem(null)} className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200 disabled:opacity-50">Go back</button>
              <button disabled={saving === confirmItem.itemName} onClick={() => doSave(confirmItem, 'completed')} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                {saving === confirmItem.itemName && <Loader2 className="size-3.5 animate-spin" />} Yes, Confirm Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex max-w-md items-start gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 shadow-xl">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{saveError}</span>
            <button onClick={() => setSaveError(null)} className="shrink-0"><X className="size-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Hosur — one unified, grouped sub-tab bar controlling shop
// ordering/dispatch (this component) and the embedded billing/credit/
// reports panel (HosurDashboard), instead of two separate stacked tab bars.
type HosurSubTab = 'place' | 'dispatch' | 'shops' | 'credit' | 'collection' | 'whatsapp' | 'reminders' | 'reports';
const HOSUR_SUB_TAB_GROUPS: { label: string; tabs: { key: HosurSubTab; label: string; icon: React.ReactNode; ownedByPanel: boolean }[] }[] = [
  { label: 'Orders', tabs: [
    { key: 'place',    label: 'Place Order',       icon: <Store className="size-3.5" />, ownedByPanel: true },
    // WORKFLOW CHANGE (2026-08-07): "the orders dispatched from Planner
    // dashboard dispatch tab should come here and here only — bill, send
    // via WhatsApp, and take a physical bill, all from one tab." This used
    // to be three separate stops: this "Dispatch" tab only showed orders
    // Planner's Dispatch tab hadn't yet finished sending (status
    // 'pending_packing'); the moment the last item went out, the order
    // flipped to 'dispatched' and dropped out of here, landing in
    // HosurDashboard's separate Receiving tab, which itself only created a
    // draft bill and needed a third tab (Billing) to actually send it.
    // HosurShopOrderPanel's DispatchSection now pulls in 'dispatched'
    // orders alongside 'pending_packing' ones (see pendingOrders below), and
    // its existing dispatch+bill+WhatsApp+physical-print action already
    // works regardless of which of those two statuses an order starts at —
    // so this one tab now covers the whole post-Planner-dispatch lifecycle.
    { key: 'dispatch', label: 'Dispatch & Billing', icon: <Truck className="size-3.5" />, ownedByPanel: true },
  ] },
  { label: 'Money', tabs: [
    { key: 'credit',     label: 'Credit Ledger',      icon: <CreditCard className="size-3.5" />, ownedByPanel: false },
    { key: 'collection', label: 'Payment Collection', icon: <WalletCards className="size-3.5" />, ownedByPanel: false },
    // WORKFLOW CHANGE (2026-08-08): "There should be only one [Daily
    // Closure] — remove the daily closure subtab in hosur tab." Hosur used
    // to have its own separate Daily Closure sub-tab (a second, independent
    // cash counter from Planner's top-level one), which is exactly the kind
    // of two-counters confusion diagnosed in the 2026-08-07 disabled-button
    // fix below. That nav entry is removed — Payment Collection and Billing
    // now gate off Planner's single top-level Daily Closure counter instead
    // (see getHosurCounterStatus in HosurDashboard.tsx), and their "Open
    // Counter" buttons jump straight to Planner's own Daily Closure tab.
  ] },
  { label: 'Communication', tabs: [
    { key: 'whatsapp',  label: 'WhatsApp Logs',    icon: <MessageCircle className="size-3.5" />, ownedByPanel: false },
    { key: 'reminders', label: 'Reminder History', icon: <Bell className="size-3.5" />, ownedByPanel: false },
  ] },
  { label: 'Admin', tabs: [
    { key: 'shops',         label: 'Shop Master',   icon: <Store className="size-3.5" />, ownedByPanel: false },
    { key: 'reports',       label: 'Reports',       icon: <FileSpreadsheet className="size-3.5" />, ownedByPanel: false },
    // FEATURE (2026-08-08): "remove notification in hosur tab" — Notifications
    // sub-tab removed from nav per owner's explicit request.
  ] },
];

function HosurUnifiedSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('hosurTab') as HosurSubTab | null;
  const activeTab: HosurSubTab = urlTab && HOSUR_SUB_TAB_GROUPS.some(g => g.tabs.some(t => t.key === urlTab)) ? urlTab : 'place';
  const [pendingDispatchCount, setPendingDispatchCount] = useState(0);

  const selectTab = (key: HosurSubTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('hosurTab', key);
    // BUG FIX (2026-08-12): when embedded inside Owner Dashboard, this `tab`
    // key belongs to Owner's OWN outer tab switcher (e.g. `/owner?tab=planner`)
    // — writing 'hosur' into it here would silently knock Owner off its
    // Planner tab on the next reload. The top-level PlannerDashboard tab is
    // already local state when embedded (see goToTab), and is already
    // 'hosur' by the time this section is even rendered, so this write is
    // only needed — and only safe — on the standalone /bakery/planner route.
    if (!embedded) {
      // The outer tab must always stay 'hosur' — these sub-tab keys (credit,
      // whatsapp, reports, etc.) are not valid top-level PlannerTab values, so
      // writing them to 'tab' used to make the outer tab fall back to
      // 'incoming', kicking the user back to the Incoming Orders tab.
      params.set('tab', 'hosur');
    }
    setSearchParams(params, { replace: true });
  };

  const panelSection: 'place' | 'dispatch' | undefined = activeTab === 'place' || activeTab === 'dispatch' ? activeTab : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {HOSUR_SUB_TAB_GROUPS.map(group => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => selectTab(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                      activeTab === t.key ? 'bg-teal-600 text-white shadow' : 'bg-muted text-muted-foreground hover:bg-slate-200'
                    )}
                  >
                    {t.icon} {t.label}
                    {t.key === 'dispatch' && pendingDispatchCount > 0 && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-black', activeTab === t.key ? 'bg-white text-teal-700' : 'bg-red-100 text-red-700')}>{pendingDispatchCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={panelSection ? '' : 'hidden'}>
        <HosurShopOrderPanel section={panelSection ?? 'place'} onPendingCountChange={setPendingDispatchCount} />
      </div>
      <div className={panelSection ? 'hidden' : ''}>
        <HosurDashboard hideNav />
      </div>
    </div>
  );
}

// ─── Tab: Invoice ───────────────────────────────────────────────────────────
// Tracks everything actually dispatched to a branch (VRSNB / SNB / Hosur) on
// a given date, prices it using that branch's catalog, and produces a
// printable invoice with a per-branch editable discount rate. Only SNB's
// prices aren't pre-discounted, so it defaults to 15%; VRSNB and Hosur
// (whose shop price lists are already discounted) default to 0%.
const invoiceMoney = (v: number) => 'Rs. ' + (Math.round(v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalizeItemName = (s: string) => s.trim().toLowerCase();
const kolkataDateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

interface InvoiceRow { itemName: string; unit: string; quantity: number; unitPrice: number; lineTotal: number; }

function InvoiceTab({ orders }: { orders: BakeryOrder[] }) {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [branch, setBranch] = useState<Branch | null>(null);
  const [hosurPrices, setHosurPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  // SNB's catalog prices are pre-discount, so SNB gets a real discount
  // (15% by default). VRSNB's catalog prices are already the sell price,
  // and Hosur's shop price lists are already discounted — both default to
  // 0% so nothing gets double-discounted. Editable per branch before print.
  const [discountPct, setDiscountPct] = useState<Record<Branch, number>>({ VRSNB: 0, SNB: 15, Hosur: 0 });

  useEffect(() => {
    loadCatalog('SNB').catch(() => {});
    loadCatalog('VRSNB').catch(() => {});
  }, [loadCatalog]);

  // FEATURE (2026-08-08): "if once batch is send it should store as one
  // batch — if we click on it, it should show. Under each branch we should
  // be able to take the pdf and I need date range filter — if I select
  // month and select the branch I should be able to download that month
  // complete data." Every confirmed dispatch (branch flat, per-shop Hosur,
  // cake) now writes one dispatch_invoices row via saveDispatchInvoice —
  // this section browses those stored batches, separate from the ad-hoc
  // by-date summary above (which recomputes from dispatchLog and predates
  // batch storage).
  const [batchMonth, setBatchMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7));
  const [batchBranch, setBatchBranch] = useState<Branch | 'All'>('All');
  const [batches, setBatches] = useState<DispatchInvoiceRecord[] | null>(null);
  const [batchError, setBatchError] = useState('');
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  // FEATURE (2026-08-10): full edit access on an already-dispatched bill,
  // reachable straight from the Invoice tab's own batch browser (the most
  // direct place a planner looks for "the dispatched items bill").
  const [editingBatch, setEditingBatch] = useState<DispatchInvoiceRecord | null>(null);

  const monthRange = useMemo(() => {
    const [y, m] = batchMonth.split('-').map(Number);
    const from = `${batchMonth}-01T00:00:00+05:30`;
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const to = `${nextMonth}-01T00:00:00+05:30`;
    return { from, to };
  }, [batchMonth]);

  const loadBatches = useCallback(async () => {
    setBatchError('');
    try {
      const records = await listDispatchInvoices({
        fromDate: monthRange.from, toDate: monthRange.to,
        scope: batchBranch === 'All' ? undefined : batchBranch,
      });
      setBatches(records);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Failed to load dispatch batches.');
      setBatches([]);
    }
  }, [monthRange, batchBranch]);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const batchesByBranch = useMemo(() => {
    const map = new Map<Branch, DispatchInvoiceRecord[]>();
    for (const record of batches ?? []) {
      const list = map.get(record.scope) ?? [];
      list.push(record);
      map.set(record.scope, list);
    }
    return map;
  }, [batches]);

  const downloadMonthExcel = () => {
    const rows: Record<string, unknown>[] = [];
    for (const record of batches ?? []) {
      for (const item of record.items) {
        rows.push({
          invoiceNo: record.invoiceNo,
          branch: record.scope,
          shop: record.hosurShopName ?? '',
          date: new Date(record.createdAt).toLocaleDateString('en-IN'),
          dispatchedBy: record.dispatchedBy,
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          discountPct: record.discountPct,
          invoiceTotal: record.total,
        });
      }
    }
    exportToExcel({
      filename: `dispatch-invoices-${batchMonth}-${batchBranch}`,
      sheetName: 'Dispatch Invoices',
      title: `Dispatch Invoices — ${batchBranch === 'All' ? 'All Branches' : batchBranch} — ${batchMonth}`,
      columns: [
        { header: 'Invoice No', key: 'invoiceNo' }, { header: 'Branch', key: 'branch' }, { header: 'Shop', key: 'shop' },
        { header: 'Date', key: 'date' }, { header: 'Dispatched By', key: 'dispatchedBy' },
        { header: 'Item', key: 'itemName' }, { header: 'Qty', key: 'quantity' }, { header: 'Unit', key: 'unit' },
        { header: 'Unit Price', key: 'unitPrice' }, { header: 'Line Total', key: 'lineTotal' },
        { header: 'Discount %', key: 'discountPct' }, { header: 'Invoice Total', key: 'invoiceTotal' },
      ],
      rows,
    });
  };

  // Hosur bakery orders don't have their own item catalog like SNB/VRSNB —
  // price them off the shop price lists (average unit price per item name
  // across shops) since that's the only price source available for Hosur.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPrices(true);
      const { data, error } = await supabase
        .from('hosur_shop_price_lists')
        .select('item_name, unit_price')
        .eq('is_active', true);
      if (!cancelled) {
        if (!error && data) {
          const sums = new Map<string, { total: number; count: number }>();
          for (const row of data as { item_name: string; unit_price: number }[]) {
            const key = normalizeItemName(row.item_name);
            const cur = sums.get(key) ?? { total: 0, count: 0 };
            cur.total += Number(row.unit_price) || 0;
            cur.count += 1;
            sums.set(key, cur);
          }
          const avg: Record<string, number> = {};
          for (const [key, { total, count }] of sums) avg[key] = count > 0 ? total / count : 0;
          setHosurPrices(avg);
        }
        setLoadingPrices(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const priceFor = useCallback((br: Branch, itemName: string): number => {
    if (br === 'Hosur') return hosurPrices[normalizeItemName(itemName)] ?? 0;
    const list = catalogItems[br] ?? [];
    const match = list.find(i => normalizeItemName(i.name) === normalizeItemName(itemName));
    return match ? match.price : 0;
  }, [catalogItems, hosurPrices]);

  // For every branch, tally what was actually dispatched (from dispatch_log,
  // not what was merely ordered) on the selected date.
  const perBranchRows = useMemo(() => {
    const result: Record<Branch, InvoiceRow[]> = { VRSNB: [], SNB: [], Hosur: [] };
    // BUG FIX: "Sent tab showing the same item split into duplicate rows"
    // — this used raw entry.itemName (straight from dispatch_log database
    // rows) as the map key. Different dispatch events for the same item
    // can genuinely have different casing (e.g. one dispatch tagged "Bun",
    // another "BUN") since they're recorded independently over time —
    // each casing variant silently became its own separate row instead of
    // combining into one. Key is now case-normalized; itemName is stored
    // as its own value (first-seen casing) rather than reconstructed from
    // the key, so the display still shows a real name, not a lowercased one.
    const totals: Record<Branch, Map<string, { itemName: string; quantity: number; unit: string }>> = {
      VRSNB: new Map(), SNB: new Map(), Hosur: new Map(),
    };
    for (const order of orders) {
      for (const entry of order.dispatchLog || []) {
        if (kolkataDateKey(entry.dispatchedAt) !== date) continue;
        const b = entry.branch;
        const key = `${entry.itemName.trim().toLowerCase()}__${entry.unit || 'kg'}`;
        const cur = totals[b].get(key) ?? { itemName: entry.itemName, quantity: 0, unit: entry.unit || 'kg' };
        cur.quantity += entry.quantity;
        totals[b].set(key, cur);
      }
    }
    for (const b of BRANCHES) {
      const rows: InvoiceRow[] = [];
      for (const { itemName, quantity, unit } of totals[b].values()) {
        const unitPrice = priceFor(b, itemName);
        rows.push({ itemName, unit, quantity: Math.round(quantity * 1000) / 1000, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 });
      }
      result[b] = rows.sort((a, c) => a.itemName.localeCompare(c.itemName));
    }
    return result;
  }, [orders, date, priceFor]);

  const subtotalFor = (b: Branch) => perBranchRows[b].reduce((s, r) => s + r.lineTotal, 0);

  // Hosur dispatch_log entries only carry a hosur_orders.id (targetHosurOrderId),
  // not a shop name — resolve the distinct ids seen on the selected date to
  // shop names in one batch query (same pattern used in ReportsTab) so each
  // shop can get its own individual invoice.
  const hosurTargetOrderIdsForDate = useMemo(() => {
    const ids = new Set<string>();
    for (const order of orders) {
      for (const entry of order.dispatchLog || []) {
        if (entry.branch === 'Hosur' && entry.targetHosurOrderId && kolkataDateKey(entry.dispatchedAt) === date) {
          ids.add(entry.targetHosurOrderId);
        }
      }
    }
    return Array.from(ids);
  }, [orders, date]);
  const hosurTargetOrderIdsForDateKey = hosurTargetOrderIdsForDate.join(',');
  const [hosurShopNameById, setHosurShopNameById] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    if (hosurTargetOrderIdsForDate.length === 0) { setHosurShopNameById(new Map()); return; }
    (async () => {
      const { data } = await supabase.from('hosur_orders').select('id, shop_name').in('id', hosurTargetOrderIdsForDate);
      if (cancelled) return;
      setHosurShopNameById(new Map(((data ?? []) as Record<string, unknown>[]).map(o => [o.id as string, String(o.shop_name ?? 'Unknown shop')])));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the
    // stable joined string, not the unstable array reference.
  }, [hosurTargetOrderIdsForDateKey]);

  const hosurShopRows = useMemo(() => {
    // BUG FIX: same case-sensitivity bug as perBranchRows/hosurShopSummary
    // above — raw entry.itemName as the key would split e.g. "Bun"/"BUN"
    // into separate rows within a shop's own breakdown. itemName now
    // stored as its own value (first-seen casing) instead of reconstructed
    // from the key, same fix pattern as the other two.
    const byShop = new Map<string, Map<string, { itemName: string; quantity: number; unit: string }>>();
    for (const order of orders) {
      for (const entry of order.dispatchLog || []) {
        if (entry.branch !== 'Hosur') continue;
        if (kolkataDateKey(entry.dispatchedAt) !== date) continue;
        const shopName = entry.targetHosurOrderId ? (hosurShopNameById.get(entry.targetHosurOrderId) ?? 'Unknown shop') : 'Unassigned (not shop-tagged)';
        const items = byShop.get(shopName) ?? new Map<string, { itemName: string; quantity: number; unit: string }>();
        const key = `${entry.itemName.trim().toLowerCase()}__${entry.unit || 'kg'}`;
        const cur = items.get(key) ?? { itemName: entry.itemName, quantity: 0, unit: entry.unit || 'kg' };
        cur.quantity += entry.quantity;
        items.set(key, cur);
        byShop.set(shopName, items);
      }
    }
    return Array.from(byShop.entries()).map(([shopName, items]) => {
      const rows: InvoiceRow[] = Array.from(items.values()).map(({ itemName, quantity, unit }) => {
        const unitPrice = priceFor('Hosur', itemName);
        return { itemName, unit, quantity: Math.round(quantity * 1000) / 1000, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 };
      }).sort((a, c) => a.itemName.localeCompare(c.itemName));
      const subtotal = rows.reduce((s, r) => s + r.lineTotal, 0);
      return { shopName, rows, subtotal };
    }).sort((a, b) => a.shopName.localeCompare(b.shopName));
  }, [orders, date, hosurShopNameById, priceFor]);

  const renderInvoiceHtml = (docTitle: string, metaHtml: string, rows: InvoiceRow[], discountPctValue: number) => {
    const subtotal = rows.reduce((s, r) => s + r.lineTotal, 0);
    const discount = Math.round(subtotal * (discountPctValue / 100) * 100) / 100;
    const total = Math.round((subtotal - discount) * 100) / 100;
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.itemName}</td>
        <td style="text-align:right">${r.quantity} ${r.unit}</td>
        <td style="text-align:right">${invoiceMoney(r.unitPrice)}</td>
        <td style="text-align:right">${invoiceMoney(r.lineTotal)}</td>
      </tr>`).join('');
    return `
      <html><head><title>${docTitle}</title>
      <style>
        @page { size: auto; margin: 10mm; }
        @media print { html, body { height: auto !important; } }
        body { font-family: sans-serif; padding: 16px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 2px; }
        .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
        th { text-align: left; background: #f5f5f5; }
        .totals { margin-top: 12px; width: 280px; margin-left: auto; font-size: 14px; }
        .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
        .grand { font-weight: 800; font-size: 16px; border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; }
        .discount { color: #b91c1c; }
      </style></head>
      <body>
        <h1>Cafe Aadvikam — Invoice</h1>
        <div class="meta">${metaHtml} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-IN')}</div>
        <table>
          <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Line Total</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" style="text-align:center;color:#888">No items dispatched on this date</td></tr>'}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><span>${invoiceMoney(subtotal)}</span></div>
          <div class="discount"><span>Discount (${discountPctValue}%)</span><span>- ${invoiceMoney(discount)}</span></div>
          <div class="grand"><span>Total Payable</span><span>${invoiceMoney(total)}</span></div>
        </div>
      </body></html>`;
  };

  // BUG FIX (2026-08-08): "in the invoice tab we are unable to print the
  // invoices" — same popup-blocker issue as the Dispatch tab's checklist/
  // invoice prints; switched to the hidden-iframe printer (see
  // printViaIframe) which can't be silently blocked.
  const printInvoice = (b: Branch) => {
    printViaIframe(renderInvoiceHtml(
      `Invoice — ${b} — ${date}`,
      `Branch: <b>${b}</b> &nbsp;·&nbsp; Date: <b>${date}</b>`,
      perBranchRows[b],
      discountPct[b],
    ));
  };

  const printHosurShopInvoice = (shopName: string, rows: InvoiceRow[]) => {
    printViaIframe(renderInvoiceHtml(
      `Invoice — Hosur — ${shopName} — ${date}`,
      `Branch: <b>Hosur</b> &nbsp;·&nbsp; Shop: <b>${shopName}</b> &nbsp;·&nbsp; Date: <b>${date}</b>`,
      rows,
      discountPct.Hosur,
    ));
  };

  const printAllHosurShops = () => {
    for (const s of hosurShopRows) printHosurShopInvoice(s.shopName, s.rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-foreground">Invoice</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground"
          />
          <RefreshOrdersButton />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {BRANCHES.map(b => {
          const rows = perBranchRows[b];
          const subtotal = subtotalFor(b);
          const discount = subtotal * (discountPct[b] / 100);
          const total = subtotal - discount;
          return (
            <button
              key={b}
              onClick={() => setBranch(b)}
              className={cn(
                'rounded-2xl border p-4 text-left shadow-sm transition',
                branch === b ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-200' : 'border-border bg-white hover:bg-muted/40'
              )}
            >
              <p className={cn('text-sm font-black', BRANCH_META[b].text)}>{BRANCH_META[b].icon} {b}</p>
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">{rows.length} item{rows.length === 1 ? '' : 's'} dispatched</p>
              <p className="mt-2 text-lg font-black text-foreground">{invoiceMoney(total)}</p>
              <p className="text-[10px] font-bold text-muted-foreground">
                {discountPct[b] > 0 ? `after ${discountPct[b]}% discount · ` : ''}subtotal {invoiceMoney(subtotal)}
              </p>
            </button>
          );
        })}
      </div>

      {loadingPrices && <p className="text-[11px] font-bold text-muted-foreground">Loading branch prices…</p>}

      {branch && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={cn('text-sm font-black', BRANCH_META[branch].text)}>{BRANCH_META[branch].icon} {branch} — Invoice for {date}</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                Discount %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPct[branch]}
                  onChange={e => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setDiscountPct(p => ({ ...p, [branch]: v }));
                  }}
                  className="w-16 rounded-lg border border-border px-2 py-1 text-xs font-bold text-foreground"
                />
              </label>
              <button
                onClick={() => printInvoice(branch)}
                className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"
              >
                <Printer className="size-3.5" /> Print Invoice
              </button>
            </div>
          </div>

          {perBranchRows[branch].length === 0 ? (
            <div className="mt-3"><EmptyState text="Nothing dispatched to this branch on this date." /></div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs font-black uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Unit Price</th>
                    <th className="px-4 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {perBranchRows[branch].map(r => (
                    <tr key={`${r.itemName}-${r.unit}`} className="border-t border-border">
                      <td className="px-4 py-2 font-bold text-foreground">{r.itemName}{r.unitPrice === 0 && <span className="ml-1 text-[10px] font-bold text-amber-600">(no price found)</span>}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{r.quantity} {r.unit}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{invoiceMoney(r.unitPrice)}</td>
                      <td className="px-4 py-2 text-right font-black text-foreground">{invoiceMoney(r.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between font-bold text-muted-foreground"><span>Subtotal</span><span>{invoiceMoney(subtotalFor(branch))}</span></div>
            <div className="flex justify-between font-bold text-red-600"><span>Discount ({discountPct[branch]}%)</span><span>- {invoiceMoney(subtotalFor(branch) * (discountPct[branch] / 100))}</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-black text-foreground"><span>Total Payable</span><span>{invoiceMoney(subtotalFor(branch) * (1 - discountPct[branch] / 100))}</span></div>
          </div>

          {branch === 'Hosur' && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-black text-foreground">By Shop — individual invoices</h4>
                {hosurShopRows.length > 0 && (
                  <button
                    onClick={printAllHosurShops}
                    className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"
                  >
                    <Printer className="size-3" /> Print All Shops Separately
                  </button>
                )}
              </div>
              {hosurShopRows.length === 0 ? (
                <div className="mt-2"><EmptyState text="No Hosur dispatches on this date to break out by shop." /></div>
              ) : (
                <div className="mt-2 space-y-2">
                  {hosurShopRows.map(s => {
                    const disc = s.subtotal * (discountPct.Hosur / 100);
                    const total = s.subtotal - disc;
                    return (
                      <div key={s.shopName} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                        <div>
                          <p className="text-xs font-black text-foreground">{s.shopName}</p>
                          <p className="text-[10px] font-bold text-muted-foreground">{s.rows.length} item{s.rows.length === 1 ? '' : 's'} · {invoiceMoney(total)}{discountPct.Hosur > 0 ? ` (after ${discountPct.Hosur}% discount)` : ''}</p>
                        </div>
                        <button
                          onClick={() => printHosurShopInvoice(s.shopName, s.rows)}
                          className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"
                        >
                          <Printer className="size-3" /> Print
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">Dispatch Batches</h3>
            <p className="text-[11px] font-bold text-muted-foreground">Every confirmed dispatch is stored here as one batch — click a batch to reprint its invoice.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month" value={batchMonth}
              onChange={e => setBatchMonth(e.target.value || batchMonth)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground"
            />
            <select
              value={batchBranch}
              onChange={e => setBatchBranch(e.target.value as Branch | 'All')}
              className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground"
            >
              <option value="All">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button
              onClick={downloadMonthExcel}
              disabled={!batches || batches.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-40"
            >
              <FileSpreadsheet className="size-3.5" /> Download Month
            </button>
          </div>
        </div>

        {batchError && <p className="mt-3 text-xs font-bold text-red-700">{batchError}</p>}

        {batches === null ? (
          <p className="mt-3 text-[11px] font-bold text-muted-foreground">Loading batches…</p>
        ) : batches.length === 0 ? (
          <div className="mt-3"><EmptyState text="No dispatch batches stored for this month yet." /></div>
        ) : (
          <div className="mt-3 space-y-4">
            {BRANCHES.filter(b => batchesByBranch.has(b)).map(b => (
              <div key={b}>
                <h4 className={cn('text-xs font-black', BRANCH_META[b].text)}>{BRANCH_META[b].icon} {b} — {batchesByBranch.get(b)!.length} batch{batchesByBranch.get(b)!.length === 1 ? '' : 'es'}</h4>
                <div className="mt-1.5 space-y-1.5">
                  {batchesByBranch.get(b)!.map(record => (
                    <div key={record.id} className="rounded-xl border border-border">
                      <button
                        type="button"
                        onClick={() => setOpenBatchId(v => v === record.id ? null : record.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
                      >
                        <span className="text-xs font-bold text-foreground">
                          {record.invoiceNo}{record.hosurShopName ? ` — ${record.hosurShopName}` : ''}
                          <span className="ml-1.5 text-muted-foreground">· {new Date(record.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                        <span className="text-xs font-black text-foreground">{invoiceMoney(record.total)}</span>
                      </button>
                      {openBatchId === record.id && (
                        <div className="border-t border-border px-3 py-2.5">
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/40 text-left font-black uppercase text-muted-foreground">
                                <tr><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">Total</th></tr>
                              </thead>
                              <tbody>
                                {record.items.map(item => (
                                  <tr key={item.itemName} className="border-t border-border">
                                    <td className="px-2 py-1.5 font-bold text-foreground">{item.itemName}</td>
                                    <td className="px-2 py-1.5 text-right text-muted-foreground">{item.quantity} {item.unit}</td>
                                    <td className="px-2 py-1.5 text-right text-muted-foreground">{invoiceMoney(item.unitPrice)}</td>
                                    <td className="px-2 py-1.5 text-right font-black text-foreground">{invoiceMoney(item.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-1.5 text-[10px] font-bold text-muted-foreground">Dispatched by {record.dispatchedBy} · Discount {record.discountPct}% · Subtotal {invoiceMoney(record.subtotal)}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => printDispatchInvoice(record, 'thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3" /> Print / PDF (Thermal)</button>
                            <button onClick={() => printDispatchInvoice(record, 'a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3" /> Print / PDF (A4)</button>
                            {record.status !== 'cancelled' && (
                              <button onClick={() => setEditingBatch(record)} className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100"><Pencil className="size-3" /> Edit Bill</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editingBatch && (
        <EditDispatchInvoiceModal
          invoice={editingBatch}
          onClose={() => setEditingBatch(null)}
          onSaved={() => { setEditingBatch(null); void loadBatches(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Reports ────────────────────────────────────────────────────────────
// Owner/manager-facing operational report: orders placed, merged summary, and
// production-vs-dispatch variance (which items are falling short of what was
// ordered vs which are running ahead) for a chosen date range, with one-click
// multi-sheet Excel and a printable PDF summary.
const REPORT_VARIANCE_BAND = 10; // % — inside this band an item counts as "On Target"

interface ReportVarianceRow {
  itemName: string; unit: string; category: string;
  requested: number; produced: number; dispatched: number;
  prodVariancePct: number; dispatchVariancePct: number;
  status: 'Not Started' | 'Under-producing' | 'On Target' | 'Over-producing';
}

function computeReportRows(orders: BakeryOrder[]): ReportVarianceRow[] {
  const production = computeProductionRows(orders);
  return production.map(row => {
    const dispatched = orders.filter(o => row.contributingOrderIds.includes(o.id))
      .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s2, d) => s2 + d.quantity, 0), 0);
    const prodVariancePct = row.totalRequested > 0 ? Math.round(((row.preparedTotal - row.totalRequested) / row.totalRequested) * 1000) / 10 : 0;
    const dispatchVariancePct = row.preparedTotal > 0 ? Math.round(((dispatched - row.preparedTotal) / row.preparedTotal) * 1000) / 10 : 0;
    const status: ReportVarianceRow['status'] =
      row.preparedTotal === 0 ? 'Not Started'
      : prodVariancePct < -REPORT_VARIANCE_BAND ? 'Under-producing'
      : prodVariancePct > REPORT_VARIANCE_BAND ? 'Over-producing'
      : 'On Target';
    return { itemName: row.itemName, unit: row.unit, category: row.category, requested: row.totalRequested, produced: row.preparedTotal, dispatched, prodVariancePct, dispatchVariancePct, status };
  }).sort((a, b) => a.prodVariancePct - b.prodVariancePct);
}

const REPORT_STATUS_COLOR: Record<ReportVarianceRow['status'], string> = {
  'Not Started':    'bg-muted text-muted-foreground',
  'Under-producing': 'bg-red-100 text-red-700',
  'On Target':       'bg-teal-100 text-teal-700',
  'Over-producing':  'bg-blue-100 text-blue-700',
};

// "Start Fresh" cutoff for Reports — same non-destructive pattern as the
// Closing Stock cutoff in PlannerLeftoverTab: instead of deleting historical
// orders/leftover-pool rows (which would destroy the audit trail), we store a
// business-date cutoff in app_state and every data source this tab reads
// filters out anything dated before it. Fully reversible, no data loss.
const REPORTS_CUTOFF_KEY = 'planner_reports_cutoff';
async function getReportsCutoff(): Promise<string | null> {
  const { data } = await supabase.from('app_state').select('value').eq('key', REPORTS_CUTOFF_KEY).maybeSingle();
  const cutoff = (data?.value as { cutoff?: string } | null)?.cutoff;
  return cutoff ?? null;
}
async function setReportsCutoff(dateKey: string): Promise<void> {
  await supabase.from('app_state').upsert({ key: REPORTS_CUTOFF_KEY, value: { cutoff: dateKey }, updated_at: new Date().toISOString() });
}

function ReportsTab({ orders }: { orders: BakeryOrder[] }) {
  const [quickRange, setQuickRange] = useState<'today' | '7d' | '30d' | 'custom'>('7d');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return kolkataDateKey(d.toISOString()); });
  const [dateTo, setDateTo] = useState(() => kolkataDateKey(new Date().toISOString()));
  // Start Fresh control removed (2026-08-07) per request — reportsCutoff is
  // still loaded read-only so any cutoff set previously keeps clamping the
  // report window and the "Showing data from X onward" banner below still
  // explains it, but there's no longer a way to set a new one from this tab.
  const [reportsCutoff, setReportsCutoffState] = useState<string | null>(null);
  useEffect(() => { void getReportsCutoff().then(setReportsCutoffState); }, []);
  // Manual refresh — bumping this re-runs the Hosur leftover/adjustment
  // fetch below (which otherwise only re-fires when the date range changes)
  // alongside a forced re-fetch of the shared `orders` store.
  const [refreshTick, setRefreshTick] = useState(0);
  const fetchOrdersForRefresh = useBakeryStore(s => s.fetchOrders);
  const [refreshingReport, setRefreshingReport] = useState(false);
  const refreshReport = async () => {
    setRefreshingReport(true);
    try { await Promise.all([fetchOrdersForRefresh(true, true), Promise.resolve(setRefreshTick(t => t + 1))]); } finally { setRefreshingReport(false); }
  };

  useEffect(() => {
    if (quickRange === 'custom') return;
    const to = new Date();
    const from = new Date();
    if (quickRange === '7d') from.setDate(from.getDate() - 6);
    else if (quickRange === '30d') from.setDate(from.getDate() - 29);
    setDateFrom(kolkataDateKey(from.toISOString()));
    setDateTo(kolkataDateKey(to.toISOString()));
  }, [quickRange]);

  const ordersInRange = useMemo(
    () => orders.filter(o => {
      const key = groupDateKey(o);
      return key >= dateFrom && key <= dateTo && (!reportsCutoff || key >= reportsCutoff);
    }),
    [orders, dateFrom, dateTo, reportsCutoff],
  );
  // Orders actually placed in the window (any status) vs the subset that reached
  // Store/production — both matter: one shows demand, the other shows what moved.
  const placedOrders = useMemo(() => ordersInRange, [ordersInRange]);
  const producedSource = useMemo(() => ordersInRange.filter(o => ['store_confirmed', 'produced', 'dispatched'].includes(o.status)), [ordersInRange]);

  const merged = useMemo(() => computeMergedSummary(producedSource), [producedSource]);
  const varianceRows = useMemo(() => computeReportRows(producedSource), [producedSource]);
  const underRows = useMemo(() => varianceRows.filter(r => r.status === 'Under-producing'), [varianceRows]);
  const overRows = useMemo(() => varianceRows.filter(r => r.status === 'Over-producing'), [varianceRows]);
  const notStartedRows = useMemo(() => varianceRows.filter(r => r.status === 'Not Started'), [varianceRows]);
  const onTargetRows = useMemo(() => varianceRows.filter(r => r.status === 'On Target'), [varianceRows]);

  const chartData = useMemo(() => varianceRows
    .filter(r => r.status === 'Under-producing' || r.status === 'Over-producing')
    .slice(0, 12)
    .map(r => ({ name: r.itemName.length > 14 ? r.itemName.slice(0, 12) + '…' : r.itemName, variance: r.prodVariancePct })),
  [varianceRows]);

  // Hosur leftover pool + billed-order cancellations for the same window —
  // separate data source (Supabase directly, not the bakery_orders prop)
  // since this is Hosur-shop-order-level detail, not bakery production detail.
  const [hosurLeftovers, setHosurLeftovers] = useState<{ itemName: string; unit: string; quantity: number; unitPrice: number; sourceShopName: string | null; reason: string; status: string; createdAt: string }[]>([]);
  const [hosurAdjustments, setHosurAdjustments] = useState<{ itemName: string; unit: string; quantity: number; adjustmentAmount: number; reason: string | null; createdAt: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clamp the window's start to the "start fresh" cutoff (if set) so
      // pre-cutoff Hosur leftover/adjustment activity never resurfaces here,
      // regardless of what date range the user picks.
      const effectiveFrom = reportsCutoff && reportsCutoff > dateFrom ? reportsCutoff : dateFrom;
      // BUG FIX: these lacked a timezone offset entirely — Postgres would
      // interpret the naive string using its own session timezone
      // (typically UTC for Supabase), not Kolkata time like every other
      // date boundary in this app assumes. That shifts the actual query
      // window by 5.5 hours from the intended Kolkata calendar-day
      // boundaries — early-morning entries near the start of the range
      // could be silently excluded, and late-evening entries just past
      // the end of the range could be silently included. Explicit +05:30
      // offset, same pattern dayWindow already uses correctly.
      const fromIso = `${effectiveFrom}T00:00:00+05:30`;
      const toIso = `${dateTo}T23:59:59+05:30`;
      const [leftoverRes, adjustmentRes] = await Promise.all([
        supabase.from('hosur_leftover_pool').select('item_name, unit, quantity, unit_price, source_shop_name, reason, status, created_at').gte('created_at', fromIso).lte('created_at', toIso).order('created_at', { ascending: false }),
        supabase.from('hosur_bill_adjustments').select('item_name, unit, quantity, adjustment_amount, reason, created_at').gte('created_at', fromIso).lte('created_at', toIso).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setHosurLeftovers((leftoverRes.data ?? []).map((r: Record<string, unknown>) => ({
        itemName: String(r.item_name ?? ''), unit: String(r.unit ?? 'kg'), quantity: Number(r.quantity ?? 0),
        unitPrice: Number(r.unit_price ?? 0), sourceShopName: (r.source_shop_name as string) ?? null,
        reason: String(r.reason ?? ''), status: String(r.status ?? ''), createdAt: String(r.created_at ?? ''),
      })));
      setHosurAdjustments((adjustmentRes.data ?? []).map((r: Record<string, unknown>) => ({
        itemName: String(r.item_name ?? ''), unit: String(r.unit ?? 'kg'), quantity: Number(r.quantity ?? 0),
        adjustmentAmount: Number(r.adjustment_amount ?? 0), reason: (r.reason as string) ?? null, createdAt: String(r.created_at ?? ''),
      })));
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, reportsCutoff, refreshTick]);
  // FEATURE (2026-08-07): "Sometimes the planner will dispatch additional
  // items from the requested items... This should show as in report" —
  // extra/non-requested dispatches (DispatchEntry.isExtra) live inside each
  // order's own dispatch_log and were never part of computeProductionRows
  // (which is built purely from ordered items), so they'd otherwise be
  // completely invisible to this report. Pulled directly from ordersInRange
  // so the date-range picker and Start Fresh cutoff above apply here too.
  // FEATURE (2026-08-07 cont'd): "for hosur shops its showing as combine as
  // hosur I need the shop name were the stock was dispatched" — every Hosur
  // dispatch_log entry only carries a hosur_orders.id (targetHosurOrderId),
  // not a shop name, so we resolve the distinct ids seen in this window to
  // shop names in one batch query (same pattern as HosurShopBreakdown above)
  // and use that map both for the Extra Items rows and the new by-shop table.
  const hosurTargetOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of ordersInRange) {
      for (const d of o.dispatchLog || []) {
        if (d.branch === 'Hosur' && d.targetHosurOrderId) ids.add(d.targetHosurOrderId);
      }
    }
    return Array.from(ids);
  }, [ordersInRange]);
  const hosurTargetOrderIdsKey = hosurTargetOrderIds.join(',');
  const [hosurShopNameById, setHosurShopNameById] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    if (hosurTargetOrderIds.length === 0) { setHosurShopNameById(new Map()); return; }
    (async () => {
      const { data } = await supabase.from('hosur_orders').select('id, shop_name').in('id', hosurTargetOrderIds);
      if (cancelled) return;
      setHosurShopNameById(new Map(((data ?? []) as Record<string, unknown>[]).map(o => [o.id as string, String(o.shop_name ?? 'Unknown shop')])));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the
    // stable joined string, not the unstable array reference (see HosurShopBreakdown).
  }, [hosurTargetOrderIdsKey]);
  const resolveHosurShopName = (d: { branch: string; targetHosurOrderId?: string }): string | null => {
    if (d.branch !== 'Hosur') return null;
    if (!d.targetHosurOrderId) return 'Unassigned (not shop-tagged)';
    return hosurShopNameById.get(d.targetHosurOrderId) ?? 'Unknown shop';
  };

  const extraDispatchRows = useMemo(() => ordersInRange.flatMap(o =>
    (o.dispatchLog || [])
      .filter(d => d.isExtra)
      // BUG FIX: this only relied on ordersInRange's own order-level date
      // filter — but dispatches for one order can span multiple days
      // (partial dispatches over time), so an extra item dispatched
      // OUTSIDE the selected range could still show up here just because
      // its order happened to be sent within range. Every other
      // dispatch_log-based computation in this tab (hosurShopRows,
      // perBranchRows) filters each entry's own dispatchedAt date — this
      // one didn't, and should, for the same date-scoped report to be
      // consistent about what "in this range" actually means.
      .filter(d => {
        const key = kolkataDateKey(d.dispatchedAt);
        return key >= dateFrom && key <= dateTo && (!reportsCutoff || key >= reportsCutoff);
      })
      .map(d => ({
        itemName: d.itemName, quantity: d.quantity, unit: d.unit || 'kg',
        branch: d.branch, dispatchedAt: d.dispatchedAt, dispatchedBy: d.dispatchedBy,
        orderNumber: o.orderNumber, shopName: resolveHosurShopName(d),
      })),
  ).sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt)), [ordersInRange, hosurShopNameById, dateFrom, dateTo, reportsCutoff]);

  // Every Hosur dispatch (not just extras) broken out by the actual shop it
  // went to, so "Hosur" stops being one combined bucket in the report.
  const hosurShopDispatchRows = useMemo(() => ordersInRange.flatMap(o =>
    (o.dispatchLog || [])
      .filter(d => d.branch === 'Hosur')
      // BUG FIX: same fix as extraDispatchRows above — filter each
      // entry's own dispatch date, not just the order's sent-date.
      .filter(d => {
        const key = kolkataDateKey(d.dispatchedAt);
        return key >= dateFrom && key <= dateTo && (!reportsCutoff || key >= reportsCutoff);
      })
      .map(d => ({
        shopName: resolveHosurShopName(d) || 'Unassigned (not shop-tagged)',
        itemName: d.itemName, quantity: d.quantity, unit: d.unit || 'kg',
        isExtra: Boolean(d.isExtra), dispatchedAt: d.dispatchedAt, dispatchedBy: d.dispatchedBy,
        orderNumber: o.orderNumber,
      })),
  ), [ordersInRange, hosurShopNameById, dateFrom, dateTo, reportsCutoff]);

  const hosurShopSummary = useMemo(() => {
    const byShop = new Map<string, { shopName: string; totalDispatches: number; extraCount: number; items: Map<string, { itemName: string; unit: string; quantity: number }> }>();
    for (const r of hosurShopDispatchRows) {
      const entry = byShop.get(r.shopName) ?? { shopName: r.shopName, totalDispatches: 0, extraCount: 0, items: new Map() };
      entry.totalDispatches += 1;
      if (r.isExtra) entry.extraCount += 1;
      // BUG FIX: same case-sensitivity bug as displayItems/rowsByName/
      // perBranchRows above — raw, unnormalized r.itemName (straight from
      // a dispatch_log entry) as the key would split "Bun" and "BUN" into
      // two separate item rows within this shop's summary instead of one
      // combined total.
      const itemKey = `${r.itemName.trim().toLowerCase()}|${r.unit}`;
      const itemEntry = entry.items.get(itemKey) ?? { itemName: r.itemName, unit: r.unit, quantity: 0 };
      itemEntry.quantity += r.quantity;
      entry.items.set(itemKey, itemEntry);
      byShop.set(r.shopName, entry);
    }
    return Array.from(byShop.values())
      .map(s => ({ ...s, items: Array.from(s.items.values()).sort((a, b) => a.itemName.localeCompare(b.itemName)) }))
      .sort((a, b) => a.shopName.localeCompare(b.shopName));
  }, [hosurShopDispatchRows]);

  // FEATURE (2026-08-10): "cake orders should be clearly noted and tracked
  // in reports" — cake_master_orders is a completely separate table from
  // bakery_orders (the `orders` prop this whole tab is built on), so cakes
  // were entirely invisible in Reports until now. Scoped to the same
  // date-range picker as everything else, keyed off created_at (when the
  // advance order — and therefore the cake — was actually placed).
  const [cakeOrdersInRange, setCakeOrdersInRange] = useState<{ branch: string; status: string; order_value: number; created_at: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // BUG FIX: same timezone bug as the Hosur leftover/adjustment query
      // above — naive timestamps get interpreted by Postgres's own
      // session timezone (typically UTC), not Kolkata time.
      const fromIso = `${dateFrom}T00:00:00+05:30`;
      const toIso = `${dateTo}T23:59:59+05:30`;
      const { data } = await supabase.from('cake_master_orders').select('branch, status, order_value, created_at').gte('created_at', fromIso).lte('created_at', toIso);
      if (cancelled) return;
      setCakeOrdersInRange((data ?? []) as { branch: string; status: string; order_value: number; created_at: string }[]);
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, refreshTick]);
  const cakeOrdersDispatched = useMemo(() => cakeOrdersInRange.filter(o => o.status === 'Dispatched'), [cakeOrdersInRange]);
  const cakeOrdersCancelled = useMemo(() => cakeOrdersInRange.filter(o => o.status === 'Correction Required'), [cakeOrdersInRange]);
  const cakeOrdersValue = useMemo(() => Math.round(cakeOrdersInRange.reduce((s, o) => s + Number(o.order_value || 0), 0) * 100) / 100, [cakeOrdersInRange]);
  const cakeOrdersDispatchedValue = useMemo(() => Math.round(cakeOrdersDispatched.reduce((s, o) => s + Number(o.order_value || 0), 0) * 100) / 100, [cakeOrdersDispatched]);

  const hosurLeftoverAvailable = useMemo(() => hosurLeftovers.filter(l => l.status === 'available'), [hosurLeftovers]);
  const hosurLeftoverResolved = useMemo(() => hosurLeftovers.filter(l => l.status === 'resolved'), [hosurLeftovers]);
  const hosurShortfallCount = useMemo(() => hosurLeftovers.filter(l => l.reason === 'dispatch_shortfall').length, [hosurLeftovers]);
  const hosurCancelledCount = useMemo(() => hosurLeftovers.filter(l => l.reason === 'post_dispatch_cancel').length, [hosurLeftovers]);
  const hosurCancelledValue = useMemo(() => Math.round(Math.abs(hosurAdjustments.reduce((s, a) => s + a.adjustmentAmount, 0)) * 100) / 100, [hosurAdjustments]);

  const rangeLabel = dateFrom === dateTo
    ? new Date(`${dateFrom}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(`${dateFrom}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(`${dateTo}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const exportExcelReport = () => {
    const wb = XLSX.utils.book_new();
    const addSheet = (rows: Record<string, unknown>[], name: string, fallback: string) => {
      const data = rows.length > 0 ? rows : [{ Note: fallback }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name.slice(0, 31));
    };
    addSheet([
      { Metric: 'Period', Value: rangeLabel },
      { Metric: 'Orders Placed', Value: placedOrders.length },
      { Metric: 'Items Tracked', Value: varianceRows.length },
      { Metric: 'Under-producing Items', Value: underRows.length },
      { Metric: 'On-Target Items', Value: onTargetRows.length },
      { Metric: 'Over-producing Items', Value: overRows.length },
      { Metric: 'Not Started Items', Value: notStartedRows.length },
    ], 'Summary', 'No data');
    addSheet(placedOrders.map(o => ({
      'Order #': o.orderNumber, Branch: bucketFor(o), Status: o.status,
      'Placed On': new Date(o.createdAt).toLocaleString('en-IN'),
      'Sent to Production': o.storeConfirmedAt ? new Date(o.storeConfirmedAt).toLocaleString('en-IN') : 'Not yet sent',
      'Items': o.items.map(i => `${i.itemName} x${i.dispatchUnit === 'pcs' ? (i.originalPcs ?? i.quantity) : i.quantity}${i.dispatchUnit || 'kg'}`).join(', '),
    })), 'Orders Placed', 'No orders in this range');
    addSheet(merged.map(row => ({
      Item: row.itemName, Unit: row.unit,
      ...Object.fromEntries(DISPLAY_BUCKETS.map(b => [b, row.perBranch[b] ?? ''])),
      Total: row.totalRequested,
    })), 'Merged Summary', 'No data');
    addSheet(varianceRows.map(r => ({
      Category: r.category, Item: r.itemName, Unit: r.unit,
      Requested: r.requested, Produced: r.produced, Dispatched: r.dispatched,
      'Production Variance %': r.prodVariancePct, 'Dispatch Variance %': r.dispatchVariancePct, Status: r.status,
    })), 'Production & Dispatch', 'No data');
    addSheet(extraDispatchRows.map(r => ({
      Item: r.itemName, Quantity: r.quantity, Unit: r.unit, Branch: r.branch,
      Shop: r.shopName || '', 'Order #': r.orderNumber, 'Dispatched By': r.dispatchedBy,
      Date: new Date(r.dispatchedAt).toLocaleString('en-IN'),
      'How This Was Added': 'Sent via the "Dispatch an extra item" form — an item the branch/shop never ordered (or more of it than was ordered).',
    })), 'Extra Non-Requested Items', 'No extra/non-requested dispatches in this range');
    addSheet(hosurShopSummary.flatMap(s => s.items.map(it => ({
      Shop: s.shopName, Item: it.itemName, Quantity: it.quantity, Unit: it.unit,
    }))), 'Hosur Dispatch By Shop', 'No Hosur dispatches in this range');
    addSheet(hosurLeftovers.map(l => ({
      Item: l.itemName, Unit: l.unit, Quantity: l.quantity, 'Unit Price': l.unitPrice,
      Shop: l.sourceShopName || '', Reason: leftoverReasonLabel(l.reason),
      Status: l.status === 'available' ? 'Still in pool' : 'Resolved / sent',
      Date: new Date(l.createdAt).toLocaleString('en-IN'),
    })), 'Hosur Leftover Pool', 'No leftover activity in this range');
    addSheet(hosurAdjustments.map(a => ({
      Item: a.itemName, Unit: a.unit, Quantity: a.quantity, 'Adjustment (₹)': a.adjustmentAmount,
      Reason: a.reason || '', Date: new Date(a.createdAt).toLocaleString('en-IN'),
    })), 'Hosur Bill Adjustments', 'No cancellations in this range');
    XLSX.writeFile(wb, `planner-report-${dateFrom}_to_${dateTo}.xlsx`);
  };

  const exportPdfReport = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;
    let y = 48;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
    doc.text('Cafe Aadvikam — Planner Report', marginX, y);
    y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Period: ${rangeLabel}  ·  Generated: ${new Date().toLocaleString('en-IN')}`, marginX, y);
    doc.setTextColor(0);
    y += 26;

    // Ensures there's room for the next block, adding a fresh page (with its
    // own margin) if not — every section below routes through this so long
    // reports (Orders Placed, Merged Summary) paginate cleanly.
    const ensureRoom = (needed: number) => {
      if (y + needed > 780) { doc.addPage(); y = 50; }
    };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Summary', marginX, y); y += 10;
    const kpis: [string, string][] = [
      ['Orders Placed', String(placedOrders.length)],
      ['Items Tracked', String(varianceRows.length)],
      ['Under-producing', String(underRows.length)],
      ['On Target', String(onTargetRows.length)],
      ['Over-producing', String(overRows.length)],
      ['Not Started', String(notStartedRows.length)],
      ['Hosur Leftover (pool)', String(hosurLeftoverAvailable.length)],
      ['Hosur Cancelled Value', `Rs.${hosurCancelledValue}`],
      ['Extra / Non-Requested Sent', String(extraDispatchRows.length)],
      ['Hosur Shops Dispatched To', String(hosurShopSummary.length)],
    ];
    const kpiColWidth = (pageWidth - marginX * 2) / 3;
    kpis.forEach(([label, value], i) => {
      const col = i % 3; const row = Math.floor(i / 3);
      const x = marginX + col * kpiColWidth;
      const yy = y + 16 + row * 36;
      doc.setDrawColor(210); doc.rect(x, yy - 14, kpiColWidth - 8, 32);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(label, x + 6, yy - 3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0);
      doc.text(value, x + 6, yy + 12);
    });
    y += 16 + Math.ceil(kpis.length / 3) * 36 + 14;

    // Reusable bordered table with header repeated on every page it spans —
    // used for all four detail sections below so pagination only has to be
    // written once.
    const drawTable = (title: string, headers: string[], colWidths: number[], rows: string[][], emptyText: string) => {
      ensureRoom(40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(0);
      doc.text(title, marginX, y); y += 14;
      const totalWidth = colWidths.reduce((a, b) => a + b, 0);
      const drawHeader = () => {
        doc.setFillColor(238, 238, 238); doc.setDrawColor(220);
        doc.rect(marginX, y - 10, totalWidth, 16, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40);
        let x = marginX;
        headers.forEach((h, i) => { doc.text(h, x + 4, y); x += colWidths[i]; });
        y += 12;
      };
      drawHeader();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30);
      for (const cells of rows) {
        if (y > 770) { doc.addPage(); y = 50; drawHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30); }
        let x = marginX;
        cells.forEach((c, i) => { doc.text(c, x + 4, y); x += colWidths[i]; });
        doc.setDrawColor(235); doc.line(marginX, y + 4, marginX + totalWidth, y + 4);
        y += 14;
      }
      if (rows.length === 0) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(120); doc.text(emptyText, marginX, y); y += 14; doc.setTextColor(0); }
      y += 12;
    };

    drawTable(
      'Production & Dispatch Variance',
      ['Item', 'Unit', 'Req', 'Prod', 'Disp', 'Var %', 'Status'],
      [155, 35, 55, 55, 55, 55, 100],
      varianceRows.map(r => [r.itemName.slice(0, 28), r.unit, String(r.requested), String(r.produced), String(r.dispatched), `${r.prodVariancePct > 0 ? '+' : ''}${r.prodVariancePct}%`, r.status]),
      'No items in this range.',
    );

    drawTable(
      'Merged Orders Summary',
      ['Item', 'Unit', ...DISPLAY_BUCKETS, 'Total'],
      [140, 35, ...DISPLAY_BUCKETS.map(() => 60), 60],
      merged.map(row => [row.itemName.slice(0, 24), row.unit, ...DISPLAY_BUCKETS.map(b => String(row.perBranch[b] ?? '-')), String(row.totalRequested)]),
      'No orders merged in this range.',
    );

    drawTable(
      'Orders Placed',
      ['Order #', 'Branch', 'Status', 'Placed On', 'Items'],
      [70, 55, 75, 105, 205],
      placedOrders.map(o => [String(o.orderNumber), bucketFor(o), o.status.replace('_', ' '), new Date(o.createdAt).toLocaleDateString('en-IN'), o.items.map(i => i.itemName).join(', ').slice(0, 60)]),
      'No orders placed in this range.',
    );

    drawTable(
      'Hosur Leftover & Cancellations',
      ['Item', 'Unit', 'Qty', 'Shop', 'Reason', 'Status'],
      [140, 35, 45, 110, 130, 90],
      hosurLeftovers.map(l => [l.itemName.slice(0, 22), l.unit, String(l.quantity), (l.sourceShopName || '-').slice(0, 18), leftoverReasonLabel(l.reason), l.status === 'available' ? 'In pool' : 'Resolved']),
      'No leftover or cancellation activity in this range.',
    );

    drawTable(
      'Extra / Non-Requested Items Dispatched',
      ['Item', 'Qty', 'Unit', 'Branch', 'Shop', 'Order #', 'By', 'Date'],
      [110, 40, 35, 55, 90, 55, 70, 90],
      extraDispatchRows.map(r => [r.itemName.slice(0, 20), String(r.quantity), r.unit, r.branch, (r.shopName || '-').slice(0, 16), String(r.orderNumber), r.dispatchedBy.slice(0, 12), new Date(r.dispatchedAt).toLocaleDateString('en-IN')]),
      'No extra/non-requested dispatches in this range.',
    );

    drawTable(
      'Hosur Dispatch by Shop',
      ['Shop', 'Item', 'Quantity', 'Unit'],
      [150, 210, 90, 95],
      hosurShopSummary.flatMap(s => s.items.map(it => [s.shopName.slice(0, 26), it.itemName.slice(0, 38), String(it.quantity), it.unit])),
      'No Hosur dispatches in this range.',
    );

    doc.save(`planner-report-${dateFrom}_to_${dateTo}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <BarChart3 className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Reports</h2>
            <p className="text-xs font-bold text-muted-foreground font-body">Orders, merged summary, production vs dispatch — with a clear variance view for the owner.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void refreshReport()}
            disabled={refreshingReport}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={cn('size-4', refreshingReport && 'animate-spin')} /> Refresh
          </button>
          <button onClick={exportExcelReport} className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100">
            <FileSpreadsheet className="size-4" /> Excel Report
          </button>
          <button onClick={exportPdfReport} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
            <FileText className="size-4" /> PDF Report
          </button>
        </div>
      </div>

      {reportsCutoff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          Showing data from {new Date(`${reportsCutoff}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} onward — earlier report data has been cleared from view.
        </div>
      )}

      {/* Quick range pills — same convention as branch Sales Reports. */}
      <div className="flex flex-wrap items-center gap-2">
        {([{ id: 'today', label: 'Today' }, { id: '7d', label: 'Last 7 days' }, { id: '30d', label: 'Last 30 days' }, { id: 'custom', label: 'Custom' }] as const).map(q => (
          <button key={q.id} onClick={() => setQuickRange(q.id)} className={cn('rounded-full px-3 py-1.5 text-[11px] font-bold', quickRange === q.id ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground')}>{q.label}</button>
        ))}
        {quickRange === 'custom' && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-xl border border-border px-2 py-1.5 text-xs font-bold" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-xl border border-border px-2 py-1.5 text-xs font-bold" />
          </>
        )}
        <span className="text-xs font-bold text-muted-foreground">{rangeLabel}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Orders Placed', value: placedOrders.length, tone: 'bg-card border-border text-foreground' },
          { label: 'Items Tracked', value: varianceRows.length, tone: 'bg-card border-border text-foreground' },
          { label: 'Under-producing', value: underRows.length, tone: 'bg-red-50 border-red-200 text-red-700' },
          { label: 'On Target', value: onTargetRows.length, tone: 'bg-teal-50 border-teal-200 text-teal-700' },
          { label: 'Over-producing', value: overRows.length, tone: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'Not Started', value: notStartedRows.length, tone: 'bg-muted border-border text-muted-foreground' },
        ].map(k => (
          <div key={k.label} className={cn('rounded-xl border p-3', k.tone)}>
            <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{k.label}</p>
            <p className="font-display text-xl font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* FEATURE (2026-08-10): Cake Orders summary — see comment above
          cakeOrdersInRange. Kept as its own labeled card rather than mixed
          into the KPI row above, since these numbers come from a completely
          different table (cake_master_orders) than every other KPI here. */}
      {cakeOrdersInRange.length > 0 && (
        <div className="card-base p-4">
          <div className="flex items-center gap-2"><Cake className="size-4 text-rose-500" /><p className="text-sm font-black text-foreground">Cake Orders ({rangeLabel})</p></div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Placed</p><p className="font-display text-xl font-bold tabular-nums text-foreground">{cakeOrdersInRange.length}</p></div>
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-teal-700">Dispatched</p><p className="font-display text-xl font-bold tabular-nums text-teal-700">{cakeOrdersDispatched.length}</p></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Corrections</p><p className="font-display text-xl font-bold tabular-nums text-amber-700">{cakeOrdersCancelled.length}</p></div>
            <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Value (Dispatched / Total)</p><p className="font-display text-base font-bold tabular-nums text-foreground">Rs. {cakeOrdersDispatchedValue.toFixed(0)} / {cakeOrdersValue.toFixed(0)}</p></div>
          </div>
        </div>
      )}

      {/* Variance visualization — items furthest from their requested quantity,
          red = falling short, blue = running ahead, so the owner sees at a glance
          which items are getting affected and which are over-producing. */}
      {chartData.length > 0 && (
        <div className="card-base p-4">
          <p className="mb-1 text-sm font-black text-foreground">Production Variance — Most Affected Items</p>
          <p className="mb-3 text-[11px] font-bold text-muted-foreground">% difference between produced and requested quantity (top 12 furthest from target)</p>
          <ResponsiveContainer width="100%" height={Math.max(chartData.length * 32, 160)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
              <Tooltip formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'Variance vs requested']} contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.variance < 0 ? '#dc2626' : '#2563eb'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Production & Dispatch variance table — the core "understand at a glance" view. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-black text-foreground">Production & Dispatch — By Item</p>
          <span className="text-xs font-bold text-muted-foreground">{varianceRows.length} items</span>
        </div>
        {varianceRows.length === 0 ? <div className="p-4"><EmptyState text="No production activity in this range." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs font-black uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Requested</th>
                  <th className="px-4 py-2 text-right">Produced</th>
                  <th className="px-4 py-2 text-right">Dispatched</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                  <th className="px-4 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {varianceRows.map(r => (
                  <tr key={`${r.itemName}-${r.unit}`} className="border-t border-border">
                    <td className="px-4 py-2 font-bold text-foreground">{r.itemName} <span className="text-muted-foreground">({r.unit})</span></td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.requested}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.produced}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.dispatched}</td>
                    <td className={cn('px-4 py-2 text-right font-bold', r.prodVariancePct < 0 ? 'text-red-600' : r.prodVariancePct > 0 ? 'text-blue-600' : 'text-teal-600')}>{r.prodVariancePct > 0 ? '+' : ''}{r.prodVariancePct}%</td>
                    <td className="px-4 py-2 text-right"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', REPORT_STATUS_COLOR[r.status])}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Merged Summary — per-branch requested breakdown for the same range. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3"><p className="text-sm font-black text-foreground">Merged Orders Summary</p></div>
        {merged.length === 0 ? <div className="p-4"><EmptyState text="No orders merged in this range." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs font-black uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  {DISPLAY_BUCKETS.map(b => <th key={b} className="px-4 py-2 text-right">{b}</th>)}
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(row => (
                  <tr key={`${row.itemName}-${row.unit}`} className="border-t border-border">
                    <td className="px-4 py-2 font-bold text-foreground">{row.itemName}</td>
                    {DISPLAY_BUCKETS.map(b => <td key={b} className="px-4 py-2 text-right text-muted-foreground">{row.perBranch[b] ? `${row.perBranch[b]} ${row.unit}` : '—'}</td>)}
                    <td className="px-4 py-2 text-right font-black text-foreground">{row.totalRequested} {row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orders Placed — raw detail so the owner can trace any figure back to source orders. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3"><p className="text-sm font-black text-foreground">Orders Placed ({placedOrders.length})</p></div>
        {placedOrders.length === 0 ? <div className="p-4"><EmptyState text="No orders placed in this range." /></div> : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {placedOrders.map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    <span className={cn('mr-1.5 rounded-full px-1.5 py-0.5 text-[10px]', BRANCH_META[bucketFor(o)].bg, BRANCH_META[bucketFor(o)].text)}>{bucketFor(o)}</span>
                    Order #{o.orderNumber}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground">{new Date(o.createdAt).toLocaleString('en-IN')} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">{o.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Extra / Non-Requested Items Dispatched — items the planner sent to a
          branch/shop beyond (or outside of) what was originally ordered, sent
          via the "Dispatch an extra item" form on Dispatch/Hosur panels. */}
      <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-black text-foreground">Extra / Non-Requested Items Dispatched</p>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">{extraDispatchRows.length} sent</span>
        </div>
        {extraDispatchRows.length === 0 ? <div className="p-4"><EmptyState text="No extra/non-requested items dispatched in this range." /></div> : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {extraDispatchRows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">{r.itemName} — {qtyFmt(r.quantity)} {r.unit}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">
                    {r.shopName ? `${r.branch} · ${r.shopName}` : r.branch} · Order #{r.orderNumber} · {r.dispatchedBy} · {new Date(r.dispatchedAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">Extra</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hosur Dispatch by Shop — "for hosur shops its showing as combine as
          hosur I need the shop name were the stock was dispatched." Every
          Hosur dispatch in the window, grouped by the actual shop it went to
          instead of one combined "Hosur" total. */}
      <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-black text-foreground">Hosur Dispatch by Shop</p>
          <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-black text-indigo-800">{hosurShopSummary.length} shop{hosurShopSummary.length === 1 ? '' : 's'}</span>
        </div>
        {hosurShopSummary.length === 0 ? <div className="p-4"><EmptyState text="No Hosur dispatches in this range." /></div> : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {hosurShopSummary.map(s => (
              <div key={s.shopName} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-foreground">{s.shopName}</p>
                  <span className="text-[10px] font-black text-muted-foreground">
                    {s.totalDispatches} dispatch{s.totalDispatches === 1 ? '' : 'es'}{s.extraCount > 0 ? ` · ${s.extraCount} extra` : ''}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 pl-2">
                  {s.items.map(it => (
                    <p key={`${it.itemName}|${it.unit}`} className="text-[11px] font-bold text-muted-foreground">
                      {it.itemName} — {qtyFmt(it.quantity)} {it.unit}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hosur Leftover & Cancellations — what didn't reach a shop (shortfall
          at dispatch) or got cancelled after already being dispatched/billed,
          and how much of that is still sitting in the pool vs already resolved. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-black text-foreground">Hosur Leftover &amp; Cancellations</p>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">{hosurLeftoverAvailable.length} in pool</span>
            <span className="rounded-full bg-teal-100 px-2 py-1 text-teal-700">{hosurLeftoverResolved.length} resolved</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{hosurShortfallCount} shortfalls</span>
            <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">{hosurCancelledCount} cancelled · Rs.{hosurCancelledValue}</span>
          </div>
        </div>
        {hosurLeftovers.length === 0 ? <div className="p-4"><EmptyState text="No leftover or cancellation activity in this range." /></div> : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {hosurLeftovers.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">{l.itemName} — {l.quantity} {l.unit}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">
                    {leftoverReasonLabel(l.reason)} · {l.sourceShopName || 'Unknown shop'} · {new Date(l.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', l.status === 'available' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700')}>{l.status === 'available' ? 'In pool' : 'Resolved'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Billing (Walk-in) ──────────────────────────────────────────────────
// Internal counter sale for customers who walk in directly — separate from
// the branch-to-branch order pipeline. Pulls the deduplicated SNB + VRSNB
// catalog (with real prices), supports a % or ₹ discount, and saves a proper
// bill to bakery_walkin_bills, with a printable receipt and a cancel option.
const WALKIN_PAYMENT_MODES = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
] as const;

interface WalkinBillItem { itemName: string; unit: string; price: number; quantity: number; lineTotal: number }
interface WalkinBillRow {
  id: string; billNo: string; items: WalkinBillItem[]; subtotal: number;
  discountType: 'none' | 'percent' | 'amount'; discountValue: number; discountAmount: number; total: number;
  paymentMode: string; cashierName: string | null; status: 'active' | 'cancelled'; createdAt: string;
  customerName: string | null; customerMobile: string | null;
}

function mapWalkinBill(d: Record<string, unknown>): WalkinBillRow {
  return {
    id: d.id as string, billNo: d.bill_no as string,
    items: Array.isArray(d.items) ? (d.items as WalkinBillItem[]) : [],
    subtotal: Number(d.subtotal) || 0,
    discountType: (d.discount_type as WalkinBillRow['discountType']) || 'none',
    discountValue: Number(d.discount_value) || 0,
    discountAmount: Number(d.discount_amount) || 0,
    total: Number(d.total) || 0,
    paymentMode: (d.payment_mode as string) || 'cash',
    cashierName: (d.cashier_name as string | null) ?? null,
    status: (d.status as WalkinBillRow['status']) || 'active',
    createdAt: d.created_at as string,
    customerName: (d.customer_name as string | null) ?? null,
    customerMobile: (d.customer_mobile as string | null) ?? null,
  };
}

// WORKFLOW CHANGE (2026-08-09): "All bills in this dashboard should use a
// standard format, sourced from the Dispatch tab's invoice format" — this
// used to print its own bespoke thermal-only receipt layout, the one bill
// type in Planner still not sharing the TAX INVOICE format every other
// dispatch/sample-bill/custom-cake invoice now uses. Adapts the saved
// bakery_walkin_bills row into the same DispatchInvoiceRecord shape so it
// renders through the identical renderDispatchInvoiceHtml template (and now
// gets an A4 option too, not just thermal).
function walkinBillToInvoiceRecord(bill: WalkinBillRow): DispatchInvoiceRecord {
  return {
    id: bill.id,
    invoiceNo: bill.billNo,
    scope: 'SNB',
    hosurShopId: null, hosurShopName: null, hosurShopPhone: null,
    customerName: bill.customerName || 'Walk-in Customer',
    customerPhone: bill.customerMobile,
    customerAddress: null,
    dispatchedBy: bill.cashierName || 'Planner',
    items: bill.items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: i.price, lineTotal: i.lineTotal })),
    subtotal: bill.subtotal,
    discountPct: bill.discountType === 'percent' ? bill.discountValue : 0,
    discountAmount: bill.discountAmount,
    roundOff: 0,
    total: bill.total,
    status: 'paid',
    paidAt: bill.createdAt,
    notes: `Walk-in Bill · Payment: ${bill.paymentMode.toUpperCase()}`,
    createdAt: bill.createdAt,
    dispatchEntryIds: [], // not a real dispatch — nothing to trace back to
  };
}

function printWalkinBill(bill: WalkinBillRow, mode: 'thermal' | 'a4' = 'thermal') {
  printDispatchInvoice(walkinBillToInvoiceRecord(bill), mode);
}

// FEATURE (2026-08-09): "In Billing (Walk-in) tab: create a new 'Sample
// Bill' sub-tab where a bill is created for a customer before they pay" —
// wraps the existing walk-in billing UI (now "New Bill") and the new Sample
// Bill flow under one set of sub-tabs, same pattern as the Dispatch tab's
// To Dispatch/Dispatched/Planned/Custom switcher.
function BillingWalkinTab() {
  const [sub, setSub] = useState<'new' | 'sample'>('new');
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  return (
    <div className="space-y-4">
      {showPrinterSetup && <PlannerPrinterSetupModal onClose={() => setShowPrinterSetup(false)} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setSub('new')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', sub === 'new' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground')}>New Bill</button>
          <button onClick={() => setSub('sample')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', sub === 'sample' ? 'cafe-gradient text-white shadow-teal' : 'bg-primary/10 text-primary')}>Sample Bill</button>
        </div>
        <button
          type="button"
          onClick={() => setShowPrinterSetup(true)}
          title="Printer setup (route walk-in receipts to your thermal printer)"
          aria-label="Printer setup"
          className="inline-flex size-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
        >
          <Printer className="size-3.5" />
        </button>
      </div>
      {sub === 'new' ? <BillingTab /> : <SampleBillTab />}
    </div>
  );
}

function BillingTab() {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, { itemName: string; unit: 'pcs' | 'kg'; price: number; quantity: number }>>({});
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  // FEATURE (2026-08-24): "Billing (Walk-in): no customer name/mobile
  // fields" — optional, defaults preserve existing behavior when skipped.
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMode, setPaymentMode] = useState<typeof WALKIN_PAYMENT_MODES[number]['key']>('cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState<WalkinBillRow | null>(null);
  const [recent, setRecent] = useState<WalkinBillRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // BUG FIX (2026-08-08): "the daily closure -> cashier closure opens only I
  // should be able to send the bills for hosur shops and I should be able to
  // make sales in billing (walk in) tab" — this screen had NO counter gate
  // at all, so a walk-in sale could be recorded even with the day's counter
  // never opened. Now gated by the same single Planner Daily Closure counter
  // (packingCounter.ts) that already gates Hosur dispatch/billing, with the
  // same 15s-poll-while-visible pattern used there so this doesn't go stale
  // for a screen that stays mounted all session.
  const [counterOpen, setCounterOpen] = useState<boolean | null>(null);
  const [counterError, setCounterError] = useState('');
  const [refreshingCounter, setRefreshingCounter] = useState(false);
  const refreshCounter = useCallback(async () => {
    try {
      const status = await getPackingCounterStatus();
      setCounterOpen(status.isOpen);
      setCounterError('');
    } catch (err) {
      setCounterOpen(false);
      setCounterError(err instanceof Error ? err.message : 'Could not check the Daily Closure counter status.');
    }
  }, []);
  // EGRESS FIX (2026-08-15): replaced the 15s poll with visibilitychange
  // (catches "counter was opened/closed while I was on another tab", the
  // common case) plus a manual Refresh button on the banner below (catches
  // "counter changed on another device while I never left this tab").
  useEffect(() => {
    void refreshCounter();
    const refreshOnVisible = () => { if (!document.hidden) void refreshCounter(); };
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => document.removeEventListener('visibilitychange', refreshOnVisible);
  }, [refreshCounter]);

  useEffect(() => { loadCatalog('SNB').catch(() => {}); loadCatalog('VRSNB').catch(() => {}); }, [loadCatalog]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data, error: fetchError } = await supabase.from('bakery_walkin_bills').select('*').order('created_at', { ascending: false }).limit(30);
    if (!fetchError && data) setRecent((data as Record<string, unknown>[]).map(mapWalkinBill));
    setLoadingRecent(false);
  }, []);
  useEffect(() => { loadRecent().catch(() => {}); }, [loadRecent]);

  // FEATURE (2026-08-23): shared, robust dedup — see the comment on
  // PlanningTab's uniqueItems above for the full reasoning.
  const catalog = useMergedCatalogWithPrice();

  const filtered = useMemo(
    () => catalog.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [catalog, search],
  );

  const setQty = (item: { name: string; unit: 'pcs' | 'kg'; price: number }, value: number) => {
    const safe = clampQtyForUnit(value, item.unit);
    setCart(prev => {
      const next = { ...prev };
      if (safe <= 0) delete next[item.name];
      else next[item.name] = { itemName: item.name, unit: item.unit, price: item.price, quantity: safe };
      return next;
    });
  };

  const cartLines = Object.values(cart);
  const subtotal = Math.round(cartLines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
  const discountAmount = discountType === 'none' ? 0
    : discountType === 'percent' ? Math.round(subtotal * (Math.min(100, Math.max(0, Number(discountValue) || 0)) / 100) * 100) / 100
    : Math.round(Math.min(subtotal, Math.max(0, Number(discountValue) || 0)) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const resetCart = () => { setCart({}); setDiscountType('none'); setDiscountValue(''); setCustomerName(''); setCustomerMobile(''); };

  const saveBill = async () => {
    if (cartLines.length === 0) { setError('Add at least one item.'); return; }
    // Defense in depth: re-check right before saving, not just at the button
    // level, in case the counter got closed since the poll last ran.
    const status = await getPackingCounterStatus().catch(() => null);
    if (!status?.isOpen) {
      setCounterOpen(false);
      setError("Planner's Daily Closure counter is closed — open it from the Daily Closure tab before billing.");
      return;
    }
    setSaving(true); setError('');
    try {
      // BUG FIX: `Date.now().toString().slice(-8)` looked unique but is just
      // the last 8 digits of a monotonically increasing counter — it repeats
      // exactly every ~27.8 hours (10^8 ms), so a bakery billing daily would
      // eventually hit the bill_no UNIQUE constraint and fail to save. Use a
      // date prefix (for readability) + a random suffix (for uniqueness),
      // same convention as the Hosur order-number generator elsewhere in this file.
      const billNo = `WB-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const items: WalkinBillItem[] = cartLines.map(l => ({ itemName: l.itemName, unit: l.unit, price: l.price, quantity: l.quantity, lineTotal: Math.round(l.price * l.quantity * 100) / 100 }));
      const { data, error: insertError } = await supabase.from('bakery_walkin_bills').insert({
        bill_no: billNo, items, subtotal, discount_type: discountType, discount_value: Number(discountValue) || 0,
        discount_amount: discountAmount, total, payment_mode: paymentMode, cashier_name: currentUser?.displayName || 'Planner',
        customer_name: customerName.trim() || 'Walk-in Customer', customer_mobile: customerMobile.trim() || null,
      }).select().single();
      if (insertError || !data) throw new Error('Failed to save the bill — please try again.');
      const bill = mapWalkinBill(data as Record<string, unknown>);
      // BUG FIX (2026-08-09): "regular walk-in bills should also deduct
      // stock and show as 'walk in bill' in reports" — this bill used to
      // save purely as a money record with no link at all to the Closing
      // Stock pool, so items sold here silently never left the tracked
      // stock. Best-effort per line (mirrors submitDispatch's own philosophy
      // — a ledger hiccup must never block a sale that already happened),
      // allowed to go negative rather than ever blocking the bill.
      for (const line of items) {
        try {
          const result = await recordLeftoverMovement({
            itemName: line.itemName,
            unit: line.unit === 'pcs' ? 'pcs' : 'kg',
            delta: -Math.abs(line.quantity),
            businessDate: kolkataToday(),
            reason: 'dispatch',
            recordedBy: currentUser?.displayName || 'Planner',
            notes: `Walk-in Bill #${billNo}`,
          });
          if ('error' in result) console.error('[BillingTab] Closing Stock pool debit failed:', result.error);
        } catch (err) {
          console.error('[BillingTab] Closing Stock pool debit threw:', err);
        }
      }
      setLastBill(bill);
      resetCart();
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the bill.');
    } finally {
      setSaving(false);
    }
  };

  const cancelBill = async (bill: WalkinBillRow) => {
    if (!window.confirm(`Cancel bill ${bill.billNo}? This can't be undone.`)) return;
    const { error: updateError } = await supabase.from('bakery_walkin_bills').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', bill.id);
    if (!updateError) {
      // BUG FIX: cancelling a bill only ever flipped its status — the
      // stock deduction saveBill made for every line item (via
      // recordLeftoverMovement) was never reversed, so the Closing Stock
      // pool permanently showed less stock than actually exists for a
      // sale that got cancelled and never happened. Reverse it here with
      // the same best-effort philosophy saveBill's own deduction uses — a
      // ledger hiccup must never block the cancellation itself.
      for (const line of bill.items) {
        try {
          const result = await recordLeftoverMovement({
            itemName: line.itemName,
            unit: line.unit === 'pcs' ? 'pcs' : 'kg',
            delta: Math.abs(line.quantity),
            businessDate: kolkataToday(),
            reason: 'return',
            recordedBy: currentUser?.displayName || 'Planner',
            notes: `Cancelled Walk-in Bill #${bill.billNo}`,
          });
          if ('error' in result) console.error('[BillingTab] Closing Stock pool reversal on cancel failed:', result.error);
        } catch (err) {
          console.error('[BillingTab] Closing Stock pool reversal on cancel threw:', err);
        }
      }
      loadRecent();
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <ShoppingCart className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Sales</h2>
            <p className="text-xs font-bold text-muted-foreground font-body">For customers who walk in directly. Combined SNB + VRSNB catalog, deduplicated.</p>
          </div>
        </div>
      </div>

      {counterOpen === false && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{counterError || "Planner's Daily Closure counter is closed — open it from the Daily Closure tab before billing."}</span>
          <button
            type="button"
            onClick={() => { setRefreshingCounter(true); void refreshCounter().finally(() => setRefreshingCounter(false)); }}
            disabled={refreshingCounter}
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', refreshingCounter && 'animate-spin')} /> Check again
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3 card-base p-5">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search item</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </label>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-muted-foreground">No items match.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map(item => {
                const current = cart[item.name]?.quantity ?? 0;
                const step = item.unit === 'kg' ? 0.25 : 1;
                return (
                  <article key={item.name} className={cn('rounded-xl border p-3 transition-colors', current > 0 ? 'border-teal bg-primary/5' : 'border-border bg-muted/40')}>
                    <p className="text-sm font-black text-foreground">{item.name}</p>
                    <p className="text-xs font-bold text-muted-foreground">{invoiceMoney(item.price)} / {item.unit} · {item.category}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-card font-black text-foreground hover:bg-muted">-</button>
                      <input type="number" step={item.unit === 'pcs' ? 1 : 0.001} value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
                      <button onClick={() => setQty(item, current + step)} className="size-8 rounded-lg bg-primary font-black text-primary-foreground hover:opacity-90">+</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-3 card-base p-5">
          <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-primary" /><h3 className="font-display text-lg font-bold text-foreground">Cart</h3></div>
          {cartLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-bold text-muted-foreground">No items added</div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto">
              {cartLines.map(line => (
                <div key={line.itemName} className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-foreground">{line.itemName}</p>
                    <p className="text-[11px] font-bold text-muted-foreground">{line.quantity} {line.unit} × {invoiceMoney(line.price)} = {invoiceMoney(line.price * line.quantity)}</p>
                  </div>
                  <button onClick={() => setQty({ name: line.itemName, unit: line.unit, price: line.price }, 0)}><X className="size-3.5 text-destructive" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold" />
            <input value={customerMobile} onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Mobile (optional)" inputMode="numeric" className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold" />
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5"><Percent className="size-3.5 text-muted-foreground" /><span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Discount</span></div>
            <div className="flex gap-1.5">
              {(['none', 'percent', 'amount'] as const).map(t => (
                <button key={t} onClick={() => { setDiscountType(t); if (t === 'none') setDiscountValue(''); }} className={cn('flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold', discountType === t ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
                  {t === 'none' ? 'None' : t === 'percent' ? '%' : '₹'}
                </button>
              ))}
            </div>
            {discountType !== 'none' && (
              <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-bold" />
            )}
          </div>

          <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-sm">
            <div className="flex justify-between font-bold text-muted-foreground"><span>Subtotal</span><span>{invoiceMoney(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between font-bold text-red-600"><span>Discount</span><span>- {invoiceMoney(discountAmount)}</span></div>}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-black text-foreground"><span>Total</span><span>{invoiceMoney(total)}</span></div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Payment Mode</p>
            <div className="flex gap-1.5">
              {WALKIN_PAYMENT_MODES.map(m => (
                <button key={m.key} onClick={() => setPaymentMode(m.key)} className={cn('flex-1 rounded-lg px-2 py-1.5 text-xs font-bold', paymentMode === m.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>{m.label}</button>
              ))}
            </div>
          </div>

          {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}

          <button onClick={saveBill} disabled={saving || cartLines.length === 0 || counterOpen === false} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl cafe-gradient text-sm font-black text-white shadow-teal disabled:opacity-40">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />} Save Bill{cartLines.length > 0 ? ` (${invoiceMoney(total)})` : ''}
          </button>

          {lastBill && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
              <p className="text-xs font-black text-teal-800">Bill {lastBill.billNo} saved — {invoiceMoney(lastBill.total)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => printWalkinBill(lastBill, 'thermal')} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700">
                  <Printer className="size-3.5" /> Thermal
                </button>
                <button onClick={() => printWalkinBill(lastBill, 'a4')} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700">
                  <Printer className="size-3.5" /> A4
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-black text-foreground">Recent Bills</p>
          <button
            type="button"
            title="Refresh recent bills"
            onClick={() => void loadRecent()}
            disabled={loadingRecent}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', loadingRecent && 'animate-spin')} /> Refresh
          </button>
        </div>
        {loadingRecent ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : recent.length === 0 ? (
          <div className="p-4"><EmptyState text="No walk-in bills yet." /></div>
        ) : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {recent.map(bill => (
              <div key={bill.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    #{bill.billNo}
                    {bill.status === 'cancelled' && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">Cancelled</span>}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground">{new Date(bill.createdAt).toLocaleString('en-IN')} · {bill.items.length} item{bill.items.length === 1 ? '' : 's'} · {bill.paymentMode.toUpperCase()} · {bill.cashierName || '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">{invoiceMoney(bill.total)}</span>
                  <button onClick={() => printWalkinBill(bill, 'thermal')} className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted" title="Print thermal"><Printer className="size-3.5" /></button>
                  <button onClick={() => printWalkinBill(bill, 'a4')} className="rounded-lg border border-border bg-card px-2 py-1.5 text-[10px] font-black text-muted-foreground hover:bg-muted" title="Print A4">A4</button>
                  {bill.status === 'active' && (
                    <button onClick={() => cancelBill(bill)} className="rounded-lg border border-destructive/30 bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20" title="Cancel bill"><Trash2 className="size-3.5" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// FEATURE (2026-08-09): "create a new 'Sample Bill' sub-tab where a bill is
// created for a customer before they pay — with name/number fields, ability
// to apply a discount for the entire tab, same invoice format as Dispatch;
// after creating the sample bill there should be a 'mark as paid' field —
// only once marked paid should stock be deducted and it should show in
// reports as 'sales online'". Reuses the Dispatch tab's invoice
// infrastructure (dispatchInvoice.ts) purely for its format + storage —
// there's no bakery_orders/dispatch_log involved here, just a
// dispatch_invoices row created 'unpaid' and flipped to 'paid' later.
const SAMPLE_BILL_NOTE = 'Sample Bill';

function SampleBillTab() {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, { itemName: string; unit: 'pcs' | 'kg'; price: number; quantity: number }>>({});
  const [discountPct, setDiscountPct] = useState('0');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState<DispatchInvoiceRecord | null>(null);
  const [recent, setRecent] = useState<DispatchInvoiceRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const [counterOpen, setCounterOpen] = useState<boolean | null>(null);
  const [counterError, setCounterError] = useState('');
  const [refreshingCounter, setRefreshingCounter] = useState(false);
  const refreshCounter = useCallback(async () => {
    try {
      const status = await getPackingCounterStatus();
      setCounterOpen(status.isOpen);
      setCounterError('');
    } catch (err) {
      setCounterOpen(false);
      setCounterError(err instanceof Error ? err.message : 'Could not check the Daily Closure counter status.');
    }
  }, []);
  // EGRESS FIX (2026-08-15): replaced the 15s poll with visibilitychange
  // (catches "counter was opened/closed while I was on another tab", the
  // common case) plus a manual Refresh button on the banner below (catches
  // "counter changed on another device while I never left this tab").
  useEffect(() => {
    void refreshCounter();
    const refreshOnVisible = () => { if (!document.hidden) void refreshCounter(); };
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => document.removeEventListener('visibilitychange', refreshOnVisible);
  }, [refreshCounter]);

  useEffect(() => { loadCatalog('SNB').catch(() => {}); loadCatalog('VRSNB').catch(() => {}); }, [loadCatalog]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const to = new Date(); to.setDate(to.getDate() + 1);
      const from = new Date(); from.setDate(from.getDate() - 90);
      const all = await listDispatchInvoices({ fromDate: from.toISOString(), toDate: to.toISOString() });
      setRecent(all.filter(r => r.notes === SAMPLE_BILL_NOTE));
    } catch { /* best-effort */ }
    setLoadingRecent(false);
  }, []);
  useEffect(() => { loadRecent().catch(() => {}); }, [loadRecent]);

  // FEATURE (2026-08-23): shared, robust dedup — see the comment on
  // PlanningTab's uniqueItems above for the full reasoning.
  const catalog = useMergedCatalogWithPrice();

  const filtered = useMemo(
    () => catalog.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [catalog, search],
  );

  const setQty = (item: { name: string; unit: 'pcs' | 'kg'; price: number }, value: number) => {
    const safe = clampQtyForUnit(value, item.unit);
    setCart(prev => {
      const next = { ...prev };
      if (safe <= 0) delete next[item.name];
      else next[item.name] = { itemName: item.name, unit: item.unit, price: item.price, quantity: safe };
      return next;
    });
  };

  const cartLines = Object.values(cart);
  const subtotal = Math.round(cartLines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
  const pct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const discountAmount = Math.round(subtotal * (pct / 100) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const resetForm = () => { setCart({}); setDiscountPct('0'); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); };

  const createSampleBill = async () => {
    if (cartLines.length === 0) { setError('Add at least one item.'); return; }
    if (!customerName.trim()) { setError("Enter the customer's name."); return; }
    if (!customerPhone.trim()) { setError("Enter the customer's mobile number."); return; }
    const status = await getPackingCounterStatus().catch(() => null);
    if (!status?.isOpen) {
      setCounterOpen(false);
      setError("Planner's Daily Closure counter is closed — open it from the Daily Closure tab before billing.");
      return;
    }
    setSaving(true); setError('');
    try {
      const items: DispatchInvoiceItem[] = cartLines.map(l => ({ itemName: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice: l.price, lineTotal: Math.round(l.price * l.quantity * 100) / 100 }));
      const record = await saveDispatchInvoice({
        scope: 'SNB',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim() || null,
        dispatchedBy: currentUser?.displayName || 'Planner',
        items,
        discountPct: pct,
        status: 'unpaid',
        notes: SAMPLE_BILL_NOTE,
      });
      setLastBill(record);
      resetForm();
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the sample bill.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (record: DispatchInvoiceRecord) => {
    setMarkingPaidId(record.id);
    try {
      const result = await markDispatchInvoicePaid(record, currentUser?.displayName || 'Planner');
      if ('error' in result) { setError(result.error); return; }
      if (lastBill?.id === record.id) setLastBill({ ...record, status: 'paid', paidAt: new Date().toISOString() });
      loadRecent();
    } finally {
      setMarkingPaidId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <Receipt className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Sample Bill</h2>
            <p className="text-xs font-bold text-muted-foreground font-body">Prepare a bill before the customer pays. Stock is only deducted once it's marked paid — appears in reports as "Sales Online".</p>
          </div>
        </div>
      </div>

      {counterOpen === false && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{counterError || "Planner's Daily Closure counter is closed — open it from the Daily Closure tab before billing."}</span>
          <button
            type="button"
            onClick={() => { setRefreshingCounter(true); void refreshCounter().finally(() => setRefreshingCounter(false)); }}
            disabled={refreshingCounter}
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', refreshingCounter && 'animate-spin')} /> Check again
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3 card-base p-5">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search item</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </label>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-muted-foreground">No items match.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map(item => {
                const current = cart[item.name]?.quantity ?? 0;
                const step = item.unit === 'kg' ? 0.25 : 1;
                return (
                  <article key={item.name} className={cn('rounded-xl border p-3 transition-colors', current > 0 ? 'border-amber-400 bg-amber-50' : 'border-border bg-muted/40')}>
                    <p className="text-sm font-black text-foreground">{item.name}</p>
                    <p className="text-xs font-bold text-muted-foreground">{invoiceMoney(item.price)} / {item.unit} · {item.category}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-card font-black text-foreground hover:bg-muted">-</button>
                      <input type="number" step={item.unit === 'pcs' ? 1 : 0.001} value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
                      <button onClick={() => setQty(item, current + step)} className="size-8 rounded-lg bg-amber-500 font-black text-white hover:opacity-90">+</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-3 card-base p-5">
          <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-amber-600" /><h3 className="font-display text-lg font-bold text-foreground">Cart</h3></div>
          {cartLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-bold text-muted-foreground">No items added</div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-auto">
              {cartLines.map(line => (
                <div key={line.itemName} className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-foreground">{line.itemName}</p>
                    <p className="text-[11px] font-bold text-muted-foreground">{line.quantity} {line.unit} × {invoiceMoney(line.price)} = {invoiceMoney(line.price * line.quantity)}</p>
                  </div>
                  <button onClick={() => setQty({ name: line.itemName, unit: line.unit, price: line.price }, 0)}><X className="size-3.5 text-destructive" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              <Percent className="size-3.5" /> Discount for the whole bill
            </label>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-bold" />
              <span className="text-xs font-bold text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Customer Name *</span>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm font-bold" placeholder="e.g. Ramesh Kumar" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Mobile Number *</span>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm font-bold" placeholder="e.g. 9876543210" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Address</span>
              <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm font-bold" placeholder="Optional" />
            </label>
          </div>

          <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-sm">
            <div className="flex justify-between font-bold text-muted-foreground"><span>Subtotal</span><span>{invoiceMoney(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between font-bold text-red-600"><span>Discount ({pct}%)</span><span>- {invoiceMoney(discountAmount)}</span></div>}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-black text-foreground"><span>Total</span><span>{invoiceMoney(total)}</span></div>
          </div>

          {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}

          <button onClick={createSampleBill} disabled={saving || cartLines.length === 0 || counterOpen === false} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-black text-white shadow-sm hover:bg-amber-700 disabled:opacity-40">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />} Create Sample Bill{cartLines.length > 0 ? ` (${invoiceMoney(total)})` : ''}
          </button>

          {lastBill && (
            <div className={cn('rounded-xl border p-3', lastBill.status === 'paid' ? 'border-teal-200 bg-teal-50' : 'border-amber-200 bg-amber-50')}>
              <p className={cn('text-xs font-black', lastBill.status === 'paid' ? 'text-teal-800' : 'text-amber-800')}>
                Sample Bill {lastBill.invoiceNo} — {invoiceMoney(lastBill.total)} · {lastBill.status === 'paid' ? 'Paid' : 'Awaiting Payment'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => printDispatchInvoice(lastBill, 'thermal')} className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Thermal</button>
                <button onClick={() => printDispatchInvoice(lastBill, 'a4')} className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> A4</button>
                {lastBill.status === 'unpaid' && (
                  <button onClick={() => markPaid(lastBill)} disabled={markingPaidId === lastBill.id} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                    {markingPaidId === lastBill.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Mark as Paid
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-black text-foreground">Recent Sample Bills</p>
          <button type="button" onClick={() => void loadRecent()} disabled={loadingRecent} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', loadingRecent && 'animate-spin')} /> Refresh
          </button>
        </div>
        {loadingRecent ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : recent.length === 0 ? (
          <div className="p-4"><EmptyState text="No sample bills yet." /></div>
        ) : (
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {recent.map(bill => (
              <div key={bill.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    {bill.invoiceNo} — {bill.customerName}
                    <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black', bill.status === 'paid' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')}>
                      {bill.status === 'paid' ? 'Paid' : 'Awaiting Payment'}
                    </span>
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground">{new Date(bill.createdAt).toLocaleString('en-IN')} · {bill.items.length} item{bill.items.length === 1 ? '' : 's'} · {bill.customerPhone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">{invoiceMoney(bill.total)}</span>
                  <button onClick={() => printDispatchInvoice(bill, 'thermal')} className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted" title="Print thermal"><Printer className="size-3.5" /></button>
                  {bill.status === 'unpaid' && (
                    <button onClick={() => markPaid(bill)} disabled={markingPaidId === bill.id} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                      {markingPaidId === bill.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Sum of everything already dispatched to one specific branch for one row,
// so per-branch progress can be shown/checked independently of other branches.
function branchDispatchedForRow(row: ProductionRow, branch: Branch, orders: BakeryOrder[]): number {
  // BUG FIX (audit 2026-08-26): this used to filter the ORDER by
  // targetBranch === branch first — for a cross-branch merged order
  // (target_branch is just whichever source order survived as primary,
  // e.g. 'VRSNB'), that filter drops the order entirely before ever
  // looking at its dispatchLog, even though each dispatch entry already
  // carries its own accurate branch. Result: dispatched-so-far for the
  // secondary branch (e.g. SNB) would always read 0, even after real
  // dispatches to SNB had already happened. Filter by contributing orders
  // only, then check each dispatch entry's OWN branch field instead.
  return orders
    .filter(o => row.contributingOrderIds.includes(o.id))
    .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra && d.branch === branch).reduce((s2, d) => s2 + d.quantity, 0), 0);
}

// Same idea as branchDispatchedForRow, but for the "Planned" bucket (Planning
// tab batches) — these orders have no fixed branch, so we track their
// dispatch progress by order id instead of by targetBranch.
// Extracts every Hosur shop-order id tagged onto this row's contributing
// bakery orders (HOSUR_ORDER_ID / HOSUR_ORDER_IDS in notes — see
// mergeOrdersForStore's collectHosurIds for how these get written/merged).
function collectHosurOrderIds(row: ProductionRow, orders: BakeryOrder[]): string[] {
  // BUG FIX (audit 2026-08-26): this used to require targetBranch ===
  // 'Hosur' — but mergeOrdersForStore already correctly preserves the
  // HOSUR_ORDER_IDS tag in notes from every contributing order, even when
  // the merge's surviving primary order isn't itself Hosur-targeted (a
  // date-only cross-branch merge could combine a Hosur order with a
  // VRSNB/SNB one). Checking the tag's actual presence in notes, rather
  // than a branch field a merged order may not carry, means this doesn't
  // silently drop shop-level tracking for a merged order.
  const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id) && /HOSUR_ORDER_IDS?:/.test(o.notes ?? ''));
  const ids = new Set<string>();
  for (const o of contributing) {
    const text = String(o.notes ?? '');
    const plural = text.match(/HOSUR_ORDER_IDS:([^|]+)/);
    if (plural?.[1]) { plural[1].split(',').map(s => s.trim()).filter(Boolean).forEach(id => ids.add(id)); continue; }
    const singular = text.match(/HOSUR_ORDER_ID:([^|]+)/);
    if (singular?.[1]) ids.add(singular[1].trim());
  }
  return Array.from(ids);
}

// NEW: per-shop breakdown for a Hosur-filtered dispatch row — joins back to
// the original hosur_orders/hosur_order_items via the tag above, so instead
// of only a branch-wide total the planner sees exactly which shop asked for
// how much of this item (e.g. "Shop A: 5 egg puffs requested, 3 sent").
function HosurShopBreakdown({ row, orders }: { row: ProductionRow; orders: BakeryOrder[] }) {
  const hosurOrderIds = useMemo(() => collectHosurOrderIds(row, orders), [row, orders]);
  // BUG FIX: `orders` is a brand-new array reference every ~15s poll, and
  // `row` is rebuilt fresh by computeProductionRows on every render, so
  // `hosurOrderIds` (a useMemo keyed on those unstable references) also got
  // a new array identity constantly even when its actual contents never
  // changed — re-running the effect below and re-querying Supabase every
  // poll tick while this row was visible. Depend on a stable joined-string
  // key instead so the effect only re-fires when the ids genuinely change.
  const hosurOrderIdsKey = hosurOrderIds.join(',');
  const [shops, setShops] = useState<{ shopName: string; requested: number; dispatched: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (hosurOrderIds.length === 0) { setShops([]); return; }
    (async () => {
      const [{ data: ordersData }, { data: itemsData }] = await Promise.all([
        supabase.from('hosur_orders').select('id, shop_name').in('id', hosurOrderIds),
        supabase.from('hosur_order_items').select('order_id, item_name, quantity, dispatched_quantity').in('order_id', hosurOrderIds),
      ]);
      if (cancelled) return;
      const shopNameById = new Map<string, string>(
        ((ordersData ?? []) as Record<string, unknown>[]).map((o) => [o.id as string, o.shop_name as string]),
      );
      const byShop = new Map<string, { requested: number; dispatched: number }>();
      for (const item of (itemsData ?? []) as Record<string, unknown>[]) {
        if (!sameItem(String(item.item_name ?? ''), row.itemName)) continue;
        const shopName: string = shopNameById.get(item.order_id as string) ?? 'Unknown shop';
        const current = byShop.get(shopName) ?? { requested: 0, dispatched: 0 };
        current.requested += Number(item.quantity ?? 0);
        current.dispatched += Number(item.dispatched_quantity ?? 0);
        byShop.set(shopName, current);
      }
      setShops(Array.from(byShop.entries()).map(([shopName, v]) => ({ shopName, ...v })).sort((a, b) => a.shopName.localeCompare(b.shopName)));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // keyed on the stable joined string, not the unstable array reference.
  }, [hosurOrderIdsKey, row.itemName]);

  if (hosurOrderIds.length === 0) return null;
  if (shops === null) return <p className="mt-2 text-[11px] font-bold text-muted-foreground">Loading shop breakdown…</p>;
  if (shops.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-2.5">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-700">By Shop</p>
      <div className="space-y-1">
        {shops.map(s => (
          <div key={s.shopName} className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
            <span>{s.shopName}</span>
            <span>{qtyFmt(s.requested)} {row.unit} requested{s.dispatched > 0 ? ` · ${qtyFmt(s.dispatched)} ${row.unit} sent` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// True per-order-card check (not the batch-level collectHosurOrderIds
// above) — used when a dispatch must be attributed to exactly ONE shop's
// hosur_orders row, not "any shop tagged onto this production batch."
function bakeryOrderCoversHosurShopOrder(order: BakeryOrder, hosurOrderId: string): boolean {
  const text = String(order.notes ?? '');
  const plural = text.match(/HOSUR_ORDER_IDS:([^|]+)/);
  if (plural?.[1]) return plural[1].split(',').map(s => s.trim()).includes(hosurOrderId);
  const singular = text.match(/HOSUR_ORDER_ID:([^|]+)/);
  return singular?.[1]?.trim() === hosurOrderId;
}

interface HosurShopOrderCard {
  orderId: string;
  orderNumber: string;
  shopName: string;
  shopId: string | null;
  shopPhone: string | null;
  // ROOT-CAUSE FIX (2026-08-09, "cancel item throws P0001 Order item not
  // found"): `itemName` here is the *display* name after sameItem() groups
  // spelling variants under one canonical row name (see below) — it can
  // legitimately differ from what's actually stored in
  // hosur_order_items.item_name. cancel_hosur_order_item_remaining_secure
  // does an EXACT `item_name = p_item_name` match against that raw column,
  // so passing the display name through to the RPC failed whenever the two
  // diverged. `rawItemName` carries the untouched hosur_order_items value
  // specifically so cancel calls always match a real row.
  items: { itemName: string; rawItemName: string; unit: string; requested: number; dispatched: number; cancelled: number; cancellationReason: string | null }[];
}

// Shop-centric Hosur dispatch view: one card per shop ORDER (not just shop
// name — a shop can have more than one order in flight), with every item
// that order contains listed underneath, mirroring the same order-card
// pattern already used in the Hosur Shops & Billing → Dispatch queue so both
// screens feel consistent. Batches a single query across every row's Hosur
// order ids rather than one query per item.
function useHosurShopOrders(rows: ProductionRow[], orders: BakeryOrder[]) {
  const hosurOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) collectHosurOrderIds(row, orders).forEach(id => ids.add(id));
    return Array.from(ids);
  }, [rows, orders]);
  const idsKey = hosurOrderIds.join(',');
  const [shopOrders, setShopOrders] = useState<HosurShopOrderCard[] | null>(null);
  // BUG FIX (audit): the effect below only re-fires when the SET of Hosur
  // order ids changes — but sending a shop's order changes those same ids'
  // dispatched_quantity, not the set itself, so the just-sent card kept
  // showing pre-dispatch numbers until an unrelated re-render. reloadTick
  // gives callers (sendCard) an explicit way to force a refetch.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (hosurOrderIds.length === 0) { setShopOrders([]); return; }
    (async () => {
      const [{ data: ordersData }, { data: itemsData }] = await Promise.all([
        supabase.from('hosur_orders').select('id, order_number, shop_name, shop_id').in('id', hosurOrderIds),
        supabase.from('hosur_order_items').select('order_id, item_name, unit, quantity, dispatched_quantity, cancelled_quantity, cancellation_reason').in('order_id', hosurOrderIds),
      ]);
      if (cancelled) return;
      // Invoice needs the shop's phone number ("if it's Hosur mention the
      // shop name and number") — hosur_orders itself only stores shop_id, so
      // resolve phone via a second lookup against hosur_shops.
      const shopIds = Array.from(new Set(((ordersData ?? []) as Record<string, unknown>[]).map(o => o.shop_id as string | null).filter((id): id is string => !!id)));
      const phoneByShopId = new Map<string, string>();
      if (shopIds.length > 0) {
        const { data: shopsData } = await supabase.from('hosur_shops').select('id, whatsapp_number').in('id', shopIds);
        for (const s of (shopsData ?? []) as Record<string, unknown>[]) {
          phoneByShopId.set(s.id as string, String(s.whatsapp_number ?? ''));
        }
      }
      if (cancelled) return;
      const metaById = new Map<string, { orderNumber: string; shopName: string; shopId: string | null; shopPhone: string | null }>(
        ((ordersData ?? []) as Record<string, unknown>[]).map((o) => {
          const shopId = (o.shop_id as string | null) ?? null;
          return [o.id as string, {
            orderNumber: String(o.order_number ?? ''), shopName: String(o.shop_name ?? ''),
            shopId, shopPhone: shopId ? (phoneByShopId.get(shopId) || null) : null,
          }];
        }),
      );
      const byOrder = new Map<string, { itemName: string; rawItemName: string; unit: string; requested: number; dispatched: number; cancelled: number; cancellationReason: string | null }[]>();
      for (const item of (itemsData ?? []) as Record<string, unknown>[]) {
        const rawName = String(item.item_name ?? '');
        // Only surface items that belong to the currently-visible row set
        // (e.g. only "active" or only "dispatched" items, matching whichever
        // sub-tab is open) — and display using the row's canonical name so
        // spelling variants across shops collapse into one line.
        const matchedRow = rows.find(r => sameItem(r.itemName, rawName));
        if (!matchedRow) continue;
        const orderId = item.order_id as string;
        const list = byOrder.get(orderId) ?? [];
        list.push({
          itemName: matchedRow.itemName,
          rawItemName: rawName,
          unit: String(item.unit ?? matchedRow.unit ?? 'pcs'),
          requested: Number(item.quantity ?? 0),
          dispatched: Number(item.dispatched_quantity ?? 0),
          cancelled: Number(item.cancelled_quantity ?? 0),
          cancellationReason: (item.cancellation_reason as string | null) ?? null,
        });
        byOrder.set(orderId, list);
      }
      const cards: HosurShopOrderCard[] = [];
      for (const [orderId, items] of byOrder) {
        const meta = metaById.get(orderId);
        if (!meta || items.length === 0) continue;
        cards.push({
          orderId, orderNumber: meta.orderNumber, shopName: meta.shopName,
          shopId: meta.shopId, shopPhone: meta.shopPhone,
          items: items.sort((a, b) => a.itemName.localeCompare(b.itemName)),
        });
      }
      cards.sort((a, b) => a.shopName.localeCompare(b.shopName));
      setShopOrders(cards);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the
    // stable joined id string (plus an explicit manual-refresh counter), not
    // the unstable rows/orders array references.
  }, [idsKey, reloadTick]);

  return { shopOrders, reload: () => setReloadTick(t => t + 1) };
}

// FEATURE (2026-08-07): "Sometimes the planner will dispatch additional
// items from the requested items" — a shared, reusable mini-form for adding
// an item a branch/shop did NOT request (or more of an item than was ever
// requested) into this session's pending dispatch. Every item added here is
// tagged isExtra=true once it's actually dispatched, which:
//   - shows up in the Closing Stock Movement Log/Daily Report tagged
//     "EXTRA (non-requested item)" (see submitDispatch's extraNote), and
//   - is exported in the Dispatch Excel report's own Type column (see
//     DispatchTab's exportRows / dispatch log export below).
// WORKFLOW CHANGE (2026-08-08): "when we add an extra item it should
// display in To Dispatch sub tab" — this used to send the moment "Send" was
// clicked, straight to branch_incoming with no review step. It now only
// stages the item into the parent's pending list (onAdd) so it shows up
// right alongside the normal requested items, and only actually goes out
// once the planner reviews everything together in DispatchReviewModal and
// confirms — same as every other line here.
function ExtraItemDispatchForm({ contextLabel, suggestions, onAdd }: {
  contextLabel: string;
  // BUG FIX/FEATURE (audit): this field used to be bare free text with zero
  // suggestions. Planner asked for branch-scoped suggestions — VRSNB items
  // on the VRSNB panel, SNB items on the SNB panel — so a typo can't quietly
  // create a name that never matches the branch's real catalogue. Free text
  // is still fully allowed (an empty/undefined list just means no dropdown).
  suggestions?: MergedCatalogItem[];
  onAdd: (item: { itemName: string; unit: 'kg' | 'pcs'; quantity: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<MergedCatalogItem | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<'kg' | 'pcs'>('kg');
  const [added, setAdded] = useState<string | null>(null);

  const add = () => {
    const trimmedName = name.trim();
    const amount = Number(qty);
    if (!trimmedName || !qty || amount <= 0) return;
    onAdd({ itemName: trimmedName, unit, quantity: amount });
    setAdded(`Added "${trimmedName}" (${amount} ${unit}) to the list below — dispatch it along with everything else when you're ready.`);
    setName(''); setSelectedSuggestion(null); setQty('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 hover:bg-amber-100"
      >
        <Plus className="size-3.5" /> Add an extra / non-requested item to {contextLabel}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Extra item — not requested by {contextLabel}</span>
        <button type="button" onClick={() => { setOpen(false); setAdded(null); }} className="text-[11px] font-bold text-amber-700 hover:underline">Close</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <ItemSearchPicker
          value={selectedSuggestion ? selectedSuggestion.name : name}
          onChange={(v) => { setName(v); setSelectedSuggestion(null); }}
          onSelect={(item) => { setSelectedSuggestion(item); setName(item.name); }}
          items={suggestions ?? []}
          placeholder={`Item name (${contextLabel})`}
        />
        <input value={qty} onChange={e => setQty(e.target.value)} type="number" min={0} placeholder="Qty" className="w-20 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold" />
        <select value={unit} onChange={e => setUnit(e.target.value as 'kg' | 'pcs')} className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs font-bold">
          <option value="kg">kg</option>
          <option value="pcs">pcs</option>
        </select>
        <button
          onClick={add}
          disabled={!name.trim() || !qty || Number(qty) <= 0}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {added && <p className="mt-1.5 text-[11px] font-bold text-teal-700">{added}</p>}
    </div>
  );
}

// The real "select a shop, edit its order, remove an item, send the whole
// shop's order in one go" workflow — replaces the old read-only By-Shop
// breakdown. Quantities default to what's actually available to send right
// now (the shared Closing Stock/leftover balance, which already reflects
// today's production plus any carryover — see the balance/leftover note in
// DispatchChecklistModal), so leftover no longer needs a separate manual
// "Use it" step: opening a shop's order already has it applied.
function HosurShopDispatchPanel({ rows, mode, orders, leftoverBalances, onDispatch, dispatchedBy, onDone }: {
  // `rows` must be the full Hosur-scoped row set (both fully- and
  // not-yet-fully-dispatched items), NOT pre-split by active/completed —
  // this component does its own per-CARD completion check below so a shop
  // moves to "Dispatched" based on its own order, not a shared item's
  // global status across every other shop.
  rows: ProductionRow[]; mode: 'active' | 'completed'; orders: BakeryOrder[];
  leftoverBalances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
  onDone: () => void;
}) {
  const { shopOrders, reload } = useHosurShopOrders(rows, orders);
  // BUG FIX: same case-sensitivity bug as displayItems in DispatchReviewModal
  // — this map's key was the row's own (first-seen) casing, but every
  // lookup used a raw order item's itemName, which can differ in case from
  // a different contributing order. A mismatch here silently set
  // skippedNoLink = true, meaning the item's Hosur dispatch just didn't
  // happen at all, with no error — normalizing both the key and every
  // lookup below fixes this.
  const rowsByName = useMemo(() => new Map(rows.map(r => [r.itemName.trim().toLowerCase(), r])), [rows]);
  const [shopSearch, setShopSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  // WORKFLOW CHANGE (2026-08-08): same review-before-dispatch treatment as
  // BranchFlatDispatchPanel — extra items stage per-card (keyed by orderId
  // since only one card is open at a time) instead of dispatching instantly,
  // and "Send" opens DispatchReviewModal instead of calling onDispatch.
  const [extraItemsByCard, setExtraItemsByCard] = useState<Record<string, { itemName: string; unit: 'kg' | 'pcs'; quantity: number }[]>>({});
  const addExtraItem = (orderId: string, item: { itemName: string; unit: 'kg' | 'pcs'; quantity: number }) => {
    setExtraItemsByCard(v => ({ ...v, [orderId]: [...(v[orderId] ?? []), item] }));
  };
  const removeExtraItem = (orderId: string, idx: number) => {
    setExtraItemsByCard(v => ({ ...v, [orderId]: (v[orderId] ?? []).filter((_, i) => i !== idx) }));
  };
  const [review, setReview] = useState<{ actions: PendingDispatchAction[]; card: HosurShopOrderCard; unders?: { itemName: string; unit: string; owed: number; typed: number; shortBy: number }[] } | null>(null);
  // FEATURE (2026-08-15): "I need the ability to send more than the ordered
  // quantity sometimes there will be less production." Previously any typed
  // quantity above what a shop still owed was silently capped (see the
  // preserved 2026-08-07 CRITICAL BUG FIX comment below) — the planner could
  // type 8.610 but the review modal, and the actual dispatch, only ever
  // used 8. That cap stays the *default* (accidental over-dispatch should
  // still never happen silently), but it's no longer absolute: when the
  // typed quantity exceeds what's owed, sending stops here and shows exactly
  // which items and by how much, requiring one explicit confirm click before
  // the excess is included. Once confirmed, the excess is sent the same way
  // a manually-added extra item already is (isExtra: true) — same ledger
  // tagging, same "EXTRA (non-requested item)" notes — just auto-populated
  // from the quantity box instead of the separate extra-item form below.
  const [overOrderPrompt, setOverOrderPrompt] = useState<{
    card: HosurShopOrderCard;
    overs: { itemName: string; unit: string; owed: number; typed: number; extra: number }[];
  } | null>(null);
  const [underQtyPrompt, setUnderQtyPrompt] = useState<{
    card: HosurShopOrderCard;
    unders: { itemName: string; unit: string; owed: number; typed: number; shortBy: number }[];
  } | null>(null);
  const [underQtyBusy, setUnderQtyBusy] = useState(false);

  const availableFor = (itemName: string) => Math.max(0, leftoverBalances.get(closingStockItemSlug(itemName))?.balance ?? 0);
  // BUG FIX (2026-08-09): "we are unable to remove the orders from the hosur
  // shop... need to remove that item so we can dispatch the rest" — an item
  // that genuinely can't be fulfilled (production issue) had no way to be
  // excluded, so it sat at requested > dispatched forever and the whole shop
  // card could never reach "Dispatched". cancelItemRemaining below lets the
  // planner permanently cancel what's left of one item (with a required
  // reason), and every remaining/complete calculation here now subtracts
  // `cancelled` the same way it already subtracts `dispatched`.
  const remainingFor = (item: HosurShopOrderCard['items'][number]) =>
    Math.max(0, Math.round((item.requested - item.dispatched - item.cancelled) * 100) / 100);

  const openCard = (card: HosurShopOrderCard) => {
    setSelectedOrderId(card.orderId);
    const draft: Record<string, string> = {};
    for (const item of card.items) {
      const remaining = remainingFor(item);
      const suggested = Math.round(Math.min(remaining, availableFor(item.itemName)) * 100) / 100;
      draft[item.itemName] = String(suggested);
    }
    setQtyDraft(draft);
    setResult(null);
    setOverOrderPrompt(null);
    // BUG FIX (2026-08-07): force a fresh fetch of this shop's dispatched
    // totals the moment its card opens, not just after a send succeeds.
    // Live evidence: the same item got sent to the same shop 2-3 times in a
    // row within seconds of each other, pushing dispatched_quantity well
    // past what was ever requested (e.g. 30 sent against 10 ordered) —
    // consistent with the card being reopened before the previous send's
    // reload had landed, still suggesting the full original amount instead
    // of 0. This narrows that staleness window; the hard per-item cap in
    // sendCard below is what actually makes over-dispatch impossible.
    reload();
  };
  const cancel = () => { setSelectedOrderId(null); setQtyDraft({}); setResult(null); setOverOrderPrompt(null); };
  // "Remove" only zeroes this batch's quantity draft — the item is still
  // owed and will keep blocking the card from ever showing as Dispatched.
  // Use cancelItemRemaining for a permanent, reason-required cancellation.
  const removeItem = (itemName: string) => setQtyDraft(v => ({ ...v, [itemName]: '0' }));
  const [cancelPromptItem, setCancelPromptItem] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  // `itemName` (canonical/display name, used for UI state keys and the
  // confirmation message) and `rawItemName` (the exact hosur_order_items
  // value) are deliberately separate — see the HosurShopOrderCard comment
  // above. Only rawItemName is safe to send to the RPC's exact-match lookup.
  const cancelItemRemaining = async (card: HosurShopOrderCard, itemName: string, rawItemName: string) => {
    if (!cancelReason.trim()) { setResult({ ok: false, message: 'Enter a reason before cancelling this item.' }); return; }
    setCancelBusy(true);
    const { error } = await supabase.rpc('cancel_hosur_order_item_remaining_secure', {
      p_order_id: card.orderId, p_item_name: rawItemName, p_reason: cancelReason.trim(),
    });
    setCancelBusy(false);
    if (error) { setResult({ ok: false, message: error.message }); return; }
    setCancelPromptItem(null);
    setCancelReason('');
    setResult({ ok: true, message: `"${itemName}" won't be sent to ${card.shopName} — marked cancelled and recorded in reports.` });
    reload();
  };

  // WORKFLOW CHANGE (2026-08-08): "when we select the item and click on
  // dispatch it should open the checklist... I should also get the invoice."
  // This used to call onDispatch immediately per item; it now only builds
  // the pending action list and opens DispatchReviewModal — that modal is
  // the sole place submitDispatch actually runs, on explicit confirm.
  // Pure builder, no state writes — called once to detect (includeExtra:
  // false) and again to actually build for review once confirmed
  // (includeExtra: true). `overs` lists every item where the typed quantity
  // exceeds what's still owed, whether or not includeExtra is set, so the
  // caller can always tell whether a confirmation step is needed.
  const buildActionsForCard = (card: HosurShopOrderCard, includeExtra: boolean) => {
    const actions: PendingDispatchAction[] = [];
    let skippedNoLink = false;
    const overs: { itemName: string; unit: string; owed: number; typed: number; extra: number }[] = [];
    // FEATURE (2026-08-24): "under-qty confirmation" — mirrors the overs
    // pattern right above (which already exists for the opposite case).
    // Only items where something was actually typed (typed > 0) count —
    // an item left at 0 just isn't being sent this round, that's not an
    // under-delivery needing confirmation.
    const unders: { itemName: string; unit: string; owed: number; typed: number; shortBy: number }[] = [];
    const anchorOrderId = orders.find(o => bakeryOrderCoversHosurShopOrder(o, card.orderId))?.id ?? null;
    for (const item of card.items) {
      // CRITICAL BUG FIX (2026-08-07, preserved) + FEATURE (2026-08-15):
      // the order-linked portion is still hard-capped at this item's true
      // remaining balance (requested − already dispatched) — dispatching
      // more than a shop *ordered* against its own order record should
      // never silently happen. Anything typed beyond that is real, but it's
      // an over-delivery, not order fulfillment, so it's tracked separately
      // below as an auto-generated extra item, only once confirmed.
      const remaining = remainingFor(item);
      const typed = Number(qtyDraft[item.itemName] || 0);
      const qty = Math.min(typed, remaining);
      const extraAmount = Math.max(0, Math.round((typed - remaining) * 100) / 100);
      if (extraAmount > 0.01) overs.push({ itemName: item.itemName, unit: item.unit, owed: remaining, typed, extra: extraAmount });
      if (typed > 0.001 && typed < remaining - 0.01) unders.push({ itemName: item.itemName, unit: item.unit, owed: remaining, typed, shortBy: Math.round((remaining - typed) * 100) / 100 });
      if (qty > 0.001) {
        const row = rowsByName.get(item.itemName.trim().toLowerCase());
        if (!row) { skippedNoLink = true; }
        else {
          const targetEntries = orders.filter(o => row.contributingOrderIds.includes(o.id) && bakeryOrderCoversHosurShopOrder(o, card.orderId));
          if (targetEntries.length === 0) { skippedNoLink = true; }
          else {
            const split = autoSplitForItem(targetEntries, row.itemName, qty);
            for (const order of targetEntries) {
              const orderItem = order.items.find(i => sameItem(i.itemName, row.itemName));
              const orderQty = split[order.id] ?? 0;
              if (!orderItem || orderQty <= 0) continue;
              actions.push({
                orderId: order.id, itemName: orderItem.itemName, quantity: orderQty, unit: orderItem.dispatchUnit || 'kg',
                dispatchEntryId: getId(`${order.id}:${row.itemName}:${card.orderId}`), targetHosurOrderId: card.orderId,
              });
            }
          }
        }
      }
      if (includeExtra && extraAmount > 0.001) {
        if (!anchorOrderId) skippedNoLink = true;
        else {
          actions.push({
            orderId: anchorOrderId, itemName: item.itemName, quantity: extraAmount, unit: item.unit === 'pcs' ? 'pcs' : 'kg',
            dispatchEntryId: getId(`extra-auto:${card.orderId}:${item.itemName}`), targetHosurOrderId: card.orderId, isExtra: true,
          });
        }
      }
    }
    return { actions, overs, unders, skippedNoLink, anchorOrderId };
  };

  const finalizeReview = (card: HosurShopOrderCard, includeExtra: boolean) => {
    const { actions, unders, skippedNoLink, anchorOrderId } = buildActionsForCard(card, includeExtra);
    const extras = extraItemsByCard[card.orderId] ?? [];
    if (extras.length > 0) {
      // BUG FIX (2026-08-08 audit): same silent-drop issue as
      // BranchFlatDispatchPanel — without a linked bakery_orders row, extra
      // items had nowhere to attach and used to just vanish with a generic
      // error. Should be rare for a Hosur shop card (it only exists because
      // a linked order was created), but fail loudly instead of silently.
      if (!anchorOrderId) {
        setResult({ ok: false, message: `Can't send extra items — no linked order found for ${card.shopName}'s order. Refresh and try again.` });
        return;
      }
      for (const [idx, extra] of extras.entries()) {
        actions.push({
          orderId: anchorOrderId, itemName: extra.itemName, quantity: extra.quantity, unit: extra.unit,
          dispatchEntryId: getId(`extra:${card.orderId}:${idx}:${extra.itemName}`), targetHosurOrderId: card.orderId, isExtra: true,
        });
      }
    }
    if (actions.length === 0) {
      setResult({
        ok: false,
        message: skippedNoLink
          ? "Couldn't send — one or more items couldn't be linked back to this shop's order. Refresh the page and try again; if it keeps happening, this order's data may need attention."
          : 'Nothing to send — every item is set to 0.',
      });
      return;
    }
    setResult(null);
    setReview({ actions, card, unders });
  };

  const openReviewForCard = (card: HosurShopOrderCard) => {
    setResult(null);
    // Detect-only pass first — if anything is typed above what's still
    // owed, stop and show exactly what before touching anything. Confirming
    // that prompt is what actually calls finalizeReview(card, true).
    const { overs, unders } = buildActionsForCard(card, false);
    if (overs.length > 0) {
      setOverOrderPrompt({ card, overs });
      return;
    }
    if (unders.length > 0) {
      setUnderQtyPrompt({ card, unders });
      return;
    }
    finalizeReview(card, false);
  };

  if (shopOrders === null) return <p className="text-xs font-bold text-muted-foreground">Loading shop orders…</p>;
  // A card belongs to "Dispatched" only once every item ON THAT SHOP'S OWN
  // ORDER has been fully sent OR cancelled — independent of whether some
  // other shop sharing the same item still has a balance owed to it. Without
  // the `+ i.cancelled` here, an item cancelled because it couldn't be
  // fulfilled would keep this card stuck in "To Dispatch" forever even
  // though nothing more is ever coming for it.
  const isCardComplete = (card: HosurShopOrderCard) => card.items.length > 0 && card.items.every(i => i.dispatched + i.cancelled >= i.requested - 0.01);
  const bucketed = shopOrders.filter(c => (mode === 'completed') === isCardComplete(c));
  const filtered = shopSearch.trim()
    ? bucketed.filter(c => c.shopName.toLowerCase().includes(shopSearch.trim().toLowerCase()))
    : bucketed;
  if (bucketed.length === 0) return <EmptyState text={mode === 'active' ? 'Nothing waiting on dispatch.' : 'Nothing dispatched yet.'} />;

  return (
    <div className="space-y-2.5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={shopSearch} onChange={e => setShopSearch(e.target.value)} placeholder="Select / search a shop..." className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-xs font-bold" />
      </div>
      {filtered.length === 0 && <EmptyState text={`No shop orders match "${shopSearch}".`} />}
      {filtered.map(card => {
        const isOpen = selectedOrderId === card.orderId;
        const doneCount = card.items.filter(i => i.dispatched + i.cancelled >= i.requested - 0.01).length;
        return (
          <div key={card.orderId} className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <button onClick={() => (isOpen ? cancel() : openCard(card))} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
              <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
                <Store className="size-4 text-indigo-600" /> {card.shopName} <span className="text-xs font-bold text-muted-foreground">#{card.orderNumber}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{card.items.length} item{card.items.length === 1 ? '' : 's'}</span>
                {doneCount > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">{doneCount} sent</span>}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{isOpen ? 'Hide' : 'Open'}</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2">
                {card.items.map(item => {
                  const remaining = remainingFor(item);
                  const available = availableFor(item.itemName);
                  const val = qtyDraft[item.itemName] ?? '0';
                  const fullySent = item.dispatched >= item.requested - 0.01;
                  const fullyCancelled = !fullySent && remaining <= 0.01;
                  const done = fullySent || fullyCancelled;
                  const promptingCancel = cancelPromptItem === item.itemName;
                  // BUG FIX (2026-08-07): once an item has nothing left owed
                  // to this shop, its quantity field is locked instead of
                  // staying open for another entry — this is what actually
                  // stops the "already fully sent" item from being re-sent
                  // a second or third time, whatever the stale-suggestion
                  // cause was. sendCard's own hard cap is the backstop; this
                  // is the visible, can't-even-try-it front line.
                  return (
                    <div key={item.itemName} className={cn('rounded-lg px-3 py-1.5', done ? 'bg-teal-50' : 'bg-muted/40')}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <span>{item.itemName} <span className="text-muted-foreground">(ordered {qtyFmt(item.requested)} {item.unit} · sent {qtyFmt(item.dispatched)} {item.unit}{item.cancelled > 0 ? ` · cancelled ${qtyFmt(item.cancelled)} ${item.unit}` : ''})</span></span>
                        {fullySent ? (
                          <span className="flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-1 text-[10px] font-black text-teal-700">
                            <PackageCheck className="size-3.5" /> Fully sent
                          </span>
                        ) : fullyCancelled ? (
                          <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-700">
                            <X className="size-3.5" /> Cancelled
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min={0} value={val}
                              onChange={e => { setQtyDraft(v => ({ ...v, [item.itemName]: e.target.value })); setOverOrderPrompt(null); }}
                              className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right"
                            />
                            <button onClick={() => removeItem(item.itemName)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted" title="Not sending this item in this batch — set to 0, still owed">Skip</button>
                            <button onClick={() => { setCancelPromptItem(item.itemName); setCancelReason(''); }} className="rounded-lg border border-red-300 px-2 py-1 text-[10px] font-black text-red-700 hover:bg-red-50" title="Permanently cancel what's left of this item (e.g. production issue)">Cancel item</button>
                          </div>
                        )}
                      </div>
                      {item.cancellationReason && item.cancelled > 0 && (
                        <p className="mt-0.5 text-[10px] font-bold text-slate-500">Cancelled — {item.cancellationReason}</p>
                      )}
                      {!done && !promptingCancel && (
                        <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
                          {qtyFmt(Math.min(remaining, available))} {item.unit} available to send now (capped at {qtyFmt(remaining)} {item.unit} still owed)
                          {Number(val) > remaining + 0.01 ? " — this will be capped at what's still owed when you send." : ''}
                        </p>
                      )}
                      {promptingCancel && (
                        <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 p-2">
                          <p className="text-[10px] font-black text-red-800">Cancel {qtyFmt(remaining)} {item.unit} of {item.itemName} — why can't it be sent?</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <input
                              autoFocus value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                              placeholder="e.g. Production shortfall, ran out of raw material"
                              className="min-w-[220px] flex-1 rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold"
                            />
                            <button disabled={cancelBusy || !cancelReason.trim()} onClick={() => void cancelItemRemaining(card, item.itemName, item.rawItemName)} className="rounded-lg bg-red-700 px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50">
                              {cancelBusy ? 'Cancelling…' : 'Confirm cancel'}
                            </button>
                            <button onClick={() => { setCancelPromptItem(null); setCancelReason(''); }} className="rounded-lg border border-red-300 px-2.5 py-1 text-[10px] font-black text-red-700">Back</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {mode === 'completed' && (
                  <RecentDispatchInvoices scope="Hosur" hosurShopId={card.shopId ?? undefined} title={`${card.shopName} Invoices`} />
                )}
                {(extraItemsByCard[card.orderId] ?? []).map((extra, idx) => (
                  <div key={`extra-${idx}-${extra.itemName}`} className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5">
                    <span className="text-xs font-bold text-foreground">{extra.itemName} <span className="text-muted-foreground">({qtyFmt(extra.quantity)} {extra.unit} · extra item)</span></span>
                    <button type="button" onClick={() => removeExtraItem(card.orderId, idx)} className="rounded-lg border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800 hover:bg-amber-100">Remove</button>
                  </div>
                ))}
                <ExtraItemDispatchForm
                  contextLabel={card.shopName}
                  onAdd={item => addExtraItem(card.orderId, item)}
                />
                {overOrderPrompt && overOrderPrompt.card.orderId === card.orderId && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                    <p className="text-[11px] font-black text-amber-900">
                      Sending more than {card.shopName} currently has owed to it:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {overOrderPrompt.overs.map(o => (
                        <li key={o.itemName} className="text-[11px] font-bold text-amber-800">
                          {o.itemName}: {qtyFmt(o.owed)} {o.unit} owed · sending {qtyFmt(o.typed)} {o.unit} ({qtyFmt(o.extra)} {o.unit} extra, recorded as a non-requested item)
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button onClick={() => { finalizeReview(card, true); setOverOrderPrompt(null); }} className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-amber-700">
                        Confirm — send the extra too
                      </button>
                      <button onClick={() => setOverOrderPrompt(null)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 hover:bg-amber-100">
                        Back, let me adjust the quantity
                      </button>
                    </div>
                  </div>
                )}
                {underQtyPrompt && underQtyPrompt.card.orderId === card.orderId && (
                  <div className="rounded-lg border border-orange-300 bg-orange-50 p-2.5">
                    <p className="text-[11px] font-black text-orange-900">
                      Sending less than {card.shopName} ordered — the rest will be cancelled, not left pending:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {underQtyPrompt.unders.map(u => (
                        <li key={u.itemName} className="text-[11px] font-bold text-orange-800">
                          {u.itemName}: {qtyFmt(u.owed)} {u.unit} owed · sending {qtyFmt(u.typed)} {u.unit} · {qtyFmt(u.shortBy)} {u.unit} will be cancelled
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button disabled={underQtyBusy} onClick={() => { finalizeReview(card, false); setUnderQtyPrompt(null); }} className="rounded-lg bg-orange-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-orange-700 disabled:opacity-50">
                        Confirm — send this much, cancel the rest
                      </button>
                      <button onClick={() => setUnderQtyPrompt(null)} className="rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-[10px] font-black text-orange-800 hover:bg-orange-100">
                        Back, let me adjust the quantity
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button onClick={cancel} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={() => openReviewForCard(card)} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                    <Truck className="size-3.5" /> Send {card.shopName}'s Order
                  </button>
                </div>
                {result && <p className={cn('text-[11px] font-bold', result.ok ? 'text-teal-700' : 'text-red-700')}>{result.message}</p>}
              </div>
            )}
          </div>
        );
      })}
      {review && (
        <DispatchReviewModal
          scope="Hosur"
          hosurShop={{ id: review.card.shopId ?? '', name: review.card.shopName, phone: review.card.shopPhone ?? '' }}
          actions={review.actions}
          dispatchedBy={dispatchedBy}
          onDispatch={onDispatch}
          onClose={() => setReview(null)}
          onDone={() => {
            resetDispatchIds();
            setExtraItemsByCard(v => ({ ...v, [review.card.orderId]: [] }));
            setSelectedOrderId(null);
            setQtyDraft({});
            // FEATURE (2026-08-24): "under-qty confirmation... on confirm,
            // dispatch and move straight to Dispatched" — this only runs
            // after dispatch has actually succeeded (this callback fires
            // post-success), so the shortfall gets cancelled on top of a
            // real, completed dispatch, never before or instead of one.
            if (review.unders && review.unders.length > 0) {
              for (const u of review.unders) {
                const item = review.card.items.find(i => i.itemName === u.itemName);
                if (!item) continue;
                void supabase.rpc('cancel_hosur_order_item_remaining_secure', {
                  p_order_id: review.card.orderId, p_item_name: item.rawItemName,
                  p_reason: 'Under-dispatched — confirmed by planner, remainder cancelled',
                });
              }
            }
            setResult({ ok: true, message: `Sent ${review.card.shopName}'s order to Hosur dispatch.` });
            reload();
            onDone();
          }}
        />
      )}
    </div>
  );
}

// ─── Flat "all items, one screen" dispatch panel (VRSNB / SNB) ─────────────
// Mirrors HosurShopDispatchPanel's already-expanded card layout: every
// requested item for this branch is listed right away with an editable
// quantity pre-filled from what's actually available (produced total or the
// shared leftover ledger balance, whichever is larger — same logic
// DispatchChecklistModal already uses — capped at what this branch still
// hasn't received), and a single button that dispatches everything left
// with a quantity > 0 in one action. No per-item modal, no separate
// checkbox-then-bulk-modal step.
function BranchFlatDispatchPanel({ branch, rows, orders, leftoverBalances, onDispatch, dispatchedBy, onDone, search = '' }: {
  branch: Branch; rows: ProductionRow[]; orders: BakeryOrder[];
  leftoverBalances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
  onDone: () => void;
  // BUG FIX (2026-08-07): `rows` must be the branch's full active list,
  // untouched by the item search box — search only narrows what's
  // *displayed* below (via this prop), never what quantity/selection state
  // is tracked for. Previously the caller passed the already search-filtered
  // list straight in, so every keystroke shrank `lines`, which changed
  // `seedKey`, which wiped every quantity you'd just typed and every
  // checkbox you'd just ticked for items outside the current search text.
  search?: string;
}) {
  // Branch-scoped suggestions for the extra-item form below — VRSNB items
  // only on the VRSNB panel, SNB items only on the SNB panel (never merged,
  // and never the other branch's items).
  const branchCatalog = useBranchOnlyCatalog(branch === 'VRSNB' || branch === 'SNB' ? branch : null);
  const lines = useMemo(() => rows.map(row => {
    const requested = row.perBranch[branch] ?? 0;
    const alreadySent = branchDispatchedForRow(row, branch, orders);
    const remaining = Math.max(0, Math.round((requested - alreadySent) * 100) / 100);
    const leftoverBalance = Math.max(0, leftoverBalances.get(closingStockItemSlug(row.itemName))?.balance ?? 0);
    const available = Math.max(row.preparedTotal, leftoverBalance);
    const defaultQty = Math.round(Math.min(remaining, available) * 100) / 100;
    return { row, requested, alreadySent, remaining, available, defaultQty };
  }), [rows, branch, orders, leftoverBalances]);

  const [qty, setQty] = useState<Record<string, string>>({});
  // BUG FIX (2026-08-07): used to default every item to checked. Planner
  // asked for nothing pre-selected — you tick only what you actually mean
  // to send, so a moment's inattention can't blast out items you never
  // meant to dispatch.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tracks which quantity fields the planner has hand-edited, so the reseed
  // effect below only ever fills in a *fresh* default for an item it's
  // never touched — it will never overwrite a value you typed, no matter
  // how many times the search box (or available stock) changes afterward.
  const touchedRef = useRef<Set<string>>(new Set());
  // Re-seed drafts whenever the actual set of default quantities changes
  // (date group opened, an item's available stock changed, etc.) — merges
  // into existing state rather than replacing it, so this is safe to run
  // on every lines change without clobbering anything already entered.
  const seedKey = lines.map(l => `${l.row.itemName}:${l.defaultQty}`).join('|');
  useEffect(() => {
    setQty(prev => {
      const next = { ...prev };
      for (const l of lines) {
        if (!touchedRef.current.has(l.row.itemName)) next[l.row.itemName] = String(l.defaultQty);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  // WORKFLOW CHANGE (2026-08-08): items added via ExtraItemDispatchForm now
  // stage here instead of dispatching instantly — they show up as ordinary
  // rows in this same "To Dispatch" list, selected by default, until the
  // planner clicks Dispatch and reviews everything together.
  const [extraItems, setExtraItems] = useState<{ itemName: string; unit: 'kg' | 'pcs'; quantity: number }[]>([]);
  const addExtraItem = (item: { itemName: string; unit: 'kg' | 'pcs'; quantity: number }) => {
    setExtraItems(prev => [...prev, item]);
  };
  const removeExtraItem = (idx: number) => setExtraItems(prev => prev.filter((_, i) => i !== idx));

  const qtyFor = (itemName: string) => Number(qty[itemName] ?? '0');
  const toggleSelect = (itemName: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
    return next;
  });
  const selectedCount = lines.filter(l => selected.has(l.row.itemName) && qtyFor(l.row.itemName) > 0.001).length + extraItems.length;
  // Search narrows what's rendered only — `lines` (and therefore qty/
  // selection state) always covers the branch's full active set.
  const visibleLines = search.trim()
    ? lines.filter(l => l.row.itemName.toLowerCase().includes(search.trim().toLowerCase()))
    : lines;

  // WORKFLOW CHANGE (2026-08-08): "when we select the item and click on
  // dispatch, it should not directly go to SNB orders dashboard — it should
  // open the checklist along with the items I selected and its quantity for
  // double check." Clicking Dispatch used to call submitDispatch immediately
  // for every selected line; it now only builds the list of pending actions
  // and opens DispatchReviewModal, which is the sole place submitDispatch
  // actually gets called (on explicit confirm there).
  const [reviewActions, setReviewActions] = useState<PendingDispatchAction[] | null>(null);

  const openReview = () => {
    setResult(null);
    const actions: PendingDispatchAction[] = [];
    let clampedAny = false;
    // FEATURE (2026-08-25): "selection order, not alphabetical" — iterate
    // `selected` directly (Set preserves insertion/click order in JS)
    // instead of filtering `lines` (which has its own sort), so the review
    // list reflects the order items were actually checked.
    const lineByName = new Map(lines.map(l => [l.row.itemName, l]));
    for (const itemName of selected) {
      const line = lineByName.get(itemName);
      if (!line) continue;
      const { row, remaining } = line;
      const typed = qtyFor(row.itemName);
      // BUG FIX (2026-08-19): "dispatching more than requested silently
      // reverts to the requested amount" — same root cause and same fix as
      // the single-item DispatchReviewModal flow elsewhere in this file.
      // touchedRef already exists here specifically to know whether a
      // quantity is the auto-seeded default or something the planner
      // deliberately typed — reuse that instead of unconditionally capping.
      const isManualQty = touchedRef.current.has(row.itemName);
      const q = isManualQty ? typed : Math.min(typed, remaining);
      if (!isManualQty && typed > remaining + 0.01) clampedAny = true;
      if (q <= 0.001) continue;
      // BUG FIX (audit 2026-08-26): "orders correctly displayed / actually
      // dispatchable" — this used to filter entries by o.targetBranch ===
      // branch, which completely excludes a cross-branch merged order when
      // dispatching its SECONDARY branch (target_branch is only ever the
      // surviving primary order's own branch, e.g. 'VRSNB' — an order
      // genuinely also containing SNB items via branchSplit would never
      // match branch === 'SNB' here). The item's own branchSplit is the
      // real source of truth for "does this order contribute to this
      // branch," not the order-level targetBranch field.
      const entries = orders.filter(o => {
        if (!row.contributingOrderIds.includes(o.id)) return false;
        const item = o.items.find(i => sameItem(i.itemName, row.itemName));
        if (item?.branchSplit && Object.keys(item.branchSplit).length > 0) return !!item.branchSplit[branch];
        return o.targetBranch === branch;
      });
      if (entries.length === 0) continue;
      const split = autoSplitForItemByBranch(entries, row.itemName, branch, q);
      for (const order of entries) {
        const item = order.items.find(i => sameItem(i.itemName, row.itemName));
        const orderQty = split[order.id] ?? 0;
        if (!item || orderQty <= 0) continue;
        // Consistent with the isExtra split in the single-item dispatch flow:
        // autoSplitForItemByBranch can hand this order more than it
        // individually has outstanding once the total q is allowed to
        // exceed the row's overall remaining — tag only the genuine
        // surplus portion as extra so "has this order's actual request
        // been fulfilled" stays accurate.
        // Same fix as entries/split above: for a merged item, THIS
        // branch's requested amount is its own branchSplit share, not the
        // item's full combined quantity (which would double-count this
        // order into every branch it's split across).
        const orderRequested = item.branchSplit?.[branch] ?? (item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity);
        // Same fix: only THIS branch's own dispatch entries count toward
        // "already sent" for this branch — a merged order's dispatches to
        // a different branch must not inflate this branch's remaining calc.
        const orderAlreadySent = (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra && d.branch === branch).reduce((s, d) => s + d.quantity, 0);
        const orderRemaining = Math.max(0, Math.round((orderRequested - orderAlreadySent) * 100) / 100);
        const orderWithinRequest = Math.min(orderQty, orderRemaining);
        const orderBeyondRequest = Math.round((orderQty - orderWithinRequest) * 1000) / 1000;
        if (orderWithinRequest > 0.001) {
          actions.push({
            orderId: order.id, itemName: item.itemName, quantity: orderWithinRequest, unit: item.dispatchUnit || 'kg',
            dispatchEntryId: getId(`${order.id}:${row.itemName}`),
          });
        }
        if (orderBeyondRequest > 0.001) {
          actions.push({
            orderId: order.id, itemName: item.itemName, quantity: orderBeyondRequest, unit: item.dispatchUnit || 'kg',
            dispatchEntryId: getId(`${order.id}:${row.itemName}:extra`), isExtra: true,
          });
        }
      }
    }
    if (extraItems.length > 0) {
      // BUG FIX (2026-08-08 audit): extra items need a real bakery_orders row
      // to attach their dispatch entry to (submitDispatch always writes
      // against an orderId). If this branch has zero orders at all,
      // anchorOrderId is null and extra items used to be silently dropped
      // here with no explanation — the planner just saw a generic "nothing
      // to send" message with no idea why. Surface the real reason instead.
      if (!anchorOrderId) {
        setResult({ ok: false, message: `Can't send extra items — ${branch} has no order to attach them to yet. Create or receive at least one ${branch} order first.` });
        return;
      }
      for (const [idx, extra] of extraItems.entries()) {
        actions.push({
          orderId: anchorOrderId, itemName: extra.itemName, quantity: extra.quantity, unit: extra.unit,
          dispatchEntryId: getId(`extra:${idx}:${extra.itemName}`), isExtra: true,
        });
      }
    }
    if (actions.length === 0) {
      setResult({ ok: false, message: 'Nothing to send — check the items you want and make sure their quantity is above 0.' });
      return;
    }
    setResult(clampedAny ? { ok: true, message: "One or more items were capped at what's still owed (some had already been sent)." } : null);
    setReviewActions(actions);
  };

  // Anchor order for the "extra / non-requested item" form below — any
  // active order already targeting this branch works, since a DispatchEntry
  // is keyed by its own itemName/quantity, not by which order's row it lives
  // in (see ExtraItemDispatchForm's comment for why this is safe).
  // BUG FIX (audit 2026-08-26): broadened to also match via branchSplit —
  // if every active order for this branch happened to be folded into a
  // cross-branch merge (surviving order's own targetBranch now something
  // else), the old check would find no anchor at all even though a
  // perfectly valid one exists.
  const anchorOrderId = orders.find(o => o.targetBranch === branch || o.items.some(i => i.branchSplit?.[branch]))?.id ?? null;

  const reviewModal = reviewActions && (
    <DispatchReviewModal
      scope={branch}
      actions={reviewActions}
      dispatchedBy={dispatchedBy}
      onDispatch={onDispatch}
      onClose={() => setReviewActions(null)}
      onDone={() => {
        // Modal stays open (its own success screen has reprint buttons —
        // planner may want to print the invoice up to 3x before closing);
        // it closes itself via onClose when the planner clicks "Done" there.
        resetDispatchIds();
        setExtraItems([]);
        setResult({ ok: true, message: `Sent to ${branch}.` });
        onDone();
      }}
    />
  );

  if (lines.length === 0 && extraItems.length === 0) {
    return (
      <div className="space-y-2.5">
        <EmptyState text="Nothing waiting on dispatch." />
        <ExtraItemDispatchForm contextLabel={branch} suggestions={branchCatalog} onAdd={addExtraItem} />
        {reviewModal}
      </div>
    );
  }

  const allVisibleSelected = visibleLines.length > 0 && visibleLines.every(l => selected.has(l.row.itemName));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-muted-foreground">{selected.size} of {lines.length} selected</span>
        <button
          type="button"
          onClick={() => setSelected(prev => {
            const next = new Set(prev);
            for (const l of visibleLines) {
              if (allVisibleSelected) next.delete(l.row.itemName); else next.add(l.row.itemName);
            }
            return next;
          })}
          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-black text-muted-foreground hover:bg-muted"
        >
          {allVisibleSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      {visibleLines.length === 0 && <EmptyState text="No items match your search." />}
      <div className="space-y-2">
        {visibleLines.map(({ row, requested, alreadySent, available, remaining }) => {
          const val = qty[row.itemName] ?? '0';
          const over = Number(val) > available + 0.01;
          const overRemaining = Number(val) > remaining + 0.01;
          const isChecked = selected.has(row.itemName);
          return (
            <div key={row.itemName} className={cn('rounded-2xl border bg-white p-3 shadow-sm', isChecked ? 'border-teal-300 ring-1 ring-teal-200' : 'border-border opacity-60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox" checked={isChecked} onChange={() => toggleSelect(row.itemName)}
                    className="size-4 shrink-0 accent-teal-600"
                  />
                  <p className="text-sm font-black text-foreground">
                    {row.itemName} <span className="font-bold text-muted-foreground">(ordered {qtyFmt(requested)} {row.unit} · sent {qtyFmt(alreadySent)} {row.unit})</span>
                  </p>
                </label>
                <input
                  type="number" min={0} max={remaining} step={row.unit === 'pcs' ? 1 : 0.001} value={val}
                  onChange={e => { touchedRef.current.add(row.itemName); setQty(v => ({ ...v, [row.itemName]: sanitizeQtyForUnit(e.target.value, row.unit) })); }}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-bold"
                />
              </div>
              <p className="mt-1 pl-[26px] text-[11px] font-bold text-muted-foreground">
                {qtyFmt(available)} {row.unit} available now (produced + leftover) · {qtyFmt(remaining)} {row.unit} still owed
                {overRemaining ? ' — this will be capped at what\'s still owed when you send.' : over ? " — you're sending more than what's currently available, double-check before sending." : ''}
              </p>
            </div>
          );
        })}
        {extraItems.map((extra, idx) => (
          <div key={`extra-${idx}-${extra.itemName}`} className="flex items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
            <p className="text-sm font-black text-foreground">
              {extra.itemName} <span className="font-bold text-muted-foreground">({qtyFmt(extra.quantity)} {extra.unit} · extra item)</span>
            </p>
            <button type="button" onClick={() => removeExtraItem(idx)} className="rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-black text-amber-800 hover:bg-amber-100">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="sticky bottom-2 z-10 flex justify-center pt-2">
        <button
          onClick={openReview}
          disabled={selectedCount === 0}
          className="flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-black text-white shadow-xl disabled:opacity-50"
        >
          <Truck className="size-4" /> Dispatch {selectedCount} selected item{selectedCount === 1 ? '' : 's'} to {branch}
        </button>
      </div>
      {result && <p className={cn('text-center text-xs font-bold', result.ok ? 'text-teal-700' : 'text-red-700')}>{result.message}</p>}
      <ExtraItemDispatchForm contextLabel={branch} suggestions={branchCatalog} onAdd={addExtraItem} />
      {reviewModal}
    </div>
  );
}

function plannedContributingOrders(row: ProductionRow, orders: BakeryOrder[]): BakeryOrder[] {
  return orders.filter(o => bucketFor(o) === 'Planned' && row.contributingOrderIds.includes(o.id));
}
function plannedDispatchedForRow(row: ProductionRow, orders: BakeryOrder[]): number {
  return plannedContributingOrders(row, orders)
    .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s2, d) => s2 + d.quantity, 0), 0);
}

// Date-wise: each calendar day gets its own collapsible group (own branch
// filter, own To Dispatch/Dispatched/Planned sub-tabs). Within one date, the
// same item across several same-day orders still merges into a single
// dispatch line (computeProductionRows already does this per date-bucket) —
// only the cross-date merge is removed, so yesterday's still-pending items
// stay under "Yesterday" instead of silently folding into "Today".
function DispatchTab({ orders, allOrders }: { orders: BakeryOrder[]; allOrders: BakeryOrder[] }) {
  const [search, setSearch] = useState('');
  // BUG FIX (2026-08-11): the Printer Setup entry point used to be a
  // position:fixed button floating at the top-right of the whole page —
  // it never actually appeared on screen (almost certainly covered by, or
  // positioned relative to, the app shell's own persistent header instead
  // of the viewport, since some ancestor of PlannerDashboard likely applies
  // a CSS transform, which silently changes what `fixed` is relative to).
  // Moved into this toolbar's normal document flow instead, right next to
  // Refresh/Export Excel — same in-flow pattern Billing dashboard's own
  // Printer Setup button already uses successfully.
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  // FEATURE (2026-08-24): "no date-wise split for VRSNB/SNB, add to old
  // quantity" — same reasoning and same fix shape as ProductionEntryTab's
  // own date-grouping removal above: DispatchDateGroup already computes
  // rows across whatever order set it's given, and already has its own
  // branchFilter tabs (VRSNB/SNB/Hosur/Custom) nested inside it — removing
  // the date split here surfaces those as the primary navigation, without
  // needing to touch DispatchDateGroup's own internals at all.
  const exportRows = useMemo(() => {
    const rows = computeProductionRows(orders);
    return rows.map(row => {
      const dispatched = orders.filter(o => row.contributingOrderIds.includes(o.id))
        .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s2, d) => s2 + d.quantity, 0), 0);
      return { item: row.itemName, VRSNB: row.perBranch.VRSNB ?? '', SNB: row.perBranch.SNB ?? '', Hosur: row.perBranch.Hosur ?? '', produced: row.preparedTotal, dispatched, status: row.itemStatus };
    });
  }, [orders]);

  return (
    <div className="space-y-4">
      {showPrinterSetup && <PlannerPrinterSetupModal onClose={() => setShowPrinterSetup(false)} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-foreground">Dispatch</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <RefreshOrdersButton />
          <button
            type="button"
            onClick={() => setShowPrinterSetup(true)}
            title="Printer setup (route dispatch invoices/bills to your thermal printer)"
            aria-label="Printer setup"
            className="inline-flex size-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          >
            <Printer className="size-3.5" />
          </button>
          <ExportButton
            disabled={exportRows.length === 0}
            onClick={() => exportToExcel({
              filename: 'dispatch', sheetName: 'Dispatch', title: 'Planner — Dispatch',
              columns: [{ header: 'Item', key: 'item' }, ...BRANCHES.map(b => ({ header: `${b} Req`, key: b })), { header: 'Produced', key: 'produced' }, { header: 'Dispatched', key: 'dispatched' }, { header: 'Status', key: 'status' }],
              rows: exportRows,
            })}
          />
        </div>
      </div>
      {orders.length === 0 && <EmptyState text="Nothing waiting on dispatch." />}
      {orders.length > 0 && (
        <DispatchDateGroup dateKey="all" label="Pending Dispatch" orders={orders} allOrders={allOrders} search={search} defaultOpen />
      )}
    </div>
  );
}

// FEATURE (2026-08-08): "we are unable to take the print the bills again if
// we need the bills again there is no option to print the bill again" — the
// Dispatched sub-tab showed items/shop cards but never linked back to the
// dispatch_invoices row(s) created when they were sent, so once the modal's
// own success screen was closed there was no way back to that invoice short
// of hunting through the separate Invoice tab. This pulls the branch's (or
// one Hosur shop's) recent invoices straight into the Dispatched view with
// one-tap thermal/A4 reprint, as many times as needed.
function RecentDispatchInvoices({ scope, hosurShopId, title, customSalesOnly }: { scope: Branch; hosurShopId?: string; title?: string; customSalesOnly?: boolean }) {
  const [invoices, setInvoices] = useState<DispatchInvoiceRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const to = new Date(); to.setDate(to.getDate() + 1);
      const from = new Date(); from.setDate(from.getDate() - 90);
      const records = await listDispatchInvoices({ fromDate: from.toISOString(), toDate: to.toISOString(), scope });
      // Custom (Planned) walk-in sales are saved under scope='SNB' with no
      // hosurShopId but a customerName set (see DispatchReviewModal's confirm())
      // — that's the only marker distinguishing them from SNB's own branch
      // invoices, which never carry a customerName.
      const filtered = customSalesOnly ? records.filter(r => !!r.customerName && !r.hosurShopId) : records;
      setInvoices(hosurShopId ? filtered.filter(r => r.hosurShopId === hosurShopId) : filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recent invoices.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [scope, hosurShopId, customSalesOnly]);

  useEffect(() => { void load(); }, [load]);

  // FEATURE (2026-08-10): "for the dispatched items bill we need the edit
  // option — complete edit access of the bill." Reprint list is also now the
  // entry point into full bill editing (delete/add items, change price/
  // qty/unit/name/discount) — see EditDispatchInvoiceModal.
  const [editingInvoice, setEditingInvoice] = useState<DispatchInvoiceRecord | null>(null);

  if (loading && invoices === null) return <p className="text-[11px] font-bold text-muted-foreground">Loading recent invoices…</p>;
  if (error) return <p className="text-[11px] font-bold text-red-700">{error}</p>;
  if (!invoices || invoices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-foreground">{title ?? 'Recent Invoices'} <span className="font-bold text-muted-foreground">— reprint any time</span></p>
        <button onClick={load} className="flex items-center gap-1 text-[10px] font-bold text-teal-700 hover:underline"><RefreshCw className="size-3" /> Refresh</button>
      </div>
      <div className="mt-2 max-h-64 space-y-1.5 overflow-auto pr-1">
        {invoices.map(inv => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black text-foreground">{inv.invoiceNo}{inv.hosurShopName ? ` — ${inv.hosurShopName}` : ''}</p>
              <p className="text-[10px] font-bold text-muted-foreground">{new Date(inv.createdAt).toLocaleString('en-IN')} · Rs. {inv.total.toFixed(2)}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => printDispatchInvoice(inv, 'thermal')} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3" /> Thermal</button>
              <button onClick={() => printDispatchInvoice(inv, 'a4')} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3" /> A4</button>
              {inv.status !== 'cancelled' && (
                <button onClick={() => setEditingInvoice(inv)} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800 hover:bg-amber-100"><Pencil className="size-3" /> Edit</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editingInvoice && (
        <EditDispatchInvoiceModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => { setEditingInvoice(null); void load(); }}
        />
      )}
    </div>
  );
}

// FEATURE (2026-08-10): "complete edit access of the bill — delete the item
// (back to stock), change price/quantity/unit/discount/name, add a new item
// (minus from stock, marked extra if not originally dispatched)." One draft
// row per invoice line, editable in place; "Remove" drops a row entirely,
// "Add item" appends a free-text row (no catalog picker here — a dispatch
// bill can carry items across any branch/shop, so a single scoped catalog
// wouldn't fit every case; the item name is still validated non-empty on
// save). All the actual stock reconciliation happens server-side in
// updateDispatchInvoice — this component only collects the edited values.
interface EditableInvoiceLine extends DispatchInvoiceItem { key: number }

function EditDispatchInvoiceModal({ invoice, onClose, onSaved }: {
  invoice: DispatchInvoiceRecord; onClose: () => void; onSaved: () => void;
}) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [lines, setLines] = useState<EditableInvoiceLine[]>(() => invoice.items.map((i, idx) => ({ ...i, key: idx })));
  const nextKeyRef = useRef(invoice.items.length);
  const [discountPct, setDiscountPct] = useState(invoice.discountPct);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const updateLine = (key: number, patch: Partial<EditableInvoiceLine>) =>
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  const removeLine = (key: number) => setLines(prev => prev.filter(l => l.key !== key));
  const addLine = () => {
    const key = nextKeyRef.current++;
    setLines(prev => [...prev, { key, itemName: '', unit: 'kg', quantity: 0, unitPrice: 0, lineTotal: 0, isExtra: true }]);
  };

  const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice * 100) / 100, 0);
  // BUG FIX (audit item #12): discountPct's own onChange already clamps to
  // 0-100 on input, but this recomputes defensively anyway (belt-and-
  // suspenders against any other path that could set it) — and total was
  // missing Math.max(0, ...) entirely, unlike the two invoice flows
  // (Walk-in Billing, Sample Bill) that already clamp both correctly.
  const clampedDiscountPct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const discountAmount = Math.round(subtotal * (clampedDiscountPct / 100) * 100) / 100;
  const total = Math.max(0, Math.round(subtotal - discountAmount));

  const save = async () => {
    setError(null);
    setWarning(null);
    const cleaned = lines.filter(l => l.itemName.trim() && l.quantity > 0);
    if (cleaned.length === 0) { setError('Add at least one item with a name and quantity above 0.'); return; }
    // BUG FIX (audit): the original bill-creation flow (DispatchReviewModal)
    // refuses to confirm while any item has no real price ("NO PRICE — enter
    // below") — this edit path had no equivalent guard, so it was possible
    // to silently zero out a line's revenue by leaving price blank/0 with no
    // warning at all, unlike every other place a bill gets built.
    const zeroPriceItems = cleaned.filter(l => !(l.unitPrice > 0));
    if (zeroPriceItems.length > 0) {
      setError(`Enter a price above 0 for: ${zeroPriceItems.map(l => l.itemName).join(', ')} before saving.`);
      return;
    }
    setSaving(true);
    try {
      const result = await updateDispatchInvoice({
        invoiceId: invoice.id,
        updatedItems: cleaned.map(({ key: _key, ...rest }) => rest),
        // BUG FIX: the input's own onChange clamps discountPct to 0-100,
        // but only when it actually fires — if the invoice's original,
        // stored discountPct was already out of range (e.g. from before
        // this clamp existed) and the user never touches this specific
        // field while editing other lines, the raw, unclamped value would
        // still reach here. Use the already-computed clamped value instead.
        updatedDiscountPct: clampedDiscountPct,
        editedBy: currentUser?.displayName || currentUser?.username || 'Planner',
      });
      if ('error' in result) { setError(result.error); return; }
      if (!result.stockSynced) {
        setWarning('Saved. This bill has no linked dispatch record (e.g. a cake bill), so only the bill itself was updated — no stock was adjusted.');
        setTimeout(onSaved, 1200);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black text-foreground">Edit Bill — {invoice.invoiceNo}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <p className="mt-1 text-[11px] font-bold text-muted-foreground">
          Removing or reducing an item credits it back to stock. Adding an item (or increasing a quantity) debits stock and is marked as an extra/non-requested item on the record.
        </p>

        <div className="mt-3 space-y-2">
          {lines.map(l => (
            <div key={l.key} className="grid gap-2 sm:grid-cols-[1fr_5rem_4.5rem_5rem_auto]">
              <input
                value={l.itemName} onChange={e => updateLine(l.key, { itemName: e.target.value })}
                placeholder="Item name" className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold"
              />
              <input
                value={l.quantity || ''} onChange={e => updateLine(l.key, { quantity: Number(e.target.value) || 0 })}
                type="number" min={0} placeholder="Qty" className="rounded-lg border border-border px-2 py-1.5 text-right text-xs font-bold"
              />
              <select
                value={l.unit} onChange={e => updateLine(l.key, { unit: e.target.value })}
                className="rounded-lg border border-border px-1.5 py-1.5 text-xs font-bold"
              >
                <option value="kg">kg</option>
                <option value="pcs">pcs</option>
              </select>
              <input
                value={l.unitPrice || ''} onChange={e => updateLine(l.key, { unitPrice: Number(e.target.value) || 0 })}
                type="number" min={0} placeholder="Price" className="rounded-lg border border-border px-2 py-1.5 text-right text-xs font-bold"
              />
              {l.key < invoice.items.length ? (
                <button type="button" onClick={() => removeLine(l.key)} title="Return this item — restores it to stock and removes it from the bill total when you save" className="flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100">
                  <RotateCcw className="size-3.5" /> Return
                </button>
              ) : (
                <button type="button" onClick={() => removeLine(l.key)} title="Remove this line from the bill (never saved, nothing to return)" className="flex items-center justify-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] font-black text-red-700 hover:bg-red-100">
                  <Trash2 className="size-3.5" />
                </button>
              )}
              {l.isExtra && <span className="col-span-full -mt-1 text-[10px] font-black uppercase text-amber-700">Extra / non-requested item</span>}
            </div>
          ))}
          <button type="button" onClick={addLine} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-black text-muted-foreground hover:bg-muted">
            <Plus className="size-3.5" /> Add item
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Percent className="size-3.5" /> Discount %
            <input
              type="number" min={0} max={100} step={0.5} value={discountPct}
              onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-16 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
            />
          </label>
          <div className="text-right text-xs font-bold text-muted-foreground">
            Subtotal Rs. {subtotal.toFixed(2)} &nbsp;·&nbsp; Discount Rs. {discountAmount.toFixed(2)} &nbsp;·&nbsp;
            <span className="text-sm font-black text-foreground"> Total Rs. {total.toFixed(2)}</span>
          </div>
        </div>

        {error && <p className="mt-2 text-[11px] font-bold text-red-700">{error}</p>}
        {warning && <p className="mt-2 text-[11px] font-bold text-amber-700">{warning}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function DispatchDateGroup({ label, orders, search, defaultOpen }: {
  dateKey: string; label: string; orders: BakeryOrder[]; allOrders: BakeryOrder[]; search: string; defaultOpen: boolean;
}) {
  // Anything not dated "Today" is a past date with items still awaiting
  // dispatch — flag it so it's never mistaken for today's dispatch queue.
  const { submitDispatch } = useBakeryStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const { balances: leftoverBalances, refresh: refreshLeftover } = useLeftoverBalanceMap();
  const [open, setOpen] = useState(defaultOpen);
  // WORKFLOW CHANGE (2026-08-06): no longer filtering out 'not_started' rows
  // — Dispatch now lists every item that's been ordered at all, even before
  // any production has been recorded for it, per owner's explicit request.
  const rows = useMemo(() => computeProductionRows(orders), [orders]);
  const [subTab, setSubTab] = useState<'active' | 'completed' | 'planned'>('active');
  const [checklistItem, setChecklistItem] = useState<ProductionRow | null>(null);
  // 'All' shows every item like before. Picking a branch filters to only items
  // that branch actually ordered, and turns on multi-select + bulk dispatch.
  const [branchFilter, setBranchFilter] = useState<'All' | Branch | 'Custom'>(BRANCHES[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  // Hosur dispatch can be viewed item-first (original) or shop-first (shop
  // name, then the items that shop ordered underneath it) — defaults to
  // shop-first per the planner's request, since that's how shop orders are
  // actually organized in their head.
  const [hosurView, setHosurView] = useState<'shop' | 'item'>('shop');

  useEffect(() => { setSelected(new Set()); }, [branchFilter]);
  // BUG FIX (2026-08-11): "why am I seeing custom items in the SNB dispatch
  // tab — it should only be in Custom(Planned)." The 'Planned' subTab used to
  // stay selectable (and its state could carry over) on every branch filter,
  // not just 'All' — and it always rendered the exact same unfiltered
  // plannedRows list via PlannedDispatchPanel regardless of which branch was
  // picked, so switching to SNB/VRSNB/Hosur while 'planned' was still the
  // active subTab showed the identical Planned-stock items Custom (Planned)
  // already owns. Custom (Planned) is the one dedicated place for those —
  // drop back to 'active' the moment a real branch (or Custom itself, which
  // has its own To Sell/Dispatched toggle reusing 'active'/'completed') is
  // selected, so 'planned' is never left active outside the 'All' view.
  useEffect(() => { if (branchFilter !== 'All' && subTab === 'planned') setSubTab('active'); }, [branchFilter, subTab]);

  const dispatchedQtyForItem = (row: ProductionRow) => {
    let sum = 0;
    for (const order of orders) {
      if (!row.contributingOrderIds.includes(order.id)) continue;
      sum += (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s, d) => s + d.quantity, 0);
    }
    return sum;
  };

  const filtered = rows
    .filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase()))
    // BUG FIX (2026-08-19): "cancel + dispatch mixed on an order, card still
    // shows as needing dispatch." !!r.perBranch[branchFilter] treats a
    // fully-handled item (remaining exactly 0, a perfectly valid, meaningful
    // value) the same as one that was never on this branch at all (key
    // absent) — 0 is falsy in JS. Once every order for an item nets to zero
    // remaining for this branch, this excluded its row entirely, which
    // cascades into the per-card completion check below never seeing that
    // item and getting stuck. Check key presence, not truthiness.
    .filter(r => branchFilter === 'All' || branchFilter === 'Custom' || branchFilter in r.perBranch);

  // BUG FIX (2026-08-08): "in All tab to dispatch its showing 74 items but
  // we have dispatched some items its not showing that and its not getting
  // minus" — this used to require `row.preparedTotal > 0` (i.e. something
  // had been logged via the Production Entry tab) before an item could ever
  // be considered dispatched in the 'All' view. Plenty of real orders (e.g.
  // SNB #154) get dispatched with zero production ever logged against them
  // — dispatch quantity isn't capped by preparedTotal, only by what's still
  // owed — so those items' preparedTotal stayed 0 forever and this always
  // returned false, permanently stuck in "To Dispatch" no matter how much
  // was actually sent. Compare against what was actually ordered
  // (row.totalRequested) instead, same as the per-branch case just above.
  const fullyDispatched = (row: ProductionRow) => {
    // 'Custom' isn't a real branch — its own panel (CustomDispatchPanel)
    // tracks completion off the 'Planned' bucket directly, not this helper.
    if (branchFilter === 'Custom') return false;
    if (branchFilter !== 'All') {
      const requested = row.perBranch[branchFilter] ?? 0;
      return requested > 0 && branchDispatchedForRow(row, branchFilter, orders) >= requested - 0.01;
    }
    return row.totalRequested > 0 && dispatchedQtyForItem(row) >= row.totalRequested - 0.01;
  };
  const activeRows = filtered.filter(r => !fullyDispatched(r))
    .sort((a, b) => (dispatchedQtyForItem(b) > 0 ? 1 : 0) - (dispatchedQtyForItem(a) > 0 ? 1 : 0));
  const completedRows = filtered.filter(r => fullyDispatched(r));
  const shown = subTab === 'active' ? activeRows : completedRows;
  // FEATURE: "Hosur and Custom(Planned) need date-wise orders, VRSNB and
  // SNB should NOT" — Custom(Planned) already renders through its own,
  // separate components (CustomDispatchPanel/PlannedDispatchPanel) above,
  // so only Hosur needs date-grouping added here. Groups by the oldest
  // contributing order's own date, same date-key logic already used for
  // the days-pending badge — VRSNB/SNB pass through as a single, flat
  // group (no visible change for them).
  const rowDateGroups = useMemo(() => {
    if (branchFilter !== 'Hosur') return [{ dateKey: 'all', label: '', rows: shown }];
    const groups = new Map<string, ProductionRow[]>();
    for (const row of shown) {
      const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id));
      const oldest = contributing.length > 0
        ? contributing.reduce((min, o) => o.createdAt < min ? o.createdAt : min, contributing[0].createdAt)
        : null;
      const dateKey = oldest ? kolkataDateKey(oldest) : 'unknown-date';
      const list = groups.get(dateKey) ?? [];
      list.push(row);
      groups.set(dateKey, list);
    }
    const todayKey = kolkataDateKey(new Date().toISOString());
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, rows]) => ({
        dateKey, rows,
        label: dateKey === 'unknown-date' ? 'Date unknown' : dateKey === todayKey ? 'Today' : new Date(dateKey).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      }));
  }, [shown, orders, branchFilter]);
  // BUG FIX (2026-08-07): search-independent version of activeRows, for the
  // VRSNB/SNB flat dispatch panel only. That panel keeps its own
  // quantity/selection state keyed by item name and re-seeds it whenever its
  // `rows` prop's contents change — feeding it the search-filtered list
  // meant every keystroke in the search box shrank the set, which reset any
  // quantity you'd already typed for items outside the current search text.
  const flatPanelRows = rows
    // BUG FIX (2026-08-19): same falsy-zero bug as the `filtered` list
    // above — check key presence, not truthiness.
    .filter(r => branchFilter === 'All' || branchFilter === 'Custom' || branchFilter in r.perBranch)
    .filter(r => !fullyDispatched(r))
    .sort((a, b) => (dispatchedQtyForItem(b) > 0 ? 1 : 0) - (dispatchedQtyForItem(a) > 0 ? 1 : 0));
  // BUG FIX (2026-08-08): same class of bug as flatPanelRows above, but for
  // the Hosur "By Shop" view — HosurShopDispatchPanel was being fed
  // `filtered` (search-narrowed), so an item you'd already opened a shop
  // card for and typed a quantity into would simply disappear from that
  // card's item list the moment the search box matched something else,
  // reading exactly like "search again and the saved data is gone." This
  // keeps the full Hosur-scoped row set (both dispatched + pending)
  // search-independent, the same way flatPanelRows already is.
  // BUG FIX (2026-08-19): "cancel some items, dispatch some items on a Hosur
  // order — the card still shows in the dispatch tab, even after everything
  // is fully dispatched." Confirmed against live data: an order with a
  // single item, fully accounted for (dispatched + cancelled = requested),
  // where every OTHER Hosur shop's need for that same item was also fully
  // satisfied, netting the aggregate remaining to exactly 0. !!r.perBranch.
  // Hosur excluded that row entirely, since 0 is falsy in JS — cascading
  // into useHosurShopOrders's item-name match failing, that item silently
  // dropping out of card.items, and the card either losing the one item
  // that proved it was done, or (if it was the order's only item)
  // disappearing from both the active and completed views rather than
  // correctly bucketing into completed. Checking key presence instead of
  // truthiness fixes this at the root, matching the same fix just above.
  const hosurPanelRows = rows.filter(r => 'Hosur' in r.perBranch);
  // Items with a "Planned" (Planning-tab) component still awaiting a
  // branch + quantity decision at dispatch time.
  const plannedRows = useMemo(
    () => rows.filter(r => (r.perBranch.Planned ?? 0) > 0 && plannedDispatchedForRow(r, orders) < (r.perBranch.Planned ?? 0) - 0.01),
    [rows, orders],
  );
  // FEATURE (2026-08-10): "the dispatched order should show in that
  // custom(planned) -> dispatched" — mirrors plannedRows above but for items
  // whose planned quantity has already been fully sold/sent, so Custom
  // (Planned) can show a Dispatched view the same way every other branch
  // filter already does.
  const plannedCompletedRows = useMemo(
    () => rows.filter(r => (r.perBranch.Planned ?? 0) > 0 && plannedDispatchedForRow(r, orders) >= (r.perBranch.Planned ?? 0) - 0.01),
    [rows, orders],
  );

  const toggleSelect = (itemName: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
    return next;
  });
  // FEATURE (2026-08-25): "selection order, not alphabetical" — Set
  // preserves insertion order in JS, so iterating `selected` directly
  // (in the order items were checked) instead of filtering activeRows
  // (which has its own sort) gives the actual click order for free.
  const selectedRows = Array.from(selected).map(name => activeRows.find(r => r.itemName === name)).filter((r): r is ProductionRow => r != null);

  // BUG FIX (2026-08-10): "if we search and enter the data, search again and
  // enter the data, the records are gone" — this used to `return null` when
  // the search text matched nothing in THIS date group's rows. Returning
  // null unmounts this entire component (React destroys all state on
  // unmount), which took BranchFlatDispatchPanel down with it — every ticked
  // checkbox, every hand-typed quantity, and every staged extra item, gone
  // the instant a search keystroke (even transiently, mid-word) matched zero
  // items for the current branch. Typing to look for one item while an extra
  // item / selection was already staged is exactly the reported flow. Hiding
  // via CSS instead of unmounting keeps every child component (and its
  // in-progress state) alive underneath — the date group just doesn't
  // render on screen while there's no match, and reappears with everything
  // intact the moment the search text is cleared or matches again.
  const hideForSearch = search.trim() !== '' && filtered.length === 0;

  return (
    // BUG FIX (2026-08-07): this stayed `overflow-hidden` even while expanded
    // (only needed so the collapsed header's corners stay rounded) — every
    // absolutely-positioned dropdown inside the expanded body (the extra-item
    // ItemSearchPicker suggestion list, in particular) got silently clipped
    // the moment it extended past this box, which is exactly what "the
    // dropdown is blocked, we're unable to see the item" looks like. Only
    // clip while collapsed; the expanded body doesn't need it.
    <div style={hideForSearch ? { display: 'none' } : undefined} className={cn('rounded-2xl border border-border bg-white shadow-sm', !open && 'overflow-hidden')}>
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-black text-foreground">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{activeRows.length} to dispatch</span>
          {completedRows.length > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">{completedRows.length} done</span>}
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {!open ? null : (
      <div className="space-y-3 border-t border-border p-3">
      {/* Branch view — click a branch to see only what that branch ordered,
          with a checkbox on each card to bulk-dispatch several items at once. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {([...BRANCHES, 'Custom'] as const).map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={cn('rounded-xl px-3 py-1.5 text-xs font-black', branchFilter === b ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground', b === 'Custom' && branchFilter !== 'Custom' && 'bg-amber-100 text-amber-800')}
            >
              {b === 'Custom' ? 'Custom (Planned)' : b}
            </button>
          ))}
        </div>
        {/* Hosur-only: switch between item-first (original) and shop-first
            (shop name, items requested underneath) grouping. */}
        {branchFilter === 'Hosur' && (
          <div className="flex gap-1 rounded-xl bg-indigo-50 p-1">
            <button onClick={() => setHosurView('shop')} className={cn('rounded-lg px-2.5 py-1 text-[11px] font-black', hosurView === 'shop' ? 'bg-indigo-600 text-white' : 'text-indigo-700')}>By Shop</button>
            <button onClick={() => setHosurView('item')} className={cn('rounded-lg px-2.5 py-1 text-[11px] font-black', hosurView === 'item' ? 'bg-indigo-600 text-white' : 'text-indigo-700')}>By Item</button>
          </div>
        )}
      </div>

      {branchFilter !== 'Custom' && (
      <div className="flex gap-2">
        <button onClick={() => setSubTab('active')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'active' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground')}>To Dispatch ({activeRows.length})</button>
        <button onClick={() => setSubTab('completed')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'completed' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground')}>Dispatched ({completedRows.length})</button>
        {/* BUG FIX (2026-08-11): only shown on 'All' — Custom (Planned) is the
            one dedicated place to work Planned-stock items; surfacing this
            same button (and the same unfiltered plannedRows list) under
            SNB/VRSNB/Hosur too made Planned/custom items look like they'd
            leaked into those branches' own dispatch queues. */}
        {branchFilter === 'All' && (
          <button onClick={() => setSubTab('planned')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'planned' ? 'cafe-gradient text-white shadow-teal' : 'bg-primary/10 text-primary')}>Planned ({plannedRows.length})</button>
        )}
      </div>
      )}

      {/* FEATURE (2026-08-10): Custom (Planned) gets its own To Sell/Dispatched
          toggle, same shape as every other branch filter — previously it only
          ever showed the "still to sell" view with no way to see what had
          already gone out. Reuses the same `subTab` state; 'planned' is simply
          never selectable while on Custom. */}
      {branchFilter === 'Custom' && (
      <div className="flex gap-2">
        <button onClick={() => setSubTab('active')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab !== 'completed' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground')}>To Sell ({plannedRows.length})</button>
        <button onClick={() => setSubTab('completed')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'completed' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground')}>Dispatched ({plannedCompletedRows.length})</button>
      </div>
      )}

      {/* Reprint access for anything already sent — only relevant once a
          specific branch is picked (scope) and only on the Dispatched tab.
          The Hosur "By Shop" view gets its own per-shop version further
          down; this covers VRSNB/SNB and Hosur's "By Item" view. */}
      {subTab === 'completed' && branchFilter !== 'All' && branchFilter !== 'Custom' && !(branchFilter === 'Hosur' && hosurView === 'shop') && (
        <RecentDispatchInvoices scope={branchFilter} title={`${branchFilter} Invoices`} />
      )}
      {/* Custom (Planned) reprint list — same recent-invoices lookup as every
          other branch, filtered down to just the custom walk-in sales (the
          ones carrying a customerName) so SNB's own branch invoices don't
          bleed into this view. */}
      {subTab === 'completed' && branchFilter === 'Custom' && (
        <RecentDispatchInvoices scope="SNB" title="Custom Sale Invoices" customSalesOnly />
      )}

      {branchFilter === 'Custom' ? (
        subTab === 'completed' ? (
          // FEATURE (2026-08-10): read-only summary of planned-stock items
          // that have already been fully sold off — the invoice reprint list
          // above covers the bill side, this covers the quantity side.
          plannedCompletedRows.length === 0 ? (
            <EmptyState text="Nothing sold from Planned stock yet." />
          ) : (
            <div className="space-y-2">
              {plannedCompletedRows.map(row => {
                const dispatchedQty = plannedDispatchedForRow(row, orders);
                return (
                  <div key={row.itemName} className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                    <p className="text-sm font-black text-foreground">{row.itemName}</p>
                    <p className="text-xs font-bold text-muted-foreground">Planned {qtyFmt(row.perBranch.Planned ?? 0)} {row.unit} · Sold {qtyFmt(dispatchedQty)} {row.unit}</p>
                  </div>
                );
              })}
            </div>
          )
        ) : (
        // Custom is a sub-tab of Dispatch, sitting right next to Hosur — not
        // a separate top-level Planner tab. Sells Planning-stock items
        // direct to a walk-in customer, with the same checklist/invoice flow
        // as every other dispatch, scoped to this date group's planned rows.
        plannedRows.length === 0 ? (
          <EmptyState text="No Planned-stock items are currently waiting on a custom sale." />
        ) : (
          <CustomDispatchPanel rows={plannedRows} orders={orders} onDispatch={submitDispatch} dispatchedBy={currentUser?.displayName || currentUser?.username || 'Planner'} leftoverBalances={leftoverBalances} />
        )
        )
      ) : subTab === 'planned' && branchFilter === 'All' ? (
        <PlannedDispatchPanel rows={plannedRows} orders={orders} onDispatch={submitDispatch} dispatchedBy={currentUser?.displayName || 'Planner'} />
      ) : branchFilter === 'Hosur' && hosurView === 'shop' ? (
        // BUG FIX (2026-08-07): this used to pass `shown` (activeRows/
        // completedRows — item-level rows already filtered by whether that
        // ITEM is fully dispatched across ALL Hosur shops combined). A shop
        // whose own order was 100% sent still showed under "To Dispatch"
        // whenever some OTHER shop hadn't yet received its share of the same
        // shared item, because the item itself stayed "active" globally.
        // Pass the full (subTab-independent) Hosur-scoped row set instead —
        // HosurShopDispatchPanel now builds every shop card from this and
        // buckets each card into To Dispatch/Dispatched by that card's OWN
        // completion (every item on that specific shop's order fully sent),
        // not by whether some unrelated shop still needs more of an item.
        <HosurShopDispatchPanel
          rows={hosurPanelRows}
          mode={subTab === 'completed' ? 'completed' : 'active'}
          orders={orders}
          leftoverBalances={leftoverBalances}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || currentUser?.username || 'Planner'}
          onDone={refreshLeftover}
        />
      ) : subTab === 'active' && (branchFilter === 'VRSNB' || branchFilter === 'SNB') ? (
        // WORKFLOW CHANGE (2026-08-07): VRSNB/SNB used to require opening
        // each item individually (or ticking checkboxes one by one, then a
        // separate bulk-dispatch modal) to send anything. Planner asked for
        // the same flat, all-at-once layout the Hosur shop cards already
        // use: every requested item listed right here with its quantity
        // pre-filled from what's actually available (produced + leftover,
        // capped at what's still owed), editable in place, "Remove" to skip
        // one, and a single button to send everything left checked.
        <BranchFlatDispatchPanel
          // CRITICAL BUG FIX (2026-08-07, found while re-checking the SNB
          // "dispatch one item, multiple went out" report): with no `key`,
          // switching the branch filter between VRSNB and SNB reused the
          // SAME component instance — its internal `selected`/`qty`/
          // `touchedRef` state (all keyed by item name) survived the switch.
          // An item checked/typed while viewing VRSNB stayed checked with
          // its stale quantity when you flipped to SNB, so an item name
          // shared by both branches (e.g. "Bread") could silently ride along
          // on a dispatch the planner only meant to send to SNB. Keying by
          // branch forces a full remount — and therefore a clean state —
          // every time the branch filter changes.
          key={branchFilter}
          branch={branchFilter}
          rows={flatPanelRows}
          search={search}
          orders={orders}
          leftoverBalances={leftoverBalances}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || currentUser?.username || 'Planner'}
          onDone={refreshLeftover}
        />
      ) : (
      <>
      {shown.length === 0 && <EmptyState text={subTab === 'active' ? 'Nothing waiting on dispatch.' : 'Nothing dispatched yet.'} />}
      {rowDateGroups.map(group => (
      <div key={group.dateKey} className="space-y-2">
      {group.label && <p className="pt-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{group.label}</p>}
      <div className="space-y-2">
        {group.rows.map(row => {
          const dispatched = dispatchedQtyForItem(row);
          const canSelect = subTab === 'active' && branchFilter !== 'All';
          // FEATURE (2026-08-25): "no date-wise split... show days-pending
          // instead" — since removing the date grouping, this is the
          // per-item replacement for the old "Past date — still pending"
          // group badge: how long the OLDEST order still contributing to
          // this row has been waiting, computed from real order data, not
          // a stale group label.
          const oldestPendingDays = (() => {
            if (row.itemStatus === 'completed') return 0;
            const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id));
            if (contributing.length === 0) return 0;
            const oldest = contributing.reduce((min, o) => o.createdAt < min ? o.createdAt : min, contributing[0].createdAt);
            return Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000);
          })();
          return (
            <div key={row.itemName} className={cn('rounded-2xl border bg-white p-3 shadow-sm', selected.has(row.itemName) ? 'border-teal-400 ring-1 ring-teal-300' : 'border-border')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {canSelect && (
                    <input type="checkbox" className="size-4 accent-teal-600" checked={selected.has(row.itemName)} onChange={() => toggleSelect(row.itemName)} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">
                      {row.itemName} <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black', row.itemStatus === 'completed' ? 'bg-teal-100 text-teal-700' : row.itemStatus === 'not_started' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700')}>{row.itemStatus === 'completed' ? 'Completed' : row.itemStatus === 'not_started' ? 'Not produced yet' : 'More to come'}</span>
                      {oldestPendingDays >= 1 && (
                        <span className={cn('ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black', oldestPendingDays >= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                          <AlertTriangle className="size-2.5" /> {oldestPendingDays} day{oldestPendingDays === 1 ? '' : 's'} pending
                        </span>
                      )}
                    </p>
                    <p className="text-xs font-bold text-muted-foreground">Produced {row.preparedTotal} {row.unit}{dispatched > 0 ? ` · Dispatched ${dispatched} ${row.unit}` : ''}</p>
                  </div>
                </div>
                {subTab === 'active' && (
                  <button onClick={() => setChecklistItem(row)} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">
                    <Truck className="size-3.5" /> Dispatch
                  </button>
                )}
              </div>
              {subTab === 'active' && (() => {
                // Leftover is no longer a separate manual step — the "Dispatch"
                // button above now auto-fills from this same balance (see
                // DispatchChecklistModal's leftoverBalance prop). This is just
                // a visible confirmation of what's already going to be used,
                // so nothing has to be manually chosen/applied first.
                const balance = leftoverBalances.get(closingStockItemSlug(row.itemName));
                if (!balance || balance.balance <= 0.001) return null;
                return (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800">
                    <PackageCheck className="size-3.5" /> {qtyFmt(balance.balance)} {balance.unit} available in leftover — used automatically when you dispatch
                  </p>
                );
              })()}
              {/* Every branch that actually ordered this item — only shown if they
                  really requested it — so a combined item shows its full picture. */}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                {BRANCHES.filter(b => row.perBranch[b]).map(b => {
                  const bDispatched = branchDispatchedForRow(row, b, orders);
                  const bDone = (row.perBranch[b] ?? 0) > 0 && bDispatched >= (row.perBranch[b] ?? 0) - 0.01;
                  return (
                    <span key={b} className={cn('rounded-lg px-2 py-1', b === branchFilter ? 'bg-teal-100 text-teal-700' : 'bg-muted/40', bDone && 'line-through opacity-60')}>
                      {b} requested {row.perBranch[b]} {row.unit}{bDispatched > 0 ? ` · sent ${bDispatched} ${row.unit}` : ''}
                    </span>
                  );
                })}
              </div>
              {branchFilter === 'Hosur' && <HosurShopBreakdown row={row} orders={orders} />}
            </div>
          );
        })}
      </div>
      </div>
      ))}
      </>
      )}
      {/* Bulk-dispatch bar — appears once the planner has ticked one or more
          items for the currently selected branch, so several items can go out
          to that branch in a single dispatch action.
          BUG FIX: this used to be `fixed inset-x-0 bottom-0`, viewport-pinned.
          With date-wise grouping, several of these date cards can now be open
          at once — if two of them each had a bulk selection in progress, two
          identical viewport-pinned bars would stack on top of each other,
          and only the topmost one would actually be clickable. `sticky`
          keeps it pinned to the bottom of the viewport only while its own
          card is in view, so two open cards never fight for the same spot. */}
      {/* BUG FIX (2026-08-07): the only feedback that anything was selected
          used to be a teal ring around each card, easy to lose track of once
          you'd ticked a few items scattered down a long list. Show exactly
          what's selected, by name, with a one-tap way to remove one before
          committing to the bulk dispatch. */}
      {branchFilter !== 'All' && branchFilter !== 'Custom' && selected.size > 0 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-teal-700">Selected for {branchFilter} ({selected.size})</p>
          <div className="flex flex-wrap gap-2">
            {selectedRows.map(row => (
              <span key={row.itemName} className="flex items-center gap-1.5 rounded-full border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-bold text-teal-800">
                {row.itemName}
                <button type="button" onClick={() => toggleSelect(row.itemName)} aria-label={`Remove ${row.itemName} from selection`} className="text-teal-500 hover:text-teal-800">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      {branchFilter !== 'All' && branchFilter !== 'Custom' && selected.size > 0 && (
        <div className="sticky bottom-2 z-10 flex justify-center pt-2">
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-black text-white shadow-xl"
          >
            <Truck className="size-4" /> Dispatch {selected.size} item{selected.size > 1 ? 's' : ''} to {branchFilter}
          </button>
        </div>
      )}
      </div>
      )}

      {checklistItem && (
        <DispatchChecklistModal
          row={checklistItem}
          orders={orders}
          branchFilter={branchFilter}
          onClose={() => setChecklistItem(null)}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || 'Planner'}
          leftoverBalance={leftoverBalances.get(closingStockItemSlug(checklistItem.itemName))?.balance ?? 0}
        />
      )}

      {bulkOpen && branchFilter !== 'All' && branchFilter !== 'Custom' && (
        <BulkDispatchModal
          branch={branchFilter}
          rows={selectedRows}
          orders={orders}
          onClose={() => setBulkOpen(false)}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || 'Planner'}
          onDone={() => { setSelected(new Set()); setBulkOpen(false); }}
          leftoverBalances={leftoverBalances}
        />
      )}
    </div>
  );
}

// "Planned" dispatch — items with a Planning-tab (no fixed branch) component
// that's been produced but not yet sent anywhere. Unlike every other item
// here, the destination branch isn't known in advance: the planner picks it
// (and how much to send) right here, per dispatch action.
function PlannedDispatchPanel({ rows, orders, onDispatch, dispatchedBy }: {
  rows: ProductionRow[]; orders: BakeryOrder[];
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
}) {
  const { updateOrderItems } = useBakeryStore();
  const [branchFor, setBranchFor] = useState<Record<string, Branch>>({});
  const [qtyFor, setQtyFor] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();
  // FEATURE: "Hosur and Custom(Planned) need date-wise orders" — same
  // date-grouping pattern just added to the VRSNB/SNB/Hosur panel above,
  // applied here for Custom(Planned) too. Placed here, before any early
  // return below, since hooks must run unconditionally on every render.
  const plannedDateGroups = useMemo(() => {
    const groups = new Map<string, ProductionRow[]>();
    for (const row of rows) {
      const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id));
      const oldest = contributing.length > 0
        ? contributing.reduce((min, o) => o.createdAt < min ? o.createdAt : min, contributing[0].createdAt)
        : null;
      const dateKey = oldest ? kolkataDateKey(oldest) : 'unknown-date';
      const list = groups.get(dateKey) ?? [];
      list.push(row);
      groups.set(dateKey, list);
    }
    const todayKey = kolkataDateKey(new Date().toISOString());
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, groupRows]) => ({
        dateKey, rows: groupRows,
        label: dateKey === 'unknown-date' ? 'Date unknown' : dateKey === todayKey ? 'Today' : new Date(dateKey).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      }));
  }, [rows, orders]);
  // WORKFLOW CHANGE (2026-08-08 audit): this was the last remaining dispatch
  // entry point that still called onDispatch directly with no review, price,
  // or invoice step. "Dispatch to <branch>" now only builds one
  // PendingDispatchAction batch for this row's branch and opens
  // DispatchReviewModal — that modal is the sole place submitDispatch
  // actually gets called, after price/discount entry.
  const [review, setReview] = useState<{ itemName: string; branch: Branch; actions: PendingDispatchAction[]; shortfalls?: { orderId: string; newQuantity: number }[] } | null>(null);
  // FEATURE (2026-08-24): "under-qty confirmation" for the Planned bucket —
  // same idea as the Hosur shop-card version above, but there's no
  // equivalent single-RPC "cancel remaining" here since a Planned item is
  // just a normal order line, not tied to a shop order. Confirming reduces
  // each affected contributing order's quantity for this item down to
  // whatever's actually been sent (via updateOrderItems, the same function
  // #4's Merged Summary edit already uses) — applied only after dispatch
  // succeeds, same sequencing as the Hosur version.
  const [underQtyPrompt, setUnderQtyPrompt] = useState<{ row: ProductionRow; branch: Branch; owed: number; typed: number; shortBy: number } | null>(null);

  if (rows.length === 0) return <EmptyState text="No planned-stock items waiting on a dispatch decision." />;

  const buildReview = (row: ProductionRow, confirmedUnderQty = false) => {
    const branch = branchFor[row.itemName] ?? 'SNB';
    const plannedRequested = row.perBranch.Planned ?? 0;
    const alreadySent = plannedDispatchedForRow(row, orders);
    const remainingPlanned = Math.max(0, plannedRequested - alreadySent);
    const defaultQty = Math.round(Math.min(remainingPlanned, row.preparedTotal) * 100) / 100;
    const typed = qtyFor[row.itemName] !== undefined ? Number(qtyFor[row.itemName] || 0) : defaultQty;
    // BUG FIX (2026-08-19): same root fix as every other dispatch flow in
    // this file — a planner who has explicitly typed a value (qtyFor[itemName]
    // set, as opposed to falling back to defaultQty) is respected as-is,
    // instead of being silently capped at what was originally planned. The
    // "CRITICAL BUG FIX (audit)" cap below was guarding against an
    // un-touched default ever exceeding remaining, not a deliberate
    // planner override.
    const isManualQty = qtyFor[row.itemName] !== undefined;
    const q = isManualQty ? typed : Math.min(typed, remainingPlanned);
    const clamped = !isManualQty && typed > remainingPlanned + 0.01;
    if (q <= 0) {
      setResult(r => ({ ...r, [row.itemName]: { ok: false, message: 'Nothing to send — quantity must be above 0.' } }));
      return;
    }
    if (isManualQty && !confirmedUnderQty && q < remainingPlanned - 0.01) {
      setUnderQtyPrompt({ row, branch, owed: remainingPlanned, typed: q, shortBy: Math.round((remainingPlanned - q) * 100) / 100 });
      return;
    }
    const entries = plannedContributingOrders(row, orders);
    const split = autoSplitForItem(entries, row.itemName, q);
    const actions: PendingDispatchAction[] = [];
    const shortfalls: { orderId: string; newQuantity: number }[] = [];
    for (const order of entries) {
      const item = order.items.find(i => sameItem(i.itemName, row.itemName));
      const orderQty = split[order.id] ?? 0;
      if (!item || orderQty <= 0) continue;
      const orderRequested = item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
      const orderAlreadySent = (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s, d) => s + d.quantity, 0);
      const orderRemaining = Math.max(0, Math.round((orderRequested - orderAlreadySent) * 100) / 100);
      const orderWithinRequest = Math.min(orderQty, orderRemaining);
      const orderBeyondRequest = Math.round((orderQty - orderWithinRequest) * 1000) / 1000;
      if (orderWithinRequest > 0.001) {
        actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderWithinRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${row.itemName}`) });
        // This order's requested quantity exceeds what it'll actually have
        // sent after this dispatch — flagged for reduction to "already
        // sent" once dispatch succeeds, so it stops showing as pending.
        if (confirmedUnderQty && orderWithinRequest < orderRemaining - 0.001) {
          shortfalls.push({ orderId: order.id, newQuantity: Math.round((orderAlreadySent + orderWithinRequest) * 1000) / 1000 });
        }
      }
      if (orderBeyondRequest > 0.001) {
        actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderBeyondRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${row.itemName}:extra`), isExtra: true });
      }
    }
    if (actions.length === 0) {
      setResult(r => ({ ...r, [row.itemName]: { ok: false, message: 'Nothing to send — no matching order found.' } }));
      return;
    }
    setResult(r => ({ ...r, [row.itemName]: clamped ? { ok: true, message: `Capped at ${remainingPlanned} ${row.unit} still owed.` } : undefined as any }));
    setReview({ itemName: row.itemName, branch, actions, shortfalls });
  };

  if (review) {
    return (
      <DispatchReviewModal
        scope={review.branch}
        actions={review.actions}
        dispatchedBy={dispatchedBy}
        onDispatch={onDispatch}
        onClose={() => setReview(null)}
        onDone={() => {
          // Modal stays open (its own success screen has reprint buttons —
          // planner may want to print the invoice up to 3x before closing);
          // it closes itself via onClose when the planner clicks "Done" there.
          resetDispatchIds();
          if (review.shortfalls && review.shortfalls.length > 0) {
            for (const s of review.shortfalls) {
              const order = orders.find(o => o.id === s.orderId);
              if (!order) continue;
              const items = order.items.map(i => sameItem(i.itemName, review.itemName)
                ? { ...i, quantity: s.newQuantity, originalPcs: i.dispatchUnit === 'pcs' ? s.newQuantity : undefined }
                : i);
              void updateOrderItems(order.id, items);
            }
          }
          setQtyFor(v => ({ ...v, [review.itemName]: '' }));
          setResult(r => ({ ...r, [review.itemName]: { ok: true, message: `Sent to ${review.branch}.` } }));
        }}
      />
    );
  }

  return (
    <div className="space-y-2 pb-16">
      {plannedDateGroups.map(group => (
      <div key={group.dateKey} className="space-y-2">
      <p className="pt-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{group.label}</p>
      {group.rows.map(row => {
        const plannedRequested = row.perBranch.Planned ?? 0;
        const alreadySent = plannedDispatchedForRow(row, orders);
        const remainingPlanned = Math.max(0, plannedRequested - alreadySent);
        const defaultQty = Math.round(Math.min(remainingPlanned, row.preparedTotal) * 100) / 100;
        const branch = branchFor[row.itemName] ?? 'SNB';
        const res = result[row.itemName];
        return (
          <div key={row.itemName} className="card-base p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">{row.itemName}</p>
                <p className="text-xs font-bold text-muted-foreground">Planned {plannedRequested} {row.unit} · Produced {row.preparedTotal} {row.unit}{alreadySent > 0 ? ` · Already sent ${alreadySent} ${row.unit}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {BRANCHES.map(b => (
                    <button key={b} onClick={() => setBranchFor(v => ({ ...v, [row.itemName]: b }))} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-bold', branch === b ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  max={remainingPlanned}
                  step={row.unit === 'pcs' ? 1 : 0.001}
                  placeholder={String(defaultQty)}
                  value={qtyFor[row.itemName] ?? ''}
                  onChange={e => setQtyFor(v => ({ ...v, [row.itemName]: sanitizeQtyForUnit(e.target.value, row.unit) }))}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs font-bold"
                />
                <span className="text-[11px] font-bold text-muted-foreground">{row.unit} · {qtyFmt(remainingPlanned)} owed</span>
                <button onClick={() => buildReview(row)} className="flex items-center gap-1.5 rounded-xl cafe-gradient px-3 py-2 text-xs font-bold text-white shadow-teal disabled:opacity-50">
                  <Truck className="size-3.5" /> Dispatch to {branch}
                </button>
              </div>
            </div>
            {res && (
              <p className={cn('mt-2 rounded-lg px-3 py-1.5 text-xs font-bold', res.ok ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-red-50 text-red-700 border border-red-200')}>{res.message}</p>
            )}
            {underQtyPrompt && underQtyPrompt.row.itemName === row.itemName && (
              <div className="mt-2 rounded-lg border border-orange-300 bg-orange-50 p-2.5">
                <p className="text-[11px] font-black text-orange-900">
                  Sending less than planned — the rest will be cancelled, not left pending:
                </p>
                <p className="mt-1 text-[11px] font-bold text-orange-800">
                  {row.itemName}: {qtyFmt(underQtyPrompt.owed)} {row.unit} owed · sending {qtyFmt(underQtyPrompt.typed)} {row.unit} · {qtyFmt(underQtyPrompt.shortBy)} {row.unit} will be cancelled
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button onClick={() => { buildReview(row, true); setUnderQtyPrompt(null); }} className="rounded-lg bg-orange-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-orange-700">
                    Confirm — send this much, cancel the rest
                  </button>
                  <button onClick={() => setUnderQtyPrompt(null)} className="rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-[10px] font-black text-orange-800 hover:bg-orange-100">
                    Back, let me adjust the quantity
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
      ))}
    </div>
  );
}

// FEATURE (2026-08-09): "for planning order items build a new Custom tab
// under Dispatch where items can be selected with quantity, and on dispatch
// the planner should enter customer name, mobile number, and address; only
// then can the checklist/invoice be printed with that customer info; need
// price and discount fields per item" — sells planning-stock items direct to
// a walk-in customer. Draws from the exact same source rows as the Planned
// tab (plannedRows), so a quantity sold here also counts against what's
// "already sent" out of the Planned bucket (plannedDispatchedForRow sums
// every non-extra dispatch log entry regardless of which branch it's
// nominally stamped with) — the two tabs can never double-count the same
// planning stock.
function CustomDispatchPanel({ rows, orders, onDispatch, dispatchedBy, leftoverBalances }: {
  rows: ProductionRow[]; orders: BakeryOrder[];
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
  leftoverBalances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [customerStep, setCustomerStep] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();
  const [review, setReview] = useState<{ actions: PendingDispatchAction[]; customer: { name: string; phone: string; address: string } } | null>(null);

  // BUG FIX (audit, 2026-08-10): this used to suggest/inform off
  // `row.preparedTotal` alone, unlike BranchFlatDispatchPanel which also
  // counts the shared Closing Stock leftover balance toward what's
  // available. A custom walk-in sale of genuinely available leftover stock
  // could understate how much was really on hand — same fix applied here.
  const lines = useMemo(() => rows.map(row => {
    const plannedRequested = row.perBranch.Planned ?? 0;
    const alreadySent = plannedDispatchedForRow(row, orders);
    const remainingPlanned = Math.max(0, plannedRequested - alreadySent);
    const leftoverBalance = Math.max(0, leftoverBalances.get(closingStockItemSlug(row.itemName))?.balance ?? 0);
    const available = Math.max(row.preparedTotal, leftoverBalance);
    const defaultQty = Math.round(Math.min(remainingPlanned, available) * 100) / 100;
    return { row, plannedRequested, remainingPlanned, available, defaultQty };
  }), [rows, orders, leftoverBalances]);

  const toggleSelect = (itemName: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
    return next;
  });

  const qtyFor = (itemName: string, defaultQty: number) => {
    const raw = qty[itemName];
    return raw !== undefined ? Number(raw || 0) : defaultQty;
  };

  const selectedCount = selected.size;

  const buildActions = (): PendingDispatchAction[] | null => {
    setError(null);
    const actions: PendingDispatchAction[] = [];
    let clampedAny = false;
    // FEATURE (2026-08-25): "selection order, not alphabetical" — same fix
    // as the other two dispatch flows above.
    const lineByName = new Map(lines.map(l => [l.row.itemName, l]));
    for (const itemName of selected) {
      const line = lineByName.get(itemName);
      if (!line) continue;
      const { row, remainingPlanned, defaultQty } = line;
      const typed = qtyFor(row.itemName, defaultQty);
      // BUG FIX (2026-08-19): same fix as the other dispatch flows — a
      // planner-typed quantity (qty[itemName] set explicitly, as opposed to
      // falling back to defaultQty) is no longer silently capped at what
      // was originally planned.
      const isManualQty = qty[row.itemName] !== undefined;
      const q = isManualQty ? typed : Math.min(typed, remainingPlanned);
      if (!isManualQty && typed > remainingPlanned + 0.01) clampedAny = true;
      if (q <= 0) continue;
      const entries = plannedContributingOrders(row, orders);
      const split = autoSplitForItem(entries, row.itemName, q);
      for (const order of entries) {
        const item = order.items.find(i => sameItem(i.itemName, row.itemName));
        const orderQty = split[order.id] ?? 0;
        if (!item || orderQty <= 0) continue;
        const orderRequested = item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
        const orderAlreadySent = (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra).reduce((s, d) => s + d.quantity, 0);
        const orderRemaining = Math.max(0, Math.round((orderRequested - orderAlreadySent) * 100) / 100);
        const orderWithinRequest = Math.min(orderQty, orderRemaining);
        const orderBeyondRequest = Math.round((orderQty - orderWithinRequest) * 1000) / 1000;
        if (orderWithinRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderWithinRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`custom:${order.id}:${row.itemName}`) });
        }
        if (orderBeyondRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderBeyondRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`custom:${order.id}:${row.itemName}:extra`), isExtra: true });
        }
      }
    }
    if (actions.length === 0) {
      setError('Select at least one item with a quantity above 0.');
      return null;
    }
    if (clampedAny) setError("One or more items were capped at what's still owed (some had already been sent).");
    return actions;
  };

  const openCustomerStep = () => {
    const actions = buildActions();
    if (!actions) return;
    setCustomerStep(true);
  };

  const confirmCustomer = () => {
    const actions = buildActions();
    if (!actions) { setCustomerStep(false); return; }
    if (!customerName.trim()) { setCustomerError('Enter the customer\'s name.'); return; }
    if (!customerPhone.trim()) { setCustomerError('Enter the customer\'s mobile number.'); return; }
    setCustomerError(null);
    setReview({ actions, customer: { name: customerName.trim(), phone: customerPhone.trim(), address: customerAddress.trim() } });
  };

  if (review) {
    return (
      <DispatchReviewModal
        scope="SNB"
        customer={review.customer}
        actions={review.actions}
        dispatchedBy={dispatchedBy}
        onDispatch={onDispatch}
        onClose={() => setReview(null)}
        onDone={() => {
          resetDispatchIds();
          setSelected(new Set());
          setQty({});
          setCustomerStep(false);
          setCustomerName(''); setCustomerPhone(''); setCustomerAddress('');
        }}
      />
    );
  }

  if (customerStep) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-black text-amber-900">Who is this going to?</p>
        <p className="text-[11px] font-bold text-amber-700">Required before the checklist/invoice can be printed — it'll carry this customer's details instead of a branch name.</p>
        <label className="block space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Customer Name *</span>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold" placeholder="e.g. Ramesh Kumar" />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Mobile Number *</span>
          <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold" placeholder="e.g. 9876543210" />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-amber-800">Address</span>
          <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} rows={2} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold" placeholder="Optional, for delivery reference" />
        </label>
        {customerError && <p className="text-xs font-bold text-red-700">{customerError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => setCustomerStep(false)} className="rounded-xl border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800">Back</button>
          <button onClick={confirmCustomer} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700">
            <ClipboardList className="size-3.5" /> Continue to Price &amp; Discount
          </button>
        </div>
      </div>
    );
  }

  if (rows.length === 0) return <EmptyState text="No planning-stock items available for a custom sale." />;

  return (
    <div className="space-y-2 pb-16">
      {lines.map(({ row, plannedRequested, remainingPlanned, available, defaultQty }) => {
        const isChecked = selected.has(row.itemName);
        const val = qty[row.itemName] ?? String(defaultQty);
        const over = Number(val) > available + 0.01;
        return (
          <div key={row.itemName} className={cn('rounded-2xl border bg-white p-3 shadow-sm', isChecked ? 'border-amber-300 ring-1 ring-amber-200' : 'border-border opacity-70')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-2.5">
                <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(row.itemName)} className="size-4 shrink-0 accent-amber-600" />
                <p className="text-sm font-black text-foreground">
                  {row.itemName} <span className="font-bold text-muted-foreground">(planned {qtyFmt(plannedRequested)} {row.unit} · {qtyFmt(available)} {row.unit} available now (produced + leftover) · {qtyFmt(remainingPlanned)} {row.unit} still owed)</span>
                </p>
              </label>
              <input
                type="number" min={0} max={remainingPlanned} step={row.unit === 'pcs' ? 1 : 0.001}
                value={val}
                onChange={e => setQty(v => ({ ...v, [row.itemName]: sanitizeQtyForUnit(e.target.value, row.unit) }))}
                className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-bold"
              />
            </div>
            {over && <p className="mt-1 pl-[26px] text-[11px] font-bold text-amber-700">You're selling more than what's currently available — double-check before sending.</p>}
          </div>
        );
      })}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
      <div className="sticky bottom-2 z-10 flex justify-center pt-2">
        <button
          onClick={openCustomerStep}
          disabled={selectedCount === 0}
          className="flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-xl disabled:opacity-50"
        >
          <ShoppingCart className="size-4" /> Sell {selectedCount} selected item{selectedCount === 1 ? '' : 's'} to a customer
        </button>
      </div>
    </div>
  );
}

// Lets the planner dispatch several selected items to one branch in a single
// step, instead of opening the per-item checklist modal one at a time.
function BulkDispatchModal({ branch, rows, orders, onClose, onDispatch, dispatchedBy, onDone, leftoverBalances }: {
  branch: Branch; rows: ProductionRow[]; orders: BakeryOrder[]; onClose: () => void;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string; onDone: () => void;
  leftoverBalances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>;
}) {
  // BUG FIX (audit, 2026-08-10): only counted `row.preparedTotal` toward
  // what's available, same gap as CustomDispatchPanel — this is the only
  // remaining reachable path for this modal (Hosur's legacy "By Item" bulk
  // dispatch), so its suggested quantity understated real availability
  // whenever there was Closing Stock leftover on top of fresh production.
  const lines = useMemo(() => rows.map(row => {
    const requested = row.perBranch[branch] ?? 0;
    const alreadySent = branchDispatchedForRow(row, branch, orders);
    const remainingRequested = Math.max(requested - alreadySent, 0);
    const leftoverBalance = Math.max(0, leftoverBalances.get(closingStockItemSlug(row.itemName))?.balance ?? 0);
    const available = Math.max(row.preparedTotal, leftoverBalance);
    const defaultQty = Math.round(Math.min(remainingRequested, available) * 100) / 100;
    return { row, requested, alreadySent, remaining: remainingRequested, available, defaultQty };
  }), [rows, branch, orders, leftoverBalances]);

  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.row.itemName, String(l.defaultQty)])));
  const [error, setError] = useState<string | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  const qtyFor = (itemName: string) => Number(qty[itemName] || 0);
  // Mirrors the touchedRef pattern already used in BranchFlatDispatchPanel —
  // qty here starts pre-populated with defaults at mount (not empty), so
  // "is this value set" can't distinguish an auto-default from a planner
  // edit the way it can elsewhere. Tracked explicitly instead.
  const touchedRef = useRef<Set<string>>(new Set());

  // WORKFLOW CHANGE (2026-08-08 audit): this was the last multi-item
  // dispatch surface still calling onDispatch directly with no review,
  // price, or invoice step — every other panel (BranchFlatDispatchPanel,
  // HosurShopDispatchPanel, DispatchChecklistModal) now routes through
  // DispatchReviewModal. "Confirm Dispatch" now only builds the pending
  // action list; DispatchReviewModal is the sole place submitDispatch
  // actually gets called, after price/discount entry.
  const [reviewActions, setReviewActions] = useState<PendingDispatchAction[] | null>(null);
  // BulkDispatchModal is itself a modal whose onClose/onDone props are
  // provided by the caller (Cancel vs. "dispatch succeeded, close and clear
  // selection"). DispatchReviewModal shows its own success/reprint screen
  // before it's dismissed, so its onClose fires twice in different states —
  // once if the planner cancels before confirming (nothing dispatched yet,
  // should behave like plain Cancel) and once when they click "Done" on the
  // success screen (dispatch already happened, should clear selection).
  // This flag distinguishes the two so the right parent callback fires.
  const [dispatchDone, setDispatchDone] = useState(false);

  const buildReview = () => {
    setError(null);
    const actions: PendingDispatchAction[] = [];
    let clampedAny = false;
    for (const { row, remaining } of lines) {
      // CRITICAL BUG FIX (2026-08-07 re-audit): every other dispatch entry
      // point (BranchFlatDispatchPanel, HosurShopDispatchPanel,
      // DispatchChecklistModal) was hard-capped at `remaining` in an
      // earlier round — this modal (reachable via Hosur's "By Item" view
      // multi-select) was missed and had NO ceiling at all, letting the
      // planner type any quantity and send more than was ever requested.
      const typed = qtyFor(row.itemName);
      // BUG FIX (2026-08-19): same root fix as every other dispatch flow in
      // this file — a planner who has actually edited this field (touchedRef)
      // is respected as-is; only an un-touched auto-default still gets
      // capped at what's outstanding, which is what the 2026-08-07 fix
      // above was actually guarding against.
      const isManualQty = touchedRef.current.has(row.itemName);
      const q = isManualQty ? typed : Math.min(typed, remaining);
      if (!isManualQty && typed > remaining + 0.01) clampedAny = true;
      if (q <= 0) continue;
      // BUG FIX (audit 2026-08-26): same fix as the identical pattern
      // earlier in this file (VRSNB/SNB dispatch flow) — filtering entries
      // by o.targetBranch === branch completely excludes a cross-branch
      // merged order when dispatching its secondary branch. The item's own
      // branchSplit is the real source of truth for which branches an
      // order actually contributes to.
      const entries = orders.filter(o => {
        if (!row.contributingOrderIds.includes(o.id)) return false;
        const item = o.items.find(i => sameItem(i.itemName, row.itemName));
        if (item?.branchSplit && Object.keys(item.branchSplit).length > 0) return !!item.branchSplit[branch];
        return o.targetBranch === branch;
      });
      const split = autoSplitForItemByBranch(entries, row.itemName, branch, q);
      for (const order of entries) {
        const item = order.items.find(i => sameItem(i.itemName, row.itemName));
        const orderQty = split[order.id] ?? 0;
        if (!item || orderQty <= 0) continue;
        // Same fix as above: use this branch's own share for a merged
        // item, not the item's full combined quantity.
        const orderRequested = item.branchSplit?.[branch] ?? (item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity);
        const orderAlreadySent = (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName) && !d.isExtra && d.branch === branch).reduce((s, d) => s + d.quantity, 0);
        const orderRemaining = Math.max(0, Math.round((orderRequested - orderAlreadySent) * 100) / 100);
        const orderWithinRequest = Math.min(orderQty, orderRemaining);
        const orderBeyondRequest = Math.round((orderQty - orderWithinRequest) * 1000) / 1000;
        if (orderWithinRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderWithinRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${row.itemName}`) });
        }
        if (orderBeyondRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: orderBeyondRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${row.itemName}:extra`), isExtra: true });
        }
      }
    }
    if (actions.length === 0) {
      setError('Nothing to send — check the quantities above are above 0.');
      return;
    }
    setError(clampedAny ? "One or more items were capped at what's still owed (some had already been sent)." : null);
    setReviewActions(actions);
  };

  if (reviewActions) {
    return (
      <DispatchReviewModal
        scope={branch}
        actions={reviewActions}
        dispatchedBy={dispatchedBy}
        onDispatch={onDispatch}
        onClose={() => (dispatchDone ? onDone() : onClose())}
        onDone={() => {
          // Modal stays open (its own success screen has reprint buttons —
          // planner may want to print the invoice up to 3x before closing);
          // it closes via the onClose above, once the planner clicks "Done".
          resetDispatchIds();
          setDispatchDone(true);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black text-foreground">Dispatch {lines.length} item{lines.length > 1 ? 's' : ''} to {branch}</p>
        <div className="mt-3 max-h-[50vh] space-y-2 overflow-auto pr-1">
          {lines.map(({ row, requested, alreadySent, remaining, available }) => {
            const val = qty[row.itemName] ?? '';
            const overRemaining = Number(val) > remaining + 0.01;
            const over = Number(val) > available + 0.01;
            return (
            <div key={row.itemName} className="rounded-xl border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-foreground">{row.itemName}</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" max={remaining} step={row.unit === 'pcs' ? 1 : 0.001}
                    value={val}
                    onChange={e => { touchedRef.current.add(row.itemName); setQty(prev => ({ ...prev, [row.itemName]: sanitizeQtyForUnit(e.target.value, row.unit) })); }}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                  />
                  <span className="text-[11px] font-bold text-muted-foreground">{row.unit}</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                Requested {requested} {row.unit}{alreadySent > 0 ? ` · already sent ${alreadySent} ${row.unit}` : ''} · {qtyFmt(available)} {row.unit} available now (produced + leftover) · {qtyFmt(remaining)} {row.unit} still owed
                {overRemaining ? " — this will be capped at what's still owed when you send." : over ? " — you're sending more than what's currently available, double-check before sending." : ''}
              </p>
            </div>
            );
          })}
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground">Cancel</button>
          <button onClick={buildReview} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white">
            <Truck className="size-3.5" /> Review &amp; Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

function DispatchChecklistModal({ row, orders, branchFilter, onClose, onDispatch, dispatchedBy, leftoverBalance }: {
  row: ProductionRow; orders: BakeryOrder[]; branchFilter: 'All' | Branch | 'Custom'; onClose: () => void;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
  leftoverBalance: number;
}) {
  // BUG FIX (2026-08-07): this always built a checklist entry for every
  // branch that ordered the item, regardless of which branch tab the
  // planner was actually working from. Clicking "Dispatch" while filtered
  // to VRSNB still opened a modal pre-selecting VRSNB *and* SNB (or
  // whichever other branches also ordered that item) — an easy way to
  // accidentally dispatch to a branch you weren't even looking at. When
  // the page is scoped to one branch, scope this modal to that same branch;
  // only the unfiltered "All" view still shows every requesting branch.
  // BUG FIX (audit 2026-08-26): this used to require order.targetBranch to
  // literally equal the bucket branch — for a cross-branch merged item
  // (branchSplit), that meant the item was only ever visible under
  // whichever branch happened to survive as the order's own target_branch,
  // making its OTHER branch's portion invisible and undispatchable from
  // this modal (same bug class already fixed in the VRSNB/SNB dispatch
  // flows elsewhere in this file). Now includes one entry per branch the
  // item is actually split across, each carrying its own requestedQty so
  // downstream code uses the real per-branch share, not the item's full
  // combined quantity.
  const branchOrders = useMemo(() => {
    const map = new Map<string, { order: BakeryOrder; item: BakeryOrderItem; requestedQty: number }[]>();
    for (const orderId of row.contributingOrderIds) {
      const order = orders.find(o => o.id === orderId);
      const item = order?.items.find(i => sameItem(i.itemName, row.itemName));
      if (!order || !item) continue;
      const splitEntries: [string, number][] = item.branchSplit && Object.keys(item.branchSplit).length > 0
        ? Object.entries(item.branchSplit).filter(([, q]) => q)
        : (order.targetBranch ? [[order.targetBranch, item.dispatchUnit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity]] : []);
      for (const [branch, requestedQty] of splitEntries) {
        if (branchFilter !== 'All' && branch !== branchFilter) continue;
        if (!map.has(branch)) map.set(branch, []);
        map.get(branch)!.push({ order, item, requestedQty });
      }
    }
    return map;
  }, [row, orders, branchFilter]);

  // Suggested quantity now automatically factors in the shared Closing
  // Stock/leftover balance — previously this only defaulted from today's
  // recorded production (row.preparedTotal), so stock already sitting in
  // leftover needed a separate manual "Use it" button before it actually
  // got dispatched. The ledger balance already reflects preparedTotal's own
  // contribution (production-complete credits it, dispatch debits it), so
  // taking whichever is larger is just a safety margin against a
  // momentarily stale balance read, not double-counting.
  const availableToDispatch = Math.max(row.preparedTotal, leftoverBalance);
  // BUG FIX (audit 2026-08-26): autoSplitForItem is branch-unaware (it
  // splits by whole-order quantity, not by branch) — for a merged item now
  // appearing under multiple branches (see branchOrders above), that would
  // suggest the SAME order's full combined quantity under both branches at
  // once. Compute the suggestion directly from each entry's own
  // requestedQty instead, proportional across every entry from every
  // branch bucket combined, keyed by orderId::branch so the same order's
  // two branch portions get independent suggested amounts.
  const entryKey = (orderId: string, branch: string) => `${orderId}::${branch}`;
  const autoSplit = useMemo(() => {
    const allEntries: { key: string; requestedQty: number }[] = [];
    for (const [branch, entries] of branchOrders) {
      for (const { order, requestedQty } of entries) allEntries.push({ key: entryKey(order.id, branch), requestedQty });
    }
    const totalRequested = allEntries.reduce((s, e) => s + e.requestedQty, 0) || 1;
    const split: Record<string, number> = {};
    for (const e of allEntries) split[e.key] = Math.round((availableToDispatch * (e.requestedQty / totalRequested)) * 100) / 100;
    return split;
  }, [branchOrders, availableToDispatch]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const branchKeys = useMemo(() => Array.from(branchOrders.keys()), [branchOrders]);
  // Which branches to actually dispatch right now — defaults to all, but the
  // planner can dispatch just VRSNB, just SNB, or both together.
  const [selectedBranches, setSelectedBranches] = useState<string[]>(branchKeys);
  useEffect(() => { setSelectedBranches(branchKeys); }, [branchKeys.join(',')]);
  const toggleBranch = (b: string) => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const qtyFor = (orderId: string, branch: string) => {
    const k = entryKey(orderId, branch);
    return qty[k] !== undefined ? Number(qty[k] || 0) : Math.round((autoSplit[k] ?? 0) * 100) / 100;
  };
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  const CHECKLIST_BY_BRANCH: Record<string, string[]> = {
    SNB: ['Verify SNB quantity matches this checklist', 'Cross-check SNB boxes/kg/pcs before loading', 'Check packaging is intact and labeled', 'Load onto SNB delivery vehicle', 'Hand over and get SNB counter sign-off'],
    VRSNB: ['Verify VRSNB quantity matches this checklist', 'Pack VRSNB items in labeled crates', 'Check packaging is intact and labeled', 'Load onto VRSNB delivery vehicle', 'Hand over and get VRSNB counter sign-off'],
    Hosur: ['Verify Hosur shop-wise split matches this checklist', 'Pack per-shop bags separately for Hosur', 'Check packaging is intact and labeled', 'Load onto Hosur delivery vehicle', 'Hand over and get Hosur receiver sign-off'],
  };
  const checklistFor = (branch: string) => CHECKLIST_BY_BRANCH[branch] || CHECKLIST_BY_BRANCH.SNB;

  // WORKFLOW CHANGE (2026-08-08 audit): this was the one remaining dispatch
  // entry point in the whole tab that still called onDispatch directly —
  // every other surface (BranchFlatDispatchPanel, HosurShopDispatchPanel,
  // BulkDispatchModal below) now routes through DispatchReviewModal for
  // price/discount entry + invoice generation. This modal can span more
  // than one branch at once (e.g. an item both SNB and VRSNB ordered), so
  // "Confirm Dispatch" now builds one PendingDispatchAction batch per
  // selected branch and steps through DispatchReviewModal once per branch —
  // physical checklist printing above is unchanged, this only replaces the
  // final instant-dispatch step with the same review+price+invoice step
  // used everywhere else.
  const [reviewQueue, setReviewQueue] = useState<{ scope: Branch; actions: PendingDispatchAction[] }[] | null>(null);

  const buildReviewQueue = () => {
    const queue: { scope: Branch; actions: PendingDispatchAction[] }[] = [];
    for (const [branch, entries] of branchOrders) {
      if (!selectedBranches.includes(branch)) continue;
      const actions: PendingDispatchAction[] = [];
      for (const { order, item, requestedQty } of entries) {
        const q = qtyFor(order.id, branch);
        if (q <= 0) continue;
        // CRITICAL BUG FIX (2026-08-07, preserved): the suggested quantity
        // above (autoSplit) never subtracted what this specific order-item
        // had already been sent — hard-cap every send at what's genuinely
        // still outstanding for this order.
        // BUG FIX (audit 2026-08-26): use requestedQty (this entry's own
        // per-branch share, already correct whether or not the item is
        // merged) instead of the item's full combined quantity, which
        // would overstate what's outstanding for a merged item's single
        // branch portion.
        const requestedForOrder = requestedQty;
        // BUG FIX (2026-08-19): "dispatching more than requested silently
        // reverts to the requested amount." The cap below exists to guard
        // the AUTO-SUGGESTED quantity (autoSplit) against a calculation bug
        // that could suggest more than genuinely remains outstanding — see
        // the preserved comment above. It was never meant to also override
        // a planner's own deliberate choice to type in a larger number (e.g.
        // sending surplus stock proactively), but qtyFor() doesn't
        // distinguish the two once it returns a plain number, so the cap was
        // silently clamping both cases the same way. isManualQty checks the
        // qty state directly (present only when the planner actually edited
        // this order's input) so the safety net still applies to
        // unreviewed auto-suggestions, but a typed-in value is respected as-is.
        const isManualQty = qty[entryKey(order.id, branch)] !== undefined;
        // BUG FIX (2026-08-09): "Rasamalai 10pcs / Malaikulla 5pcs auto-moving
        // to Dispatched without being dispatched" — an "extra / non-requested
        // item" dispatch (isExtra:true) gets anchored to whatever order
        // happens to be first for that branch (see anchorOrderId above), which
        // can be a totally unrelated order that also has this same item name
        // as a genuinely requested line. Every "how much has been dispatched
        // against what was actually requested" calculation in this file
        // pooled ALL dispatch-log entries matching the item name regardless
        // of isExtra, so an ad-hoc extra send could silently satisfy (and
        // hide) a real order's own never-actually-dispatched line for the
        // same item. Extra entries are still recorded and reported — they
        // just no longer count toward "requested quantity fulfilled".
        // Same fix as the other dispatch flows above: only this branch's
        // own dispatch entries count toward "already sent" for this
        // branch — a merged order's dispatches to a different branch must
        // not inflate this branch's remaining calc.
        const alreadyForOrder = (order.dispatchLog || []).filter(d => sameItem(d.itemName, item.itemName) && !d.isExtra && d.branch === branch).reduce((s, d) => s + d.quantity, 0);
        const remainingForOrder = Math.max(0, Math.round((requestedForOrder - alreadyForOrder) * 100) / 100);
        const cappedQ = isManualQty ? q : Math.min(q, remainingForOrder);
        if (cappedQ <= 0.001) continue;
        const withinRequest = Math.min(cappedQ, remainingForOrder);
        const beyondRequest = Math.round((cappedQ - withinRequest) * 1000) / 1000;
        if (withinRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: withinRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${item.itemName}`) });
        }
        if (beyondRequest > 0.001) {
          actions.push({ orderId: order.id, itemName: item.itemName, quantity: beyondRequest, unit: item.dispatchUnit || 'kg', dispatchEntryId: getId(`${order.id}:${item.itemName}:extra`), isExtra: true });
        }
      }
      if (actions.length > 0) queue.push({ scope: branch as Branch, actions });
    }
    if (queue.length === 0) return;
    setReviewQueue(queue);
  };

  const printChecklist = (mode: 'thermal' | 'a4') => {
    const sections = Array.from(branchOrders.entries()).filter(([branch]) => selectedBranches.includes(branch)).map(([branch, entries]) => {
      const qtyTotal = entries.reduce((s, { order }) => s + qtyFor(order.id, branch), 0);
      const requested = row.perBranch[branch as Branch] ?? 0;
      // BUG FIX (audit 2026-08-26): use requestedQty (this entry's own
      // per-branch share) instead of the item's full combined quantity —
      // otherwise a merged item's printed checklist would show the whole
      // combined amount as "requested" under each branch section.
      const orderLines = entries.map(({ order, requestedQty }) =>
        `<div class="order-line">Order #${order.orderNumber} — requested ${requestedQty} ${row.unit}, dispatching ${qtyFor(order.id, branch)} ${row.unit}</div>`
      ).join('');
      const checks = checklistFor(branch).map(s => `<label class="check"><input type="checkbox" /> ${s}</label>`).join('');
      return `
        <div class="section">
          <h2>${branch} — ${row.itemName}</h2>
          <div class="meta">Requested: ${requested} ${row.unit} &nbsp;·&nbsp; Dispatching now: ${qtyTotal} ${row.unit} &nbsp;·&nbsp; Produced total: ${row.preparedTotal} ${row.unit}</div>
          <div class="orders">${orderLines}</div>
          <div class="checklist">${checks}</div>
          <div class="sign">
            <div class="sign-box">Dispatched By: ${dispatchedBy} ______________________</div>
            <div class="sign-box">Received By (Sign): ______________________</div>
            <div class="sign-box">Date/Time: ${new Date().toLocaleString('en-IN')}</div>
          </div>
        </div>`;
    }).join('<hr/>');

    const style = mode === 'thermal'
      ? `@page { size: 80mm auto; margin: 4mm; } body { font-family: monospace; font-size: 11px; width: 72mm; }
         h2 { font-size: 12px; } .meta { font-size: 10px; } .order-line { font-size: 11px; } .check { display:block; font-size: 11px; margin: 2px 0; }
         .sign-box { font-size: 10px; margin-top: 6px; }`
      : `@page { size: auto; margin: 12mm; } body { font-family: sans-serif; font-size: 14px; }
         h2 { font-size: 16px; } .meta { font-size: 12px; color: #555; } .order-line { font-size: 13px; } .check { display:block; font-size: 13px; margin: 4px 0; }
         .sign-box { font-size: 12px; margin-top: 10px; }`;

    printViaIframe(`<html><head><title>Dispatch Checklist — ${row.itemName}</title><style>${style}
      body { padding: 12px; } .checklist { margin: 8px 0; } .check input { margin-right: 6px; } .meta { margin-bottom: 6px; }
      .sign { margin-top: 12px; border-top: 1px dashed #999; padding-top: 8px; }
    </style></head><body>${sections}</body></html>`);
  };

  if (reviewQueue) {
    if (reviewQueue.length === 0) {
      // Queue fully drained (every selected branch dispatched + invoiced) —
      // nothing left to review, close the whole checklist flow.
      resetDispatchIds();
      onClose();
      return null;
    }
    const current = reviewQueue[0];
    return (
      <DispatchReviewModal
        scope={current.scope}
        actions={current.actions}
        dispatchedBy={dispatchedBy}
        onDispatch={onDispatch}
        onClose={() => setReviewQueue(q => (q ?? []).slice(1))}
        onDone={() => {}}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black text-foreground">Dispatch Checklist — {row.itemName}</p>
        <>
            {leftoverBalance > row.preparedTotal + 0.01 && (
              <p className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800">
                <PackageCheck className="size-3.5 shrink-0" /> {qtyFmt(leftoverBalance)} {row.unit} available in leftover — already included in the quantities below.
              </p>
            )}
            {branchKeys.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-[11px] font-black text-muted-foreground">Dispatch for:</span>
                {branchKeys.map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBranch(b)}
                    className={cn('rounded-full border px-3 py-1 text-[11px] font-black', selectedBranches.includes(b) ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-border bg-white text-muted-foreground')}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-3">
              {Array.from(branchOrders.entries()).filter(([branch]) => selectedBranches.includes(branch)).map(([branch, entries]) => (
                <div key={branch} className="rounded-xl border border-border p-3">
                  <p className="mb-1.5 text-xs font-black text-foreground">{branch} (requested {row.perBranch[branch as Branch] ?? 0} {row.unit})</p>
                  {entries.map(({ order, requestedQty }) => (
                    <div key={order.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs font-bold text-muted-foreground">Order #{order.orderNumber} · requested {requestedQty} {row.unit}</span>
                      <input type="number" step={row.unit === 'pcs' ? 1 : 0.001} value={qty[entryKey(order.id, branch)] ?? qtyFor(order.id, branch)} onChange={e => setQty(v => ({ ...v, [entryKey(order.id, branch)]: sanitizeQtyForUnit(e.target.value, row.unit) }))} className="w-24 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold" />
                    </div>
                  ))}
                  <ul className="mt-2 space-y-1 text-[11px] font-semibold text-muted-foreground">
                    {checklistFor(branch).map(s => (
                      <li key={s} className="flex items-center gap-1.5">
                        <input type="checkbox" className="size-3.5 rounded border-slate-300" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => printChecklist('thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Print Thermal</button>
              <button onClick={() => printChecklist('a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Print A4</button>
              <button onClick={onClose} className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200">Cancel</button>
              <button onClick={buildReviewQueue} disabled={selectedBranches.length === 0} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                <Truck className="size-4" /> Review &amp; Dispatch{selectedBranches.length > 1 ? ` (${selectedBranches.join(' + ')})` : ''}
              </button>
            </div>
        </>
      </div>
    </div>
  );
}

// ─── Dispatch review — checklist + price/discount + invoice, one screen ───
// WORKFLOW CHANGE (2026-08-08): "when we select the item and click on
// dispatch, it should not directly go to SNB orders dashboard" — every
// multi-item dispatch surface (BranchFlatDispatchPanel, HosurShopDispatchPanel,
// extra-item sends) used to call submitDispatch the instant "Dispatch" was
// clicked, which writes straight to branch_incoming (the branch's own live
// order dashboard) with zero review step. This modal is now the ONLY place
// any of those surfaces actually calls submitDispatch — every "Dispatch"
// button just opens this instead. Nothing reaches the branch until the
// planner reviews the checklist here, confirms price + discount, and clicks
// Confirm. Confirming also generates and stores an invoice (dispatch_invoices
// table) so it can be reprinted later — the same batch can be printed 2-3
// times if needed, per "sometimes I should print the bill 3 times."
export interface PendingDispatchAction {
  orderId: string;
  itemName: string;
  quantity: number;
  unit: 'pcs' | 'kg';
  dispatchEntryId: string;
  targetHosurOrderId?: string;
  isExtra?: boolean;
}

function DispatchReviewModal({ scope, hosurShop, customer, actions, dispatchedBy, onDispatch, onClose, onDone }: {
  scope: Branch;
  hosurShop?: { id: string; name: string; phone: string } | null;
  // FEATURE (2026-08-09): Custom dispatch — when set, this review is for a
  // planning-stock item sold direct to a walk-in customer rather than to a
  // branch/shop. `scope` is still passed through (needed for invoice
  // numbering + as the technical branch value on the dispatch entry) but the
  // UI, pricing lookup, and printed invoice all key off `customer` instead.
  customer?: { name: string; phone: string; address: string } | null;
  actions: PendingDispatchAction[];
  dispatchedBy: string;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch'];
  onClose: () => void;
  onDone: () => void;
}) {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const [hosurPrices, setHosurPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(scope !== 'Hosur');
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
  const [discountPct, setDiscountPct] = useState(customer ? 0 : defaultDiscountPct(scope));
  const [sending, setSending] = useState(false);
  // BUG FIX (2026-08-19): "same invoice shows multiple times after
  // dispatching" — `sending` is React state, which updates asynchronously.
  // A fast double-click/double-tap could fire confirm() twice before the
  // button's own re-render with disabled={sending} actually took effect,
  // each call independently calling saveDispatchInvoice() and creating a
  // genuine duplicate row. Same root cause and same fix as
  // checkoutInFlightRef in BillingDashboard.tsx — a ref is checked and set
  // synchronously, before any state update or re-render can happen.
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispatchInvoiceRecord | null>(null);

  useEffect(() => {
    if (scope === 'Hosur') return;
    loadCatalog(scope).catch(() => {});
    // Custom sales can be priced off either branch's catalog (planning-stock
    // items are picked from the combined SNB+VRSNB list), so load both.
    if (customer) loadCatalog(scope === 'SNB' ? 'VRSNB' : 'SNB').catch(() => {});
  }, [scope, loadCatalog, customer]);

  useEffect(() => {
    if (scope !== 'Hosur' || !hosurShop) return;
    let cancelled = false;
    (async () => {
      setLoadingPrices(true);
      const { data, error: err } = await supabase.from('hosur_shop_price_lists').select('item_name, unit_price').eq('shop_id', hosurShop.id).eq('is_active', true);
      if (cancelled) return;
      if (!err && data) {
        const map: Record<string, number> = {};
        for (const row of data as { item_name: string; unit_price: number }[]) {
          map[row.item_name.trim().toLowerCase()] = Number(row.unit_price) || 0;
        }
        setHosurPrices(map);
      }
      setLoadingPrices(false);
    })();
    return () => { cancelled = true; };
  }, [scope, hosurShop]);

  // One line per distinct item name — multiple actions can share an item
  // (e.g. the same item split across two bakery_orders rows), but the
  // checklist/invoice should show one combined line for it.
  const displayItems = useMemo(() => {
    const byName = new Map<string, { itemName: string; unit: string; quantity: number }>();
    for (const a of actions) {
      // BUG FIX: "Bun showing twice, quantities split across two rows" —
      // this map was keyed by the raw, case-sensitive itemName. Two
      // contributing orders with the same logical item but different
      // casing (e.g. "Bun" from one order, "BUN" from another — branches
      // aren't always perfectly consistent about case) landed in two
      // separate map entries, each showing only its own partial quantity
      // instead of the combined total under one row. Normalize the KEY
      // only (matching sameItem()'s case-insensitive comparison used
      // throughout this file) — the row still displays whichever casing
      // was seen first, so nothing changes for the normal case where
      // every contributing order already agrees on casing.
      const key = a.itemName.trim().toLowerCase();
      const cur = byName.get(key) ?? { itemName: a.itemName, unit: a.unit, quantity: 0 };
      // BUG FIX: "for pcs item never allow decimal points" — round each
      // action's own contribution before summing, matching exactly how
      // confirm() rounds each action individually before submitting (each
      // action is one order's own separate dispatch entry, so rounding
      // per-action rather than the combined total keeps the displayed sum
      // consistent with what actually gets dispatched to each order).
      const contribution = a.unit === 'pcs' ? Math.round(a.quantity) : a.quantity;
      cur.quantity = Math.round((cur.quantity + contribution) * 1000) / 1000;
      byName.set(key, cur);
    }
    // BUG FIX: "selection order still showing alphabetical" — this was the
    // actual root cause. Map already preserves insertion order matching
    // actions' own order (which the earlier upstream fix made match click
    // order) — this leftover .sort(a,b => localeCompare) was silently
    // re-alphabetizing right at this final display step, undoing that fix
    // entirely without it being visible anywhere upstream.
    return Array.from(byName.values());
  }, [actions]);

  const priceFor = (itemName: string): number | null => {
    const override = priceOverrides[itemName];
    if (override !== undefined && override.trim() !== '') return Number(override) || 0;
    if (customer) {
      // Combined SNB + VRSNB lookup — matches how the Planning tab's item
      // picker sources items in the first place.
      const combined = [...(catalogItems.SNB ?? []), ...(catalogItems.VRSNB ?? [])];
      const match = combined.find(i => i.name.trim().toLowerCase() === itemName.trim().toLowerCase());
      return match && match.price > 0 ? match.price : null;
    }
    if (scope === 'Hosur') {
      const p = hosurPrices[itemName.trim().toLowerCase()];
      return p !== undefined && p > 0 ? p : null;
    }
    const list = catalogItems[scope as 'SNB' | 'VRSNB'] ?? [];
    const match = list.find(i => i.name.trim().toLowerCase() === itemName.trim().toLowerCase());
    return match && match.price > 0 ? match.price : null;
  };

  const invoiceLines: DispatchInvoiceItem[] = displayItems.map(d => {
    const price = priceFor(d.itemName);
    const unitPrice = price ?? 0;
    return { itemName: d.itemName, unit: d.unit, quantity: d.quantity, unitPrice, lineTotal: Math.round(d.quantity * unitPrice * 100) / 100 };
  });
  const missingPriceItems = displayItems.filter(d => priceFor(d.itemName) === null);
  const subtotal = invoiceLines.reduce((s, i) => s + i.lineTotal, 0);
  // BUG FIX (audit item #12): same fix as EditDispatchInvoiceModal above —
  // clamp discountPct defensively and add the missing Math.max(0, ...) on
  // total, matching the two invoice flows that already do both correctly.
  const clampedDiscountPct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const discountAmount = Math.round(subtotal * (clampedDiscountPct / 100) * 100) / 100;
  const total = Math.max(0, Math.round(subtotal - discountAmount));

  const printChecklist = (mode: 'thermal' | 'a4') => {
    const business = businessFor(scope);
    const title = customer ? `Custom Sale — ${customer.name}` : scope === 'Hosur' && hosurShop ? `${scope} — ${hosurShop.name}` : scope;
    const rows = displayItems.map(d => `<div class="order-line">${d.itemName} — ${d.quantity} ${d.unit}</div>`).join('');
    const style = mode === 'thermal'
      ? `@page { size: 80mm auto; margin: 4mm; } body { font-family: monospace; font-size: 11px; width: 72mm; }`
      : `@page { size: auto; margin: 12mm; } body { font-family: sans-serif; font-size: 14px; }`;
    printViaIframe(`<html><head><title>Dispatch Checklist — ${title}</title><style>${style}
      body { padding: 12px; } h2 { margin: 0 0 4px; } .meta { font-size: 11px; color: #555; margin-bottom: 8px; }
      .order-line { padding: 3px 0; border-bottom: 1px dashed #ccc; }
      .check { display:block; margin: 4px 0; } .sign { margin-top: 16px; border-top: 1px dashed #999; padding-top: 10px; }
      .sign-box { margin-top: 6px; }
    </style></head><body>
      <h2>${business.name} — Dispatch Checklist</h2>
      <div class="meta">${title} &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp; ${displayItems.length} item${displayItems.length === 1 ? '' : 's'}</div>
      ${rows}
      <div class="sign">
        <label class="check"><input type="checkbox" /> Quantity verified against this checklist</label>
        <label class="check"><input type="checkbox" /> Packaging intact and labeled</label>
        <div class="sign-box">Dispatched By: ${dispatchedBy} ______________________</div>
        <div class="sign-box">Received By (Sign): ______________________</div>
      </div>
    </body></html>`);
  };

  const confirm = async () => {
    if (sendingRef.current) return;
    if (missingPriceItems.length > 0) {
      setError(`Enter a price for: ${missingPriceItems.map(i => i.itemName).join(', ')} before dispatching.`);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      for (const a of actions) {
        // BUG FIX: "for pcs item never allow decimal points" — proportional
        // splitting (across contributing orders, or across branches for a
        // merged item) can produce a fractional result like 11.64 pcs,
        // which is physically meaningless — you can't dispatch 0.64 of a
        // piece. Rounded here, at the single point every dispatch flow
        // (VRSNB/SNB, Hosur, Custom, Planned) funnels through to actually
        // submit, rather than in each upstream split function separately.
        // kg quantities are untouched — fractional kg is completely normal.
        const quantity = a.unit === 'pcs' ? Math.round(a.quantity) : a.quantity;
        if (a.unit === 'pcs' && quantity <= 0) continue; // rounds to nothing — skip rather than submit a zero/negative dispatch
        await onDispatch(a.orderId, {
          id: a.dispatchEntryId,
          itemName: a.itemName,
          quantity,
          unit: a.unit,
          branch: scope,
          dispatchedBy,
          dispatchedAt: new Date().toISOString(),
          ...(a.targetHosurOrderId ? { targetHosurOrderId: a.targetHosurOrderId } : {}),
          ...(a.isExtra ? { isExtra: true } : {}),
          ...(customer ? { isCustomSale: true, customerName: customer.name } : {}),
        });
      }
      const record = await saveDispatchInvoice({
        scope,
        hosurShopId: hosurShop?.id ?? null,
        hosurShopName: hosurShop?.name ?? null,
        hosurShopPhone: hosurShop?.phone ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        customerAddress: customer?.address ?? null,
        dispatchedBy,
        items: invoiceLines,
        discountPct,
        dispatchEntryIds: actions.map(a => ({ orderId: a.orderId, dispatchEntryId: a.dispatchEntryId })),
      });
      setResult(record);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        {!result ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-foreground">
                {customer ? `Custom Sale Review — ${customer.name}` : `Dispatch Review — ${scope}${scope === 'Hosur' && hosurShop ? ` · ${hosurShop.name}` : ''}`}
              </p>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">
              {customer
                ? `Double-check quantities, confirm prices, then dispatch. Nothing is sold to ${customer.name} until you confirm below.`
                : `Double-check quantities, confirm prices, then dispatch. Nothing is sent to ${scope} until you confirm below.`}
            </p>
            {customer && (
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                {customer.phone}{customer.address ? ` · ${customer.address}` : ''}
              </p>
            )}

            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left font-black uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map(d => {
                    const price = priceFor(d.itemName);
                    const missing = price === null;
                    return (
                      <tr key={d.itemName} className={cn('border-t border-border', missing && 'bg-red-50')}>
                        <td className="px-3 py-2 font-bold text-foreground">
                          {d.itemName}
                          {missing && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">NO PRICE — enter below</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{d.quantity} {d.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number" min={0} placeholder={loadingPrices ? '…' : '0.00'}
                            value={priceOverrides[d.itemName] ?? (price !== null ? String(price) : '')}
                            onChange={e => setPriceOverrides(v => ({ ...v, [d.itemName]: e.target.value }))}
                            className={cn('w-20 rounded-lg border px-2 py-1 text-right', missing ? 'border-red-400 bg-white' : 'border-border')}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-black text-foreground">{(price ?? 0) > 0 ? `Rs. ${(d.quantity * (price ?? 0)).toFixed(2)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <Percent className="size-3.5" /> Discount %
                <input
                  type="number" min={0} max={100} step={0.5} value={discountPct}
                  onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-16 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                />
              </label>
              <div className="text-right text-xs font-bold text-muted-foreground">
                Subtotal Rs. {subtotal.toFixed(2)} &nbsp;·&nbsp; Discount Rs. {discountAmount.toFixed(2)} &nbsp;·&nbsp;
                <span className="text-sm font-black text-foreground"> Total Rs. {total.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="mt-2 text-[11px] font-bold text-red-700">{error}</p>}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => printChecklist('thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Checklist (Thermal)</button>
              <button onClick={() => printChecklist('a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Checklist (A4)</button>
              <button onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={confirm} disabled={sending} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Confirm Dispatch
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-black text-teal-700">Dispatched — Invoice {result.invoiceNo} created (Rs. {result.total.toFixed(2)}).</p>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">Stored under this batch — reprint any time from the Invoice tab.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => printDispatchInvoice(result, 'thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Invoice (Thermal)</button>
              <button onClick={() => printDispatchInvoice(result, 'a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Invoice (A4)</button>
              <button onClick={onClose} className="rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-white">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Leftover / Done ───────────────────────────────────────────────────
// Folded into the Closing Stock tab (2026-08-06) — this is the older,
// order-level "has someone physically checked on this order's leftover"
// checklist. It's separate from the quantified Closing Stock pool above
// (no item/qty detail, just a per-order flag), kept here as a simple
// reconciliation checklist so nothing that used to work is lost.
function LeftoverDoneTab({ active, done }: { active: BakeryOrder[]; done: BakeryOrder[] }) {
  const { markDone } = useBakeryStore();
  // BUG FIX (audit 2026-08-26): same fix as OrderCard's branch badge in
  // StoreDashboard — a merged, cross-branch order's own targetBranch is
  // only whichever source order survived as primary; show every branch
  // it actually involves via branchSplit instead.
  const branchLabelFor = (order: BakeryOrder): string => {
    const set = new Set<string>();
    for (const item of order.items) if (item.branchSplit) for (const b of Object.keys(item.branchSplit)) set.add(b);
    if (set.size === 0 && order.targetBranch) set.add(order.targetBranch);
    return Array.from(set).join(' + ') || '—';
  };
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div>
        <p className="mb-3 text-xs font-semibold text-muted-foreground">Order-level checklist — separate from the quantified pool above. Use this to confirm every dispatched order has been physically checked for leftovers.</p>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">Dispatched Orders Awaiting Reconciliation ({active.length})</h2>
          <div className="flex gap-2">
          <RefreshOrdersButton />
          <ExportButton
            disabled={active.length === 0 && done.length === 0}
            onClick={() => exportToExcel({
              filename: 'leftover-done', sheetName: 'Leftover-Done', title: 'Planner — Leftover / Done',
              columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Branch', key: 'branch' }, { header: 'Status', key: 'status' }],
              rows: [
                ...active.map(o => ({ orderNumber: o.orderNumber, branch: branchLabelFor(o), status: 'Active Leftover' })),
                ...done.map(o => ({ orderNumber: o.orderNumber, branch: branchLabelFor(o), status: 'Done' })),
              ],
            })}
          />
          </div>
        </div>
        {active.length === 0 ? <EmptyState text="No leftovers pending reconciliation." /> : (
          <div className="space-y-2">
            {active.map(order => (
              <div key={order.id} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <p className="text-sm font-black text-amber-800">{branchLabelFor(order)} · Order #{order.orderNumber}</p>
                  <p className="text-xs font-semibold text-amber-700">Dispatched — awaiting reconciliation.</p>
                </div>
                <button onClick={() => markDone(order.id)} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">
                  <CheckCircle2 className="size-4" /> Mark Done
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-black text-foreground">Done ({done.length})</h2>
        {done.length === 0 ? <EmptyState text="Nothing marked done yet." /> : (
          <div className="space-y-2">
            {done.map(order => (
              <div key={order.id} className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
                <p className="text-sm font-black text-teal-800">{branchLabelFor(order)} · Order #{order.orderNumber} — Done</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-40"
    >
      <FileSpreadsheet className="size-4" /> Export Excel
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
      <AlertTriangle className="size-6 text-slate-300" />
      <p className="text-xs font-bold text-muted-foreground">{text}</p>
    </div>
  );
}

// FEATURE (2026-08-25, audit #11): "New Dump/Damage tab, copied from SNB
// Admin" — adapted from AdminSNBDashboard.tsx's WasteLogsTab, generalized
// for Planner's multi-branch context (a branch selector, since Planner
// operates across VRSNB and SNB rather than one fixed branch). Deliberately
// scoped down from the reference implementation in two ways:
// 1. Only Dump/Damage sub-tabs — omits "Trans Out", since Planner already
//    has a separate, working Transfer Out tab (PlannerTransferOutTab) built
//    on a different backing table (planner_leftover_ledger). Duplicating
//    that here with a second, different mechanism would be confusing.
// 2. Logging + history only, no edit/cancel — the reference implementation's
//    edit/cancel RPCs (edit_snb_waste_log_secure, cancel_snb_waste_log_secure)
//    turned out to be genuinely hardcoded to SNB only (branch='SNB' baked
//    directly into the query, not a parameter), which is a much larger,
//    separate change than generalizing the logging path. Left out rather
//    than rushed.
// The actual stock-deducting RPC (record_branch_waste_batch_secure /
// record_branch_waste_secure) already supported SNB and VRSNB generically —
// it just didn't allow the 'planner' role, and the shared permission
// function hardcodes 'planner' to a single home branch ('Hosur'), which
// would've blocked this even after adding the role. Fixed narrowly, inside
// only that one RPC, without touching the shared function other RPCs rely on.
function PlannerWasteLogsTab() {
  const currentUser = useAuthStore(s => s.currentUser);
  const userName = currentUser?.displayName || currentUser?.username || 'Planner';
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const { stock, fetchBranchData } = useBranchStore();
  const [branch, setBranch] = useState<'VRSNB' | 'SNB'>('VRSNB');
  const [subTab, setSubTab] = useState<'Dump' | 'Damage'>('Dump');

  useEffect(() => { void loadCatalog(branch); void fetchBranchData(branch); }, [branch, loadCatalog, fetchBranchData]);

  const activeCatalog = useMemo(() => (catalogItems[branch] ?? []).filter(i => i.active).sort((a, b) => a.name.localeCompare(b.name)), [catalogItems, branch]);
  const branchStock = stock[branch] ?? [];
  const stockRowFor = (itemName: string) => {
    const catalogItem = activeCatalog.find(i => i.name.trim().toLowerCase() === itemName.trim().toLowerCase());
    return branchStock.find(s =>
      catalogItem?.barcode != null && s.itemBarcode != null
        ? s.itemBarcode === catalogItem.barcode
        : s.itemName.trim().toLowerCase() === itemName.trim().toLowerCase());
  };

  const [lineDraft, setLineDraft] = useState({ itemName: '', quantity: '', unit: 'pcs' as string });
  useEffect(() => {
    if (!lineDraft.itemName && activeCatalog.length > 0) {
      const first = activeCatalog[0];
      setLineDraft({ itemName: first.name, quantity: '', unit: first.uom === 'Kgs' ? 'kg' : 'pcs' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed the default once catalog loads, not on every re-render.
  }, [activeCatalog.length]);
  const [lines, setLines] = useState<Array<{ lineId: string; itemName: string; quantity: string; unit: string }>>([]);
  const [meta, setMeta] = useState({ reason: '', verifiedBy: '' });
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  // Reset queued lines when switching sub-tab or branch, same reasoning as
  // the reference implementation: a Dump list shouldn't bleed into Damage,
  // and a VRSNB list shouldn't bleed into SNB.
  useEffect(() => { setLines([]); setValidationError(''); }, [subTab, branch]);

  const draftCurrentQty = Number(stockRowFor(lineDraft.itemName)?.quantity || 0);
  const queuedForDraftItem = lines.filter(l => l.itemName.trim().toLowerCase() === lineDraft.itemName.trim().toLowerCase()).reduce((s, l) => s + Number(l.quantity || 0), 0);
  const draftRemaining = Math.max(0, draftCurrentQty - queuedForDraftItem);

  const addLine = () => {
    setValidationError('');
    const qty = Number(lineDraft.quantity);
    if (!lineDraft.itemName || !Number.isFinite(qty) || qty <= 0) {
      setValidationError('Enter a valid quantity greater than zero.');
      return;
    }
    if (qty > draftRemaining) {
      setValidationError(`Cannot queue ${qty} ${lineDraft.unit} for ${lineDraft.itemName}; only ${draftRemaining} available (after items already added).`);
      return;
    }
    setLines(prev => [...prev, { lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemName: lineDraft.itemName, quantity: lineDraft.quantity, unit: lineDraft.unit }]);
    setLineDraft(prev => ({ ...prev, quantity: '' }));
  };
  const removeLine = (lineId: string) => setLines(prev => prev.filter(l => l.lineId !== lineId));

  const [rows, setRows] = useState<Array<{ id: string; logType: string; itemName: string; quantity: number; unit: string; reason: string; verifiedBy: string; createdBy: string; createdAt: string }>>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    const { data, error: loadError } = await supabase
      .from('branch_waste_logs')
      .select('id,log_type,item_name,quantity,unit,reason,verified_by,created_by_username,created_at,status')
      .eq('branch', branch)
      .in('log_type', ['Dump', 'Damage'])
      .order('created_at', { ascending: false })
      .limit(200);
    setRowsLoading(false);
    if (!loadError && data) {
      setRows((data as Record<string, unknown>[]).map(d => ({
        id: d.id as string, logType: d.log_type as string, itemName: d.item_name as string,
        quantity: Number(d.quantity) || 0, unit: d.unit as string, reason: (d.reason as string) || '',
        verifiedBy: (d.verified_by as string) || '', createdBy: (d.created_by_username as string) || '',
        createdAt: d.created_at as string,
      })).filter(r => (data.find(d => d.id === r.id) as Record<string, unknown>)?.status !== 'Cancelled'));
    }
  }, [branch]);
  useEffect(() => { void loadRows(); }, [loadRows]);

  const save = async () => {
    setValidationError(''); setNotice('');
    if (lines.length === 0) { setValidationError('Add at least one item to the list before saving.'); return; }
    if (!meta.reason.trim() || !meta.verifiedBy.trim()) { setValidationError('Reason and Verified By are mandatory.'); return; }
    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('record_branch_waste_batch_secure', {
        p_branch: branch,
        p_log_type: subTab,
        p_items: lines.map(line => {
          const catalogItem = activeCatalog.find(i => i.name.trim().toLowerCase() === line.itemName.trim().toLowerCase());
          const currentRow = stockRowFor(line.itemName);
          return { itemBarcode: catalogItem?.barcode ?? null, itemName: currentRow?.itemName || line.itemName, quantity: Number(line.quantity), unit: line.unit };
        }),
        p_reason: meta.reason.trim(),
        p_verified_by: meta.verifiedBy.trim(),
        p_checklist: [],
      });
      if (rpcError) throw rpcError;
      void useNotificationStore.getState().pushStockMovement({
        branch, logType: subTab,
        items: lines.map(l => ({ itemName: l.itemName, quantity: Number(l.quantity), unit: l.unit })),
        totalValue: lines.reduce((s, l) => s + (activeCatalog.find(i => i.name.trim().toLowerCase() === l.itemName.trim().toLowerCase())?.price || 0) * Number(l.quantity || 0), 0),
        reason: meta.reason.trim(), postedBy: userName, recipientRoles: ['owner'],
      });
      printWasteLogBatch(
        lines.map(l => ({ itemName: l.itemName, quantity: Number(l.quantity), unit: l.unit })),
        subTab, meta.reason, meta.verifiedBy, userName, [], branch,
      );
      setNotice(`${lines.length} item${lines.length > 1 ? 's' : ''} recorded as ${subTab} for ${branch}.`);
      setLines([]);
      setMeta({ reason: '', verifiedBy: '' });
      await Promise.all([loadRows(), fetchBranchData(branch, true)]);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Dump / Damage</h2>
        <div className="flex gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
          {(['VRSNB', 'SNB'] as const).map(b => (
            <button key={b} type="button" onClick={() => setBranch(b)} className={cn('rounded-lg px-3 py-1.5 text-xs font-black', branch === b ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {(['Dump', 'Damage'] as const).map(name => (
          <button key={name} type="button" onClick={() => setSubTab(name)} className={cn('rounded-xl px-4 py-2 text-xs font-black', subTab === name ? 'bg-red-600 text-white' : 'border border-border bg-card text-foreground')}>
            {name}
          </button>
        ))}
      </div>
      {notice && <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{notice}</div>}
      {validationError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{validationError}</div>}
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-black text-foreground">{subTab} Entry — {branch}</h3>
          <label className="block space-y-1">
            <span className="text-xs font-black text-muted-foreground">Item — in stock: {draftRemaining} {lineDraft.unit}</span>
            <select
              className="h-10 w-full rounded-xl border border-border px-3 text-sm font-bold"
              value={lineDraft.itemName}
              onChange={e => { const unit = stockRowFor(e.target.value)?.unit || 'pcs'; setLineDraft({ itemName: e.target.value, quantity: '', unit }); }}
            >
              {activeCatalog.map(i => <option key={i.barcode} value={i.name}>{i.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-black text-muted-foreground">Quantity</span>
              <input type="number" min="0" step="0.001" value={lineDraft.quantity} onChange={e => setLineDraft(prev => ({ ...prev, quantity: e.target.value }))} className="h-10 w-full rounded-xl border border-border px-3 text-sm font-bold" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-muted-foreground">Unit</span>
              <input value={lineDraft.unit} readOnly disabled title="Unit is fixed to the item's live stock unit" className="h-10 w-full rounded-xl border border-border bg-muted px-3 text-sm font-bold text-muted-foreground" />
            </label>
          </div>
          <button type="button" onClick={addLine} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-sm font-black text-white hover:bg-amber-600">
            <Plus className="size-4" /> Add item to list
          </button>
          {lines.length > 0 && (
            <div className="space-y-1.5 rounded-xl bg-muted/30 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{lines.length} item{lines.length > 1 ? 's' : ''} queued</p>
              {lines.map(line => (
                <div key={line.lineId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <span className="text-sm font-bold text-foreground">{line.itemName} · {line.quantity} {line.unit}</span>
                  <button type="button" onClick={() => removeLine(line.lineId)} className="rounded-lg p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"><X className="size-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-black text-muted-foreground">Reason</span>
            <input value={meta.reason} onChange={e => setMeta(prev => ({ ...prev, reason: e.target.value }))} className="h-10 w-full rounded-xl border border-border px-3 text-sm font-bold" placeholder="Why this stock is being removed" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-black text-muted-foreground">Verified By</span>
            <input value={meta.verifiedBy} onChange={e => setMeta(prev => ({ ...prev, verifiedBy: e.target.value }))} className="h-10 w-full rounded-xl border border-border px-3 text-sm font-bold" placeholder="Who checked this" />
          </label>
          <button type="button" disabled={saving} onClick={() => void save()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : `Save ${subTab} Batch`}
          </button>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-black text-foreground">Recent {subTab} entries — {branch}</h3>
          {rowsLoading && <p className="text-xs font-bold text-muted-foreground">Loading…</p>}
          {!rowsLoading && rows.filter(r => r.logType === subTab).length === 0 && <EmptyState text={`No ${subTab.toLowerCase()} entries yet for ${branch}.`} />}
          <div className="space-y-1.5">
            {rows.filter(r => r.logType === subTab).map(r => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-foreground">{r.itemName}</span>
                  <span className="text-sm font-bold text-muted-foreground">{r.quantity} {r.unit}</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.reason} · verified by {r.verifiedBy} · {r.createdBy} · {new Date(r.createdAt).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// FEATURE (2026-08-26): "Batch Calculation sub-tab in Planning" — pick a
// recipe item and a number of batches, get the total kg/pcs output.
// bakery_recipes.output_qty is exactly "how much one batch of this recipe
// yields" (confirmed directly against the table — e.g. Athirasam: 100 pcs
// per batch, Mysore Pak: 8.5 kg per batch), so the calculation itself is
// just outputQty × batches — the useRecipeStore data already carries
// everything needed, no new backend work required.
function BatchCalculationSubTab() {
  const { recipes, loadRecipes } = useRecipeStore();
  useEffect(() => { void loadRecipes(); }, [loadRecipes]);

  const recipeList = useMemo(() => {
    return Object.values(recipes)
      .filter(r => r.outputQty != null && r.outputQty > 0 && r.outputUnit != null)
      .map(r => ({
        itemId: r.itemId,
        // Seed-only recipes (no database override yet) may not carry a
        // separate itemName — fall back to a readable version of the id
        // rather than showing a raw slug.
        itemName: r.itemName || r.itemId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        outputQty: r.outputQty as number,
        outputUnit: r.outputUnit as string,
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [recipes]);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<typeof recipeList[number] | null>(null);
  const [batches, setBatches] = useState('');

  const filtered = useMemo(
    () => !search.trim() ? recipeList : recipeList.filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase())),
    [recipeList, search],
  );

  const batchNumber = Number(batches);
  const batchValid = Number.isFinite(batchNumber) && batchNumber > 0;
  const totalOutput = selected && batchValid ? Math.round(selected.outputQty * batchNumber * 1000) / 1000 : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3 card-base p-5">
        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search recipe item</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </label>
        {recipeList.length === 0 && <EmptyState text="No recipes with a batch yield found yet." />}
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
          {filtered.map(r => (
            <button
              key={r.itemId}
              type="button"
              onClick={() => setSelected(r)}
              className={cn('flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left', selected?.itemId === r.itemId ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted')}
            >
              <span className="text-sm font-bold text-foreground">{r.itemName}</span>
              <span className="text-xs font-bold text-muted-foreground">{r.outputQty} {r.outputUnit} / batch</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="space-y-3 card-base p-5">
        <h3 className="text-sm font-black text-foreground">Batch Calculator</h3>
        {!selected && <p className="text-xs font-bold text-muted-foreground">Pick an item on the left first.</p>}
        {selected && (
          <>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-sm font-black text-foreground">{selected.itemName}</p>
              <p className="text-xs font-bold text-muted-foreground">1 batch = {selected.outputQty} {selected.outputUnit}</p>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-black text-muted-foreground">Number of batches</span>
              <input
                type="number" min="0" step="0.5" value={batches}
                onChange={e => setBatches(e.target.value)}
                placeholder="e.g. 3"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold"
              />
            </label>
            {batches.trim() !== '' && !batchValid && (
              <p className="text-xs font-bold text-destructive">Enter a batch number greater than 0.</p>
            )}
            {totalOutput != null && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Total output</p>
                <p className="font-display text-3xl font-black text-primary">{totalOutput} {selected.outputUnit}</p>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
