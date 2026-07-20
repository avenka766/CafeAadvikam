// src/bakery/PackingDashboard.tsx (Redesigned — Tabs + Excel Export)
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from '@/lib/safeSpreadsheet';
import {
  Package, Loader2, ChevronDown, ChevronUp, Truck,
  AlertTriangle, CheckCircle2, ClipboardCheck, Lock,
  BoxSelect, MapPin, FileSpreadsheet, Calendar, Send,
  Printer, RefreshCw, ShoppingCart, ArrowDownToLine,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BRANCHES } from './types';
import type { Branch, PreparedItem } from './types';
import { kgToPcs } from './itemMatcher';
import { cn } from '@/lib/utils';
import BranchBillingProTab from '@/branch/tabs/BranchBillingProTab';
import { useBranchStore } from '@/branch/branchStore';
import PackingTransferInTab from './PackingTransferInTab';
import PackingCakeOrdersTab from './PackingCakeOrdersTab';
import PackingDailyClosureTab from './PackingDailyClosureTab';
import { getPackingCounterStatus } from './packingCounter';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PackedEntry {
  itemId:        string;
  itemName:      string;
  qty:           number;
  confirmed:     boolean;
  weightGrams?:  number;
  dispatchUnit?: 'pcs' | 'kg';
  confirmedPcs?: number;
  remainderKg?:  number; // leftover grams that can't form a whole pcs
}

type TimeFilter = 'today' | '7d' | '15d' | '30d';
type ActiveTab  = 'orders' | 'transfer-in' | 'billing' | 'leftover' | 'dispatched' | 'closure' | 'cake-orders';
type BranchFilter = 'all' | Branch;
const PACKING_TABS: ActiveTab[] = ['orders', 'cake-orders', 'transfer-in', 'billing', 'leftover', 'dispatched', 'closure'];

// ─── Constants ────────────────────────────────────────────────────────────────
const BRANCH_META: Record<Branch, { color: string; bg: string; icon: string }> = {
  VRSNB: { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',    icon: '🏙️' },
  SNB:   { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',  icon: '🏪' },
  Hosur: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '🌿' },
};

const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'today', label: 'Today'   },
  { key: '7d',    label: '7 Days'  },
  { key: '15d',   label: '15 Days' },
  { key: '30d',   label: '30 Days' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCutoff(filter: TimeFilter): Date {
  const d = new Date();
  if (filter === 'today') { d.setHours(0, 0, 0, 0); return d; }
  const days = filter === '7d' ? 7 : filter === '15d' ? 15 : 30;
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function exportToExcel(
  orders: ReturnType<typeof useBakeryStore.getState>['orders'],
  filter: TimeFilter
) {
  const cutoff = getCutoff(filter);

  // ── Sheet 1: Dispatch Details ──────────────────────────────────────────────
  const rows: Record<string, string | number>[] = [];
  orders.forEach(order => {
    (order.dispatchLog ?? [])
      .filter(d => new Date(d.dispatchedAt) >= cutoff)
      .sort((a, b) => new Date(a.dispatchedAt).getTime() - new Date(b.dispatchedAt).getTime())
      .forEach(d => {
        rows.push({
          'Order #':        order.orderNumber,
          'Item Name':      d.itemName,
          'Quantity':       d.quantity,
          'Unit':           d.unit ?? 'kg',
          'Branch':         d.branch,
          'Dispatched By':  d.dispatchedBy,
          'Dispatched At':  new Date(d.dispatchedAt).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
          }),
        });
      });
  });

  if (rows.length === 0) {
    rows.push({
      'Order #': '', 'Item Name': 'No dispatches found in this period',
      'Quantity': '', 'Unit': '', 'Branch': '', 'Dispatched By': '', 'Dispatched At': '',
    });
  }

  const ws1 = XLSX.utils.json_to_sheet(rows);
  ws1['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 22 }, { wch: 26 },
  ];

  // ── Sheet 2: Branch Summary ────────────────────────────────────────────────
  const branchSummary: Record<string, { kg: number; pcs: number }> = {};
  BRANCHES.forEach(b => { branchSummary[b] = { kg: 0, pcs: 0 }; });
  orders.forEach(order => {
    (order.dispatchLog ?? [])
      .filter(d => new Date(d.dispatchedAt) >= cutoff)
      .forEach(d => {
        if (d.unit === 'pcs') branchSummary[d.branch].pcs += d.quantity;
        else                   branchSummary[d.branch].kg  += d.quantity;
      });
  });
  const summaryRows = BRANCHES.map(b => ({
    'Branch':                b,
    'Total KG Dispatched':   branchSummary[b]?.kg  ?? 0,
    'Total Pcs Dispatched':  branchSummary[b]?.pcs ?? 0,
  }));
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Dispatch Details');
  XLSX.utils.book_append_sheet(wb, ws2, 'Branch Summary');

  const filterLabel = { today: 'today', '7d': '7-days', '15d': '15-days', '30d': '30-days' }[filter];
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  XLSX.writeFile(wb, `dispatch-report-${filterLabel}-${dateStr}.xlsx`);
}

// ─── Dispatch Row ─────────────────────────────────────────────────────────────
function DispatchRow({ itemName, available, onDispatch, submitting, defaultBranch, unit }: {
  itemName: string; available: number;
  onDispatch: (qty: number, branch: Branch) => Promise<void>;
  submitting: boolean; defaultBranch?: Branch; unit?: 'pcs' | 'kg';
}) {
  const [qty, setQty]       = useState('');
  const [branch, setBranch] = useState<Branch>(defaultBranch ?? 'VRSNB');
  const qtyNum  = parseFloat(qty) || 0;
  const overQty = qtyNum > available;
  const unitLabel = unit === 'pcs' ? 'pcs' : 'kg';

  const handle = async () => {
    if (qtyNum <= 0) return;
    await onDispatch(qtyNum, branch);
    setQty('');
  };

  return (
    <div className="space-y-2.5 py-3.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body font-semibold text-foreground">{itemName}</span>
        <span className={cn('text-xs font-body font-bold tabular-nums px-2 py-0.5 rounded-lg',
          available <= 0 ? 'text-red-700 bg-red-100' : 'text-emerald-700 bg-emerald-100')}>
          {available} {unitLabel}
        </span>
      </div>
      <div className="flex gap-2 items-center">
        <input type="number" min={0.01} step={unit === 'pcs' ? 1 : 0.25}
          placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)}
          className={cn(
            'w-20 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2',
            overQty ? 'border-red-400 focus:ring-red-200' : 'border-border focus:ring-primary/30'
          )} />
        <span className="text-[10px] font-body font-bold text-muted-foreground">{unitLabel}</span>
        <select value={branch} onChange={e => setBranch(e.target.value as Branch)}
          className="flex-1 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
          {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_META[b].icon} {b}</option>)}
        </select>
        <button onClick={handle} disabled={submitting || qtyNum <= 0 || available <= 0 || overQty}
          className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-body font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all shrink-0 shadow-sm">
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
          Send
        </button>
      </div>
      {/* U-10 FIX: red error — Send is now disabled when overQty so this is the blocker, not just a warning */}
      {overQty && (
        <p className="text-[10px] font-body text-red-600 flex items-center gap-1 font-semibold">
          <AlertTriangle className="size-3" /> Exceeds available stock — reduce quantity to send
        </p>
      )}
    </div>
  );
}

