// src/stores/menuCategoryStore.ts
//
// FEATURE (2026-08-10): "allow the VRSNB Admin and Admin to add a new
// category and edit the category this should sync with Admin if VRSNB Admin
// makes changes and vice versa" — Cafe menu categories used to be a
// hardcoded array (src/constants/config.ts MENU_CATEGORIES) with no database
// backing, so nobody could add or rename one without a code deploy, and
// there was nothing to "sync" in the first place. This store reads/writes a
// real `menu_categories` table instead, with the same realtime-subscription
// pattern already proven out for VRSNB/SNB branch items
// (stores/branchCatalogStore.ts) — a change made from Admin's Menu
// Management screen or from VRSNB Admin's "Cafe Items" screen (both render
// the exact same <MenuManagement /> component) hits the same table and
// broadcasts to every other open tab within seconds.
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface MenuCategory {
  id: string;
  name: string;
  icon: string;
  timing: string;
  sortOrder: number;
}

function mapDbRow(row: Record<string, unknown>): MenuCategory {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    icon: String(row.icon ?? '🍽️'),
    timing: String(row.timing ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

const slugify = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface MenuCategoryState {
  categories: MenuCategory[];
  loading: boolean;
  loaded: boolean;
  error: string;
  loadCategories: (force?: boolean) => Promise<void>;
  addCategory: (input: { name: string; icon: string; timing: string }, updatedBy: string) => Promise<{ category: MenuCategory | null; error: string | null }>;
  updateCategory: (id: string, updates: Partial<Pick<MenuCategory, 'name' | 'icon' | 'timing' | 'sortOrder'>>, updatedBy: string) => Promise<string | null>;
  subscribe: () => () => void;
}

export const useMenuCategoryStore = create<MenuCategoryState>((set, get) => ({
  categories: [],
  loading: false,
  loaded: false,
  error: '',

  loadCategories: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true, error: '' });
    try {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('id, name, icon, timing, sort_order')
        .order('sort_order', { ascending: true });
      if (error) { set({ error: error.message, loading: false }); return; }
      set({ categories: (data ?? []).map(mapDbRow), loaded: true, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load categories.', loading: false });
    }
  },

  addCategory: async (input, updatedBy) => {
    const name = input.name.trim();
    if (!name) return { category: null, error: 'Category name is required.' };
    let id = slugify(name);
    if (!id) return { category: null, error: 'Enter a valid category name.' };
    // Guard against colliding with an existing id (e.g. two categories that
    // slugify to the same thing) by appending a short suffix instead of
    // silently overwriting the other category.
    if (get().categories.some((c) => c.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    const sortOrder = get().categories.length
      ? Math.max(...get().categories.map((c) => c.sortOrder)) + 1
      : 0;
    const { data, error } = await supabase
      .from('menu_categories')
      .insert({ id, name, icon: input.icon || '🍽️', timing: input.timing || '', sort_order: sortOrder, updated_by: updatedBy })
      .select('id, name, icon, timing, sort_order')
      .single();
    if (error || !data) return { category: null, error: error?.message ?? 'Failed to add category.' };
    const category = mapDbRow(data as Record<string, unknown>);
    set((state) => ({ categories: [...state.categories, category].sort((a, b) => a.sortOrder - b.sortOrder) }));
    return { category, error: null };
  },

  updateCategory: async (id, updates, updatedBy) => {
    const prev = get().categories.find((c) => c.id === id);
    if (!prev) return 'Category not found.';
    const dbUpdates: Record<string, unknown> = { updated_by: updatedBy, updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbUpdates.name = updates.name.trim();
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
    if (updates.timing !== undefined) dbUpdates.timing = updates.timing;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    // Optimistic update
    set((state) => ({ categories: state.categories.map((c) => c.id === id ? { ...c, ...updates } : c) }));
    const { error } = await supabase.from('menu_categories').update(dbUpdates).eq('id', id);
    if (error) {
      set((state) => ({ categories: state.categories.map((c) => c.id === id ? prev : c) }));
      return error.message;
    }
    return null;
  },

  // BUG FIX (production errors ERR-20260810-AACDFB6B / ERR-20260810-721A198B,
  // "cannot add `postgres_changes` callbacks for realtime:menu-categories-live
  // after `subscribe()`"): MenuManagement.tsx and its child CategoryFilter.tsx
  // (plus ManageCategoriesSheet) each independently call useMenuCategories(),
  // so a single page render (e.g. /admin-vrsnb/items or /bakery/items) mounts
  // this hook more than once. Each mount used to call supabase.channel('menu-
  // categories-live').on(...).subscribe() itself — Supabase Realtime throws if
  // .on() is called on a channel that has already been subscribed, so the
  // second mount's subscribe() call crashed React rendering outright. Fixed
  // with a singleton channel + ref count, same pattern as
  // branchCatalogStore.ts's subscribe(): only the first caller opens the
  // channel, later callers just bump the ref count, and the channel is only
  // torn down once the last subscriber unmounts.
  subscribe: (() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refCount = 0;
    return () => {
      refCount += 1;
      if (!channel) {
        channel = supabase
          .channel('menu-categories-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, () => { void get().loadCategories(true); })
          .subscribe();
      }
      return () => {
        refCount -= 1;
        if (refCount <= 0 && channel) {
          void supabase.removeChannel(channel);
          channel = null;
          refCount = 0;
        }
      };
    };
  })(),
}));

// Convenience hook for read-only consumers (category chips, filters, order
// pages) — loads once, subscribes to live changes for the lifetime of the
// component, and always returns categories in display order. Falls back to
// an empty array before the first load resolves (callers already handle an
// empty/short category list gracefully, same as they did with the static
// array before any items existed).
