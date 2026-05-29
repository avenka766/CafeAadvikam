// src/bakery/BakerDashboard.tsx  (Redesigned)
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChefHat, Send, Loader2, ChevronDown, ChevronUp, CheckCircle2, Flame, Clock, BarChart2, Download, RefreshCw, Calendar, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { BAKERY_ITEMS } from './types';
import type { PreparedItem } from './types';
import { cn } from '@/lib/utils';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

// ─── Report helpers ───────────────────────────────────────────────────────────

type PeriodKey = 'today' | '7d' | '15d' | '30d';

const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: 'today', label: 'Today',   days: 0  },
  { key: '7d',    label: '7 Days',  days: 7  },
  { key: '15d',   label: '15 Days', days: 15 },
  { key: '30d',   label: '30 Days', days: 30 },
];

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

async function fetchBakerReport(from: Date, to: Date): Promise<BakerReportRow[]> {
  const { data, error } = await supabase
    .from('bakery_orders')
    .select('*')
    .in('status', ['packed', 'dispatched'])
    .gte('sent_to_packing_at', from.toISOString())
    .lte('sent_to_packing_at', to.toISOString())
    .order('sent_to_packing_at', { ascending: false });

  if (error) { console.warn('BakerReport fetch error:', error.message); return []; }

  const rows: BakerReportRow[] = [];
  for (const r of data ?? []) {
    const preparedItems = (r.prepared_items as PreparedItem[]) ?? [];
    const requestedItems = (r.items as { itemId: string; itemName: string; quantity: number; dispatchUnit?: string; originalPcs?: number }[]) ?? [];

    for (const p of preparedItems) {
      const req = requestedItems.find(i => i.itemId === p.itemId);
      rows.push({
        orderNumber:   r.order_number as number,
        targetBranch:  (r.target_branch as string) ?? '—',
        itemName:      p.itemName,
        requestedQty:  req?.quantity ?? 0,
        // VRSNB items with originalPcs are always in kg
        requestedUnit: req?.originalPcs != null ? 'kg' : (req?.dispatchUnit ?? 'kg'),
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

// ─── Baker Report Tab ─────────────────────────────────────────────────────────
function BakerReportTab() {
  const [period, setPeriod]       = useState<PeriodKey>('today');
  const [rows, setRows]           = useState<BakerReportRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const { from, to } = useMemo(() => {
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const f = new Date(); f.setDate(f.getDate() - days);
    return { from: startOfDay(f), to: endOfDay(new Date()) };
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchBakerReport(from, to);
      setRows(data); setLastLoaded(new Date());
    } catch { setError('Failed to load report. Please try again.'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // Summary stats
  const totalOrders  = useMemo(() => new Set(rows.map(r => r.orderNumber)).size, [rows]);
  const totalItems   = rows.length;
  const dispatched   = useMemo(() => new Set(rows.filter(r => r.status === 'dispatched').map(r => r.orderNumber)).size, [rows]);

  const handleDownload = () => {
    const periodLabel = PERIODS.find(p => p.key === period)?.label ?? period;

    // Sheet 1: Summary per order
    const orderMap = new Map<number, BakerReportRow[]>();
    for (const r of rows) {
      if (!orderMap.has(r.orderNumber)) orderMap.set(r.orderNumber, []);
      orderMap.get(r.orderNumber)!.push(r);
    }

    const summaryRows = [...orderMap.entries()].map(([num, items]) => [
      num,
      items[0].targetBranch,
      items.map(i => i.itemName).join(', '),
      fmtDate(items[0].sentToPackingAt),
      fmtTime(items[0].sentToPackingAt),
      items[0].status.charAt(0).toUpperCase() + items[0].status.slice(1),
      items[0].createdBy,
    ]);

    // Sheet 2: Item-level detail
    const detailRows = rows.map(r => [
      r.orderNumber,
      r.targetBranch,
      r.itemName,
      r.requestedQty,
      r.requestedUnit,
      r.preparedQty,
      r.preparedUnit,
      r.preparedQty - r.requestedQty,   // variance
      fmtDate(r.sentToPackingAt),
      fmtTime(r.sentToPackingAt),
      r.status.charAt(0).toUpperCase() + r.status.slice(1),
    ]);

    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['Order #', 'Branch', 'Items', 'Date', 'Time', 'Status', 'Baker'],
      ...summaryRows,
    ]);
    summarySheet['!cols'] = [8, 10, 40, 12, 8, 12, 16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Order Summary');

    const detailSheet = XLSX.utils.aoa_to_sheet([
      ['Order #', 'Branch', 'Item Name', 'Requested Qty', 'Req Unit', 'Prepared Qty', 'Prep Unit', 'Variance', 'Date', 'Time', 'Status'],
      ...detailRows,
    ]);
    detailSheet['!cols'] = [8, 10, 28, 14, 8, 14, 8, 10, 12, 8, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Item Detail');

    XLSX.writeFile(wb, `baker-report-${periodLabel}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="size-4 text-primary" />
          <h2 className="font-display font-bold text-foreground">Baker Report</h2>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Download Excel of items prepared and sent to packing.
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <p className="text-xs font-body font-bold text-foreground">Select Period</p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn(
                'flex-1 py-2 rounded-lg text-[11px] font-body font-semibold transition-all border',
                period === p.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Orders Sent',  value: totalOrders,  color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
          { label: 'Item Lines',   value: totalItems,   color: 'text-primary',    bg: '' },
          { label: 'Dispatched',   value: dispatched,   color: 'text-emerald-600',bg: '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-2xl p-3 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Download + Refresh */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={rows.length === 0 || loading}
          className={cn(
            'flex-1 h-12 rounded-2xl font-body font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95',
            rows.length > 0 && !loading
              ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}>
          <Download className="size-4" />
          Download Excel
          {rows.length > 0 && (
            <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full">{rows.length}</span>
          )}
        </button>
        <button onClick={load}
          className="size-12 rounded-2xl border border-border bg-card flex items-center justify-center shrink-0 active:scale-95 hover:bg-muted">
          <RefreshCw className={cn('size-4 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {lastLoaded && !loading && (
        <p className="text-[10px] font-body text-muted-foreground text-center -mt-2">
          Last refreshed: {fmtTime(lastLoaded.toISOString())}
        </p>
      )}

      {/* States */}
      {loading && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm font-body text-muted-foreground">Loading report…</p>
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

      {/* Preview table */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
            <FileSpreadsheet className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-body font-bold text-foreground">No data found</p>
          <p className="text-xs font-body text-muted-foreground">No items sent to packing in this period.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="size-4 text-muted-foreground" />
              <p className="text-xs font-body font-bold text-foreground">Preview</p>
              <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{rows.length} rows</span>
            </div>
            {rows.length > 30 && <p className="text-[10px] font-body text-muted-foreground">Showing first 30</p>}
          </div>
          {/* Header */}
          <div className="grid grid-cols-12 gap-1 px-4 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase border-b border-border">
            <span className="col-span-1">#</span>
            <span className="col-span-3">Item</span>
            <span className="col-span-2">Branch</span>
            <span className="col-span-2 text-right">Req</span>
            <span className="col-span-2 text-right">Prepared</span>
            <span className="col-span-2 text-right">Time</span>
          </div>
          {rows.slice(0, 30).map((r, i) => (
            <div key={i}
              className={cn('grid grid-cols-12 gap-1 px-4 py-2.5 border-b border-border/50 last:border-0 text-xs font-body items-center',
                i % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
              <span className="col-span-1 text-muted-foreground tabular-nums">{r.orderNumber}</span>
              <span className="col-span-3 font-semibold text-foreground truncate">{r.itemName}</span>
              <span className="col-span-2">
                <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                  r.targetBranch === 'VRSNB' ? 'bg-blue-100 text-blue-700' :
                  r.targetBranch === 'SNB'   ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700')}>
                  {r.targetBranch}
                </span>
              </span>
              <span className="col-span-2 text-right text-muted-foreground tabular-nums">{r.requestedQty} {r.requestedUnit}</span>
              <span className={cn('col-span-2 text-right font-bold tabular-nums',
                r.preparedQty < r.requestedQty ? 'text-red-600' :
                r.preparedQty > r.requestedQty ? 'text-amber-600' : 'text-emerald-600')}>
                {r.preparedQty} {r.preparedUnit}
              </span>
              <span className="col-span-2 text-right text-muted-foreground text-[10px]">
                {r.sentToPackingAt ? fmtTime(r.sentToPackingAt) : '—'}
              </span>
            </div>
          ))}
          {rows.length > 30 && (
            <div className="px-4 py-3 text-center">
              <p className="text-[11px] font-body text-muted-foreground">+{rows.length - 30} more rows — download Excel to see all</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Active baking card ───────────────────────────────────────────────────────
function ActiveBakeCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const { submitPrepared } = useBakeryStore();
  const [expanded, setExpanded] = useState(true);

  // FIX M-18: removed initialised guard — useEffect now reruns when order.id or
  // order.updatedAt changes so prep quantities stay in sync with realtime updates.
  const [prepQty, setPrepQty] = useState<Record<string, string>>({});
  useEffect(() => {
    setPrepQty(Object.fromEntries(order.items.map(i => [i.itemId, String(i.quantity)])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, (order as { updatedAt?: string }).updatedAt]);

  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // BUG #15 FIX: was >= 0 which allowed submitting 0 qty, stalling packing permanently.
  // FIX M-17: use parseInt + isFinite to reject scientific notation (1e3) and Infinity.
  const valid = order.items.every(i => {
    const v = Number.parseInt(prepQty[i.itemId] ?? '', 10);
    return Number.isFinite(v) && v > 0;
  });

  const handleSend = async () => {
    setSubmitting(true); setError(null);
    const prepared: PreparedItem[] = order.items.map(item => ({
      itemId: item.itemId, itemName: item.itemName,
      quantityPrepared: Number.parseInt(prepQty[item.itemId] ?? String(item.quantity), 10),
      preparedAt: new Date().toISOString(),
      dispatchUnit: item.dispatchUnit ?? 'kg',
    }));
    try {
      await submitPrepared(order.id, prepared);
      setDone(true);
    } catch {
      setError('Failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      done ? 'border-emerald-200 bg-emerald-50/40' : 'border-orange-200 bg-orange-50/20'
    )}>
      {/* Card header */}
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0',
          done ? 'bg-emerald-100' : 'bg-orange-100'
        )}>
          {done
            ? <CheckCircle2 className="size-5 text-emerald-600" />
            : <Flame className="size-5 text-orange-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">Order #{order.orderNumber}</span>
            <span className={cn(
              'text-[9px] font-body font-bold px-2 py-0.5 rounded-full border',
              done
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            )}>
              {done ? '✓ SENT TO PACKING' : '🔥 BAKING'}
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
          {/* Items */}
          <div className="space-y-2.5">
            {order.items.map(item => {
              const meta = BAKERY_ITEMS.find(b => b.id === item.itemId);
              return (
                <div key={item.itemId}
                  className="flex items-center gap-3 bg-background rounded-xl border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{meta?.icon ?? '🍬'}</span>
                      <p className="text-sm font-body font-semibold text-foreground truncate">{item.itemName}</p>
                      {item.isCustom && (
                        <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">CUSTOM</span>
                      )}
                    </div>
                    <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                      Requested: <span className="font-bold text-foreground">{item.quantity}{(item.dispatchUnit === 'pcs' && item.originalPcs == null) ? ' pcs' : ' kg'}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <input
                      type="number" min={0} step={0.25}
                      value={prepQty[item.itemId] ?? item.quantity}
                      onChange={e => setPrepQty(p => ({ ...p, [item.itemId]: e.target.value }))}
                      disabled={done}
                      className="w-20 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                    />
                    <span className="text-[9px] font-body font-bold text-muted-foreground">
                      {(item.dispatchUnit === 'pcs' && item.originalPcs == null) ? 'pcs' : 'kg'} prepared
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

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

          <button onClick={handleSend} disabled={submitting || done || !valid}
            className={cn(
              'w-full h-12 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50',
              done
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-orange-500 text-white shadow-lg shadow-orange-200'
            )}>
            {submitting
              ? <Loader2 className="size-4 animate-spin" />
              : done
              ? <><CheckCircle2 className="size-4" /> Sent to Packing</>
              : <><Send className="size-4" /> Send to Packing</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Completed card ───────────────────────────────────────────────────────────
function CompletedCard({ order }: { order: ReturnType<typeof useBakeryStore.getState>['orders'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const isDispatched = order.status === 'dispatched';

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden opacity-75">
      <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className={cn(
          'size-8 rounded-xl flex items-center justify-center shrink-0',
          isDispatched ? 'bg-emerald-100' : 'bg-purple-100'
        )}>
          <CheckCircle2 className={cn('size-4', isDispatched ? 'text-emerald-600' : 'text-purple-600')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">#{order.orderNumber}</span>
            <span className={cn(
              'text-[9px] font-body font-bold px-2 py-0.5 rounded-full border',
              isDispatched
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-purple-100 text-purple-700 border-purple-200'
            )}>
              {isDispatched ? 'DISPATCHED' : 'AT PACKING'}
            </span>
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">
            {order.preparedItems?.map(p => `${p.itemName} ×${p.quantityPrepared}`).join(' · ')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {expanded && order.preparedItems && (
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          {order.preparedItems.map((p, i) => (
            <div key={i} className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">{p.itemName}</span>
              <span className="font-bold text-foreground">{p.quantityPrepared} {order.items.find(i => i.itemId === p.itemId)?.originalPcs != null ? 'kg' : (p.dispatchUnit ?? 'kg')}</span>
            </div>
          ))}
          {order.sentToPackingAt && (
            <p className="text-[10px] font-body text-muted-foreground pt-1 border-t border-border/50 mt-2">
              <Clock className="size-3 inline mr-1" />
              {new Date(order.sentToPackingAt).toLocaleString('en-IN')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BakerDashboard() {
  const { orders, fetchOrders } = useBakeryStore();
  const [initialLoading, setInitialLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'report'>('orders');

  useEffect(() => {
    fetchOrders().finally(() => setInitialLoading(false));
    const id = setInterval(() => fetchOrders(true), 15_000);
    return () => clearInterval(id);
  }, []);

  const bakingOrders    = orders.filter(o => o.status === 'baking');
  const completedOrders = orders.filter(o => ['packed', 'dispatched'].includes(o.status));

  return (
    <div className="min-h-screen bg-background pt-14 pb-32">

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1">Bakery</p>
            <h1 className="font-display text-2xl font-bold text-foreground">Baker</h1>
          </div>
          {bakingOrders.length > 0 && tab === 'orders' && (
            <div className="mt-1 flex items-center gap-1.5 bg-orange-100 border border-orange-200 text-orange-700 text-xs font-body font-bold px-3 py-1.5 rounded-xl">
              <Flame className="size-3.5" />
              {bakingOrders.length} to bake
            </div>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="px-4 mb-5">
        <div className="flex gap-1 bg-muted/60 p-1.5 rounded-xl">
          {([
            { id: 'orders', label: 'Orders',  icon: ChefHat,   badge: bakingOrders.length > 0 ? String(bakingOrders.length) : null },
            { id: 'report', label: 'Report',  icon: BarChart2, badge: null },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-body font-semibold transition-all',
                tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}>
              <t.icon className="size-3.5" />
              {t.label}
              {t.badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'report' ? (
        <div className="px-4">
          <BakerReportTab />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="px-4 grid grid-cols-3 gap-2 mb-5">
            {[
              { label: 'To Bake',    value: bakingOrders.length,    color: bakingOrders.length > 0 ? 'text-orange-600' : 'text-muted-foreground', bg: bakingOrders.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-card border-border' },
              { label: 'At Packing', value: completedOrders.filter(o => o.status === 'packed').length, color: 'text-purple-600', bg: 'bg-card border-border' },
              { label: 'Dispatched', value: completedOrders.filter(o => o.status === 'dispatched').length, color: 'text-emerald-600', bg: 'bg-card border-border' },
            ].map(s => (
              <div key={s.label} className={cn('border rounded-2xl p-3 text-center', s.bg)}>
                <p className={cn('font-display text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
                <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {initialLoading ? (
            <LoadingSkeleton variant="card" count={3} className="mx-4" />
          ) : (
            <div className="px-4 space-y-4">
              {bakingOrders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame className="size-3.5 text-orange-500" />
                    <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Active — Ready to Bake</p>
                  </div>
                  {bakingOrders.map(o => <ActiveBakeCard key={o.id} order={o} />)}
                </div>
              )}

              {completedOrders.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Completed</p>
                  </div>
                  {completedOrders.map(o => <CompletedCard key={o.id} order={o} />)}
                </div>
              )}

              {bakingOrders.length === 0 && completedOrders.length === 0 && (
                <div className="flex flex-col items-center py-24 gap-4">
                  <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                    <ChefHat className="size-10 text-muted-foreground opacity-30" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-body font-semibold text-foreground">No orders yet</p>
                    <p className="text-xs font-body text-muted-foreground mt-1">Orders will appear here once the store sends them</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
