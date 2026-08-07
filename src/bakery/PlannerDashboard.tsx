// src/bakery/PlannerDashboard.tsx
// Replaces the old Production stage (baker/sweet_master/savouries_master/
// cookies_master/puffs_master/bakery_master) and the standalone Packing
// Dashboard. Planner is now the single hub for: merging SNB + VRSNB orders,
// handing merged totals to Store, recording actual production, splitting and
// dispatching to branches, tracking leftovers, and cake dispatch — plus the
// migrated Transfer-In and Daily Closure tools from Packing.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList, Layers, Factory, Truck, Cake, PackageCheck,
  ArrowRightLeft, Calendar, Plus, Send, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, FileSpreadsheet, Clock3,
  Store, CreditCard, WalletCards, MessageCircle, Bell, CalendarDays, ShieldCheck,
  Search, Printer, Receipt, ListPlus, BarChart3, FileText, Minus, IndianRupee,
  ShoppingCart, Percent, Trash2, Scale,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { useBakeryStore, isPlannedOrder } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, Branch } from './types';
import { BRANCHES, BAKERY_ITEMS } from './types';
import { printHtml } from '@/branch/printUtils';
import PackingTransferInTab from './PackingTransferInTab';
import PackingDailyClosureTab from './PackingDailyClosureTab';
import { exportToExcel } from '@/lib/exportExcel';
import HosurDashboard from '@/pages/HosurDashboard';
import HosurShopOrderPanel, { leftoverReasonLabel } from './HosurShopOrderPanel';
import PackingCakeOrdersTab from './PackingCakeOrdersTab';
import PlannerLeftoverTab, { useLeftoverBalanceMap, recordLeftoverMovement, kolkataToday, qtyFmt, type LeftoverUnit } from './PlannerLeftoverTab';
import { canonicalItemSlug, parseWeightGrams, pcsToKg, resolveItemWeightGrams } from './itemMatcher';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { supabase } from '@/lib/supabase';

