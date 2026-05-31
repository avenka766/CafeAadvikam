// src/branch/tabs/HistoryTab.tsx
import { useMemo, useState } from 'react';
import { History, Search, X, TrendingUp, IndianRupee, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState } from '../components';
import type { SaleRecord } from '../branchStore';

interface Props {
  branchSales: SaleRecord[];
}

function toLocalDateStr(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function toLocalTimeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function toLocalDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Determine if a sale row is an advance payment entry
function isAdvancePayment(paymentMethod: string | null) {
  if (!paymentMethod) return false;
  return paymentMethod.startsWith('advance:') || paymentMethod.startsWith('advance+');
}

// Human-readable label for payment method
function paymentLabel(method: string | null): string {
  if (!method) return '';
  if (method.startsWith('advance:')) return `Advance (${method.slice(8).toUpperCase()})`;
  if (method.startsWith('advance+')) return `Advance+${method.slice(8).toUpperCase()}`;
  const map: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit',
    'cash+upi': 'Cash+UPI', 'cash+card': 'Cash+Card', 'upi+card': 'UPI+Card',
  };
  return map[method.toLowerCase()] ?? method;
}

const METHOD_COLORS: Record<string, string> = {
  cash:                'bg-emerald-100 text-emerald-700',
  upi:                 'bg-blue-100 text-blue-700',
  card:                'bg-purple-100 text-purple-700',
  credit:              'bg-red-100 text-red-700',
  'cash+upi':          'bg-amber-100 text-amber-700',
  'cash+card':         'bg-amber-100 text-amber-700',
  'upi+card':          'bg-amber-100 text-amber-700',
  'advance+cash':      'bg-orange-100 text-orange-700',
  'advance+upi':       'bg-orange-100 text-orange-700',
  'advance+card':      'bg-orange-100 text-orange-700',
  'advance:cash':      'bg-amber-100 text-amber-800',
  'advance:upi':       'bg-amber-100 text-amber-800',
  'advance:card':      'bg-amber-100 text-amber-800',
};

function methodColor(method: string | null): string {
  if (!method) return 'bg-muted text-muted-foreground';
  if (METHOD_COLORS[method]) return METHOD_COLORS[method];
  if (method.startsWith('advance:')) return 'bg-amber-100 text-amber-800';
  if (method.startsWith('advance+')) return 'bg-orange-100 text-orange-700';
  return 'bg-muted text-muted-foreground';
}

export function HistoryTab({ branchSales }: Props) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [showAdvanceOnly, setShowAdvanceOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branchSales.filter((s) => {
      const matchDate   = !dateFilter || toLocalDateKey(s.soldAt) === dateFilter;
      const matchQ      = !q || s.itemName.toLowerCase().includes(q) || (s.soldBy||'').toLowerCase().includes(q);
      const matchAdv    = !showAdvanceOnly || isAdvancePayment(s.paymentMethod);
      return matchDate && matchQ && matchAdv;
    });
  }, [branchSales, search, dateFilter, showAdvanceOnly]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, SaleRecord[]>();
    filtered.forEach((s) => {
      const key = toLocalDateKey(s.soldAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const totalQty        = filtered.reduce((s, r) => s + r.quantitySold, 0);
  const totalRevenue    = filtered.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0);
  const advanceCount    = filtered.filter(s => isAdvancePayment(s.paymentMethod)).length;
  const advanceRevenue  = filtered
    .filter(s => isAdvancePayment(s.paymentMethod))
    .reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0);

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
        <SectionHeader
          icon={<History className="size-4 text-blue-600" />}
          title="Sales History"
          right={
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {filtered.length} sales
            </span>
          }
        />

        {/* Filters */}
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item or staff…"
                className="w-full pl-8 pr-8 py-2 rounded-xl bg-muted border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5 text-muted-foreground" /></button>}
            </div>
            <input
              type="date" value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="px-2 rounded-xl border bg-muted text-muted-foreground text-xs">All</button>
            )}
          </div>

          {/* Advance filter toggle */}
          <button
            onClick={() => setShowAdvanceOnly(v => !v)}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition',
              showAdvanceOnly
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-muted border-border text-muted-foreground')}>
            <Wallet className="size-3.5" />
            {showAdvanceOnly ? 'Showing Advance Only' : 'Show Advance Payments Only'}
          </button>

          {/* Summary stats */}
          {filtered.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px] bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
                <TrendingUp className="size-3.5 text-blue-600 shrink-0" />
                <span className="text-xs font-semibold text-blue-700">{totalQty} units sold</span>
              </div>
              {totalRevenue > 0 && (
                <div className="flex-1 min-w-[120px] bg-emerald-50 rounded-xl px-3 py-2 flex items-center gap-2">
                  <IndianRupee className="size-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">
                    ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {advanceCount > 0 && !showAdvanceOnly && (
                <div className="w-full bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Wallet className="size-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">
                    {advanceCount} advance entries · ₹{advanceRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sales list */}
        {grouped.length === 0 ? (
          <EmptyState message="No sales found for the selected filters." />
        ) : (
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {grouped.map(([date, sales]) => (
              <div key={date}>
                {/* Date header */}
                <div className="px-4 py-2 bg-muted/40 sticky top-0">
                  <p className="text-xs font-bold text-muted-foreground">
                    {toLocalDateStr(sales[0].soldAt)}
                    <span className="ml-2 text-blue-600">{sales.length} sales</span>
                    <span className="ml-2 text-emerald-600">
                      ₹{sales.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </p>
                </div>
                {sales.map((s) => {
                  const lineRevenue = (s.unitPrice ?? 0) * s.quantitySold;
                  const isAdv = isAdvancePayment(s.paymentMethod);
                  return (
                    <div key={s.id} className={cn('flex items-center justify-between px-4 py-3 gap-3',
                      isAdv && 'bg-amber-50/40')}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.itemName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {toLocalTimeStr(s.soldAt)} · {s.soldBy}
                          {s.billNo && <span className="ml-1 text-muted-foreground/60">#{s.billNo.split('-').pop()}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.paymentMethod && (
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            methodColor(s.paymentMethod),
                          )}>
                            {paymentLabel(s.paymentMethod)}
                          </span>
                        )}
                        <div className="text-right">
                          <span className="text-sm font-bold tabular-nums text-foreground block">
                            ×{s.quantitySold}
                          </span>
                          {lineRevenue > 0 && (
                            <span className="text-[11px] font-semibold text-primary tabular-nums block">
                              ₹{lineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
