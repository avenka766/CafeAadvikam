// src/branch/branchStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';
import { BAKERY_ITEMS } from '@/bakery/types';

export interface StockItem {
  itemName: string;
  quantity: number;
  minThreshold: number;
  price: number | null; // FIX #3 — added price field so BillTab can display/use it
}

export interface SaleRecord {
  id: string;
  itemName: string;
  quantitySold: number;
  soldAt: string;
  soldBy: string;
  branch: Branch;
  paymentMethod: string | null; // FIX #9 — store payment method
}

export interface IncomingStock {
  id: string;
  itemName: string;
  quantity: number;
  receivedAt: string;
  dispatchedBy: string;
}

interface BranchState {
  stock: Record<Branch, StockItem[]>;
  sales: Record<Branch, SaleRecord[]>;
  incoming: Record<Branch, IncomingStock[]>;
  thresholds: Record<Branch, Record<string, number>>;
  loading: boolean;
  lastCleanedAt: number | null; // FIX #6 — track last clean so it only runs once per session
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string) => Promise<string | null>;
  updateThreshold: (branch: Branch, itemName: string, threshold: number) => Promise<void>;
  syncIncomingFromDispatches: (branch: Branch) => Promise<void>;
  cleanOldData: () => Promise<void>;
  seedBranchItems: (branch: Branch) => Promise<void>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:          { VRSNB: [], SNB: [], Hosur: [] },
  sales:          { VRSNB: [], SNB: [], Hosur: [] },
  incoming:       { VRSNB: [], SNB: [], Hosur: [] },
  thresholds:     { VRSNB: {}, SNB: {}, Hosur: {} },
  loading:        false,
  lastCleanedAt:  null,

  fetchBranchData: async (branch) => {
    set({ loading: true });
    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const [
        { data: stockData },
        { data: salesData },
        { data: incomingData },
        { data: thresholdData },
        { data: priceData },   // FIX #3 — fetch prices from bakery_items
      ] = await Promise.all([
        supabase.from('branch_stock').select('*').eq('branch', branch),
        supabase.from('branch_sales').select('*').eq('branch', branch)
          .gte('sold_at', twoMonthsAgo.toISOString())
          .order('sold_at', { ascending: false }),
        supabase.from('branch_incoming').select('*').eq('branch', branch)
          .order('received_at', { ascending: false }),
        supabase.from('branch_thresholds').select('*').eq('branch', branch),
        supabase.from('bakery_items').select('name, price'),
      ]);

      // Build a name → price lookup from bakery_items
      const priceMap: Record<string, number | null> = {};
      (priceData || []).forEach((d) => {
        priceMap[d.name] = d.price != null ? Number(d.price) : null;
      });

      set((s) => {
        const stock      = { ...s.stock };
        const sales      = { ...s.sales };
        const incoming   = { ...s.incoming };
        const thresholds = { ...s.thresholds };

        stock[branch] = (stockData || []).map((d) => ({
          itemName:     d.item_name,
          quantity:     d.quantity,
          minThreshold: d.min_threshold ?? 10,
          price:        priceMap[d.item_name] ?? null, // FIX #3
        }));

        sales[branch] = (salesData || []).map((d) => ({
          id:            d.id,
          itemName:      d.item_name,
          quantitySold:  d.quantity_sold,
          soldAt:        d.sold_at,
          soldBy:        d.sold_by,
          branch:        d.branch as Branch,
          paymentMethod: d.payment_method ?? null, // FIX #9
        }));

        incoming[branch] = (incomingData || []).map((d) => ({
          id:            d.id,
          itemName:      d.item_name,
          quantity:      d.quantity,
          receivedAt:    d.received_at,
          dispatchedBy:  d.dispatched_by,
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

  // FIX #1 — removed double stock deduction from local state update
  // FIX #9 — accept and store paymentMethod
  recordSale: async (branch, itemName, qty, soldBy, paymentMethod) => {
    const currentStock = get().stock[branch].find((s) => s.itemName === itemName);
    if (!currentStock) return 'Item not found in stock';
    if (currentStock.quantity < qty) return 'Insufficient stock';

    // Round to 3 decimal places to avoid floating-point artifacts (e.g. 4.999999999)
    const newQty = Math.round((currentStock.quantity - qty) * 1000) / 1000;

    const { error: stockErr, count } = await supabase
      .from('branch_stock')
      .update({ quantity: newQty })
      .eq('branch', branch)
      .eq('item_name', itemName)
      .select(); // .select() makes Supabase return affected rows so we can detect 0-row updates

    if (stockErr) {
      console.error('[recordSale] stock update error:', stockErr);
      // Surface the real DB error so you can diagnose it
      return `Failed to update stock: ${stockErr.message}`;
    }
    // Guard: if no row was matched (item_name mismatch / row missing), fail loudly
    if (count === 0) {
      console.error('[recordSale] stock row not found for', itemName, 'in', branch);
      return 'Stock row not found — please refresh and try again';
    }

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
    if (saleErr) {
      console.error('[recordSale] sale insert error:', saleErr);
      return `Failed to record sale: ${saleErr.message}`;
    }

    const newSale: SaleRecord = {
      id:            saleData.id,
      itemName:      saleData.item_name,
      quantitySold:  saleData.quantity_sold,
      soldAt:        saleData.sold_at,
      soldBy:        saleData.sold_by,
      branch,
      paymentMethod: saleData.payment_method ?? null, // FIX #9
    };

    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      // FIX #1 — use pre-computed newQty instead of subtracting again
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

    // FIXED: use dispatch_id column (the dispatch_log entry id) as the dedup key.
    // The old code used branch_incoming.id which is auto-generated by Supabase,
    // so it never matched e.id from the dispatch_log — every 30s poll re-added stock.
    const { data: existingIncoming } = await supabase
      .from('branch_incoming')
      .select('dispatch_id')
      .eq('branch', branch);
    const existingDispatchIds = new Set(
      (existingIncoming || []).map((d) => d.dispatch_id).filter(Boolean),
    );

    const newEntries: {
      dispatch_id: string; item_name: string; quantity: number;
      received_at: string; dispatched_by: string; branch: Branch;
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
            quantity:      e.quantity,
            received_at:   e.dispatchedAt,
            dispatched_by: e.dispatchedBy,
            branch,
          }),
        );
    }

    if (newEntries.length === 0) return;

    // Upsert with conflict on dispatch_id — if two calls race, only one wins.
    // ignoreDuplicates means only truly new rows are returned in data.
    const { data: insertedEntries } = await supabase
      .from('branch_incoming')
      .upsert(newEntries, { onConflict: 'dispatch_id', ignoreDuplicates: true })
      .select();

    // Only update stock for rows actually inserted this call — never for duplicates.
    const trulyNew = insertedEntries || [];
    if (trulyNew.length === 0) return;

    for (const entry of trulyNew) {
      const { data: existing } = await supabase
        .from('branch_stock').select('quantity')
        .eq('branch', branch).eq('item_name', entry.item_name).single();
      if (existing) {
        await supabase.from('branch_stock')
          .update({ quantity: existing.quantity + entry.quantity })
          .eq('branch', branch).eq('item_name', entry.item_name);
      } else {
        await supabase.from('branch_stock')
          .insert({ branch, item_name: entry.item_name, quantity: entry.quantity, min_threshold: 10 });
      }
    }
    await get().fetchBranchData(branch);
  },

  seedBranchItems: async (branch) => {
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
    await get().fetchBranchData(branch);
  },

  // FIX #6 — only run cleanOldData once per session using lastCleanedAt guard
  cleanOldData: async () => {
    const { lastCleanedAt } = get();
    const now = Date.now();
    // Skip if already cleaned within the last hour
    if (lastCleanedAt && now - lastCleanedAt < 60 * 60 * 1000) return;

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await supabase.from('branch_sales').delete().lt('sold_at', twoMonthsAgo.toISOString());

    set({ lastCleanedAt: now });
  },
}));
