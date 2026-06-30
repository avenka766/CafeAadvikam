import { useEffect, useMemo, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { cn, formatCurrency } from '@/lib/utils';
import { ChevronLeft, ChevronRight, History, IndianRupee, ShoppingBag } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

const PAGE_SIZE = 50;

export default function SNBHistoryPage() {
  const { sales, fetchBranchData } = useBranchStore();
  const [filter, setFilter] = useState<'all' | 'today'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => { void fetchBranchData('SNB'); }, [fetchBranchData]);
  useEffect(() => setPage(1), [filter]);

  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();
  const snbSales = useMemo(() => {
    let list = [...(sales.SNB || [])].sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
    if (filter === 'today') list = list.filter((sale) => isToday(sale.soldAt));
    return list;
  }, [sales, filter]);
  const pageCount = Math.max(1, Math.ceil(snbSales.length / PAGE_SIZE));
  const visible = snbSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const todayRows = (sales.SNB || []).filter((sale) => isToday(sale.soldAt));
  const todayQty = todayRows.reduce((sum, sale) => sum + sale.quantitySold, 0);
  const todayRevenue = todayRows.reduce((sum, sale) => sum + sale.quantitySold * sale.unitPrice, 0);

  return <div className="dashboard-screen flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
    <div className="shrink-0 border-b border-border px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><History className="size-5 text-amber-600"/><h1 className="font-display text-xl font-bold">SNB History</h1></div>
        <div className="flex gap-2">{([{ key:'all', label:'All Sales' },{ key:'today',label:'Today' }] as const).map((option) => <button key={option.key} onClick={() => setFilter(option.key)} className={cn('rounded-xl px-3 py-2 text-sm font-semibold', filter === option.key ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground')}>{option.label}</button>)}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-center"><ShoppingBag className="mx-auto size-4 text-amber-600"/><p className="text-lg font-black text-amber-700">{todayQty}</p><p className="text-[10px] font-bold uppercase text-amber-700">Today Qty</p></div><div className="rounded-xl border bg-card p-2 text-center"><IndianRupee className="mx-auto size-4 text-emerald-600"/><p className="text-lg font-black">{formatCurrency(todayRevenue)}</p><p className="text-[10px] font-bold uppercase text-muted-foreground">Today Revenue</p></div></div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
      {snbSales.length === 0 ? <EmptyState icon="🛒" message="No SNB sales found" sub="Sales will appear here once items are billed."/> : <div className="overflow-hidden rounded-xl border bg-card"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-muted text-left text-[10px] uppercase text-muted-foreground"><tr><th className="p-3">Date / Bill</th><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Unit Price</th><th className="p-3 text-right">Line Revenue</th><th className="p-3">Cashier</th></tr></thead><tbody>{visible.map((sale) => <tr key={sale.id} className="border-t"><td className="p-3"><p className="font-bold">{new Date(sale.soldAt).toLocaleString('en-IN')}</p><p className="text-xs text-muted-foreground">{sale.billNo || 'Legacy sale'}</p></td><td className="p-3 font-bold">{sale.itemName}</td><td className="p-3 text-right font-black">{sale.quantitySold}</td><td className="p-3 text-right">{sale.unitPrice > 0 ? formatCurrency(sale.unitPrice) : 'Unavailable'}</td><td className="p-3 text-right font-black text-emerald-700">{sale.unitPrice > 0 ? formatCurrency(sale.quantitySold * sale.unitPrice) : 'Unavailable'}</td><td className="p-3">{sale.soldBy}</td></tr>)}</tbody></table></div>}
    </div>
    {snbSales.length > PAGE_SIZE && <div className="flex shrink-0 items-center justify-between border-t bg-card px-4 py-2 text-sm font-bold"><span>Showing {(page-1)*PAGE_SIZE+1}-{Math.min(page*PAGE_SIZE,snbSales.length)} of {snbSales.length}</span><div className="flex gap-2"><button disabled={page===1} onClick={() => setPage((value)=>Math.max(1,value-1))} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="size-4"/></button><button disabled={page===pageCount} onClick={() => setPage((value)=>Math.min(pageCount,value+1))} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="size-4"/></button></div></div>}
  </div>;
}
