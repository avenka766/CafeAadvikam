import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { printCounterBill } from '../printUtils';
import {
  AlertTriangle, Banknote, CreditCard, FileText, HelpCircle, IndianRupee, Lock,
  Package, PauseCircle, Printer, Receipt, Search, Smartphone,
  Trash2, WalletCards, XCircle, Plus, Minus, ClipboardList, ScanBarcode, Keyboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore, type StockItem } from '../branchStore';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate';
import { BRANCH_LABELS, type Branch } from '../types';
import { SNB_CATEGORIES, SNB_ITEMS, type SnbItem } from '../snbItems';
import { VRSNB_CATEGORIES, VRSNB_ITEMS, type VrsnbItem } from '../vrsnbItems';
import {
  money, useBranchOpsStore,
  type BranchBillItem, type BranchBillRecord,
} from '../branchOpsStore';

type PayMode = 'cash' | 'upi' | 'card' | 'split' | 'credit';
type CheckoutRpcResult = {
  billId: string;
  billNo: string;
  invoiceNo: number;
  total: number;
  tendered: number;
  balance: number;
  creditSaleId?: string | null;
};
type BillingItem = {
  barcode: number;
  name: string;
  price: number;
  uom: 'Nos' | 'Kgs';
  category: string;
};

type Props = {
  branch: Branch;
  branchStock: StockItem[];
  onOpenTab?: (tab: string) => void;
  billingAllowed?: boolean;
  billingBlockedMessage?: string;
  beforeCheckout?: () => Promise<void>;
  onOpenCounter?: () => void;
};

const TAX_RATE = 0;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const BASE_SHORTCUTS = [
  ['F1', 'Change Salesperson'],
  ['F2', 'Search Items'],
  ['F3', 'Cash'],
  ['F4', 'UPI'],
  ['F5', 'Card'],
  ['F6', 'Split Payment'],
  ['F7', 'Credit Sale'],
  ['F8', 'Cash Tendered'],
  ['F9', 'Hold Bill'],
  ['F10', 'Final Bill'],
  ['F11', 'Recall Hold'],
  ['F12', 'Quantity Change'],
  ['Esc', 'Close popup'],
];
const PAYMENT_SHORTCUTS: Record<PayMode, string> = {
  cash: 'F3',
  upi: 'F4',
  card: 'F5',
  split: 'F6',
  credit: 'F7',
};

function itemCatalog(branch: Branch): { categories: string[]; items: BillingItem[] } {
  if (branch === 'VRSNB') return { categories: VRSNB_CATEGORIES, items: VRSNB_ITEMS as VrsnbItem[] };
  return { categories: SNB_CATEGORIES, items: SNB_ITEMS as SnbItem[] };
}

function unitOf(item: BillingItem): 'pcs' | 'kg' {
  return item.uom === 'Kgs' ? 'kg' : 'pcs';
}

function normalizeItemName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stockFor(stock: StockItem[], itemName: string) {
  const normalized = normalizeItemName(itemName);
  const found = stock.find((s) => normalizeItemName(s.itemName) === normalized);
  return Number(found?.quantity ?? 0);
}

function stockAvailable(stock: StockItem[], map: Map<string, number>, itemName: string) {
  return map.get(normalizeItemName(itemName))
    ?? stock.find((s) => s.itemName.toLowerCase().trim() === itemName.toLowerCase().trim())?.quantity
    ?? 0;
}

function formatQty(qty: number, unit: 'pcs' | 'kg') {
  const clean = (n: number) => parseFloat(n.toFixed(3)).toString();
  if (unit === 'kg') return qty >= 1 ? `${clean(qty)} kg` : `${Math.round(qty * 1000)} g`;
  return `${clean(qty)} pcs`;
}

function normalizeQtyInput(value: string, unit: 'pcs' | 'kg') {
  const text = value.trim().toLowerCase();
  if (!text) return 0;
  const numberText = text.replace(/[^0-9.]/g, '');
  const numeric = Number(numberText);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (unit === 'kg') {
    const inGrams = text.includes('g') && !text.includes('kg');
    return Number((inGrams ? numeric / 1000 : numeric).toFixed(3));
  }
  return Math.max(1, Math.floor(numeric));
}

function recalcLine(item: BranchBillItem, qty: number): BranchBillItem {
  const quantity = Number(qty.toFixed(3));
  const subtotal = roundMoney(item.price * quantity);
  const tax = roundMoney(subtotal * TAX_RATE);
  // FIX (Bug #6): per-item discount must scale proportionally with quantity.
  // Previously the stored fixed discount amount was applied regardless of qty,
  // so changing qty from 1 to 5 still only subtracted the 1-unit discount.
  // NOTE: item.discount is currently always 0 (set in toBillItem), so this has
  // no live impact today — but the correct formula is applied here so that if
  // per-item discounts are added in future, recalcLine will work correctly.
  const originalQty = item.quantity > 0 ? item.quantity : 1;
  const scaledDiscount = (item.discount || 0) * (quantity / originalQty);
  return { ...item, quantity, tax, lineTotal: subtotal + tax - scaledDiscount };
}

function toBillItem(item: BillingItem, qty: number): BranchBillItem {
  const subtotal = item.price * qty;
  const tax = subtotal * TAX_RATE;
  return {
    itemName: item.name,
    quantity: Number(qty.toFixed(3)),
    unit: unitOf(item),
    price: item.price,
    tax,
    discount: 0,
    lineTotal: subtotal + tax,
  };
}

// printCounterBill is imported from shared printUtils


