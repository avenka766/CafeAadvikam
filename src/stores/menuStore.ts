import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { MenuItem } from '@/types';
import { useAuthStore } from '@/stores/authStore';

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
  subscribe: () => () => void;
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
        .select('id, name, price, category, timing, enabled')
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
      .update({ enabled: newEnabled })
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
    const dbUpdates: Record<string, unknown> = {};
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    if (Object.keys(dbUpdates).length === 0) return;
    const { error } = await supabase.from('menu_items').update(dbUpdates).eq('id', id);
    if (error) {
      // Rollback on DB failure
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? prevItem : i)),
      }));
      throw new Error('Failed to save - please check your connection and try again.');
    }

    // Fire admin notification for price or name changes
    const priceChanged = updates.price !== undefined && updates.price !== prevItem.price;
    const nameChanged  = updates.name  !== undefined && updates.name  !== prevItem.name;
    if (priceChanged || nameChanged) {
      const effectiveName = updates.name ?? prevItem.name;
      const changes: string[] = [];
      if (nameChanged)  changes.push(`name: "${prevItem.name}" -> "${updates.name}"`);
      if (priceChanged) changes.push(`price: Rs.${prevItem.price} -> Rs.${updates.price}`);
      // VRSNB Admin or SNB Admin changing cafe items -> notify 'admin' (super admin must see it)
      // Super Admin changing cafe items -> notify 'admin' (self-audit, appears in own feed)
      const changerRole = useAuthStore.getState().currentUser?.role ?? 'admin';
      const recipientRole = (changerRole === 'admin_vrsnb' || changerRole === 'admin_snb') ? 'admin' : 'admin';

      const { error: notifError } = await supabase.from('admin_notifications').insert({
        type:           'price_change',
        title:          `Cafe Menu Updated - ${effectiveName}`,
        body:           `${changes.join(' | ')} | Cafe menu`,
        ref_label:      `Cafe | Item ID ${id}`,
        meta:           {
          branch:   'CAFE',
          itemId:   id,
          name:     effectiveName,
          oldName:  prevItem.name,
          price:    updates.price ?? prevItem.price,
          oldPrice: prevItem.price,
        },
        recipient_role: recipientRole,
      });
      if (notifError) {
        console.error('[menuStore] notification insert failed:', notifError.message);
      }
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

  subscribe: () => {
    const channel = supabase.channel('menu-items-live').on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => { void get().loadMenu(true); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  },

  setItemImage: async (id: string, imageUrl: string) => {
    const prevItem = get().items.find((i) => i.id === id);
    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, imageUrl } : i)),
    }));
    const { error } = await supabase
      .from('menu_items')
      .update({ image_url: imageUrl })
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
