// src/bakery/storeStockStore.ts
// Raw ingredient stock management for the Store dashboard.
// Each stock item is keyed by normalised material name.
// Unit is fixed per item (KG, Ltr, Pcs, Nos, Bunch in the UI).

import { create } from 'zustand';
import { supabase, fetchAllRows } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
import { useRecipeStore } from './recipeStore';
import { useOfflineQueueStore, registerReplayHandler } from '@/lib/offlineQueue';

export type StockUnit = 'kg' | 'L' | 'pcs' | 'g' | 'nos' | 'bunch' | 'ltr';

export type StockCategory = 'raw' | 'packing';

export interface StockItem {
  id: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  minThreshold: number;
  archivedAt?: string;
  suppliers?: string[];
  // FEATURE (2026-08-30): "packing materials mixed in with raw material is
  // causing disturbance for the client when checking for raw material" —
  // Store's Inventory tab had 819 items (boxes, covers, pouches, tape...
  // alongside actual food ingredients) in one flat list. Defaults to 'raw'
  // for anything not explicitly set, so nothing that existed before this
  // silently vanishes from the Raw Materials view.
  category: StockCategory;
}

export interface MaterialDeductionLog {
  id: string;
  orderId: string;
  orderNumber: string;
  materialName: string;
  quantityDeducted: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
  deductedBy: string;
  deductedAt: string;
}


interface StoreStockState {
  items: StockItem[];
  loaded: boolean;
  loading: boolean;
  // AUDIT FIX (2026-09-03): load() previously had no way to report a failed
  // fetch at all — `loaded` stayed false and callers (StoreAnalyticsTab,
  // StoreReportTab) either spun on a loading state forever or, once other
  // callers had already populated `loaded`, silently rendered "no items"
  // indistinguishable from a genuinely empty table. Surfaced here so every
  // screen reading this store can show a real error instead of guessing.
  error: string | null;
  load: () => Promise<void>;
  addItem: (name: string, unit: StockUnit, quantity: number, minThreshold: number, suppliers?: string[], category?: StockCategory) => Promise<string | null>;
  updateQuantity: (id: string, quantity: number) => Promise<string | null>;
  updateItem: (id: string, updates: Partial<Pick<StockItem, 'name' | 'unit' | 'quantity' | 'minThreshold' | 'category'>>) => Promise<string | null>;
  deleteItem: (id: string) => Promise<void>;
  bulkImportFromRecipes: () => Promise<{ added: number; skipped: number; error?: string }>;
  // Bulk-reclassify — used by the Inventory tab's "Move to Packing/Raw"
  // multi-select so a client doesn't have to open the edit form per item
  // for a one-time cleanup pass.
  bulkSetCategory: (ids: string[], category: StockCategory) => Promise<string | null>;
  subscribe: () => () => void;

}

export function convertToStockUnit(qty: number, recipeUnit: string, stockUnit: string): number | null {
  const from = recipeUnit.toLowerCase().trim();
  const to   = stockUnit.toLowerCase().trim();
  if (from === to) return qty;
  if (from === 'g'  && to === 'kg')  return qty / 1000;
  if (from === 'kg' && to === 'g')   return qty * 1000;
  if (from === 'ml' && (to === 'l' || to === 'ltr')) return qty / 1000;
  if ((from === 'l' || from === 'ltr') && to === 'ml') return qty * 1000;
  if ((from === 'l' && to === 'ltr') || (from === 'ltr' && to === 'l')) return qty;
  // 'pcs' and 'nos' are both just "count of items" — different words for the
  // same thing, not actually different units, unlike everything else this
  // function handles (which are genuine unit *conversions*).
  if ((from === 'pcs' && to === 'nos') || (from === 'nos' && to === 'pcs')) return qty;
  // BUG FIX (2026-08-17): every other combination this used to silently
  // fall through to — "using raw value" — is a genuine cross-dimensional
  // mismatch: mass vs volume (e.g. a recipe's ghee in grams against stock
  // tracked in litres), mass vs count (grams against a tin/bunch count),
  // or volume vs count. None of those are safely convertible without
  // information this function has no way to know (density, pack weight,
  // pack volume) — silently treating the raw number as if it were already
  // in the target unit isn't a fallback, it's a wrong answer stated with
  // full confidence. Every caller must now handle null explicitly instead
  // of unknowingly multiplying/dividing stock by a bogus figure.
  console.warn(`[storeStockStore] No valid conversion from "${recipeUnit}" to "${stockUnit}" — these are different kinds of unit (mass/volume/count), not just different names for the same thing. Returning null instead of guessing.`);
  return null;
}

