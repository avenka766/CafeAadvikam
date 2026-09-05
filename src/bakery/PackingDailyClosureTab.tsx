import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  History,
  IndianRupee,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  Undo2,
  WalletCards,
} from 'lucide-react';
import * as XLSX from '@/lib/safeSpreadsheet';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBakeryStore } from './bakeryStore';
import { useBranchStore } from '@/branch/branchStore';
import { BRANCHES } from './types';
import type { Branch } from './types';
import { recordLeftoverMovement, sanitizeQtyForUnit } from './PlannerLeftoverTab';
import { printViaIframe } from '@/lib/printViaIframe';

import { PACKING_CLOSURE_KEY_PREFIX, packingBusinessDateToday } from './packingCounter';

// AUDIT FIX (2026-09-02): printClosure below interpolates item names, branch
// labels and the free-text handover Notes field into raw HTML handed to
// printViaIframe with no escaping — item names can come from a branch's
// free-typed Custom Items field, and Notes is staff free text. Same
// stored-XSS class fixed via InvoiceTab.tsx's printInvoice; this codebase's
// own printPackingChecklist/printCakeChecklist already escape for this exact
// reason. Escape every such field here too.
function escapeHtml(value: unknown): string {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// BUG FIX: same case-sensitivity bug found repeatedly across this audit —
// raw itemName === itemName comparison silently misses a match whenever
// two records for the same logical item were typed with different casing
// (e.g. "Bun" vs "BUN"), which for this leftover calculation specifically
// means dispatched quantity gets undercounted, overstating "leftover" for
// an item that was actually fully sent.
const sameItem = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const businessDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value)) : '';
// AUDIT FIX (2026-09-05): "the payment should be round off there should not
// be any decimal points".
const money = (value: number) => `₹${Math.round(Number(value || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const qty = (value: number) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

interface PackingClosureRow {
  id: string;
  business_date: string;
  status: 'draft' | 'finalized';
  opened_at: string | null;
  opened_by: string | null;
  opening_cash: number;
  closed_at: string | null;
  closed_by: string | null;
  counted_cash: number;
  expected_cash: number;
  cash_difference: number;
  bills_count: number;
  gross_sales: number;
  cash_total: number;
  upi_total: number;
  card_total: number;
  bank_total: number;
  mixed_total: number;
  credit_billed: number;
  credit_collected: number;
  packed_orders: number;
  dispatched_orders: number;
  pending_orders: number;
  leftover_items: number;
  leftover_kg: number;
  dispatched_kg: number;
  dispatched_pcs: number;
  branch_summary: Record<string, { kg: number; pcs: number; orders: number }>;
  item_summary: Array<{ itemName: string; kg: number; pcs: number; entries: number }>;
  notes: string | null;
  recorded_by_name: string;
  created_at: string;
  updated_at: string;
}

function StatCard({ label, value, helper, icon, tone = 'slate' }: {
  label: string; value: React.ReactNode; helper?: string; icon: React.ReactNode; tone?: 'slate'|'emerald'|'blue'|'amber'|'red';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', emerald: 'bg-teal-100 text-teal-700',
    blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700',
  };
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-display font-black text-foreground">{value}</p>{helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}</div><span className={cn('grid size-10 place-items-center rounded-xl', tones[tone])}>{icon}</span></div></div>;
}

// ─── Disputes & Returns (Planner review) ───────────────────────────────────
// Surfaces two things a branch (SNB/VRSNB Order) can raise from its Incoming
// tab: a quantity Dispute (informational here — Admin resolves it) and a
// Return request (actionable here — Planner confirms it, which posts the
// transfer-in receipt and syncs the quantity into Closing Stock). This is
// the only place Planner sees either, since Planner has no notification
// bell/alerts page today (that route is admin-only).

type PendingDisputeRow = {
  id: string; branch: string; item_name: string; quantity: number; unit: string;
  dispute_reason: string | null; disputed_by: string | null; disputed_at: string | null;
  disputed_received_quantity: number | null;
};

type PendingReturnRow = {
  id: string; source_branch: string; transfer_reference: string; item_name: string;
  expected_quantity: number; unit: string; request_reason: string | null;
  requested_by: string | null; requested_at: string | null;
};

function ConfirmReturnRow({ row, staffName, onDone }: { row: PendingReturnRow; staffName: string; onDone: () => void }) {
  const [qty, setQty] = useState(String(row.expected_quantity));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    setErr('');
    const received = Number(qty);
    if (!Number.isFinite(received) || received <= 0) { setErr('Enter a received quantity greater than zero.'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('confirm_packing_transfer_in_secure', {
      p_id: row.id, p_received_quantity: received, p_remarks: remarks.trim() || null,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    // Sync into Closing Stock — this is the step post_packing_transfer_in_secure
    // itself doesn't do (it only writes inventory_ledger for the Packing location).
    const posted = data as { item_name: string; unit: 'kg' | 'pcs'; received_quantity: number; source_branch: string; transfer_reference: string } | null;
    if (posted) {
      const leftoverResult = await recordLeftoverMovement({
        itemName: posted.item_name, unit: posted.unit, delta: Number(posted.received_quantity),
        businessDate: packingBusinessDateToday(), reason: 'closing_stock', recordedBy: staffName,
        branch: posted.source_branch as Branch, notes: `Return confirmed from ${posted.source_branch} · ${posted.transfer_reference}`,
      });
      if ('error' in leftoverResult) { setErr(`Return confirmed, but closing stock sync failed: ${leftoverResult.error}`); setSaving(false); return; }
    }
    setSaving(false);
    onDone();
  };

  return (
    <div className="rounded-2xl border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{row.item_name}</p>
          <p className="text-xs text-muted-foreground">{row.source_branch} · Requested {row.expected_quantity} {row.unit} · {row.requested_by || '-'} · {row.requested_at ? new Date(row.requested_at).toLocaleString('en-IN') : ''}</p>
          {row.request_reason && <p className="mt-1 text-xs italic text-muted-foreground">"{row.request_reason}"</p>}
        </div>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-700">Pending</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
        {/* BUG FIX (audit 2026-08-30): hardcoded step="0.001" and no
            sanitization regardless of unit — this writes straight into the
            shared Closing Stock ledger below (recordLeftoverMovement), same
            "pcs never allow decimal points" gap found across several other
            Planner qty inputs today. */}
        <label className="space-y-1"><span className="text-[10px] font-black text-muted-foreground">Received Qty</span><input type="number" min="0.001" step={row.unit === 'pcs' ? 1 : 0.001} value={qty} onChange={(e) => setQty(sanitizeQtyForUnit(e.target.value, row.unit === 'pcs' ? 'pcs' : 'kg'))} className="h-9 w-full rounded-lg border bg-background px-2 text-sm font-bold" /></label>
        <label className="space-y-1"><span className="text-[10px] font-black text-muted-foreground">Remarks (optional)</span><input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" /></label>
        <div className="flex items-end"><button onClick={() => void confirm()} disabled={saving} className="h-9 w-full rounded-lg bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-50 sm:w-auto">{saving ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Confirm'}</button></div>
      </div>
      {err && <p className="text-xs font-bold text-red-600">{err}</p>}
    </div>
  );
}

function DisputesAndReturnsPanel() {
  const { currentUser } = useAuthStore();
  const staffName = currentUser?.displayName || currentUser?.username || 'Planner';
  const [disputes, setDisputes] = useState<PendingDisputeRow[]>([]);
  const [returns, setReturns] = useState<PendingReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [disputeRes, returnRes] = await Promise.all([
      supabase.from('branch_incoming')
        .select('id,branch,item_name,quantity,unit,dispute_reason,disputed_by,disputed_at,disputed_received_quantity')
        .eq('disputed', true).eq('confirmed', false)
        .order('disputed_at', { ascending: false }).limit(200),
      supabase.rpc('list_packing_transfer_in_secure'),
    ]);
    if (disputeRes.error) setError(disputeRes.error.message);
    else setDisputes((disputeRes.data || []) as PendingDisputeRow[]);
    if (returnRes.error) setError((prev) => prev || returnRes.error!.message);
    else setReturns(((returnRes.data || []) as (PendingReturnRow & { status: string })[]).filter((r) => r.status === 'pending'));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-7 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-5">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline size-4" />{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Pending Returns" value={returns.length} helper="Awaiting your confirmation" icon={<Undo2 className="size-5" />} tone={returns.length ? 'blue' : 'slate'} />
        <StatCard label="Open Disputes" value={disputes.length} helper="Awaiting Admin review" icon={<AlertTriangle className="size-5" />} tone={disputes.length ? 'amber' : 'slate'} />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div><h3 className="font-black">Pending Returns from SNB / VRSNB</h3><p className="text-xs text-muted-foreground">Confirming posts the receipt to Packing and adds the quantity back to Closing Stock.</p></div>
          <button onClick={() => void load()} className="grid size-9 shrink-0 place-items-center rounded-xl border"><RefreshCw className="size-3.5" /></button>
        </div>
        <div className="space-y-3 p-4">
          {returns.length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">No pending returns.</p>
            : returns.map((row) => <ConfirmReturnRow key={row.id} row={row} staffName={staffName} onDone={() => void load()} />)}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3"><h3 className="font-black">Open Stock Disputes</h3><p className="text-xs text-muted-foreground">Raised from Incoming Stock at SNB/VRSNB Order. Admin reviews and corrects the stock; shown here for visibility.</p></div>
        <div className="divide-y">
          {disputes.length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">No open disputes.</p>
            : disputes.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-black">{d.item_name} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{d.branch}</span></p>
                  <p className="text-xs text-muted-foreground">Dispatched {d.quantity} {d.unit}{d.disputed_received_quantity != null ? ` · Received ${d.disputed_received_quantity} ${d.unit}` : ''} · {d.disputed_by || '-'} · {d.disputed_at ? new Date(d.disputed_at).toLocaleString('en-IN') : ''}</p>
                  {d.dispute_reason && <p className="mt-1 text-xs italic text-muted-foreground">"{d.dispute_reason}"</p>}
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">Awaiting Admin</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function PackingDailyClosureTab({ onCounterStatusChange }: { onCounterStatusChange?: (isOpen: boolean) => void }) {
  const { currentUser } = useAuthStore();
  const orders = useBakeryStore(state => state.orders);
  const fetchOrders = useBakeryStore(state => state.fetchOrders);
  const branchSales = useBranchStore(state => state.sales.SNB);
  const branchCreditSales = useBranchStore(state => state.creditSales.SNB);
  const branchCreditPayments = useBranchStore(state => state.creditPayments.SNB);
  const fetchBranchData = useBranchStore(state => state.fetchBranchData);

  const [date, setDate] = useState(packingBusinessDateToday());
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');
  const [record, setRecord] = useState<PackingClosureRow | null>(null);
  const [history, setHistory] = useState<PackingClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState<'operations'|'cashier'|'history'|'disputes'>('operations');

  const staffName = currentUser?.displayName || currentUser?.username || 'Packing Staff';

  const loadClosure = useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    const key = `${PACKING_CLOSURE_KEY_PREFIX}${date}`;
    const [{ data, error: rowError }, { data: historyData, error: historyError }] = await Promise.all([
      supabase.from('app_state').select('key,value,updated_at').eq('key', key).maybeSingle(),
      supabase.from('app_state').select('key,value,updated_at').like('key', `${PACKING_CLOSURE_KEY_PREFIX}%`).order('updated_at', { ascending: false }).limit(30),
    ]);
    if (rowError) setError(rowError.message);
    if (historyError) setError(historyError.message);

    const mapRow = (row: { key: string; value: unknown; updated_at?: string | null } | null): PackingClosureRow | null => {
      if (!row) return null;
      const value = (row.value && typeof row.value === 'object' ? row.value : {}) as Partial<PackingClosureRow>;
      const rowDate = value.business_date || row.key.slice(PACKING_CLOSURE_KEY_PREFIX.length);
      return {
        id: value.id || row.key,
        business_date: rowDate,
        status: value.status === 'finalized' ? 'finalized' : 'draft',
        opened_at: value.opened_at ?? null,
        opened_by: value.opened_by ?? null,
        opening_cash: Number(value.opening_cash ?? 0),
        closed_at: value.closed_at ?? null,
        closed_by: value.closed_by ?? null,
        counted_cash: Number(value.counted_cash ?? 0),
        expected_cash: Number(value.expected_cash ?? 0),
        cash_difference: Number(value.cash_difference ?? 0),
        bills_count: Number(value.bills_count ?? 0),
        gross_sales: Number(value.gross_sales ?? 0),
        cash_total: Number(value.cash_total ?? 0),
        upi_total: Number(value.upi_total ?? 0),
        card_total: Number(value.card_total ?? 0),
        bank_total: Number(value.bank_total ?? 0),
        mixed_total: Number(value.mixed_total ?? 0),
        credit_billed: Number(value.credit_billed ?? 0),
        credit_collected: Number(value.credit_collected ?? 0),
        packed_orders: Number(value.packed_orders ?? 0),
        dispatched_orders: Number(value.dispatched_orders ?? 0),
        pending_orders: Number(value.pending_orders ?? 0),
        leftover_items: Number(value.leftover_items ?? 0),
        leftover_kg: Number(value.leftover_kg ?? 0),
        dispatched_kg: Number(value.dispatched_kg ?? 0),
        dispatched_pcs: Number(value.dispatched_pcs ?? 0),
        branch_summary: value.branch_summary ?? {},
        item_summary: value.item_summary ?? [],
        notes: value.notes ?? null,
        recorded_by_name: value.recorded_by_name ?? 'Packing Staff',
        created_at: value.created_at ?? row.updated_at ?? new Date().toISOString(),
        updated_at: value.updated_at ?? row.updated_at ?? new Date().toISOString(),
      };
    };

    const current = mapRow(data as { key: string; value: unknown; updated_at?: string | null } | null);
    const rows = ((historyData ?? []) as Array<{ key: string; value: unknown; updated_at?: string | null }>)
      .map(mapRow)
      .filter((row): row is PackingClosureRow => Boolean(row));
    setRecord(current);
    setHistory(rows);
    if (date === packingBusinessDateToday()) onCounterStatusChange?.(current?.status === 'draft');
    setOpeningCash(String(current?.opening_cash ?? 0));
    setCountedCash(current?.status === 'finalized' ? String(current.counted_cash ?? 0) : '');
    setNotes(current?.notes ?? '');
    setLoading(false);
  }, [date, onCounterStatusChange]);

  useEffect(() => {
    void Promise.all([fetchOrders(true), fetchBranchData('SNB', false, ['sales', 'credit'])]).finally(() => void loadClosure()); // EGRESS FIX: this tab only reads sales + credit sales
  }, [fetchBranchData, fetchOrders, loadClosure]);

  const dayDispatches = useMemo(() => orders.flatMap(order => (order.dispatchLog ?? [])
    .filter(entry => businessDate(entry.dispatchedAt) === date)
    .map(entry => ({ order, entry }))), [orders, date]);

  const packedOrders = useMemo(() => orders.filter(order => ['produced','dispatched'].includes(order.status) && businessDate(order.sentToPackingAt || order.createdAt) === date), [orders, date]);
  const dispatchedOrderIds = useMemo(() => new Set(dayDispatches.map(row => row.order.id)), [dayDispatches]);
  const pendingOrders = useMemo(() => orders.filter(order => order.status === 'produced').length, [orders]);

  const branchSummary = useMemo(() => {
    const result: Record<Branch, { kg: number; pcs: number; orders: number; ids: Set<string> }> = {
      VRSNB: { kg: 0, pcs: 0, orders: 0, ids: new Set() },
      SNB: { kg: 0, pcs: 0, orders: 0, ids: new Set() },
      Hosur: { kg: 0, pcs: 0, orders: 0, ids: new Set() },
    };
    dayDispatches.forEach(({ order, entry }) => {
      if (entry.unit === 'pcs') result[entry.branch].pcs += entry.quantity;
      else result[entry.branch].kg += entry.quantity;
      result[entry.branch].ids.add(order.id);
    });
    BRANCHES.forEach(branch => { result[branch].orders = result[branch].ids.size; });
    return result;
  }, [dayDispatches]);

  const itemSummary = useMemo(() => {
    const map = new Map<string, { itemName: string; kg: number; pcs: number; entries: number; branches: Set<string> }>();
    dayDispatches.forEach(({ entry }) => {
      // BUG FIX: same case-sensitivity bug as above — raw entry.itemName
      // as the map key would split e.g. "Bun"/"BUN" into two separate
      // summary rows instead of one combined total.
      const key = entry.itemName.trim().toLowerCase();
      const row = map.get(key) ?? { itemName: entry.itemName, kg: 0, pcs: 0, entries: 0, branches: new Set<string>() };
      if (entry.unit === 'pcs') row.pcs += entry.quantity; else row.kg += entry.quantity;
      row.entries += 1; row.branches.add(entry.branch); map.set(key, row);
    });
    return Array.from(map.values()).map(row => ({ ...row, branches: Array.from(row.branches) })).sort((a,b) => b.kg + b.pcs - (a.kg + a.pcs));
  }, [dayDispatches]);

  const leftoverRows = useMemo(() => orders.flatMap(order => {
    // BUG FIX (2026-08-07 re-audit): 'partially_packed'/'packed' are not
    // valid WorkflowStatus values (see types.ts — only pending/accepted/
    // store_confirmed/produced/dispatched exist), so this filter only ever
    // matched 'dispatched' orders in practice. A fully 'dispatched' order by
    // definition has nothing left undispatched (submitDispatch only sets
    // that status once every prepared item is fully sent), so this whole
    // "Leftover / Undispatched" panel was silently showing ~empty even when
    // real leftover existed on 'produced' (partially-dispatched) orders —
    // exactly the status that should have been included here.
    if (!['produced', 'dispatched'].includes(order.status)) return [];
    return (order.preparedItems ?? []).flatMap(prepared => {
      const source = order.items.find(item => item.itemId === prepared.itemId || sameItem(item.itemName, prepared.itemName));
      const dispatches = (order.dispatchLog ?? []).filter(entry => sameItem(entry.itemName, prepared.itemName));
      const dispatchedKg = dispatches.reduce((sum, entry) => {
        if (entry.unit === 'pcs' && source?.weightGrams) return sum + (entry.quantity * source.weightGrams) / 1000;
        return sum + entry.quantity;
      }, 0);
      const remaining = Math.max(0, prepared.quantityPrepared - dispatchedKg);
      return remaining > 0.0009 ? [{ orderNumber: order.orderNumber, itemName: prepared.itemName, remaining }] : [];
    });
  }), [orders]);

  const daySales = useMemo(() => branchSales.filter(sale => businessDate(sale.soldAt) === date), [branchSales, date]);
  const dayCredits = useMemo(() => branchCreditSales.filter(sale => businessDate(sale.createdAt) === date), [branchCreditSales, date]);
  const dayCreditPayments = useMemo(() => branchCreditPayments.filter(payment => businessDate(payment.createdAt) === date), [branchCreditPayments, date]);

  const salesByMode = useMemo(() => {
    const result: Record<string, number> = { cash: 0, upi: 0, card: 0, bank: 0, mixed: 0 };
    daySales.forEach(sale => {
      const mode = (sale.paymentMethod || 'cash').toLowerCase();
      result[mode] = (result[mode] || 0) + sale.quantitySold * sale.unitPrice;
    });
    return result;
  }, [daySales]);
  const creditCollectionsByMode = useMemo(() => {
    const result: Record<string, number> = { cash: 0, upi: 0, card: 0, bank: 0, mixed: 0 };
    dayCreditPayments.forEach(payment => { result[payment.paymentMode] = (result[payment.paymentMode] || 0) + payment.amount; });
    return result;
  }, [dayCreditPayments]);

  const grossSales = daySales.reduce((sum, sale) => sum + sale.quantitySold * sale.unitPrice, 0);
  const billCount = new Set(daySales.map(sale => sale.billNo).filter(Boolean)).size;
  const creditBilled = dayCredits.reduce((sum, sale) => sum + sale.creditAmount, 0);
  const creditCollected = dayCreditPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentTotal = (mode: string) => (salesByMode[mode] || 0) + (creditCollectionsByMode[mode] || 0);
  const cashTotal = paymentTotal('cash');
  const expectedCash = Number(openingCash || 0) + cashTotal;
  const counted = Number(countedCash || 0);
  const difference = counted - expectedCash;
  const dispatchedKg = dayDispatches.filter(row => row.entry.unit !== 'pcs').reduce((sum,row)=>sum+row.entry.quantity,0);
  const dispatchedPcs = dayDispatches.filter(row => row.entry.unit === 'pcs').reduce((sum,row)=>sum+row.entry.quantity,0);
  const leftoverKg = leftoverRows.reduce((sum,row)=>sum+row.remaining,0);
  const finalized = record?.status === 'finalized';
  const counterOpen = record?.status === 'draft';
  const isToday = date === packingBusinessDateToday();
  const roundedDifference = Math.round(difference * 100) / 100;
  const cashMatches = countedCash.trim() !== '' && roundedDifference === 0;

  const startCounter = async () => {
    setError(''); setMessage('');
    if (!isToday) return setError('Only today’s cashier counter can be opened. Select today’s date.');
    setSaving(true);
    const opening = finalized && record ? Number(record.opening_cash || 0) : Number(openingCash || 0);
    if (!Number.isFinite(opening) || opening < 0) { setSaving(false); setError('Opening cash must be zero or more.'); return; }
    const now = new Date().toISOString();
    const payload: PackingClosureRow = {
      id: `${PACKING_CLOSURE_KEY_PREFIX}${date}`,
      business_date: date,
      status: 'draft',
      opened_at: now,
      opened_by: staffName,
      opening_cash: opening,
      closed_at: null,
      closed_by: null,
      counted_cash: 0,
      expected_cash: opening + cashTotal,
      cash_difference: 0,
      bills_count: billCount,
      gross_sales: grossSales,
      cash_total: cashTotal,
      upi_total: paymentTotal('upi'),
      card_total: paymentTotal('card'),
      bank_total: paymentTotal('bank'),
      mixed_total: paymentTotal('mixed'),
      credit_billed: creditBilled,
      credit_collected: creditCollected,
      packed_orders: packedOrders.length,
      dispatched_orders: dispatchedOrderIds.size,
      pending_orders: pendingOrders,
      leftover_items: leftoverRows.length,
      leftover_kg: leftoverKg,
      dispatched_kg: dispatchedKg,
      dispatched_pcs: dispatchedPcs,
      branch_summary: Object.fromEntries(BRANCHES.map(branch => [branch, { kg: branchSummary[branch].kg, pcs: branchSummary[branch].pcs, orders: branchSummary[branch].orders }])),
      item_summary: itemSummary.map(row => ({ itemName: row.itemName, kg: row.kg, pcs: row.pcs, entries: row.entries })),
      notes: notes || null,
      recorded_by_name: staffName,
      created_at: record?.created_at ?? now,
      updated_at: now,
    };
    const { error: saveError } = await supabase.from('app_state').upsert({
      key: `${PACKING_CLOSURE_KEY_PREFIX}${date}`,
      value: payload,
      updated_at: now,
    }, { onConflict: 'key' });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    await loadClosure();
    onCounterStatusChange?.(true);
    setMessage(finalized ? 'Packing cashier counter reopened. Billing is unlocked again for today.' : 'Packing cashier counter opened. Billing is now unlocked for today.');
  };

  const finalize = async () => {
    setError(''); setMessage('');
    if (!counterOpen) return setError('Open today’s cashier counter before closing the day.');
    if (!countedCash.trim() || !Number.isFinite(counted) || counted < 0) return setError('Enter the physical counted closing cash.');
    if (roundedDifference !== 0) return setError(`Cash cannot be closed with a difference. Resolve ${money(Math.abs(roundedDifference))} ${roundedDifference < 0 ? 'shortage' : 'excess'} so counted cash exactly matches expected cash.`);
    const opening = Number(openingCash || 0);
    if (!Number.isFinite(opening) || opening < 0) return setError('Opening cash must be zero or more.');
    setSaving(true);
    const now = new Date().toISOString();
    const payload: PackingClosureRow = {
      id: record?.id ?? `${PACKING_CLOSURE_KEY_PREFIX}${date}`,
      business_date: date,
      status: 'finalized',
      opened_at: record?.opened_at ?? now,
      opened_by: record?.opened_by ?? staffName,
      opening_cash: opening,
      closed_at: now,
      closed_by: staffName,
      counted_cash: counted,
      expected_cash: expectedCash,
      cash_difference: roundedDifference,
      bills_count: billCount,
      gross_sales: grossSales,
      cash_total: cashTotal,
      upi_total: paymentTotal('upi'),
      card_total: paymentTotal('card'),
      bank_total: paymentTotal('bank'),
      mixed_total: paymentTotal('mixed'),
      credit_billed: creditBilled,
      credit_collected: creditCollected,
      packed_orders: packedOrders.length,
      dispatched_orders: dispatchedOrderIds.size,
      pending_orders: pendingOrders,
      leftover_items: leftoverRows.length,
      leftover_kg: leftoverKg,
      dispatched_kg: dispatchedKg,
      dispatched_pcs: dispatchedPcs,
      branch_summary: Object.fromEntries(BRANCHES.map(branch => [branch, { kg: branchSummary[branch].kg, pcs: branchSummary[branch].pcs, orders: branchSummary[branch].orders }])),
      item_summary: itemSummary.map(row => ({ itemName: row.itemName, kg: row.kg, pcs: row.pcs, entries: row.entries })),
      notes: notes || null,
      recorded_by_name: staffName,
      created_at: record?.created_at ?? now,
      updated_at: now,
    };
    const { error: saveError } = await supabase.from('app_state').upsert({
      key: `${PACKING_CLOSURE_KEY_PREFIX}${date}`,
      value: payload,
      updated_at: now,
    }, { onConflict: 'key' });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    await loadClosure();
    onCounterStatusChange?.(false);
    setMessage('Packing daily closure finalized with exact cash reconciliation. Billing is locked; use Reopen Counter to continue billing on the same business date.');
  };

  const refresh = async () => {
    setLoading(true); setError('');
    await Promise.all([fetchOrders(true), fetchBranchData('SNB', false, ['sales', 'credit'])]); // EGRESS FIX: this tab only reads sales + credit sales
    await loadClosure();
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = [{
      Date: date, Status: finalized ? 'Finalized' : record?.status || 'Not started', 'Packed Orders': packedOrders.length,
      'Dispatched Orders': dispatchedOrderIds.size, 'Pending Orders': pendingOrders, 'Leftover Items': leftoverRows.length,
      'Leftover KG': leftoverKg, 'Dispatched KG': dispatchedKg, 'Dispatched Pcs': dispatchedPcs, Bills: billCount,
      'Gross Sales': grossSales, Cash: cashTotal, UPI: paymentTotal('upi'), Card: paymentTotal('card'), Bank: paymentTotal('bank'),
      Mixed: paymentTotal('mixed'), 'Credit Billed': creditBilled, 'Credit Collected': creditCollected,
      'Opening Cash': Number(openingCash || 0), 'Expected Cash': expectedCash, 'Counted Cash': counted, Difference: roundedDifference,
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Closure Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemSummary.map(row => ({ Item: row.itemName, KG: row.kg, Pcs: row.pcs, Entries: row.entries, Branches: row.branches.join(', ') }))), 'Item Dispatch');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BRANCHES.map(branch => ({ Branch: branch, KG: branchSummary[branch].kg, Pcs: branchSummary[branch].pcs, Orders: branchSummary[branch].orders }))), 'Branch Dispatch');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leftoverRows.map(row => ({ Order: row.orderNumber, Item: row.itemName, 'Leftover KG': row.remaining }))), 'Leftover');
    XLSX.writeFile(wb, `packing-daily-closure-${date}.xlsx`);
  };

  // BUG FIX ("Planner dashboard print... nothing happens"): this used
  // window.open('', '_blank', ...) + `if (!win) return;` — the exact broken
  // pattern already diagnosed for Planner's other print buttons (see
  // printViaIframe.ts / dispatchInvoice.ts). A popup blocked by the browser
  // makes `win` falsy and the function just silently returns — no error, no
  // print, nothing. Switched to the hidden-iframe pipeline every other
  // Planner print path already uses, which never opens a new window/tab so
  // it can't be blocked.
  const printClosure = () => {
    const itemRows = itemSummary.map(row => `<tr><td>${escapeHtml(row.itemName)}</td><td class="n">${qty(row.kg)}</td><td class="n">${qty(row.pcs)}</td><td class="n">${row.entries}</td><td>${escapeHtml(row.branches.join(', '))}</td></tr>`).join('') || '<tr><td colspan="5">No dispatches</td></tr>';
    const branchRows = BRANCHES.map(branch => `<tr><td>${branch}</td><td class="n">${qty(branchSummary[branch].kg)}</td><td class="n">${qty(branchSummary[branch].pcs)}</td><td class="n">${branchSummary[branch].orders}</td></tr>`).join('');
    printViaIframe(`<!doctype html><html><head><title>Packing Closure ${date}</title><style>@page{size:auto;margin:8mm}@media print{html,body{height:auto !important}}*{box-sizing:border-box}body{font-family:Arial;margin:0;color:#111827}h1{margin:0}.muted{color:#6b7280;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.k{border:1px solid #d1d5db;border-radius:10px;padding:10px}.k span{font-size:10px;text-transform:uppercase;color:#6b7280}.k b{display:block;font-size:20px;margin-top:5px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #d1d5db;padding:7px;text-align:left}th{background:#f3f4f6}.n{text-align:right}.section{margin-top:20px}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:55px}.line{border-top:1px solid #111;text-align:center;padding-top:6px;font-size:11px}@media print{body{margin:12mm}.no{display:none}}</style></head><body><h1>Packing Daily / Cashier Closure</h1><p class="muted">${dateLabel(date)} · ${finalized ? 'Finalized' : 'Live preview'} · Staff: ${escapeHtml(staffName)}</p><div class="grid"><div class="k"><span>Gross Sales</span><b>${money(grossSales)}</b></div><div class="k"><span>Dispatched</span><b>${dispatchedOrderIds.size}</b></div><div class="k"><span>Expected Cash</span><b>${money(expectedCash)}</b></div><div class="k"><span>Difference</span><b>${money(difference)}</b></div></div><div class="section"><h2>Cashier Summary</h2><table><tbody><tr><td>Opening Cash</td><td class="n">${money(Number(openingCash||0))}</td><td>Cash Collection</td><td class="n">${money(cashTotal)}</td></tr><tr><td>UPI</td><td class="n">${money(paymentTotal('upi'))}</td><td>Card</td><td class="n">${money(paymentTotal('card'))}</td></tr><tr><td>Credit Billed</td><td class="n">${money(creditBilled)}</td><td>Credit Collected</td><td class="n">${money(creditCollected)}</td></tr><tr><td>Counted Cash</td><td class="n">${money(counted)}</td><td>Difference</td><td class="n">${money(difference)}</td></tr></tbody></table></div><div class="section"><h2>Item Dispatch</h2><table><thead><tr><th>Item</th><th>KG</th><th>Pcs</th><th>Entries</th><th>Branches</th></tr></thead><tbody>${itemRows}</tbody></table></div><div class="section"><h2>Branch Dispatch</h2><table><thead><tr><th>Branch</th><th>KG</th><th>Pcs</th><th>Orders</th></tr></thead><tbody>${branchRows}</tbody></table></div><div class="section"><h2>Handover Notes</h2><p>${notes ? escapeHtml(notes) : 'No notes'}</p></div><div class="sign"><div class="line">Packing Cashier</div><div class="line">Packing In-Charge</div><div class="line">Accounts</div></div></body></html>`);
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="size-7 animate-spin text-teal-600" /></div>;

  return <section className="space-y-5">
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 text-white shadow-xl">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-200">Packing control</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-white/75">Counter opening mandatory for billing</span></div><h2 className="font-display text-3xl font-black">Daily Closure & Cashier Handover</h2><p className="mt-1 max-w-3xl text-sm text-white/60">Open the cashier counter before billing, then finalize packing output, dispatch, payments, credit and exact physical cash reconciliation.</p></div>
        <div className="flex flex-wrap gap-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-black text-white [color-scheme:dark]"/><button onClick={refresh} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-black"><RefreshCw className="size-4"/>Refresh</button><button onClick={exportExcel} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-black"><FileSpreadsheet className="size-4"/>Excel</button><button onClick={printClosure} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-slate-950"><Printer className="size-4"/>Print</button></div>
      </div>
      <div className="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4">{[['Status',finalized?'Finalized':record?.status==='draft'?'Counter Open':'Not Started'],['Business Date',dateLabel(date)],['Packing Staff',record?.closed_by||record?.opened_by||staffName],['Cash Difference',money(difference)]].map(([label,value])=><div key={label} className="border-white/10 p-4 sm:border-r last:border-r-0"><p className="text-[10px] font-black uppercase tracking-wider text-white/45">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}</div>
    </div>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline size-4"/>{error}</div>}
    {message && <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-700"><CheckCircle2 className="mr-2 inline size-4"/>{message}</div>}

    <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={()=>setSection('operations')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black',section==='operations'?'border-teal-700 bg-teal-700 text-white':'bg-card')}><PackageCheck className="size-4"/>Packing & Dispatch</button><button onClick={()=>setSection('cashier')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black',section==='cashier'?'border-teal-700 bg-teal-700 text-white':'bg-card')}><WalletCards className="size-4"/>Cashier Closure</button><button onClick={()=>setSection('disputes')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black',section==='disputes'?'border-teal-700 bg-teal-700 text-white':'bg-card')}><Undo2 className="size-4"/>Disputes & Returns</button><button onClick={()=>setSection('history')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black',section==='history'?'border-teal-700 bg-teal-700 text-white':'bg-card')}><History className="size-4"/>Closure History</button></div>

    {section === 'operations' && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><StatCard label="Packed Orders" value={packedOrders.length} helper="Sent to packing today" icon={<PackageCheck className="size-5"/>} tone="blue"/><StatCard label="Dispatched Orders" value={dispatchedOrderIds.size} helper="Completed dispatch" icon={<Truck className="size-5"/>} tone="emerald"/><StatCard label="Pending Orders" value={pendingOrders} helper="Still waiting in packing" icon={<ClipboardCheck className="size-5"/>} tone="amber"/><StatCard label="Dispatch KG" value={qty(dispatchedKg)} helper="Weight-based items" icon={<Send className="size-5"/>} tone="emerald"/><StatCard label="Dispatch Pcs" value={qty(dispatchedPcs)} helper="Piece-based items" icon={<Send className="size-5"/>} tone="blue"/><StatCard label="Leftover" value={`${qty(leftoverKg)} kg`} helper={`${leftoverRows.length} item balances`} icon={<AlertTriangle className="size-5"/>} tone={leftoverRows.length?'red':'slate'}/></div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b bg-muted/30 px-4 py-3"><h3 className="font-black">Item-wise Dispatch</h3><p className="text-xs text-muted-foreground">All dispatch entries for the selected business date</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left">Item</th><th className="px-4 py-3 text-right">KG</th><th className="px-4 py-3 text-right">Pcs</th><th className="px-4 py-3 text-right">Entries</th><th className="px-4 py-3 text-left">Branches</th></tr></thead><tbody className="divide-y">{itemSummary.length?itemSummary.map(row=><tr key={row.itemName}><td className="px-4 py-3 font-black">{row.itemName}</td><td className="px-4 py-3 text-right">{qty(row.kg)}</td><td className="px-4 py-3 text-right">{qty(row.pcs)}</td><td className="px-4 py-3 text-right">{row.entries}</td><td className="px-4 py-3">{row.branches.join(', ')}</td></tr>):<tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No dispatches on this date.</td></tr>}</tbody></table></div></div><div className="space-y-4"><div className="rounded-2xl border bg-card p-4"><h3 className="font-black">Branch Dispatch</h3><div className="mt-3 space-y-2">{BRANCHES.map(branch=><div key={branch} className="rounded-xl border p-3"><div className="flex items-center justify-between"><div><p className="font-black">{branch}</p><p className="text-xs text-muted-foreground">{branchSummary[branch].orders} orders</p></div><div className="text-right text-sm font-black"><p>{qty(branchSummary[branch].kg)} kg</p><p>{qty(branchSummary[branch].pcs)} pcs</p></div></div></div>)}</div></div><div className="rounded-2xl border bg-card p-4"><h3 className="font-black">Leftover / Undispatched</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{leftoverRows.length?leftoverRows.slice(0,30).map((row,index)=><div key={`${row.orderNumber}-${row.itemName}-${index}`} className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-sm"><div><p className="font-bold">{row.itemName}</p><p className="text-[10px] text-red-600">Order #{row.orderNumber}</p></div><b className="text-red-700">{qty(row.remaining)} kg</b></div>):<p className="py-8 text-center text-sm text-muted-foreground">No leftover items.</p>}</div></div></div></div>
    </>}

    {section === 'cashier' && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Bills" value={billCount} helper="Unique bill numbers" icon={<ClipboardCheck className="size-5"/>} tone="blue"/><StatCard label="Gross Sales" value={money(grossSales)} helper="Paid sales rows" icon={<IndianRupee className="size-5"/>} tone="emerald"/><StatCard label="Credit Billed" value={money(creditBilled)} helper="New credit balance" icon={<CreditCard className="size-5"/>} tone="amber"/><StatCard label="Credit Collected" value={money(creditCollected)} helper="Later collections" icon={<WalletCards className="size-5"/>} tone="blue"/><StatCard label="Expected Cash" value={money(expectedCash)} helper="Opening + cash collection" icon={<Banknote className="size-5"/>} tone="slate"/></div><div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]"><div className="rounded-2xl border bg-card p-4 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-black">Cashier Handover</h3><p className="text-xs text-muted-foreground">Opening the counter is mandatory before billing. Closure requires an exact physical cash match.</p></div><span className={cn('rounded-full px-3 py-1 text-xs font-black',finalized?'bg-slate-100 text-slate-700':record?.status==='draft'?'bg-teal-100 text-teal-700':'bg-amber-100 text-amber-700')}>{finalized?'Closed — Reopen Available':counterOpen?'Counter Open — Billing Unlocked':'Counter Closed — Billing Locked'}</span></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs font-black text-muted-foreground">Opening Cash</span><input type="number" min="0" value={openingCash} disabled={finalized||record?.status==='draft'} onChange={e=>setOpeningCash(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold"/></label><label className="space-y-1"><span className="text-xs font-black text-muted-foreground">Counted Closing Cash</span><input type="number" min="0" value={countedCash} disabled={finalized || !counterOpen} onChange={e=>setCountedCash(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold" placeholder="Physical cash count"/></label><label className="space-y-1 sm:col-span-2"><span className="text-xs font-black text-muted-foreground">Handover Notes</span><textarea value={notes} disabled={finalized} onChange={e=>setNotes(e.target.value)} className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Pending orders, cash variance, leftovers or branch handover notes"/></label></div>{counterOpen && countedCash.trim() && roundedDifference !== 0 && <div className={cn('rounded-xl border px-3 py-2 text-sm font-bold', roundedDifference < 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700')}><AlertTriangle className="mr-2 inline size-4" />{roundedDifference < 0 ? `Cash shortage: ${money(Math.abs(roundedDifference))}` : `Cash excess: ${money(roundedDifference)}`}. Resolve the difference before closure.</div>}<div className="flex flex-wrap gap-2"><button onClick={startCounter} disabled={saving||counterOpen||!isToday} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-xs font-black disabled:opacity-50">{saving?<Loader2 className="size-4 animate-spin"/>:<CheckCircle2 className="size-4"/>}{finalized?'Reopen Counter':'Open Counter'}</button><button onClick={finalize} disabled={saving||!counterOpen||!cashMatches} className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="size-4 animate-spin"/>:<ShieldCheck className="size-4"/>}Finalize Daily Closure</button></div></div><div className="space-y-4"><div className="rounded-2xl border bg-card p-4"><h3 className="font-black">Payment Breakdown</h3><div className="mt-3 space-y-2">{[['Cash',cashTotal],['UPI',paymentTotal('upi')],['Card',paymentTotal('card')],['Bank',paymentTotal('bank')],['Mixed',paymentTotal('mixed')]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-sm"><span>{label}</span><b>{money(Number(value))}</b></div>)}</div></div><div className="rounded-2xl border bg-card p-4"><h3 className="font-black">Cash Reconciliation</h3><div className="mt-3 space-y-2">{[['Opening Cash',Number(openingCash||0)],['Cash Collection',cashTotal],['Expected Cash',expectedCash],['Counted Cash',counted],['Difference',roundedDifference]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-sm"><span>{label}</span><b className={String(label)==='Difference'&&Number(value)!==0?'text-red-600':''}>{money(Number(value))}</b></div>)}</div></div></div></div></div>}

    {section === 'disputes' && <DisputesAndReturnsPanel />}

    {section === 'history' && <div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b bg-muted/30 px-4 py-3"><h3 className="font-black">Saved Packing Closures</h3><p className="text-xs text-muted-foreground">Last 30 business dates</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-muted/50 text-[10px] font-black uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Status / Staff</th><th className="px-4 py-3 text-right">Gross Sales</th><th className="px-4 py-3 text-right">Dispatched</th><th className="px-4 py-3 text-right">Expected Cash</th><th className="px-4 py-3 text-right">Difference</th></tr></thead><tbody className="divide-y">{history.length?history.map(row=><tr key={row.id} className="cursor-pointer hover:bg-muted/20" onClick={()=>setDate(row.business_date)}><td className="px-4 py-3 font-black">{dateLabel(row.business_date)}</td><td className="px-4 py-3"><span className={cn('rounded-full px-2 py-1 text-[10px] font-black',row.status==='finalized'?'bg-slate-100 text-slate-700':'bg-teal-100 text-teal-700')}>{row.status}</span><p className="mt-1 text-xs text-muted-foreground">{row.closed_by||row.opened_by||row.recorded_by_name}</p></td><td className="px-4 py-3 text-right font-black">{money(Number(row.gross_sales||0))}</td><td className="px-4 py-3 text-right">{row.dispatched_orders}</td><td className="px-4 py-3 text-right">{money(Number(row.expected_cash||0))}</td><td className={cn('px-4 py-3 text-right font-black',Number(row.cash_difference||0)!==0&&'text-red-600')}>{money(Number(row.cash_difference||0))}</td></tr>):<tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No packing closures saved yet.</td></tr>}</tbody></table></div></div>}
  </section>;
}
