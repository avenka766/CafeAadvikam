// src/bakery/PackingCakeOrdersTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cake, Loader2, Package, Send, AlertTriangle, RefreshCcw, Receipt, Printer, RotateCcw, X, CheckCircle2, Truck, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureCakeDispatchIncoming } from '@/branch/cakeDispatchSync';
import { printHtml } from '@/branch/printUtils';
import { saveDispatchInvoice, printDispatchInvoice, type DispatchInvoiceRecord, type DispatchInvoiceItem, type DispatchInvoiceScope } from './dispatchInvoice';

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
  // FEATURE (2026-08-08): "I need the checklist and the invoice — get the
  // price from the SNB branch advance cake order." These three columns are
  // already populated at order-creation time (backfilled from the advance
  // order's branch_operation_records.payload — see cake pricing in
  // branch/cakePricing.ts) — order_value is the cake's already-computed
  // total price, so the dispatch invoice reads it directly instead of
  // recomputing anything.
  order_value: number;
  advance_amount: number;
  balance_amount: number;
}

function cakeItemLabel(order: CakeOrderRow) {
  const parts = [order.cream_type, order.flavor, order.shape].filter(Boolean).join(' / ');
  return `Cake${parts ? ` — ${parts}` : ''} (${order.cake_kg || order.prepared_quantity || '?'} kg) — ${order.customer_name || 'Customer'}`;
}

// Pulled out of the single-order `dispatch()` handler so both the individual
// "Dispatch to {branch}" button and the new multi-select batch review modal
// share one code path for the actual status-transition + stock-sync writes —
// only the surrounding busy/error UI state differs between the two.
async function performCakeDispatch(order: CakeOrderRow, actor: string) {
  // RETRY-SAFETY FIX (2026-08-08 audit): update_cake_master_order_status
  // throws "Cancelled or dispatched orders cannot be changed" if the order
  // is already 'Dispatched' — unlike submitDispatch elsewhere in this app,
  // it is NOT idempotent. Without this guard, retrying a batch dispatch
  // after a partial failure (e.g. every cake dispatches fine but the
  // invoice save for one branch fails afterward) would hard-error on every
  // already-dispatched cake in the retry and permanently strand the planner
  // — there'd be no way to ever finish creating the missing invoice. Always
  // re-check the order's *current* DB status first — the `order` object
  // passed in can be a stale snapshot taken when the review modal opened.
  const { data: fresh, error: freshErr } = await supabase.from('cake_master_orders').select('status').eq('id', order.id).single();
  if (freshErr) throw new Error(freshErr.message);
  if (fresh.status === 'Dispatched') return; // already done on a prior attempt — safe no-op
  if (fresh.status === 'Ready for Packing') {
    const { error: packedError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Packed', p_actor: actor });
    if (packedError) throw new Error(packedError.message);
  }
  await ensureCakeDispatchIncoming(order, actor);
  const { error: dispatchError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Dispatched', p_actor: actor });
  if (dispatchError) throw new Error(dispatchError.message);
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
      .select('id,branch,order_no,source_order_id,slip_number,customer_name,delivery_date,delivery_time,cake_kg,prepared_quantity,flavor,shape,cream_type,message_on_cake,design_notes,updated_at,created_at,status,correction_reason,correction_requested_by,correction_requested_at,order_value,advance_amount,balance_amount')
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

  // FEATURE (2026-08-08): "I need the ability to select multiple items and
  // dispatch at once and I need the checklist and the invoice." Selection is
  // separate from the existing single-order "Dispatch to {branch}" button —
  // checking one or more orders here surfaces a "Dispatch Selected" bar that
  // opens CakeDispatchReviewModal for a combined checklist + invoice.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [reviewOrders, setReviewOrders] = useState<CakeOrderRow[] | null>(null);

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
        <div className="flex items-center gap-2"><div className="flex rounded-xl bg-muted p-1"><button type="button" onClick={() => setView('ready')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'ready' ? 'bg-white text-slate-950 shadow-sm' : 'text-muted-foreground')}>Ready</button><button type="button" onClick={() => setView('corrections')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'corrections' ? 'bg-white text-amber-800 shadow-sm' : 'text-muted-foreground')}>Corrections ({orders.filter(order => order.status === 'Correction Required').length})</button></div><button type="button" title="Refresh cake orders" onClick={() => void load()} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} /></button></div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      {view === 'ready' && selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-300 bg-teal-50 px-3.5 py-2.5">
          <span className="text-xs font-black text-teal-800">{selected.size} cake{selected.size === 1 ? '' : 's'} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-xl border border-teal-300 px-3 py-2 text-xs font-black text-teal-800 hover:bg-teal-100">Clear</button>
            <button
              type="button"
              onClick={() => setReviewOrders(visibleOrders.filter(o => selected.has(o.id)))}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-black text-white hover:bg-teal-700"
            >
              <Truck className="size-3.5" /> Dispatch Selected ({selected.size})
            </button>
          </div>
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
          <div key={order.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3.5', selected.has(order.id) ? 'border-teal-300 ring-1 ring-teal-200' : 'border-border')}>
            <div className="flex min-w-0 items-center gap-3">
              {order.status !== 'Correction Required' && (
                <input
                  type="checkbox" checked={selected.has(order.id)} onChange={() => toggleSelect(order.id)}
                  className="size-4 shrink-0 accent-teal-600" aria-label={`Select ${order.order_no} for batch dispatch`}
                />
              )}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                <Cake className="size-5 text-rose-500" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
                  {order.slip_number && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Slip {order.slip_number}</span>}
                  <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"><Receipt className="size-3" />{order.order_no}</span>
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
                onClick={() => setReviewOrders([order])}
                className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50"
              >
                <Send className="size-4" /> Dispatch to {order.branch}
              </button>
            </div>}
            {returnId === order.id && <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-amber-900">Return to Cake Master</p><button type="button" onClick={() => setReturnId(null)} className="grid size-7 place-items-center rounded-lg text-amber-800"><X className="size-3.5" /></button></div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input autoFocus value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="Enter actual and expected weight" className="h-10 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-300" /><button type="button" disabled={busyId === order.id} onClick={() => void returnToCakeMaster(order)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-black text-white disabled:opacity-50">{busyId === order.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Send for correction</button></div></div>}
          </div>
        ))}
      </div>
      {reviewOrders && (
        <CakeDispatchReviewModal
          orders={reviewOrders}
          dispatchedBy={currentUser?.displayName || currentUser?.username || 'Packing'}
          onClose={() => setReviewOrders(null)}
          onDone={() => {
            setSelected(new Set());
            void load();
          }}
        />
      )}
    </section>
  );
}

