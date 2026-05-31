// src/pages/SNBHistoryPage.tsx
// SNB Admin → History: SNB branch sales only
import { useState, useMemo, useEffect } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import { useOrderStore } from '@/stores/orderStore';
import { cn } from '@/lib/utils';
import { History, ShoppingBag } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function SNBHistoryPage() {
  const { sales, fetchBranchData } = useBranchStore();
  const { startPolling, stopPolling } = useOrderStore();
  const [filter, setFilter] = useState<'all' | 'today'>('all');

  useEffect(() => { fetchBranchData('SNB'); startPolling(60); return () => stopPolling(); }, [fetchBranchData, startPolling, stopPolling]);

  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();
  const snbSales = useMemo(() => {
    let list = [...(sales['SNB'] || [])].sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
    if (filter === 'today') list = list.filter(s => isToday(s.soldAt));
    return list;
  }, [sales, filter]);

  const todayQty = (sales['SNB'] || []).filter(s => isToday(s.soldAt)).reduce((a, s) => a + s.quantitySold, 0);
  const totalQty = snbSales.reduce((a, s) => a + s.quantitySold, 0);

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <History className="size-5 text-amber-600" />
          <h1 className="font-display text-2xl font-bold text-foreground">SNB History</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <ShoppingBag className="size-4 text-amber-600 mx-auto mb-1" />
            <p className="font-display text-xl font-bold tabular-nums text-amber-700">{todayQty}</p>
            <p className="text-[10px] text-amber-600 uppercase font-semibold">Today's Qty</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <ShoppingBag className="size-4 text-muted-foreground mx-auto mb-1" />
            <p className="font-display text-xl font-bold tabular-nums">{totalQty}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Showing Total</p>
          </div>
        </div>
      </div>

      <div className="mx-4 my-4 flex gap-2">
        {([{ key: 'all', label: 'All Sales' }, { key: 'today', label: 'Today' }] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-all', filter === f.key ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {snbSales.length === 0 ? (
          <EmptyState icon="🛒" message="No SNB sales found" sub="Sales will appear here once items are billed." />
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="divide-y">
              {snbSales.slice(0, 100).map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{s.itemName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.soldAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.soldBy}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-amber-600">×{s.quantitySold}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
