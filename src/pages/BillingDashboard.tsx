import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import {
  Inbox, Wifi, Plus, Minus, Search, X,
  ShoppingBag, MapPin, User as UserIcon, StickyNote,
  ChevronDown, AlertCircle, Trash2, Receipt,
  QrCode, UserCheck, IndianRupee, Clock, CheckCircle2,
  CreditCard, Banknote, Smartphone, Wallet,
} from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import type { OrderStatus, OrderType, PaymentType, Order } from '@/types';
import { TABLE_NUMBERS } from '@/constants/config';

const STATUS_TABS: { key: OrderStatus | 'all'; label: string; dotColor: string }[] = [
  { key: 'all',        label: 'All',        dotColor: 'bg-foreground' },
  { key: 'pending',    label: 'New',        dotColor: 'bg-amber-500' },
  { key: 'preparing',  label: 'Preparing',  dotColor: 'bg-blue-500' },
  { key: 'ready',      label: 'Ready',      dotColor: 'bg-emerald-500' },
  { key: 'served',     label: 'Served',     dotColor: 'bg-gray-400' },
  { key: 'cancelled',  label: 'Cancelled',  dotColor: 'bg-red-500' },
];

const QUICK_NOTES = [
  'Less spicy', 'Extra spicy', 'No onion', 'No garlic',
  'Less oil', 'Extra chutney', 'Pack separately', 'Allergy – check ingredients',
];

type SourceFilter = 'all' | 'staff' | 'qr';