export function normaliseName(n: string) { return n.trim().toLowerCase(); }

// AUDIT FIX (2026-09-03): pcs/nos are literal whole-piece counts — a
// fractional value ("17.93 nos", "38.5 pcs") makes no physical sense. This
// is the single most-repeated bug class in this codebase this session, and
// it's live here too: store_raw_stock already has rows like MILK MAID 0.335
// at 17.928542 nos and ESS BANANA BUSH at -0.054068 nos (confirmed via a
// live SELECT before this fix). Round to the nearest whole piece at every
// write path in this store instead of persisting whatever fractional value
// manual entry or recipe-conversion math produced. Existing corrupted rows
// are left alone (a bulk data cleanup is a separate decision), this only
// stops new drift.
function roundForUnit(qty: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'pcs' || u === 'nos') return Math.round(qty);
  return qty;
}

// AUDIT FIX (2026-09-03): addItem had a synchronous duplicate-name check
// against the local cache but no protection against two concurrent calls
// (a double-click) both passing that check before either finishes — unlike
// bakery_items (text primary key, so a real duplicate insert fails cleanly
// at the DB level), store_raw_stock's id is a generated uuid with no
// unique constraint on name, so this could actually create two rows for
// the same ingredient. Track in-flight adds per normalised name.
const addItemInFlight = new Set<string>();

export function getAllRecipeMaterials(): { name: string; unit: StockUnit }[] {
  return useRecipeStore.getState().getAllMaterials().map((material) => {
    const u = material.unit.toLowerCase();
    let unit: StockUnit = 'kg';
    if (u === 'l' || u === 'ltr' || u === 'ml') unit = 'ltr';
    else if (u === 'g' || u === 'kg') unit = 'kg';
    else if (u === 'nos') unit = 'nos';
    else if (u === 'pcs') unit = 'pcs';
    else if (u === 'bunch') unit = 'bunch';
    return { name: material.name, unit };
  });
}

