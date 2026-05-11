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
  paymentMethod: string | null;
}

export interface BranchAdvanceItem {
  itemName: string;
  quantity: number;
  sellUnit: 'kg' | 'pcs';
  price: number;
  lineTotal: number;
  isCustom?: boolean;
}

export interface BranchAdvanceOrder {
  id: string;
  branch: Branch;
  customerName: string | null;
  items: BranchAdvanceItem[];
  subtotal: number;
  advanceAmount: number;
  advanceMethod: string;
  balanceDue: number;
  soldBy: string;
  createdAt: string;
  fullyPaidAt: string | null;
  balanceMethod: string | null;
  status: 'pending' | 'completed';
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
  advanceOrders: Record<Branch, BranchAdvanceOrder[]>;
  thresholds: Record<Branch, Record<string, number>>;
  loading: boolean;
  lastCleanedAt: number | null;
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string) => Promise<string | null>;
  recordAdvanceOrder: (branch: Branch, order: Omit<BranchAdvanceOrder, 'id' | 'createdAt' | 'fullyPaidAt' | 'balanceMethod' | 'status'>) => Promise<string | null>;
  collectAdvanceBalance: (branch: Branch, orderId: string, balanceMethod: string) => Promise<string | null>;
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
  advanceOrders:  { VRSNB: [], SNB: [], Hosur: [] },
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
        { data: priceData },
        { data: advanceData },
      ] = await Promise.all([
        supabase.from('branch_stock').select('*').eq('branch', branch),
        supabase.from('branch_sales').select('*').eq('branch', branch)
          .gte('sold_at', twoMonthsAgo.toISOString())
          .order('sold_at', { ascending: false }),
        supabase.from('branch_incoming').select('*').eq('branch', branch)
          .order('received_at', { ascending: false }),
        supabase.from('branch_thresholds').select('*').eq('branch', branch),
        supabase.from('bakery_items').select('name, price'),
        supabase.from('branch_advance_orders').select('*')
          .eq('branch', branch)
          .order('created_at', { ascending: false }),
      ]);

      // Build a name → price lookup from bakery_items
      const priceMap: Record<string, number | null> = {};
      (priceData || []).forEach((d) => {
        priceMap[d.name] = d.price != null ? Number(d.price) : null;
      });

      set((s) => {
        const stock         = { ...s.stock };
        const sales         = { ...s.sales };
        const incoming      = { ...s.incoming };
        const thresholds    = { ...s.thresholds };
        const advanceOrders = { ...s.advanceOrders };

        stock[branch] = (stockData || []).map((d) => ({
          itemName:     d.item_name,
          quantity:     d.quantity,
          minThreshold: d.min_threshold ?? 10,
          price:        priceMap[d.item_name] ?? null,
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

        advanceOrders[branch] = (advanceData || []).map((d) => ({
          id:             d.id,
          branch:         d.branch as Branch,
          customerName:   d.customer_name ?? null,
          items:          (d.items || []) as BranchAdvanceItem[],
          subtotal:       Number(d.subtotal),
          advanceAmount:  Number(d.advance_amount),
          advanceMethod:  d.advance_method,
          balanceDue:     Number(d.balance_due),
          soldBy:         d.sold_by,
          createdAt:      d.created_at,
          fullyPaidAt:    d.fully_paid_at ?? null,
          balanceMethod:  d.balance_method ?? null,
          status:         d.status as 'pending' | 'completed',
        }));

        const tMap: Record<string, number> = {};
        (thresholdData || []).forEach((d) => { tMap[d.item_name] = d.threshold; });
        thresholds[branch] = tMap;

        return { stock, sales, incoming, thresholds, advanceOrders };
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

  // ── Record an advance order — NO stock deduction yet ──────────────────────
  recordAdvanceOrder: async (branch, order) => {
    const now = new Date().toISOString();
    const balanceDue = Math.max(0, order.subtotal - order.advanceAmount);

    const { data, error } = await supabase
      .from('branch_advance_orders')
      .insert({
        branch,
        customer_name:  order.customerName ?? null,
        items:          order.items,
        subtotal:       order.subtotal,
        advance_amount: order.advanceAmount,
        advance_method: order.advanceMethod,
        balance_due:    balanceDue,
        sold_by:        order.soldBy,
        created_at:     now,
        status:         'pending',
      })
      .select()
      .single();

    if (error) return `Failed to save advance order: ${error.message}`;

    const newOrder: BranchAdvanceOrder = {
      id:            data.id,
      branch,
      customerName:  order.customerName ?? null,
      items:         order.items,
      subtotal:      order.subtotal,
      advanceAmount: order.advanceAmount,
      advanceMethod: order.advanceMethod,
      balanceDue,
      soldBy:        order.soldBy,
      createdAt:     now,
      fullyPaidAt:   null,
      balanceMethod: null,
      status:        'pending',
    };

    set((s) => {
      const advanceOrders = { ...s.advanceOrders };
      advanceOrders[branch] = [newOrder, ...advanceOrders[branch]];
      return { advanceOrders };
    });

    return null;
  },

  // ── Collect remaining balance — NOW deduct stock and record sales ──────────
  collectAdvanceBalance: async (branch, orderId, balanceMethod) => {
    const order = get().advanceOrders[branch].find((o) => o.id === orderId);
    if (!order) return 'Advance order not found';
    if (order.status === 'completed') return null;

    const now = new Date().toISOString();

    // 1. Check stock is sufficient for all non-custom items
    for (const item of order.items) {
      if (item.isCustom) continue;
      const stock = get().stock[branch].find((s) => s.itemName === item.itemName);
      if (!stock) return `"${item.itemName}" not found in stock`;
      if (stock.quantity < item.quantity)
        return `Insufficient stock for "${item.itemName}" (have ${stock.quantity}, need ${item.quantity})`;
    }

    // 2. Mark advance order completed in DB (single atomic update)
    const { error: updateErr } = await supabase
      .from('branch_advance_orders')
      .update({ status: 'completed', fully_paid_at: now, balance_method: balanceMethod, balance_due: 0 })
      .eq('id', orderId);
    if (updateErr) return `Failed to complete order: ${updateErr.message}`;

    // 3. Deduct stock and insert sale records for each non-custom item
    for (const item of order.items) {
      if (item.isCustom) continue;

      const stock = get().stock[branch].find((s) => s.itemName === item.itemName);
      if (!stock) continue;
      const newQty = Math.round((stock.quantity - item.quantity) * 1000) / 1000;

      await supabase.from('branch_stock')
        .update({ quantity: newQty })
        .eq('branch', branch).eq('item_name', item.itemName);

      await supabase.from('branch_sales').insert({
        branch,
        item_name:      item.itemName,
        quantity_sold:  item.quantity,
        sold_at:        now,
        sold_by:        order.soldBy,
        payment_method: `advance+${balanceMethod}`,
      });
    }

    // 4. Update local state
    set((s) => {
      const advanceOrders = { ...s.advanceOrders };
      advanceOrders[branch] = advanceOrders[branch].map((o) =>
        o.id === orderId
          ? { ...o, status: 'completed', fullyPaidAt: now, balanceMethod, balanceDue: 0 }
          : o
      );

      const stock = { ...s.stock };
      const sales = { ...s.sales };

      for (const item of order.items) {
        if (item.isCustom) continue;
        stock[branch] = stock[branch].map((si) =>
          si.itemName === item.itemName
            ? { ...si, quantity: Math.round((si.quantity - item.quantity) * 1000) / 1000 }
            : si
        );
        sales[branch] = [
          {
            id:            `local-${Date.now()}-${Math.random()}`,
            itemName:      item.itemName,
            quantitySold:  item.quantity,
            soldAt:        now,
            soldBy:        order.soldBy,
            branch,
            paymentMethod: `advance+${balanceMethod}`,
          },
          ...sales[branch],
        ];
      }

      return { advanceOrders, stock, sales };
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

    // Insert incoming records as unconfirmed — branch must confirm before stock is updated
    await supabase
      .from('branch_incoming')
      .upsert(newEntries, { onConflict: 'dispatch_id', ignoreDuplicates: true });

    await get().fetchBranchData(branch);
  },

  // Confirm a single incoming item — adds to stock and marks confirmed
  confirmIncoming: async (branch, incomingId) => {
    const inc = get().incoming[branch].find((i) => i.id === incomingId);
    if (!inc) return 'Item not found';
    if (inc.confirmed) return null;

    // Mark confirmed in DB
    const { error: confErr } = await supabase
      .from('branch_incoming')
      .update({ confirmed: true })
      .eq('id', incomingId);
    if (confErr) return `Failed to confirm: ${confErr.message}`;

    // Add quantity to branch_stock
    const { data: existing } = await supabase
      .from('branch_stock')
      .select('quantity')
      .eq('branch', branch)
      .eq('item_name', inc.itemName)
      .single();

    if (existing) {
      const newQty = Math.round((existing.quantity + inc.quantity) * 1000) / 1000;
      await supabase.from('branch_stock')
        .update({ quantity: newQty })
        .eq('branch', branch).eq('item_name', inc.itemName);
    } else {
      await supabase.from('branch_stock')
        .insert({ branch, item_name: inc.itemName, quantity: inc.quantity, min_threshold: 10 });
    }

    // Update local state
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
            ? { ...x, quantity: Math.round((x.quantity + inc.quantity) * 1000) / 1000 }
            : x
        );
      } else {
        stock[branch] = [...stock[branch], {
          itemName: inc.itemName, quantity: inc.quantity, minThreshold: 10, price: null,
        }];
      }
      return { incoming, stock };
    });
    return null;
  },

  // Confirm all today's unconfirmed incoming items at once
  confirmAllIncoming: async (branch) => {
    const today = new Date().toDateString();
    const toConfirm = get().incoming[branch].filter(
      (i) => !i.confirmed && new Date(i.receivedAt).toDateString() === today
    );
    if (toConfirm.length === 0) return null;

    for (const inc of toConfirm) {
      const err = await get().confirmIncoming(branch, inc.id);
      if (err) return err;
    }
    return null;
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
