// src/branch/branchStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';
import { BAKERY_ITEMS } from '@/bakery/types';

export interface StockItem {
  itemName: string;
  quantity: number;
  minThreshold: number;
  price: number | null;
}

export interface SaleRecord {
  id: string;
  itemName: string;
  quantitySold: number;
  soldAt: string;
  soldBy: string;
  branch: Branch;
  paymentMethod: string | null;
}

export interface IncomingStock {
  id: string;
  itemName: string;
  quantity: number;
  receivedAt: string;
  dispatchedBy: string;
  confirmed: boolean;
}

interface BranchState {
  stock: Record<Branch, StockItem[]>;
  sales: Record<Branch, SaleRecord[]>;
  incoming: Record<Branch, IncomingStock[]>;
  thresholds: Record<Branch, Record<string, number>>;
  // Cached bakery_items price map — fetched once, reused on every poll
  priceMap: Record<string, number | null>;
  priceMapLoaded: boolean;
  loading: boolean;
  lastCleanedAt: number | null;
  // Track which branches have been seeded so seedBranchItems only runs once per session
  seededBranches: Set<Branch>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string) => Promise<string | null>;
  updateThreshold: (branch: Branch, itemName: string, threshold: number) => Promise<void>;
  syncIncomingFromDispatches: (branch: Branch) => Promise<void>;
  confirmIncoming: (branch: Branch, incomingId: string) => Promise<string | null>;
  confirmAllIncoming: (branch: Branch) => Promise<string | null>;
  cleanOldData: () => Promise<void>;
  seedBranchItems: (branch: Branch) => Promise<void>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:          { VRSNB: [], SNB: [], Hosur: [] },
  sales:          { VRSNB: [], SNB: [], Hosur: [] },
  incoming:       { VRSNB: [], SNB: [], Hosur: [] },
  thresholds:     { VRSNB: {}, SNB: {}, Hosur: {} },
  priceMap:       {},
  priceMapLoaded: false,
  loading:        false,
  lastCleanedAt:  null,
  seededBranches: new Set(),

  fetchBranchData: async (branch) => {
    set({ loading: true });
    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      // FIX: Only fetch bakery_items (prices) once — cache in priceMap.
      // Previously fetched on every poll (every 30s) — now skipped after first load.
      let priceMap = get().priceMap;
      if (!get().priceMapLoaded) {
        const { data: priceData } = await supabase.from('bakery_items').select('name, price');
        priceMap = {};
        (priceData || []).forEach((d) => {
          priceMap[d.name] = d.price != null ? Number(d.price) : null;
        });
        set({ priceMap, priceMapLoaded: true });
      }

      const [
        { data: stockData },
        { data: salesData },
        { data: incomingData },
        { data: thresholdData },
      ] = await Promise.all([
        supabase.from('branch_stock').select('*').eq('branch', branch),
        supabase.from('branch_sales').select('*').eq('branch', branch)
          .gte('sold_at', twoMonthsAgo.toISOString())
          .order('sold_at', { ascending: false }),
        supabase.from('branch_incoming').select('*').eq('branch', branch)
          .order('received_at', { ascending: false }),
        supabase.from('branch_thresholds').select('*').eq('branch', branch),
      ]);

      set((s) => {
        const stock      = { ...s.stock };
        const sales      = { ...s.sales };
        const incoming   = { ...s.incoming };
        const thresholds = { ...s.thresholds };
        const pm         = s.priceMap;

        stock[branch] = (stockData || []).map((d) => ({
          itemName:     d.item_name,
          quantity:     d.quantity,
          minThreshold: d.min_threshold ?? 10,
          price:        pm[d.item_name] ?? null,
        }));

        sales[branch] = (salesData || []).map((d) => ({
          id:            d.id,
          itemName:      d.item_name,
          quantitySold:  d.quantity_sold,
          soldAt:        d.sold_at,
          soldBy:        d.sold_by,
          branch:        d.branch as Branch,
          paymentMethod: d.payment_method ?? null,
        }));

        incoming[branch] = (incomingData || []).map((d) => ({
          id:            d.id,
          itemName:      d.item_name,
          quantity:      Number(d.quantity),
          receivedAt:    d.received_at,
          dispatchedBy:  d.dispatched_by,
          confirmed:     d.confirmed ?? false,
        }));

        const tMap: Record<string, number> = {};
        (thresholdData || []).forEach((d) => { tMap[d.item_name] = d.threshold; });
        thresholds[branch] = tMap;

        return { stock, sales, incoming, thresholds };
      });
    } catch (e) {
      console.error('fetchBranchData error:', e);
    } finally {
      set({ loading: false });
    }
  },

  fetchAllBranches: async () => {
    await Promise.all((['VRSNB', 'SNB', 'Hosur'] as Branch[]).map((b) => get().fetchBranchData(b)));
  },

  recordSale: async (branch, itemName, qty, soldBy, paymentMethod) => {
    const currentStock = get().stock[branch].find((s) => s.itemName === itemName);
    if (!currentStock) return 'Item not found in stock';
    if (currentStock.quantity < qty) return 'Insufficient stock';

    const newQty = Math.round((currentStock.quantity - qty) * 1000) / 1000;

    const { error: stockErr, count } = await supabase
      .from('branch_stock')
      .update({ quantity: newQty })
      .eq('branch', branch)
      .eq('item_name', itemName)
      .select();

    if (stockErr) return `Failed to update stock: ${stockErr.message}`;
    if (count === 0) return 'Stock row not found — please refresh and try again';

    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:      itemName,
        quantity_sold:  qty,
        sold_at:        new Date().toISOString(),
        sold_by:        soldBy,
        payment_method: paymentMethod,
      })
      .select().single();
    if (saleErr) return `Failed to record sale: ${saleErr.message}`;

    const newSale: SaleRecord = {
      id:            saleData.id,
      itemName:      saleData.item_name,
      quantitySold:  saleData.quantity_sold,
      soldAt:        saleData.sold_at,
      soldBy:        saleData.sold_by,
      branch,
      paymentMethod: saleData.payment_method ?? null,
    };

    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      stock[branch] = stock[branch].map((si) =>
        si.itemName === itemName ? { ...si, quantity: newQty } : si,
      );
      sales[branch] = [newSale, ...sales[branch]];
      return { stock, sales };
    });

    return null;
  },

  updateThreshold: async (branch, itemName, threshold) => {
    await supabase.from('branch_thresholds').upsert({ branch, item_name: itemName, threshold });
    await supabase.from('branch_stock').update({ min_threshold: threshold })
      .eq('branch', branch).eq('item_name', itemName);
    set((s) => {
      const thresholds = { ...s.thresholds };
      thresholds[branch] = { ...thresholds[branch], [itemName]: threshold };
      const stock = { ...s.stock };
      stock[branch] = stock[branch].map((si) =>
        si.itemName === itemName ? { ...si, minThreshold: threshold } : si,
      );
      return { thresholds, stock };
    });
  },

  syncIncomingFromDispatches: async (branch) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: orders } = await supabase
      .from('bakery_orders')
      .select('id, dispatch_log')
      .not('dispatch_log', 'is', null)
      .gte('created_at', sixMonthsAgo.toISOString());

    if (!orders) return;

    const { data: existingIncoming } = await supabase
      .from('branch_incoming')
      .select('dispatch_id')
      .eq('branch', branch);
    const existingDispatchIds = new Set(
      (existingIncoming || []).map((d) => d.dispatch_id).filter(Boolean),
    );

    const newEntries: {
      dispatch_id: string; item_name: string; quantity: number;
      received_at: string; dispatched_by: string; branch: Branch; confirmed: boolean;
    }[] = [];

    for (const order of orders) {
      const log = (order.dispatch_log || []) as {
        id: string; itemName: string; quantity: number;
        branch: Branch; dispatchedAt: string; dispatchedBy: string;
      }[];
      log
        .filter((e) => e.branch === branch && !existingDispatchIds.has(e.id))
        .forEach((e) =>
          newEntries.push({
            dispatch_id:   e.id,
            item_name:     e.itemName,
            quantity:      parseFloat(String(e.quantity)),
            received_at:   e.dispatchedAt,
            dispatched_by: e.dispatchedBy,
            branch,
            confirmed:     false,
          }),
        );
    }

    if (newEntries.length === 0) return;

    await supabase
      .from('branch_incoming')
      .upsert(newEntries, { onConflict: 'dispatch_id', ignoreDuplicates: true });

    await get().fetchBranchData(branch);
  },

  // FIX: confirmIncoming now uses 2 DB calls instead of 3 (removed the read-then-write
  // pattern for branch_stock — we use Postgres arithmetic to avoid a race condition).
  confirmIncoming: async (branch, incomingId) => {
    const inc = get().incoming[branch].find((i) => i.id === incomingId);
    if (!inc) return 'Item not found';
    if (inc.confirmed) return null;

    const qty = parseFloat(String(inc.quantity));

    // 1. Mark confirmed + update stock in parallel — avoids sequential round trips.
    //    branch_stock uses Postgres expression update (quantity + qty) to be race-safe.
    const [{ error: confErr }, { error: stockErr }] = await Promise.all([
      supabase.from('branch_incoming').update({ confirmed: true }).eq('id', incomingId),
      supabase.rpc('increment_branch_stock', {
        p_branch:    branch,
        p_item_name: inc.itemName,
        p_qty:       qty,
      }),
    ]);

    if (confErr) return `Failed to confirm: ${confErr.message}`;
    if (stockErr) return `Failed to update stock: ${stockErr.message}`;

    // 2. Update local state immediately (no extra fetch needed)
    set((s) => {
      const incoming = { ...s.incoming };
      incoming[branch] = incoming[branch].map((i) =>
        i.id === incomingId ? { ...i, confirmed: true } : i
      );
      const stock = { ...s.stock };
      const si = stock[branch].find((x) => x.itemName === inc.itemName);
      if (si) {
        stock[branch] = stock[branch].map((x) =>
          x.itemName === inc.itemName
            ? { ...x, quantity: Math.round((x.quantity + qty) * 1000) / 1000 }
            : x
        );
      } else {
        stock[branch] = [...stock[branch], {
          itemName: inc.itemName, quantity: qty, minThreshold: 10, price: null,
        }];
      }
      return { incoming, stock };
    });
    return null;
  },

  // FIX: confirmAllIncoming now runs all confirms in parallel instead of a sequential loop.
  confirmAllIncoming: async (branch) => {
    const today = new Date().toDateString();
    const toConfirm = get().incoming[branch].filter(
      (i) => !i.confirmed && new Date(i.receivedAt).toDateString() === today
    );
    if (toConfirm.length === 0) return null;

    const results = await Promise.all(
      toConfirm.map((inc) => get().confirmIncoming(branch, inc.id))
    );
    const firstErr = results.find((r) => r !== null);
    return firstErr ?? null;
  },

  // FIX: seedBranchItems only runs once per session per branch.
  // Previously ran on every page mount, firing 21 upsert batches in 3 minutes.
  seedBranchItems: async (branch) => {
    if (get().seededBranches.has(branch)) return;

    const rows = BAKERY_ITEMS.map(item => ({
      branch,
      item_name:     item.name,
      quantity:      0,
      min_threshold: 10,
    }));
    for (let i = 0; i < rows.length; i += 50) {
      await supabase
        .from('branch_stock')
        .upsert(rows.slice(i, i + 50), {
          onConflict:       'branch,item_name',
          ignoreDuplicates: true,
        });
    }
    set((s) => ({
      seededBranches: new Set([...s.seededBranches, branch]),
    }));
    await get().fetchBranchData(branch);
  },

  cleanOldData: async () => {
    const { lastCleanedAt } = get();
    const now = Date.now();
    if (lastCleanedAt && now - lastCleanedAt < 60 * 60 * 1000) return;

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await supabase.from('branch_sales').delete().lt('sold_at', twoMonthsAgo.toISOString());

    set({ lastCleanedAt: now });
  },
}));
