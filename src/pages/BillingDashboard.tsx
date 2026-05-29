import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useShallow } from 'zustand/react/shallow'; // STORE-01 FIX: granular selectors
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import {
  Inbox, Wifi, Plus, Minus, Search, X,
  ShoppingBag, MapPin, User as UserIcon, StickyNote,
  ChevronDown, AlertCircle, Trash2, Receipt,
  QrCode, UserCheck, IndianRupee, Clock, CheckCircle2,
  CreditCard, Banknote, Smartphone, Wallet,
  Edit3, UtensilsCrossed, Printer,
} from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import type { OrderStatus, OrderType, PaymentType, Order } from '@/types';
import { TABLE_NUMBERS, MENU_CATEGORIES } from '@/constants/config';
import EmptyState from '@/components/ui/EmptyState';

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
  // STORE-01 FIX: select only actions — stable refs, avoids re-renders from orders/cart changes
  const { collectBalance, setAdvancePayment } = useOrderStore(
    useShallow(s => ({ collectBalance: s.collectBalance, setAdvancePayment: s.setAdvancePayment }))
  );
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
    try {
      await collectBalance(order.id, collectMethod, billedBy);
      setShowCollect(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to collect payment. Please try again.';
      alert(msg);
    } finally {
      setCollecting(false);
    }
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

      {/* Meta row — advance tab: customer name only, no order type */}
      {order.customerName && (
        <div className="px-4 py-2 flex flex-wrap gap-2 text-xs font-body border-b border-border/50">
          <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="size-3" />{order.customerName}</span>
        </div>
      )}

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
  const setAdvancePayment = useOrderStore(s => s.setAdvancePayment);
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
    try {
      await setAdvancePayment(order.id, amt, method, billedBy);
      onClose();
    } catch {
      setError('Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
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
          <button onClick={onClose} aria-label="Close" className="size-9 rounded-full bg-muted flex items-center justify-center"><X className="size-5 text-muted-foreground" /></button>
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

// ── Advance New Order Panel (menu + cart that submits as advance) ─────────────
// ── Custom item type (for non-menu items) ─────────────────────────────────────
interface CustomLineItem { id: string; name: string; price: number; qty: number; }

function AdvanceOrderPanel({ onCreated, advanceOrders }: { onCreated: () => void; advanceOrders: Order[] }) {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, clearCart, getCartTotal, getCartCount, submitAdvanceOrder } = useOrderStore(
    useShallow(s => ({
      cart: s.cart,
      addToCart: s.addToCart,
      updateCartQuantity: s.updateCartQuantity,
      clearCart: s.clearCart,
      getCartTotal: s.getCartTotal,
      getCartCount: s.getCartCount,
      submitAdvanceOrder: s.submitAdvanceOrder,
    }))
  );
  const { currentUser } = useAuthStore();

  // Menu picker state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');

  // Custom items state
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customError, setCustomError] = useState('');

  // Order meta
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes]               = useState('');
  const [advanceAmt, setAdvanceAmt]     = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [advanceError, setAdvanceError] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [itemMode, setItemMode]         = useState<'menu' | 'custom'>('menu');

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);
  const filteredItems = useMemo(() => {
    let f = enabledItems;
    // When searching: search ALL items regardless of selected category
    if (search.trim()) return f.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    // When browsing: filter by selected category
    if (selectedCategory !== 'all') f = f.filter(i => i.category === selectedCategory);
    return f;
  }, [enabledItems, selectedCategory, search]);

  // Total = menu cart + custom items
  const menuTotal   = getCartTotal();
  const customTotal = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const total       = menuTotal + customTotal;
  const cartCount   = getCartCount();
  const getQty = (id: string) => cart.find(c => c.menuItem.id === id)?.quantity || 0;

  // ── Add custom item ──────────────────────────────────────────────────────────
  const handleAddCustomItem = () => {
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomError('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomError('Enter a valid price'); return; }
    setCustomError('');
    setCustomItems(prev => {
      const existing = prev.find(c => c.name.toLowerCase() === n.toLowerCase());
      if (existing) return prev.map(c => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `custom-${Date.now()}-${Math.random()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };

  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems(prev => prev.filter(c => c.id !== id));
    else setCustomItems(prev => prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const allEmpty = cartCount === 0 && customItems.length === 0;

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (allEmpty) return;
    if (!currentUser) return;
    const amt = parseFloat(advanceAmt);
    if (isNaN(amt) || amt <= 0) { setAdvanceError('Enter advance amount'); return; }
    if (amt >= total) { setAdvanceError('Advance must be less than total'); return; }
    if (!advanceMethod) { setAdvanceError('Select payment method'); return; }
    setAdvanceError('');
    setSubmitting(true);

    // Inject custom items into the cart as synthetic menu items
    for (const ci of customItems) {
      const syntheticItem = {
        id: ci.id,
        name: ci.name,
        price: ci.price,
        category: 'custom',
        timing: 'all',
        enabled: true,
      };
      for (let i = 0; i < ci.qty; i++) addToCart(syntheticItem);
    }

    // Small delay to let Zustand batch the addToCart calls
    await new Promise(r => setTimeout(r, 50));

    try {
      await submitAdvanceOrder({
        orderType: 'takeaway',
        notes: notes || undefined,
        customerName: customerName || undefined,
        createdBy: currentUser.username,
        advanceAmount: amt,
        advancePaidBy: advanceMethod,
      });
      setShowSuccess(true);
      setNotes(''); setCustomerName(''); setAdvanceAmt(''); setAdvanceMethod(null);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setTimeout(() => { setShowSuccess(false); onCreated(); }, 1800);
    } catch {
      setAdvanceError('Failed to submit order — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
        <div className="size-20 rounded-3xl flex items-center justify-center animate-scale-in"
          style={{ background: 'linear-gradient(135deg,rgba(217,119,6,0.15),rgba(217,119,6,0.08))', border: '2px solid rgba(217,119,6,0.25)' }}>
          <Wallet className="size-10 text-amber-600" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Advance Recorded!</h2>
          <p className="text-muted-foreground font-body mt-1 text-sm">Order saved. Balance pending collection.</p>
        </div>
      </div>
    );
  }

  const PAYMENT_ICONS = { cash: <Banknote className="size-4" />, upi: <Smartphone className="size-4" />, card: <CreditCard className="size-4" /> };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ═══ COL 1: Category sidebar ════════════════════════════════════════════ */}
      {itemMode === 'menu' && (
        <div className="w-[130px] sm:w-[150px] shrink-0 flex flex-col border-r border-border bg-muted/40 overflow-y-auto">
          <div className="px-2 py-2 border-b border-border bg-background shrink-0">
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-1.5 rounded-md text-[10px] font-body font-bold bg-card shadow text-foreground flex items-center justify-center gap-1">
                <UtensilsCrossed className="size-3" />Menu
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-1.5 rounded-md text-[10px] font-body font-bold text-muted-foreground active:scale-95 flex items-center justify-center gap-1">
                <Edit3 className="size-3" />Custom
              </button>
            </div>
          </div>
          {[{ id: 'all', name: 'All Items' }, ...MENU_CATEGORIES].map((cat) => {
            const isActive = selectedCategory === cat.id && !search.trim();
            const catCount = cat.id === 'all'
              ? enabledItems.length
              : enabledItems.filter(i => i.category === cat.id).length;
            return (
              <button key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearch(''); }}
                className={cn('w-full text-left px-2.5 py-2.5 border-b border-border/50 transition-all',
                  isActive ? 'bg-amber-500 text-white' : 'hover:bg-muted text-foreground')}>
                <p className="text-[11px] font-bold leading-tight">{cat.name}</p>
                <p className={cn('text-[10px] mt-0.5 tabular-nums', isActive ? 'text-white/70' : 'text-muted-foreground')}>
                  {catCount} items
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ COL 2: Search + Items ═══════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {itemMode === 'menu' ? (
          <>
            <div className="px-3 py-2.5 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" placeholder={`Search all ${enabledItems.length} items…`} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all" />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
              </div>
              {search.trim() ? (
                <p className="text-[11px] text-amber-600 font-semibold mt-1.5 px-1">
                  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} across all categories
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                  {selectedCategory === 'all' ? `${enabledItems.length} items` : `${filteredItems.length} in ${MENU_CATEGORIES.find(c => c.id === selectedCategory)?.name ?? selectedCategory}`}
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {filteredItems.length === 0 ? (
                <EmptyState icon="🍽️" message="No items found" sub="Try a different category or clear your search" cta="Clear filters" onCta={() => { setSearch(''); setSelectedCategory('all'); }} />
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredItems.map(item => (
                    <MenuItemCard key={item.id} item={item} quantity={getQty(item.id)}
                      onAdd={() => addToCart(item)} onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)} compact />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="flex gap-1 p-1 rounded-xl bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-3.5" />Menu Items
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <Edit3 className="size-3.5" />Custom Items
              </button>
            </div>
            <div className="bg-card border border-amber-200/60 rounded-2xl p-4 space-y-3 shadow-soft"
              style={{ background: 'linear-gradient(135deg,rgba(251,191,36,0.04),rgba(251,191,36,0.02))' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.15)' }}>
                  <Edit3 className="size-3.5 text-amber-600" />
                </div>
                <p className="text-sm font-body font-bold text-foreground">Add Custom Item</p>
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                  Item Name <span className="text-destructive">*</span>
                </label>
                <input type="text" placeholder="e.g. Special Cake, Custom Parcel…" value={customName}
                  onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all"
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Price (₹) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input type="number" min="0" step="0.5" placeholder="0.00" value={customPrice}
                      onChange={e => { setCustomPrice(e.target.value); setCustomError(''); }}
                      className="w-full pl-8 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Qty</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCustomQty(q => String(Math.max(1, parseInt(q || '1') - 1)))}
                      aria-label="Decrease quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3.5" /></button>
                    <input type="number" min="1" value={customQty} onChange={e => setCustomQty(e.target.value)}
                      className="flex-1 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all" />
                    <button onClick={() => setCustomQty(q => String((parseInt(q || '1')) + 1))}
                aria-label="Increase quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90"><Plus className="size-3.5" /></button>
                  </div>
                </div>
              </div>
              {customError && (
                <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3 shrink-0" />{customError}
                </p>
              )}
              <button onClick={handleAddCustomItem}
                className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white"
                style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)', boxShadow: '0 4px 16px rgba(217,119,6,0.3)' }}>
                <Plus className="size-4" />Add to Bill
              </button>
            </div>
            {customItems.length > 0 ? (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-soft">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between" style={{ background: 'rgba(217,119,6,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-body font-bold text-amber-700">Custom Items Added</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{customItems.length}</span>
                  </div>
                  <button onClick={() => setCustomItems([])} className="text-xs font-body font-semibold text-destructive active:opacity-70">Clear all</button>
                </div>
                <div className="divide-y divide-border/50">
                  {customItems.map(ci => (
                    <div key={ci.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold text-foreground truncate">{ci.name}</p>
                        <p className="text-xs font-body text-muted-foreground tabular-nums">
                          {formatCurrency(ci.price)} × {ci.qty} = <span className="font-bold text-amber-600">{formatCurrency(ci.price * ci.qty)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-7 rounded-lg flex items-center justify-center active:scale-90 text-white"
                          style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}><Plus className="size-3" /></button>
                        <button onClick={() => updateCustomQty(ci.id, 0)} className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 border border-destructive/20 ml-0.5"><Trash2 className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Edit3 className="size-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-body text-muted-foreground">No custom items added yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ COL 3: Cart + Advance form ═════════════════════════════════════════ */}
      <div className="w-[260px] sm:w-[280px] lg:w-[300px] shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0" style={{ background: 'rgba(217,119,6,0.06)' }}>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-amber-600" />
            <h3 className="font-display font-bold text-base text-foreground">Advance Bill</h3>
            {!allEmpty && <span className="text-xs font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{cartCount + customItems.length}</span>}
          </div>
          {!allEmpty && (
            <button onClick={() => { clearCart(); setCustomItems([]); }}
              className="text-xs font-body font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95 border border-destructive/15">
              Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2 space-y-2">
          {allEmpty ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground gap-2">
              <ShoppingBag className="size-7 opacity-25" />
              <p className="text-sm font-body">Add menu or custom items</p>
            </div>
          ) : (
            <>
              {cart.map(ci => (
                <div key={ci.menuItem.id} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold truncate leading-tight">{ci.menuItem.name}</p>
                    <p className="text-xs text-primary font-bold tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-6 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.menuItem)} className="size-6 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5 border border-destructive/15"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
              {customItems.map(ci => (
                <div key={ci.id} className="flex items-center gap-2 py-1.5 border-l-2 border-amber-400 pl-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-body font-semibold truncate leading-tight">{ci.name}</p>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">CUSTOM</span>
                    </div>
                    <p className="text-xs text-amber-600 font-bold tabular-nums">{formatCurrency(ci.price * ci.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-6 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.qty}</span>
                    <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-6 rounded-lg text-white flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCustomQty(ci.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5 border border-destructive/15"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Advance form + pending — fixed bottom */}
        <div className="border-t border-border shrink-0 overflow-y-auto" style={{ maxHeight: '55%' }}>
          {!allEmpty && (
            <div className="px-4 py-3 space-y-3 bg-muted/20">
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-xs font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
              <div className="relative">
                <StickyNote className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                <textarea placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-xl text-xs font-body placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
              <div className="pt-2 border-t border-border space-y-3">
                <div className="space-y-1">
                  {menuTotal > 0 && (
                    <div className="flex justify-between text-xs font-body text-muted-foreground">
                      <span>Menu</span><span className="tabular-nums">{formatCurrency(menuTotal)}</span>
                    </div>
                  )}
                  {customTotal > 0 && (
                    <div className="flex justify-between text-xs font-body text-amber-600">
                      <span>Custom</span><span className="tabular-nums">{formatCurrency(customTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="font-body text-sm font-bold text-foreground">Total</span>
                    <span className="font-display text-2xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Advance Amount (₹) *</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input type="number" value={advanceAmt} onChange={e => { setAdvanceAmt(e.target.value); setAdvanceError(''); }}
                      placeholder="Enter advance amount"
                      className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all" />
                  </div>
                  {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && parseFloat(advanceAmt) < total && (
                    <div className="flex justify-between mt-1.5 px-1">
                      <span className="text-[11px] font-body text-muted-foreground">Balance due</span>
                      <span className="text-[11px] font-body font-bold text-red-600 tabular-nums">{formatCurrency(total - parseFloat(advanceAmt))}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Payment Method *</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['cash', 'upi', 'card'] as const).map(m => (
                      <button key={m} onClick={() => { setAdvanceMethod(m); setAdvanceError(''); }}
                        className={cn('flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-[11px] font-body font-bold transition-all active:scale-95',
                          advanceMethod === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground')}>
                        {PAYMENT_ICONS[m]}{m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {advanceError && (
                  <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />{advanceError}
                  </p>
                )}
                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-body font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-white"
                  style={{ background: 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: '0 4px 16px rgba(184,134,11,0.35)' }}>
                  <Wallet className="size-4" />{submitting ? 'Saving…' : '⏳ Record Advance Order'}
                </button>
              </div>
            </div>
          )}
          {advanceOrders.length > 0 && (
            <div className="border-t-4 border-amber-200">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.08)' }}>
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-amber-600" />
                  <span className="text-xs font-body font-bold text-amber-800">Pending Balance</span>
                </div>
                <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                  {advanceOrders.length} order{advanceOrders.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {advanceOrders.map(order => <AdvanceOrderCard key={order.id} order={order} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBillPanel() {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, clearCart, getCartTotal, getCartCount, submitOrder } = useOrderStore(
    useShallow(s => ({
      cart: s.cart,
      addToCart: s.addToCart,
      updateCartQuantity: s.updateCartQuantity,
      clearCart: s.clearCart,
      getCartTotal: s.getCartTotal,
      getCartCount: s.getCartCount,
      submitOrder: s.submitOrder,
    }))
  );
  const { currentUser } = useAuthStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [itemMode, setItemMode] = useState<'menu' | 'custom'>('menu');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [showTableSelect, setShowTableSelect] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Custom items
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customError, setCustomError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);
  const filteredItems = useMemo(() => {
    let filtered = enabledItems;
    if (selectedCategory !== 'all') filtered = filtered.filter(i => i.category === selectedCategory);
    if (search.trim()) filtered = filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return filtered;
  }, [enabledItems, selectedCategory, search]);

  const menuTotal     = getCartTotal();
  const customTotal   = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const itemsSubtotal = menuTotal + customTotal;
  // Parcel charges: ₹10 per item quantity for takeaway
  const PARCEL_CHARGE_PER_ITEM = 10;
  const totalItemQty  = cart.reduce((s, c) => s + c.quantity, 0)
                      + customItems.reduce((s, c) => s + c.qty, 0);
  const parcelCharges = orderType === 'takeaway' ? totalItemQty * PARCEL_CHARGE_PER_ITEM : 0;
  const total         = itemsSubtotal + parcelCharges;
  const cartCount     = getCartCount();
  const allEmpty      = cartCount === 0 && customItems.length === 0;
  const getQty = (id: string) => cart.find(c => c.menuItem.id === id)?.quantity ?? 0;

  const handleAddCustomItem = () => {
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomError('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomError('Enter a valid price'); return; }
    setCustomError('');
    setCustomItems(prev => {
      const existing = prev.find(c => c.name.toLowerCase() === n.toLowerCase());
      if (existing) return prev.map(c => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `custom-${Date.now()}-${Math.random()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };

  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems(prev => prev.filter(c => c.id !== id));
    else setCustomItems(prev => prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const handleSubmit = async () => {
    if (allEmpty) return;
    if (!currentUser) return;
    if (orderType === 'dine_in' && !tableNumber) { setTableError(true); return; }
    setTableError(false);
    setSubmitting(true);

    // Inject custom items as synthetic menu items
    for (const ci of customItems) {
      const syntheticItem = { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true };
      for (let i = 0; i < ci.qty; i++) addToCart(syntheticItem);
    }
    await new Promise(r => setTimeout(r, 50));

    setSubmitError('');
    try {
      await submitOrder({
        tableNumber: orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined,
        orderType,
        notes: notes || undefined,
        customerName: customerName || undefined,
        createdBy: currentUser.username,
        orderSource: 'staff',
        parcelCharges: parcelCharges > 0 ? parcelCharges : undefined,
      });
      setShowSuccess(true);
      setNotes(''); setCustomerName(''); setTableNumber(null);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setTimeout(() => setShowSuccess(false), 2200);
    } catch {
      setSubmitError('Failed to submit order — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
        <div className="size-20 rounded-3xl flex items-center justify-center animate-scale-in"
          style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.06))', border: '2px solid rgba(16,185,129,0.25)' }}>
          <Receipt className="size-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Bill Created!</h2>
          <p className="text-muted-foreground font-body mt-1 text-sm">Order has been added to the queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ═══ COL 1: Category sidebar ════════════════════════════════════════════ */}
      {itemMode === 'menu' && (
        <div className="w-[130px] sm:w-[150px] shrink-0 flex flex-col border-r border-border bg-muted/40 overflow-y-auto">
          <div className="px-2 py-2 border-b border-border bg-background shrink-0">
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-1.5 rounded-md text-[10px] font-body font-bold transition-all bg-card shadow text-foreground flex items-center justify-center gap-1">
                <UtensilsCrossed className="size-3" />Menu
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-1.5 rounded-md text-[10px] font-body font-bold transition-all text-muted-foreground active:scale-95 flex items-center justify-center gap-1">
                <Edit3 className="size-3" />Custom
              </button>
            </div>
          </div>
          {[{ id: 'all', name: 'All Items' }, ...MENU_CATEGORIES].map((cat) => {
            const isActive = selectedCategory === cat.id && !search.trim();
            const catCount = cat.id === 'all'
              ? enabledItems.length
              : enabledItems.filter(i => i.category === cat.id).length;
            return (
              <button key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearch(''); }}
                className={cn('w-full text-left px-2.5 py-2.5 border-b border-border/50 transition-all',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground')}>
                <p className="text-[11px] font-bold leading-tight">{cat.name}</p>
                <p className={cn('text-[10px] mt-0.5 tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {catCount} items
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ COL 2: Search + Item picker ════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {itemMode === 'menu' ? (
          <>
            <div className="px-3 py-2.5 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" placeholder={`Search all ${enabledItems.length} items…`} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all" />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
              </div>
              {search.trim() ? (
                <p className="text-[11px] text-primary font-semibold mt-1.5 px-1">
                  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} across all categories
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                  {selectedCategory === 'all' ? `${enabledItems.length} items` : `${filteredItems.length} in ${MENU_CATEGORIES.find(c => c.id === selectedCategory)?.name ?? selectedCategory}`}
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {filteredItems.length === 0 ? (
                <EmptyState icon="🍽️" message="No items found" sub="Try a different category or clear your search" cta="Clear filters" onCta={() => { setSearch(''); setSelectedCategory('all'); }} />
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredItems.map(item => (
                    <MenuItemCard key={item.id} item={item} quantity={getQty(item.id)}
                      onAdd={() => addToCart(item)} onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)} compact />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="flex gap-1 p-1 rounded-xl bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-3.5" />Menu Items
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <Edit3 className="size-3.5" />Custom Items
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-soft">
              <div className="flex items-center gap-2 mb-1">
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Edit3 className="size-3.5 text-primary" />
                </div>
                <p className="text-sm font-body font-bold text-foreground">Add Custom Item</p>
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                  Item Name <span className="text-destructive">*</span>
                </label>
                <input type="text" placeholder="e.g. Special Thali, Custom Parcel…"
                  value={customName} onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Price (₹) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input type="number" min="0" step="0.5" placeholder="0.00"
                      value={customPrice} onChange={e => { setCustomPrice(e.target.value); setCustomError(''); }}
                      className="w-full pl-8 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Qty</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCustomQty(q => String(Math.max(1, parseInt(q || '1') - 1)))}
                      aria-label="Decrease quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90 transition-all">
                      <Minus className="size-3.5" />
                    </button>
                    <input type="number" min="1" value={customQty} onChange={e => setCustomQty(e.target.value)}
                      className="flex-1 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all" />
                    <button onClick={() => setCustomQty(q => String((parseInt(q || '1')) + 1))}
                aria-label="Increase quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90 transition-all">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {customError && (
                <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3 shrink-0" />{customError}
                </p>
              )}
              <button onClick={handleAddCustomItem}
                className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-primary-foreground shadow-teal"
                style={{ background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' }}>
                <Plus className="size-4" />Add to Bill
              </button>
            </div>
            {customItems.length > 0 ? (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-soft">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-body font-bold text-foreground">Custom Items</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full cafe-gradient text-primary-foreground">{customItems.length}</span>
                  </div>
                  <button onClick={() => setCustomItems([])} className="text-xs font-body font-semibold text-destructive active:opacity-70">Clear all</button>
                </div>
                <div className="divide-y divide-border/50">
                  {customItems.map(ci => (
                    <div key={ci.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold text-foreground truncate">{ci.name}</p>
                        <p className="text-xs font-body text-muted-foreground tabular-nums">
                          {formatCurrency(ci.price)} × {ci.qty} = <span className="font-bold text-primary">{formatCurrency(ci.price * ci.qty)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-7 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-7 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                          style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                        <button onClick={() => updateCustomQty(ci.id, 0)} className="size-7 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Edit3 className="size-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-body text-muted-foreground">No custom items yet.</p>
                <p className="text-xs font-body text-muted-foreground/70">Add items not listed in the menu.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ COL 3: Bill summary ════════════════════════════════════════════════ */}
      <div className="w-[260px] sm:w-[280px] lg:w-[300px] shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-primary" />
            <h3 className="font-display font-bold text-base text-foreground">New Bill</h3>
            {!allEmpty && (
              <span className="text-xs font-body font-bold px-1.5 py-0.5 rounded-full text-primary-foreground"
                style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}>
                {cartCount + customItems.length}
              </span>
            )}
          </div>
          {!allEmpty && (
            <button onClick={() => { clearCart(); setCustomItems([]); }}
              className="text-xs font-body font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95 border border-destructive/15">
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2 space-y-2">
          {allEmpty ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground gap-2">
              <ShoppingBag className="size-7 opacity-25" />
              <p className="text-sm font-body">Add menu or custom items</p>
            </div>
          ) : (
            <>
              {cart.map(ci => (
                <div key={ci.menuItem.id} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold truncate leading-tight">{ci.menuItem.name}</p>
                    <p className="text-xs text-primary font-bold tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-6 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.menuItem)} className="size-6 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive border border-destructive/15 flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
              {customItems.map(ci => (
                <div key={ci.id} className="flex items-center gap-2 py-1.5 border-l-2 border-primary/40 pl-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-body font-semibold truncate leading-tight">{ci.name}</p>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary shrink-0">CUSTOM</span>
                    </div>
                    <p className="text-xs text-primary font-bold tabular-nums">{formatCurrency(ci.price * ci.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-6 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.qty}</span>
                    <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-6 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCustomQty(ci.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive border border-destructive/15 flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {!allEmpty && (
          <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20 shrink-0 overflow-y-auto" style={{ maxHeight: '55%' }}>
            <div className="flex gap-2">
              <button onClick={() => { setOrderType('dine_in'); setTableError(false); }}
                className={cn('flex-1 py-2 rounded-xl text-xs font-body font-semibold transition-all active:scale-95',
                  orderType === 'dine_in' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
                style={orderType === 'dine_in' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                🍽️ Dine In
              </button>
              <button onClick={() => { setOrderType('takeaway'); setTableError(false); }}
                className={cn('flex-1 py-2 rounded-xl text-xs font-body font-semibold transition-all active:scale-95',
                  orderType === 'takeaway' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
                style={orderType === 'takeaway' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                📦 Takeaway
              </button>
            </div>
            {orderType === 'dine_in' ? (
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <button onClick={() => setShowTableSelect(!showTableSelect)}
                  className={cn('w-full pl-8 pr-8 py-2.5 bg-card border rounded-xl text-left text-xs font-body transition-all',
                    tableError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border')}>
                  {tableNumber ? `Table ${tableNumber}` : 'Select Table *'}
                </button>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                {showTableSelect && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-2xl shadow-lifted z-50 p-2.5 grid grid-cols-5 gap-1 max-h-48 overflow-y-auto">
                    {TABLE_NUMBERS.map(num => (
                      <button key={num} onClick={() => { setTableNumber(num); setShowTableSelect(false); setTableError(false); }}
                        className={cn('py-2 rounded-xl text-xs font-body font-semibold transition-all active:scale-90',
                          tableNumber === num ? 'text-primary-foreground shadow-teal' : 'hover:bg-muted text-foreground')}
                        style={tableNumber === num ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                        {num}
                      </button>
                    ))}
                  </div>
                )}
                {tableError && (
                  <div className="flex items-center gap-1 mt-1.5 text-destructive">
                    <AlertCircle className="size-3" /><span className="text-[11px] font-body">Table required for Dine In</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-xs font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
            )}
            <div className="relative">
              <StickyNote className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <textarea placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-xl text-xs font-body placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK_NOTES.slice(0, 4).map(n => (
                <button key={n} onClick={() => setNotes(prev => prev ? `${prev}, ${n}` : n)}
                  className="px-2 py-1 rounded-lg text-[10px] font-body font-semibold bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all">
                  + {n}
                </button>
              ))}
            </div>
            <div className="pt-1 border-t border-border space-y-2">
              {menuTotal > 0 && customTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-body text-muted-foreground">
                    <span>Menu</span><span className="tabular-nums">{formatCurrency(menuTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-body text-primary">
                    <span>Custom</span><span className="tabular-nums">{formatCurrency(customTotal)}</span>
                  </div>
                </div>
              )}
              {parcelCharges > 0 && (
                <div className="flex justify-between text-xs font-body text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-200">
                  <span className="flex items-center gap-1">📦 Parcel ({totalItemQty} × ₹10)</span>
                  <span className="tabular-nums font-bold">+{formatCurrency(parcelCharges)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-body text-sm font-bold text-foreground">Total</span>
                <span className="font-display text-2xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
              </div>
              {submitError && <p className="text-xs font-body text-destructive text-center">{submitError}</p>}
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3.5 rounded-xl font-body font-bold text-sm active:scale-[0.97] transition-all shadow-teal disabled:opacity-60 flex items-center justify-center gap-2 text-primary-foreground"
                style={{ background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' }}>
                <Receipt className="size-4" />{submitting ? 'Creating…' : '🧾 Create Bill'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main BillingDashboard ─────────────────────────────────────────────────────
export default function BillingDashboard() {
  // STORE-01 FIX: granular selector with shallow equality — avoids full re-render on cart/loading changes
  const { orders, startPolling, stopPolling, polling, clearCart, cart } = useOrderStore(
    useShallow(s => ({
      orders: s.orders,
      startPolling: s.startPolling,
      stopPolling: s.stopPolling,
      polling: s.polling,
      clearCart: s.clearCart,
      cart: s.cart,
    }))
  );
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all' | 'new_bill' | 'advance'>('pending');
  // U-01 FIX: track pending tab switch so we can show a confirmation before wiping cart
  const [pendingTab, setPendingTab] = useState<OrderStatus | 'all' | 'new_bill' | 'advance' | null>(null);

  // U-01 FIX: guard against accidental cart wipe — show confirmation when cart has items
  const switchTab = (tab: OrderStatus | 'all' | 'new_bill' | 'advance') => {
    const leavingBillTab = activeTab === 'new_bill' || activeTab === 'advance';
    const enteringBillTab = tab === 'new_bill' || tab === 'advance';
    const cartHasItems = cart.length > 0;
    if (tab !== activeTab && (leavingBillTab || enteringBillTab) && cartHasItems) {
      // Park the destination and ask for confirmation
      setPendingTab(tab);
      return;
    }
    if (tab !== activeTab && (leavingBillTab || enteringBillTab)) {
      clearCart();
    }
    setActiveTab(tab);
  };

  const confirmTabSwitch = () => {
    if (!pendingTab) return;
    clearCart();
    setActiveTab(pendingTab);
    setPendingTab(null);
  };

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    startPolling(1); // PERF-01: billing only needs today's orders
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  // Advance orders: paymentType=advance AND balance still outstanding (not yet fully paid)
  const advanceOrders = useMemo(() =>
    todayOrders.filter(o => o.paymentType === 'advance' && (o.balanceDue ?? 0) > 0),
    [todayOrders]
  );

  // Regular orders: everything EXCEPT pending-balance advance orders
  const regularOrders = useMemo(() =>
    todayOrders.filter(o => !(o.paymentType === 'advance' && (o.balanceDue ?? 0) > 0)),
    [todayOrders]
  );

  const filtered = useMemo(() => {
    if (activeTab === 'new_bill' || activeTab === 'advance') return [];
    let result = regularOrders;
    if (activeTab !== 'all') result = result.filter(o => o.status === activeTab);
    if (sourceFilter !== 'all') result = result.filter(o => o.orderSource === sourceFilter);
    return result;
  }, [regularOrders, activeTab, sourceFilter]);

  // Counts use regularOrders so advance (pending balance) never pollutes them
  const qrCount = regularOrders.filter(o => o.orderSource === 'qr').length;
  const staffCount = regularOrders.filter(o => o.orderSource === 'staff').length;

  return (
    <div className="flex flex-col bg-background" style={{ height: '100dvh', paddingTop: 'var(--header-h, 3.5rem)', paddingBottom: 'var(--nav-h, 5.25rem)' }} data-billing-dashboard>

      {/* U-01 FIX: cart-clear confirmation dialog */}
      {pendingTab !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-xl border border-border">
            <div className="size-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
              <Inbox className="size-6 text-amber-600" />
            </div>
            <h2 className="font-display text-lg font-bold text-foreground mb-1">Clear cart?</h2>
            <p className="text-sm font-body text-muted-foreground mb-5">
              Switching tabs will clear your current cart ({cart.length} item{cart.length !== 1 ? 's' : ''}). This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingTab(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body font-semibold text-foreground active:scale-95"
              >
                Stay here
              </button>
              <button
                onClick={confirmTabSwitch}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-body font-semibold active:scale-95"
              >
                Clear & switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status bar ── */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn('size-2 rounded-full', polling ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400')} />
          <span className="text-xs font-body font-medium text-muted-foreground">
            {polling ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {([
            { key: 'all' as SourceFilter, label: `All · ${regularOrders.length}`, icon: null },
            { key: 'staff' as SourceFilter, label: `Staff · ${staffCount}`, icon: <UserCheck className="size-3" /> },
            { key: 'qr' as SourceFilter, label: `QR · ${qrCount}`, icon: <QrCode className="size-3" /> },
          ] as {key:SourceFilter;label:string;icon:React.ReactNode}[]).map(s => (
            <button key={s.key} onClick={() => setSourceFilter(s.key)}
              className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-body font-bold transition-all',
                sourceFilter === s.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground active:scale-95')}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab rail ── */}
      <div className="border-b border-border bg-background shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2.5">

          <button onClick={() => switchTab('new_bill')}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-body font-bold whitespace-nowrap transition-all shrink-0 active:scale-95',
              activeTab === 'new_bill'
                ? 'text-white shadow-lifted'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700')}
            style={activeTab === 'new_bill' ? { background: 'linear-gradient(135deg,#1a7a50,#0f5436)', boxShadow: '0 4px 16px rgba(26,122,80,0.35)' } : {}}>
            <Plus className="size-3.5" />New Bill
          </button>

          <button onClick={() => switchTab('advance')}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-body font-bold whitespace-nowrap transition-all shrink-0 active:scale-95',
              activeTab === 'advance'
                ? 'bg-amber-500 text-white shadow-md'
                : 'bg-amber-50 border border-amber-200 text-amber-700')}>
            <Wallet className="size-3.5" />Advance
            {advanceOrders.length > 0 && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                activeTab === 'advance' ? 'bg-white/30 text-white' : 'bg-amber-200 text-amber-800')}>
                {advanceOrders.length}
              </span>
            )}
          </button>

          {STATUS_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? (sourceFilter === 'all' ? regularOrders.length : regularOrders.filter(o => o.orderSource === sourceFilter).length)
              : (sourceFilter === 'all'
                  ? regularOrders.filter(o => o.status === tab.key).length
                  : regularOrders.filter(o => o.status === tab.key && o.orderSource === sourceFilter).length);
            return (
              <button key={tab.key} onClick={() => switchTab(tab.key)}
                className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-body font-bold whitespace-nowrap transition-all shrink-0 active:scale-95',
                  isActive ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
                style={isActive ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                <span className={cn('size-2 rounded-full shrink-0', isActive ? 'bg-white/80' : tab.dotColor)} />
                {tab.label}
                {count > 0 && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0',
                    isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      {activeTab === 'new_bill' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><NewBillPanel /></div>
      ) : activeTab === 'advance' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden"><AdvanceOrderPanel onCreated={() => {}} advanceOrders={advanceOrders} /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                <Inbox className="size-10 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="font-body font-semibold text-foreground">No orders here</p>
                <p className="text-sm font-body text-muted-foreground mt-1">
                  {sourceFilter !== 'all'
                    ? `No ${activeTab === 'all' ? '' : activeTab + ' '}orders from ${sourceFilter === 'qr' ? 'QR' : 'Staff'} right now`
                    : activeTab === 'pending' ? 'Waiting for new orders…' : `No ${activeTab === 'all' ? '' : activeTab} orders right now`}
                </p>
                {/* U-11 FIX: offer one-tap clear when a source filter is hiding results */}
                {sourceFilter !== 'all' && (
                  <button
                    onClick={() => setSourceFilter('all')}
                    className="mt-3 text-sm font-body font-semibold text-primary underline underline-offset-2 active:opacity-70"
                  >
                    Clear filter — show all sources
                  </button>
                )}
              </div>
            </div>
          ) : (
            filtered.map(order => <OrderCard key={order.id} order={order} showActions />)
          )}
        </div>
      )}
    </div>
  );
}
