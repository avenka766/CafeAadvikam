// src/bakery/BakerDashboard.tsx  (Redesigned)
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChefHat, Send, Loader2, ChevronDown, ChevronUp, CheckCircle2, Flame, Download, Calendar, AlertCircle, FileSpreadsheet, Printer, Search, RefreshCw, RotateCcw } from 'lucide-react';
import { useBakeryStore, fetchBakeryOrdersInRange } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import type { PreparedItem } from './types';
import type { BakeryOrder, BakeryOrderItem } from './types';
import { cn } from '@/lib/utils';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import * as XLSX from '@/lib/safeSpreadsheet';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { PRODUCTION_LABELS, type ProductionDestination } from './productionRouting';

function belongsToProductionDesk(order: BakeryOrder, destination: ProductionDestination) {
  return destination === 'baker'
    ? !order.productionDestination || order.productionDestination === 'baker'
    : order.productionDestination === destination;
}

// ─── Report helpers ───────────────────────────────────────────────────────────

type PeriodKey = 'today' | '7d' | '15d' | '30d' | 'custom';

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: 'today', label: 'Today',   days: 0  },
  { key: '7d',    label: '7 Days',  days: 7  },
  { key: '15d',   label: '15 Days', days: 15 },
  { key: '30d',   label: '30 Days', days: 30 },
  { key: 'custom', label: 'Custom', days: null },
];

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function inputDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function AttachmentPreview({ name, dataUrl }: { name?: string; dataUrl?: string }) {
  if (!name && !dataUrl) return null;
  return (
    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
      <p className="mb-2 text-[10px] font-body font-bold uppercase tracking-wide text-amber-700">Cake Reference Image</p>
      {dataUrl ? (
        <a href={dataUrl} target="_blank" rel="noreferrer" className="block">
          <img src={dataUrl} alt={name || 'Cake reference'} className="max-h-48 w-full rounded-xl bg-white object-contain" />
        </a>
      ) : (
        <p className="text-xs font-body font-semibold text-amber-900">{name}</p>
      )}
      {name && <p className="mt-1 truncate text-[10px] font-body font-bold text-amber-800">{name}</p>}
    </div>
  );
}

function safeDate(iso?: string) {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : 0;
}

function orderCompletedAt(order: BakeryOrder) {
  return order.sentToPackingAt || order.createdAt;
}

