// src/branch/tabs/ReportsTab.tsx  ← NEW FILE
import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadCSV, fmtDate, EmptyState } from '../components';
import type { Branch } from '../types';
import type { SaleRecord } from '../branchStore';

interface Props {
  branch: Branch;
  branchSales: SaleRecord[];
}

export function ReportsTab({ branch, branchSales }: Props) {
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [filterItem, setFilterItem] = useState('');

  const today        = new Date().toDateString();
  const currentMonth = new Date().getMonth();
  const currentYear  = new Date().getFullYear();

  const aggregate = (records: SaleRecord[]) => {
    const map: Record<string, number> = {};
    records.forEach((s) => { map[s.itemName] = (map[s.itemName] || 0) + s.quantitySold; });
    return map;
  };

  const dailySales = aggregate(
    branchSales.filter((s) => new Date(s.soldAt).toDateString() === today),
  );
  const monthlySales = aggregate(
    branchSales.filter((s) => {
      const d = new Date(s.soldAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }),
  );

  const allItems       = [...new Set(branchSales.map((s) => s.itemName))];
  const activeReport   = reportType === 'daily' ? dailySales : monthlySales;
  const filteredReport = filterItem
    ? Object.fromEntries(Object.entries(activeReport).filter(([k]) => k === filterItem))
    : activeReport;

  const totalQty  = Object.values(filteredReport).reduce((a, b) => a + b, 0);
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const handleDownloadCSV = () => {
    const label = reportType === 'daily'
      ? `Daily_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}`
      : `Monthly_${monthLabel.replace(' ', '_')}`;
    const rows = [
      ['Item Name', 'Quantity Sold'],
      ...Object.entries(filteredReport).map(([item, qty]) => [item, String(qty)]),
      ['TOTAL', String(totalQty)],
    ];
    downloadCSV(rows, `${branch}_${label}.csv`);
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {/* Controls */}
      <div className="px-4 py-3 border-b bg-muted/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['daily', 'monthly'] as const).map((r) => (
              <button
                key={r} onClick={() => setReportType(r)}
                className={cn(
                  'text-xs px-3 py-1 rounded-lg capitalize font-medium transition',
                  reportType === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg hover:bg-muted transition"
          >
            <Download className="size-3" />CSV
          </button>
        </div>
        <select
          value={filterItem} onChange={(e) => setFilterItem(e.target.value)}
          className="w-full text-xs border rounded-lg px-2 py-1.5 bg-background"
        >
          <option value="">All items</option>
          {allItems.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground mb-3">
          {reportType === 'daily'
            ? `Date: ${fmtDate(new Date().toISOString())}`
            : `Month: ${monthLabel}`}
        </p>
        {Object.keys(filteredReport).length === 0 ? (
          <EmptyState message="No sales data for this period." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left py-1.5">Item</th>
                <th className="text-right py-1.5">Qty Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Object.entries(filteredReport).map(([item, qty]) => (
                <tr key={item}>
                  <td className="py-2.5">{item}</td>
                  <td className="py-2.5 text-right font-semibold">{qty}</td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="py-2.5">Total</td>
                <td className="py-2.5 text-right">{totalQty}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
