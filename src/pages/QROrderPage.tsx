import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMenuStore } from '@/stores/menuStore';
import { useOrderStore } from '@/stores/orderStore';
import { MENU_CATEGORIES, CAFE_CONFIG } from '@/constants/config';
import { formatCurrency, cn } from '@/lib/utils';
import {
  Search, X, Plus, Minus, ShoppingBag, Trash2,
  StickyNote, Leaf, Clock, CheckCircle2, ChevronDown,
  MapPin, User as UserIcon,
} from 'lucide-react';
import type { OrderType } from '@/types';
import { TABLE_NUMBERS } from '@/constants/config';

export default function QROrderPage() {
  const [searchParams] = useSearchParams();
  const tableFromUrl = searchParams.get('table');
  const tableNum = tableFromUrl ? parseInt(tableFromUrl, 10) : null;

  const { items, loadMenu, loading } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, clearCart, getCartTotal, getCartCount, submitOrder } = useOrderStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>(tableNum ? 'dine_in' : 'dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(tableNum);
  const [showTableSelect, setShowTableSelect] = useState(false);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);
  const activeCategories = useMemo(() => MENU_CATEGORIES.filter(c => enabledItems.some(i => i.category === c.id)), [enabledItems]);

  const filteredItems = useMemo(() => {
    let filtered = enabledItems;
    if (selectedCategory !== 'all') filtered = filtered.filter(i => i.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i => i.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [enabledItems, selectedCategory, search]);

  const cartCount = getCartCount();
  const cartTotal = getCartTotal();

  const getQty = (id: string) => {
    const ci = cart.find(c => c.menuItem.id === id);
    return ci ? ci.quantity : 0;
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);

    const tn = orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined;

    const returnedId = await submitOrder({
      tableNumber: tn,
      orderType,
      notes: notes || undefined,
      customerName: customerName || undefined,
      createdBy: tableNum ? `QR-Table-${tableNum}` : 'QR-Customer',
      orderSource: 'qr',
    });

    const storeOrders = useOrderStore.getState().orders;
    const placed = storeOrders.find((o) => o.id === returnedId);
    if (placed) {
      setOrderNumber(placed.orderNumber);
      setTrackingId(placed.id);
    }

    setSubmitting(false);
    setOrderPlaced(true);
    setNotes('');
    setCustomerName('');
  };

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="size-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="size-14 text-emerald-600" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">Order Placed!</h1>
          {orderNumber && (
            <div className="mb-4">
              <p className="text-sm font-body text-muted-foreground">Your order number</p>
              <p className="font-display text-5xl font-bold text-primary mt-1">#{String(orderNumber).padStart(3, '0')}</p>
            </div>
          )}
          {tableNum && (
            <p className="text-sm font-body text-muted-foreground mb-2">
              Table {tableNum} · Your order has been sent to the kitchen
            </p>
          )}
          <p className="text-sm font-body text-muted-foreground mb-8">
            Your order is being prepared. Please wait at your table.
          </p>
          {trackingId && (
            <a
              href={`/order/track?id=${trackingId}`}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-body font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.97] transition-transform mb-3"
            >
              📍 Track Your Order
            </a>
          )}
          <button
            onClick={() => { setOrderPlaced(false); setOrderNumber(null); setTrackingId(null); clearCart(); }}
            className="w-full py-4 rounded-2xl cafe-gradient text-primary-foreground font-body font-bold text-sm active:scale-[0.97] transition-transform shadow-lg"
          >
            Place Another Order
          </button>
          <div className="mt-6 pt-4 border-t border-border">
            <p className="font-display text-base font-semibold text-foreground">{CAFE_CONFIG.name}</p>
            <p className="text-xs font-body text-muted-foreground mt-0.5">{CAFE_CONFIG.address}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Hero header */}
      <div className="cafe-gradient text-primary-foreground px-5 py-5 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-full bg-white/15 flex items-center justify-center">
            <Leaf className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">{CAFE_CONFIG.name}</h1>
            <p className="text-xs font-body opacity-80">{CAFE_CONFIG.type} · {CAFE_CONFIG.hours}</p>
          </div>
        </div>
        {tableNum && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/25">
            <MapPin className="size-3.5" />
            <span className="text-sm font-body font-bold">Table {tableNum}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search menu..."
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

      {/* Category filter */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
              selectedCategory === 'all' ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}
          >
            All Items
          </button>
          {activeCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn('px-4 py-2 rounded-full text-xs font-body font-semibold whitespace-nowrap shrink-0 transition-all',
                selectedCategory === cat.id ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="px-4 py-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">🍽️</p>
              <p className="font-body text-muted-foreground">No items found</p>
              <button onClick={() => { setSearch(''); setSelectedCategory('all'); }} className="mt-2 text-sm font-body text-primary font-semibold">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredItems.map(item => {
                const qty = getQty(item.id);
                const cat = MENU_CATEGORIES.find(c => c.id === item.category);
                return (
                  <div key={item.id} className={cn('bg-card rounded-xl border overflow-hidden transition-all', qty > 0 ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border')}>
                    <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                      ) : (
                        <div className="size-full flex items-center justify-center text-3xl text-muted-foreground/40">
                          {cat?.icon || '🍽️'}
                        </div>
                      )}
                      {qty > 0 && (
                        <div className="absolute top-1.5 right-1.5 size-6 rounded-full cafe-gradient flex items-center justify-center">
                          <span className="text-xs font-bold text-primary-foreground">{qty}</span>
                        </div>
                      )}
                      <div className="absolute bottom-1.5 left-1.5">
                        <span className="text-[8px] font-body px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold">VEG</span>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <h3 className="text-sm font-body font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">{item.name}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-base font-display font-bold text-primary tabular-nums">{formatCurrency(item.price)}</span>
                        {qty === 0 ? (
                          <button onClick={() => addToCart(item)} className="size-8 rounded-lg cafe-gradient flex items-center justify-center text-primary-foreground active:scale-90 transition-transform shadow-sm">
                            <Plus className="size-4" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateCartQuantity(item.id, qty - 1)} className="size-7 rounded-md bg-muted flex items-center justify-center active:scale-90"><Minus className="size-3.5" /></button>
                            <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                            <button onClick={() => addToCart(item)} className="size-7 rounded-md cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90"><Plus className="size-3.5" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating cart bar */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2" style={{ background: 'linear-gradient(to top, hsl(38 50% 97%) 60%, transparent)' }}>
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-3.5 px-5 rounded-2xl cafe-gradient text-primary-foreground flex items-center justify-between shadow-xl active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="size-5" />
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-accent text-[10px] font-bold flex items-center justify-center text-accent-foreground">{cartCount}</span>
              </div>
              <span className="font-body font-bold text-sm">View Cart</span>
            </div>
            <span className="font-display text-lg font-bold tabular-nums">{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h2 className="font-display text-xl font-bold">Your Order</h2>
                <p className="text-xs text-muted-foreground font-body">{cartCount} item{cartCount !== 1 ? 's' : ''} · {formatCurrency(cartTotal)}</p>
              </div>
              <div className="flex gap-2">
                {cart.length > 0 && <button onClick={clearCart} className="px-3 py-1.5 text-xs font-body font-semibold text-destructive bg-destructive/10 rounded-lg active:scale-95">Clear</button>}
                <button onClick={() => setShowCart(false)} className="size-9 rounded-full bg-muted flex items-center justify-center"><X className="size-5" /></button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.map(ci => (
                <div key={ci.menuItem.id} className="flex items-center gap-3 py-2">
                  {ci.menuItem.imageUrl ? <img src={ci.menuItem.imageUrl} alt="" className="size-12 rounded-lg object-cover shrink-0" /> : <div className="size-12 rounded-lg bg-muted shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold truncate">{ci.menuItem.name}</p>
                    <p className="text-sm text-primary font-bold tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-7 rounded-md bg-muted flex items-center justify-center active:scale-90"><Minus className="size-3.5" /></button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.menuItem)} className="size-7 rounded-md cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90"><Plus className="size-3.5" /></button>
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="size-7 rounded-md bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* Order details */}
            {cart.length > 0 && (
              <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/50">
                {/* Order type toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderType('dine_in')}
                    className={cn('flex-1 py-2.5 rounded-lg text-sm font-body font-semibold transition-all', orderType === 'dine_in' ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card text-foreground border border-border')}
                  >🍽️ Dine In</button>
                  <button
                    onClick={() => setOrderType('takeaway')}
                    className={cn('flex-1 py-2.5 rounded-lg text-sm font-body font-semibold transition-all', orderType === 'takeaway' ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card text-foreground border border-border')}
                  >📦 Takeaway</button>
                </div>

                {/* Table selection (if dine_in and no table from URL) */}
                {orderType === 'dine_in' && !tableNum && (
                  <div>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <button
                        onClick={() => setShowTableSelect(!showTableSelect)}
                        className="w-full pl-9 pr-9 py-2.5 bg-card border border-border rounded-lg text-left text-sm font-body"
                      >
                        {tableNumber ? `Table ${tableNumber}` : 'Select Table (optional)'}
                      </button>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      {showTableSelect && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2 grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
                          {TABLE_NUMBERS.map(num => (
                            <button key={num} onClick={() => { setTableNumber(num); setShowTableSelect(false); }}
                              className={cn('py-2 rounded-md text-sm font-body font-medium', tableNumber === num ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted')}>
                              {num}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {orderType === 'dine_in' && tableNum && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                    <MapPin className="size-4 text-primary" />
                    <span className="text-sm font-body font-semibold text-primary">Table {tableNum}</span>
                  </div>
                )}

                {/* Customer name */}
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type="text" placeholder="Your name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground" />
                </div>

                {/* Notes */}
                <div className="relative">
                  <StickyNote className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <textarea placeholder="Special instructions (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground resize-none" />
                </div>

                {/* Total + submit */}
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-body text-sm text-muted-foreground">Total</span>
                    <span className="font-display text-2xl font-bold text-foreground tabular-nums">{formatCurrency(cartTotal)}</span>
                  </div>
                  <button
                    onClick={handleSubmitOrder}
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-base active:scale-[0.98] transition-transform shadow-lg disabled:opacity-60"
                  >
                    {submitting ? 'Placing Order...' : 'Place Order'}
                  </button>
                  <p className="text-center text-[10px] font-body text-muted-foreground mt-2">
                    Your order will be sent directly to the kitchen
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-6 border-t border-border mt-4 px-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Leaf className="size-3.5 text-primary" />
          <p className="font-display text-sm font-semibold text-foreground">{CAFE_CONFIG.name}</p>
        </div>
        <p className="text-xs font-body text-muted-foreground">{CAFE_CONFIG.address}</p>
        <p className="text-xs font-body text-muted-foreground mt-0.5">{CAFE_CONFIG.type} · {CAFE_CONFIG.hours}</p>
      </div>
    </div>
  );
}
