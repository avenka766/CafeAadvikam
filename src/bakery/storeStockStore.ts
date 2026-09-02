// src/bakery/storeStockStore.ts
// Raw ingredient stock management for the Store dashboard.
// Each stock item is keyed by normalised material name.
// Unit is fixed per item (KG, Ltr, Pcs, Nos, Bunch in the UI).

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
import { useRecipeStore } from './recipeStore';

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

export interface DeductionContext {
  orderId: string;
  orderNumber: string | number;
  deductedBy: string;
}

interface StoreStockState {
  items: StockItem[];
  loaded: boolean;
  loading: boolean;
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
  deductMaterials: (
    deductions: { name: string; qty: number; unit?: string }[],
    ctx?: DeductionContext,
  ) => Promise<string | null>;
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

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('store_raw_stock')
        .select('id, name, unit, quantity, min_threshold, archived_at, suppliers, item_category')
        .order('name', { ascending: true });
      if (!error && data) {
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
    const existing = get().items.find(i => normaliseName(i.name) === normaliseName(name));
    if (existing) return 'Item already exists in stock list';
    const { data, error } = await supabase
      .from('store_raw_stock')
      .insert({ name: name.trim(), unit, quantity, min_threshold: minThreshold, suppliers, item_category: category })
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
  },

  updateQuantity: async (id, quantity) => {
    const { error } = await supabase
      .from('store_raw_stock')
      .update({ quantity })
      .eq('id', id);
    if (error) return error.message;
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, quantity } : i) }));
    return null;
  },

  updateItem: async (id, updates) => {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined)         payload.name = updates.name.trim();
    if (updates.unit !== undefined)         payload.unit = updates.unit;
    if (updates.quantity !== undefined)     payload.quantity = updates.quantity;
    if (updates.minThreshold !== undefined) payload.min_threshold = updates.minThreshold;
    if (updates.category !== undefined)     payload.item_category = updates.category;
    const { error } = await supabase.from('store_raw_stock').update(payload).eq('id', id);
    if (error) return error.message;
    set(s => ({
      items: s.items
        .map(i => i.id === id ? { ...i, ...updates } : i)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return null;
  },

  deleteItem: async (id) => {
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from('store_raw_stock').update({ archived_at: archivedAt }).eq('id', id);
    if (error) return;
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

  deductMaterials: async (deductions, ctx?) => {
    const items = get().items;

    const updates: { id: string; name: string; unit: string; deductQty: number }[] = [];
    const warnings: string[] = [];
    for (const d of deductions) {
      const match = items.find(i => normaliseName(i.name) === normaliseName(d.name));
      if (!match) { warnings.push(`${d.name} not in stock`); continue; }
      let deductQty = d.qty;
      if (d.unit) {
        const converted = convertToStockUnit(d.qty, d.unit, match.unit);
        // BUG FIX (2026-08-17): this used to fall back to the raw,
        // unconverted number whenever the recipe's unit and the stock
        // item's unit were genuinely different kinds of unit (mass vs
        // volume vs count) — e.g. a recipe calling for grams of ghee
        // against stock tracked in litres. That silently deducted the
        // wrong amount from real stock every single time — confirmed as
        // the actual cause of NANDHINI GHEE and MILK MAID showing negative
        // balances. Skipping and warning loudly (same pattern as "not in
        // stock" below) stops the ongoing corruption; the recipe's unit or
        // the stock item's unit needs to be fixed to match before this
        // material can be deducted automatically again.
        if (converted === null) {
          warnings.push(`${d.name}: recipe uses "${d.unit}" but stock is tracked in "${match.unit}" — these can't be converted automatically (different kind of unit). Stock NOT deducted for this material — fix the recipe or stock unit to match.`);
          continue;
        }
        deductQty = converted;
      } else {
        if (match.unit === 'g' && deductQty <= 10) {
          deductQty = deductQty * 1000;
        } else if (match.unit === 'kg' && deductQty > 100) {
          deductQty = deductQty / 1000;
        }
      }
      updates.push({ id: match.id, name: match.name, unit: match.unit, deductQty });
    }

    const finalUpdates: { id: string; stockBefore: number; newQty: number }[] = [];
    for (const u of updates) {
      const currentQty = items.find(i => i.id === u.id)?.quantity ?? 0;
      const { data: newQty, error } = await supabase
        .rpc('deduct_materials', { p_id: u.id, p_qty: u.deductQty });
      if (error) return error.message;
      finalUpdates.push({ id: u.id, stockBefore: currentQty, newQty: Number(newQty) });
    }

    set(s => ({
      items: s.items.map(i => {
        const upd = finalUpdates.find(u => u.id === i.id);
        return upd ? { ...i, quantity: upd.newQty } : i;
      }),
    }));

    if (ctx) {
      const now = new Date().toISOString();
      const logRows = updates.map(u => {
        const finalU = finalUpdates.find(f => f.id === u.id);
        return {
          order_id:          ctx.orderId,
          order_number:      String(ctx.orderNumber),
          material_name:     u.name,
          quantity_deducted: u.deductQty,
          unit:              u.unit,
          stock_before:      finalU?.stockBefore ?? 0,
          stock_after:       finalU?.newQty ?? 0,
          deducted_by:       ctx.deductedBy,
          deducted_at:       now,
        };
      });
      if (logRows.length > 0) {
        supabase.from('store_material_deductions').insert(logRows).then(({ error }) => {
          if (error) console.warn('[storeStockStore] deduction log insert failed:', error.message);
        });
      }
    }

    const currentItems = get().items;
    const lowItems = finalUpdates
      .map(u => currentItems.find(i => i.id === u.id))
      .filter((i): i is StockItem => !!i && i.quantity <= i.minThreshold)
      .map(i => ({ name: i.name, quantity: i.quantity, minThreshold: i.minThreshold, unit: i.unit }));
    if (lowItems.length > 0) {
      const { useNotificationStore } = await import('./notificationStore');
      await useNotificationStore.getState().pushLowStock(lowItems);
    }

    return warnings.length > 0 ? `Note: ${warnings.join(', ')}` : null;
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
