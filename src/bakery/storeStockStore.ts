// src/bakery/storeStockStore.ts
// Raw ingredient stock management for the Store dashboard.
// Each stock item is keyed by normalised material name.
// Unit is fixed per item (KG, Ltr, Pcs, Nos, Bunch in the UI).

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { RECIPE_DEFINITIONS } from './recipeDefinitions';

export type StockUnit = 'kg' | 'L' | 'pcs' | 'g' | 'nos' | 'bunch' | 'ltr';

export interface StockItem {
  id: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  minThreshold: number;
  archivedAt?: string;
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
  addItem: (name: string, unit: StockUnit, quantity: number, minThreshold: number) => Promise<string | null>;
  updateQuantity: (id: string, quantity: number) => Promise<string | null>;
  updateItem: (id: string, updates: Partial<Pick<StockItem, 'name' | 'unit' | 'quantity' | 'minThreshold'>>) => Promise<string | null>;
  deleteItem: (id: string) => Promise<void>;
  bulkImportFromRecipes: () => Promise<{ added: number; skipped: number; error?: string }>;
  subscribe: () => () => void;
  deductMaterials: (
    deductions: { name: string; qty: number; unit?: string }[],
    ctx?: DeductionContext,
  ) => Promise<string | null>;
}

function convertToStockUnit(qty: number, recipeUnit: string, stockUnit: string): number {
  const from = recipeUnit.toLowerCase().trim();
  const to   = stockUnit.toLowerCase().trim();
  if (from === to) return qty;
  if (from === 'g'  && to === 'kg')  return qty / 1000;
  if (from === 'kg' && to === 'g')   return qty * 1000;
  if (from === 'ml' && (to === 'l' || to === 'ltr')) return qty / 1000;
  if ((from === 'l' || from === 'ltr') && to === 'ml') return qty * 1000;
  if ((from === 'l' && to === 'ltr') || (from === 'ltr' && to === 'l')) return qty;
  console.warn(`[storeStockStore] No conversion from "${recipeUnit}" to "${stockUnit}", using raw value`);
  return qty;
}

export function normaliseName(n: string) { return n.trim().toLowerCase(); }

export function getAllRecipeMaterials(): { name: string; unit: StockUnit }[] {
  const seen = new Map<string, StockUnit>();
  for (const recipe of Object.values(RECIPE_DEFINITIONS)) {
    for (const mat of recipe.materials) {
      const key = normaliseName(mat.material);
      if (!seen.has(key)) {
        let unit: StockUnit = 'kg';
        const u = mat.unit.toLowerCase();
        if (u === 'l' || u === 'ltr' || u === 'ml') unit = 'ltr';
        else if (u === 'g') unit = 'kg';
        else if (u === 'nos') unit = 'nos';
        else if (u === 'pcs') unit = 'pcs';
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
    try {
      const { data, error } = await supabase
        .from('store_raw_stock')
        .select('*')
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
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from('store_raw_stock').update({ archived_at: archivedAt }).eq('id', id);
    if (error) return;
    set(s => ({ items: s.items.filter(i => i.id !== id) }));
  },

  bulkImportFromRecipes: async () => {
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
        deductQty = convertToStockUnit(d.qty, d.unit, match.unit);
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

  subscribe: () => {
    const channel = supabase
      .channel('store-raw-stock-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_raw_stock' },
        () => { get().load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },
}));
