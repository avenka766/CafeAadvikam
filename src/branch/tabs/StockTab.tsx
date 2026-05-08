// src/branch/tabs/StockTab.tsx
import { useState } from 'react';
import { ArrowDownToLine, Package, AlertTriangle, Loader2, ChevronDown, ChevronUp, Scale, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState, fmt } from '../components';
import type { Branch } from '../types';
import type { StockItem, IncomingStock } from '../branchStore';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detect if an item is sold by weight (kg) vs pieces */
function detectSellUnit(itemName: string): 'kg' | 'pcs' {
  const lower = itemName.toLowerCase();
  const weightKeywords = [
    'mysore pak', 'burfi', 'halwa', 'laadu', 'ladoo', 'chikki', 'mixture',
    'muruk', 'murukku', 'boondhi', 'pakoda', 'chips', 'cashew', 'groundnut',
    'biscuit', 'cookie', 'soan papdi', 'chana dal', 'mix dal', 'nippat',
    'kachori', 'samosa', 'oppat', 'jelabi', 'jangiri', 'badusha',
  ];
  return weightKeywords.some((kw) => lower.includes(kw)) ? 'kg' : 'pcs';
}

/** Format a quantity with proper unit label — handles decimals for kg items */
function formatQtyLabel(qty: number, itemName: string): string {
  const unit = detectSellUnit(itemName);
  if (unit === 'kg') {
    if (qty >= 1) return `${qty % 1 === 0 ? qty : qty.toFixed(2)} kg`;
    const grams = Math.round(qty * 1000);
    return `${grams}g`;
  }
  return `${qty % 1 === 0 ? qty : qty.toFixed(2)} pcs`;
}

/** Format incoming delta with a + prefix */
function formatIncomingQty(qty: number, itemName: string): string {
  return `+${formatQtyLabel(qty, itemName)}`;
}

// ─── StockBadge (replaces shared one for this tab to support kg/pcs) ──────────

function SmartStockBadge({ qty, threshold, itemName }: { qty: number; threshold: number; itemName: string }) {
  const unit = detectSellUnit(itemName);
  const low  = qty <= threshold;
  const label = formatQtyLabel(qty, itemName);

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
      low ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
    )}>
      {low && <AlertTriangle className="size-3 shrink-0" />}
      {unit === 'kg' ? <Scale className="size-3 shrink-0 opacity-60" /> : <Hash className="size-3 shrink-0 opacity-60" />}
      {label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StockTab({ branch, branchStock, branchIncoming, loading }: Props) {
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);

  const availableItems  = branchStock.filter((s) => s.quantity > 0);
  const outOfStockItems = branchStock.filter((s) => s.quantity <= 0);

  return (
    <div className="space-y-3">

      {/* ── Incoming Stock ──────────────────────────────────────────────────── */}
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
            {branchIncoming.slice(0, 10).map((inc) => {
              const unit = detectSellUnit(inc.itemName);
              return (
                <div key={inc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {unit === 'kg'
                      ? <Scale className="size-3.5 text-muted-foreground shrink-0" />
                      : <Hash  className="size-3.5 text-muted-foreground shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{inc.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(inc.receivedAt)} · {inc.dispatchedBy}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full ml-3 shrink-0 tabular-nums">
                    {formatIncomingQty(inc.quantity, inc.itemName)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Available Stock ─────────────────────────────────────────────────── */}
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
                    <p className="text-xs text-muted-foreground">
                      Min: {formatQtyLabel(s.minThreshold, s.itemName)}
                    </p>
                  </div>
                </div>
                <SmartStockBadge qty={s.quantity} threshold={s.minThreshold} itemName={s.itemName} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Out of Stock — collapsible ──────────────────────────────────────── */}
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
                    Out of stock
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