export const useStoreStockStore = create<StoreStockState>()((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      // BUG FIX (2026-09-08): the 2026-09-03 "AUDIT FIX" below raised this
      // to `.limit(5000)` to get ahead of the table's growth, but that
      // doesn't actually work — PostgREST's project-wide response cap
      // silently returns at most 1000 rows no matter what `.limit()` the
      // client asks for (confirmed live elsewhere this session: a
      // `.limit(20000)` query came back with exactly 1000 rows). This table
      // was already at 829 rows and climbing, so raising the cap was about
      // to start silently hiding real inventory items with no error. Paged
      // properly now so the full catalogue always loads.
      // AUDIT FIX (2026-09-03): no explicit limit — PostgREST's default
      // row cap (1000) would silently truncate this list with no error
      // once the table crosses that size. Already at 835 live rows after
      // the raw/packing split added ~140 items, so this was a real cliff
      // approaching unnoticed, not a theoretical one.
      const { data, error: errMsg } = await fetchAllRows<Record<string, unknown>>(
        'store_raw_stock',
        (q) => q
          .select('id, name, unit, quantity, min_threshold, archived_at, suppliers, item_category')
          .order('name', { ascending: true }),
        { maxRows: 20000 },
      );
      if (errMsg) {
        // AUDIT FIX (2026-09-03): a failed fetch used to leave `loaded`
        // false and `error` didn't exist — callers had no way to
        // distinguish "still loading" from "failed" from "genuinely empty."
        set({ error: errMsg });
        return;
      }
      if (data) {
        set({
          items: data.filter(r => !r.archived_at).map(r => ({
            id: r.id as string,
            name: r.name as string,
            unit: r.unit as StockUnit,
            quantity: Number(r.quantity),
            minThreshold: Number(r.min_threshold),
            archivedAt: (r.archived_at as string | null) ?? undefined,
            suppliers: Array.isArray(r.suppliers) ? r.suppliers as string[] : [],
            category: (r.item_category as StockCategory) || 'raw',
          })),
          loaded: true,
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (name, unit, quantity, minThreshold, suppliers = [], category = 'raw') => {
    if(!Number.isFinite(quantity)||quantity<0||!Number.isFinite(minThreshold)||minThreshold<0)return 'Enter finite, non-negative stock and alert quantities.';
    const key = normaliseName(name);
    // AUDIT FIX (2026-09-03): in-flight guard — see comment on
    // addItemInFlight above. A concurrent add for the same name is
    // rejected rather than silently creating a duplicate row.
    if (addItemInFlight.has(key)) return 'Already adding this item — please wait a moment and try again.';
    const existing = get().items.find(i => normaliseName(i.name) === key);
    if (existing) return 'Item already exists in stock list';
    addItemInFlight.add(key);
    try {
      const sanitizedQuantity = roundForUnit(quantity, unit); // AUDIT FIX (2026-09-03): see roundForUnit
      const { data, error } = await supabase
        .from('store_raw_stock')
        .insert({ name: name.trim(), unit, quantity: sanitizedQuantity, min_threshold: minThreshold, suppliers, item_category: category })
        .select()
        .single();
      if (error) return error.message;
      if (data) {
        const item: StockItem = {
          id: data.id as string,
          name: data.name as string,
          unit: data.unit as StockUnit,
          quantity: Number(data.quantity),
          minThreshold: Number(data.min_threshold),
          suppliers: Array.isArray(data.suppliers) ? data.suppliers as string[] : suppliers,
          category: (data.item_category as StockCategory) || category,
        };
        set(s => ({ items: [...s.items, item].sort((a, b) => a.name.localeCompare(b.name)) }));
      }
      return null;
    } finally {
      addItemInFlight.delete(key);
    }
  },

  updateQuantity: async (id, quantity) => {
    const existingItem = get().items.find(i => i.id === id);
    if(!existingItem)return 'Stock is not loaded. Refresh before changing its quantity.';
    if(!Number.isFinite(quantity)||quantity<0)return 'Enter a finite, non-negative stock quantity.';
    // AUDIT FIX (2026-09-05): "raw material should never go into negative" —
    // the Add/Edit form already has min={0} on its input, but that's only a
    // soft browser hint, not an enforced floor; clamp for real here too, the
    // same way deduct_materials now clamps server-side.
    const sanitizedQuantity = Math.max(0, roundForUnit(quantity, existingItem?.unit ?? 'kg')); // AUDIT FIX (2026-09-03): see roundForUnit

    // AUDIT FIX (2026-09-03): this was a blind "set quantity to X" write
    // with no compare-and-swap — the exact absolute-overwrite pattern
    // already found and fixed for branchStore.ts's manualUpdateStock this
    // session (expectedCurrentQty guard). If production (an order
    // being sent to production) or another session's edit changes the real
    // DB quantity between whoever called this reading the old value and
    // this write landing, the blind overwrite would silently discard that
    // concurrent change. Re-check the DB's current value against this
    // store's own cached quantity (the value any caller would reasonably
    // have read before calling this) immediately before writing.
    if (existingItem) {
      const { data: fresh, error: freshErr } = await supabase
        .from('store_raw_stock').select('quantity').eq('id', id).maybeSingle();
      if (freshErr) return `Could not verify current stock before saving: ${freshErr.message}`;
      const freshQty = fresh ? Number(fresh.quantity) : null;
      if (freshQty !== null && Math.abs(freshQty - existingItem.quantity) > 0.0005) {
        return `Stock changed since this was last loaded (now ${freshQty}, was ${existingItem.quantity}) — someone else may have updated it. Please refresh and try again.`;
      }
    }

    const { data:saved, error } = await supabase
      .from('store_raw_stock')
      .update({ quantity: sanitizedQuantity })
      .eq('id', id).eq('quantity',existingItem.quantity).select('id').maybeSingle();
    if (error) return error.message;
    if(!saved)return 'Stock changed while saving. Refresh and review the current quantity.';
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, quantity: sanitizedQuantity } : i) }));
    return null;
  },

  updateItem: async (id, updates) => {
    const existingItem = get().items.find(i => i.id === id);
    if(updates.quantity!==undefined&&(!existingItem||!Number.isFinite(updates.quantity)||updates.quantity<0))return 'Refresh stock and enter a finite, non-negative quantity.';
    if(updates.minThreshold!==undefined&&(!Number.isFinite(updates.minThreshold)||updates.minThreshold<0))return 'Enter a finite, non-negative alert quantity.';
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined)         payload.name = updates.name.trim();
    if (updates.unit !== undefined)         payload.unit = updates.unit;
    let sanitizedQuantity: number | undefined;
    if (updates.quantity !== undefined) {
      // AUDIT FIX (2026-09-03): see roundForUnit — round pcs/nos edits to a
      // whole piece using whichever unit this save will actually leave the
      // item with (the new unit if it's being changed in the same save).
      // AUDIT FIX (2026-09-05): "raw material should never go into
      // negative" — same hard floor as updateQuantity above.
      sanitizedQuantity = Math.max(0, roundForUnit(updates.quantity, updates.unit ?? existingItem?.unit ?? 'kg'));
      payload.quantity = sanitizedQuantity;
    }
    if (updates.minThreshold !== undefined) payload.min_threshold = updates.minThreshold;
    if (updates.category !== undefined)     payload.item_category = updates.category;

    // AUDIT FIX (2026-09-03): compare-and-swap guard for quantity edits —
    // same reasoning as updateQuantity above. The Edit Stock modal seeds
    // its input from this store's cached quantity when it opens; if stock
    // moves (an order dispatch, another staff member's edit) before Save
    // is pressed, this blind overwrite would silently clobber that
    // concurrent change. Fail loudly instead, matching the established
    // branchStore.manualUpdateStock mitigation.
    if (sanitizedQuantity !== undefined && existingItem) {
      const { data: fresh, error: freshErr } = await supabase
        .from('store_raw_stock').select('quantity').eq('id', id).maybeSingle();
      if (freshErr) return `Could not verify current stock before saving: ${freshErr.message}`;
      const freshQty = fresh ? Number(fresh.quantity) : null;
      if (freshQty !== null && Math.abs(freshQty - existingItem.quantity) > 0.0005) {
        return `Stock changed since you opened this item (now ${freshQty}, was ${existingItem.quantity}) — someone else may have updated it. Please refresh and try again.`;
      }
    }

    let query=supabase.from('store_raw_stock').update(payload).eq('id',id);
    if(sanitizedQuantity!==undefined)query=query.eq('quantity',existingItem!.quantity);
    const {data:saved,error}=await query.select('id').maybeSingle();
    if (error) return error.message;
    if(!saved)return 'Stock changed or is unavailable. Refresh and review before saving.';
    set(s => ({
      items: s.items
        .map(i => i.id === id ? { ...i, ...updates, ...(sanitizedQuantity !== undefined ? { quantity: sanitizedQuantity } : {}) } : i)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return null;
  },

  deleteItem: async (id) => {
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from('store_raw_stock').update({ archived_at: archivedAt }).eq('id', id);
    // AUDIT FIX (2026-09-03): silently returning on error meant the caller
    // (StoreDashboard.tsx's onDelete) always proceeded as if the archive
    // had succeeded — it unconditionally sent an "archived" notification
    // and local state was never touched either, so a failed delete looked
    // identical to a successful one with no error shown anywhere. Throw
    // instead, matching bakeryItemsStore.deleteItem / supplierStore's
    // deleteSupplier, which already follow this convention.
    if (error) throw new Error(`Failed to archive stock item: ${error.message}`);
    set(s => ({ items: s.items.filter(i => i.id !== id) }));
  },

  bulkSetCategory: async (ids, category) => {
    if (ids.length === 0) return null;
    const { error } = await supabase.from('store_raw_stock').update({ item_category: category }).in('id', ids);
    if (error) return error.message;
    set(s => ({ items: s.items.map(i => ids.includes(i.id) ? { ...i, category } : i) }));
    return null;
  },

  bulkImportFromRecipes: async () => {
    await useRecipeStore.getState().loadRecipes();
    const recipeMats = getAllRecipeMaterials();
    const existing = get().items;
    const toInsert = recipeMats.filter(
      m => !existing.some(e => normaliseName(e.name) === normaliseName(m.name))
    );
    if (toInsert.length === 0) return { added: 0, skipped: recipeMats.length };
    const { data, error } = await supabase
      .from('store_raw_stock')
      .insert(toInsert.map(m => ({ name: m.name, unit: m.unit, quantity: 0, min_threshold: 1 })))
      .select();
    if (error) return { added: 0, skipped: existing.length, error: error.message };
    const newItems: StockItem[] = (data ?? []).map(r => ({
      id: r.id as string, name: r.name as string, unit: r.unit as StockUnit,
      quantity: Number(r.quantity), minThreshold: Number(r.min_threshold),
      category: (r.item_category as StockCategory) || 'raw',
    }));
    set(s => ({ items: [...s.items, ...newItems].sort((a, b) => a.name.localeCompare(b.name)) }));
    return { added: newItems.length, skipped: existing.length };
  },

  // REALTIME FIX (2026-09-01): this used to debounce-then-refetch the whole
  // table on every change — replaced with a direct row-level patch (matches
  // branchStore.ts's applyBranchRealtimeChange pattern), so one item's
  // quantity/threshold edit no longer re-downloads all of store_raw_stock.
  // Mirrors load()'s own filtering: an archived row (archived_at set) is
  // removed from local state exactly like load()'s `.filter(!archived_at)`.
  subscribe: makeSingletonSubscriber('store-raw-stock-live', (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'store_raw_stock' },
      (payload) => {
        const event = payload as { eventType?: string; new?: Record<string, unknown>; old?: { id?: string } };
        const id = String(event.new?.id ?? event.old?.id ?? '');
        if (!id) return;
        if (event.eventType === 'DELETE' || event.new?.archived_at) {
          set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
          return;
        }
        const d = event.new ?? {};
        const changed: StockItem = {
          id,
          name: d.name as string,
          unit: d.unit as StockUnit,
          quantity: Number(d.quantity),
          minThreshold: Number(d.min_threshold),
          archivedAt: (d.archived_at as string | null) ?? undefined,
          suppliers: Array.isArray(d.suppliers) ? d.suppliers as string[] : [],
          category: (d.item_category as StockCategory) || 'raw',
        };
        set((state) => ({
          items: (state.items.some((item) => item.id === id)
            ? state.items.map((item) => (item.id === id ? changed : item))
            : [...state.items, changed]
          ).sort((a, b) => a.name.localeCompare(b.name)),
        }));
      }),
  ),
}));

