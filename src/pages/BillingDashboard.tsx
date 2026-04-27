import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Inbox, Wifi, Plus, Minus, Search, X,
  ShoppingBag, MapPin, User as UserIcon, StickyNote,
  ChevronDown, AlertCircle, Trash2, Receipt,
} from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import type { OrderStatus, OrderType } from '@/types';
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

// ── Inline billing cart (no drawer, rendered in page) ─────────────────────────
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
    // Two-column layout on md+, stacked on mobile
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 md:px-4 md:pt-4 md:pb-6 min-h-[calc(100vh-112px)]">

      {/* ── LEFT: Menu browser ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Search */}
        <div className="px-4 md:px-0 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="border-b border-border">
          <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
        </div>

        {/* Items grid */}
        <div className="px-4 md:px-0 py-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-muted-foreground">No items found</p>
              <button onClick={() => { setSearch(''); setSelectedCategory('all'); }} className="mt-2 text-sm font-body text-primary font-semibold">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
              {filteredItems.map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantity={getQty(item.id)}
                  onAdd={() => addToCart(item)}
                  onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Bill summary ─────────────────────────────────────── */}
      <div className="w-full md:w-80 lg:w-96 shrink-0">
        <div className="md:sticky md:top-[112px] bg-background md:bg-card md:border md:border-border md:rounded-2xl md:shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-t md:border-t-0 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary" />
              <h3 className="font-display font-bold text-base text-foreground">New Bill</h3>
              {cartCount > 0 && (
                <span className="text-xs font-body font-bold px-1.5 py-0.5 rounded-full cafe-gradient text-primary-foreground">{cartCount}</span>
              )}
            </div>
            {cartCount > 0 && (
              <button onClick={clearCart} className="text-xs font-body font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95">
                Clear
              </button>
            )}
          </div>

          {/* Cart items */}
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

          {/* Order details */}
          {cartCount > 0 && (
            <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/30">
              {/* Dine in / Takeaway */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setOrderType('dine_in'); setTableError(false); }}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all', orderType === 'dine_in' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}
                >🍽️ Dine In</button>
                <button
                  onClick={() => { setOrderType('takeaway'); setTableError(false); }}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-body font-semibold transition-all', orderType === 'takeaway' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}
                >📦 Takeaway</button>
              </div>

              {/* Table / Customer */}
              {orderType === 'dine_in' ? (
                <div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <button
                      onClick={() => setShowTableSelect(!showTableSelect)}
                      className={cn('w-full pl-8 pr-8 py-2 bg-card border rounded-lg text-left text-xs font-body', tableError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border')}
                    >
                      {tableNumber ? `Table ${tableNumber}` : 'Select Table *'}
                    </button>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    {showTableSelect && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2 grid grid-cols-5 gap-1 max-h-36 overflow-y-auto">
                        {TABLE_NUMBERS.map(num => (
                          <button key={num} onClick={() => { setTableNumber(num); setShowTableSelect(false); setTableError(false); }}
                            className={cn('py-1.5 rounded-md text-xs font-body font-medium', tableNumber === num ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted')}>
                            {num}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {tableError && (
                    <div className="flex items-center gap-1 mt-1 text-destructive">
                      <AlertCircle className="size-3" />
                      <span className="text-[11px] font-body">Table number required for Dine In</span>
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

              {/* Notes */}
              <div>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <textarea placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-xs font-body placeholder:text-muted-foreground resize-none" />
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {QUICK_NOTES.map(n => (
                    <button key={n} type="button"
                      onClick={() => setNotes(prev => prev ? `${prev}, ${n}` : n)}
                      className="px-2 py-0.5 rounded text-[10px] font-body font-semibold bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all">
                      + {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total + submit */}
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
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all' | 'new_bill'>('pending');

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  const filtered = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'new_bill') return todayOrders;
    return todayOrders.filter(o => o.status === activeTab);
  }, [todayOrders, activeTab]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Sync indicator */}
      <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
        <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
        <span className="text-[10px] font-body text-muted-foreground">
          {polling ? 'Live syncing every 3s' : 'Offline'}
        </span>
      </div>

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-2">
          {/* New Bill tab */}
          <button
            onClick={() => setActiveTab('new_bill')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0',
              activeTab === 'new_bill'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700 active:scale-95'
            )}
          >
            <Plus className="size-3.5" />
            New Bill
          </button>

          {/* Status tabs */}
          {STATUS_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? todayOrders.length
              : todayOrders.filter(o => o.status === tab.key).length;
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
      ) : (
        <div className="px-4 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Inbox className="size-16 mb-4 opacity-30" />
              <p className="font-body font-semibold text-lg">No orders here</p>
              <p className="text-sm font-body mt-1">
                {activeTab === 'pending' ? 'Waiting for new orders from staff...' : `No ${activeTab === 'all' ? '' : activeTab} orders right now`}
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
