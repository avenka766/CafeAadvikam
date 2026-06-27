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
  const unit = item.uom === 'Kgs' ? 'kg' : 'pcs';
  const { data: existing, error: readError } = await supabase
    .from('branch_stock')
    .select('id')
    .eq('branch', item.branch)
    .eq('item_barcode', item.barcode)
    .maybeSingle();
  if (readError) return readError.message;
  if (existing) {
    const { error } = await supabase
      .from('branch_stock')
      .update({ item_name: item.name, unit })
      .eq('branch', item.branch)
      .eq('item_barcode', item.barcode);
    return error?.message ?? null;
  }
  const { error } = await supabase.from('branch_stock').insert({
    branch: item.branch,
    item_name: item.name,
    item_barcode: item.barcode,
    quantity: 0,
    unit,
    min_threshold: item.uom === 'Kgs' ? 2 : 10,
  });
  return error?.message ?? null;
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
}

export const useBranchCatalogStore = create<BranchCatalogState>((set, get) => ({
  items: { SNB: seedItems('SNB'), VRSNB: seedItems('VRSNB') },
  loaded: { SNB: false, VRSNB: false },
  loading: { SNB: false, VRSNB: false },
  errors: { SNB: null, VRSNB: null },

  loadCatalog: async (branch, force = false) => {
    if (!force && (get().loaded[branch] || get().loading[branch])) return;
    set((state) => ({
      loading: { ...state.loading, [branch]: true },
      errors: { ...state.errors, [branch]: null },
    }));
    try {
      const { data, error } = await supabase
        .from('branch_items')
        .select('*')
        .eq('branch', branch)
        .order('barcode', { ascending: true });

      if (error) {
        if (!isMissingTable(error.message)) throw error;
        const legacy = await supabase
          .from('branch_item_prices')
          .select('*')
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
        .select('*')
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
    if (stockLinkError) return { item: null, error: `Item was created but its stock row could not be linked: ${stockLinkError}` };
    set((state) => ({
      items: {
        ...state.items,
        [branch]: [...state.items[branch].filter((entry) => entry.barcode !== created.barcode), created]
          .sort((a, b) => a.barcode - b.barcode),
      },
    }));
    return { item: created, error: null };
  },

  updateItem: async (branch, barcode, updates, updatedBy) => {
    const current = get().items[branch].find((entry) => entry.barcode === barcode);
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
        .select('*')
        .single();
      if (direct.error || !direct.data) return direct.error?.message ?? 'Failed to update item.';
      saved = mapDbRow(direct.data as Record<string, unknown>);
    }

    const stockLinkError = await ensureStockLink(saved);
    if (stockLinkError) return `Item was updated but its stock row could not be linked: ${stockLinkError}`;

    // Maintain the legacy override table during rollout so older deployed screens do not see stale prices.
    void supabase.from('branch_item_prices').upsert(
      { branch, barcode, name: saved.name, price: saved.price, updated_by: updatedBy },
      { onConflict: 'branch,barcode' },
    );

    set((state) => ({
      items: {
        ...state.items,
        [branch]: state.items[branch].map((entry) => entry.barcode === barcode ? saved! : entry),
      },
    }));
    return null;
  },

  subscribe: (branch) => {
    const channel = supabase
      .channel(`branch-catalog-${branch}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_items', filter: `branch=eq.${branch}` },
        () => { void get().loadCatalog(branch, true); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_item_prices', filter: `branch=eq.${branch}` },
        () => { void get().loadCatalog(branch, true); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },

  getItem: (branch, barcode) => get().items[branch].find((entry) => entry.barcode === barcode),
  getActiveItems: (branch) => get().items[branch].filter((entry) => entry.active),
}));

export function catalogCategories(items: BranchCatalogItem[]) {
  return Array.from(new Set(items.filter((item) => item.active).map((item) => item.category))).sort((a, b) => a.localeCompare(b));
}
