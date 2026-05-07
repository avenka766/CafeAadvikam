// src/branch/tabs/BillTab.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Loader2, Receipt, IndianRupee, Banknote, Smartphone,
  CreditCard, Search, X, Scale, Hash, Pencil, ChevronRight, GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem } from '../branchStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type SellUnit = 'pcs' | 'kg';

interface CartItem {
  itemName: string;
  quantity: number;     // kg for kg-items, count for pcs
  sellUnit: SellUnit;
  price: number | null; // per kg or per piece — can be overridden inline
  lineTotal: number | null;
}

type PaymentMethod = 'cash' | 'upi' | 'card';

interface PaymentSplit {
  method: PaymentMethod;
  amount: string; // string so input can be empty/partial while typing
}

interface Props {
  branch: Branch;
  branchStock: StockItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatQty(qty: number, unit: SellUnit) {
  if (unit === 'kg') return qty >= 1 ? `${qty} kg` : `${Math.round(qty * 1000)}g`;
  return `×${qty}`;
}

/** Detect sell unit from item name — weight-based items → kg */
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

// ─── KgInput ──────────────────────────────────────────────────────────────────

function KgInput({
  value, onChange, max,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const PRESETS = [0.1, 0.25, 0.5, 1, 2];

  const commit = (str: string) => {
    const n = parseFloat(str);
    if (!isNaN(n) && n > 0 && n <= max) {
      onChange(Math.round(n * 1000) / 1000);
    } else {
      setRaw(String(value));
    }
  };

  useEffect(() => { setRaw(String(value)); }, [value]);

  return (
    <div className="space-y-2 pt-0.5">
      {/* Preset chips */}
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

      {/* Manual input */}
      <div className="flex items-center gap-2">
        <Scale className="size-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="0.05"
          min="0.05"
          max={max}
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

// ─── InlinePriceInput — lets user enter price if not set in stock ─────────────

function InlinePriceInput({
  unit,
  value,
  onChange,
}: {
  unit: SellUnit;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(value == null);
  const [raw, setRaw] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) {
      onChange(n);
      setEditing(false);
    } else {
      setRaw(value != null ? String(value) : '');
      setEditing(false);
    }
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
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.5"
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

function ItemCard({
  item,
  inCart,
  cartQty,
  onAdd,
  onRemove,
  onKgChange,
  colors,
}: {
  item: StockItem;
  inCart: boolean;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onKgChange: (v: number) => void;
  colors: { bg: string; text: string; badge: string };
}) {
  const unit = detectSellUnit(item.itemName);

  return (
    <div
      className={cn(
        'relative bg-card border rounded-2xl p-3 flex flex-col gap-2 transition-all duration-150',
        inCart
          ? 'border-primary/40 shadow-md ring-1 ring-primary/10 bg-primary/[0.02]'
          : 'border-border',
      )}
    >
      {/* In-cart indicator dot */}
      {inCart && (
        <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />
      )}

      {/* Name + availability */}
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

      {/* Kg expanded input */}
      {unit === 'kg' && inCart ? (
        <KgInput value={cartQty} onChange={onKgChange} max={item.quantity} />
      ) : unit === 'kg' ? (
        <button
          onClick={onAdd}
          className={cn(
            'w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95',
            colors.bg, colors.text,
          )}
        >
          <Scale className="size-3" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button
            onClick={onRemove}
            className="size-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition"
          >
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
          className={cn(
            'w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition active:scale-95',
            colors.bg, colors.text,
          )}
        >
          <Plus className="size-3" /> Add
        </button>
      )}
    </div>
  );
}

// ─── CartLineItem ─────────────────────────────────────────────────────────────

function CartLineItem({
  item,
  stockQty,
  onAdd,
  onRemove,
  onDelete,
  onPriceChange,
}: {
  item: CartItem;
  stockQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onDelete: () => void;
  onPriceChange: (p: number | null) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate leading-snug">{item.itemName}</p>

        {/* Qty + price row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
            {formatQty(item.quantity, item.sellUnit)}
          </span>
          <span className="text-[10px] text-muted-foreground">×</span>
          {/* Inline price — editable if null */}
          <InlinePriceInput
            unit={item.sellUnit}
            value={item.price}
            onChange={onPriceChange}
          />
        </div>

        {/* Line total */}
        {item.lineTotal != null ? (
          <p className="text-sm font-bold text-primary tabular-nums">
            = {formatCurrency(item.lineTotal)}
          </p>
        ) : (
          <p className="text-[11px] text-amber-500">Enter price above to calculate</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {item.sellUnit === 'pcs' && (
          <>
            <button
              onClick={onRemove}
              className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition"
            >
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

// ─── Main BillTab ─────────────────────────────────────────────────────────────

export function BillTab({ branch, branchStock }: Props) {
  const { recordSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setCart([]); setSplits([]); setError(''); setSearch('');
  }, [branch]);

  const availableItems = useMemo(
    () => branchStock.filter((s) => s.quantity > 0),
    [branchStock],
  );

  const filteredItems = useMemo(() => {
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
      return [
        ...prev,
        {
          itemName: item.itemName,
          quantity: qty,
          sellUnit: unit,
          price: item.price,
          lineTotal: computeLineTotal(item.price, qty),
        },
      ];
    });
  };

  const removeFromCart = (name: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemName === name);
      if (!existing) return prev;
      if (existing.sellUnit === 'kg' || existing.quantity <= 1)
        return prev.filter((c) => c.itemName !== name);
      const newQty = existing.quantity - 1;
      return prev.map((c) =>
        c.itemName === name
          ? { ...c, quantity: newQty, lineTotal: computeLineTotal(c.price, newQty) }
          : c,
      );
    });
  };

  const updateKgQty = (name: string, qty: number) =>
    setCart((prev) =>
      prev.map((c) =>
        c.itemName === name
          ? { ...c, quantity: qty, lineTotal: computeLineTotal(c.price, qty) }
          : c,
      ),
    );

  /** Update price inline — immediately recalculates lineTotal */
  const updatePrice = (name: string, price: number | null) =>
    setCart((prev) =>
      prev.map((c) =>
        c.itemName === name
          ? { ...c, price, lineTotal: computeLineTotal(price, c.quantity) }
          : c,
      ),
    );

  const deleteFromCart = (name: string) =>
    setCart((prev) => prev.filter((c) => c.itemName !== name));

  const clearCart = () => { setCart([]); setSplits([]); setError(''); };

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + (c.lineTotal ?? 0), 0),
    [cart],
  );
  const allPriced = cart.length > 0 && cart.every((c) => c.price != null);
  const cartCount = cart.length;

  // Part-payment helpers
  const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: 'cash', label: 'Cash',  icon: <Banknote  className="size-4" /> },
    { key: 'upi',  label: 'UPI',   icon: <Smartphone className="size-4" /> },
    { key: 'card', label: 'Card',  icon: <CreditCard className="size-4" /> },
  ];

  const selectedMethods = splits.map((s) => s.method);
  const splitsTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const splitsMatch = allPriced
    ? Math.abs(splitsTotal - cartTotal) < 0.01
    : splits.length > 0;
  const splitsPending = allPriced ? Math.round((cartTotal - splitsTotal) * 100) / 100 : 0;

  const toggleMethod = (method: PaymentMethod) => {
    setError('');
    setSplits((prev) => {
      const exists = prev.find((s) => s.method === method);
      if (exists) {
        // Remove this method
        const next = prev.filter((s) => s.method !== method);
        // Re-auto-fill last method with full remainder if only 1 left
        if (next.length === 1 && allPriced) {
          return [{ ...next[0], amount: String(cartTotal) }];
        }
        return next;
      }
      // Add new method
      if (prev.length === 0) {
        // First method — default to full total
        return [{ method, amount: allPriced ? String(cartTotal) : '' }];
      }
      // Second/third method — move remainder into new slot, recalc first
      const existingTotal = prev.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const remainder = allPriced ? Math.max(0, Math.round((cartTotal - existingTotal) * 100) / 100) : 0;
      return [...prev, { method, amount: remainder > 0 ? String(remainder) : '' }];
    });
  };

  const updateSplitAmount = (method: PaymentMethod, raw: string) => {
    setError('');
    setSplits((prev) => prev.map((s) => s.method === method ? { ...s, amount: raw } : s));
  };

  const paymentMethodLabel = splits.length === 0
    ? null
    : splits.map((s) => s.method).join('+');

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (splits.length === 0) { setError('Select at least one payment method.'); return; }
    if (allPriced && !splitsMatch) {
      setError(`Payment total ₹${splitsTotal} doesn't match bill ₹${cartTotal}. Adjust amounts.`);
      return;
    }
    setError(''); setSubmitting(true);

    const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';
    const succeeded: string[] = [];
    const methodLabel = paymentMethodLabel ?? 'cash';

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

    setSubmitting(false);
    setShowSuccess(true);
    clearCart();
    setTimeout(() => setShowSuccess(false), 2500);
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (showSuccess) {
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

  // ── Main UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 pb-6">

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search items…"
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

      {/* ── Item count pill ── */}
      {availableItems.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          {filteredItems.length === availableItems.length
            ? `${availableItems.length} items in stock`
            : `${filteredItems.length} of ${availableItems.length} items`}
        </p>
      )}

      {/* Item grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed">
          {availableItems.length === 0 ? 'No items in stock.' : 'No items match your search.'}
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

      {/* ── Cart ─────────────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">

          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <span className="font-semibold text-sm">Cart</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', colors.badge)}>
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <button
              onClick={clearCart}
              className="text-[11px] font-semibold text-destructive bg-destructive/10 hover:bg-destructive/15 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              Clear all
            </button>
          </div>

          {/* Cart items */}
          <div
            className="divide-y max-h-64 overflow-y-scroll overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            {cart.map((c) => (
              <CartLineItem
                key={c.itemName}
                item={c}
                stockQty={getStockQty(c.itemName)}
                onAdd={() => {
                  const s = branchStock.find((si) => si.itemName === c.itemName);
                  if (s) addToCart(s);
                }}
                onRemove={() => removeFromCart(c.itemName)}
                onDelete={() => deleteFromCart(c.itemName)}
                onPriceChange={(p) => updatePrice(c.itemName, p)}
              />
            ))}
          </div>

          {/* Total + payment + checkout */}
          <div className="px-4 py-4 space-y-4 border-t bg-muted/10">

            {/* Running total */}
            <div className={cn(
              'flex items-center justify-between rounded-xl px-4 py-3',
              allPriced ? 'bg-primary/5 border border-primary/10' : 'bg-amber-50 border border-amber-100',
            )}>
              <div className="flex items-center gap-2">
                <IndianRupee className="size-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
              </div>
              {allPriced ? (
                <span className="font-display text-2xl font-bold tabular-nums text-foreground">
                  {formatCurrency(cartTotal)}
                </span>
              ) : (
                <span className="text-xs text-amber-600 font-medium">
                  ⚠ Enter prices above for total
                </span>
              )}
            </div>

            {/* Payment — part payment */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Payment Method
                </p>
                {splits.length > 1 && (
                  <span className="flex items-center gap-1 text-[10px] text-primary font-semibold">
                    <GitBranch className="size-3" /> Split payment
                  </span>
                )}
              </div>

              {/* Method toggle buttons */}
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_OPTIONS.map((m) => {
                  const active = selectedMethods.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => toggleMethod(m.key)}
                      className={cn(
                        'py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
                        active
                          ? 'cafe-gradient text-primary-foreground border-transparent shadow-md'
                          : 'bg-card border-border text-foreground hover:bg-muted/50',
                      )}
                    >
                      {m.icon}{m.label}
                    </button>
                  );
                })}
              </div>

              {/* Amount inputs for each selected method */}
              {splits.length > 0 && (
                <div className="space-y-2 pt-1">
                  {splits.map((s) => {
                    const opt = PAYMENT_OPTIONS.find((o) => o.key === s.method)!;
                    return (
                      <div key={s.method} className="flex items-center gap-3 bg-muted/30 rounded-xl px-3 py-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground w-14 shrink-0">
                          {opt.icon}{opt.label}
                        </span>
                        <span className="text-xs text-muted-foreground">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={s.amount}
                          onChange={(e) => updateSplitAmount(s.method, e.target.value)}
                          placeholder="0"
                          className="flex-1 h-8 px-2 rounded-lg border bg-background text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    );
                  })}

                  {/* Balance row */}
                  {allPriced && splits.length > 1 && (
                    <div className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold',
                      splitsMatch
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100',
                    )}>
                      <span>{splitsMatch ? '✓ Amounts match' : splitsPending > 0 ? 'Remaining' : 'Over by'}</span>
                      {!splitsMatch && (
                        <span className="font-bold tabular-nums">
                          {formatCurrency(Math.abs(splitsPending))}
                        </span>
                      )}
                      {splitsMatch && <span>✓</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl">
                {error}
              </p>
            )}

            <button
              onClick={handleCheckout}
              disabled={submitting || splits.length === 0 || (allPriced && !splitsMatch)}
              className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition shadow-md"
            >
              {submitting
                ? <><Loader2 className="size-4 animate-spin" /> Processing…</>
                : <><Receipt className="size-4" /> Complete Sale</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Empty cart hint ── */}
      {cart.length === 0 && availableItems.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 rounded-xl text-xs text-muted-foreground border border-dashed">
          <ShoppingCart className="size-3.5 shrink-0" />
          Tap any item above to add it to the cart
          <ChevronRight className="size-3.5 ml-auto shrink-0" />
        </div>
      )}
    </div>
  );
}
