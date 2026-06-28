// src/bakery/bakeryItemsStore.ts  ← NEW FILE
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';

export interface BakeryItem {
  id: string;
  name: string;
  icon: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
  price: number | null;  // Admin-configurable selling price (null = not set yet)
}

const CATEGORIES = ['Sweets', 'Savouries', 'Bakery', 'Cookies'] as const;
export type BakeryCategory = typeof CATEGORIES[number];
export { CATEGORIES as BAKERY_CATEGORIES };

interface BakeryItemsState {
  items: BakeryItem[];
  loaded: boolean;
  loading: boolean;

  // For Order Receiver — active items only
  loadItems: () => Promise<void>;

  // For Admin management — all items (enabled + disabled)
  loadAllItems: () => Promise<void>;

  // Admin CRUD actions
  addItem:    (item: { name: string; category: string; icon: string }) => Promise<string | null>;
  toggleItem: (id: string) => Promise<void>;
  updateItem: (id: string, updates: { name?: string; icon?: string; category?: string }) => Promise<string | null>;
  updatePrice: (id: string, price: number | null) => Promise<string | null>;
  deleteItem: (id: string) => Promise<string | null>;
  subscribe: () => () => void;
}

function rowToItem(d: Record<string, unknown>): BakeryItem {
  return {
    id:        d.id        as string,
    name:      d.name      as string,
    icon:      d.icon      as string,
    category:  d.category  as string,
    enabled:   d.enabled   as boolean,
    sortOrder: d.sort_order as number,
    price:     d.price != null ? Number(d.price) : null,
  };
}

export const useBakeryItemsStore = create<BakeryItemsState>((set, get) => ({
  items:   [],
  loaded:  false,
  loading: false,

  // ── Order Receiver: only enabled items ────────────────────────────────────
  loadItems: async () => {
    if (get().loaded) return;
    set({ loading: true });
    const { data, error } = await supabase
      .from('bakery_items')
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true });
    if (!error && data) {
      set({ items: data.map(d => rowToItem(d as Record<string, unknown>)), loaded: true });
    }
    set({ loading: false });
  },

  // ── Admin: all items including disabled ───────────────────────────────────
  loadAllItems: async () => {
    set({ loading: true, loaded: false });
    const { data, error } = await supabase
      .from('bakery_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (!error && data) {
      set({ items: data.map(d => rowToItem(d as Record<string, unknown>)), loaded: true });
    }
    set({ loading: false });
  },

  // ── Add new item ──────────────────────────────────────────────────────────
  addItem: async ({ name, category, icon }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'Name is required';

    // Generate id slug from name
    const id = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!id) return 'Use an item name with letters or numbers';

    // Check for duplicate
    const { data: existing, error: lookupError } = await supabase
      .from('bakery_items')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) return lookupError.message;
    if (existing) return 'An item with a similar name already exists';

    const maxOrder = get().items.reduce((max, i) => Math.max(max, i.sortOrder), 0);

    const { data, error } = await supabase
      .from('bakery_items')
      .insert({ id, name: trimmedName, icon, category, enabled: true, sort_order: maxOrder + 1, price: null })
      .select()
      .single();

    if (error || !data) return error?.message ?? 'Failed to add item. Please try again.';

    const newItem = rowToItem(data as Record<string, unknown>);
    set(s => ({ items: [...s.items, newItem] }));
    return null;
  },

  // ── Toggle enabled/disabled ───────────────────────────────────────────────
  toggleItem: async (id) => {
    const item = get().items.find(i => i.id === id);
    if (!item) return;
    const newEnabled = !item.enabled;
    const { error } = await supabase
      .from('bakery_items')
      .update({ enabled: newEnabled })
      .eq('id', id);
    if (error) throw error;
    set(s => ({
      items: s.items.map(i => i.id === id ? { ...i, enabled: newEnabled } : i),
    }));
  },

  // ── Update name / icon / category ─────────────────────────────────────────
  updateItem: async (id, updates) => {
    const payload: Record<string, string> = {};
    // BUG #18 FIX: use !== undefined instead of truthiness.
    // Previously an empty string ('') was falsy so clearing a name/icon/category
    // was silently ignored — the DB kept the old value while the UI appeared to clear it.
    if (updates.name !== undefined)     payload.name     = updates.name.trim();
    if (updates.icon !== undefined)     payload.icon     = updates.icon.trim();
    if (updates.category !== undefined) payload.category = updates.category;
    if (Object.keys(payload).length === 0) return null;

    const { error } = await supabase.from('bakery_items').update(payload).eq('id', id);
    if (error) return 'Failed to update. Please try again.';

    // Only update defined fields in local state to avoid overwriting with undefined
    set(s => ({
      items: s.items.map(i => {
        if (i.id !== id) return i;
        const patch: Partial<BakeryItem> = {};
        if (updates.name !== undefined)     patch.name     = updates.name.trim();
        if (updates.icon !== undefined)     patch.icon     = updates.icon.trim();
        if (updates.category !== undefined) patch.category = updates.category;
        return { ...i, ...patch };
      }),
    }));
    return null;
  },

  // ── Update selling price ──────────────────────────────────────────────────
  updatePrice: async (id, price) => {
    const { error } = await supabase
      .from('bakery_items')
      .update({ price: price })
      .eq('id', id);
    if (error) return 'Failed to update price. Please try again.';
    set(s => ({
      items: s.items.map(i => i.id === id ? { ...i, price } : i),
    }));
    return null;
  },

  subscribe: makeSingletonSubscriber('bakery-items-live', (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bakery_items' },
      () => { void get().loadAllItems(); }),
  ),

  // ── Hard delete ───────────────────────────────────────────────────────────
  deleteItem: async (id) => {
    // H-07 FIX: check for active orders and recipes referencing this item before deletion.
    // Hard-deleting a referenced item silently breaks orders and recipes.
    const { data: activeOrders } = await supabase
      .from('bakery_orders')
      .select('id')
      .not('status', 'in', '("dispatched","cancelled")')
      .contains('items', [{ itemId: id }])
      .limit(1);

    if (activeOrders && activeOrders.length > 0) {
      throw new Error('Cannot delete: this item is used in active orders. Complete or cancel those orders first.');
    }

    const { data: recipes } = await supabase
      .from('bakery_recipes')
      .select('id')
      .eq('item_id', id)
      .limit(1);

    if (recipes && recipes.length > 0) {
      throw new Error('Cannot delete: this item has recipes attached. Remove the recipes first.');
    }

    const { error } = await supabase.from('bakery_items').update({ enabled: false }).eq('id', id);
    if (error) return error.message;
    set(s => ({ items: s.items.map(i => i.id === id ? { ...i, enabled: false } : i) }));
    return null;
  },
}));
