// src/branch/branchStore.ts  ← NEW FILE
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';

export interface StockItem {
  itemName: string;
  quantity: number;
  minThreshold: number;
}

export interface SaleRecord {
  id: string;
  itemName: string;
  quantitySold: number;
  soldAt: string;
  soldBy: string;
  branch: Branch;
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
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string) => Promise<string | null>;
  updateThreshold: (branch: Branch, itemName: string, threshold: number) => Promise<void>;
  syncIncomingFromDispatches: (branch: Branch) => Promise<void>;
  cleanOldData: () => Promise<void>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:      { VRSNB: [], SNB: [], Hosur: [] },
  sales:      { VRSNB: [], SNB: [], Hosur: [] },
  incoming:   { VRSNB: [], SNB: [], Hosur: [] },
  thresholds: { VRSNB: {}, SNB: {}, Hosur: {} },
  loading: false,

  fetchBranchData: async (branch) => {
    set({ loading: true });
    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const [{ data: stockData }, { data: salesData }, { data: incomingData }, { data: thresholdData }] =
        await Promise.all([
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

        stock[branch] = (stockData || []).map((d) => ({
          itemName:     d.item_name,
          quantity:     d.quantity,
          minThreshold: d.min_threshold ?? 10,
        }));
        sales[branch] = (salesData || []).map((d) => ({
          id:           d.id,
          itemName:     d.item_name,
          quantitySold: d.quantity_sold,
          soldAt:       d.sold_at,
          soldBy:       d.sold_by,
          branch:       d.branch as Branch,
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

  recordSale: async (branch, itemName, qty, soldBy) => {
    const currentStock = get().stock[branch].find((s) => s.itemName === itemName);
    if (!currentStock || currentStock.quantity < qty) return 'Insufficient stock';

    const { error: stockErr } = await supabase
      .from('branch_stock')
      .update({ quantity: currentStock.quantity - qty })
      .eq('branch', branch).eq('item_name', itemName);
    if (stockErr) return 'Failed to update stock';

    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:     itemName,
        quantity_sold: qty,
        sold_at:       new Date().toISOString(),
        sold_by:       soldBy,
      })
      .select().single();
    if (saleErr) return 'Failed to record sale';

    const newSale: SaleRecord = {
      id:           saleData.id,
      itemName:     saleData.item_name,
      quantitySold: saleData.quantity_sold,
      soldAt:       saleData.sold_at,
      soldBy:       saleData.sold_by,
      branch,
    };

    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      stock[branch] = stock[branch].map((si) =>
        si.itemName === itemName ? { ...si, quantity: si.quantity - qty } : si,
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
    const { data: orders } = await supabase
      .from('bakery_orders').select('id, dispatch_log').not('dispatch_log', 'is', null);
    if (!orders) return;

    const { data: existingIncoming } = await supabase
      .from('branch_incoming').select('id').eq('branch', branch);
    const existingIds = new Set((existingIncoming || []).map((d) => d.id));

    const newEntries: {
      id: string; item_name: string; quantity: number;
      received_at: string; dispatched_by: string; branch: Branch;
    }[] = [];

    for (const order of orders) {
      const log = (order.dispatch_log || []) as {
        id: string; itemName: string; quantity: number;
        branch: Branch; dispatchedAt: string; dispatchedBy: string;
      }[];
      log
        .filter((e) => e.branch === branch && !existingIds.has(e.id))
        .forEach((e) =>
          newEntries.push({
            id:            e.id,
            item_name:     e.itemName,
            quantity:      e.quantity,
            received_at:   e.dispatchedAt,
            dispatched_by: e.dispatchedBy,
            branch,
          }),
        );
    }

    if (newEntries.length === 0) return;
    await supabase.from('branch_incoming').insert(newEntries);

    for (const entry of newEntries) {
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

  cleanOldData: async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await supabase.from('branch_sales').delete().lt('sold_at', twoMonthsAgo.toISOString());
  },
}));
