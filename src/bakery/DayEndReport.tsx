// src/bakery/DayEndReport.tsx
// Day-end summary — orders vs dispatched per branch per item for any selected date.

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Calendar, Download, ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';

interface OrderRow {
  orderNumber: number;
  targetBranch: string;
  status: string;
  items: { itemName: string; quantity: number; dispatchUnit: string }[];
  dispatchLog: { itemName: string; quantity: number; unit: string; branch: string }[];
  createdAt: string;
}

interface SummaryRow {
  itemName: string;
  requested: number;
  dispatched: number;
  unit: string;
}

interface BranchSummary {
  branch: string;
  rows: SummaryRow[];
  totalOrders: number;
}

function StatusChip({ requested, dispatched }: { requested: number; dispatched: number }) {
  const diff = dispatched - requested;
  if (Math.abs(diff) < 0.001) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="size-3" /> Exact
    </span>
  );
  if (diff < 0) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <ArrowDown className="size-3" /> {Math.abs(diff).toFixed(2)} short
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <ArrowUp className="size-3" /> {diff.toFixed(2)} extra
    </span>
  );
}

export default function DayEndReport() {
  const today = new Date().toISOString().split('T')[0];
  const [date,    setDate]    = useState(today);
  const [orders,  setOrders]  = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchForDate = async (d: string) => {
    setLoading(true);
    // M-11 FIX: use try/finally so loading is always reset to false even on
    // network exceptions (previously an uncaught throw left an infinite spinner).
    try {
      const from = `${d}T00:00:00`;
      const to   = `${d}T23:59:59`;
      const { data, error } = await supabase
        .from('bakery_orders')
        .select('order_number, target_branch, status, items, dispatch_log, created_at')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: true });
      if (!error && data) {
        setOrders(data.map(r => ({
          orderNumber:  r.order_number as number,
          targetBranch: r.target_branch as string,
          status:       r.status as string,
          items:        (r.items as OrderRow['items']) ?? [],
          dispatchLog:  (r.dispatch_log as OrderRow['dispatchLog']) ?? [],
          createdAt:    r.created_at as string,
        })));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchForDate(date); }, [date]);

  const branchSummaries: BranchSummary[] = useMemo(() => {
    const branches = [...new Set(orders.map(o => o.targetBranch))].sort();
    return branches.map(branch => {
      const branchOrders = orders.filter(o => o.targetBranch === branch);
      const itemMap = new Map<string, { requested: number; dispatched: number; unit: string }>();
      for (const order of branchOrders) {
        for (const item of order.items) {
          const ex = itemMap.get(item.itemName) ?? { requested: 0, dispatched: 0, unit: item.dispatchUnit ?? 'kg' };
          ex.requested += item.quantity;
          itemMap.set(item.itemName, ex);
        }
        for (const d of order.dispatchLog) {
          if (d.branch !== branch) continue;
          const ex = itemMap.get(d.itemName);
          if (ex) ex.dispatched += d.quantity;
        }
      }
      const rows: SummaryRow[] = Array.from(itemMap.entries()).map(([itemName, v]) => ({ itemName, ...v }));
      return { branch, rows, totalOrders: branchOrders.length };
    });
  }, [orders]);

  const downloadCSV = () => {
    const lines = [['Date', 'Branch', 'Item', 'Requested', 'Dispatched', 'Difference', 'Unit']];
    for (const bs of branchSummaries) {
      for (const r of bs.rows) {
        lines.push([date, bs.branch, r.itemName, String(r.requested), String(r.dispatched), String(r.dispatched - r.requested), r.unit]);
      }
    }
    const csv  = lines.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `day-end-${date}.csv`;
    a.click();
  };

  const totalOrders     = orders.length;
  const totalDispatched = orders.filter(o => o.status === 'dispatched').length;
  const totalShortfalls = branchSummaries.reduce((s, b) => s + b.rows.filter(r => r.dispatched < r.requested - 0.001).length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <p className="text-sm font-body font-bold text-foreground">Day-End Report</p>
        </div>
        <button onClick={downloadCSV} disabled={orders.length === 0}
          className="flex items-center gap-1.5 text-[11px] font-body font-semibold text-primary border border-primary/30 bg-primary/5 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-40">
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button onClick={() => fetchForDate(date)}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-body font-bold active:scale-95">
          Load
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Orders',     value: totalOrders,     color: 'text-foreground'    },
          { label: 'Dispatched', value: totalDispatched, color: 'text-emerald-600'   },
          { label: 'Shortfalls', value: totalShortfalls, color: totalShortfalls > 0 ? 'text-red-600' : 'text-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Branch summaries */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : branchSummaries.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Calendar className="size-10 text-muted-foreground/20 mb-3" />
          <EmptyState icon="📋" message={`No orders found for ${date}`} sub="Try a different date" />
        </div>
      ) : (
        branchSummaries.map(bs => (
          <div key={bs.branch} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
              <p className="text-sm font-body font-bold text-foreground">{bs.branch} Branch</p>
              <span className="text-[10px] font-body text-muted-foreground">{bs.totalOrders} order(s)</span>
            </div>
            {/* Table header */}
            <div className="grid grid-cols-12 px-4 py-2 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-4">Item</span>
              <span className="col-span-2 text-right">Req.</span>
              <span className="col-span-2 text-right">Disp.</span>
              <span className="col-span-4 text-right">Status</span>
            </div>
            {bs.rows.map((row, i) => (
              <div key={i} className={cn(
                'grid grid-cols-12 px-4 py-2.5 border-t border-border text-xs font-body items-center',
                row.dispatched < row.requested - 0.001 ? 'bg-red-50/40' :
                row.dispatched > row.requested + 0.001 ? 'bg-amber-50/40' : ''
              )}>
                <span className="col-span-4 font-semibold text-foreground truncate">{row.itemName}</span>
                <span className="col-span-2 text-right text-muted-foreground">{row.requested.toFixed(2)}</span>
                <span className="col-span-2 text-right font-bold text-foreground">{row.dispatched.toFixed(2)}</span>
                <div className="col-span-4 flex justify-end">
                  <StatusChip requested={row.requested} dispatched={row.dispatched} />
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
