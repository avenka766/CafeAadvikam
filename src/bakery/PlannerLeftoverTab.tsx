// src/bakery/PlannerLeftoverTab.tsx
// NEW FEATURE: "Closing Stock" — a manually-recorded leftover/finished-goods
// pool for the Planner kitchen. Staff search for an item (merged across the
// SNB + VRSNB catalogues, deduplicated by name), enter what's physically
// left over in Kg or Pcs, and it's recorded as a dated ledger movement.
// Tomorrow, the Dispatch tab can draw down this same pool before touching
// fresh production. Every movement (added / dispatched / adjusted) is kept
// as its own row in planner_leftover_ledger — nothing is ever summarized
// away — so the Daily Report below can reconstruct an exact opening /
// added / dispatched / closing reconciliation for any date, and the
// PDF/Excel exports are a full audit trail, not just a snapshot.
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Plus, Minus, PackageCheck, History, FileSpreadsheet, Printer,
  Loader2, AlertTriangle, CheckCircle2, CalendarDays, Scale, X, RefreshCw, Truck, Cake,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { canonicalItemSlug, closingStockItemSlug, resolveItemWeightGrams, kgToPcs } from './itemMatcher';
import { BRANCHES } from './types';
import type { Branch } from './types';

export type LeftoverUnit = 'kg' | 'pcs';
export type LeftoverReason = 'closing_stock' | 'production_carryover' | 'dispatch' | 'adjustment' | 'transfer_out' | 'return';

export interface LeftoverLedgerRow {
  id: string;
  itemSlug: string;
  itemName: string;
  unit: LeftoverUnit;
  businessDate: string;
  delta: number;
  reason: LeftoverReason;
  branch: Branch | null;
  orderId: string | null;
  orderNumber: number | null;
  recordedBy: string;
  notes: string | null;
  createdAt: string;
  // Real, structured columns (added alongside the "extra items" feature) —
  // previously "was this an extra/non-requested item" and "which Hosur shop"
  // only existed as free text inside `notes`, so nothing downstream (Daily
  // Report, Reports tab) could reliably filter or sum them separately from
  // normal production/dispatch. See the migration comment on
  // planner_leftover_ledger.is_extra / .shop_name for the full story.
  isExtra: boolean;
  shopName: string | null;
}

export const kolkataToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const qtyFmt = (v: number) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const reasonLabel = (r: LeftoverReason) => r === 'closing_stock' ? 'Closing stock entry' : r === 'production_carryover' ? 'Unused production' : r === 'dispatch' ? 'Dispatched' : r === 'transfer_out' ? 'Transfer Out' : r === 'return' ? 'Return' : 'Adjustment';

function mapLedgerRow(row: Record<string, unknown>): LeftoverLedgerRow {
  return {
    id: String(row.id),
    itemSlug: String(row.item_slug ?? ''),
    itemName: String(row.item_name ?? ''),
    unit: (row.unit as LeftoverUnit) ?? 'kg',
    businessDate: String(row.business_date ?? ''),
    delta: Number(row.delta ?? 0),
    reason: (row.reason as LeftoverReason) ?? 'adjustment',
    branch: (row.branch as Branch | null) ?? null,
    orderId: row.order_id ? String(row.order_id) : null,
    orderNumber: row.order_number == null ? null : Number(row.order_number),
    recordedBy: String(row.recorded_by ?? ''),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ''),
    isExtra: Boolean(row.is_extra),
    shopName: row.shop_name ? String(row.shop_name) : null,
  };
}

// ─── "Start fresh" cutoff ───────────────────────────────────────────────────
// Clearing the leftover ledger by deleting rows would also erase the audit
// trail the Daily Report and Movement Log are built on. Instead, a cutoff
// timestamp (stored in app_state) hides everything recorded before it from
// every view — balance, report, and log — without touching a single row in
// the database. "Reset" just moves this cutoff forward; nothing is deleted
// and it can never make history disappear for the wrong reason (a bug can't
// accidentally DELETE real stock records).
const CLOSING_STOCK_CUTOFF_KEY = 'planner_closing_stock_cutoff';

export async function getClosingStockCutoff(): Promise<string | null> {
  const { data } = await supabase.from('app_state').select('value').eq('key', CLOSING_STOCK_CUTOFF_KEY).maybeSingle();
  const iso = (data?.value as { cutoff?: string } | null)?.cutoff;
  return iso ?? null;
}

export async function setClosingStockCutoff(iso: string): Promise<void> {
  await supabase.from('app_state').upsert({ key: CLOSING_STOCK_CUTOFF_KEY, value: { cutoff: iso }, updated_at: new Date().toISOString() });
}

// EGRESS NOTE: capped at 20,000 most-recent rows (fetched paged, 1000/page).
// This is a brand-new table — at a realistic 30-60 manual entries/day that's
// roughly a year of history before the cap matters. Raise the cap (or add a
// periodic "opening balance snapshot" row) if this table grows past that.
export async function fetchLeftoverLedger(): Promise<{ rows: LeftoverLedgerRow[]; error: string }> {
  const pageSize = 1000;
  const maxRows = 20000;
  const rows: Record<string, unknown>[] = [];
  let error = '';
  const cutoff = await getClosingStockCutoff();
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase
      .from('planner_leftover_ledger')
      .select('id, item_slug, item_name, unit, business_date, delta, reason, branch, order_id, order_number, recorded_by, notes, created_at, is_extra, shop_name')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (cutoff) query = query.gte('created_at', cutoff);
    const { data, error: pageError } = await query;
    if (pageError) { error = pageError.message; break; }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { rows: rows.map(mapLedgerRow), error };
}

// Shared entry point used by both this tab (manual add/adjust) and the
// Dispatch tab (consuming leftover against an order) — see task wiring in
// PlannerDashboard.tsx's DispatchTab. Throws with a readable message on the
// INSUFFICIENT_LEFTOVER_STOCK guard raised by the RPC.
export async function recordLeftoverMovement(params: {
  itemName: string;
  unit: LeftoverUnit;
  delta: number;
  businessDate: string;
  reason: LeftoverReason;
  recordedBy: string;
  branch?: Branch | null;
  orderId?: string | null;
  orderNumber?: number | null;
  notes?: string | null;
  // True for an item that was NOT originally ordered/requested — an extra
  // item produced or dispatched on top of the normal order. shopName is
  // Hosur-dispatch-only: the specific shop this stock went to, so Hosur
  // reporting isn't just one combined bucket.
  isExtra?: boolean;
  shopName?: string | null;
}): Promise<{ newBalance: number } | { error: string }> {
  // BUG FIX (2026-08-07): the pooled Closing Stock balance is keyed by this
  // slug — canonicalItemSlug() strips ANY parenthetical, which was silently
  // merging genuinely different items (e.g. "Egg Puff (Full Egg)" and "Egg
  // Puff (Half)") into one shared balance. closingStockItemSlug() only
  // strips a real weight/pack-size qualifier like "(200g)". See its comment
  // in itemMatcher.ts for the full story.
  const slug = closingStockItemSlug(params.itemName);
  if (!slug) return { error: 'Enter an item name.' };
  const { data, error } = await supabase.rpc('record_leftover_movement', {
    p_item_slug: slug,
    p_item_name: params.itemName.trim(),
    p_unit: params.unit,
    p_delta: params.delta,
    p_business_date: params.businessDate,
    p_reason: params.reason,
    p_recorded_by: params.recordedBy,
    p_branch: params.branch ?? null,
    p_order_id: params.orderId ?? null,
    p_order_number: params.orderNumber ?? null,
    p_notes: params.notes ?? null,
    p_is_extra: params.isExtra ?? false,
    p_shop_name: params.shopName ?? null,
  });
  if (error) {
    const insufficient = error.message.match(/INSUFFICIENT_LEFTOVER_STOCK: (.+)/);
    return { error: insufficient ? insufficient[1] : error.message };
  }
  return { newBalance: Number((data as { newBalance?: number })?.newBalance ?? 0) };
}

