// src/stores/itemPriceStore.ts
// Single source of truth for SNB and VRSNB item price/name overrides.
//
// Flow:
//   Admin edits price/name in SnbItemsTab or VrsnbItemsTab
//     → saveOverride() upserts row into `branch_item_prices` (Supabase)
//     → fires a `price_change` admin_notification
//     → updates local Zustand state immediately (optimistic)
//
//   BillTab reads getPrice() / getName() to use the effective price at sale time.
//   SnbItemsTab / VrsnbItemsTab call fetchOverrides() on mount to hydrate.
//   AdminDashboard sees the change via the notification feed.
//
// Supabase table required (run once):
//   CREATE TABLE branch_item_prices (
//     branch      TEXT        NOT NULL,  -- 'SNB' | 'VRSNB'
//     barcode     BIGINT      NOT NULL,
//     name        TEXT        NOT NULL,
//     price       NUMERIC     NOT NULL,
//     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
//     updated_by  TEXT        NOT NULL DEFAULT '',
//     PRIMARY KEY (branch, barcode)
//   );

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type PriceBranch = 'SNB' | 'VRSNB';

export interface ItemPriceOverride {
  branch:    PriceBranch;
  barcode:   number;
  name:      string;
  price:     number;
  updatedAt: string;
  updatedBy: string;
}

interface ItemPriceState {
  /** branch → barcode → override */
  overrides: Record<PriceBranch, Record<number, ItemPriceOverride>>;
  loaded:    Record<PriceBranch, boolean>;
  loading:   boolean;

  /** Load all overrides for one branch from Supabase */
  fetchOverrides: (branch: PriceBranch) => Promise<void>;

  /**
   * Persist a price / name edit.
   * Also writes a `price_change` notification to admin_notifications.
   * Returns an error string on failure, null on success.
   */
  saveOverride: (
    branch:    PriceBranch,
    barcode:   number,
    name:      string,
    price:     number,
    updatedBy: string,
    oldPrice:  number,
    oldName:   string,
  ) => Promise<string | null>;

  /** Effective price — override when set, else the static fallback */
  getPrice: (branch: PriceBranch, barcode: number, fallback: number) => number;
  /** Effective name — override when set, else the static fallback */
  getName:  (branch: PriceBranch, barcode: number, fallback: string) => string;
}

function mapRow(r: Record<string, unknown>): ItemPriceOverride {
  return {
    branch:    r.branch    as PriceBranch,
    barcode:   Number(r.barcode),
    name:      r.name      as string,
    price:     Number(r.price),
    updatedAt: r.updated_at as string,
    updatedBy: r.updated_by as string,
  };
}

export const useItemPriceStore = create<ItemPriceState>((set, get) => ({
  overrides: { SNB: {}, VRSNB: {} },
  loaded:    { SNB: false, VRSNB: false },
  loading:   false,

  // ── Fetch ─────────────────────────────────────────────────────────────────
  fetchOverrides: async (branch) => {
    if (get().loaded[branch]) return;          // already hydrated this session
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('branch_item_prices')
        .select('*')
        .eq('branch', branch);
      if (error) {
        console.error('[itemPriceStore] fetchOverrides:', error.message);
        return;
      }
      const map: Record<number, ItemPriceOverride> = {};
      (data ?? []).forEach((r) => {
        const row = mapRow(r as Record<string, unknown>);
        map[row.barcode] = row;
      });
      set((s) => ({
        overrides: { ...s.overrides, [branch]: map },
        loaded:    { ...s.loaded,    [branch]: true },
      }));
    } finally {
      set({ loading: false });
    }
  },

  // ── Save (upsert + notify) ─────────────────────────────────────────────────
  saveOverride: async (branch, barcode, name, price, updatedBy, oldPrice, oldName) => {
    // 1. Persist to DB — do NOT include updated_at; let the DB default handle it
    const { error } = await supabase
      .from('branch_item_prices')
      .upsert(
        { branch, barcode, name, price, updated_by: updatedBy },
        { onConflict: 'branch,barcode' },
      );
    if (error) return `Failed to save: ${error.message}`;

    // 2. Optimistic local update
    const now = new Date().toISOString();
    const override: ItemPriceOverride = { branch, barcode, name, price, updatedAt: now, updatedBy };
    set((s) => ({
      overrides: {
        ...s.overrides,
        [branch]: { ...s.overrides[branch], [barcode]: override },
      },
    }));

    // 3. Fire admin notification for price OR name change
    const priceChanged = price   !== oldPrice;
    const nameChanged  = name    !== oldName;
    if (priceChanged || nameChanged) {
      const changes: string[] = [];
      if (nameChanged)  changes.push(`name: "${oldName}" → "${name}"`);
      if (priceChanged) changes.push(`price: ₹${oldPrice} → ₹${price}`);

      // Determine recipient based on who changed what:
      // VRSNB Admin or SNB Admin → notify 'admin' (super admin must be informed)
      // Super Admin changing any branch items → notify 'admin' (self-audit log;
      //   branch admins don't need to know when the super admin edits their own items)
      const changerRole = useAuthStore.getState().user?.role ?? 'admin';
      let recipientRole: string;
      if (changerRole === 'admin_vrsnb' || changerRole === 'admin_snb') {
        recipientRole = 'admin';
      } else {
        // changerRole === 'admin' (super admin) — always notify 'admin' so the
        // change appears in the super admin's own notification feed as an audit entry
        recipientRole = 'admin';
      }

      const { error: notifError } = await supabase.from('admin_notifications').insert({
        type:           'price_change',
        title:          `${branch} Price Updated — ${name}`,
        body:           `${changes.join(' · ')} · Changed by ${updatedBy}`,
        ref_label:      `${branch} · Barcode #${barcode}`,
        meta:           { branch, barcode, name, oldName, price, oldPrice, updatedBy },
        recipient_role: recipientRole,
      });
      if (notifError) {
        console.error('[itemPriceStore] notification insert failed:', notifError.message);
        return `Price saved, but notification failed: ${notifError.message}`;
      }
    }

    return null;
  },

  // ── Getters ───────────────────────────────────────────────────────────────
  getPrice: (branch, barcode, fallback) =>
    get().overrides[branch][barcode]?.price ?? fallback,

  getName: (branch, barcode, fallback) =>
    get().overrides[branch][barcode]?.name ?? fallback,
}));
