// src/pages/OwnerDashboard.tsx
// Owner Dashboard — Sales · Attendance · Credit · Waste Logs
// New in this version:
//   • Removed History and Staff tabs
//   • Added Waste Logs tab (reads kitchen_waste_log via KitchenWasteLogTab)
//   • Sales tab enhanced with:
//       – Today's live cash-in-drawer card
//       – Average Order Value KPI
//       – Peak Hours heatmap (from order timestamps)
//       – Menu availability (enabled vs disabled items)
//   • Credit tab: credit age / overdue flagging already exists in OwnerCreditTab
//   • Waste tab: waste cost estimate (maps waste food_item → menu prices)
//   • Attendance tab: advance-to-salary ratio per employee + attendance rate

import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import type { Branch } from '@/branch/types';
import { BRANCH_LABELS } from '@/branch/types';
import { useInvoiceStore } from '@/bakery/invoiceStore';
import { usePurchaseOrderStore } from '@/bakery/purchaseOrderStore';
import { useBranchLedger } from '@/hooks/useBranchLedger';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import OwnerCreditTab from '@/components/admin/OwnerCreditTab';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Users,
  Building2, BarChart3, CalendarCheck, ArrowUpRight, ArrowDownRight,
  Store, Layers, Banknote, Smartphone, CreditCard, Clock,
  Utensils, Trash2, AlertTriangle, WalletCards, PackageSearch,
  Landmark, CheckCircle2, XCircle, Receipt, Bell, Package, Truck,
  Download, Printer, FileSpreadsheet, Filter, ShieldCheck, Factory, Search,
} from 'lucide-react';

const COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899'];

const OWNER_FULL_BRANCHES: Branch[] = ['Cafe', 'SNB', 'VRSNB', 'Hosur'];
const OWNER_OPERATING_UNITS = ['Cafe', 'SNB Branch', 'VRSNB Branch', 'Hosur Branch', 'Bakery Production', 'Store', 'Packing / Dispatch'] as const;

type OwnerDatePreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'month';

type OwnerAlertTone = 'danger' | 'warning' | 'neutral' | 'success';

type OwnerAlert = {
  title: string;
  value: string;
  note: string;
  tone: OwnerAlertTone;
  branch?: string;
};

type OwnerClosureRow = {
  branch: string;
  opening: number;
  grossSales: number;
  returns: number;
  netSales: number;
  cash: number;
  upi: number;
  card: number;
  credit: number;
  expenses: number;
  purchases: number;
  bankDeposits: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  status: 'Completed' | 'Pending' | 'Difference';
  closedBy: string;
  closedAt: string;
  remarks: string;
};

type OwnerStorePurchaseLine = {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  purchaseDate: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMethod: string;
  purchaseStatus: string;
  stockSyncStatus: string;
  remarks: string;
};

