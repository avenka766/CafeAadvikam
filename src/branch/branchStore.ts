// src/branch/branchStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';
import { BAKERY_ITEMS } from '@/bakery/types';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { useAuthStore } from '@/stores/authStore';
import { cakeIncomingDispatchId, ensureCakeDispatchIncoming, type CakeDispatchSource } from './cakeDispatchSync';

const normalizeStockName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type BranchRealtimeSubscription = {
  channel: ReturnType<typeof supabase.channel>;
  subscribers: number;
};

const branchRealtimeSubscriptions = new Map<string, BranchRealtimeSubscription>();
const branchRefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Coalesces bursts of realtime events (e.g. a single checkout fires a
// branch_stock UPDATE *and* a branch_sales INSERT within milliseconds) into
// one fetchBranchData() call instead of several stacked ones. This was
// causing visible billing-screen lag at busy branches since every other
// open terminal at that branch was re-running the full 7-query fetch for
// every single event.
function scheduleBranchRefetch(branch: Branch) {
  const existing = branchRefetchTimers.get(branch);
  if (existing) clearTimeout(existing);
  branchRefetchTimers.set(
    branch,
    setTimeout(() => {
      branchRefetchTimers.delete(branch);
      void useBranchStore.getState().fetchBranchData(branch);
    }, 600),
  );
}

const isMissingRpcError = (message: string) =>
  /could not find the function|function .* does not exist|schema cache/i.test(message);

const decrementBranchStockStrict = async (
  branch: Branch,
  itemName: string,
  qty: number,
  itemBarcode?: number,
) => {
  if (itemBarcode != null) {
    const barcodeResult = await supabase.rpc('decrement_branch_stock_by_barcode_strict', {
      p_branch: branch,
      p_barcode: itemBarcode,
      p_qty: qty,
    });
    if (!barcodeResult.error || !isMissingRpcError(barcodeResult.error.message ?? '')) return barcodeResult;
  }

  const strictResult = await supabase.rpc('decrement_branch_stock_strict', {
    p_branch: branch,
    p_item_name: itemName,
    p_qty: qty,
  });

  if (!strictResult.error) return strictResult;
  if (!isMissingRpcError(strictResult.error.message ?? '')) return strictResult;

  return supabase.rpc('decrement_branch_stock', {
    p_branch: branch,
    p_item_name: itemName,
    p_qty: qty,
  });
};

const incrementBranchStock = async (
  branch: Branch,
  itemName: string,
  qty: number,
  itemBarcode?: number,
) => {
  if (itemBarcode != null) {
    const barcodeResult = await supabase.rpc('increment_branch_stock_by_barcode', {
      p_branch: branch,
      p_barcode: itemBarcode,
      p_qty: qty,
    });
    if (!barcodeResult.error || !isMissingRpcError(barcodeResult.error.message ?? '')) return barcodeResult;
  }
  return supabase.rpc('increment_branch_stock', {
    p_branch: branch,
    p_item_name: itemName,
    p_qty: qty,
  });
};

const defaultMinThreshold = (unit?: string) => {
  const normalized = (unit ?? '').toLowerCase();
  if (normalized.includes('kg') || normalized.includes('ltr') || normalized.includes('lit')) return 2;
  if (normalized.includes('g')) return 500;
  return 10;
};

export interface StockItem {
  itemBarcode?: number;
  itemName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt?: string;
  lastUpdatedAt?: string;
  /** Unit in which quantity is stored — 'pcs' for piece items, 'kg' for weight items. */
  unit?: 'pcs' | 'kg';
  minThreshold: number;
  price: number | null; // FIX #3 — added price field so BillTab can display/use it
}

export interface SaleRecord {
  id: string;
  itemBarcode?: number;
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
  barcode?: number;
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
  status: 'pending' | 'completed' | 'cancelled';
  notes?: string | null;
  reservationStatus?: 'none' | 'reserved' | 'consumed' | 'released';
  /** ISO date string (YYYY-MM-DD) — the date the customer wants delivery */
  deliveryDate: string | null;
}

export interface IncomingStock {
  id: string;
  itemBarcode?: number;
  itemName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt?: string;
  lastUpdatedAt?: string;
  /** Unit in which quantity is expressed — 'pcs' or 'kg'. Defaults to 'kg' for legacy rows. */
  unit: 'pcs' | 'kg';
  receivedAt: string;
  dispatchedBy: string;
  confirmed: boolean;
  disputed?: boolean;
  disputeReason?: string | null;
  disputedBy?: string | null;
  disputedAt?: string | null;
}

export interface StockMismatch {
  id:        string;
  itemBarcode?: number;
  itemName:  string;
  branch:    Branch;
  soldQty:   number;
  shortage:  number;
  soldAt:    string;
  soldBy:    string;
}

// ── Credit Sale ───────────────────────────────────────────────────────────────
export interface CreditSaleItem {
  barcode?: number;
  itemName: string;
  quantity: number;
  sellUnit: 'kg' | 'pcs';
  price: number;
  lineTotal: number;
}

export interface CreditSale {
  id: string;
  branch: Branch;
  source?: string | null;
  sourceId?: string | null;
  customerRef?: string | null;
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
  discountAmount?: number;
}

export interface CreditPayment {
  id: string;
  creditSaleId: string;
  branch: Branch;
  billNo: string;
  amount: number;
  paymentMode: 'cash' | 'upi' | 'card' | 'bank' | 'mixed';
  reference: string | null;
  remarks: string | null;
  collectedBy: string;
  collectedRole: string | null;
  createdAt: string;
}

interface BranchState {
  stock:           Record<Branch, StockItem[]>;
  sales:           Record<Branch, SaleRecord[]>;
  incoming:        Record<Branch, IncomingStock[]>;
  advanceOrders:   Record<Branch, BranchAdvanceOrder[]>;
  creditSales:     Record<Branch, CreditSale[]>;
  creditPayments:  Record<Branch, CreditPayment[]>;
  thresholds:      Record<Branch, Record<string, number>>;
  stockMismatches: StockMismatch[];
  loading:         boolean;
  lastCleanedAt:   number | null;
  // B5-FIX: per-branch sync timestamps so one branch's sync doesn't block another.
  lastSyncedAt:    Record<Branch, number | null>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  fetchAllBranches: () => Promise<void>;
  recordSale: (branch: Branch, itemName: string, qty: number, soldBy: string, paymentMethod: string, billNo?: string, unitPrice?: number, itemBarcode?: number) => Promise<string | null>;
  recordSnbSale: (
    branch: Branch,
    itemName: string,
    qty: number,
    soldBy: string,
    paymentMethod: string,
    unitPrice: number,
    billNo?: string,
    itemBarcode?: number,
  ) => Promise<{ error: string | null; mismatch: boolean }>;
  recordAdvanceOrder: (branch: Branch, order: Omit<BranchAdvanceOrder, 'id' | 'createdAt' | 'fullyPaidAt' | 'balanceMethod' | 'status'>) => Promise<string | null>;
  collectAdvanceBalance: (branch: Branch, orderId: string, balanceMethod: string) => Promise<string | null>;
  updateThreshold: (branch: Branch, itemName: string, threshold: number) => Promise<void>;
  syncIncomingFromDispatches: (branch: Branch, force?: boolean) => Promise<void>;
  confirmIncoming: (branch: Branch, incomingId: string) => Promise<string | null>;
  confirmAllIncoming: (branch: Branch) => Promise<string | null>;
  manualUpdateStock: (branch: Branch, itemName: string, quantity: number, updatedBy: string, itemBarcode?: number) => Promise<string | null>;
  fetchStockMismatches: () => Promise<void>;
  cleanOldData: () => Promise<void>;
  seedBranchItems: (branch: Branch) => Promise<void>;
  // ── Credit sales ──────────────────────────────────────────────────────────
  recordCreditSale: (
    branch: Branch,
    sale: Omit<CreditSale, 'id' | 'createdAt' | 'settledAt' | 'status'>,
    options?: {
      writeSalesRows?: boolean;
      upfrontPaymentMode?: CreditPayment['paymentMode'];
      reference?: string;
      collectedBy?: string;
      collectedRole?: string;
      remarks?: string;
    },
  ) => Promise<string | null>;
  settleCreditSale: (
    branch: Branch,
    saleId: string,
    amountCollected: number,
    payment?: {
      mode?: CreditPayment['paymentMode'];
      reference?: string;
      remarks?: string;
      collectedBy?: string;
      collectedRole?: string;
    },
  ) => Promise<string | null>;
  applyCreditDiscount: (
    branch: Branch,
    saleId: string,
    discountAmount: number,
    reason?: string,
    approvedBy?: string,
  ) => Promise<string | null>;
  fetchCreditSales: (branch: Branch) => Promise<void>;
  fetchCreditPayments: (branch: Branch) => Promise<void>;
  // ── Live stock ────────────────────────────────────────────────────────────
  subscribeToStock:   (branch: Branch) => () => void; // returns unsubscribe fn
}

export const useBranchStore = create<BranchState>((set, get) => ({
  stock:           { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  sales:           { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  incoming:        { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  advanceOrders:   { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  creditSales:     { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
  creditPayments:  { Cafe: [], VRSNB: [], SNB: [], Hosur: [] },
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

      const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : branch === 'SNB' || branch === 'Hosur' ? 'SNB' : null;
      if (catalogBranch) await useBranchCatalogStore.getState().loadCatalog(catalogBranch);
      const catalogItems = catalogBranch ? useBranchCatalogStore.getState().items[catalogBranch] : [];

      const [
        { data: stockData },
        { data: salesData },
        { data: incomingData },
        { data: thresholdData },
        { data: priceData },
        { data: advanceData },
        { data: creditData },
        { data: openAdvanceData },
        { data: openCreditData },
      ] = await Promise.all([
        supabase.from('branch_stock')
          .select('item_barcode,item_name,quantity,reserved_quantity,updated_at,last_updated_at,unit,min_threshold')
          .eq('branch', branch).order('updated_at', { ascending: false }).limit(2000),
        supabase.from('branch_sales')
          .select('id,item_barcode,item_name,quantity_sold,sold_at,sold_by,branch,payment_method,unit_price,bill_no')
          .eq('branch', branch)
          .gte('sold_at', thirtyDaysAgo.toISOString())
          .order('sold_at', { ascending: false }),
        supabase.from('branch_incoming')
          .select('id,item_barcode,item_name,quantity,unit,received_at,dispatched_by,confirmed,disputed,dispute_reason,disputed_by,disputed_at')
          .eq('branch', branch)
          .order('received_at', { ascending: false }).limit(500),
        supabase.from('branch_thresholds').select('item_name,threshold').eq('branch', branch),
        supabase.from('bakery_items').select('name, price'),
        supabase.from('branch_advance_orders')
          .select('id,branch,customer_name,items,subtotal,advance_amount,advance_method,balance_due,sold_by,created_at,fully_paid_at,balance_method,status,delivery_date,notes,reservation_status')
          .eq('branch', branch)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('branch_credit_sales')
          .select('id,branch,source,source_id,customer_ref,customer_name,customer_phone,items,subtotal,amount_paid,credit_amount,sold_by,created_at,due_date,settled_at,status,notes,bill_no')
          .eq('branch', branch)
          .order('created_at', { ascending: false })
          .limit(1000),
        // BUG FIX: same class of bug as the salesperson roster — an old
        // advance order or credit sale that's still unsettled represents
        // money owed / a delivery still due, and must not disappear just
        // because 1000 *newer* orders/sales have piled up since it was
        // created. Fetch open ones separately, unbounded by recency, and
        // merge below.
        supabase.from('branch_advance_orders')
          .select('id,branch,customer_name,items,subtotal,advance_amount,advance_method,balance_due,sold_by,created_at,fully_paid_at,balance_method,status,delivery_date,notes,reservation_status')
          .eq('branch', branch)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase.from('branch_credit_sales')
          .select('id,branch,source,source_id,customer_ref,customer_name,customer_phone,items,subtotal,amount_paid,credit_amount,sold_by,created_at,due_date,settled_at,status,notes,bill_no')
          .eq('branch', branch)
          .neq('status', 'settled')
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      // Build a name → price lookup from bakery_items
      const priceMap: Record<string, number | null> = {};
      (priceData || []).forEach((d) => {
        priceMap[d.name] = d.price != null ? Number(d.price) : null;
      });
      catalogItems.forEach((item) => { priceMap[item.name] = item.price; });
      const priceByBarcode = new Map(catalogItems.map((item) => [item.barcode, item.price]));

      set((s) => {
        const stock         = { ...s.stock };
        const sales         = { ...s.sales };
        const incoming      = { ...s.incoming };
        const thresholds    = { ...s.thresholds };
        const advanceOrders = { ...s.advanceOrders };
        const creditSales   = { ...s.creditSales };

        const latestStockRows = new Map<string, (typeof stockData extends (infer R)[] | null ? R : never)>();
        for (const row of stockData || []) {
          const key = row.item_barcode != null
            ? `barcode:${Number(row.item_barcode)}`
            : `name:${normalizeStockName(String(row.item_name || ''))}`;
          if (!latestStockRows.has(key)) latestStockRows.set(key, row);
        }
        stock[branch] = Array.from(latestStockRows.values()).map((d) => ({
          itemBarcode:  d.item_barcode != null ? Number(d.item_barcode) : undefined,
          itemName:     d.item_name,
          quantity:     Number(d.quantity ?? 0),
          reservedQuantity: Number(d.reserved_quantity ?? 0),
          availableQuantity: Math.max(0, Number(d.quantity ?? 0) - Number(d.reserved_quantity ?? 0)),
          updatedAt: d.updated_at ? String(d.updated_at) : undefined,
          lastUpdatedAt: d.last_updated_at ? String(d.last_updated_at) : undefined,
          unit:         (d.unit === 'pcs' ? 'pcs' : d.unit === 'kg' ? 'kg' : undefined) as 'pcs' | 'kg' | undefined,
          minThreshold: d.min_threshold ?? 10,
          price:        d.item_barcode != null ? (priceByBarcode.get(Number(d.item_barcode)) ?? priceMap[d.item_name] ?? null) : (priceMap[d.item_name] ?? null),
        })).sort((a, b) => a.itemName.localeCompare(b.itemName));

        sales[branch] = (salesData || []).map((d) => ({
          id:            d.id,
          itemBarcode:   d.item_barcode != null ? Number(d.item_barcode) : undefined,
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
          itemBarcode:   d.item_barcode != null ? Number(d.item_barcode) : undefined,
          itemName:      d.item_name,
          quantity:      Number(d.quantity),
          reservedQuantity: 0,
          availableQuantity: Number(d.quantity),
          unit:          (d.unit === 'pcs' ? 'pcs' : 'kg') as 'pcs' | 'kg',
          receivedAt:    d.received_at,
          dispatchedBy:  d.dispatched_by,
          confirmed:     d.confirmed ?? false,
          disputed:      d.disputed ?? false,
          disputeReason: d.dispute_reason ?? null,
          disputedBy:    d.disputed_by ?? null,
          disputedAt:    d.disputed_at ?? null,
        }));

        advanceOrders[branch] = [
          ...(advanceData || []),
          ...((openAdvanceData || []).filter((o) => !(advanceData || []).some((a) => a.id === o.id))),
        ].map((d) => ({
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
          status:         d.status as 'pending' | 'completed' | 'cancelled',
          deliveryDate:   d.delivery_date ?? null,
          notes:          d.notes ?? null,
          reservationStatus: (d.reservation_status ?? 'none') as BranchAdvanceOrder['reservationStatus'],
        }));

        const tMap: Record<string, number> = {};
        (thresholdData || []).forEach((d) => { tMap[d.item_name] = d.threshold; });
        thresholds[branch] = tMap;

        creditSales[branch] = [
          ...(creditData || []),
          ...((openCreditData || []).filter((o) => !(creditData || []).some((c) => c && c.id === o.id))),
        ]
          .filter((d): d is NonNullable<typeof d> => d != null && d.id != null)
          .map((d) => ({
            id:            d.id,
            branch:        d.branch as Branch,
            source:        d.source ?? null,
            sourceId:      d.source_id ?? null,
            customerRef:   d.customer_ref ?? null,
            customerName:  d.customer_name ?? 'Unknown',
            customerPhone: d.customer_phone ?? null,
            items:         ((d.items as CreditSaleItem[] | null) || []).filter((i): i is CreditSaleItem => i != null),
            subtotal:      Number(d.subtotal ?? 0),
            amountPaid:    Number(d.amount_paid ?? 0),
            creditAmount:  Number(d.credit_amount ?? 0),
            soldBy:        d.sold_by ?? 'Staff',
            createdAt:     d.created_at ?? new Date().toISOString(),
            dueDate:       d.due_date ?? null,
            settledAt:     d.settled_at ?? null,
            status:        (d.status ?? 'pending') as 'pending' | 'partial' | 'settled',
            notes:         d.notes ?? null,
            billNo:        d.bill_no ?? '',
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

  // B1 FIX: atomic stock decrement via stored procedure.
  // The strict RPC blocks missing, insufficient, or negative stock billing.
  recordSale: async (branch, itemName, qty, soldBy, paymentMethod, billNo, unitPrice, itemBarcode) => {
    const now = new Date().toISOString();
    const requestedStockName = normalizeStockName(itemName);
    const localStock = get().stock[branch].find((stockItem) =>
      itemBarcode != null && stockItem.itemBarcode != null
        ? stockItem.itemBarcode === itemBarcode
        : normalizeStockName(stockItem.itemName) === requestedStockName,
    ) ?? null;
    const stockItemName = localStock?.itemName ?? itemName;
    const resolvedBarcode = itemBarcode ?? localStock?.itemBarcode;
    const availableQty = Number(localStock?.quantity ?? 0);

    if (!localStock) {
      return `${itemName} has no stock entry and cannot be billed. Add stock before selling.`;
    }
    if (availableQty <= 0) {
      return `${itemName} is out of stock and cannot be billed.`;
    }
    if (qty > availableQty) {
      return `Only ${availableQty} available for ${itemName}. Requested ${qty}.`;
    }

    // Resolve unit price: caller may pass it directly; otherwise look up from stock price map
    const resolvedPrice = unitPrice ?? localStock?.price ?? 0;

    const { data: newQtyRpc, error: rpcErr } = await decrementBranchStockStrict(branch, stockItemName, qty, resolvedBarcode);
    if (rpcErr) {
      console.error('[recordSale] stock RPC error:', rpcErr.message);
      return `Failed to update stock for ${itemName}: ${rpcErr.message}`;
    }
    if (newQtyRpc === null) {
      return `Insufficient stock for ${itemName}. Refresh stock and try again.`;
    }
    const newQty = Math.round((newQtyRpc as number) * 1000) / 1000;

    // Record the sale
    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:      itemName,
        item_barcode:   resolvedBarcode ?? null,
        quantity_sold:  qty,
        sold_at:        now,
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

    // Log a mismatch if stock went negative so admin can track shortages
    if (newQty < 0) {
      const actualShortage = Math.abs(newQty);
      await supabase.from('branch_stock_mismatches').insert({
        branch, item_name: itemName, item_barcode: resolvedBarcode ?? null, sold_qty: qty,
        shortage: actualShortage, sold_at: now, sold_by: soldBy,
      }).select().single();
    }

    const newSale: SaleRecord = {
      id:            saleData.id,
      itemBarcode:   saleData.item_barcode != null ? Number(saleData.item_barcode) : resolvedBarcode,
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
      stock[branch] = stock[branch].map((stockItem) =>
        resolvedBarcode != null && stockItem.itemBarcode != null
          ? stockItem.itemBarcode === resolvedBarcode ? { ...stockItem, quantity: newQty, availableQuantity: Math.max(0, newQty - Number(stockItem.reservedQuantity || 0)) } : stockItem
          : normalizeStockName(stockItem.itemName) === requestedStockName ? { ...stockItem, quantity: newQty, availableQuantity: Math.max(0, newQty - Number(stockItem.reservedQuantity || 0)) } : stockItem,
      );
      sales[branch] = [newSale, ...sales[branch]];
      return { stock, sales };
    });

    return null;
  },

  // ── Record an advance order — NO stock deduction yet ──────────────────────
  // ── MD Bug #11: TWO PARALLEL ADVANCE-ORDER SYSTEMS ──────────────────────────
  // System 1 (THIS FILE): recordAdvanceOrder / collectAdvanceBalance
  //   • Entry point: BillTab.tsx → AdvancePaymentsTab
  //   • Writes to: branch_advance_orders + branch_sales
  //   • Summarised in: AdvancePaymentsTab
  // System 2 (branchOpsStore.ts): addAdvanceCakeOrder / addAdvanceFinalBill
  //   • Entry point: BranchBusinessModules → AdvanceCakeOrdersTab
  //   • Writes to: branch_bill_headers / bills[] + branch_sale_payments
  //   • Summarised in: BranchBillHistoryProTab
  //
  // MIGRATION PATH (see 20260613_0006_unify_advance_orders.sql):
  //   A DB view `unified_advance_orders` merges both systems into one query for
  //   reporting. Full consolidation (merge System 1 into System 2) is a breaking
  //   change that must be done in a dedicated release. Until then, the view prevents
  //   duplicate counting on Owner Dashboard.
  // ─────────────────────────────────────────────────────────────────────────────
  recordAdvanceOrder: async (branch, order) => {
    const now = new Date().toISOString();
    const balanceDue = Math.max(0, order.subtotal - order.advanceAmount);

    for (const item of order.items) {
      if (item.isCustom) continue;
      const requestedStockName = normalizeStockName(item.itemName);
      const currentStock = get().stock[branch].find((stockItem) =>
        item.barcode != null && stockItem.itemBarcode != null
          ? stockItem.itemBarcode === item.barcode
          : normalizeStockName(stockItem.itemName) === requestedStockName,
      ) ?? null;
      const availableQty = Number(currentStock?.availableQuantity ?? currentStock?.quantity ?? 0);
      if (!currentStock) return `${item.itemName} has no stock entry and cannot be reserved.`;
      if (availableQty <= 0) return `${item.itemName} is out of stock and cannot be reserved.`;
      if (item.quantity > availableQty) return `Only ${availableQty} available for ${item.itemName}. Requested ${item.quantity}.`;
    }

    const rpc = await supabase.rpc('create_branch_advance_order_reserved', {
      p_branch: branch,
      p_customer_name: order.customerName ?? null,
      p_items: order.items,
      p_subtotal: order.subtotal,
      p_advance_amount: order.advanceAmount,
      p_advance_method: order.advanceMethod,
      p_sold_by: order.soldBy,
      p_delivery_date: order.deliveryDate ?? null,
      p_notes: order.notes ?? null,
    });
    if (rpc.error) {
      const missing = /create_branch_advance_order_reserved|could not find the function|does not exist|schema cache/i.test(rpc.error.message || '');
      if (!missing) return `Failed to reserve advance-order stock: ${rpc.error.message}`;
      return 'Advance-order reservation RPC is not installed. Apply the branch reservation migration before taking advance orders.';
    }
    const data = rpc.data as Record<string, unknown>;
    const newOrder: BranchAdvanceOrder = {
      id: String(data.id),
      branch,
      customerName: data.customer_name != null ? String(data.customer_name) : null,
      items: (data.items || order.items) as BranchAdvanceItem[],
      subtotal: Number(data.subtotal ?? order.subtotal),
      advanceAmount: Number(data.advance_amount ?? order.advanceAmount),
      advanceMethod: String(data.advance_method ?? order.advanceMethod),
      balanceDue: Number(data.balance_due ?? balanceDue),
      soldBy: String(data.sold_by ?? order.soldBy),
      createdAt: String(data.created_at ?? now),
      fullyPaidAt: data.fully_paid_at ? String(data.fully_paid_at) : null,
      balanceMethod: data.balance_method ? String(data.balance_method) : null,
      status: String(data.status || 'pending') as BranchAdvanceOrder['status'],
      deliveryDate: data.delivery_date ? String(data.delivery_date) : order.deliveryDate ?? null,
      notes: data.notes ? String(data.notes) : order.notes ?? null,
      reservationStatus: String(data.reservation_status || 'reserved') as BranchAdvanceOrder['reservationStatus'],
    };

    // Do not write branch_sales until the reserved order is completed. Recording
    // it here would recognise revenue and quantity sold before fulfilment.

    set((state) => {
      const advanceOrders = { ...state.advanceOrders };
      advanceOrders[branch] = [newOrder, ...advanceOrders[branch]];
      return { advanceOrders };
    });
    await get().fetchBranchData(branch);
    return null;
  },

  // ── Collect remaining balance — NOW deduct stock and record sales ──────────
  collectAdvanceBalance: async (branch, orderId, balanceMethod) => {
    const order = get().advanceOrders[branch].find((entry) => entry.id === orderId);
    if (!order) return 'Advance order not found';
    if (order.status === 'completed') return null;
    const completedBy = useAuthStore.getState().currentUser?.username || useAuthStore.getState().currentUser?.displayName || order.soldBy || 'Branch Staff';
    const { data, error } = await supabase.rpc('complete_branch_advance_order_reserved', {
      p_branch: branch,
      p_order_id: orderId,
      p_balance_method: balanceMethod,
      p_completed_by: completedBy,
    });
    if (error) {
      const missing = /complete_branch_advance_order_reserved|could not find the function|does not exist|schema cache/i.test(error.message || '');
      if (missing) return 'Advance completion RPC is not installed. Apply the branch reservation migration.';
      return `Advance order could not be completed: ${error.message}`;
    }
    const row = data as Record<string, unknown>;
    await get().fetchBranchData(branch);
    set((state) => {
      const advanceOrders = { ...state.advanceOrders };
      advanceOrders[branch] = advanceOrders[branch].map((entry) => entry.id === orderId ? {
        ...entry,
        status: 'completed',
        fullyPaidAt: String(row.fully_paid_at || new Date().toISOString()),
        balanceMethod,
        balanceDue: 0,
        reservationStatus: 'consumed',
      } : entry);
      return { advanceOrders };
    });
    return null;
  },

  updateThreshold: async (branch, itemName, threshold) => {
    const stockItem = get().stock[branch].find((item) => normalizeStockName(item.itemName) === normalizeStockName(itemName));
    const itemBarcode = stockItem?.itemBarcode;
    const thresholdPayload = { branch, item_name: stockItem?.itemName ?? itemName, item_barcode: itemBarcode ?? null, threshold };
    const { error: t1 } = await supabase.from('branch_thresholds').upsert(thresholdPayload, { onConflict: 'branch,item_name' });
    if (t1) { console.error('[updateThreshold] thresholds upsert failed:', t1.message); return; }
    let stockUpdate = supabase.from('branch_stock').update({ min_threshold: threshold }).eq('branch', branch);
    stockUpdate = itemBarcode != null ? stockUpdate.eq('item_barcode', itemBarcode) : stockUpdate.eq('item_name', itemName);
    const { error: t2 } = await stockUpdate;
    if (t2) console.error('[updateThreshold] stock update failed:', t2.message);
    set((s) => {
      const thresholds = { ...s.thresholds };
      thresholds[branch] = { ...thresholds[branch], [stockItem?.itemName ?? itemName]: threshold };
      const stock = { ...s.stock };
      stock[branch] = stock[branch].map((item) =>
        itemBarcode != null && item.itemBarcode != null
          ? item.itemBarcode === itemBarcode ? { ...item, minThreshold: threshold } : item
          : normalizeStockName(item.itemName) === normalizeStockName(itemName) ? { ...item, minThreshold: threshold } : item,
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
    const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : branch === 'SNB' || branch === 'Hosur' ? 'SNB' : null;
    if (catalogBranch) await useBranchCatalogStore.getState().loadCatalog(catalogBranch);
    const catalogItems = catalogBranch ? useBranchCatalogStore.getState().getActiveItems(catalogBranch) : [];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: orders } = await supabase
      .from('bakery_orders')
      .select('id, dispatch_log')
      .not('dispatch_log', 'is', null)
      .gte('created_at', sixMonthsAgo.toISOString());

    const { data: dispatchedCakeOrders, error: cakeDispatchError } = await supabase
      .from('cake_master_orders')
      .select('id,branch,order_no,cake_kg,prepared_quantity,flavor,cream_type,updated_at,created_at')
      .eq('branch', branch)
      .eq('status', 'Dispatched')
      .gte('created_at', sixMonthsAgo.toISOString());
    if (cakeDispatchError && !/cake_master_orders|does not exist|schema cache/i.test(cakeDispatchError.message)) {
      console.error('[syncIncoming] dispatched cake load failed:', cakeDispatchError.message);
    }

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

    // Recover cake orders dispatched before cake dispatch was connected to the
    // branch Incoming workflow. The deterministic id makes retries harmless.
    for (const cakeOrder of (dispatchedCakeOrders || []) as CakeDispatchSource[]) {
      if (existingDispatchIds.has(cakeIncomingDispatchId(cakeOrder.id))) continue;
      try {
        const { dispatchId } = await ensureCakeDispatchIncoming(cakeOrder, 'Packing');
        existingDispatchIds.add(dispatchId);
      } catch (cakeIncomingError) {
        console.error('[syncIncoming] cake dispatch recovery failed:', cakeIncomingError);
      }
    }

    const newEntries: {
      dispatch_id: string; item_name: string; item_barcode: number | null; quantity: number; unit: string;
      received_at: string; dispatched_by: string; branch: Branch;
    }[] = [];

    for (const order of orders) {
      const log = (order.dispatch_log || []) as {
        id: string; itemName: string; itemBarcode?: number; barcode?: number; quantity: number; unit?: string;
        branch: Branch; dispatchedAt: string; dispatchedBy: string;
      }[];
      log
        .filter((e) => e.branch === branch && !existingDispatchIds.has(e.id))
        .forEach((e) =>
          newEntries.push({
            dispatch_id:   e.id,
            item_name:     e.itemName,
            item_barcode:  e.itemBarcode ?? e.barcode ?? catalogItems.find((item) => normalizeStockName(item.name) === normalizeStockName(e.itemName))?.barcode ?? null,
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
    if (inc.disputed) return 'This incoming stock is disputed and must be reviewed before confirmation.';

    // Try atomic RPC first (deployed via migration)
    let canonicalConfirm = await supabase.rpc('confirm_incoming_stock_canonical', {
      p_incoming_id: incomingId, p_branch: branch,
    });
    if (canonicalConfirm.error && isMissingRpcError(canonicalConfirm.error.message ?? '')) {
      canonicalConfirm = await supabase.rpc('confirm_incoming_stock', {
        p_incoming_id: incomingId, p_branch: branch,
      });
    }
    const { error: rpcErr } = canonicalConfirm;
    if (!rpcErr) {
      await get().fetchBranchData(branch);
      return null;
    }

    // BUG #8 FIX: Fallback two-step path.
    // Re-read the incoming record to guard against a retry where stock was already
    // added but the mark-confirmed step failed. If confirmed=true in DB we skip stock add.
    const { data: freshInc } = await supabase
      .from('branch_incoming').select('confirmed, disputed, item_barcode').eq('id', incomingId).single();
    const alreadyConfirmedInDb = freshInc?.confirmed === true;
    if (freshInc?.disputed === true) return 'This incoming stock is disputed and must be reviewed before confirmation.';

    if (!alreadyConfirmedInDb) {
      const resolvedBarcode = inc.itemBarcode ?? (freshInc?.item_barcode != null ? Number(freshInc.item_barcode) : undefined);
      let existingQuery = supabase.from('branch_stock').select('quantity,item_barcode').eq('branch', branch);
      existingQuery = resolvedBarcode != null ? existingQuery.eq('item_barcode', resolvedBarcode) : existingQuery.eq('item_name', inc.itemName);
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // FIX (MD Bug #14): replace non-atomic read-quantity-then-write with a server-side
        // atomic increment RPC to prevent lost updates when two devices confirm stock
        // for different items of the same order at nearly the same instant. If the atomic
        // RPC is unavailable, fall back to the read-modify-write (same risk as before).
        const { error: rpcErr } = await incrementBranchStock(branch, inc.itemName, inc.quantity, resolvedBarcode);
        if (rpcErr) {
          // Atomic RPC not available — fall back to non-atomic path with a warning
          console.warn('[confirmIncoming] increment_branch_stock RPC unavailable, using non-atomic fallback:', rpcErr.message);
          const newQty = Math.round((existing.quantity + inc.quantity) * 1000) / 1000;
          let fallbackUpdate = supabase.from('branch_stock')
            .update({ quantity: newQty, unit: inc.unit, item_name: inc.itemName, item_barcode: resolvedBarcode ?? existing.item_barcode ?? null })
            .eq('branch', branch);
          fallbackUpdate = resolvedBarcode != null ? fallbackUpdate.eq('item_barcode', resolvedBarcode) : fallbackUpdate.eq('item_name', inc.itemName);
          const { error: stockErr } = await fallbackUpdate;
          if (stockErr) return `Failed to add to stock: ${stockErr.message}`;
        }
      } else {
        const { error: insErr } = await supabase.from('branch_stock')
          .insert({ branch, item_name: inc.itemName, item_barcode: resolvedBarcode ?? null, quantity: inc.quantity, unit: inc.unit, min_threshold: defaultMinThreshold(inc.unit) });
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
      const si = stock[branch].find((item) =>
        inc.itemBarcode != null && item.itemBarcode != null
          ? item.itemBarcode === inc.itemBarcode
          : normalizeStockName(item.itemName) === normalizeStockName(inc.itemName),
      );
      if (si) {
        stock[branch] = stock[branch].map((item) =>
          inc.itemBarcode != null && item.itemBarcode != null
            ? item.itemBarcode === inc.itemBarcode
              ? { ...item, quantity: Math.round((item.quantity + inc.quantity) * 1000) / 1000, unit: inc.unit }
              : item
            : normalizeStockName(item.itemName) === normalizeStockName(inc.itemName)
              ? { ...item, quantity: Math.round((item.quantity + inc.quantity) * 1000) / 1000, unit: inc.unit }
              : item,
        );
      } else {
        stock[branch] = [...stock[branch], {
          itemBarcode: inc.itemBarcode, itemName: inc.itemName, quantity: inc.quantity,
          reservedQuantity: 0, availableQuantity: inc.quantity,
          unit: inc.unit, minThreshold: 10, price: null,
        }];
      }
      return { incoming, stock };
    });
    return null;
  },

  // Confirm all unconfirmed incoming items at once (not restricted to today)
  confirmAllIncoming: async (branch) => {
    const toConfirm = get().incoming[branch].filter((i) => !i.confirmed && !i.disputed);
    if (toConfirm.length === 0) return null;

    for (const inc of toConfirm) {
      const err = await get().confirmIncoming(branch, inc.id);
      if (err) return err;
    }
    return null;
  },

  // ── SNB / Hosur sale — items come from price list, not stock requirement ──
  // Deducts stock when available, logs a mismatch when stock is 0 / insufficient.
  recordSnbSale: async (branch, itemName, qty, soldBy, paymentMethod, unitPrice, billNo, itemBarcode) => {
    const now = new Date().toISOString();
    const requestedStockName = normalizeStockName(itemName);
    const currentStock = get().stock[branch].find((stockItem) =>
      itemBarcode != null && stockItem.itemBarcode != null
        ? stockItem.itemBarcode === itemBarcode
        : normalizeStockName(stockItem.itemName) === requestedStockName,
    ) ?? null;
    const stockItemName = currentStock?.itemName ?? itemName;
    const resolvedBarcode = itemBarcode ?? currentStock?.itemBarcode;
    const availableQty = Number(currentStock?.quantity ?? 0);

    if (!currentStock) {
      return { error: `${itemName} has no stock entry and cannot be billed. Add stock before selling.`, mismatch: true };
    }
    if (availableQty <= 0) {
      return { error: `${itemName} is out of stock and cannot be billed.`, mismatch: true };
    }
    if (qty > availableQty) {
      return { error: `Only ${availableQty} available for ${itemName}. Requested ${qty}.`, mismatch: true };
    }

    const { data: newQtyRpc, error: rpcErr } = await decrementBranchStockStrict(branch, stockItemName, qty, resolvedBarcode);
    if (rpcErr) {
      console.error('[recordSnbSale] stock RPC error:', rpcErr.message);
      return { error: `Failed to update stock for ${itemName}: ${rpcErr.message}`, mismatch: true };
    }
    if (newQtyRpc === null) {
      return { error: `Insufficient stock for ${itemName}. Refresh stock and try again.`, mismatch: true };
    }
    const newQty = Math.round((newQtyRpc as number) * 1000) / 1000;
    const mismatch = false;

    // 2. Insert sales record
    const { data: saleData, error: saleErr } = await supabase
      .from('branch_sales')
      .insert({
        branch,
        item_name:      itemName,
        item_barcode:   resolvedBarcode ?? null,
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

    // 3. Update local state
    const newSale: SaleRecord = {
      id:            saleData.id,
      itemBarcode:   saleData.item_barcode != null ? Number(saleData.item_barcode) : resolvedBarcode,
      itemName:      saleData.item_name,
      quantitySold:  saleData.quantity_sold,
      soldAt:        saleData.sold_at,
      soldBy:        saleData.sold_by,
      branch,
      paymentMethod: saleData.payment_method ?? null,
      unitPrice:     saleData.unit_price != null ? Number(saleData.unit_price) : unitPrice,
      billNo:        saleData.bill_no ?? null,
    };

    set((s) => {
      const stock = { ...s.stock };
      const sales = { ...s.sales };
      stock[branch] = stock[branch].map((stockItem) =>
        resolvedBarcode != null && stockItem.itemBarcode != null
          ? stockItem.itemBarcode === resolvedBarcode ? { ...stockItem, quantity: newQty, availableQuantity: Math.max(0, newQty - Number(stockItem.reservedQuantity || 0)) } : stockItem
          : normalizeStockName(stockItem.itemName) === requestedStockName ? { ...stockItem, quantity: newQty, availableQuantity: Math.max(0, newQty - Number(stockItem.reservedQuantity || 0)) } : stockItem,
      );
      sales[branch] = [newSale, ...sales[branch]];
      return { stock, sales };
    });
    // Sync from DB after SNB sale to pick up any concurrent changes
    void get().fetchBranchData(branch);

    return { error: null, mismatch };
  },

  // ── Manual stock update — branch staff sets qty for any item ─────────────
  manualUpdateStock: async (branch, itemName, quantity, updatedBy, itemBarcode) => {
    const rounded = Math.round(quantity * 1000) / 1000;
    const now = new Date().toISOString();

    let existingQuery = supabase
      .from('branch_stock')
      .select('quantity,item_barcode')
      .eq('branch', branch);
    existingQuery = itemBarcode != null ? existingQuery.eq('item_barcode', itemBarcode) : existingQuery.eq('item_name', itemName);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const oldQty = Number(existing.quantity ?? 0);
      let updateQuery = supabase
        .from('branch_stock')
        .update({ quantity: rounded, item_name: itemName, item_barcode: itemBarcode ?? existing.item_barcode ?? null, last_updated_by: updatedBy, last_updated_at: now })
        .eq('branch', branch);
      updateQuery = itemBarcode != null ? updateQuery.eq('item_barcode', itemBarcode) : updateQuery.eq('item_name', itemName);
      const { error } = await updateQuery;
      if (error) return `Failed to update stock: ${error.message}`;
      // FIX (MD Bug #13): write an audit log row on every manual stock update so
      // owners can see who changed what, when, and by how much. Requires a
      // branch_stock_adjustments table — insert is best-effort (non-blocking).
      await supabase.from('branch_stock_adjustments').insert({
        branch,
        item_name: itemName,
        old_quantity: oldQty,
        new_quantity: rounded,
        delta: rounded - oldQty,
        reason: 'Manual stock update',
        adjusted_by: updatedBy,
        adjusted_at: now,
      }).then(() => {/* best-effort — don't block on audit log failure */});
    } else {
      const { error } = await supabase
        .from('branch_stock')
        .insert({ branch, item_name: itemName, item_barcode: itemBarcode ?? null, quantity: rounded, min_threshold: 0, last_updated_by: updatedBy, last_updated_at: now });
      if (error) return `Failed to create stock entry: ${error.message}`;
      // Audit log for new stock entry creation
      await supabase.from('branch_stock_adjustments').insert({
        branch, item_name: itemName, old_quantity: 0, new_quantity: rounded,
        delta: rounded, reason: 'Initial stock entry', adjusted_by: updatedBy, adjusted_at: now,
      }).then(() => {});
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
        id:          d.id,
        itemBarcode: d.item_barcode != null ? Number(d.item_barcode) : undefined,
        itemName:    d.item_name,
        branch:   d.branch as Branch,
        soldQty:  d.sold_qty,
        shortage: d.shortage,
        soldAt:   d.sold_at,
        soldBy:   d.sold_by,
      })),
    });
  },

  seedBranchItems: async (branch) => {
    const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : branch === 'SNB' || branch === 'Hosur' ? 'SNB' : null;
    if (catalogBranch) await useBranchCatalogStore.getState().loadCatalog(catalogBranch);
    const priceItems = catalogBranch
      ? useBranchCatalogStore.getState().items[catalogBranch].filter((item) => item.active)
      : BAKERY_ITEMS.map((item) => ({ ...item, barcode: undefined, uom: 'Nos' as const }));
    const rows = priceItems.map(item => ({
      branch,
      item_name:     item.name,
      item_barcode:  'barcode' in item ? item.barcode ?? null : null,
      quantity:      0,
      unit:          item.uom === 'Kgs' || item.uom === 'kg' ? 'kg' : 'pcs',
      min_threshold: defaultMinThreshold(item.uom),
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
      creditSales[branch] = (data || [])
        .filter((d): d is NonNullable<typeof d> => d != null && d.id != null)
        .map((d) => ({
          id:            d.id,
          branch:        d.branch as Branch,
          source:        d.source ?? null,
          sourceId:      d.source_id ?? null,
          customerRef:   d.customer_ref ?? null,
          customerName:  d.customer_name ?? 'Unknown',
          customerPhone: d.customer_phone ?? null,
          items:         ((d.items as CreditSaleItem[] | null) || []).filter((i): i is CreditSaleItem => i != null),
          subtotal:      Number(d.subtotal ?? 0),
          amountPaid:    Number(d.amount_paid ?? 0),
          creditAmount:  Number(d.credit_amount ?? 0),
          soldBy:        d.sold_by ?? 'Staff',
          createdAt:     d.created_at ?? new Date().toISOString(),
          dueDate:       d.due_date ?? null,
          settledAt:     d.settled_at ?? null,
          status:        (d.status ?? 'pending') as 'pending' | 'partial' | 'settled',
          notes:         d.notes ?? null,
          billNo:        d.bill_no ?? '',
          discountAmount: Number(d.discount_amount ?? 0),
        }));
      return { creditSales };
    });
  },

  fetchCreditPayments: async (branch) => {
    const { data, error } = await supabase
      .from('branch_credit_payments')
      .select('*')
      .eq('branch', branch)
      .order('created_at', { ascending: false });
    if (error) { console.error('[fetchCreditPayments]', error.message); return; }
    set((s) => {
      const creditPayments = { ...s.creditPayments };
      creditPayments[branch] = (data || [])
        .filter((d): d is NonNullable<typeof d> => d != null && d.id != null)
        .map((d) => ({
          id: d.id,
          creditSaleId: d.credit_sale_id,
          branch: d.branch as Branch,
          billNo: d.bill_no,
          amount: Number(d.amount ?? 0),
          paymentMode: (d.payment_mode ?? 'cash') as CreditPayment['paymentMode'],
          reference: d.reference ?? null,
          remarks: d.remarks ?? null,
          collectedBy: d.collected_by ?? 'Staff',
          collectedRole: d.collected_role ?? null,
          createdAt: d.created_at ?? new Date().toISOString(),
        }));
      return { creditPayments };
    });
  },

  recordCreditSale: async (branch, sale, options = {}) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('branch_credit_sales')
      .insert({
        branch,
        source:         sale.source ?? null,
        source_id:      sale.sourceId ?? null,
        customer_ref:   sale.customerRef ?? null,
        customer_name:  sale.customerName,
        customer_phone: sale.customerPhone ?? null,
        items:          sale.items,
        subtotal:       sale.subtotal,
        amount_paid:    sale.amountPaid,
        credit_amount:  sale.creditAmount,
        sold_by:        sale.soldBy,
        created_at:     now,
        due_date:       sale.dueDate ?? null,
        status:         sale.amountPaid >= sale.subtotal ? 'settled' : sale.amountPaid === 0 ? 'pending' : 'partial',
        notes:          sale.notes ?? null,
        bill_no:        sale.billNo,
      })
      .select()
      .single();
    if (error) return `Failed to record credit sale: ${error.message}`;

    const newSale: CreditSale = {
      id:            data.id,
      branch,
      source:        sale.source ?? null,
      sourceId:      sale.sourceId ?? null,
      customerRef:   sale.customerRef ?? null,
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
      status:        sale.amountPaid >= sale.subtotal ? 'settled' : sale.amountPaid === 0 ? 'pending' : 'partial',
      notes:         sale.notes ?? null,
      billNo:        sale.billNo,
    };

    if (sale.amountPaid > 0) {
      const { error: paymentError } = await supabase.from('branch_credit_payments').insert({
        credit_sale_id: data.id,
        branch,
        bill_no: sale.billNo,
        amount: sale.amountPaid,
        payment_mode: options.upfrontPaymentMode ?? 'cash',
        reference: options.reference ?? null,
        remarks: options.remarks ?? 'Credit upfront collection',
        collected_by: options.collectedBy ?? sale.soldBy,
        collected_role: options.collectedRole ?? null,
        created_at: now,
      });
      if (paymentError) return `Credit sale saved but upfront payment history failed: ${paymentError.message}`;
    }

    // Also write each item as a branch_sales row so revenue reports include credit sales.
    // payment_method='credit' marks these as credit-billed (goods delivered, payment pending).
    // They must NOT be excluded from revenue — the earning happened at point of sale.
    // FIX (MD Bug #8): skip branch_sales write for branch='Cafe'. Cafe credit orders are
    // already fully recorded in the orders table (source of truth for Cafe sales). Writing
    // to branch_sales creates dead data today and would cause double-counting if a future
    // Cafe item-wise report is ever built on branch_sales (mirroring the VRSNB/SNB pattern).
    const shouldWriteSalesRows = options.writeSalesRows !== false && branch !== 'Cafe';
    const salesRows = shouldWriteSalesRows ? sale.items.map(item => ({
      branch,
      item_name:      item.itemName,
      item_barcode:   item.barcode ?? null,
      quantity_sold:  item.quantity,
      sold_at:        now,
      sold_by:        sale.soldBy,
      payment_method: 'credit',
      unit_price:     item.price,
      bill_no:        sale.billNo,
    })) : [];
    if (salesRows.length > 0) {
      await supabase.from('branch_sales').insert(salesRows);
    }

    set((s) => {
      const creditSales = { ...s.creditSales };
      const creditPayments = { ...s.creditPayments };
      creditSales[branch] = [newSale, ...creditSales[branch]];
      if (sale.amountPaid > 0) {
        creditPayments[branch] = [{
          id: `pending-${data.id}`,
          creditSaleId: data.id,
          branch,
          billNo: sale.billNo,
          amount: sale.amountPaid,
          paymentMode: options.upfrontPaymentMode ?? 'cash',
          reference: options.reference ?? null,
          remarks: options.remarks ?? 'Credit upfront collection',
          collectedBy: options.collectedBy ?? sale.soldBy,
          collectedRole: options.collectedRole ?? null,
          createdAt: now,
        }, ...creditPayments[branch]];
      }
      return { creditSales, creditPayments };
    });
    return null;
  },

  settleCreditSale: async (branch, saleId, amountCollected, payment = {}) => {
    const sale = get().creditSales[branch].find((s) => s.id === saleId);
    if (!sale) return 'Credit sale not found';
    if (amountCollected <= 0) return 'Collection amount must be positive';
    if (amountCollected > sale.creditAmount) return 'Collection amount cannot be more than pending balance';

    const newAmountPaid = sale.amountPaid + amountCollected;
    const isSettled = newAmountPaid >= sale.subtotal;
    const now = new Date().toISOString();

    const { error } = await supabase.rpc('settle_branch_credit_sale', {
      p_credit_sale_id: saleId,
      p_branch: branch,
      p_amount: amountCollected,
      p_payment_mode: payment.mode ?? 'cash',
      p_reference: payment.reference ?? null,
      p_remarks: payment.remarks ?? null,
      p_collected_by: payment.collectedBy ?? 'Staff',
      p_collected_role: payment.collectedRole ?? null,
    });
    if (error) {
      const missingRpc = /settle_branch_credit_sale|could not find the function|function .* does not exist/i.test(error.message);
      return missingRpc
        ? 'Credit ledger is not installed in Supabase. Run the 20260614_branch_core_tables.sql and 20260614_branch_atomic_checkout_rpc.sql migration first.'
        : `Failed to settle credit sale: ${error.message}`;
    }

    // NOTE: Revenue was already recorded when the credit sale was billed.
    // settled_at is reused as the last collection time so daily closure can show collected credit.

    set((s) => {
      const creditSales = { ...s.creditSales };
      const creditPayments = { ...s.creditPayments };
      creditSales[branch] = creditSales[branch].map((cs) =>
        cs.id === saleId
          ? { ...cs, amountPaid: newAmountPaid, creditAmount: Math.max(0, cs.subtotal - newAmountPaid),
              status: isSettled ? 'settled' : 'partial', settledAt: now }
          : cs
      );
      creditPayments[branch] = [{
        id: `pending-${saleId}-${now}`,
        creditSaleId: saleId,
        branch,
        billNo: sale.billNo,
        amount: amountCollected,
        paymentMode: payment.mode ?? 'cash',
        reference: payment.reference ?? null,
        remarks: payment.remarks ?? null,
        collectedBy: payment.collectedBy ?? 'Staff',
        collectedRole: payment.collectedRole ?? null,
        createdAt: now,
      }, ...creditPayments[branch]];
      return { creditSales, creditPayments };
    });
    return null;
  },

  applyCreditDiscount: async (branch, saleId, discountAmount, reason, approvedBy) => {
    const sale = get().creditSales[branch].find((s) => s.id === saleId);
    if (!sale) return 'Credit sale not found';
    if (discountAmount <= 0) return 'Discount amount must be positive';
    if (discountAmount > sale.creditAmount) return 'Discount cannot exceed the pending balance';

    const { error } = await supabase.rpc('apply_branch_credit_discount', {
      p_branch: branch,
      p_credit_sale_id: saleId,
      p_discount_amount: discountAmount,
      p_reason: reason ?? null,
      p_approved_by: approvedBy ?? 'Admin',
    });
    if (error) {
      const missingRpc = /apply_branch_credit_discount|could not find the function|function .* does not exist/i.test(error.message);
      return missingRpc
        ? 'Discount feature is not installed in Supabase. Run the 20260709120000_branch_credit_discount.sql migration first.'
        : `Failed to apply discount: ${error.message}`;
    }

    const now = new Date().toISOString();
    const newDue = Math.max(0, sale.creditAmount - discountAmount);
    const isSettled = newDue <= 0;

    set((s) => {
      const creditSales = { ...s.creditSales };
      creditSales[branch] = creditSales[branch].map((cs) =>
        cs.id === saleId
          ? {
              ...cs,
              creditAmount: newDue,
              discountAmount: (cs.discountAmount ?? 0) + discountAmount,
              status: isSettled ? 'settled' : (cs.amountPaid > 0 ? 'partial' : 'pending'),
              settledAt: isSettled ? now : cs.settledAt,
              notes: [cs.notes, `Discount of ₹${discountAmount} applied${reason ? ' — ' + reason : ''} on ${now.slice(0, 10)}`]
                .filter(Boolean).join('\n'),
            }
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
    const existing = branchRealtimeSubscriptions.get(channelName);
    if (existing) {
      existing.subscribers += 1;
      return () => {
        existing.subscribers -= 1;
        if (existing.subscribers <= 0) {
          branchRealtimeSubscriptions.delete(channelName);
          void supabase.removeChannel(existing.channel);
        }
      };
    }

    const channel = supabase
      .channel(channelName)
      // branch_stock changes (confirms, manual updates, sales deductions)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_stock', filter: `branch=eq.${branch}` },
        () => { scheduleBranchRefetch(branch); },
      )
      // branch_incoming changes (new dispatches from packing, confirmations)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_incoming', filter: `branch=eq.${branch}` },
        () => { scheduleBranchRefetch(branch); },
      )
      // branch_sales changes (new sales so today's log is always current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'branch_sales', filter: `branch=eq.${branch}` },
        () => { scheduleBranchRefetch(branch); },
      )
      .subscribe();

    branchRealtimeSubscriptions.set(channelName, { channel, subscribers: 1 });

    // Return cleanup function
    return () => {
      const current = branchRealtimeSubscriptions.get(channelName);
      if (!current) return;
      current.subscribers -= 1;
      if (current.subscribers <= 0) {
        branchRealtimeSubscriptions.delete(channelName);
        void supabase.removeChannel(current.channel);
      }
    };
  },
}));
