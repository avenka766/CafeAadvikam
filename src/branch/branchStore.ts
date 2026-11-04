// src/branch/branchStore.ts
import { create } from 'zustand';
import {ScopedRefreshQueue} from '@/lib/scopedRefreshQueue';
import { supabase, fetchAllRows } from '@/lib/supabase';
import type { Branch } from './types';
import { BAKERY_ITEMS } from '@/bakery/types';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { useAuthStore } from '@/stores/authStore';
import { cakeIncomingDispatchId, ensureCakeDispatchIncoming, type CakeDispatchSource } from './cakeDispatchSync';
import { startOfBusinessDayISO } from '@/lib/businessDate';
import { useOfflineQueueStore, registerReplayHandler } from '@/lib/offlineQueue';
import {prepareStockCorrection,executeStockCorrection,type StockCorrectionRequest} from './stockCorrectionRequest';
import {prepareCreditAction,executeCreditAction,type CreditActionRequest} from './creditActionRequest';

import { isAdvanceOrderTagged, parseAdvanceOrderNotes } from '@/bakery/bakeryStore';
import { getCached, setCached } from '@/lib/localCache';

const normalizeStockName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// EGRESS FIX (2026-09-01): see fetchBranchData's own comment below for the
// full reasoning — this is the set of independently-refreshable pieces
// bundled inside it today.
export type BranchDataScope = 'stock' | 'sales' | 'incoming' | 'thresholds' | 'advance' | 'credit';
const ALL_BRANCH_DATA_SCOPES: BranchDataScope[] = ['stock', 'sales', 'incoming', 'thresholds', 'advance', 'credit'];

type BranchRealtimeSubscription = {
  channel: ReturnType<typeof supabase.channel>;
  subscribers: number;
};

const branchRealtimeSubscriptions = new Map<string, BranchRealtimeSubscription>();
const branchRefreshQueue=new ScopedRefreshQueue<BranchDataScope>(60_000);
let activeBranchLoads=0;
const branchLoadedStock=new Set<Branch>();
const pendingAdvanceCollections=new Set<string>();

const isMissingRpcError = (message: string) =>
  /could not find the function|function .* does not exist|schema cache/i.test(message);



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
  /** 'store' | 'custom' | 'cake' — which of the branch's own advance-order
   *  tabs this came from. Cake orders already flow through their own
   *  dedicated pipeline (Cake Dispatch) — see StoreAdvanceOrdersPanel in
   *  PlannerDashboard.tsx, which filters on this to avoid double-listing. */
  orderType?: 'store' | 'custom' | 'cake';
}

export interface BranchAdvanceOrder {
  id: string;
  branch: Branch;
  /** SNB-ADV-N / VRSNB-ADV-N — the human-facing number the branch and
   *  customer actually refer to this order by. */
  orderNo?: string;
  customerName: string | null;
  items: BranchAdvanceItem[];
  subtotal: number;
  advanceAmount: number;
  advanceMethod: string;
  balanceDue: number;
  /** Read-only reconciliation metadata; never rewrites historical payments. */
  finalizedInMain?: boolean;
  cancelledInMain?: boolean;
  mainFinalBillNo?: string | null;
  mainFinalizationProblem?: string | null;
  soldBy: string;
  createdAt: string;
  fullyPaidAt: string | null;
  balanceMethod: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  notes?: string | null;
  reservationStatus?: 'none' | 'reserved' | 'consumed' | 'released';
  /** ISO date string (YYYY-MM-DD) — the date the customer wants delivery */
  deliveryDate: string | null;
  // Legacy orders remain reportable and completable through the guarded server
  // workflow. Current advance creation uses the canonical New Bill path.
  dispatchedAt?: string | null;
  dispatchedBy?: string | null;
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
  disputedReceivedQuantity?: number | null;
  returnRequested?: boolean;
  returnRequestedAt?: string | null;
  returnRequestedBy?: string | null;
  transferInReturnId?: string | null;
  /** SNB-ADV-N / VRSNB-ADV-N tag when this incoming item was dispatched from
   *  an advance order, so the SNB/VRSNB Order Dashboard's Stock/Incoming tab
   *  can show it next to the item — null for a regular (non-advance) item. */
  advanceOrderNo?: string | null;
  /** TO/26-27/N dispatch invoice number this item was dispatched under —
   *  backfilled by DispatchReviewModal right after the invoice is minted
   *  (submitDispatch itself runs before the invoice number exists). Null for
   *  older pre-fix rows and for the rare sync-recovery path. */
  invoiceNo?: string | null;
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
  // EGRESS FIX (2026-09-01): `scopes` narrows which of the 10 underlying
  // queries actually run — omitted (the default) means "everything", so
  // every one of this function's 60+ existing call sites keeps behaving
  // exactly as before with zero code changes on their end. A caller that
  // knows exactly what its own mutation touched (e.g. a sale only ever
  // changes stock+sales, never incoming/advance/credit) can pass a narrow
  // scope to skip the other 7 queries entirely. See BRANCH_DATA_SCOPES.
  fetchBranchData: (branch: Branch, force?: boolean, scopes?: BranchDataScope[]) => Promise<void>;
  // EGRESS FIX: explicit, on-demand fetch for a historical date range — used
  // only by Owner/Admin Reports screens when they pick a range beyond today.
  // Returns data directly rather than writing into the always-on `sales`
  // cache, so it never gets pulled in by the frequent branch-dashboard fetch
  // path above.
  fetchBranchSalesRange: (branch: Branch, fromDateISO: string, toDateISO: string) => Promise<SaleRecord[]>;
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
  manualUpdateStock: (
    branch: Branch,
    itemName: string,
    quantity: number,
    updatedBy: string,
    itemBarcode?: number,
    audit?: { reason?: string; referenceId?: string; notes?: string },
    // BUG FIX (audit 2026-08-10): optional optimistic-concurrency guard.
    // When the caller knows what quantity it started editing from (e.g. the
    // interactive Manual Stock Update panel), pass it here so a concurrent
    // sale that changed the real DB quantity in between isn't silently
    // clobbered by this "set absolute value" write. Left undefined for
    // every other existing caller (Purchase Return, Stock Audit
    // reconciliation, etc.) so their current behavior is unchanged.
    expectedCurrentQty?: number,
  ) => Promise<string | null>;
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
  fetchCreditSales: (branch: Branch, fromISO?: string, untilISO?: string) => Promise<void>;
  fetchCreditPayments: (branch: Branch, fromISO?: string, untilISO?: string) => Promise<void>;
  // ── Live stock ────────────────────────────────────────────────────────────
  subscribeToStock:   (branch: Branch) => () => void; // returns unsubscribe fn
}

