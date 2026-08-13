// src/bakery/PackingCakeOrdersTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cake, Loader2, Package, Send, AlertTriangle, RefreshCcw, Receipt, Printer, RotateCcw, X, CheckCircle2, Truck, FileText, Percent, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureCakeDispatchIncoming } from '@/branch/cakeDispatchSync';
import { printHtml } from '@/branch/printUtils';
import { printViaIframe } from '@/lib/printViaIframe';
import { saveDispatchInvoice, printDispatchInvoice, type DispatchInvoiceRecord, type DispatchInvoiceItem, type DispatchInvoiceScope } from './dispatchInvoice';
import { CAKE_DESIGNS, cakeTypesFor, calculateCakePrice, type CakeCreamType, type CakeDesignType } from '@/branch/cakePricing';
// FEATURE (2026-08-10): "the custom cake order sub tab... should be same
// like SNB branch Advance cake orders" -- reuses the exact same component
// SNB/VRSNB use for their own Advance Cake Orders (place -> send to Cake
// Master -> Cake Master dispatches -> bill with discount/payment mode/
// credit), rendered with branch='Planner'. See BranchBusinessModules.tsx's
// AdvanceCakeOrdersTab cakeOnly prop and the 2026-08-10 migrations that
// widened cake_master_orders / branch_counter_sessions / branch_credit_sales
// and their RPCs to accept 'Planner' as a fourth (isolated) branch value.
import { AdvanceCakeOrdersTab } from '@/branch/tabs/BranchBusinessModules';
import type { Branch } from '@/branch/types';