// FEATURE (2026-08-09): "Need ability to fully edit Closing Stock entries —
// quantity, unit, name, etc." Rewrites a single ledger row in place
// (item/unit/quantity) — open to every reason (dispatch/production/
// adjustment/etc, not just manually-added closing_stock rows), per explicit
// follow-up request. The server-side RPC preserves the row's original +/-
// direction so an edit here can't flip a deduction into an addition.
export async function editClosingStockEntry(params: {
  entryId: string;
  itemName: string;
  unit: LeftoverUnit;
  quantity: number;
  editedBy: string;
}): Promise<{ ok: true } | { error: string }> {
  const slug = closingStockItemSlug(params.itemName);
  if (!slug) return { error: 'Enter an item name.' };
  const { error } = await supabase.rpc('edit_closing_stock_entry_secure', {
    p_entry_id: params.entryId,
    p_item_slug: slug,
    p_item_name: params.itemName.trim(),
    p_unit: params.unit,
    p_quantity: params.quantity,
    p_edited_by: params.editedBy,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

// FEATURE (2026-08-09): edits the "Current Leftover Balance" summary row
// directly — the aggregate view the planner actually looks at first — not
// just a single Movement Log entry. Renaming bulk-renames every historical
// ledger row for this item+unit bucket (so nothing splits into two rows
// under old/new names), and a changed target quantity is applied as a single
// 'adjustment' entry for the difference, keeping full history intact.
export async function renameAndCorrectClosingStockBalance(params: {
  oldItemSlug: string;
  oldUnit: LeftoverUnit;
  newItemName: string;
  newUnit: LeftoverUnit;
  targetQuantity: number;
  editedBy: string;
}): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.rpc('rename_and_correct_closing_stock_balance_secure', {
    p_old_slug: params.oldItemSlug,
    p_old_unit: params.oldUnit,
    p_new_item_name: params.newItemName.trim(),
    p_new_unit: params.newUnit,
    p_target_quantity: params.targetQuantity,
    p_edited_by: params.editedBy,
  });
  if (error) return { error: error.message };
  void data;
  return { ok: true };
}

// Lightweight balance lookup for the Dispatch tab's "Dispatch from Leftover"
// action — keyed by item slug (not slug+unit, since in practice each item
// only ever carries a balance in one unit at a time).
export function useLeftoverBalanceMap(): { balances: Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>; refresh: () => void } {
  const [rows, setRows] = useState<LeftoverLedgerRow[]>([]);
  const refresh = useCallback(() => { void fetchLeftoverLedger().then(({ rows: fetched }) => setRows(fetched)); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const balances = useMemo(() => {
    const map = new Map<string, { itemName: string; unit: LeftoverUnit; balance: number }>();
    rows.forEach((row) => {
      const current = map.get(row.itemSlug) ?? { itemName: row.itemName, unit: row.unit, balance: 0 };
      current.balance += row.delta;
      current.itemName = row.itemName;
      map.set(row.itemSlug, current);
    });
    for (const [slug, entry] of map) if (entry.balance <= 0.001) map.delete(slug);
    return map;
  }, [rows]);
  return { balances, refresh };
}

// ─── Merged, deduplicated SNB + VRSNB item search ──────────────────────────
export interface MergedCatalogItem { slug: string; name: string; branches: Branch[] }

// Single-branch variant of the hook above — for the Dispatch tab's extra-item
// field, which the planner asked to suggest ONLY that specific branch's
// items (VRSNB items on the VRSNB panel, SNB items on the SNB panel), not a
// merged SNB+VRSNB list. Wrapped in the same MergedCatalogItem shape so it
// can feed the same <ItemSearchPicker> without a separate component.
export function useBranchOnlyCatalog(branch: Branch | null): MergedCatalogItem[] {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  useEffect(() => { if (branch === 'SNB' || branch === 'VRSNB') void loadCatalog(branch); }, [branch, loadCatalog]);
  return useMemo(() => {
    if (branch !== 'SNB' && branch !== 'VRSNB') return [];
    return (catalogItems[branch] ?? [])
      .filter((item) => item.active)
      .map((item) => ({ slug: canonicalItemSlug(item.name) || item.name.toLowerCase(), name: item.name, branches: [branch] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems, branch]);
}

export function useMergedLeftoverCatalog(): MergedCatalogItem[] {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  useEffect(() => { void loadCatalog('SNB'); void loadCatalog('VRSNB'); }, [loadCatalog]);
  return useMemo(() => {
    const map = new Map<string, MergedCatalogItem>();
    (['SNB', 'VRSNB'] as const).forEach((branch) => {
      (catalogItems[branch] ?? []).filter((item) => item.active).forEach((item) => {
        const slug = canonicalItemSlug(item.name);
        if (!slug) return;
        const existing = map.get(slug);
        if (existing) { if (!existing.branches.includes(branch)) existing.branches.push(branch); }
        else map.set(slug, { slug, name: item.name, branches: [branch] });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems]);
}

// FEATURE (2026-08-23): "Planner search should show VRSNB+SNB, remove
// duplicates." Three separate places in PlannerDashboard.tsx (Planning
// Tab's item picker, and two "extra produced item" pickers) each had their
// own local, weaker dedup — matching only on exact lowercased name, so
// "Rusk" (VRSNB) and "Rusk (250G)" (SNB) showed as two separate entries
// for what the item-master sync above just confirmed is the same product.
// useMergedLeftoverCatalog just above already solved this correctly for
// the Closing Stock picker, using canonicalItemSlug — which strips size/
// weight suffixes and normalizes punctuation, not just casing. This reuses
// that exact same matching, just extended to also carry price/unit/
// category, which those three call sites need and MergedCatalogItem
// doesn't carry (left that type alone since two other places already
// depend on its current shape).
export interface MergedCatalogItemWithPrice { slug: string; name: string; unit: 'pcs' | 'kg'; category: string; price: number; branches: Branch[] }
export function useMergedCatalogWithPrice(): MergedCatalogItemWithPrice[] {
  const { items: catalogItems, loadCatalog } = useBranchCatalogStore();
  useEffect(() => { void loadCatalog('SNB'); void loadCatalog('VRSNB'); }, [loadCatalog]);
  return useMemo(() => {
    const map = new Map<string, MergedCatalogItemWithPrice>();
    (['SNB', 'VRSNB'] as const).forEach((branch) => {
      (catalogItems[branch] ?? []).filter((item) => item.active).forEach((item) => {
        const slug = canonicalItemSlug(item.name);
        if (!slug) return;
        const existing = map.get(slug);
        if (existing) { if (!existing.branches.includes(branch)) existing.branches.push(branch); }
        else map.set(slug, {
          slug, name: item.name, branches: [branch],
          unit: item.uom === 'Kgs' ? 'kg' : 'pcs', category: item.category, price: item.price,
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogItems]);
}

function StatCard({ label, value, helper, icon, tone = 'slate' }: {
  label: string; value: React.ReactNode; helper?: string; icon: React.ReactNode; tone?: 'slate' | 'emerald' | 'blue' | 'amber' | 'red' | 'orange';
}) {
  const tones = { slate: 'bg-slate-100 text-slate-700', emerald: 'bg-teal-100 text-teal-700', blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700' };
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-display font-black text-foreground">{value}</p>{helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}</div><span className={cn('grid size-10 place-items-center rounded-xl', tones[tone])}>{icon}</span></div></div>;
}

// Search-as-you-type item picker. Typing a name with no catalogue match is
// still accepted (free text) — the closing-stock book has items (bulk mixes,
// packaging variants) that don't always exist as a sellable branch item.
// Exported so other Planner tabs (Production Entry's "extra produced item"
// field, Dispatch tab's branch-scoped "extra item" field) can reuse the same
// search-as-you-type picker instead of building their own.
export function ItemSearchPicker({ value, onChange, onSelect, items, placeholder }: {
  value: string; onChange: (v: string) => void; onSelect: (item: MergedCatalogItem) => void; items: MergedCatalogItem[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return items.slice(0, 25);
    return items.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 25);
  }, [items, query]);
  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? 'Search item (SNB + VRSNB, no duplicates)…'}
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
          {results.map((item) => (
            <button
              key={item.slug}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(item); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <span className="font-bold">{item.name}</span>
              <span className="text-[10px] font-black uppercase text-muted-foreground">{item.branches.join(' + ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlannerLeftoverTab() {
  const { currentUser } = useAuthStore();
  const staffName = currentUser?.displayName || currentUser?.username || 'Planner Staff';
  const catalog = useMergedLeftoverCatalog();

  const [rows, setRows] = useState<LeftoverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const { rows: fetched, error: fetchError } = await fetchLeftoverLedger();
    setRows(fetched);
    if (fetchError) setError(fetchError);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // FEATURE (2026-08-10): "cake orders should be clearly noted and tracked
  // in reports and closing stock." Cakes are custom-made per order (not a
  // pooled kg/pcs item), so they were never part of this ledger's balances —
  // but that also meant Closing Stock, where the planner already looks every
  // day, gave zero visibility into what's in flight at Cake Master. This is
  // a read-only same-day snapshot, deliberately kept separate from the
  // pooled-item balances table below rather than forced into it.
  const [cakeOrderCounts, setCakeOrderCounts] = useState<{ inProgress: number; readyOrPacked: number; dispatchedToday: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = kolkataToday();
      const toDateKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
      const { data } = await supabase
        .from('cake_master_orders')
        .select('status, updated_at')
        .in('status', ['New', 'Accepted', 'Baking', 'Ready for Packing', 'Packed', 'Dispatched']);
      if (cancelled || !data) return;
      const cakeRows = data as { status: string; updated_at: string | null }[];
      setCakeOrderCounts({
        inProgress: cakeRows.filter(r => ['New', 'Accepted', 'Baking'].includes(r.status)).length,
        readyOrPacked: cakeRows.filter(r => ['Ready for Packing', 'Packed'].includes(r.status)).length,
        dispatchedToday: cakeRows.filter(r => r.status === 'Dispatched' && r.updated_at && toDateKey(r.updated_at) === today).length,
      });
    })();
    return () => { cancelled = true; };
  }, [rows]);

  // ── Add-to-leftover form ─────────────────────────────────────────────────
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MergedCatalogItem | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<LeftoverUnit>('kg');
  const [entryDate, setEntryDate] = useState(kolkataToday());
  const [saving, setSaving] = useState(false);

  const resetForm = () => { setItemQuery(''); setSelectedItem(null); setQty(''); setUnit('kg'); setMessage(''); };

  const addLeftover = async () => {
    setError(''); setMessage('');
    const name = (selectedItem?.name || itemQuery).trim();
    const amount = Number(qty);
    if (!name) { setError('Search and pick (or type) an item first.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity greater than zero.'); return; }
    setSaving(true);
    const result = await recordLeftoverMovement({
      itemName: name, unit, delta: amount, businessDate: entryDate,
      reason: 'closing_stock', recordedBy: staffName,
    });
    setSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${name}: ${qtyFmt(amount)} ${unit} added to leftover (new balance ${qtyFmt(result.newBalance)} ${unit}).`);
    resetForm();
    void refresh();
  };

  // NOTE: Transfer Out now lives in its own standalone top-level Planner
  // tab — see `PlannerTransferOutTab` below. It still writes to this same
  // planner_leftover_ledger (reason: 'transfer_out'), so everything in this
  // tab (Daily Report "Transferred Out" column, Movement Log, Excel/PDF
  // exports) keeps working unchanged regardless of which tab created the
  // entry.

  // ── Write-off / correction ───────────────────────────────────────────────
  const [adjustingSlug, setAdjustingSlug] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  const submitAdjustment = async (balanceRow: { itemName: string; unit: LeftoverUnit; balance: number }) => {
    const amount = Number(adjustQty);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity to remove.'); return; }
    if (amount > balanceRow.balance + 0.001) { setError(`Cannot remove more than the ${qtyFmt(balanceRow.balance)} ${balanceRow.unit} available.`); return; }
    setAdjustSaving(true); setError('');
    const result = await recordLeftoverMovement({
      itemName: balanceRow.itemName, unit: balanceRow.unit, delta: -amount, businessDate: kolkataToday(),
      reason: 'adjustment', recordedBy: staffName, notes: adjustNote || 'Write-off / correction',
    });
    setAdjustSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${balanceRow.itemName}: ${qtyFmt(amount)} ${balanceRow.unit} removed (spoilage/correction).`);
    setAdjustingSlug(null); setAdjustQty(''); setAdjustNote('');
    void refresh();
  };

  // ── Edit the aggregate "Current Leftover Balance" row directly (item
  // name/unit/quantity) — this is the table the planner actually looks at
  // first, distinct from editing one Movement Log entry below. ───────────
  const [editBalanceKey, setEditBalanceKey] = useState<string | null>(null);
  const [editBalanceName, setEditBalanceName] = useState('');
  const [editBalanceUnit, setEditBalanceUnit] = useState<LeftoverUnit>('kg');
  const [editBalanceQty, setEditBalanceQty] = useState('');
  const [editBalanceSaving, setEditBalanceSaving] = useState(false);

  const startEditBalance = (row: { itemSlug: string; itemName: string; unit: LeftoverUnit; balance: number }) => {
    setEditBalanceKey(`${row.itemSlug}|${row.unit}`);
    setEditBalanceName(row.itemName);
    setEditBalanceUnit(row.unit);
    setEditBalanceQty(String(row.balance));
    setError(''); setMessage('');
  };

  const submitEditBalance = async (row: { itemSlug: string; itemName: string; unit: LeftoverUnit; balance: number }) => {
    const name = editBalanceName.trim();
    const target = Number(editBalanceQty);
    if (!name) { setError('Enter an item name.'); return; }
    if (!Number.isFinite(target)) { setError('Enter a valid balance quantity.'); return; }
    setEditBalanceSaving(true); setError('');
    const result = await renameAndCorrectClosingStockBalance({
      oldItemSlug: row.itemSlug, oldUnit: row.unit,
      newItemName: name, newUnit: editBalanceUnit, targetQuantity: target,
      editedBy: staffName,
    });
    setEditBalanceSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${name}: balance updated to ${qtyFmt(target)} ${editBalanceUnit}.`);
    setEditBalanceKey(null); setEditBalanceName(''); setEditBalanceQty('');
    void refresh();
  };

  // ── Edit a Closing Stock entry (item/qty/unit) ───────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState<LeftoverUnit>('kg');
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (row: LeftoverLedgerRow) => {
    setEditingId(row.id);
    setEditName(row.itemName);
    setEditQty(String(row.delta));
    setEditUnit(row.unit);
    setError(''); setMessage('');
  };

  const submitEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    const amount = Number(editQty);
    if (!name) { setError('Enter an item name.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity greater than zero.'); return; }
    setEditSaving(true); setError('');
    const result = await editClosingStockEntry({ entryId: editingId, itemName: name, unit: editUnit, quantity: amount, editedBy: staffName });
    setEditSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${name}: entry updated to ${qtyFmt(amount)} ${editUnit}.`);
    setEditingId(null); setEditName(''); setEditQty('');
    void refresh();
  };

  // ── Current running balance (all-time sum per item+unit) ────────────────
  const balances = useMemo(() => {
    const map = new Map<string, { itemSlug: string; itemName: string; unit: LeftoverUnit; balance: number; lastMovement: string }>();
    rows.forEach((row) => {
      const key = `${row.itemSlug}|${row.unit}`;
      const current = map.get(key) ?? { itemSlug: row.itemSlug, itemName: row.itemName, unit: row.unit, balance: 0, lastMovement: row.createdAt };
      current.balance += row.delta;
      current.itemName = row.itemName; // keep most-recent display spelling
      if (row.createdAt > current.lastMovement) current.lastMovement = row.createdAt;
      map.set(key, current);
    });
    // Negative balances are kept (not filtered out) — since dispatch is now
    // allowed to draw the pool below zero, a negative balance is a real
    // "backorder" signal (more was dispatched than was ever produced/added)
    // that staff need to see, not just items currently in surplus.
    return Array.from(map.values()).filter((row) => Math.abs(row.balance) > 0.001).sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [rows]);

  const todayRows = useMemo(() => rows.filter((row) => row.businessDate === kolkataToday()), [rows]);
  const addedTodayTotal = todayRows.filter((row) => row.delta > 0).length;
  const dispatchedTodayTotal = todayRows.filter((row) => row.reason === 'dispatch').length;
  const transferredOutTodayTotal = todayRows.filter((row) => row.reason === 'transfer_out').length;
  const extraTodayTotal = todayRows.filter((row) => row.isExtra).length;

  // ── Daily report (opening / added / dispatched / closing per item) ──────
  const [reportDate, setReportDate] = useState(kolkataToday());
  // Split what used to be a single "added" bucket into PRODUCED (from the
  // Production Entry tab marking an item complete — reason
  // 'production_carryover') and MANUALLY ADDED (a staff member typing a
  // closing-stock entry directly into this tab — reason 'closing_stock'),
  // so the owner can see exactly how much of today's stock came from actual
  // production vs. a manual count, not just one merged number.
  const reportRows = useMemo(() => {
    const map = new Map<string, {
      itemSlug: string; itemName: string; unit: LeftoverUnit;
      opening: number; produced: number; extraProduced: number; closingStockEntry: number;
      dispatched: number; extraDispatched: number; adjusted: number; closing: number;
      // FEATURE (2026-08-09): "Transfer Out" — stock sent out for a
      // specific tracked reason (not a branch dispatch, not spoilage/write-
      // off). Kept separate from `adjusted` and `dispatched` so reports show
      // exactly how much left this way and why.
      transferredOut: number; transferOutReasons: string[];
      // FEATURE (2026-08-09 / #279): adjustments (write-offs/corrections)
      // already carry a required-ish `notes` reason, same as transfer_out —
      // surface it the same way so the owner can tell what was written off
      // and why, not just that some quantity moved.
      adjustReasons: string[];
      dispatchByBranch: Record<string, number>;
      // Hosur only — which shop actually received each dispatched quantity,
      // instead of every Hosur dispatch collapsing into one combined number.
      dispatchByShop: Record<string, number>;
    }>();
    const ensure = (row: LeftoverLedgerRow) => {
      const key = `${row.itemSlug}|${row.unit}`;
      const current = map.get(key) ?? { itemSlug: row.itemSlug, itemName: row.itemName, unit: row.unit, opening: 0, produced: 0, extraProduced: 0, closingStockEntry: 0, dispatched: 0, extraDispatched: 0, adjusted: 0, closing: 0, transferredOut: 0, transferOutReasons: [], adjustReasons: [], dispatchByBranch: {}, dispatchByShop: {} };
      map.set(key, current);
      return current;
    };
    rows.forEach((row) => {
      if (row.businessDate < reportDate) {
        ensure(row).opening += row.delta;
      } else if (row.businessDate === reportDate) {
        const entry = ensure(row);
        entry.itemName = row.itemName;
        if (row.reason === 'dispatch') {
          entry.dispatched += Math.abs(row.delta);
          if (row.isExtra) entry.extraDispatched += Math.abs(row.delta);
          const branchKey = row.branch || 'Unspecified';
          entry.dispatchByBranch[branchKey] = (entry.dispatchByBranch[branchKey] || 0) + Math.abs(row.delta);
          if (row.shopName) entry.dispatchByShop[row.shopName] = (entry.dispatchByShop[row.shopName] || 0) + Math.abs(row.delta);
        } else if (row.reason === 'transfer_out') {
          entry.transferredOut += Math.abs(row.delta);
          if (row.notes) entry.transferOutReasons.push(row.notes);
        } else if (row.reason === 'adjustment' || row.reason === 'return') {
          entry.adjusted += row.delta;
          if (row.notes) entry.adjustReasons.push(row.notes);
        } else if (row.reason === 'production_carryover') {
          entry.produced += row.delta;
          if (row.isExtra) entry.extraProduced += row.delta;
        } else {
          entry.closingStockEntry += row.delta;
        }
      }
    });
    return Array.from(map.values())
      .map((entry) => ({ ...entry, closing: entry.opening + entry.produced + entry.closingStockEntry - entry.dispatched - entry.transferredOut + entry.adjusted }))
      .filter((entry) => Math.abs(entry.opening) > 0.001 || Math.abs(entry.produced) > 0.001 || Math.abs(entry.closingStockEntry) > 0.001 || Math.abs(entry.dispatched) > 0.001 || Math.abs(entry.transferredOut) > 0.001 || Math.abs(entry.adjusted) > 0.001)
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [rows, reportDate]);

  const reportMovements = useMemo(() => rows.filter((row) => row.businessDate === reportDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [rows, reportDate]);

  const reportTotals = useMemo(() => reportRows.reduce((sum, row) => ({
    produced: sum.produced + (row.unit === 'kg' ? row.produced : 0),
    added: sum.added + (row.unit === 'kg' ? row.closingStockEntry : 0),
    dispatched: sum.dispatched + (row.unit === 'kg' ? row.dispatched : 0),
    extraProduced: sum.extraProduced + (row.unit === 'kg' ? row.extraProduced : 0),
    extraDispatched: sum.extraDispatched + (row.unit === 'kg' ? row.extraDispatched : 0),
  }), { produced: 0, added: 0, dispatched: 0, extraProduced: 0, extraDispatched: 0 }), [reportRows]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const addSheet = (data: Record<string, unknown>[], name: string, fallback: string) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ Note: fallback }]), name.slice(0, 31));
    };
    addSheet([
      { Metric: 'Business Date', Value: dateLabel(reportDate) },
      { Metric: 'Items with activity', Value: reportRows.length },
      { Metric: 'Items currently in leftover pool', Value: balances.length },
    ], 'Summary', 'No data');
    addSheet(reportRows.map((row) => ({
      Item: row.itemName, Unit: row.unit,
      Opening: row.opening,
      'Produced Today': row.produced,
      'Of Which Extra (Not Ordered)': row.extraProduced,
      'Added (Closing Stock Entry) Today': row.closingStockEntry,
      'Dispatched Today': row.dispatched,
      'Of Which Extra (Not Ordered) ': row.extraDispatched,
      ...Object.fromEntries(BRANCHES.map((b) => [`Dispatched to ${b}`, row.dispatchByBranch[b] || 0])),
      'Dispatched By Hosur Shop': Object.entries(row.dispatchByShop).map(([shop, q]) => `${shop}: ${q}`).join(', ') || '-',
      'Transferred Out': row.transferredOut,
      'Transfer Out Reason(s)': row.transferOutReasons.join('; ') || '-',
      Adjusted: row.adjusted,
      'Adjustment Reason(s)': row.adjustReasons.join('; ') || '-',
      Closing: row.closing,
    })), 'Daily Reconciliation', 'No leftover activity on this date');
    addSheet(reportMovements.map((row) => ({
      Time: new Date(row.createdAt).toLocaleString('en-IN'), Item: row.itemName, Unit: row.unit,
      Quantity: row.delta, Type: reasonLabel(row.reason),
      'Extra / Non-Requested': row.isExtra ? 'Yes' : 'No',
      Branch: row.branch || '-', 'Hosur Shop': row.shopName || '-',
      'Order #': row.orderNumber ?? '-', 'Recorded By': row.recordedBy, Notes: row.notes || '-',
    })), 'Movement Log', 'No movements on this date');
    addSheet(balances.map((row) => ({ Item: row.itemName, Unit: row.unit, 'Current Balance': row.balance })), 'Current Balance (All Items)', 'No leftover stock currently held');
    XLSX.writeFile(wb, `planner-closing-stock-${reportDate}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;
    let y = 48;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
    doc.text('Cafe Aadvikam — Closing Stock / Leftover Report', marginX, y);
    y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Business Date: ${dateLabel(reportDate)}  ·  Generated: ${new Date().toLocaleString('en-IN')}`, marginX, y);
    doc.setTextColor(0); y += 26;

    const ensureRoom = (needed: number) => { if (y + needed > 780) { doc.addPage(); y = 50; } };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Summary', marginX, y); y += 10;
    const kpis: [string, string][] = [
      ['Items With Activity', String(reportRows.length)],
      ['Produced Today (Kg total)', qtyFmt(reportTotals.produced)],
      ['Manually Added Today (Kg total)', qtyFmt(reportTotals.added)],
      ['Dispatched From Leftover (Kg total)', qtyFmt(reportTotals.dispatched)],
      ['Extra Produced (Kg, not ordered)', qtyFmt(reportTotals.extraProduced)],
      ['Extra Dispatched (Kg, not ordered)', qtyFmt(reportTotals.extraDispatched)],
      ['Items Currently In Pool', String(balances.length)],
    ];
    const kpiColWidth = (pageWidth - marginX * 2) / 2;
    kpis.forEach(([label, value], i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const x = marginX + col * kpiColWidth;
      const yy = y + 16 + row * 36;
      doc.setDrawColor(210); doc.rect(x, yy - 14, kpiColWidth - 8, 32);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(label, x + 6, yy - 3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0);
      doc.text(value, x + 6, yy + 12);
    });
    y += 16 + Math.ceil(kpis.length / 2) * 36 + 14;

    const drawTable = (title: string, headers: string[], colWidths: number[], dataRows: string[][], emptyText: string) => {
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
      for (const cells of dataRows) {
        if (y > 770) { doc.addPage(); y = 50; drawHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30); }
        let x = marginX;
        cells.forEach((c, i) => { doc.text(c, x + 4, y); x += colWidths[i]; });
        doc.setDrawColor(235); doc.line(marginX, y + 4, marginX + totalWidth, y + 4);
        y += 14;
      }
      if (dataRows.length === 0) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(120); doc.text(emptyText, marginX, y); y += 14; doc.setTextColor(0); }
      y += 12;
    };

    drawTable(
      'Daily Reconciliation',
      ['Item', 'Unit', 'Opening', 'Produced', 'Extra Prod.', 'Added', 'Dispatched', 'Extra Disp.', 'Transfer Out', 'Adjusted', 'Closing'],
      [82, 24, 38, 42, 40, 38, 44, 40, 46, 38, 40],
      reportRows.map((row) => [row.itemName.slice(0, 16), row.unit, qtyFmt(row.opening), qtyFmt(row.produced), row.extraProduced > 0 ? qtyFmt(row.extraProduced) : '-', qtyFmt(row.closingStockEntry), qtyFmt(row.dispatched), row.extraDispatched > 0 ? qtyFmt(row.extraDispatched) : '-', row.transferredOut > 0 ? qtyFmt(row.transferredOut) : '-', qtyFmt(row.adjusted), qtyFmt(row.closing)]),
      'No leftover activity recorded for this date.',
    );

    // FEATURE (2026-08-09): "reports/closing stock exports must show reasons
    // clearly so the owner can immediately understand what stock was sent
    // where or misused and why" — the columns above only fit a quantity,
    // so every transfer-out's actual reason gets its own table underneath.
    const transferOutDetail = reportRows.filter((row) => row.transferredOut > 0.001 && row.transferOutReasons.length > 0);
    if (transferOutDetail.length > 0) {
      drawTable(
        'Transfer Out — Reasons',
        ['Item', 'Qty', 'Reason(s)'],
        [140, 60, 300],
        transferOutDetail.map((row) => [row.itemName.slice(0, 26), `${qtyFmt(row.transferredOut)} ${row.unit}`, row.transferOutReasons.join('; ').slice(0, 80)]),
        'No transfers out on this date.',
      );
    }

    // FEATURE (2026-08-09 / #279): same treatment for write-offs/corrections
    // — the Daily Reconciliation table above only has room for the net
    // adjustment quantity, so the actual reason gets its own detail table.
    const adjustDetail = reportRows.filter((row) => row.adjusted !== 0 && row.adjustReasons.length > 0);
    if (adjustDetail.length > 0) {
      drawTable(
        'Adjustments / Write-offs — Reasons',
        ['Item', 'Qty', 'Reason(s)'],
        [140, 60, 300],
        adjustDetail.map((row) => [row.itemName.slice(0, 26), `${qtyFmt(row.adjusted)} ${row.unit}`, row.adjustReasons.join('; ').slice(0, 80)]),
        'No adjustments on this date.',
      );
    }

    drawTable(
      'Movement Log',
      ['Time', 'Item', 'Qty', 'Type', 'Extra', 'Branch', 'Hosur Shop', 'Order #', 'By'],
      [55, 95, 42, 58, 34, 42, 65, 40, 65],
      reportMovements.map((row) => [
        new Date(row.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        row.itemName.slice(0, 16), `${row.delta > 0 ? '+' : ''}${qtyFmt(row.delta)}${row.unit}`,
        reasonLabel(row.reason), row.isExtra ? 'Yes' : '-', row.branch || '-', row.shopName || '-', row.orderNumber ? String(row.orderNumber) : '-', row.recordedBy.slice(0, 14),
      ]),
      'No movements on this date.',
    );

    drawTable(
      'Current Leftover Balance (All Items)',
      ['Item', 'Unit', 'Balance'],
      [300, 60, 100],
      balances.map((row) => [row.itemName.slice(0, 48), row.unit, qtyFmt(row.balance)]),
      'No leftover stock currently held.',
    );

    doc.save(`planner-closing-stock-${reportDate}.pdf`);
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="size-7 animate-spin text-teal-600" /></div>;

  return (
    <section className="space-y-5">
      <div className="flex justify-end">
        <button onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-muted-foreground hover:bg-muted"><RefreshCw className="size-3.5" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline size-4" />{error}</div>}
      {message && <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-700"><CheckCircle2 className="mr-2 inline size-4" />{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Items In Leftover Pool" value={balances.length} icon={<PackageCheck className="size-5" />} tone="emerald" />
        <StatCard label="Added Today" value={addedTodayTotal} helper="Entries recorded today" icon={<Plus className="size-5" />} tone="blue" />
        <StatCard label="Dispatched From Leftover Today" value={dispatchedTodayTotal} icon={<Scale className="size-5" />} tone="amber" />
        <StatCard label="Transferred Out Today" value={transferredOutTodayTotal} helper="Sent out for a tracked reason" icon={<Truck className="size-5" />} tone="orange" />
        <StatCard label="Extra / Non-Requested Today" value={extraTodayTotal} helper="Produced or dispatched beyond what was ordered" icon={<AlertTriangle className="size-5" />} tone="red" />
        <StatCard label="Total Movements Logged" value={rows.length} icon={<History className="size-5" />} tone="slate" />
      </div>

      {cakeOrderCounts && (cakeOrderCounts.inProgress + cakeOrderCounts.readyOrPacked + cakeOrderCounts.dispatchedToday) > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
          <div className="flex items-center gap-2"><Cake className="size-4 text-rose-500" /><h3 className="font-black text-rose-900">Cake Orders (Cake Master — not part of the pooled balances below)</h3></div>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <StatCard label="In Progress at Cake Master" value={cakeOrderCounts.inProgress} helper="New / Accepted / Baking" icon={<Loader2 className="size-5" />} tone="blue" />
            <StatCard label="Ready / Packed" value={cakeOrderCounts.readyOrPacked} helper="Waiting on dispatch" icon={<PackageCheck className="size-5" />} tone="amber" />
            <StatCard label="Dispatched Today" value={cakeOrderCounts.dispatchedToday} icon={<Truck className="size-5" />} tone="emerald" />
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="font-black">Record Leftover / Closing Stock</h3>
          <p className="mt-1 text-xs text-muted-foreground">Search picks up items from both SNB and VRSNB catalogues (shown once each). Typing a name not in either catalogue is still accepted.</p>
          <div className="mt-3 space-y-3">
            <ItemSearchPicker
              value={selectedItem ? selectedItem.name : itemQuery}
              onChange={(v) => { setItemQuery(v); setSelectedItem(null); }}
              onSelect={(item) => { setSelectedItem(item); setItemQuery(item.name); }}
              items={catalog}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-black text-muted-foreground">Quantity</span>
                <input type="number" min="0" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold" placeholder="0" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-black text-muted-foreground">Business Date</span>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setUnit('kg')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', unit === 'kg' ? 'border-teal-700 bg-teal-700 text-white' : 'bg-background')}>Kg / Weight</button>
              <button onClick={() => setUnit('pcs')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', unit === 'pcs' ? 'border-teal-700 bg-teal-700 text-white' : 'bg-background')}>Pcs / Pieces</button>
            </div>
            <button onClick={addLeftover} disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Add To Leftover
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b bg-muted/30 px-4 py-3"><h3 className="font-black">Current Leftover Balance</h3><p className="text-xs text-muted-foreground">Running total across all history — this is what's available to dispatch first. A negative balance means more was dispatched than produced/added (a backorder) — it clears automatically once more is produced.</p></div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2.5 text-left">Item</th><th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {balances.length ? balances.map((row) => {
                  const isBackorder = row.balance < -0.001;
                  const key = `${row.itemSlug}|${row.unit}`;
                  if (editBalanceKey === key) {
                    return (
                      <tr key={key} className="bg-teal-50/60">
                        <td className="px-4 py-2.5" colSpan={3}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input autoFocus value={editBalanceName} onChange={(e) => setEditBalanceName(e.target.value)} placeholder="Item name" className="h-8 min-w-[140px] flex-1 rounded-lg border bg-background px-2 text-xs font-bold" />
                            <input type="number" step="0.001" value={editBalanceQty} onChange={(e) => setEditBalanceQty(e.target.value)} placeholder="Balance qty" className="h-8 w-24 rounded-lg border bg-background px-2 text-right text-xs font-bold" />
                            <select value={editBalanceUnit} onChange={(e) => setEditBalanceUnit(e.target.value as LeftoverUnit)} className="h-8 rounded-lg border bg-background px-1 text-xs font-bold">
                              <option value="kg">kg</option>
                              <option value="pcs">pcs</option>
                            </select>
                            <button onClick={() => submitEditBalance(row)} disabled={editBalanceSaving} className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50">{editBalanceSaving ? '…' : 'Save'}</button>
                            <button onClick={() => { setEditBalanceKey(null); setEditBalanceName(''); setEditBalanceQty(''); }} className="rounded-lg bg-muted px-1.5 py-1.5"><X className="size-3" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                  <tr key={key} className={isBackorder ? 'bg-red-50/60' : undefined}>
                    <td className="px-4 py-2.5 font-bold">{row.itemName}</td>
                    <td className={cn('px-4 py-2.5 text-right font-black', isBackorder && 'text-red-700')}>
                      {qtyFmt(row.balance)} {row.unit}
                      {isBackorder && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-700">Backorder</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {adjustingSlug === key ? (
                        <div className="flex items-center justify-end gap-1">
                          <input autoFocus type="number" min="0" step="0.001" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="h-8 w-20 rounded-lg border bg-background px-2 text-xs" placeholder="qty" />
                          <button onClick={() => submitAdjustment(row)} disabled={adjustSaving} className="rounded-lg bg-red-600 px-2 py-1.5 text-[10px] font-black text-white">{adjustSaving ? '…' : 'Remove'}</button>
                          <button onClick={() => { setAdjustingSlug(null); setAdjustQty(''); setAdjustNote(''); }} className="rounded-lg bg-muted px-1.5 py-1.5"><X className="size-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEditBalance(row)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted">Edit</button>
                          {!isBackorder && (
                            <button onClick={() => setAdjustingSlug(key)} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-700"><Minus className="size-3" />Write-off</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                }) : <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">No leftover stock currently held.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div>
            <h3 className="font-black">Daily Report</h3>
            <p className="text-xs text-muted-foreground">Opening balance, what was added, what was dispatched from leftover, and the closing balance — for any business date.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-2"><CalendarDays className="size-4 text-muted-foreground" /><input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="bg-transparent text-sm font-bold" /></div>
            <button onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-black"><FileSpreadsheet className="size-4" />Excel</button>
            <button onClick={exportPdf} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"><Printer className="size-4" />PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Produced Today</th>
                <th className="px-4 py-3 text-right">Added Today</th>
                <th className="px-4 py-3 text-right">Dispatched Today</th>
                <th className="px-4 py-3 text-left">Dispatched To</th>
                <th className="px-4 py-3 text-right">Transferred Out</th>
                <th className="px-4 py-3 text-right">Adjusted</th>
                <th className="px-4 py-3 text-right">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reportRows.length ? reportRows.map((row) => (
                <tr key={`${row.itemSlug}|${row.unit}`}>
                  <td className="px-4 py-3 font-black">{row.itemName} <span className="text-[10px] font-bold text-muted-foreground">{row.unit}</span></td>
                  <td className="px-4 py-3 text-right">{qtyFmt(row.opening)}</td>
                  <td className="px-4 py-3 text-right text-blue-700 font-bold">
                    {row.produced > 0 ? `+${qtyFmt(row.produced)}` : '-'}
                    {row.extraProduced > 0 && (
                      <span className="ml-1.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-fuchsia-700" title="Not tied to any order — recorded via the Production Entry tab's extra-item field.">
                        +{qtyFmt(row.extraProduced)} extra
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-teal-700 font-bold">{row.closingStockEntry > 0 ? `+${qtyFmt(row.closingStockEntry)}` : '-'}</td>
                  <td className="px-4 py-3 text-right text-amber-700 font-bold">
                    {row.dispatched > 0 ? `-${qtyFmt(row.dispatched)}` : '-'}
                    {row.extraDispatched > 0 && (
                      <span className="ml-1.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-fuchsia-700" title="Dispatched on top of what was actually ordered, via the Dispatch tab's extra/non-requested item field.">
                        {qtyFmt(row.extraDispatched)} extra
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {Object.entries(row.dispatchByBranch).map(([b, q]) => `${b}: ${qtyFmt(q)}`).join(', ') || '-'}
                    {Object.keys(row.dispatchByShop).length > 0 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                        {Object.entries(row.dispatchByShop).map(([shop, q]) => `${shop}: ${qtyFmt(q)}`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-700 font-bold">
                    {row.transferredOut > 0 ? (
                      <div>
                        <span>-{qtyFmt(row.transferredOut)}</span>
                        {row.transferOutReasons.length > 0 && (
                          <div className="mt-0.5 text-[10px] font-normal text-muted-foreground" title={row.transferOutReasons.join('; ')}>
                            {row.transferOutReasons.join('; ')}
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.adjusted !== 0 ? (
                      <div>
                        <span>{qtyFmt(row.adjusted)}</span>
                        {row.adjustReasons.length > 0 && (
                          <div className="mt-0.5 text-[10px] font-normal text-muted-foreground" title={row.adjustReasons.join('; ')}>
                            {row.adjustReasons.join('; ')}
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-black">{qtyFmt(row.closing)}</td>
                </tr>
              )) : <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No leftover activity on {dateLabel(reportDate)}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3"><h3 className="font-black">Movement Log — {dateLabel(reportDate)}</h3><p className="text-xs text-muted-foreground">Every individual entry, for full traceability.</p></div>
        <div className="max-h-80 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2.5 text-left">Time</th><th className="px-4 py-2.5 text-left">Item</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-left">Branch / Order / Shop</th><th className="px-4 py-2.5 text-left">By</th><th className="px-4 py-2.5 text-right">Edit</th></tr>
            </thead>
            <tbody className="divide-y">
              {reportMovements.length ? reportMovements.map((row) => {
                const isEditing = editingId === row.id;
                // FEATURE (2026-08-09, updated): originally only manually-
                // recorded Closing Stock entries could be edited here —
                // dispatch/production rows were treated as a protected audit
                // trail. The user explicitly asked for "complete ability to
                // edit all the things like quantity and unit and name" for
                // every row, so this is now open to every reason.
                // edit_closing_stock_entry_secure preserves each row's
                // original +/- direction (a dispatch/adjustment/transfer_out
                // row stays a deduction, a closing_stock/production row stays
                // an addition) so editing the quantity here can't flip a
                // subtraction into an addition and corrupt the balance.
                const editable = true;
                if (isEditing) {
                  return (
                    <tr key={row.id} className="bg-teal-50/60">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2"><input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold" /></td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <input type="number" min="0" step="0.001" value={editQty} onChange={(e) => setEditQty(e.target.value)} className="h-8 w-20 rounded-lg border bg-background px-2 text-right text-xs font-bold" />
                          <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as LeftoverUnit)} className="h-8 rounded-lg border bg-background px-1 text-xs font-bold">
                            <option value="kg">kg</option>
                            <option value="pcs">pcs</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">{reasonLabel(row.reason)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{[row.branch, row.orderNumber ? `#${row.orderNumber}` : null, row.notes].filter(Boolean).join(' · ') || '-'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.recordedBy}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={submitEdit} disabled={editSaving} className="rounded-lg bg-teal-700 px-2 py-1.5 text-[10px] font-black text-white disabled:opacity-50">{editSaving ? '…' : 'Save'}</button>
                          <button onClick={() => { setEditingId(null); setEditName(''); setEditQty(''); }} className="rounded-lg bg-muted px-1.5 py-1.5"><X className="size-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                <tr key={row.id} className={row.isExtra ? 'bg-fuchsia-50/50' : undefined}>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2 font-bold">{row.itemName}</td>
                  <td className={cn('px-4 py-2 text-right font-black', row.delta > 0 ? 'text-teal-700' : 'text-red-700')}>{row.delta > 0 ? '+' : ''}{qtyFmt(row.delta)} {row.unit}</td>
                  <td className="px-4 py-2 text-xs">{reasonLabel(row.reason)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.isExtra && (
                        <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-fuchsia-700" title="Not tied to any order — an extra/non-requested item.">
                          Extra
                        </span>
                      )}
                      {row.shopName && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">{row.shopName}</span>
                      )}
                      <span>{[row.branch, row.orderNumber ? `#${row.orderNumber}` : null, row.notes].filter(Boolean).join(' · ') || (row.isExtra || row.shopName ? '' : '-')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{row.recordedBy}</td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <button onClick={() => startEdit(row)} className="rounded-lg border px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted">Edit</button>
                    ) : <span className="text-[10px] font-bold text-muted-foreground/50">—</span>}
                  </td>
                </tr>
                );
              }) : <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No movements on this date.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Transfer Out (standalone top-level Planner tab) ────────────────────────
// Promoted out of the Closing Stock tab into its own top-level Planner tab —
// mirrors the "Transfer In" tab's placement/pattern (own PlannerTab value,
// own TABS entry, own WorkspaceChrome sidebar link). Still writes to the
// SAME planner_leftover_ledger (reason: 'transfer_out') via
// recordLeftoverMovement, so Closing Stock's Daily Report "Transferred Out"
// column, Movement Log, and Excel/PDF exports keep showing these entries
// exactly as before, regardless of which tab created them.
// FEATURE (2026-08-12): "I need the invoice with the value of the item if we
// select SNB then snb price should come in the invoice and if we select the
// vrsnb then vrsnb price should come and if we select custom then we need to
// enter the reason and take the price from snb" — normalizes an item name
// the same loose way OwnerDashboard's pricing lookups do, so "Milk Peda" and
// "milk peda " match the catalog row.
const transferNormalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function transferPriceFor(catalogItems: Record<'SNB' | 'VRSNB', { name: string; price: number; uom: 'Nos' | 'Kgs' }[]>, destination: 'SNB' | 'VRSNB' | 'Custom', itemName: string): { price: number; uom: 'Nos' | 'Kgs' } | null {
  // Custom transfers price against SNB, per explicit owner instruction.
  const priceBranch: 'SNB' | 'VRSNB' = destination === 'VRSNB' ? 'VRSNB' : 'SNB';
  const key = transferNormalizeName(itemName);
  const match = catalogItems[priceBranch].find((it) => transferNormalizeName(it.name) === key);
  return match ? { price: match.price, uom: match.uom } : null;
}

// Converts a transfer's quantity (in whatever unit the staff member picked
// on the form) to the unit the catalog price actually assumes, using the
// item's known per-piece weight where one can be resolved. Returns null
// (never a guessed value) when the two are genuinely different kinds of
// unit and the weight can't be resolved — same rule as everywhere else
// this bug class was fixed this session.
function convertTransferQtyForPricing(itemSlug: string, itemName: string, qty: number, formUnit: LeftoverUnit, catalogUom: 'Nos' | 'Kgs'): { qty: number; unit: LeftoverUnit } | null {
  const formIsWeight = formUnit === 'kg';
  const catalogIsCount = catalogUom === 'Nos';
  if (formIsWeight === !catalogIsCount) return { qty, unit: formUnit }; // already the same kind of unit
  const weightGrams = resolveItemWeightGrams(itemSlug, itemName);
  if (weightGrams === null) return null;
  if (formIsWeight && catalogIsCount) {
    const pcs = kgToPcs(qty, weightGrams);
    return pcs === null ? null : { qty: pcs, unit: 'pcs' };
  }
  return { qty: Math.round((qty * weightGrams / 1000) * 1000) / 1000, unit: 'kg' };
}

function downloadTransferOutInvoice(params: {
  itemName: string; qty: number; unit: LeftoverUnit; destination: 'SNB' | 'VRSNB' | 'Custom';
  unitPrice: number | null; reason: string; staffName: string; createdAt: Date; transferNo: string;
}) {
  const { itemName, qty, unit, destination, unitPrice, reason, staffName, createdAt, transferNo } = params;
  const totalValue = unitPrice != null ? unitPrice * qty : null;
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  const marginX = 36;
  let y = 46;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20);
  doc.text('Cafe Aadvikam — Transfer Out Invoice', marginX, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text(`Transfer No: ${transferNo}`, marginX, y); y += 14;
  doc.text(`Date: ${createdAt.toLocaleString('en-IN')}`, marginX, y); y += 14;
  doc.text(`Recorded By: ${staffName}`, marginX, y); y += 20;
  doc.setDrawColor(210); doc.line(marginX, y, doc.internal.pageSize.getWidth() - marginX, y); y += 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0);
  doc.text('Destination', marginX, y);
  doc.text(destination === 'Custom' ? 'Custom' : destination, marginX + 160, y);
  y += 18;
  doc.text('Item', marginX, y);
  doc.text(itemName, marginX + 160, y);
  y += 18;
  doc.text('Quantity', marginX, y);
  doc.text(`${qtyFmt(qty)} ${unit}`, marginX + 160, y);
  y += 18;
  doc.text('Unit Price', marginX, y);
  doc.text(unitPrice != null ? `Rs. ${unitPrice.toFixed(2)}` : 'N/A', marginX + 160, y);
  y += 18;
  doc.setFontSize(13);
  doc.text('Total Value', marginX, y);
  doc.text(totalValue != null ? `Rs. ${totalValue.toFixed(2)}` : 'N/A', marginX + 160, y);
  y += 24;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Reason', marginX, y); y += 14;
  const reasonLines = doc.splitTextToSize(reason || '-', doc.internal.pageSize.getWidth() - marginX * 2);
  doc.text(reasonLines, marginX, y);
  if (destination === 'Custom') {
    y += reasonLines.length * 12 + 10;
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('Custom transfer — priced against the SNB catalog for reference.', marginX, y);
  }
  doc.save(`transfer-out-${transferNo}.pdf`);
}

export function PlannerTransferOutTab() {
  const { currentUser } = useAuthStore();
  const staffName = currentUser?.displayName || currentUser?.username || 'Planner Staff';
  const catalog = useMergedLeftoverCatalog();
  const { items: transferCatalogItems } = useBranchCatalogStore();

  const [rows, setRows] = useState<LeftoverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const { rows: fetched, error: fetchError } = await fetchLeftoverLedger();
    setRows(fetched);
    if (fetchError) setError(fetchError);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const [transferQuery, setTransferQuery] = useState('');
  const [transferItem, setTransferItem] = useState<MergedCatalogItem | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferUnit, setTransferUnit] = useState<LeftoverUnit>('kg');
  const [transferReason, setTransferReason] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  // FEATURE (2026-08-12): destination decides which branch's catalog price
  // gets used on the invoice — SNB dest -> SNB price, VRSNB dest -> VRSNB
  // price, Custom -> priced against SNB but requires its own reason text.
  const [transferDestination, setTransferDestination] = useState<'SNB' | 'VRSNB' | 'Custom'>('SNB');

  const resetTransferForm = () => { setTransferQuery(''); setTransferItem(null); setTransferQty(''); setTransferUnit('kg'); setTransferReason(''); setTransferDestination('SNB'); };

  const transferItemName = (transferItem?.name || transferQuery).trim();
  const transferItemSlug = transferItem?.slug ?? canonicalItemSlug(transferItemName);
  const transferCatalogEntry = transferItemName ? transferPriceFor(transferCatalogItems, transferDestination, transferItemName) : null;
  const transferQtyNumber = Number(transferQty);
  const transferQtyValid = Number.isFinite(transferQtyNumber) && transferQtyNumber > 0;
  // BUG FIX (2026-08-17): convert the form's quantity to whatever unit the
  // catalog price is actually for before multiplying — see
  // convertTransferQtyForPricing's own comment for the full story. Null
  // when they're different kinds of unit and no weight could be resolved,
  // which correctly makes transferTotalValue null too (shown as "Price
  // N/A" rather than a wrong number) instead of silently pricing a kg
  // quantity at a per-piece rate or vice versa.
  const transferConverted = transferCatalogEntry && transferQtyValid
    ? convertTransferQtyForPricing(transferItemSlug, transferItemName, transferQtyNumber, transferUnit, transferCatalogEntry.uom)
    : null;
  const transferTotalValue = transferConverted && transferCatalogEntry ? transferCatalogEntry.price * transferConverted.qty : null;

  const submitTransferOut = async () => {
    setError(''); setMessage('');
    const name = transferItemName;
    const amount = Number(transferQty);
    if (!name) { setError('Search and pick (or type) an item first.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity greater than zero.'); return; }
    if (!transferReason.trim()) { setError(transferDestination === 'Custom' ? 'Enter a reason for this custom transfer.' : 'Enter a reason for this transfer out.'); return; }
    setTransferSaving(true);
    const reasonText = transferReason.trim();
    const result = await recordLeftoverMovement({
      itemName: name, unit: transferUnit, delta: -amount, businessDate: kolkataToday(),
      reason: 'transfer_out', recordedBy: staffName, notes: `${reasonText} [Destination: ${transferDestination}]`,
    });
    setTransferSaving(false);
    if ('error' in result) { setError(result.error); return; }
    setMessage(`${name}: ${qtyFmt(amount)} ${transferUnit} transferred out to ${transferDestination} (${reasonText}). New balance ${qtyFmt(result.newBalance)} ${transferUnit}.`);
    // The ledger entry above always uses the form's own unit (transferUnit)
    // — that's the actual physical movement being recorded and shouldn't
    // change. Only the PRINTED invoice's quantity/unit are converted, so
    // the price shown is for the same unit as the quantity shown.
    downloadTransferOutInvoice({
      itemName: name, qty: transferConverted?.qty ?? amount, unit: transferConverted?.unit ?? transferUnit, destination: transferDestination,
      unitPrice: transferCatalogEntry?.price ?? null, reason: reasonText, staffName, createdAt: new Date(),
      transferNo: `TO-${kolkataToday()}-${Date.now().toString().slice(-6)}`,
    });
    resetTransferForm();
    void refresh();
  };

  const history = useMemo(
    () => rows.filter((row) => row.reason === 'transfer_out').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows],
  );
  const [historyQuery, setHistoryQuery] = useState('');
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((row) => row.itemName.toLowerCase().includes(q) || (row.notes || '').toLowerCase().includes(q));
  }, [history, historyQuery]);

  const todayCount = useMemo(() => history.filter((row) => row.businessDate === kolkataToday()).length, [history]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="size-7 animate-spin text-orange-600" /></div>;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-black text-foreground">Transfer Out</h2>
          <p className="text-xs text-muted-foreground">Send stock out for a specific tracked reason — not a branch dispatch, not spoilage. A reason is required and shown in Closing Stock reports.</p>
        </div>
        <button onClick={refresh} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-muted-foreground hover:bg-muted"><RefreshCw className="size-3.5" />Refresh</button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline size-4" />{error}</div>}
      {message && <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-700"><CheckCircle2 className="mr-2 inline size-4" />{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Transferred Out Today" value={todayCount} helper="Entries recorded today" icon={<Truck className="size-5" />} tone="orange" />
        <StatCard label="Total Transfers Logged" value={history.length} icon={<History className="size-5" />} tone="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
          <h3 className="font-black text-orange-900">Record a Transfer Out</h3>
          <p className="text-xs text-orange-800/80">Pick any stock item and send it out for a specific reason.</p>
          <label className="block space-y-1">
            <span className="text-xs font-black text-orange-900">Destination</span>
            <div className="grid grid-cols-3 gap-2">
              {(['SNB', 'VRSNB', 'Custom'] as const).map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => setTransferDestination(dest)}
                  className={cn('rounded-xl border py-2 text-xs font-black', transferDestination === dest ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-200 bg-white text-orange-900')}
                >
                  {dest}
                </button>
              ))}
            </div>
            {transferDestination === 'Custom' && (
              <p className="text-[10px] font-bold text-orange-700/80">Custom transfers are priced against the SNB catalog and require a reason below.</p>
            )}
          </label>
          <ItemSearchPicker
            value={transferItem ? transferItem.name : transferQuery}
            onChange={(v) => { setTransferQuery(v); setTransferItem(null); }}
            onSelect={(item) => { setTransferItem(item); setTransferQuery(item.name); }}
            items={catalog}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-black text-orange-900">Quantity</span>
              <input type="number" min="0" step="0.001" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} className="h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm font-bold" placeholder="0" />
            </label>
            <div className="flex items-end gap-2">
              <button onClick={() => setTransferUnit('kg')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', transferUnit === 'kg' ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-200 bg-white text-orange-900')}>Kg</button>
              <button onClick={() => setTransferUnit('pcs')} className={cn('flex-1 rounded-xl border py-2.5 text-sm font-black', transferUnit === 'pcs' ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-200 bg-white text-orange-900')}>Pcs</button>
            </div>
          </div>
          {/* Live price/value preview — SNB dest -> SNB price, VRSNB dest ->
              VRSNB price, Custom -> SNB price for reference. */}
          {transferItemName && (
            <div className="rounded-xl border border-orange-200 bg-white/70 px-3 py-2 text-xs font-bold text-orange-900">
              {transferCatalogEntry != null ? (
                <>Unit Price ({transferDestination === 'VRSNB' ? 'VRSNB' : 'SNB'} catalog): Rs. {transferCatalogEntry.price.toFixed(2)} / {transferCatalogEntry.uom}
                  {transferTotalValue != null
                    ? <> &middot; Total Value: <strong>Rs. {transferTotalValue.toFixed(2)}</strong></>
                    : transferQtyValid && <> &middot; <span className="text-destructive">Can't convert {transferUnit} to {transferCatalogEntry.uom} for this item — invoice will show N/A.</span></>}
                </>
              ) : 'Price not found in catalog for this item — invoice will show N/A.'}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-black text-orange-900">Reason *</span>
            <input value={transferReason} onChange={(e) => setTransferReason(e.target.value)} className="h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm font-bold" placeholder={transferDestination === 'Custom' ? 'Required — why is this a custom transfer?' : 'e.g. Sent to Cafe for an event'} />
          </label>
          <button onClick={submitTransferOut} disabled={transferSaving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-black text-white disabled:opacity-50">
            {transferSaving ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}Transfer Out & Generate Invoice
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
            <div>
              <h3 className="font-black">Recent Transfers Out</h3>
              <p className="text-xs text-muted-foreground">Full history — also shown in Closing Stock's Daily Report and Movement Log.</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Search item or reason…" className="h-9 w-56 rounded-xl border border-border bg-background pl-8 pr-3 text-xs font-bold" />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Item</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-left">Reason</th>
                  <th className="px-4 py-2.5 text-left">By</th>
                  <th className="px-4 py-2.5 text-left">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredHistory.length > 0 ? filteredHistory.map((row) => {
                  // Older rows recorded before this feature won't have a
                  // [Destination: ...] tag in notes — fall back to SNB so
                  // they can still get an invoice on request.
                  const destMatch = /\[Destination: (SNB|VRSNB|Custom)\]/.exec(row.notes || '');
                  const rowDestination = (destMatch?.[1] as 'SNB' | 'VRSNB' | 'Custom') || 'SNB';
                  const rowReason = (row.notes || '').replace(/\s*\[Destination: (SNB|VRSNB|Custom)\]\s*$/, '').trim();
                  const rowCatalogEntry = transferPriceFor(transferCatalogItems, rowDestination, row.itemName);
                  const rowConverted = rowCatalogEntry
                    ? convertTransferQtyForPricing(row.itemSlug, row.itemName, Math.abs(row.delta), row.unit, rowCatalogEntry.uom)
                    : null;
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2 font-bold">{row.itemName}</td>
                      <td className="px-4 py-2 text-right font-black text-orange-700">{qtyFmt(Math.abs(row.delta))} {row.unit}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{rowReason || '-'} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500">{rowDestination}</span></td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.recordedBy}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => downloadTransferOutInvoice({
                            itemName: row.itemName, qty: rowConverted?.qty ?? Math.abs(row.delta), unit: rowConverted?.unit ?? row.unit, destination: rowDestination,
                            unitPrice: rowCatalogEntry?.price ?? null, reason: rowReason, staffName: row.recordedBy, createdAt: new Date(row.createdAt),
                            transferNo: `TO-${row.id}`,
                          })}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted"
                        >
                          <Printer className="size-3" />PDF
                        </button>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No transfers out recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