function printCakeChecklist(orders: CakeOrderRow[], packingUser: string, mode: 'a4' | 'thermal') {
  const win = window.open('', '_blank');
  if (!win) return;
  const rows = orders.map((o, idx) => `
    <div class="order">
      <div class="orow"><b>${idx + 1}. ${escapeHtml(o.branch)} — ${escapeHtml(o.order_no)}</b><span>${escapeHtml(fmtDate(o.delivery_date))} ${escapeHtml(o.delivery_time || '')}</span></div>
      <div class="orow"><span>${escapeHtml(o.customer_name || 'Customer')}</span><span>${escapeHtml(o.prepared_quantity ?? o.cake_kg ?? '?')} kg</span></div>
      <div class="orow small">${escapeHtml([o.cream_type, o.flavor, o.shape].filter(Boolean).join(' / ') || '-')}</div>
      ${o.message_on_cake ? `<div class="orow small">Message: ${escapeHtml(o.message_on_cake)}</div>` : ''}
      <label class="check"><input type="checkbox" /> Quantity + design verified against this checklist</label>
    </div>`).join('');
  const style = mode === 'thermal'
    ? `@page{size:80mm auto;margin:3mm}body{font-family:monospace;font-size:11px;width:72mm}`
    : `@page{size:auto;margin:12mm}body{font-family:sans-serif;font-size:14px;}`;
  win.document.write(`<!doctype html><html><head><title>Cake Dispatch Checklist</title><style>${style}
    body{padding:12px}h2{margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:10px}
    .order{padding:8px 0;border-bottom:1px dashed #ccc}
    .orow{display:flex;justify-content:space-between;gap:8px}.small{color:#555;font-size:11px}
    .check{display:block;margin-top:4px}
    .sign{margin-top:16px;border-top:1px dashed #999;padding-top:10px}
  </style></head><body>
    <h2>Cake Dispatch Checklist</h2>
    <div class="meta">${new Date().toLocaleString('en-IN')} · ${orders.length} cake${orders.length === 1 ? '' : 's'}</div>
    ${rows}
    <div class="sign">
      <div>Dispatched By: ${escapeHtml(packingUser)} ______________________</div>
      <div style="margin-top:6px">Received By (Sign): ______________________</div>
    </div>
  </body></html>`);
  win.document.close(); win.print();
}

