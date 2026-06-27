import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { catalogCategories, useBranchCatalogStore, type BranchCatalogItem } from '@/stores/branchCatalogStore';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import snbLogo from '@/assets/snb-logo.png';
import bakeryHero from '@/assets/bakery/bakery-counter.jpg';

const CART_STORAGE_KEY = 'vrsnb-customer-order-v2';
const PHONE_STORAGE_KEY = 'vrsnb-customer-phone';
const TAX_RATE = 0.03;

type CartLine = BranchCatalogItem & { quantity: number };
type CheckoutForm = {
  name: string;
  phone: string;
  address: string;
  locationPin: string;
  note: string;
  deliverySlot: string;
};
type StoredOrderDraft = { cart: CartLine[]; customer: CheckoutForm };

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const EMPTY_CUSTOMER: CheckoutForm = {
  name: '',
  phone: '',
  address: '',
  locationPin: '',
  note: '',
  deliverySlot: 'As soon as possible',
};

const CATEGORY_EMOJI: Record<string, string> = {
  CHIPS: '🥔', MURUK: '🥨', MIXTURE: '🥣', PAKODA: '🧆', NIPPAT: '🫓', DAL: '🌾',
  BAKERY: '🥐', CAKE: '🎂', COOKIES: '🍪', HALWA: '🍮', JAMUN: '🟤',
  'MYSORE PAK': '🟨', BAKLAVA: '🥮', 'CASHEW SWEETS': '🌰', 'CASHEW BISCUIT': '🍪',
  'CAKE ROLL': '🍰', BURFI: '◇', PEDA: '🟠', LADDU: '🟡', 'CASHEW LADDU': '🌰',
  MIX: '🎁', CHOCOLATE: '🍫', SWEETS: '🍬', 'SPL SWEETS': '✨',
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function quantityStep(item: BranchCatalogItem) {
  return item.uom === 'Kgs' ? 0.25 : 1;
}

function quantityLabel(line: CartLine) {
  return line.uom === 'Kgs' ? `${line.quantity.toFixed(2)} kg` : `${line.quantity} ${line.quantity === 1 ? 'item' : 'items'}`;
}

function loadStoredDraft(): StoredOrderDraft {
  if (typeof window === 'undefined') return { cart: [], customer: EMPTY_CUSTOMER };
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}') as Partial<StoredOrderDraft>;
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      customer: { ...EMPTY_CUSTOMER, ...(parsed.customer || {}) },
    };
  } catch {
    return { cart: [], customer: EMPTY_CUSTOMER };
  }
}

async function ensureRazorpayLoaded() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-vrsnb-razorpay="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load secure payment.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.vrsnbRazorpay = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load secure payment.'));
    document.head.appendChild(script);
  });
}

