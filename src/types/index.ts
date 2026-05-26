// src/types/index.ts
// ── CHANGE: Replaced 'order_receiver' with 3 branch-specific receiver roles ──
export type UserRole =
  | 'order_taker'
  | 'billing'
  | 'admin'
  | 'kitchen'
  | 'store'
  | 'baker'
  | 'packing'
  | 'receiver_vrsnb'   // VRSNB Order Receiver (orders VRSNB items only)
  | 'receiver_snb'     // SNB Order Receiver   (orders SNB items only)
  | 'receiver_hosur'   // Hosur Order Receiver (orders Hosur/SNB items only)
  | 'branch_vrsnb'
  | 'branch_snb'
  | 'branch_hosur'
  | 'admin_vrsnb'   // VRSNB Admin Dashboard
  | 'admin_snb'     // SNB Admin Dashboard
  | 'owner';        // Owner Dashboard

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  displayName: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  timing: string;
  enabled: boolean;
  imageUrl?: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
}

export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type PaymentType = 'cash' | 'upi' | 'card' | 'part_payment' | 'unpaid' | 'advance';
export type OrderSource = 'staff' | 'qr';

export interface PaymentBreakdown {
  cash: number;
  upi: number;
  card: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  tableNumber?: number;
  orderType: OrderType;
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  total: number;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  customerName?: string;
  paymentType: PaymentType;
  paymentBreakdown?: PaymentBreakdown;
  billedBy?: string;
  cancelReason?: string;
  orderSource?: OrderSource;
  advanceAmount?: number;
  advancePaidBy?: string;
  balanceDue?: number;
  fullyPaidAt?: string;
  balancePaymentType?: string;
  balancePaidBy?: string;
  parcelCharges?: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  timing: string;
  itemCount: number;
}
