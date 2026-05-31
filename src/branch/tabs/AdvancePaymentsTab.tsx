// src/branch/tabs/AdvancePaymentsTab.tsx
// Dedicated tab: shows all advance orders (pending + completed) with full payment breakdown
import { useMemo, useState } from 'react';
import {
  Wallet, Clock, CheckCircle2, Search, X, Calendar, ChevronRight,
  ChevronDown, IndianRupee, Banknote, Smartphone, CreditCard, AlertCircle, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState } from '../components';
import type { BranchAdvanceOrder } from '../branchStore';
import type { Branch } from '../types';

interface Props {
  branch: Branch;
  advanceOrders: BranchAdvanceOrder[];
}

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="size-3" />,
  upi:  <Smartphone className="size-3" />,
  card: <CreditCard className="size-3" />,
};

function methodIcon(method: string) {
  const lower = method.toLowerCase();
  if (lower.includes('cash')) return METHOD_ICONS.cash;
  if (lower.includes('upi'))  return METHOD_ICONS.upi;
  if (lower.includes('card')) return METHOD_ICONS.card;
  return <IndianRupee className="size-3" />;
}

function toLocalDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toLocalTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function toLocalDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdvancePaymentsTab({ branch, advanceOrders }: Props) {
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return advanceOrders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (dateFilter && toLocalDateKey(o.createdAt) !== dateFilter) return false;
      if (q) {
        const haystack = [
          o.customerName ?? '',
          o.soldBy,
          ...o.items.map(i => i.itemName),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [advanceOrders, statusFilter, dateFilter, search]);

  // ── Aggregations ────────────────────────────────────────────────────────────
  const pending   = advanceOrders.filter(o => o.status === 'pending');
  const completed = advanceOrders.filter(o => o.status === 'completed');

  const totalAdvanceCollected = advanceOrders.reduce((s, o) => s + o.advanceAmount, 0);
  const totalBalanceCollected = completed.reduce((s, o) => {
    const balancePaid = o.subtotal - o.advanceAmount;
    return s + Math.max(0, balancePaid);
  }, 0);
  const totalOutstanding = pending.reduce((s, o) => s + o.balanceDue, 0);
  const totalOrderValue  = advanceOrders.reduce((s, o) => s + o.subtotal, 0);

  // Full-pay orders (advance == total, no balance due)
  const fullPayCount = advanceOrders.filter(o => o.balanceDue <= 0).length;

  return (
    <div className="space-y-4 pb-6">
      {/* ── Summary KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Pending Orders</p>
          <p className="font-display text-2xl font-bold text-amber-800 tabular-nums">{pending.length}</p>
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Balance due: {fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Completed</p>
          <p className="font-display text-2xl font-bold text-emerald-800 tabular-nums">{completed.length}</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">{fullPayCount} fully pre-paid</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Advance Collected</p>
          <p className="font-display text-xl font-bold text-blue-800 tabular-nums">{fmt(totalAdvanceCollected)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Total Order Value</p>
          <p className="font-display text-xl font-bold text-purple-800 tabular-nums">{fmt(totalOrderValue)}</p>
        </div>
      </div>

      {/* ── Full Payment Summary Banner ─────────────────────────────────── */}
      {totalAdvanceCollected > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Payment Collection Summary</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-amber-700">Advance collected (upfront)</span>
              <span className="text-sm font-bold text-amber-800 tabular-nums">{fmt(totalAdvanceCollected)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-emerald-700">Balance collected (on delivery)</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(totalBalanceCollected)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-amber-200">
              <span className="text-sm font-bold text-foreground">Total received</span>
              <span className="text-base font-bold text-primary tabular-nums">
                {fmt(totalAdvanceCollected + totalBalanceCollected)}
              </span>
            </div>
            {totalOutstanding > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                  <AlertCircle className="size-3" /> Still outstanding
                </span>
                <span className="text-sm font-bold text-red-600 tabular-nums">{fmt(totalOutstanding)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filter Orders</span>
        </div>
        <div className="p-3 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customer or item…"
              className="w-full pl-8 pr-8 py-2 rounded-xl bg-muted border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {/* Status + date */}
          <div className="flex gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-muted flex-1">
              {(['all', 'pending', 'completed'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize transition',
                    statusFilter === s ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
                  {s}
                </button>
              ))}
            </div>
            <input
              type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="px-2 py-1.5 rounded-xl border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            {dateFilter && (
              <button onClick={() => setDateFilter('')}
                className="px-2 rounded-xl border bg-muted text-muted-foreground text-xs">All</button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            {filtered.length} of {advanceOrders.length} orders
          </p>
        </div>
      </div>

      {/* ── Orders list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState message="No advance orders match your filters." />
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const isExpanded = expanded === order.id;
            const isCompleted = order.status === 'completed';
            const isFullPay = order.balanceDue <= 0;
            const balancePaid = isCompleted && !isFullPay
              ? order.subtotal - order.advanceAmount
              : 0;

            return (
              <div key={order.id}
                className={cn('bg-card rounded-2xl border-2 overflow-hidden shadow-sm',
                  isCompleted ? 'border-emerald-200' : 'border-amber-300')}>

                {/* Card header */}
                <div className={cn('px-4 py-3 flex items-center justify-between',
                  isCompleted ? 'bg-emerald-50' : 'bg-amber-50')}>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit',
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-amber-100 text-amber-700 border-amber-300')}>
                        {isCompleted ? (isFullPay ? '✓ Fully Pre-Paid' : '✓ Completed') : '⏳ Pending Balance'}
                      </span>
                      {order.customerName && (
                        <span className="text-sm font-bold text-foreground truncate">{order.customerName}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      {toLocalDate(order.createdAt)} {toLocalTime(order.createdAt)} · {order.soldBy}
                    </span>
                    {order.deliveryDate && (
                      <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                        <Calendar className="size-3" />
                        Delivery: {new Date(order.deliveryDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setExpanded(isExpanded ? null : order.id)}
                    className={cn('size-8 rounded-lg flex items-center justify-center ml-2 shrink-0',
                      isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                </div>

                {/* Items (collapsible) */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-1 border-b border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Ordered Items</p>
                    {order.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-foreground flex items-center gap-1">
                          {item.isCustom && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">CUSTOM</span>
                          )}
                          {item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}
                        </span>
                        <span className="font-bold text-primary tabular-nums">
                          {fmt(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment breakdown — always visible */}
                <div className="px-4 py-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Bill</span>
                    <span className="text-sm font-bold tabular-nums">{fmt(order.subtotal)}</span>
                  </div>
                  {/* Advance payment row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-700 flex items-center gap-1.5 font-semibold">
                      {methodIcon(order.advanceMethod)}
                      Advance ({order.advanceMethod.toUpperCase()})
                    </span>
                    <span className="text-sm font-bold text-amber-700 tabular-nums">−{fmt(order.advanceAmount)}</span>
                  </div>

                  {/* Full-pay: no balance row needed */}
                  {isFullPay ? (
                    <div className="flex items-center justify-between pt-1 border-t border-emerald-200">
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> Fully Paid (No Balance Due)
                      </span>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(order.subtotal)}</span>
                    </div>
                  ) : isCompleted ? (
                    // Completed with balance payment
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-700 flex items-center gap-1.5 font-semibold">
                          {methodIcon(order.balanceMethod ?? 'cash')}
                          Balance ({(order.balanceMethod ?? 'cash').toUpperCase()})
                        </span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">−{fmt(balancePaid)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-200">
                        <span className="text-xs font-bold text-emerald-700">Fully Settled ✓</span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(order.subtotal)}</span>
                      </div>
                    </>
                  ) : (
                    // Pending — show outstanding
                    <div className="flex items-center justify-between pt-1 border-t border-red-100">
                      <span className="text-sm font-bold text-red-600">Balance Due</span>
                      <span className="text-lg font-display font-bold text-red-600 tabular-nums">
                        {fmt(order.balanceDue)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
