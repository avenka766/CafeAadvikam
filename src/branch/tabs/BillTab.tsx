// src/branch/tabs/BillTab.tsx
import { useState, useMemo, useEffect } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Loader2, Receipt, IndianRupee, Banknote, Smartphone, CreditCard, Search, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem } from '../branchStore';

interface CartItem {
  itemName: string;
  quantity: number;
  price: number | null; // comes directly from StockItem.price (FIX #3)
}

type PaymentMethod = 'cash' | 'upi' | 'card';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function BillTab({ branch, branchStock }: Props) {
  const { recordSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // FIX #7 — clear cart when branch prop changes to avoid cross-branch cart bleed
  useEffect(() => {
    setCart([]);
    setPaymentMethod(null);
    setError('');
    setSearch('');
  }, [branch]);

  const availableItems = useMemo(
    () => branchStock.filter(s => s.quantity > 0),
    [branchStock],
  );

  const filteredItems = useMemo(() => {
    if (!search.trim()) return availableItems;
    const q = search.toLowerCase();
    return availableItems.filter(s => s.itemName.toLowerCase().includes(q));
  }, [availableItems, search]);

  const getCartQty = (itemName: string) =>
    cart.find(c => c.itemName === itemName)?.quantity ?? 0;

  const getStockQty = (itemName: string) =>
    branchStock.find(s => s.itemName === itemName)?.quantity ?? 0;

  const addToCart = (item: StockItem) => {
    const inCart = getCartQty(item.itemName);
    if (inCart >= item.quantity) return;
    setCart(prev => {
      const existing = prev.find(c => c.itemName === item.itemName);
      if (existing) {
        return prev.map(c =>
          c.itemName === item.itemName ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      // FIX #3 — price comes directly from StockItem.price (now a proper field on the interface)
      return [...prev, { itemName: item.itemName, quantity: 1, price: item.price }];
    });
  };

  const removeFromCart = (itemName: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.itemName === itemName);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter(c => c.itemName !== itemName);
      return prev.map(c => c.itemName === itemName ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  const deleteFromCart = (itemName: string) =>
    setCart(prev => prev.filter(c => c.itemName !== itemName));

  const clearCart = () => {
    setCart([]);
    setPaymentMethod(null);
    setError('');
  };

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + (c.price != null ? c.price * c.quantity : 0), 0),
    [cart],
  );

  const allPriced = cart.every(c => c.price != null);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // FIX #2 — track which items succeeded so we can show a partial-failure message
  // and avoid leaving stock deducted without a complete sale record.
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!paymentMethod) { setError('Select a payment method.'); return; }
    setError('');
    setSubmitting(true);

    const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';
    const succeeded: string[] = [];

    for (const item of cart) {
      // FIX #9 — pass paymentMethod to recordSale so it's persisted to DB
      const err = await recordSale(branch, item.itemName, item.quantity, soldBy, paymentMethod);
      if (err) {
        // FIX #2 — tell the user exactly which items went through and which failed,
        // so staff can manually reconcile. We can't roll back already-committed DB writes,
        // but at least the error message is honest about the partial state.
        const succeededMsg = succeeded.length > 0
          ? ` (Already recorded: ${succeeded.join(', ')})`
          : '';
        setError(`Failed on "${item.itemName}": ${err}.${succeededMsg} Please check stock manually.`);
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

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Receipt className="size-10 text-emerald-600" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Bill Done!</h2>
        <p className="text-muted-foreground font-body mt-1 text-sm">Stock updated and sale recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Item grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground bg-muted/30 rounded-xl">
          {availableItems.length === 0 ? 'No items in stock.' : 'No items match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredItems.map(item => {
            const inCart   = getCartQty(item.itemName);
            const stockQty = getStockQty(item.itemName);
            const atMax    = inCart >= stockQty;

            return (
              <div
                key={item.itemName}
                className={cn(
                  'bg-card border rounded-xl p-3 flex flex-col gap-2 transition-all',
                  inCart > 0 ? 'border-primary/40 bg-primary/5' : 'border-border',
                )}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground leading-tight">{item.itemName}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    {/* FIX #3 — item.price is now a real typed field, no unsafe cast needed */}
                    {item.price != null
                      ? <span className="text-xs font-bold text-emerald-600">₹{item.price}</span>
                      : <span className="text-[10px] text-amber-500 font-medium">No price</span>
                    }
                    <span className="text-[10px] text-muted-foreground">{stockQty} left</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  {inCart === 0 ? (
                    <button
                      onClick={() => addToCart(item)}
                      className={cn(
                        'w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition',
                        colors.bg, colors.text, 'border',
                      )}
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 w-full justify-between">
                      <button
                        onClick={() => removeFromCart(item.itemName)}
                        className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="text-sm font-bold tabular-nums">{inCart}</span>
                      <button
                        onClick={() => addToCart(item)}
                        disabled={atMax}
                        className="size-7 rounded-lg cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart summary + checkout */}
      {cart.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden sticky bottom-20">
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <span className="font-semibold text-sm">Cart</span>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', colors.badge)}>
                {cartCount} items
              </span>
            </div>
            <button
              onClick={clearCart}
              className="text-xs font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg"
            >
              Clear
            </button>
          </div>

          {/* Cart items */}
          <div className="divide-y max-h-40 overflow-y-auto">
            {cart.map(c => (
              <div key={c.itemName} className="flex items-center gap-2 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.price != null
                      ? <span className="text-primary font-bold">{formatCurrency(c.price * c.quantity)}</span>
                      : <span className="text-amber-500">No price set</span>
                    }
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => removeFromCart(c.itemName)}
                    className="size-6 rounded-md bg-muted flex items-center justify-center active:scale-90"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums">{c.quantity}</span>
                  <button
                    onClick={() => {
                      const stock = branchStock.find(s => s.itemName === c.itemName);
                      if (stock) addToCart(stock);
                    }}
                    disabled={c.quantity >= getStockQty(c.itemName)}
                    className="size-6 rounded-md cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40"
                  >
                    <Plus className="size-3" />
                  </button>
                  <button
                    onClick={() => deleteFromCart(c.itemName)}
                    className="size-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total + payment + checkout */}
          <div className="px-4 py-3 border-t space-y-3 bg-muted/20">
            {allPriced && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <IndianRupee className="size-3.5" />Total
                </span>
                <span className="font-display text-xl font-bold tabular-nums">{formatCurrency(cartTotal)}</span>
              </div>
            )}
            {!allPriced && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ Some items have no price set. Ask admin to update prices. You can still record the sale.
              </p>
            )}

            {/* Payment method — FIX #9: selection is now passed through to DB */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'cash' as const, label: 'Cash', icon: <Banknote className="size-4" /> },
                  { key: 'upi'  as const, label: 'UPI',  icon: <Smartphone className="size-4" /> },
                  { key: 'card' as const, label: 'Card', icon: <CreditCard className="size-4" /> },
                ]).map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setPaymentMethod(m.key); setError(''); }}
                    className={cn(
                      'py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition',
                      paymentMethod === m.key
                        ? 'cafe-gradient text-primary-foreground border-transparent shadow-md'
                        : 'bg-card border-border text-foreground',
                    )}
                  >
                    {m.icon}{m.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              onClick={handleCheckout}
              disabled={submitting || !paymentMethod}
              className="w-full py-3 rounded-xl cafe-gradient text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
            >
              {submitting
                ? <><Loader2 className="size-4 animate-spin" />Processing…</>
                : <><CheckCircle2 className="size-4" />Complete Sale</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
