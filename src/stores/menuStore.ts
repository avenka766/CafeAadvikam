import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { MenuItem } from '@/types';

const MENU_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface MenuState {
  items: MenuItem[];
  loading: boolean;
  loaded: boolean;
  loadedAt: number | null;
  loadMenu: (force?: boolean) => Promise<void>;
  addItem: (item: Omit<MenuItem, 'id' | 'imageUrl' | 'enabled'>) => Promise<string | null>;
  toggleItem: (id: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  setItemImage: (id: string, imageUrl: string) => Promise<void>;
}

export const useMenuStore = create<MenuState>()((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  loadedAt: null,

  loadMenu: async (force = false) => {
    const { loaded, loadedAt } = get();
    const expired = !loadedAt || Date.now() - loadedAt > MENU_TTL_MS;
    if (loaded && !expired && !force) return;

    set({ loading: true });
    // M-01 FIX: use try/finally so loading is always reset to false even on
    // network exceptions (previously an uncaught throw left an infinite spinner).
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('id', { ascending: true });

      if (!error && data) {
        const items: MenuItem[] = data.map((d) => ({
          id: d.id,
          name: d.name,
          price: d.price,
          category: d.category,
          timing: d.timing,
          enabled: d.enabled,
          imageUrl: d.image_url || undefined,
        }));
        set({ items, loaded: true, loadedAt: Date.now() });
      }
    } finally {
      set({ loading: false });
    }
  },

  toggleItem: async (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const newEnabled = !item.enabled;
    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, enabled: newEnabled } : i)),
    }));
    const { error } = await supabase
      .from('menu_items')
      .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      // Rollback on DB failure
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? { ...i, enabled: item.enabled } : i)),
      }));
      throw error;
    }
  },

  updateItem: async (id: string, updates: Partial<MenuItem>) => {
    const prevItem = get().items.find((i) => i.id === id);
    if (!prevItem) return;
    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    const { error } = await supabase.from('menu_items').update(dbUpdates).eq('id', id);
    if (error) {
      // Rollback on DB failure
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? prevItem : i)),
      }));
      throw error;
    }
  },

  addItem: async (item) => {
    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        name:       item.name.trim(),
        price:      item.price,
        category:   item.category,
        timing:     item.timing,
        enabled:    true,
      })
      .select()
      .single();
    if (error || !data) return error?.message ?? 'Failed to add item';
    const newItem: MenuItem = {
      id:       data.id,
      name:     data.name,
      price:    data.price,
      category: data.category,
      timing:   data.timing,
      enabled:  data.enabled,
      imageUrl: data.image_url || undefined,
    };
    set((s) => ({ items: [...s.items, newItem] }));
    return null;
  },

  setItemImage: async (id: string, imageUrl: string) => {
    const prevItem = get().items.find((i) => i.id === id);
    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, imageUrl } : i)),
    }));
    const { error } = await supabase
      .from('menu_items')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      // Rollback on DB failure
      if (prevItem) {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? prevItem : i)),
        }));
      }
      throw error;
    }
  },
}));