export default function QROrderPage() {
  const navigate = useNavigate();
  const initialDraft = useMemo(loadStoredDraft, []);
  const [cart, setCart] = useState<CartLine[]>(initialDraft.cart);
  const [customer, setCustomer] = useState<CheckoutForm>(initialDraft.customer);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [screen, setScreen] = useState<'menu' | 'checkout'>('menu');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [addedNotice, setAddedNotice] = useState('');
  const { items: catalogByBranch, loadCatalog, subscribe } = useBranchCatalogStore();
  const catalogItems = useMemo(() => catalogByBranch.VRSNB.filter((item) => item.active), [catalogByBranch]);
  const categories = useMemo(() => catalogCategories(catalogItems), [catalogItems]);

  useEffect(() => {
    void loadCatalog('VRSNB');
    return subscribe('VRSNB');
  }, [loadCatalog, subscribe]);

  useEffect(() => {
    if (!catalogItems.length) return;
    setCart((current) => current.flatMap((line) => {
      const latest = catalogItems.find((item) => item.barcode === line.barcode);
      return latest ? [{ ...latest, quantity: line.quantity }] : [];
    }));
  }, [catalogItems]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ cart, customer } satisfies StoredOrderDraft));
  }, [cart, customer]);

  useEffect(() => {
    if (!addedNotice) return;
    const timer = window.setTimeout(() => setAddedNotice(''), 1600);
    return () => window.clearTimeout(timer);
  }, [addedNotice]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogItems.filter((item) => (
      (selectedCategory === 'all' || item.category === selectedCategory)
      && (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || String(item.barcode).includes(q))
    ));
  }, [catalogItems, search, selectedCategory]);

  const subtotal = useMemo(() => roundMoney(cart.reduce((sum, line) => sum + line.price * line.quantity, 0)), [cart]);
  const taxAmount = useMemo(() => roundMoney(subtotal * TAX_RATE), [subtotal]);
  const grandTotal = useMemo(() => roundMoney(subtotal + taxAmount), [subtotal, taxAmount]);
  const cartUnits = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const getQuantity = (barcode: number) => cart.find((line) => line.barcode === barcode)?.quantity || 0;

  const setQuantity = (item: BranchCatalogItem, next: number) => {
    const safeNext = Math.max(0, Math.round(next * 100) / 100);
    setCart((current) => {
      if (safeNext <= 0) return current.filter((line) => line.barcode !== item.barcode);
      const existing = current.some((line) => line.barcode === item.barcode);
      return existing
        ? current.map((line) => line.barcode === item.barcode ? { ...line, quantity: safeNext } : line)
        : [...current, { ...item, quantity: safeNext }];
    });
  };

  const addItem = (item: BranchCatalogItem) => {
    setQuantity(item, getQuantity(item.barcode) + quantityStep(item));
    setAddedNotice(`${item.name} added to cart`);
  };

  const validateCheckout = () => {
    if (!cart.length) return 'Add at least one bakery item.';
    if (!customer.name.trim()) return 'Enter the customer name.';
    if (!/^\d{10}$/.test(customer.phone.replace(/\D/g, ''))) return 'Enter a valid 10-digit mobile number.';
    if (!customer.address.trim()) return 'Enter the complete delivery address.';
    if (!customer.locationPin.trim()) return 'Enter the area PIN code or map link.';
    return '';
  };

  const openCheckout = () => {
    if (!cart.length) {
      setError('Add at least one item before checkout.');
      return;
    }
    setError('');
    setScreen('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const payAndPlaceOrder = async () => {
    const validationError = validateCheckout();
    if (validationError) {
      setError(validationError);
      return;
    }

    setPaying(true);
    setError('');
    try {
      await ensureRazorpayLoaded();
      const phone = customer.phone.replace(/\D/g, '');
      const items = cart.map((line) => ({ barcode: line.barcode, qty: line.quantity }));
      const { data, error: createError } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          customer: { ...customer, phone },
          items,
          subtotal,
          taxRate: 3,
          taxAmount,
          amount: Math.round(grandTotal * 100),
          notes: { source: 'vrsnb_customer_booking', deliverySlot: customer.deliverySlot },
        },
      });
      if (createError || !data?.orderId || !data?.keyId || !data?.publicOrderId) {
        throw new Error(createError?.message || data?.error || 'Unable to create the order.');
      }
      if (!window.Razorpay) throw new Error('Secure payment is unavailable. Please refresh and retry.');

      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: 'INR',
        name: 'VRSNB Bakery',
        description: `Bakery order · ${cart.length} products`,
        order_id: data.orderId,
        prefill: { name: customer.name.trim(), contact: phone },
        notes: { public_order_id: data.publicOrderId, tax_rate: '3%' },
        theme: { color: '#16120d' },
        modal: { ondismiss: () => setPaying(false) },
        config: {
          display: {
            blocks: {
              upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
              wallet: { name: 'Pay via Wallet', instruments: [{ method: 'wallet' }] },
            },
            sequence: ['block.upi', 'block.wallet'],
            preferences: { show_default_blocks: false },
          },
        },
        handler: async (response: RazorpayResponse) => {
          try {
            const { data: verified, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
              body: { ...response, publicOrderId: data.publicOrderId },
            });
            if (verifyError || !verified?.success) throw new Error(verifyError?.message || verified?.error || 'Payment verification failed.');
            localStorage.setItem(PHONE_STORAGE_KEY, phone);
            localStorage.removeItem(CART_STORAGE_KEY);
            setCart([]);
            setCustomer(EMPTY_CUSTOMER);
            navigate(`/order/track?phone=${encodeURIComponent(phone)}&order=${encodeURIComponent(verified.orderNumber || data.orderNumber || '')}`, { replace: true });
          } catch (verificationError) {
            setError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
            setPaying(false);
          }
        },
      });
      razorpay.open();
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'Unable to place the order.');
      setPaying(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#f7f2e8]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => screen === 'checkout' ? setScreen('menu') : navigate('/')} className="grid size-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white shadow-sm" aria-label="Go back">
            <ArrowLeft className="size-5" />
          </button>
          <button type="button" onClick={() => { setScreen('menu'); window.scrollTo({ top: 0 }); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <img src={snbLogo} alt="VRSNB Bakery" className="size-11 rounded-2xl bg-white object-contain p-1.5 shadow-sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-black">VRSNB Bakery</p>
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Fresh bakery ordering</p>
            </div>
          </button>
          <button type="button" onClick={() => navigate('/order/track')} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 text-xs font-black shadow-sm sm:px-4">
            <PackageCheck className="size-4" /><span className="hidden sm:inline">Track order</span>
          </button>
        </div>
      </header>

      {addedNotice && (
        <div className="fixed left-1/2 top-20 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-xl" role="status" aria-live="polite">
          <Check className="size-4" /> {addedNotice}
        </div>
      )}

      {screen === 'menu' ? (
        <>
          <section className="relative overflow-hidden bg-stone-950 text-white">
            <img src={bakeryHero} alt="VRSNB bakery display" className="absolute inset-0 h-full w-full object-cover opacity-35" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/25" />
            <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_340px] md:items-end md:py-16">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 backdrop-blur">
                  <Clock3 className="size-3.5" /> Fresh orders · 6 AM–10 PM
                </span>
                <h1 className="mt-5 max-w-3xl font-display text-4xl font-black leading-[.96] sm:text-6xl">Order VRSNB bakery favourites in a few simple steps.</h1>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-white/70 sm:text-base">Choose products, adjust quantity, enter delivery details, pay securely and track the order using the same mobile number.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[['1', 'Add items'], ['2', 'Pay'], ['3', 'Track']].map(([step, label]) => (
                    <div key={step} className="rounded-2xl bg-black/25 p-3"><p className="text-xl font-black text-amber-300">{step}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-white/70">{label}</p></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="sticky top-[69px] z-40 border-b border-stone-200 bg-[#f7f2e8]/95 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cakes, sweets, savouries or barcode" className="h-14 w-full rounded-2xl border border-stone-200 bg-white pl-12 pr-12 text-sm font-bold shadow-sm outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-200/50" />
                {search && <button type="button" onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" aria-label="Clear search"><X className="size-5" /></button>}
              </div>

              <label className="block md:hidden">
                <span className="sr-only">Choose category</span>
                <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-black outline-none focus:border-amber-500">
                  <option value="all">All categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>

              <div className="hidden flex-wrap gap-2 md:flex">
                <button type="button" onClick={() => setSelectedCategory('all')} className={cn('rounded-full px-4 py-2 text-xs font-black transition', selectedCategory === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:border-amber-400')}>All products</button>
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={cn('rounded-full px-3 py-2 text-xs font-black transition', selectedCategory === category ? 'bg-amber-400 text-stone-950' : 'border border-stone-200 bg-white text-stone-700 hover:border-amber-400')}>
                    {CATEGORY_EMOJI[category] || '•'} {category}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-7 pb-32 sm:px-6 lg:pb-12">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">VRSNB catalogue</p><h2 className="mt-1 font-display text-2xl font-black">{selectedCategory === 'all' ? 'All bakery products' : selectedCategory}</h2></div>
              <p className="text-xs font-bold text-stone-500">{filteredItems.length} products</p>
            </div>

            {filteredItems.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredItems.map((item) => {
                  const quantity = getQuantity(item.barcode);
                  const step = quantityStep(item);
                  return (
                    <article key={item.barcode} className={cn('flex min-h-[245px] flex-col overflow-hidden rounded-3xl border bg-white p-3 shadow-sm transition', quantity > 0 ? 'border-amber-400 ring-2 ring-amber-100' : 'border-stone-200 hover:-translate-y-0.5 hover:shadow-lg')}>
                      <div className="grid h-24 place-items-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 text-4xl">{CATEGORY_EMOJI[item.category] || '🥐'}</div>
                      <div className="flex flex-1 flex-col pt-3">
                        <p className="line-clamp-2 text-sm font-black leading-5">{item.name}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-stone-400">{item.category} · {item.uom === 'Kgs' ? 'Price per kg' : 'Per pack/item'}</p>
                        <p className="mt-2 text-lg font-black text-orange-700">{formatCurrency(item.price)}</p>
                        <div className="mt-auto pt-3">
                          {quantity <= 0 ? (
                            <button type="button" onClick={() => addItem(item)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 text-sm font-black text-white active:scale-[.98]"><Plus className="size-4" /> Add</button>
                          ) : (
                            <div className="flex h-11 items-center justify-between rounded-2xl bg-stone-950 p-1 text-white">
                              <button type="button" onClick={() => setQuantity(item, quantity - step)} className="grid size-9 place-items-center rounded-xl bg-white/10" aria-label={`Decrease ${item.name}`}><Minus className="size-4" /></button>
                              <div className="text-center"><p className="text-sm font-black leading-none">{item.uom === 'Kgs' ? quantity.toFixed(2) : quantity}</p><p className="mt-0.5 text-[8px] font-bold uppercase text-white/55">{item.uom}</p></div>
                              <button type="button" onClick={() => addItem(item)} className="grid size-9 place-items-center rounded-xl bg-amber-300 text-stone-950" aria-label={`Increase ${item.name}`}><Plus className="size-4" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center"><Search className="mx-auto size-8 text-stone-300" /><p className="mt-3 font-black">No matching bakery products</p><button type="button" onClick={() => { setSearch(''); setSelectedCategory('all'); }} className="mt-3 text-sm font-black text-orange-700">Clear filters</button></div>
            )}
          </section>

          {cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-stone-950 p-3 text-white shadow-2xl lg:sticky lg:bottom-0">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                <button type="button" onClick={openCheckout} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-300 text-stone-950"><ShoppingBag className="size-5" /></span>
                  <span className="min-w-0"><strong className="block truncate text-sm">{cart.length} products · {cartUnits.toFixed(cart.some((line) => line.uom === 'Kgs') ? 2 : 0)} units</strong><small className="text-white/55">Includes 3% tax at checkout</small></span>
                </button>
                <button type="button" onClick={openCheckout} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-stone-950 sm:px-6">
                  {formatCurrency(grandTotal)} <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
          <div className="space-y-5">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Step 1</p><h1 className="mt-1 font-display text-2xl font-black">Review your bakery order</h1></div><button type="button" onClick={() => setScreen('menu')} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black">Add more</button></div>
              <div className="mt-5 space-y-3">
                {cart.map((line) => {
                  const step = quantityStep(line);
                  return (
                    <article key={line.barcode} className="flex gap-3 rounded-2xl border border-stone-200 p-3">
                      <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-amber-50 text-2xl">{CATEGORY_EMOJI[line.category] || '🥐'}</div>
                      <div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><div><p className="font-black">{line.name}</p><p className="text-[10px] font-black uppercase text-stone-400">{quantityLabel(line)} · {formatCurrency(line.price)} {line.uom === 'Kgs' ? '/ kg' : ''}</p></div><button type="button" onClick={() => setQuantity(line, 0)} className="text-stone-400" aria-label={`Remove ${line.name}`}><Trash2 className="size-4" /></button></div>
                        <div className="mt-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 rounded-xl bg-stone-100 p-1"><button type="button" onClick={() => setQuantity(line, line.quantity - step)} className="grid size-8 place-items-center rounded-lg bg-white"><Minus className="size-3.5" /></button><span className="min-w-12 text-center text-xs font-black">{line.uom === 'Kgs' ? line.quantity.toFixed(2) : line.quantity}</span><button type="button" onClick={() => setQuantity(line, line.quantity + step)} className="grid size-8 place-items-center rounded-lg bg-stone-950 text-white"><Plus className="size-3.5" /></button></div><p className="font-black text-orange-700">{formatCurrency(line.price * line.quantity)}</p></div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Step 2</p><h2 className="mt-1 font-display text-2xl font-black">Delivery and contact details</h2>
              <p className="mt-2 text-sm font-semibold text-stone-500">Use the same mobile number later to track every status update.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-xs font-black">Customer name *</span><input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} autoComplete="name" className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="Full name" /></label>
                <label className="space-y-1.5"><span className="text-xs font-black">Mobile number *</span><div className="relative"><Smartphone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" autoComplete="tel" className="h-12 w-full rounded-2xl border border-stone-200 pl-11 pr-4 text-sm font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="10-digit mobile" /></div></label>
                <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-black">Delivery address *</span><textarea value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} autoComplete="street-address" className="min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="House/shop, street, area and landmark" /></label>
                <label className="space-y-1.5"><span className="text-xs font-black">PIN code or map link *</span><div className="relative"><MapPin className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><input value={customer.locationPin} onChange={(event) => setCustomer({ ...customer, locationPin: event.target.value })} className="h-12 w-full rounded-2xl border border-stone-200 pl-11 pr-4 text-sm font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="635105 or Google Maps link" /></div></label>
                <label className="space-y-1.5"><span className="text-xs font-black">Preferred delivery</span><select value={customer.deliverySlot} onChange={(event) => setCustomer({ ...customer, deliverySlot: event.target.value })} className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold outline-none focus:border-amber-500"><option>As soon as possible</option><option>Morning · 8 AM–12 PM</option><option>Afternoon · 12 PM–4 PM</option><option>Evening · 4 PM–8 PM</option></select></label>
                <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-black">Order notes</span><textarea value={customer.note} onChange={(event) => setCustomer({ ...customer, note: event.target.value })} className="min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="Cake message, packing request or delivery instructions" /></label>
              </div>
            </div>
          </div>

          <aside className="sticky top-24 rounded-3xl bg-stone-950 p-5 text-white shadow-2xl sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Final bill</p><h2 className="mt-1 font-display text-2xl font-black">Payment summary</h2>
            <div className="mt-5 space-y-3 border-y border-white/10 py-5 text-sm"><div className="flex justify-between text-white/70"><span>Subtotal</span><strong className="text-white">{formatCurrency(subtotal)}</strong></div><div className="flex justify-between text-white/70"><span>Tax (3%)</span><strong className="text-white">{formatCurrency(taxAmount)}</strong></div><div className="flex justify-between text-lg"><span className="font-black">Grand total</span><strong className="text-amber-300">{formatCurrency(grandTotal)}</strong></div></div>
            <div className="mt-5 grid gap-2 text-xs font-bold text-white/60"><p className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-400" /> Secure Razorpay payment</p><p className="flex items-center gap-2"><Truck className="size-4 text-amber-300" /> Delivery status tracking by mobile</p><p className="flex items-center gap-2"><PackageCheck className="size-4 text-blue-300" /> Order details saved after payment</p></div>
            {error && <p className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-3 text-xs font-bold text-red-200">{error}</p>}
            <button type="button" onClick={() => void payAndPlaceOrder()} disabled={paying || !cart.length} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"><CreditCard className={cn('size-5', paying && 'animate-pulse')} /> {paying ? 'Opening secure payment…' : `Pay ${formatCurrency(grandTotal)} & place order`}</button>
            <button type="button" onClick={() => setScreen('menu')} className="mt-3 w-full rounded-2xl border border-white/10 px-4 py-3 text-xs font-black text-white/70">Continue shopping</button>
          </aside>
        </section>
      )}
    </main>
  );
}