interface CakeOrderRow {
  id: string;
  branch: 'SNB' | 'VRSNB' | 'Planner';
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
  dispatched_by: string | null;
  dispatched_at: string | null;
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
  // BUG FIX: 'Planner' cake orders (the isolated custom-cake branch — see the
  // comment above this component) have no retail branch stock to sync into.
  // ensureCakeDispatchIncoming() writes to branch_incoming, whose branch
  // CHECK constraint only allows SNB/VRSNB/Hosur — calling it for a Planner
  // cake would throw a DB constraint violation. Planner's own "advance order
  // closed" check (BranchBusinessModules.tsx) only ever looks at this row's
  // status, so skipping the stock sync and going straight to 'Dispatched' is
  // both safe and sufficient for that branch.
  if (order.branch !== 'Planner') {
    await ensureCakeDispatchIncoming({ ...order, branch: order.branch as 'SNB' | 'VRSNB' }, actor);
  }
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

// FEATURE (2026-08-10): "even the planner should receive the order that are
// send to cake master from SNB — they need to see all the details from snb."
// Packing's own dashboard only ever needs to act on cakes once they're
// actually dispatchable (Ready for Packing / Packed / a correction bounced
// back), so `load()` has always scoped its query that way — 'New' /
// 'Accepted' / 'Baking' orders were invisible here entirely. Planner renders
// this exact same component for its "Cake Dispatch" tab (see
// PlannerDashboard.tsx), and wants full visibility into everything sent to
// Cake Master regardless of stage, not just the dispatchable tail end.
// `mode="planner"` widens the query to every status and adds a read-only
// "In Progress" view for the earlier stages — Packing's own dashboard (no
// prop passed, defaults to 'packing') is completely unaffected.
export default function PackingCakeOrdersTab({ mode = 'packing' }: { mode?: 'packing' | 'planner' }) {
  const { currentUser } = useAuthStore();
  const [orders, setOrders] = useState<CakeOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'ready' | 'in_progress' | 'corrections' | 'custom' | 'history'>('ready');
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('cake_master_orders')
      .select('id,branch,order_no,source_order_id,slip_number,customer_name,delivery_date,delivery_time,cake_kg,prepared_quantity,flavor,shape,cream_type,message_on_cake,design_notes,updated_at,created_at,status,correction_reason,correction_requested_by,correction_requested_at,dispatched_by,dispatched_at,order_value,advance_amount,balance_amount')
      .order('delivery_date', { ascending: true });
    if (mode !== 'planner') {
      query = query.in('status', ['Ready for Packing', 'Packed', 'Correction Required']);
    }
    const { data, error: err } = await query;
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError('');
    setOrders((data || []) as CakeOrderRow[]);
  }, [mode]);

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

  // Stages before a cake is dispatchable — only ever populated when
  // mode === 'planner' widens the query above; Packing's own dashboard never
  // fetches these rows in the first place.
  const EARLY_STAGES = ['New', 'Accepted', 'Baking'];
  const inProgressOrders = orders.filter(order => EARLY_STAGES.includes(order.status));
  // BUG FIX: once dispatched, an order used to stay in this exact same
  // "Ready" list forever — nothing here excluded status 'Dispatched', so
  // it kept showing with its "Dispatch to {branch}" button still live,
  // looking exactly like it still needed dispatching. Dispatched orders
  // now live only in the new History view below.
  const dispatchedOrders = orders.filter(order => order.status === 'Dispatched');
  const visibleOrders = orders.filter(order => {
    if (EARLY_STAGES.includes(order.status) || order.status === 'Dispatched') return false;
    return view === 'corrections' ? order.status === 'Correction Required' : order.status !== 'Correction Required';
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2">
          <Cake className="size-4 text-rose-500" />
          <h3 className="text-sm font-black text-foreground">Cake Packing</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black text-muted-foreground">{view === 'in_progress' ? inProgressOrders.length : visibleOrders.length}</span>
        </div>
        <div className="flex items-center gap-2"><div className="flex rounded-xl bg-muted p-1"><button type="button" onClick={() => setView('ready')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'ready' ? 'bg-white text-slate-950 shadow-sm' : 'text-muted-foreground')}>Ready</button>{mode === 'planner' && <button type="button" onClick={() => setView('in_progress')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'in_progress' ? 'bg-white text-indigo-700 shadow-sm' : 'text-muted-foreground')}>In Progress ({inProgressOrders.length})</button>}<button type="button" onClick={() => setView('corrections')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'corrections' ? 'bg-white text-amber-800 shadow-sm' : 'text-muted-foreground')}>Corrections ({orders.filter(order => order.status === 'Correction Required').length})</button>{mode === 'planner' && <button type="button" onClick={() => setView('history')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'history' ? 'bg-white text-emerald-700 shadow-sm' : 'text-muted-foreground')}>History ({dispatchedOrders.length})</button>}<button type="button" onClick={() => setView('custom')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-black', view === 'custom' ? 'bg-white text-rose-700 shadow-sm' : 'text-muted-foreground')}>{mode === 'planner' ? 'Advance Cake Order' : 'Custom Cake Order'}</button></div>{view !== 'custom' && <button type="button" title="Refresh cake orders" onClick={() => void load()} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} /></button>}</div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      {view === 'custom' ? (
        mode === 'planner' ? (
          <AdvanceCakeOrdersTab branch={'Planner' as Branch} branchStock={[]} cakeOnly />
        ) : (
          <CustomCakeOrderPanel dispatchedBy={currentUser?.displayName || currentUser?.username || 'Packing'} />
        )
      ) : <>
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

      {view === 'in_progress' && !loading && inProgressOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-bold text-muted-foreground">Nothing in progress at Cake Master right now.</p>
        </div>
      )}
      {view === 'history' && !loading && dispatchedOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-bold text-muted-foreground">No cakes dispatched yet.</p>
        </div>
      )}
      {view !== 'in_progress' && view !== 'history' && !loading && visibleOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-bold text-muted-foreground">{view === 'corrections' ? 'No cake weight corrections pending.' : 'No cake orders waiting on Packing right now.'}</p>
        </div>
      )}

      {/* FEATURE (2026-08-10): read-only — these are still baking/queued at
          Cake Master, nothing here is actionable from Planner's side yet.
          Full order detail is shown (same fields as the dispatchable view)
          so nothing is hidden, just not yet dispatchable. */}
      {view === 'in_progress' && (
        <div className="space-y-2.5">
          {inProgressOrders.map(order => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                  <Cake className="size-5 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
                    {order.slip_number && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Slip {order.slip_number}</span>}
                    <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"><Receipt className="size-3" />{order.order_no}</span>
                    <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">{order.status}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-black text-foreground">{order.customer_name || 'Customer'}</p>
                  <p className="truncate text-[11px] font-bold text-muted-foreground">
                    {order.cream_type || '—'} · {order.flavor || '—'} · {order.shape || '—'} · {order.cake_kg || '?'} kg · Delivery {fmtDate(order.delivery_date)} {order.delivery_time || ''}
                  </p>
                  {order.message_on_cake && <p className="truncate text-[11px] font-bold text-muted-foreground">Message: {order.message_on_cake}</p>}
                </div>
              </div>
              <div className="text-right text-[11px] font-bold text-muted-foreground">
                {Number(order.order_value) > 0 && <p className="text-sm font-black text-foreground">Rs. {Number(order.order_value).toFixed(2)}</p>}
                {Number(order.advance_amount) > 0 && <p>Advance Rs. {Number(order.advance_amount).toFixed(2)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History — read-only, same shape as In Progress above. Dispatched
          orders are never re-actionable (update_cake_master_order_status
          itself rejects any further transition once status='Dispatched'),
          so no buttons here, just the record of who dispatched it and when. */}
      {view === 'history' && (
        <div className="space-y-2.5">
          {dispatchedOrders.map(order => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                  <Cake className="size-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
                    {order.slip_number && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Slip {order.slip_number}</span>}
                    <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"><Receipt className="size-3" />{order.order_no}</span>
                    <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white">Dispatched</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-black text-foreground">{order.customer_name || 'Customer'}</p>
                  <p className="truncate text-[11px] font-bold text-muted-foreground">
                    Dispatched: <span className="font-black text-foreground">{order.prepared_quantity ?? order.cake_kg ?? '—'}</span> · {order.flavor || '—'} · {order.shape || '—'} · Delivery {fmtDate(order.delivery_date)} {order.delivery_time || ''}
                  </p>
                </div>
              </div>
              <div className="text-right text-[11px] font-bold text-muted-foreground">
                {Number(order.order_value) > 0 && <p className="text-sm font-black text-foreground">Rs. {Number(order.order_value).toFixed(2)}</p>}
                {order.dispatched_at && <p>{order.dispatched_by ? `${order.dispatched_by} · ` : ''}{new Date(order.dispatched_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view !== 'in_progress' && view !== 'history' && <div className="space-y-2.5">
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
      </div>}
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
      </>}
    </section>
  );
}

// FEATURE (2026-08-09): "under this tab create a 'Custom Cake Order' sub-tab
// that gets price/tab format from SNB branch advance cake orders, with bill
// print + discount" — a one-off cake sale with no advance order behind it
// (walk-in customer buying a cake straight from Packing). Reuses the exact
// same pricing table/formula as SNB's own advance cake order form
// (branch/cakePricing.ts — the same file that already computes order_value
// for every advance-order cake dispatched through CakeDispatchReviewModal
// above) so the price a walk-in customer is quoted always matches what SNB
// itself charges, and the same dispatch_invoices storage so it prints with
// the identical bill format and shows up in the Invoice tab/reports.
function CustomCakeOrderPanel({ dispatchedBy }: { dispatchedBy: string }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [creamType, setCreamType] = useState<CakeCreamType | ''>('');
  const [cakeTypeId, setCakeTypeId] = useState('');
  const [weightKg, setWeightKg] = useState('0.5');
  const [flavour, setFlavour] = useState('');
  const [design, setDesign] = useState<CakeDesignType>('Normal');
  const [drawingWork, setDrawingWork] = useState(false);
  const [photoWork, setPhotoWork] = useState(false);
  const [messageOnCake, setMessageOnCake] = useState('');
  const [discountPct, setDiscountPct] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DispatchInvoiceRecord | null>(null);

  const cakeTypes = useMemo(() => cakeTypesFor(creamType), [creamType]);
  const selectedCakeType = cakeTypes.find(c => c.id === cakeTypeId);
  const priceCalc = useMemo(() => calculateCakePrice({
    cakeTypeId, weightKg: Number(weightKg) || 0, design, drawingWork, photoWork,
  }), [cakeTypeId, weightKg, design, drawingWork, photoWork]);
  const pct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const discountAmount = Math.round(priceCalc.total * (pct / 100) * 100) / 100;
  const netTotal = Math.max(0, Math.round((priceCalc.total - discountAmount) * 100) / 100);

  const itemLabel = () => {
    const parts = [creamType, flavour, selectedCakeType?.name].filter(Boolean).join(' / ');
    return `Cake${parts ? ` — ${parts}` : ''} (${weightKg || '?'} kg)${design !== 'Normal' ? ` — ${design}` : ''} — ${customerName || 'Customer'}`;
  };

  const reset = () => {
    setCustomerName(''); setCustomerPhone(''); setCreamType(''); setCakeTypeId('');
    setWeightKg('0.5'); setFlavour(''); setDesign('Normal'); setDrawingWork(false); setPhotoWork(false);
    setMessageOnCake(''); setDiscountPct('0');
  };

  const createAndPrint = async () => {
    if (!customerName.trim()) { setError("Enter the customer's name."); return; }
    if (!cakeTypeId) { setError('Pick a cake type.'); return; }
    if (!(Number(weightKg) > 0)) { setError('Enter a cake weight above 0.'); return; }
    if (!(priceCalc.total > 0)) { setError('This combination has no price — check the cake type and weight.'); return; }
    setSaving(true); setError('');
    try {
      const item: DispatchInvoiceItem = { itemName: itemLabel(), unit: 'pcs', quantity: 1, unitPrice: priceCalc.total, lineTotal: priceCalc.total };
      const record = await saveDispatchInvoice({
        scope: 'SNB',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        dispatchedBy,
        items: [item],
        discountPct: pct,
        status: 'paid',
        notes: messageOnCake.trim() ? `Custom Cake Order — Message: ${messageOnCake.trim()}` : 'Custom Cake Order',
      });
      setResult(record);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the custom cake order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Customer Name *</span>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold" placeholder="e.g. Ramesh Kumar" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Mobile Number</span>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold" placeholder="Optional" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Cream Type *</span>
            <select value={creamType} onChange={e => { setCreamType(e.target.value as CakeCreamType | ''); setCakeTypeId(''); }} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold">
              <option value="">Select…</option>
              <option value="Butter Cream">Butter Cream</option>
              <option value="Fresh Cream">Fresh Cream</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Cake Type *</span>
            <select value={cakeTypeId} onChange={e => setCakeTypeId(e.target.value)} disabled={!creamType} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold disabled:opacity-50">
              <option value="">Select…</option>
              {cakeTypes.map(c => <option key={c.id} value={c.id}>{c.name} (Rs.{c.perKg}/kg{c.halfKg ? `, Rs.${c.halfKg} half kg` : ''})</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Weight (kg) *</span>
            <input type="number" step={0.5} min={0.5} value={weightKg} onChange={e => setWeightKg(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Flavour</span>
            {selectedCakeType && selectedCakeType.flavours.length > 0 ? (
              <select value={flavour} onChange={e => setFlavour(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold">
                <option value="">Select…</option>
                {selectedCakeType.flavours.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : (
              <input value={flavour} onChange={e => setFlavour(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold" placeholder="e.g. Chocolate" />
            )}
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Design</span>
            <select value={design} onChange={e => setDesign(e.target.value as CakeDesignType)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold">
              {CAKE_DESIGNS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <input type="checkbox" checked={drawingWork} onChange={e => setDrawingWork(e.target.checked)} className="size-4 accent-rose-600" /> Drawing Work (+Rs.150)
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <input type="checkbox" checked={photoWork} onChange={e => setPhotoWork(e.target.checked)} className="size-4 accent-rose-600" /> Photo Work (+Rs.100)
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Message on Cake</span>
          <input value={messageOnCake} onChange={e => setMessageOnCake(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold" placeholder="Optional" />
        </label>
      </section>

      <aside className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Cake className="size-4 text-rose-500" /><h3 className="font-display text-lg font-bold text-foreground">Price</h3></div>
        <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-sm">
          <div className="flex justify-between font-bold text-muted-foreground"><span>Base ({selectedCakeType?.name ?? '—'})</span><span>Rs. {priceCalc.baseAmount.toFixed(2)}</span></div>
          {priceCalc.designCharge > 0 && <div className="flex justify-between font-bold text-muted-foreground"><span>Design ({priceCalc.designPercent}%)</span><span>Rs. {priceCalc.designCharge.toFixed(2)}</span></div>}
          {priceCalc.drawingCharge > 0 && <div className="flex justify-between font-bold text-muted-foreground"><span>Drawing Work</span><span>Rs. {priceCalc.drawingCharge.toFixed(2)}</span></div>}
          {priceCalc.photoCharge > 0 && <div className="flex justify-between font-bold text-muted-foreground"><span>Photo Work</span><span>Rs. {priceCalc.photoCharge.toFixed(2)}</span></div>}
          <div className="flex justify-between border-t border-border pt-1.5 font-black text-foreground"><span>Cake Price</span><span>Rs. {priceCalc.total.toFixed(2)}</span></div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            <Percent className="size-3.5" /> Discount
          </label>
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(e.target.value)} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-bold" />
            <span className="text-xs font-bold text-muted-foreground">%</span>
          </div>
        </div>

        <div className="space-y-1 rounded-xl bg-rose-50 p-3 text-sm">
          {discountAmount > 0 && <div className="flex justify-between font-bold text-red-600"><span>Discount</span><span>- Rs. {discountAmount.toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-black text-foreground"><span>Total</span><span>Rs. {netTotal.toFixed(2)}</span></div>
        </div>

        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}

        <button onClick={createAndPrint} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-40">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />} Create &amp; Bill (Rs. {netTotal.toFixed(2)})
        </button>

        {result && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
            <p className="text-xs font-black text-teal-800">Invoice {result.invoiceNo} created — Rs. {result.total.toFixed(2)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => printDispatchInvoice(result, 'thermal')} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700"><Printer className="size-3.5" /> Thermal</button>
              <button onClick={() => printDispatchInvoice(result, 'a4')} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700"><Printer className="size-3.5" /> A4</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// BUG FIX (2026-08-09): this used the pre-fix `window.open('', '_blank')` +
// immediate `win.print()` pattern (no size args, no document.open(), no
// onload/setTimeout guard) — the anti-pattern already fixed elsewhere via
// printViaIframe. This was one of the print calls behind the "unable to
// print any bill" report for Planner's Cake Dispatch tab.
function printCakeChecklist(orders: CakeOrderRow[], packingUser: string, mode: 'a4' | 'thermal') {
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
  printViaIframe(`<!doctype html><html><head><title>Cake Dispatch Checklist</title><style>${style}
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
    // Keyed on the full CakeOrderRow branch union (includes 'Planner'), not
    // DispatchInvoiceScope — Planner cakes are grouped here too so their
    // status still gets a per-order count, but the invoice loop below skips
    // that group entirely (Planner isn't a valid dispatch-invoice scope; see
    // performCakeDispatch's matching skip of the branch_incoming stock sync).
    const map = new Map<CakeOrderRow['branch'], CakeOrderRow[]>();
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
        if (branch === 'Planner') continue; // no dispatch invoice for Planner-scope cakes
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