function ownerDateInput(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ownerPresetStart(preset: OwnerDatePreset) {
  const d = new Date();
  if (preset === 'today') { d.setHours(0, 0, 0, 0); return d; }
  if (preset === 'yesterday') { d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; }
  if (preset === '7d') { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; }
  if (preset === '15d') { d.setDate(d.getDate() - 14); d.setHours(0, 0, 0, 0); return d; }
  if (preset === '30d') { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; }
  if (preset === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  d.setHours(0, 0, 0, 0);
  return d;
}

function ownerEndOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function ownerInRange(iso: string | null | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
}

function ownerLocalDay(iso: string | null | undefined) {
  if (!iso) return '';
  return ownerDateInput(new Date(iso));
}

function ownerFmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ownerFmtDateTime(iso: string | null | undefined) {
  if (!iso) return 'Pending';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Pending';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ownerCsvDownload(filename: string, rows: Array<Record<string, string | number>>) {
  const safeRows = rows.length ? rows : [{ Note: 'No records available for selected filters' }];
  const headers = Object.keys(safeRows[0]);
  const csv = [
    headers.join(','),
    ...safeRows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ownerPrintSection(title: string, html: string) {
  const win = window.open('', '_blank', 'width=1100,height=760');
  if (!win) return;
  win.document.write(`
    <html><head><title>${title}</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111827}h1{font-size:20px;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #d1d5db;padding:8px;font-size:12px;text-align:left}th{background:#f3f4f6}.muted{color:#6b7280;font-size:12px}
      </style>
    </head><body><h1>${title}</h1><p class="muted">Generated ${new Date().toLocaleString('en-IN')}</p>${html}</body></html>
  `);
  win.document.close();
  win.print();
}

function ownerBranchDisplay(branch: Branch | string) {
  return (BRANCH_LABELS as Record<string, string>)[branch] || branch;
}

function moneyNumber(value: number | null | undefined) {
  return Number(value || 0);
}

function OwnerMetricCard({ icon, label, value, sub, tone = 'slate' }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'slate' }) {
  return (
    <div className={cn('owner-metric-card', `tone-${tone}`)}>
      <div className="owner-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function OwnerToolbar({ children }: { children: React.ReactNode }) {
  return <div className="owner-toolbar"><Filter className="size-4" />{children}</div>;
}


// ── Shared KPI card ───────────────────────────────────────────────────────────
function KPI({
  icon, label, value, sub, color, trend,
}: {
  icon: React.ReactNode; label: string; value: string;
  sub?: string; color: string; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6"
        style={{ background: 'hsl(var(--primary))' }} />
      <div className="flex items-start justify-between mb-2">
        <div className={cn('size-9 rounded-xl flex items-center justify-center', color)}>{icon}</div>
        {trend === 'up'   && <ArrowUpRight   className="size-4 text-emerald-500" />}
        {trend === 'down' && <ArrowDownRight  className="size-4 text-red-500" />}
      </div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const OWNER_BRANCHES = ['VRSNB', 'SNB', 'Hosur'] as const;
function isSameBusinessDay(isoDate: string | null | undefined, dayStart: Date) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  return d >= dayStart;
}

function EmptyOwnerState({ title, message }: { title: string; message: string }) {
  return (
    <div className="owner-empty-state">
      <Layers className="size-8" />
      <p>{title}</p>
      <span>{message}</span>
    </div>
  );
}

// ── Sales Overview Tab ────────────────────────────────────────────────────────
// CHANGE 5: removed Menu section, branch filter, multi-branch trend, combined payment breakdown, export
function SalesOverviewTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, fetchBranchData } = useBranchStore();
  const { bills } = useBranchOpsStore();
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7d' | '15d' | '30d'>('7d');
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => fetchBranchData(b)); }, [fetchBranchData]);

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === 'yesterday') { d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    if (dateRange === '15d') { d.setDate(d.getDate() - 14); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  const cutoffEnd = useMemo(() => {
    if (dateRange === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(23, 59, 59, 999); return d;
    }
    return ownerEndOfToday();
  }, [dateRange]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const cafeOrders = useMemo(() =>
    orders.filter(o => new Date(o.createdAt) >= cutoff && new Date(o.createdAt) <= cutoffEnd && o.status === 'served' && o.paymentType !== 'advance'), // FIX: exclude advance orders (partial totals would distort cafeRevenue)
    [orders, cutoff, cutoffEnd]);

  const todayOrders = useMemo(() =>
    orders.filter(o => new Date(o.createdAt) >= todayStart && o.status === 'served'),
    [orders, todayStart]);

  const cafeRevenue = cafeOrders.reduce((s, o) => s + o.total, 0);
  const cafeCount   = cafeOrders.length;
  const avgOrderValue = cafeCount > 0 ? Math.round(cafeRevenue / cafeCount) : 0;

  const todayCash = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    todayOrders.forEach(o => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return { cash, upi, card, total: cash + upi + card };
  }, [todayOrders]);

  const branchSales = useMemo(() => {
    const branches: Record<string, { qty: number; count: number; revenue: number }> = {
      VRSNB: { qty: 0, count: 0, revenue: 0 },
      SNB:   { qty: 0, count: 0, revenue: 0 },
      Hosur: { qty: 0, count: 0, revenue: 0 },
    };
    (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => {
      (sales[b] || []).filter(s => s.soldAt && new Date(s.soldAt) >= cutoff && new Date(s.soldAt) <= cutoffEnd).forEach(s => {
        branches[b].qty += s.quantitySold;
        branches[b].count += 1;
        const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
        branches[b].revenue += unitPrice * s.quantitySold;
      });
    });
    return branches;
  }, [sales, cutoff, cutoffEnd]);

  const totalBakeryRevenue = Object.values(branchSales).reduce((a, v) => a + v.revenue, 0);
  const totalBakeryQty     = Object.values(branchSales).reduce((a, v) => a + v.qty, 0);
  const grandTotal         = cafeRevenue + totalBakeryRevenue;

  // CHANGE 5c: multi-branch daily revenue data
  const dailyRevenueData = useMemo(() => {
    const days = dateRange === 'today' || dateRange === 'yesterday' ? 1
      : dateRange === '7d' ? 7 : dateRange === '15d' ? 15 : 30;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      if (dateRange === 'yesterday') d.setDate(d.getDate() - 1 - i);
      else d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const cafeRev = cafeOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr)
        .reduce((s, o) => s + o.total, 0);
      const vrsnbRev = (sales['VRSNB'] || []).filter(s => s.soldAt && new Date(s.soldAt).toDateString() === dateStr)
        .reduce((s, sale) => s + ((sale as typeof sale & { unitPrice?: number }).unitPrice || 0) * sale.quantitySold, 0);
      const snbRev = (sales['SNB'] || []).filter(s => s.soldAt && new Date(s.soldAt).toDateString() === dateStr)
        .reduce((s, sale) => s + ((sale as typeof sale & { unitPrice?: number }).unitPrice || 0) * sale.quantitySold, 0);
      // Hosur wholesale shop-supply revenue (hosur_bills) is NOT included — it lives in a separate
      // Hosur wholesale bills are mirrored into branch_sales after confirmation.
      const hosurRev = (sales['Hosur'] || []).filter(s => s.soldAt && new Date(s.soldAt).toDateString() === dateStr)
        .reduce((s, sale) => s + ((sale as typeof sale & { unitPrice?: number }).unitPrice || 0) * sale.quantitySold, 0);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      result.push({ date: label, Cafe: cafeRev, VRSNB: vrsnbRev, SNB: snbRev, Hosur: hosurRev,
        Total: cafeRev + vrsnbRev + snbRev + hosurRev });
    }
    return result;
  }, [cafeOrders, sales, dateRange]);

  const revShareData = [
    { name: 'Cafe',  value: cafeRevenue,              color: COLORS[0] },
    { name: 'VRSNB', value: branchSales.VRSNB.revenue, color: COLORS[2] },
    { name: 'SNB',   value: branchSales.SNB.revenue,   color: COLORS[1] },
    { name: 'Hosur', value: branchSales.Hosur.revenue,  color: COLORS[4] },
  ].filter(d => d.value > 0);

  // CHANGE 5d: combined all-branch payment breakdown
  const cafePayBreakdown = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    cafeOrders.forEach(o => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return { cash, upi, card };
  }, [cafeOrders]);

  const allPayBreakdown = useMemo(() => {
    let cash = cafePayBreakdown.cash, upi = cafePayBreakdown.upi, card = cafePayBreakdown.card;
    let credit = 0;
    const branchBills = bills.filter(b => new Date(b.createdAt) >= cutoff && new Date(b.createdAt) <= cutoffEnd);
    branchBills.forEach(b => {
      if (b.paymentMode === 'cash') cash += b.total;
      else if (b.paymentMode === 'upi') upi += b.total;
      else if (b.paymentMode === 'card') card += b.total;
      else if (b.paymentMode === 'credit') credit += b.total;
      else if (b.paymentMode === 'split') {
        cash += (b.split?.cash || 0); upi += (b.split?.upi || 0); card += (b.split?.card || 0);
      }
    });
    return [{ name: 'Cash', value: cash }, { name: 'UPI', value: upi },
            { name: 'Card', value: card }, { name: 'Credit', value: credit }]
      .filter(p => p.value > 0);
  }, [cafePayBreakdown, bills, cutoff, cutoffEnd]);

  const topCafeItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    cafeOrders.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.name);
      const rev = ci.menuItem.price * ci.quantity;
      if (ex) { ex.qty += ci.quantity; ex.revenue += rev; }
      else map.set(ci.menuItem.name, { qty: ci.quantity, revenue: rev });
    }));
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
      .map(([name, v]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, revenue: v.revenue, qty: v.qty }));
  }, [cafeOrders]);

  const peakHours = useMemo(() => {
    const counts = Array(24).fill(0);
    cafeOrders.forEach(o => { counts[new Date(o.createdAt).getHours()]++; });
    return counts.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      count,
      label: hour < 12 ? `${hour === 0 ? 12 : hour}am` : `${hour === 12 ? 12 : hour - 12}pm`,
    }));
  }, [cafeOrders]);
  const maxHourCount = Math.max(...peakHours.map(h => h.count), 1);
  const maxBranchRev = Math.max(cafeRevenue, branchSales.VRSNB.revenue, branchSales.SNB.revenue, branchSales.Hosur.revenue, 1);

  // CHANGE 5e: export
  const exportSales = () => ownerCsvDownload(`Sales_${dateRange}.csv`, [
    ...cafeOrders.map(o => ({
      Branch: 'Cafe', Date: ownerFmtDate(o.createdAt),
      Revenue: o.total, Payment: o.paymentType, Items: o.items.length,
    })),
    ...(['VRSNB', 'SNB', 'Hosur'] as const).flatMap(b =>
      (sales[b] || []).filter(s => s.soldAt && new Date(s.soldAt) >= cutoff && new Date(s.soldAt) <= cutoffEnd).map(s => ({
        Branch: b, Date: ownerFmtDate(s.soldAt),
        Revenue: ((s as typeof s & { unitPrice?: number }).unitPrice || 0) * s.quantitySold,
        Payment: (s as typeof s & { paymentMethod?: string }).paymentMethod || '-', Items: 1,
      }))
    ),
  ]);

  const DATE_PRESETS: Array<{ label: string; value: typeof dateRange }> = [
    { label: 'Today',    value: 'today' },
    { label: 'Yesterday',value: 'yesterday' },
    { label: '7 Days',   value: '7d' },
    { label: '15 Days',  value: '15d' },
    { label: '30 Days',  value: '30d' },
  ];

  const showCafe     = branchFilter === 'all' || branchFilter === 'Cafe';
  const showBranches = branchFilter === 'all' || branchFilter !== 'Cafe';

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {DATE_PRESETS.map(r => (
            <button key={r.value} onClick={() => setDateRange(r.value)}
              className={cn('px-3 py-2 rounded-lg text-sm font-semibold transition-all',
                dateRange === r.value ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
              {r.label}
            </button>
          ))}
        </div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as Branch | 'all')}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none">
          <option value="all">All Branches</option>
          <option value="Cafe">Cafe</option>
          <option value="VRSNB">VRSNB Branch</option>
          <option value="SNB">SNB Branch</option>
          <option value="Hosur">Hosur Branch</option>
        </select>
        <button onClick={exportSales}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted transition">
          <Download className="size-4" />Export
        </button>
      </div>

      {/* Today cash-in-drawer */}
      {showCafe && (
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Today's Collection (Cafe)</p>
          <p className="font-display text-3xl font-bold text-foreground tabular-nums">{formatCurrency(todayCash.total)}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">{todayOrders.length} orders served today</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Cash', value: todayCash.cash, icon: <Banknote className="size-3" />, color: 'text-emerald-700 bg-emerald-50' },
              { label: 'UPI',  value: todayCash.upi,  icon: <Smartphone className="size-3" />, color: 'text-blue-700 bg-blue-50' },
              { label: 'Card', value: todayCash.card, icon: <CreditCard className="size-3" />, color: 'text-purple-700 bg-purple-50' },
            ].map(p => (
              <div key={p.label} className="bg-card rounded-xl p-2.5 text-center border border-border">
                <div className={cn('size-6 rounded-lg flex items-center justify-center mx-auto mb-1', p.color)}>{p.icon}</div>
                <p className="text-sm font-bold tabular-nums">{formatCurrency(p.value)}</p>
                <p className="text-[10px] text-muted-foreground">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue"   value={formatCurrency(grandTotal)}    sub="All branches"               color="bg-primary/10 text-primary" />
        {showCafe && <KPI icon={<Store       className="size-4" />} label="Cafe Revenue"    value={formatCurrency(cafeRevenue)}   sub={`${cafeCount} orders`}       color="bg-emerald-50 text-emerald-700" />}
        {showBranches && <KPI icon={<ShoppingBag className="size-4" />} label="Bakery Revenue"  value={formatCurrency(totalBakeryRevenue)} sub={`${totalBakeryQty} items`} color="bg-amber-50 text-amber-700" />}
        <KPI icon={<TrendingUp  className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} sub="Cafe only"                    color="bg-blue-50 text-blue-700" />
      </div>

      {/* Branch Performance */}
      {showBranches && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />Branch Performance
          </h3>
          <p className="text-[10px] text-muted-foreground mb-4">Revenue comparison across branches</p>
          <div className="space-y-3">
            {[
              { label: 'Cafe',  value: cafeRevenue,              color: 'bg-emerald-500', qty: `${cafeCount} orders`, show: showCafe },
              { label: 'VRSNB', value: branchSales.VRSNB.revenue, color: 'bg-blue-500',   qty: `${branchSales.VRSNB.qty} items`, show: branchFilter === 'all' || branchFilter === 'VRSNB' },
              { label: 'SNB',   value: branchSales.SNB.revenue,   color: 'bg-amber-500',  qty: `${branchSales.SNB.qty} items`, show: branchFilter === 'all' || branchFilter === 'SNB' },
              { label: 'Hosur', value: branchSales.Hosur.revenue,  color: 'bg-purple-500', qty: `${branchSales.Hosur.qty} items`, show: branchFilter === 'all' || branchFilter === 'Hosur' },
            ].filter(r => r.show).map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-body font-medium">{row.label}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(row.value)}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{row.qty}</span>
                  </div>
                </div>
                <div className="flex-1 bg-muted rounded-full h-2.5">
                  <div className={cn('h-full rounded-full transition-all', row.color)}
                    style={{ width: `${Math.round((row.value / maxBranchRev) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Share Pie */}
      {revShareData.length > 0 && branchFilter === 'all' && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Revenue Share</h3>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={revShareData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {revShareData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2.5">
              {revShareData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-3 rounded-full shrink-0" style={{ background: d.color }} />
                  <div>
                    <p className="text-xs font-semibold">{d.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(d.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue Trend — LineChart for all branches, AreaChart for single */}
      {dateRange !== 'today' && dateRange !== 'yesterday' && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            {branchFilter === 'all' ? (
              <LineChart data={dailyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                <Legend />
                <Line type="monotone" dataKey="Cafe"  stroke={COLORS[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="VRSNB" stroke={COLORS[2]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="SNB"   stroke={COLORS[1]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Hosur" stroke={COLORS[4]} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={dailyRevenueData}>
                <defs>
                  <linearGradient id="singleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Area type="monotone" dataKey={branchFilter === 'Cafe' ? 'Cafe' : branchFilter}
                  stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#singleGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Combined Payment Breakdown */}
      {allPayBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Payment Methods — All Branches</h3>
          <div className="space-y-2.5">
            {allPayBreakdown.map((p, i) => {
              const total = allPayBreakdown.reduce((s, x) => s + x.value, 0);
              const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
              return (
                <div key={p.name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-sm font-bold tabular-nums">
                      {formatCurrency(p.value)} <span className="text-xs text-muted-foreground font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Peak Hours */}
      {cafeOrders.length > 0 && showCafe && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <Clock className="size-4 text-primary" />Peak Hours (Cafe)
          </h3>
          <p className="text-[10px] text-muted-foreground mb-4">Order volume by hour</p>
          <div className="flex items-end gap-0.5 h-20">
            {peakHours.filter((_, i) => i >= 6 && i <= 22).map((h) => {
              const pct = maxHourCount > 0 ? (h.count / maxHourCount) : 0;
              const isHigh = pct > 0.7;
              const isMed  = pct > 0.3;
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {h.label}: {h.count}
                  </div>
                  <div className={cn('w-full rounded-sm transition-all', isHigh ? 'bg-primary' : isMed ? 'bg-primary/50' : 'bg-muted')}
                    style={{ height: `${Math.max(pct * 100, 4)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-muted-foreground">6am</span>
            <span className="text-[9px] text-muted-foreground">12pm</span>
            <span className="text-[9px] text-muted-foreground">10pm</span>
          </div>
        </div>
      )}

      {/* Top Items */}
      {topCafeItems.length > 0 && showCafe && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Top Cafe Items by Revenue</h3>
          <ResponsiveContainer width="100%" height={Math.max(topCafeItems.length * 32, 180)}>
            <BarChart data={topCafeItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}


// ── Attendance & Salary Tab ───────────────────────────────────────────────────
// CHANGE 10: aggregate branch view (no per-employee list), stacked dept chart
function AttendanceSalaryTab() {
  const [employees, setEmployees] = useState<Array<{
    id: string; name: string; branch: string; department: string;
    grossSalary: number; salaryAdvance: number; uniformDeduction: number; otherDeduction: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadEmployees = () => {
    setLoading(true); setFetchError(null);
    supabase.from('employees').select('*').then(({ data, error }) => {
      console.debug('[AttendanceSalaryTab] employees:', data?.length, error?.message);
      if (error) setFetchError(error.message || 'Failed to load employee data.');
      else if (data) setEmployees(data);
      setLoading(false);
    });
  };
  useEffect(() => { loadEmployees(); }, []);

  const branchGroups = useMemo(() => {
    const groups: Record<string, typeof employees> = {};
    employees.forEach(e => { if (!groups[e.branch]) groups[e.branch] = []; groups[e.branch].push(e); });
    return groups;
  }, [employees]);

  const salaryStats = useMemo(() => {
    // BUG-C2 NOTE: These figures are based on contracted gross salaries, NOT attendance-prorated
    // earned amounts. For accurate prorated payroll see the Attendance & Salary page which calls
    // calcSalary() per employee. This tab shows a quick estimate for owner overview only.
    const total      = employees.reduce((a, e) => a + (Number(e.grossSalary) || 0), 0);
    const advances   = employees.reduce((a, e) => a + (Number(e.salaryAdvance) || 0), 0);
    const deductions = employees.reduce((a, e) => a + (Number(e.uniformDeduction) || 0) + (Number(e.otherDeduction) || 0), 0);
    return { total, advances, deductions, netPayable: total - advances - deductions };
  }, [employees]);

  const atRiskEmployees = useMemo(() =>
    employees
      .filter(e => Number(e.grossSalary) > 0 && (Number(e.salaryAdvance) / Number(e.grossSalary)) >= 0.5)
      .map(e => ({ ...e, ratio: Math.round((Number(e.salaryAdvance) / Number(e.grossSalary)) * 100) }))
      .sort((a, b) => b.ratio - a.ratio),
    [employees]);

  const allDepts = useMemo(() => [...new Set(employees.map(e => e.department))], [employees]);
  const deptByBranch = useMemo(() => {
    return Object.entries(branchGroups).map(([branch, emps]) => {
      const row: Record<string, string | number> = { branch };
      allDepts.forEach(dept => { row[dept] = emps.filter(e => e.department === dept).length; });
      return row;
    });
  }, [branchGroups, allDepts]);

  const salaryPieData = [
    { name: 'Net Pay',    value: Math.max(salaryStats.netPayable, 0) },
    { name: 'Advances',   value: salaryStats.advances },
    { name: 'Deductions', value: salaryStats.deductions },
  ].filter(d => d.value > 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-8 rounded-2xl bg-primary/10 animate-pulse" />
    </div>
  );
  if (fetchError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
      <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <Users className="size-7 text-destructive" />
      </div>
      <div className="text-center">
        <p className="font-display font-bold text-foreground">Failed to load employee data</p>
        <p className="text-sm font-body text-muted-foreground mt-1">{fetchError}</p>
      </div>
      <button onClick={loadEmployees} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-body font-semibold active:scale-95 transition-transform">Try again</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<Users       className="size-4" />} label="Total Staff"   value={String(employees.length)}              color="bg-primary/10 text-primary" />
        {/* FIX (MD Bug #10): labels clarified to emphasise these are contracted-salary estimates,
            not attendance-prorated actuals. See Attendance & Salary page for the real figures. */}
        <KPI icon={<IndianRupee className="size-4" />} label="Gross Payroll (contracted est.)" value={formatCurrency(salaryStats.total)}      color="bg-blue-50 text-blue-700" title="Based on contracted gross salaries — not attendance-prorated. See Attendance & Salary for accurate figures." />
        <KPI icon={<TrendingUp  className="size-4" />} label="Est. Net Payable (see A&S)"   value={formatCurrency(salaryStats.netPayable)} color="bg-emerald-50 text-emerald-700" title="Estimate only. For the attendance-prorated payable amount, open the Attendance & Salary page." />
        <KPI icon={<IndianRupee className="size-4" />} label="Advances"      value={formatCurrency(salaryStats.advances)}   color="bg-amber-50 text-amber-700" />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-base font-bold flex items-center gap-2">
          <Building2 className="size-4 text-primary" />Branch Summary
        </h3>
        {Object.entries(branchGroups).map(([branch, emps]) => {
          const branchTotal = emps.reduce((s, e) => s + Number(e.grossSalary || 0), 0);
          const highRisk    = emps.filter(e => Number(e.grossSalary) > 0 && Number(e.salaryAdvance) / Number(e.grossSalary) >= 0.5).length;
          return (
            <div key={branch} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-900">{branch}</h4>
                <span className="text-xs text-slate-500">{emps.length} staff</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xl font-black text-slate-950">{emps.length}</p>
                  <p className="text-[10px] text-slate-500">Headcount</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-emerald-700">{formatCurrency(branchTotal)}</p>
                  <p className="text-[10px] text-slate-500">Gross Payroll</p>
                </div>
                <div className="text-center">
                  <p className={cn('text-xl font-black', highRisk > 0 ? 'text-red-600' : 'text-slate-500')}>{highRisk}</p>
                  <p className="text-[10px] text-slate-500">Advance Risk</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {atRiskEmployees.length > 0 && (
        <div className="bg-card border border-amber-200 rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />Advance Risk Alerts
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">Staff with advance ≥ 50% of salary — review before next payout</p>
          <div className="space-y-2.5">
            {atRiskEmployees.map(e => (
              <div key={e.id} className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold truncate">{e.name}</p>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0',
                    e.ratio >= 80 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{e.ratio}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-1">{e.branch} · {e.department}</p>
                <div className="h-1.5 bg-muted rounded-full">
                  <div className={cn('h-full rounded-full transition-all', e.ratio >= 80 ? 'bg-red-500' : 'bg-amber-500')}
                    style={{ width: `${Math.min(e.ratio, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {salaryPieData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Salary Breakdown</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width="55%" height={160}>
              <PieChart>
                <Pie data={salaryPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                  {[COLORS[0], COLORS[3], COLORS[1]].map((color, i) => <Cell key={i} fill={color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {[
                { label: 'Net Pay',    value: salaryStats.netPayable,  color: COLORS[0] },
                { label: 'Advances',   value: salaryStats.advances,    color: COLORS[3] },
                { label: 'Deductions', value: salaryStats.deductions,  color: COLORS[1] },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="size-3 rounded-full shrink-0" style={{ background: item.color }} />
                  <div>
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(item.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {deptByBranch.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <Building2 className="size-4 text-primary" />Staff by Branch & Department
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptByBranch}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              {allDepts.map((dept, i) => (
                <Bar key={dept} dataKey={dept} stackId="a" fill={COLORS[i % COLORS.length]}
                  radius={i === allDepts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}


// ── Waste Logs Tab ────────────────────────────────────────────────────────────
// CHANGE 11: date range state + presets + daily trend chart
function WasteLogsTab() {
  const [entries, setEntries] = useState<Array<{
    id: string; food_item: string; quantity: string; logged_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate,   setToDate]   = useState(todayStr);

  useEffect(() => {
    const fetchWaste = async () => {
      setLoading(true); setError('');
      const { data, error: err } = await supabase
        .from('kitchen_waste_log').select('*')
        .gte('logged_at', `${fromDate}T00:00:00`)
        .lte('logged_at', `${toDate}T23:59:59`)
        .order('logged_at', { ascending: false });
      if (err) setError(err.message);
      else setEntries(data ?? []);
      setLoading(false);
    };
    fetchWaste();
  }, [fromDate, toDate]);

  const dailyWasteCount = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => {
      const day = e.logged_at.slice(0, 10);
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        Entries: count,
      }));
  }, [entries]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof entries> = {};
    entries.forEach(e => {
      const date = e.logged_at.slice(0, 10);
      if (!g[date]) g[date] = [];
      g[date].push(e);
    });
    return g;
  }, [entries]);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
    const diff = Math.round((todayD.getTime() - d.getTime()) / 86400000);
    const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (diff === 0) return `Today · ${label}`;
    if (diff === 1) return `Yesterday · ${label}`;
    return label;
  }

  const applyPreset = (from: number, to: number) => {
    const d1 = new Date(); d1.setDate(d1.getDate() - from);
    const d2 = new Date(); d2.setDate(d2.getDate() - to);
    setFromDate(d1.toISOString().slice(0, 10));
    setToDate(d2.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-xl flex items-center justify-center bg-red-50">
          <Trash2 className="size-4 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Kitchen Waste Log</p>
          <p className="text-[11px] text-muted-foreground">Logged by kitchen</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Today',     from: 0,  to: 0 },
            { label: 'Yesterday', from: 1,  to: 1 },
            { label: 'Last 7d',   from: 6,  to: 0 },
            { label: 'Last 15d',  from: 14, to: 0 },
            { label: '4 Weeks',   from: 27, to: 0 },
            { label: '7 Weeks',   from: 48, to: 0 },
          ].map(p => (
            <button key={p.label} onClick={() => applyPreset(p.from, p.to)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-950 hover:text-white transition">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none" />
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none" />
        </div>
      </div>

      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-red-700 tabular-nums">{entries.length}</p>
            <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mt-0.5">Total Entries</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-foreground tabular-nums">{sortedDates.length}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">Days with Waste</p>
          </div>
        </div>
      )}

      {!loading && dailyWasteCount.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Daily Waste Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dailyWasteCount}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="Entries" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      {loading && <div className="flex items-center justify-center py-12"><div className="size-6 rounded-xl bg-primary/10 animate-pulse" /></div>}
      {!loading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
            <Trash2 className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No waste logged for this period</p>
        </div>
      )}
      {!loading && sortedDates.map(date => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{formatDateLabel(date)}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold">
              {grouped[date].length} {grouped[date].length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="space-y-1.5">
            {grouped[date].map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                <div className="size-8 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                  <Trash2 className="size-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{entry.food_item}</p>
                  <p className="text-[11px] text-muted-foreground">{entry.quantity}</p>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {new Date(entry.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// ── Branch Overview Tab ──────────────────────────────────────────────────────
// CHANGE 4: split view toggle, better cards, payment grouped chart, extended presets
function BranchOverviewTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, stock, incoming, advanceOrders, creditSales, fetchBranchData } = useBranchStore();
  const { bills, returns, purchases, purchasePayments, bankDeposits, cashierClosures, storeOrders } = useBranchOpsStore();
  const [preset, setPreset] = useState<OwnerDatePreset>('today');
  const [unitView, setUnitView] = useState<'sales' | 'ops'>('sales');

  const SALES_UNITS = ['Cafe', 'SNB Branch', 'VRSNB Branch', 'Hosur Branch'];
  const OPS_UNITS   = ['Bakery Production', 'Store', 'Packing / Dispatch'];

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { OWNER_FULL_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);

  const from = useMemo(() => ownerPresetStart(preset), [preset]);
  const to = useMemo(() => {
    if (preset === 'yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(23, 59, 59, 999); return d;
    }
    return ownerEndOfToday();
  }, [preset]);
  const fromKey = useMemo(() => ownerDateInput(from), [from]);
  const toKey = useMemo(() => ownerDateInput(to), [to]);
  const ownerLedger = useBranchLedger(fromKey, toKey, ['VRSNB', 'SNB', 'Hosur']);

  const branchRows = useMemo(() => OWNER_OPERATING_UNITS.map((unit) => {
    if (unit === 'Cafe') {
      const served = orders.filter(o => o.status === 'served' && ownerInRange(o.createdAt, from, to));
      const cancelled = orders.filter(o => o.status === 'cancelled' && ownerInRange(o.createdAt, from, to));
      const gross = served.reduce((sum, o) => sum + moneyNumber(o.total), 0);
      const cash = served.reduce((sum, o) => sum + (o.paymentType === 'cash' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.cash) : 0), 0);
      const upi = served.reduce((sum, o) => sum + (o.paymentType === 'upi' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.upi) : 0), 0);
      const card = served.reduce((sum, o) => sum + (o.paymentType === 'card' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.card) : 0), 0);
      const credit = served.reduce((sum, o) => sum + (o.paymentType === 'credit' || o.paymentType === 'unpaid' ? moneyNumber(o.total) : 0), 0);
      return {
        unit, sales: gross, netSales: gross, cash, upi, card, credit,
        expenses: 0, purchases: 0, pendingPayments: credit,
        stockAlerts: 0, closureStatus: served.length ? 'Review Cafe closure' : 'No sale yet',
        keyAlert: cancelled.length ? `${cancelled.length} cancelled orders` : 'Kitchen and billing live',
      };
    }

    if (unit === 'Bakery Production') {
      const pending = storeOrders.filter(o => ownerInRange(o.createdAt, from, to) && !['Delivered', 'Rejected'].includes(o.status)).length;
      const approvedStorePurchases = purchases.filter(p => ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.total), 0);
      return {
        unit, sales: 0, netSales: 0, cash: 0, upi: 0, card: 0, credit: 0,
        expenses: 0, purchases: approvedStorePurchases, pendingPayments: 0,
        stockAlerts: 0, closureStatus: pending ? `${pending} production/store orders pending` : 'No pending production alerts',
        keyAlert: 'Track wastage, recipes and material movement',
      };
    }

    if (unit === 'Store') {
      const storePurchaseTotal = purchases.filter(p => ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.total), 0);
      const paid = purchasePayments.filter(p => ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.amount), 0);
      const syncedPending = purchases.filter(p => ownerInRange(p.createdAt, from, to) && (p.syncStatus || 'Not Synced') !== 'Synced').length;
      return {
        unit, sales: 0, netSales: 0, cash: 0, upi: 0, card: 0, credit: 0,
        expenses: paid, purchases: storePurchaseTotal, pendingPayments: Math.max(0, storePurchaseTotal - paid),
        stockAlerts: syncedPending, closureStatus: syncedPending ? `${syncedPending} purchase sync pending` : 'Purchase sync clear',
        keyAlert: 'Supplier invoices and stock sync control',
      };
    }

    if (unit === 'Packing / Dispatch') {
      const pendingDispatch = storeOrders.filter(o => ownerInRange(o.createdAt, from, to) && ['Confirmed', 'Ready'].includes(o.status)).length;
      return {
        unit, sales: 0, netSales: 0, cash: 0, upi: 0, card: 0, credit: 0,
        expenses: 0, purchases: 0, pendingPayments: 0,
        stockAlerts: 0, closureStatus: pendingDispatch ? `${pendingDispatch} dispatches waiting` : 'Dispatch clear',
        keyAlert: 'Pack, dispatch and shortage visibility',
      };
    }

    const branch = unit.replace(' Branch', '') as Branch;
    const ledgerRows = ownerLedger.closureRows.filter(row => row.branch === branch);
    if (ledgerRows.length > 0) {
      const gross = ledgerRows.reduce((sum, row) => sum + ownerLedger.toNumber(row.sales_total) + ownerLedger.toNumber(row.advance_collected) + ownerLedger.toNumber(row.advance_balance_collected), 0);
      const cash = ledgerRows.reduce((sum, row) => sum + ownerLedger.toNumber(row.cash_total), 0);
      const upi = ledgerRows.reduce((sum, row) => sum + ownerLedger.toNumber(row.upi_total), 0);
      const card = ledgerRows.reduce((sum, row) => sum + ownerLedger.toNumber(row.card_total), 0);
      const credit = ledgerRows.reduce((sum, row) => sum + ownerLedger.toNumber(row.credit_billed), 0);
      const savedClosure = ownerLedger.savedClosures.find(c => c.branch === branch);
      const lowStock = (stock[branch] || []).filter(item => item.quantity > 0 && item.quantity <= item.minThreshold).length;
      const outStock = (stock[branch] || []).filter(item => item.quantity <= 0).length;
      const openCredit = (creditSales[branch] || []).reduce((sum, sale) => sum + moneyNumber(sale.creditAmount), 0);
      return {
        unit, sales: gross, netSales: gross, cash, upi, card, credit: Math.max(credit, openCredit),
        expenses: ownerLedger.toNumber(savedClosure?.expenses || 0), purchases: 0, pendingPayments: openCredit,
        stockAlerts: lowStock + outStock + (incoming[branch] || []).filter(i => !i.confirmed).length,
        closureStatus: savedClosure ? (Math.abs(ownerLedger.toNumber(savedClosure.difference)) > 0 ? 'Difference in closure' : 'Closed') : 'Pending closure',
        keyAlert: `${(advanceOrders[branch] || []).filter(a => a.status === 'pending').length} advance · ${lowStock + outStock} stock alerts`,
      };
    }
    const dbSales = (sales[branch] || []).filter(s => ownerInRange(s.soldAt, from, to));
    const localBills = bills.filter(b => b.branch === branch && ownerInRange(b.createdAt, from, to) && b.status !== 'Returned');
    const branchReturns = returns.filter(r => r.branch === branch && ownerInRange(r.createdAt, from, to));
    const gross = dbSales.reduce((sum, s) => sum + moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold), 0) + localBills.reduce((sum, b) => sum + moneyNumber(b.total), 0);
    const ret = branchReturns.reduce((sum, r) => sum + moneyNumber(r.total), 0);
    const branchPurchases = purchases.filter(p => p.branch === branch && ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.total), 0);
    const purchasePaid = purchasePayments.filter(p => p.branch === branch && ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.amount), 0);
    const lowStock = (stock[branch] || []).filter(item => item.quantity > 0 && item.quantity <= item.minThreshold).length;
    const outStock = (stock[branch] || []).filter(item => item.quantity <= 0).length;
    const openCredit = [
      ...(creditSales[branch] || []).map(c => moneyNumber(c.creditAmount)),
    ].reduce((a, b) => a + b, 0);
    const lastClosure = cashierClosures.find(c => c.branch === branch && ownerInRange(c.createdAt, from, to));
    const cash = localBills.reduce((sum, b) => sum + (b.paymentMode === 'cash' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.cash) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('cash') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    const upi = localBills.reduce((sum, b) => sum + (b.paymentMode === 'upi' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.upi) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('upi') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    const card = localBills.reduce((sum, b) => sum + (b.paymentMode === 'card' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.card) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('card') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    return {
      unit, sales: gross, netSales: Math.max(0, gross - ret), cash, upi, card, credit: openCredit,
      expenses: purchasePaid, purchases: branchPurchases, pendingPayments: Math.max(0, branchPurchases - purchasePaid),
      stockAlerts: lowStock + outStock + (incoming[branch] || []).filter(i => !i.confirmed).length,
      closureStatus: lastClosure ? (Math.abs(lastClosure.difference) > 0 ? 'Difference in closure' : 'Closed') : 'Pending closure',
      keyAlert: `${(advanceOrders[branch] || []).filter(a => a.status === 'pending').length} advance · ${lowStock + outStock} stock alerts`,
    };
  }), [ownerLedger.closureRows, ownerLedger.savedClosures, orders, sales, stock, incoming, advanceOrders, creditSales, bills, returns, purchases, purchasePayments, cashierClosures, storeOrders, from, to]);

  // CHANGE 4a: filter by selected view
  const visibleRows = branchRows.filter(r =>
    unitView === 'sales' ? SALES_UNITS.includes(r.unit) : OPS_UNITS.includes(r.unit)
  );

  // CHANGE 4c: payment chart data for sales branches
  const paymentChartData = visibleRows
    .filter(r => SALES_UNITS.includes(r.unit))
    .map(r => ({
      name: r.unit.replace(' Branch', ''),
      Cash: r.cash, UPI: r.upi, Card: r.card, Credit: r.credit,
    }));

  const totals = branchRows.reduce((acc, row) => ({
    sales: acc.sales + row.sales,
    netSales: acc.netSales + row.netSales,
    purchases: acc.purchases + row.purchases,
    expenses: acc.expenses + row.expenses,
    pending: acc.pending + row.pendingPayments,
    alerts: acc.alerts + row.stockAlerts,
  }), { sales: 0, netSales: 0, purchases: 0, expenses: 0, pending: 0, alerts: 0 });

  // chartRows no longer used — replaced by grouped payment chart in CHANGE 4c

  const PRESET_OPTIONS: Array<{ label: string; value: OwnerDatePreset }> = [
    { label: 'Today',      value: 'today' },
    { label: 'Yesterday',  value: 'yesterday' },
    { label: '7 Days',     value: '7d' },
    { label: '15 Days',    value: '15d' },
    { label: '1 Month',    value: '30d' },
    { label: 'This Month', value: 'month' },
  ];

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        {PRESET_OPTIONS.map(option => (
          <button key={option.value} type="button" onClick={() => setPreset(option.value)} className={cn(preset === option.value && 'is-active')}>
            {option.label}
          </button>
        ))}
        <button type="button" onClick={() => ownerCsvDownload('owner-branch-overview.csv', branchRows.map(r => ({ Unit: r.unit, Sales: r.sales, NetSales: r.netSales, Purchases: r.purchases, PendingPayments: r.pendingPayments, Alerts: r.stockAlerts, Closure: r.closureStatus })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>

      {/* CHANGE 4a: Sales Branches vs Internal Operations toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
        <button onClick={() => setUnitView('sales')}
          className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            unitView === 'sales' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
          Sales Branches
        </button>
        <button onClick={() => setUnitView('ops')}
          className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            unitView === 'ops' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
          Internal Operations
        </button>
      </div>

      <section className="owner-metric-grid wide">
        <OwnerMetricCard icon={<IndianRupee className="size-5" />} label="Gross Sales" value={formatCurrency(totals.sales)} sub="Cafe + branches" tone="green" />
        <OwnerMetricCard icon={<TrendingUp className="size-5" />} label="Net Sales" value={formatCurrency(totals.netSales)} sub="After returns" tone="blue" />
        <OwnerMetricCard icon={<ShoppingBag className="size-5" />} label="Purchases" value={formatCurrency(totals.purchases)} sub="Store + branches" tone="purple" />
        <OwnerMetricCard icon={<WalletCards className="size-5" />} label="Pending Payments" value={formatCurrency(totals.pending)} sub="Credit + supplier" tone="amber" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Owner Alerts" value={totals.alerts} sub="Stock and sync alerts" tone={totals.alerts ? 'red' : 'green'} />
      </section>

      {/* CHANGE 4c: Grouped payment bar chart for sales branches */}
      {unitView === 'sales' && paymentChartData.length > 0 && (
        <section className="owner-panel">
          <div className="owner-panel-head"><div><span>Payment Breakdown by Branch</span><h3>Cash · UPI · Card · Credit</h3></div></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={paymentChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Cash"   fill="#126d52" radius={[4, 4, 0, 0]} />
              <Bar dataKey="UPI"    fill="#5BA3C9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Card"   fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Credit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* CHANGE 4b: Better branch cards with color-coded left border */}
      <section className="owner-business-grid">
        {visibleRows.map(row => {
          const borderClass = row.closureStatus.toLowerCase().includes('pending') ? 'border-l-4 border-amber-400'
            : row.closureStatus.toLowerCase().includes('difference') ? 'border-l-4 border-red-500'
            : 'border-l-4 border-emerald-500';
          const badgeClass = row.closureStatus.toLowerCase().includes('pending') ? 'warn'
            : row.closureStatus.toLowerCase().includes('difference') ? 'danger'
            : '';
          return (
            <article key={row.unit} className={cn('owner-business-card', borderClass)}>
              <div className="owner-business-card-head">
                <div><span>{row.unit}</span><strong>{formatCurrency(row.netSales)}</strong></div>
                <em className={badgeClass}>{row.closureStatus}</em>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-2 border-y border-border/50 my-2">
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">Cash</span><b className="font-semibold">{formatCurrency(row.cash)}</b></p>
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">UPI</span><b className="font-semibold">{formatCurrency(row.upi)}</b></p>
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">Card</span><b className="font-semibold">{formatCurrency(row.card)}</b></p>
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">Credit</span><b className="font-semibold">{formatCurrency(row.credit)}</b></p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-1">
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">Purchases</span><b className="font-semibold">{formatCurrency(row.purchases)}</b></p>
                <p className="flex justify-between text-xs"><span className="text-muted-foreground">Expenses</span><b className="font-semibold">{formatCurrency(row.expenses)}</b></p>
              </div>
              <footer><AlertTriangle className="size-4" />{row.keyAlert}</footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}

// ── Daily Closure Tab ────────────────────────────────────────────────────────
function OwnerDailyClosureTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { bills, returns, purchasePayments, bankDeposits, cashierClosures, cashMovements } = useBranchOpsStore();
  const [date, setDate] = useState(ownerDateInput());
  const [branch, setBranch] = useState<'all' | Branch>('all');
  const ownerLedger = useBranchLedger(date, date, ['VRSNB', 'SNB', 'Hosur']);

  useEffect(() => { startPolling(7); return () => stopPolling(); }, [startPolling, stopPolling]);

  const rows: OwnerClosureRow[] = useMemo(() => OWNER_FULL_BRANCHES.map(b => {
    if (b === 'Cafe') {
      const dayOrders = orders.filter(o => ownerLocalDay(o.createdAt) === date && o.status === 'served');
      const gross = dayOrders.reduce((sum, o) => sum + moneyNumber(o.total), 0);
      const cash = dayOrders.reduce((sum, o) => sum + (o.paymentType === 'cash' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.cash) : 0), 0);
      const upi = dayOrders.reduce((sum, o) => sum + (o.paymentType === 'upi' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.upi) : 0), 0);
      const card = dayOrders.reduce((sum, o) => sum + (o.paymentType === 'card' ? moneyNumber(o.total) : o.paymentType === 'part_payment' ? moneyNumber(o.paymentBreakdown?.card) : 0), 0);
      const credit = dayOrders.reduce((sum, o) => sum + (o.paymentType === 'credit' || o.paymentType === 'unpaid' ? moneyNumber(o.total) : 0), 0);
      return { branch: ownerBranchDisplay(b), opening: 0, grossSales: gross, returns: 0, netSales: gross, cash, upi, card, credit, expenses: 0, purchases: 0, bankDeposits: 0, expectedCash: cash, countedCash: 0, difference: 0, status: 'Pending' as OwnerClosureRow['status'], closedBy: 'Cafe cashier', closedAt: '', remarks: 'Cafe closure is verified in Daily Closure module.' };
    }
    const ledger = ownerLedger.closureByBranchDate.get(`${b}:${date}`);
    const savedLedgerClosure = ownerLedger.savedClosureByBranchDate.get(`${b}:${date}`);
    if (ledger) {
      const gross = ownerLedger.toNumber(ledger.sales_total) + ownerLedger.toNumber(ledger.advance_collected) + ownerLedger.toNumber(ledger.advance_balance_collected);
      const ret = ownerLedger.toNumber(savedLedgerClosure?.refunds || 0);
      const cash = ownerLedger.toNumber(ledger.cash_total);
      const upi = ownerLedger.toNumber(ledger.upi_total);
      const card = ownerLedger.toNumber(ledger.card_total);
      const credit = ownerLedger.toNumber(ledger.credit_billed);
      const expenses = ownerLedger.toNumber(savedLedgerClosure?.expenses || 0);
      const expectedCash = savedLedgerClosure ? ownerLedger.toNumber(savedLedgerClosure.expected_cash) : Math.max(0, cash - expenses);
      const countedCash = savedLedgerClosure ? ownerLedger.toNumber(savedLedgerClosure.actual_cash) : 0;
      const difference = savedLedgerClosure ? ownerLedger.toNumber(savedLedgerClosure.difference) : 0;
      return {
        branch: ownerBranchDisplay(b), opening: ownerLedger.toNumber(savedLedgerClosure?.opening_cash || 0), grossSales: gross, returns: ret, netSales: Math.max(0, gross - ret), cash, upi, card, credit,
        expenses, purchases: expenses, bankDeposits: 0, expectedCash, countedCash, difference,
        status: (savedLedgerClosure ? (Math.abs(difference) > 0 ? 'Difference' : 'Completed') : 'Pending') as OwnerClosureRow['status'],
        closedBy: savedLedgerClosure?.cashier || 'Pending', closedAt: savedLedgerClosure?.created_at || '', remarks: savedLedgerClosure?.notes || (savedLedgerClosure ? 'Closed from Supabase' : 'Closure not submitted'),
      };
    }
    const dayBills = bills.filter(bill => bill.branch === b && ownerLocalDay(bill.createdAt) === date && bill.status !== 'Returned');
    const dayReturns = returns.filter(ret => ret.branch === b && ownerLocalDay(ret.createdAt) === date);
    const dayPayments = purchasePayments.filter(pay => pay.branch === b && ownerLocalDay(pay.createdAt) === date).reduce((sum, p) => sum + moneyNumber(p.amount), 0);
    const dayDeposits = bankDeposits.filter(dep => dep.branch === b && ownerLocalDay(dep.createdAt) === date).reduce((sum, d) => sum + moneyNumber(d.amount), 0);
    const dayExpenses = cashMovements.filter(m => m.branch === b && ownerLocalDay(m.dateTime) === date && m.direction === 'out').reduce((sum, m) => sum + moneyNumber(m.amount), 0);
    const closure = cashierClosures.find(c => c.branch === b && ownerLocalDay(c.createdAt) === date);
    const gross = dayBills.reduce((sum, bill) => sum + moneyNumber(bill.total), 0);
    const ret = dayReturns.reduce((sum, r) => sum + moneyNumber(r.total), 0);
    const cash = dayBills.reduce((sum, bill) => sum + (bill.paymentMode === 'cash' ? moneyNumber(bill.total) : bill.paymentMode === 'split' ? moneyNumber(bill.split?.cash) : 0), 0);
    const upi = dayBills.reduce((sum, bill) => sum + (bill.paymentMode === 'upi' ? moneyNumber(bill.total) : bill.paymentMode === 'split' ? moneyNumber(bill.split?.upi) : 0), 0);
    const card = dayBills.reduce((sum, bill) => sum + (bill.paymentMode === 'card' ? moneyNumber(bill.total) : bill.paymentMode === 'split' ? moneyNumber(bill.split?.card) : 0), 0);
    const credit = dayBills.reduce((sum, bill) => sum + (bill.paymentMode === 'credit' ? moneyNumber(bill.total) : 0), 0);
    const expectedCash = closure?.expectedCash ?? Math.max(0, cash - dayPayments - dayExpenses - dayDeposits);
    const countedCash = closure?.closingCash ?? 0;
    const difference = closure?.difference ?? (closure ? countedCash - expectedCash : 0);
    return {
      branch: ownerBranchDisplay(b), opening: closure?.openingCash ?? 0, grossSales: gross, returns: ret, netSales: Math.max(0, gross - ret), cash, upi, card, credit,
      expenses: dayExpenses, purchases: dayPayments, bankDeposits: dayDeposits, expectedCash, countedCash, difference,
      status: (closure ? (Math.abs(difference) > 0 ? 'Difference' : 'Completed') : 'Pending') as OwnerClosureRow['status'],
      closedBy: closure?.cashier || 'Pending', closedAt: closure?.createdAt || '', remarks: closure?.notes || (closure ? 'Closed' : 'Closure not submitted'),
    };
  }).filter(row => branch === 'all' || row.branch === ownerBranchDisplay(branch)), [ownerLedger.closureByBranchDate, ownerLedger.savedClosureByBranchDate, orders, bills, returns, purchasePayments, bankDeposits, cashierClosures, cashMovements, date, branch]);

  const totals = rows.reduce((acc, r) => ({ net: acc.net + r.netSales, cash: acc.cash + r.cash, diff: acc.diff + r.difference, pending: acc.pending + (r.status === 'Pending' ? 1 : 0) }), { net: 0, cash: 0, diff: 0, pending: 0 });

  const print = () => ownerPrintSection('Owner Daily Closure Overview', `<table><thead><tr><th>Branch</th><th>Status</th><th>Net sales</th><th>Cash</th><th>Expected cash</th><th>Counted cash</th><th>Difference</th><th>Closed by</th><th>Remarks</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.branch}</td><td>${r.status}</td><td>${r.netSales}</td><td>${r.cash}</td><td>${r.expectedCash}</td><td>${r.countedCash}</td><td>${r.difference}</td><td>${r.closedBy}</td><td>${r.remarks}</td></tr>`).join('')}</tbody></table>`);

  return (
    <div className="owner-tab-stack">
      {/* CHANGE 8a: date presets */}
      <OwnerToolbar>
        <button type="button" onClick={() => setDate(ownerDateInput())}
          className={cn(date === ownerDateInput() && 'is-active')}>Today</button>
        <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate()-1); setDate(ownerDateInput(d)); }}>Yesterday</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select value={branch} onChange={e => setBranch(e.target.value as 'all' | Branch)}><option value="all">All business units</option>{OWNER_FULL_BRANCHES.map(b => <option key={b} value={b}>{ownerBranchDisplay(b)}</option>)}</select>
        <button type="button" onClick={print}><Printer className="size-4" />Print</button>
        <button type="button" onClick={() => ownerCsvDownload('owner-daily-closure.csv', rows.map(r => ({ Branch: r.branch, Status: r.status, Opening: r.opening, TotalSales: r.grossSales, Cash: r.cash, UPI: r.upi, Card: r.card, Credit: r.credit, Returns: r.returns, NetSales: r.netSales, Expenses: r.expenses, PurchasePayments: r.purchases, BankDeposits: r.bankDeposits, Closing: r.expectedCash, Difference: r.difference, ClosedBy: r.closedBy, ClosedAt: ownerFmtDateTime(r.closedAt), Remarks: r.remarks })))}><FileSpreadsheet className="size-4" />Export</button>
      </OwnerToolbar>

      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<Receipt className="size-5" />} label="Net Sales" value={formatCurrency(totals.net)} tone="green" />
        <OwnerMetricCard icon={<Banknote className="size-5" />} label="Cash Expected" value={formatCurrency(totals.cash)} tone="blue" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Difference" value={formatCurrency(totals.diff)} tone={Math.abs(totals.diff) > 0 ? 'red' : 'green'} />
        <OwnerMetricCard icon={<Clock className="size-5" />} label="Pending Closures" value={totals.pending} tone={totals.pending ? 'amber' : 'green'} />
      </section>

      {/* CHANGE 8b: two-column cash flow layout + color-coded left border */}
      <section className="owner-business-grid">
        {rows.map(row => {
          const borderClass = row.status === 'Completed' ? 'border-l-4 border-emerald-500'
            : row.status === 'Difference' ? 'border-l-4 border-red-500'
            : 'border-l-4 border-amber-400';
          return (
            <article key={row.branch} className={cn('owner-business-card closure', borderClass)}>
              <div className="owner-business-card-head">
                <div><span>{row.branch}</span><strong>{formatCurrency(row.netSales)}</strong></div>
                <em className={cn(row.status === 'Pending' && 'warn', row.status === 'Difference' && 'danger')}>{row.status}</em>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Cash Flow</p>
                  <div className="space-y-0.5 text-xs">
                    <p className="flex justify-between"><span>Opening</span><b>{formatCurrency(row.opening)}</b></p>
                    <p className="flex justify-between text-emerald-700"><span>(+) Cash Sales</span><b>{formatCurrency(row.cash)}</b></p>
                    <p className="flex justify-between text-emerald-700"><span>(+) UPI</span><b>{formatCurrency(row.upi)}</b></p>
                    <p className="flex justify-between text-emerald-700"><span>(+) Card</span><b>{formatCurrency(row.card)}</b></p>
                    <p className="flex justify-between text-red-600"><span>(−) Returns</span><b>{formatCurrency(row.returns)}</b></p>
                    <p className="flex justify-between text-red-600"><span>(−) Expenses</span><b>{formatCurrency(row.expenses)}</b></p>
                    <p className="flex justify-between text-red-600"><span>(−) Purchase Pay.</span><b>{formatCurrency(row.purchases)}</b></p>
                    <p className="flex justify-between text-red-600"><span>(−) Bank Deposit</span><b>{formatCurrency(row.bankDeposits)}</b></p>
                    <p className="flex justify-between font-bold border-t pt-1 mt-1"><span>= Expected Cash</span><b>{formatCurrency(row.expectedCash)}</b></p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Summary</p>
                  <div className="space-y-0.5 text-xs">
                    <p className="flex justify-between"><span>Credit Sales</span><b>{formatCurrency(row.credit)}</b></p>
                    <p className="flex justify-between"><span>Net Sales</span><b>{formatCurrency(row.netSales)}</b></p>
                    <p className={cn('flex justify-between font-bold', Math.abs(row.difference) > 100 ? 'text-red-600' : Math.abs(row.difference) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                      <span>Difference</span><b>{formatCurrency(row.difference)}</b>
                    </p>
                  </div>
                </div>
              </div>
              <footer><ShieldCheck className="size-4" />{row.closedBy} · {ownerFmtDateTime(row.closedAt)} · {row.remarks}</footer>
            </article>
          );
        })}
      </section>

      {/* CHANGE 8c: Summary totals row */}
      {rows.length > 0 && (
        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
          <h4 className="font-bold text-sm mb-3">Day Totals — {date}</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              ['Total Sales', formatCurrency(rows.reduce((s, r) => s + r.grossSales, 0))],
              ['Total Cash',  formatCurrency(rows.reduce((s, r) => s + r.cash, 0))],
              ['Total UPI',   formatCurrency(rows.reduce((s, r) => s + r.upi, 0))],
              ['Total Credit',formatCurrency(rows.reduce((s, r) => s + r.credit, 0))],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl bg-white p-3 border border-slate-200">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-black text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Owner Alerts Tab ─────────────────────────────────────────────────────────
function OwnerAlertsTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { stock, creditSales, fetchBranchData } = useBranchStore();
  const { purchases, cashierClosures, notifications, storeOrders, returns } = useBranchOpsStore();
  const { invoices, load } = useInvoiceStore();
  const [tone, setTone] = useState<'all' | OwnerAlertTone>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => { startPolling(7); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { OWNER_FULL_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);
  useEffect(() => { load(); }, [load]);

  const alerts: OwnerAlert[] = useMemo(() => {
    const today = ownerDateInput();
    const list: OwnerAlert[] = [];
    // CHANGE 9a: use only STOCK_BRANCHES (VRSNB, SNB, Hosur) to avoid Cafe double-count
    const STOCK_BRANCHES: Branch[] = ['VRSNB', 'SNB', 'Hosur'];
    STOCK_BRANCHES.forEach(branch => {
      const stockRows = stock[branch] || [];
      const out = stockRows.filter(item => item.quantity <= 0);
      const low = stockRows.filter(item => item.quantity > 0 && item.minThreshold > 0 && item.quantity <= item.minThreshold);
      if (out.length) list.push({
        title: `${ownerBranchDisplay(branch)} — Out of stock`,
        value: String(out.length),
        note: out.slice(0, 3).map(i => i.itemName).join(', ') + (out.length > 3 ? `… +${out.length - 3} more` : ''),
        tone: 'danger', branch,
      });
      if (low.length) list.push({
        title: `${ownerBranchDisplay(branch)} — Low stock`,
        value: String(low.length),
        note: `Needs restocking before running out`,
        tone: 'warning', branch,
      });
    });
    OWNER_FULL_BRANCHES.forEach(branch => {
      const dbCredits = (creditSales[branch] || []).filter(c => c.status !== 'settled' && c.dueDate && new Date(c.dueDate) < new Date());
      if (dbCredits.length) list.push({ title: 'Overdue branch credit', value: String(dbCredits.length), note: `${ownerBranchDisplay(branch)} credit due follow-up`, tone: 'danger', branch });
      const closedToday = cashierClosures.some(c => c.branch === branch && ownerLocalDay(c.createdAt) === today);
      if (branch !== 'Cafe' && !closedToday) list.push({ title: 'Daily closure pending', value: '1', note: `${ownerBranchDisplay(branch)} closure not submitted for today`, tone: 'warning', branch });
    });
    const pendingPurchases = purchases.filter(p => (p.syncStatus || 'Not Synced') !== 'Synced');
    if (pendingPurchases.length) list.push({ title: 'Purchase stock sync pending', value: String(pendingPurchases.length), note: 'Purchased quantities not fully reflected in stock', tone: 'warning' });
    const pendingInvoice = invoices.filter(i => i.status === 'pending_review');
    if (pendingInvoice.length) list.push({ title: 'Store invoices pending review', value: String(pendingInvoice.length), note: 'Owner can review purchase exposure', tone: 'warning' });
    const pendingDispatch = storeOrders.filter(o => ['Pending Store Confirmation', 'Confirmed', 'Ready'].includes(o.status));
    if (pendingDispatch.length) list.push({ title: 'Pending dispatch / store orders', value: String(pendingDispatch.length), note: 'Packing or store confirmation pending', tone: 'neutral' });
    const todayReturns = returns.filter(r => ownerLocalDay(r.createdAt) === today);
    if (todayReturns.reduce((s, r) => s + r.total, 0) > 0) list.push({ title: 'Return amount today', value: formatCurrency(todayReturns.reduce((s, r) => s + r.total, 0)), note: 'Review reasons and staff notes', tone: 'warning' });
    const cancelled = orders.filter(o => ownerLocalDay(o.createdAt) === today && o.status === 'cancelled');
    if (cancelled.length) list.push({ title: 'Cafe cancelled orders', value: String(cancelled.length), note: 'Check wastage or service gaps', tone: 'neutral' });
    notifications.filter(n => n.status !== 'Resolved').slice(0, 6).forEach(n => list.push({ title: n.title, value: n.status, note: `${ownerBranchDisplay(n.branch)} · ${n.details}`, tone: n.type === 'Stock Dispute' ? 'danger' : 'neutral', branch: n.branch }));
    return list;
  }, [orders, stock, creditSales, purchases, cashierClosures, notifications, storeOrders, returns, invoices]);

  const visible = alerts.filter(a => (tone === 'all' || a.tone === tone) && !dismissed.has(`${a.title}-${a.branch ?? ''}`));

  // CHANGE 9b: grouped by tone
  const criticalAlerts    = visible.filter(a => a.tone === 'danger');
  const warningAlerts     = visible.filter(a => a.tone === 'warning');
  const operationalAlerts = visible.filter(a => a.tone === 'neutral');

  // CHANGE 9c: branches with any alert
  const branchesWithAlerts = new Set(alerts.filter(a => a.branch).map(a => a.branch)).size;
  const dismissAlert = (a: OwnerAlert) => setDismissed(prev => new Set([...prev, `${a.title}-${a.branch ?? ''}`]));

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        {(['all', 'danger', 'warning', 'neutral', 'success'] as const).map(option => <button key={option} type="button" onClick={() => setTone(option)} className={cn(tone === option && 'is-active')}>{option === 'all' ? 'All alerts' : option}</button>)}
        <button type="button" onClick={() => ownerCsvDownload('owner-alerts.csv', visible.map(a => ({ Alert: a.title, Value: a.value, Branch: a.branch || 'Business', Tone: a.tone, Details: a.note })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>
      {/* CHANGE 9c: improved KPI metrics */}
      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<XCircle className="size-5" />} label="Critical" value={alerts.filter(a => a.tone === 'danger').length} tone="red" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Warnings" value={alerts.filter(a => a.tone === 'warning').length} tone="amber" />
        <OwnerMetricCard icon={<Bell className="size-5" />} label="Operational" value={alerts.filter(a => a.tone === 'neutral').length} tone="blue" />
        <OwnerMetricCard icon={<Store className="size-5" />} label="Branches Affected" value={branchesWithAlerts} tone="purple" />
      </section>

      {/* CHANGE 9b: Grouped alert sections */}
      {criticalAlerts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-red-700 flex items-center gap-1.5"><XCircle className="size-4" /> Critical Alerts</h3>
          <div className="space-y-2">
            {criticalAlerts.map((alert, index) => (
              <article key={`${alert.title}-${index}`} className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="flex gap-3 items-start">
                  <strong className="text-xl font-black text-red-700 tabular-nums shrink-0">{alert.value}</strong>
                  <div>
                    <h3 className="text-sm font-bold text-red-900">{alert.title}</h3>
                    <p className="text-xs text-red-700 mt-0.5">{alert.note}</p>
                    {alert.branch && <em className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold mt-1 inline-block">{ownerBranchDisplay(alert.branch)}</em>}
                  </div>
                </div>
                <button onClick={() => dismissAlert(alert)} className="text-[10px] text-red-500 hover:text-red-700 shrink-0 border border-red-200 rounded px-1.5 py-0.5">Dismiss</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {warningAlerts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="size-4" /> Warning Alerts</h3>
          <div className="space-y-2">
            {warningAlerts.map((alert, index) => (
              <article key={`${alert.title}-${index}`} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="flex gap-3 items-start">
                  <strong className="text-xl font-black text-amber-700 tabular-nums shrink-0">{alert.value}</strong>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">{alert.title}</h3>
                    <p className="text-xs text-amber-700 mt-0.5">{alert.note}</p>
                    {alert.branch && <em className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold mt-1 inline-block">{ownerBranchDisplay(alert.branch)}</em>}
                  </div>
                </div>
                <button onClick={() => dismissAlert(alert)} className="text-[10px] text-amber-500 hover:text-amber-700 shrink-0 border border-amber-200 rounded px-1.5 py-0.5">Dismiss</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {operationalAlerts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-600 flex items-center gap-1.5"><Bell className="size-4" /> Operational Notes</h3>
          <div className="space-y-2">
            {operationalAlerts.map((alert, index) => (
              <article key={`${alert.title}-${index}`} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="flex gap-3 items-start">
                  <strong className="text-xl font-black text-slate-700 tabular-nums shrink-0">{alert.value}</strong>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{alert.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{alert.note}</p>
                    {alert.branch && <em className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold mt-1 inline-block">{ownerBranchDisplay(alert.branch)}</em>}
                  </div>
                </div>
                <button onClick={() => dismissAlert(alert)} className="text-[10px] text-slate-500 hover:text-slate-700 shrink-0 border border-slate-300 rounded px-1.5 py-0.5">Dismiss</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {visible.length === 0 && <EmptyOwnerState title="No matching owner alerts" message="Critical issues will appear here automatically from sales, credit, stock, closure and dispatch flows." />}
    </div>
  );
}

// ── Purchases & Store Visibility Tab ─────────────────────────────────────────
function OwnerPurchasesTab() {
  const { invoices, load } = useInvoiceStore();
  const { orders: purchaseOrders, load: loadOrders } = usePurchaseOrderStore();
  const { purchases, purchasePayments } = useBranchOpsStore();
  const [fromDate, setFromDate] = useState(ownerDateInput(ownerPresetStart('30d')));
  const [toDate, setToDate] = useState(ownerDateInput());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [dbLines, setDbLines] = useState<OwnerStorePurchaseLine[]>([]);

  useEffect(() => { load(); loadOrders(); }, [load, loadOrders]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('store_invoices').select('*').order('created_at', { ascending: false });
      if (!alive || !data) return;
      const rows: OwnerStorePurchaseLine[] = (data as Array<Record<string, unknown>>).flatMap((invoice) => {
        const lineItems = (invoice.line_items as Array<Record<string, unknown>> | null) || [];
        const paidAmount = Number(invoice.paid_amount || 0);
        const grandTotal = Number(invoice.grand_total || 0);
        return lineItems.map((line, index) => ({
          id: `${invoice.id}-${index}`,
          supplierName: String(invoice.supplier_name || 'Unknown supplier'),
          invoiceNumber: String(invoice.invoice_number || '—'),
          purchaseDate: String(invoice.delivery_date || invoice.created_at || ''),
          itemName: String(line.itemName || line.item_name || line.materialName || 'Item'),
          quantity: Number(line.quantity || 0),
          unit: String(line.unit || 'unit'),
          rate: Number(line.pricePerUnit || line.price_per_unit || 0),
          total: Number(line.totalPrice || line.total_price || 0),
          // FIX (MD Bug #6): when grandTotal === 0 (malformed invoice), don't prorate per-line —
          // treat paidAmount as applying to the invoice as a whole to avoid wildly overstating
          // paid amounts (paidAmount * lineTotal / 1 >> actual payment).
          paidAmount: (lineItems.length && grandTotal > 0) ? paidAmount * (Number(line.totalPrice || line.total_price || 0) / grandTotal) : (lineItems.length ? 0 : paidAmount),
          balanceAmount: (lineItems.length && grandTotal > 0) ? Math.max(0, (Number(line.totalPrice || line.total_price || 0)) - (paidAmount * (Number(line.totalPrice || line.total_price || 0) / grandTotal))) : (lineItems.length ? Number(line.totalPrice || line.total_price || 0) : Math.max(0, grandTotal - paidAmount)),
          paymentMethod: String(invoice.payment_method || 'Not recorded'),
          purchaseStatus: String(invoice.purchase_status || invoice.status || 'pending_review'),
          stockSyncStatus: invoice.synced_to_stock ? 'Synced' : String(invoice.stock_sync_status || 'Not Synced'),
          remarks: String(invoice.remarks || invoice.notes || '—'),
        }));
      });
      setDbLines(rows);
    })();
    return () => { alive = false; };
  }, [invoices.length]);

  const fallbackLines: OwnerStorePurchaseLine[] = useMemo(() => invoices.flatMap((invoice, index) => invoice.lineItems.map((line, lineIndex) => ({
    id: `${invoice.id}-${lineIndex}`,
    supplierName: invoice.supplierName,
    invoiceNumber: invoice.invoiceNumber,
    purchaseDate: invoice.deliveryDate || invoice.createdAt,
    itemName: line.itemName,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.pricePerUnit,
    total: line.totalPrice,
    paidAmount: 0,
    balanceAmount: line.totalPrice,
    paymentMethod: 'Not recorded',
    purchaseStatus: invoice.status,
    stockSyncStatus: invoice.syncedToStock ? 'Synced' : 'Not Synced',
    remarks: invoice.notes || (index >= 0 ? 'Store invoice' : ''),
  }))), [invoices]);

  const lines = dbLines.length ? dbLines : fallbackLines;
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59`);
  const filtered = lines.filter(line => ownerInRange(line.purchaseDate, from, to) && (status === 'all' || line.purchaseStatus === status || line.stockSyncStatus === status) && `${line.supplierName} ${line.invoiceNumber} ${line.itemName}`.toLowerCase().includes(query.toLowerCase()));
  const branchPurchaseRows = purchases.filter(p => ownerInRange(p.createdAt, from, to));
  const totalPurchase = filtered.reduce((sum, line) => sum + line.total, 0) + branchPurchaseRows.reduce((sum, p) => sum + moneyNumber(p.total), 0);
  const paid = filtered.reduce((sum, line) => sum + line.paidAmount, 0) + purchasePayments.filter(p => ownerInRange(p.createdAt, from, to)).reduce((sum, p) => sum + moneyNumber(p.amount), 0);
  const pending = Math.max(0, totalPurchase - paid);
  // CHANGE 7: payment status donut data
  const paymentStatusData = [
    { name: 'Paid',    value: paid },
    { name: 'Pending', value: pending },
  ].filter(d => d.value > 0);

  const supplierRows = Object.values(filtered.reduce((acc, line) => {
    acc[line.supplierName] ||= { name: line.supplierName, Amount: 0 };
    acc[line.supplierName].Amount += line.total;
    return acc;
  }, {} as Record<string, { name: string; Amount: number }>)).sort((a, b) => b.Amount - a.Amount).slice(0, 8);
  const itemRows = Object.values(filtered.reduce((acc, line) => {
    acc[line.itemName] ||= { name: line.itemName, Quantity: 0, Amount: 0 };
    acc[line.itemName].Quantity += line.quantity;
    acc[line.itemName].Amount += line.total;
    return acc;
  }, {} as Record<string, { name: string; Quantity: number; Amount: number }>)).sort((a, b) => b.Amount - a.Amount).slice(0, 8);
  const statusOptions = ['all', ...Array.from(new Set(lines.flatMap(line => [line.purchaseStatus, line.stockSyncStatus]).filter(Boolean)))];

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        <div className="owner-search"><Search className="size-4" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Supplier, invoice or item" /></div>
        <select value={status} onChange={e => setStatus(e.target.value)}>{statusOptions.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</select>
        <button type="button" onClick={() => ownerCsvDownload('owner-store-purchases.csv', filtered.map(line => ({ Supplier: line.supplierName, Invoice: line.invoiceNumber, Date: ownerFmtDate(line.purchaseDate), Item: line.itemName, Quantity: line.quantity, Unit: line.unit, Rate: line.rate, Total: line.total, Paid: line.paidAmount, Balance: line.balanceAmount, PaymentMethod: line.paymentMethod, PurchaseStatus: line.purchaseStatus, StockSyncStatus: line.stockSyncStatus, Remarks: line.remarks })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>

      {/* CHANGE 7: Date preset pills */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'Last 7 Days',  days: 6 },
          { label: 'Last 15 Days', days: 14 },
          { label: 'Last Month',   days: 29 },
        ].map(p => (
          <button key={p.label} onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - p.days);
            setFromDate(ownerDateInput(d)); setToDate(ownerDateInput());
          }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-950 hover:text-white transition">
            {p.label}
          </button>
        ))}
      </div>

      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<ShoppingBag className="size-5" />} label="Total Purchases" value={formatCurrency(totalPurchase)} sub="Store + branch purchase invoices" tone="purple" />
        <OwnerMetricCard icon={<Banknote className="size-5" />} label="Paid Amount" value={formatCurrency(paid)} sub="Supplier payments captured" tone="green" />
        <OwnerMetricCard icon={<WalletCards className="size-5" />} label="Pending Payable" value={formatCurrency(pending)} sub="Needs payment follow-up" tone={pending ? 'amber' : 'green'} />
        <OwnerMetricCard icon={<Package className="size-5" />} label="Stock Sync Pending" value={filtered.filter(line => line.stockSyncStatus !== 'Synced').length} sub="Prevent missing stock" tone="red" />
        <OwnerMetricCard icon={<Receipt className="size-5" />} label="Purchase Orders" value={purchaseOrders.length} sub="Store purchase orders" tone="blue" />
      </section>

      <section className="owner-ops-grid compact">
        <div className="owner-panel">
          <div className="owner-panel-head"><div><span>Supplier-wise Purchase Amount</span><h3>Store purchase concentration</h3></div></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={supplierRows.length ? supplierRows : [{ name: 'No purchase', Amount: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="Amount" fill="#8b5cf6" radius={[8,8,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* CHANGE 7: Payment status donut */}
        {paymentStatusData.length > 0 && (
          <div className="owner-panel">
            <div className="owner-panel-head"><div><span>Payment Status</span><h3>Paid vs Pending</h3></div></div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={paymentStatusData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  <Cell fill="#126d52" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-4 px-4 pb-2">
              {paymentStatusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-sm" style={{ background: i === 0 ? '#126d52' : '#f59e0b' }} />
                  <span className="text-[10px] text-muted-foreground">{d.name}: {formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="owner-panel">
        <div className="owner-panel-head"><div><span>Item-wise Purchase Quantity</span><h3>Material movement</h3></div></div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={itemRows.length ? itemRows : [{ name: 'No item', Quantity: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="Quantity" fill="#126d52" radius={[8,8,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="owner-table-card">
        <div className="owner-panel-head"><div><span>Store Purchase Register</span><h3>Supplier, invoice, item, payment and stock sync visibility</h3></div></div>
        <div className="overflow-x-auto">
          <table className="owner-data-table">
            <thead><tr><th>Supplier / Invoice</th><th>Date</th><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th><th>Status</th><th>Sync</th><th>Remarks</th></tr></thead>
            <tbody>
              {filtered.map(line => (
                <tr key={line.id}>
                  <td><strong>{line.supplierName}</strong><span>{line.invoiceNumber}</span></td><td>{ownerFmtDate(line.purchaseDate)}</td><td>{line.itemName}</td><td>{line.quantity} {line.unit}</td><td>{formatCurrency(line.rate)}</td><td>{formatCurrency(line.total)}</td><td>{formatCurrency(line.paidAmount)}</td><td>{formatCurrency(line.balanceAmount)}</td><td>{line.paymentMethod}</td><td><em className="owner-status warn">{line.purchaseStatus}</em></td><td><em className={cn('owner-status', line.stockSyncStatus === 'Synced' ? 'ok' : 'warn')}>{line.stockSyncStatus}</em></td><td>{line.remarks}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={12}><EmptyOwnerState title="No store purchases found" message="Create store invoices or adjust filters to see purchase visibility." /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OwnerStockVarianceTab() {
  const { stockVarianceRecords } = useBranchOpsStore();
  const rows = stockVarianceRecords
    .slice()
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  const shortCount = rows.filter(row => row.difference > 0).length;
  const excessCount = rows.filter(row => row.difference < 0).length;

  return (
    <section className="owner-section">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          Difference between system stock and physical stock count after SNB Admin confirmation
        </p>
        <h2 className="mt-1 font-display text-2xl font-black text-foreground">Stock Variance</h2>
      </div>
      <OwnerToolbar>
        <button
          type="button"
          onClick={() =>
            ownerCsvDownload(
              'owner-stock-variance.csv',
              rows.map(row => ({
                Date: ownerFmtDateTime(row.createdAt),
                Branch: row.branch,
                Report: row.reportNo,
                Item: row.itemName,
                Unit: row.unit || '',
                SystemQty: row.systemQty,
                PhysicalQty: row.physicalQty,
                Difference: row.difference,
                ReportedBy: row.reportedBy,
                ConfirmedBy: row.confirmedBy,
              })),
            )
          }
        >
          <Download className="size-4" />Export
        </button>
      </OwnerToolbar>
      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Variance Lines" value={rows.length} tone="amber" />
        <OwnerMetricCard icon={<ArrowDownRight className="size-5" />} label="Short Count" value={shortCount} tone="red" />
        <OwnerMetricCard icon={<ArrowUpRight className="size-5" />} label="Excess Count" value={excessCount} tone="blue" />
      </section>
      <section className="owner-table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Branch</th>
              <th>Report</th>
              <th>Item</th>
              <th>System</th>
              <th>Physical</th>
              <th>Difference</th>
              <th>Reported By</th>
              <th>Confirmed By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{ownerFmtDateTime(row.createdAt)}</td>
                <td>{ownerBranchDisplay(row.branch)}</td>
                <td><strong>{row.reportNo}</strong></td>
                <td>{row.itemName}</td>
                <td>{row.systemQty} {row.unit}</td>
                <td>{row.physicalQty} {row.unit}</td>
                <td><em className={cn('owner-status', row.difference === 0 ? 'ok' : row.difference > 0 ? 'danger' : 'warn')}>{row.difference}</em></td>
                <td>{row.reportedBy}</td>
                <td>{row.confirmedBy}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9}>
                  <EmptyOwnerState
                    title="No stock variance yet"
                    message="Variance lines will appear here once SNB Admin confirms a receiver stock-count report."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
type OwnerDashboardTab =
  | 'branches'
  | 'sales'
  | 'credit'
  | 'purchases'
  | 'closure'
  | 'variance'
  | 'alerts'
  | 'attendance'
  | 'waste';

export default function OwnerDashboard() {
  const [tab, setTab] = useState<OwnerDashboardTab>('branches');

  const tabs: Array<{ id: OwnerDashboardTab; label: string; icon: React.ReactNode; hint: string }> = [
    { id: 'branches',   label: 'Branch Overview',    icon: <Store         className="size-4" />, hint: 'Cafe, SNB, VRSNB, Hosur' },
    { id: 'sales',      label: 'Sales & Profit',     icon: <BarChart3     className="size-4" />, hint: 'Trends and payment split' },
    { id: 'credit',     label: 'Credit Tracking',    icon: <IndianRupee   className="size-4" />, hint: 'Pending collections' },
    { id: 'purchases',  label: 'Store Purchases',    icon: <ShoppingBag   className="size-4" />, hint: 'Supplier and invoice view' },
    { id: 'closure',    label: 'Daily Closure',      icon: <WalletCards   className="size-4" />, hint: 'All unit closing status' },
    { id: 'variance',   label: 'Stock Variance',     icon: <AlertTriangle className="size-4" />, hint: 'Physical stock differences' },
    { id: 'alerts',     label: 'Owner Alerts',       icon: <Bell          className="size-4" />, hint: 'Actionable risks' },
    { id: 'attendance', label: 'Staff & Payroll',    icon: <CalendarCheck className="size-4" />, hint: 'Attendance and advances' },
    { id: 'waste',      label: 'Waste & Loss',       icon: <Trash2        className="size-4" />, hint: 'Kitchen loss control' },
  ];

  return (
    <div className="owner-dashboard-screen dashboard-screen min-h-screen bg-transparent">
      <div className="owner-dashboard-shell">
        <aside className="owner-sidebar" aria-label="Owner dashboard sections">
          <div className="owner-sidebar-brand">
            <span>Owner Control</span>
            <strong>Business cockpit</strong>
          </div>
          <nav className="owner-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(tab === t.id && 'is-active')}
              >
                {t.icon}
                <span>{t.label}</span>
                <em>{t.hint}</em>
              </button>
            ))}
          </nav>
        </aside>

        <main className="owner-dashboard-body">
          {tab === 'branches'   && <BranchOverviewTab />}
          {tab === 'sales'      && <SalesOverviewTab />}
          {tab === 'credit'     && <OwnerCreditTab />}
          {tab === 'purchases'  && <OwnerPurchasesTab />}
          {tab === 'closure'    && <OwnerDailyClosureTab />}
          {tab === 'variance'   && <OwnerStockVarianceTab />}
          {tab === 'alerts'     && <OwnerAlertsTab />}
          {tab === 'attendance' && <AttendanceSalaryTab />}
          {tab === 'waste'      && <WasteLogsTab />}
        </main>
      </div>
    </div>
  );
}