// ── Advance Order Card ────────────────────────────────────────────────────────
function AdvanceOrderCard({ order }: { order: Order }) {
  const { collectBalance, setAdvancePayment } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [showCollect, setShowCollect] = useState(false);
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const billedBy = currentUser?.displayName || currentUser?.username || '';
  const advance = order.advanceAmount || 0;
  const balance = order.balanceDue ?? (order.total - advance);

  const handleCollect = async () => {
    if (!collectMethod) return;
    setCollecting(true);
    await collectBalance(order.id, collectMethod, billedBy);
    setCollecting(false);
    setShowCollect(false);
  };

  const PAYMENT_ICONS: Record<string, React.ReactNode> = {
    cash: <Banknote className="size-4" />,
    upi: <Smartphone className="size-4" />,
    card: <CreditCard className="size-4" />,
  };

  return (
    <div className="bg-card rounded-2xl border-2 border-amber-400 overflow-hidden shadow-md shadow-amber-50">
      {/* Header */}
      <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl font-bold text-foreground">
            #{String(order.orderNumber).padStart(3, '0')}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300">
              ⏳ Advance Paid
            </span>
            <span className="text-[10px] font-body text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />{formatTime(order.createdAt)}
            </span>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="size-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
          {expanded ? <ChevronDown className="size-4 rotate-180" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Meta row */}
      <div className="px-4 py-2 flex flex-wrap gap-2 text-xs font-body border-b border-border/50">
        {order.orderType === 'dine_in' && order.tableNumber && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full font-semibold">
            <MapPin className="size-3" />Table {order.tableNumber}
          </span>
        )}
        {order.orderType === 'takeaway' && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent-foreground rounded-full font-semibold">📦 Takeaway</span>
        )}
        {order.customerName && (
          <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="size-3" />{order.customerName}</span>
        )}
        {order.orderSource === 'qr'
          ? <span className="flex items-center gap-1 text-muted-foreground"><QrCode className="size-3" />QR Order</span>
          : <span className="flex items-center gap-1 text-muted-foreground"><UserCheck className="size-3" />Staff</span>}
      </div>

      {/* Items (collapsible) */}
      {expanded && (
        <div className="px-4 py-3 space-y-1 border-b border-border/50">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide mb-2">Items</p>
          {order.items.map(ci => (
            <div key={ci.menuItem.id} className="flex items-center justify-between text-sm">
              <span className="font-body text-foreground">{ci.quantity}× {ci.menuItem.name}</span>
              <span className="font-body font-bold text-primary tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
            </div>
          ))}
          {order.notes && (
            <p className="mt-2 text-xs font-body bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">⚠️ {order.notes}</p>
          )}
        </div>
      )}

      {/* Payment summary */}
      <div className="px-4 py-3 space-y-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground">Total Bill</span>
          <span className="text-sm font-body font-bold tabular-nums">{formatCurrency(order.total)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-body text-muted-foreground">Discount</span>
            <span className="text-sm font-body font-bold text-emerald-600 tabular-nums">−{formatCurrency(order.discount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground flex items-center gap-1">
            <Wallet className="size-3" />Advance Paid
            {order.advancePaidBy && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold ml-1 uppercase">{order.advancePaidBy}</span>}
          </span>
          <span className="text-sm font-body font-bold text-amber-600 tabular-nums">−{formatCurrency(advance)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-sm font-body font-bold text-foreground">Balance Due</span>
          <span className="text-lg font-display font-bold text-red-600 tabular-nums">{formatCurrency(balance)}</span>
        </div>
      </div>

      {/* Collect balance action */}
      {!showCollect ? (
        <div className="px-4 py-3">
          <button
            onClick={() => setShowCollect(true)}
            className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 16px rgba(200,75,10,0.3)' }}
          >
            <IndianRupee className="size-4" />Collect Balance {formatCurrency(balance)}
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-body font-bold text-foreground">Select payment method for balance:</p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'upi', 'card'] as const).map(method => (
              <button
                key={method}
                onClick={() => setCollectMethod(method)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-body font-bold transition-all active:scale-95',
                  collectMethod === method
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {PAYMENT_ICONS[method]}
                {method.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCollect(false); setCollectMethod(null); }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body font-semibold text-foreground active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleCollect}
              disabled={!collectMethod || collecting}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-body font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" />
              {collecting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Advance Payment Modal (used inside OrderCard area for ready orders) ────────
export function AdvancePaymentPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  const { setAdvancePayment } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [advanceAmt, setAdvanceAmt] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const billedBy = currentUser?.displayName || currentUser?.username || '';

  const handleSave = async () => {
    const amt = parseFloat(advanceAmt);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid advance amount'); return; }
    if (amt >= order.total) { setError('Advance must be less than total. Use full payment instead.'); return; }
    if (!method) { setError('Select payment method'); return; }
    setSaving(true);
    await setAdvancePayment(order.id, amt, method, billedBy);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold">Collect Advance</h2>
            <p className="text-xs font-body text-muted-foreground">Order #{String(order.orderNumber).padStart(3, '0')} · Total {formatCurrency(order.total)}</p>
          </div>
          <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center"><X className="size-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-body font-bold text-foreground mb-1.5 block">Advance Amount (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="number"
                value={advanceAmt}
                onChange={e => { setAdvanceAmt(e.target.value); setError(''); }}
                placeholder="Enter advance amount"
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-border bg-card text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && parseFloat(advanceAmt) < order.total && (
              <p className="text-xs font-body text-muted-foreground mt-1">
                Balance due: <span className="font-bold text-red-600">{formatCurrency(order.total - parseFloat(advanceAmt))}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-body font-bold text-foreground mb-1.5 block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'upi', 'card'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-body font-bold transition-all active:scale-95',
                    method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
                  {m === 'cash' ? <Banknote className="size-4" /> : m === 'upi' ? <Smartphone className="size-4" /> : <CreditCard className="size-4" />}
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs font-body text-destructive flex items-center gap-1"><AlertCircle className="size-3" />{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white' }}>
            <Wallet className="size-4" />
            {saving ? 'Saving...' : 'Record Advance Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline billing cart ────────────────────────────────────────────────────────
function NewBillPanel() {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, clearCart, getCartTotal, getCartCount, submitOrder } = useOrderStore();
  const { currentUser } = useAuthStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [showTableSelect, setShowTableSelect] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);

  const filteredItems = useMemo(() => {
    let filtered = enabledItems;
    if (selectedCategory !== 'all') filtered = filtered.filter(i => i.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i => i.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [enabledItems, selectedCategory, search]);

  const total = getCartTotal();
  const cartCount = getCartCount();

  const getQty = (id: string) => {
    const ci = cart.find(c => c.menuItem.id === id);
    return ci ? ci.quantity : 0;
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (!currentUser) return;
    if (orderType === 'dine_in' && !tableNumber) { setTableError(true); return; }
    setTableError(false);
    setSubmitting(true);
    await submitOrder({
      tableNumber: orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined,
      orderType,
      notes: notes || undefined,
      customerName: customerName || undefined,
      createdBy: currentUser.username,
      orderSource: 'staff',
    });
    setSubmitting(false);
    setShowSuccess(true);
    setNotes(''); setCustomerName(''); setTableNumber(null);
    setTimeout(() => setShowSuccess(false), 2200);
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Receipt className="size-10 text-emerald-600" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">Bill Created!</h2>
        <p className="text-muted-foreground font-body mt-1 text-sm">Order has been added to the queue.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 md:px-4 md:pt-4 md:pb-6 min-h-[calc(100vh-112px)]">
      {/* LEFT: Menu browser */}
      <div className="flex-1 min-w-0">
        <div className="px-4 md:px-0 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="text" placeholder="Search menu items..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>
            )}
          </div>
        </div>
        <div className="border-b border-border">
          <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
        </div>
        <div className="px-4 md:px-0 py-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-muted-foreground">No items found</p>
              <button onClick={() => { setSearch(''); setSelectedCategory('all'); }} className="mt-2 text-sm font-body text-primary font-semibold">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
              {filteredItems.map(item => (
                <MenuItemCard key={item.id} item={item} quantity={getQty(item.id)} onAdd={() => addToCart(item)} onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Bill summary */}
      <div className="w-full md:w-80 lg:w-96 shrink-0">
        <div className="md:sticky md:top-[112px] bg-background md:bg-card md:border md:border-border md:rounded-2xl md:shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-t md:border-t-0 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary" />
              <h3 className="font-display font-bold text-base text-foreground">New Bill</h3>
              {cartCount > 0 && (
                <span className="text-xs font-body font-bold px-1.5 py-0.5 rounded-full cafe-gradient text-primary-foreground">{cartCount}</span>
              )}
            </div>
            {cartCount > 0 && (
              <button onClick={clearCart} className="text-xs font-body font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95">Clear</button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto px-4 py-2 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingBag className="size-8 mb-2 opacity-30" />
                <p className="text-sm font-body">Add items from the menu</p>
              </div>
            ) : cart.map(ci => (
              <div key={ci.menuItem.id} className="flex items-center gap-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body font-semibold truncate">{ci.menuItem.name}</p>
                  <p className="text-xs text-primary font-bold tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-6 rounded-md bg-muted flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.quantity}</span>
                  <button onClick={() => addToCart(ci.menuItem)} className="size-6 rounded-md cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90"><Plus className="size-3" /></button>
                  <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="size-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3" /></button>
                </div>
              </div>
            ))}
          </div>

          {cartCount > 0 && (
            <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/30">
              <div className="flex gap-2">
                <button onClick={() => { setOrderType('dine_in'); setTableError(false); }}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all', orderType === 'dine_in' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
                  🍽️ Dine In
                </button>
                <button onClick={() => { setOrderType('takeaway'); setTableError(false); }}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all', orderType === 'takeaway' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
                  📦 Takeaway
                </button>
              </div>

              {orderType === 'dine_in' ? (
                <div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <button onClick={() => setShowTableSelect(!showTableSelect)}
                      className={cn('w-full pl-8 pr-8 py-2 bg-card border rounded-lg text-left text-xs font-body', tableError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border')}>
                      {tableNumber ? `Table ${tableNumber}` : 'Select Table *'}
                    </button>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    {showTableSelect && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2 grid grid-cols-5 gap-1 max-h-36 overflow-y-auto">
                        {TABLE_NUMBERS.map(num => (
                          <button key={num} onClick={() => { setTableNumber(num); setShowTableSelect(false); setTableError(false); }}
                            className={cn('py-1.5 rounded-md text-xs font-body font-medium', tableNumber === num ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted')}>{num}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {tableError && (
                    <div className="flex items-center gap-1 mt-1 text-destructive">
                      <AlertCircle className="size-3" /><span className="text-[11px] font-body">Table number required for Dine In</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-xs font-body placeholder:text-muted-foreground" />
                </div>
              )}

              <div>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <textarea placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-xs font-body placeholder:text-muted-foreground resize-none" />
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {QUICK_NOTES.map(n => (
                    <button key={n} type="button" onClick={() => setNotes(prev => prev ? `${prev}, ${n}` : n)}
                      className="px-2 py-0.5 rounded text-[10px] font-body font-semibold bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all">
                      + {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-xs text-muted-foreground">Total</span>
                  <span className="font-display text-xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
                </div>
                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-3 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-sm active:scale-[0.98] transition-transform shadow-md disabled:opacity-60">
                  {submitting ? 'Creating...' : '🧾 Create Bill'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main BillingDashboard ─────────────────────────────────────────────────────
export default function BillingDashboard() {
  const { orders, startPolling, stopPolling, polling } = useOrderStore();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all' | 'new_bill' | 'advance' | 'paid'>('pending');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  // Advance orders: paymentType === 'advance' and not yet fully paid (not served)
  const advanceOrders = useMemo(() =>
    todayOrders.filter(o => o.paymentType === 'advance' && o.status !== 'served' && o.status !== 'cancelled'),
    [todayOrders]
  );

  // Paid orders: advance orders that are now fully paid (served + fullyPaidAt set)
  const paidAdvanceOrders = useMemo(() =>
    todayOrders.filter(o => o.paymentType === 'advance' && o.status === 'served' && o.fullyPaidAt),
    [todayOrders]
  );

  const filtered = useMemo(() => {
    if (activeTab === 'new_bill' || activeTab === 'advance' || activeTab === 'paid') return [];
    let result = todayOrders.filter(o => !(o.paymentType === 'advance' && o.status !== 'served'));
    if (activeTab !== 'all') result = result.filter(o => o.status === activeTab);
    if (sourceFilter !== 'all') result = result.filter(o => o.orderSource === sourceFilter);
    return result;
  }, [todayOrders, activeTab, sourceFilter]);

  const qrCount = todayOrders.filter(o => o.orderSource === 'qr').length;
  const staffCount = todayOrders.filter(o => o.orderSource === 'staff').length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Sync indicator */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
          <span className="text-[10px] font-body text-muted-foreground">
            {polling ? 'Live syncing every 3s' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSourceFilter('all')}
            className={cn('px-2 py-1 rounded-md text-[10px] font-body font-bold transition-all',
              sourceFilter === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
            All ({todayOrders.length})
          </button>
          <button onClick={() => setSourceFilter('staff')}
            className={cn('px-2 py-1 rounded-md text-[10px] font-body font-bold transition-all flex items-center gap-0.5',
              sourceFilter === 'staff' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground')}>
            <UserCheck className="size-2.5" />Staff ({staffCount})
          </button>
          <button onClick={() => setSourceFilter('qr')}
            className={cn('px-2 py-1 rounded-md text-[10px] font-body font-bold transition-all flex items-center gap-0.5',
              sourceFilter === 'qr' ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground')}>
            <QrCode className="size-2.5" />QR ({qrCount})
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-2">
          {/* New Bill */}
          <button
            onClick={() => setActiveTab('new_bill')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
              activeTab === 'new_bill'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700 active:scale-95'
            )}
          >
            <Plus className="size-3.5" />New Bill
          </button>

          {/* Advance tab */}
          <button
            onClick={() => setActiveTab('advance')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
              activeTab === 'advance'
                ? 'bg-amber-500 text-white shadow-md'
                : 'bg-amber-50 border border-amber-200 text-amber-700 active:scale-95'
            )}
          >
            <Wallet className="size-3.5" />Advance
            {advanceOrders.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                activeTab === 'advance' ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-800')}>
                {advanceOrders.length}
              </span>
            )}
          </button>

          {/* Paid tab */}
          <button
            onClick={() => setActiveTab('paid')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
              activeTab === 'paid'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700 active:scale-95'
            )}
          >
            <CheckCircle2 className="size-3.5" />Paid
            {paidAdvanceOrders.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                activeTab === 'paid' ? 'bg-white/25 text-white' : 'bg-emerald-200 text-emerald-800')}>
                {paidAdvanceOrders.length}
              </span>
            )}
          </button>

          {/* Status tabs */}
          {STATUS_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? (sourceFilter === 'all' ? todayOrders.length : todayOrders.filter(o => o.orderSource === sourceFilter).length)
              : (sourceFilter === 'all'
                  ? todayOrders.filter(o => o.status === tab.key).length
                  : todayOrders.filter(o => o.status === tab.key && o.orderSource === sourceFilter).length);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
                  isActive
                    ? 'cafe-gradient text-primary-foreground shadow-md'
                    : 'bg-card border border-border text-foreground active:scale-95'
                )}
              >
                <span className={cn('size-2 rounded-full', isActive ? 'bg-primary-foreground' : tab.dotColor)} />
                {tab.label}
                {count > 0 && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', isActive ? 'bg-white/20' : 'bg-muted')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'new_bill' ? (
        <NewBillPanel />
      ) : activeTab === 'advance' ? (
        <div className="px-4 py-4 space-y-3">
          {advanceOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Wallet className="size-16 mb-4 opacity-30" />
              <p className="font-body font-semibold text-lg">No advance orders</p>
              <p className="text-sm font-body mt-1">Advance payments will appear here</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Wallet className="size-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-body font-bold text-amber-800">{advanceOrders.length} order{advanceOrders.length !== 1 ? 's' : ''} with advance payment</p>
                  <p className="text-[10px] font-body text-amber-600">
                    Total balance pending: {formatCurrency(advanceOrders.reduce((s, o) => s + (o.balanceDue ?? 0), 0))}
                  </p>
                </div>
              </div>
              {advanceOrders.map(order => <AdvanceOrderCard key={order.id} order={order} />)}
            </>
          )}
        </div>
      ) : activeTab === 'paid' ? (
        <div className="px-4 py-4 space-y-3">
          {paidAdvanceOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CheckCircle2 className="size-16 mb-4 opacity-30" />
              <p className="font-body font-semibold text-lg">No fully paid advance orders</p>
              <p className="text-sm font-body mt-1">Orders paid in full will appear here</p>
            </div>
          ) : (
            <>
              {/* Summary banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-xs font-body font-bold text-emerald-800">{paidAdvanceOrders.length} advance order{paidAdvanceOrders.length !== 1 ? 's' : ''} fully paid today</p>
                  <p className="text-[10px] font-body text-emerald-600">
                    Total collected: {formatCurrency(paidAdvanceOrders.reduce((s, o) => s + o.total, 0))}
                  </p>
                </div>
              </div>

              {/* Paid order cards */}
              {paidAdvanceOrders.map(order => {
                const advance = order.advanceAmount || 0;
                const balance = order.total - advance;
                const pmtLabel = (m?: string) => m === 'cash' ? '💵 Cash' : m === 'upi' ? '📱 UPI' : m === 'card' ? '💳 Card' : m || '—';
                return (
                  <div key={order.id} className="bg-card rounded-2xl border-2 border-emerald-400 overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="bg-emerald-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-2xl font-bold text-foreground">
                          #{String(order.orderNumber).padStart(3, '0')}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="size-3" />Fully Paid
                          </span>
                          <span className="text-[10px] font-body text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {order.fullyPaidAt ? formatTime(order.fullyPaidAt) : formatTime(order.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-xl font-bold text-emerald-700 tabular-nums">{formatCurrency(order.total)}</p>
                        <p className="text-[10px] font-body text-muted-foreground">Total Bill</p>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="px-4 py-2 flex flex-wrap gap-2 text-xs font-body border-b border-border/50">
                      {order.orderType === 'dine_in' && order.tableNumber && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full font-semibold">
                          <MapPin className="size-3" />Table {order.tableNumber}
                        </span>
                      )}
                      {order.orderType === 'takeaway' && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent-foreground rounded-full font-semibold">📦 Takeaway</span>
                      )}
                      {order.customerName && (
                        <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="size-3" />{order.customerName}</span>
                      )}
                      {order.orderSource === 'qr'
                        ? <span className="flex items-center gap-1 text-muted-foreground"><QrCode className="size-3" />QR Order</span>
                        : <span className="flex items-center gap-1 text-muted-foreground"><UserCheck className="size-3" />Staff</span>}
                    </div>

                    {/* Items */}
                    <div className="px-4 py-3 space-y-1 border-b border-border/50">
                      <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide mb-2">Items Ordered</p>
                      {order.items.map(ci => (
                        <div key={ci.menuItem.id} className="flex items-center justify-between text-sm">
                          <span className="font-body text-foreground">{ci.quantity}× {ci.menuItem.name}</span>
                          <span className="font-body font-bold text-primary tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
                        </div>
                      ))}
                      {order.notes && (
                        <p className="mt-2 text-xs font-body bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">⚠️ {order.notes}</p>
                      )}
                    </div>

                    {/* Full payment breakdown */}
                    <div className="px-4 py-3 space-y-2 bg-muted/20">
                      <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide">Payment Breakdown</p>

                      {order.discount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-body text-muted-foreground">Subtotal</span>
                          <span className="text-sm font-body tabular-nums">{formatCurrency(order.subtotal)}</span>
                        </div>
                      )}
                      {order.discount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-body text-emerald-600">Discount ({order.discountType === 'percentage' ? `${order.discountValue}%` : 'flat'})</span>
                          <span className="text-sm font-body font-bold text-emerald-600 tabular-nums">−{formatCurrency(order.discount)}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-body font-bold text-foreground">Total Bill</span>
                        <span className="text-sm font-body font-bold tabular-nums">{formatCurrency(order.total)}</span>
                      </div>

                      <div className="border-t border-border/60 pt-2 space-y-1.5">
                        {/* Advance row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-body text-amber-700 font-semibold">Advance Paid</span>
                            {order.advancePaidBy && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase">{order.advancePaidBy}</span>
                            )}
                          </div>
                          <span className="text-sm font-body font-bold text-amber-600 tabular-nums">−{formatCurrency(advance)}</span>
                        </div>

                        {/* Balance row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-body text-blue-700 font-semibold">Balance Paid</span>
                            {order.balancePaymentType && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold uppercase">{order.balancePaymentType}</span>
                            )}
                          </div>
                          <span className="text-sm font-body font-bold text-blue-600 tabular-nums">−{formatCurrency(balance)}</span>
                        </div>

                        {/* Net paid */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-border">
                          <span className="text-sm font-body font-bold text-foreground">Total Collected</span>
                          <span className="text-lg font-display font-bold text-emerald-700 tabular-nums">{formatCurrency(order.total)}</span>
                        </div>
                      </div>

                      {/* Staff info */}
                      <div className="flex gap-4 pt-1 text-[10px] font-body text-muted-foreground">
                        {order.createdBy && <span>🧾 Created by {order.createdBy}</span>}
                        {order.balancePaidBy && <span>✅ Closed by {order.balancePaidBy}</span>}
                      </div>
                    </div>

                    {/* Advance method summary pill */}
                    <div className="px-4 py-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Wallet className="size-3" />Advance: {pmtLabel(order.advancePaidBy)} · {formatCurrency(advance)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        <IndianRupee className="size-3" />Balance: {pmtLabel(order.balancePaymentType)} · {formatCurrency(balance)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Inbox className="size-16 mb-4 opacity-30" />
              <p className="font-body font-semibold text-lg">No orders here</p>
              <p className="text-sm font-body mt-1">
                {activeTab === 'pending' ? 'Waiting for new orders from staff or QR...' : `No ${activeTab === 'all' ? '' : activeTab} orders right now`}
              </p>
            </div>
          ) : (
            filtered.map(order => <OrderCard key={order.id} order={order} showActions />)
          )}
        </div>
      )}
    </div>
  );
}
