import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { SNB_ITEMS } from '@/branch/snbItems';
import { VRSNB_ITEMS } from '@/branch/vrsnbItems';

export type CatalogBranch = 'SNB' | 'VRSNB';
export type CatalogUom = 'Nos' | 'Kgs';

export interface BranchCatalogItem {
  branch: CatalogBranch;
  barcode: number;
  name: string;
  price: number;
  uom: CatalogUom;
  category: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  source: 'database' | 'legacy' | 'seed';
}

const seedItems = (branch: CatalogBranch): BranchCatalogItem[] =>
  (branch === 'SNB' ? SNB_ITEMS : VRSNB_ITEMS).map((item) => ({
    branch,
    barcode: Number(item.barcode),
    name: item.name,
    price: Number(item.price),
    uom: item.uom,
    category: item.category,
    active: true,
    source: 'seed' as const,
  }));

function mapDbRow(row: Record<string, unknown>): BranchCatalogItem {
  return {
    branch: row.branch as CatalogBranch,
    barcode: Number(row.barcode),
    name: String(row.name ?? ''),
    price: Number(row.price ?? 0),
    uom: String(row.uom ?? 'Nos') === 'Kgs' ? 'Kgs' : 'Nos',
    category: String(row.category ?? 'Other'),
    active: row.active !== false,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
    source: 'database',
  };
}

function isMissingTable(message?: string) {
  return /branch_items|does not exist|schema cache|could not find/i.test(message ?? '');
}

async function ensureStockLink(item: BranchCatalogItem) {
  const { error } = await supabase.rpc('ensure_branch_stock_link', {
    p_branch: item.branch,
    p_barcode: item.barcode,
    p_legacy_name: item.name,
  });
  if (!error) return null;

  const missingRpc = /ensure_branch_stock_link|could not find the function|does not exist|schema cache/i
    .test(error.message ?? '');
  if (missingRpc) {
    return 'Install the latest branch stock-link repair migration before adding or editing items.';
  }
  return error.message;
}

function mergeLegacyOverrides(branch: CatalogBranch, rows: Array<Record<string, unknown>> | null | undefined) {
  const overrides = new Map<number, Record<string, unknown>>();
  (rows ?? []).forEach((row) => overrides.set(Number(row.barcode), row));
  return seedItems(branch).map((item) => {
    const override = overrides.get(item.barcode);
    if (!override) return item;
    return {
      ...item,
      name: String(override.name ?? item.name),
      price: Number(override.price ?? item.price),
      updatedAt: override.updated_at ? String(override.updated_at) : undefined,
      updatedBy: override.updated_by ? String(override.updated_by) : undefined,
      source: 'legacy' as const,
    };
  });
}

interface BranchCatalogState {
  items: Record<CatalogBranch, BranchCatalogItem[]>;
  loaded: Record<CatalogBranch, boolean>;
  loading: Record<CatalogBranch, boolean>;
  errors: Record<CatalogBranch, string | null>;
  loadCatalog: (branch: CatalogBranch, force?: boolean) => Promise<void>;
  addItem: (
    branch: CatalogBranch,
    item: { name: string; price: number; uom: CatalogUom; category: string },
    updatedBy: string,
  ) => Promise<{ item: BranchCatalogItem | null; error: string | null }>;
  updateItem: (
    branch: CatalogBranch,
    barcode: number,
    updates: Partial<Pick<BranchCatalogItem, 'name' | 'price' | 'uom' | 'category' | 'active'>>,
    updatedBy: string,
  ) => Promise<string | null>;
  subscribe: (branch: CatalogBranch) => () => void;
  getItem: (branch: CatalogBranch, barcode: number) => BranchCatalogItem | undefined;
  getActiveItems: (branch: CatalogBranch) => BranchCatalogItem[];
  // FEATURE: "unable to see the place to create a new category" — categories
  // used to only exist implicitly as free text on individual items (derived
  // by scanning the catalogue), with no standalone place to create one.
  // These back a real branch_categories table so a category can exist and
  // be picked before any item uses it.
  categories: Record<CatalogBranch, string[]>;
  categoriesLoaded: Record<CatalogBranch, boolean>;
  loadCategories: (branch: CatalogBranch, force?: boolean) => Promise<void>;
  addCategory: (branch: CatalogBranch, name: string, createdBy: string) => Promise<string | null>;
}