function orderStatusLabel(status: BakeryOrder['status']) {
  if (status === 'packed') return 'At Packing';
  if (status === 'dispatched') return 'Dispatched';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getRequestedQtyLabel(item: BakeryOrderItem) {
  if (item.originalPcs != null && item.weightGrams != null) return `${item.originalPcs} pcs → ${item.quantity} kg`;
  return `${item.quantity} ${item.dispatchUnit === 'pcs' ? 'pcs' : 'kg'}`;
}

function getPreparedQtyLabel(order: BakeryOrder, prepared: PreparedItem) {
  const source = order.items.find(i => i.itemId === prepared.itemId);
  const unit = source?.originalPcs != null && source.weightGrams != null ? 'kg' : (prepared.dispatchUnit ?? source?.dispatchUnit ?? 'kg');
  return `${prepared.quantityPrepared} ${unit}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function printCompletedOrder(order: BakeryOrder) {
  const printWindow = window.open('', '_blank', 'width=680,height=760');
  if (!printWindow) return;

  const preparedRows = (order.preparedItems ?? []).map(prepared => {
    const source = order.items.find(i => i.itemId === prepared.itemId);
    return `
      <tr>
        <td>${escapeHtml(prepared.itemName)}</td>
        <td>${escapeHtml(source ? getRequestedQtyLabel(source) : '—')}</td>
        <td>${escapeHtml(getPreparedQtyLabel(order, prepared))}</td>
      </tr>
    `;
  }).join('');

  const requestedRows = order.preparedItems?.length ? '' : order.items.map(item => `
    <tr>
      <td>${escapeHtml(item.itemName)}</td>
      <td>${escapeHtml(getRequestedQtyLabel(item))}</td>
      <td>—</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Baker Completed Order #${order.orderNumber}</title>
      <style>
        * { box-sizing: border-box; }
        @page { margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.35; }
        .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .muted { color: #6b7280; }
        .badge { display: inline-block; border: 1px solid #d1d5db; border-radius: 999px; padding: 3px 9px; font-weight: 700; }
        .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px; }
        .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px; }
        .label { font-size: 9px; color: #6b7280; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
        .value { font-size: 13px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; background: #f3f4f6; color: #4b5563; font-size: 10px; text-transform: uppercase; padding: 8px; }
        td { border-bottom: 1px solid #e5e7eb; padding: 8px; }
        .footer { margin-top: 14px; color: #9ca3af; font-size: 10px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Completed Baker Order #${order.orderNumber}</h1>
          <div class="muted">Printed: ${new Date().toLocaleString('en-IN')}</div>
        </div>
        <div><span class="badge">${escapeHtml(orderStatusLabel(order.status))}</span></div>
      </div>
      <div class="meta">
        <div class="box"><div class="label">Branch</div><div class="value">${escapeHtml(order.targetBranch ?? '—')}</div></div>
        <div class="box"><div class="label">Created By</div><div class="value">${escapeHtml(order.createdBy || '—')}</div></div>
        <div class="box"><div class="label">Created</div><div class="value">${escapeHtml(fmtDateTime(order.createdAt))}</div></div>
        <div class="box"><div class="label">Completed</div><div class="value">${escapeHtml(fmtDateTime(orderCompletedAt(order)))}</div></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Requested</th><th>Prepared</th></tr></thead>
        <tbody>${preparedRows || requestedRows}</tbody>
      </table>
      ${order.notes ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ''}
      <div class="footer">Cafe Aadvikam · Baker Completed Order</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

interface BakerReportRow {
  orderNumber: number;
  targetBranch: string;
  itemName: string;
  requestedQty: number;
  requestedUnit: string;
  preparedQty: number;
  preparedUnit: string;
  sentToPackingAt: string;
  status: string;
  createdBy: string;
}

async function fetchBakerReport(from: Date, to: Date, destination: ProductionDestination): Promise<BakerReportRow[]> {
  let query = supabase
    .from('bakery_orders')
    .select('order_number, target_branch, items, prepared_items, sent_to_packing_at, status, created_by, created_at, production_destination')
    .in('status', ['packed', 'dispatched'])
    .order('sent_to_packing_at', { ascending: false, nullsFirst: false });
  query = destination === 'baker'
    ? query.or('production_destination.is.null,production_destination.eq.baker')
    : query.eq('production_destination', destination);
  const { data, error } = await query;

  if (error) { console.warn('BakerReport fetch error:', error.message); return []; }

  const rows: BakerReportRow[] = [];
  for (const r of data ?? []) {
    const reportDate = new Date((r.sent_to_packing_at as string | null) ?? (r.created_at as string));
    if (reportDate < from || reportDate > to) continue;
    const preparedItems = (r.prepared_items as PreparedItem[]) ?? [];
    const requestedItems = (r.items as { itemId: string; itemName: string; quantity: number; dispatchUnit?: string; originalPcs?: number }[]) ?? [];

    for (const p of preparedItems) {
      const req = requestedItems.find(i => i.itemId === p.itemId);
      rows.push({
        orderNumber:   r.order_number as number,
        targetBranch:  (r.target_branch as string) ?? '—',
        itemName:      p.itemName,
        requestedQty:  req?.originalPcs ?? req?.quantity ?? 0,
        requestedUnit: req?.originalPcs != null ? 'pcs' : (req?.dispatchUnit ?? 'kg'),
        preparedQty:   p.quantityPrepared,
        preparedUnit:  req?.originalPcs != null ? 'kg' : (p.dispatchUnit ?? 'kg'),
        sentToPackingAt: (r.sent_to_packing_at as string) ?? '',
        status:        r.status as string,
        createdBy:     (r.created_by as string) ?? '—',
      });
    }
  }
  return rows;
}

// ─── Daily Closure Tab ───────────────────────────────────────────────────────
function DailyClosureTab({ destination, title }: { destination: ProductionDestination; title: string }) {
  const [period, setPeriod]         = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(inputDate(new Date()));
  const [customTo, setCustomTo]     = useState(inputDate(new Date()));
  const [rows, setRows]             = useState<BakerReportRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const { from, to } = useMemo(() => {
    if (period === 'custom') {
      return {
        from: startOfDay(new Date(`${customFrom}T00:00:00`)),
        to: endOfDay(new Date(`${customTo}T00:00:00`)),
      };
    }
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const f = new Date(); f.setDate(f.getDate() - Number(days));
    return { from: startOfDay(f), to: endOfDay(new Date()) };
  }, [customFrom, customTo, period]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchBakerReport(from, to, destination);
      setRows(data); setLastLoaded(new Date());
    } catch {
      setError('Failed to load daily closure. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [destination, from, to]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? period;
  const orderMap = useMemo(() => {
    const map = new Map<number, BakerReportRow[]>();
    for (const r of rows) {
      if (!map.has(r.orderNumber)) map.set(r.orderNumber, []);
      map.get(r.orderNumber)!.push(r);
    }
    return map;
  }, [rows]);

  const totalOrders = orderMap.size;
  const totalItems = rows.length;
  const dispatched = useMemo(() => new Set(rows.filter(r => r.status === 'dispatched').map(r => r.orderNumber)).size, [rows]);
  const atPacking = Math.max(totalOrders - dispatched, 0);
  const preparedByUnit = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    const unit = row.preparedUnit || 'unit';
    acc[unit] = (acc[unit] ?? 0) + (Number(row.preparedQty) || 0);
    return acc;
  }, {}), [rows]);
  const preparedSummary = Object.entries(preparedByUnit)
    .map(([unit, qty]) => `${qty.toFixed(2)} ${unit}`)
    .join(' + ') || '0';
  const shortageLines = rows.filter(r => r.preparedUnit === r.requestedUnit && r.preparedQty < r.requestedQty).length;

  const summaryRows = useMemo(() => [...orderMap.entries()].map(([num, items]) => ({
    orderNumber: num,
    branch: items[0].targetBranch,
    items: items.map(i => i.itemName).join(', '),
    date: fmtDate(items[0].sentToPackingAt),
    time: fmtTime(items[0].sentToPackingAt),
    status: orderStatusLabel(items[0].status as BakeryOrder['status']),
    baker: items[0].createdBy,
  })), [orderMap]);

  const exportClosure = () => {
    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['Daily Closure', periodLabel],
      ['From', from.toLocaleString('en-IN')],
      ['To', to.toLocaleString('en-IN')],
      [],
      ['Total Orders', totalOrders],
      ['Item Lines', totalItems],
      ['At Packing', atPacking],
      ['Dispatched', dispatched],
      ['Shortage Lines', shortageLines],
      [],
      ['Order #', 'Branch', 'Items', 'Date', 'Time', 'Status', 'Baker'],
      ...summaryRows.map(r => [r.orderNumber, r.branch, r.items, r.date, r.time, r.status, r.baker]),
    ]);
    summarySheet['!cols'] = [12, 16, 44, 14, 10, 14, 18].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Closure Summary');

    const detailSheet = XLSX.utils.aoa_to_sheet([
      ['Order #', 'Branch', 'Item Name', 'Requested Qty', 'Req Unit', 'Prepared Qty', 'Prep Unit', 'Variance', 'Date', 'Time', 'Status'],
      ...rows.map(r => [
        r.orderNumber,
        r.targetBranch,
        r.itemName,
        r.requestedQty,
        r.requestedUnit,
        r.preparedQty,
        r.preparedUnit,
        r.preparedUnit === r.requestedUnit ? r.preparedQty - r.requestedQty : '',
        fmtDate(r.sentToPackingAt),
        fmtTime(r.sentToPackingAt),
        orderStatusLabel(r.status as BakeryOrder['status']),
      ]),
    ]);
    detailSheet['!cols'] = [10, 12, 30, 14, 9, 14, 9, 10, 14, 10, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Item Detail');

    XLSX.writeFile(wb, `${destination}-daily-closure-${periodLabel}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const printClosure = () => {
    const printWindow = window.open('', '_blank', 'width=860,height=780');
    if (!printWindow) return;

    const orderRows = summaryRows.map(r => `
      <tr>
        <td>#${r.orderNumber}</td>
        <td>${escapeHtml(r.branch)}</td>
        <td>${escapeHtml(r.items)}</td>
        <td>${escapeHtml(r.date)} ${escapeHtml(r.time)}</td>
        <td>${escapeHtml(r.status)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Baker Daily Closure - ${periodLabel}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 10mm; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.35; }
          .header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .muted { color: #6b7280; }
          .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0; }
          .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px; }
          .label { font-size: 9px; color: #6b7280; font-weight: 700; text-transform: uppercase; }
          .value { font-size: 16px; font-weight: 800; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { text-align: left; background: #f3f4f6; color: #4b5563; font-size: 10px; text-transform: uppercase; padding: 8px; }
          td { border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
          .footer { margin-top: 14px; color: #9ca3af; font-size: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${escapeHtml(title)} Daily Closure</h1>
          <div class="muted">${periodLabel} · ${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')} · Printed ${new Date().toLocaleString('en-IN')}</div>
        </div>
        <div class="summary">
          <div class="box"><div class="label">Orders</div><div class="value">${totalOrders}</div></div>
          <div class="box"><div class="label">Item Lines</div><div class="value">${totalItems}</div></div>
          <div class="box"><div class="label">At Packing</div><div class="value">${atPacking}</div></div>
          <div class="box"><div class="label">Dispatched</div><div class="value">${dispatched}</div></div>
          <div class="box"><div class="label">Shortage Lines</div><div class="value">${shortageLines}</div></div>
        </div>
        <table>
          <thead><tr><th>Order</th><th>Branch</th><th>Items</th><th>Completed</th><th>Status</th></tr></thead>
          <tbody>${orderRows || '<tr><td colspan="5">No completed work in this period.</td></tr>'}</tbody>
        </table>
        <div class="footer">Cafe Aadvikam · Baker Daily Closure</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <p className="text-xs font-body font-bold text-foreground">Closure Period</p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'min-h-10 px-3 rounded-xl text-xs font-body font-bold transition-all border',
                  period === p.key
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {period === 'custom' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
              From
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
            </label>
            <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
              To
              <input type="date" value={customTo} min={customFrom} max={inputDate(new Date())} onChange={e => setCustomTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
            </label>
          </div>
        )}
        {lastLoaded && !loading && (
          <p className="text-[10px] font-body font-semibold text-muted-foreground">
            Last refreshed: {fmtTime(lastLoaded.toISOString())}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Orders', value: totalOrders, color: 'text-orange-600' },
          { label: 'Item Lines', value: totalItems, color: 'text-primary' },
          { label: 'At Packing', value: atPacking, color: 'text-purple-600' },
          { label: 'Dispatched', value: dispatched, color: 'text-emerald-600' },
          { label: 'Shortage Lines', value: shortageLines, color: shortageLines > 0 ? 'text-red-600' : 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={cn('font-display text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body font-bold text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wider">Total Prepared Quantity</p>
          <p className="font-display text-xl font-bold text-foreground mt-0.5">{preparedSummary}</p>
        </div>
        <button
          onClick={exportClosure}
          disabled={rows.length === 0 || loading}
          className={cn(
            'h-12 rounded-2xl px-4 font-body font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95',
            rows.length > 0 && !loading ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Download className="size-4" /> Export
        </button>
        <button
          onClick={printClosure}
          disabled={loading}
          className="h-12 rounded-2xl px-4 border border-border bg-card font-body font-bold text-sm text-foreground flex items-center justify-center gap-2 hover:bg-muted active:scale-95 disabled:opacity-60"
        >
          <Printer className="size-4" /> Print
        </button>
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm font-body text-muted-foreground">Loading daily closure…</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
          <AlertCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-body font-bold text-red-800">{error}</p>
            <button onClick={load} className="mt-2 text-xs font-body font-semibold text-red-700 underline">Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-card border border-border rounded-3xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
            <FileSpreadsheet className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-body font-bold text-foreground">No completed production found</p>
          <p className="text-xs font-body text-muted-foreground">No items were sent to packing for the selected period.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-card border border-border rounded-3xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="size-4 text-muted-foreground" />
              <p className="text-xs font-body font-bold text-foreground">Closure Detail</p>
              <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{rows.length} item rows</span>
            </div>
            {rows.length > 40 && <p className="text-[10px] font-body text-muted-foreground">Showing first 40 — export to see all</p>}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase border-b border-border">
                <span className="col-span-1">Order</span>
                <span className="col-span-3">Item</span>
                <span className="col-span-2">Branch</span>
                <span className="col-span-2 text-right">Requested</span>
                <span className="col-span-2 text-right">Prepared</span>
                <span className="col-span-2 text-right">Status / Time</span>
              </div>
              {rows.slice(0, 40).map((r, i) => (
                <div key={`${r.orderNumber}-${r.itemName}-${i}`}
                  className={cn('grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 last:border-0 text-xs font-body items-center', i % 2 === 0 ? 'bg-card' : 'bg-muted/20')}
                >
                  <span className="col-span-1 text-muted-foreground tabular-nums">#{r.orderNumber}</span>
                  <span className="col-span-3 font-semibold text-foreground truncate">{r.itemName}</span>
                  <span className="col-span-2">
                    <span className={cn('text-[9px] font-bold px-2 py-1 rounded-full',
                      r.targetBranch === 'VRSNB' ? 'bg-blue-100 text-blue-700' :
                      r.targetBranch === 'SNB' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700')}
                    >
                      {r.targetBranch}
                    </span>
                  </span>
                  <span className="col-span-2 text-right text-muted-foreground tabular-nums">{r.requestedQty} {r.requestedUnit}</span>
                  <span className={cn('col-span-2 text-right font-bold tabular-nums',
                    r.preparedQty < r.requestedQty ? 'text-red-600' :
                    r.preparedQty > r.requestedQty ? 'text-amber-600' : 'text-emerald-600')}
                  >
                    {r.preparedQty} {r.preparedUnit}
                  </span>
                  <span className="col-span-2 text-right text-muted-foreground text-[10px]">
                    <span className="block font-bold text-foreground">{orderStatusLabel(r.status as BakeryOrder['status'])}</span>
                    {r.sentToPackingAt ? fmtTime(r.sentToPackingAt) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {rows.length > 40 && (
            <div className="px-4 py-3 text-center border-t border-border">
              <p className="text-[11px] font-body text-muted-foreground">+{rows.length - 40} more rows — export to see all details</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Active baking card ───────────────────────────────────────────────────────
function ActiveBakeCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { addStagedItem, removeStagedItem, sendStagedToPacking } = useBakeryStore();
  const [expanded, setExpanded] = useState(true);

  const preparedItems = order.preparedItems ?? [];
  const stagedItems = order.stagedItems ?? [];

  // Items still needing attention: not yet sent to packing, not yet staged.
  const pendingItems = order.items.filter(
    i => !preparedItems.some(p => p.itemId === i.itemId) && !stagedItems.some(s => s.itemId === i.itemId)
  );

  const [pickerItemId, setPickerItemId] = useState<string>('');
  const [pickerQty, setPickerQty] = useState<string>('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset the picker whenever the pending list changes shape (e.g. after Add / Send).
  useEffect(() => {
    if (pickerItemId && !pendingItems.some(i => i.itemId === pickerItemId)) {
      setPickerItemId('');
      setPickerQty('');
    }
  }, [pendingItems, pickerItemId]);

  const [addingId,   setAddingId]   = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const isFullyPrepared = pendingItems.length === 0 && stagedItems.length === 0;
  const pickerItem = pendingItems.find(i => i.itemId === pickerItemId) ?? null;

  const filteredPending = pickerSearch.trim()
    ? pendingItems.filter(i => i.itemName.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
    : pendingItems;

  const selectPickerItem = (item: BakeryOrderItem) => {
    setPickerItemId(item.itemId);
    setPickerQty(String(item.quantity));
    setPickerSearch('');
    setPickerOpen(false);
  };

  const handleAdd = async () => {
    if (!pickerItem) return;
    const qty = Number.parseFloat(pickerQty);
    const minimum = pickerItem.dispatchUnit === 'pcs' ? 1 : 0.01;
    if (!Number.isFinite(qty) || qty < minimum) {
      setError('Enter a valid prepared quantity.');
      return;
    }
    setError(null);
    setAddingId(pickerItem.itemId);
    try {
      await addStagedItem(order.id, {
        itemId: pickerItem.itemId,
        itemName: pickerItem.itemName,
        quantityPrepared: qty,
        preparedAt: new Date().toISOString(),
        dispatchUnit: pickerItem.originalPcs != null ? 'kg' : (pickerItem.dispatchUnit ?? 'kg'),
      });
      setPickerItemId('');
      setPickerQty('');
    } catch {
      setError('Failed to add — please try again.');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveStaged = async (itemId: string) => {
    setRemovingId(itemId);
    try {
      await removeStagedItem(order.id, itemId);
    } catch {
      setError('Failed to remove — please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSend = async () => {
    setSending(true); setError(null);
    try {
      await sendStagedToPacking(order.id);
    } catch {
      setError('Failed to send — please try again.');
    } finally {
      setSending(false);
    }
  };

  const getUnitLabel = (item: BakeryOrderItem) => (item.dispatchUnit === 'pcs' && item.weightGrams == null ? 'pcs' : 'kg');

  return (
    <div className={cn(
      'rounded-2xl border overflow-visible transition-all',
      isFullyPrepared ? 'border-emerald-200 bg-emerald-50/40' : 'border-orange-200 bg-orange-50/20'
    )}>
      {/* Card header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20 transition-colors rounded-t-2xl"
        onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0',
          isFullyPrepared ? 'bg-emerald-100' : 'bg-orange-100'
        )}>
          {isFullyPrepared
            ? <CheckCircle2 className="size-5 text-emerald-600" />
            : <Flame className="size-5 text-orange-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">Order #{order.orderNumber}</span>
            {order.storeSourceOrderNumber && order.storeSourceOrderNumber !== order.orderNumber && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700">From Store order #{order.storeSourceOrderNumber}</span>}
            <span className={cn(
              'text-[9px] font-body font-bold px-2 py-0.5 rounded-full border',
              order.status === 'correction_required'
                ? 'bg-red-100 text-red-700 border-red-200'
                : order.status === 'partially_packed'
                ? 'bg-purple-100 text-purple-700 border-purple-200'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            )}>
              {order.status === 'correction_required'
                ? 'WEIGHT CORRECTION'
                : order.status === 'partially_packed'
                ? `↗ PARTIALLY SENT (${preparedItems.length}/${order.items.length})`
                : '🔥 BAKING'}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {order.items.map(i => i.itemName).join(' · ')}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="size-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-orange-100 px-4 pb-4 pt-3 space-y-4">

          {order.status === 'correction_required' && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"><p className="font-black">Returned by Packing</p><p className="mt-1">{order.correctionRequest?.reason || 'Correct the prepared weight and send the affected item back to Packing.'}</p><p className="mt-1 text-[10px] text-red-600">Requested by {order.correctionRequest?.requestedBy || 'Packing'}</p></div>}

          {/* Already sent to packing */}
          {preparedItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-body font-bold text-emerald-700 uppercase tracking-wide">
                ✓ Already sent to packing ({preparedItems.length})
              </p>
              <div className="space-y-1">
                {preparedItems.map(p => {
                  const source = order.items.find(i => i.itemId === p.itemId);
                  return (
                    <div key={p.itemId} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <span className="text-xs font-body font-semibold text-emerald-900 truncate">{p.itemName}</span>
                      <span className="text-xs font-body font-bold text-emerald-700 shrink-0">
                        {p.quantityPrepared} {source ? getUnitLabel(source) : 'kg'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Staged (added, not yet sent) */}
          {stagedItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-wide">
                Ready to send ({stagedItems.length})
              </p>
              <div className="space-y-1">
                {stagedItems.map(s => {
                  const source = order.items.find(i => i.itemId === s.itemId);
                  return (
                    <div key={s.itemId} className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-body font-semibold text-amber-900 truncate">{s.itemName}</p>
                        <p className="text-[10px] font-body text-amber-700">
                          {s.quantityPrepared} {source ? getUnitLabel(source) : 'kg'} prepared
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveStaged(s.itemId)}
                        disabled={removingId === s.itemId}
                        className="text-[10px] font-body font-bold text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 shrink-0 disabled:opacity-50"
                      >
                        {removingId === s.itemId ? '…' : 'Remove'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending — pick an item to prepare */}
          {pendingItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide">
                Pending ({pendingItems.length}) — pick an item to prepare
              </p>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen(v => !v)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <span className={cn('truncate', !pickerItem && 'text-muted-foreground')}>
                    {pickerItem ? pickerItem.itemName : 'Select an item…'}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                </button>

                {pickerOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          autoFocus
                          value={pickerSearch}
                          onChange={e => setPickerSearch(e.target.value)}
                          placeholder="Search item…"
                          className="w-full h-9 pl-8 pr-2 rounded-lg border border-border bg-background text-xs font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredPending.length === 0 ? (
                        <p className="text-xs font-body text-muted-foreground text-center py-3">No matching items</p>
                      ) : filteredPending.map(item => {
                        const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
                        return (
                          <button
                            key={item.itemId}
                            type="button"
                            onClick={() => selectPickerItem(item)}
                            className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/40 transition-colors"
                          >
                            <span className="text-sm leading-none">{meta?.icon ?? '🍬'}</span>
                            <span className="text-xs font-body font-semibold text-foreground truncate flex-1">{item.itemName}</span>
                            <span className="text-[10px] font-body text-muted-foreground shrink-0">{getRequestedQtyLabel(item)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {pickerItem && (
                <div className="flex items-center gap-3 bg-background rounded-xl border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold text-foreground truncate">{pickerItem.itemName}</p>
                    <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                      Requested: <span className="font-bold text-foreground">{getRequestedQtyLabel(pickerItem)}</span>
                    </p>
                    <AttachmentPreview name={pickerItem.attachmentName} dataUrl={pickerItem.attachmentDataUrl} />
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <input
                      type="number" min={0} step={pickerItem.dispatchUnit === 'pcs' && pickerItem.weightGrams == null ? 1 : 0.25}
                      value={pickerQty}
                      onChange={e => setPickerQty(e.target.value)}
                      className="w-20 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-[9px] font-body font-bold text-muted-foreground">{getUnitLabel(pickerItem)} prepared</span>
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={addingId === pickerItem.itemId}
                    className="h-10 px-4 rounded-xl bg-orange-500 text-white text-xs font-body font-bold shrink-0 disabled:opacity-50 active:scale-95"
                  >
                    {addingId === pickerItem.itemId ? <Loader2 className="size-4 animate-spin" /> : 'Add'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* U-14 FIX: show special order notes so baker never misses custom instructions */}
          {order.notes && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <span className="text-amber-600 text-base leading-none mt-0.5">📋</span>
              <div>
                <p className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-wide mb-0.5">Special Instructions</p>
                <p className="text-sm font-body text-amber-900">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Expected output */}
          {order.expectedOutput && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
              <span className="text-[11px] font-body text-primary">🎯 Store target: <strong>{order.expectedOutput} units</strong></span>
            </div>
          )}

          {error && <p className="text-xs font-body text-destructive text-center">{error}</p>}

          {stagedItems.length > 0 && (
            <button onClick={handleSend} disabled={sending}
              className="w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 bg-orange-500 text-white shadow-lg shadow-orange-200">
              {sending
                ? <Loader2 className="size-4 animate-spin" />
                : <><Send className="size-4" /> Send {stagedItems.length} item{stagedItems.length > 1 ? 's' : ''} to Packing</>}
            </button>
          )}

          {isFullyPrepared && (
            <div className="flex items-center justify-center gap-2 text-emerald-700 text-xs font-body font-bold py-2">
              <CheckCircle2 className="size-4" /> All items sent to packing
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Completed orders ────────────────────────────────────────────────────────
function CompletedCard({ order }: { order: BakeryOrder }) {
  const [expanded, setExpanded] = useState(false);
  const isDispatched = order.status === 'dispatched';
  const completedAt = orderCompletedAt(order);
  const preparedCount = order.preparedItems?.length ?? 0;

  return (
    <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      <div className="p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            'size-11 rounded-2xl flex items-center justify-center shrink-0',
            isDispatched ? 'bg-emerald-100' : 'bg-purple-100'
          )}>
            <CheckCircle2 className={cn('size-5', isDispatched ? 'text-emerald-600' : 'text-purple-600')} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-bold text-foreground text-base">Order #{order.orderNumber}</h3>
              <span className={cn(
                'text-[10px] font-body font-bold px-2.5 py-1 rounded-full border',
                isDispatched
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-purple-100 text-purple-700 border-purple-200'
              )}>
                {orderStatusLabel(order.status)}
              </span>
              {order.targetBranch && (
                <span className="text-[10px] font-body font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                  {order.targetBranch}
                </span>
              )}
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1">
              Completed: <strong className="text-foreground">{fmtDateTime(completedAt)}</strong>
              <span className="mx-1.5">•</span>
              Created: {fmtDateTime(order.createdAt)}
            </p>
            <p className="text-xs font-body text-muted-foreground mt-1 truncate max-w-3xl">
              {(order.preparedItems?.length ? order.preparedItems : order.items).map(item =>
                'quantityPrepared' in item
                  ? `${item.itemName} ×${item.quantityPrepared}`
                  : `${item.itemName} ×${item.quantity}`
              ).join(' · ')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-body font-bold text-foreground flex items-center justify-center gap-1.5 hover:bg-muted active:scale-95"
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {expanded ? 'Hide Details' : 'View Details'}
          </button>
          <button
            type="button"
            onClick={() => printCompletedOrder(order)}
            className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-body font-bold text-white flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-95"
          >
            <Printer className="size-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pb-4">
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-[9px] font-body font-bold text-muted-foreground uppercase">Prepared Lines</p>
          <p className="font-display text-lg font-bold text-foreground tabular-nums">{preparedCount || order.items.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-[9px] font-body font-bold text-muted-foreground uppercase">Status</p>
          <p className={cn('font-display text-sm font-bold', isDispatched ? 'text-emerald-600' : 'text-purple-600')}>{orderStatusLabel(order.status)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-[9px] font-body font-bold text-muted-foreground uppercase">Branch</p>
          <p className="font-display text-sm font-bold text-foreground">{order.targetBranch ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-[9px] font-body font-bold text-muted-foreground uppercase">Baker</p>
          <p className="font-display text-sm font-bold text-foreground truncate">{order.createdBy || '—'}</p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3 bg-muted/10">
          <div className="overflow-x-auto rounded-2xl border border-border bg-background">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/60 text-[9px] font-body font-bold text-muted-foreground uppercase">
                <span className="col-span-5">Item</span>
                <span className="col-span-3 text-right">Requested</span>
                <span className="col-span-3 text-right">Prepared</span>
                <span className="col-span-1 text-right">Unit</span>
              </div>
              {(order.preparedItems?.length ? order.preparedItems : []).map((p, i) => {
                const source = order.items.find(item => item.itemId === p.itemId);
                return (
                  <div key={`${p.itemId}-${i}`} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-t border-border/60 text-xs font-body items-center">
                    <span className="col-span-5 font-semibold text-foreground truncate">{p.itemName}</span>
                    <span className="col-span-3 text-right text-muted-foreground tabular-nums">{source ? getRequestedQtyLabel(source) : '—'}</span>
                    <span className="col-span-3 text-right font-bold text-foreground tabular-nums">{p.quantityPrepared}</span>
                    <span className="col-span-1 text-right text-muted-foreground">{source?.originalPcs != null ? 'kg' : (p.dispatchUnit ?? source?.dispatchUnit ?? 'kg')}</span>
                  </div>
                );
              })}
              {!order.preparedItems?.length && order.items.map((item, i) => (
                <div key={`${item.itemId}-${i}`} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-t border-border/60 text-xs font-body items-center">
                  <span className="col-span-5 font-semibold text-foreground truncate">{item.itemName}</span>
                  <span className="col-span-3 text-right text-muted-foreground tabular-nums">{getRequestedQtyLabel(item)}</span>
                  <span className="col-span-3 text-right font-bold text-foreground tabular-nums">—</span>
                  <span className="col-span-1 text-right text-muted-foreground">{item.dispatchUnit ?? 'kg'}</span>
                </div>
              ))}
            </div>
          </div>
          {order.notes && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-wide">Special Instructions</p>
              <p className="text-sm font-body text-amber-900 mt-1">{order.notes}</p>
            </div>
          )}
          {order.items.some(item => item.attachmentName || item.attachmentDataUrl) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {order.items.filter(item => item.attachmentName || item.attachmentDataUrl).map(item => (
                <AttachmentPreview key={item.itemId} name={item.attachmentName} dataUrl={item.attachmentDataUrl} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompletedTab({ destination }: { destination: ProductionDestination }) {
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState(inputDate(new Date()));
  const [toDate, setToDate] = useState(inputDate(new Date()));
  const [dateFilteredOrders, setDateFilteredOrders] = useState<BakeryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const fromIso = startOfDay(new Date(`${fromDate}T00:00:00`)).toISOString();
      const toIso = endOfDay(new Date(`${toDate}T00:00:00`)).toISOString();
      const rows = await fetchBakeryOrdersInRange({
        fromIso,
        toIso,
        statuses: ['packed', 'dispatched'],
        useCompletionDate: true,
      });
      setDateFilteredOrders(rows.filter(order => belongsToProductionDesk(order, destination)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load completed orders.');
    } finally {
      setLoading(false);
    }
  }, [destination, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const sortedOrders = useMemo(() => [...dateFilteredOrders].sort((a, b) => safeDate(orderCompletedAt(b)) - safeDate(orderCompletedAt(a))), [dateFilteredOrders]);
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedOrders;
    return sortedOrders.filter(order => {
      const haystack = [
        String(order.orderNumber),
        order.targetBranch ?? '',
        order.createdBy ?? '',
        orderStatusLabel(order.status),
        ...order.items.map(i => i.itemName),
        ...(order.preparedItems ?? []).map(i => i.itemName),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [search, sortedOrders]);

  const atPacking = dateFilteredOrders.filter(o => o.status === 'packed').length;
  const dispatched = dateFilteredOrders.filter(o => o.status === 'dispatched').length;
  const itemLines = dateFilteredOrders.reduce((sum, order) => sum + (order.preparedItems?.length || order.items.length), 0);
  const todayKey = new Date().toDateString();
  const todayCompleted = dateFilteredOrders.filter(order => new Date(orderCompletedAt(order)).toDateString() === todayKey).length;

  const downloadCompleted = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredOrders.map(order => [
      order.orderNumber,
      order.targetBranch ?? '—',
      orderStatusLabel(order.status),
      fmtDateTime(order.createdAt),
      fmtDateTime(orderCompletedAt(order)),
      (order.preparedItems?.length ? order.preparedItems : order.items).map(item =>
        'quantityPrepared' in item ? `${item.itemName} (${item.quantityPrepared})` : `${item.itemName} (${item.quantity})`
      ).join(', '),
      order.createdBy,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Order #', 'Branch', 'Status', 'Created', 'Completed', 'Items', 'Baker'],
      ...rows,
    ]);
    sheet['!cols'] = [10, 12, 14, 20, 20, 52, 18].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, sheet, 'Completed Orders');
    XLSX.writeFile(wb, `baker-completed-orders-${fromDate}-to-${toDate}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
            From
            <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
          </label>
          <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
            To
            <input type="date" value={toDate} min={fromDate} max={inputDate(new Date())} onChange={e => setToDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
          </label>
        </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="h-11 rounded-2xl px-4 text-xs font-body font-bold flex items-center justify-center gap-2 active:scale-95 border border-border bg-card text-foreground hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Refresh
            </button>
            <button
              onClick={downloadCompleted}
              disabled={filteredOrders.length === 0}
              className={cn(
                'h-11 rounded-2xl px-4 text-xs font-body font-bold flex items-center justify-center gap-2 active:scale-95',
                filteredOrders.length > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              <Download className="size-4" /> Export Completed
            </button>
          </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          <AlertCircle className="size-4 shrink-0" /> {loadError} — tap Refresh to try again.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Completed', value: filteredOrders.length, color: 'text-emerald-600' },
          { label: 'Today', value: todayCompleted, color: 'text-primary' },
          { label: 'At Packing', value: atPacking, color: 'text-purple-600' },
          { label: 'Dispatched', value: dispatched, color: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={cn('font-display text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body font-bold text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by order number, branch, status, baker, or item…"
            className="w-full h-11 pl-10 pr-3 rounded-2xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 px-4 py-2 text-center md:text-left">
          <p className="text-[9px] font-body font-bold text-muted-foreground uppercase">Item Lines</p>
          <p className="font-display text-lg font-bold text-foreground tabular-nums">{itemLines}</p>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton variant="card" count={3} />
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-3">
          {filteredOrders.map(order => <CompletedCard key={order.id} order={order} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 gap-4 rounded-3xl border border-border bg-card text-center">
          <div className="size-16 rounded-3xl bg-muted flex items-center justify-center">
            <CheckCircle2 className="size-8 text-muted-foreground opacity-40" />
          </div>
          <div>
            <p className="text-sm font-body font-semibold text-foreground">No completed orders found</p>
            <p className="text-xs font-body text-muted-foreground mt-1">
              {dateFilteredOrders.length === 0 ? 'No completed orders found in this date range.' : 'No completed order matches your search.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main ─────────────────────────────────────────────────────────────────────
type BakerDashboardTab = 'orders' | 'corrections' | 'completed' | 'closure';
const BAKER_TABS: BakerDashboardTab[] = ['orders', 'corrections', 'completed', 'closure'];

export default function BakerDashboard({
  destination = 'baker',
  title,
}: {
  destination?: ProductionDestination;
  title?: string;
}) {
  const [searchParams] = useSearchParams();
  const { orders: storedOrders, fetchOrders, subscribe: subscribeOrders } = useBakeryStore();
  const advanceCakeOrders = useBranchOpsStore((state) => state.advanceCakeOrders);
  const orders = useMemo(() => storedOrders.filter(order => belongsToProductionDesk(order, destination)).map((order) => {
    if (order.items.some((item) => item.attachmentDataUrl || item.attachmentName)) return order;
    const orderNo = order.notes?.split('|')[0]?.trim();
    const source = orderNo ? advanceCakeOrders.find((advance) => advance.orderNo === orderNo) : undefined;
    if (!source?.attachmentDataUrl && !source?.attachmentName) return order;
    return {
      ...order,
      items: order.items.map((item, index) => index === 0 ? {
        ...item,
        attachmentName: source.attachmentName,
        attachmentDataUrl: source.attachmentDataUrl,
      } : item),
    };
  }), [storedOrders, advanceCakeOrders, destination]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOrders(false, false, destination).finally(() => setInitialLoading(false));
    const unsubscribe = subscribeOrders(destination);
    // Realtime is the primary update path; polling only recovers a missed event.
    const id = setInterval(() => { if (!document.hidden) fetchOrders(true, false, destination); }, 15 * 60_000);
    return () => { unsubscribe(); clearInterval(id); };
  }, [destination, fetchOrders, subscribeOrders]);

  const requestedTab = searchParams.get('tab') as BakerDashboardTab | null;
  const tab: BakerDashboardTab = requestedTab && BAKER_TABS.includes(requestedTab) ? requestedTab : 'orders';
  const bakingOrders = orders.filter(o => o.status === 'baking' || o.status === 'partially_packed');
  const correctionOrders = orders.filter(o => o.status === 'correction_required');
  const completedOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));
  const atPacking = completedOrders.filter(o => o.status === 'packed').length;
  const deskTitle = title || PRODUCTION_LABELS[destination];

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await fetchOrders(true, true, destination); } finally { setRefreshing(false); }
  };

  return (
    <div className="dashboard-screen min-h-[100dvh] bg-transparent pb-24">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6 py-4">
        <main className="min-w-0 space-y-4">
            <div className="min-w-0 overflow-hidden">
              {tab === 'closure' ? (
                <DailyClosureTab destination={destination} title={deskTitle} />
              ) : tab === 'completed' ? (
                <CompletedTab destination={destination} />
              ) : tab === 'corrections' ? (
                <div className="space-y-4 pb-8">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-bold text-foreground">Weight Corrections</h2>
                      <p className="text-xs font-body text-muted-foreground">Items returned by Packing for corrected weight</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshNow()}
                      disabled={refreshing}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-body font-bold text-foreground transition-colors hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>
                  {initialLoading ? (
                    <LoadingSkeleton variant="card" count={3} />
                  ) : correctionOrders.length > 0 ? (
                    <div className="space-y-3">
                      {correctionOrders.map(order => <ActiveBakeCard key={order.id} order={order} />)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card py-24 text-center">
                      <div className="flex size-20 items-center justify-center rounded-3xl bg-muted">
                        <RotateCcw className="size-10 text-muted-foreground opacity-30" />
                      </div>
                      <div>
                        <p className="text-sm font-body font-semibold text-foreground">No weight corrections</p>
                        <p className="mt-1 text-xs font-body text-muted-foreground">Orders returned by Packing will appear here.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 pb-8">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-bold text-foreground">{deskTitle} Orders</h2>
                      <p className="text-xs font-body text-muted-foreground">Live orders sent by Store</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshNow()}
                      disabled={refreshing}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-body font-bold text-foreground transition-colors hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { label: 'To Bake', value: bakingOrders.length, color: bakingOrders.length > 0 ? 'text-orange-600' : 'text-muted-foreground', bg: bakingOrders.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-card border-border' },
                      { label: 'Corrections', value: correctionOrders.length, color: correctionOrders.length > 0 ? 'text-red-600' : 'text-muted-foreground', bg: correctionOrders.length > 0 ? 'bg-red-50 border-red-200' : 'bg-card border-border' },
                      { label: 'Completed', value: completedOrders.length, color: 'text-emerald-600', bg: 'bg-card border-border' },
                      { label: 'At Packing', value: atPacking, color: 'text-purple-600', bg: 'bg-card border-border' },
                    ].map(s => (
                      <div key={s.label} className={cn('border rounded-2xl p-3 text-center', s.bg)}>
                        <p className={cn('font-display text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                        <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {initialLoading ? (
                    <LoadingSkeleton variant="card" count={3} />
                  ) : bakingOrders.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Flame className="size-3.5 text-orange-500" />
                        <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Active — Ready to Bake</p>
                      </div>
                      {bakingOrders.map(o => <ActiveBakeCard key={o.id} order={o} />)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-24 gap-4 rounded-3xl border border-border bg-card text-center">
                      <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                        <ChefHat className="size-10 text-muted-foreground opacity-30" />
                      </div>
                      <div>
                        <p className="text-sm font-body font-semibold text-foreground">No active production orders</p>
                        <p className="text-xs font-body text-muted-foreground mt-1">Orders will appear here when Store sends items to {deskTitle}.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
      </div>
    </div>
  );
}
