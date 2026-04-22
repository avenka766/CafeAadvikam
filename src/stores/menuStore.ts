import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { MenuItem } from '@/types';

interface MenuState {
  items: MenuItem[];
  loading: boolean;
  loaded: boolean;
  loadMenu: () => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  setItemImage: (id: string, imageUrl: string) => Promise<void>;
}

export const useMenuStore = create<MenuState>()((set, get) => ({
  items: [],
  loading: false,
  loaded: false,

  loadMenu: async () => {
    if (get().loaded) return;
    set({ loading: true });
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
      set({ items, loaded: true, loading: false });
    } else {
      set({ loading: false });
    }
  },

  toggleItem: async (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const newEnabled = !item.enabled;
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, enabled: newEnabled } : i)),
    }));
    await supabase.from('menu_items').update({ enabled: newEnabled, updated_at: new Date().toISOString() }).eq('id', id);
  },

  updateItem: async (id: string, updates: Partial<MenuItem>) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    await supabase.from('menu_items').update(dbUpdates).eq('id', id);
  },

  setItemImage: async (id: string, imageUrl: string) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, imageUrl } : i)),
    }));
    await supabase.from('menu_items').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', id);
  },
}));
