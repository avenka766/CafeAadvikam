// Compatibility adapter for older components that still ask for an item-price
// store. The canonical source is public.branch_items via branchCatalogStore.
// This file deliberately never writes branch_item_prices from the browser.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';

export type PriceBranch = 'SNB' | 'VRSNB';

export interface ItemPriceOverride {
  branch: PriceBranch;
  barcode: number;
  name: string;
  price: number;
  updatedAt: string;
  updatedBy: string;
}

interface ItemPriceState {
  overrides: Record<PriceBranch, Record<number, ItemPriceOverride>>;
  loaded: Record<PriceBranch, boolean>;
  loading: boolean;
  fetchOverrides: (branch: PriceBranch, force?: boolean) => Promise<void>;
  saveOverride: (
    branch: PriceBranch,
    barcode: number,
    name: string,
    price: number,
    updatedBy: string,
    oldPrice: number,
    oldName: string,
  ) => Promise<string | null>;
  getPrice: (branch: PriceBranch, barcode: number, fallback: number) => number;
  getName: (branch: PriceBranch, barcode: number, fallback: string) => string;
}

function catalogueMap(branch: PriceBranch): Record<number, ItemPriceOverride> {
  const result: Record<number, ItemPriceOverride> = {};
  for (const item of useBranchCatalogStore.getState().items[branch]) {
    result[item.barcode] = {
      branch,
      barcode: item.barcode,
      name: item.name,
      price: item.price,
      updatedAt: item.updatedAt ?? '',
      updatedBy: item.updatedBy ?? '',
    };
  }
  return result;
}

export const useItemPriceStore = create<ItemPriceState>((set, get) => ({
  overrides: { SNB: {}, VRSNB: {} },
  loaded: { SNB: false, VRSNB: false },
  loading: false,

  fetchOverrides: async (branch, force = false) => {
    if (!force && get().loaded[branch]) return;
    set({ loading: true });
    try {
      await useBranchCatalogStore.getState().loadCatalog(branch, force);
      set((state) => ({
        overrides: { ...state.overrides, [branch]: catalogueMap(branch) },
        loaded: { ...state.loaded, [branch]: true },
      }));
    } finally {
      set({ loading: false });
    }
  },

  saveOverride: async (branch, barcode, name, price, updatedBy, oldPrice, oldName) => {
    await useBranchCatalogStore.getState().loadCatalog(branch);
    const current = useBranchCatalogStore.getState().getItem(branch, barcode);
    if (!current) return 'Item not found in the branch catalogue.';

    const error = await useBranchCatalogStore.getState().updateItem(
      branch,
      barcode,
      { name: name.trim(), price },
      updatedBy,
    );
    if (error) return error;

    const saved = useBranchCatalogStore.getState().getItem(branch, barcode);
    if (!saved) return 'Item was saved but could not be reloaded.';

    set((state) => ({
      overrides: {
        ...state.overrides,
        [branch]: {
          ...state.overrides[branch],
          [barcode]: {
            branch,
            barcode,
            name: saved.name,
            price: saved.price,
            updatedAt: saved.updatedAt ?? new Date().toISOString(),
            updatedBy,
          },
        },
      },
    }));

    const priceChanged = price !== oldPrice;
    const nameChanged = name.trim() !== oldName;
    if (priceChanged || nameChanged) {
      const changes: string[] = [];
      if (nameChanged) changes.push(`name: "${oldName}" -> "${name.trim()}"`);
      if (priceChanged) changes.push(`price: Rs.${oldPrice} -> Rs.${price}`);
      const recipientRole = branch === 'SNB' ? 'admin_snb' : 'admin_vrsnb';
      const notifications = [recipientRole, 'admin'].map((role) => ({
        type: 'price_change',
        title: `${branch} Price Updated - ${saved.name}`,
        body: `${changes.join(' | ')} | Changed by ${updatedBy}`,
        ref_label: `${branch} | Barcode #${barcode}`,
        meta: { branch, barcode, name: saved.name, oldName, price: saved.price, oldPrice, updatedBy },
        recipient_role: role,
      }));
      const { error: notificationError } = await supabase.from('admin_notifications').insert(notifications);
      if (notificationError) {
        console.error('[itemPriceStore] notification insert failed:', notificationError.message);
        return `Price saved, but notification failed: ${notificationError.message}`;
      }
    }

    return null;
  },

  getPrice: (branch, barcode, fallback) => get().overrides[branch][barcode]?.price ?? fallback,
  getName: (branch, barcode, fallback) => get().overrides[branch][barcode]?.name ?? fallback,
}));
