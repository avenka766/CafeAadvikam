// src/branch/tabs/BillTab.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Loader2, Receipt, IndianRupee, Banknote, Smartphone,
  CreditCard, Search, X, Scale, Hash, Pencil, ChevronRight,
  ArrowLeftRight, Percent, Printer, XCircle, Tag, FileText,
  ChevronDown, ChevronUp, Sparkles, Package,
  Wallet, Edit3, Clock, AlertCircle, User as UserIcon, StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem, BranchAdvanceOrder, BranchAdvanceItem } from '../branchStore';
import { CAFE_CONFIG } from '@/constants/config';

// ─── Types ────────────────────────────────────────────────────────────────────

type SellUnit = 'pcs' | 'kg';

interface CartItem {
  itemName: string;
  quantity: number;
  sellUnit: SellUnit;
  price: number | null;
  lineTotal: number | null;
}

type PaymentMethod = 'cash' | 'upi' | 'card';

type DiscountType = 'percent' | 'flat';

interface DiscountState {
  type: DiscountType;
  value: string;
}

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  advanceOrders?: BranchAdvanceOrder[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatQty(qty: number, unit: SellUnit) {
  if (unit === 'kg') return qty >= 1 ? `${qty} kg` : `${Math.round(qty * 1000)}g`;
  return `×${qty}`;
}

function detectSellUnit(itemName: string): SellUnit {
  const lower = itemName.toLowerCase();
  const weightKeywords = [
    'mysore pak', 'burfi', 'halwa', 'laadu', 'ladoo', 'chikki', 'mixture',
    'muruk', 'murukku', 'boondhi', 'pakoda', 'chips', 'cashew', 'groundnut',
    'biscuit', 'cookie', 'soan papdi', 'chana dal', 'mix dal', 'nippat',
    'kachori', 'samosa', 'oppat', 'jelabi', 'jangiri', 'badusha',
  ];
  return weightKeywords.some((kw) => lower.includes(kw)) ? 'kg' : 'pcs';
}

function nowString() {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── BillData ─────────────────────────────────────────────────────────────────

interface BillData {
  items: CartItem[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  grandTotal: number;
  paymentSummary: string;
  billedBy: string;
  branch: Branch;
  billNo: string;
  timestamp: string;
}

// ─── BillPrintModal ───────────────────────────────────────────────────────────

function BillPrintModal({ bill, onClose }: { bill: BillData; onClose: () => void }) {
  const handlePrint = () => window.print();
  const gstAmt = Math.round((bill.grandTotal - bill.grandTotal / 1.05) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-[92vw] max-w-sm max-h-[92vh] overflow-y-auto shadow-2xl print:shadow-none print:rounded-none print:max-h-none print:w-full print:max-w-none">

        {/* Action bar */}
        <div className="flex justify-between items-center p-3 border-b bg-gray-50 print:hidden">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <Receipt className="size-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">Bill #{bill.billNo}</p>
              <p className="text-[10px] text-gray-500">{bill.timestamp}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold active:scale-95 transition"
            >
              <Printer className="size-3.5" /> Print
            </button>
            <button
              onClick={onClose}
              className="size-8 rounded-full bg-gray-200 flex items-center justify-center active:scale-90 transition"
            >
              <X className="size-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Receipt body */}
        <div className="px-5 py-4 font-mono text-gray-900 text-[13px] leading-relaxed" id="bill-receipt">
          <div className="text-center mb-3">
            <p className="font-bold text-[15px] tracking-wide">{CAFE_CONFIG.name}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{CAFE_CONFIG.tagline}</p>
            <p className="text-[10px] text-gray-400">{CAFE_CONFIG.venture}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{CAFE_CONFIG.address}</p>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-[11px] text-gray-600 mb-0.5">
            <span>Branch: {bill.branch}</span>
            <span className="font-bold">Bill #{bill.billNo}</span>
          </div>
          <div className="text-[11px] text-gray-500 mb-0.5">{bill.timestamp}</div>
          <div className="text-[11px] text-gray-600 mb-1">Served by: <span className="font-semibold">{bill.billedBy}</span></div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase mb-1.5">
            <span className="flex-1">Item</span>
            <span className="w-16 text-center">Qty</span>
            <span className="w-14 text-right">Rate</span>
            <span className="w-16 text-right">Amt</span>
          </div>
          <div className="space-y-1 mb-2">
            {bill.items.map((c) => (
              <div key={c.itemName} className="flex justify-between text-[12px]">
                <span className="flex-1 truncate pr-1">{c.itemName}</span>
                <span className="w-16 text-center text-gray-600">
                  {c.sellUnit === 'kg'
                    ? c.quantity >= 1 ? `${c.quantity}kg` : `${Math.round(c.quantity * 1000)}g`
                    : `×${c.quantity}`}
                </span>
                <span className="w-14 text-right text-gray-600">
                  {c.price != null ? `₹${c.price}` : '—'}
                </span>
                <span className="w-16 text-right font-semibold">
                  {c.lineTotal != null ? `₹${c.lineTotal}` : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="space-y-0.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(bill.subtotal)}</span>
            </div>
            {bill.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount{bill.discountType === 'percent' ? ` (${bill.discountValue}%)` : ` (flat)`}</span>
                <span className="tabular-nums">- {formatCurrency(bill.discountAmount)}</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-400 my-1.5" />
          <div className="flex justify-between font-bold text-[15px]">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatCurrency(bill.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>Incl. GST 5% (CGST 2.5% + SGST 2.5%)</span>
            <span>{formatCurrency(gstAmt)}</span>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-[12px] text-gray-600">
            <p>Payment: <span className="font-semibold">{bill.paymentSummary}</span></p>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-center text-[11px] text-gray-500">
            <p className="font-bold">Thank you for visiting!</p>
            <p className="mt-0.5">~ {CAFE_CONFIG.type} ~</p>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          body > *:not(#__print_root) { display: none !important; }
          .print\\:hidden { display: none !important; }
          #bill-receipt { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}

// ─── CancelConfirmDialog ──────────────────────────────────────────────────────

function CancelConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-card rounded-2xl w-[85vw] max-w-xs p-5 shadow-2xl border space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <XCircle className="size-5 text-destructive" />
          </div>
          <div>
            <p className="font-bold text-base">Cancel Order?</p>
            <p className="text-xs text-muted-foreground mt-0.5">All items in cart will be cleared. Cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border bg-muted text-sm font-semibold active:scale-95 transition">
            Keep Order
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold active:scale-95 transition">
            Yes, Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KgInput ──────────────────────────────────────────────────────────────────

function KgInput({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const PRESETS = [0.1, 0.25, 0.5, 1, 2];

  const commit = (str: string) => {
    const n = parseFloat(str);
    if (!isNaN(n) && n > 0 && n <= max) onChange(Math.round(n * 1000) / 1000);
    else setRaw(String(value));
  };

  useEffect(() => { setRaw(String(value)); }, [value]);

  return (
    <div className="space-y-2 pt-0.5">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => { onChange(p); setRaw(String(p)); }}
            disabled={p > max}
            className={cn(
              'px-2 py-0.5 rounded-lg text-[10px] font-bold border transition active:scale-95',
              value === p
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-muted border-border text-foreground disabled:opacity-30',
            )}
          >
            {p < 1 ? `${p * 1000}g` : `${p}kg`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Scale className="size-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="number" inputMode="decimal" step="0.05" min="0.05" max={max}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(raw)}
          className="flex-1 h-8 px-3 rounded-lg border bg-background text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="e.g. 0.500"
        />
        <span className="text-xs text-muted-foreground shrink-0">kg</span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Max: {max >= 1 ? `${max} kg` : `${Math.round(max * 1000)}g`}
      </p>
    </div>
  );
}

// ─── InlinePriceInput ─────────────────────────────────────────────────────────

function InlinePriceInput({ unit, value, onChange }: {
  unit: SellUnit; value: number | null; onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(value == null);
  const [raw, setRaw] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) { onChange(n); setEditing(false); }
    else { setRaw(value != null ? String(value) : ''); setEditing(false); }
  };

  if (!editing && value != null) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition"
      >
        ₹{value}{unit === 'kg' ? '/kg' : '/pc'}
        <Pencil className="size-2.5 opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">₹</span>
      <input
        ref={inputRef}
        type="number" inputMode="decimal" min="0.01" step="0.5"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder={unit === 'kg' ? 'price/kg' : 'price/pc'}
        className="w-20 h-6 px-2 rounded-md border bg-amber-50 border-amber-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    </div>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({ item, inCart, cartQty, onAdd, onRemove, onKgChange, colors }: {
  item: StockItem; inCart: boolean; cartQty: number;
  onAdd: () => void; onRemove: () => void; onKgChange: (v: number) => void;
  colors: { bg: string; text: string; badge: string };
}) {
  const unit = detectSellUnit(item.itemName);

  return (
    <div className={cn(
      'relative bg-card border rounded-2xl p-3 flex flex-col gap-2 transition-all duration-150',
      inCart ? 'border-primary/40 shadow-md ring-1 ring-primary/10 bg-primary/[0.02]' : 'border-border',
    )}>
      {inCart && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />}

      <div className="pr-4">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{item.itemName}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.price != null ? (
            <span className="text-[11px] font-bold text-emerald-600">
              ₹{item.price}{unit === 'kg' ? '/kg' : ''}
            </span>
          ) : (
            <span className="text-[10px] text-amber-500 font-medium">Set price ↓</span>
          )}
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
            {unit === 'kg'
              ? <><Scale className="size-3" />{item.quantity >= 1 ? `${item.quantity}kg` : `${Math.round(item.quantity * 1000)}g`}</>
              : <><Hash className="size-3" />{item.quantity}</>
            }
          </span>
        </div>
      </div>

      {unit === 'kg' && inCart ? (
        <KgInput value={cartQty} onChange={onKgChange} max={item.quantity} />
      ) : unit === 'kg' ? (
        <button
          onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95', colors.bg, colors.text)}
        >
          <Scale className="size-3" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button onClick={onRemove} className="size-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition">
            <Minus className="size-3.5" />
          </button>
          <span className="text-sm font-bold tabular-nums">{cartQty}</span>
          <button
            onClick={onAdd}
            disabled={cartQty >= item.quantity}
            className="size-8 rounded-xl cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40 transition"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition active:scale-95', colors.bg, colors.text)}
        >
          <Plus className="size-3" /> Add
        </button>
      )}
    </div>
  );
}

// ─── CartLineItem ─────────────────────────────────────────────────────────────

function CartLineItem({ item, stockQty, onAdd, onRemove, onDelete, onPriceChange }: {
  item: CartItem; stockQty: number;
  onAdd: () => void; onRemove: () => void; onDelete: () => void;
  onPriceChange: (p: number | null) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate leading-snug">{item.itemName}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
            {formatQty(item.quantity, item.sellUnit)}
          </span>
          <span className="text-[10px] text-muted-foreground">×</span>
          <InlinePriceInput unit={item.sellUnit} value={item.price} onChange={onPriceChange} />
        </div>
        {item.lineTotal != null ? (
          <p className="text-sm font-bold text-primary tabular-nums">= {formatCurrency(item.lineTotal)}</p>
        ) : (
          <p className="text-[11px] text-amber-500">Enter price above to calculate</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {item.sellUnit === 'pcs' && (
          <>
            <button onClick={onRemove} className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition">
              <Minus className="size-3" />
            </button>
            <span className="w-5 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
            <button
              onClick={onAdd}
              disabled={item.quantity >= stockQty}
              className="size-7 rounded-lg cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40 transition"
            >
              <Plus className="size-3" />
            </button>
          </>
        )}
        {item.sellUnit === 'kg' && (
          <span className="text-xs font-semibold text-muted-foreground px-1">
            {item.quantity < 1 ? `${Math.round(item.quantity * 1000)}g` : `${item.quantity}kg`}
          </span>
        )}
        <button
          onClick={onDelete}
          className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition ml-0.5"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ─── DiscountPanel ────────────────────────────────────────────────────────────

function DiscountPanel({ discount, onChange, subtotal, discountAmount }: {
  discount: DiscountState; onChange: (d: DiscountState) => void;
  subtotal: number; discountAmount: number;
}) {
  const pct = discount.type === 'percent';
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Tag className="size-3.5 text-emerald-700" />
        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Discount</p>
        {discountAmount > 0 && (
          <span className="ml-auto text-xs font-bold text-emerald-700 tabular-nums">
            − {formatCurrency(discountAmount)}
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => onChange({ ...discount, type: 'percent' })}
          className={cn(
            'flex-1 py-1.5 rounded-lg text-xs font-bold border transition active:scale-95 flex items-center justify-center gap-1',
            pct ? 'bg-emerald-600 text-white border-transparent' : 'bg-white border-border text-foreground',
          )}
        >
          <Percent className="size-3" /> Percentage
        </button>
        <button
          onClick={() => onChange({ ...discount, type: 'flat' })}
          className={cn(
            'flex-1 py-1.5 rounded-lg text-xs font-bold border transition active:scale-95 flex items-center justify-center gap-1',
            !pct ? 'bg-emerald-600 text-white border-transparent' : 'bg-white border-border text-foreground',
          )}
        >
          <IndianRupee className="size-3" /> Flat Amount
        </button>
      </div>
      {pct && (
        <div className="flex gap-1.5 flex-wrap">
          {[5, 10, 15, 20].map((v) => (
            <button
              key={v}
              onClick={() => onChange({ type: 'percent', value: String(v) })}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition active:scale-95',
                discount.value === String(v)
                  ? 'bg-emerald-600 text-white border-transparent'
                  : 'bg-white border-border text-foreground',
              )}
            >
              {v}%
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 bg-white rounded-lg border px-3 py-2">
        {!pct && <span className="text-xs text-muted-foreground shrink-0">₹</span>}
        <input
          type="number" inputMode="decimal" min="0" max={pct ? 100 : subtotal} step={pct ? 1 : 0.5}
          value={discount.value}
          onChange={(e) => onChange({ ...discount, value: e.target.value })}
          placeholder={pct ? 'e.g. 10' : 'e.g. 50'}
          className="flex-1 text-sm font-mono bg-transparent focus:outline-none"
        />
        {pct && <span className="text-xs text-muted-foreground shrink-0">%</span>}
        {discount.value !== '' && (
          <button onClick={() => onChange({ ...discount, value: '' })} className="text-muted-foreground hover:text-foreground transition">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PaymentPanel ─────────────────────────────────────────────────────────────
// Full part-payment panel matching the biller's split payment UI

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: 'cash', label: 'Cash',  icon: <Banknote   className="size-4" /> },
  { key: 'upi',  label: 'UPI',   icon: <Smartphone className="size-4" /> },
  { key: 'card', label: 'Card',  icon: <CreditCard className="size-4" /> },
];

function PaymentPanel({
  payMode, singleMethod, splitMethods, splitAmounts, splitPending, splitTotal0,
  grandTotal, allPriced,
  onSetPayMode, onSetSingle, onSetSplitMethods, onSetSplitAmounts,
  onSplitAmountChange, onSelectSplitMethod,
}: {
  payMode: 'single' | 'split';
  singleMethod: PaymentMethod | null;
  splitMethods: [PaymentMethod | null, PaymentMethod | null];
  splitAmounts: [string, string];
  splitPending: number;
  splitTotal0: number;
  grandTotal: number;
  allPriced: boolean;
  onSetPayMode: (m: 'single' | 'split') => void;
  onSetSingle: (m: PaymentMethod | null) => void;
  onSetSplitMethods: (m: [PaymentMethod | null, PaymentMethod | null]) => void;
  onSetSplitAmounts: (a: [string, string]) => void;
  onSplitAmountChange: (idx: 0 | 1, v: string) => void;
  onSelectSplitMethod: (idx: 0 | 1, m: PaymentMethod) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Method</p>

      {/* 4 mode buttons */}
      <div className="grid grid-cols-4 gap-2">
        {PAYMENT_OPTIONS.map((m) => (
          <button
            key={m.key}
            onClick={() => { onSetPayMode('single'); onSetSingle(m.key); }}
            className={cn(
              'py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
              payMode === 'single' && singleMethod === m.key
                ? 'cafe-gradient text-primary-foreground border-transparent shadow-md'
                : 'bg-card border-border text-foreground hover:bg-muted/50',
            )}
          >
            {m.icon}{m.label}
          </button>
        ))}
        <button
          onClick={() => {
            onSetPayMode('split');
            onSetSingle(null);
            onSetSplitMethods([null, null]);
            onSetSplitAmounts(['', '']);
          }}
          className={cn(
            'py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
            payMode === 'split'
              ? 'bg-violet-600 text-white border-transparent shadow-md'
              : 'bg-card border-border text-foreground hover:bg-muted/50',
          )}
        >
          <ArrowLeftRight className="size-4" />
          Part Pay
        </button>
      </div>

      {/* Split payment panel */}
      {payMode === 'split' && (
        <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-1">
            Split between 2 methods
          </p>
          {([0, 1] as const).map((idx) => {
            const otherMethod = splitMethods[idx === 0 ? 1 : 0];
            return (
              <div key={idx} className="space-y-1.5">
                {/* Method picker row */}
                <div className="flex gap-1.5">
                  {PAYMENT_OPTIONS.map((m) => {
                    const isChosen  = splitMethods[idx] === m.key;
                    const isBlocked = otherMethod === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => !isBlocked && onSelectSplitMethod(idx, m.key)}
                        disabled={isBlocked}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border transition active:scale-95',
                          isChosen
                            ? 'bg-violet-600 text-white border-transparent'
                            : isBlocked
                            ? 'opacity-30 bg-muted border-border text-muted-foreground cursor-not-allowed'
                            : 'bg-white border-border text-foreground hover:bg-violet-50',
                        )}
                      >
                        {m.icon}{m.label}
                      </button>
                    );
                  })}
                </div>
                {/* Amount input */}
                <div className="flex items-center gap-2 bg-white rounded-lg border px-3 py-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">₹</span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={splitAmounts[idx]}
                    onChange={(e) => onSplitAmountChange(idx, e.target.value)}
                    placeholder={
                      splitMethods[idx]
                        ? allPriced ? `e.g. ${idx === 0 ? Math.round(grandTotal / 2) : ''}` : '0.00'
                        : 'Pick method first'
                    }
                    disabled={!splitMethods[idx]}
                    className="flex-1 text-sm font-mono text-right bg-transparent focus:outline-none disabled:opacity-40"
                  />
                </div>
              </div>
            );
          })}
          {/* Balance indicator */}
          {allPriced && splitTotal0 > 0 && (
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold mt-1',
              Math.abs(splitPending) < 0.01
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700',
            )}>
              <span>
                {Math.abs(splitPending) < 0.01
                  ? '✓ Balanced'
                  : splitPending > 0 ? 'Still to cover' : 'Over by'}
              </span>
              {Math.abs(splitPending) >= 0.01 && (
                <span className="tabular-nums font-bold">{formatCurrency(Math.abs(splitPending))}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BillingSummaryPanel ──────────────────────────────────────────────────────

function BillingSummaryPanel({
  cart, subtotal, discount, discountAmount, grandTotal, allPriced,
  payMode, singleMethod, splitMethods, splitAmounts, splitPending, splitTotal0,
  error, submitting, splitReady, soldBy,
  onDiscountChange, onSetPayMode, onSetSingle, onSetSplitMethods, onSetSplitAmounts,
  onSplitAmountChange, onSelectSplitMethod, onPreviewBill, onCheckout, onCancelOrder,
}: {
  cart: CartItem[]; subtotal: number; discount: DiscountState;
  discountAmount: number; grandTotal: number; allPriced: boolean;
  payMode: 'single' | 'split'; singleMethod: PaymentMethod | null;
  splitMethods: [PaymentMethod | null, PaymentMethod | null];
  splitAmounts: [string, string]; splitPending: number; splitTotal0: number;
  error: string; submitting: boolean; splitReady: boolean; soldBy: string;
  onDiscountChange: (d: DiscountState) => void;
  onSetPayMode: (m: 'single' | 'split') => void;
  onSetSingle: (m: PaymentMethod | null) => void;
  onSetSplitMethods: (m: [PaymentMethod | null, PaymentMethod | null]) => void;
  onSetSplitAmounts: (a: [string, string]) => void;
  onSplitAmountChange: (idx: 0 | 1, v: string) => void;
  onSelectSplitMethod: (idx: 0 | 1, m: PaymentMethod) => void;
  onPreviewBill: () => void; onCheckout: () => void; onCancelOrder: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="size-3.5 text-primary" />
          </div>
          <div>
            <span className="font-bold text-sm block leading-tight">Billing Summary</span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Billed by: <span className="font-semibold text-foreground">{soldBy}</span>
            </span>
          </div>
        </div>
        <button
          onClick={onCancelOrder}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive bg-destructive/10 hover:bg-destructive/15 px-2.5 py-1.5 rounded-lg transition active:scale-95"
        >
          <XCircle className="size-3.5" /> Cancel Order
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Totals block */}
        <div className={cn(
          'rounded-xl px-4 py-3 space-y-1.5',
          allPriced ? 'bg-primary/5 border border-primary/10' : 'bg-amber-50 border border-amber-100',
        )}>
          {/* Subtotal row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee className="size-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">Subtotal</span>
            </div>
            {allPriced ? (
              <span className="font-bold tabular-nums text-muted-foreground">{formatCurrency(subtotal)}</span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">⚠ Enter prices for total</span>
            )}
          </div>

          {/* Item count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Items</span>
            <span className="text-xs text-muted-foreground tabular-nums">{cart.length} {cart.length === 1 ? 'item' : 'items'}</span>
          </div>

          {/* Discount row */}
          {allPriced && discountAmount > 0 && (
            <div className="flex items-center justify-between pt-0.5 border-t border-emerald-100">
              <span className="text-sm text-emerald-700 font-medium">
                Discount{discount.type === 'percent' ? ` (${discount.value}%)` : ` (flat)`}
              </span>
              <span className="font-bold tabular-nums text-emerald-700">− {formatCurrency(discountAmount)}</span>
            </div>
          )}

          {/* Grand total */}
          {allPriced && (
            <>
              <div className="border-t border-primary/10 my-1" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Grand Total</span>
                <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">Incl. GST 5%</p>
            </>
          )}
        </div>

        {/* Discount panel */}
        {allPriced && (
          <DiscountPanel
            discount={discount} onChange={onDiscountChange}
            subtotal={subtotal} discountAmount={discountAmount}
          />
        )}

        {/* Payment panel */}
        <PaymentPanel
          payMode={payMode} singleMethod={singleMethod}
          splitMethods={splitMethods} splitAmounts={splitAmounts}
          splitPending={splitPending} splitTotal0={splitTotal0}
          grandTotal={grandTotal} allPriced={allPriced}
          onSetPayMode={onSetPayMode} onSetSingle={onSetSingle}
          onSetSplitMethods={onSetSplitMethods} onSetSplitAmounts={onSetSplitAmounts}
          onSplitAmountChange={onSplitAmountChange} onSelectSplitMethod={onSelectSplitMethod}
        />

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl">
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onPreviewBill}
            disabled={cart.length === 0 || !allPriced}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition"
          >
            <Printer className="size-4" /> Print Bill
          </button>
          <button
            onClick={onCheckout}
            disabled={submitting || !splitReady}
            className="flex-1 py-3 rounded-xl cafe-gradient text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition shadow-md"
          >
            {submitting
              ? <><Loader2 className="size-4 animate-spin" /> Processing…</>
              : <><Receipt className="size-4" /> Complete Sale</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Custom item type ─────────────────────────────────────────────────────────

interface CustomLineItem { id: string; name: string; price: number; qty: number; }

// ─── Pending Advance Card ─────────────────────────────────────────────────────

function PendingAdvanceCard({ order, branch }: { order: BranchAdvanceOrder; branch: Branch }) {
  const { collectAdvanceBalance } = useBranchStore();
  const [collecting, setCollecting] = useState(false);
  const [method, setMethod]         = useState<'cash' | 'upi' | 'card' | null>(null);
  const [err, setErr]               = useState('');
  const [done, setDone]             = useState(false);

  const handleCollect = async () => {
    if (!method) { setErr('Select payment method'); return; }
    setErr(''); setCollecting(true);
    const e = await collectAdvanceBalance(branch, order.id, method);
    if (e) { setErr(e); setCollecting(false); return; }
    setDone(true); setCollecting(false);
  };

  const PAY_ICONS = {
    cash: <Banknote className="size-3.5" />,
    upi:  <Smartphone className="size-3.5" />,
    card: <CreditCard className="size-3.5" />,
  };

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden shadow-soft',
      done ? 'border-emerald-300 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30',
    )}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-amber-200/50">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-amber-600" />
          <span className="text-sm font-body font-bold text-foreground">
            {order.customerName || 'Advance Order'}
          </span>
        </div>
        {done ? (
          <span className="text-xs font-body font-bold text-emerald-600 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="size-3" />Completed
          </span>
        ) : (
          <span className="text-xs font-body font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
            Balance Due
          </span>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-2 space-y-1">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between text-xs font-body">
            <span className="text-foreground flex items-center gap-1">
              {item.isCustom && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">CUSTOM</span>}
              {item.itemName}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {item.sellUnit === 'kg' ? `${item.quantity}kg` : `×${item.quantity}`}
              {item.price ? ` · ₹${item.lineTotal}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Amounts */}
      <div className="px-4 py-2 border-t border-amber-100 space-y-1">
        <div className="flex justify-between text-xs font-body text-muted-foreground">
          <span>Total</span><span className="tabular-nums">₹{order.subtotal}</span>
        </div>
        <div className="flex justify-between text-xs font-body text-muted-foreground">
          <span>Advance paid ({order.advanceMethod.toUpperCase()})</span>
          <span className="tabular-nums text-emerald-600">- ₹{order.advanceAmount}</span>
        </div>
        <div className="flex justify-between text-sm font-body font-bold">
          <span className="text-red-600">Balance Due</span>
          <span className="tabular-nums text-red-600">₹{order.balanceDue}</span>
        </div>
      </div>

      {/* Collect balance */}
      {!done && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest">
            Collect Balance via *
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['cash', 'upi', 'card'] as const).map((m) => (
              <button key={m} onClick={() => { setMethod(m); setErr(''); }}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-[11px] font-body font-bold transition-all active:scale-95',
                  method === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground',
                )}>
                {PAY_ICONS[m]}{m.toUpperCase()}
              </button>
            ))}
          </div>
          {err && (
            <p className="text-xs font-body text-destructive flex items-center gap-1.5">
              <AlertCircle className="size-3 shrink-0" />{err}
            </p>
          )}
          <button onClick={handleCollect} disabled={collecting}
            className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#0F6E56,#0a5040)', boxShadow: '0 4px 16px rgba(15,110,86,0.35)' }}>
            {collecting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {collecting ? 'Processing…' : '✅ Collect & Complete Sale'}
          </button>
          <p className="text-[10px] font-body text-center text-muted-foreground">
            Stock will be deducted only after full payment
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Advance Panel ────────────────────────────────────────────────────────────

function AdvancePanel({ branch, branchStock, advanceOrders, soldBy }: {
  branch: Branch;
  branchStock: StockItem[];
  advanceOrders: BranchAdvanceOrder[];
  soldBy: string;
}) {
  const { recordAdvanceOrder } = useBranchStore();

  const [itemMode, setItemMode]     = useState<'stock' | 'custom'>('stock');
  const [search, setSearch]         = useState('');
  const [cart, setCart]             = useState<BranchAdvanceItem[]>([]);
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customErr, setCustomErr]     = useState('');
  const [customerName, setCustomerName] = useState('');
  const [advanceAmt, setAdvanceAmt]   = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [advanceErr, setAdvanceErr]   = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState(false);

  const pendingOrders = advanceOrders.filter((o) => o.status === 'pending');

  const availableItems = useMemo(() => branchStock.filter((s) => s.quantity > 0), [branchStock]);
  const filteredItems  = useMemo(() => {
    if (!search.trim()) return availableItems;
    return availableItems.filter((s) => s.itemName.toLowerCase().includes(search.toLowerCase()));
  }, [availableItems, search]);

  const cartTotal   = cart.reduce((s, c) => s + c.lineTotal, 0);
  const customTotal = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const total       = cartTotal + customTotal;
  const allEmpty    = cart.length === 0 && customItems.length === 0;

  const addStockItem = (item: StockItem) => {
    const unit = detectSellUnit(item.itemName);
    const qty  = unit === 'kg' ? 0.5 : 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.itemName === item.itemName);
      if (existing) {
        if (unit === 'pcs') {
          return prev.map((c) => c.itemName === item.itemName
            ? { ...c, quantity: c.quantity + 1, lineTotal: c.price * (c.quantity + 1) }
            : c);
        }
        return prev;
      }
      const price = item.price ?? 0;
      return [...prev, { itemName: item.itemName, quantity: qty, sellUnit: unit, price, lineTotal: Math.round(price * qty * 100) / 100, isCustom: false }];
    });
  };

  const removeStockItem = (name: string) => setCart((prev) => {
    const it = prev.find((c) => c.itemName === name);
    if (!it) return prev;
    if (it.sellUnit === 'kg' || it.quantity <= 1) return prev.filter((c) => c.itemName !== name);
    return prev.map((c) => c.itemName === name ? { ...c, quantity: c.quantity - 1, lineTotal: c.price * (c.quantity - 1) } : c);
  });

  const handleAddCustom = () => {
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomErr('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomErr('Enter a valid price'); return; }
    setCustomErr('');
    setCustomItems((prev) => {
      const ex = prev.find((c) => c.name.toLowerCase() === n.toLowerCase());
      if (ex) return prev.map((c) => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `c-${Date.now()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };

  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems((prev) => prev.filter((c) => c.id !== id));
    else setCustomItems((prev) => prev.map((c) => c.id === id ? { ...c, qty } : c));
  };

  const handleSubmit = async () => {
    if (allEmpty) return;
    const amt = parseFloat(advanceAmt);
    if (isNaN(amt) || amt <= 0) { setAdvanceErr('Enter advance amount'); return; }
    if (amt >= total)            { setAdvanceErr('Advance must be less than total'); return; }
    if (!advanceMethod)          { setAdvanceErr('Select payment method'); return; }
    setAdvanceErr(''); setSubmitting(true);

    // Merge stock cart + custom items into BranchAdvanceItem[]
    const allItems: BranchAdvanceItem[] = [
      ...cart,
      ...customItems.map((c) => ({
        itemName: c.name, quantity: c.qty, sellUnit: 'pcs' as const,
        price: c.price, lineTotal: c.price * c.qty, isCustom: true,
      })),
    ];

    const err = await recordAdvanceOrder(branch, {
      branch,
      customerName: customerName.trim() || null,
      items: allItems,
      subtotal: total,
      advanceAmount: amt,
      advanceMethod,
      balanceDue: Math.max(0, total - amt),
      soldBy,
    });

    setSubmitting(false);
    if (err) { setAdvanceErr(err); return; }
    setSuccess(true);
    setCart([]); setCustomItems([]); setCustomerName('');
    setAdvanceAmt(''); setAdvanceMethod(null);
    setTimeout(() => setSuccess(false), 2000);
  };

  const PAY_ICONS = {
    cash: <Banknote className="size-4" />,
    upi:  <Smartphone className="size-4" />,
    card: <CreditCard className="size-4" />,
  };

  return (
    <div className="space-y-4">

      {/* Success flash */}
      {success && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 animate-scale-in text-center">
          <div className="size-16 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(217,119,6,0.12)', border: '2px solid rgba(217,119,6,0.25)' }}>
            <Wallet className="size-8 text-amber-600" />
          </div>
          <p className="font-display text-xl font-bold text-foreground">Advance Recorded!</p>
          <p className="text-sm font-body text-muted-foreground">Balance will be collected on delivery.</p>
          <p className="text-xs font-body text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
            Stock deducted only when full payment is collected
          </p>
        </div>
      )}

      {!success && (
        <>
          {/* ── Item mode toggle ── */}
          <div className="flex gap-1.5 p-1 rounded-xl bg-muted">
            <button onClick={() => setItemMode('stock')}
              className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all flex items-center justify-center gap-1.5',
                itemMode === 'stock' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground')}>
              <Package className="size-3.5" />Stock Items
            </button>
            <button onClick={() => setItemMode('custom')}
              className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all flex items-center justify-center gap-1.5',
                itemMode === 'custom' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground')}>
              <Edit3 className="size-3.5" />Custom Items
            </button>
          </div>

          {itemMode === 'stock' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" placeholder="Search stock items…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
              </div>
              <div className="space-y-1.5">
                {filteredItems.map((item) => {
                  const inCart = cart.find((c) => c.itemName === item.itemName);
                  const unit = detectSellUnit(item.itemName);
                  return (
                    <div key={item.itemName} className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
                      inCart ? 'border-amber-300 bg-amber-50/40' : 'border-border bg-card',
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold truncate">{item.itemName}</p>
                        <p className="text-xs font-body text-muted-foreground">
                          {unit === 'kg' ? <><Scale className="size-3 inline mr-0.5" />kg</> : <><Hash className="size-3 inline mr-0.5" />pcs</>}
                          {item.price ? ` · ₹${item.price}/${unit === 'kg' ? 'kg' : 'pc'}` : ''}
                        </p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => removeStockItem(item.itemName)}
                            className="size-7 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90">
                            <Minus className="size-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums">
                            {unit === 'kg' ? `${inCart.quantity}kg` : inCart.quantity}
                          </span>
                          <button onClick={() => addStockItem(item)}
                            className="size-7 rounded-xl flex items-center justify-center active:scale-90 text-white"
                            style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}>
                            <Plus className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => addStockItem(item)}
                          className="px-3 py-1.5 rounded-xl text-xs font-body font-bold active:scale-95 transition-all text-white"
                          style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}>
                          + Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Custom items form */
            <div className="space-y-3">
              <div className="bg-card border border-amber-200/60 rounded-2xl p-4 space-y-3 shadow-soft">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.15)' }}>
                    <Edit3 className="size-3.5 text-amber-600" />
                  </div>
                  <p className="text-sm font-body font-bold text-foreground">Add Custom Item</p>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Item Name *</label>
                  <input type="text" placeholder="e.g. Special Cake, Event Platter…"
                    value={customName} onChange={(e) => { setCustomName(e.target.value); setCustomErr(''); }}
                    className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Price (₹) *</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <input type="number" min="0" step="0.5" placeholder="0.00"
                        value={customPrice} onChange={(e) => { setCustomPrice(e.target.value); setCustomErr(''); }}
                        className="w-full pl-8 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Qty</label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCustomQty((q) => String(Math.max(1, parseInt(q || '1') - 1)))}
                        className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90">
                        <Minus className="size-3.5" />
                      </button>
                      <input type="number" min="1" value={customQty} onChange={(e) => setCustomQty(e.target.value)}
                        className="flex-1 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all" />
                      <button onClick={() => setCustomQty((q) => String(parseInt(q || '1') + 1))}
                        className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                {customErr && (
                  <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />{customErr}
                  </p>
                )}
                <button onClick={handleAddCustom}
                  className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white"
                  style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)', boxShadow: '0 4px 16px rgba(184,134,11,0.3)' }}>
                  <Plus className="size-4" />Add to Bill
                </button>
              </div>

              {customItems.length > 0 && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-soft">
                  <div className="px-4 py-2.5 border-b border-border flex justify-between items-center bg-amber-50/40">
                    <span className="text-xs font-body font-bold text-amber-700">Custom Items Added ({customItems.length})</span>
                    <button onClick={() => setCustomItems([])} className="text-xs font-body text-destructive active:opacity-70">Clear</button>
                  </div>
                  {customItems.map((ci) => (
                    <div key={ci.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold truncate">{ci.name}</p>
                        <p className="text-xs font-body text-muted-foreground tabular-nums">
                          ₹{ci.price} × {ci.qty} = <span className="font-bold text-amber-600">₹{ci.price * ci.qty}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)}
                          className="size-7 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90">
                          <Minus className="size-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)}
                          className="size-7 rounded-xl text-white flex items-center justify-center active:scale-90"
                          style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}>
                          <Plus className="size-3" />
                        </button>
                        <button onClick={() => updateCustomQty(ci.id, 0)}
                          className="size-7 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center active:scale-90 ml-0.5">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2 flex justify-between border-t border-border bg-muted/20">
                    <span className="text-xs font-body text-muted-foreground">Custom subtotal</span>
                    <span className="text-sm font-body font-bold text-amber-600 tabular-nums">₹{customTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Cart summary ── */}
          {!allEmpty && (
            <div className="bg-card border border-amber-200 rounded-2xl overflow-hidden shadow-soft">
              <div className="px-4 py-2.5 border-b border-amber-100 flex justify-between items-center bg-amber-50/30">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-4 text-amber-600" />
                  <span className="text-sm font-body font-bold text-foreground">Order Summary</span>
                </div>
                <button onClick={() => { setCart([]); setCustomItems([]); }}
                  className="text-xs font-body font-semibold text-destructive active:opacity-70">Clear all</button>
              </div>
              <div className="px-4 py-2 space-y-1">
                {cart.map((c) => (
                  <div key={c.itemName} className="flex justify-between text-xs font-body py-1">
                    <span className="text-foreground">{c.itemName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.sellUnit === 'kg' ? `${c.quantity}kg` : `×${c.quantity}`} · ₹{c.lineTotal}
                    </span>
                  </div>
                ))}
                {customItems.map((c) => (
                  <div key={c.id} className="flex justify-between text-xs font-body py-1 border-l-2 border-amber-300 pl-2">
                    <span className="text-foreground flex items-center gap-1">
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">CUSTOM</span>
                      {c.name}
                    </span>
                    <span className="text-amber-600 font-bold tabular-nums">₹{c.price * c.qty}</span>
                  </div>
                ))}
              </div>
              {cartTotal > 0 && customTotal > 0 && (
                <div className="px-4 pb-1 space-y-0.5 border-t border-border/50">
                  <div className="flex justify-between text-xs font-body text-muted-foreground pt-1">
                    <span>Stock items</span><span className="tabular-nums">₹{cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-body text-amber-600">
                    <span>Custom items</span><span className="tabular-nums">₹{customTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="px-4 py-2.5 border-t border-border flex justify-between items-center bg-muted/20">
                <span className="text-sm font-body font-bold text-foreground">Total</span>
                <span className="font-display text-xl font-bold text-foreground tabular-nums">₹{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ── Advance details ── */}
          {!allEmpty && (
            <div className="bg-card border border-amber-200 rounded-2xl p-4 space-y-3 shadow-soft">
              <div>
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Customer Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Optional" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40 transition-all" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Advance Amount (₹) *</label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="number" placeholder="Enter advance paid" value={advanceAmt}
                    onChange={(e) => { setAdvanceAmt(e.target.value); setAdvanceErr(''); }}
                    className="w-full pl-8 pr-3 py-3 bg-muted/50 border border-border rounded-xl text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all" />
                </div>
                {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && parseFloat(advanceAmt) < total && (
                  <div className="flex justify-between mt-1.5 px-1">
                    <span className="text-[11px] font-body text-muted-foreground">Balance due on delivery</span>
                    <span className="text-[11px] font-body font-bold text-red-600 tabular-nums">
                      ₹{(total - parseFloat(advanceAmt)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Advance Payment Method *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['cash', 'upi', 'card'] as const).map((m) => (
                    <button key={m} onClick={() => { setAdvanceMethod(m); setAdvanceErr(''); }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-[11px] font-body font-bold transition-all active:scale-95',
                        advanceMethod === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground',
                      )}>
                      {PAY_ICONS[m]}{m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {advanceErr && (
                <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3 shrink-0" />{advanceErr}
                </p>
              )}
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: '0 4px 16px rgba(184,134,11,0.35)' }}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                {submitting ? 'Saving…' : '⏳ Record Advance Order'}
              </button>
              <p className="text-[10px] font-body text-center text-muted-foreground">
                Stock is <span className="font-bold text-amber-700">not deducted</span> until full payment is collected
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Pending advance orders ── */}
      {pendingOrders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Clock className="size-4 text-amber-600" />
            <span className="text-sm font-body font-bold text-foreground">Pending Balance Collection</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {pendingOrders.length}
            </span>
          </div>
          {pendingOrders.map((o) => (
            <PendingAdvanceCard key={o.id} order={o} branch={branch} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main BillTab ─────────────────────────────────────────────────────────────

let billCounter = Math.floor(Math.random() * 1000) + 1;

export function BillTab({ branch, branchStock, advanceOrders = [] }: Props) {
  const { recordSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];
  const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';

  const [billMode, setBillMode]     = useState<'new' | 'advance'>('new');

  const [cart, setCart]             = useState<CartItem[]>([]);
  const [search, setSearch]         = useState('');
  const [payMode, setPayMode]       = useState<'single' | 'split'>('single');
  const [singleMethod, setSingle]   = useState<PaymentMethod | null>(null);
  const [splitMethods, setSplitMethods] = useState<[PaymentMethod | null, PaymentMethod | null]>([null, null]);
  const [splitAmounts, setSplitAmounts] = useState<[string, string]>(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [discount, setDiscount]     = useState<DiscountState>({ type: 'percent', value: '' });
  const [billToPrint, setBillToPrint] = useState<BillData | null>(null);
  const [showCart, setShowCart]     = useState(true);

  const resetPayment = () => {
    setPayMode('single'); setSingle(null);
    setSplitMethods([null, null]); setSplitAmounts(['', '']);
    setError('');
  };

  const resetDiscount = () => setDiscount({ type: 'percent', value: '' });

  useEffect(() => {
    setCart([]); resetPayment(); resetDiscount(); setSearch('');
  }, [branch]);

  const availableItems = useMemo(() => branchStock.filter((s) => s.quantity > 0), [branchStock]);
  const filteredItems  = useMemo(() => {
    if (!search.trim()) return availableItems;
    const q = search.toLowerCase();
    return availableItems.filter((s) => s.itemName.toLowerCase().includes(q));
  }, [availableItems, search]);

  const getCartItem  = (name: string) => cart.find((c) => c.itemName === name);
  const getStockQty  = (name: string) => branchStock.find((s) => s.itemName === name)?.quantity ?? 0;

  const computeLineTotal = (price: number | null, qty: number) =>
    price != null ? Math.round(price * qty * 100) / 100 : null;

  const addToCart = (item: StockItem) => {
    const unit = detectSellUnit(item.itemName);
    setCart((prev) => {
      const existing = prev.find((c) => c.itemName === item.itemName);
      if (existing) {
        if (unit === 'pcs') {
          const newQty = existing.quantity + 1;
          if (newQty > item.quantity) return prev;
          return prev.map((c) =>
            c.itemName === item.itemName
              ? { ...c, quantity: newQty, lineTotal: computeLineTotal(c.price, newQty) }
              : c,
          );
        }
        return prev;
      }
      const qty = Math.min(unit === 'kg' ? 0.5 : 1, item.quantity);
      return [...prev, {
        itemName: item.itemName, quantity: qty, sellUnit: unit,
        price: item.price, lineTotal: computeLineTotal(item.price, qty),
      }];
    });
  };

  const removeFromCart = (name: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemName === name);
      if (!existing) return prev;
      if (existing.sellUnit === 'kg' || existing.quantity <= 1) return prev.filter((c) => c.itemName !== name);
      const newQty = existing.quantity - 1;
      return prev.map((c) => c.itemName === name ? { ...c, quantity: newQty, lineTotal: computeLineTotal(c.price, newQty) } : c);
    });
  };

  const updateKgQty = (name: string, qty: number) =>
    setCart((prev) => prev.map((c) => c.itemName === name ? { ...c, quantity: qty, lineTotal: computeLineTotal(c.price, qty) } : c));

  const updatePrice = (name: string, price: number | null) =>
    setCart((prev) => prev.map((c) => c.itemName === name ? { ...c, price, lineTotal: computeLineTotal(price, c.quantity) } : c));

  const deleteFromCart = (name: string) => setCart((prev) => prev.filter((c) => c.itemName !== name));
  const clearCart = () => { setCart([]); resetPayment(); resetDiscount(); };

  // ── Calculations ────────────────────────────────────────────────────────────
  const subtotal = useMemo(() => cart.reduce((sum, c) => sum + (c.lineTotal ?? 0), 0), [cart]);

  const discountAmount = useMemo(() => {
    const v = parseFloat(discount.value);
    if (isNaN(v) || v <= 0) return 0;
    if (discount.type === 'percent') {
      const pct = Math.min(v, 100);
      return Math.round(subtotal * pct / 100 * 100) / 100;
    }
    return Math.min(v, subtotal);
  }, [discount, subtotal]);

  const grandTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const allPriced  = cart.length > 0 && cart.every((c) => c.price != null);
  const cartCount  = cart.length;

  // ── Split payment helpers ────────────────────────────────────────────────────
  const splitTotal0 = parseFloat(splitAmounts[0]) || 0;
  const splitTotal1 = parseFloat(splitAmounts[1]) || 0;
  const splitSum    = Math.round((splitTotal0 + splitTotal1) * 100) / 100;
  const splitReady  = payMode === 'split'
    ? splitMethods[0] !== null && splitMethods[1] !== null &&
      splitMethods[0] !== splitMethods[1] &&
      (allPriced ? Math.abs(splitSum - grandTotal) < 0.01 : splitTotal0 > 0 && splitTotal1 > 0)
    : singleMethod !== null;

  const handleSplitAmount = (idx: 0 | 1, raw: string) => {
    setError('');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && allPriced) {
      const other = Math.round((grandTotal - parsed) * 100) / 100;
      setSplitAmounts(idx === 0 ? [raw, other >= 0 ? String(other) : ''] : [other >= 0 ? String(other) : '', raw]);
    } else {
      setSplitAmounts((prev) => idx === 0 ? [raw, prev[1]] : [prev[0], raw]);
    }
  };

  const selectSplitMethod = (idx: 0 | 1, method: PaymentMethod) => {
    setError('');
    setSplitMethods((prev) => {
      const next: [PaymentMethod | null, PaymentMethod | null] = [...prev] as [PaymentMethod | null, PaymentMethod | null];
      next[idx] = method;
      return next;
    });
    if (idx === 0 && allPriced) setSplitAmounts(['', '']);
  };

  const splitPending = allPriced ? Math.round((grandTotal - splitSum) * 100) / 100 : 0;

  const buildPaymentSummary = (): string => {
    if (payMode === 'single') return singleMethod ? singleMethod.toUpperCase() : 'Cash';
    const [m0, m1] = splitMethods;
    const parts: string[] = [];
    if (m0) parts.push(`${m0.toUpperCase()} ₹${splitAmounts[0] || 0}`);
    if (m1) parts.push(`${m1.toUpperCase()} ₹${splitAmounts[1] || 0}`);
    return parts.join(' + ') || 'Split';
  };

  const buildMethodLabel = () => {
    if (payMode === 'single') return singleMethod ?? 'cash';
    const [m0, m1] = splitMethods;
    const parts = [];
    if (m0) parts.push(`${m0}:${splitAmounts[0] || 0}`);
    if (m1) parts.push(`${m1}:${splitAmounts[1] || 0}`);
    return parts.join('+');
  };

  // ── Preview bill (without completing sale) ────────────────────────────────
  const handlePreviewBill = () => {
    if (cart.length === 0) return;
    setBillToPrint({
      items: [...cart], subtotal,
      discountType: discount.type, discountValue: parseFloat(discount.value) || 0,
      discountAmount, grandTotal,
      paymentSummary: buildPaymentSummary(), billedBy: soldBy,
      branch, billNo: String(billCounter).padStart(4, '0'), timestamp: nowString(),
    });
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!splitReady) {
      if (payMode === 'split') {
        if (!splitMethods[0] || !splitMethods[1]) { setError('Select both payment methods for split.'); return; }
        if (splitMethods[0] === splitMethods[1])  { setError('Choose two different methods.'); return; }
        if (allPriced && Math.abs(splitSum - grandTotal) >= 0.01) {
          setError(`Amounts total ₹${splitSum} but bill is ₹${grandTotal}.`); return;
        }
      } else {
        setError('Select a payment method.'); return;
      }
    }
    setError(''); setSubmitting(true);

    const methodLabel  = buildMethodLabel();
    const succeeded: string[] = [];

    for (const item of cart) {
      const err = await recordSale(branch, item.itemName, item.quantity, soldBy, methodLabel);
      if (err) {
        const note = succeeded.length > 0 ? ` (Recorded: ${succeeded.join(', ')})` : '';
        setError(`Failed on "${item.itemName}": ${err}.${note}`);
        setSubmitting(false);
        return;
      }
      succeeded.push(item.itemName);
    }

    const billData: BillData = {
      items: [...cart], subtotal,
      discountType: discount.type, discountValue: parseFloat(discount.value) || 0,
      discountAmount, grandTotal,
      paymentSummary: buildPaymentSummary(), billedBy: soldBy,
      branch, billNo: String(billCounter++).padStart(4, '0'), timestamp: nowString(),
    };

    setSubmitting(false);
    clearCart();
    setBillToPrint(billData);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  // ── Cancel handler ────────────────────────────────────────────────────────
  const handleCancelConfirmed = () => {
    clearCart();
    setShowCancelDialog(false);
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (showSuccess && !billToPrint) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4 shadow-md">
          <CheckCircle2 className="size-10 text-emerald-600" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Sale Complete!</h2>
        <p className="text-muted-foreground text-sm mt-1">Stock updated and sale recorded.</p>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-6">

      {/* Print bill modal */}
      {billToPrint && (
        <BillPrintModal
          bill={billToPrint}
          onClose={() => { setBillToPrint(null); setShowSuccess(false); }}
        />
      )}

      {/* Cancel confirmation dialog */}
      {showCancelDialog && (
        <CancelConfirmDialog
          onConfirm={handleCancelConfirmed}
          onCancel={() => setShowCancelDialog(false)}
        />
      )}

      {/* ── Bill mode toggle ── */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-muted">
        <button
          onClick={() => setBillMode('new')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-95',
            billMode === 'new' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground',
          )}
        >
          <Receipt className="size-3.5" />New Bill
        </button>
        <button
          onClick={() => setBillMode('advance')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-95',
            billMode === 'advance' ? 'bg-amber-500 text-white shadow-md' : 'text-muted-foreground',
          )}
        >
          <Wallet className="size-3.5" />Advance
          {advanceOrders.filter((o) => o.status === 'pending').length > 0 && (
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              billMode === 'advance' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700',
            )}>
              {advanceOrders.filter((o) => o.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* ── Advance panel ── */}
      {billMode === 'advance' && (
        <AdvancePanel
          branch={branch}
          branchStock={branchStock}
          advanceOrders={advanceOrders}
          soldBy={soldBy}
        />
      )}

      {/* ── New Bill panel (existing UI) ── */}
      {billMode === 'new' && (
      <>
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {availableItems.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          {filteredItems.length === availableItems.length
            ? `${availableItems.length} items in stock`
            : `${filteredItems.length} of ${availableItems.length} items`}
        </p>
      )}

      {/* ── Item grid ─────────────────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed">
          {availableItems.length === 0
            ? (
              <div className="flex flex-col items-center gap-2">
                <Package className="size-8 opacity-20" />
                <p>No items in stock</p>
              </div>
            )
            : 'No items match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredItems.map((item) => {
            const ci = getCartItem(item.itemName);
            return (
              <ItemCard
                key={item.itemName}
                item={item}
                inCart={!!ci}
                cartQty={ci?.quantity ?? 0}
                onAdd={() => addToCart(item)}
                onRemove={() => removeFromCart(item.itemName)}
                onKgChange={(v) => updateKgQty(item.itemName, v)}
                colors={colors}
              />
            );
          })}
        </div>
      )}

      {/* ── Cart section ──────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">

          {/* Cart header — collapsible */}
          <button
            onClick={() => setShowCart((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 border-b bg-muted/20 active:bg-muted/40 transition"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <span className="font-semibold text-sm">Cart</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', colors.badge)}>
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
              {allPriced && (
                <span className="text-[11px] font-bold text-primary tabular-nums">
                  {formatCurrency(grandTotal)}
                </span>
              )}
            </div>
            {showCart
              ? <ChevronUp className="size-4 text-muted-foreground" />
              : <ChevronDown className="size-4 text-muted-foreground" />
            }
          </button>

          {/* Cart items */}
          {showCart && (
            <div
              className="divide-y max-h-64 overflow-y-scroll overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
            >
              {cart.map((c) => (
                <CartLineItem
                  key={c.itemName}
                  item={c}
                  stockQty={getStockQty(c.itemName)}
                  onAdd={() => { const s = branchStock.find((si) => si.itemName === c.itemName); if (s) addToCart(s); }}
                  onRemove={() => removeFromCart(c.itemName)}
                  onDelete={() => deleteFromCart(c.itemName)}
                  onPriceChange={(p) => updatePrice(c.itemName, p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Billing Summary Panel ─────────────────────────────────────────── */}
      {cart.length > 0 && (
        <BillingSummaryPanel
          cart={cart} subtotal={subtotal} discount={discount}
          discountAmount={discountAmount} grandTotal={grandTotal} allPriced={allPriced}
          payMode={payMode} singleMethod={singleMethod}
          splitMethods={splitMethods} splitAmounts={splitAmounts}
          splitPending={splitPending} splitTotal0={splitTotal0}
          error={error} submitting={submitting} splitReady={splitReady} soldBy={soldBy}
          onDiscountChange={setDiscount}
          onSetPayMode={setPayMode} onSetSingle={setSingle}
          onSetSplitMethods={setSplitMethods} onSetSplitAmounts={setSplitAmounts}
          onSplitAmountChange={handleSplitAmount} onSelectSplitMethod={selectSplitMethod}
          onPreviewBill={handlePreviewBill} onCheckout={handleCheckout}
          onCancelOrder={() => setShowCancelDialog(true)}
        />
      )}

      {/* Empty cart hint */}
      {cart.length === 0 && availableItems.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 rounded-xl text-xs text-muted-foreground border border-dashed">
          <ShoppingCart className="size-3.5 shrink-0" />
          Tap any item above to add it to the cart
          <ChevronRight className="size-3.5 ml-auto shrink-0" />
        </div>
      )}
      </> /* end New Bill panel */
      )}
    </div>
  );
}
