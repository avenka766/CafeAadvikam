import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock3,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useMenuStore } from '@/stores/menuStore';
import { useOrderStore } from '@/stores/orderStore';
import { CAFE_CONFIG, MENU_CATEGORIES, TABLE_NUMBERS } from '@/constants/config';
import { cn, formatCurrency } from '@/lib/utils';
import type { OrderType } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import cafeLogo from '@/assets/cafe-logo.png';

const MAX_ITEMS_PER_ORDER = 20;
const MAX_QTY_PER_ITEM = 10;
const QR_SUBMIT_COOLDOWN_MS = 10_000;

type SavedDraft = {
  customerName: string;
  notes: string;
  orderType: OrderType;
  tableNumber: number | null;
  cart: Array<{ itemId: string; quantity: number }>;
};

function validTable(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return TABLE_NUMBERS.includes(parsed) ? parsed : null;
}

export default function QROrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableFromQr = validTable(searchParams.get('table'));
  const storageKey = `cafe-table-order:${tableFromQr ?? 'general'}`;

  const { items, loadMenu, loading } = useMenuStore();
  const {
    cart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartCount,
    submitOrder,
  } = useOrderStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [orderType, setOrderType] = useState<OrderType>(tableFromQr ? 'dine_in' : 'takeaway');
  const [tableNumber, setTableNumber] = useState<number | null>(tableFromQr);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [addedNotice, setAddedNotice] = useState('');
  const [placedOrder, setPlacedOrder] = useState<{ id: string; number: number | null } | null>(null);
  const restoredRef = useRef(false);
  const lastSubmitTime = useRef(0);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter((item) => item.enabled), [items]);
  const activeCategories = useMemo(
    () => MENU_CATEGORIES.filter((category) => enabledItems.some((item) => item.category === category.id)),
    [enabledItems],
  );

  useEffect(() => {
    if (loading || restoredRef.current || enabledItems.length === 0) return;
    restoredRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as SavedDraft | null;
      if (!saved) return;
      setCustomerName(saved.customerName || '');
      setNotes(saved.notes || '');
      setOrderType(tableFromQr ? 'dine_in' : (saved.orderType || 'takeaway'));
      setTableNumber(tableFromQr ?? saved.tableNumber ?? null);
      if (cart.length === 0 && Array.isArray(saved.cart)) {
        saved.cart.forEach(({ itemId, quantity }) => {
          const item = enabledItems.find((menuItem) => menuItem.id === itemId);
          if (!item) return;
          addToCart(item);
          if (quantity > 1) updateCartQuantity(item.id, Math.min(MAX_QTY_PER_ITEM, quantity));
        });
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [addToCart, cart.length, enabledItems, loading, storageKey, tableFromQr, updateCartQuantity]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const draft: SavedDraft = {
      customerName,
      notes,
      orderType,
      tableNumber,
      cart: cart.map((line) => ({ itemId: line.menuItem.id, quantity: line.quantity })),
    };
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [cart, customerName, notes, orderType, storageKey, tableNumber]);

  useEffect(() => {
    if (!addedNotice) return;
    const timer = window.setTimeout(() => setAddedNotice(''), 1600);
    return () => window.clearTimeout(timer);
  }, [addedNotice]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enabledItems.filter((item) => (
      (selectedCategory === 'all' || item.category === selectedCategory)
      && (!query || item.name.toLowerCase().includes(query))
    ));
  }, [enabledItems, search, selectedCategory]);

  const cartCount = getCartCount();
  const cartTotal = getCartTotal();
  const getQty = (id: string) => cart.find((line) => line.menuItem.id === id)?.quantity || 0;

  const changeQuantity = (itemId: string, quantity: number) => {
    updateCartQuantity(itemId, Math.max(0, Math.min(MAX_QTY_PER_ITEM, quantity)));
  };

  const addItem = (item: (typeof enabledItems)[number]) => {
    const current = getQty(item.id);
    if (current >= MAX_QTY_PER_ITEM) {
      setAddedNotice(`Maximum ${MAX_QTY_PER_ITEM} per item`);
      return;
    }
    addToCart(item);
    setAddedNotice(`${item.name} added`);
  };

  const handleSubmitOrder = async () => {
    setError('');
    if (cart.length === 0) return setError('Add at least one item before placing the order.');
    if (cart.length > MAX_ITEMS_PER_ORDER) return setError(`Maximum ${MAX_ITEMS_PER_ORDER} different items per order.`);
    if (cart.some((line) => line.quantity > MAX_QTY_PER_ITEM)) return setError(`Maximum ${MAX_QTY_PER_ITEM} of any single item.`);
    if (orderType === 'dine_in' && !tableNumber) return setError('Select your table number.');
    if (Date.now() - lastSubmitTime.current < QR_SUBMIT_COOLDOWN_MS) return setError('Please wait a few seconds before placing another order.');

    const safeName = customerName.replace(/<[^>]*>/g, '').trim().slice(0, 80);
    const safeNotes = notes.replace(/<[^>]*>/g, '').trim().slice(0, 300);
    setSubmitting(true);
    lastSubmitTime.current = Date.now();
    try {
      const id = await submitOrder({
        tableNumber: orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined,
        orderType,
        notes: safeNotes || undefined,
        customerName: safeName || undefined,
        createdBy: tableFromQr ? `QR-Table-${tableFromQr}` : 'QR-Customer',
        orderSource: 'qr',
      });
      const order = useOrderStore.getState().orders.find((entry) => entry.id === id);
      setPlacedOrder({ id, number: order?.orderNumber ?? null });
      localStorage.removeItem(storageKey);
      setCartOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to place the order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startAnotherOrder = () => {
    clearCart();
    setNotes('');
    setPlacedOrder(null);
    setError('');
    localStorage.removeItem(storageKey);
  };

  if (placedOrder) {
    return (
      <main className="min-h-[100dvh] bg-[#fff8eb] px-5 py-10 text-stone-950">
        <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col justify-center">
          <section className="overflow-hidden rounded-[2.25rem] border border-emerald-200 bg-white shadow-2xl shadow-emerald-950/10">
            <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-stone-950 px-7 py-9 text-center text-white">
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
                <CheckCircle2 className="size-11 text-emerald-200" />
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-emerald-200">Sent to the kitchen</p>
              <h1 className="mt-2 font-display text-4xl font-black">Order placed</h1>
              {placedOrder.number && <p className="mt-4 font-display text-6xl font-black text-amber-300">#{String(placedOrder.number).padStart(3, '0')}</p>}
              <p className="mt-3 text-sm text-white/70">{orderType === 'dine_in' && tableNumber ? `Table ${tableNumber}` : 'Takeaway'} · We will update the status live.</p>
            </div>
            <div className="space-y-3 p-6">
              <button
                type="button"
                onClick={() => navigate(`/cafe-order/track?id=${placedOrder.id}`)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-sm font-black text-white shadow-lg active:scale-[0.98]"
              >
                <ChefHat className="size-5 text-amber-300" /> Track order live
              </button>
              <button
                type="button"
                onClick={startAnotherOrder}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm font-black text-stone-900 active:scale-[0.98]"
              >
                Order more for this table
              </button>
              <p className="pt-2 text-center text-xs leading-5 text-stone-500">Please remain at your table. Payment can be completed with the cashier or serving staff.</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#fff8eb] pb-32 text-stone-950">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#183f34] via-[#0e5a49] to-[#27170c] px-4 pb-7 pt-5 text-white sm:px-6">
        <div className="absolute -right-16 -top-16 size-56 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={cafeLogo} alt={CAFE_CONFIG.name} className="size-12 rounded-2xl border border-white/20 bg-white object-cover p-0.5 shadow-xl" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-200">Table ordering</p>
                <h1 className="font-display text-2xl font-black">{CAFE_CONFIG.name}</h1>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/55">Open</p>
              <p className="mt-0.5 text-xs font-black">{CAFE_CONFIG.hours}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <h2 className="font-display text-4xl font-black leading-none sm:text-5xl">Choose. Tap. Enjoy.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Browse the cafe menu, customise quantities and send the order directly to our kitchen.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-black backdrop-blur">
                <MapPin className="size-4 text-amber-300" /> {tableFromQr ? `Table ${tableFromQr}` : orderType === 'dine_in' && tableNumber ? `Table ${tableNumber}` : 'Choose table'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-black backdrop-blur">
                <Clock3 className="size-4 text-amber-300" /> Kitchen live
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/15 p-2 backdrop-blur">
            {[['1', 'Add items'], ['2', 'Review cart'], ['3', 'Track live']].map(([step, label]) => (
              <div key={step} className="rounded-xl bg-white/8 px-2 py-2.5 text-center">
                <p className="text-[10px] font-black text-amber-300">STEP {step}</p>
                <p className="mt-0.5 text-[11px] font-bold text-white/75">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-amber-900/10 bg-[#fff8eb]/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dosa, coffee, meals..."
              className="h-12 w-full rounded-2xl border border-stone-200 bg-white pl-12 pr-12 text-sm font-semibold shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-stone-100"><X className="size-4" /></button>}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={cn('shrink-0 rounded-full px-4 py-2 text-xs font-black transition', selectedCategory === 'all' ? 'bg-stone-950 text-white shadow-lg' : 'border border-stone-200 bg-white text-stone-700')}
            >
              ✨ All items
            </button>
            {activeCategories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn('shrink-0 rounded-full px-4 py-2 text-xs font-black transition', selectedCategory === category.id ? 'bg-stone-950 text-white shadow-lg' : 'border border-stone-200 bg-white text-stone-700')}
              >
                {category.icon} {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Fresh from our kitchen</p>
            <h2 className="mt-1 font-display text-2xl font-black">{selectedCategory === 'all' ? 'Cafe menu' : MENU_CATEGORIES.find((category) => category.id === selectedCategory)?.name}</h2>
          </div>
          <p className="text-xs font-bold text-stone-500">{filteredItems.length} items</p>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-emerald-700 border-t-transparent" /></div>
        ) : filteredItems.length === 0 ? (
          <EmptyState icon="🍽️" message="No items found" sub="Try another category or clear the search" cta="Clear filters" onCta={() => { setSearch(''); setSelectedCategory('all'); }} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const quantity = getQty(item.id);
              const category = MENU_CATEGORIES.find((entry) => entry.id === item.category);
              return (
                <article key={item.id} className={cn('grid grid-cols-[6.5rem_1fr] overflow-hidden rounded-3xl border bg-white shadow-sm transition sm:grid-cols-1', quantity ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-stone-200')}>
                  <div className="relative min-h-32 bg-[#f7f1df] sm:aspect-[16/10]">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="size-full object-cover" /> : <div className="grid size-full place-items-center text-4xl">{category?.icon || '🍽️'}</div>}
                    <span className="absolute left-2 top-2 rounded-full bg-emerald-700 px-2 py-1 text-[9px] font-black text-white shadow">PURE VEG</span>
                    {quantity > 0 && <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-amber-300 text-sm font-black text-stone-950 shadow-lg"><Check className="size-4" /></span>}
                  </div>
                  <div className="flex min-w-0 flex-col p-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{category?.name || 'Cafe item'}</p>
                      <h3 className="mt-1 line-clamp-2 font-display text-lg font-black leading-tight">{item.name}</h3>
                      {item.timing && <p className="mt-1 text-xs font-bold text-stone-400">{item.timing}</p>}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <p className="font-display text-xl font-black text-orange-700">{formatCurrency(item.price)}</p>
                      {quantity === 0 ? (
                        <button type="button" onClick={() => addItem(item)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-950 px-4 text-xs font-black text-white shadow-lg active:scale-95">
                          <Plus className="size-4 text-amber-300" /> Add
                        </button>
                      ) : (
                        <div className="flex items-center rounded-xl border border-emerald-200 bg-emerald-50 p-1">
                          <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, quantity - 1)} className="grid size-8 place-items-center rounded-lg bg-white text-emerald-900 shadow-sm"><Minus className="size-4" /></button>
                          <span className="min-w-9 text-center text-sm font-black text-emerald-950">{quantity}</span>
                          <button type="button" aria-label={`Add one ${item.name}`} onClick={() => addItem(item)} className="grid size-8 place-items-center rounded-lg bg-emerald-800 text-white shadow-sm"><Plus className="size-4" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {addedNotice && (
        <div className="fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-950 px-4 py-2.5 text-xs font-black text-white shadow-2xl">
          <Check className="size-4 text-emerald-300" /> {addedNotice}
        </div>
      )}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-stone-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-[0_-16px_45px_rgba(0,0,0,.22)] backdrop-blur-xl">
          <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 shadow-xl active:scale-[0.99]">
            <span className="flex items-center gap-3">
              <span className="relative grid size-11 place-items-center rounded-xl bg-white/15"><ShoppingBag className="size-6" /><span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-300 text-[10px] font-black text-stone-950">{cartCount}</span></span>
              <span className="text-left"><span className="block text-sm font-black">Review your order</span><span className="block text-[11px] text-white/65">Tap to change quantities</span></span>
            </span>
            <span className="text-right"><span className="block font-display text-xl font-black">{formatCurrency(cartTotal)}</span><span className="block text-[10px] font-black uppercase tracking-wider text-amber-200">View cart</span></span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Review cafe order">
          <button type="button" aria-label="Close cart" className="absolute inset-0" onClick={() => setCartOpen(false)} />
          <section className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-[#fffaf0] shadow-2xl sm:rounded-[2rem]">
            <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Table order</p>
                <h2 className="font-display text-2xl font-black">Review cart</h2>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} className="grid size-11 place-items-center rounded-full bg-stone-100"><X className="size-5" /></button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="space-y-3">
                {cart.map((line) => (
                  <div key={line.menuItem.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f7f1df] text-2xl">
                      {line.menuItem.imageUrl ? <img src={line.menuItem.imageUrl} alt="" className="size-full object-cover" /> : (MENU_CATEGORIES.find((category) => category.id === line.menuItem.category)?.icon || '🍽️')}
                    </div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{line.menuItem.name}</p><p className="mt-1 text-xs font-bold text-orange-700">{formatCurrency(line.menuItem.price * line.quantity)}</p></div>
                    <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50 p-1">
                      <button type="button" onClick={() => changeQuantity(line.menuItem.id, line.quantity - 1)} className="grid size-8 place-items-center rounded-lg bg-white shadow-sm"><Minus className="size-4" /></button>
                      <span className="min-w-8 text-center text-sm font-black">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.menuItem.id, line.quantity + 1)} className="grid size-8 place-items-center rounded-lg bg-stone-950 text-white"><Plus className="size-4" /></button>
                    </div>
                    <button type="button" onClick={() => removeFromCart(line.menuItem.id)} aria-label={`Remove ${line.menuItem.name}`} className="grid size-9 place-items-center rounded-xl text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-stone-500">How are you ordering?</p>
                <div className="grid grid-cols-2 rounded-2xl bg-stone-100 p-1.5">
                  <button type="button" disabled={Boolean(tableFromQr)} onClick={() => setOrderType('dine_in')} className={cn('rounded-xl px-3 py-3 text-sm font-black transition', orderType === 'dine_in' ? 'bg-stone-950 text-white shadow' : 'text-stone-500', tableFromQr && 'cursor-default')}>Dine in</button>
                  <button type="button" disabled={Boolean(tableFromQr)} onClick={() => setOrderType('takeaway')} className={cn('rounded-xl px-3 py-3 text-sm font-black transition', orderType === 'takeaway' ? 'bg-stone-950 text-white shadow' : 'text-stone-500', tableFromQr && 'cursor-not-allowed opacity-40')}>Takeaway</button>
                </div>

                {orderType === 'dine_in' && (
                  <div className="relative mt-3">
                    <button type="button" disabled={Boolean(tableFromQr)} onClick={() => setTablePickerOpen((open) => !open)} className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-black disabled:cursor-default">
                      <span className="flex items-center gap-2"><MapPin className="size-4 text-emerald-700" /> {tableNumber ? `Table ${tableNumber}` : 'Select table'}</span><ChevronDown className={cn('size-4 transition', tablePickerOpen && 'rotate-180')} />
                    </button>
                    {tablePickerOpen && !tableFromQr && (
                      <div className="mt-2 grid grid-cols-5 gap-2 rounded-2xl border border-stone-200 bg-white p-3">
                        {TABLE_NUMBERS.map((number) => <button type="button" key={number} onClick={() => { setTableNumber(number); setTablePickerOpen(false); }} className={cn('rounded-xl border px-2 py-2.5 text-sm font-black', tableNumber === number ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-stone-50')}>{number}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <label className="block text-xs font-black uppercase tracking-[0.16em] text-stone-500">Name <span className="normal-case tracking-normal text-stone-400">(optional)</span></label>
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3">
                  <UtensilsCrossed className="size-4 text-stone-400" />
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={80} placeholder="Your name" className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                </div>
                <label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-stone-500">Kitchen note <span className="normal-case tracking-normal text-stone-400">(optional)</span></label>
                <div className="mt-2 flex items-start gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-stone-400" />
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} rows={3} placeholder="Less spicy, no onion, allergy information..." className="min-w-0 flex-1 resize-none bg-transparent text-sm font-semibold outline-none" />
                </div>
              </div>

              <div className="rounded-3xl bg-stone-950 p-5 text-white">
                <div className="flex items-center justify-between text-sm"><span className="text-white/60">Items</span><span className="font-black">{cartCount}</span></div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3"><span className="font-black">Order total</span><span className="font-display text-3xl font-black text-amber-300">{formatCurrency(cartTotal)}</span></div>
                <p className="mt-2 text-xs leading-5 text-white/50">The cashier or serving staff will collect payment after confirming your order.</p>
              </div>

              {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
            </div>

            <footer className="border-t border-stone-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <button type="button" onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-800 to-emerald-700 px-5 text-sm font-black text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]">
                {submitting ? <><span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Sending to kitchen…</> : <><Sparkles className="size-5 text-amber-300" /> Place order · {formatCurrency(cartTotal)}</>}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
