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
  unitPrice: number; // ₹ per unit — 0 for stock-based (non-priced) sales
  billNo: string | null;
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
  /** ISO date string (YYYY-MM-DD) — the date the customer wants delivery */
  deliveryDate: string | null;
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

// ── Credit Sale ───────────────────────────────────────────────────────────────
export interface CreditSaleItem {
  itemName: string;
  quantity: number;
  sellUnit: 'kg' | 'pcs';
  price: number;
  lineTotal: number;
}

export interface CreditSale {
  id: string;
  branch: Branch;
  customerName: string;
  customerPhone: string | null;
  items: CreditSaleItem[];
  subtotal: number;
  amountPaid: number;
  creditAmount: number;
  soldBy: string;
  createdAt: string;
  dueDate: string | null;
  settledAt: string | null;
  status: 'pending' | 'partial' | 'settled';
  notes: string | null;
  billNo: string;
}

interface BranchState {
  stock:           Record<Branch, StockItem[]>;
  sales:           Record<Branch, SaleRecord[]>;
  incoming:        Record<Branch, IncomingStock[]>;
  advanceOrders:   Record<Branch, BranchAdvanceOrder[]>;
  creditSales:     Record<Branch, CreditSale[]>;
  thresholds:      Record<Branch, Record<string, number>>;
  stockMismatches: StockMismatch[];
  loading:         boolean;
  lastCleanedAt:   number | null;
  // B5-FIX: per-branch sync timestamps so one branch's sync doesn't block another.
  lastSyncedAt:    Record<Branch, number | null>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string, billNo?: string, unitPrice?: number) => Promise<string | null>;
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
  syncIncomingFromDispatches: (branch: Branch, force?: boolean) => Promise<void>;
  confirmIncoming: (branch: Branch, incomingId: string) => Promise<string | null>;
  confirmAllIncoming: (branch: Branch) => Promise<string | null>;
  manualUpdateStock: (branch: Branch, itemName: string, quantity: number, updatedBy: string) => Promise<string | null>;
  fetchStockMismatches: () => Promise<void>;
  cleanOldData: () => Promise<void>;
  seedBranchItems: (branch: Branch) => Promise<void>;
  // ── Credit sales ──────────────────────────────────────────────────────────
  recordCreditSale: (branch: Branch, sale: Omit<CreditSale, 'id' | 'createdAt' | 'settledAt' | 'status'>) => Promise<string | null>;
  settleCreditSale: (branch: Branch, saleId: string, amountCollected: number) => Promise<string | null>;
  fetchCreditSales: (branch: Branch) => Promise<void>;
  // ── Live stock ────────────────────────────────────────────────────────────
  subscribeToStock:   (branch: Branch) => () => void; // returns unsubscribe fn
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:           { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  sales:           { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  incoming:        { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  advanceOrders:   { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  creditSales:     { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  thresholds:      { Cafe: {}, VRSNB: {}, SNB: {}, Hosur: {} },
  stockMismatches: [],
  loading:         false,
  lastCleanedAt:   null,
  lastSyncedAt:    { Cafe: null, VRSNB: null, SNB: null, Hosur: null } as Record<Branch, number | null>,

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
        { data: creditData },
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
        supabase.from('branch_credit_sales').select('*')
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
        const creditSales   = { ...s.creditSales };

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
          unitPrice:     d.unit_price != null ? Number(d.unit_price) : 0,
          billNo:        d.bill_no ?? null,
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
          deliveryDate:   d.delivery_date ?? null,
        }));

        const tMap: Record<string, number> = {};
        (thresholdData || []).forEach((d) => { tMap[d.item_name] = d.threshold; });
        thresholds[branch] = tMap;

        creditSales[branch] = (creditData || []).map((d) => ({
          id:            d.id,
          branch:        d.branch as Branch,
          customerName:  d.customer_name,
          customerPhone: d.customer_phone ?? null,
          items:         (d.items || []) as CreditSaleItem[],
          subtotal:      Number(d.subtotal),
          amountPaid:    Number(d.amount_paid),
          creditAmount:  Number(d.credit_amount),
          soldBy:        d.sold_by,
          createdAt:     d.created_at,
          dueDate:       d.due_date ?? null,
          settledAt:     d.settled_at ?? null,
          status:        d.status as 'pending' | 'partial' | 'settled',
          notes:         d.notes ?? null,
          billNo:        d.bill_no,
        }));
        return { stock, sales, incoming, thresholds, advanceOrders, creditSales };
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
  recordSale: async (branch, itemName, qty, soldBy, paymentMethod, billNo, unitPrice) => {
    // Pre-flight UX check (authoritative guard is in the DB)
    const localStock = get().stock[branch].find((s) => s.itemName === itemName);
    if (!localStock) return 'Item not found in stock';
    if (localStock.quantity < qty) return 'Insufficient stock';

    // Resolve unit price: caller may pass it directly; otherwise look up from stock price map
    const resolvedPrice = unitPrice ?? localStock.price ?? 0;

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
        unit_price:     resolvedPrice,
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
      paymentMethod: saleData.payment_method ?? null,
      unitPrice:     saleData.unit_price != null ? Number(saleData.unit_price) : 0,
      billNo:        saleData.bill_no ?? null,
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
    // BUGFIX: if full amount collected upfront, mark as completed immediately
    const status = balanceDue <= 0 ? 'completed' : 'pending';

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
        status,
        delivery_date:  order.deliveryDate ?? null,
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
      fullyPaidAt:   status === 'completed' ? now : null,
      balanceMethod: null,
      status,
      deliveryDate:  order.deliveryDate ?? null,
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

    // M-10 FIX: deduct stock BEFORE marking order completed.
    // Previously: mark completed → deduct stock → if deduction fails, order is
    // completed but stock was never reduced (silent inventory corruption).
    // Now: deduct all stock first, then mark completed atomically.

    // B3 FIX: each item uses the atomic RPC decrement instead of reading stale local state.
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

        // M-10 FIX: order status was never changed yet — just restore any partially decremented stock
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

    // All stock deductions succeeded — now mark the order as completed
    const { error: updateErr } = await supabase
      .from('branch_advance_orders')
      .update({ status: 'completed', fully_paid_at: now, balance_method: balanceMethod, balance_due: 0 })
      .eq('id', orderId);
    if (updateErr) {
      // Stock was deducted but order status update failed — surface this so operator can retry
      await get().fetchBranchData(branch);
      return `Stock deducted but failed to mark order complete: ${updateErr.message}. Please refresh and verify.`;
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

  // B5 FIX: per-branch lastSyncedAt guard — each branch runs at most once per 10 seconds on manual, 60s on auto.
  syncIncomingFromDispatches: async (branch, force = false) => {
    const { lastSyncedAt } = get();
    const now = Date.now();
    if (!force && lastSyncedAt[branch] && now - lastSyncedAt[branch]! < 10 * 1000) return;
    set((s) => ({ lastSyncedAt: { ...s.lastSyncedAt, [branch]: now } }));
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: orders } = await supabase
      .from('bakery_orders')
      .select('id, dispatch_log')
      .not('dispatch_log', 'is', null)
      .gte('created_at', sixMonthsAgo.toISOString());

    if (!orders) {
      // Even if dispatch_log sync finds nothing, re-fetch branch_incoming directly
      // to pick up any records written by submitDispatch that may have been missed
      await get().fetchBranchData(branch);
      return;
    }

    // FIXED: use dispatch_id column (the dispatch_log entry id) as the dedup key.
    const { data: existingIncoming } = await supabase
      .from('branch_incoming')
      .select('dispatch_id')
      .eq('branch', branch);
    const existingDispatchIds = new Set(
      (existingIncoming || []).map((d) => d.dispatch_id).filter(Boolean),
    );

    const newEntries: {
      dispatch_id: string; item_name: string; quantity: number; unit: string;
      received_at: string; dispatched_by: string; branch: Branch;
    }[] = [];

    for (const order of orders) {
      const log = (order.dispatch_log || []) as {
        id: string; itemName: string; quantity: number; unit?: string;
        branch: Branch; dispatchedAt: string; dispatchedBy: string;
      }[];
      log
        .filter((e) => e.branch === branch && !existingDispatchIds.has(e.id))
        .forEach((e) =>
          newEntries.push({
            dispatch_id:   e.id,
            item_name:     e.itemName,
            quantity:      e.quantity,
            unit:          e.unit ?? 'kg',
            received_at:   e.dispatchedAt,
            dispatched_by: e.dispatchedBy,
            branch,
          }),
        );
    }

    // SYNC-FIX: Don't use upsert onConflict:'dispatch_id' — requires a unique constraint
    // that may not exist. Instead insert each new entry individually, skipping any that
    // already exist (checked via the existingDispatchIds set built above).
    for (const entry of newEntries) {
      const { error: insertErr } = await supabase
        .from('branch_incoming')
        .insert(entry);
      if (insertErr) {
        // Duplicate key errors are expected and safe to ignore (race condition between
        // two devices syncing simultaneously). Log everything else.
        if (!insertErr.message?.includes('duplicate') && !insertErr.code?.includes('23505')) {
          console.error('[syncIncoming] insert failed:', insertErr.message);
        }
      }
    }

    // Always re-fetch branch data after sync to ensure UI reflects latest DB state
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

    // BUG #8 FIX: Fallback two-step path.
    // Re-read the incoming record to guard against a retry where stock was already
    // added but the mark-confirmed step failed. If confirmed=true in DB we skip stock add.
    const { data: freshInc } = await supabase
      .from('branch_incoming').select('confirmed').eq('id', incomingId).single();
    const alreadyConfirmedInDb = freshInc?.confirmed === true;

    if (!alreadyConfirmedInDb) {
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

  // Confirm all unconfirmed incoming items at once (not restricted to today)
  confirmAllIncoming: async (branch) => {
    const toConfirm = get().incoming[branch].filter((i) => !i.confirmed);
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
    // BUG #9 FIX: actually use the authoritative qty returned by the RPC.
    let rpcNewQty: number | null = null;
    if (deductQty > 0 && currentStock) {
      const { data: newQtyRpc, error: rpcErr } = await supabase
        .rpc('decrement_branch_stock', { p_branch: branch, p_item_name: itemName, p_qty: deductQty });
      if (rpcErr) {
        console.error('[recordSnbSale] stock RPC error:', rpcErr.message);
        // Non-fatal for SNB: log mismatch, continue with sale
      } else if (newQtyRpc !== null) {
        rpcNewQty = Math.round((newQtyRpc as number) * 1000) / 1000;
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
      unitPrice:     saleData.unit_price != null ? Number(saleData.unit_price) : unitPrice,
      billNo:        saleData.bill_no ?? null,
    };

    // B2 local state fix: use the RPC-returned quantity for local state
    // to avoid showing a stale value after a concurrent sale on another device.
    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      if (currentStock) {
        // BUG #9 FIX: prefer authoritative DB value from RPC over stale local calculation
        const finalQty = rpcNewQty !== null ? rpcNewQty : newQty;
        stock[branch] = stock[branch].map((si) =>
          si.itemName === itemName ? { ...si, quantity: finalQty } : si,
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

  // ── Credit sales ────────────────────────────────────────────────────────────

  fetchCreditSales: async (branch) => {
    const { data, error } = await supabase
      .from('branch_credit_sales')
      .select('*')
      .eq('branch', branch)
      .order('created_at', { ascending: false });
    if (error) { console.error('[fetchCreditSales]', error.message); return; }
    set((s) => {
      const creditSales = { ...s.creditSales };
      creditSales[branch] = (data || []).map((d) => ({
        id:            d.id,
        branch:        d.branch as Branch,
        customerName:  d.customer_name,
        customerPhone: d.customer_phone ?? null,
        items:         (d.items || []) as CreditSaleItem[],
        subtotal:      Number(d.subtotal),
        amountPaid:    Number(d.amount_paid),
        creditAmount:  Number(d.credit_amount),
        soldBy:        d.sold_by,
        createdAt:     d.created_at,
        dueDate:       d.due_date ?? null,
        settledAt:     d.settled_at ?? null,
        status:        d.status as 'pending' | 'partial' | 'settled',
        notes:         d.notes ?? null,
        billNo:        d.bill_no,
      }));
      return { creditSales };
    });
  },

  recordCreditSale: async (branch, sale) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('branch_credit_sales')
      .insert({
        branch,
        customer_name:  sale.customerName,
        customer_phone: sale.customerPhone ?? null,
        items:          sale.items,
        subtotal:       sale.subtotal,
        amount_paid:    sale.amountPaid,
        credit_amount:  sale.creditAmount,
        sold_by:        sale.soldBy,
        created_at:     now,
        due_date:       sale.dueDate ?? null,
        status:         sale.amountPaid === 0 ? 'pending' : 'partial',
        notes:          sale.notes ?? null,
        bill_no:        sale.billNo,
      })
      .select()
      .single();
    if (error) return `Failed to record credit sale: ${error.message}`;

    const newSale: CreditSale = {
      id:            data.id,
      branch,
      customerName:  sale.customerName,
      customerPhone: sale.customerPhone ?? null,
      items:         sale.items,
      subtotal:      sale.subtotal,
      amountPaid:    sale.amountPaid,
      creditAmount:  sale.creditAmount,
      soldBy:        sale.soldBy,
      createdAt:     now,
      dueDate:       sale.dueDate ?? null,
      settledAt:     null,
      status:        sale.amountPaid === 0 ? 'pending' : 'partial',
      notes:         sale.notes ?? null,
      billNo:        sale.billNo,
    };

    // Also write each item as a branch_sales row so revenue reports include credit sales.
    // payment_method='credit' marks these as credit-billed (goods delivered, payment pending).
    // They must NOT be excluded from revenue — the earning happened at point of sale.
    const salesRows = sale.items.map(item => ({
      branch,
      item_name:      item.itemName,
      quantity_sold:  item.quantity,
      sold_at:        now,
      sold_by:        sale.soldBy,
      payment_method: 'credit',
      unit_price:     item.price,
      bill_no:        sale.billNo,
    }));
    if (salesRows.length > 0) {
      await supabase.from('branch_sales').insert(salesRows);
    }

    set((s) => {
      const creditSales = { ...s.creditSales };
      creditSales[branch] = [newSale, ...creditSales[branch]];
      return { creditSales };
    });
    return null;
  },

  settleCreditSale: async (branch, saleId, amountCollected) => {
    const sale = get().creditSales[branch].find((s) => s.id === saleId);
    if (!sale) return 'Credit sale not found';

    const newAmountPaid = sale.amountPaid + amountCollected;
    const isSettled = newAmountPaid >= sale.subtotal;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('branch_credit_sales')
      .update({
        amount_paid:  newAmountPaid,
        credit_amount: Math.max(0, sale.subtotal - newAmountPaid),
        status:       isSettled ? 'settled' : 'partial',
        settled_at:   isSettled ? now : null,
      })
      .eq('id', saleId);
    if (error) return `Failed to settle: ${error.message}`;

    // NOTE: We do NOT insert into branch_sales on settlement.
    // Revenue was already recorded when the credit sale was billed (in recordCreditSale).
    // Inserting here again would double-count the revenue.
    // The credit_sales table tracks collection separately (amountPaid, creditAmount, status).

    set((s) => {
      const creditSales = { ...s.creditSales };
      creditSales[branch] = creditSales[branch].map((cs) =>
        cs.id === saleId
          ? { ...cs, amountPaid: newAmountPaid, creditAmount: Math.max(0, cs.subtotal - newAmountPaid),
              status: isSettled ? 'settled' : 'partial', settledAt: isSettled ? now : null }
          : cs
      );
      return { creditSales };
    });
    return null;
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

  // ── Live stock subscription via Supabase Realtime ─────────────────────────
  // Subscribes to branch_stock + branch_incoming for the given branch.
  // Any INSERT/UPDATE/DELETE fires a full fetchBranchData() to keep state fresh.
  // Also subscribes to branch_sales so the sales log updates instantly.
  // Returns an unsubscribe function — call it in the component's cleanup.
  subscribeToStock: (branch) => {
    const channelName = `branch-live-${branch}`;

    const channel = supabase
      .channel(channelName)
      // branch_stock changes (confirms, manual updates, sales deductions)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_stock', filter: `branch=eq.${branch}` },
        () => { get().fetchBranchData(branch); },
      )
      // branch_incoming changes (new dispatches from packing, confirmations)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_incoming', filter: `branch=eq.${branch}` },
        () => { get().fetchBranchData(branch); },
      )
      // branch_sales changes (new sales so today's log is always current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'branch_sales', filter: `branch=eq.${branch}` },
        () => { get().fetchBranchData(branch); },
      )
      .subscribe();

    // Return cleanup function
    return () => { supabase.removeChannel(channel); };
  },
}));
