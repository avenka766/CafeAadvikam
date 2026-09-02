import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
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
        .select('id, name, price, category, timing, enabled, image_url')
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
    // BUG FIX (2026-08-08): "we are unable to add items to the cafe items
    // we are getting an error" — null value in column "id" of relation
    // "menu_items" violates not-null constraint. menu_items.id is a plain
    // `text` primary key with no database default (no auto-generated
    // uuid), so it must be supplied by the app on insert. This never did.
    // Build a readable, unique slug-based id from the item name instead.
    const slug = item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id = `custom-${slug || 'item'}-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        id,
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

  // REALTIME FIX (2026-09-01): opening a fresh `supabase.channel(...)` on
  // every `subscribe()` call with no ref-count/dedupe guard was fixed here —
  // wrapped in makeSingletonSubscriber, same safety every other store's
  // realtime subscription already has.
  // EGRESS FIX (2026-09-03): the debounce above only ever collapsed BURSTS
  // of edits into one call — every one of those calls still re-downloaded
  // the ENTIRE menu_items table (loadMenu(true)), and this is the one store
  // that subscription applies to the PUBLIC storefront, not just staff —
  // every customer with the QR menu open re-fetches the whole menu 2s after
  // any admin edit, not just the row that changed. Replaced with the same
  // direct row-level patch every other store's realtime handler already
  // uses (see bakeryItemsStore.ts's identical fix) — no refetch at all now,
  // on either the admin or the public-menu side.
  subscribe: makeSingletonSubscriber('menu-items-live', (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' },
      (payload) => {
        const event = payload as { eventType?: string; new?: Record<string, unknown>; old?: { id?: string } };
        const id = String(event.new?.id ?? event.old?.id ?? '');
        if (!id) return;
        if (event.eventType === 'DELETE') {
          set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
          return;
        }
        const d = event.new ?? {};
        const changed: MenuItem = {
          id: String(d.id ?? id),
          name: String(d.name ?? ''),
          price: Number(d.price ?? 0),
          category: String(d.category ?? ''),
          timing: d.timing as MenuItem['timing'],
          enabled: Boolean(d.enabled),
          imageUrl: (d.image_url as string | null) || undefined,
        };
        set((state) => ({
          items: state.items.some((item) => item.id === id)
            ? state.items.map((item) => (item.id === id ? changed : item))
            : [...state.items, changed].sort((a, b) => a.id.localeCompare(b.id)),
        }));
      }),
  ),

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
