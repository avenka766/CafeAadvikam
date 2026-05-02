// src/branch/tabs/ReportsTab.tsx
import { useState, useMemo } from 'react';
import { Download, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadCSV, fmtDate, EmptyState } from '../components';
import type { Branch } from '../types';
import type { SaleRecord } from '../branchStore';
import { BRANCH_COLORS } from '../types';

interface Props {
  branch: Branch;
  branchSales: SaleRecord[];
}

export function ReportsTab({ branch, branchSales }: Props) {
  const [reportType, setReportType] = useState<'item' | 'branch'>('item');

  // Default: today
  const todayISO = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);

  // ── Filter sales to the selected date range ──────────────────────────────
  const rangeSales = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(dateTo);   to.setHours(23, 59, 59, 999);
    return branchSales.filter(s => {
      const t = new Date(s.soldAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  }, [branchSales, dateFrom, dateTo]);

  // ── Aggregations ─────────────────────────────────────────────────────────
  const itemReport = useMemo(() => {
    const map: Record<string, number> = {};
    rangeSales.forEach(s => { map[s.itemName] = (map[s.itemName] || 0) + s.quantitySold; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rangeSales]);

  // branch-wise: group by branch field (useful if branchSales ever contains
  // cross-branch records; for a single-branch view this just shows the one branch)
  const branchReport = useMemo(() => {
    const map: Record<string, number> = {};
    rangeSales.forEach(s => {
      const key = s.branch ?? branch;
      map[key] = (map[key] || 0) + s.quantitySold;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rangeSales, branch]);

  const totalQty = itemReport.reduce((a, [, q]) => a + q, 0);

  const rangeLabel = dateFrom === dateTo
    ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const colors = BRANCH_COLORS[branch];

  // ── CSV download (summary + transactions) ────────────────────────────────
  const handleDownloadCSV = () => {
    const summaryRows = reportType === 'item'
      ? [['Item', 'Qty Sold'], ...itemReport.map(([i, q]) => [i, String(q)]), ['TOTAL', String(totalQty)]]
      : [['Branch', 'Qty Sold'], ...branchReport.map(([b, q]) => [b, String(q)]), ['TOTAL', String(totalQty)]];

    downloadCSV([
      [`${branch} ${reportType.toUpperCase()}-WISE REPORT`],
      ['Period', `${dateFrom} to ${dateTo}`],
      [''],
      ...summaryRows,
      [''],
      ['TRANSACTION DETAILS'],
      ['Item', 'Qty Sold', 'Sold At', 'Sold By'],
      ...rangeSales.map(s => [s.itemName, String(s.quantitySold), s.soldAt, s.soldBy]),
    ], `${branch}_Report_${dateFrom}_to_${dateTo}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Date Range</span>
          </div>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg hover:bg-muted transition"
          >
            <Download className="size-3" />CSV
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">From</label>
            <input
              type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">To</label>
            <input
              type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing: <span className="font-semibold text-foreground">{rangeLabel}</span>
          {' · '}{rangeSales.length} transactions · {totalQty} units
        </p>
      </div>

      {/* ── Item / Branch toggle + summary table ────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
          {(['item', 'branch'] as const).map(r => (
            <button
              key={r} onClick={() => setReportType(r)}
              className={cn(
                'text-xs px-3 py-1 rounded-lg capitalize font-medium transition',
                reportType === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {r}-wise
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          {reportType === 'item' ? (
            itemReport.length === 0 ? (
              <EmptyState message="No sales for this period." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-1.5">Item</th>
                    <th className="text-right py-1.5">Qty Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {itemReport.map(([item, qty]) => (
                    <tr key={item}>
                      <td className="py-2">{item}</td>
                      <td className="py-2 text-right font-semibold">{qty}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{totalQty}</td>
                  </tr>
                </tbody>
              </table>
            )
          ) : (
            branchReport.length === 0 ? (
              <EmptyState message="No sales for this period." />
            ) : (
              <div className="space-y-3 py-2">
                {branchReport.map(([b, qty]) => {
                  const pct = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
                  const badgeColor = BRANCH_COLORS[b as Branch]?.badge ?? colors.badge;
                  return (
                    <div key={b} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', badgeColor)}>{b}</span>
                        <span className="font-bold">{qty} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
                  <span>Total</span><span>{totalQty}</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Individual sale transactions ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Sale Transactions</h3>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', colors.badge)}>
            {totalQty} units
          </span>
        </div>
        {rangeSales.length === 0 ? (
          <EmptyState message="No transactions in this period." />
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {rangeSales.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{s.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.soldAt)} · {s.soldBy}
                  </p>
                </div>
                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  ×{s.quantitySold}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
