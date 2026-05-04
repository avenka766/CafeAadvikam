// src/branch/tabs/SalesTab.tsx  ← UPDATED
import { useState } from 'react';
import { ShoppingCart, TrendingUp, CheckCircle2, Loader2, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState, fmt } from '../components';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem, SaleRecord } from '../branchStore';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  todaySalesLog: SaleRecord[];
  totalTodayQty: number;
}

export function SalesTab({ branch, branchStock, todaySalesLog, totalTodayQty }: Props) {
  const { recordSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];

  const [selectedItem, setSelectedItem] = useState('');
  const [saleQty, setSaleQty]           = useState('');
  const [saleError, setSaleError]       = useState('');
  const [saleSuccess, setSaleSuccess]   = useState('');
  const [recording, setRecording]       = useState(false);

  // Find the currently selected stock item
  const selectedStockItem = branchStock.find(s => s.itemName === selectedItem);
  const availableQty = selectedStockItem?.quantity ?? 0;
  const saleQtyNum = Number(saleQty);
  const isOverStock = selectedItem && saleQty && saleQtyNum > availableQty;

  const handleSale = async () => {
    setSaleError('');
    setSaleSuccess('');
    if (!selectedItem || !saleQty || saleQtyNum < 1) {
      setSaleError('Select an item and enter a valid quantity.');
      return;
    }
    if (isOverStock) {
      setSaleError(`Only ${availableQty} units available in stock.`);
      return;
    }
    setRecording(true);
    const err = await recordSale(
      branch, selectedItem, saleQtyNum, currentUser?.displayName || 'Staff',
    );
    setRecording(false);
    if (err) {
      setSaleError(err);
    } else {
      setSaleSuccess('Sale recorded! Stock updated.');
      setSelectedItem('');
      setSaleQty('');
      setTimeout(() => setSaleSuccess(''), 3000);
    }
  };

  const availableItems = branchStock.filter(s => s.quantity > 0);

  return (
    <div className="space-y-3">
      {/* Record Sale Form */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ShoppingCart className="size-4 text-primary" />
          Record Sale
        </h2>

        {availableItems.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground bg-muted/40 rounded-xl">
            No items in stock. Please sync or wait for a dispatch.
          </div>
        ) : (
          <>
            <select
              value={selectedItem}
              onChange={(e) => { setSelectedItem(e.target.value); setSaleError(''); setSaleQty(''); }}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background"
            >
              <option value="">Select item…</option>
              {availableItems.map((s) => (
                <option key={s.itemName} value={s.itemName}>
                  {s.itemName} — {s.quantity} in stock
                </option>
              ))}
            </select>

            {/* Stock info for selected item */}
            {selectedItem && selectedStockItem && (
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Available stock</span>
                <span className={cn(
                  'text-xs font-bold tabular-nums',
                  availableQty <= selectedStockItem.minThreshold ? 'text-red-600' : 'text-emerald-600'
                )}>
                  {availableQty} units
                  {availableQty <= selectedStockItem.minThreshold && ' ⚠ Low'}
                </span>
              </div>
            )}

            <input
              type="number" min={1} max={availableQty || undefined} value={saleQty}
              onChange={(e) => { setSaleQty(e.target.value); setSaleError(''); }}
              placeholder="Quantity sold"
              className={cn(
                'w-full border rounded-xl px-3 py-2.5 text-sm bg-background',
                isOverStock && 'border-red-400 bg-red-50'
              )}
            />
            {isOverStock && (
              <p className="text-red-600 text-xs">⚠ Qty exceeds available stock ({availableQty})</p>
            )}
          </>
        )}

        {saleError && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{saleError}</p>
        )}
        {saleSuccess && (
          <p className="text-emerald-600 text-xs bg-emerald-50 px-3 py-2 rounded-lg flex items-center gap-1">
            <CheckCircle2 className="size-3" />{saleSuccess}
          </p>
        )}
        <button
          onClick={handleSale} disabled={recording || !selectedItem || !saleQty || !!isOverStock}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {recording && <Loader2 className="size-4 animate-spin" />}
          Record Sale
        </button>
        <p className="text-[10px] text-center text-muted-foreground">
          Stock is automatically deducted and sale is sent to Admin.
        </p>
      </div>

      {/* Today's Sales Log */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <SectionHeader
          icon={<TrendingUp className="size-4 text-primary" />}
          title="Today's Sales Log"
          right={
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', colors.badge)}>
              {totalTodayQty} units
            </span>
          }
        />
        {todaySalesLog.length === 0 ? (
          <EmptyState message="No sales today." />
        ) : (
          <div className="divide-y">
            {todaySalesLog.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{s.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(s.soldAt)} · {s.soldBy}
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
