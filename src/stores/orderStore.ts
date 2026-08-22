import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { CartItem, MenuItem, Order, OrderType, OrderStatus, PaymentType, PaymentBreakdown, OrderSource } from '@/types';
import { generateId } from '@/lib/utils';
import { useMenuStore } from '@/stores/menuStore';
import { getCached, setCached } from '@/lib/localCache';

// EGRESS FIX: originally raised from 5 s → 30 s here, then raised again to
// 15 minutes once Supabase Realtime (postgres_changes) became the primary
// sync mechanism for this store — this interval is now only a fallback poll
// in case a realtime subscription silently drops, not the main sync path.
// (Comment corrected: it previously still said "5 s → 30 s", which no
// longer matched the 15-minute value below and made the retry/backoff math
// downstream look broken when it was actually just using a stale base.)
const POLL_INTERVAL_MS = 15 * 60_000;
// Separate, much shorter base for the failure-retry backoff below — retries
// after a fetch error should happen quickly and then back off, independent
// of the steady-state 15-minute poll cadence.
const POLL_BACKOFF_BASE_MS = 5_000;
const POLL_BACKOFF_MAX_MS = 5 * 60_000;
// EGRESS FIX (2026-08-21): how far back the recurring background poll looks
// on each tick — see the refreshRecentOrders/startPolling comments below for
// the full reasoning. Deliberately small; the one-time initial load on
// first open is unaffected and still uses whatever window the caller
// requested (e.g. 90 days for advance bookings).
const POLL_REFRESH_DAYS = 3;
// EGRESS FIX (2026-08-21): persists the orders array to IndexedDB after
// every successful fetch, and tries to hydrate from it before the first
// network request of a session — so a page reload / browser restart (very
// common on a POS device left running all day, or restarted between
// shifts) doesn't need to re-download the full requested window again.
// See localCache.ts for the read/write mechanics; everything here degrades
// gracefully to today's exact behavior if the cache is empty or unavailable.
const ORDERS_CACHE_KEY = 'orders_v1';
let orderCacheHydration: Promise<boolean> | null = null;

function hydrateOrdersFromCache(set: (partial: Partial<OrderState>) => void): Promise<boolean> {
  if (!orderCacheHydration) {
    orderCacheHydration = (async () => {
      const cached = await getCached<Order[]>(ORDERS_CACHE_KEY);
      if (cached && cached.length > 0) {
        set({ orders: cached });
        return true;
      }
      return false;
    })();
  }
  return orderCacheHydration;
}

let orderRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let orderFetchInFlight = false;
// BUG FIX (2026-08-09): "Owner Dashboard page is keep on refreshing 10 times
// per sec" — root cause #2, found after the earlier whole-store-subscription
// fix (which stopped UNRELATED store fields from re-rendering Owner tabs)
// still left this: every single postgres_changes event on the `orders`
// table — including a live cart draft syncing on every keystroke/quantity
// click during active billing elsewhere in the app — called `set()`
// individually, once per event. Each `set()` produces a brand-new `orders`
// array reference, and every Owner tab subscribed to `orders` (correctly,
// via a selector — it needs the data) re-renders on every single one of
// those events. During a burst of rapid edits this really can hit ~10
// updates/sec, each one a full re-render of heavy dashboard tabs — reading
// exactly like "the page keeps refreshing." Coalescing rapid-fire events
// into one `set()` per short window fixes this without losing any data
// (last state per order always wins, same as before) — it just stops
// firing a fresh render for every single intermediate keystroke.
let pendingOrderEvents: Map<string, { type: 'upsert' | 'delete'; order?: Order }> = new Map();
let orderFlushTimer: ReturnType<typeof setTimeout> | null = null;
const ORDER_EVENT_FLUSH_MS = 200;

const moneyValue = (value: number) => Math.round(Number(value) * 100) / 100;

export function validatePaymentBreakdown(breakdown: PaymentBreakdown | undefined, expected: number) {
  if (!breakdown) throw new Error('Split payment details are required.');
  const values = [breakdown.cash, breakdown.upi, breakdown.card].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Split payment amounts must be valid non-negative values.');
  }
  const collected = moneyValue(values.reduce((sum, value) => sum + value, 0));
  if (collected !== moneyValue(expected)) {
    throw new Error(`Split payment must equal the payable amount (${moneyValue(expected).toFixed(2)}).`);
  }
}

function validateCart(cart: CartItem[]) {
  if (cart.length === 0) throw new Error('Add at least one item before submitting the order.');
  if (cart.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error('Every item quantity must be greater than zero.');
  }
  if (cart.some((item) => !Number.isFinite(item.menuItem.price) || item.menuItem.price < 0)) {
    throw new Error('An item has an invalid price. Refresh the menu and try again.');
  }
}

