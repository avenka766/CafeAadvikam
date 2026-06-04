import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Banknote, CreditCard, FileText, HelpCircle, IndianRupee,
  Package, PauseCircle, Printer, Receipt, RotateCcw, Search, Smartphone,
  Trash2, WalletCards, XCircle, Plus, Minus, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore, type StockItem } from '../branchStore';
import { BRANCH_LABELS, type Branch } from '../types';
import { SNB_CATEGORIES, SNB_ITEMS, type SnbItem } from '../snbItems';
import { VRSNB_CATEGORIES, VRSNB_ITEMS, type VrsnbItem } from '../vrsnbItems';
import {
  money, nextBranchInvoice, useBranchOpsStore,
  type BranchBillItem, type BranchBillRecord,
} from '../branchOpsStore';

type PayMode = 'cash' | 'upi' | 'card' | 'split' | 'credit';
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
};

const TAX_RATE = 0;
const BASE_SHORTCUTS = [
  ['F1', 'New Bill'], ['F2', 'Search Item'], ['F3', 'Hold Bill'], ['F4', 'Recall Hold'],
  ['F5', 'Cash Payment'], ['F6', 'UPI Payment'], ['F7', 'Card Payment'], ['F8 / Ctrl+P', 'Print Bill'],
  ['Ctrl+L', 'Credit Sale'],
  ['F9', 'Advance Order'], ['F10', 'Quotation'], ['F11', 'Return Bill'], ['F12', 'Close Shift'],
  ['Ctrl+B', 'Focus cart'], ['Ctrl+I', 'Focus search'], ['Ctrl+C', 'Clear cart'], ['Ctrl+D', 'Discount'], ['Esc', 'Close popup'], ['Enter', 'Confirm'],
];

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

function formatQty(qty: number, unit: 'pcs' | 'kg') {
  const clean = (n: number) => parseFloat(n.toFixed(3)).toString();
  if (unit === 'kg') return qty >= 1 ? `${clean(qty)} kg` : `${Math.round(qty * 1000)} g`;
  return `${clean(qty)} pcs`;
}