export const useBranchCatalogStore = create<BranchCatalogState>((set, get) => ({
  items: { SNB: seedItems('SNB'), VRSNB: seedItems('VRSNB') },
  loaded: { SNB: false, VRSNB: false },
  loading: { SNB: false, VRSNB: false },
  errors: { SNB: null, VRSNB: null },
  categories: { SNB: [], VRSNB: [] },
  categoriesLoaded: { SNB: false, VRSNB: false },

  loadCatalog: async (branch, force = false) => {
    if (!force && (get().loaded[branch] || get().loading[branch])) return;
    set((state) => ({
      loading: { ...state.loading, [branch]: true },
      errors: { ...state.errors, [branch]: null },
    }));
    try {
      const { data, error } = await supabase
        .from('branch_items')
        .select('branch, barcode, name, price, uom, category, active, created_at, updated_at, updated_by')
        .eq('branch', branch)
        .order('barcode', { ascending: true });

      if (error) {
        if (!isMissingTable(error.message)) throw error;
        const legacy = await supabase
          .from('branch_item_prices')
          .select('barcode, name, price, updated_at, updated_by')
          .eq('branch', branch);
        const fallback = mergeLegacyOverrides(branch, legacy.error ? [] : legacy.data as Array<Record<string, unknown>>);
        set((state) => ({
          items: { ...state.items, [branch]: fallback },
          loaded: { ...state.loaded, [branch]: true },
          errors: {
            ...state.errors,
            [branch]: 'branch_items migration is not installed; using the bundled catalogue temporarily.',
          },
        }));
        return;
      }

      const dbItems = (data ?? []).map((row) => mapDbRow(row as Record<string, unknown>));
      // The migration seeds the catalogue. Keep a seed fallback only for an empty legacy database,
      // but never merge missing rows after data exists because an inactive/deleted item must stay hidden.
      set((state) => ({
        items: { ...state.items, [branch]: dbItems.length ? dbItems : seedItems(branch) },
        loaded: { ...state.loaded, [branch]: true },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load branch catalogue.';
      set((state) => ({
        items: { ...state.items, [branch]: state.items[branch].length ? state.items[branch] : seedItems(branch) },
        loaded: { ...state.loaded, [branch]: true },
        errors: { ...state.errors, [branch]: message },
      }));
    } finally {
      set((state) => ({ loading: { ...state.loading, [branch]: false } }));
    }
  },

  addItem: async (branch, item, updatedBy) => {
    const trimmedName = item.name.trim();
    if (!trimmedName) return { item: null, error: 'Item name is required.' };
    if (!Number.isFinite(item.price) || item.price <= 0) return { item: null, error: 'Enter a valid price.' };

    const rpcResult = await supabase.rpc('create_branch_item', {
      p_branch: branch,
      p_name: trimmedName,
      p_price: item.price,
      p_uom: item.uom,
      p_category: item.category,
      p_updated_by: updatedBy,
    });

    let row: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;
    if (!rpcResult.error && rpcResult.data) {
      row = (Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data) as Record<string, unknown>;
    } else {
      const missingRpc = /create_branch_item|could not find the function|does not exist|schema cache/i.test(rpcResult.error?.message ?? '');
      if (!missingRpc) return { item: null, error: rpcResult.error?.message ?? 'Failed to add item.' };

      const current = get().items[branch];
      const rangeStart = branch === 'SNB' ? 1000 : 2000;
      const nextBarcode = Math.max(rangeStart, ...current.map((entry) => entry.barcode)) + 1;
      const direct = await supabase
        .from('branch_items')
        .insert({
          branch,
          barcode: nextBarcode,
          name: trimmedName,
          price: item.price,
          uom: item.uom,
          category: item.category,
          active: true,
          updated_by: updatedBy,
        })
        .select('branch, barcode, name, price, uom, category, active, created_at, updated_at, updated_by')
        .single();
      if (direct.error || !direct.data) {
        errorMessage = direct.error?.message ?? 'Failed to add item. Install the branch catalogue migration first.';
      } else {
        row = direct.data as Record<string, unknown>;
      }
    }

    if (!row) return { item: null, error: errorMessage ?? 'Failed to add item.' };
    const created = mapDbRow(row);
    const stockLinkError = await ensureStockLink(created);
    // AUDIT FIX (2026-09-02): the catalog row (`created`) is already
    // committed in the DB at this point regardless of whether the stock
    // link succeeded — returning {item:null} here, without ever updating
    // local state, made the caller believe nothing was created. A retry
    // then created a second row (different barcode) for the same item, and
    // the UI kept showing the item as missing until an unrelated refresh.
    // Always commit `created` to state; surface the stock-link failure as a
    // non-fatal warning instead of a hard error.
    set((state) => ({
      items: {
        ...state.items,
        [branch]: [...state.items[branch].filter((entry) => entry.barcode !== created.barcode), created]
          .sort((a, b) => a.barcode - b.barcode),
      },
    }));
    if (stockLinkError) return { item: created, error: `Item was created, but its stock row could not be linked: ${stockLinkError}. It may not show up in stock counts until this is resolved.` };
    return { item: created, error: null };
  },

  updateItem: async (branch, barcode, updates, updatedBy) => {
    // AUDIT FIX (2026-09-03): this used to build `next` from the LOCAL
    // Zustand cache (`get().items[branch]`), which can be stale relative to
    // the DB (realtime lag, or simply another admin's edit on a different
    // device landing after this admin's dialog opened but before they hit
    // Save). Both the RPC and the direct-update fallback below write ALL
    // FIVE fields (name/price/uom/category/active) unconditionally, so any
    // field the CALLER didn't intend to touch still gets silently
    // overwritten back to whatever this stale snapshot held — a real
    // concurrent edit from someone else quietly reverted with no warning.
    // Re-reading the row fresh right before merging narrows that window
    // from "since the dialog opened" (could be minutes) down to "between
    // this fetch and the write" (milliseconds) — not a full fix (would need
    // per-field partial updates or optimistic-concurrency versioning on the
    // RPC itself), but a real, low-risk reduction of the actual race.
    const { data: freshRow } = await supabase
      .from('branch_items')
      .select('branch, barcode, name, price, uom, category, active, created_at, updated_at, updated_by')
      .eq('branch', branch).eq('barcode', barcode).maybeSingle();
    const current = freshRow ? mapDbRow(freshRow as Record<string, unknown>) : get().items[branch].find((entry) => entry.barcode === barcode);
    if (!current) return 'Item not found.';
    const next = { ...current, ...updates };
    if (!next.name.trim()) return 'Item name is required.';
    if (!Number.isFinite(next.price) || next.price <= 0) return 'Enter a valid price.';

    const rpc = await supabase.rpc('update_branch_item', {
      p_branch: branch,
      p_barcode: barcode,
      p_name: next.name.trim(),
      p_price: next.price,
      p_uom: next.uom,
      p_category: next.category,
      p_active: next.active,
      p_updated_by: updatedBy,
    });

    let saved: BranchCatalogItem | null = null;
    if (!rpc.error && rpc.data) {
      const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as Record<string, unknown>;
      saved = mapDbRow(row);
    } else {
      const missingRpc = /update_branch_item|could not find the function|does not exist|schema cache/i.test(rpc.error?.message ?? '');
      if (!missingRpc) return rpc.error?.message ?? 'Failed to update item.';
      const direct = await supabase
        .from('branch_items')
        .update({
          name: next.name.trim(), price: next.price, uom: next.uom,
          category: next.category, active: next.active, updated_by: updatedBy,
        })
        .eq('branch', branch)
        .eq('barcode', barcode)
        .select('branch, barcode, name, price, uom, category, active, created_at, updated_at, updated_by')
        .single();
      if (direct.error || !direct.data) return direct.error?.message ?? 'Failed to update item.';
      saved = mapDbRow(direct.data as Record<string, unknown>);
    }

    const stockLinkError = await ensureStockLink(saved);

    // The database trigger mirrors the canonical branch_items row into the
    // legacy compatibility table in the same transaction. Never write the
    // legacy table from the browser, because a failed/fire-and-forget write can
    // make an old price reappear after refresh.

    // AUDIT FIX (2026-09-02): the DB write (price/name/etc) already
    // committed successfully by this point regardless of ensureStockLink's
    // result — returning early here without ever calling set() left the
    // cashier's screen showing the OLD price until an unrelated
    // refresh/realtime event. Always commit `saved` to local state.
    set((state) => ({
      items: {
        ...state.items,
        [branch]: state.items[branch].map((entry) => entry.barcode === barcode ? saved! : entry),
      },
    }));
    if (stockLinkError) return `Item was updated, but its stock row could not be linked: ${stockLinkError}. It may not show up in stock counts until this is resolved.`;
    return null;
  },

  loadCategories: async (branch, force = false) => {
    if (!force && (get().categoriesLoaded[branch])) return;
    const { data, error } = await supabase
      .from('branch_categories')
      .select('name')
      .eq('branch', branch)
      .order('name', { ascending: true });
    if (error) {
      // branch_categories migration not installed yet on an older
      // environment — fall back silently to whatever catalogCategories()
      // derives from items, same as before this feature existed.
      set((state) => ({ categoriesLoaded: { ...state.categoriesLoaded, [branch]: true } }));
      return;
    }
    set((state) => ({
      categories: { ...state.categories, [branch]: (data ?? []).map((row) => String(row.name)) },
      categoriesLoaded: { ...state.categoriesLoaded, [branch]: true },
    }));
  },

  addCategory: async (branch, name, createdBy) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Category name is required.';
    const { data, error } = await supabase.rpc('create_branch_category', {
      p_branch: branch,
      p_name: trimmed,
      p_created_by: createdBy,
    });
    if (error) {
      const missingRpc = /create_branch_category|could not find the function|does not exist|schema cache/i.test(error.message ?? '');
      return missingRpc
        ? 'The category management feature is not installed yet. Please redeploy.'
        : error.message;
    }
    const savedName = data && typeof data === 'object' && 'name' in data ? String((data as { name: unknown }).name) : trimmed;
    set((state) => ({
      categories: {
        ...state.categories,
        [branch]: state.categories[branch].includes(savedName)
          ? state.categories[branch]
          : [...state.categories[branch], savedName].sort((a, b) => a.localeCompare(b)),
      },
    }));
    return null;
  },

  subscribe: (() => {
    // Singleton channels per branch — Supabase Realtime throws if you call
    // .on() on a channel that has already been subscribed. Multiple hook
    // instances (e.g. StockTab mounts ManualStockUpdate which also calls
    // useOperationalBranchCatalog) must share one channel rather than each
    // creating their own.
    const channels  = new Map<CatalogBranch, ReturnType<typeof supabase.channel>>();
    const refCounts = new Map<CatalogBranch, number>();

    return (branch: CatalogBranch) => {
      const count = (refCounts.get(branch) ?? 0) + 1;
      refCounts.set(branch, count);

      if (!channels.has(branch)) {
        const ch = supabase
          .channel(`branch-catalog-${branch}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'branch_items', filter: `branch=eq.${branch}` },
            // REALTIME FIX (2026-09-01): this used to call loadCatalog(branch,
            // true) — a full table refetch — on every single change with no
            // debounce at all. Replaced with a direct row-level patch keyed by
            // barcode (matches branchStore.ts's applyBranchRealtimeChange
            // pattern), so one price/item edit no longer re-downloads the
            // whole catalogue. Only patches the normal "database" case —
            // loadCatalog's legacy/seed fallback paths are unaffected since
            // this only fires once branch_items itself is receiving writes.
            (payload) => {
              const event = payload as { eventType?: string; new?: Record<string, unknown>; old?: { barcode?: number } };
              const barcode = event.new?.barcode != null ? Number(event.new.barcode) : (event.old?.barcode != null ? Number(event.old.barcode) : null);
              if (barcode == null) return;
              if (event.eventType === 'DELETE') {
                set((state) => ({
                  items: { ...state.items, [branch]: state.items[branch].filter((entry) => entry.barcode !== barcode) },
                }));
                return;
              }
              const changed = mapDbRow(event.new ?? {});
              set((state) => ({
                items: {
                  ...state.items,
                  [branch]: [...state.items[branch].filter((entry) => entry.barcode !== barcode), changed]
                    .sort((a, b) => a.barcode - b.barcode),
                },
              }));
            },
          )
          .subscribe();
        channels.set(branch, ch);
      }

      // Return an unsubscribe/cleanup function — only tear down the channel
      // when the last subscriber unmounts.
      return () => {
        const remaining = (refCounts.get(branch) ?? 1) - 1;
        refCounts.set(branch, remaining);
        if (remaining <= 0) {
          const ch = channels.get(branch);
          if (ch) {
            void supabase.removeChannel(ch);
            channels.delete(branch);
          }
          refCounts.delete(branch);
        }
      };
    };
  })(),

  getItem: (branch, barcode) => get().items[branch].find((entry) => entry.barcode === barcode),
  getActiveItems: (branch) => get().items[branch].filter((entry) => entry.active),
}));

export function catalogCategories(items: BranchCatalogItem[]) {
  return Array.from(new Set(items.filter((item) => item.active).map((item) => item.category))).sort((a, b) => a.localeCompare(b));
}
