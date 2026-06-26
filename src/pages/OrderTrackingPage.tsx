import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Search,
  ShoppingBag,
  Smartphone,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import snbLogo from '@/assets/snb-logo.png';

const PHONE_STORAGE_KEY = 'vrsnb-customer-phone';
const TAX_RATE = 0.03;

type TrackedItem = {
  barcode?: number;
  name: string;
  price: number;
  qty: number;
  unit?: string;
  category?: string;
};

type TrackedOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  items: TrackedItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

const STEPS = [
  { key: 'paid', label: 'Payment received', description: 'Your booking has been received.', icon: Check },
  { key: 'confirmed', label: 'Order confirmed', description: 'VRSNB Bakery has accepted the order.', icon: PackageCheck },
  { key: 'preparing', label: 'Preparing', description: 'Your bakery items are being prepared and packed.', icon: Clock3 },
  { key: 'ready', label: 'Ready', description: 'The order is packed and ready for dispatch.', icon: ShoppingBag },
  { key: 'out_for_delivery', label: 'Out for delivery', description: 'Your order is on the way.', icon: Truck },
  { key: 'completed', label: 'Delivered', description: 'The order has been delivered.', icon: CheckCircle2 },
] as const;

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normaliseOrder(raw: Record<string, unknown>): TrackedOrder {
  const items = Array.isArray(raw.items) ? raw.items as Array<Record<string, unknown>> : [];
  const normalisedItems = items.map((item) => ({
    barcode: item.barcode ? Number(item.barcode) : undefined,
    name: String(item.name || 'Bakery item'),
    price: safeNumber(item.price),
    qty: safeNumber(item.qty || item.quantity),
    unit: item.unit ? String(item.unit) : undefined,
    category: item.category ? String(item.category) : undefined,
  }));
  const derivedSubtotal = normalisedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const subtotal = safeNumber(raw.subtotal) || derivedSubtotal;
  const taxRate = safeNumber(raw.tax_rate) || 3;
  const taxAmount = safeNumber(raw.tax_amount) || Math.round(subtotal * TAX_RATE * 100) / 100;
  return {
    id: String(raw.id),
    order_number: String(raw.order_number || ''),
    customer_name: String(raw.customer_name || 'Customer'),
    items: normalisedItems,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    amount: safeNumber(raw.amount) || subtotal + taxAmount,
    status: String(raw.status || 'paid'),
    created_at: String(raw.created_at || new Date().toISOString()),
    updated_at: String(raw.updated_at || raw.created_at || new Date().toISOString()),
    completed_at: raw.completed_at ? String(raw.completed_at) : null,
    cancelled_at: raw.cancelled_at ? String(raw.cancelled_at) : null,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentStep(status: string) {
  const index = STEPS.findIndex((step) => step.key === status);
  if (index >= 0) return index;
  if (status === 'payment_pending') return -1;
  if (status === 'payment_failed') return -1;
  return 0;
}

function StatusTracker({ order }: { order: TrackedOrder }) {
  if (order.status === 'cancelled') {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-center">
        <XCircle className="mx-auto size-10 text-red-600" />
        <h3 className="mt-3 text-lg font-black text-red-800">Order cancelled</h3>
        <p className="mt-1 text-sm font-semibold text-red-600">Please contact VRSNB Bakery if you need more information.</p>
      </div>
    );
  }

  const activeIndex = currentStep(order.status);
  return (
    <div className="space-y-0">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const done = index < activeIndex || order.status === 'completed';
        const active = index === activeIndex && order.status !== 'completed';
        return (
          <div key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {index < STEPS.length - 1 && <div className={cn('absolute left-[19px] top-10 h-[calc(100%-22px)] w-0.5', index < activeIndex ? 'bg-emerald-500' : 'bg-stone-200')} />}
            <div className={cn('relative z-10 grid size-10 shrink-0 place-items-center rounded-2xl border-2 transition', done ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-amber-400 bg-amber-300 text-stone-950 shadow-lg shadow-amber-200' : 'border-stone-200 bg-white text-stone-300')}>
              {done ? <Check className="size-5" /> : <Icon className="size-5" />}
            </div>
            <div className="pt-0.5"><p className={cn('text-sm font-black', done || active ? 'text-stone-950' : 'text-stone-400')}>{step.label}</p><p className={cn('mt-0.5 text-xs font-semibold', active ? 'text-stone-600' : 'text-stone-400')}>{step.description}</p></div>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order, initiallyOpen }: { order: TrackedOrder; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const activeStep = currentStep(order.status);
  const statusLabel = order.status === 'cancelled'
    ? 'Cancelled'
    : STEPS[Math.max(0, activeStep)]?.label || order.status.replaceAll('_', ' ');
  return (
    <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-4 p-5 text-left sm:p-6">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl font-black">{order.order_number}</p><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide', order.status === 'cancelled' ? 'bg-red-100 text-red-700' : order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')}>{statusLabel}</span></div><p className="mt-1 text-xs font-bold text-stone-500">Placed {formatDateTime(order.created_at)} · Updated {formatDateTime(order.updated_at)}</p></div>
        <div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-lg font-black text-orange-700">{formatCurrency(order.amount)}</p><p className="text-[10px] font-bold text-stone-400">{order.items.length} products</p></div>{open ? <ChevronUp className="size-5 text-stone-400" /> : <ChevronDown className="size-5 text-stone-400" />}</div>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-stone-100 p-5 sm:p-6 lg:grid-cols-[1fr_340px]">
          <div><h3 className="text-sm font-black uppercase tracking-[0.14em] text-stone-500">Live order progress</h3><div className="mt-5"><StatusTracker order={order} /></div></div>
          <div className="rounded-3xl bg-stone-950 p-5 text-white"><h3 className="font-display text-lg font-black">Order bill</h3><div className="mt-4 space-y-2 border-b border-white/10 pb-4">{order.items.map((item, index) => <div key={`${item.barcode || item.name}-${index}`} className="flex justify-between gap-3 text-xs"><span className="min-w-0 text-white/70"><strong className="text-white">{item.qty}×</strong> {item.name}</span><strong className="shrink-0">{formatCurrency(item.price * item.qty)}</strong></div>)}</div><div className="mt-4 space-y-2 text-xs"><div className="flex justify-between text-white/60"><span>Subtotal</span><strong className="text-white">{formatCurrency(order.subtotal)}</strong></div><div className="flex justify-between text-white/60"><span>Tax ({order.tax_rate || 3}%)</span><strong className="text-white">{formatCurrency(order.tax_amount)}</strong></div><div className="flex justify-between border-t border-white/10 pt-3 text-base"><span className="font-black">Total paid</span><strong className="text-amber-300">{formatCurrency(order.amount)}</strong></div></div></div>
        </div>
      )}
    </article>
  );
}

export default function OrderTrackingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const phoneFromUrl = (searchParams.get('phone') || '').replace(/\D/g, '').slice(-10);
  const focusOrder = searchParams.get('order') || '';
  const storedPhone = typeof window !== 'undefined' ? localStorage.getItem(PHONE_STORAGE_KEY) || '' : '';
  const initialLookupDone = useRef(false);
  const [phone, setPhone] = useState(phoneFromUrl || storedPhone);
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const searchOrders = useCallback(async (requestedPhone = phone, silent = false) => {
    const digits = requestedPhone.replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(digits)) {
      if (!silent) setError('Enter the same 10-digit mobile number used for the order.');
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase.rpc('track_public_orders_by_phone', { p_phone: digits });
    if (fetchError) {
      setError(fetchError.message || 'Unable to load orders.');
      if (!silent) setLoading(false);
      return;
    }
    const rows = (data || []).map((row: Record<string, unknown>) => normaliseOrder(row));
    setOrders(rows);
    setSearched(true);
    localStorage.setItem(PHONE_STORAGE_KEY, digits);
    setSearchParams(focusOrder ? { phone: digits, order: focusOrder } : { phone: digits }, { replace: true });
    if (!silent) setLoading(false);
  }, [focusOrder, phone, setSearchParams]);

  useEffect(() => {
    if (initialLookupDone.current) return;
    initialLookupDone.current = true;
    if (phoneFromUrl && /^\d{10}$/.test(phoneFromUrl)) void searchOrders(phoneFromUrl);
  }, [phoneFromUrl, searchOrders]);

  useEffect(() => {
    if (!searched || !/^\d{10}$/.test(phone.replace(/\D/g, ''))) return;
    const timer = window.setInterval(() => void searchOrders(phone, true), 12000);
    return () => window.clearInterval(timer);
  }, [phone, searchOrders, searched]);

  const sortedOrders = useMemo(() => [...orders].sort((a, b) => {
    if (focusOrder) {
      if (a.order_number === focusOrder) return -1;
      if (b.order_number === focusOrder) return 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }), [focusOrder, orders]);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6"><button type="button" onClick={() => navigate('/order')} className="grid size-11 place-items-center rounded-2xl border border-stone-200 bg-white shadow-sm" aria-label="Back to ordering"><ArrowLeft className="size-5" /></button><img src={snbLogo} alt="VRSNB Bakery" className="size-11 rounded-2xl bg-white object-contain p-1 shadow-sm" /><div><p className="font-display text-lg font-black">VRSNB Bakery</p><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">Customer order tracking</p></div></div>
      </header>

      <section className="bg-stone-950 px-4 py-12 text-white sm:px-6">
        <div className="mx-auto max-w-6xl"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200"><MapPin className="size-3.5" /> Live order status</span><h1 className="mt-4 max-w-3xl font-display text-4xl font-black leading-none sm:text-6xl">Track your bakery order using your mobile number.</h1><p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-white/65">Enter the same number used during checkout. Your latest orders and current preparation or delivery stage will appear below.</p>
          <form onSubmit={(event) => { event.preventDefault(); void searchOrders(); }} className="mt-7 flex max-w-xl flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Smartphone className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" /><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="tel" placeholder="Enter 10-digit mobile number" className="h-14 w-full rounded-2xl border border-white/15 bg-white pl-12 pr-4 text-sm font-black text-stone-950 outline-none focus:ring-4 focus:ring-amber-300/30" /></label><button type="submit" disabled={loading} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 text-sm font-black text-stone-950 disabled:opacity-50">{loading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />} Track orders</button></form>
          {error && <p className="mt-3 max-w-xl rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200">{error}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? <div className="grid min-h-64 place-items-center rounded-3xl border border-stone-200 bg-white"><div className="text-center"><Loader2 className="mx-auto size-8 animate-spin text-amber-700" /><p className="mt-3 text-sm font-black text-stone-500">Finding your orders…</p></div></div>
          : searched && sortedOrders.length === 0 ? <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center"><div><AlertCircle className="mx-auto size-10 text-stone-300" /><h2 className="mt-3 text-xl font-black">No orders found</h2><p className="mt-2 max-w-md text-sm font-semibold text-stone-500">Check that the mobile number matches the one entered during payment.</p><button type="button" onClick={() => navigate('/order')} className="mt-5 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-black text-white">Place a new order</button></div></div>
          : sortedOrders.length > 0 ? <div><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Your bookings</p><h2 className="mt-1 font-display text-2xl font-black">{sortedOrders.length} order{sortedOrders.length === 1 ? '' : 's'} found</h2></div><p className="inline-flex items-center gap-2 text-xs font-bold text-stone-500"><span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Refreshes automatically</p></div><div className="space-y-4">{sortedOrders.map((order, index) => <OrderCard key={order.id} order={order} initiallyOpen={index === 0} />)}</div></div>
          : <div className="grid gap-4 sm:grid-cols-3">{[[Smartphone, 'Enter your mobile', 'Use the exact number provided at checkout.'], [PackageCheck, 'See every order', 'Recent paid bakery bookings appear together.'], [Truck, 'Follow progress', 'Track preparation, packing and delivery live.']].map(([Icon, title, copy]) => { const IconComponent = Icon as typeof Smartphone; return <div key={String(title)} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><IconComponent className="size-7 text-amber-700" /><h2 className="mt-4 font-black">{String(title)}</h2><p className="mt-2 text-sm font-semibold leading-6 text-stone-500">{String(copy)}</p></div>; })}</div>}
      </section>
    </main>
  );
}