interface OrderState {
  orders: Order[];
  cart: CartItem[];
  // BUG FIX (audit): AdvanceOrderPanel used to share this exact `cart` array
  // with NewBillPanel's dine-in/takeaway draft cart — both panels stay
  // permanently mounted (see BillingDashboard's "STATE-LOSS FIX"), and
  // NewBillPanel only snapshots the shared cart into its own per-table/
  // per-ticket drafts when switching table/order-type INSIDE that panel, not
  // when the biller switches the top-level New Bill <-> Advance tab. So an
  // unsent dine-in table's draft items could still be sitting in `cart` when
  // Advance was opened, showing up (and being submittable/wipeable) as if
  // they belonged to the advance order. `advanceCart` is a fully separate
  // slice so the two flows can never see or clobber each other's items.
  advanceCart: CartItem[];
  loading: boolean;
  polling: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
  _pollBackoffTimer: ReturnType<typeof setTimeout> | null;
  _pollRefCount: number;
  _pollFailCount: number;

  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  setCartItemNotes: (itemId: string, notes: string) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;
  getCartTotal: () => number;
  getCartCount: () => number;

  addToAdvanceCart: (item: MenuItem) => void;
  updateAdvanceCartQuantity: (itemId: string, quantity: number) => void;
  clearAdvanceCart: () => void;
  getAdvanceCartTotal: () => number;
  getAdvanceCartCount: () => number;

  loadOrders: (days?: number) => Promise<void>;
  // EGRESS FIX (2026-08-21): see the implementation below and the comment on
  // startPolling for the full reasoning — a merge-based, small-window
  // refresh used for the recurring background poll instead of loadOrders,
  // which always re-fetches and replaces the entire requested window.
  refreshRecentOrders: (days: number) => Promise<void>;
  submitOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; orderSource?: OrderSource; parcelCharges?: number; paymentType?: PaymentType; paymentBreakdown?: PaymentBreakdown; billedBy?: string; status?: OrderStatus; }) => Promise<string>;
  submitAdvanceOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; advanceAmount: number; advancePaidBy: string; deliveryDate: string; isFullPayment?: boolean; }) => Promise<string>;
  updateOrderStatus: (orderId: string, status: OrderStatus, cancelReason?: string) => Promise<void>;
  refundAndCancel: (orderId: string, cancelReason: string, refundedBy: string, password: string) => Promise<void>;
  applyDiscount: (orderId: string, discountType: 'percentage' | 'flat', discountValue: number) => Promise<void>;
  setPaymentType: (orderId: string, paymentType: PaymentType, billedBy: string, breakdown?: PaymentBreakdown) => Promise<void>;
  setAdvancePayment: (orderId: string, advanceAmount: number, advancePaidBy: string, billedBy: string) => Promise<void>;
  collectBalance: (orderId: string, balancePaymentType: PaymentType, billedBy: string, breakdown?: PaymentBreakdown) => Promise<void>;

  startPolling: (days?: number) => void;
  stopPolling: () => void;
}

