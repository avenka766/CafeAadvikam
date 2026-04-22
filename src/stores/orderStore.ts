import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { CartItem, MenuItem, Order, OrderType, OrderStatus, PaymentType, PaymentBreakdown } from '@/types';
import { generateId } from '@/lib/utils';

interface OrderState {
  orders: Order[];
  cart: CartItem[];
  loading: boolean;
  polling: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;

  // Cart actions (local only)
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  setCartItemNotes: (itemId: string, notes: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;

  // Order actions (DB-synced)
  loadOrders: () => Promise<void>;
  submitOrder: (params: {
    tableNumber?: number;
    orderType: OrderType;
    notes?: string;
    customerName?: string;
    createdBy: string;
  }) => Promise<string>;
  updateOrderStatus: (orderId: string, status: OrderStatus, cancelReason?: string) => Promise<void>;
  applyDiscount: (orderId: string, discountType: 'percentage' | 'flat', discountValue: number) => Promise<void>;
  setPaymentType: (orderId: string, paymentType: PaymentType, billedBy: string, breakdown?: PaymentBreakdown) => Promise<void>;

  // Polling for real-time sync
  startPolling: () => void;
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
  };
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  cart: [],
  loading: false,
  polling: false,
  pollTimer: null,

  // === Cart (local) ===
  addToCart: (item: MenuItem) =>
    set((state) => {
      const existing = state.cart.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return { cart: state.cart.map((c) => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c) };
      }
      return { cart: [...state.cart, { menuItem: item, quantity: 1 }] };
    }),

  removeFromCart: (itemId: string) =>
    set((state) => ({ cart: state.cart.filter((c) => c.menuItem.id !== itemId) })),

  updateCartQuantity: (itemId: string, quantity: number) =>
    set((state) => {
      if (quantity <= 0) return { cart: state.cart.filter((c) => c.menuItem.id !== itemId) };
      return { cart: state.cart.map((c) => c.menuItem.id === itemId ? { ...c, quantity } : c) };
    }),

  setCartItemNotes: (itemId: string, notes: string) =>
    set((state) => ({ cart: state.cart.map((c) => c.menuItem.id === itemId ? { ...c, notes } : c) })),

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => get().cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0),
  getCartCount: () => get().cart.reduce((sum, c) => sum + c.quantity, 0),

  // === Orders (DB-synced) ===
  loadOrders: async () => {
    // Load last 60 days of orders
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      set({ orders: data.map(dbRowToOrder) });
    }
  },

  submitOrder: async (params) => {
    const { cart } = get();
    const subtotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
    const orderId = generateId();
    const now = new Date().toISOString();

    // Get next order number atomically
    const { data: numData } = await supabase.rpc('get_next_order_number');
    const orderNumber = numData || Date.now() % 10000;

    const order: Order = {
      id: orderId,
      orderNumber,
      tableNumber: params.tableNumber,
      orderType: params.orderType,
      items: [...cart],
      subtotal,
      discount: 0,
      discountType: 'flat',
      discountValue: 0,
      total: subtotal,
      status: 'pending',
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      notes: params.notes,
      customerName: params.customerName,
      paymentType: 'unpaid',
    };

    // Insert into DB
    const { error } = await supabase.from('orders').insert({
      id: orderId,
      order_number: orderNumber,
      table_number: params.tableNumber || null,
      order_type: params.orderType,
      items: cart,
      subtotal,
      discount: 0,
      discount_type: 'flat',
      discount_value: 0,
      total: subtotal,
      status: 'pending',
      created_by: params.createdBy,
      notes: params.notes || null,
      customer_name: params.customerName || null,
      payment_type: 'unpaid',
      created_at: now,
      updated_at: now,
    });

    if (!error) {
      set((state) => ({
        orders: [order, ...state.orders],
        cart: [],
      }));
    }

    return orderId;
  },

  updateOrderStatus: async (orderId, status, cancelReason) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status, updated_at: now };
    if (cancelReason) updates.cancel_reason = cancelReason;

    // Optimistic update
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: now, ...(cancelReason ? { cancelReason } : {}) } : o
      ),
    }));

    await supabase.from('orders').update(updates).eq('id', orderId);
  },

  applyDiscount: async (orderId, discountType, discountValue) => {
    const order = get().orders.find((o) => o.id === orderId);
    if (!order) return;
    const discount = discountType === 'percentage' ? Math.round(order.subtotal * (discountValue / 100)) : discountValue;
    const total = Math.max(0, order.subtotal - discount);
    const now = new Date().toISOString();

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, discountType, discountValue, discount, total, updatedAt: now } : o
      ),
    }));

    await supabase.from('orders').update({
      discount_type: discountType,
      discount_value: discountValue,
      discount,
      total,
      updated_at: now,
    }).eq('id', orderId);
  },

  setPaymentType: async (orderId, paymentType, billedBy, breakdown) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { payment_type: paymentType, billed_by: billedBy, updated_at: now };
    if (breakdown) updates.payment_breakdown = breakdown;

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, paymentType, billedBy, updatedAt: now, ...(breakdown ? { paymentBreakdown: breakdown } : {}) } : o
      ),
    }));

    await supabase.from('orders').update(updates).eq('id', orderId);
  },

  // === Polling ===
  startPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) return;

    // Load immediately
    get().loadOrders();

    const timer = setInterval(() => {
      get().loadOrders();
    }, 3000); // Poll every 3 seconds

    set({ polling: true, pollTimer: timer });
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) {
      clearInterval(pollTimer);
      set({ polling: false, pollTimer: null });
    }
  },
}));
