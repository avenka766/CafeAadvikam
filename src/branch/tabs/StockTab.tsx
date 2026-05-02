// src/branch/tabs/StockTab.tsx  ← NEW FILE
import { ArrowDownToLine, Package, AlertTriangle, Loader2 } from 'lucide-react';
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
  return (
    <div className="space-y-3">
      {/* Incoming */}
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

      {/* Stock table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <SectionHeader
          icon={<Package className="size-4 text-primary" />}
          title="Available Stock"
        />
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : branchStock.length === 0 ? (
          <EmptyState message="No stock data. Sync from Packing." />
        ) : (
          <div className="divide-y">
            {branchStock.map((s) => (
              <div
                key={s.itemName}
                className={cn(
                  'flex items-center justify-between px-4 py-3',
                  s.quantity <= s.minThreshold && 'bg-red-50',
                )}
              >
                <div className="flex items-center gap-2">
                  {s.quantity <= s.minThreshold && (
                    <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
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
    </div>
  );
}
