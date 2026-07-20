// src/bakery/CakeMasterDashboard.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Cake, CheckCircle2, Send, Loader2, AlertTriangle,
  Phone, Receipt, Calendar, ChevronDown, ChevronUp, RefreshCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

type CakeOrderStatus = 'New' | 'Accepted' | 'Baking' | 'Ready for Packing' | 'Packed' | 'Dispatched';

interface CakeMasterOrder {
  id: string;
  branch: 'SNB' | 'VRSNB';
  orderNo: string;
  slipNumber: string | null;
  customerName: string;
  mobile: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  cakeKg: string | null;
  quantity: number | null;
  preparedQuantity: number | null;
  flavor: string | null;
  shape: string | null;
  creamType: string | null;
  messageOnCake: string | null;
  designNotes: string | null;
  orderValue: number;
  advanceAmount: number;
  balanceAmount: number;
  status: CakeOrderStatus;
  createdAt: string;
}

function mapRow(d: any): CakeMasterOrder {
  return {
    id: d.id,
    branch: d.branch,
    orderNo: d.order_no,
    slipNumber: d.slip_number,
    customerName: d.customer_name || '',
    mobile: d.mobile,
    deliveryDate: d.delivery_date,
    deliveryTime: d.delivery_time,
    cakeKg: d.cake_kg,
    quantity: d.quantity !== null ? Number(d.quantity) : null,
    preparedQuantity: d.prepared_quantity !== null ? Number(d.prepared_quantity) : null,
    flavor: d.flavor,
    shape: d.shape,
    creamType: d.cream_type,
    messageOnCake: d.message_on_cake,
    designNotes: d.design_notes,
    orderValue: Number(d.order_value || 0),
    advanceAmount: Number(d.advance_amount || 0),
    balanceAmount: Number(d.balance_amount || 0),
    status: d.status,
    createdAt: d.created_at,
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const STATUS_STYLES: Record<CakeOrderStatus, string> = {
  New: 'bg-blue-100 text-blue-800',
  Accepted: 'bg-amber-100 text-amber-800',
  Baking: 'bg-orange-100 text-orange-800',
  'Ready for Packing': 'bg-indigo-100 text-indigo-800',
  Packed: 'bg-cyan-100 text-cyan-800',
  Dispatched: 'bg-emerald-100 text-emerald-800',
};

function playNewOrderAlert() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const totalMs = 10_000;
    const beepEveryMs = 900;
    let elapsed = 0;
    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };
    beep();
    const interval = window.setInterval(() => {
      elapsed += beepEveryMs;
      if (elapsed >= totalMs) { window.clearInterval(interval); window.setTimeout(() => ctx.close(), 500); return; }
      beep();
    }, beepEveryMs);
  } catch {
    // Autoplay policy can block audio before first user interaction — not fatal.
  }
}

