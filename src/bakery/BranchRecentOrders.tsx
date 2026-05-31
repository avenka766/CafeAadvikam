// ─── BranchRecentOrders ───────────────────────────────────────────────────────
// Shows recent stock requirements sent for a given branch.
// Used below the form in OrderReceiverDashboard.

import { ClipboardList } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import type { Branch } from './types';
import { BRANCH_COLOR, STATUS_STYLE, STATUS_LABEL } from './receiverConstants';
import { cn } from '@/lib/utils';

interface Props {
  branch: Branch;
}

export default function BranchRecentOrders({ branch }: Props) {
  const { orders } = useBakeryStore();

  const branchOrders = orders.filter(o => o.targetBranch === branch).slice(0, 20);
  if (branchOrders.length === 0) return null;

  const colors = BRANCH_COLOR[branch];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <h2 className="font-display font-bold text-sm text-foreground">
            {branch} — Recent
          </h2>
        </div>
        <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', colors.badge)}>
          {branchOrders.length}
        </span>
      </div>

      {/* Order rows */}
      <div className="divide-y divide-border/40">
        {branchOrders.map(order => (
          <div key={order.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-body font-bold text-foreground">#{order.orderNumber}</span>
                <span className={cn(
                  'text-[10px] font-body font-bold px-2 py-0.5 rounded-full border',
                  STATUS_STYLE[order.status] || STATUS_STYLE.pending,
                )}>
                  {STATUS_LABEL[order.status] || order.status}
                </span>
              </div>
              <span className="text-[10px] font-body text-muted-foreground shrink-0">
                {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {/* BUG #20 FIX: show dispatchUnit (pcs/kg) alongside quantity.
                  Previously "×5" was ambiguous — could be 5 kg or 5 pcs. */}
              {order.items.map((item, i) => (
                <span
                  key={i}
                  className="text-[10px] font-body bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                >
                  {item.itemName} ×{item.quantity}{item.dispatchUnit ? ` ${item.dispatchUnit}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