export function dbRowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    orderNumber: row.order_number as number,
    tableNumber: row.table_number as number | undefined,
    orderType: row.order_type as OrderType,
    items: (row.items as CartItem[]) || [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    discountType: row.discount_type as 'percentage' | 'flat',
    discountValue: Number(row.discount_value),
    total: Number(row.total),
    status: row.status as OrderStatus,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    notes: row.notes as string | undefined,
    customerName: row.customer_name as string | undefined,
    paymentType: (row.payment_type as PaymentType) || 'unpaid',
    paymentBreakdown: row.payment_breakdown as PaymentBreakdown | undefined,
    billedBy: row.billed_by as string | undefined,
    cancelReason: row.cancel_reason as string | undefined,
    orderSource: (row.order_source as OrderSource) || 'staff',
    advanceAmount: row.advance_amount ? Number(row.advance_amount) : undefined,
    advancePaidBy: row.advance_paid_by as string | undefined,
    balanceDue: row.balance_due ? Number(row.balance_due) : undefined,
    fullAmount: row.full_amount ? Number(row.full_amount) : undefined,
    fullyPaidAt: row.fully_paid_at as string | undefined,
    balancePaymentType: row.balance_payment_type as string | undefined,
    balancePaidBy: row.balance_paid_by as string | undefined,
    balanceOrderId: row.balance_order_id as string | undefined,
    parcelCharges: row.parcel_charges ? Number(row.parcel_charges) : 0,
    deliveryDate: row.delivery_date as string | undefined,
    walletId: row.wallet_id as string | undefined,
    walletAmount: row.wallet_amount ? Number(row.wallet_amount) : undefined,
    walletTransactionId: row.wallet_transaction_id as string | undefined,
    promotionDiscount: row.promotion_discount ? Number(row.promotion_discount) : undefined,
    promotionIds: row.promotion_ids as string[] | undefined,
    walletCashback: row.wallet_cashback ? Number(row.wallet_cashback) : undefined,
  };
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  cart: [],
  advanceCart: [],
  loading: false,
  polling: false,
  pollTimer: null,
  _pollBackoffTimer: null,
  _pollRefCount: 0,
  _pollFailCount: 0,

  addToCart: (item: MenuItem) =>
    set((state) => {
      const existing = state.cart.find((c) => c.menuItem.id === item.id);
      if (existing) return { cart: state.cart.map((c) => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c) };
      return { cart: [...state.cart, { menuItem: item, quantity: 1 }] };
    }),

  removeFromCart: (itemId) => set((state) => ({ cart: state.cart.filter((c) => c.menuItem.id !== itemId) })),

  updateCartQuantity: (itemId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { cart: state.cart.filter((c) => c.menuItem.id !== itemId) };
      return { cart: state.cart.map((c) => c.menuItem.id === itemId ? { ...c, quantity } : c) };
    }),

  setCartItemNotes: (itemId, notes) =>
    set((state) => ({ cart: state.cart.map((c) => c.menuItem.id === itemId ? { ...c, notes } : c) })),

  clearCart: () => set({ cart: [] }),
  setCart: (items: CartItem[]) => set({ cart: items }),
  getCartTotal: () => get().cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0),
  getCartCount: () => get().cart.reduce((sum, c) => sum + c.quantity, 0),

  // Mirrors the addToCart/updateCartQuantity/clearCart/getCartTotal/
  // getCartCount above exactly, just against `advanceCart` instead of
  // `cart` — see the `advanceCart` field comment for why this needs to be
  // a fully separate slice.
  addToAdvanceCart: (item: MenuItem) =>
    set((state) => {
      const existing = state.advanceCart.find((c) => c.menuItem.id === item.id);
      if (existing) return { advanceCart: state.advanceCart.map((c) => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c) };
      return { advanceCart: [...state.advanceCart, { menuItem: item, quantity: 1 }] };
    }),

  updateAdvanceCartQuantity: (itemId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { advanceCart: state.advanceCart.filter((c) => c.menuItem.id !== itemId) };
      return { advanceCart: state.advanceCart.map((c) => c.menuItem.id === itemId ? { ...c, quantity } : c) };
    }),

  clearAdvanceCart: () => set({ advanceCart: [] }),
  getAdvanceCartTotal: () => get().advanceCart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0),
  getAdvanceCartCount: () => get().advanceCart.reduce((sum, c) => sum + c.quantity, 0),

  loadOrders: async (days = 60) => {
    if (orderFetchInFlight) return;
    orderFetchInFlight = true;
    set({ loading: true });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
      // EGRESS FIX: defensive cap alongside the date cutoff — callers have
      // passed as much as 3650 days here, so this stops a single fetch from
      // ever being truly unbounded regardless of the `days` argument used.
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, table_number, order_type, items, subtotal, discount, discount_type, discount_value, total, status, created_by, created_at, updated_at, notes, customer_name, payment_type, payment_breakdown, billed_by, cancel_reason, order_source, advance_amount, advance_paid_by, balance_due, full_amount, fully_paid_at, balance_payment_type, balance_paid_by, balance_order_id, parcel_charges, delivery_date, wallet_id, wallet_amount, wallet_transaction_id, promotion_discount, promotion_ids, wallet_cashback')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(8000);

      if (error) throw error;
      if (data) {
        const mapped = data.map(dbRowToOrder);
        set({ orders: mapped, _pollFailCount: 0 });
        void setCached(ORDERS_CACHE_KEY, mapped);
      }
    } catch (e) {
      const failCount = (get()._pollFailCount || 0) + 1;
      set({ _pollFailCount: failCount });
      // BUG FIX: this used to multiply the 15-minute POLL_INTERVAL_MS by the
      // backoff exponent and then clamp to a 60s cap — since the base value
      // alone (900,000ms) already exceeded the 60s cap on the very first
      // failure, Math.min always returned the 60s cap regardless of
      // failCount, so the exponential growth this was supposed to implement
      // never actually had any effect. Now grows from a real short base and
      // is capped well above that base so the backoff is meaningful.
      const backoffMs = Math.min(POLL_BACKOFF_BASE_MS * Math.pow(2, failCount - 1), POLL_BACKOFF_MAX_MS);
      console.error(`[loadOrders] fetch failed (attempt ${failCount}, next retry in ${backoffMs}ms):`, e);

      const { pollTimer, _pollBackoffTimer } = get();
      if (_pollBackoffTimer) {
        clearTimeout(_pollBackoffTimer);
        set({ _pollBackoffTimer: null });
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        set({ pollTimer: null });
        const retryTimer = setTimeout(() => {
          set({ _pollBackoffTimer: null });
          // Matches the lightweight steady-state interval in startPolling —
          // this is re-arming after a retry, not doing the one-time initial
          // load itself (that's the loadOrders(days) call right below).
          const newTimer = setInterval(() => { if (!document.hidden) get().refreshRecentOrders(POLL_REFRESH_DAYS); }, POLL_INTERVAL_MS);
          set({ pollTimer: newTimer });
          get().loadOrders(days);
        }, backoffMs);
        set({ _pollBackoffTimer: retryTimer });
      }
    } finally {
      orderFetchInFlight = false;
      set({ loading: false });
    }
  },

  // EGRESS FIX (2026-08-21): "1.12GB used in 6 days, would exceed the 5GB
  // free-tier monthly limit." Root cause traced to startPolling's recurring
  // background poll re-fetching its ENTIRE requested window (as wide as 90
  // days, up to 8000 rows, full items/payment_breakdown JSONB per row) on
  // every 15-minute tick, for as long as any screen using this store stayed
  // open — across every branch's billing terminal simultaneously. The
  // pattern the Payment Mode Edit tab already uses (full history only on an
  // explicit, user-triggered lookup) is the correct one; this generalizes
  // it to the background poll itself rather than fixing one call site's
  // `days` number at a time. The initial load when a screen first opens
  // still uses loadOrders with its full requested window (nothing about
  // what's visible when you first open a dashboard changes) — only the
  // ongoing, repeated refresh underneath it is now this lightweight,
  // merge-based fetch of just the last `days` (kept deliberately simple,
  // no dedicated retry/backoff, since realtime remains the primary sync
  // path per the POLL_INTERVAL_MS comment above — a missed tick here is
  // caught by the next one 15 minutes later).
  refreshRecentOrders: async (days) => {
    if (orderFetchInFlight) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, table_number, order_type, items, subtotal, discount, discount_type, discount_value, total, status, created_by, created_at, updated_at, notes, customer_name, payment_type, payment_breakdown, billed_by, cancel_reason, order_source, advance_amount, advance_paid_by, balance_due, full_amount, fully_paid_at, balance_payment_type, balance_paid_by, balance_order_id, parcel_charges, delivery_date, wallet_id, wallet_amount, wallet_transaction_id, promotion_discount, promotion_ids, wallet_cashback')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      if (!data) return;
      const fresh = data.map(dbRowToOrder);
      const freshIds = new Set(fresh.map(o => o.id));
      const merged = [...fresh, ...get().orders.filter(o => !freshIds.has(o.id))]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      // Anything outside this fetch's window is left exactly as it was —
      // this is a merge, never a wholesale replace. Anything inside the
      // window is fully replaced with the fresh copy so status/payment
      // changes on recent orders are still reflected.
      set({ orders: merged, _pollFailCount: 0 });
      void setCached(ORDERS_CACHE_KEY, merged);
    } catch (e) {
      console.error('[refreshRecentOrders] fetch failed (will retry on next poll tick):', e);
    }
  },

  submitOrder: async (params) => {
    await useMenuStore.getState().loadMenu(true);
    const latestMenu = useMenuStore.getState().items;
    const cart = get().cart.map((cartItem) => {
      const latest = latestMenu.find((item) => item.id === cartItem.menuItem.id);
      return latest ? { ...cartItem, menuItem: latest } : cartItem;
    });
    validateCart(cart);
    // NOTE (MD Bug #17): subtotal is computed client-side from menuStore prices (5-min cache).
    // A sophisticated user could mutate in-memory prices before adding to cart and submit
    // an artificially low subtotal. Defense-in-depth fix requires a Supabase DB trigger or
    // RPC-side re-validation of item prices at insert time — this is a backend schema change.
    // Frontend mitigation: staff billing review before payment collection is the current guard.
    // Supabase migration validates inserted item prices/subtotal against menu_items.
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const parcelCharges = Number(params.parcelCharges ?? 0);
    if (!Number.isFinite(parcelCharges) || parcelCharges < 0) {
      throw new Error('Parcel charges must be a valid non-negative amount.');
    }
    const total = subtotal + parcelCharges;
    const orderId = generateId();
    const now = new Date().toISOString();
    const orderSource = params.orderSource || 'staff';
    const paymentType = params.paymentType || 'unpaid';
    const orderStatus = params.status || 'pending';
    if (paymentType === 'part_payment') validatePaymentBreakdown(params.paymentBreakdown, total);

    const { data: numData, error: numError } = await supabase.rpc('get_next_order_number');
    if (numError || !numData) {
      throw new Error('Failed to get order number. Please try again.');
    }
    const orderNumber = numData as number;

    const order: Order = {
      id: orderId, orderNumber, tableNumber: params.tableNumber, orderType: params.orderType,
      items: [...cart], subtotal, discount: 0, discountType: 'flat', discountValue: 0, total,
      status: orderStatus, createdBy: params.createdBy, createdAt: now, updatedAt: now,
      notes: params.notes, customerName: params.customerName, paymentType, orderSource,
      ...(params.billedBy ? { billedBy: params.billedBy } : {}),
      ...(params.paymentBreakdown ? { paymentBreakdown: params.paymentBreakdown } : {}),
      ...(parcelCharges > 0 ? { parcelCharges } : {}),
    };

    const cartSnapshot = [...cart];
    set((state) => ({ orders: [order, ...state.orders], cart: [] }));

    const payload = {
      id: orderId, order_number: orderNumber, table_number: params.tableNumber || null,
      order_type: params.orderType, items: cartSnapshot, subtotal, discount: 0, discount_type: 'flat',
      discount_value: 0, total, status: orderStatus, created_by: params.createdBy,
      notes: params.notes || null, customer_name: params.customerName || null,
      payment_type: paymentType, payment_breakdown: params.paymentBreakdown || null, billed_by: params.billedBy || null, order_source: orderSource, created_at: now, updated_at: now,
      parcel_charges: parcelCharges,
    };

    const { error } = await supabase.from('orders').insert(payload);
    if (error) {
      const inflightCart = get().cart;
      const mergedCart = [...cartSnapshot];
      for (const inflightItem of inflightCart) {
        const existing = mergedCart.find((c) => c.menuItem.id === inflightItem.menuItem.id);
        if (existing) {
          existing.quantity += inflightItem.quantity;
        } else {
          mergedCart.push(inflightItem);
        }
      }
      set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId), cart: mergedCart }));
      console.error('[submitOrder] Supabase insert failed:', error);
      throw new Error(`Failed to submit order: ${error.message}`);
    }

    return orderId;
  },

  submitAdvanceOrder: async (params) => {
    await useMenuStore.getState().loadMenu(true);
    const latestMenu = useMenuStore.getState().items;
    const cart = get().advanceCart.map((cartItem) => {
      const latest = latestMenu.find((item) => item.id === cartItem.menuItem.id);
      return latest ? { ...cartItem, menuItem: latest } : cartItem;
    });
    validateCart(cart);
    // NOTE (MD Bug #17): subtotal is computed client-side from menuStore prices (5-min cache).
    // A sophisticated user could mutate in-memory prices before adding to cart and submit
    // an artificially low subtotal. Defense-in-depth fix requires a Supabase DB trigger or
    // RPC-side re-validation of item prices at insert time — this is a backend schema change.
    // Frontend mitigation: staff billing review before payment collection is the current guard.
    // Supabase migration validates inserted item prices/subtotal against menu_items.
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const orderId = generateId();
    const now = new Date().toISOString();
    const isFullPayment = params.isFullPayment ?? false;
    const requestedAdvance = Number(params.advanceAmount);
    if (!isFullPayment && (!Number.isFinite(requestedAdvance) || requestedAdvance <= 0 || requestedAdvance > subtotal)) {
      throw new Error('Advance amount must be greater than zero and cannot exceed the order total.');
    }
    const balanceDue = isFullPayment ? 0 : Math.max(0, subtotal - params.advanceAmount);
    const total = isFullPayment ? subtotal : params.advanceAmount;

    // Runtime guard: deliveryDate must be a valid future date/time before saving.
    if (!params.deliveryDate || Number.isNaN(new Date(params.deliveryDate).getTime())) {
      throw new Error('Delivery date is required and must be a valid date/time.');
    }
    if (new Date(params.deliveryDate).getTime() <= Date.now()) {
      throw new Error('Delivery date must be in the future.');
    }

    const { data: numData, error: numError } = await supabase.rpc('get_next_order_number');
    if (numError || !numData) throw new Error('Failed to get order number. Please try again.');
    const orderNumber = numData as number;

    const cartSnapshot = [...cart];
    set({ advanceCart: [] });

    const order: Order = {
      id: orderId, orderNumber, tableNumber: params.tableNumber, orderType: params.orderType,
      items: cartSnapshot, subtotal, discount: 0, discountType: 'flat', discountValue: 0,
      total,
      fullAmount: subtotal,
      status: 'served',
      createdBy: params.createdBy, billedBy: params.createdBy,
      createdAt: now, updatedAt: now,
      notes: params.notes, customerName: params.customerName,
      paymentType: 'advance',
      orderSource: 'staff',
      advanceAmount: isFullPayment ? subtotal : params.advanceAmount,
      advancePaidBy: params.advancePaidBy,
      balanceDue,
      deliveryDate: params.deliveryDate,
      ...(isFullPayment ? { fullyPaidAt: now, balancePaymentType: params.advancePaidBy, balancePaidBy: params.createdBy } : {}),
    };

    set((state) => ({ orders: [order, ...state.orders] }));

    const payload = {
      id: orderId, order_number: orderNumber, table_number: params.tableNumber || null,
      order_type: params.orderType, items: cartSnapshot, subtotal,
      discount: 0, discount_type: 'flat', discount_value: 0,
      total,
      full_amount: subtotal,
      status: 'served',
      created_by: params.createdBy, billed_by: params.createdBy,
      notes: params.notes || null, customer_name: params.customerName || null,
      payment_type: 'advance', order_source: 'staff',
      advance_amount: isFullPayment ? subtotal : params.advanceAmount,
      advance_paid_by: params.advancePaidBy,
      balance_due: balanceDue,
      delivery_date: params.deliveryDate,
      created_at: now, updated_at: now,
      ...(isFullPayment ? { fully_paid_at: now, balance_payment_type: params.advancePaidBy, balance_paid_by: params.createdBy } : {}),
    };

    const { error } = await supabase.from('orders').insert(payload);
    if (error) {
      set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId), advanceCart: cartSnapshot }));
      console.error('[submitAdvanceOrder] Supabase insert failed:', error);
      throw new Error(`Failed to submit advance order: ${error.message}`);
    }
    return orderId;
  },

  updateOrderStatus: async (orderId, status, cancelReason) => {
    const prev = get().orders;
    const now = new Date().toISOString();
    const order = get().orders.find(o => o.id === orderId);

    // FIX (MD Bug #23): block cancellation if any payment has already been collected.
    // Cancelling a paid/advance order drops it from Daily Closure revenue entirely,
    // leaving physically-collected cash untracked — a direct skimming vector reachable
    // by order_taker, admin, and kitchen roles via the Order History screen.
    // A paid order must go through the refund/return flow first, never a bare cancel.
    if (status === 'cancelled' && order && order.paymentType !== 'unpaid') {
      throw new Error(
        'Cannot cancel: payment has already been collected for this order. ' +
        'Process a refund first, then cancel.'
      );
    }

    const effectiveStatus: OrderStatus =
      status === 'ready' && order && order.paymentType !== 'unpaid'
        ? 'served'
        : status;

    const updates: Record<string, unknown> = { status: effectiveStatus, updated_at: now };
    if (cancelReason) updates.cancel_reason = cancelReason;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status: effectiveStatus, updatedAt: now, ...(cancelReason ? { cancelReason } : {}) } : o,
      ),
    }));

    // FIX (MD Bug #9): optimistic lock on updated_at prevents silent last-write-wins
    const { data: statusLock, error } = await supabase.from('orders').update(updates).eq('id', orderId).eq('updated_at', order?.updatedAt ?? now).select('id');
    if (error || !statusLock || statusLock.length === 0) {
      set({ orders: prev });
      throw new Error(!statusLock || statusLock.length === 0 ? 'Order was modified by someone else. Please refresh.' : 'Failed to update order status');
    }
  },


  refundAndCancel: async (orderId, cancelReason, refundedBy, password) => {
    const prev = get().orders;
    const order = prev.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found. Refresh and try again.');
    if (order.status === 'cancelled') throw new Error('Order is already cancelled.');
    if (order.paymentType === 'unpaid') {
      await get().updateOrderStatus(orderId, 'cancelled', cancelReason);
      return;
    }

    const now = new Date().toISOString();
    const refundMode = order.paymentType === 'part_payment'
      ? 'split'
      : order.paymentType === 'advance'
        ? (order.advancePaidBy || 'unknown')
        : order.paymentType;
    const refundAmount = order.paymentType === 'advance'
      ? Number(order.fullyPaidAt ? (order.fullAmount || order.total) : (order.advanceAmount || order.total))
      : Number(order.total || 0);
    const audit = `[REFUND ${now}] mode=${refundMode}; amount=${refundAmount.toFixed(2)}; by=${refundedBy}; reason=${cancelReason}`;
    const notes = [order.notes, audit].filter(Boolean).join('\n');
    const { data, error } = await supabase.rpc('refund_and_cancel_order', {
      p_order_id: orderId,
      p_expected_updated_at: order.updatedAt,
      p_username: refundedBy,
      p_password: password,
      p_cancel_reason: cancelReason,
      p_refund_audit: audit,
    });
    if (error || !data) {
      set({ orders: prev });
      throw new Error(error?.message || 'Refund was not saved. Refresh and try again.');
    }

    set((state) => ({
      orders: state.orders.map((o) => o.id === orderId
        ? { ...o, status: 'cancelled', cancelReason, notes, updatedAt: now }
        : o),
    }));
  },

  applyDiscount: async (orderId, discountType, discountValue) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;

    if (discountValue < 0) return;
    if (discountType === 'percentage' && discountValue > 100) return;
    if (discountType === 'flat' && discountValue > order.subtotal) return;

    const prev = get().orders;
    const discount = discountType === 'percentage'
      ? Math.round(order.subtotal * (discountValue / 100))
      : discountValue;
    const parcelCharges = order.parcelCharges ?? 0;
    const total = Math.max(0, order.subtotal - discount) + parcelCharges;
    const now = new Date().toISOString();

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, discountType, discountValue, discount, total, updatedAt: now } : o,
      ),
    }));

    // FIX (MD Bug #9): apply optimistic-lock check via updated_at so concurrent edits
    // (e.g. one staff applies discount while another updates status) are detected.
    const { data: discountLock, error } = await supabase.from('orders').update({
      discount_type: discountType, discount_value: discountValue, discount, total, updated_at: now,
    }).eq('id', orderId).eq('updated_at', order.updatedAt).select('id');
    if (error || !discountLock || discountLock.length === 0) {
      set({ orders: prev });
      throw new Error(!discountLock || discountLock.length === 0 ? 'Order was modified by someone else. Please refresh.' : 'Failed to apply discount');
    }
  },

  setPaymentType: async (orderId, paymentType, billedBy, breakdown) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    if (paymentType === 'part_payment') validatePaymentBreakdown(breakdown, order.total);
    const prev = get().orders;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      payment_type: paymentType, billed_by: billedBy, updated_at: now,
    };
    if (breakdown) updates.payment_breakdown = breakdown;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentType, billedBy, updatedAt: now, ...(breakdown ? { paymentBreakdown: breakdown } : {}) } : o,
      ),
    }));

    const { data: lockData, error } = await supabase.from('orders')
      .update(updates)
      .eq('id', orderId)
      .eq('updated_at', order.updatedAt)
      .select('id');

    if (error || !lockData || lockData.length === 0) {
      set({ orders: prev });
      throw new Error(!lockData || lockData.length === 0
        ? 'Order was modified by someone else. Please refresh.'
        : 'Failed to set payment type');
    }
  },

  setAdvancePayment: async (orderId, advanceAmount, advancePaidBy, billedBy) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    const prev = get().orders;
    const now = new Date().toISOString();
    // CRITICAL FIX: use fullAmount ?? subtotal as the base so that re-calling this on an
    // already-advance order (where order.total was set to the previous advance amount) still
    // computes the balance correctly against the original full bill value.
    const billBase = order.fullAmount ?? order.subtotal;
    if (!Number.isFinite(advanceAmount) || advanceAmount <= 0 || advanceAmount > billBase) {
      throw new Error('Advance amount must be greater than zero and cannot exceed the bill total.');
    }
    const balanceDue = Math.max(0, billBase - advanceAmount);
    const updates: Record<string, unknown> = {
      payment_type: 'advance', advance_amount: advanceAmount, advance_paid_by: advancePaidBy,
      balance_due: balanceDue, billed_by: billedBy, updated_at: now,
    };

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentType: 'advance', advanceAmount, advancePaidBy, balanceDue, billedBy, updatedAt: now } : o,
      ),
    }));

    // FIX (MD Bug #9): optimistic lock on updated_at
    const { data: advanceLock, error } = await supabase.from('orders').update(updates).eq('id', orderId).eq('updated_at', order.updatedAt).select('id');
    if (error || !advanceLock || advanceLock.length === 0) {
      set({ orders: prev });
      throw new Error(!advanceLock || advanceLock.length === 0 ? 'Order was modified by someone else. Please refresh.' : 'Failed to set advance payment');
    }
  },

  collectBalance: async (orderId, balancePaymentType, billedBy, breakdown) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    // LOGIC FIX: prevent double-collection if balance was already collected (double-tap, race, etc.)
    if (!order.balanceDue || order.balanceDue <= 0 || order.fullyPaidAt) {
      console.warn('[collectBalance] order already settled or no balance due; aborting', orderId);
      return;
    }
    const prev = get().orders;
    const now = new Date().toISOString();
    const balanceAmount = order.balanceDue ?? 0;
    if (!['cash', 'upi', 'card', 'part_payment'].includes(balancePaymentType)) {
      throw new Error('Select cash, UPI, card, or split payment for the balance collection.');
    }
    if (balancePaymentType === 'part_payment') validatePaymentBreakdown(breakdown, balanceAmount);

    const balanceOrderId = generateId();
    const { data: numData, error: numError } = await supabase.rpc('get_next_order_number');
    if (numError || !numData) throw new Error('Failed to get order number. Please try again.');
    const balanceOrderNumber = numData as number;

    const balanceOrder: Order = {
      id: balanceOrderId,
      orderNumber: balanceOrderNumber,
      tableNumber: order.tableNumber,
      orderType: order.orderType,
      items: order.items,
      subtotal: balanceAmount,
      discount: 0, discountType: 'flat', discountValue: 0,
      total: balanceAmount,
      status: 'served',
      createdBy: billedBy,
      createdAt: now, updatedAt: now,
      notes: order.notes,
      customerName: order.customerName,
      paymentType: balancePaymentType,
      orderSource: 'balance',
      parcelCharges: order.parcelCharges ?? 0,
      ...(breakdown ? { paymentBreakdown: breakdown } : {}),
    };

    const balancePayload = {
      id: balanceOrderId,
      order_number: balanceOrderNumber,
      table_number: order.tableNumber || null,
      order_type: order.orderType,
      items: order.items,
      subtotal: balanceAmount,
      discount: 0, discount_type: 'flat', discount_value: 0,
      total: balanceAmount,
      status: 'served',
      created_by: billedBy,
      notes: order.notes || null,
      customer_name: order.customerName || null,
      payment_type: balancePaymentType,
      order_source: 'balance',
      created_at: now, updated_at: now,
      parcel_charges: order.parcelCharges ?? 0,
      ...(breakdown ? { payment_breakdown: breakdown } : {}),
    };

    const closeUpdates: Record<string, unknown> = {
      balance_due: 0,
      fully_paid_at: now,
      balance_payment_type: balancePaymentType,
      balance_paid_by: billedBy,
      balance_order_id: balanceOrderId,
      updated_at: now,
    };

    set((state) => ({
      orders: [
        balanceOrder,
        ...state.orders.map((o) =>
          o.id === orderId
            ? { ...o, balanceDue: 0, fullyPaidAt: now, balancePaymentType, balancePaidBy: billedBy, balanceOrderId, updatedAt: now }
            : o,
        ),
      ],
    }));

    const { error: insertError } = await supabase.from('orders').insert(balancePayload);
    if (insertError) {
      set({ orders: prev });
      console.error('[collectBalance] insert balance order failed:', insertError);
      throw new Error(`Failed to record balance payment: ${insertError.message}`);
    }

    // BUG FIX: every sibling payment mutator (updateOrderStatus, applyDiscount,
    // setPaymentType, setAdvancePayment) closes with an optimistic-lock check
    // on updated_at so a concurrent write from another terminal is detected
    // instead of silently overwritten. This function's closing update was
    // missing that check — two billers collecting the same advance order's
    // balance around the same time could both pass the earlier in-memory
    // guard (each only sees their own client's stale order state), both
    // insert their own balance order (fresh id each time, so both inserts
    // succeed), and both close updates would succeed too, producing two
    // duplicate paid "balance" orders and double-counted revenue for one
    // advance sale.
    const { data: balanceLock, error: updateError } = await supabase
      .from('orders')
      .update(closeUpdates)
      .eq('id', orderId)
      .eq('updated_at', order.updatedAt)
      .select('id');

    if (updateError || !balanceLock || balanceLock.length === 0) {
      await supabase.from('orders').delete().eq('id', balanceOrderId);
      set({ orders: prev });
      console.error('[collectBalance] close advance order failed, compensated:', updateError);
      throw new Error(
        !balanceLock || balanceLock.length === 0
          ? 'This order was already updated (possibly by another terminal). Please refresh and check the balance before retrying.'
          : `Failed to close advance order: ${updateError?.message}`,
      );
    }
  },

  startPolling: (days = 60) => {
    const state = get();
    const newCount = (state._pollRefCount || 0) + 1;
    set({ _pollRefCount: newCount });
    if (state.pollTimer) return;
    if (!orderRealtimeChannel) {
      orderRealtimeChannel = supabase
        .channel('cafe-orders-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          const event = payload as { eventType?: string; new?: Record<string, unknown>; old?: { id?: string } };
          const id = String(event.new?.id ?? event.old?.id ?? '');
          if (!id) return;
          // Buffer this event instead of applying it immediately — see the
          // ORDER_EVENT_FLUSH_MS comment above. Map key = order id, so a
          // rapid burst of updates to the SAME order (e.g. a cart being
          // edited live) collapses to just its latest state, not one entry
          // per keystroke.
          if (event.eventType === 'DELETE') {
            pendingOrderEvents.set(id, { type: 'delete' });
          } else {
            pendingOrderEvents.set(id, { type: 'upsert', order: dbRowToOrder(event.new ?? {}) });
          }
          if (orderFlushTimer) return;
          orderFlushTimer = setTimeout(() => {
            const events = pendingOrderEvents;
            pendingOrderEvents = new Map();
            orderFlushTimer = null;
            set((current) => {
              let next = current.orders;
              const ids = new Set(events.keys());
              next = next.filter((order) => !ids.has(order.id));
              for (const ev of events.values()) {
                if (ev.type === 'upsert' && ev.order) next = [ev.order, ...next];
              }
              return { orders: next.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
            });
          }, ORDER_EVENT_FLUSH_MS);
        })
        .subscribe();
    }
    // EGRESS FIX (2026-08-21): the recurring tick now refreshes only a
    // small, recent window via refreshRecentOrders (merged into existing
    // state, not a replace) instead of re-fetching the caller's entire
    // `days` window every 15 minutes — see the comment on
    // refreshRecentOrders above for the full reasoning. The one-time
    // initial load two lines down is untouched, so a caller that asks for
    // 90 days still sees 90 days the moment this screen opens.
    const timer = setInterval(() => { if (!document.hidden) get().refreshRecentOrders(POLL_REFRESH_DAYS); }, POLL_INTERVAL_MS);
    set({ polling: true, pollTimer: timer });
    // EGRESS FIX (2026-08-21): check the local cache before deciding how to
    // do the initial load. If a previous session already persisted a full
    // copy of `orders` (see setCached calls in loadOrders/
    // refreshRecentOrders), hydrate from that instantly and only fetch a
    // small, recent catch-up window over the network — instead of
    // re-downloading the entire requested `days` window again just because
    // the page was reloaded. Falls back to exactly today's wide fetch if
    // there's nothing cached yet (first-ever visit) or the cache is
    // unavailable for any reason.
    void (async () => {
      const hydrated = await hydrateOrdersFromCache(set);
      if (hydrated) {
        await get().refreshRecentOrders(POLL_REFRESH_DAYS);
      } else {
        await get().loadOrders(days);
      }
    })();
  },

  stopPolling: () => {
    const state = get();
    const newCount = Math.max(0, (state._pollRefCount || 0) - 1);
    set({ _pollRefCount: newCount });
    if (newCount === 0) {
      if (state._pollBackoffTimer) {
        clearTimeout(state._pollBackoffTimer);
        set({ _pollBackoffTimer: null });
      }
      if (state.pollTimer) {
        clearInterval(state.pollTimer);
        set({ polling: false, pollTimer: null });
      }
      if (orderRealtimeChannel) {
        void supabase.removeChannel(orderRealtimeChannel);
        orderRealtimeChannel = null;
      }
    }
  },
}));
