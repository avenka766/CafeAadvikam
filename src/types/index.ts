// src/types/index.ts
// ── CHANGE: Added 'branch_vrsnb' | 'branch_snb' | 'branch_hosur' to UserRole ──
export type UserRole =
  | 'order_taker'
  | 'billing'
  | 'admin'
  | 'kitchen'
  | 'store'
  | 'baker'
  | 'packing'
  | 'order_receiver'
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
}

export interface MenuCategory {
  id: string;
  name: string;
  timing: string;
  itemCount: number;
}
