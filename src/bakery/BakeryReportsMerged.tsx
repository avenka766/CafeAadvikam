// src/bakery/BakeryReportsMerged.tsx
// Unified Bakery Reports – replaces separate Sales + Reports tabs.
// Used by AdminDashboard (branch='all'), AdminVRSNBDashboard (branch='VRSNB'),
// and AdminSNBDashboard (branch='SNB').

import { useMemo, useEffect, useState } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import type { CreditSale } from '@/branch/branchStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Branch } from '@/branch/types';
import { BRANCHES } from '@/branch/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  Download, Filter, TrendingUp, Package,
  IndianRupee, ShoppingCart, BarChart3, PieChart as PieIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCH_COLORS: Record<Branch, string> = {
  VRSNB: '#5BA3C9',
  SNB:   '#C5973E',
  Hosur: '#2D7D6F',
};

const BRANCH_PILL: Record<Branch, string> = {
  VRSNB: 'bg-blue-100 text-blue-700',
  SNB:   'bg-amber-100 text-amber-700',
  Hosur: 'bg-emerald-100 text-emerald-700',
};

const ITEM_COLORS = [
  '#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B',
  '#8B5CF6', '#EC4899', '#10B981', '#F59E0B',
];

// ─── Item Frequency Chart ─────────────────────────────────────────────────────

