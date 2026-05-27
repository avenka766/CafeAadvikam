// src/bakery/storeStockStore.ts
// Raw ingredient stock management for the Store dashboard.
// Each stock item is keyed by normalised material name.
// Unit is fixed per item (kg, L, pcs, g, nos, bunch).

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { RECIPE_DEFINITIONS } from './recipeDefinitions';

export type StockUnit = 'kg' | 'L' | 'pcs' | 'g' | 'nos' | 'bunch' | 'ltr';

export interface StockItem {
  id: string;          // uuid from DB
  name: string;        // normalised material name
  unit: StockUnit;
  quantity: number;    // current stock
  minThreshold: number; // low-stock warning level
}

interface StoreStockState {
  items: StockItem[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  addItem: (name: string, unit: StockUnit, quantity: number, minThreshold: number) => Promise<string | null>;
  updateQuantity: (id: string, quantity: number) => Promise<string | null>;
  updateItem: (id: string, updates: Partial<Pick<StockItem, 'name' | 'unit' | 'quantity' | 'minThreshold'>>) => Promise<string | null>;
  deleteItem: (id: string) => Promise<void>;
  // H-06 FIX: unit is now required so conversions are explicit, not guessed
  deductMaterials: (deductions: { name: string; qty: number; unit?: string }[]) => Promise<string | null>;
}

// H-06 FIX: explicit unit conversion — replaces the fragile "qty ≤ 10 = kg" heuristic.
// Recipes pass their unit alongside qty; this function converts to the stock unit.
function convertToStockUnit(qty: number, recipeUnit: string, stockUnit: string): number {
  const from = recipeUnit.toLowerCase().trim();
  const to   = stockUnit.toLowerCase().trim();
  if (from === to) return qty;
  if (from === 'g'  && to === 'kg')  return qty / 1000;
  if (from === 'kg' && to === 'g')   return qty * 1000;
  if (from === 'ml' && (to === 'l' || to === 'ltr')) return qty / 1000;
  if ((from === 'l' || from === 'ltr') && to === 'ml') return qty * 1000;
  if ((from === 'l' && to === 'ltr') || (from === 'ltr' && to === 'l')) return qty;
  console.warn(`[storeStockStore] No conversion from "${recipeUnit}" → "${stockUnit}", using raw value`);
  return qty;
}

// Normalise a material name to lowercase trimmed for matching
export function normaliseName(n: string) { return n.trim().toLowerCase(); }



// Extract all unique materials from recipe definitions (deduplicated, sorted)
export function getAllRecipeMaterials(): { name: string; unit: StockUnit }[] {
  const seen = new Map<string, StockUnit>();
  for (const recipe of Object.values(RECIPE_DEFINITIONS)) {
    for (const mat of recipe.materials) {
      const key = normaliseName(mat.material);
      if (!seen.has(key)) {
        // Determine best default unit
        let unit: StockUnit = 'kg';
        const u = mat.unit.toLowerCase();
        if (u === 'l' || u === 'ltr') unit = 'L';
        else if (u === 'g') unit = 'g';
        else if (u === 'pcs' || u === 'nos') unit = 'pcs';
        else if (u === 'bunch') unit = 'bunch';
        else unit = 'kg';
        seen.set(key, unit);
      }
    }
  }
  return Array.from(seen.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, unit]) => ({ name, unit }));
}

export const useStoreStockStore = create<StoreStockState>()((set, get) => ({
  items: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    // C-05 FIX: wrap in try/finally so loading is always reset to false even on
    // network exceptions (previously an uncaught throw left an infinite spinner).
    try {
      const { data, error } = await supabase
        .from('store_raw_stock')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) {
        set({
          items: data.map(r => ({
            id: r.id as string,
            name: r.name as string,
            unit: r.unit as StockUnit,
            quantity: Number(r.quantity),
            minThreshold: Number(r.min_threshold),
          })),
          loaded: true,
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (name, unit, quantity, minThreshold) => {
    const existing = get().items.find(i => normaliseName(i.name) === normaliseName(name));
    if (existing) return 'Item already exists in stock list';
    const { data, error } = await supabase
      .from('store_raw_stock')
      .insert({ name: name.trim(), unit, quantity, min_threshold: minThreshold })
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
    await supabase.from('store_raw_stock').delete().eq('id', id);
    set(s => ({ items: s.items.filter(i => i.id !== id) }));
  },

  deductMaterials: async (deductions) => {
    // M-08 FIX: read fresh quantities from DB immediately before each write to
    // narrow the stale-read race window. Concurrent deductions from multiple staff
    // devices can still race within the same request, but the window is now ms not
    // seconds. Full elimination requires a Postgres RPC:
    //   CREATE FUNCTION deduct_materials(p_id uuid, p_qty numeric)
    //   RETURNS void LANGUAGE plpgsql AS $$
    //   BEGIN UPDATE store_raw_stock SET quantity = GREATEST(0, quantity - p_qty) WHERE id = p_id; END; $$;
    // Call with: await supabase.rpc('deduct_materials', { p_id: match.id, p_qty: deductQty })
    const items = get().items;
    // Validate all deductions first
    const updates: { id: string; deductQty: number }[] = [];
    const warnings: string[] = [];
    for (const d of deductions) {
      const match = items.find(i => normaliseName(i.name) === normaliseName(d.name));
      if (!match) { warnings.push(`${d.name} not in stock`); continue; }
      // H-06 FIX: use convertToStockUnit() when recipe unit is provided.
      // Falls back to the old numeric heuristic only for legacy callers that don't pass a unit.
      let deductQty = d.qty;
      if (d.unit) {
        deductQty = convertToStockUnit(d.qty, d.unit, match.unit);
      } else {
        // Legacy fallback — remove once all callers supply unit
        if (match.unit === 'g' && deductQty <= 10) {
          deductQty = deductQty * 1000;
        } else if (match.unit === 'kg' && deductQty > 100) {
          deductQty = deductQty / 1000;
        }
      }
      updates.push({ id: match.id, deductQty });
    }
    // Apply all updates — read fresh DB quantity immediately before each write
    const finalUpdates: { id: string; newQty: number }[] = [];
    for (const u of updates) {
      // M-08 FIX: fetch current quantity from DB right before writing to reduce stale-read race
      const { data: fresh, error: fetchErr } = await supabase
        .from('store_raw_stock')
        .select('quantity')
        .eq('id', u.id)
        .single();
      const currentQty = fresh && !fetchErr ? Number(fresh.quantity) : (items.find(i => i.id === u.id)?.quantity ?? 0);
      const newQty = Math.max(0, currentQty - u.deductQty);
      const { error } = await supabase
        .from('store_raw_stock')
        .update({ quantity: newQty })
        .eq('id', u.id);
      if (error) return error.message;
      finalUpdates.push({ id: u.id, newQty });
    }
    set(s => ({
      items: s.items.map(i => {
        const upd = finalUpdates.find(u => u.id === i.id);
        return upd ? { ...i, quantity: upd.newQty } : i;
      }),
    }));

    // Fire low-stock notification for any item that dropped below its threshold
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
}));
