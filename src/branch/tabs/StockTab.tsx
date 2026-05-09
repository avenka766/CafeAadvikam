// src/branch/tabs/StockTab.tsx
import { useState } from 'react';
import {
  ArrowDownToLine, Package, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Scale, Hash, CheckCircle2, CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState, fmt } from '../components';
import { useBranchStore } from '../branchStore';
import type { Branch } from '../types';
import type { StockItem, IncomingStock } from '../branchStore';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatQtyLabel(qty: number, itemName: string): string {
  const unit = detectSellUnit(itemName);
  const clean = (n: number) => parseFloat(n.toFixed(3)).toString();
  if (unit === 'kg') {
    if (qty >= 1) return `${clean(qty)} kg`;
    const grams = Math.round(qty * 1000);
    return `${grams}g`;
  }
  return `${clean(qty)} pcs`;
}

function SmartStockBadge({ qty, threshold, itemName }: { qty: number; threshold: number; itemName: string }) {
  const unit = detectSellUnit(itemName);
  const low  = qty <= threshold;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
      low ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
    )}>
      {low && <AlertTriangle className="size-3 shrink-0" />}
      {unit === 'kg'
        ? <Scale className="size-3 shrink-0 opacity-60" />
        : <Hash  className="size-3 shrink-0 opacity-60" />
      }
      {formatQtyLabel(qty, itemName)}
    </span>
  );
}

// ─── Per-item confirm button ───────────────────────────────────────────────────

function ConfirmButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleClick = async () => {
    setState('loading');
    await onConfirm();
    setState('done');
  };

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="size-3.5" /> Added
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-primary px-3 py-1 rounded-full disabled:opacity-50 transition active:scale-95"
    >
      {state === 'loading'
        ? <Loader2 className="size-3.5 animate-spin" />
        : <CheckCircle2 className="size-3.5" />
      }
      Confirm
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StockTab({ branch, branchStock, branchIncoming, loading }: Props) {
  const { confirmIncoming, confirmAllIncoming } = useBranchStore();
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const availableItems  = branchStock.filter((s) => s.quantity > 0);
  const outOfStockItems = branchStock.filter((s) => s.quantity <= 0);

  // Only today's unconfirmed items — no item limit
  const today = new Date().toDateString();
  const todayIncoming = branchIncoming.filter(
    (inc) => !inc.confirmed && new Date(inc.receivedAt).toDateString() === today
  );

  const handleConfirmAll = async () => {
    setConfirmingAll(true);
    await confirmAllIncoming(branch);
    setConfirmingAll(false);
  };

  return (
    <div className="space-y-3">

      {/* ── Incoming Stock ──────────────────────────────────────────────────── */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <SectionHeader
          icon={<ArrowDownToLine className="size-4 text-emerald-600" />}
          title="Incoming Stock"
          right={
            todayIncoming.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {todayIncoming.length} pending
                </span>
                <button
                  onClick={handleConfirmAll}
                  disabled={confirmingAll}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 px-2.5 py-1 rounded-full disabled:opacity-50 transition active:scale-95"
                >
                  {confirmingAll
                    ? <Loader2 className="size-3 animate-spin" />
                    : <CheckCheck className="size-3" />
                  }
                  {confirmingAll ? 'Adding…' : 'Confirm All'}
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Today</span>
            )
          }
        />

        {todayIncoming.length === 0 ? (
          <EmptyState message="No incoming stock today. Items dispatched from Packing will appear here." />
        ) : (
          <div className="divide-y">
            {todayIncoming.map((inc) => {
              const unit = detectSellUnit(inc.itemName);
              return (
                <div key={inc.id} className="flex items-center justify-between px-4 py-3 gap-3">
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

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full tabular-nums">
                      +{formatQtyLabel(inc.quantity, inc.itemName)}
                    </span>
                    <ConfirmButton
                      onConfirm={() => confirmIncoming(branch, inc.id).then(() => {})}
                    />
                  </div>
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
