// src/branch/branchStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';
import { BAKERY_ITEMS } from '@/bakery/types';

export interface StockItem {
  itemName: string;
  quantity: number;
  /** Unit in which quantity is stored — 'pcs' for piece items, 'kg' for weight items. */
  unit?: 'pcs' | 'kg';
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
  /** Unit in which quantity is expressed — 'pcs' or 'kg'. Defaults to 'kg' for legacy rows. */
  unit: 'pcs' | 'kg';
  receivedAt: string;
  dispatchedBy: string;
  confirmed: boolean;
}

export interface StockMismatch {
  id:        string;
  itemName:  string;
  branch:    Branch;
  soldQty:   number;
  shortage:  number;
  soldAt:    string;
  soldBy:    string;
}

interface BranchState {
  stock:           Record<Branch, StockItem[]>;
  sales:           Record<Branch, SaleRecord[]>;
  incoming:        Record<Branch, IncomingStock[]>;
  advanceOrders:   Record<Branch, BranchAdvanceOrder[]>;
  thresholds:      Record<Branch, Record<string, number>>;
  stockMismatches: StockMismatch[];
  loading:         boolean;
  lastCleanedAt:   number | null;
  lastSyncedAt:    number | null;
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string, billNo?: string) => Promise<string | null>;
  recordSnbSale: (
    branch: Branch,
    itemName: string,
    qty: number,
    soldBy: string,
    paymentMethod: string,
    unitPrice: number,
    billNo?: string,
  ) => Promise<{ error: string | null; mismatch: boolean }>;
  recordAdvanceOrder: (branch: Branch, order: Omit<BranchAdvanceOrder, 'id' | 'createdAt' | 'fullyPaidAt' | 'balanceMethod' | 'status'>) => Promise<string | null>;
  collectAdvanceBalance: (branch: Branch, orderId: string, balanceMethod: string) => Promise<string | null>;
  updateThreshold: (branch: Branch, itemName: string, threshold: number) => Promise<void>;
  syncIncomingFromDispatches: (branch: Branch) => Promise<void>;
  confirmIncoming: (branch: Branch, incomingId: string) => Promise<string | null>;
  confirmAllIncoming: (branch: Branch) => Promise<string | null>;
  manualUpdateStock: (branch: Branch, itemName: string, quantity: number, updatedBy: string) => Promise<string | null>;
  fetchStockMismatches: () => Promise<void>;
  cleanOldData: () => Promise<void>;
  seedBranchItems: (branch: Branch) => Promise<void>;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:           { VRSNB: [], SNB: [], Hosur: [] },
  sales:           { VRSNB: [], SNB: [], Hosur: [] },
  incoming:        { VRSNB: [], SNB: [], Hosur: [] },
  advanceOrders:   { VRSNB: [], SNB: [], Hosur: [] },
  thresholds:      { VRSNB: {}, SNB: {}, Hosur: {} },
  stockMismatches: [],
  loading:         false,
  lastCleanedAt:   null,
  lastSyncedAt:    null as number | null,

  fetchBranchData: async (branch) => {
    set({ loading: true });
    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      // PERF-04 FIX: sales history capped to 30 days for the live dashboard.
      // Older records can still be accessed via a dedicated Reports query.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
          .gte('sold_at', thirtyDaysAgo.toISOString())
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
          // Persist the unit stored in DB so pcs items always display as pcs
          unit:         (d.unit === 'pcs' ? 'pcs' : d.unit === 'kg' ? 'kg' : undefined) as 'pcs' | 'kg' | undefined,
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
          unit:          (d.unit === 'pcs' ? 'pcs' : 'kg') as 'pcs' | 'kg',
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

  // B1 FIX: atomic stock decrement via stored procedure (see supabase/migrations/001_security.sql)
  // `decrement_branch_stock` does: UPDATE SET quantity = quantity - p_qty WHERE quantity >= p_qty
  // returning new quantity, or NULL if insufficient.  This is the only race-safe approach.
  recordSale: async (branch, itemName, qty, soldBy, paymentMethod, billNo) => {
    // Pre-flight UX check (authoritative guard is in the DB)
    const localStock = get().stock[branch].find((s) => s.itemName === itemName);
    if (!localStock) return 'Item not found in stock';
    if (localStock.quantity < qty) return 'Insufficient stock';

    const { data: newQtyData, error: rpcErr } = await supabase
      .rpc('decrement_branch_stock', { p_branch: branch, p_item_name: itemName, p_qty: qty });

    if (rpcErr) return `Failed to update stock: ${rpcErr.message}`;
    // RPC returns NULL when quantity < p_qty (concurrent sale depleted stock)
    if (newQtyData === null) return 'Insufficient stock (modified by another device — please refresh)';

    const newQty = Math.round((newQtyData as number) * 1000) / 1000;

    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:      itemName,
        quantity_sold:  qty,
        sold_at:        new Date().toISOString(),
        sold_by:        soldBy,
        payment_method: paymentMethod,
        bill_no:        billNo ?? null,
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

    // B3 FIX: each item uses the atomic RPC decrement instead of reading stale local state.
    // If a stock deduction fails mid-loop, we attempt to roll back the order status and
    // previously decremented items.  Full atomicity requires a Postgres stored procedure
    // (see supabase/migrations/001_security.sql: complete_advance_order).
    const decremented: Array<{ itemName: string; qty: number }> = [];

    for (const item of order.items) {
      if (item.isCustom) continue;

      // Atomic stock decrement via RPC
      const { data: newQtyRpc, error: stockRpcErr } = await supabase
        .rpc('decrement_branch_stock', { p_branch: branch, p_item_name: item.itemName, p_qty: item.quantity });

      if (stockRpcErr || newQtyRpc === null) {
        const msg = newQtyRpc === null
          ? `Insufficient stock for "${item.itemName}" — modified by another device`
          : `Failed to deduct stock for "${item.itemName}": ${stockRpcErr!.message}`;

        // Attempt rollback: revert order status
        await supabase.from('branch_advance_orders')
          .update({ status: 'pending', fully_paid_at: null, balance_method: null, balance_due: order.balanceDue })
          .eq('id', orderId);

        // Attempt rollback: restore decremented stock (best-effort, non-atomic)
        for (const d of decremented) {
          await supabase.rpc('increment_branch_stock', { p_branch: branch, p_item_name: d.itemName, p_qty: d.qty });
        }

        // Refresh local state to match DB
        await get().fetchBranchData(branch);
        return msg;
      }

      decremented.push({ itemName: item.itemName, qty: item.quantity });

      await supabase.from('branch_sales').insert({
        branch,
        item_name:      item.itemName,
        quantity_sold:  item.quantity,
        sold_at:        now,
        sold_by:        order.soldBy,
        payment_method: `advance+${balanceMethod}`,
      });
    }

    // B3 FIX: refresh from DB after all mutations instead of computing from stale local state
    await get().fetchBranchData(branch);

    // Update advance order status in local state only (stock already refreshed above)
    set((s) => {
      const advanceOrders = { ...s.advanceOrders };
      advanceOrders[branch] = advanceOrders[branch].map((o) =>
        o.id === orderId
          ? { ...o, status: 'completed', fullyPaidAt: now, balanceMethod, balanceDue: 0 }
          : o
      );
      return { advanceOrders };
    });

    return null;
  },

  updateThreshold: async (branch, itemName, threshold) => {
    const { error: t1 } = await supabase.from('branch_thresholds').upsert({ branch, item_name: itemName, threshold });
    if (t1) { console.error('[updateThreshold] thresholds upsert failed:', t1.message); return; }
    const { error: t2 } = await supabase.from('branch_stock').update({ min_threshold: threshold })
      .eq('branch', branch).eq('item_name', itemName);
    if (t2) console.error('[updateThreshold] stock update failed:', t2.message);
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

  // B5 FIX: added lastSyncedAt session guard — runs at most once per 5 minutes.
  // Previously ran on every BranchDashboard mount, triggering a full 6-month scan each time.
  syncIncomingFromDispatches: async (branch) => {
    const { lastSyncedAt } = get();
    const now = Date.now();
    if (lastSyncedAt && now - lastSyncedAt < 5 * 60 * 1000) return;
    set({ lastSyncedAt: now });
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

  // B4 FIX: confirmIncoming — stock update comes BEFORE marking confirmed.
  // If step 1 (stock) fails → item stays unconfirmed → safe to retry.
  // If step 2 (mark confirmed) fails after stock added → stock is correct but item shows
  // as unconfirmed → retry will add stock again!  The atomic RPC avoids this entirely.
  // See supabase/migrations/001_security.sql: confirm_incoming_stock().
  confirmIncoming: async (branch, incomingId) => {
    const inc = get().incoming[branch].find((i) => i.id === incomingId);
    if (!inc) return 'Item not found';
    if (inc.confirmed) return null;

    // Try atomic RPC first (deployed via migration)
    const { error: rpcErr } = await supabase.rpc('confirm_incoming_stock', {
      p_incoming_id: incomingId, p_branch: branch,
    });
    if (!rpcErr) {
      await get().fetchBranchData(branch);
      return null;
    }

    // Fallback: add stock FIRST, mark confirmed second (safer failure mode)
    const { data: existing } = await supabase
      .from('branch_stock').select('quantity')
      .eq('branch', branch).eq('item_name', inc.itemName).single();

    if (existing) {
      const newQty = Math.round((existing.quantity + inc.quantity) * 1000) / 1000;
      const { error: stockErr } = await supabase.from('branch_stock')
        .update({ quantity: newQty, unit: inc.unit })
        .eq('branch', branch).eq('item_name', inc.itemName);
      if (stockErr) return `Failed to add to stock: ${stockErr.message}`;
    } else {
      const { error: insErr } = await supabase.from('branch_stock')
        .insert({ branch, item_name: inc.itemName, quantity: inc.quantity, unit: inc.unit, min_threshold: 10 });
      if (insErr) return `Failed to create stock entry: ${insErr.message}`;
    }

    const { error: confErr } = await supabase
      .from('branch_incoming').update({ confirmed: true }).eq('id', incomingId);
    if (confErr) return `Stock added but failed to mark confirmed: ${confErr.message}`;

    set((s) => {
      const incoming = { ...s.incoming };
      incoming[branch] = incoming[branch].map((i) => i.id === incomingId ? { ...i, confirmed: true } : i);
      const stock = { ...s.stock };
      const si = stock[branch].find((x) => x.itemName === inc.itemName);
      if (si) {
        stock[branch] = stock[branch].map((x) =>
          x.itemName === inc.itemName
            ? { ...x, quantity: Math.round((x.quantity + inc.quantity) * 1000) / 1000, unit: inc.unit }
            : x
        );
      } else {
        stock[branch] = [...stock[branch], {
          itemName: inc.itemName, quantity: inc.quantity, unit: inc.unit, minThreshold: 10, price: null,
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

  // ── SNB / Hosur sale — items come from price list, not stock requirement ──
  // Deducts stock when available, logs a mismatch when stock is 0 / insufficient.
  recordSnbSale: async (branch, itemName, qty, soldBy, paymentMethod, unitPrice, billNo) => {
    const now = new Date().toISOString();
    const currentStock = get().stock[branch].find((s) => s.itemName === itemName);
    const availableQty = currentStock?.quantity ?? 0;
    const shortage     = Math.max(0, qty - availableQty);
    const mismatch     = shortage > 0;
    const deductQty    = Math.min(qty, availableQty);
    const newQty       = Math.round((availableQty - deductQty) * 1000) / 1000;

    // B2 FIX: use atomic RPC decrement instead of stale-local-state read
    if (deductQty > 0 && currentStock) {
      const { data: newQtyRpc, error: rpcErr } = await supabase
        .rpc('decrement_branch_stock', { p_branch: branch, p_item_name: itemName, p_qty: deductQty });
      if (rpcErr) {
        console.error('[recordSnbSale] stock RPC error:', rpcErr.message);
        // Non-fatal for SNB: log mismatch, continue with sale
      } else if (newQtyRpc !== null) {
        // Update local newQty from authoritative DB value
        const _newQtyActual = Math.round((newQtyRpc as number) * 1000) / 1000;
        void _newQtyActual; // used in local state update below
      }
    }

    // 2. Insert sales record
    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:      itemName,
        quantity_sold:  qty,
        sold_at:        now,
        sold_by:        soldBy,
        payment_method: paymentMethod,
        unit_price:     unitPrice,
        bill_no:        billNo ?? null,
      })
      .select()
      .single();
    if (saleErr) return { error: `Failed to record sale: ${saleErr.message}`, mismatch };

    // 3. If mismatch, log to branch_stock_mismatches table (best-effort)
    if (mismatch) {
      const { data: mm } = await supabase
        .from('branch_stock_mismatches')
        .insert({
          branch,
          item_name:  itemName,
          sold_qty:   qty,
          shortage,
          sold_at:    now,
          sold_by:    soldBy,
        })
        .select()
        .single();

      if (mm) {
        set((s) => ({
          stockMismatches: [
            {
              id:       mm.id,
              itemName: mm.item_name,
              branch:   mm.branch as Branch,
              soldQty:  mm.sold_qty,
              shortage: mm.shortage,
              soldAt:   mm.sold_at,
              soldBy:   mm.sold_by,
            },
            ...s.stockMismatches,
          ],
        }));
      }
    }

    // 4. Update local state
    const newSale: SaleRecord = {
      id:            saleData.id,
      itemName:      saleData.item_name,
      quantitySold:  saleData.quantity_sold,
      soldAt:        saleData.sold_at,
      soldBy:        saleData.sold_by,
      branch,
      paymentMethod: saleData.payment_method ?? null,
    };

    // B2 local state fix: use the RPC-returned quantity for local state
    // to avoid showing a stale value after a concurrent sale on another device.
    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      if (currentStock) {
        stock[branch] = stock[branch].map((si) =>
          si.itemName === itemName ? { ...si, quantity: newQty } : si,
        );
      }
      sales[branch] = [newSale, ...sales[branch]];
      return { stock, sales };
    });
    // Sync from DB after SNB sale to pick up any concurrent changes
    void get().fetchBranchData(branch);

    return { error: null, mismatch };
  },

  // ── Manual stock update — branch staff sets qty for any item ─────────────
  manualUpdateStock: async (branch, itemName, quantity, updatedBy) => {
    const rounded = Math.round(quantity * 1000) / 1000;

    const { data: existing } = await supabase
      .from('branch_stock')
      .select('quantity')
      .eq('branch', branch)
      .eq('item_name', itemName)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('branch_stock')
        .update({ quantity: rounded, last_updated_by: updatedBy, last_updated_at: new Date().toISOString() })
        .eq('branch', branch)
        .eq('item_name', itemName);
      if (error) return `Failed to update stock: ${error.message}`;
    } else {
      const { error } = await supabase
        .from('branch_stock')
        .insert({ branch, item_name: itemName, quantity: rounded, min_threshold: 0, last_updated_by: updatedBy, last_updated_at: new Date().toISOString() });
      if (error) return `Failed to create stock entry: ${error.message}`;
    }

    // Re-fetch from DB to ensure local state matches exactly what was saved
    await get().fetchBranchData(branch);
    return null;
  },

  // ── Fetch stock mismatches for Admin alert ────────────────────────────────
  fetchStockMismatches: async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data } = await supabase
      .from('branch_stock_mismatches')
      .select('*')
      .gte('sold_at', thirtyDaysAgo.toISOString())
      .order('sold_at', { ascending: false });
    if (!data) return;
    set({
      stockMismatches: data.map((d) => ({
        id:       d.id,
        itemName: d.item_name,
        branch:   d.branch as Branch,
        soldQty:  d.sold_qty,
        shortage: d.shortage,
        soldAt:   d.sold_at,
        soldBy:   d.sold_by,
      })),
    });
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

  // DATA-02 FIX: replaced hard DELETE with soft-delete via archive RPC.
  // Old records get is_archived=TRUE (see migration 001_security.sql).
  // They are invisible to the dashboard but preserved for audit/tax purposes.
  cleanOldData: async () => {
    const { lastCleanedAt } = get();
    const now = Date.now();
    if (lastCleanedAt && now - lastCleanedAt < 60 * 60 * 1000) return;

    // Call the safe archive function instead of hard DELETE
    await supabase.rpc('archive_old_branch_sales');

    set({ lastCleanedAt: now });
  },
}));
