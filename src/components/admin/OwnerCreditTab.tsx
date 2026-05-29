// src/components/admin/OwnerCreditTab.tsx
// Owner-level Credit Overview – all 3 branches, rich visualization format

import { useEffect, useMemo, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import type { CreditSale } from '@/branch/branchStore';
import type { Branch } from '@/branch/types';
import { BRANCHES } from '@/branch/types';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import {
  IndianRupee, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Users, BarChart3,
} from 'lucide-react';

// ── Palette ───────────────────────────────────────────────────────────────────
const BRANCH_COLORS: Record<Branch, string> = {
  VRSNB: '#5BA3C9',
  SNB:   '#C5973E',
  Hosur: '#2D7D6F',
};

const STATUS_BG: Record<CreditSale['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  partial: 'bg-blue-100 text-blue-700 border-blue-200',
  settled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function SummaryCard({
  icon, label, value, sub, color, trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8"
        style={{ background: 'hsl(var(--primary))' }}
      />
      <div className="flex items-start justify-between mb-2">
        <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0', color)}>
          {icon}
        </div>
        {trend === 'up' && <TrendingUp className="size-4 text-emerald-500" />}
        {trend === 'down' && <TrendingDown className="size-4 text-red-500" />}
      </div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">
        {value}
      </p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">
        {label}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Custom label for radial bar
function RadialLabel({ cx, cy, value }: { cx?: number; cy?: number; value?: number }) {
  if (!cx || !cy || value === undefined) return null;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="text-sm font-bold fill-foreground">
      {`${value}%`}
    </text>
  );
}

// ── Branch Summary Card ───────────────────────────────────────────────────────
function BranchCreditCard({
  branch,
  sales,
}: {
  branch: Branch;
  sales: CreditSale[];
}) {
  const totalGiven = sales.reduce((a, s) => a + s.subtotal, 0);
  const totalOutstanding = sales.reduce((a, s) => a + s.creditAmount, 0);
  const totalCollected = sales.reduce((a, s) => a + s.amountPaid, 0);
  const overdue = sales.filter(
    s => s.status !== 'settled' && s.dueDate && new Date(s.dueDate) < new Date(),
  ).length;
  const collectionRate =
    totalGiven > 0 ? Math.round((totalCollected / totalGiven) * 100) : 0;

  const BRANCH_PILL: Record<Branch, string> = {
    VRSNB: 'bg-blue-50 border-blue-200 text-blue-700',
    SNB:   'bg-amber-50 border-amber-200 text-amber-700',
    Hosur: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };

  const radialData = [{ value: collectionRate, fill: BRANCH_COLORS[branch] }];

  return (
    <div className={cn('border rounded-2xl p-4', BRANCH_PILL[branch])}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold uppercase tracking-wide">{branch}</span>
        {overdue > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-semibold">
            {overdue} overdue
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Radial collection rate */}
        <div className="shrink-0">
          <ResponsiveContainer width={70} height={70}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              data={radialData}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar background dataKey="value" />
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: 12, fontWeight: 700, fill: BRANCH_COLORS[branch] }}
              >
                {collectionRate}%
              </text>
            </RadialBarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-center opacity-70 -mt-1">Collected</p>
        </div>

        {/* Figures */}
        <div className="flex-1 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="opacity-70">Total Given</span>
            <span className="font-bold tabular-nums">{formatCurrency(totalGiven)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="opacity-70">Collected</span>
            <span className="font-bold tabular-nums text-emerald-700">
              {formatCurrency(totalCollected)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="opacity-70">Outstanding</span>
            <span className="font-bold tabular-nums text-red-600">
              {formatCurrency(totalOutstanding)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="opacity-70">Customers</span>
            <span className="font-bold tabular-nums">
              {new Set(sales.map(s => s.customerName)).size}
            </span>
          </div>
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="mt-3 h-1.5 bg-white/50 rounded-full">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${collectionRate}%`,
            background: BRANCH_COLORS[branch],
          }}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OwnerCreditTab() {
  const { creditSales, fetchCreditSales } = useBranchStore();
  const [statusFilter, setStatusFilter] = useState<'all' | CreditSale['status']>('all');
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');

  useEffect(() => {
    BRANCHES.forEach(b => fetchCreditSales(b));
  }, [fetchCreditSales]);

  // All sales merged
  const allSales = useMemo(() => {
    const result: (CreditSale & { branch: Branch })[] = [];
    BRANCHES.forEach(branch => {
      (creditSales[branch] || []).forEach(s => result.push({ ...s, branch }));
    });
    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [creditSales]);

  // Grand totals
  const totalGiven       = allSales.reduce((a, s) => a + s.subtotal, 0);
  const totalCollected   = allSales.reduce((a, s) => a + s.amountPaid, 0);
  const totalOutstanding = allSales.reduce((a, s) => a + s.creditAmount, 0);
  const overdueCount     = allSales.filter(
    s => s.status !== 'settled' && s.dueDate && new Date(s.dueDate) < new Date(),
  ).length;
  const collectionRate   = totalGiven > 0 ? Math.round((totalCollected / totalGiven) * 100) : 0;

  // ── Chart data ──────────────────────────────────────────────────────────────

  // Stacked branch bar – outstanding vs collected
  const branchBarData = useMemo(() =>
    BRANCHES.map(b => {
      const bSales = (creditSales[b] || []);
      return {
        branch: b,
        outstanding: bSales.reduce((a, s) => a + s.creditAmount, 0),
        collected:   bSales.reduce((a, s) => a + s.amountPaid, 0),
      };
    }), [creditSales]);

  // Status pie
  const statusPieData = useMemo(() => {
    const counts = { Pending: 0, Partial: 0, Settled: 0 };
    allSales.forEach(s => {
      if (s.status === 'pending') counts.Pending++;
      else if (s.status === 'partial') counts.Partial++;
      else counts.Settled++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [allSales]);

  const PIE_COLORS_STATUS = ['#C5973E', '#5BA3C9', '#2D7D6F'];

  // Monthly trend – last 6 months credit given
  const trendData = useMemo(() => {
    const months: Record<string, { given: number; collected: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      months[key] = { given: 0, collected: 0 };
    }
    allSales.forEach(s => {
      const d = new Date(s.createdAt);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (months[key]) {
        months[key].given     += s.subtotal;
        months[key].collected += s.amountPaid;
      }
    });
    return Object.entries(months).map(([month, v]) => ({ month, ...v }));
  }, [allSales]);

  // Top credit customers across all branches
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; outstanding: number; branch: Branch }>();
    allSales.filter(s => s.status !== 'settled').forEach(s => {
      const ex = map.get(s.customerName);
      if (ex) ex.outstanding += s.creditAmount;
      else map.set(s.customerName, { name: s.customerName, outstanding: s.creditAmount, branch: s.branch });
    });
    return [...map.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);
  }, [allSales]);

  // Filtered list
  const filtered = useMemo(() => {
    return allSales.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (branchFilter !== 'all' && s.branch !== branchFilter) return false;
      return true;
    });
  }, [allSales, statusFilter, branchFilter]);

  return (
    <div className="space-y-5">

      {/* ── Grand KPIs ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          All Branches · Credit Overview
        </p>
        <p className="font-display text-3xl font-bold text-foreground tabular-nums">
          {formatCurrency(totalOutstanding)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Outstanding across {BRANCHES.length} branches · {allSales.length} transactions
        </p>
        {/* Collection rate bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Collection Rate</span>
            <span className="font-bold text-emerald-600">{collectionRate}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${collectionRate}%`, background: 'hsl(var(--primary))' }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={<IndianRupee className="size-4" />}
          label="Total Given"
          value={formatCurrency(totalGiven)}
          sub={`${allSales.length} customers`}
          color="bg-primary/10 text-primary"
        />
        <SummaryCard
          icon={<CheckCircle2 className="size-4" />}
          label="Collected"
          value={formatCurrency(totalCollected)}
          color="bg-emerald-50 text-emerald-700"
          trend="up"
        />
        <SummaryCard
          icon={<Clock className="size-4" />}
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          color="bg-amber-50 text-amber-700"
        />
        <SummaryCard
          icon={<AlertTriangle className="size-4" />}
          label="Overdue"
          value={String(overdueCount)}
          sub="past due date"
          color={overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}
          trend={overdueCount > 0 ? 'down' : null}
        />
      </div>

      {/* ── Per-Branch Summary Cards ─────────────────────────────────────────── */}
      <div>
        <h3 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" /> Branch Breakdown
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {BRANCHES.map(b => (
            <BranchCreditCard key={b} branch={b} sales={creditSales[b] || []} />
          ))}
        </div>
      </div>

      {/* ── Stacked Bar – outstanding vs collected per branch ────────────────── */}
      {allSales.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Branch Credit Comparison</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Outstanding vs Collected per branch</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={branchBarData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
              <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="#C5973E" />
              <Bar dataKey="collected" name="Collected" stackId="a" fill="#2D7D6F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            {[
              { label: 'Outstanding', color: '#C5973E' },
              { label: 'Collected',   color: '#2D7D6F' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-sm" style={{ background: l.color }} />
                <span className="text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Status Pie ───────────────────────────────────────────────────────── */}
      {allSales.length > 0 && statusPieData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Status Distribution</h3>
          <p className="text-[10px] text-muted-foreground mb-3">All branches · by transaction count</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={130}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={3}
                >
                  {statusPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS_STATUS[i % PIE_COLORS_STATUS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {statusPieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2.5 rounded-full"
                      style={{ background: PIE_COLORS_STATUS[i % PIE_COLORS_STATUS.length] }}
                    />
                    <span className="text-xs font-semibold">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums">{d.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-1 mt-1">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-xs font-bold">{allSales.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly Credit Trend ─────────────────────────────────────────────── */}
      {allSales.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1">Credit Trend (6 Months)</h3>
          <p className="text-[10px] text-muted-foreground mb-4">Given vs Collected by month</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="givenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#C5973E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#C5973E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2D7D6F" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2D7D6F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
              <Area
                type="monotone"
                dataKey="given"
                name="Given"
                stroke="#C5973E"
                strokeWidth={2}
                fill="url(#givenGrad)"
              />
              <Area
                type="monotone"
                dataKey="collected"
                name="Collected"
                stroke="#2D7D6F"
                strokeWidth={2}
                fill="url(#collectedGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            {[
              { label: 'Given',     color: '#C5973E' },
              { label: 'Collected', color: '#2D7D6F' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-sm" style={{ background: l.color }} />
                <span className="text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Outstanding Customers ─────────────────────────────────────────── */}
      {topCustomers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <Users className="size-4 text-primary" /> Top Outstanding Customers
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">Highest unpaid credit amounts</p>
          <div className="space-y-2">
            {topCustomers.map((c, i) => {
              const max = topCustomers[0].outstanding;
              const pct = max > 0 ? Math.round((c.outstanding / max) * 100) : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'size-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                          i === 0 ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <span
                        className="text-[10px] px-1 py-0.5 rounded font-semibold shrink-0"
                        style={{
                          background: `${BRANCH_COLORS[c.branch]}20`,
                          color: BRANCH_COLORS[c.branch],
                        }}
                      >
                        {c.branch}
                      </span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-destructive ml-2 shrink-0">
                      {formatCurrency(c.outstanding)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: BRANCH_COLORS[c.branch] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transactions List ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display text-base font-bold text-foreground">All Transactions</h3>
          <div className="flex gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border rounded-lg px-2 py-1 text-xs bg-background"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="settled">Settled</option>
            </select>
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value as Branch | 'all')}
              className="border rounded-lg px-2 py-1 text-xs bg-background"
            >
              <option value="all">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No credit sales found</p>
          </div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {filtered.map(sale => {
              const isOverdue =
                sale.status !== 'settled' &&
                sale.dueDate &&
                new Date(sale.dueDate) < new Date();
              return (
                <div
                  key={sale.id}
                  className={cn(
                    'flex items-center justify-between px-4 py-3',
                    isOverdue && 'bg-red-50/50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{sale.customerName}</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border font-semibold capitalize',
                          STATUS_BG[sale.status],
                        )}
                      >
                        {sale.status}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] text-red-600 font-semibold">⚠ Overdue</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className="text-[10px] px-1 py-0.5 rounded font-semibold"
                        style={{
                          background: `${BRANCH_COLORS[sale.branch]}20`,
                          color: BRANCH_COLORS[sale.branch],
                        }}
                      >
                        {sale.branch}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      {sale.dueDate && (
                        <span className={cn('text-[10px]', isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                          Due:{' '}
                          {new Date(sale.dueDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm font-bold tabular-nums text-destructive">
                      -{formatCurrency(sale.creditAmount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatCurrency(sale.amountPaid)} / {formatCurrency(sale.subtotal)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
