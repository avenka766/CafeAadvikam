import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { CartItem, MenuItem, Order, OrderType, OrderStatus, PaymentType, PaymentBreakdown, OrderSource } from '@/types';
import { generateId } from '@/lib/utils';

interface OrderState {
  orders: Order[];
  cart: CartItem[];
  loading: boolean;
  polling: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
  _pollRefCount: number;
  _pollFailCount: number; // consecutive load failures — used for backoff

  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  setCartItemNotes: (itemId: string, notes: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;

  loadOrders: (days?: number) => Promise<void>;
  submitOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; orderSource?: OrderSource; parcelCharges?: number; }) => Promise<string>;
  submitAdvanceOrder: (params: { tableNumber?: number; orderType: OrderType; notes?: string; customerName?: string; createdBy: string; advanceAmount: number; advancePaidBy: string; }) => Promise<string>;
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
    fullyPaidAt: row.fully_paid_at as string | undefined,
    balancePaymentType: row.balance_payment_type as string | undefined,
    balancePaidBy: row.balance_paid_by as string | undefined,
  };
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  cart: [],
  loading: false,
  polling: false,
  pollTimer: null,
  _pollRefCount: 0,
  _pollFailCount: 0,

  // === Cart (local) ===
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

  // === Orders (DB-synced) ===
  // PERF-01: accepts days parameter — kitchen/billing use 1, reports use 60
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
      if (data) set({ orders: data.map(dbRowToOrder), _pollFailCount: 0 }); // reset backoff on success
    } catch (e) {
      // POLL-FIX: exponential backoff on repeated failures — reschedule the interval
      // at 3s * 2^failCount (capped at 60s) so a DB outage doesn't hammer the server.
      const failCount = (get()._pollFailCount || 0) + 1;
      set({ _pollFailCount: failCount });
      const backoffMs = Math.min(3000 * Math.pow(2, failCount - 1), 60_000);
      console.error(`[loadOrders] fetch failed (attempt ${failCount}, next retry in ${backoffMs}ms):`, e);

      // If we're in a polling loop, reschedule at the backoff interval
      const { pollTimer } = get();
      if (pollTimer) {
        clearInterval(pollTimer);
        const retryTimer = setTimeout(() => {
          const newTimer = setInterval(() => { get().loadOrders(days); }, 3000);
          set({ pollTimer: newTimer });
          get().loadOrders(days);
        }, backoffMs);
        // Store timeout id in pollTimer slot temporarily (same cleanup path)
        set({ pollTimer: retryTimer as unknown as ReturnType<typeof setInterval> });
      }
    } finally {
      set({ loading: false });
    }
  },

  submitOrder: async (params) => {
    const { cart } = get();
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const parcelCharges = params.parcelCharges ?? 0;
    const total = subtotal + parcelCharges;
    const orderId = generateId();
    const now = new Date().toISOString();
    const orderSource = params.orderSource || 'staff';

    const { data: numData, error: numError } = await supabase.rpc('get_next_order_number');
    // BUG-01: never fall back to timestamp — fail loudly so staff know to retry
    if (numError || !numData) {
      throw new Error('Failed to get order number. Please try again.');
    }
    const orderNumber = numData as number;

    const order: Order = {
      id: orderId, orderNumber, tableNumber: params.tableNumber, orderType: params.orderType,
      items: [...cart], subtotal, discount: 0, discountType: 'flat', discountValue: 0, total,
      status: 'pending', createdBy: params.createdBy, createdAt: now, updatedAt: now,
      notes: params.notes, customerName: params.customerName, paymentType: 'unpaid', orderSource,
      ...(parcelCharges > 0 ? { parcelCharges } : {}),
    };

    // Optimistic update
    set((state) => ({ orders: [order, ...state.orders], cart: [] }));

    const payload = {
      id: orderId, order_number: orderNumber, table_number: params.tableNumber || null,
      order_type: params.orderType, items: cart, subtotal, discount: 0, discount_type: 'flat',
      discount_value: 0, total, status: 'pending', created_by: params.createdBy,
      notes: params.notes || null, customer_name: params.customerName || null,
      payment_type: 'unpaid', order_source: orderSource, created_at: now, updated_at: now,
      ...(parcelCharges > 0 ? { parcel_charges: parcelCharges } : {}),
    };

    const { error } = await supabase.from('orders').insert(payload);
    if (error) {
      // ARCH-04: rollback optimistic update
      set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId), cart }));
      throw new Error('Failed to submit order. Please try again.');
    }

    return orderId;
  },

  submitAdvanceOrder: async (params) => {
    const { cart } = get();
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const orderId = generateId();
    const now = new Date().toISOString();
    const balanceDue = Math.max(0, subtotal - params.advanceAmount);

    const { data: numData, error: numError } = await supabase.rpc('get_next_order_number');
    if (numError || !numData) throw new Error('Failed to get order number. Please try again.');
    const orderNumber = numData as number;

    const order: Order = {
      id: orderId, orderNumber, tableNumber: params.tableNumber, orderType: params.orderType,
      items: [...cart], subtotal, discount: 0, discountType: 'flat', discountValue: 0, total: subtotal,
      status: 'served', createdBy: params.createdBy, createdAt: now, updatedAt: now,
      notes: params.notes, customerName: params.customerName, paymentType: 'advance',
      orderSource: 'staff', advanceAmount: params.advanceAmount, advancePaidBy: params.advancePaidBy, balanceDue,
    };

    set((state) => ({ orders: [order, ...state.orders], cart: [] }));

    const payload = {
      id: orderId, order_number: orderNumber, table_number: params.tableNumber || null,
      order_type: params.orderType, items: cart, subtotal, discount: 0, discount_type: 'flat',
      discount_value: 0, total: subtotal, status: 'served', created_by: params.createdBy,
      notes: params.notes || null, customer_name: params.customerName || null,
      payment_type: 'advance', order_source: 'staff', advance_amount: params.advanceAmount,
      advance_paid_by: params.advancePaidBy, balance_due: balanceDue, created_at: now, updated_at: now,
    };

    const { error } = await supabase.from('orders').insert(payload);
    if (error) {
      set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId), cart }));
      throw new Error('Failed to submit advance order. Please try again.');
    }
    return orderId;
  },

  updateOrderStatus: async (orderId, status, cancelReason) => {
    // ARCH-04: capture previous state for rollback
    const prev = get().orders;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status, updated_at: now };
    if (cancelReason) updates.cancel_reason = cancelReason;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: now, ...(cancelReason ? { cancelReason } : {}) } : o,
      ),
    }));

    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) {
      set({ orders: prev }); // rollback
      throw new Error('Failed to update order status');
    }
  },

  applyDiscount: async (orderId, discountType, discountValue) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;

    // ARCH-05: validate discount bounds
    if (discountValue < 0) return;
    if (discountType === 'percentage' && discountValue > 100) return;
    if (discountType === 'flat' && discountValue > order.subtotal) return;

    const prev = get().orders;
    const discount = discountType === 'percentage'
      ? Math.round(order.subtotal * (discountValue / 100))
      : discountValue;
    const total = Math.max(0, order.subtotal - discount);
    const now = new Date().toISOString();

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, discountType, discountValue, discount, total, updatedAt: now } : o,
      ),
    }));

    const { error } = await supabase.from('orders').update({
      discount_type: discountType, discount_value: discountValue, discount, total, updated_at: now,
    }).eq('id', orderId);
    if (error) { set({ orders: prev }); throw new Error('Failed to apply discount'); }
  },

  setPaymentType: async (orderId, paymentType, billedBy, breakdown) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    const prev = get().orders;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      payment_type: paymentType, billed_by: billedBy, updated_at: now,
      // PROD-03: optimistic concurrency lock — only update if not already modified
      // (Supabase doesn't natively support WHERE updated_at = X in JS client without RPC)
    };
    if (breakdown) updates.payment_breakdown = breakdown;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentType, billedBy, updatedAt: now, ...(breakdown ? { paymentBreakdown: breakdown } : {}) } : o,
      ),
    }));

    // PROD-03: match on updated_at to detect concurrent modification
    const { count, error } = await supabase.from('orders')
      .update(updates)
      .eq('id', orderId)
      .eq('updated_at', order.updatedAt)
      .select();

    if (error || count === 0) {
      set({ orders: prev });
      throw new Error(count === 0
        ? 'Order was modified by someone else. Please refresh.'
        : 'Failed to set payment type');
    }
  },

  setAdvancePayment: async (orderId, advanceAmount, advancePaidBy, billedBy) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    const prev = get().orders;
    const now = new Date().toISOString();
    const balanceDue = Math.max(0, order.total - advanceAmount);
    const updates: Record<string, unknown> = {
      payment_type: 'advance', advance_amount: advanceAmount, advance_paid_by: advancePaidBy,
      balance_due: balanceDue, billed_by: billedBy, updated_at: now,
    };

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentType: 'advance', advanceAmount, advancePaidBy, balanceDue, billedBy, updatedAt: now } : o,
      ),
    }));

    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) { set({ orders: prev }); throw new Error('Failed to set advance payment'); }
  },

  collectBalance: async (orderId, balancePaymentType, billedBy, breakdown) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    const prev = get().orders;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      payment_type: 'advance', billed_by: billedBy, balance_due: 0, fully_paid_at: now,
      balance_payment_type: balancePaymentType, balance_paid_by: billedBy, status: 'served', updated_at: now,
    };
    if (breakdown) updates.payment_breakdown = breakdown;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId
          ? { ...o, paymentType: 'advance', billedBy, balanceDue: 0, fullyPaidAt: now, balancePaymentType, balancePaidBy: billedBy, status: 'served', updatedAt: now, ...(breakdown ? { paymentBreakdown: breakdown } : {}) }
          : o,
      ),
    }));

    // PROD-03: optimistic lock on collect balance
    const { count, error } = await supabase.from('orders')
      .update(updates)
      .eq('id', orderId)
      .eq('updated_at', order.updatedAt)
      .select();

    if (error || count === 0) {
      set({ orders: prev });
      throw new Error(count === 0 ? 'Order was modified by someone else. Please refresh.' : 'Failed to collect balance');
    }
  },

  // PERF-01: reference-counted polling — accepts days param forwarded to loadOrders
  startPolling: (days = 60) => {
    const state = get();
    const newCount = (state._pollRefCount || 0) + 1;
    set({ _pollRefCount: newCount });
    if (state.pollTimer) return;
    get().loadOrders(days);
    const timer = setInterval(() => { get().loadOrders(days); }, 3000);
    set({ polling: true, pollTimer: timer });
  },

  stopPolling: () => {
    const state = get();
    const newCount = Math.max(0, (state._pollRefCount || 0) - 1);
    set({ _pollRefCount: newCount });
    if (newCount === 0 && state.pollTimer) {
      clearInterval(state.pollTimer);
      set({ polling: false, pollTimer: null });
    }
  },
}));
