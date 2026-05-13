// src/branch/tabs/HistoryTab.tsx
import { useMemo, useState } from 'react';
import { History, Search, X, TrendingUp, IndianRupee } from 'lucide-react';
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

const METHOD_COLORS: Record<string, string> = {
  cash:      'bg-emerald-100 text-emerald-700',
  upi:       'bg-blue-100 text-blue-700',
  card:      'bg-purple-100 text-purple-700',
  'cash+upi':'bg-amber-100 text-amber-700',
  'cash+card':'bg-amber-100 text-amber-700',
  'upi+card': 'bg-amber-100 text-amber-700',
};

export function HistoryTab({ branchSales }: Props) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branchSales.filter((s) => {
      const matchDate = !dateFilter || toLocalDateKey(s.soldAt) === dateFilter;
      const matchQ    = !q || s.itemName.toLowerCase().includes(q) || (s.soldBy||'').toLowerCase().includes(q);
      return matchDate && matchQ;
    });
  }, [branchSales, search, dateFilter]);

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

  const totalQty   = filtered.reduce((s, r) => s + r.quantitySold, 0);

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-xl overflow-hidden">
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

          {/* Summary */}
          {filtered.length > 0 && (
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
                <TrendingUp className="size-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">{totalQty} units sold</span>
              </div>
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
                  </p>
                </div>
                {sales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.itemName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {toLocalTimeStr(s.soldAt)} · {s.soldBy}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.paymentMethod && (
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full capitalize',
                          METHOD_COLORS[s.paymentMethod] ?? 'bg-muted text-muted-foreground',
                        )}>
                          {s.paymentMethod}
                        </span>
                      )}
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        ×{s.quantitySold}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