function recalcLine(item: BranchBillItem, qty: number): BranchBillItem {
  const quantity = Number(qty.toFixed(3));
  const subtotal = item.price * quantity;
  const tax = subtotal * TAX_RATE;
  return { ...item, quantity, tax, lineTotal: subtotal + tax - (item.discount || 0) };
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

function printBranchBill(bill: BranchBillRecord, duplicate = false) {
  const title = duplicate ? 'DUPLICATE BILL' : 'ORIGINAL BILL';
  const html = `<!doctype html><html><head><title>${title} ${bill.billNo}</title><style>
    @page{size:80mm auto;margin:4mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}.c{text-align:center}.b{font-weight:800}.row{display:flex;justify-content:space-between;gap:8px}.dash{border-top:1px dashed #111;margin:6px 0}.item{margin:4px 0}.total{font-size:16px;font-weight:900}.stamp{border:2px solid #111;padding:4px;text-align:center;font-weight:900;margin:6px 0;font-size:13px}table{width:100%;border-collapse:collapse}td{padding:2px 0}.right{text-align:right}</style></head><body>
    <div class="stamp">${title}</div><div class="c b">${BRANCH_LABELS[bill.branch]}</div><div class="c">Tax Invoice · ${bill.billNo}</div><div class="dash"></div>
    <div class="row"><span>Date</span><span>${new Date(bill.createdAt).toLocaleString('en-IN')}</span></div>
    ${bill.branch === 'VRSNB' ? '' : `<div class="row"><span>Salesperson</span><span>${bill.salesperson}</span></div>`}<div class="row"><span>Cashier</span><span>${bill.biller}</span></div><div class="dash"></div>
    <table>${bill.items.map((i) => `<tr><td>${i.itemName}<br/><small>${i.quantity} ${i.unit} × ₹${i.price}</small></td><td class="right b">₹${i.lineTotal.toFixed(2)}</td></tr>`).join('')}</table>
    <div class="dash"></div><div class="row"><span>Subtotal</span><span>₹${bill.subtotal.toFixed(2)}</span></div><div class="row"><span>Discount</span><span>₹${bill.discount.toFixed(2)}</span></div><div class="row"><span>Tax</span><span>₹${bill.tax.toFixed(2)}</span></div><div class="row total"><span>Total</span><span>₹${bill.total.toFixed(2)}</span></div>
    <div class="row"><span>Tendered</span><span>₹${bill.tendered.toFixed(2)}</span></div><div class="row"><span>${bill.paymentMode === 'credit' ? 'Credit Due' : 'Balance'}</span><span>₹${bill.balance.toFixed(2)}</span></div><div class="row"><span>Mode</span><span>${bill.paymentMode.toUpperCase()}</span></div>
    ${bill.paymentMode === 'credit' ? `<div class="dash"></div><div class="row"><span>Credit Customer</span><span>${bill.creditCustomerName || '-'}</span></div><div class="row"><span>Mobile</span><span>${bill.creditCustomerMobile || '-'}</span></div><div class="row"><span>Due Date</span><span>${bill.creditDueDate || '-'}</span></div>` : ''}
    <div class="dash"></div><div class="c b">Thank you. Visit again.</div><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.write(html); win.document.close(); }
}

export default function BranchBillingProTab({ branch, branchStock, onOpenTab }: Props) {
  const { currentUser } = useAuthStore();
  const { recordSnbSale, recordSale, fetchBranchData } = useBranchStore();
  const {
    bills, holds, salespeople, addBill, addHold, removeHold, addNotification,
  } = useBranchOpsStore();

  const userName = currentUser?.displayName || currentUser?.username || 'Branch Staff';
  const isAdmin = ['admin', 'admin_snb', 'admin_vrsnb', 'owner'].includes(currentUser?.role || '');
  const isVRSNB = branch === 'VRSNB';
  const requiresSalesperson = !isVRSNB;
  const searchRef = useRef<HTMLInputElement>(null);
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
  const [creditRemarks, setCreditRemarks] = useState('');
  const [discount, setDiscount] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastBill, setLastBill] = useState<BranchBillRecord | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHold, setShowHold] = useState(false);

  const branchPeople = useMemo(() => {
    if (isVRSNB) return [];
    const configured = salespeople.filter((p) => p.branch === branch && p.active).map((p) => p.name);
    return Array.from(new Set([...configured, 'Counter Sales', 'Morning Salesperson', 'Evening Salesperson', userName].filter(Boolean)));
  }, [branch, isVRSNB, salespeople, userName]);

  const billingStaff = requiresSalesperson ? salesperson : userName;
  const shortcutHelp = useMemo(
    () => BASE_SHORTCUTS.filter(([, label]) => !(isVRSNB && label === 'Quotation')),
    [isVRSNB],
  );

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

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const discountValue = Math.min(Number(discount || 0), subtotal);
  const tax = useMemo(() => cart.reduce((s, i) => s + i.tax, 0), [cart]);
  const total = Math.max(0, subtotal + tax - discountValue);
  const tendered = paymentMode === 'credit'
    ? 0
    : paymentMode === 'split'
      ? Number(split.cash || 0) + Number(split.upi || 0) + Number(split.card || 0)
      : Number(cashTendered || (paymentMode === 'cash' ? 0 : total));
  const due = Math.max(0, total - tendered);
  const balance = paymentMode === 'credit' ? total : Math.max(0, tendered - total);
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
    const unit = unitOf(item);
    const available = stockMap.get(normalizeItemName(item.name)) ?? 0;
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
  }, [stockMap]);

  const reduceItem = (itemName: string) => setCart((current) => current.flatMap((c) => {
    if (c.itemName !== itemName) return [c];
    const delta = c.unit === 'kg' ? 0.25 : 1;
    const next = Number((c.quantity - delta).toFixed(3));
    return next > 0 ? [recalcLine(c, next)] : [];
  }));

  const clear = useCallback(() => {
    setCart([]); setCashTendered(''); setSplit({ cash: '', upi: '', card: '' }); setCreditCustomerName(''); setCreditCustomerMobile(''); setCreditDueDate(''); setCreditRemarks(''); setDiscount(''); setError(''); setLastBill(null);
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
    if (requiresSalesperson && !salesperson) return 'Salesperson selection is mandatory before billing.';
    if (!cart.length) return 'Cart is empty.';
    for (const item of cart) {
      const available = stockFor(branchStock, item.itemName);
      if (available <= 0) return `${item.itemName} is out of stock.`;
      if (item.quantity > available) return `${item.itemName} has only ${available} ${item.unit} available.`;
    }
    if (paymentMode === 'cash' && Number(cashTendered || 0) < total) return 'Cash tendered is less than bill total.';
    if (paymentMode === 'credit' && !creditCustomerName.trim()) return 'Customer name is required for credit sale.';
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
      const next = { ...current, [field]: valueText };
      if (field === 'cash') return { ...next, upi: remainingText, card: '' };
      if (field === 'upi') return { ...next, cash: remainingText, card: '' };
      return { ...next, cash: remainingText, upi: '' };
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
    } else {
      setCashTendered(String(total));
      setSplit({ cash: '', upi: '', card: '' });
    }
  };

  const checkout = async () => {
    const validationError = validateCheckout();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    const { billNo, invoiceNo } = nextBranchInvoice(branch);
    const modeLabel = paymentMode === 'split'
      ? `split:cash=${Number(split.cash || 0)},upi=${Number(split.upi || 0)},card=${Number(split.card || 0)}`
      : paymentMode;
    try {
      for (const item of cart) {
        const err = branch === 'SNB' || branch === 'Hosur' || branch === 'VRSNB'
          ? await recordSnbSale(branch, item.itemName, item.quantity, billingStaff, modeLabel, item.price, billNo)
          : { error: await recordSale(branch, item.itemName, item.quantity, billingStaff, modeLabel, billNo, item.price), mismatch: false };
        if (err.error) throw new Error(err.error);
      }
      const saved = addBill({
        branch, billNo, invoiceNo, items: cart, subtotal, discount: discountValue, tax, total,
        tendered: paymentMode === 'cash' || paymentMode === 'split' ? tendered : paymentMode === 'credit' ? 0 : total,
        balance: paymentMode === 'cash' || paymentMode === 'split' || paymentMode === 'credit' ? balance : 0,
        paymentMode,
        split: paymentMode === 'split' ? { cash: Number(split.cash || 0), upi: Number(split.upi || 0), card: Number(split.card || 0) } : undefined,
        creditCustomerName: paymentMode === 'credit' ? creditCustomerName.trim() : undefined,
        creditCustomerMobile: paymentMode === 'credit' ? creditCustomerMobile.trim() : undefined,
        creditDueDate: paymentMode === 'credit' ? creditDueDate : undefined,
        creditRemarks: paymentMode === 'credit' ? creditRemarks.trim() : undefined,
        salesperson: billingStaff,
        biller: userName,
      });
      printBranchBill(saved, false);
      setLastBill(saved);
      setCart([]); setCashTendered(''); setSplit({ cash: '', upi: '', card: '' }); setCreditCustomerName(''); setCreditCustomerMobile(''); setCreditDueDate(''); setCreditRemarks(''); setDiscount('');
      await fetchBranchData(branch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing failed.');
      addNotification({ branch, type: 'Stock Dispute', title: 'Bill blocked during stock validation', details: String(e), raisedBy: userName });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); clear(); }
      if (e.key === 'F2' || (e.ctrlKey && e.key.toLowerCase() === 'i')) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F3') { e.preventDefault(); holdBill(); }
      if (e.key === 'F4') { e.preventDefault(); setShowHold(true); }
      if (e.key === 'F5') { e.preventDefault(); selectPaymentMode('cash'); }
      if (e.key === 'F6') { e.preventDefault(); selectPaymentMode('upi'); }
      if (e.key === 'F7') { e.preventDefault(); selectPaymentMode('card'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); selectPaymentMode('credit'); }
      if (e.key === 'F8' || (e.ctrlKey && e.key.toLowerCase() === 'p')) { e.preventDefault(); checkout(); }
      if (e.key === 'F9') { e.preventDefault(); onOpenTab?.('advance'); }
      if (e.key === 'F10' && !isVRSNB) { e.preventDefault(); onOpenTab?.('quotation'); }
      if (e.key === 'F11' || (e.ctrlKey && e.key.toLowerCase() === 'r')) { e.preventDefault(); onOpenTab?.('returns'); }
      if (e.key === 'F12') { e.preventDefault(); onOpenTab?.('closure'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); cartRef.current?.focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); clear(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); setDiscount(String(Math.round(subtotal * 0.05))); }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowHold(false); }
      if (e.key === 'ArrowRight') { setSelectedIndex((i) => Math.min(i + 1, visibleItems.length - 1)); }
      if (e.key === 'ArrowLeft') { setSelectedIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && document.activeElement !== searchRef.current && visibleItems[selectedIndex]) { e.preventDefault(); addItem(visibleItems[selectedIndex]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addItem, branch, cart, clear, holdBill, isVRSNB, onOpenTab, selectedIndex, subtotal, total, visibleItems]);

  return (
    <div className="branch-billmaxo h-full min-h-[calc(100dvh-var(--header-h,4rem)-10rem)] overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-xl shadow-slate-200/70">
      <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(430px,540px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(480px,580px)_minmax(0,1fr)]">
        <aside ref={cartRef} tabIndex={-1} className="flex min-h-0 flex-col border-r border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-amber-300/30">
          <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
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
              <select value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-900 focus:border-amber-400 focus:outline-none">
                <option value="">Select salesperson before billing</option>
                {branchPeople.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {isAdmin && <p className="text-xs font-semibold text-slate-500">Admin can add/edit salesperson names in Salesperson Report.</p>}
            </div>
          ) : (
            <div className="border-b border-slate-200 p-4">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Cashier Billing</p>
                <p className="mt-1 text-base font-black text-slate-950">{userName}</p>
                <p className="text-xs font-semibold text-emerald-700/80">VRSNB does not require salesperson selection.</p>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2"><ShoppingCartIcon /><h3 className="text-lg font-black">Cart</h3></div>
              <button onClick={clear} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"><Trash2 className="mr-1 inline size-3"/>Clear</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="flex h-full min-h-48 items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
                  <div><Receipt className="mx-auto size-10 text-slate-300"/><p className="mt-3 font-black text-slate-600">Cart is always visible</p><p className="text-sm text-slate-400">Select items from the right side.</p></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((i) => (
                    <div key={i.itemName} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="text-base font-black leading-tight text-slate-950">{i.itemName}</p><p className="mt-1 text-xs font-bold text-slate-500">{formatQty(i.quantity, i.unit)} × {money(i.price)}</p></div>
                        <p className="text-lg font-black text-slate-950">{money(i.lineTotal)}</p>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => reduceItem(i.itemName)} className="size-9 rounded-xl bg-slate-100 font-black"><Minus className="mx-auto size-4"/></button>
                        <span className="min-w-20 rounded-xl bg-slate-950 px-3 py-2 text-center text-base font-black text-white tabular-nums">{formatQty(i.quantity, i.unit)}</span>
                        <button onClick={() => { const catalogItem = items.find((it) => it.name === i.itemName); if (catalogItem) addItem(catalogItem); }} className="size-9 rounded-xl bg-amber-400 font-black text-slate-950"><Plus className="mx-auto size-4"/></button>
                        <button onClick={() => setCart((c) => c.filter((x) => x.itemName !== i.itemName))} className="ml-auto rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600"><XCircle className="size-4"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-12px_35px_rgba(15,23,42,.08)]">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-slate-100 p-3"><p className="text-xs font-bold text-slate-500">Subtotal</p><p className="text-xl font-black">{money(subtotal)}</p></div>
              <div className="rounded-2xl bg-slate-100 p-3"><p className="text-xs font-bold text-slate-500">Discount</p><input value={discount} onChange={(e)=>setDiscount(e.target.value)} placeholder="0" className="w-full bg-transparent text-xl font-black outline-none"/></div>
              <div className="rounded-2xl bg-slate-950 p-3 text-white"><p className="text-xs font-bold text-white/60">Final Total</p><p className="text-3xl font-black tabular-nums">{money(total)}</p></div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-800"><p className="text-xs font-bold">{due > 0 ? 'Due' : 'Change'}</p><p className="text-3xl font-black tabular-nums">{money(due > 0 ? due : balance)}</p></div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {([['cash','Cash',Banknote],['upi','UPI',Smartphone],['card','Card',CreditCard],['split','Split',WalletCards],['credit','Credit',FileText]] as const).map(([key,label,Icon]) => (
                <button key={String(key)} onClick={()=>selectPaymentMode(key as PayMode)} className={cn('rounded-2xl border-2 p-2 text-xs font-black', paymentMode === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600')}><Icon className="mx-auto mb-1 size-4"/>{String(label)}</button>
              ))}
            </div>
            {paymentMode === 'split' ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min="0" max={total} value={split.cash} onChange={(e)=>updateSplitAmount('cash', e.target.value)} placeholder="Cash" className="rounded-xl border p-2 font-bold"/>
                  <input type="number" min="0" max={total} value={split.upi} onChange={(e)=>updateSplitAmount('upi', e.target.value)} placeholder="UPI" className="rounded-xl border p-2 font-bold"/>
                  <input type="number" min="0" max={total} value={split.card} onChange={(e)=>updateSplitAmount('card', e.target.value)} placeholder="Card" className="rounded-xl border p-2 font-bold"/>
                </div>
                <p className="text-xs font-bold text-slate-500">Split must equal {money(total)}. Remaining auto-fills when one amount is entered.</p>
              </div>
            ) : paymentMode === 'credit' ? (
              <div className="mt-3 space-y-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={creditCustomerName} onChange={(e)=>setCreditCustomerName(e.target.value)} placeholder="Customer name *" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <input value={creditCustomerMobile} onChange={(e)=>setCreditCustomerMobile(e.target.value)} placeholder="Mobile number" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <input type="date" value={creditDueDate} onChange={(e)=>setCreditDueDate(e.target.value)} className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                  <input value={creditRemarks} onChange={(e)=>setCreditRemarks(e.target.value)} placeholder="Credit remarks" className="rounded-xl border border-amber-200 bg-white p-2 font-bold outline-none focus:border-amber-500"/>
                </div>
                <p className="text-xs font-bold text-amber-800">Credit bill will reduce stock now and appear in Credit Sales as pending due: {money(total)}.</p>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2"><IndianRupee className="size-5 text-slate-400"/><input value={cashTendered} onChange={(e)=>setCashTendered(e.target.value)} placeholder={paymentMode === 'cash' ? 'Cash tendered' : 'Auto collected'} className="h-10 flex-1 bg-transparent text-xl font-black outline-none"/></div>
            )}
            {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><AlertTriangle className="mr-1 inline size-4"/>{error}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={holdBill} className="rounded-2xl bg-amber-100 px-3 py-3 text-sm font-black text-amber-800"><PauseCircle className="mx-auto mb-1 size-4"/>Hold</button>
              <button onClick={()=>onOpenTab?.('returns')} className="rounded-2xl bg-blue-100 px-3 py-3 text-sm font-black text-blue-800"><RotateCcw className="mx-auto mb-1 size-4"/>Return</button>
              <button onClick={checkout} disabled={saving || cart.length === 0} className="rounded-2xl bg-orange-500 px-3 py-3 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:opacity-50"><Printer className="mx-auto mb-1 size-4"/>{saving ? 'Saving' : 'Final Bill'}</button>
            </div>
            {lastBill && <button onClick={() => printBranchBill(lastBill, true)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white py-2 text-sm font-black text-slate-700">Print duplicate: {lastBill.billNo}</button>}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-slate-100">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><h1 className="text-3xl font-black tracking-tight text-slate-950">{BRANCH_LABELS[branch]} Fast Billing</h1></div>
              <div className="flex flex-wrap gap-2"><button onClick={()=>setShowHold(true)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><PauseCircle className="mr-2 inline size-4"/>Recall Hold ({branchHolds.length})</button><button onClick={()=>setShowShortcuts(true)} className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950"><HelpCircle className="mr-2 inline size-4"/>Shortcuts</button></div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-3xl border-2 border-slate-200 bg-slate-50 px-4 py-2 focus-within:border-amber-400">
              <Search className="size-6 text-slate-400"/><input ref={searchRef} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="F2 / Ctrl+I search item name or barcode" className="h-12 flex-1 bg-transparent text-xl font-black outline-none placeholder:text-slate-400"/><span className="rounded-xl bg-white px-3 py-1 text-xs font-black text-slate-500">{visibleItems.length} items</span>
            </div>
          </div>
          <div className="border-b border-slate-200 bg-white/80 p-3">
            <div className="flex flex-wrap gap-2">
              {['All', ...categories].map((c, idx) => <button key={c} onClick={()=>setCategory(c)} className={cn('rounded-2xl px-4 py-3 text-sm font-black transition', category === c ? 'bg-slate-950 text-white shadow-lg' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}><span className="mr-2 text-[10px] opacity-60">{idx === 0 ? 'A' : idx}</span>{c}</button>)}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visibleItems.map((item, idx) => {
                const stock = stockFor(branchStock, item.name);
                const disabled = stock <= 0;
                const inCart = cart.find((c)=>c.itemName===item.name);
                return (
                  <button key={item.barcode} disabled={disabled} onClick={()=>addItem(item)} className={cn('group min-h-36 rounded-3xl border-2 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45', idx === selectedIndex ? 'border-amber-400 ring-4 ring-amber-100' : 'border-slate-200', inCart && 'border-emerald-400 bg-emerald-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-xl font-black leading-tight text-slate-950">{item.name}</p>
                      <span className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">{idx + 1}</span>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-black text-emerald-700">{money(item.price)}<span className="text-xs text-slate-400">/{unitOf(item)}</span></p>
                        <p className={cn('mt-1 text-sm font-black', disabled ? 'text-red-600' : stock < 5 ? 'text-amber-600' : 'text-slate-500')}><Package className="mr-1 inline size-4"/>{disabled ? 'Out of stock' : `${formatQty(stock, unitOf(item))} left`}</p>
                      </div>
                      <span className={cn('inline-flex size-12 items-center justify-center rounded-2xl text-lg font-black shadow-sm', disabled ? 'bg-slate-100 text-slate-400' : 'bg-orange-500 text-white shadow-orange-200')} aria-label={`Add ${item.name}`}>
                        <Plus className="size-6" />
                      </span>
                    </div>
                    {inCart && <div className="mt-3 rounded-2xl bg-emerald-600 px-3 py-2 text-center text-sm font-black text-white">In cart: {formatQty(inCart.quantity, inCart.unit)}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {showShortcuts && <Modal onClose={() => setShowShortcuts(false)} title="Keyboard shortcut help"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{shortcutHelp.map(([k,v])=><div key={k} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><kbd className="rounded-lg bg-slate-950 px-2 py-1 text-sm font-black text-white">{k}</kbd><span className="text-sm font-bold text-slate-700">{v}</span></div>)}</div></Modal>}
      {showHold && <Modal onClose={() => setShowHold(false)} title="Recall held bills"><div className="space-y-3">{branchHolds.length===0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No held bills.</p> : branchHolds.map((h)=><div key={h.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4"><div><p className="font-black">{h.salesperson}</p><p className="text-sm text-slate-500">{h.items.length} items · {new Date(h.createdAt).toLocaleString('en-IN')}</p></div><button onClick={()=>recallHold(h.id)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Recall</button></div>)}</div></Modal>}
    </div>
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
