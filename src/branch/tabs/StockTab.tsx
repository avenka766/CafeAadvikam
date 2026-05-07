// src/branch/tabs/StockTab.tsx
import { useState } from 'react';
import { ArrowDownToLine, Package, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockBadge, SectionHeader, EmptyState, fmt } from '../components';
import type { Branch } from '../types';
import type { StockItem, IncomingStock } from '../branchStore';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
  loading: boolean;
}

export function StockTab({ branch, branchStock, branchIncoming, loading }: Props) {
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);

  const availableItems  = branchStock.filter((s) => s.quantity > 0);
  const outOfStockItems = branchStock.filter((s) => s.quantity <= 0);

  return (
    <div className="space-y-3">

      {/* Incoming Stock */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <SectionHeader
          icon={<ArrowDownToLine className="size-4 text-emerald-600" />}
          title="Incoming Stock"
          right={<span className="text-xs text-muted-foreground">Last 10</span>}
        />
        {branchIncoming.length === 0 ? (
          <EmptyState message="No incoming stock. Sync from Packing." />
        ) : (
          <div className="divide-y">
            {branchIncoming.slice(0, 10).map((inc) => (
              <div key={inc.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{inc.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(inc.receivedAt)} · {inc.dispatchedBy}
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  +{inc.quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Stock — only items with qty > 0 */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <SectionHeader
          icon={<Package className="size-4 text-primary" />}
          title="Available Stock"
          right={
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {availableItems.length} items
            </span>
          }
        />
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : availableItems.length === 0 ? (
          <EmptyState message="No items currently in stock." />
        ) : (
          <div className="divide-y">
            {availableItems.map((s) => (
              <div
                key={s.itemName}
                className={cn(
                  'flex items-center justify-between px-4 py-3',
                  s.quantity <= s.minThreshold && 'bg-amber-50/60',
                )}
              >
                <div className="flex items-center gap-2">
                  {s.quantity <= s.minThreshold && (
                    <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{s.itemName}</p>
                    <p className="text-xs text-muted-foreground">Min: {s.minThreshold}</p>
                  </div>
                </div>
                <StockBadge qty={s.quantity} threshold={s.minThreshold} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Out of Stock — collapsible section */}
      {outOfStockItems.length > 0 && (
        <div className="bg-card border border-red-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setOutOfStockExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-50/50 hover:bg-red-50 transition"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-500" />
              <span className="text-sm font-semibold text-red-700">Out of Stock</span>
              <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                {outOfStockItems.length}
              </span>
            </div>
            {outOfStockExpanded
              ? <ChevronUp   className="size-4 text-red-400" />
              : <ChevronDown className="size-4 text-red-400" />
            }
          </button>

          {outOfStockExpanded && (
            <div className="divide-y divide-red-50">
              {outOfStockItems.map((s) => (
                <div key={s.itemName} className="flex items-center justify-between px-4 py-2.5 bg-white">
                  <p className="text-sm text-muted-foreground">{s.itemName}</p>
                  <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                    0 units
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
