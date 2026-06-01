// src/components/admin/AdminAdvanceTab.tsx
// Admin-level view: advance orders across branches, with full payment tracking
import { useMemo, useEffect, useState } from 'react';
import {
  Wallet, Clock, CheckCircle2, ChevronRight, ChevronDown,
  IndianRupee, AlertCircle, Calendar, Filter, Search, X, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/branch/branchStore';
import type { Branch } from '@/branch/types';
import type { BranchAdvanceOrder } from '@/branch/branchStore';

interface Props {
  branches: Branch[];
}

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toLocalTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function toLocalDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const BRANCH_BADGE: Record<Branch, string> = {
  Cafe:  'bg-emerald-100 text-emerald-700',
  VRSNB: 'bg-amber-100 text-amber-800',
  SNB:   'bg-blue-100 text-blue-700',
  Hosur: 'bg-purple-100 text-purple-700',
};

export default function AdminAdvanceTab({ branches }: Props) {
  const { advanceOrders, fetchBranchData } = useBranchStore();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');
  const [dateFilter, setDateFilter]     = useState('');
  const [search, setSearch]             = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);

  useEffect(() => {
    branches.forEach(b => fetchBranchData(b));
  }, []);

  // Merge all advance orders across branches
  const allOrders = useMemo((): Array<BranchAdvanceOrder & { branch: Branch }> => {
    const result: Array<BranchAdvanceOrder & { branch: Branch }> = [];
    branches.forEach(b => {
      (advanceOrders[b] || []).forEach(o => result.push({ ...o, branch: b }));
    });
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [advanceOrders, branches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allOrders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (branchFilter !== 'all' && o.branch !== branchFilter) return false;
      if (dateFilter && toLocalDateKey(o.createdAt) !== dateFilter) return false;
      if (q) {
        const hay = [o.customerName ?? '', o.soldBy, ...o.items.map(i => i.itemName)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allOrders, statusFilter, branchFilter, dateFilter, search]);

  // ── Summary numbers ─────────────────────────────────────────────────────────
  const pending   = allOrders.filter(o => o.status === 'pending');
  const completed = allOrders.filter(o => o.status === 'completed');
  const totalAdvance     = allOrders.reduce((s, o) => s + o.advanceAmount, 0);
  const totalOutstanding = pending.reduce((s, o) => s + o.balanceDue, 0);
  const totalOrderValue  = allOrders.reduce((s, o) => s + o.subtotal, 0);
  const fullPayCount     = allOrders.filter(o => o.balanceDue <= 0).length;

  // Per-branch summary
  const branchSummary = useMemo(() => branches.map(b => {
    const bOrders = allOrders.filter(o => o.branch === b);
    return {
      branch: b,
      total: bOrders.length,
      pending: bOrders.filter(o => o.status === 'pending').length,
      outstanding: bOrders.filter(o => o.status === 'pending').reduce((s, o) => s + o.balanceDue, 0),
      advance: bOrders.reduce((s, o) => s + o.advanceAmount, 0),
    };
  }), [allOrders, branches]);

  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map((o, i) => ({
      'S.No':           i + 1,
      'Branch':         o.branch,
      'Customer':       o.customerName ?? '-',
      'Status':         o.status === 'completed' ? (o.balanceDue <= 0 ? 'Pre-Paid' : 'Settled') : 'Balance Pending',
      'Order Date':     toLocalDate(o.createdAt),
      'Order Time':     toLocalTime(o.createdAt),
      'Delivery Date':  o.deliveryDate ? new Date(o.deliveryDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      'Items':          o.items.map(it => `${it.itemName} ×${it.quantity}`).join(', '),
      'Total Bill (₹)': o.subtotal,
      'Advance Paid (₹)': o.advanceAmount,
      'Advance Method': o.advanceMethod.toUpperCase(),
      'Balance Due (₹)': o.balanceDue > 0 ? o.balanceDue : 0,
      'Balance Method': o.balanceMethod?.toUpperCase() ?? '-',
      'Sold By':        o.soldBy,
    }));
    const wb = XLSX.utils.book_new();
    const ws = rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.json_to_sheet([{ Note: 'No advance orders match selected filters' }]);
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k as keyof typeof r] ?? '').length)) + 2 }));
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Advance Orders');
    XLSX.writeFile(wb, `AdvanceOrders_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-6">
      {/* ── Cross-branch summary ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Pending Orders</p>
          <p className="font-display text-2xl font-bold text-amber-800 tabular-nums">{pending.length}</p>
          <p className="text-[10px] text-red-600 font-semibold">Outstanding: {fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Completed</p>
          <p className="font-display text-2xl font-bold text-emerald-800 tabular-nums">{completed.length}</p>
          <p className="text-[10px] text-emerald-600 font-semibold">{fullPayCount} pre-paid in full</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Advance Collected</p>
          <p className="font-display text-xl font-bold text-blue-800 tabular-nums">{fmt(totalAdvance)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Total Order Value</p>
          <p className="font-display text-xl font-bold text-purple-800 tabular-nums">{fmt(totalOrderValue)}</p>
        </div>
      </div>

      {/* ── Per-branch breakdown ────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40">
          <p className="text-sm font-bold">Branch Breakdown</p>
        </div>
        <div className="divide-y">
          {branchSummary.map(b => (
            <div key={b.branch} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', BRANCH_BADGE[b.branch])}>
                  {b.branch}
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {b.total} orders · {b.pending} pending
                </p>
              </div>
              <div className="text-right">
                {b.outstanding > 0 && (
                  <p className="text-xs font-bold text-red-600">{fmt(b.outstanding)} due</p>
                )}
                <p className="text-xs text-muted-foreground">{fmt(b.advance)} advance</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Outstanding alert banner ─────────────────────────────────────── */}
      {totalOutstanding > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Outstanding Balance Alert</p>
            <p className="text-xs text-red-600 mt-0.5">
              {fmt(totalOutstanding)} is pending collection across {pending.length} advance order{pending.length !== 1 ? 's' : ''}.
            </p>
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filter</span>
          <div className="flex-1" />
          <button onClick={handleDownload} className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted">
            <Download className="size-3" />Excel
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, item or staff…"
            className="w-full pl-8 pr-8 py-2 rounded-xl bg-muted border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5 text-muted-foreground" /></button>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Status filter */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted flex-1 min-w-[160px]">
            {(['all', 'pending', 'completed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize transition',
                  statusFilter === s ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
                {s}
              </button>
            ))}
          </div>
          {/* Branch filter */}
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as Branch | 'all')}
            className="px-3 py-1.5 rounded-xl border bg-card text-sm">
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {/* Date filter */}
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="px-2 py-1.5 rounded-xl border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="px-2 rounded-xl border bg-muted text-muted-foreground text-xs">All dates</button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground px-1">{filtered.length} of {allOrders.length} orders</p>
      </div>

      {/* ── Orders list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
          <Wallet className="size-8 opacity-20" />
          <p className="text-sm">No advance orders match filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const isExpanded  = expanded === order.id;
            const isCompleted = order.status === 'completed';
            const isFullPay   = order.balanceDue <= 0;

            return (
              <div key={order.id}
                className={cn('bg-card rounded-2xl border-2 overflow-hidden shadow-sm',
                  isCompleted ? 'border-emerald-200' : 'border-amber-300')}>

                {/* Header */}
                <div className={cn('px-4 py-3 flex items-center justify-between',
                  isCompleted ? 'bg-emerald-50' : 'bg-amber-50')}>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                        BRANCH_BADGE[order.branch])}>
                        {order.branch}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-amber-100 text-amber-700 border-amber-300')}>
                        {isCompleted ? (isFullPay ? '✓ Pre-Paid' : '✓ Settled') : '⏳ Balance Pending'}
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

                {/* Items */}
                {isExpanded && (
                  <div className="px-4 py-3 border-b border-border/50 space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Ordered Items</p>
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground flex items-center gap-1">
                          {item.isCustom && <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-700">CUSTOM</span>}
                          {item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}
                        </span>
                        <span className="font-bold text-primary tabular-nums">{fmt(item.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment summary */}
                <div className="px-4 py-3 space-y-1.5 bg-muted/20">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Total Bill</span>
                    <span className="font-bold text-foreground">{fmt(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-700 font-semibold">Advance ({order.advanceMethod.toUpperCase()})</span>
                    <span className="font-bold text-amber-700">−{fmt(order.advanceAmount)}</span>
                  </div>
                  {isFullPay ? (
                    <div className="flex justify-between text-xs pt-1 border-t border-emerald-200">
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> Fully Pre-Paid
                      </span>
                      <span className="font-bold text-emerald-700">{fmt(order.subtotal)}</span>
                    </div>
                  ) : isCompleted ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-700 font-semibold">
                          Balance ({(order.balanceMethod ?? 'cash').toUpperCase()})
                        </span>
                        <span className="font-bold text-emerald-700">
                          −{fmt(order.subtotal - order.advanceAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-emerald-200">
                        <span className="font-bold text-emerald-700">Fully Settled ✓</span>
                        <span className="font-bold text-emerald-700">{fmt(order.subtotal)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between pt-1 border-t border-red-100">
                      <span className="text-sm font-bold text-red-600">Balance Due</span>
                      <span className="text-base font-display font-bold text-red-600 tabular-nums">
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
