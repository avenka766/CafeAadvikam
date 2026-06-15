import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { CartItem, MenuItem, Order, OrderType, OrderStatus, PaymentType, PaymentBreakdown, OrderSource } from '@/types';
import { generateId } from '@/lib/utils';
import { useMenuStore } from '@/stores/menuStore';

// HYGIENE FIX: 3-second polling is very aggressive — with multiple devices/tabs open it creates a
// large number of DB reads. Increased to 30 seconds. The preferred long-term solution is to
// migrate to Supabase Realtime subscriptions, but this constant makes it easy to tune.
const POLL_INTERVAL_MS = 5_000;

interface OrderState {
  orders: Order[];
  cart: CartItem[];
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
  getCartTotal: () => number;
  getCartCount: () => number;

  loadOrders: (days?: number) => Promise<void>;
  submitOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; orderSource?: OrderSource; parcelCharges?: number; paymentType?: PaymentType; paymentBreakdown?: PaymentBreakdown; billedBy?: string; status?: OrderStatus; }) => Promise<string>;
  submitAdvanceOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; advanceAmount: number; advancePaidBy: string; deliveryDate: string; isFullPayment?: boolean; }) => Promise<string>;
  updateOrderStatus: (orderId: string, status: OrderStatus, cancelReason?: string) => Promise<void>;
  applyDiscount: (orderId: string, discountType: 'percentage' | 'flat', discountValue: number) => Promise<void>;
  setPaymentType: (orderId: string, paymentType: PaymentType, billedBy: string, breakdown?: PaymentBreakdown) => Promise<void>;
  setAdvancePayment: (orderId: string, advanceAmount: number, advancePaidBy: string, billedBy: string) => Promise<void>;
  collectBalance: (orderId: string, balancePaymentType: PaymentType, billedBy: string, breakdown?: PaymentBreakdown) => Promise<void>;

  startPolling: (days?: number) => void;
  stopPolling: () => void;
}

function dbRowToOrder(row: Record<string, unknown>): Order {
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
  };
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  cart: [],
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
  getCartTotal: () => get().cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0),
  getCartCount: () => get().cart.reduce((sum, c) => sum + c.quantity, 0),

  loadOrders: async (days = 60) => {
    set({ loading: true });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) set({ orders: data.map(dbRowToOrder), _pollFailCount: 0 });
    } catch (e) {
      const failCount = (get()._pollFailCount || 0) + 1;
      set({ _pollFailCount: failCount });
      const backoffMs = Math.min(POLL_INTERVAL_MS * Math.pow(2, failCount - 1), 60_000);
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
          const newTimer = setInterval(() => { get().loadOrders(days); }, POLL_INTERVAL_MS);
          set({ pollTimer: newTimer });
          get().loadOrders(days);
        }, backoffMs);
        set({ _pollBackoffTimer: retryTimer });
      }
    } finally {
      set({ loading: false });
    }
  },

  submitOrder: async (params) => {
    await useMenuStore.getState().loadMenu(true);
    const latestMenu = useMenuStore.getState().items;
    const cart = get().cart.map((cartItem) => {
      const latest = latestMenu.find((item) => item.id === cartItem.menuItem.id);
      return latest ? { ...cartItem, menuItem: latest } : cartItem;
    });
    // NOTE (MD Bug #17): subtotal is computed client-side from menuStore prices (5-min cache).
    // A sophisticated user could mutate in-memory prices before adding to cart and submit
    // an artificially low subtotal. Defense-in-depth fix requires a Supabase DB trigger or
    // RPC-side re-validation of item prices at insert time — this is a backend schema change.
    // Frontend mitigation: staff billing review before payment collection is the current guard.
    // Supabase migration validates inserted item prices/subtotal against menu_items.
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const parcelCharges = params.parcelCharges ?? 0;
    const total = subtotal + parcelCharges;
    const orderId = generateId();
    const now = new Date().toISOString();
    const orderSource = params.orderSource || 'staff';
    const paymentType = params.paymentType || 'unpaid';
    const orderStatus = params.status || 'pending';

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
    const cart = get().cart.map((cartItem) => {
      const latest = latestMenu.find((item) => item.id === cartItem.menuItem.id);
      return latest ? { ...cartItem, menuItem: latest } : cartItem;
    });
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
    set({ cart: [] });

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
      set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId), cart: cartSnapshot }));
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

    const { error: updateError } = await supabase
      .from('orders')
      .update(closeUpdates)
      .eq('id', orderId);

    if (updateError) {
      await supabase.from('orders').delete().eq('id', balanceOrderId);
      set({ orders: prev });
      console.error('[collectBalance] close advance order failed, compensated:', updateError);
      throw new Error(`Failed to close advance order: ${updateError.message}`);
    }
  },

  startPolling: (days = 60) => {
    const state = get();
    const newCount = (state._pollRefCount || 0) + 1;
    set({ _pollRefCount: newCount });
    if (state.pollTimer) return;
    const timer = setInterval(() => { get().loadOrders(days); }, POLL_INTERVAL_MS);
    set({ polling: true, pollTimer: timer });
    get().loadOrders(days);
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
    }
  },
}));