export default function BranchBillingProTab({
  branch,
  branchStock,
  onOpenTab,
  billingAllowed = true,
  billingBlockedMessage = 'Open the cashier counter before billing.',
  beforeCheckout,
  onOpenCounter,
}: Props) {
  const { currentUser } = useAuthStore();
  const { fetchBranchData } = useBranchStore();
  const {
    bills, holds, salespeople, counterOpenings, addBill, addHold, removeHold, addNotification,
  } = useBranchOpsStore();

  const userName = currentUser?.displayName || currentUser?.username || 'Branch Staff';
  const isAdmin = ['admin', 'admin_snb', 'admin_vrsnb', 'owner'].includes(currentUser?.role || '');
  const isVRSNB = branch === 'VRSNB';
  const requiresSalesperson = !isVRSNB;
  const searchRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const cashTenderedRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);

  const { categories, items } = useMemo(() => itemCatalog(branch), [branch]);
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<BranchBillItem[]>([]);
  const [salesperson, setSalesperson] = useState('');
  const [paymentMode, setPaymentMode] = useState<PayMode>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' });
  const [creditCustomerName, setCreditCustomerName] = useState('');
  const [creditCustomerMobile, setCreditCustomerMobile] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [creditAmountPaid, setCreditAmountPaid] = useState('');
  const [creditPaidMode, setCreditPaidMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [creditRemarks, setCreditRemarks] = useState('');
  const [discount, setDiscount] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const [lastBill, setLastBill] = useState<BranchBillRecord | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHold, setShowHold] = useState(false);
  const [qtyPopupItem, setQtyPopupItem] = useState<BillingItem | null>(null);
  const [qtyPopupValue, setQtyPopupValue] = useState('1');
  const [showQtyPopup, setShowQtyPopup] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [showCounterClosedAlert, setShowCounterClosedAlert] = useState(false);
  const [billingInputMode, setBillingInputMode] = useState<'manual' | 'barcode'>('manual');

  const branchPeople = useMemo(() => {
    if (isVRSNB) return [];
    const configured = salespeople.filter((p) => p.branch === branch && p.active).map((p) => p.name);
    return Array.from(new Set(configured.filter(Boolean)));
  }, [branch, isVRSNB, salespeople]);

  const billingStaff = requiresSalesperson ? salesperson : userName;
  const shortcutHelp = useMemo(() => BASE_SHORTCUTS, []);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    branchStock.forEach((s) => map.set(normalizeItemName(s.itemName), Number(s.quantity || 0)));
    return map;
  }, [branchStock]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const categoryOk = category === 'All' || i.category === category;
      const searchOk = !q || i.name.toLowerCase().includes(q) || String(i.barcode).includes(q);
      return categoryOk && searchOk;
    }).slice(0, 120);
  }, [items, category, query]);

  useEffect(() => setSelectedIndex(0), [category, query]);
  useEffect(() => setDropdownIndex(0), [query, category]);

  const todayKey = businessDate();
  const counterOpenedToday = counterOpenings.some((record) => record.branch === branch && record.date === todayKey && record.active !== false);
  const isCounterOpen = useCallback(() => counterOpenedToday, [counterOpenedToday]);
  const openQtyPopup = (item: BillingItem) => {
    setQtyPopupItem(item);
    setQtyPopupValue(unitOf(item) === 'kg' ? '0.25' : '1');
    setShowQtyPopup(true);
  };

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const discountValue = Math.min(Number(discount || 0), subtotal);
  const tax = useMemo(() => cart.reduce((s, i) => s + i.tax, 0), [cart]);
  const total = Math.max(0, subtotal + tax - discountValue);
  const creditPaid = Math.min(Number(creditAmountPaid || 0), total);
  const tendered = paymentMode === 'credit'
    ? creditPaid
    : paymentMode === 'split'
      ? Number(split.cash || 0) + Number(split.upi || 0) + Number(split.card || 0)
      : Number(cashTendered || (paymentMode === 'cash' ? 0 : total));
  const due = Math.max(0, total - tendered);
  const balance = paymentMode === 'credit' ? Math.max(0, total - tendered) : Math.max(0, tendered - total);
  const todayBills = bills.filter((b) => b.branch === branch && new Date(b.createdAt).toDateString() === new Date().toDateString());
  const branchHolds = holds.filter((h) => h.branch === branch);

  useEffect(() => {
    if (paymentMode === 'upi' || paymentMode === 'card') setCashTendered(String(total));
    if (paymentMode === 'credit') { setCashTendered(''); setSplit({ cash: '', upi: '', card: '' }); }
    if (paymentMode === 'split') {
      setSplit((current) => {
        const cash = Number(current.cash || 0);
        const upi = Number(current.upi || 0);
        const card = Number(current.card || 0);
        if (cash + upi + card === total) return current;
        if (cash > 0) return { cash: String(Math.min(cash, total)), upi: String(Math.max(0, Number((total - Math.min(cash, total)).toFixed(2))) || ''), card: '' };
        if (upi > 0) return { cash: String(Math.max(0, Number((total - Math.min(upi, total)).toFixed(2))) || ''), upi: String(Math.min(upi, total)), card: '' };
        if (card > 0) return { cash: String(Math.max(0, Number((total - Math.min(card, total)).toFixed(2))) || ''), upi: '', card: String(Math.min(card, total)) };
        return { cash: '', upi: total > 0 ? String(total) : '', card: '' };
      });
    }
  }, [paymentMode, total]);

  const addItem = useCallback((item: BillingItem, amount = unitOf(item) === 'kg' ? 0.25 : 1) => {
    setError('');
    if (!isCounterOpen()) {
      setError('Counter is not opened. Please open the counter in Cashier Closure, then Counter Open before billing.');
      setShowCounterClosedAlert(true);
      return;
    }
    const unit = unitOf(item);
    const available = Number(stockAvailable(branchStock, stockMap, item.name));
    if (available <= 0) {
      setError(`${item.name} is out of stock and cannot be billed.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((c) => c.itemName === item.name);
      const newQty = Number(((existing?.quantity || 0) + amount).toFixed(3));
      if (newQty > available) {
        setError(`Only ${available} ${unit} available for ${item.name}.`);
        return current;
      }
      if (existing) return current.map((c) => c.itemName === item.name ? recalcLine(c, newQty) : c);
      return [toBillItem(item, amount), ...current];
    });
  }, [branchStock, stockMap, isCounterOpen]);

  const reduceItem = (itemName: string) => setCart((current) => current.flatMap((c) => {
    if (c.itemName !== itemName) return [c];
    const delta = c.unit === 'kg' ? 0.25 : 1;
    const next = Number((c.quantity - delta).toFixed(3));
    return next > 0 ? [recalcLine(c, next)] : [];
  }));

  const setCartQuantity = (itemName: string, rawValue: string) => {
    setError('');
    setCart((current) => current.flatMap((c) => {
      if (c.itemName !== itemName) return [c];
      const nextQty = normalizeQtyInput(rawValue, c.unit);
      if (nextQty <= 0) return [];
      const available = Number(stockAvailable(branchStock, stockMap, c.itemName));
      if (nextQty > available) {
        setError(`Only ${formatQty(available, c.unit)} available for ${c.itemName}.`);
        return [c];
      }
      return [recalcLine(c, nextQty)];
    }));
  };

  const clear = useCallback(() => {
    setCart([]); setCashTendered(''); setSplit({ cash: '', upi: '', card: '' }); setCreditCustomerName(''); setCreditCustomerMobile(''); setCreditDueDate(''); setCreditAmountPaid(''); setCreditPaidMode('cash'); setCreditRemarks(''); setDiscount(''); setError(''); setLastBill(null);
  }, []);

  const holdBill = useCallback(() => {
    if (!cart.length) { setError('Cart is empty.'); return; }
    if (requiresSalesperson && !salesperson) { setError('Select salesperson before holding bill.'); return; }
    addHold({ branch, salesperson: billingStaff, items: cart, note: `Held by ${userName}` });
    clear();
    setShowHold(true);
  }, [cart, requiresSalesperson, salesperson, branch, billingStaff, userName, addHold, clear]);

  const recallHold = (id: string) => {
    const h = branchHolds.find((x) => x.id === id);
    if (!h) return;
    setCart(h.items);
    if (requiresSalesperson) setSalesperson(h.salesperson);
    removeHold(id);
    setShowHold(false);
  };

  const validateCheckout = () => {
    if (!isCounterOpen()) {
      setShowCounterClosedAlert(true);
      return 'Counter is not opened. Please open the counter in Cashier Closure, then Counter Open before billing.';
    }
    if (requiresSalesperson && !salesperson) return 'Salesperson selection is mandatory before billing.';
    if (!cart.length) return 'Cart is empty.';
    for (const item of cart) {
      const available = Number(stockAvailable(branchStock, stockMap, item.itemName));
      if (available <= 0) return `${item.itemName} is out of stock.`;
      if (item.quantity > available) return `${item.itemName} has only ${available} ${item.unit} available.`;
    }
    if (paymentMode === 'cash' && Number(cashTendered || 0) < total) return 'Cash tendered is less than bill total.';
    if (paymentMode === 'credit' && !creditCustomerName.trim()) return 'Customer name is required for credit sale.';
    if (paymentMode === 'credit' && !creditCustomerMobile.trim()) return 'Mobile number is required for credit sale.';
    if (paymentMode === 'credit' && !creditDueDate) return 'Due date is required for credit sale.';
    if (paymentMode === 'credit' && Number(creditAmountPaid || 0) > total) return 'Credit upfront amount cannot exceed bill total.';
    if (paymentMode === 'split' && tendered < total) return 'Split payment total is less than bill total.';
    if (paymentMode === 'split' && tendered > total) return 'Split payment cannot exceed the bill total.';
    return null;
  };

  const updateSplitAmount = (field: 'cash' | 'upi' | 'card', rawValue: string) => {
    const value = Math.max(0, Math.min(Number(rawValue || 0), total));
    const valueText = rawValue === '' ? '' : String(value);
    const remaining = Math.max(0, Number((total - value).toFixed(2)));
    const remainingText = remaining > 0 ? String(remaining) : '';
    setSplit((current) => {
      // FIX: only auto-distribute remainder when the other fields are already empty,
      // so the user can type freely without their partially-entered values being overwritten.
      if (field === 'cash') {
        const autoFill = !current.upi && !current.card;
        return { ...current, cash: valueText, upi: autoFill ? remainingText : current.upi, card: '' };
      }
      if (field === 'upi') {
        const autoFill = !current.cash && !current.card;
        return { ...current, upi: valueText, cash: autoFill ? remainingText : current.cash, card: '' };
      }
      const autoFill = !current.cash && !current.upi;
      return { ...current, card: valueText, cash: autoFill ? remainingText : current.cash, upi: '' };
    });
  };

  const selectPaymentMode = (mode: PayMode) => {
    setPaymentMode(mode);
    setError('');
    if (mode === 'cash') {
      setCashTendered('');
      setSplit({ cash: '', upi: '', card: '' });
    } else if (mode === 'split') {
      setCashTendered('');
      setSplit({ cash: '', upi: total > 0 ? String(total) : '', card: '' });
    } else if (mode === 'credit') {
      setCashTendered('');
      setSplit({ cash: '', upi: '', card: '' });
      setCreditAmountPaid('');
    } else {
      setCashTendered(String(total));
      setSplit({ cash: '', upi: '', card: '' });
    }
  };

  const checkout = async () => {
    if (checkoutInFlightRef.current) return;
    if (!billingAllowed) {
      setError(billingBlockedMessage);
      return;
    }
    const validationError = validateCheckout();
    if (validationError) { setError(validationError); return; }
    checkoutInFlightRef.current = true;
    setSaving(true);
    setError('');
    try {
      if (beforeCheckout) await beforeCheckout();
      const checkoutSplit = { cash: roundMoney(Number(split.cash || 0)), upi: roundMoney(Number(split.upi || 0)), card: roundMoney(Number(split.card || 0)) };
      if (paymentMode === 'split' && roundMoney(checkoutSplit.cash + checkoutSplit.upi + checkoutSplit.card) !== roundMoney(total)) {
        throw new Error('Split payment must exactly match the bill total.');
      }
      const paymentRows =
        paymentMode === 'credit'
          ? (creditPaid > 0 ? [{ mode: creditPaidMode, amount: creditPaid, remarks: creditRemarks.trim() || 'Credit upfront collection' }] : [])
          : paymentMode === 'split'
            ? [
                { mode: 'cash', amount: checkoutSplit.cash },
                { mode: 'upi', amount: checkoutSplit.upi },
                { mode: 'card', amount: checkoutSplit.card },
              ].filter((row) => row.amount > 0)
            : [{ mode: paymentMode, amount: total }];

      const { data, error: rpcError } = await supabase.rpc('complete_branch_checkout', {
        p_branch: branch,
        p_items: cart.map((item) => ({
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          discount: item.discount || 0,
          tax: item.tax || 0,
          lineTotal: item.lineTotal,
        })),
        p_payments: paymentRows,
        p_customer_name: paymentMode === 'credit' ? creditCustomerName.trim() : null,
        p_customer_phone: paymentMode === 'credit' ? creditCustomerMobile.trim() : null,
        p_salesperson: billingStaff,
        p_biller: userName,
        p_discount: discountValue,
        p_tax: tax,
        p_round_off: 0,
        p_payment_type: paymentMode === 'credit' ? 'credit' : 'counter',
        p_due_date: paymentMode === 'credit' ? creditDueDate : null,
        p_notes: paymentMode === 'credit' ? creditRemarks.trim() || null : null,
      });
      if (rpcError) {
        const missingRpc = /complete_branch_checkout|could not find the function|function .* does not exist/i.test(rpcError.message);
        throw new Error(missingRpc ? 'Atomic checkout is not installed in Supabase. Run the 20260614_branch_atomic_checkout_rpc.sql migration first.' : rpcError.message);
      }
      const result = data as CheckoutRpcResult;
      if (!result?.billNo || !result.invoiceNo) throw new Error('Checkout committed but bill number was not returned.');
      // FIX (MD Bug #2): guard against dual-write desync. If the RPC succeeds but addBill()
      // fails (network drop, tab close), a retry would call addBill() again. By checking
      // for an existing bill with the same billNo first, the write is idempotent.
      const existingBill = bills.find(b => b.billNo === result.billNo);
      const saved = existingBill ?? addBill({
        branch, billNo: result.billNo, invoiceNo: result.invoiceNo, items: cart, subtotal, discount: discountValue, tax, total,
        tendered: paymentMode === 'cash' || paymentMode === 'split' || paymentMode === 'credit' ? tendered : total,
        balance: paymentMode === 'cash' || paymentMode === 'split' || paymentMode === 'credit' ? balance : 0,
        paymentMode,
        creditCustomerName: paymentMode === 'credit' ? creditCustomerName.trim() : undefined,
        creditCustomerMobile: paymentMode === 'credit' ? creditCustomerMobile.trim() : undefined,
        creditDueDate: paymentMode === 'credit' ? creditDueDate : undefined,
        creditRemarks: paymentMode === 'credit' ? [creditRemarks.trim(), creditPaid > 0 ? `Upfront ${money(creditPaid)} by ${creditPaidMode.toUpperCase()}` : 'No upfront payment'].filter(Boolean).join(' - ') : undefined,
        split: paymentMode === 'credit' && creditPaid > 0 ? { [creditPaidMode]: creditPaid } : paymentMode === 'split' ? { cash: Number(split.cash || 0), upi: Number(split.upi || 0), card: Number(split.card || 0) } : undefined,
        salesperson: billingStaff,
        biller: userName,
      });
      await printCounterBill(saved, false);
      setLastBill(saved);
      setCart([]); setCashTendered(''); setSplit({ cash: '', upi: '', card: '' }); setCreditCustomerName(''); setCreditCustomerMobile(''); setCreditDueDate(''); setCreditAmountPaid(''); setCreditPaidMode('cash'); setCreditRemarks(''); setDiscount('');
      await fetchBranchData(branch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing failed.');
      addNotification({ branch, type: 'Stock Dispute', title: 'Bill blocked during stock validation', details: String(e), raisedBy: userName });
    } finally {
      checkoutInFlightRef.current = false;
      setSaving(false);
    }
  };

  const selectPaymentModeRef = useRef(selectPaymentMode);
  const checkoutRef = useRef(checkout);
  useEffect(() => { selectPaymentModeRef.current = selectPaymentMode; });
  useEffect(() => { checkoutRef.current = checkout; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); selectRef.current?.focus(); }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F3') { e.preventDefault(); selectPaymentModeRef.current('cash'); }
      if (e.key === 'F4') { e.preventDefault(); selectPaymentModeRef.current('upi'); }
      if (e.key === 'F5') { e.preventDefault(); selectPaymentModeRef.current('card'); }
      if (e.key === 'F6') { e.preventDefault(); selectPaymentModeRef.current('split'); }
      if (e.key === 'F7') { e.preventDefault(); selectPaymentModeRef.current('credit'); }
      if (e.key === 'F8') { e.preventDefault(); cashTenderedRef.current?.focus(); }
      if (e.key === 'F9') { e.preventDefault(); holdBill(); }
      if (e.key === 'F10') { e.preventDefault(); checkoutRef.current(); }
      if (e.key === 'F11') { e.preventDefault(); setShowHold(true); }
      if (e.key === 'F12') {
        e.preventDefault();
        const selectedCartItem = cart[0] ? items.find((item) => item.name === cart[0].itemName) : visibleItems[selectedIndex];
        if (selectedCartItem) openQtyPopup(selectedCartItem);
      }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowHold(false); setShowQtyPopup(false); }
      if (e.key === 'ArrowRight') { setSelectedIndex((i) => Math.min(i + 1, visibleItems.length - 1)); }
      if (e.key === 'ArrowLeft') { setSelectedIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && document.activeElement !== searchRef.current && visibleItems[selectedIndex]) { e.preventDefault(); openQtyPopup(visibleItems[selectedIndex]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart, holdBill, items, selectedIndex, total, visibleItems]);

  if (!billingAllowed) {
    return (
      <div className="flex min-h-[540px] items-center justify-center rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-6 shadow-xl shadow-slate-200/60">
        <div className="max-w-xl rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-lg">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Lock className="size-8" /></div>
          <h2 className="mt-4 font-display text-2xl font-black text-slate-950">Billing Counter Locked</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{billingBlockedMessage}</p>
          <p className="mt-2 text-xs text-slate-500">Opening the counter is mandatory. No cart, payment, final bill, or keyboard checkout is available until the counter is open.</p>
          {onOpenCounter && (
            <button type="button" onClick={onOpenCounter} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800">
              <Lock className="size-4" /> Go to Open Counter
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="branch-billmaxo min-h-[680px] overflow-visible rounded-[2rem] border border-slate-200 bg-slate-100 shadow-xl shadow-slate-200/70 md:h-[calc(100dvh-var(--header-h,4rem)-7rem)] md:overflow-hidden">
      <div className="grid min-h-[680px] grid-cols-1 md:h-full md:min-h-0 md:grid-cols-[minmax(330px,390px)_minmax(0,1fr)] xl:grid-cols-[minmax(430px,540px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(480px,580px)_minmax(0,1fr)]">
        <aside ref={cartRef} tabIndex={-1} className="flex min-h-0 flex-col border-r border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-amber-300/30">
          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">New Bill · {branch}</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Billing Counter</h2>
              </div>
              <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-white/80">Cashier Cart</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/10 p-2"><p className="text-lg font-black">{todayBills.length}</p><p className="text-[10px] uppercase tracking-wide text-white/60">Bills</p></div>
              <div className="rounded-2xl bg-white/10 p-2"><p className="text-lg font-black">{money(todayBills.reduce((s,b)=>s+b.total,0))}</p><p className="text-[10px] uppercase tracking-wide text-white/60">Sales</p></div>
              <div className="rounded-2xl bg-white/10 p-2"><p className="text-lg font-black">{branchHolds.length}</p><p className="text-[10px] uppercase tracking-wide text-white/60">Hold</p></div>
            </div>
          </div>

          {requiresSalesperson ? (
            <div className="space-y-3 border-b border-slate-200 p-4">
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">Salesperson <span className="text-red-500">*</span></label>
              <select ref={selectRef} value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-900 focus:border-amber-400 focus:outline-none">
                <option value="">Select salesperson before billing</option>
                {branchPeople.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {isAdmin && <p className="text-xs font-semibold text-slate-500">Admin can add/edit salesperson names in Salesperson Report.</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Cashier</p>
                <p className="mt-0.5 text-base font-black text-slate-950">{userName}</p>
              </div>
              <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{branchHolds.length} hold</span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2"><ShoppingCartIcon /><h3 className="text-lg font-black">Cart</h3></div>
              <button onClick={clear} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"><Trash2 className="mr-1 inline size-3"/>Clear</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {cart.length === 0 ? (
                <div className="flex min-h-28 items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
                  <div><Receipt className="mx-auto size-8 text-slate-300"/><p className="mt-2 text-sm font-black text-slate-600">Cart is empty</p><p className="text-xs text-slate-400">Select items from the right.</p></div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cart.map((i) => (
                    <div key={i.itemName} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight text-slate-950 truncate">{i.itemName}</p>
                          <p className="text-xs text-slate-500">{formatQty(i.quantity, i.unit)} × {money(i.price)}</p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-slate-950">{money(i.lineTotal)}</p>
                        <button onClick={() => setCart((c) => c.filter((x) => x.itemName !== i.itemName))} className="shrink-0 rounded-lg bg-red-50 p-1 text-red-500 hover:bg-red-100"><XCircle className="size-4"/></button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button onClick={() => reduceItem(i.itemName)} className="size-7 rounded-lg bg-slate-100 font-black text-slate-700 flex items-center justify-center"><Minus className="size-3"/></button>
                        <input
                          value={i.unit === 'kg' ? parseFloat(i.quantity.toFixed(3)).toString() : String(i.quantity)}
                          onChange={(e) => setCartQuantity(i.itemName, e.target.value)}
                          inputMode="decimal"
                          placeholder={i.unit === 'kg' ? '100g / 0.1' : '1'}
                          className="h-8 w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-xs font-black tabular-nums text-slate-950 outline-none focus:border-amber-400 focus:bg-white"
                          aria-label={`Quantity for ${i.itemName}`}
                        />
                        <span className="rounded-lg bg-slate-950 px-2 py-1 text-center text-[11px] font-black text-white tabular-nums">{formatQty(i.quantity, i.unit)}</span>
                        <button onClick={() => { const catalogItem = items.find((it) => it.name === i.itemName); if (catalogItem) addItem(catalogItem); }} className="size-7 rounded-lg bg-amber-400 font-black text-slate-950 flex items-center justify-center"><Plus className="size-3"/></button>
                      </div>
                      {i.unit === 'kg' && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {[
                            ['100g', '100g'],
                            ['250g', '250g'],
                            ['500g', '500g'],
                            ['1kg', '1'],
                          ].map(([label, value]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setCartQuantity(i.itemName, value)}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-amber-100 hover:text-amber-800"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white shadow-[0_-12px_35px_rgba(15,23,42,.08)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <div className="min-w-0 flex-1"><span className="text-xs font-bold text-slate-500">Subtotal </span><span className="font-black tabular-nums">{money(subtotal)}</span></div>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 px-2 py-1"><span className="text-xs font-bold text-slate-500">Disc</span><input value={discount} onChange={(e)=>setDiscount(e.target.value)} placeholder="0" className="w-16 bg-transparent text-sm font-black outline-none"/></div>
              <div className="rounded-xl bg-slate-950 px-3 py-1 text-lg font-black tabular-nums text-white">{money(total)}</div>
              <div className="rounded-xl bg-emerald-50 px-3 py-1 text-lg font-black tabular-nums text-emerald-800">{money(due > 0 ? due : balance)}</div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 px-4 py-2">
              {([['cash','Cash',Banknote],['upi','UPI',Smartphone],['card','Card',CreditCard],['split','Split',WalletCards],['credit','Credit',FileText]] as const).map(([key,label,Icon]) => (
                <button key={String(key)} onClick={()=>selectPaymentMode(key as PayMode)} className={cn('rounded-2xl border-2 px-1 py-1.5 text-xs font-black', paymentMode === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600')}><Icon className="mx-auto mb-0.5 size-3.5"/>{String(label)}<span className="ml-1 text-[9px] font-black opacity-70">[{PAYMENT_SHORTCUTS[key as PayMode]}]</span></button>
              ))}
            </div>
            {paymentMode === 'split' ? (
              <div className="space-y-1 px-4 pb-2">
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min="0" max={total} value={split.cash} onChange={(e)=>updateSplitAmount('cash', e.target.value)} placeholder="Cash" className="rounded-xl border px-2 py-1 font-bold"/>
                  <input type="number" min="0" max={total} value={split.upi} onChange={(e)=>updateSplitAmount('upi', e.target.value)} placeholder="UPI" className="rounded-xl border px-2 py-1 font-bold"/>
                  <input type="number" min="0" max={total} value={split.card} onChange={(e)=>updateSplitAmount('card', e.target.value)} placeholder="Card" className="rounded-xl border px-2 py-1 font-bold"/>
                </div>
                <p className="text-xs font-bold text-slate-500">Split must equal {money(total)}. Remaining auto-fills when one amount is entered.</p>
              </div>
            ) : paymentMode === 'credit' ? (
              <div className="mx-4 mb-2 space-y-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={creditCustomerName} onChange={(e)=>setCreditCustomerName(e.target.value)} placeholder="Customer name *" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <input value={creditCustomerMobile} onChange={(e)=>setCreditCustomerMobile(e.target.value)} placeholder="Mobile number *" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wide text-amber-800">Due Date <span className="text-red-500">*</span></label>
                    <input required type="date" value={creditDueDate} onChange={(e)=>setCreditDueDate(e.target.value)} className={cn('w-full rounded-xl border bg-white p-2 font-bold outline-none', paymentMode === 'credit' && !creditDueDate ? 'border-red-400' : 'border-amber-200', 'focus:border-amber-500')}/>
                  </div>
                  <input type="number" min="0" max={total} value={creditAmountPaid} onChange={(e)=>setCreditAmountPaid(e.target.value)} placeholder="Amount paid now" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <select value={creditPaidMode} onChange={(e)=>setCreditPaidMode(e.target.value as 'cash' | 'upi' | 'card')} className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500">
                    <option value="cash">Paid by Cash</option>
                    <option value="upi">Paid by UPI</option>
                    <option value="card">Paid by Card</option>
                  </select>
                  <input value={creditRemarks} onChange={(e)=>setCreditRemarks(e.target.value)} placeholder="Credit remarks" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                </div>
                <p className="text-xs font-bold text-amber-800">Credit due after upfront payment: {money(Math.max(0, total - creditPaid))}.</p>
              </div>
            ) : (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-1"><IndianRupee className="size-5 text-slate-400"/><input ref={cashTenderedRef} value={cashTendered} onChange={(e)=>setCashTendered(e.target.value)} placeholder={paymentMode === 'cash' ? 'Cash tendered' : 'Auto collected'} className="h-9 flex-1 bg-transparent text-xl font-black outline-none"/></div>
            )}
            {error && <p className="mx-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle className="mr-1 inline size-4"/>{error}</p>}
            <div className="grid grid-cols-2 gap-2 px-4 py-2">
              <button onClick={holdBill} className="rounded-2xl bg-amber-100 px-3 py-2 text-sm font-black text-amber-800"><PauseCircle className="mx-auto mb-1 size-4"/>Hold <span className="ml-1 text-[9px] font-black opacity-70">[F9]</span></button>
              <button onClick={checkout} disabled={saving || cart.length === 0} className="rounded-2xl bg-orange-500 px-3 py-2 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:opacity-50"><Printer className="mx-auto mb-1 size-4"/>{saving ? 'Saving' : 'Final Bill'} <span className="ml-1 text-[9px] font-black opacity-70">[F10]</span></button>
            </div>
            {lastBill && <button onClick={() => { void printCounterBill(lastBill, true); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white py-2 text-sm font-black text-slate-700">Print duplicate: {lastBill.billNo}</button>}
          </div>
        </aside>

        <main className="flex min-h-[640px] flex-col bg-slate-100 md:min-h-0">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><h1 className="text-3xl font-black tracking-tight text-slate-950">{BRANCH_LABELS[branch]} Fast Billing</h1></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative grid h-9 w-[156px] grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-inner" aria-label="Billing input mode">
                  <span className={cn('pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-[9px] shadow-sm transition-all duration-300 ease-out', billingInputMode === 'manual' ? 'translate-x-0 bg-slate-950' : 'translate-x-full bg-orange-500 shadow-orange-200')} />
                  <button type="button" onClick={() => { setBillingInputMode('manual'); setQuery(''); setShowDropdown(false); }} className={cn('relative z-10 inline-flex items-center justify-center gap-1 rounded-lg text-[11px] font-black transition-colors duration-300 active:scale-95', billingInputMode === 'manual' ? 'text-white' : 'text-slate-500')}><Keyboard className="size-3"/>Manual</button>
                  <button type="button" onClick={() => { setBillingInputMode('barcode'); setQuery(''); setShowDropdown(false); setTimeout(() => searchRef.current?.focus(), 0); }} className={cn('relative z-10 inline-flex items-center justify-center gap-1 rounded-lg text-[11px] font-black transition-colors duration-300 active:scale-95', billingInputMode === 'barcode' ? 'text-white' : 'text-slate-500')}><ScanBarcode className="size-3"/>Barcode</button>
                </div>
                <button onClick={()=>setShowHold(true)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><PauseCircle className="mr-2 inline size-4"/>Recall Hold ({branchHolds.length})</button><button onClick={()=>setShowShortcuts(true)} className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950"><HelpCircle className="mr-2 inline size-4"/>Shortcuts</button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-3xl border-2 border-slate-200 bg-slate-50 px-4 py-2 focus-within:border-amber-400">
              <Search className="size-6 text-slate-400"/>
              <div className="relative flex-1">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e)=>{ setQuery(e.target.value); setShowDropdown(billingInputMode === 'manual' && e.target.value.trim().length > 0); setDropdownIndex(0); }}
                  onFocus={() => { if (billingInputMode === 'manual' && query.trim()) setShowDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const scannedBarcode = query.trim();
                      const exactBarcodeItem = items.find((item) => String(item.barcode) === scannedBarcode);
                      if (exactBarcodeItem) {
                        e.preventDefault();
                        addItem(exactBarcodeItem);
                        setShowDropdown(false);
                        setQuery('');
                        return;
                      }
                      if (billingInputMode === 'barcode') {
                        e.preventDefault();
                        setError(`Barcode ${scannedBarcode || '(empty)'} was not found for ${branch}.`);
                        setQuery('');
                        return;
                      }
                    }
                    if (!showDropdown) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIndex((i) => Math.min(i + 1, Math.min(visibleItems.length - 1, 9))); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setDropdownIndex((i) => Math.max(i - 1, 0)); }
                    if (e.key === 'Enter') {
                      const item = visibleItems[dropdownIndex];
                      if (item) { e.preventDefault(); openQtyPopup(item); setShowDropdown(false); setQuery(''); }
                    }
                    if (e.key === 'Escape') setShowDropdown(false);
                  }}
                  placeholder={billingInputMode === 'barcode' ? `Scan ${branch === 'SNB' ? '1001...' : '2001...'} barcode and press Enter` : 'F2 - search item name or barcode'}
                  className="h-12 w-full bg-transparent text-xl font-black outline-none placeholder:text-slate-400"
                />
                {showDropdown && visibleItems.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                    {visibleItems.slice(0, 10).map((item, idx) => {
                      const st = Number(stockAvailable(branchStock, stockMap, item.name));
                      return (
                        <div
                          key={item.barcode}
                          onMouseDown={() => { openQtyPopup(item); setShowDropdown(false); setQuery(''); }}
                          className={cn('flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold', idx === dropdownIndex ? 'bg-amber-50' : 'hover:bg-slate-50', st <= 0 && 'opacity-50')}
                        >
                          <span>{item.name}</span>
                          <span className="text-xs text-slate-500">{money(item.price)} - {st > 0 ? formatQty(st, unitOf(item)) : 'Out'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="rounded-xl bg-white px-3 py-1 text-xs font-black text-slate-500">{visibleItems.length} items</span>
            </div>
          </div>
          <div className="border-b border-slate-200 bg-white/80 p-3">
            <div className="flex flex-wrap gap-2">
              {['All', ...categories].map((c, idx) => <button key={c} onClick={()=>setCategory(c)} className={cn('rounded-2xl px-3 py-2 text-xs font-black transition', category === c ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}><span className="mr-2 text-[9px] opacity-60">{idx === 0 ? 'A' : idx}</span>{c}</button>)}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visibleItems.map((item, idx) => {
                const stock = Number(stockAvailable(branchStock, stockMap, item.name));
                const disabled = stock <= 0;
                const inCart = cart.find((c)=>c.itemName===item.name);
                return (
                  <div
                    key={item.barcode}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    onClick={() => !disabled && openQtyPopup(item)}
                    onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) openQtyPopup(item); }}
                    className={cn('group rounded-2xl border-2 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl', disabled && 'cursor-not-allowed opacity-45', idx === selectedIndex ? 'border-amber-400 ring-4 ring-amber-100' : 'border-slate-200', inCart && 'border-emerald-400 bg-emerald-50')}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="line-clamp-2 text-sm font-black leading-tight text-slate-950">{item.name}</p>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500">{idx + 1}</span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-1">
                      <div>
                        <p className="text-base font-black text-emerald-700">{money(item.price)}<span className="text-[9px] text-slate-400">/{unitOf(item)}</span></p>
                        <p className={cn('mt-0.5 text-[9px] font-black', disabled ? 'text-red-600' : stock < 5 ? 'text-amber-600' : 'text-slate-500')}><Package className="mr-0.5 inline size-3"/>{disabled ? 'Out' : `${formatQty(stock, unitOf(item))}`}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {inCart && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); reduceItem(item.name); }}
                            className="inline-flex size-7 items-center justify-center rounded-xl bg-slate-200 text-slate-700 shadow-sm"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Minus className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(e) => { e.stopPropagation(); openQtyPopup(item); }}
                          className={cn('inline-flex size-7 items-center justify-center rounded-xl text-lg font-black shadow-sm disabled:opacity-40', disabled ? 'bg-slate-100 text-slate-400' : 'bg-orange-500 text-white shadow-orange-200')}
                          aria-label={`Add ${item.name}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {inCart && <div className="mt-2 rounded-xl bg-emerald-600 px-2 py-1 text-center text-[10px] font-black text-white">In cart: {formatQty(inCart.quantity, inCart.unit)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {showShortcuts && <Modal onClose={() => setShowShortcuts(false)} title="Keyboard shortcut help"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{shortcutHelp.map(([k,v])=><div key={k} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><kbd className="rounded-lg bg-slate-950 px-2 py-1 text-sm font-black text-white">{k}</kbd><span className="text-sm font-bold text-slate-700">{v}</span></div>)}</div></Modal>}
      {showHold && <Modal onClose={() => setShowHold(false)} title="Recall held bills"><div className="space-y-3">{branchHolds.length===0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No held bills.</p> : branchHolds.map((h)=><div key={h.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-black">{h.salesperson}</p><p className="text-sm text-slate-500">{h.items.length} items · {new Date(h.createdAt).toLocaleString('en-IN')}</p></div><button onClick={()=>recallHold(h.id)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Recall</button></div>)}</div></Modal>}
      {showQtyPopup && qtyPopupItem && (
        <QuantityPopup
          item={qtyPopupItem}
          value={qtyPopupValue}
          branchStock={branchStock}
          stockMap={stockMap}
          onValue={setQtyPopupValue}
          onClose={() => setShowQtyPopup(false)}
          onAdd={() => {
            addItem(qtyPopupItem, normalizeQtyInput(qtyPopupValue, unitOf(qtyPopupItem)));
            setShowQtyPopup(false);
          }}
        />
      )}
      {showCounterClosedAlert && (
        <CounterClosedAlert
          onClose={() => setShowCounterClosedAlert(false)}
          onOpenClosure={() => { setShowCounterClosedAlert(false); onOpenTab?.('closure'); }}
        />
      )}
    </div>
  );
}

function QuantityPopup({
  item,
  value,
  branchStock,
  stockMap,
  onValue,
  onAdd,
  onClose,
}: {
  item: BillingItem;
  value: string;
  branchStock: StockItem[];
  stockMap: Map<string, number>;
  onValue: (value: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title={`Add ${item.name}`}>
      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-500">
          Stock: {formatQty(Number(stockAvailable(branchStock, stockMap, item.name)), unitOf(item))} · Price: {money(item.price)}/{unitOf(item)}
        </p>
        {unitOf(item) === 'kg' && (
          <div className="flex flex-wrap gap-2">
            {([['100g','100g'],['250g','250g'],['500g','500g'],['1kg','1'],['2kg','2']] as const).map(([label, val]) => (
              <button key={label} onClick={() => onValue(val)} className={cn('rounded-xl px-3 py-2 text-sm font-black', value === val ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700')}>
                {label}
              </button>
            ))}
          </div>
        )}
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
          className="h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-2xl font-black outline-none focus:border-amber-400"
          placeholder={unitOf(item) === 'kg' ? 'e.g. 0.5 or 500g' : 'Quantity'}
        />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="rounded-2xl bg-slate-100 py-3 font-black text-slate-700">Cancel (Esc)</button>
          <button onClick={onAdd} className="rounded-2xl bg-orange-500 py-3 font-black text-white shadow-lg shadow-orange-200">Add to Cart (Enter)</button>
        </div>
      </div>
    </Modal>
  );
}

function CounterClosedAlert({ onOpenClosure, onClose }: { onOpenClosure: () => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Counter Not Opened">
      <div className="space-y-4 text-center">
        <div className="rounded-2xl bg-amber-50 p-6">
          <AlertTriangle className="mx-auto size-12 text-amber-500" />
          <p className="mt-3 text-lg font-black text-slate-950">Counter is not opened for today</p>
          <p className="mt-1 text-sm font-bold text-slate-600">You must open the counter in <b>Cashier Closure - Counter Open</b> before billing.</p>
        </div>
        <button onClick={onOpenClosure} className="w-full rounded-2xl bg-amber-500 py-3 font-black text-white">Go to Counter Open</button>
      </div>
    </Modal>
  );
}

function ShoppingCartIcon() { return <ClipboardList className="size-5 text-amber-500" />; }

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5"><h3 className="text-2xl font-black text-slate-950">{title}</h3><button onClick={onClose} className="rounded-2xl bg-slate-100 p-3"><XCircle className="size-5"/></button></div>
        <div className="max-h-[70dvh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