function OrderCard({
  order, busy, onAdvance, unnoticed,
}: {
  order: CakeMasterOrder;
  busy: boolean;
  onAdvance: (order: CakeMasterOrder, next: CakeOrderStatus, preparedQty?: number) => void;
  unnoticed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [packingQty, setPackingQty] = useState(String(order.preparedQuantity ?? order.cakeKg ?? order.quantity ?? ''));
  const showPackingInput = order.status === 'Baking';

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border bg-white shadow-sm',
      unnoticed ? 'border-red-300 ring-2 ring-red-200' : 'border-slate-200',
    )}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50">
            <Cake className="size-5 text-rose-500" />
            {unnoticed && <span className="absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full bg-red-500" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
              <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-black', STATUS_STYLES[order.status])}>{order.status}</span>
              {order.slipNumber && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Slip {order.slipNumber}</span>}
              {unnoticed && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">NEEDS ATTENTION</span>}
            </div>
            <p className="mt-0.5 truncate text-sm font-black text-slate-950">{order.customerName || 'Customer'} · {order.orderNo}</p>
            <p className="truncate text-[11px] font-bold text-slate-500">
              {order.cakeKg} · {order.flavor} · {order.shape}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Delivery</p>
            <p className="text-xs font-black text-slate-800">{fmtDate(order.deliveryDate)} · {order.deliveryTime || '—'}</p>
          </div>
          {open ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3.5">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold text-slate-400">Order No</p><p className="flex items-center gap-1 font-black text-slate-800"><Receipt className="size-3" />{order.orderNo}</p></div>
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold text-slate-400">Slip No</p><p className="font-black text-slate-800">{order.slipNumber || '—'}</p></div>
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold text-slate-400">Mobile</p><p className="flex items-center gap-1 font-black text-slate-800"><Phone className="size-3" />{order.mobile || '—'}</p></div>
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold text-slate-400">Cream</p><p className="font-black text-slate-800">{order.creamType || '—'}</p></div>
          </div>
          {(order.messageOnCake || order.designNotes) && (
            <div className="rounded-xl bg-amber-50 p-2.5 text-xs">
              {order.messageOnCake && <p><span className="font-bold text-amber-700">Message on cake: </span>{order.messageOnCake}</p>}
              {order.designNotes && <p className="mt-1"><span className="font-bold text-amber-700">Design notes: </span>{order.designNotes}</p>}
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs">
            <span className="font-bold text-slate-500">Order Value ₹{order.orderValue.toFixed(2)} · Advance ₹{order.advanceAmount.toFixed(2)}</span>
            <span className="font-black text-slate-800">Balance ₹{order.balanceAmount.toFixed(2)}</span>
          </div>

          {order.status === 'New' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance(order, 'Baking')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Accept Order
            </button>
          )}

          {showPackingInput && (
            <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-indigo-700">Quantity Prepared</p>
              <p className="text-[11px] font-bold text-indigo-600">Enter the actual weight/count prepared — the bill and balance will recalculate automatically.</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={packingQty}
                  onChange={(e) => setPackingQty(e.target.value)}
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  type="button"
                  disabled={busy || !packingQty || Number(packingQty) <= 0}
                  onClick={() => onAdvance(order, 'Ready for Packing', Number(packingQty))}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white active:scale-95 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send to Packing
                </button>
              </div>
            </div>
          )}

          {order.status === 'Ready for Packing' && (
            <p className="text-center text-[11px] font-bold text-indigo-600">
              Sent to Packing{order.preparedQuantity ? ` — prepared ${order.preparedQuantity}` : ''} — waiting for dispatch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CakeMasterDashboard() {
  const { currentUser } = useAuthStore();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('tab') === 'all' ? 'all' : 'today';

  const [orders, setOrders] = useState<CakeMasterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('cake_master_orders')
      .select('id, branch, order_no, slip_number, customer_name, mobile, delivery_date, delivery_time, cake_kg, quantity, prepared_quantity, flavor, shape, cream_type, message_on_cake, design_notes, order_value, advance_amount, balance_amount, status, created_at')
      .order('delivery_date', { ascending: true })
      .order('delivery_time', { ascending: true })
      .limit(500);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError('');
    const mapped = (data || []).map(mapRow);
    setOrders(mapped);

    if (knownIds.current === null) {
      knownIds.current = new Set(mapped.map((o) => o.id));
    } else {
      const isNew = mapped.some((o) => o.status === 'New' && !knownIds.current!.has(o.id));
      if (isNew) playNewOrderAlert();
      knownIds.current = new Set(mapped.map((o) => o.id));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('cake_master_orders_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cake_master_orders' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const today = todayStr();
  const todaysOrders = useMemo(
    () => orders.filter((o) => o.deliveryDate === today && o.status !== 'Dispatched'),
    [orders, today],
  );
  const visibleOrders = view === 'today' ? todaysOrders : orders;

  const unnoticedIds = useMemo(
    () => new Set(orders.filter((o) => o.status === 'New').map((o) => o.id)),
    [orders],
  );
  const newCount = unnoticedIds.size;
  const bakingCount = useMemo(() => orders.filter((o) => o.status === 'Baking').length, [orders]);

  const advance = async (order: CakeMasterOrder, next: CakeOrderStatus, preparedQty?: number) => {
    setBusyId(order.id);
    const { error: err } = await supabase.rpc('update_cake_master_order_status', {
      p_id: order.id,
      p_new_status: next,
      p_actor: currentUser?.displayName || currentUser?.username || 'Cake Master',
      p_prepared_quantity: preparedQty ?? null,
    });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    await load();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {newCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-3.5 py-2.5">
          <AlertTriangle className="size-4 shrink-0 animate-pulse text-red-600" />
          <p className="text-xs font-black text-red-800">
            {newCount} new order{newCount > 1 ? 's' : ''} waiting to be accepted.
          </p>
        </div>
      )}
      {bakingCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p className="text-xs font-black text-amber-800">
            {bakingCount} order{bakingCount > 1 ? 's' : ''} in progress — not yet sent to Packing.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-slate-500" />
          <h2 className="text-sm font-black text-slate-950">
            {view === 'today' ? "Today's Deliveries" : 'All Cake Orders'}
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{visibleOrders.length}</span>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-black text-slate-600 disabled:cursor-wait disabled:opacity-60">
          <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : visibleOrders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <Cake className="size-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-400">
            {view === 'today' ? 'No cake deliveries scheduled for today.' : 'No cake orders yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              onAdvance={advance}
              unnoticed={unnoticedIds.has(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
