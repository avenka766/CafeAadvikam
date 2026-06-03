// src/bakery/StoreReportTab.tsx
// Report tab for Store dashboard — two sub-tabs:
//   • Inventory Report  : custom deductions + bakery orders
//   • Invoice Report    : supplier invoices (store_invoices)
// All exports are .xlsx (Excel) via SheetJS.
//
// No new DB migration needed. Reads from:
//   store_custom_deductions, bakery_orders, store_invoices

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Download, Calendar, Loader2, FileSpreadsheet,
  Package, Scissors, AlertCircle, RefreshCw,
  ClipboardList, Receipt, FileText, IndianRupee,
  CheckCircle2, Clock, XCircle, MinusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { BakeryOrderItem } from './types';

// ─── Shared types ─────────────────────────────────────────────────────────────

type PeriodKey = 'today' | '7d' | '15d' | '30d' | 'custom';

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: 'today',  label: 'Today',   days: 0    },
  { key: '7d',     label: '7 Days',  days: 7    },
  { key: '15d',    label: '15 Days', days: 15   },
  { key: '30d',    label: '30 Days', days: 30   },
  { key: 'custom', label: 'Custom',  days: null },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Excel export helper ──────────────────────────────────────────────────────

function exportExcel(
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const wsData = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto column widths
    const colWidths = sheet.headers.map((h, ci) => {
      const max = Math.max(
        h.length,
        ...sheet.rows.map(r => String(r[ci] ?? '').length),
      );
      return { wch: Math.min(max + 2, 40) };
    });
    ws['!cols'] = colWidths;

    // Style header row bold (xlsx community edition — basic)
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Shared UI: Period Selector ───────────────────────────────────────────────

function PeriodSelector({
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
}: {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}) {
  const today = toInputDate(new Date());
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="size-4 text-muted-foreground" />
        <p className="text-xs font-body font-bold text-foreground">Select Period</p>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[11px] font-body font-semibold transition-all border',
              period === p.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
            )}>
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          {[
            { label: 'From', value: customFrom, max: customTo,  onChange: setCustomFrom, min: undefined },
            { label: 'To',   value: customTo,   max: today,     onChange: setCustomTo,   min: customFrom },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-body font-bold text-muted-foreground mb-1">{f.label}</p>
              <input type="date" value={f.value} max={f.max} min={f.min}
                onChange={e => f.onChange(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-muted/30 px-3 text-xs font-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI: Summary Card ──────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
      <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="size-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="font-display text-lg font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[10px] font-body text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Shared UI: Download + Refresh bar ───────────────────────────────────────

function ActionBar({ onDownload, onRefresh, rowCount, lastLoaded, loading }: {
  onDownload: () => void;
  onRefresh: () => void;
  rowCount: number;
  lastLoaded: Date | null;
  loading: boolean;
}) {
  return (
    <>
      <div className="flex gap-3">
        <button onClick={onDownload} disabled={rowCount === 0}
          className={cn(
            'flex-1 h-12 rounded-2xl font-body font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95',
            rowCount > 0
              ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}>
          <Download className="size-4" />
          Download Excel
          {rowCount > 0 && (
            <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">{rowCount}</span>
          )}
        </button>
        <button onClick={onRefresh}
          className="size-12 rounded-2xl border border-border bg-card flex items-center justify-center shrink-0 active:scale-95 transition-all hover:bg-muted">
          <RefreshCw className={cn('size-4 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>
      {lastLoaded && !loading && (
        <p className="text-[10px] font-body text-muted-foreground text-center -mt-1">
          Last refreshed: {fmtTime(lastLoaded.toISOString())}
        </p>
      )}
    </>
  );
}

// ─── Shared UI: Loading / Error / Empty ──────────────────────────────────────

function LoadingState() {
  return (
    <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3">
      <Loader2 className="size-6 text-primary animate-spin" />
      <p className="text-sm font-body text-muted-foreground">Loading report data…</p>
    </div>
  );
}

function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
      <AlertCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-body font-bold text-red-800">{msg}</p>
        <button onClick={onRetry} className="mt-2 text-xs font-body font-semibold text-red-700 underline">Try again</button>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
      <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
        <FileSpreadsheet className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-body font-bold text-foreground">No data found</p>
        <p className="text-xs font-body text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── INVENTORY REPORT sub-tab ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface CustomDeductionRow {
  id: string; itemName: string; itemId: string | null;
  quantity: number; unit: string; reason: string;
  deductedBy: string | null; createdAt: string;
}

interface InventoryOrderRow {
  orderNumber: number; itemName: string; itemId: string;
  quantity: number; unit: string; targetBranch: string;
  status: string; createdAt: string; createdBy: string;
}

async function fetchCustomDeductions(from: Date, to: Date): Promise<CustomDeductionRow[]> {
  const { data, error } = await supabase
    .from('store_custom_deductions').select('*')
    .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
    .order('created_at', { ascending: false });
  if (error) { console.warn('StoreReport – deductions:', error.message); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string, itemName: r.item_name as string,
    itemId: (r.item_id as string) ?? null, quantity: Number(r.quantity),
    unit: r.unit as string, reason: r.reason as string,
    deductedBy: (r.deducted_by as string) ?? null, createdAt: r.created_at as string,
  }));
}

async function fetchInventoryOrders(from: Date, to: Date): Promise<InventoryOrderRow[]> {
  const { data, error } = await supabase
    .from('bakery_orders').select('*')
    .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
    // Only include orders that were actually sent to baker (status != pending)
    // Pending orders have NOT triggered a stock deduction yet
    .neq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.warn('StoreReport – orders:', error.message); return []; }
  const rows: InventoryOrderRow[] = [];
  for (const r of data ?? []) {
    const o = r as Record<string, unknown>;
    for (const item of (o.items as BakeryOrderItem[]) ?? []) {
      rows.push({
        orderNumber: o.order_number as number, itemName: item.itemName, itemId: item.itemId,
        // VRSNB items with originalPcs set have quantity already converted to kg
        quantity: item.quantity,
        unit: item.originalPcs != null ? 'kg' : (item.dispatchUnit ?? 'kg'),
        targetBranch: (o.target_branch as string) ?? '—', status: o.status as string,
        createdAt: o.created_at as string, createdBy: (o.created_by as string) ?? '—',
      });
    }
  }
  return rows;
}

function InventoryPreviewRow({ r, index }: {
  r: { date: string; time: string; type: string; itemName: string; qty: string; unit: string; detail: string; ref: string; status: string };
  index: number;
}) {
  const isCustom = r.type === 'Custom Deduction';
  return (
    <div className={cn('px-4 py-3 flex items-start gap-3 border-b border-border last:border-0', index % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
      <div className={cn('size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', isCustom ? 'bg-destructive/10' : 'bg-primary/10')}>
        {isCustom ? <Scissors className="size-3.5 text-destructive" /> : <Package className="size-3.5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-body font-bold text-foreground truncate">{r.itemName}</p>
          <span className={cn('text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full', isCustom ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
            {r.type}
          </span>
        </div>
        <p className="text-[11px] font-body font-semibold text-foreground mt-0.5">
          {r.qty} <span className="font-normal text-muted-foreground">{r.unit}</span>
        </p>
        <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{r.detail}</p>
        <p className="text-[10px] font-body text-muted-foreground mt-0.5">{r.date} · {r.time}{r.ref !== '—' && ` · ${r.ref}`}</p>
      </div>
      {r.status !== '—' && (
        <span className={cn('text-[9px] font-body font-bold px-2 py-1 rounded-full border shrink-0 mt-0.5',
          r.status === 'dispatched' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          r.status === 'packed'     ? 'bg-blue-50 text-blue-700 border-blue-200' :
          r.status === 'baking'     ? 'bg-orange-50 text-orange-700 border-orange-200' :
          'bg-muted text-muted-foreground border-border')}>
          {r.status}
        </span>
      )}
    </div>
  );
}

function InventoryReportTab() {
  const today = new Date();
  const [period, setPeriod]         = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(toInputDate(today));
  const [customTo,   setCustomTo]   = useState(toInputDate(today));
  const [filter, setFilter]         = useState<'all' | 'custom' | 'orders'>('all');
  const [deductions, setDeductions] = useState<CustomDeductionRow[]>([]);
  const [orders,     setOrders]     = useState<InventoryOrderRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (period === 'custom') return { from: startOfDay(new Date(customFrom + 'T00:00:00')), to: endOfDay(new Date(customTo + 'T00:00:00')) };
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const f = new Date(now); f.setDate(f.getDate() - days);
    return { from: startOfDay(f), to: endOfDay(now) };
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [d, o] = await Promise.all([fetchCustomDeductions(from, to), fetchInventoryOrders(from, to)]);
      setDeductions(d); setOrders(o); setLastLoaded(new Date());
    } catch { setError('Failed to load. Please try again.'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel = period === 'custom' ? `${customFrom}-to-${customTo}` : PERIODS.find(p => p.key === period)?.label ?? '';

  const previewRows = useMemo(() => {
    const rows: { date: string; time: string; type: string; itemName: string; qty: string; unit: string; detail: string; ref: string; status: string }[] = [];
    if (filter !== 'orders') {
      for (const r of deductions) rows.push({ date: fmtDate(r.createdAt), time: fmtTime(r.createdAt), type: 'Custom Deduction', itemName: r.itemName, qty: String(r.quantity), unit: r.unit, detail: r.reason, ref: r.deductedBy ?? '—', status: '—' });
    }
    if (filter !== 'custom') {
      for (const r of orders) rows.push({ date: fmtDate(r.createdAt), time: fmtTime(r.createdAt), type: 'Inventory Order', itemName: r.itemName, qty: String(r.quantity), unit: r.unit, detail: r.targetBranch, ref: `Order #${r.orderNumber}`, status: r.status });
    }
    return rows.sort((a, b) => new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime());
  }, [deductions, orders, filter]);

  const handleDownload = () => {
    const dedSheet = {
      name: 'Custom Deductions',
      headers: ['Date', 'Time', 'Item Name', 'Quantity', 'Unit', 'Reason', 'Deducted By'],
      rows: deductions.map(r => [fmtDate(r.createdAt), fmtTime(r.createdAt), r.itemName, r.quantity, r.unit, r.reason, r.deductedBy ?? '']),
    };
    const ordSheet = {
      name: 'Inventory Orders',
      headers: ['Date', 'Time', 'Order #', 'Item Name', 'Quantity', 'Unit', 'Branch', 'Status', 'Created By'],
      rows: orders.map(r => [fmtDate(r.createdAt), fmtTime(r.createdAt), r.orderNumber, r.itemName, r.quantity, r.unit, r.targetBranch, r.status, r.createdBy]),
    };
    exportExcel([dedSheet, ordSheet], `inventory-report-${periodLabel}`);
  };

  const totalRows = previewRows.length;

  return (
    <div className="space-y-4">
      <PeriodSelector period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {/* Filter pills */}
      <div className="flex gap-1.5">
        {([['all', 'All'], ['custom', 'Deductions Only'], ['orders', 'Orders Only']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('px-3 py-1.5 rounded-lg text-[11px] font-body font-semibold transition-all border flex-1',
              filter === k ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted')}>
            {l}
          </button>
        ))}
      </div>

      {loading && <LoadingState />}
      {error && !loading && <ErrorState msg={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard icon={Scissors}     label="Custom Deductions" value={deductions.length} sub={`${deductions.reduce((s,r)=>s+r.quantity,0).toFixed(2)} units`} color="bg-destructive" />
            <SummaryCard icon={Package}      label="Order Line Items"  value={orders.length}     sub={`${new Set(orders.map(r=>r.orderNumber)).size} orders`}             color="bg-primary" />
            <SummaryCard icon={ClipboardList} label="Total Rows"       value={totalRows}         sub="in filtered view"                                                   color="bg-amber-500" />
            <SummaryCard icon={Calendar}     label="Period"            value={periodLabel}                                                                                color="bg-indigo-500" />
          </div>

          <ActionBar onDownload={handleDownload} onRefresh={load} rowCount={totalRows} lastLoaded={lastLoaded} loading={loading} />

          {totalRows === 0
            ? <EmptyState label="No inventory activity in the selected period. Try a different range." />
            : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <p className="text-xs font-body font-bold text-foreground">Preview</p>
                    <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{totalRows} rows</span>
                  </div>
                  {totalRows > 50 && <p className="text-[10px] font-body text-muted-foreground">Showing first 50</p>}
                </div>
                {previewRows.slice(0, 50).map((r, i) => <InventoryPreviewRow key={i} r={r} index={i} />)}
                {totalRows > 50 && (
                  <div className="px-4 py-3 text-center">
                    <p className="text-[11px] font-body text-muted-foreground">+{totalRows - 50} more rows — download Excel to see all</p>
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── INVOICE REPORT sub-tab ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface InvoiceRow {
  id: string; invoiceNumber: string; supplierName: string; deliveryDate: string;
  lineItems: { itemName: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number }[];
  grandTotal: number; status: string; notes: string; syncedToStock: boolean; createdAt: string;
}

async function fetchInvoices(from: Date, to: Date): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('store_invoices').select('*')
    .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
    .order('created_at', { ascending: false });
  if (error) { console.warn('StoreReport – invoices:', error.message); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string, invoiceNumber: r.invoice_number as string,
    supplierName: r.supplier_name as string, deliveryDate: r.delivery_date as string,
    lineItems: (r.line_items as InvoiceRow['lineItems']) ?? [],
    grandTotal: Number(r.grand_total), status: r.status as string,
    notes: (r.notes as string) ?? '', syncedToStock: r.synced_to_stock as boolean,
    createdAt: r.created_at as string,
  }));
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === 'approved'       ? { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } :
    status === 'rejected'       ? { icon: XCircle,      cls: 'bg-red-50 text-red-700 border-red-200' } :
                                  { icon: Clock,        cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  const Icon = cfg.icon;
  const label = status === 'pending_review' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] font-body font-bold px-2 py-1 rounded-full border', cfg.cls)}>
      <Icon className="size-2.5" />{label}
    </span>
  );
}

function InvoicePreviewRow({ inv, index }: { inv: InvoiceRow; index: number }) {
  return (
    <div className={cn('px-4 py-3 flex items-start gap-3 border-b border-border last:border-0', index % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
      <div className="size-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
        <Receipt className="size-3.5 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-body font-bold text-foreground">{inv.invoiceNumber}</p>
          <StatusBadge status={inv.status} />
          {inv.syncedToStock && (
            <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Synced</span>
          )}
        </div>
        <p className="text-[11px] font-body font-semibold text-foreground mt-0.5">{inv.supplierName}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-[10px] font-body text-muted-foreground">{inv.lineItems.length} item{inv.lineItems.length !== 1 ? 's' : ''}</p>
          <p className="text-[10px] font-body font-bold text-foreground">{fmtCurrency(inv.grandTotal)}</p>
        </div>
        <p className="text-[10px] font-body text-muted-foreground mt-0.5">{fmtDate(inv.createdAt)} · {fmtTime(inv.createdAt)}</p>
      </div>
    </div>
  );
}

function InvoiceReportTab() {
  const today = new Date();
  const [period, setPeriod]         = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(toInputDate(today));
  const [customTo,   setCustomTo]   = useState(toInputDate(today));
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
  const [invoices, setInvoices]     = useState<InvoiceRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (period === 'custom') return { from: startOfDay(new Date(customFrom + 'T00:00:00')), to: endOfDay(new Date(customTo + 'T00:00:00')) };
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const f = new Date(now); f.setDate(f.getDate() - days);
    return { from: startOfDay(f), to: endOfDay(now) };
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const rows = await fetchInvoices(from, to);
      setInvoices(rows); setLastLoaded(new Date());
    } catch { setError('Failed to load invoice data. Please try again.'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel = period === 'custom' ? `${customFrom}-to-${customTo}` : PERIODS.find(p => p.key === period)?.label ?? '';

  const filtered = useMemo(() =>
    statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter),
  [invoices, statusFilter]);

  const grandTotalSum = useMemo(() => filtered.reduce((s, i) => s + i.grandTotal, 0), [filtered]);

  const handleDownload = () => {
    // Sheet 1: Invoice summary
    const summarySheet = {
      name: 'Invoice Summary',
      headers: ['Date', 'Time', 'Invoice #', 'Supplier', 'Delivery Date', 'Items Count', 'Grand Total (₹)', 'Status', 'Synced to Stock', 'Notes'],
      rows: filtered.map(r => [
        fmtDate(r.createdAt), fmtTime(r.createdAt), r.invoiceNumber, r.supplierName,
        r.deliveryDate, r.lineItems.length, r.grandTotal,
        r.status === 'pending_review' ? 'Pending Review' : r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.syncedToStock ? 'Yes' : 'No', r.notes,
      ]),
    };

    // Sheet 2: Line items (flat)
    const lineSheet = {
      name: 'Line Items',
      headers: ['Invoice #', 'Supplier', 'Delivery Date', 'Item Name', 'Quantity', 'Unit', 'Price / Unit (₹)', 'Total Price (₹)', 'Status'],
      rows: filtered.flatMap(inv =>
        inv.lineItems.map(li => [
          inv.invoiceNumber, inv.supplierName, inv.deliveryDate,
          li.itemName, li.quantity, li.unit, li.pricePerUnit, li.totalPrice,
          inv.status === 'pending_review' ? 'Pending Review' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
        ])
      ),
    };

    exportExcel([summarySheet, lineSheet], `invoice-report-${periodLabel}`);
  };

  return (
    <div className="space-y-4">
      <PeriodSelector period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {([['all', 'All'], ['pending_review', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={cn('px-3 py-1.5 rounded-lg text-[11px] font-body font-semibold transition-all border flex-1',
              statusFilter === k ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted')}>
            {l}
          </button>
        ))}
      </div>

      {loading && <LoadingState />}
      {error && !loading && <ErrorState msg={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard icon={Receipt}       label="Invoices"       value={filtered.length}                                                                                                   color="bg-indigo-500" />
            <SummaryCard icon={IndianRupee}   label="Total Value"    value={fmtCurrency(grandTotalSum)}  sub="grand total of filtered"                                                         color="bg-emerald-600" />
            <SummaryCard icon={CheckCircle2}  label="Approved"       value={invoices.filter(i=>i.status==='approved').length}    sub={`of ${invoices.length} in period`}                       color="bg-emerald-500" />
            <SummaryCard icon={Clock}         label="Pending Review" value={invoices.filter(i=>i.status==='pending_review').length} sub="awaiting action"                                      color="bg-amber-500" />
          </div>

          <ActionBar onDownload={handleDownload} onRefresh={load} rowCount={filtered.length} lastLoaded={lastLoaded} loading={loading} />

          {filtered.length === 0
            ? <EmptyState label="No invoices found in the selected period or filter. Try a different range." />
            : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-muted-foreground" />
                    <p className="text-xs font-body font-bold text-foreground">Preview</p>
                    <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length} invoices</span>
                  </div>
                  {filtered.length > 20 && <p className="text-[10px] font-body text-muted-foreground">Showing first 50</p>}
                </div>
                {filtered.slice(0, 50).map((inv, i) => <InvoicePreviewRow key={inv.id} inv={inv} index={i} />)}
                {filtered.length > 50 && (
                  <div className="px-4 py-3 text-center">
                    <p className="text-[11px] font-body text-muted-foreground">+{filtered.length - 50} more — download Excel to see all</p>
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── DEDUCTION REPORT sub-tab ──────────────────────────────────────────────────
// Shows per-material deductions logged when store sends an order to baker.
// Reads from store_material_deductions (created by storeStockStore.deductMaterials)
// ═══════════════════════════════════════════════════════════════════════════════

interface DeductionRow {
  id: string;
  orderId: string;
  orderNumber: string;
  materialName: string;
  quantityDeducted: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
  deductedBy: string;
  deductedAt: string;
}

async function fetchDeductions(from: Date, to: Date): Promise<DeductionRow[]> {
  const { data, error } = await supabase
    .from('store_material_deductions')
    .select('*')
    .gte('deducted_at', from.toISOString())
    .lte('deducted_at', to.toISOString())
    .order('deducted_at', { ascending: false });
  if (error) { console.warn('StoreReport – deductions:', error.message); return []; }
  return (data ?? []).map(r => ({
    id:               r.id as string,
    orderId:          r.order_id as string,
    orderNumber:      r.order_number as string,
    materialName:     r.material_name as string,
    quantityDeducted: Number(r.quantity_deducted),
    unit:             r.unit as string,
    stockBefore:      Number(r.stock_before),
    stockAfter:       Number(r.stock_after),
    deductedBy:       (r.deducted_by as string) ?? '—',
    deductedAt:       r.deducted_at as string,
  }));
}

function DeductionPreviewRow({ r, index }: { r: DeductionRow; index: number }) {
  const isNegative = r.stockAfter < 0;
  const isZeroAfter = r.stockAfter === 0;
  return (
    <div className={cn('px-4 py-3 flex items-start gap-3 border-b border-border last:border-0', index % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
      <div className={cn('size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5', isNegative ? 'bg-red-100' : isZeroAfter ? 'bg-red-50' : 'bg-amber-50')}>
        <MinusCircle className={cn('size-3.5', isNegative ? 'text-red-600' : isZeroAfter ? 'text-red-500' : 'text-amber-600')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-body font-bold text-foreground truncate">{r.materialName}</p>
          {isNegative && (
            <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
              NEGATIVE
            </span>
          )}
          {isZeroAfter && !isNegative && (
            <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
              EMPTY
            </span>
          )}
        </div>
        <p className="text-[11px] font-body font-semibold text-foreground mt-0.5">
          −{r.quantityDeducted % 1 === 0 ? r.quantityDeducted : r.quantityDeducted.toFixed(3)}{' '}
          <span className="font-normal text-muted-foreground">{r.unit}</span>
          <span className="text-muted-foreground font-normal ml-2 text-[10px]">
            ({r.stockBefore.toFixed(2)} → <span className={isNegative ? 'text-red-600 font-bold' : ''}>{r.stockAfter.toFixed(2)}</span> {r.unit})
          </span>
        </p>
        <p className="text-[10px] font-body text-muted-foreground mt-0.5">
          Order #{r.orderNumber} · {r.deductedBy}
        </p>
        <p className="text-[10px] font-body text-muted-foreground">{fmtDate(r.deductedAt)} · {fmtTime(r.deductedAt)}</p>
      </div>
    </div>
  );
}

function DeductionReportTab() {
  const today = new Date();
  const [period, setPeriod]         = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(toInputDate(today));
  const [customTo,   setCustomTo]   = useState(toInputDate(today));
  const [rows,       setRows]       = useState<DeductionRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [orderFilter, setOrderFilter] = useState('');

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (period === 'custom') return { from: startOfDay(new Date(customFrom + 'T00:00:00')), to: endOfDay(new Date(customTo + 'T00:00:00')) };
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const f = new Date(now); f.setDate(f.getDate() - days);
    return { from: startOfDay(f), to: endOfDay(now) };
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchDeductions(from, to);
      setRows(data); setLastLoaded(new Date());
    } catch { setError('Failed to load deduction data. Please try again.'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const periodLabel = period === 'custom' ? `${customFrom}-to-${customTo}` : PERIODS.find(p => p.key === period)?.label ?? '';

  const filtered = useMemo(() => {
    const q = orderFilter.trim().toLowerCase();
    return q ? rows.filter(r => r.orderNumber.toLowerCase().includes(q) || r.materialName.toLowerCase().includes(q)) : rows;
  }, [rows, orderFilter]);

  // Aggregate totals per material
  const totals = useMemo(() => {
    const map = new Map<string, { qty: number; unit: string }>();
    for (const r of filtered) {
      const key = `${r.materialName}__${r.unit}`;
      const ex = map.get(key);
      if (ex) ex.qty = parseFloat((ex.qty + r.quantityDeducted).toFixed(4));
      else map.set(key, { qty: r.quantityDeducted, unit: r.unit });
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ name: k.split('__')[0], ...v }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const handleDownload = () => {
    const detailSheet = {
      name: 'Deductions',
      headers: ['Date', 'Time', 'Order #', 'Material', 'Qty Deducted', 'Unit', 'Stock Before', 'Stock After', 'Deducted By'],
      rows: filtered.map(r => [
        fmtDate(r.deductedAt), fmtTime(r.deductedAt), r.orderNumber,
        r.materialName, r.quantityDeducted, r.unit,
        r.stockBefore, r.stockAfter, r.deductedBy,
      ]),
    };
    const summarySheet = {
      name: 'Summary by Material',
      headers: ['Material', 'Total Deducted', 'Unit'],
      rows: totals.map(t => [t.name, t.qty, t.unit]),
    };
    exportExcel([detailSheet, summarySheet], `deductions-${periodLabel}`);
  };

  const uniqueOrders = new Set(filtered.map(r => r.orderNumber)).size;

  return (
    <div className="space-y-4">
      <PeriodSelector period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

      {/* Search / filter */}
      <div className="relative">
        <ClipboardList className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={orderFilter}
          onChange={e => setOrderFilter(e.target.value)}
          placeholder="Filter by order # or material name…"
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading && <LoadingState />}
      {error && !loading && <ErrorState msg={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard icon={MinusCircle} label="Total Deductions" value={filtered.length}    sub={`${uniqueOrders} orders`}                  color="bg-amber-500" />
            <SummaryCard icon={Package}     label="Materials Used"   value={totals.length}      sub="unique ingredients"                         color="bg-primary" />
          </div>

          {/* Top deducted materials */}
          {totals.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-body font-bold text-foreground">Top Materials Consumed</p>
              </div>
              {totals.slice(0, 8).map((t, i) => (
                <div key={t.name} className={cn('flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
                  <span className="text-sm font-body text-foreground">{t.name}</span>
                  <span className="text-sm font-body font-bold tabular-nums text-foreground">
                    {t.qty % 1 === 0 ? t.qty : t.qty.toFixed(3)} <span className="text-muted-foreground font-normal text-xs">{t.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <ActionBar onDownload={handleDownload} onRefresh={load} rowCount={filtered.length} lastLoaded={lastLoaded} loading={loading} />

          {filtered.length === 0
            ? <EmptyState label="No material deductions found. Deductions are logged when you tap 'Send to Baker'." />
            : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MinusCircle className="size-4 text-muted-foreground" />
                    <p className="text-xs font-body font-bold text-foreground">Deduction Log</p>
                    <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length} entries</span>
                  </div>
                  {filtered.length > 50 && <p className="text-[10px] font-body text-muted-foreground">Showing first 50</p>}
                </div>
                {filtered.slice(0, 50).map((r, i) => <DeductionPreviewRow key={r.id} r={r} index={i} />)}
                {filtered.length > 50 && (
                  <div className="px-4 py-3 text-center">
                    <p className="text-[11px] font-body text-muted-foreground">+{filtered.length - 50} more — download Excel to see all</p>
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ── DAILY CLOSURE REPORT sub-tab ─────────────────────────────────────────────
// Store day-end view: current raw stock left + items supplied today to branches.
// Reads existing tables only: store_raw_stock and bakery_orders.dispatch_log.
// ═══════════════════════════════════════════════════════════════════════════════

interface StoreClosureStockRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
}

interface StoreDispatchRow {
  orderNumber: number;
  itemName: string;
  quantity: number;
  unit: string;
  branch: string;
  dispatchedAt: string;
  dispatchedBy: string;
}

interface StoreDispatchOrderRow {
  order_number: number;
  dispatch_log: {
    itemName: string;
    quantity: number;
    unit?: string;
    branch: string;
    dispatchedAt: string;
    dispatchedBy: string;
  }[] | null;
}

function toLocalISODate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtQty(n: number, unit: string) {
  const safe = Number.isFinite(n) ? n : 0;
  const value = Math.abs(safe % 1) < 0.001 ? String(Math.round(safe)) : safe.toFixed(2);
  return `${value} ${unit}`;
}

async function fetchStoreClosureStock(): Promise<StoreClosureStockRow[]> {
  const { data, error } = await supabase
    .from('store_raw_stock')
    .select('id, name, unit, quantity, min_threshold')
    .order('name', { ascending: true });
  if (error) { console.warn('StoreClosure – stock:', error.message); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as string,
    quantity: Number(r.quantity ?? 0),
    minThreshold: Number(r.min_threshold ?? 0),
  }));
}

async function fetchStoreDispatches(date: string): Promise<StoreDispatchRow[]> {
  const { data, error } = await supabase
    .from('bakery_orders')
    .select('order_number, dispatch_log')
    .not('dispatch_log', 'is', null)
    .order('created_at', { ascending: false });
  if (error) { console.warn('StoreClosure – dispatches:', error.message); return []; }

  const rows: StoreDispatchRow[] = [];
  for (const order of (data ?? []) as StoreDispatchOrderRow[]) {
    for (const d of order.dispatch_log ?? []) {
      if (!d.dispatchedAt || toLocalISODate(d.dispatchedAt) !== date) continue;
      rows.push({
        orderNumber: order.order_number,
        itemName: d.itemName,
        quantity: Number(d.quantity ?? 0),
        unit: d.unit ?? 'kg',
        branch: d.branch ?? '—',
        dispatchedAt: d.dispatchedAt,
        dispatchedBy: d.dispatchedBy ?? '—',
      });
    }
  }
  return rows.sort((a, b) => new Date(b.dispatchedAt).getTime() - new Date(a.dispatchedAt).getTime());
}

function StoreDailyClosureReportTab() {
  const today = toInputDate(new Date());
  const [date, setDate] = useState(today);
  const [stockRows, setStockRows] = useState<StoreClosureStockRow[]>([]);
  const [dispatchRows, setDispatchRows] = useState<StoreDispatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [stock, dispatches] = await Promise.all([
        fetchStoreClosureStock(),
        fetchStoreDispatches(date),
      ]);
      setStockRows(stock);
      setDispatchRows(dispatches);
      setLastLoaded(new Date());
    } catch {
      setError('Failed to load daily closure report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const branchSummary = useMemo(() => {
    const map = new Map<string, { branch: string; lines: number; totalQty: number }>();
    for (const r of dispatchRows) {
      const ex = map.get(r.branch) ?? { branch: r.branch, lines: 0, totalQty: 0 };
      ex.lines += 1;
      ex.totalQty += r.quantity;
      map.set(r.branch, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.lines - a.lines);
  }, [dispatchRows]);

  const itemSummary = useMemo(() => {
    const map = new Map<string, { itemName: string; quantity: number; unit: string; branches: Set<string> }>();
    for (const r of dispatchRows) {
      const key = `${r.itemName}__${r.unit}`;
      const ex = map.get(key) ?? { itemName: r.itemName, quantity: 0, unit: r.unit, branches: new Set<string>() };
      ex.quantity += r.quantity;
      ex.branches.add(r.branch);
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [dispatchRows]);

  const lowStock = stockRows.filter(r => r.quantity <= r.minThreshold);
  const outOfStock = stockRows.filter(r => r.quantity <= 0);
  const totalSuppliedQty = dispatchRows.reduce((s, r) => s + r.quantity, 0);

  const handleDownload = () => {
    exportExcel([
      {
        name: 'Closure Summary',
        headers: ['Metric', 'Value'],
        rows: [
          ['Date', date],
          ['Total stock items', stockRows.length],
          ['Low stock items', lowStock.length],
          ['Out of stock items', outOfStock.length],
          ['Supplied line items', dispatchRows.length],
          ['Total supplied quantity', totalSuppliedQty.toFixed(2)],
          ['Branches supplied', branchSummary.map(b => b.branch).join(', ') || 'None'],
        ],
      },
      {
        name: 'Stock Left',
        headers: ['Item', 'Stock Left', 'Unit', 'Minimum Threshold', 'Status'],
        rows: stockRows.map(r => [
          r.name,
          r.quantity,
          r.unit,
          r.minThreshold,
          r.quantity <= 0 ? 'Out of stock' : r.quantity <= r.minThreshold ? 'Low stock' : 'OK',
        ]),
      },
      {
        name: 'Supplied Today',
        headers: ['Time', 'Order #', 'Branch / To Whom', 'Item', 'Quantity', 'Unit', 'Dispatched By'],
        rows: dispatchRows.map(r => [fmtTime(r.dispatchedAt), r.orderNumber, r.branch, r.itemName, r.quantity, r.unit, r.dispatchedBy]),
      },
      {
        name: 'Branch Summary',
        headers: ['Branch / To Whom', 'Line Items', 'Total Quantity'],
        rows: branchSummary.map(r => [r.branch, r.lines, r.totalQty.toFixed(2)]),
      },
    ], `store-daily-closure-${date}`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-lg shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-200 ring-1 ring-white/10">
              <CheckCircle2 className="size-3.5" /> Daily Closure
            </div>
            <h3 className="font-display text-2xl font-black tracking-tight md:text-3xl">Store day-end stock and supply report</h3>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-300">
              See what is left in raw stock and exactly what was supplied today, branch-wise and item-wise.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => setDate(e.target.value)}
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white outline-none ring-white/20 [color-scheme:dark] focus:ring-2"
            />
            <button onClick={load} className="h-12 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 shadow active:scale-95">
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && !loading && <ErrorState msg={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={Package} label="Stock Items" value={stockRows.length} sub="live raw stock balance" color="bg-slate-800" />
            <SummaryCard icon={AlertCircle} label="Low Stock" value={lowStock.length} sub={`${outOfStock.length} out of stock`} color="bg-red-500" />
            <SummaryCard icon={ClipboardList} label="Supplied Today" value={dispatchRows.length} sub={`${branchSummary.length} branches`} color="bg-emerald-600" />
            <SummaryCard icon={Calendar} label="Total Supplied" value={totalSuppliedQty.toFixed(2)} sub="all supplied rows" color="bg-indigo-500" />
          </div>

          <ActionBar onDownload={handleDownload} onRefresh={load} rowCount={stockRows.length + dispatchRows.length} lastLoaded={lastLoaded} loading={loading} />

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <p className="text-base font-black text-slate-950">Stock left at day end</p>
                  <p className="text-xs font-semibold text-slate-500">Live current balance from store stock.</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">{stockRows.length} items</span>
              </div>
              {stockRows.length === 0 ? <EmptyState label="No raw stock rows found." /> : (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10 bg-white text-[11px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                      <tr>
                        <th className="px-5 py-3">Item</th>
                        <th className="px-5 py-3 text-right">Stock Left</th>
                        <th className="px-5 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {stockRows.map(r => {
                        const status = r.quantity <= 0 ? 'Out' : r.quantity <= r.minThreshold ? 'Low' : 'OK';
                        return (
                          <tr key={r.id} className={cn('hover:bg-slate-50', status === 'Out' && 'bg-red-50/50', status === 'Low' && 'bg-amber-50/50')}>
                            <td className="px-5 py-3 font-bold text-slate-900">{r.name}</td>
                            <td className="px-5 py-3 text-right text-lg font-black tabular-nums text-slate-950">{fmtQty(r.quantity, r.unit)}</td>
                            <td className="px-5 py-3 text-right">
                              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-black',
                                status === 'Out' ? 'bg-red-100 text-red-700' : status === 'Low' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700')}>{status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-base font-black text-slate-950">Supplied today — to whom</p>
                  <p className="text-xs font-semibold text-slate-500">Dispatches grouped by branch/customer outlet.</p>
                </div>
                {branchSummary.length === 0 ? <EmptyState label="No supplies dispatched on this date." /> : (
                  <div className="divide-y divide-slate-100">
                    {branchSummary.map(b => (
                      <div key={b.branch} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="text-lg font-black text-slate-950">{b.branch}</p>
                          <p className="text-xs font-semibold text-slate-500">{b.lines} supplied line item{b.lines !== 1 ? 's' : ''}</p>
                        </div>
                        <p className="text-xl font-black tabular-nums text-emerald-600">{b.totalQty.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-base font-black text-slate-950">Item-wise supply summary</p>
                  <p className="text-xs font-semibold text-slate-500">What left the store today.</p>
                </div>
                {itemSummary.length === 0 ? <EmptyState label="No supplied items found for this date." /> : (
                  <div className="divide-y divide-slate-100 max-h-80 overflow-auto">
                    {itemSummary.map(r => (
                      <div key={`${r.itemName}-${r.unit}`} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{r.itemName}</p>
                          <p className="text-[11px] font-semibold text-slate-500">To: {Array.from(r.branches).join(', ')}</p>
                        </div>
                        <p className="shrink-0 text-base font-black tabular-nums text-slate-900">{fmtQty(r.quantity, r.unit)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-base font-black text-slate-950">Dispatch log</p>
              <p className="text-xs font-semibold text-slate-500">Detailed supplied items for audit and closing verification.</p>
            </div>
            {dispatchRows.length === 0 ? <EmptyState label="No dispatch log rows for this date." /> : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white text-[11px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                    <tr>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">To Whom</th>
                      <th className="px-5 py-3">Item</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3 text-right">Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {dispatchRows.map((r, i) => (
                      <tr key={`${r.orderNumber}-${r.itemName}-${r.dispatchedAt}-${i}`} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-xs font-bold text-slate-500">{fmtTime(r.dispatchedAt)}</td>
                        <td className="px-5 py-3 font-black text-slate-950">{r.branch}</td>
                        <td className="px-5 py-3 font-semibold text-slate-800">{r.itemName}</td>
                        <td className="px-5 py-3 text-right text-base font-black tabular-nums text-slate-950">{fmtQty(r.quantity, r.unit)}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold text-slate-500">#{r.orderNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ROOT: StoreReportTab (sub-tab shell) ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

type SubTab = 'inventory' | 'closure' | 'invoice' | 'deductions';

export default function StoreReportTab() {
  const [sub, setSub] = useState<SubTab>('closure');

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="size-4 text-primary" />
          <h2 className="font-display font-bold text-foreground">Reports</h2>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Download Excel reports for day-end closure, inventory activity, raw-material deductions, and supplier invoices.
        </p>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-1.5 bg-muted/60 p-1.5 rounded-xl">
        {([
          { key: 'closure',   label: 'Daily Closure', icon: CheckCircle2 },
          { key: 'inventory',  label: 'Inventory',     icon: Package     },
          { key: 'deductions', label: 'Deductions',    icon: MinusCircle },
          { key: 'invoice',    label: 'Invoices',      icon: Receipt     },
        ] as { key: SubTab; label: string; icon: React.ElementType }[]).map(t => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-body font-semibold transition-all',
              sub === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {sub === 'closure'   && <StoreDailyClosureReportTab />}
      {sub === 'inventory'  && <InventoryReportTab />}
      {sub === 'deductions' && <DeductionReportTab />}
      {sub === 'invoice'    && <InvoiceReportTab />}
    </div>
  );
}