// TAB MERGE (2026-08-06): the old standalone 'done' tab ("Leftover / Done" —
// a bare per-order yes/no checkbox with no quantity/item detail) has been
// folded into 'leftover-stock' ("Closing Stock" — the real quantified
// ledger). They were two disconnected systems tracking the same physical
// event; only one tab now, with the order-level "awaiting reconciliation"
// list rendered as a panel inside it. The 'done' key is kept in the type
// (but no longer in TABS/nav) purely so any stale bookmarked URL still
// resolves instead of erroring.
type PlannerTab = 'incoming' | 'sent' | 'merged' | 'planning' | 'production' | 'dispatch' | 'hosur' | 'cake' | 'transfer-in' | 'closure' | 'leftover-stock' | 'invoice' | 'reports' | 'billing' | 'done';
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
  { key: 'closure',     label: 'Daily Closure',    icon: <Calendar className="size-4" /> },
  { key: 'leftover-stock', label: 'Closing Stock', icon: <Scale className="size-4" /> },
  { key: 'invoice',     label: 'Invoice',          icon: <Receipt className="size-4" /> },
  { key: 'billing',     label: 'Billing (Walk-in)', icon: <ShoppingCart className="size-4" /> },
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
      const qty = unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
      const key = `${item.itemName.trim().toLowerCase()}__${unit}`;
      const existing = rows.get(key);
      if (existing) {
        existing.totalRequested += qty;
        existing.perBranch[bucket] = (existing.perBranch[bucket] || 0) + qty;
        if (!existing.contributingOrderIds.includes(order.id)) existing.contributingOrderIds.push(order.id);
      } else {
        rows.set(key, {
          itemName: item.itemName,
          unit,
          totalRequested: qty,
          perBranch: { [bucket]: qty },
          contributingOrderIds: [order.id],
        });
      }
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
  const withoutWeight = name.replace(/\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|ml|l)\s*\)/gi, '');
  return withoutWeight
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
      const qty = unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
      const grams = unit === 'pcs'
        ? (item.weightGrams ?? parseWeightGrams(item.itemName) ?? resolveItemWeightGrams(item.itemId, item.itemName))
        : null;
      const key = mergeGroupKey(item.itemName) || item.itemName.trim().toLowerCase();
      const list = groups.get(key) ?? [];
      list.push({ itemId: item.itemId, itemName: item.itemName, unit, qty, grams, bucket, orderId: order.id });
      groups.set(key, list);
    }
  }

  const rows: MergedRow[] = [];
  const mergeGroup = (list: RawEntry[], unit: 'pcs' | 'kg', convertPcsToKg: boolean) => {
    if (list.length === 0) return;
    let totalRequested = 0;
    const perBranch: Partial<Record<MergeBucket, number>> = {};
    const contributingOrderIds: string[] = [];
    for (const e of list) {
      const qty = convertPcsToKg && e.unit === 'pcs' && e.grams != null
        ? (pcsToKg(e.itemName, e.qty, e.grams) ?? e.qty)
        : e.qty;
      totalRequested += qty;
      perBranch[e.bucket] = Math.round(((perBranch[e.bucket] || 0) + qty) * 1000) / 1000;
      if (!contributingOrderIds.includes(e.orderId)) contributingOrderIds.push(e.orderId);
    }
    // Prefer the kg-native name for the merged label (already unit-agnostic);
    // fall back to the first entry, stripping any packet-weight suffix once
    // the row has been converted to kg so it doesn't read like a per-packet
    // figure next to a multi-item total.
    const nameSource = list.find(e => e.unit === 'kg') ?? list[0];
    const itemName = convertPcsToKg ? cleanItemDisplayName(nameSource.itemName) : nameSource.itemName;
    rows.push({
      itemName,
      unit,
      totalRequested: Math.round(totalRequested * 1000) / 1000,
      perBranch,
      contributingOrderIds,
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

export default function PlannerDashboard() {
  const { orders, loading, fetchOrders, subscribe, submitOrder } = useBakeryStore();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as PlannerTab | null;
  const tab: PlannerTab = urlTab && TABS.some(t => t.key === urlTab) ? urlTab : 'incoming';

  useEffect(() => {
    fetchOrders().catch(() => {});
    const unsubscribe = subscribe();
    const interval = setInterval(() => { if (!document.hidden) fetchOrders(true); }, 15_000);
    return () => { unsubscribe(); clearInterval(interval); };
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
  const productionSourceOrders = useMemo(
    () => orders.filter(o => ['store_confirmed', 'produced', 'dispatched'].includes(o.status)),
    [orders],
  );
  const activeLeftovers    = useMemo(() => orders.filter(o => (o.leftoverStatus ?? 'pending') === 'pending' && o.status === 'dispatched'), [orders]);
  const doneOrders         = useMemo(() => orders.filter(o => o.leftoverStatus === 'done'), [orders]);

  return (
    <div className="min-h-screen warm-gradient">
      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {tab === 'incoming' && <IncomingOrdersTab orders={incomingOrders} onAdd={submitOrder} />}
            {tab === 'sent' && <SentOrdersTab orders={sentOrders} />}
            {tab === 'merged' && <MergedSummaryTab orders={mergeableOrders} />}
            {tab === 'planning' && <PlanningTab orders={orders} />}
            {tab === 'production' && <ProductionEntryTab orders={productionSourceOrders} />}
            {tab === 'dispatch' && <DispatchTab orders={productionSourceOrders} allOrders={orders} />}
            {tab === 'hosur' && <HosurUnifiedSection />}
            {tab === 'cake' && <PackingCakeOrdersTab />}
            {tab === 'transfer-in' && <PackingTransferInTab />}
            {tab === 'closure' && <PackingDailyClosureTab />}
            {tab === 'leftover-stock' && (
              <div className="space-y-6">
                <PlannerLeftoverTab />
                <LeftoverDoneTab active={activeLeftovers} done={doneOrders} />
              </div>
            )}
            {tab === 'invoice' && <InvoiceTab orders={orders} />}
            {tab === 'billing' && <BillingTab />}
            {tab === 'reports' && <ReportsTab orders={orders} />}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Tab: Incoming Orders ───────────────────────────────────────────────────
function IncomingOrdersTab({ orders, onAdd }: { orders: BakeryOrder[]; onAdd: ReturnType<typeof useBakeryStore.getState>['submitOrder'] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [branch, setBranch] = useState<Branch>('SNB');
  const [itemName, setItemName] = useState('');
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
      setItemName(''); setQty(''); setPackWeightGrams(''); setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-foreground">Incoming Orders ({orders.length})</h2>
        <div className="flex gap-2">
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
            <select value={branch} onChange={e => setBranch(e.target.value as Branch)} className="rounded-xl border border-border px-3 py-2 text-sm">
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Item name" className="rounded-xl border border-border px-3 py-2 text-sm sm:col-span-2" />
            <div className="flex gap-2">
              <input value={qty} onChange={e => setQty(e.target.value)} type="number" placeholder="Qty" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
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

      <DayGroupedOrderList orders={orders} badgeLabel="Pending" badgeTone="bg-amber-100 text-amber-700" />
    </div>
  );
}

// Groups orders by calendar day (newest day first), each with a day header
// and a running count — used by both Incoming and Sent tabs.
function DayGroupedOrderList({ orders, badgeLabel, badgeTone }: { orders: BakeryOrder[]; badgeLabel: string | ((o: BakeryOrder) => string); badgeTone: string | ((o: BakeryOrder) => string) }) {
  const groups = useMemo(() => {
    const map = new Map<string, BakeryOrder[]>();
    for (const order of orders) {
      const day = new Date(order.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(order);
    }
    return Array.from(map.entries()).sort((a, b) => new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime());
  }, [orders]);

  if (orders.length === 0) return <EmptyState text="Nothing here right now." />;

  return (
    <div className="space-y-5">
      {groups.map(([day, dayOrders]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{day}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{dayOrders.length}</span>
          </div>
          <div className="space-y-2">
            {dayOrders.map(order => {
              const label = typeof badgeLabel === 'function' ? badgeLabel(order) : badgeLabel;
              const tone = typeof badgeTone === 'function' ? badgeTone(order) : badgeTone;
              const bucket = bucketFor(order);
              return (
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
      <h2 className="text-sm font-black text-foreground">Sent — By Date ({dayGroups.length} day{dayGroups.length === 1 ? '' : 's'})</h2>
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
  const { mergeOrdersForStore } = useBakeryStore();
  const merged = useMemo(() => computeMergedSummaryDisplay(orders), [orders]);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSendToStore = async () => {
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
      setSendingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-foreground">Merged Summary</h2>
        <div className="flex gap-2">
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
  const [cart, setCart] = useState<Record<string, { itemName: string; unit: 'pcs' | 'kg'; quantity: number }>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog('SNB').catch(() => {});
    loadCatalog('VRSNB').catch(() => {});
  }, [loadCatalog]);

  // Combined VRSNB + SNB catalog, active items only, deduplicated by
  // normalized name (case/spacing-insensitive) so an item listed in both
  // branch catalogs only shows once.
  const uniqueItems = useMemo(() => {
    const map = new Map<string, { name: string; unit: 'pcs' | 'kg'; category: string }>();
    for (const branch of ['VRSNB', 'SNB'] as const) {
      for (const item of catalogItems[branch] ?? []) {
        if (!item.active) continue;
        const key = item.name.trim().toLowerCase();
        if (!map.has(key)) map.set(key, { name: item.name, unit: item.uom === 'Kgs' ? 'kg' : 'pcs', category: item.category });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems]);

  const filtered = useMemo(
    () => uniqueItems.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [uniqueItems, search],
  );

  const setQty = (item: { name: string; unit: 'pcs' | 'kg' }, value: number) => {
    const safe = Math.max(0, Math.round(value * 1000) / 1000);
    setCart(prev => {
      const next = { ...prev };
      if (safe <= 0) delete next[item.name];
      else next[item.name] = { itemName: item.name, unit: item.unit, quantity: safe };
      return next;
    });
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3 card-base p-5">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search VRSNB + SNB items</span>
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
                    <p className="text-xs font-bold text-muted-foreground">{item.unit} · {item.category}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-card font-black text-foreground hover:bg-muted">-</button>
                      <input type="number" value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
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
                    <p className="text-xs font-black text-foreground">{item.itemName}</p>
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
  const [dateFilter, setDateFilter] = useState<string>('all');
  const dateGroups = useMemo(() => groupOrdersByStoreDate(orders), [orders]);
  const rowsByDate = useMemo(() => dateGroups.map(g => ({ ...g, rows: computeProductionRows(g.orders).filter(r => r.itemStatus !== 'completed') })), [dateGroups]);
  const visible = dateFilter === 'all' ? rowsByDate : rowsByDate.filter(g => g.dateKey === dateFilter);
  const totalPending = rowsByDate.reduce((s, g) => s + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Production Entry <span className="text-sm font-bold text-muted-foreground">({totalPending} items · {rowsByDate.filter(g => g.rows.length > 0).length} date{rowsByDate.filter(g => g.rows.length > 0).length === 1 ? '' : 's'})</span></h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground">
            <option value="all">All dates</option>
            {dateGroups.map(g => <option key={g.dateKey} value={g.dateKey}>{g.label}</option>)}
          </select>
          <ExportButton
            disabled={totalPending === 0}
            onClick={() => exportToExcel({
              filename: 'production-entry', sheetName: 'Production', title: 'Planner — Production Entry',
              columns: [{ header: 'Date', key: 'date' }, { header: 'Category', key: 'category' }, { header: 'Item', key: 'item' }, { header: 'Ordered Qty', key: 'ordered' }, { header: 'Produced So Far', key: 'produced' }, { header: 'Unit', key: 'unit' }, { header: 'Status', key: 'status' }],
              rows: rowsByDate.flatMap(g => g.rows.map(row => ({ date: g.label, category: row.category, item: row.itemName, ordered: row.totalRequested, produced: row.preparedTotal, unit: row.unit, status: row.itemStatus }))),
            })}
          />
        </div>
      </div>
      {dateGroups.length === 0 && <EmptyState text="No items waiting on production entry." />}
      {visible.map((g, idx) => (
        <ProductionEntryDateGroup key={g.dateKey} dateKey={g.dateKey} label={g.label} orders={g.orders} rows={g.rows} search={search} defaultOpen={idx === 0} />
      ))}
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
    if (enteredQty <= 0) return;
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
                        <input type="number" placeholder="Qty produced" value={qty[row.itemName] ?? ''} onChange={e => setQty(v => ({ ...v, [row.itemName]: e.target.value }))}
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
type HosurSubTab = 'place' | 'dispatch' | 'shops' | 'credit' | 'collection' | 'whatsapp' | 'reminders' | 'closure' | 'reports' | 'notifications';
const HOSUR_SUB_TAB_GROUPS: { label: string; tabs: { key: HosurSubTab; label: string; icon: React.ReactNode; ownedByPanel: boolean }[] }[] = [
  { label: 'Orders', tabs: [
    { key: 'place',    label: 'Place Order', icon: <Store className="size-3.5" />, ownedByPanel: true },
    { key: 'dispatch', label: 'Dispatch',    icon: <Truck className="size-3.5" />, ownedByPanel: true },
  ] },
  { label: 'Money', tabs: [
    { key: 'credit',     label: 'Credit Ledger',      icon: <CreditCard className="size-3.5" />, ownedByPanel: false },
    { key: 'collection', label: 'Payment Collection', icon: <WalletCards className="size-3.5" />, ownedByPanel: false },
  ] },
  { label: 'Communication', tabs: [
    { key: 'whatsapp',  label: 'WhatsApp Logs',    icon: <MessageCircle className="size-3.5" />, ownedByPanel: false },
    { key: 'reminders', label: 'Reminder History', icon: <Bell className="size-3.5" />, ownedByPanel: false },
  ] },
  { label: 'Admin', tabs: [
    { key: 'shops',         label: 'Shop Master',   icon: <Store className="size-3.5" />, ownedByPanel: false },
    { key: 'reports',       label: 'Reports',       icon: <FileSpreadsheet className="size-3.5" />, ownedByPanel: false },
    { key: 'notifications', label: 'Notifications', icon: <ShieldCheck className="size-3.5" />, ownedByPanel: false },
  ] },
];

function HosurUnifiedSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('hosurTab') as HosurSubTab | null;
  const activeTab: HosurSubTab = urlTab && HOSUR_SUB_TAB_GROUPS.some(g => g.tabs.some(t => t.key === urlTab)) ? urlTab : 'place';
  const [pendingDispatchCount, setPendingDispatchCount] = useState(0);

  const selectTab = (key: HosurSubTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('hosurTab', key);
    // The outer tab must always stay 'hosur' — these sub-tab keys (credit,
    // whatsapp, reports, etc.) are not valid top-level PlannerTab values, so
    // writing them to 'tab' used to make the outer tab fall back to
    // 'incoming', kicking the user back to the Incoming Orders tab.
    params.set('tab', 'hosur');
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
// printable invoice with a flat 10% discount.
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

  useEffect(() => {
    loadCatalog('SNB').catch(() => {});
    loadCatalog('VRSNB').catch(() => {});
  }, [loadCatalog]);

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
    const totals: Record<Branch, Map<string, { quantity: number; unit: string }>> = {
      VRSNB: new Map(), SNB: new Map(), Hosur: new Map(),
    };
    for (const order of orders) {
      for (const entry of order.dispatchLog || []) {
        if (kolkataDateKey(entry.dispatchedAt) !== date) continue;
        const b = entry.branch;
        const key = `${entry.itemName}__${entry.unit || 'kg'}`;
        const cur = totals[b].get(key) ?? { quantity: 0, unit: entry.unit || 'kg' };
        cur.quantity += entry.quantity;
        totals[b].set(key, cur);
      }
    }
    for (const b of BRANCHES) {
      const rows: InvoiceRow[] = [];
      for (const [key, { quantity, unit }] of totals[b]) {
        const itemName = key.slice(0, key.lastIndexOf('__'));
        const unitPrice = priceFor(b, itemName);
        rows.push({ itemName, unit, quantity: Math.round(quantity * 1000) / 1000, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 });
      }
      result[b] = rows.sort((a, c) => a.itemName.localeCompare(c.itemName));
    }
    return result;
  }, [orders, date, priceFor]);

  const subtotalFor = (b: Branch) => perBranchRows[b].reduce((s, r) => s + r.lineTotal, 0);
  const DISCOUNT_RATE = 0.10;

  const printInvoice = (b: Branch) => {
    const win = window.open('', '_blank'); if (!win) return;
    const rows = perBranchRows[b];
    const subtotal = subtotalFor(b);
    const discount = Math.round(subtotal * DISCOUNT_RATE * 100) / 100;
    const total = Math.round((subtotal - discount) * 100) / 100;
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.itemName}</td>
        <td style="text-align:right">${r.quantity} ${r.unit}</td>
        <td style="text-align:right">${invoiceMoney(r.unitPrice)}</td>
        <td style="text-align:right">${invoiceMoney(r.lineTotal)}</td>
      </tr>`).join('');
    win.document.write(`
      <html><head><title>Invoice — ${b} — ${date}</title>
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
        <div class="meta">Branch: <b>${b}</b> &nbsp;·&nbsp; Date: <b>${date}</b> &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-IN')}</div>
        <table>
          <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Line Total</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" style="text-align:center;color:#888">No items dispatched on this date</td></tr>'}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><span>${invoiceMoney(subtotal)}</span></div>
          <div class="discount"><span>Discount (10%)</span><span>- ${invoiceMoney(discount)}</span></div>
          <div class="grand"><span>Total Payable</span><span>${invoiceMoney(total)}</span></div>
        </div>
      </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-foreground">Invoice</h2>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {BRANCHES.map(b => {
          const rows = perBranchRows[b];
          const subtotal = subtotalFor(b);
          const discount = subtotal * DISCOUNT_RATE;
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
              <p className="text-[10px] font-bold text-muted-foreground">after 10% discount · subtotal {invoiceMoney(subtotal)}</p>
            </button>
          );
        })}
      </div>

      {loadingPrices && <p className="text-[11px] font-bold text-muted-foreground">Loading branch prices…</p>}

      {branch && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={cn('text-sm font-black', BRANCH_META[branch].text)}>{BRANCH_META[branch].icon} {branch} — Invoice for {date}</h3>
            <button
              onClick={() => printInvoice(branch)}
              className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"
            >
              <Printer className="size-3.5" /> Print Invoice
            </button>
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
            <div className="flex justify-between font-bold text-red-600"><span>Discount (10%)</span><span>- {invoiceMoney(subtotalFor(branch) * DISCOUNT_RATE)}</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-black text-foreground"><span>Total Payable</span><span>{invoiceMoney(subtotalFor(branch) * (1 - DISCOUNT_RATE))}</span></div>
          </div>
        </div>
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
      .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName)).reduce((s2, d) => s2 + d.quantity, 0), 0);
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
  const [reportsCutoff, setReportsCutoffState] = useState<string | null>(null);
  const [confirmingReportsReset, setConfirmingReportsReset] = useState(false);
  const [resettingReports, setResettingReports] = useState(false);

  useEffect(() => { void getReportsCutoff().then(setReportsCutoffState); }, []);

  const startReportsFresh = async () => {
    if (!confirmingReportsReset) {
      setConfirmingReportsReset(true);
      setTimeout(() => setConfirmingReportsReset(false), 4000);
      return;
    }
    setResettingReports(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = kolkataDateKey(tomorrow.toISOString());
    await setReportsCutoff(tomorrowKey);
    setReportsCutoffState(tomorrowKey);
    setConfirmingReportsReset(false);
    setResettingReports(false);
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
      const fromIso = `${effectiveFrom}T00:00:00`;
      const toIso = `${dateTo}T23:59:59`;
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
  }, [dateFrom, dateTo, reportsCutoff]);
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
        doc.setFillColor(238); doc.setDrawColor(220);
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
      placedOrders.map(o => [o.orderNumber, bucketFor(o), o.status.replace('_', ' '), new Date(o.createdAt).toLocaleDateString('en-IN'), o.items.map(i => i.itemName).join(', ').slice(0, 60)]),
      'No orders placed in this range.',
    );

    drawTable(
      'Hosur Leftover & Cancellations',
      ['Item', 'Unit', 'Qty', 'Shop', 'Reason', 'Status'],
      [140, 35, 45, 110, 130, 90],
      hosurLeftovers.map(l => [l.itemName.slice(0, 22), l.unit, String(l.quantity), (l.sourceShopName || '-').slice(0, 18), leftoverReasonLabel(l.reason), l.status === 'available' ? 'In pool' : 'Resolved']),
      'No leftover or cancellation activity in this range.',
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
          <button onClick={exportExcelReport} className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100">
            <FileSpreadsheet className="size-4" /> Excel Report
          </button>
          <button onClick={exportPdfReport} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
            <FileText className="size-4" /> PDF Report
          </button>
          <button
            onClick={startReportsFresh}
            disabled={resettingReports}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-60',
              confirmingReportsReset ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
            )}
          >
            <RefreshCw className="size-4" /> {resettingReports ? 'Starting…' : confirmingReportsReset ? 'Confirm: clear all report data?' : 'Start Fresh'}
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
  };
}

function printWalkinBill(bill: WalkinBillRow) {
  const win = window.open('', '_blank'); if (!win) return;
  const rows = bill.items.map(i => `<tr><td>${i.itemName}</td><td style="text-align:right">${i.quantity} ${i.unit}</td><td style="text-align:right">${invoiceMoney(i.price)}</td><td style="text-align:right">${invoiceMoney(i.lineTotal)}</td></tr>`).join('');
  win.document.write(`<html><head><title>Bill ${bill.billNo}</title><style>
    @page { size: 80mm auto; margin: 4mm; } body { font-family: monospace; font-size: 11px; width: 72mm; padding: 6px; color:#000; }
    h1 { font-size: 13px; margin: 0 0 4px; text-align:center; } .meta { font-size: 10px; text-align:center; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; } th, td { padding: 2px 0; } th { border-bottom: 1px dashed #000; text-align:left; }
    .totals div { display:flex; justify-content:space-between; font-size:11px; padding: 1px 0; } .totals { margin-top:6px; border-top:1px dashed #000; padding-top:4px; }
    .grand { font-weight:bold; font-size:13px; border-top:1px solid #000; margin-top:3px; padding-top:3px; }
  </style></head><body>
    <h1>Cafe Aadvikam — Walk-in Bill</h1>
    <div class="meta">Bill #${bill.billNo}<br/>${new Date(bill.createdAt).toLocaleString('en-IN')}<br/>Cashier: ${bill.cashierName || '-'}</div>
    <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${invoiceMoney(bill.subtotal)}</span></div>
      ${bill.discountAmount > 0 ? `<div><span>Discount${bill.discountType === 'percent' ? ` (${bill.discountValue}%)` : ''}</span><span>- ${invoiceMoney(bill.discountAmount)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${invoiceMoney(bill.total)}</span></div>
      <div style="margin-top:4px">Payment: ${bill.paymentMode.toUpperCase()}</div>
    </div>
  </body></html>`);
  win.document.close(); win.print();
}

function BillingTab() {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, { itemName: string; unit: 'pcs' | 'kg'; price: number; quantity: number }>>({});
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMode, setPaymentMode] = useState<typeof WALKIN_PAYMENT_MODES[number]['key']>('cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastBill, setLastBill] = useState<WalkinBillRow | null>(null);
  const [recent, setRecent] = useState<WalkinBillRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => { loadCatalog('SNB').catch(() => {}); loadCatalog('VRSNB').catch(() => {}); }, [loadCatalog]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data, error: fetchError } = await supabase.from('bakery_walkin_bills').select('*').order('created_at', { ascending: false }).limit(30);
    if (!fetchError && data) setRecent((data as Record<string, unknown>[]).map(mapWalkinBill));
    setLoadingRecent(false);
  }, []);
  useEffect(() => { loadRecent().catch(() => {}); }, [loadRecent]);

  // Deduplicated SNB + VRSNB catalog, active items only, with real prices.
  const catalog = useMemo(() => {
    const map = new Map<string, { name: string; unit: 'pcs' | 'kg'; category: string; price: number }>();
    for (const branch of ['SNB', 'VRSNB'] as const) {
      for (const item of catalogItems[branch] ?? []) {
        if (!item.active) continue;
        const key = item.name.trim().toLowerCase();
        if (!map.has(key)) map.set(key, { name: item.name, unit: item.uom === 'Kgs' ? 'kg' : 'pcs', category: item.category, price: item.price });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems]);

  const filtered = useMemo(
    () => catalog.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase())),
    [catalog, search],
  );

  const setQty = (item: { name: string; unit: 'pcs' | 'kg'; price: number }, value: number) => {
    const safe = Math.max(0, Math.round(value * 1000) / 1000);
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

  const resetCart = () => { setCart({}); setDiscountType('none'); setDiscountValue(''); };

  const saveBill = async () => {
    if (cartLines.length === 0) { setError('Add at least one item.'); return; }
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
      }).select().single();
      if (insertError || !data) throw new Error('Failed to save the bill — please try again.');
      const bill = mapWalkinBill(data as Record<string, unknown>);
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
    if (!updateError) loadRecent();
  };

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <ShoppingCart className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Billing (Walk-in)</h2>
            <p className="text-xs font-bold text-muted-foreground font-body">For customers who walk in directly. Combined SNB + VRSNB catalog, deduplicated.</p>
          </div>
        </div>
      </div>

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
                      <input type="number" value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
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

          <button onClick={saveBill} disabled={saving || cartLines.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl cafe-gradient text-sm font-black text-white shadow-teal disabled:opacity-40">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />} Save Bill{cartLines.length > 0 ? ` (${invoiceMoney(total)})` : ''}
          </button>

          {lastBill && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
              <p className="text-xs font-black text-teal-800">Bill {lastBill.billNo} saved — {invoiceMoney(lastBill.total)}</p>
              <button onClick={() => printWalkinBill(lastBill)} className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700">
                <Printer className="size-3.5" /> Print Bill
              </button>
            </div>
          )}
        </aside>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3"><p className="text-sm font-black text-foreground">Recent Bills</p></div>
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
                  <button onClick={() => printWalkinBill(bill)} className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted" title="Print"><Printer className="size-3.5" /></button>
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

// Sum of everything already dispatched to one specific branch for one row,
// so per-branch progress can be shown/checked independently of other branches.
function branchDispatchedForRow(row: ProductionRow, branch: Branch, orders: BakeryOrder[]): number {
  return orders
    .filter(o => o.targetBranch === branch && row.contributingOrderIds.includes(o.id))
    .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName)).reduce((s2, d) => s2 + d.quantity, 0), 0);
}

// Same idea as branchDispatchedForRow, but for the "Planned" bucket (Planning
// tab batches) — these orders have no fixed branch, so we track their
// dispatch progress by order id instead of by targetBranch.
// Extracts every Hosur shop-order id tagged onto this row's contributing
// bakery orders (HOSUR_ORDER_ID / HOSUR_ORDER_IDS in notes — see
// mergeOrdersForStore's collectHosurIds for how these get written/merged).
function collectHosurOrderIds(row: ProductionRow, orders: BakeryOrder[]): string[] {
  const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id) && o.targetBranch === 'Hosur');
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
  items: { itemName: string; unit: string; requested: number; dispatched: number }[];
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
        supabase.from('hosur_orders').select('id, order_number, shop_name').in('id', hosurOrderIds),
        supabase.from('hosur_order_items').select('order_id, item_name, unit, quantity, dispatched_quantity').in('order_id', hosurOrderIds),
      ]);
      if (cancelled) return;
      const metaById = new Map<string, { orderNumber: string; shopName: string }>(
        ((ordersData ?? []) as Record<string, unknown>[]).map((o) => [o.id as string, { orderNumber: String(o.order_number ?? ''), shopName: String(o.shop_name ?? '') }]),
      );
      const byOrder = new Map<string, { itemName: string; unit: string; requested: number; dispatched: number }[]>();
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
          unit: String(item.unit ?? matchedRow.unit ?? 'pcs'),
          requested: Number(item.quantity ?? 0),
          dispatched: Number(item.dispatched_quantity ?? 0),
        });
        byOrder.set(orderId, list);
      }
      const cards: HosurShopOrderCard[] = [];
      for (const [orderId, items] of byOrder) {
        const meta = metaById.get(orderId);
        if (!meta || items.length === 0) continue;
        cards.push({ orderId, orderNumber: meta.orderNumber, shopName: meta.shopName, items: items.sort((a, b) => a.itemName.localeCompare(b.itemName)) });
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

// The real "select a shop, edit its order, remove an item, send the whole
// shop's order in one go" workflow — replaces the old read-only By-Shop
// breakdown. Quantities default to what's actually available to send right
// now (the shared Closing Stock/leftover balance, which already reflects
// today's production plus any carryover — see the balance/leftover note in
// DispatchChecklistModal), so leftover no longer needs a separate manual
// "Use it" step: opening a shop's order already has it applied.
function HosurShopDispatchPanel({ rows, orders, leftoverBalances, onDispatch, dispatchedBy, onDone }: {
  rows: ProductionRow[]; orders: BakeryOrder[];
  leftoverBalances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
  onDone: () => void;
}) {
  const { shopOrders, reload } = useHosurShopOrders(rows, orders);
  const rowsByName = useMemo(() => new Map(rows.map(r => [r.itemName, r])), [rows]);
  const [shopSearch, setShopSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  const availableFor = (itemName: string) => Math.max(0, leftoverBalances.get(canonicalItemSlug(itemName))?.balance ?? 0);

  const openCard = (card: HosurShopOrderCard) => {
    setSelectedOrderId(card.orderId);
    const draft: Record<string, string> = {};
    for (const item of card.items) {
      const remaining = Math.max(0, Math.round((item.requested - item.dispatched) * 100) / 100);
      const suggested = Math.round(Math.min(remaining, availableFor(item.itemName)) * 100) / 100;
      draft[item.itemName] = String(suggested);
    }
    setQtyDraft(draft);
    setResult(null);
  };
  const cancel = () => { setSelectedOrderId(null); setQtyDraft({}); setResult(null); };
  const removeItem = (itemName: string) => setQtyDraft(v => ({ ...v, [itemName]: '0' }));

  const sendCard = async (card: HosurShopOrderCard) => {
    setSending(true);
    setResult(null);
    try {
      let sentAny = false;
      let skippedNoLink = false;
      for (const item of card.items) {
        const qty = Number(qtyDraft[item.itemName] || 0);
        if (qty <= 0.001) continue;
        const row = rowsByName.get(item.itemName);
        if (!row) { skippedNoLink = true; continue; }
        const targetEntries = orders.filter(o => row.contributingOrderIds.includes(o.id) && bakeryOrderCoversHosurShopOrder(o, card.orderId));
        // BUG FIX (audit): this used to fall through silently when no
        // bakery_orders row could be matched back to this shop's tag (e.g.
        // stale/edited notes) — the planner would just see the generic
        // "every item is set to 0" message even though they'd entered a
        // real quantity, which is misleading about what actually went wrong.
        if (targetEntries.length === 0) { skippedNoLink = true; continue; }
        const split = autoSplitForItem(targetEntries, row.itemName, qty);
        for (const order of targetEntries) {
          const orderItem = order.items.find(i => sameItem(i.itemName, row.itemName));
          const orderQty = split[order.id] ?? 0;
          if (!orderItem || orderQty <= 0) continue;
          await onDispatch(order.id, {
            id: getId(`${order.id}:${row.itemName}:${card.orderId}`),
            itemName: orderItem.itemName,
            quantity: orderQty,
            unit: orderItem.dispatchUnit || 'kg',
            branch: 'Hosur',
            dispatchedBy,
            dispatchedAt: new Date().toISOString(),
            targetHosurOrderId: card.orderId,
          });
          sentAny = true;
        }
      }
      if (!sentAny) {
        setResult({
          ok: false,
          message: skippedNoLink
            ? "Couldn't send — one or more items couldn't be linked back to this shop's order. Refresh the page and try again; if it keeps happening, this order's data may need attention."
            : 'Nothing to send — every item is set to 0.',
        });
        return;
      }
      setResult({ ok: true, message: `Sent ${card.shopName}'s order to Hosur dispatch.` });
      resetDispatchIds();
      setSelectedOrderId(null);
      setQtyDraft({});
      reload();
      onDone();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send this shop's order." });
    } finally {
      setSending(false);
    }
  };

  if (shopOrders === null) return <p className="text-xs font-bold text-muted-foreground">Loading shop orders…</p>;
  const filtered = shopSearch.trim()
    ? shopOrders.filter(c => c.shopName.toLowerCase().includes(shopSearch.trim().toLowerCase()))
    : shopOrders;
  if (shopOrders.length === 0) return <EmptyState text="No Hosur shop orders here." />;

  return (
    <div className="space-y-2.5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={shopSearch} onChange={e => setShopSearch(e.target.value)} placeholder="Select / search a shop..." className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-xs font-bold" />
      </div>
      {filtered.length === 0 && <EmptyState text={`No shop orders match "${shopSearch}".`} />}
      {filtered.map(card => {
        const isOpen = selectedOrderId === card.orderId;
        const doneCount = card.items.filter(i => i.dispatched >= i.requested - 0.01).length;
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
                  const remaining = Math.max(0, Math.round((item.requested - item.dispatched) * 100) / 100);
                  const available = availableFor(item.itemName);
                  const val = qtyDraft[item.itemName] ?? '0';
                  const done = remaining <= 0.01;
                  return (
                    <div key={item.itemName} className={cn('rounded-lg px-3 py-1.5', done ? 'bg-teal-50' : 'bg-muted/40')}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <span>{item.itemName} <span className="text-muted-foreground">(ordered {qtyFmt(item.requested)} {item.unit} · sent {qtyFmt(item.dispatched)} {item.unit})</span></span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min={0} value={val}
                            onChange={e => setQtyDraft(v => ({ ...v, [item.itemName]: e.target.value }))}
                            className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right"
                          />
                          <button onClick={() => removeItem(item.itemName)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted" title="Not sending this item — set to 0">Remove</button>
                        </div>
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{qtyFmt(available)} {item.unit} available now (produced + leftover){Number(val) > available + 0.01 ? ' — you\'re sending more than what\'s currently available, double-check before sending.' : ''}</p>
                    </div>
                  );
                })}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button onClick={cancel} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={() => sendCard(card)} disabled={sending} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                    {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Send {card.shopName}'s Order
                  </button>
                </div>
                {result && <p className={cn('text-[11px] font-bold', result.ok ? 'text-teal-700' : 'text-red-700')}>{result.message}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function plannedContributingOrders(row: ProductionRow, orders: BakeryOrder[]): BakeryOrder[] {
  return orders.filter(o => bucketFor(o) === 'Planned' && row.contributingOrderIds.includes(o.id));
}
function plannedDispatchedForRow(row: ProductionRow, orders: BakeryOrder[]): number {
  return plannedContributingOrders(row, orders)
    .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName)).reduce((s2, d) => s2 + d.quantity, 0), 0);
}

// Date-wise: each calendar day gets its own collapsible group (own branch
// filter, own To Dispatch/Dispatched/Planned sub-tabs). Within one date, the
// same item across several same-day orders still merges into a single
// dispatch line (computeProductionRows already does this per date-bucket) —
// only the cross-date merge is removed, so yesterday's still-pending items
// stay under "Yesterday" instead of silently folding into "Today".
function DispatchTab({ orders, allOrders }: { orders: BakeryOrder[]; allOrders: BakeryOrder[] }) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const dateGroups = useMemo(() => groupOrdersByStoreDate(orders), [orders]);
  const visible = dateFilter === 'all' ? dateGroups : dateGroups.filter(g => g.dateKey === dateFilter);
  const exportRows = useMemo(() => dateGroups.flatMap(g => {
    // WORKFLOW CHANGE (2026-08-06): used to hide items with zero production
    // recorded ('not_started') — owner asked for Dispatch to list everything
    // ordered, produced or not, so nothing waiting on Store/production is
    // ever invisible here.
    const rows = computeProductionRows(g.orders);
    return rows.map(row => {
      const dispatched = g.orders.filter(o => row.contributingOrderIds.includes(o.id))
        .reduce((s, o) => s + (o.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName)).reduce((s2, d) => s2 + d.quantity, 0), 0);
      return { date: g.label, item: row.itemName, VRSNB: row.perBranch.VRSNB ?? '', SNB: row.perBranch.SNB ?? '', Hosur: row.perBranch.Hosur ?? '', produced: row.preparedTotal, dispatched, status: row.itemStatus };
    });
  }), [dateGroups]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-foreground">Dispatch <span className="text-xs font-bold text-muted-foreground">({dateGroups.length} date{dateGroups.length === 1 ? '' : 's'})</span></h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground">
            <option value="all">All dates</option>
            {dateGroups.map(g => <option key={g.dateKey} value={g.dateKey}>{g.label}</option>)}
          </select>
          <ExportButton
            disabled={exportRows.length === 0}
            onClick={() => exportToExcel({
              filename: 'dispatch', sheetName: 'Dispatch', title: 'Planner — Dispatch',
              columns: [{ header: 'Date', key: 'date' }, { header: 'Item', key: 'item' }, ...BRANCHES.map(b => ({ header: `${b} Req`, key: b })), { header: 'Produced', key: 'produced' }, { header: 'Dispatched', key: 'dispatched' }, { header: 'Status', key: 'status' }],
              rows: exportRows,
            })}
          />
        </div>
      </div>
      {dateGroups.length === 0 && <EmptyState text="Nothing waiting on dispatch." />}
      {visible.map((g, idx) => (
        <DispatchDateGroup key={g.dateKey} dateKey={g.dateKey} label={g.label} orders={g.orders} allOrders={allOrders} search={search} defaultOpen={idx === 0} />
      ))}
    </div>
  );
}

function DispatchDateGroup({ label, orders, search, defaultOpen }: {
  dateKey: string; label: string; orders: BakeryOrder[]; allOrders: BakeryOrder[]; search: string; defaultOpen: boolean;
}) {
  // Anything not dated "Today" is a past date with items still awaiting
  // dispatch — flag it so it's never mistaken for today's dispatch queue.
  const isPastDate = label !== 'Today';
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
  const [branchFilter, setBranchFilter] = useState<'All' | Branch>('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  // Hosur dispatch can be viewed item-first (original) or shop-first (shop
  // name, then the items that shop ordered underneath it) — defaults to
  // shop-first per the planner's request, since that's how shop orders are
  // actually organized in their head.
  const [hosurView, setHosurView] = useState<'shop' | 'item'>('shop');

  useEffect(() => { setSelected(new Set()); }, [branchFilter]);

  const dispatchedQtyForItem = (row: ProductionRow) => {
    let sum = 0;
    for (const order of orders) {
      if (!row.contributingOrderIds.includes(order.id)) continue;
      sum += (order.dispatchLog || []).filter(d => sameItem(d.itemName, row.itemName)).reduce((s, d) => s + d.quantity, 0);
    }
    return sum;
  };

  const filtered = rows
    .filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(r => branchFilter === 'All' || !!r.perBranch[branchFilter]);

  const fullyDispatched = (row: ProductionRow) => {
    if (branchFilter !== 'All') {
      const requested = row.perBranch[branchFilter] ?? 0;
      return requested > 0 && branchDispatchedForRow(row, branchFilter, orders) >= requested - 0.01;
    }
    return dispatchedQtyForItem(row) >= row.preparedTotal - 0.01 && row.preparedTotal > 0;
  };
  const activeRows = filtered.filter(r => !fullyDispatched(r))
    .sort((a, b) => (dispatchedQtyForItem(b) > 0 ? 1 : 0) - (dispatchedQtyForItem(a) > 0 ? 1 : 0));
  const completedRows = filtered.filter(r => fullyDispatched(r));
  const shown = subTab === 'active' ? activeRows : completedRows;
  // Items with a "Planned" (Planning-tab) component still awaiting a
  // branch + quantity decision at dispatch time.
  const plannedRows = useMemo(
    () => rows.filter(r => (r.perBranch.Planned ?? 0) > 0 && plannedDispatchedForRow(r, orders) < (r.perBranch.Planned ?? 0) - 0.01),
    [rows, orders],
  );

  const inProgressRows = filtered.filter(r => !fullyDispatched(r) && dispatchedQtyForItem(r) > 0);

  const toggleSelect = (itemName: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
    return next;
  });
  const selectedRows = activeRows.filter(r => selected.has(r.itemName));

  // While actively searching, hide date groups with no matches so the search
  // reads as global even though rendering stays date-scoped underneath.
  if (search.trim() && filtered.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="text-sm font-black text-foreground">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{activeRows.length} to dispatch</span>
          {completedRows.length > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">{completedRows.length} done</span>}
          {isPastDate && activeRows.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
              <AlertTriangle className="size-3" /> Past date — still pending
            </span>
          )}
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {!open ? null : (
      <div className="space-y-3 border-t border-border p-3">
      {/* Branch view — click a branch to see only what that branch ordered,
          with a checkbox on each card to bulk-dispatch several items at once. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(['All', ...BRANCHES] as const).map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={cn('rounded-xl px-3 py-1.5 text-xs font-black', branchFilter === b ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground')}
            >
              {b}
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

      {/* Pinned summary — partially dispatched items with more still coming from the baker,
          always at the top regardless of sub-tab, with each branch's required vs dispatched. */}
      {inProgressRows.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-700">Still In Progress — More To Come ({inProgressRows.length})</p>
          <div className="space-y-2">
            {inProgressRows.map(row => (
              <div key={row.itemName} className="rounded-xl bg-white p-2.5">
                <p className="text-sm font-black text-foreground">{row.itemName}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                  {BRANCHES.filter(b => row.perBranch[b]).map(b => {
                    const branchDispatched = branchDispatchedForRow(row, b, orders);
                    return <span key={b} className="rounded-lg bg-amber-100 px-2 py-1">{b}: required {row.perBranch[b]} {row.unit} · dispatched {branchDispatched} {row.unit}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setSubTab('active')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'active' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground')}>To Dispatch ({activeRows.length})</button>
        <button onClick={() => setSubTab('completed')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'completed' ? 'bg-foreground text-white' : 'bg-muted text-muted-foreground')}>Dispatched ({completedRows.length})</button>
        <button onClick={() => setSubTab('planned')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'planned' ? 'cafe-gradient text-white shadow-teal' : 'bg-primary/10 text-primary')}>Planned ({plannedRows.length})</button>
      </div>

      {subTab === 'planned' ? (
        <PlannedDispatchPanel rows={plannedRows} orders={orders} onDispatch={submitDispatch} dispatchedBy={currentUser?.displayName || 'Planner'} />
      ) : branchFilter === 'Hosur' && hosurView === 'shop' ? (
        <>
          {shown.length === 0 && <EmptyState text={subTab === 'active' ? 'Nothing waiting on dispatch.' : 'Nothing dispatched yet.'} />}
          {shown.length > 0 && (
            <HosurShopDispatchPanel
              rows={shown}
              orders={orders}
              leftoverBalances={leftoverBalances}
              onDispatch={submitDispatch}
              dispatchedBy={currentUser?.displayName || currentUser?.username || 'Planner'}
              onDone={refreshLeftover}
            />
          )}
        </>
      ) : (
      <>
      {shown.length === 0 && <EmptyState text={subTab === 'active' ? 'Nothing waiting on dispatch.' : 'Nothing dispatched yet.'} />}
      <div className="space-y-2">
        {shown.map(row => {
          const dispatched = dispatchedQtyForItem(row);
          const canSelect = subTab === 'active' && branchFilter !== 'All';
          return (
            <div key={row.itemName} className={cn('rounded-2xl border bg-white p-3 shadow-sm', selected.has(row.itemName) ? 'border-teal-400 ring-1 ring-teal-300' : 'border-border')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {canSelect && (
                    <input type="checkbox" className="size-4 accent-teal-600" checked={selected.has(row.itemName)} onChange={() => toggleSelect(row.itemName)} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">{row.itemName} <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black', row.itemStatus === 'completed' ? 'bg-teal-100 text-teal-700' : row.itemStatus === 'not_started' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700')}>{row.itemStatus === 'completed' ? 'Completed' : row.itemStatus === 'not_started' ? 'Not produced yet' : 'More to come'}</span></p>
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
                const balance = leftoverBalances.get(canonicalItemSlug(row.itemName));
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
      {branchFilter !== 'All' && selected.size > 0 && (
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
      {branchFilter !== 'All' && selected.size > 0 && (
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
          leftoverBalance={leftoverBalances.get(canonicalItemSlug(checklistItem.itemName))?.balance ?? 0}
        />
      )}

      {bulkOpen && branchFilter !== 'All' && (
        <BulkDispatchModal
          branch={branchFilter}
          rows={selectedRows}
          orders={orders}
          onClose={() => setBulkOpen(false)}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || 'Planner'}
          onDone={() => { setSelected(new Set()); setBulkOpen(false); }}
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
  const [branchFor, setBranchFor] = useState<Record<string, Branch>>({});
  const [qtyFor, setQtyFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  if (rows.length === 0) return <EmptyState text="No planned-stock items waiting on a dispatch decision." />;

  const dispatchRow = async (row: ProductionRow) => {
    const branch = branchFor[row.itemName] ?? 'SNB';
    const plannedRequested = row.perBranch.Planned ?? 0;
    const alreadySent = plannedDispatchedForRow(row, orders);
    const remainingPlanned = Math.max(0, plannedRequested - alreadySent);
    const defaultQty = Math.round(Math.min(remainingPlanned, row.preparedTotal) * 100) / 100;
    const q = qtyFor[row.itemName] !== undefined ? Number(qtyFor[row.itemName] || 0) : defaultQty;
    if (q <= 0) return;
    setBusy(row.itemName);
    setResult(r => ({ ...r, [row.itemName]: undefined as any }));
    try {
      const entries = plannedContributingOrders(row, orders);
      const split = autoSplitForItem(entries, row.itemName, q);
      for (const order of entries) {
        const item = order.items.find(i => sameItem(i.itemName, row.itemName));
        const orderQty = split[order.id] ?? 0;
        if (!item || orderQty <= 0) continue;
        await onDispatch(order.id, { id: getId(`${order.id}:${row.itemName}`), itemName: item.itemName, quantity: orderQty, unit: item.dispatchUnit || 'kg', branch, dispatchedBy, dispatchedAt: new Date().toISOString() });
      }
      setResult(r => ({ ...r, [row.itemName]: { ok: true, message: `Dispatched ${q} ${row.unit} of ${row.itemName} to ${branch}.` } }));
      setQtyFor(v => ({ ...v, [row.itemName]: '' }));
      resetDispatchIds();
    } catch (err) {
      setResult(r => ({ ...r, [row.itemName]: { ok: false, message: err instanceof Error ? err.message : 'Failed to dispatch this item.' } }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 pb-16">
      {rows.map(row => {
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
                  placeholder={String(defaultQty)}
                  value={qtyFor[row.itemName] ?? ''}
                  onChange={e => setQtyFor(v => ({ ...v, [row.itemName]: e.target.value }))}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-xs font-bold"
                />
                <span className="text-[11px] font-bold text-muted-foreground">{row.unit}</span>
                <button onClick={() => dispatchRow(row)} disabled={busy === row.itemName} className="flex items-center gap-1.5 rounded-xl cafe-gradient px-3 py-2 text-xs font-bold text-white shadow-teal disabled:opacity-50">
                  {busy === row.itemName ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Dispatch to {branch}
                </button>
              </div>
            </div>
            {res && (
              <p className={cn('mt-2 rounded-lg px-3 py-1.5 text-xs font-bold', res.ok ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-red-50 text-red-700 border border-red-200')}>{res.message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Lets the planner dispatch several selected items to one branch in a single
// step, instead of opening the per-item checklist modal one at a time.
function BulkDispatchModal({ branch, rows, orders, onClose, onDispatch, dispatchedBy, onDone }: {
  branch: Branch; rows: ProductionRow[]; orders: BakeryOrder[]; onClose: () => void;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string; onDone: () => void;
}) {
  const lines = useMemo(() => rows.map(row => {
    const requested = row.perBranch[branch] ?? 0;
    const alreadySent = branchDispatchedForRow(row, branch, orders);
    const remainingRequested = Math.max(requested - alreadySent, 0);
    const defaultQty = Math.round(Math.min(remainingRequested, row.preparedTotal) * 100) / 100;
    return { row, requested, alreadySent, defaultQty };
  }), [rows, branch, orders]);

  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.row.itemName, String(l.defaultQty)])));
  const [sending, setSending] = useState(false);
  // BUG FIX (audit): confirmAll had try/finally with no catch — if
  // onDispatch threw partway through (e.g. a network hiccup on item 2 of
  // 5), the error became an unhandled rejection with zero feedback in this
  // modal, and items already dispatched before the failure had no visible
  // record of what succeeded vs what didn't.
  const [error, setError] = useState<string | null>(null);
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  const qtyFor = (itemName: string) => Number(qty[itemName] || 0);

  const confirmAll = async () => {
    setSending(true);
    setError(null);
    let dispatchedCount = 0;
    try {
      for (const { row } of lines) {
        const q = qtyFor(row.itemName);
        if (q <= 0) continue;
        const entries = orders.filter(o => o.targetBranch === branch && row.contributingOrderIds.includes(o.id));
        const split = autoSplitForItem(entries, row.itemName, q);
        for (const order of entries) {
          const item = order.items.find(i => sameItem(i.itemName, row.itemName));
          const orderQty = split[order.id] ?? 0;
          if (!item || orderQty <= 0) continue;
          await onDispatch(order.id, { id: getId(`${order.id}:${row.itemName}`), itemName: item.itemName, quantity: orderQty, unit: item.dispatchUnit || 'kg', branch, dispatchedBy, dispatchedAt: new Date().toISOString() });
          dispatchedCount += 1;
        }
      }
      resetDispatchIds();
      onDone();
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : 'Failed to dispatch.') +
        (dispatchedCount > 0 ? ` — ${dispatchedCount} item${dispatchedCount === 1 ? '' : 's'} already went through before this failed; check the Dispatch tab before retrying to avoid double-sending.` : ''),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black text-foreground">Dispatch {lines.length} item{lines.length > 1 ? 's' : ''} to {branch}</p>
        <div className="mt-3 max-h-[50vh] space-y-2 overflow-auto pr-1">
          {lines.map(({ row, requested, alreadySent }) => (
            <div key={row.itemName} className="rounded-xl border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-foreground">{row.itemName}</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={qty[row.itemName] ?? ''}
                    onChange={e => setQty(prev => ({ ...prev, [row.itemName]: e.target.value }))}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                  />
                  <span className="text-[11px] font-bold text-muted-foreground">{row.unit}</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">Requested {requested} {row.unit}{alreadySent > 0 ? ` · already sent ${alreadySent} ${row.unit}` : ''} · Produced {row.preparedTotal} {row.unit}</p>
            </div>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={sending} className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-muted-foreground">Cancel</button>
          <button onClick={confirmAll} disabled={sending} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white">
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />} Confirm Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

function DispatchChecklistModal({ row, orders, branchFilter, onClose, onDispatch, dispatchedBy, leftoverBalance }: {
  row: ProductionRow; orders: BakeryOrder[]; branchFilter: 'All' | Branch; onClose: () => void;
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
  const branchOrders = useMemo(() => {
    const map = new Map<string, { order: BakeryOrder; item: BakeryOrderItem }[]>();
    for (const orderId of row.contributingOrderIds) {
      const order = orders.find(o => o.id === orderId);
      const item = order?.items.find(i => sameItem(i.itemName, row.itemName));
      if (!order || !item || !order.targetBranch) continue;
      if (branchFilter !== 'All' && order.targetBranch !== branchFilter) continue;
      if (!map.has(order.targetBranch)) map.set(order.targetBranch, []);
      map.get(order.targetBranch)!.push({ order, item });
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
  const autoSplit = useMemo(() => autoSplitForItem(orders, row.itemName, availableToDispatch), [orders, row, availableToDispatch]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const branchKeys = useMemo(() => Array.from(branchOrders.keys()), [branchOrders]);
  // Which branches to actually dispatch right now — defaults to all, but the
  // planner can dispatch just VRSNB, just SNB, or both together.
  const [selectedBranches, setSelectedBranches] = useState<string[]>(branchKeys);
  useEffect(() => { setSelectedBranches(branchKeys); }, [branchKeys.join(',')]);
  const toggleBranch = (b: string) => setSelectedBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const qtyFor = (orderId: string) => qty[orderId] !== undefined ? Number(qty[orderId] || 0) : Math.round((autoSplit[orderId] ?? 0) * 100) / 100;
  const { getId, reset: resetDispatchIds } = useStableDispatchIds();

  const CHECKLIST_BY_BRANCH: Record<string, string[]> = {
    SNB: ['Verify SNB quantity matches this checklist', 'Cross-check SNB boxes/kg/pcs before loading', 'Check packaging is intact and labeled', 'Load onto SNB delivery vehicle', 'Hand over and get SNB counter sign-off'],
    VRSNB: ['Verify VRSNB quantity matches this checklist', 'Pack VRSNB items in labeled crates', 'Check packaging is intact and labeled', 'Load onto VRSNB delivery vehicle', 'Hand over and get VRSNB counter sign-off'],
    Hosur: ['Verify Hosur shop-wise split matches this checklist', 'Pack per-shop bags separately for Hosur', 'Check packaging is intact and labeled', 'Load onto Hosur delivery vehicle', 'Hand over and get Hosur receiver sign-off'],
  };
  const checklistFor = (branch: string) => CHECKLIST_BY_BRANCH[branch] || CHECKLIST_BY_BRANCH.SNB;

  const confirmDispatch = async () => {
    setSending(true);
    try {
      for (const [branch, entries] of branchOrders) {
        if (!selectedBranches.includes(branch)) continue;
        for (const { order, item } of entries) {
          const q = qtyFor(order.id);
          if (q <= 0) continue;
          await onDispatch(order.id, { id: getId(`${order.id}:${item.itemName}`), itemName: item.itemName, quantity: q, unit: item.dispatchUnit || 'kg', branch: branch as Branch, dispatchedBy, dispatchedAt: new Date().toISOString() });
        }
      }
      resetDispatchIds();
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  const printChecklist = (mode: 'thermal' | 'a4') => {
    const win = window.open('', '_blank'); if (!win) return;
    const sections = Array.from(branchOrders.entries()).filter(([branch]) => selectedBranches.includes(branch)).map(([branch, entries]) => {
      const qtyTotal = entries.reduce((s, { order }) => s + qtyFor(order.id), 0);
      const requested = row.perBranch[branch as Branch] ?? 0;
      const orderLines = entries.map(({ order }) =>
        `<div class="order-line">Order #${order.orderNumber} — requested ${order.items.find(i => sameItem(i.itemName, row.itemName))?.quantity ?? '-'} ${row.unit}, dispatching ${qtyFor(order.id)} ${row.unit}</div>`
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

    win.document.write(`<html><head><title>Dispatch Checklist — ${row.itemName}</title><style>${style}
      body { padding: 12px; } .checklist { margin: 8px 0; } .check input { margin-right: 6px; } .meta { margin-bottom: 6px; }
      .sign { margin-top: 12px; border-top: 1px dashed #999; padding-top: 8px; }
    </style></head><body>${sections}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black text-foreground">Dispatch Checklist — {row.itemName}</p>
        {!done ? (
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
                  {entries.map(({ order, item }) => (
                    <div key={order.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs font-bold text-muted-foreground">Order #{order.orderNumber} · requested {item.quantity} {row.unit}</span>
                      <input type="number" value={qty[order.id] ?? qtyFor(order.id)} onChange={e => setQty(v => ({ ...v, [order.id]: e.target.value }))} className="w-24 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold" />
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
              <button onClick={confirmDispatch} disabled={sending || selectedBranches.length === 0} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} Confirm Dispatch{selectedBranches.length > 1 ? ` (${selectedBranches.join(' + ')})` : ''}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs font-semibold text-teal-600">Dispatched. This item now shows in the Dispatched sub-tab{row.itemStatus === 'pending' ? ' — still marked pending, more expected from the baker.' : '.'}</p>
            <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-white">Close</button></div>
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
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div>
        <p className="mb-3 text-xs font-semibold text-muted-foreground">Order-level checklist — separate from the quantified pool above. Use this to confirm every dispatched order has been physically checked for leftovers.</p>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">Dispatched Orders Awaiting Reconciliation ({active.length})</h2>
          <ExportButton
            disabled={active.length === 0 && done.length === 0}
            onClick={() => exportToExcel({
              filename: 'leftover-done', sheetName: 'Leftover-Done', title: 'Planner — Leftover / Done',
              columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Branch', key: 'branch' }, { header: 'Status', key: 'status' }],
              rows: [
                ...active.map(o => ({ orderNumber: o.orderNumber, branch: o.targetBranch, status: 'Active Leftover' })),
                ...done.map(o => ({ orderNumber: o.orderNumber, branch: o.targetBranch, status: 'Done' })),
              ],
            })}
          />
        </div>
        {active.length === 0 ? <EmptyState text="No leftovers pending reconciliation." /> : (
          <div className="space-y-2">
            {active.map(order => (
              <div key={order.id} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <p className="text-sm font-black text-amber-800">{order.targetBranch} · Order #{order.orderNumber}</p>
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
                <p className="text-sm font-black text-teal-800">{order.targetBranch} · Order #{order.orderNumber} — Done</p>
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