type RealtimeRowEvent = {
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

function changedRow(event: RealtimeRowEvent) {
  return event.new && Object.keys(event.new).length > 0 ? event.new : event.old ?? {};
}

// REALTIME FIX (2026-09-01): pure reducer — computes the partial state
// update for one realtime event without calling setState itself, so the
// batched flush below (applyBranchRealtimeChange) can fold several buffered
// events into a single setState call.
function computeBranchRealtimeChange(state: BranchState, branch: Branch, table: string, payload: unknown): Partial<BranchState> {
  const event = payload as RealtimeRowEvent;
  const row = changedRow(event);
  const id = String(row.id ?? '');

  {
    if (table === 'branch_stock') {
      const barcode = row.item_barcode == null ? undefined : Number(row.item_barcode);
      const name = String(row.item_name ?? '');
      const matches = (item: StockItem) => barcode != null
        ? item.itemBarcode === barcode
        : normalizeStockName(item.itemName) === normalizeStockName(name);
      const current = state.stock[branch] ?? [];
      if (event.eventType === 'DELETE') {
        return { stock: { ...state.stock, [branch]: current.filter((item) => !matches(item)) } };
      }
      if (!name) return state;
      const previous = current.find(matches);
      const quantity = Number(row.quantity ?? 0);
      const reservedQuantity = Number(row.reserved_quantity ?? 0);
      const next: StockItem = {
        itemBarcode: barcode,
        itemName: name,
        quantity,
        reservedQuantity,
        availableQuantity: Math.max(0, quantity - reservedQuantity),
        updatedAt: String(row.updated_at ?? ''),
        lastUpdatedAt: String(row.last_updated_at ?? ''),
        unit: row.unit === 'pcs' ? 'pcs' : 'kg',
        minThreshold: Number(row.min_threshold ?? previous?.minThreshold ?? 10),
        price: previous?.price ?? null,
      };
      return { stock: { ...state.stock, [branch]: [...current.filter((item) => !matches(item)), next].sort((a, b) => a.itemName.localeCompare(b.itemName)) } };
    }

    if (table === 'branch_incoming' && id) {
      const current = state.incoming[branch] ?? [];
      if (event.eventType === 'DELETE') return { incoming: { ...state.incoming, [branch]: current.filter((item) => item.id !== id) } };
      const quantity = Number(row.quantity ?? 0);
      const next: IncomingStock = {
        id,
        itemBarcode: row.item_barcode == null ? undefined : Number(row.item_barcode),
        itemName: String(row.item_name ?? ''),
        quantity,
        reservedQuantity: 0,
        availableQuantity: quantity,
        unit: row.unit === 'pcs' ? 'pcs' : 'kg',
        receivedAt: String(row.received_at ?? ''),
        dispatchedBy: String(row.dispatched_by ?? ''),
        confirmed: Boolean(row.confirmed),
        disputed: Boolean(row.disputed),
        disputeReason: row.dispute_reason == null ? null : String(row.dispute_reason),
        disputedBy: row.disputed_by == null ? null : String(row.disputed_by),
        disputedAt: row.disputed_at == null ? null : String(row.disputed_at),
        disputedReceivedQuantity: row.disputed_received_quantity == null ? null : Number(row.disputed_received_quantity),
        returnRequested: Boolean(row.return_requested),
        returnRequestedAt: row.return_requested_at == null ? null : String(row.return_requested_at),
        returnRequestedBy: row.return_requested_by == null ? null : String(row.return_requested_by),
        transferInReturnId: row.transfer_in_return_id == null ? null : String(row.transfer_in_return_id),
        advanceOrderNo: row.advance_order_no == null ? null : String(row.advance_order_no),
        invoiceNo: row.invoice_no == null ? null : String(row.invoice_no),
      };
      return { incoming: { ...state.incoming, [branch]: [next, ...current.filter((item) => item.id !== id)].slice(0, 500) } };
    }

    if (table === 'branch_sales' && id) {
      const current = state.sales[branch] ?? [];
      if (event.eventType === 'DELETE') return { sales: { ...state.sales, [branch]: current.filter((sale) => sale.id !== id) } };
      const next: SaleRecord = {
        id,
        itemBarcode: row.item_barcode == null ? undefined : Number(row.item_barcode),
        itemName: String(row.item_name ?? ''),
        quantitySold: Number(row.quantity_sold ?? 0),
        soldAt: String(row.sold_at ?? ''),
        soldBy: String(row.sold_by ?? ''),
        branch,
        paymentMethod: row.payment_method == null ? null : String(row.payment_method),
        unitPrice: Number(row.unit_price ?? 0),
        billNo: row.bill_no == null ? null : String(row.bill_no),
      };
      return { sales: { ...state.sales, [branch]: [next, ...current.filter((sale) => sale.id !== id)] } };
    }

    if (table === 'branch_advance_orders' && id) {
      const current = state.advanceOrders[branch] ?? [];
      if (event.eventType === 'DELETE') return { advanceOrders: { ...state.advanceOrders, [branch]: current.filter((order) => order.id !== id) } };
      const next: BranchAdvanceOrder = {
        ...current.find((order) => order.id === id),
        id,
        branch,
        customerName: row.customer_name == null ? null : String(row.customer_name),
        items: (row.items as BranchAdvanceItem[] | undefined) ?? [],
        subtotal: Number(row.subtotal ?? 0),
        advanceAmount: Number(row.advance_amount ?? 0),
        advanceMethod: String(row.advance_method ?? ''),
        balanceDue: Number(row.balance_due ?? 0),
        soldBy: String(row.sold_by ?? ''),
        createdAt: String(row.created_at ?? ''),
        fullyPaidAt: row.fully_paid_at == null ? null : String(row.fully_paid_at),
        balanceMethod: row.balance_method == null ? null : String(row.balance_method),
        status: (row.status ?? 'pending') as BranchAdvanceOrder['status'],
        deliveryDate: row.delivery_date == null ? null : String(row.delivery_date),
        notes: row.notes == null ? null : String(row.notes),
        reservationStatus: (row.reservation_status ?? 'none') as BranchAdvanceOrder['reservationStatus'],
      };
      return { advanceOrders: { ...state.advanceOrders, [branch]: [next, ...current.filter((order) => order.id !== id)].slice(0, 3000) } };
    }

    if (table === 'branch_credit_sales' && id) {
      const current = state.creditSales[branch] ?? [];
      if (event.eventType === 'DELETE') return { creditSales: { ...state.creditSales, [branch]: current.filter((sale) => sale.id !== id) } };
      const next: CreditSale = {
        id,
        branch,
        source: row.source == null ? null : String(row.source),
        sourceId: row.source_id == null ? null : String(row.source_id),
        customerRef: row.customer_ref == null ? null : String(row.customer_ref),
        customerName: String(row.customer_name ?? 'Unknown'),
        customerPhone: row.customer_phone == null ? null : String(row.customer_phone),
        items: ((row.items as CreditSaleItem[] | undefined) ?? []).filter(Boolean),
        subtotal: Number(row.subtotal ?? 0),
        amountPaid: Number(row.amount_paid ?? 0),
        creditAmount: Number(row.credit_amount ?? 0),
        soldBy: String(row.sold_by ?? 'Staff'),
        createdAt: String(row.created_at ?? ''),
        dueDate: row.due_date == null ? null : String(row.due_date),
        settledAt: row.settled_at == null ? null : String(row.settled_at),
        status: (row.status ?? 'pending') as CreditSale['status'],
        notes: row.notes == null ? null : String(row.notes),
        billNo: String(row.bill_no ?? ''),
        discountAmount: Number(row.discount_amount ?? 0),
      };
      return { creditSales: { ...state.creditSales, [branch]: [next, ...current.filter((sale) => sale.id !== id)].slice(0, 3000) } };
    }

    if (table === 'branch_credit_payments' && id) {
      const current = state.creditPayments[branch] ?? [];
      if (event.eventType === 'DELETE') return { creditPayments: { ...state.creditPayments, [branch]: current.filter((payment) => payment.id !== id) } };
      const next: CreditPayment = {
        id,
        creditSaleId: String(row.credit_sale_id ?? ''),
        branch,
        billNo: String(row.bill_no ?? ''),
        amount: Number(row.amount ?? 0),
        paymentMode: (row.payment_mode ?? 'cash') as CreditPayment['paymentMode'],
        reference: row.reference == null ? null : String(row.reference),
        remarks: row.remarks == null ? null : String(row.remarks),
        collectedBy: String(row.collected_by ?? ''),
        collectedRole: row.collected_role == null ? null : String(row.collected_role),
        createdAt: String(row.created_at ?? ''),
      };
      return { creditPayments: { ...state.creditPayments, [branch]: [next, ...current.filter((payment) => payment.id !== id)].slice(0, 3000) } };
    }

    return {};
  }
}

// STAGE B (2026-09-01): offline-queue wiring for updateThreshold — the one
// write path in this store simple and idempotent enough to queue-and-replay
// blindly (no stock availability check, no price validation, no atomic
// numbering — setting a threshold to X twice has the same end result as
// once). branchStore.ts's other 13 write functions are RPC calls carrying
// real server-side business logic (stock decrement, price canonicalization,
// credit/wallet limits) — the same oversell/stale-validation risk already
// flagged for Stage C (offline checkout) in the project plan, so they're
// deliberately NOT wired here; they still work online exactly as before,
// and simply fail (as they already did pre-this-change) if attempted
// offline, with no optimistic state applied so nothing misleading is shown.
// OFFLINE FIX (2026-10-01): "Phase 1 — branch stock + billing offline" —
// fetchBranchData's result was ONLY ever held in memory (Zustand state),
// never persisted. The existing offline queue already lets billing WRITES
// (recordSale, recordCreditSale, confirmIncoming, etc. — see the
// registerReplayHandler calls below) succeed while offline, but a page
// reload or app restart while offline had nothing to read — stock, today's
// sales, open credit/advance — leaving a blank dashboard even though the
// write side was already safe. This persists the same six scoped slices
// fetchBranchData already fetches into the same IndexedDB cache orderStore.ts
// uses for Cafe orders, and hydrates from it once per branch per session
// before the first real fetch resolves — same "stale-while-revalidate"
// shape, not a new pattern. Never overwrites state a real fetch already
// populated (checked via stock.length/lastSyncedAt), so a fast network
// response always wins over the cached snapshot.
const BRANCH_DATA_CACHE_PREFIX = 'branch_data_v1_';
const branchDataCacheHydrated = new Set<Branch>();

type CachedBranchData = {
  stock: StockItem[];
  sales: SaleRecord[];
  incoming: IncomingStock[];
  thresholds: Record<string, number>;
  advanceOrders: BranchAdvanceOrder[];
  creditSales: CreditSale[];
  cachedAt: string;
};

export async function hydrateBranchDataFromCache(branch: Branch): Promise<void> {
  if (branchDataCacheHydrated.has(branch)) return;
  branchDataCacheHydrated.add(branch);
  const cached = await getCached<CachedBranchData>(`${BRANCH_DATA_CACHE_PREFIX}${branch}`);
  if (!cached) return;
  useBranchStore.setState((s) => {
    // A real fetch may have already landed (or be in flight and about to
    // land) before this cache read resolves — never clobber fresher state.
    // branchLoadedStock records branches fetchBranchData
    // itself stamps on every successful completion (see below).
    if (s.stock[branch].length > 0 || branchLoadedStock.has(branch)) return {};
    return {
      stock: { ...s.stock, [branch]: cached.stock ?? [] },
      sales: { ...s.sales, [branch]: cached.sales ?? [] },
      incoming: { ...s.incoming, [branch]: cached.incoming ?? [] },
      thresholds: { ...s.thresholds, [branch]: cached.thresholds ?? {} },
      advanceOrders: { ...s.advanceOrders, [branch]: cached.advanceOrders ?? [] },
      creditSales: { ...s.creditSales, [branch]: cached.creditSales ?? [] },
    };
  });
}

type ThresholdUpdatePayload = { branch: Branch; itemName: string; itemBarcode: number | null; threshold: number };

async function writeThresholdUpdate(payload: ThresholdUpdatePayload): Promise<{ ok: boolean; error?: string }> {
  const { branch, itemName, itemBarcode, threshold } = payload;
  const { error: t1 } = await supabase
    .from('branch_thresholds')
    .upsert({ branch, item_name: itemName, item_barcode: itemBarcode, threshold }, { onConflict: 'branch,item_name' });
  if (t1) return { ok: false, error: t1.message };
  let stockUpdate = supabase.from('branch_stock').update({ min_threshold: threshold }).eq('branch', branch);
  stockUpdate = itemBarcode != null ? stockUpdate.eq('item_barcode', itemBarcode) : stockUpdate.eq('item_name', itemName);
  const { error: t2 } = await stockUpdate;
  if (t2) return { ok: false, error: t2.message };
  return { ok: true };
}

registerReplayHandler('branch_threshold_update', async (_kind, payload) => writeThresholdUpdate(payload as ThresholdUpdatePayload));

// STAGE B/C (2026-09-01): replays a branch sale (SNB/VRSNB/Hosur counter
// billing, recordSale) that was completed offline. Redoes the real atomic
// stock decrement + sale insert, then reconciles local state: the
// provisional sale row (client-generated id, no real DB row yet) is
// replaced by the real one, and stock is corrected to the RPC's
// authoritative post-decrement value (not the optimistic guess recordSale
// made from possibly-stale local stock data).


registerReplayHandler('branch_record_sale', async () => ({ok:false,error:'This older offline financial action needs Admin reconciliation before replay. Its saved details are preserved because the original stock or money write may already have completed.'}));

registerReplayHandler('branch_record_advance_order', async () => ({ok:false,error:'This older offline financial action needs Admin reconciliation before replay. Its saved details are preserved because the original stock or money write may already have completed.'}));

registerReplayHandler('branch_collect_advance_balance', async (_kind, payload) => {
  const p = payload as { branch: Branch; orderId: string; balanceMethod: string; completedBy: string };
  const { data, error } = await supabase.rpc('complete_branch_advance_order_reserved', {
    p_branch: p.branch, p_order_id: p.orderId, p_balance_method: p.balanceMethod, p_completed_by: p.completedBy,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as Record<string, unknown>;
  useBranchStore.setState((state) => {
    const advanceOrders = { ...state.advanceOrders };
    advanceOrders[p.branch] = advanceOrders[p.branch].map((entry) => entry.id === p.orderId ? {
      ...entry, status: 'completed' as const, fullyPaidAt: String(row.fully_paid_at || new Date().toISOString()),
      balanceMethod: p.balanceMethod, balanceDue: 0, reservationStatus: 'consumed' as const,
    } : entry);
    return { advanceOrders };
  });
  // The RPC's stock-deduct + sale-record effects live server-side only —
  // reconcile both from a real fetch rather than guess at them.
  await useBranchStore.getState().fetchBranchData(p.branch, true, ['stock', 'sales']);
  return { ok: true };
});

registerReplayHandler('branch_record_credit_sale', async (_kind, payload) => {
  const p=payload as {branch:Branch;request?:CreditActionRequest};
  const {error}=await executeCreditAction(p.request);
  if(error)return {ok:false,error:error.message};
  await useBranchStore.getState().fetchBranchData(p.branch,true,['credit','sales']);return {ok:true};
});

registerReplayHandler('branch_settle_credit_sale', async (_kind, payload) => {
  const p = payload as {branch:Branch;request?:CreditActionRequest};
  if(!p.request)return {ok:false,error:'Older queued credit collection needs reconciliation before replay. It may already have been recorded.'};
  const {error}=await executeCreditAction(p.request);
  if(error)return {ok:false,error:error.message};
  await useBranchStore.getState().fetchBranchData(p.branch,true,['credit']);
  return {ok:true};
});

registerReplayHandler('branch_apply_credit_discount', async (_kind, payload) => {
  const p = payload as {branch:Branch;request?:CreditActionRequest};
  if(!p.request)return {ok:false,error:'Older queued credit discount needs reconciliation before replay. It may already have been recorded.'};
  const {error}=await executeCreditAction(p.request);
  if(error)return {ok:false,error:error.message};
  await useBranchStore.getState().fetchBranchData(p.branch,true,['credit']);
  return {ok:true};
});

registerReplayHandler('branch_manual_stock_delta', async (_kind, payload) => {
  const p=payload as {branch:Branch;request?:StockCorrectionRequest};
  const {error}=await executeStockCorrection(p.request);
  if(error)return {ok:false,error:error.message};
  await useBranchStore.getState().fetchBranchData(p.branch,true,['stock']);
  return {ok:true};
});

const incomingConfirmInFlight=new Set<string>();

registerReplayHandler('branch_confirm_incoming', async (_kind, payload) => {
  const p = payload as { branch: Branch; incomingId: string };
  let confirm = await supabase.rpc('confirm_incoming_stock_canonical', { p_incoming_id: p.incomingId, p_branch: p.branch });
  if (confirm.error && isMissingRpcError(confirm.error.message ?? '')) {
    confirm = await supabase.rpc('confirm_incoming_stock', { p_incoming_id: p.incomingId, p_branch: p.branch });
  }
  if (confirm.error && !confirm.error.message?.includes('ALREADY_SYNCED:')) return { ok: false, error: confirm.error.message };
  await useBranchStore.getState().fetchBranchData(p.branch, true, ['stock', 'incoming']);
  return { ok: true };
});

// SNB counter billing's own sale path (recordSnbSale) — identical write
// Old persisted sales require reconciliation; replay must not repeat a stock debit.
registerReplayHandler('branch_record_snb_sale', async () => ({ok:false,error:'This older offline financial action needs Admin reconciliation before replay. Its saved details are preserved because the original stock or money write may already have completed.'}));

// EGRESS FIX (2026-09-01): buffers realtime events per (branch, table, row)
// for a short window before applying — same coalescing pattern already
// proven in orderStore.ts's ORDER_EVENT_FLUSH_MS, so a burst of many rapid
// changes (e.g. a bulk dispatch touching dozens of stock rows at once)
// collapses into one setState call instead of one per row.
const BRANCH_REALTIME_FLUSH_MS = 200;
let pendingBranchRealtimeEvents = new Map<string, { branch: Branch; table: string; payload: unknown }>();
let branchRealtimeFlushTimer: ReturnType<typeof setTimeout> | null = null;

function applyBranchRealtimeChange(branch: Branch, table: string, payload: unknown) {
  const event = payload as RealtimeRowEvent;
  const row = changedRow(event);
  // branch_stock rows have no `id` column — key on barcode/name instead
  // (matching computeBranchRealtimeChange's own match logic for that table)
  // so rapid updates to different items don't collapse into just the last one.
  const rowKey = table === 'branch_stock'
    ? (row.item_barcode != null ? `bc:${Number(row.item_barcode)}` : `nm:${normalizeStockName(String(row.item_name ?? ''))}`)
    : String(row.id ?? '');
  const key = `${branch}|${table}|${rowKey}`;
  pendingBranchRealtimeEvents.set(key, { branch, table, payload });
  if (branchRealtimeFlushTimer) return;
  branchRealtimeFlushTimer = setTimeout(() => {
    const events = pendingBranchRealtimeEvents;
    pendingBranchRealtimeEvents = new Map();
    branchRealtimeFlushTimer = null;
    useBranchStore.setState((state) => {
      let working = state;
      let merged: Partial<BranchState> = {};
      for (const { branch: b, table: t, payload: p } of events.values()) {
        const partial = computeBranchRealtimeChange(working, b, t, p);
        if (Object.keys(partial).length > 0) {
          working = { ...working, ...partial };
          merged = { ...merged, ...partial };
        }
      }
      return merged;
    });
  }, BRANCH_REALTIME_FLUSH_MS);
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

  fetchBranchData: async (branch, force = false, scopesArg) => {
    const key=`${useAuthStore.getState().currentUser?.id??'signed-out'}:${branch}:${startOfBusinessDayISO()}`;
    await branchRefreshQueue.request(key,scopesArg??ALL_BRANCH_DATA_SCOPES,force,async requestedScopes=>{
    const scopes = new Set(requestedScopes);
    const wantStock = scopes.has('stock');
    const wantSales = scopes.has('sales');
    const wantIncoming = scopes.has('incoming');
    const wantThresholds = scopes.has('thresholds');
    const wantAdvance = scopes.has('advance');
    const wantCredit = scopes.has('credit');

    activeBranchLoads++;
    set({ loading: true });
    try {
      // EGRESS FIX: the live branch dashboard only ever needs to show *today's*
      // sales bills, today's supplies-in, and *currently open* advance/credit
      // orders (whenever they were created — those are still-owed money /
      // still-due deliveries, not history). A rolling 30-day window here was
      // the single largest contributor to PostgREST egress: this query used to
      // run on every mutation, every 30s background sync, and every dashboard
      // mount, each time re-downloading up to a month of sales/advance/credit
      // rows. Historical ranges beyond today are now only fetched on demand by
      // Owner/Admin from the Reports tab, via fetchBranchSalesRange() (see
      // below) — a separate, explicitly-triggered call that never touches this
      // always-on cache.
      const startOfToday = startOfBusinessDayISO();

      // Only stock rows need a price lookup — skip the catalog load entirely
      // for a scope that never touches stock.
      const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : branch === 'SNB' || branch === 'Hosur' ? 'SNB' : null;
      if (wantStock && catalogBranch) await useBranchCatalogStore.getState().loadCatalog(catalogBranch);
      const catalogItems = (wantStock && catalogBranch) ? useBranchCatalogStore.getState().items[catalogBranch] : [];

      // EGRESS FIX (2026-09-01): each entry below now only fires its real
      // query when its scope was actually requested — skipped ones resolve
      // to `{ data: null }` immediately (no network call). null vs [] is
      // meaningful downstream: the merge in set() below only touches a
      // state slice when its scope was requested, so a skipped query's
      // null can never be mistaken for "fetched, genuinely empty" and wipe
      // out already-correct state for that branch.
      const SKIP = Promise.resolve({ data: null } as { data: null });
      const queryResults = await Promise.all([
        // EGRESS FIX (2026-09-01): real observed counts checked directly
        // against live data before shrinking these — branch_stock's actual
        // max across all 3 branches is ~450 rows, so 2000 was ~4.4x oversized
        // headroom for no real benefit. 600 still leaves comfortable room to
        // grow without silently truncating a real branch's stock list.
        wantStock ? supabase.from('branch_stock')
          .select('item_barcode,item_name,quantity,reserved_quantity,updated_at,last_updated_at,unit,min_threshold')
          .eq('branch', branch).order('updated_at', { ascending: false }).limit(600) : SKIP,
        // EGRESS FIX: today only (was a 30-day unbounded window).
        // EGRESS FIX (2026-09-01): shrunk 3000 -> 800, same reasoning as
        // branch_stock above (a single branch's real daily sale count is
        // nowhere near 3000; 800 is still generous headroom for a busy day).
        wantSales ? supabase.from('branch_sales')
          .select('id,item_barcode,item_name,quantity_sold,sold_at,sold_by,branch,payment_method,unit_price,bill_no')
          .eq('branch', branch)
          .gte('sold_at', startOfToday)
          .order('sold_at', { ascending: false })
          .limit(800) : SKIP,
        // EGRESS FIX: today's supplies-in only. Anything still unconfirmed from
        // an earlier day still needs to surface for action, so that's merged in
        // separately below with its own small cap.
        // EGRESS FIX (2026-09-01): shrunk 1000 -> 300 — real observed max for
        // "today's incoming" across all 3 branches is ~67 rows.
        wantIncoming ? supabase.from('branch_incoming')
          .select('id,item_barcode,item_name,quantity,unit,received_at,dispatched_by,confirmed,disputed,dispute_reason,disputed_by,disputed_at,disputed_received_quantity,return_requested,return_requested_at,return_requested_by,transfer_in_return_id,advance_order_no,invoice_no')
          .eq('branch', branch)
          .gte('received_at', startOfToday)
          .order('received_at', { ascending: false }).limit(300) : SKIP,
        wantThresholds ? supabase.from('branch_thresholds').select('item_name,threshold').eq('branch', branch) : SKIP,
        // SNB/VRSNB/Hosur prices already come from the cached live branch
        // catalogue. Only Cafe still needs the legacy bakery price fallback.
        !wantStock ? SKIP : catalogBranch
          ? Promise.resolve({ data: [] as Array<{ name: string; price: number | null }> })
          : supabase.from('bakery_items').select('name, price'),
        // EGRESS FIX: "recent" advance orders now means *today's* advance
        // orders (was: last 1000 rows regardless of age).
        // EGRESS FIX (2026-09-01): shrunk 1000 -> 300 — this is a same-day-
        // only window, not a backlog; the still-open backlog below (which
        // genuinely can grow large and must NOT be truncated) is untouched.
        wantAdvance ? supabase.from('branch_advance_orders_reporting')
          .select('id,branch,order_no,customer_name,items,subtotal,advance_amount,advance_method,balance_due,sold_by,created_at,fully_paid_at,balance_method,status,delivery_date,notes,reservation_status,dispatched_at,dispatched_by,finalized_in_main,cancelled_in_main,main_final_bill_no,main_finalization_problem')
          .eq('branch', branch)
          .gte('created_at', startOfToday)
          .order('created_at', { ascending: false })
          .limit(300) : SKIP,
        // EGRESS FIX: "recent" credit sales now means *today's* credit sales
        // (was: last 1000 rows regardless of age).
        // EGRESS FIX (2026-09-01): shrunk 1000 -> 300, same reasoning as
        // advance orders above — same-day-only, the unsettled backlog below
        // is untouched.
        wantCredit ? supabase.from('branch_credit_sales')
          .select('id,branch,source,source_id,customer_ref,customer_name,customer_phone,items,subtotal,amount_paid,credit_amount,sold_by,created_at,due_date,settled_at,status,notes,bill_no,discount_amount')
          .eq('branch', branch)
          .gte('created_at', startOfToday)
          .order('created_at', { ascending: false })
          .limit(300) : SKIP,
        // An old advance order that's still unsettled represents money owed /
        // a delivery still due, and must not disappear just because it wasn't
        // created today. Fetch open ones separately, unbounded by recency
        // (still capped defensively), and merge below.
        wantAdvance ? supabase.from('branch_advance_orders_reporting')
          .select('id,branch,order_no,customer_name,items,subtotal,advance_amount,advance_method,balance_due,sold_by,created_at,fully_paid_at,balance_method,status,delivery_date,notes,reservation_status,dispatched_at,dispatched_by,finalized_in_main,cancelled_in_main,main_final_bill_no,main_finalization_problem')
          .eq('branch', branch)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1000) : SKIP,
        wantCredit ? supabase.from('branch_credit_sales')
          .select('id,branch,source,source_id,customer_ref,customer_name,customer_phone,items,subtotal,amount_paid,credit_amount,sold_by,created_at,due_date,settled_at,status,notes,bill_no,discount_amount')
          .eq('branch', branch)
          .neq('status', 'settled')
          .order('created_at', { ascending: false })
          .limit(1000) : SKIP,
        // An unconfirmed delivery from an earlier day still needs action, so
        // pull those regardless of date too (small cap — this should normally
        // be empty or tiny).
        wantIncoming ? supabase.from('branch_incoming')
          .select('id,item_barcode,item_name,quantity,unit,received_at,dispatched_by,confirmed,disputed,dispute_reason,disputed_by,disputed_at,disputed_received_quantity,return_requested,return_requested_at,return_requested_by,transfer_in_return_id,advance_order_no,invoice_no')
          .eq('branch', branch)
          .eq('confirmed', false)
          .order('received_at', { ascending: false })
          .limit(300) : SKIP,
      ]);
      const failed=queryResults.filter(result=>'error' in result&&result.error);
      if(failed.length)throw Error(failed.map(result=>'error' in result&&result.error?result.error.message:'Read failed').join(' | '));
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
        { data: openIncomingData },
      ] = queryResults;

      // Build a name → price lookup from bakery_items
      const priceMap: Record<string, number | null> = {};
      (priceData || []).forEach((d) => {
        priceMap[d.name] = d.price != null ? Number(d.price) : null;
      });
      catalogItems.forEach((item) => { priceMap[item.name] = item.price; });
      const priceByBarcode = new Map(catalogItems.map((item) => [item.barcode, item.price]));

      set((s) => {
        // EGRESS FIX (2026-09-01): only the slices actually fetched this
        // call get rebuilt below — everything else is passed through from
        // existing state untouched, so a narrow-scope call can never wipe
        // out data for a slice it didn't request.
        const stock         = wantStock ? { ...s.stock } : s.stock;
        const sales         = wantSales ? { ...s.sales } : s.sales;
        const incoming      = wantIncoming ? { ...s.incoming } : s.incoming;
        const thresholds    = wantThresholds ? { ...s.thresholds } : s.thresholds;
        const advanceOrders = wantAdvance ? { ...s.advanceOrders } : s.advanceOrders;
        const creditSales   = wantCredit ? { ...s.creditSales } : s.creditSales;

        if (wantStock) {
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
        }

        if (wantSales) {
          sales[branch] = (salesData || []).map((d) => ({
            id:            d.id,
            itemBarcode:   d.item_barcode != null ? Number(d.item_barcode) : undefined,
            itemName:      d.item_name,
            quantitySold:  Number(d.quantity_sold ?? 0),
            soldAt:        d.sold_at,
            soldBy:        d.sold_by,
            branch:        d.branch as Branch,
            paymentMethod: d.payment_method ?? null,
            unitPrice:     d.unit_price != null ? Number(d.unit_price) : 0,
            billNo:        d.bill_no ?? null,
          }));
        }

        if (wantIncoming) {
          incoming[branch] = [
            ...(incomingData || []),
            ...((openIncomingData || []).filter((o) => !(incomingData || []).some((i) => i.id === o.id))),
          ].map((d) => ({
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
            disputedReceivedQuantity: d.disputed_received_quantity != null ? Number(d.disputed_received_quantity) : null,
            returnRequested: d.return_requested ?? false,
            returnRequestedAt: d.return_requested_at ?? null,
            returnRequestedBy: d.return_requested_by ?? null,
            transferInReturnId: d.transfer_in_return_id ?? null,
            advanceOrderNo: d.advance_order_no ?? null,
            invoiceNo: d.invoice_no ?? null,
          }));
        }

        if (wantAdvance) {
          advanceOrders[branch] = [
            ...(advanceData || []),
            ...((openAdvanceData || []).filter((o) => !(advanceData || []).some((a) => a.id === o.id))),
          ].map((d) => ({
            id:             d.id,
            branch:         d.branch as Branch,
            orderNo:        d.order_no ?? undefined,
            customerName:   d.customer_name ?? null,
            items:          (d.items || []) as BranchAdvanceItem[],
            subtotal:       Number(d.subtotal),
            advanceAmount:  Number(d.advance_amount),
            advanceMethod:  d.advance_method,
            balanceDue:     Number(d.balance_due),
            finalizedInMain: Boolean(d.finalized_in_main),
            cancelledInMain: Boolean(d.cancelled_in_main),
            mainFinalBillNo: d.main_final_bill_no ?? null,
            mainFinalizationProblem: d.main_finalization_problem ?? null,
            soldBy:         d.sold_by,
            createdAt:      d.created_at,
            fullyPaidAt:    d.fully_paid_at ?? null,
            balanceMethod:  d.balance_method ?? null,
            status:         d.status as 'pending' | 'completed' | 'cancelled',
            deliveryDate:   d.delivery_date ?? null,
            notes:          d.notes ?? null,
            reservationStatus: (d.reservation_status ?? 'none') as BranchAdvanceOrder['reservationStatus'],
            dispatchedAt:   d.dispatched_at ?? null,
            dispatchedBy:   d.dispatched_by ?? null,
          }));
        }

        if (wantThresholds) {
          const tMap: Record<string, number> = {};
          (thresholdData || []).forEach((d) => { tMap[d.item_name] = d.threshold; });
          thresholds[branch] = tMap;
        }

        if (wantCredit) {
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
              discountAmount: Number(d.discount_amount ?? 0),
            }));
        }
        return { stock, sales, incoming, thresholds, advanceOrders, creditSales };
      });

      // OFFLINE FIX (2026-10-01): persist this branch's current slices so a
      // reload while offline has something real to hydrate from (see
      // hydrateBranchDataFromCache above) — best-effort, never blocks or
      // throws (see localCache.ts). Read back via get() rather than the
      // locals above since a narrow-scope call only rebuilt SOME of them;
      // get() always reflects the full, just-merged state for this branch.
      if(wantStock)branchLoadedStock.add(branch);
      const freshState = get();
      void setCached(`${BRANCH_DATA_CACHE_PREFIX}${branch}`, {
        stock: freshState.stock[branch],
        sales: freshState.sales[branch],
        incoming: freshState.incoming[branch],
        thresholds: freshState.thresholds[branch],
        advanceOrders: freshState.advanceOrders[branch],
        creditSales: freshState.creditSales[branch],
        cachedAt: new Date().toISOString(),
      } satisfies CachedBranchData);
    } finally {
      activeBranchLoads--;
      set({ loading: activeBranchLoads>0 });
    }
    }).catch(error=>console.error('fetchBranchData error:',error));
  },

  fetchAllBranches: async () => {
    await Promise.all((['VRSNB', 'SNB', 'Hosur'] as Branch[]).map((b) => get().fetchBranchData(b)));
  },

  // EGRESS FIX: Owner/Admin-only, explicitly-triggered historical range fetch
  // for the Reports screen. Callers are responsible for only invoking this
  // for admin/owner roles and only when the user picks a range beyond today —
  // it intentionally does NOT write into the `sales` cache used by the
  // always-on branch dashboard, so it can never leak into the frequent
  // fetchBranchData path above.
  fetchBranchSalesRange: async (branch, fromDateISO, toDateISO) => {
    // BUG FIX (2026-09-16): `.limit(10000)` does NOT override PostgREST's
    // hard 1000-row response cap (see fetchAllRows's comment in
    // lib/supabase.ts) — a per-item sales table over an owner-picked report
    // range can easily exceed 1000 rows. Paginated with fetchAllRows.
    const { data, error } = await fetchAllRows<any>('branch_sales', (q) => q
      .select('id,item_barcode,item_name,quantity_sold,sold_at,sold_by,branch,payment_method,unit_price,bill_no')
      .eq('branch', branch)
      .gte('sold_at', fromDateISO)
      .lte('sold_at', toDateISO)
      .order('sold_at', { ascending: false }));
    if (error) { console.error('[fetchBranchSalesRange]', error); return []; }
    return (data || []).map((d): SaleRecord => ({
      id:            d.id,
      itemBarcode:   d.item_barcode != null ? Number(d.item_barcode) : undefined,
      itemName:      d.item_name,
      quantitySold:  Number(d.quantity_sold ?? 0),
      soldAt:        d.sold_at,
      soldBy:        d.sold_by,
      branch:        d.branch as Branch,
      paymentMethod: d.payment_method ?? null,
      unitPrice:     d.unit_price != null ? Number(d.unit_price) : 0,
      billNo:        d.bill_no ?? null,
    }));
  },

  // B1 FIX: atomic stock decrement via stored procedure.
  // The strict RPC blocks missing, insufficient, or negative stock billing.
  recordSale: async () => 'This older billing path is disabled. Use New Bill or Advance Orders so stock, payment and invoice are saved together.',

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
  recordAdvanceOrder: async () => 'This older billing path is disabled. Use New Bill or Advance Orders so stock, payment and invoice are saved together.',

  // ── Collect remaining balance — NOW deduct stock and record sales ──────────
  collectAdvanceBalance: async (branch, orderId, balanceMethod) => {const lock=branch+':'+orderId;if(pendingAdvanceCollections.has(lock))return 'This advance collection is already being saved.';pendingAdvanceCollections.add(lock);try{
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
      // OFFLINE FIX (2026-09-01): only a genuine connectivity failure takes
      // this branch. The RPC's own stock-deduct/sale-record effects can't be
      // replicated locally with confidence (its exact math isn't visible to
      // the client), so only the advance order's own status is applied
      // optimistically — stock/sales stay whatever they were until this
      // replays and a real fetchBranchData can reconcile them.
      if (!navigator.onLine && !error.code) {
        try { await useOfflineQueueStore.getState().enqueue('branch_collect_advance_balance', { branch, orderId, balanceMethod, completedBy }); }
        catch(cause) { return cause instanceof Error ? cause.message : 'The offline collection could not be safely saved.'; }
        set((state) => {
          const advanceOrders = { ...state.advanceOrders };
          advanceOrders[branch] = advanceOrders[branch].map((entry) => entry.id === orderId ? {
            ...entry, status: 'completed', fullyPaidAt: new Date().toISOString(), balanceMethod, balanceDue: 0, reservationStatus: 'consumed',
          } : entry);
          return { advanceOrders };
        });
        return null;
      }
      const missing = /complete_branch_advance_order_reserved|could not find the function|does not exist|schema cache/i.test(error.message || '');
      if (missing) return 'Advance completion RPC is not installed. Apply the branch reservation migration.';
      return `Advance order could not be completed: ${error.message}`;
    }
    const row = data as Record<string, unknown>;
    await get().fetchBranchData(branch, false, ['stock', 'sales', 'advance']); // EGRESS FIX: completing an advance order deducts stock, records a sale, and closes the order
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
  }finally{pendingAdvanceCollections.delete(lock);}},

  updateThreshold: async (branch, itemName, threshold) => {
    const stockItem = get().stock[branch].find((item) => normalizeStockName(item.itemName) === normalizeStockName(itemName));
    const itemBarcode = stockItem?.itemBarcode;
    const resolvedItemName = stockItem?.itemName ?? itemName;

    // OFFLINE FIX (2026-09-01): apply optimistically first, then attempt the
    // real writes — this used to await both writes before touching local
    // state at all (and skip it entirely if the first write failed), so
    // there was nothing to show while offline. Setting a threshold is a
    // simple, idempotent, no-business-logic write (unlike stock/money RPCs
    // elsewhere in this store — see the queueThresholdUpdate comment below
    // for why only writes like this one get queued), so it's safe to apply
    // immediately and queue-and-replay if the network call fails offline.
    set((s) => {
      const thresholds = { ...s.thresholds };
      thresholds[branch] = { ...thresholds[branch], [resolvedItemName]: threshold };
      const stock = { ...s.stock };
      stock[branch] = stock[branch].map((item) =>
        itemBarcode != null && item.itemBarcode != null
          ? item.itemBarcode === itemBarcode ? { ...item, minThreshold: threshold } : item
          : normalizeStockName(item.itemName) === normalizeStockName(itemName) ? { ...item, minThreshold: threshold } : item,
      );
      return { thresholds, stock };
    });

    const payload: ThresholdUpdatePayload = { branch, itemName: resolvedItemName, itemBarcode: itemBarcode ?? null, threshold };
    const result = await writeThresholdUpdate(payload);
    if (!result.ok) {
      if (!navigator.onLine) {
        void useOfflineQueueStore.getState().enqueue('branch_threshold_update', payload);
      } else {
        console.error('[updateThreshold] write failed:', result.error);
      }
    }
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
    // EGRESS FIX: this used to scan 6 months of `bakery_orders` (every branch's
    // dispatch_log, no branch filter, no row cap) on every 30-second poll —
    // the single largest source of PostgREST egress in the app. This is only a
    // recovery path for dispatches that failed to write to branch_incoming, so
    // a short recent window is enough; anything older is already reconciled.
    const recoveryWindowStart = new Date();
    recoveryWindowStart.setDate(recoveryWindowStart.getDate() - 3);
    const recoveryWindowStartISO = recoveryWindowStart.toISOString();

    const { data: orders, error: ordersError } = await supabase
      .from('bakery_orders')
      .select('id, dispatch_log, notes')
      .not('dispatch_log', 'is', null)
      .gte('created_at', recoveryWindowStartISO)
      .order('created_at', { ascending: false })
      .limit(300);
    if (ordersError) console.error('[syncIncoming] bakery_orders load failed:', ordersError.message);

    const { data: dispatchedCakeOrders, error: cakeDispatchError } = await supabase
      .from('cake_master_orders')
      .select('id,branch,order_no,source_order_id,cake_kg,prepared_quantity,flavor,cream_type,updated_at,created_at')
      .eq('branch', branch)
      .eq('status', 'Dispatched')
      .gte('created_at', recoveryWindowStartISO)
      .limit(200);
    if (cakeDispatchError && !/cake_master_orders|does not exist|schema cache/i.test(cakeDispatchError.message)) {
      console.error('[syncIncoming] dispatched cake load failed:', cakeDispatchError.message);
    }

    if (!orders) {
      // Query errored — nothing to reconcile this cycle. Realtime + the next
      // scheduled sync will pick it back up; no need for a full branch refetch.
      return;
    }

    // FIXED: use dispatch_id column (the dispatch_log entry id) as the dedup key.
    // EGRESS FIX: scoped to the same recovery window as the orders query above —
    // this used to pull every dispatch_id ever recorded for the branch.
    const { data: existingIncoming } = await supabase
      .from('branch_incoming')
      .select('dispatch_id')
      .eq('branch', branch)
      .gte('received_at', recoveryWindowStartISO)
      .limit(2000);
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
      received_at: string; dispatched_by: string; branch: Branch; advance_order_no: string | null;
    }[] = [];

    for (const order of orders) {
      const log = (order.dispatch_log || []) as {
        id: string; itemName: string; itemBarcode?: number; barcode?: number; quantity: number; unit?: string;
        branch: Branch; dispatchedAt: string; dispatchedBy: string;
      }[];
      // FEATURE (2026-09-05): same advance-order tag this recovery path's
      // primary counterpart (submitDispatch in bakeryStore.ts) already writes
      // — computed once per order rather than per dispatch-log entry.
      const notes = order.notes as string | null | undefined;
      const advanceOrderNo = isAdvanceOrderTagged(notes) ? parseAdvanceOrderNotes(notes)?.orderNo ?? null : null;
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
            advance_order_no: advanceOrderNo,
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

    // EGRESS FIX: only re-fetch branch data when this sync actually wrote
    // something new. This used to run unconditionally, meaning every 30-second
    // background poll re-downloaded the full branch dashboard payload (stock,
    // today's sales, advance/credit orders) even when nothing had changed.
    // Realtime + the manual refresh button cover the rest.
    if (newEntries.length > 0) await get().fetchBranchData(branch, true, ['incoming']); // EGRESS FIX: syncing incoming deliveries only touches incoming
  },

  // B4 FIX: confirmIncoming — stock update comes BEFORE marking confirmed.
  // If step 1 (stock) fails → item stays unconfirmed → safe to retry.
  // If step 2 (mark confirmed) fails after stock added → stock is correct but item shows
  // as unconfirmed → retry will add stock again!  The atomic RPC avoids this entirely.
  // See supabase/migrations/001_security.sql: confirm_incoming_stock().
  confirmIncoming: async (branch, incomingId) => {
    const inc = get().incoming[branch].find((i) => i.id === incomingId);
    if (!inc) return 'Item not found';
    if (inc.confirmed) return 'This receipt has already been synced once. No extra stock was added.';
    if (inc.disputed) return 'This incoming stock is disputed and must be reviewed before confirmation.';
    if (inc.returnRequested) return 'Planner must resolve the requested return before this receipt can be confirmed.';
    const catalogItems = useBranchCatalogStore.getState().items[branch === 'VRSNB' ? 'VRSNB' : 'SNB'];
    const catalogItem = inc.itemBarcode != null
      ? catalogItems.find(item => item.barcode === inc.itemBarcode)
      : catalogItems.find(item => normalizeStockName(item.name) === normalizeStockName(inc.itemName));
    if (catalogItem?.uom === 'Nos' && (inc.unit !== 'pcs' || !Number.isInteger(inc.quantity))) {
      return 'This item is sold in whole pieces. Correct the incoming unit and piece count before confirming.';
    }

    const confirmationKey=branch+'|'+incomingId;
    if(incomingConfirmInFlight.has(confirmationKey))return 'This receipt is already being confirmed. Please wait.';
    incomingConfirmInFlight.add(confirmationKey);
    try {
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
      await get().fetchBranchData(branch, false, ['stock', 'incoming']); // EGRESS FIX: confirming incoming adds stock and marks the row confirmed
      return null;
    }
    // Validation/authorization errors must never retry through a weaker stock
    // increment path. Legacy fallback is only for a genuinely missing RPC.
    if (navigator.onLine && !isMissingRpcError(rpcErr.message ?? '')) return rpcErr.message;

    // OFFLINE FIX (2026-09-01): only when the failure is genuinely a
    // connectivity problem — the elaborate fallback below exists for a
    // DIFFERENT scenario (the atomic RPCs not being deployed at all, which
    // needs a fresh server read either way and can't run offline anyway),
    // not for "network unreachable". Applies the same optimistic quantity
    // add + confirmed flag the online success path implies, and queues the
    // one simple atomic RPC call for replay instead of the multi-step
    // fallback (which would need its own offline handling for no real
    // benefit — the atomic RPC is what actually runs 99% of the time).
    if (!navigator.onLine) {
      set((s) => {
        const incoming = { ...s.incoming };
        incoming[branch] = incoming[branch].map((i) => i.id === incomingId ? { ...i, confirmed: true } : i);
        const stock = { ...s.stock };
        stock[branch] = stock[branch].map((item) =>
          inc.itemBarcode != null && item.itemBarcode != null
            ? item.itemBarcode === inc.itemBarcode ? { ...item, quantity: Math.round((Number(item.quantity || 0) + inc.quantity) * 1000) / 1000 } : item
            : normalizeStockName(item.itemName) === normalizeStockName(inc.itemName) ? { ...item, quantity: Math.round((Number(item.quantity || 0) + inc.quantity) * 1000) / 1000 } : item,
        );
        return { incoming, stock };
      });
      await useOfflineQueueStore.getState().enqueue('branch_confirm_incoming', { branch, incomingId });
      return null;
    }

    return 'Safe stock confirmation is unavailable. Please refresh or contact Admin; no stock was added.';
    }finally{incomingConfirmInFlight.delete(confirmationKey);}
  },

  // Confirm all unconfirmed incoming items at once (not restricted to today)
  confirmAllIncoming: async (branch) => {
    const toConfirm = get().incoming[branch].filter((i) => !i.confirmed && !i.disputed && !i.returnRequested);
    if (toConfirm.length === 0) return null;

    for (const inc of toConfirm) {
      const err = await get().confirmIncoming(branch, inc.id);
      if (err) return err;
    }
    return null;
  },

  // ── SNB / Hosur sale — items come from price list, not stock requirement ──
  // Deducts stock when available, logs a mismatch when stock is 0 / insufficient.
  recordSnbSale: async () => ({error:'This older billing path is disabled. Use New Bill or Advance Orders so stock, payment and invoice are saved together.',mismatch:false}),

  // ── Manual stock update — branch staff sets qty for any item ─────────────
  manualUpdateStock: async (branch, itemName, quantity, _updatedBy, itemBarcode, audit, expectedCurrentQty) => {
    if(!Number.isFinite(quantity)||quantity<0)return 'Stock quantity must be a finite non-negative number.';
    const local=get().stock[branch].find(item=>itemBarcode!=null&&item.itemBarcode!=null?item.itemBarcode===itemBarcode:normalizeStockName(item.itemName)===normalizeStockName(itemName));
    const catalogBranch=branch==='VRSNB'?'VRSNB':'SNB';
    const catalog=useBranchCatalogStore.getState().items[catalogBranch].find(item=>itemBarcode!=null?item.barcode===itemBarcode:normalizeStockName(item.name)===normalizeStockName(itemName));
    const unit=local?.unit??(catalog?(catalog.uom==='Kgs'?'kg':'pcs'):null);
    if(!unit)return 'Refresh the branch catalogue before correcting this item.';
    if(unit==='pcs'&&!Number.isInteger(quantity))return 'Piece stock must be a whole number.';
    const expected=expectedCurrentQty??local?.quantity??0;
    if(!Number.isFinite(expected))return 'The current stock needs review before correction.';
    const rounded=Math.round(quantity*1000)/1000;
    let request:StockCorrectionRequest;
    try{request=prepareStockCorrection(useAuthStore.getState().currentUser?.id??'',{
      branch,itemName,itemBarcode:itemBarcode??null,quantity:rounded,expected,relative:!navigator.onLine,unit,
      reason:audit?.reason||'Manual stock update',referenceId:audit?.referenceId??null,notes:audit?.notes??null,
    });}catch(cause){return cause instanceof Error?cause.message:'Stock correction could not be saved.';}
    await useOfflineQueueStore.getState().hydrate();
    if(useOfflineQueueStore.getState().pending.some(entry=>(entry.payload as {request?:StockCorrectionRequest})?.request?.p_request===request.p_request))return 'This correction is already saved offline and waiting to sync.';
    const {error}=await executeStockCorrection(request);
    if(error){
      if('code' in error&&error.code)return error.message;
      try{await useOfflineQueueStore.getState().enqueue('branch_manual_stock_delta',{branch,request});}catch(cause){return cause instanceof Error?cause.message:'Offline stock correction could not be saved.';}
      if(local)set(state=>({stock:{...state.stock,[branch]:state.stock[branch].map(item=>item===local?{...item,quantity:rounded,availableQuantity:Math.max(0,rounded-Number(item.reservedQuantity||0))}:item)}}));
      return null;
    }
    await get().fetchBranchData(branch,true,['stock']);return null;
  },

  fetchStockMismatches: async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data } = await supabase
      .from('branch_stock_mismatches')
      .select('id, item_barcode, item_name, branch, sold_qty, shortage, sold_at, sold_by')
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
    const { data: existingRows, error: existingError } = await supabase
      .from('branch_stock')
      .select('item_name,item_barcode')
      .eq('branch', branch);
    if (existingError) return;

    const existingNames = new Set((existingRows || []).map((row) => normalizeStockName(row.item_name)));
    const existingBarcodes = new Set(
      (existingRows || [])
        .map((row) => row.item_barcode == null ? null : Number(row.item_barcode))
        .filter((barcode): barcode is number => barcode != null),
    );
    const missingRows = rows.filter((row) =>
      !existingNames.has(normalizeStockName(row.item_name))
      && (row.item_barcode == null || !existingBarcodes.has(Number(row.item_barcode))),
    );

    for (let i = 0; i < missingRows.length; i += 50) {
      const { error } = await supabase
        .from('branch_stock')
        .upsert(missingRows.slice(i, i + 50), {
          onConflict:       'branch,item_name',
          ignoreDuplicates: true,
        });
      if (error) break;
    }
    if (missingRows.length > 0) await get().fetchBranchData(branch, false, ['stock']); // EGRESS FIX: seeding missing catalog rows only touches stock
  },

  // ── Credit sales ────────────────────────────────────────────────────────────

  fetchCreditSales: async (branch, fromISO, untilISO) => {
    // BUG FIX (2026-09-16): `.limit(3000)` does NOT override PostgREST's
    // hard 1000-row response cap (see fetchAllRows's comment in
    // lib/supabase.ts) — this is a branch's entire lifetime credit-sales
    // history with no status filter, not just the unsettled/pending subset,
    // so it can genuinely exceed 1000 over time. Paginated.
    const { data, error } = await fetchAllRows<any>('branch_credit_sales', (q) => {let query=q
      .select('id, branch, source, source_id, customer_ref, customer_name, customer_phone, items, subtotal, amount_paid, credit_amount, sold_by, created_at, due_date, settled_at, status, notes, bill_no, discount_amount')
      .eq('branch', branch)
      .order('created_at', { ascending: false });
      if(fromISO)query=query.gte('created_at',fromISO);
      if(untilISO)query=query.lt('created_at',untilISO);
      return query;
    });
    if (error) { console.error('[fetchCreditSales]', error); return; }
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

  fetchCreditPayments: async (branch, fromISO, untilISO) => {
    // BUG FIX (2026-09-16): same unbounded-lifetime-history risk as
    // fetchCreditSales above — paginated with fetchAllRows.
    const { data, error } = await fetchAllRows<any>('branch_credit_payments', (q) => {let query=q
      .select('id, credit_sale_id, branch, bill_no, amount, payment_mode, reference, remarks, collected_by, collected_role, created_at')
      .eq('branch', branch)
      .order('created_at', { ascending: false });
      if(fromISO)query=query.gte('created_at',fromISO);
      if(untilISO)query=query.lt('created_at',untilISO);
      return query;
    });
    if (error) { console.error('[fetchCreditPayments]', error); return; }
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
    if(![sale.subtotal,sale.amountPaid,sale.creditAmount].every(Number.isFinite)||sale.subtotal<=0||sale.amountPaid<0||sale.creditAmount<0||Math.abs(sale.subtotal-sale.amountPaid-sale.creditAmount)>0.005)return 'Credit amounts must reconcile with the bill total.';
    if(!sale.customerName.trim()||!sale.billNo.trim())return 'Customer name and bill number are required.';
    let request:CreditActionRequest;
    try{request=prepareCreditAction(useAuthStore.getState().currentUser?.id??'','create',{p_branch:branch,sale,options});}catch(cause){return cause instanceof Error?cause.message:'Credit sale could not be saved.';}
    await useOfflineQueueStore.getState().hydrate();
    if(useOfflineQueueStore.getState().pending.some(entry=>(entry.payload as {request?:CreditActionRequest})?.request?.p_request===request.p_request))return 'This credit bill is already saved offline and waiting to sync.';
    const {data,error}=await executeCreditAction(request);
    if(error){
      if('code' in error&&error.code)return `Failed to record credit sale: ${error.message}`;
      try{await useOfflineQueueStore.getState().enqueue('branch_record_credit_sale',{branch,request});}catch(cause){return cause instanceof Error?cause.message:'Offline credit sale could not be saved.';}
    }
    const now=String(request.p_args.p_created_at),saleId=data?.id??request.p_request;
    const newSale:CreditSale={...sale,id:saleId,branch,createdAt:String(data?.created_at??now),settledAt:null,status:data?.status??(sale.creditAmount<=0?'settled':sale.amountPaid>0?'partial':'pending')};
    set(state=>{
      const creditSales={...state.creditSales,[branch]:[newSale,...state.creditSales[branch].filter(row=>row.id!==saleId)]};
      const creditPayments={...state.creditPayments};
      if(sale.amountPaid>0){const id=String(data?.upfrontPaymentId??`pending-${request.p_request}`);creditPayments[branch]=[{id,creditSaleId:saleId,branch,billNo:sale.billNo,amount:sale.amountPaid,paymentMode:options.upfrontPaymentMode??'cash',reference:options.reference??null,remarks:options.remarks??'Credit upfront collection',collectedBy:options.collectedBy??sale.soldBy,collectedRole:options.collectedRole??null,createdAt:now},...state.creditPayments[branch].filter(row=>row.id!==id&&row.id!==`pending-${request.p_request}`)];}
      return {creditSales,creditPayments};
    });
    return null;
  },

  settleCreditSale: async (branch, saleId, amountCollected, payment = {}) => {
    const sale = get().creditSales[branch].find((s) => s.id === saleId);
    if (!sale) return 'Credit sale not found';
    if (!Number.isFinite(amountCollected) || amountCollected <= 0) return 'Collection amount must be positive';
    if (amountCollected > sale.creditAmount) return 'Collection amount cannot be more than pending balance';

    const newAmountPaid = sale.amountPaid + amountCollected;
    const isSettled = sale.creditAmount - amountCollected <= 0;
    const now = new Date().toISOString();

    let request:CreditActionRequest;
    try { request=prepareCreditAction(useAuthStore.getState().currentUser?.id??'', 'collect', {
      p_credit_sale_id: saleId,
      p_branch: branch,
      p_amount: amountCollected,
      p_payment_mode: payment.mode ?? 'cash',
      p_reference: payment.reference ?? null,
      p_remarks: payment.remarks ?? null,
      p_collected_by: payment.collectedBy ?? 'Staff',
      p_collected_role: payment.collectedRole ?? null,
    }); } catch(cause) { return cause instanceof Error?cause.message:'Credit request could not be saved.'; }
    await useOfflineQueueStore.getState().hydrate();
    if(useOfflineQueueStore.getState().pending.some(entry=>(entry.payload as {request?:CreditActionRequest})?.request?.p_request===request.p_request)) return 'This credit action is already saved offline and waiting to sync.';
    const { data, error } = await executeCreditAction(request);
    if (error) {
      // OFFLINE FIX (2026-09-01): only a genuine connectivity failure —
      // this function already computes newAmountPaid/isSettled client-side
      // (needed for its own return-value math), so the exact same values
      // the online success path applies below are safe to apply optimistically.
      if (!('code' in error && error.code)) {
        try { await useOfflineQueueStore.getState().enqueue('branch_settle_credit_sale', {branch,request}); } catch(cause) { return cause instanceof Error?cause.message:'Offline credit request could not be saved.'; }
        set((s) => {
          const creditSales = { ...s.creditSales };
          const creditPayments = { ...s.creditPayments };
          creditSales[branch] = creditSales[branch].map((cs) =>
            cs.id === saleId
              ? { ...cs, amountPaid: newAmountPaid, creditAmount: Math.max(0, sale.creditAmount - amountCollected), status: isSettled ? 'settled' : 'partial', settledAt: now }
              : cs
          );
          creditPayments[branch] = [{
            id: `pending-${request.p_request}`, creditSaleId: saleId, branch, billNo: sale.billNo, amount: amountCollected,
            paymentMode: payment.mode ?? 'cash', reference: payment.reference ?? null, remarks: payment.remarks ?? null,
            collectedBy: payment.collectedBy ?? 'Staff', collectedRole: payment.collectedRole ?? null, createdAt: now,
          }, ...creditPayments[branch].filter(p=>p.id!==`pending-${request.p_request}`)];
          return { creditSales, creditPayments };
        });
        return null;
      }
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
          ? { ...cs, amountPaid: Number(data.amountPaid), creditAmount: Number(data.creditAmount),
              status: data.status, settledAt: now }
          : cs
      );
      creditPayments[branch] = [{
        id: String(data.paymentId),
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
      }, ...creditPayments[branch].filter(p=>p.id!==String(data?.paymentId)&&p.id!==`pending-${request.p_request}`)];
      return { creditSales, creditPayments };
    });
    return null;
  },

  applyCreditDiscount: async (branch, saleId, discountAmount, reason, approvedBy) => {
    const sale = get().creditSales[branch].find((s) => s.id === saleId);
    if (!sale) return 'Credit sale not found';
    if (!Number.isFinite(discountAmount) || discountAmount <= 0) return 'Discount amount must be positive';
    if (discountAmount > sale.creditAmount) return 'Discount cannot exceed the pending balance';

    const now = new Date().toISOString();
    const newDue = Math.max(0, sale.creditAmount - discountAmount);
    const isSettled = newDue <= 0;

    let request:CreditActionRequest;
    try { request=prepareCreditAction(useAuthStore.getState().currentUser?.id??'', 'discount', {
      p_branch: branch,
      p_credit_sale_id: saleId,
      p_discount_amount: discountAmount,
      p_reason: reason ?? null,
      p_approved_by: approvedBy ?? 'Admin',
    }); } catch(cause) { return cause instanceof Error?cause.message:'Credit request could not be saved.'; }
    await useOfflineQueueStore.getState().hydrate();
    if(useOfflineQueueStore.getState().pending.some(entry=>(entry.payload as {request?:CreditActionRequest})?.request?.p_request===request.p_request)) return 'This credit action is already saved offline and waiting to sync.';
    const { data, error } = await executeCreditAction(request);
    if (error) {
      // OFFLINE FIX (2026-09-01): only a genuine connectivity failure — the
      // newDue/isSettled math above (moved ahead of the RPC call so it's
      // available here too) matches exactly what the online success path
      // below applies.
      if (!('code' in error && error.code)) {
        try { await useOfflineQueueStore.getState().enqueue('branch_apply_credit_discount', {branch,request}); } catch(cause) { return cause instanceof Error?cause.message:'Offline credit request could not be saved.'; }
        set((s) => {
          const creditSales = { ...s.creditSales };
          creditSales[branch] = creditSales[branch].map((cs) =>
            cs.id === saleId
              ? {
                  ...cs, creditAmount: newDue, discountAmount: (cs.discountAmount ?? 0) + discountAmount,
                  status: isSettled ? 'settled' : (cs.amountPaid > 0 ? 'partial' : 'pending'), settledAt: isSettled ? now : cs.settledAt,
                  notes: [cs.notes, `Discount of ₹${discountAmount} applied${reason ? ' — ' + reason : ''} on ${now.slice(0, 10)}`].filter(Boolean).join('\n'),
                }
              : cs
          );
          return { creditSales };
        });
        return null;
      }
      const missingRpc = /apply_branch_credit_discount|could not find the function|function .* does not exist/i.test(error.message);
      return missingRpc
        ? 'Discount feature is not installed in Supabase. Run the 20260709120000_branch_credit_discount.sql migration first.'
        : `Failed to apply discount: ${error.message}`;
    }

    set((s) => {
      const creditSales = { ...s.creditSales };
      creditSales[branch] = creditSales[branch].map((cs) =>
        cs.id === saleId
          ? {
              ...cs,
              creditAmount: Number(data.credit_amount),
              discountAmount: Number(data.discount_amount),
              status: data.status,
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
  // Subscribes to branch_stock, branch_incoming, branch_sales,
  // branch_advance_orders, branch_credit_sales, and branch_credit_payments
  // for the given branch. REALTIME FIX (2026-09-01): this comment used to
  // claim "any change fires a full fetchBranchData()" — that hasn't been
  // true for a while. Every change is instead patched directly into local
  // state (see applyBranchRealtimeChange/computeBranchRealtimeChange above),
  // buffered for BRANCH_REALTIME_FLUSH_MS and applied in one batched
  // setState — no network refetch at all on the realtime path.
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
        (payload) => { applyBranchRealtimeChange(branch, 'branch_stock', payload); },
      )
      // branch_incoming changes (new dispatches from packing, confirmations)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_incoming', filter: `branch=eq.${branch}` },
        (payload) => { applyBranchRealtimeChange(branch, 'branch_incoming', payload); },
      )
      // branch_sales changes (new sales so today's log is always current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'branch_sales', filter: `branch=eq.${branch}` },
        (payload) => { applyBranchRealtimeChange(branch, 'branch_sales', payload); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_advance_orders', filter: `branch=eq.${branch}` },
        (payload) => { applyBranchRealtimeChange(branch, 'branch_advance_orders', payload); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_credit_sales', filter: `branch=eq.${branch}` },
        (payload) => { applyBranchRealtimeChange(branch, 'branch_credit_sales', payload); },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'branch_credit_payments', filter: `branch=eq.${branch}` },
        (payload) => { applyBranchRealtimeChange(branch, 'branch_credit_payments', payload); },
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