// ─── Packing Order Card (New Orders tab) ──────────────────────────────────────
function PackingOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitDispatch } = useBakeryStore();
  const { currentUser }   = useAuthStore();

  const [expanded,         setExpanded]         = useState(order.status === 'packed' || order.status === 'partially_packed');
  const [dispatchingItems, setDispatchingItems] = useState<Set<string>>(new Set());
  const [dispatchError,    setDispatchError]    = useState<string | null>(null);
  const transferBranch: Branch = order.targetBranch ?? 'SNB';
  const [transferQty, setTransferQty] = useState<Record<string, string>>({});
  const [transferring, setTransferring] = useState(false);

  const [packedEntries, setPackedEntries] = useState<PackedEntry[]>([]);
  useEffect(() => {
    if (!order.preparedItems?.length) { setPackedEntries([]); return; }
    setPackedEntries(previous => order.preparedItems!.map(p => {
      const prior = previous.find(entry => entry.itemId === p.itemId);
      const oi = order.items.find(i => i.itemId === p.itemId);
      // Preserve locally confirmed rows; refresh every unconfirmed row from realtime baker data.
      if (prior?.confirmed) return prior;
      return { itemId: p.itemId, itemName: p.itemName, qty: p.quantityPrepared, confirmed: false, weightGrams: oi?.weightGrams, dispatchUnit: oi?.dispatchUnit ?? 'kg' };
    }));
  }, [order.preparedItems, order.items]);

  const isCustomItem   = (itemId: string) => order.items.find(i => i.itemId === itemId)?.isCustom ?? false;

  const confirmEntry = (idx: number) => setPackedEntries(prev => prev.map((e, i) => {
    if (i !== idx) return e;
    const confirmedPcs = e.dispatchUnit === 'pcs' && e.weightGrams != null ? kgToPcs(e.qty, e.weightGrams) ?? undefined : undefined;
    // FIX B8: compute leftover grams that cannot form a whole pcs
    let remainderKg: number | undefined;
    if (e.dispatchUnit === 'pcs' && e.weightGrams != null && confirmedPcs != null) {
      const usedKg    = (confirmedPcs * e.weightGrams) / 1000;
      const remainder = Math.round((e.qty - usedKg) * 1000) / 1000;
      remainderKg = remainder > 0.001 ? remainder : undefined;
    }
    return { ...e, confirmed: true, confirmedPcs, remainderKg };
  }));
  const unconfirmEntry = (idx: number) => setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, confirmed: false, confirmedPcs: undefined } : e));
  const updateEntryQty = (idx: number, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setPackedEntries(prev => prev.map((e, i) => i === idx ? { ...e, qty: n, confirmed: false } : e));
  };

  const preparedItems = useMemo(() => order.preparedItems ?? [], [order.preparedItems]);
  const dispatchLog   = useMemo(() => order.dispatchLog ?? [], [order.dispatchLog]);

  const stockByItem = useMemo(() => {
    const r: Record<string, { prepared: number; dispatched: number; available: number; unit: 'pcs' | 'kg' }> = {};
    preparedItems.forEach(p => {
      const entry        = packedEntries.find(e => e.itemId === p.itemId);
      const isPcs        = entry?.dispatchUnit === 'pcs';
      const effectiveQty = isPcs && entry?.confirmedPcs != null ? entry.confirmedPcs : p.quantityPrepared;
      const dispatched   = dispatchLog.filter(d => d.itemName === p.itemName).reduce((s, d) => s + d.quantity, 0);
      r[p.itemName] = { prepared: effectiveQty, dispatched, available: effectiveQty - dispatched, unit: isPcs ? 'pcs' : 'kg' };
    });
    return r;
  }, [preparedItems, dispatchLog, packedEntries]);

  // An item that's already been fully sent to the branch shouldn't block the
  // "confirm all" gate or show a confusing repeat "Confirm/Undo" prompt — it's
  // simply done.
  const isFullySentItem = (itemName: string) => {
    const s = stockByItem[itemName];
    return (s?.dispatched ?? 0) > 0 && (s?.available ?? 0) <= 0;
  };
  const allConfirmed   = packedEntries.length > 0 && packedEntries.every(e => e.confirmed || isFullySentItem(e.itemName));
  const confirmedCount = packedEntries.filter(e => e.confirmed || isFullySentItem(e.itemName)).length;

  const allDispatched = preparedItems.length > 0 && preparedItems.every(p => (stockByItem[p.itemName]?.available ?? 1) <= 0);

  const handleDispatch = async (itemName: string, qty: number, branch: Branch, unit?: 'pcs' | 'kg') => {
    if (!currentUser || dispatchingItems.has(itemName)) return;
    setDispatchingItems(prev => new Set(prev).add(itemName));
    setDispatchError(null);
    try {
      await submitDispatch(order.id, { itemName, quantity: qty, unit: unit ?? 'kg', branch, dispatchedAt: new Date().toISOString(), dispatchedBy: currentUser.displayName });

      // Discrepancy detection is handled inside bakeryStore.submitDispatch
      // using fresh DB data — no stale-state risk here.
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Dispatch failed - please try again.');
    } finally {
      setDispatchingItems(prev => { const s = new Set(prev); s.delete(itemName); return s; });
    }
  };

  const statusLabel = allDispatched ? 'DISPATCHED' : allConfirmed ? 'READY' : 'PACKING';
  const printTransferChecklist = () => {
    const checklist = [
      'Verify standard quantity in box or Kgs or Pcs before transfer',
      'Cross-check all boxes or Kgs or Pcs before transfer-out and sync',
      'Sync the data in the Transfer-Out module',
      'Manual verification by 2 employees against transfer-out list',
      'Intimate factory and bill for extra products if received quantity exceeds list',
      'Sync store computer after goods received',
      'Perform “Transfer In” in the Billmaxo system',
    ];
    const rows = preparedItems.map((p, index) => {
      const stock = stockByItem[p.itemName];
      const qty = Number(transferQty[p.itemName] || stock?.available || 0);
      return `<tr><td>${index + 1}</td><td>${p.itemName}</td><td>${qty}</td><td>${stock?.unit ?? 'kg'}</td><td>${transferBranch}</td></tr>`;
    }).join('');
    const checks = checklist.map((item, index) => `<tr><td>${index + 1}</td><td>${item}</td><td>☐</td><td></td><td></td><td></td></tr>`).join('');
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Transfer Out Checklist</title><style>body{font-family:Arial;padding:24px;color:#111}h2{text-align:center;font-size:16px}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #222;padding:7px;font-size:11px}th{background:#eee}.sign{height:60px}</style></head><body><h2>FINISHED GOODS TRANSFER – EMPLOYEE TRACKING INVOICE (PACKING TO ${transferBranch})</h2><p><b>Order:</b> #${order.orderNumber} &nbsp; <b>Date:</b> ${new Date().toLocaleString('en-IN')}</p><table><thead><tr><th>S.No</th><th>Item</th><th>Qty</th><th>Unit</th><th>Destination</th></tr></thead><tbody>${rows}</tbody></table><table><thead><tr><th>S.No</th><th>Task Description</th><th>Tick (✓)</th><th>Name</th><th>Signature</th><th>Time</th></tr></thead><tbody>${checks}</tbody></table><table><tr><th>Store In-Charge Final Acknowledgment</th><th>Remarks if any</th></tr><tr><td class="sign">Name:<br><br>Signature:<br><br>Date & Time:</td><td></td></tr></table></body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 250);
  };

  const transferAll = async () => {
    const rows = preparedItems.map(p => ({ p, stock: stockByItem[p.itemName], qty: Number(transferQty[p.itemName] || stockByItem[p.itemName]?.available || 0) }))
      .filter(row => row.qty > 0);
    if (!rows.length) { setDispatchError('Enter at least one transfer quantity.'); return; }
    const invalid = rows.find(row => row.qty > (row.stock?.available ?? 0));
    if (invalid) { setDispatchError(`${invalid.p.itemName} exceeds available quantity.`); return; }
    setTransferring(true); setDispatchError(null);
    try {
      for (const row of rows) {
        const entry = packedEntries.find(e => e.itemId === row.p.itemId);
        await handleDispatch(row.p.itemName, row.qty, transferBranch, entry?.dispatchUnit ?? 'kg');
      }
      setTransferQty({});
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : 'Combined transfer failed.');
    } finally { setTransferring(false); }
  };

  const statusStyle = allDispatched
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : allConfirmed
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-purple-100 text-purple-700 border-purple-200';

  const branchMeta = order.targetBranch ? BRANCH_META[order.targetBranch] : null;

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      allDispatched ? 'border-border bg-card opacity-70' : 'border-border bg-card shadow-sm'
    )}>
      {/* Header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20" onClick={() => setExpanded(v => !v)}>
        <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0 text-lg',
          allDispatched ? 'bg-emerald-100' : allConfirmed ? 'bg-blue-100' : 'bg-purple-100')}>
          {allDispatched ? '✓' : allConfirmed ? '📦' : '🏷️'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">Order #{order.orderNumber}</span>
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', statusStyle)}>{statusLabel}</span>
            {branchMeta && (
              <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1', branchMeta.bg, branchMeta.color)}>
                {branchMeta.icon} {order.targetBranch}
              </span>
            )}
            {order.status === 'partially_packed' && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                ↗ More items coming from baker
              </span>
            )}
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {confirmedCount}/{packedEntries.length} confirmed · {preparedItems.map(p => p.itemName).join(', ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-5">

          {/* Branch banner */}
          {branchMeta && (
            <div className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5', branchMeta.bg)}>
              <MapPin className={cn('size-3.5 shrink-0', branchMeta.color)} />
              <div>
                <p className="text-[10px] font-body font-bold uppercase opacity-60">Dispatch for</p>
                <p className={cn('text-sm font-display font-bold', branchMeta.color)}>{order.targetBranch}</p>
              </div>
            </div>
          )}

          {/* Step 1: Confirm packing */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="size-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary-foreground">1</span>
              </div>
              <p className="text-xs font-body font-bold text-foreground">Confirm Packed Quantities</p>
            </div>
            <div className="space-y-2">
              {packedEntries.map((entry, idx) => {
                const itemStock = stockByItem[entry.itemName];
                const fullySent = (itemStock?.dispatched ?? 0) > 0 && (itemStock?.available ?? 0) <= 0;

                if (fullySent) {
                  return (
                    <div key={entry.itemId} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-body font-semibold text-emerald-900 truncate">{entry.itemName}</p>
                          <p className="text-[10px] font-body text-emerald-700">
                            Fully sent to {transferBranch} · {itemStock?.dispatched} {itemStock?.unit}
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-body font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                        DONE
                      </span>
                    </div>
                  );
                }

                return (
                <div key={entry.itemId} className={cn(
                  'rounded-xl border p-3.5 transition-all',
                  entry.confirmed ? 'border-emerald-200 bg-emerald-50/60' : 'border-border bg-muted/20'
                )}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-body font-semibold text-foreground">{entry.itemName}</span>
                      {isCustomItem(entry.itemId) && (
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">CUSTOM</span>
                      )}
                    </div>
                    {entry.confirmed
                      ? <button onClick={() => unconfirmEntry(idx)} className="text-[10px] font-body font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95">
                          <CheckCircle2 className="size-3" /> Undo
                        </button>
                      : <button onClick={() => confirmEntry(idx)} disabled={entry.qty <= 0}
                          className="text-[10px] font-body font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 disabled:opacity-40">
                          <CheckCircle2 className="size-3" /> Confirm
                        </button>
                    }
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min={0.01} step={0.25} value={entry.qty}
                      onChange={e => updateEntryQty(idx, e.target.value)} disabled={entry.confirmed}
                      className="w-24 h-9 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50" />
                    {/* BUG #4 FIX: label depends on dispatchUnit, not hardcoded 'kg packed' */}
                    <span className="text-[10px] font-body text-muted-foreground">
                      {entry.dispatchUnit === 'pcs' ? 'kg packed (converts to pcs on confirm)' : 'kg packed'}
                    </span>
                    <span className="text-[10px] font-body text-blue-600">
                      · Baker: {order.preparedItems?.find(p => p.itemId === entry.itemId)?.quantityPrepared ?? '—'} {entry.dispatchUnit === 'pcs' ? 'kg' : 'kg'}
                    </span>
                    <span className="text-[10px] font-body text-muted-foreground">
                      · Requested: {(() => {
                        const oi = order.items.find(i => i.itemId === entry.itemId);
                        if (!oi) return '—';
                        return oi.dispatchUnit === 'pcs' && oi.originalPcs != null ? `${oi.originalPcs} pcs` : `${oi.quantity} kg`;
                      })()}
                    </span>
                  </div>
                  {entry.confirmed && entry.dispatchUnit === 'pcs' && entry.confirmedPcs != null && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-200">
                        <span className="text-[11px] font-body font-bold text-blue-700">
                          {entry.qty} kg → <span className="text-emerald-700">{entry.confirmedPcs} pcs</span>
                        </span>
                      </div>
                      {entry.remainderKg != null && entry.remainderKg > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200">
                          <AlertTriangle className="size-3 text-amber-600 shrink-0" />
                          <span className="text-[11px] font-body font-bold text-amber-700">
                            {Math.round(entry.remainderKg * 1000)}g remainder — kept at bakery, not dispatched
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Lock/unlock indicator */}
            <div className={cn(
              'mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5',
              allConfirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/40 border-border'
            )}>
              {allConfirmed
                ? <><CheckCircle2 className="size-4 text-emerald-600 shrink-0" /><p className="text-xs font-body font-semibold text-emerald-700">All confirmed — dispatch unlocked!</p></>
                : <><Lock className="size-4 text-muted-foreground shrink-0" /><p className="text-xs font-body text-muted-foreground">Confirm all {packedEntries.length} items to unlock dispatch</p></>
              }
            </div>
          </div>

          {/* Step 2: Dispatch */}
          <div className={cn('rounded-2xl border transition-all',
            allConfirmed ? 'border-emerald-200 bg-emerald-50/20' : 'border-border/50 bg-muted/20 opacity-40 pointer-events-none select-none')}>
            <div className="px-4 pt-3.5 pb-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('size-6 rounded-full flex items-center justify-center shrink-0', allConfirmed ? 'bg-emerald-600' : 'bg-muted')}>
                  <span className="text-[10px] font-bold text-white">2</span>
                </div>
                <p className="text-xs font-body font-bold text-foreground">Transfer Out</p>
                {!allConfirmed && <Lock className="size-3 text-muted-foreground ml-auto" />}
              </div>
              <p className="text-[10px] font-body text-muted-foreground mb-2 pl-8">Enter quantities and transfer to the pre-selected branch</p>
            </div>
            <div className="px-4 pb-3">
              {/* Remainder warning — shown above dispatch rows if any pcs item has leftover grams */}
              {packedEntries.some(e => e.remainderKg != null && e.remainderKg > 0) && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-body font-bold text-amber-700">Remainder grams at bakery</p>
                    {packedEntries.filter(e => e.remainderKg != null && e.remainderKg! > 0).map(e => (
                      <p key={e.itemId} className="text-[10px] font-body text-amber-600">
                        {e.itemName}: {Math.round(e.remainderKg! * 1000)}g — cannot form a whole pcs, kept at bakery
                      </p>
                    ))}
                    <p className="text-[10px] font-body text-amber-500 mt-0.5">Admin has been notified automatically.</p>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                  <div className="h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 flex items-center text-xs font-black text-emerald-800">
                    {transferBranch}
                  </div>
                  <p className="self-center text-[11px] font-semibold text-muted-foreground">Destination is fixed from the order and cannot be changed. Select quantities and use one combined Transfer Out.</p>
                </div>
                {preparedItems.map(p => {
                  const stock = stockByItem[p.itemName];
                  const fullySent = (stock?.dispatched ?? 0) > 0 && (stock?.available ?? 0) <= 0;
                  if (fullySent) {
                    return (
                      <div key={p.itemId} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                        <div>
                          <p className="text-xs font-bold text-emerald-900">{p.itemName}</p>
                          <p className="text-[10px] text-emerald-700">✓ Already sent — nothing pending</p>
                        </div>
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      </div>
                    );
                  }
                  const value = transferQty[p.itemName] ?? String(stock?.available ?? 0);
                  return <div key={p.itemId} className="grid grid-cols-[1fr_110px_54px] items-center gap-2 rounded-xl border border-border bg-background p-3">
                    <div><p className="text-xs font-bold">{p.itemName}</p><p className="text-[10px] text-muted-foreground">Available: {stock?.available ?? 0} {stock?.unit ?? 'kg'}</p></div>
                    <input type="number" min="0" max={stock?.available ?? 0} step={stock?.unit === 'pcs' ? 1 : 0.001} value={value} onChange={e => setTransferQty(current => ({ ...current, [p.itemName]: e.target.value }))} className="h-9 rounded-lg border border-border px-2 text-right text-xs font-bold" />
                    <span className="text-[10px] font-bold text-muted-foreground">{stock?.unit ?? 'kg'}</span>
                  </div>;
                })}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={printTransferChecklist} className="h-11 rounded-xl border border-border bg-card text-xs font-bold flex items-center justify-center gap-2"><Printer className="size-4"/> Print Checklist</button>
                  <button type="button" onClick={transferAll} disabled={transferring || allDispatched} className="h-11 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40">{transferring ? <Loader2 className="size-4 animate-spin"/> : <Truck className="size-4"/>} Transfer Out</button>
                </div>
              </div>
            </div>
          </div>

          {dispatchError && <p className="text-xs font-body text-destructive text-center">{dispatchError}</p>}

          {/* Dispatch log */}
          {dispatchLog.length > 0 && (
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Dispatch Log</p>
              <div className="space-y-1.5">
                {dispatchLog.map(d => {
                  const bm = BRANCH_META[d.branch];
                  return (
                    <div key={d.id} className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-body font-semibold text-foreground">{d.itemName} × {d.quantity} {d.unit ?? 'kg'}</p>
                        <p className="text-[10px] font-body text-muted-foreground">{new Date(d.dispatchedAt).toLocaleString('en-IN')} · {d.dispatchedBy}</p>
                      </div>
                      <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border shrink-0', bm.bg, bm.color)}>
                        {bm.icon} {d.branch}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allDispatched && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-body font-semibold text-emerald-700">All stock dispatched for this order ✓</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dispatched Order Card (compact — for Dispatched tab) ─────────────────────
function DispatchedOrderCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const dispatchLog = useMemo(() => order.dispatchLog ?? [], [order.dispatchLog]);
  const branchMeta  = order.targetBranch ? BRANCH_META[order.targetBranch] : null;

  const byBranch = useMemo(() => {
    const g: Record<string, typeof dispatchLog> = {};
    dispatchLog.forEach(d => {
      if (!g[d.branch]) g[d.branch] = [];
      g[d.branch].push(d);
    });
    return g;
  }, [dispatchLog]);

  const lastDispatch = dispatchLog.length > 0
    ? dispatchLog.reduce((latest, d) => new Date(d.dispatchedAt) > new Date(latest.dispatchedAt) ? d : latest)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20" onClick={() => setExpanded(v => !v)}>
        <div className="size-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-base font-bold text-emerald-700">✓</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">Order #{order.orderNumber}</span>
            <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">DISPATCHED</span>
            {branchMeta && (
              <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1', branchMeta.bg, branchMeta.color)}>
                {branchMeta.icon} {order.targetBranch}
              </span>
            )}
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {dispatchLog.length} entr{dispatchLog.length === 1 ? 'y' : 'ies'} · {lastDispatch
              ? new Date(lastDispatch.dispatchedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
              : '—'}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Per-branch summary chips */}
          <div className="grid grid-cols-3 gap-2">
            {BRANCHES.map(b => {
              const entries  = byBranch[b] ?? [];
              const totalKg  = entries.filter(d => (d.unit ?? 'kg') !== 'pcs').reduce((s, d) => s + d.quantity, 0);
              const totalPcs = entries.filter(d => d.unit === 'pcs').reduce((s, d) => s + d.quantity, 0);
              const bm = BRANCH_META[b];
              return (
                <div key={b} className={cn('rounded-xl border p-2.5 text-center', entries.length > 0 ? bm.bg : 'bg-card border-border')}>
                  <p className="text-sm leading-none mb-1">{bm.icon}</p>
                  {totalKg  > 0 && <p className={cn('font-display text-sm font-bold tabular-nums', bm.color)}>{totalKg % 1 === 0 ? totalKg : totalKg.toFixed(2)} kg</p>}
                  {totalPcs > 0 && <p className={cn('font-display text-sm font-bold tabular-nums', bm.color)}>{totalPcs} pcs</p>}
                  {totalKg === 0 && totalPcs === 0 && <p className="font-display text-base font-bold text-muted-foreground">—</p>}
                  <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{b}</p>
                </div>
              );
            })}
          </div>

          {/* Full dispatch log */}
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Dispatch Log</p>
            <div className="space-y-1.5">
              {dispatchLog.map(d => {
                const bm = BRANCH_META[d.branch];
                return (
                  <div key={d.id} className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-body font-semibold text-foreground">{d.itemName} × {d.quantity} {d.unit ?? 'kg'}</p>
                      <p className="text-[10px] font-body text-muted-foreground">
                        {new Date(d.dispatchedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })} · {d.dispatchedBy}
                      </p>
                    </div>
                    <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border shrink-0', bm.bg, bm.color)}>
                      {bm.icon} {d.branch}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formatting + summary helpers ─────────────────────────────────────────────
function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function orderMatchesSearch(
  order: ReturnType<typeof useBakeryStore.getState>['orders'][0],
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    String(order.orderNumber),
    order.createdBy,
    order.targetBranch,
    order.status,
    order.notes,
    ...(order.items ?? []).map(i => i.itemName),
    ...(order.preparedItems ?? []).map(i => i.itemName),
    ...(order.dispatchLog ?? []).map(d => `${d.itemName} ${d.branch} ${d.dispatchedBy}`),
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function orderLastDispatchAt(order: ReturnType<typeof useBakeryStore.getState>['orders'][0]) {
  const log = order.dispatchLog ?? [];
  if (log.length === 0) return '';
  return log.reduce((latest, d) => new Date(d.dispatchedAt) > new Date(latest.dispatchedAt) ? d : latest).dispatchedAt;
}

function getPreparedDisplayQty(order: ReturnType<typeof useBakeryStore.getState>['orders'][0], item: PreparedItem) {
  const orderItem = order.items.find(i => i.itemId === item.itemId || i.itemName === item.itemName);
  if (orderItem?.dispatchUnit === 'pcs' && orderItem.weightGrams != null) {
    const pcs = kgToPcs(item.quantityPrepared, orderItem.weightGrams) ?? 0;
    return `${formatQty(item.quantityPrepared)} kg → ${pcs} pcs`;
  }
  return `${formatQty(item.quantityPrepared)} kg`;
}

function printDailyClosure(payload: {
  title: string;
  periodLabel: string;
  totalPacked: number;
  dispatchedOrders: number;
  pendingOrders: number;
  holdOrders: number;
  itemRows: { itemName: string; kg: number; pcs: number; entries: number; branches: string[] }[];
  branchTotals: Record<Branch, { kg: number; pcs: number; orders: number }>;
}) {
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) return;
  const itemRows = payload.itemRows.map(row => `
    <tr>
      <td>${row.itemName}</td>
      <td class="num">${formatQty(row.kg)}</td>
      <td class="num">${formatQty(row.pcs)}</td>
      <td class="num">${row.entries}</td>
      <td>${row.branches.join(', ') || '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">No dispatches found for this period</td></tr>';
  const branchRows = BRANCHES.map(branch => {
    const total = payload.branchTotals[branch];
    return `<tr><td>${branch}</td><td class="num">${formatQty(total.kg)}</td><td class="num">${formatQty(total.pcs)}</td><td class="num">${total.orders}</td></tr>`;
  }).join('');
  win.document.write(`<!doctype html><html><head><title>${payload.title}</title><style>
    *{box-sizing:border-box} body{font-family:Arial,sans-serif;margin:24px;color:#111827} h1{margin:0 0 4px;font-size:22px} .muted{color:#6b7280;font-size:12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.card{border:1px solid #e5e7eb;border-radius:12px;padding:12px}.label{font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:700}.value{font-size:22px;font-weight:800;margin-top:4px} table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px} th,td{border:1px solid #e5e7eb;padding:8px;text-align:left} th{background:#f9fafb;text-transform:uppercase;font-size:10px}.num{text-align:right}.section{margin-top:20px}.empty{text-align:center;color:#6b7280;padding:18px}@media print{body{margin:14mm}.no-print{display:none}.cards{grid-template-columns:repeat(4,1fr)}}
  </style></head><body>
    <button class="no-print" onclick="window.print()" style="float:right;padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:#fff">Print</button>
    <h1>${payload.title}</h1><div class="muted">${payload.periodLabel} · Generated ${formatDateTime(new Date().toISOString())}</div>
    <div class="cards">
      <div class="card"><div class="label">Packed Orders</div><div class="value">${payload.totalPacked}</div></div>
      <div class="card"><div class="label">Dispatched Orders</div><div class="value">${payload.dispatchedOrders}</div></div>
      <div class="card"><div class="label">Pending Orders</div><div class="value">${payload.pendingOrders}</div></div>
      <div class="card"><div class="label">Hold / Cancelled</div><div class="value">${payload.holdOrders}</div></div>
    </div>
    <div class="section"><h2>Item-wise Summary</h2><table><thead><tr><th>Item</th><th>KG</th><th>Pcs</th><th>Entries</th><th>Branches</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    <div class="section"><h2>Branch Summary</h2><table><thead><tr><th>Branch</th><th>KG</th><th>Pcs</th><th>Orders</th></tr></thead><tbody>${branchRows}</tbody></table></div>
  </body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 300);
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PackingDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, fetchOrders, subscribe: subscribeOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [isExporting, setIsExporting] = useState(false);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const unsubscribe = subscribeOrders();
    // Realtime is the primary update path; polling only recovers a missed event.
    const id = setInterval(() => { if (!document.hidden) fetchOrders(true); }, 60_000);
    return () => { unsubscribe(); clearInterval(id); };
  }, [fetchOrders, subscribeOrders]);

  const requestedTab = searchParams.get('tab') as ActiveTab | null;
  const activeTab: ActiveTab = requestedTab && PACKING_TABS.includes(requestedTab) ? requestedTab : 'orders';
  const [closureSubTab, setClosureSubTab] = useState<'transfer' | 'billing'>('transfer');
  const branchStock = useBranchStore(state => state.stock.SNB);
  const branchSales = useBranchStore(state => state.sales.SNB);
  const branchCreditSales = useBranchStore(state => state.creditSales.SNB);
  const fetchBranchData = useBranchStore(state => state.fetchBranchData);
  const [packingCounterOpen, setPackingCounterOpen] = useState(false);
  const [packingCounterLoading, setPackingCounterLoading] = useState(true);
  const [packingCounterError, setPackingCounterError] = useState('');

  const refreshPackingCounter = useCallback(async () => {
    setPackingCounterLoading(true);
    setPackingCounterError('');
    try {
      const status = await getPackingCounterStatus();
      setPackingCounterOpen(status.isOpen);
      return status.isOpen;
    } catch (error) {
      setPackingCounterOpen(false);
      setPackingCounterError(error instanceof Error ? error.message : 'Packing counter status could not be loaded.');
      return false;
    } finally {
      setPackingCounterLoading(false);
    }
  }, []);

  const requirePackingCounterOpen = useCallback(async () => {
    const status = await getPackingCounterStatus();
    setPackingCounterOpen(status.isOpen);
    if (!status.isOpen) throw new Error('Packing cashier counter is closed. Open the counter from Daily Closure before creating a bill.');
  }, []);

  const handlePackingCounterChange = useCallback((isOpen: boolean) => {
    setPackingCounterOpen(isOpen);
    setPackingCounterLoading(false);
    setPackingCounterError('');
  }, []);

  const goToPackingCounter = useCallback(() => {
    setSearchParams({ tab: 'closure' });
  }, [setSearchParams]);

  useEffect(() => {
    if (activeTab === 'billing' || activeTab === 'closure') {
      void fetchBranchData('SNB');
      void refreshPackingCounter();
    }
  }, [activeTab, fetchBranchData, refreshPackingCounter]);

  useEffect(() => {
    const onFocus = () => { if (activeTab === 'billing') void refreshPackingCounter(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeTab, refreshPackingCounter]);

  const packingOrders = useMemo(
    () => orders.filter(o => ['partially_packed', 'packed', 'dispatched'].includes(o.status)),
    [orders],
  );
  const readyToPackOrders = useMemo(
    () => packingOrders.filter(o => o.status === 'packed' || o.status === 'partially_packed'),
    [packingOrders],
  );
  const dispatchedOrders = useMemo(
    () => packingOrders.filter(o => o.status === 'dispatched'),
    [packingOrders],
  );

  const filteredPackingOrders = useMemo(() => {
    return readyToPackOrders
      .filter(o => branchFilter === 'all' ? true : o.targetBranch === branchFilter)
      .filter(o => orderMatchesSearch(o, search))
      .sort((a, b) => {
        const aTime = new Date(a.sentToPackingAt || a.createdAt).getTime();
        const bTime = new Date(b.sentToPackingAt || b.createdAt).getTime();
        return bTime - aTime;
      });
  }, [readyToPackOrders, branchFilter, search]);

  const filteredDispatchedOrders = useMemo(() => {
    return dispatchedOrders
      .filter(o => branchFilter === 'all' ? true : o.targetBranch === branchFilter)
      .filter(o => orderMatchesSearch(o, search))
      .sort((a, b) => {
        const aTime = new Date(orderLastDispatchAt(a) || a.sentToPackingAt || a.createdAt).getTime();
        const bTime = new Date(orderLastDispatchAt(b) || b.sentToPackingAt || b.createdAt).getTime();
        return bTime - aTime;
      });
  }, [branchFilter, dispatchedOrders, search]);

  const leftoverRows = useMemo(() => orders.flatMap(order => {
    if (!['partially_packed', 'packed', 'dispatched'].includes(order.status)) return [];
    if (branchFilter !== 'all' && order.targetBranch !== branchFilter) return [];

    return (order.preparedItems ?? []).flatMap(prepared => {
      const orderItem = order.items.find(item => item.itemName === prepared.itemName);
      const dispatches = (order.dispatchLog ?? []).filter(entry => entry.itemName === prepared.itemName);
      const isPieces = orderItem?.dispatchUnit === 'pcs' && Boolean(orderItem.weightGrams);
      const dispatchedQuantity = dispatches.reduce((sum, entry) => sum + entry.quantity, 0);
      const dispatchedKg = isPieces
        ? (dispatchedQuantity * (orderItem?.weightGrams ?? 0)) / 1000
        : dispatchedQuantity;
      const leftoverKg = Math.max(0, Math.round((prepared.quantityPrepared - dispatchedKg) * 1000) / 1000);
      if (leftoverKg < 0.001) return [];

      return [{
        orderId: order.id,
        orderNumber: order.orderNumber,
        branch: order.targetBranch,
        itemName: prepared.itemName,
        preparedKg: prepared.quantityPrepared,
        dispatchedKg,
        leftoverKg,
        leftoverGrams: Math.round(leftoverKg * 1000),
        pieceWeightGrams: isPieces ? orderItem?.weightGrams : undefined,
        preparedAt: prepared.preparedAt,
      }];
    });
  }).filter(row => {
    const needle = search.trim().toLowerCase();
    return !needle || `${row.orderNumber} ${row.itemName} ${row.branch ?? ''}`.toLowerCase().includes(needle);
  }).sort((a, b) => b.leftoverGrams - a.leftoverGrams), [orders, branchFilter, search]);

  const cutoff = useMemo(() => getCutoff(timeFilter), [timeFilter]);
  const periodLabel = TIME_FILTERS.find(t => t.key === timeFilter)?.label ?? 'Today';

  const closureOrders = useMemo(() => {
    return packingOrders.filter(order => {
      if (branchFilter !== 'all' && order.targetBranch !== branchFilter) return false;
      return (order.dispatchLog ?? []).some(entry =>
        new Date(entry.dispatchedAt) >= cutoff &&
        (branchFilter === 'all' || entry.branch === branchFilter)
      );
    });
  }, [packingOrders, branchFilter, cutoff]);

  const closureDispatchEntries = useMemo(() => {
    return closureOrders.flatMap(order => (order.dispatchLog ?? [])
      .filter(entry => new Date(entry.dispatchedAt) >= cutoff)
      .filter(entry => branchFilter === 'all' ? true : entry.branch === branchFilter)
      .map(entry => ({ order, entry })));
  }, [closureOrders, cutoff, branchFilter]);

  const itemSummary = useMemo(() => {
    const summary: Record<string, { itemName: string; kg: number; pcs: number; entries: number; branches: Set<string> }> = {};
    closureDispatchEntries.forEach(({ entry }) => {
      if (!summary[entry.itemName]) summary[entry.itemName] = { itemName: entry.itemName, kg: 0, pcs: 0, entries: 0, branches: new Set() };
      if (entry.unit === 'pcs') summary[entry.itemName].pcs += entry.quantity;
      else summary[entry.itemName].kg += entry.quantity;
      summary[entry.itemName].entries += 1;
      summary[entry.itemName].branches.add(entry.branch);
    });
    return Object.values(summary)
      .map(row => ({ ...row, branches: Array.from(row.branches).sort() }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [closureDispatchEntries]);

  const closureBranchTotals = useMemo(() => {
    const totals: Record<Branch, { kg: number; pcs: number; orders: number; orderIds: Set<string> }> = {
      VRSNB: { kg: 0, pcs: 0, orders: 0, orderIds: new Set() },
      SNB: { kg: 0, pcs: 0, orders: 0, orderIds: new Set() },
      Hosur: { kg: 0, pcs: 0, orders: 0, orderIds: new Set() },
    };
    closureDispatchEntries.forEach(({ order, entry }) => {
      if (entry.unit === 'pcs') totals[entry.branch].pcs += entry.quantity;
      else totals[entry.branch].kg += entry.quantity;
      totals[entry.branch].orderIds.add(order.id);
    });
    BRANCHES.forEach(branch => { totals[branch].orders = totals[branch].orderIds.size; });
    return totals;
  }, [closureDispatchEntries]);

  const totalPackedForPeriod = closureOrders.length;
  const totalDispatchedForPeriod = closureOrders.length;
  const pendingForPeriod = readyToPackOrders.filter(order => branchFilter === 'all' || order.targetBranch === branchFilter).length;
  const holdCancelledForPeriod = 0;

  const billingSalesForPeriod = useMemo(() => branchSales.filter(sale => new Date(sale.soldAt) >= cutoff), [branchSales, cutoff]);
  const billingCreditForPeriod = useMemo(() => branchCreditSales.filter(sale => new Date(sale.createdAt) >= cutoff), [branchCreditSales, cutoff]);
  const billingSummary = useMemo(() => {
    const methodTotals: Record<string, number> = {};
    let gross = 0;
    const bills = new Set<string>();
    billingSalesForPeriod.forEach(sale => {
      const amount = sale.quantitySold * sale.unitPrice;
      gross += amount;
      const method = (sale.paymentMethod || 'cash').toLowerCase();
      methodTotals[method] = (methodTotals[method] || 0) + amount;
      if (sale.billNo) bills.add(sale.billNo);
    });
    const creditRaised = billingCreditForPeriod.reduce((sum, sale) => sum + sale.creditAmount, 0);
    const creditCollected = billingCreditForPeriod.reduce((sum, sale) => sum + sale.amountPaid, 0);
    return { gross, methodTotals, billCount: bills.size, creditRaised, creditCollected };
  }, [billingSalesForPeriod, billingCreditForPeriod]);

  const handleExport = () => {
    setIsExporting(true);
    try {
      exportToExcel(packingOrders, timeFilter);
    } finally {
      setTimeout(() => setIsExporting(false), 800);
    }
  };

  const handlePrintClosure = () => {
    printDailyClosure({
      title: 'Packing Daily Closure',
      periodLabel,
      totalPacked: totalPackedForPeriod,
      dispatchedOrders: totalDispatchedForPeriod,
      pendingOrders: pendingForPeriod,
      holdOrders: holdCancelledForPeriod,
      itemRows: itemSummary,
      branchTotals: closureBranchTotals,
    });
  };

  const refreshNow = () => {
    setInitialLoading(true);
    fetchOrders(true).finally(() => setInitialLoading(false));
  };

  return (
    <div className="dashboard-screen min-h-screen bg-transparent">
      <main className="min-w-0 pb-8">
        <div className="px-4 md:px-6 lg:px-8 pt-5 md:pt-6 space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">
                {activeTab === 'orders' ? 'Packing workflow' : activeTab === 'cake-orders' ? 'Cake dispatch' : activeTab === 'transfer-in' ? 'Incoming stock' : activeTab === 'billing' ? 'Packing sales' : activeTab === 'leftover' ? 'Undispatched balance' : activeTab === 'dispatched' ? 'Dispatched history' : 'Packing closure'}
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">
                {activeTab === 'orders' ? 'Packing Orders' : activeTab === 'cake-orders' ? 'Cake Orders' : activeTab === 'transfer-in' ? 'Transfer In' : activeTab === 'billing' ? 'Billing' : activeTab === 'leftover' ? 'Leftover Items' : activeTab === 'dispatched' ? 'Dispatched' : 'Daily Closure'}
              </h2>
              <p className="text-xs md:text-sm font-body text-muted-foreground mt-1">
                {activeTab === 'orders'
                  ? 'Review baker-prepared orders, confirm packed quantity, and dispatch stock to branches.'
                  : activeTab === 'cake-orders'
                  ? 'Cake Master orders ready for packing — dispatch each one to the branch that ordered it.'
                  : activeTab === 'leftover'
                  ? 'Every prepared gram that has not yet been dispatched is listed here.'
                  : activeTab === 'dispatched'
                  ? 'Orders dispatched to branches are kept here for follow-up.'
                  : 'Verify packed, pending, and dispatched work before closing the packing day.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshNow}
                className="h-10 px-3.5 rounded-xl border border-border bg-card text-xs font-body font-bold text-foreground flex items-center gap-2 hover:bg-muted/40 active:scale-95 transition-all">
                {initialLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Refresh
              </button>
              {activeTab === 'closure' && (
                <>
                  <button
                    onClick={handlePrintClosure}
                    className="h-10 px-3.5 rounded-xl border border-border bg-card text-xs font-body font-bold text-foreground flex items-center gap-2 hover:bg-muted/40 active:scale-95 transition-all">
                    <Printer className="size-3.5" /> Print
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="h-10 px-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-body font-bold border border-green-700 shadow-sm active:scale-95 transition-all disabled:opacity-60 flex items-center gap-2">
                    {isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
                    Export Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'transfer-in' ? (
            <PackingTransferInTab />
          ) : activeTab === 'cake-orders' ? (
            <PackingCakeOrdersTab />
          ) : activeTab === 'billing' ? (
            <div className="min-h-[70vh] space-y-3">
              {packingCounterError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline size-4" />{packingCounterError}</div>}
              <BranchBillingProTab
                branch="SNB"
                branchStock={branchStock}
                billingAllowed={!packingCounterLoading && packingCounterOpen}
                billingBlockedMessage={packingCounterLoading ? 'Checking today’s packing counter status…' : 'Open today’s Packing cashier counter in Daily Closure before billing.'}
                beforeCheckout={requirePackingCounterOpen}
                onOpenCounter={goToPackingCounter}
              />
            </div>
          ) : activeTab === 'orders' ? (
            <section className="space-y-4">
              {/* Filters */}
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">
                    {filteredPackingOrders.length} baker-ready order{filteredPackingOrders.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, item or branch" className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25" />
                  <select
                    value={branchFilter}
                    onChange={e => setBranchFilter(e.target.value as BranchFilter)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25">
                    <option value="all">All Branches</option>
                    {BRANCHES.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                  </div>
                </div>
              </div>

              {initialLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <p className="text-xs font-body text-muted-foreground">Loading packing orders…</p>
                </div>
              ) : filteredPackingOrders.length > 0 ? (
                <div className="space-y-3">
                  {filteredPackingOrders.map(order => <PackingOrderCard key={order.id} order={order} />)}
                </div>
              ) : (
                <div className="flex flex-col items-center py-24 gap-4 px-4 rounded-2xl border border-dashed border-border bg-card">
                  <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                    <Package className="size-10 text-muted-foreground opacity-30" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-body font-semibold text-foreground">No packing orders found</p>
                    <p className="text-xs font-body text-muted-foreground mt-1">Try clearing filters or wait for baker-prepared orders.</p>
                  </div>
                </div>
              )}
            </section>
          ) : activeTab === 'leftover' ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    {leftoverRows.length} item balance{leftoverRows.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, item or branch" className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25" />
                    <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as BranchFilter)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground">
                      <option value="all">All Branches</option>
                      {BRANCHES.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {leftoverRows.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="min-w-[760px] w-full text-left text-xs">
                      <thead className="bg-slate-950 text-white">
                        <tr>{['Order', 'Branch', 'Item', 'Prepared', 'Dispatched', 'Leftover', 'Prepared At'].map(label => <th key={label} className="px-4 py-3 font-black uppercase tracking-wide">{label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {leftoverRows.map(row => (
                          <tr key={`${row.orderId}-${row.itemName}`} className="border-t border-border even:bg-slate-50 hover:bg-amber-50/50">
                            <td className="px-4 py-3 font-black">#{row.orderNumber}</td>
                            <td className="px-4 py-3 font-black">{row.branch ?? '-'}</td>
                            <td className="px-4 py-3 font-black">{row.itemName}</td>
                            <td className="px-4 py-3 font-black tabular-nums">{row.preparedKg.toFixed(3)} kg</td>
                            <td className="px-4 py-3 font-black tabular-nums">{row.dispatchedKg.toFixed(3)} kg</td>
                            <td className="px-4 py-3"><span className="rounded-full bg-red-100 px-2.5 py-1 font-black tabular-nums text-red-700">{row.leftoverGrams} g</span>{row.pieceWeightGrams ? <span className="ml-2 font-bold text-slate-500">({row.pieceWeightGrams} g/pc)</span> : null}</td>
                            <td className="px-4 py-3 font-bold text-slate-500">{new Date(row.preparedAt).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-12 text-center">
                  <CheckCircle2 className="mx-auto size-9 text-emerald-600" />
                  <p className="mt-3 text-sm font-black text-emerald-800">No leftover quantity</p>
                  <p className="mt-1 text-xs font-bold text-emerald-700">All prepared quantities are fully dispatched.</p>
                </div>
              )}
            </section>
          ) : activeTab === 'dispatched' ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">
                    {filteredDispatchedOrders.length} dispatched order{filteredDispatchedOrders.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, item or branch" className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25" />
                  <select
                    value={branchFilter}
                    onChange={e => setBranchFilter(e.target.value as BranchFilter)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25">
                    <option value="all">All Branches</option>
                    {BRANCHES.map(branch => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                  </div>
                </div>
              </div>

              {initialLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <p className="text-xs font-body text-muted-foreground">Loading dispatched orders...</p>
                </div>
              ) : filteredDispatchedOrders.length > 0 ? (
                <div className="space-y-3">
                  {filteredDispatchedOrders.map(order => <DispatchedOrderCard key={order.id} order={order} />)}
                </div>
              ) : (
                <div className="flex flex-col items-center py-24 gap-4 px-4 rounded-2xl border border-dashed border-border bg-card">
                  <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                    <Truck className="size-10 text-muted-foreground opacity-30" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-body font-semibold text-foreground">No dispatched orders found</p>
                    <p className="text-xs font-body text-muted-foreground mt-1">Orders appear here after packing dispatches them to branches.</p>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <PackingDailyClosureTab onCounterStatusChange={handlePackingCounterChange} />
          )}
        </div>
      </main>
    </div>
  );
}
