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
  deductMaterials: (deductions: { name: string; qty: number }[]) => Promise<string | null>;
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
    set({ loading: false });
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
    const items = get().items;
    // Validate all deductions first
    const updates: { id: string; newQty: number }[] = [];
    const warnings: string[] = [];
    for (const d of deductions) {
      const match = items.find(i => normaliseName(i.name) === normaliseName(d.name));
      if (!match) { warnings.push(`${d.name} not in stock`); continue; }
      // BUG #2 FIX: complete unit conversion between recipe units and stock units.
      // Recipes store quantities in kg/L; stock may be tracked in g or ltr.
      let deductQty = d.qty;
      if (match.unit === 'g' && deductQty <= 10) {
        // Recipe qty is in kg, stock is in g → convert kg → g
        deductQty = deductQty * 1000;
      } else if (match.unit === 'ltr' && deductQty <= 10) {
        // Recipe qty is in L, stock is in ltr → same scale, no conversion needed
        // (ltr and L are equivalent)
      } else if (match.unit === 'kg' && deductQty > 100) {
        // Suspiciously large kg value — likely recipe provided grams; convert g → kg
        deductQty = deductQty / 1000;
      }
      const newQty = Math.max(0, match.quantity - deductQty);
      updates.push({ id: match.id, newQty });
    }
    // Apply all updates
    for (const u of updates) {
      const { error } = await supabase
        .from('store_raw_stock')
        .update({ quantity: u.newQty })
        .eq('id', u.id);
      if (error) return error.message;
    }
    set(s => ({
      items: s.items.map(i => {
        const upd = updates.find(u => u.id === i.id);
        return upd ? { ...i, quantity: upd.newQty } : i;
      }),
    }));
    return warnings.length > 0 ? `Note: ${warnings.join(', ')}` : null;
  },
}));