function ItemFrequencyChart({ orders, dateFrom, dateTo }: {
  orders: { itemName: string; soldAt: string }[];
  dateFrom: string;
  dateTo: string;
}) {
  const data = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(dateTo);   to.setHours(23, 59, 59, 999);
    const freq = new Map<string, number>();
    for (const s of orders) {
      const t = new Date(s.soldAt).getTime();
      if (t < from.getTime() || t > to.getTime()) continue;
      freq.set(s.itemName, (freq.get(s.itemName) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count }));
  }, [orders, dateFrom, dateTo]);

  if (data.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-muted-foreground" />
        <p className="text-sm font-body font-bold text-foreground">Item Order Frequency</p>
        <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Top 15</span>
      </div>
      <p className="text-xs font-body text-muted-foreground">How many times each item was ordered in the selected period</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [`${v} orders`, 'Frequency']}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
            {data.map((_, i) => <Cell key={i} fill={ITEM_COLORS[i % ITEM_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Order Time Heatmap ───────────────────────────────────────────────────────

const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];

function OrderTimeHeatmap({ orders, dateFrom, dateTo }: {
  orders: { soldAt: string }[];
  dateFrom: string;
  dateTo: string;
}) {
  const data = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(dateTo);   to.setHours(23, 59, 59, 999);
    const counts = new Array(24).fill(0);
    for (const s of orders) {
      const t = new Date(s.soldAt);
      if (t.getTime() < from.getTime() || t.getTime() > to.getTime()) continue;
      counts[t.getHours()]++;
    }
    const max = Math.max(...counts, 1);
    return counts.map((count, hour) => ({ hour, label: HOUR_LABELS[hour], count, intensity: count / max }));
  }, [orders, dateFrom, dateTo]);

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;
  const peakHour = data.reduce((best, d) => d.count > best.count ? d : best, data[0]);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-muted-foreground" />
        <p className="text-sm font-body font-bold text-foreground">Order Activity by Hour</p>
      </div>
      <p className="text-xs font-body text-muted-foreground">
        Peak hour: <strong>{peakHour.label}</strong> ({peakHour.count} orders) · Total: {total} orders
      </p>
      <div className="grid grid-cols-12 gap-1">
        {data.map(d => (
          <div key={d.hour} className="flex flex-col items-center gap-1">
            <div
              className="w-full rounded-md"
              style={{
                height: 32,
                background: d.count === 0
                  ? 'hsl(var(--muted))'
                  : `rgba(45, 125, 111, ${0.15 + d.intensity * 0.85})`,
              }}
              title={`${d.label}: ${d.count} orders`}
            />
            <span className="text-[8px] font-body text-muted-foreground leading-none">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] font-body text-muted-foreground">
        <span>Low</span>
        <div className="flex gap-0.5 flex-1">
          {[0.15, 0.35, 0.55, 0.75, 1].map(o => (
            <div key={o} className="flex-1 h-2 rounded-sm" style={{ background: `rgba(45, 125, 111, ${o})` }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { branch: 'VRSNB' | 'SNB' | 'all'; }

type QuickRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(quick: QuickRange): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (quick === 'today') { const s = fmt(today); return { from: s, to: s }; }
  if (quick === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const s = fmt(y); return { from: s, to: s };
  }
  if (quick === '7d') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { from: fmt(s), to: fmt(today) };
  }
  if (quick === '30d') {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { from: fmt(s), to: fmt(today) };
  }
  return { from: fmt(today), to: fmt(today) };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={cn('border rounded-xl p-3', color)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-70">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BakeryReportsMerged({ branch }: Props) {
  const { sales, creditSales, fetchBranchData, fetchCreditSales } = useBranchStore();

  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo]     = useState(() => new Date().toISOString().split('T')[0]);
  const [filterItem, setFilterItem]     = useState('');
  const [filterBranch, setFilterBranch] = useState<Branch | 'all'>('all');

  // Fetch branch data on mount
  useEffect(() => {
    if (branch === 'all') {
      BRANCHES.forEach(b => { fetchBranchData(b); fetchCreditSales(b); });
    } else {
      fetchBranchData(branch as Branch);
      fetchCreditSales(branch as Branch);
    }
  }, [fetchBranchData, fetchCreditSales, branch]);

  // BUG #23 FIX: reset filterBranch when branch prop changes to avoid stale filter state.
  // If user viewed 'all' branches (with filterBranch=VRSNB set), then switched to a
  // specific branch view, filterBranch would still be 'VRSNB' but never applied
  // (condition requires branch==='all') — state is inconsistent.
  useEffect(() => {
    setFilterBranch('all');
  }, [branch]);

  // Sync date inputs when quick range changes
  useEffect(() => {
    if (quickRange !== 'custom') {
      const r = getDateRange(quickRange);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  }, [quickRange]);

  // ── All sales for this branch scope ───────────────────────────────────────
  const allSales = useMemo(() => {
    const branches: Branch[] = branch === 'all' ? BRANCHES : [branch as Branch];
    const result: Array<{
      id: string; branch: Branch; itemName: string;
      quantitySold: number; soldAt: string; soldBy: string; unitPrice: number;
      paymentMethod?: string;
    }> = [];
    branches.forEach(b => {
      (sales[b] || []).forEach(s => result.push({
        ...s, branch: b,
        unitPrice: (s as typeof s & { unitPrice?: number }).unitPrice ?? 0,
        paymentMethod: (s as typeof s & { paymentMethod?: string }).paymentMethod ?? '',
      }));
    });
    return result.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales, branch]);

  // ── All credit sales for this branch scope ──────────────────────────────
  const allCreditSales = useMemo(() => {
    const branches: Branch[] = branch === 'all' ? BRANCHES : [branch as Branch];
    const result: CreditSale[] = [];
    branches.forEach(b => {
      (creditSales[b] || []).forEach(cs => result.push({ ...cs, branch: b }));
    });
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [creditSales, branch]);

  // ── Filtered credit sales ─────────────────────────────────────────────────
  const filteredCredit = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(dateTo);   to.setHours(23, 59, 59, 999);
    return allCreditSales.filter(cs => {
      const t = new Date(cs.createdAt).getTime();
      if (t < from.getTime() || t > to.getTime()) return false;
      if (branch === 'all' && filterBranch !== 'all' && cs.branch !== filterBranch) return false;
      return true;
    });
  }, [allCreditSales, dateFrom, dateTo, filterBranch, branch]);

  // Credit KPIs
  const totalCreditBilled      = filteredCredit.reduce((a, cs) => a + cs.subtotal, 0);
  const totalCreditCollected   = filteredCredit.reduce((a, cs) => a + cs.amountPaid, 0);
  const totalCreditOutstanding = filteredCredit.reduce((a, cs) => a + cs.creditAmount, 0);

  // ── Filtered sales ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(dateTo);   to.setHours(23, 59, 59, 999);
    return allSales.filter(s => {
      const t = new Date(s.soldAt).getTime();
      if (t < from.getTime() || t > to.getTime()) return false;
      // Exclude credit_collection rows — they are receipts, not sales (avoid double-count)
      if ((s.paymentMethod ?? '') === 'credit_collection') return false;
      if (filterItem && s.itemName !== filterItem) return false;
      if (branch === 'all' && filterBranch !== 'all' && s.branch !== filterBranch) return false;
      return true;
    });
  }, [allSales, dateFrom, dateTo, filterItem, filterBranch, branch]);

  // ── Aggregations ──────────────────────────────────────────────────────────
  const totalRevenue = filtered.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0);
  const totalQty     = filtered.reduce((a, s) => a + s.quantitySold, 0);
  const avgPerTx     = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;

  // Payment method breakdown — for cash/UPI/card/credit KPI split
  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = { cash: 0, upi: 0, card: 0, credit: 0, other: 0 };
    filtered.forEach(s => {
      const pm = (s.paymentMethod ?? '').toLowerCase();
      const rev = s.unitPrice * s.quantitySold;
      if (pm === 'cash') breakdown.cash += rev;
      else if (pm === 'upi') breakdown.upi += rev;
      else if (pm === 'card') breakdown.card += rev;
      else if (pm === 'credit') breakdown.credit += rev;
      else if (pm !== 'credit_collection') breakdown.other += rev; // exclude collections
    });
    return breakdown;
  }, [filtered]);

  const allItems = useMemo(() =>
    [...new Set(allSales.map(s => s.itemName))].sort(),
    [allSales]);

  // Item-wise
  const itemReport = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filtered.forEach(s => {
      const ex  = map.get(s.itemName);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.itemName, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filtered]);

  // Branch-wise (admin only)
  const branchReport = useMemo(() => {
    if (branch !== 'all') return [] as [Branch, { qty: number; revenue: number }][];
    const map = new Map<Branch, { qty: number; revenue: number }>();
    filtered.forEach(s => {
      const ex  = map.get(s.branch);
      const rev = s.unitPrice * s.quantitySold;
      if (ex) { ex.qty += s.quantitySold; ex.revenue += rev; }
      else map.set(s.branch, { qty: s.quantitySold, revenue: rev });
    });
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue) as [Branch, { qty: number; revenue: number }][];
  }, [filtered, branch]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const dayCount = Math.max(1,
      Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1
    );
    if (dayCount > 60) return [];
    return Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(dateFrom); d.setDate(d.getDate() + i);
      const ds = d.toDateString();
      const day = filtered.filter(s => new Date(s.soldAt).toDateString() === ds);
      return {
        date:    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        revenue: day.reduce((a, s) => a + s.unitPrice * s.quantitySold, 0),
        qty:     day.reduce((a, s) => a + s.quantitySold, 0),
        txns:    day.length,
      };
    });
  }, [filtered, dateFrom, dateTo]);

  // Top items for horizontal bar chart (top 8)
  const chartItems = useMemo(() =>
    itemReport.slice(0, 8).map(([item, v]) => ({
      name:    item.length > 18 ? item.slice(0, 18) + '…' : item,
      revenue: v.revenue,
      qty:     v.qty,
    })),
    [itemReport]);

  // Top items for pie chart (top 6 + others)
  const pieData = useMemo(() => {
    if (itemReport.length === 0) return [];
    const top  = itemReport.slice(0, 6);
    const rest = itemReport.slice(6).reduce((a, [, v]) => a + v.revenue, 0);
    const data = top.map(([name, v]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, value: v.revenue }));
    if (rest > 0) data.push({ name: 'Others', value: rest });
    return data;
  }, [itemReport]);

  const rangeLabel = dateFrom === dateTo
    ? new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  // ── Excel Export ──────────────────────────────────────────────────────────
  const handleDownload = async () => {
    const XLSX = await import('xlsx');
    const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`;
    const branchLabel = branch === 'all'
      ? (filterBranch === 'all' ? 'All-Branches' : filterBranch)
      : branch;

    const autoWidth = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map(k => ({
        wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2,
      }));
    };
    const addSheet = (wb: ReturnType<typeof XLSX.utils.book_new>, data: Record<string, unknown>[], name: string, fallback: string) => {
      const rows = data.length > 0 ? data : [{ Note: fallback }];
      const ws   = XLSX.utils.json_to_sheet(rows);
      if (data.length > 0) autoWidth(ws, data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    // Sheet 1 – Summary
    const summaryRows = [
      { Metric: 'Period',                          Value: rangeLabel },
      { Metric: 'Branch',                          Value: branchLabel },
      { Metric: 'Total Revenue (₹)',               Value: totalRevenue },
      { Metric: 'Total Items Sold',                Value: totalQty },
      { Metric: 'Total Transactions',              Value: filtered.length },
      { Metric: 'Avg Revenue / Transaction (₹)',   Value: avgPerTx },
    ];

    // Sheet 2 – Item-wise
    const itemRows = itemReport.map(([item, v], i) => ({
      Rank:              i + 1,
      'Item Name':       item,
      'Qty Sold':        v.qty,
      'Revenue (₹)':     v.revenue,
      'Revenue Share %': totalRevenue > 0 ? `${Math.round((v.revenue / totalRevenue) * 100)}%` : '0%',
    }));

    // Sheet 3 – Branch-wise (admin only)
    const branchRows = branchReport.map(([b, v]) => ({
      Branch:            b,
      'Qty Sold':        v.qty,
      'Revenue (₹)':     v.revenue,
      'Revenue Share %': totalRevenue > 0 ? `${Math.round((v.revenue / totalRevenue) * 100)}%` : '0%',
    }));

    // Sheet 4 – Daily Trend
    const dailyRows = dailyTrend.map(d => ({
      Date:           d.date,
      'Revenue (₹)':  d.revenue,
      'Qty Sold':     d.qty,
      Transactions:   d.txns,
    }));

    // Sheet 5 – All Transactions (full detail)
    const txRows = filtered.map((s, i) => ({
      'S.No':          i + 1,
      'Item Name':     s.itemName,
      ...(branch === 'all' ? { Branch: s.branch } : {}),
      'Qty Sold':      s.quantitySold,
      'Unit Price (₹)': s.unitPrice,
      'Revenue (₹)':   s.unitPrice * s.quantitySold,
      'Sold At':       new Date(s.soldAt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      'Sold By':       s.soldBy,
      'Payment':       s.paymentMethod || '-',
    }));

    const wb = XLSX.utils.book_new();
    addSheet(wb, summaryRows,                                     'Summary',      'No data');
    addSheet(wb, itemRows,                                        'Item-wise',    'No sales in this range');
    if (branch === 'all') addSheet(wb, branchRows,                'Branch-wise',  'No data');
    addSheet(wb, dailyRows,                                       'Daily Trend',  'No data');
    addSheet(wb, txRows,                                          'Transactions', 'No transactions');
    // Credit Sales sheet
    const creditRows = filteredCredit.map((cs, i) => ({
      'S.No':            i + 1,
      'Bill No':         cs.billNo,
      'Customer':        cs.customerName,
      'Phone':           cs.customerPhone ?? '',
      ...(branch === 'all' ? { Branch: cs.branch } : {}),
      'Items':           cs.items.map(it => `${it.itemName} ×${it.quantity}`).join(', '),
      'Bill Amount (₹)': cs.subtotal,
      'Paid Now (₹)':    cs.amountPaid,
      'Credit Due (₹)':  cs.creditAmount,
      'Status':          cs.status.charAt(0).toUpperCase() + cs.status.slice(1),
      'Due Date':        cs.dueDate ?? '',
      'Billed On':       new Date(cs.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      'Settled On':      cs.settledAt ? new Date(cs.settledAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      'Billed By':       cs.soldBy,
      'Notes':           cs.notes ?? '',
    }));

    addSheet(wb, creditRows, 'Credit Sales', 'No credit sales in this range');
    XLSX.writeFile(wb, `BakeryReport_${branchLabel}_${dateLabel}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 col-span-2">
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
            Total Revenue {branch !== 'all' && `· ${branch}`}
          </p>
          <p className="font-display text-3xl font-bold text-primary tabular-nums">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {rangeLabel} · {totalQty} items · {filtered.length} transactions
          </p>
        </div>
        <KPICard label="Items Sold"     value={String(totalQty)}          color="bg-card border-border" />
        <KPICard label="Avg / Txn"      value={formatCurrency(avgPerTx)}  color="bg-card border-border" />
        <KPICard label="Transactions"   value={String(filtered.length)}   color="bg-card border-border" />
        <KPICard
          label="Unique Items"
          value={String(itemReport.length)}
          color="bg-card border-border"
        />
      </div>

      {/* ── Payment Method Breakdown ── */}
      {totalRevenue > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Revenue by Payment Method</p>
          <div className="space-y-2">
            {[
              { label: '💵 Cash',   key: 'cash',   color: 'bg-emerald-500' },
              { label: '📱 UPI',    key: 'upi',    color: 'bg-blue-500' },
              { label: '💳 Card',   key: 'card',   color: 'bg-violet-500' },
              { label: '📋 Credit', key: 'credit', color: 'bg-amber-500' },
            ].map(pm => {
              const amt = paymentBreakdown[pm.key] ?? 0;
              const pct = totalRevenue > 0 ? Math.round((amt / totalRevenue) * 100) : 0;
              return (
                <div key={pm.key} className="flex items-center gap-3">
                  <span className="text-xs font-body w-20 shrink-0">{pm.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className={`h-full rounded-full ${pm.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-24 text-right">{formatCurrency(amt)}</span>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
          {totalCreditOutstanding > 0 && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-amber-700 font-semibold">⚠ Credit Outstanding</span>
              <span className="text-sm font-bold tabular-nums text-amber-700">{formatCurrency(totalCreditOutstanding)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Quick range pills ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { id: 'today',     label: 'Today' },
          { id: 'yesterday', label: 'Yesterday' },
          { id: '7d',        label: 'Last 7 days' },
          { id: '30d',       label: 'Last 30 days' },
          { id: 'custom',    label: '⚙ Custom' },
        ] as const).map(q => (
          <button
            key={q.id}
            onClick={() => setQuickRange(q.id)}
            className={cn(
              'shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all',
              quickRange === q.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/40'
            )}
          >{q.label}</button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Filters</span>
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition"
          >
            <Download className="size-3" />Excel (All Sheets)
          </button>
        </div>

        {quickRange === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">From</label>
              <input
                type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase mb-1 block">To</label>
              <input
                type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
              />
            </div>
          </div>
        )}

        <div className={cn('grid gap-2', branch === 'all' ? 'grid-cols-2' : 'grid-cols-1')}>
          {branch === 'all' && (
            <select
              value={filterBranch}
              onChange={e => setFilterBranch(e.target.value as Branch | 'all')}
              className="border rounded-lg px-2 py-1.5 text-sm bg-background"
            >
              <option value="all">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select
            value={filterItem}
            onChange={e => setFilterItem(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background"
          >
            <option value="">All Items</option>
            {allItems.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} records · {totalQty} items · {formatCurrency(totalRevenue)}
        </p>
      </div>

      {/* ── Top Items Bar Chart ── */}
      {chartItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-display text-base font-bold">Top Items by Revenue</h3>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">
            {rangeLabel}{branch === 'all' ? ' · all branches' : ` · ${branch}`}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(chartItems.length * 38, 160)}>
            <BarChart data={chartItems} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fontSize: 9 }}
                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
              />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={108} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                contentStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {chartItems.map((_, i) => (
                  <Cell key={i} fill={ITEM_COLORS[i % ITEM_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Revenue Distribution Pie Chart ── */}
      {pieData.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <PieIcon className="size-4 text-primary" />
            <h3 className="font-display text-base font-bold">Revenue Distribution</h3>
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">Share by item · {rangeLabel}</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={ITEM_COLORS[i % ITEM_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                    contentStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 shrink-0">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full shrink-0" style={{ background: ITEM_COLORS[i % ITEM_COLORS.length] }} />
                  <div>
                    <p className="text-[10px] font-semibold leading-none">{d.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {totalRevenue > 0 ? `${Math.round((d.value / totalRevenue) * 100)}%` : '0%'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Daily Revenue Trend (only when range > 1 day) ── */}
      {dailyTrend.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="font-display text-base font-bold">Daily Revenue Trend</h3>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">{rangeLabel}</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="revGradBRM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date"  tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                contentStyle={{ fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revGradBRM)"
              />
            </AreaChart>
          </ResponsiveContainer>
          {/* Mini daily stats */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Peak Day',   value: dailyTrend.reduce((a, d) => d.revenue > a.revenue ? d : a, dailyTrend[0]).date },
              { label: 'Peak Rev',   value: formatCurrency(Math.max(...dailyTrend.map(d => d.revenue))) },
              { label: 'Avg / Day',  value: formatCurrency(Math.round(totalRevenue / dailyTrend.length)) },
            ].map(s => (
              <div key={s.label} className="bg-muted/40 rounded-xl p-2">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">{s.label}</p>
                <p className="text-xs font-bold tabular-nums mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Branch-wise Revenue (admin only) ── */}
      {branch === 'all' && branchReport.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <IndianRupee className="size-4 text-primary" />
            <h3 className="font-display text-base font-bold">Branch-wise Revenue</h3>
          </div>
          <div className="space-y-3">
            {branchReport.map(([b, v]) => {
              const pct = totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 100) : 0;
              return (
                <div key={b}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-bold', BRANCH_PILL[b])}>{b}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(v.revenue)}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{v.qty} items · {pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: BRANCH_COLORS[b] }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Item-wise Summary Table ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <h3 className="font-display text-base font-bold">Item-wise Summary</h3>
          </div>
          <span className="text-xs text-muted-foreground">{itemReport.length} items</span>
        </div>
        {itemReport.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No sales in this range.</p>
        ) : (
          <div className="table-scroll-container"><div className="table-inner-scroll"><table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b bg-muted/20">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left py-2.5">Item</th>
                <th className="text-right py-2.5 text-primary font-semibold">Revenue</th>
                <th className="text-right px-4 py-2.5">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {itemReport.map(([item, v], i) => {
                const share = totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 100) : 0;
                return (
                  <tr key={item}>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="py-2">
                      <p className="text-sm font-medium leading-none">{item}</p>
                      <div className="mt-1 h-1 bg-muted rounded-full w-24">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${share}%`, background: ITEM_COLORS[i % ITEM_COLORS.length] }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right font-bold text-primary tabular-nums">
                      {formatCurrency(v.revenue)}
                      <span className="block text-[9px] text-muted-foreground font-normal">{share}%</span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums text-xs">{v.qty}</td>
                  </tr>
                );
              })}
              <tr className="font-bold border-t-2 bg-muted/20">
                <td className="px-4 py-2.5" />
                <td className="py-2.5 text-foreground">Total</td>
                <td className="py-2.5 text-right text-primary">{formatCurrency(totalRevenue)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{totalQty}</td>
              </tr>
            </tbody>
          </table></div></div>
        )}
      </div>

      {/* ── Transaction Log ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-muted-foreground" />
            <h3 className="font-display text-base font-bold">Transactions</h3>
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} records</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No transactions in this range.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {filtered.slice(0, 100).map(s => {
              const lineRev = s.unitPrice * s.quantitySold;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.itemName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {branch === 'all' && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0', BRANCH_PILL[s.branch])}>
                          {s.branch}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.soldAt).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">· {s.soldBy}</span>
                    </div>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(lineRev)}</p>
                    <p className="text-[10px] text-muted-foreground">×{s.quantitySold} · ₹{s.unitPrice}/unit</p>
                  </div>
                </div>
              );
            })}
            {filtered.length > 100 && (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground bg-muted/30">
                Showing 100 of {filtered.length} records — export Excel for full data
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Item Frequency Chart ── */}
      <ItemFrequencyChart orders={allSales} dateFrom={dateFrom} dateTo={dateTo} />

      {/* ── Order Time Heatmap ── */}
      <OrderTimeHeatmap orders={allSales} dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}