// OFFLINE FIX (2026-10-01): "make Store/Bakery raw-material stock counts
// work offline" — updateItem above does an absolute "set to X" write with a
// compare-and-swap guard against the live DB quantity. That guard is correct
// for the online case but self-defeating for a delayed offline replay: the
// real quantity having moved for any reason (production deduction, another
// edit) in the meantime would make the replay bounce almost every time.
// quantity changes are queued as a DELTA instead (commutative, no stale-
// comparison problem — see adjust_store_raw_stock_quantity) and applied via
// a dedicated atomic RPC; unit/category/minThreshold changes have no such
// concurrency risk (nothing else mutates them in the background) and are
// queued as a plain field update, same shape updateItem already writes.
interface StoreStockEditPayload {
  replayVersion?: 2;
  id: string;
  quantityDelta: number;
  unit?: StockUnit;
  minThreshold?: number;
  category?: StockCategory;
}

async function runStoreStockEditCore(payload: StoreStockEditPayload, requestId: string): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (payload.unit !== undefined) fields.unit = payload.unit;
  if (payload.minThreshold !== undefined) fields.min_threshold = payload.minThreshold;
  if (payload.category !== undefined) fields.item_category = payload.category;
  const {data,error} = await supabase.rpc('apply_store_stock_edit_once_v1', {
    p_request:requestId,p_id:payload.id,p_delta:payload.quantityDelta,p_fields:fields,
  });
  if(error)throw new Error(error.message);
  if(!data?.item?.id)throw new Error('Stock adjustment confirmation is incomplete. Retry the saved request.');
}

export async function queueStoreStockEdit(payload: StoreStockEditPayload): Promise<void> {
  await useOfflineQueueStore.getState().enqueue('store_stock_edit', {...payload,replayVersion:2});
}

registerReplayHandler('store_stock_edit', async (_kind, payload, requestId) => {
  try {
    const edit=payload as StoreStockEditPayload;
    if(edit.replayVersion!==2)throw new Error('This older stock adjustment needs Admin reconciliation before replay: an earlier attempt may already have changed stock. The original entry is preserved.');
    await runStoreStockEditCore(edit, requestId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to sync this stock edit.' };
  }
});
