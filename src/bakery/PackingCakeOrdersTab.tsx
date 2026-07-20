// src/bakery/PackingCakeOrdersTab.tsx
import { useCallback, useEffect, useState } from 'react';
import { Cake, Loader2, Package, Send, AlertTriangle, RefreshCcw, Receipt, Printer, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureCakeDispatchIncoming } from '@/branch/cakeDispatchSync';
import { printHtml } from '@/branch/printUtils';

interface CakeOrderRow {
  id: string;
  branch: 'SNB' | 'VRSNB';
  order_no: string;
  source_order_id: string | null;
  slip_number: string | null;
  customer_name: string;
  delivery_date: string | null;
  delivery_time: string | null;
  cake_kg: string | null;
  prepared_quantity: number | null;
  flavor: string | null;
  shape: string | null;
  cream_type: string | null;
  message_on_cake: string | null;
  design_notes: string | null;
  updated_at: string | null;
  created_at: string | null;
  status: string;
  correction_reason: string | null;
  correction_requested_by: string | null;
  correction_requested_at: string | null;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function printPackingChecklist(order: CakeOrderRow, packingUser: string) {
  const checks = [
    'Order number, customer and destination branch matched',
    'Cream type, flavour and shape verified',
    'Prepared weight checked and written below',
    'Cake message and spelling verified',
    'Design notes / reference matched',
    'Finish, damage and temperature checked',
    'Board, box, knife, candles and accessories checked',
    'Delivery date and time verified before dispatch',
  ];
  printHtml(`Packing Checklist ${order.order_no}`, `
    <div class="stamp">Cake Packing Checklist</div>
    <h2>${escapeHtml(order.branch)} - ${escapeHtml(order.order_no)}</h2>
    <div class="card">
      <div class="row"><span>Customer</span><b>${escapeHtml(order.customer_name || 'Customer')}</b></div>
      <div class="row"><span>Slip Number</span><b>${escapeHtml(order.slip_number || '-')}</b></div>
      <div class="row"><span>Delivery</span><b>${escapeHtml(fmtDate(order.delivery_date))} ${escapeHtml(order.delivery_time || '')}</b></div>
      <div class="row"><span>Cake</span><b>${escapeHtml(order.cream_type || '-')} / ${escapeHtml(order.flavor || '-')} / ${escapeHtml(order.shape || '-')}</b></div>
      <div class="row"><span>Ordered Weight</span><b>${escapeHtml(order.cake_kg || '-')} kg</b></div>
      <div class="row"><span>Prepared Weight</span><b>${escapeHtml(order.prepared_quantity ?? '-')} kg</b></div>
      <div class="row"><span>Message</span><b>${escapeHtml(order.message_on_cake || '-')}</b></div>
      <div class="row"><span>Design Notes</span><b>${escapeHtml(order.design_notes || '-')}</b></div>
    </div>
    <section class="section"><h3>Final Packing Checks</h3>
      <table><tbody>${checks.map((check) => `<tr><td style="width:34px;font-size:20px">&#9633;</td><td>${escapeHtml(check)}</td><td style="width:150px">Initial: __________</td></tr>`).join('')}</tbody></table>
    </section>
    <div class="card">
      <div class="row"><span>Actual Weight Rechecked</span><b>____________ kg</b></div>
      <div class="row"><span>Packed By</span><b>${escapeHtml(packingUser)}</b></div>
      <div class="row"><span>Packer Signature</span><b>________________________</b></div>
      <div class="row"><span>Dispatch Handover</span><b>________________________</b></div>
      <div class="row"><span>Date / Time</span><b>________________________</b></div>
    </div>`);
}

export default function PackingCakeOrdersTab() {
  const { currentUser } = useAuthStore();
  const [orders, setOrders] = useState<CakeOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'ready' | 'corrections'>('ready');
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('cake_master_orders')
      .select('id,branch,order_no,source_order_id,slip_number,customer_name,delivery_date,delivery_time,cake_kg,prepared_quantity,flavor,shape,cream_type,message_on_cake,design_notes,updated_at,created_at,status,correction_reason,correction_requested_by,correction_requested_at')
      .in('status', ['Ready for Packing', 'Packed', 'Correction Required'])
      .order('delivery_date', { ascending: true });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError('');
    setOrders((data || []) as CakeOrderRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('packing_cake_orders_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cake_master_orders' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const dispatch = async (order: CakeOrderRow) => {
    setBusyId(order.id);
    const actor = currentUser?.displayName || currentUser?.username || 'Packing';
    try {
      if (order.status === 'Ready for Packing') {
        const { error: packedError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Packed', p_actor: actor });
        if (packedError) throw new Error(packedError.message);
      }

      // Keep cakes on the same confirm-into-stock path as regular dispatches.
      await ensureCakeDispatchIncoming(order, actor);
      const { error: dispatchError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Dispatched', p_actor: actor });
      if (dispatchError) throw new Error(dispatchError.message);
      setError('');
      await load();
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : 'Cake dispatch failed.');
    } finally {
      setBusyId(null);
    }
  };

  const returnToCakeMaster = async (order: CakeOrderRow) => {
    if (!returnReason.trim()) { setError('Enter why the cake weight does not match.'); return; }
    setBusyId(order.id);
    const { error: returnError } = await supabase.rpc('return_cake_order_for_correction_secure', { p_id: order.id, p_reason: returnReason.trim() });
    setBusyId(null);
    if (returnError) { setError(returnError.message); return; }
    setReturnId(null);
    setReturnReason('');
    setError('');
    setView('corrections');
    await load();
  };

  const visibleOrders = orders.filter(order => view === 'corrections' ? order.status === 'Correction Required' : order.status !== 'Correction Required');

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2">
          <Cake className="size-4 text-rose-500" />
          <h3 className="text-sm font-black text-foreground">Cake Packing</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black text-muted-foreground">{visibleOrders.length}</span>
        </div>
        <div className="flex items-center gap-2"><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setView('ready')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'ready' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>Ready</button><button type="button" onClick={() => setView('corrections')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'corrections' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-500')}>Corrections ({orders.filter(order => order.status === 'Correction Required').length})</button></div><button type="button" title="Refresh cake orders" onClick={() => void load()} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} /></button></div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      {!loading && visibleOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-bold text-muted-foreground">{view === 'corrections' ? 'No cake weight corrections pending.' : 'No cake orders waiting on Packing right now.'}</p>
        </div>
      )}

      <div className="space-y-2.5">
        {visibleOrders.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                <Cake className="size-5 text-rose-500" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
                  {order.slip_number && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Slip {order.slip_number}</span>}
                  <span className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"><Receipt className="size-3" />{order.order_no}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-foreground">{order.customer_name || 'Customer'}</p>
                <p className="truncate text-[11px] font-bold text-muted-foreground">
                  Prepared: <span className="font-black text-foreground">{order.prepared_quantity ?? order.cake_kg ?? '—'}</span> · {order.flavor} · {order.shape} · Delivery {fmtDate(order.delivery_date)} {order.delivery_time || ''}
                </p>
              </div>
            </div>
            {order.status === 'Correction Required' ? (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 sm:w-auto"><p>{order.correction_reason || 'Weight correction requested'}</p><p className="mt-1 text-[10px] text-amber-700">Waiting for Cake Master · {order.correction_requested_by || 'Packing'}</p></div>
            ) : <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => printPackingChecklist(order, currentUser?.displayName || currentUser?.username || 'Packing')} className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-black text-foreground active:scale-95">
                <Printer className="size-4" /> Print Checklist
              </button>
              <button type="button" onClick={() => { setReturnId(order.id); setReturnReason(''); setError(''); }} className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-black text-amber-800 active:scale-95"><RotateCcw className="size-4" /> Weight mismatch</button>
              <button
                type="button"
                disabled={busyId === order.id}
                onClick={() => void dispatch(order)}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50"
              >
                {busyId === order.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Dispatch to {order.branch}
              </button>
            </div>}
            {returnId === order.id && <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-amber-900">Return to Cake Master</p><button type="button" onClick={() => setReturnId(null)} className="grid size-7 place-items-center rounded-lg text-amber-800"><X className="size-3.5" /></button></div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input autoFocus value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="Enter actual and expected weight" className="h-10 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-300" /><button type="button" disabled={busyId === order.id} onClick={() => void returnToCakeMaster(order)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-black text-white disabled:opacity-50">{busyId === order.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Send for correction</button></div></div>}
          </div>
        ))}
      </div>
    </section>
  );
}