// FEATURE (2026-08-08): "I need the ability to select multiple items and
// dispatch at once and I need the checklist and the invoice — get the price
// from the SNB branch advance cake order." One review step covers both the
// single-order "Dispatch to {branch}" button and the new multi-select batch
// path: shows every selected cake's already-known advance-order price,
// prints a combined checklist (A4/thermal), and on confirm both dispatches
// every cake (same performCakeDispatch used everywhere else) AND generates
// a proper invoice per branch (cakes can be a mix of SNB/VRSNB in one batch)
// via the same dispatch_invoices batch storage used by the main Dispatch tab.
function CakeDispatchReviewModal({ orders, dispatchedBy, onClose, onDone }: {
  orders: CakeOrderRow[];
  dispatchedBy: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [discountPct, setDiscountPct] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DispatchInvoiceRecord[] | null>(null);
  // RETRY-SAFETY FIX (2026-08-08 audit): a batch here can span 2 branches
  // (SNB + VRSNB cakes together), each getting its own saveDispatchInvoice
  // call in a loop below. If branch A's invoice saves fine but branch B's
  // throws (network blip, etc.), the modal stays open for a retry — without
  // this cache, retrying would call saveDispatchInvoice for branch A again
  // too, creating a second duplicate invoice for cakes that already have one.
  const createdInvoicesRef = useRef<Map<DispatchInvoiceScope, DispatchInvoiceRecord>>(new Map());

  const byBranch = useMemo(() => {
    const map = new Map<DispatchInvoiceScope, CakeOrderRow[]>();
    for (const o of orders) {
      const list = map.get(o.branch) ?? [];
      list.push(o);
      map.set(o.branch, list);
    }
    return map;
  }, [orders]);

  const missingPriceOrders = orders.filter(o => !(Number(o.order_value) > 0));
  const subtotal = orders.reduce((s, o) => s + Number(o.order_value || 0), 0);
  const discountAmount = Math.round(subtotal * (discountPct / 100) * 100) / 100;
  const total = Math.round(subtotal - discountAmount);

  const confirm = async () => {
    if (missingPriceOrders.length > 0) {
      setError(`These cakes have no price recorded on their advance order: ${missingPriceOrders.map(o => o.order_no).join(', ')}. Fix the advance order's price before dispatching.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      for (const order of orders) {
        await performCakeDispatch(order, dispatchedBy);
      }
      const records: DispatchInvoiceRecord[] = [];
      for (const [branch, group] of byBranch) {
        const already = createdInvoicesRef.current.get(branch);
        if (already) { records.push(already); continue; }
        const items: DispatchInvoiceItem[] = group.map(o => ({
          itemName: cakeItemLabel(o), unit: 'pcs', quantity: 1,
          unitPrice: Number(o.order_value), lineTotal: Number(o.order_value),
        }));
        const record = await saveDispatchInvoice({
          scope: branch, dispatchedBy, items, discountPct,
          dispatchEntryIds: group.map(o => ({ orderId: o.id, dispatchEntryId: o.id })),
        });
        createdInvoicesRef.current.set(branch, record);
        records.push(record);
      }
      setResults(records);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        {!results ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-foreground">Cake Dispatch Review — {orders.length} cake{orders.length === 1 ? '' : 's'}</p>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">Double-check before sending. Prices come straight from each cake's advance order — nothing is sent until you confirm below.</p>

            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left font-black uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Cake</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const missing = !(Number(o.order_value) > 0);
                    return (
                      <tr key={o.id} className={cn('border-t border-border', missing && 'bg-red-50')}>
                        <td className="px-3 py-2 font-bold text-foreground">
                          {o.customer_name || 'Customer'} <span className="text-muted-foreground">· {o.order_no}</span>
                          {missing && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">NO PRICE ON ADVANCE ORDER</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{o.branch}</td>
                        <td className="px-3 py-2 text-right font-black text-foreground">{Number(o.order_value) > 0 ? `Rs. ${Number(o.order_value).toFixed(2)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                Discount %
                <input
                  type="number" min={0} max={100} step={0.5} value={discountPct}
                  onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-16 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                />
              </label>
              <div className="text-right text-xs font-bold text-muted-foreground">
                Subtotal Rs. {subtotal.toFixed(2)} &nbsp;·&nbsp; Discount Rs. {discountAmount.toFixed(2)} &nbsp;·&nbsp;
                <span className="text-sm font-black text-foreground"> Total Rs. {total.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="mt-2 text-[11px] font-bold text-red-700">{error}</p>}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => printCakeChecklist(orders, dispatchedBy, 'thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Checklist (Thermal)</button>
              <button onClick={() => printCakeChecklist(orders, dispatchedBy, 'a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Checklist (A4)</button>
              <button onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={confirm} disabled={sending} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Confirm Dispatch
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-black text-teal-700">Dispatched — {results.length} invoice{results.length === 1 ? '' : 's'} created ({results.map(r => r.invoiceNo).join(', ')}).</p>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">Stored under this batch — reprint any time from the Invoice tab.</p>
            <div className="mt-4 space-y-2">
              {results.map(record => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground"><FileText className="size-3.5" /> {record.scope} — {record.invoiceNo} — Rs. {record.total.toFixed(2)}</span>
                  <div className="flex gap-2">
                    <button onClick={() => printDispatchInvoice(record, 'thermal')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> Thermal</button>
                    <button onClick={() => printDispatchInvoice(record, 'a4')} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-slate-200"><Printer className="size-3.5" /> A4</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-white">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
