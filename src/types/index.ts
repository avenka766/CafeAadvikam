export type UserRole = 'order_taker' | 'billing' | 'admin' | 'kitchen';

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
  orderSource?: OrderSource;  // optional — column may not exist in older DB
  advanceAmount?: number;     // advance paid by customer
  advancePaidBy?: string;     // payment method for advance (cash/upi/card)
  balanceDue?: number;        // total - advanceAmount
  fullyPaidAt?: string;       // timestamp when full payment collected
  balancePaymentType?: string; // payment method used for balance collection
  balancePaidBy?: string;     // staff who collected balance
}

export interface MenuCategory {
  id: string;
  name: string;
  timing: string;
  itemCount: number;
}
