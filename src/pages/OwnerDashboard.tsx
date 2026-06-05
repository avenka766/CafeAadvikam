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
import { Link } from 'react-router-dom';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import type { Branch } from '@/branch/types';
import { BRANCH_LABELS } from '@/branch/types';
import { useInvoiceStore } from '@/bakery/invoiceStore';
import { usePurchaseOrderStore } from '@/bakery/purchaseOrderStore';
import { useMenuStore } from '@/stores/menuStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import OwnerCreditTab from '@/components/admin/OwnerCreditTab';
import KitchenWasteLogTab from '@/components/KitchenWasteLogTab';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
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

type OwnerDatePreset = 'today' | '7d' | '30d' | 'month';

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
  if (preset === 'today') d.setHours(0, 0, 0, 0);
  if (preset === '7d') d.setDate(d.getDate() - 6);
  if (preset === '30d') d.setDate(d.getDate() - 29);
  if (preset === 'month') d.setDate(1);
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

function OwnerCommandCenter() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, stock, incoming, advanceOrders, creditSales, fetchBranchData } = useBranchStore();
  const { items: menuItems, loadMenu } = useMenuStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { OWNER_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rangeStart = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') d.setHours(0, 0, 0, 0);
    else if (dateRange === '7d') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 30);
    return d;
  }, [dateRange]);

  const cafeServedInRange = useMemo(() =>
    orders.filter(order => order.status === 'served' && new Date(order.createdAt) >= rangeStart),
    [orders, rangeStart]);

  const todayOrders = useMemo(() =>
    orders.filter(order => isSameBusinessDay(order.createdAt, todayStart)),
    [orders, todayStart]);

  const todayServedCafe = todayOrders.filter(order => order.status === 'served');
  const activeKitchenOrders = todayOrders.filter(order => ['pending', 'preparing', 'ready'].includes(order.status));
  const cancelledToday = todayOrders.filter(order => order.status === 'cancelled');

  const cafePayment = useMemo(() => {
    const split = { cash: 0, upi: 0, card: 0, credit: 0, unpaid: 0 };
    todayServedCafe.forEach(order => {
      if (order.paymentType === 'cash') split.cash += order.total;
      else if (order.paymentType === 'upi') split.upi += order.total;
      else if (order.paymentType === 'card') split.card += order.total;
      else if (order.paymentType === 'credit') split.credit += order.total;
      else if (order.paymentType === 'part_payment' && order.paymentBreakdown) {
        split.cash += order.paymentBreakdown.cash;
        split.upi += order.paymentBreakdown.upi;
        split.card += order.paymentBreakdown.card;
      } else if (order.paymentType === 'unpaid') split.unpaid += order.total;
    });
    return split;
  }, [todayServedCafe]);

  const branchRows = useMemo(() => OWNER_BRANCHES.map((branch) => {
    const todaySales = (sales[branch] || []).filter(sale => isSameBusinessDay(sale.soldAt, todayStart));
    const rangeSales = (sales[branch] || []).filter(sale => new Date(sale.soldAt) >= rangeStart);
    const revenue = todaySales.reduce((sum, sale) => sum + (sale.unitPrice || 0) * sale.quantitySold, 0);
    const rangeRevenue = rangeSales.reduce((sum, sale) => sum + (sale.unitPrice || 0) * sale.quantitySold, 0);
    const qty = todaySales.reduce((sum, sale) => sum + sale.quantitySold, 0);
    const branchStock = stock[branch] || [];
    const lowStock = branchStock.filter(item => item.quantity > 0 && item.quantity <= item.minThreshold).length;
    const outStock = branchStock.filter(item => item.quantity <= 0).length;
    const pendingIncoming = (incoming[branch] || []).filter(item => !item.confirmed).length;
    const pendingAdvance = (advanceOrders[branch] || []).filter(order => order.status === 'pending').length;
    const openCredits = (creditSales[branch] || []).filter(credit => credit.status !== 'settled');
    const creditDue = openCredits.reduce((sum, credit) => sum + credit.creditAmount, 0);
    const overdueCredit = openCredits.filter(credit => credit.dueDate && new Date(credit.dueDate) < todayStart).length;

    const payment = { cash: 0, upi: 0, card: 0, advance: 0, credit: 0, other: 0 };
    todaySales.forEach(sale => {
      const amount = (sale.unitPrice || 0) * sale.quantitySold;
      const method = (sale.paymentMethod || '').toLowerCase();
      if (method.includes('cash')) payment.cash += amount;
      else if (method.includes('upi')) payment.upi += amount;
      else if (method.includes('card')) payment.card += amount;
      else if (method.includes('advance')) payment.advance += amount;
      else if (method.includes('credit')) payment.credit += amount;
      else payment.other += amount;
    });

    return { branch, todaySales, rangeSales, revenue, rangeRevenue, qty, lowStock, outStock, pendingIncoming, pendingAdvance, creditDue, overdueCredit, payment };
  }), [sales, stock, incoming, advanceOrders, creditSales, todayStart, rangeStart]);

  const branchTodayRevenue = branchRows.reduce((sum, row) => sum + row.revenue, 0);
  const branchRangeRevenue = branchRows.reduce((sum, row) => sum + row.rangeRevenue, 0);
  const cafeRevenue = cafeServedInRange.reduce((sum, order) => sum + order.total, 0);
  const todayCafeRevenue = todayServedCafe.reduce((sum, order) => sum + order.total, 0);
  const ownerTotalToday = todayCafeRevenue + branchTodayRevenue;
  const ownerRangeRevenue = cafeRevenue + branchRangeRevenue;
  const ownerOrdersToday = todayServedCafe.length + branchRows.reduce((sum, row) => sum + row.todaySales.length, 0);
  const avgTicketToday = ownerOrdersToday > 0 ? Math.round(ownerTotalToday / ownerOrdersToday) : 0;
  const leadingBranch = branchRows.reduce((best, row) => row.revenue > best.revenue ? row : best, branchRows[0]);

  const totalLowStock = branchRows.reduce((sum, row) => sum + row.lowStock, 0);
  const totalOutStock = branchRows.reduce((sum, row) => sum + row.outStock, 0);
  const pendingIncoming = branchRows.reduce((sum, row) => sum + row.pendingIncoming, 0);
  const pendingAdvance = branchRows.reduce((sum, row) => sum + row.pendingAdvance, 0);
  const overdueCreditCount = branchRows.reduce((sum, row) => sum + row.overdueCredit, 0);
  const creditExposure = branchRows.reduce((sum, row) => sum + row.creditDue, 0);
  const enabledMenu = menuItems.filter(item => item.enabled).length;
  const disabledMenu = menuItems.length - enabledMenu;

  const paymentRows = [
    { label: 'Cash in hand', value: cafePayment.cash + branchRows.reduce((sum, row) => sum + row.payment.cash, 0), icon: <Banknote className="size-5" /> },
    { label: 'UPI received', value: cafePayment.upi + branchRows.reduce((sum, row) => sum + row.payment.upi, 0), icon: <Smartphone className="size-5" /> },
    { label: 'Card received', value: cafePayment.card + branchRows.reduce((sum, row) => sum + row.payment.card, 0), icon: <CreditCard className="size-5" /> },
    { label: 'Credit / unpaid', value: cafePayment.credit + cafePayment.unpaid + branchRows.reduce((sum, row) => sum + row.payment.credit, 0), icon: <IndianRupee className="size-5" /> },
  ];
  const paymentTotal = Math.max(paymentRows.reduce((sum, row) => sum + row.value, 0), 1);

  const dailyPulse = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    return Array.from({ length: days }, (_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - index));
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const dateText = d.toDateString();
      const cafe = orders
        .filter(order => order.status === 'served' && new Date(order.createdAt).toDateString() === dateText)
        .reduce((sum, order) => sum + order.total, 0);
      const bakery = OWNER_BRANCHES.reduce((sum, branch) => sum + (sales[branch] || [])
        .filter(sale => new Date(sale.soldAt).toDateString() === dateText)
        .reduce((branchSum, sale) => branchSum + (sale.unitPrice || 0) * sale.quantitySold, 0), 0);
      return { date: label, cafe, bakery, total: cafe + bakery };
    });
  }, [dateRange, orders, sales]);

  const topCafeItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    todayServedCafe.forEach(order => order.items.forEach(item => {
      const existing = map.get(item.menuItem.name) || { qty: 0, revenue: 0 };
      existing.qty += item.quantity;
      existing.revenue += item.menuItem.price * item.quantity;
      map.set(item.menuItem.name, existing);
    }));
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [todayServedCafe]);

  const alerts = [
    totalOutStock > 0 ? { title: 'Out-of-stock items', value: String(totalOutStock), note: 'Needs purchase / production planning', tone: 'danger' } : null,
    overdueCreditCount > 0 ? { title: 'Overdue credit bills', value: String(overdueCreditCount), note: `${formatCurrency(creditExposure)} open exposure`, tone: 'danger' } : null,
    activeKitchenOrders.length > 0 ? { title: 'Live kitchen queue', value: String(activeKitchenOrders.length), note: 'Pending, cooking or ready orders', tone: 'warning' } : null,
    pendingAdvance > 0 ? { title: 'Advance orders pending', value: String(pendingAdvance), note: 'Track delivery and balance collection', tone: 'warning' } : null,
    totalLowStock > 0 ? { title: 'Low stock warnings', value: String(totalLowStock), note: 'Below branch threshold', tone: 'warning' } : null,
    disabledMenu > 0 ? { title: 'Menu items disabled', value: String(disabledMenu), note: 'Review item availability', tone: 'neutral' } : null,
  ].filter((alert): alert is { title: string; value: string; note: string; tone: string } => alert !== null);

  return (
    <div className="owner-command-center">
      <div className="owner-date-switcher" aria-label="Owner dashboard date range">
        {(['today', '7d', '30d'] as const).map(range => (
          <button key={range} type="button" onClick={() => setDateRange(range)} className={cn(dateRange === range && 'is-active')}>
            {range === 'today' ? 'Today' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
          </button>
        ))}
      </div>

      <section className="owner-command-hero">
        <div>
          <span className="owner-kicker">Owner Command Center</span>
          <h2>{formatCurrency(dateRange === 'today' ? ownerTotalToday : ownerRangeRevenue)}</h2>
          <p>
            Complete business view across Cafe, VRSNB, SNB and Hosur with cash, UPI, card, credit, kitchen, branch stock and pending action visibility.
          </p>
        </div>
        <div className="owner-hero-ledger">
          <div>
            <span>Today collection</span>
            <strong>{formatCurrency(ownerTotalToday)}</strong>
          </div>
          <div>
            <span>Orders / bills</span>
            <strong>{ownerOrdersToday}</strong>
          </div>
          <div>
            <span>Avg ticket</span>
            <strong>{formatCurrency(avgTicketToday)}</strong>
          </div>
        </div>
      </section>

      <section className="owner-kpi-grid">
        <div className="owner-kpi-card primary">
          <div className="owner-kpi-icon"><IndianRupee className="size-6" /></div>
          <span>Total Sales</span>
          <strong>{formatCurrency(dateRange === 'today' ? ownerTotalToday : ownerRangeRevenue)}</strong>
          <p>Cafe + all bakery branches</p>
        </div>
        <div className="owner-kpi-card">
          <div className="owner-kpi-icon"><Store className="size-6" /></div>
          <span>Top Branch Today</span>
          <strong>{leadingBranch.revenue > 0 ? leadingBranch.branch : 'No sales'}</strong>
          <p>{formatCurrency(leadingBranch.revenue)} revenue</p>
        </div>
        <div className="owner-kpi-card warning">
          <div className="owner-kpi-icon"><AlertTriangle className="size-6" /></div>
          <span>Action Alerts</span>
          <strong>{alerts.length}</strong>
          <p>{totalOutStock} out of stock · {overdueCreditCount} overdue credit</p>
        </div>
        <div className="owner-kpi-card">
          <div className="owner-kpi-icon"><Utensils className="size-6" /></div>
          <span>Menu Health</span>
          <strong>{menuItems.length > 0 ? `${Math.round((enabledMenu / menuItems.length) * 100)}%` : '0%'}</strong>
          <p>{enabledMenu} active · {disabledMenu} disabled</p>
        </div>
      </section>

      <section className="owner-ops-grid">
        <div className="owner-panel owner-panel-wide">
          <div className="owner-panel-head">
            <div>
              <span>Branch Performance</span>
              <h3>Today by outlet</h3>
            </div>
            <Link to="/sales-report">Open reports</Link>
          </div>
          <div className="owner-branch-board">
            {[{ branch: 'Cafe' as const, revenue: todayCafeRevenue, qty: todayServedCafe.length, lowStock: 0, outStock: 0, pendingAdvance: activeKitchenOrders.length }, ...branchRows].map(row => {
              const maxRevenue = Math.max(ownerTotalToday, 1);
              const pct = Math.round((row.revenue / maxRevenue) * 100);
              return (
                <div key={row.branch} className="owner-branch-row">
                  <div className="owner-branch-name">
                    <strong>{row.branch}</strong>
                    <span>{row.qty} {row.branch === 'Cafe' ? 'orders' : 'items sold'}</span>
                  </div>
                  <div className="owner-branch-bar"><i style={{ width: `${Math.max(pct, row.revenue > 0 ? 6 : 0)}%` }} /></div>
                  <div className="owner-branch-money">
                    <strong>{formatCurrency(row.revenue)}</strong>
                    {'outStock' in row && row.outStock > 0 && <span>{row.outStock} stock issue</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="owner-panel owner-panel-alerts">
          <div className="owner-panel-head">
            <div>
              <span>Owner attention</span>
              <h3>Pending actions</h3>
            </div>
          </div>
          {alerts.length > 0 ? (
            <div className="owner-alert-list">
              {alerts.slice(0, 6).map(alert => (
                <div key={alert.title} className={cn('owner-alert-row', `tone-${alert.tone}`)}>
                  <strong>{alert.value}</strong>
                  <div>
                    <p>{alert.title}</p>
                    <span>{alert.note}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyOwnerState title="No critical alerts" message="Stock, credit and kitchen queues look clean right now." />
          )}
        </div>
      </section>

      <section className="owner-ops-grid compact">
        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Payment Control</span>
              <h3>Cash · UPI · Card</h3>
            </div>
          </div>
          <div className="owner-payment-stack">
            {paymentRows.map(row => {
              const pct = Math.round((row.value / paymentTotal) * 100);
              return (
                <div key={row.label} className="owner-payment-row">
                  <div className="owner-payment-icon">{row.icon}</div>
                  <div className="owner-payment-meta">
                    <span>{row.label}</span>
                    <i><b style={{ width: `${pct}%` }} /></i>
                  </div>
                  <strong>{formatCurrency(row.value)}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Sales Pulse</span>
              <h3>{dateRange === 'today' ? 'Today split' : 'Revenue trend'}</h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyPulse}>
              <defs>
                <linearGradient id="ownerTotalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#126d52" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#126d52" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="total" stroke="#126d52" strokeWidth={3} fill="url(#ownerTotalGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Fast decisions</span>
              <h3>Quick actions</h3>
            </div>
          </div>
          <div className="owner-quick-actions">
            <Link to="/billing"><Banknote className="size-5" />Billing Counter</Link>
            <Link to="/kitchen"><Utensils className="size-5" />Kitchen Live Board</Link>
            <Link to="/order-pad"><ShoppingBag className="size-5" />Order Taker</Link>
            <Link to="/menu-management"><Layers className="size-5" />Menu Control</Link>
            <Link to="/attendance-salary"><Users className="size-5" />Staff Payroll</Link>
            <Link to="/owner"><BarChart3 className="size-5" />Owner Hub</Link>
          </div>
        </div>
      </section>

      <section className="owner-ops-grid compact">
        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Stock & Production</span>
              <h3>Branch readiness</h3>
            </div>
          </div>
          <div className="owner-readiness-list">
            {branchRows.map(row => (
              <div key={row.branch}>
                <div>
                  <strong>{row.branch}</strong>
                  <span>{row.pendingIncoming} incoming · {row.pendingAdvance} advance</span>
                </div>
                <p>{row.outStock} out</p>
                <p>{row.lowStock} low</p>
              </div>
            ))}
          </div>
          {pendingIncoming > 0 && <p className="owner-footnote">{pendingIncoming} incoming stock entries are waiting for branch confirmation.</p>}
        </div>

        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Best sellers</span>
              <h3>Cafe today</h3>
            </div>
          </div>
          {topCafeItems.length > 0 ? (
            <div className="owner-top-items">
              {topCafeItems.map((item, index) => (
                <div key={item.name}>
                  <b>{index + 1}</b>
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.revenue)}</strong>
                  <em>{item.qty} sold</em>
                </div>
              ))}
            </div>
          ) : (
            <EmptyOwnerState title="No served cafe orders yet" message="Top sellers will appear once billing is completed." />
          )}
        </div>

        <div className="owner-panel">
          <div className="owner-panel-head">
            <div>
              <span>Risk board</span>
              <h3>Protect profit</h3>
            </div>
          </div>
          <div className="owner-risk-grid">
            <div><strong>{formatCurrency(creditExposure)}</strong><span>Open credit</span></div>
            <div><strong>{pendingAdvance}</strong><span>Advance orders</span></div>
            <div><strong>{cancelledToday.length}</strong><span>Cancelled today</span></div>
            <div><strong>{totalLowStock + totalOutStock}</strong><span>Stock warnings</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sales Overview Tab ────────────────────────────────────────────────────────
function SalesOverviewTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, fetchBranchData } = useBranchStore();
  const { items: menuItems, loadMenu } = useMenuStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('7d');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => fetchBranchData(b)); }, [fetchBranchData]);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // Cafe orders within range
  const cafeOrders = useMemo(() =>
    orders.filter(o => new Date(o.createdAt) >= cutoff && o.status === 'served'),
    [orders, cutoff]);

  // Today's orders for cash-in-drawer
  const todayOrders = useMemo(() =>
    orders.filter(o => new Date(o.createdAt) >= todayStart && o.status === 'served'),
    [orders, todayStart]);

  const cafeRevenue = cafeOrders.reduce((s, o) => s + o.total, 0);
  const cafeCount   = cafeOrders.length;
  const avgOrderValue = cafeCount > 0 ? Math.round(cafeRevenue / cafeCount) : 0;

  // Today's cash split
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

  // Branch sales
  const branchSales = useMemo(() => {
    const branches: Record<string, { qty: number; count: number; revenue: number }> = {
      VRSNB: { qty: 0, count: 0, revenue: 0 },
      SNB:   { qty: 0, count: 0, revenue: 0 },
      Hosur: { qty: 0, count: 0, revenue: 0 },
    };
    (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => {
      (sales[b] || []).filter(s => new Date(s.soldAt) >= cutoff).forEach(s => {
        branches[b].qty += s.quantitySold;
        branches[b].count += 1;
        const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
        branches[b].revenue += unitPrice * s.quantitySold;
      });
    });
    return branches;
  }, [sales, cutoff]);

  const totalBakeryRevenue = Object.values(branchSales).reduce((a, v) => a + v.revenue, 0);
  const totalBakeryQty     = Object.values(branchSales).reduce((a, v) => a + v.qty, 0);
  const grandTotal         = cafeRevenue + totalBakeryRevenue;

  // Daily cafe revenue chart
  const dailyRevenueData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const cafeRev = cafeOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr)
        .reduce((s, o) => s + o.total, 0);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      result.push({ date: label, cafe: cafeRev });
    }
    return result;
  }, [cafeOrders, dateRange]);

  // Revenue share pie
  const revShareData = [
    { name: 'Cafe',  value: cafeRevenue,              color: COLORS[0] },
    { name: 'VRSNB', value: branchSales.VRSNB.revenue, color: COLORS[1] },
    { name: 'SNB',   value: branchSales.SNB.revenue,   color: COLORS[2] },
    { name: 'Hosur', value: branchSales.Hosur.revenue,  color: COLORS[3] },
  ].filter(d => d.value > 0);

  // Payment breakdown
  const payBreakdown = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    cafeOrders.forEach(o => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return [{ name: 'Cash', value: cash }, { name: 'UPI', value: upi }, { name: 'Card', value: card }]
      .filter(p => p.value > 0);
  }, [cafeOrders]);

  // Top items by revenue
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

  // ── Peak hours heatmap (0–23) ──
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

  // Menu availability
  const enabledCount  = menuItems.filter(i => i.enabled).length;
  const disabledCount = menuItems.filter(i => !i.enabled).length;

  const maxBranchRev = Math.max(cafeRevenue, branchSales.VRSNB.revenue, branchSales.SNB.revenue, branchSales.Hosur.revenue, 1);

  return (
    <div className="space-y-5">
      {/* Date Range Toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['today', '7d', '30d'] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)}
            className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
              dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* ── Today's Cash-in-Drawer ── */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Today's Collection</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue"   value={formatCurrency(grandTotal)}    sub="All branches"               color="bg-primary/10 text-primary" />
        <KPI icon={<Store       className="size-4" />} label="Cafe Revenue"    value={formatCurrency(cafeRevenue)}   sub={`${cafeCount} orders`}       color="bg-emerald-50 text-emerald-700" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Bakery Revenue"  value={formatCurrency(totalBakeryRevenue)} sub={`${totalBakeryQty} items`} color="bg-amber-50 text-amber-700" />
        <KPI icon={<TrendingUp  className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} sub="Cafe only"                    color="bg-blue-50 text-blue-700" />
      </div>

      {/* ── Menu Availability ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
          <Utensils className="size-4 text-primary" />Menu Availability
        </h3>
        <p className="text-[10px] text-muted-foreground mb-3">Current item status on the menu</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-emerald-700 tabular-nums">{enabledCount}</p>
            <p className="text-[10px] font-semibold text-emerald-600 uppercase">Active</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-red-700 tabular-nums">{disabledCount}</p>
            <p className="text-[10px] font-semibold text-red-600 uppercase">Disabled</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-foreground tabular-nums">{menuItems.length}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total</p>
          </div>
        </div>
        {disabledCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 font-medium">
              {disabledCount} item{disabledCount > 1 ? 's are' : ' is'} currently hidden from customers
            </p>
          </div>
        )}
        {/* Availability bar */}
        {menuItems.length > 0 && (
          <div className="mt-3">
            <div className="h-2.5 bg-red-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.round((enabledCount / menuItems.length) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {Math.round((enabledCount / menuItems.length) * 100)}% available
            </p>
          </div>
        )}
      </div>

      {/* Branch Performance */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />Branch Performance
        </h3>
        <p className="text-[10px] text-muted-foreground mb-4">Revenue comparison across all branches</p>
        <div className="space-y-3">
          {[
            { label: 'Cafe',  value: cafeRevenue,              color: 'bg-emerald-500', qty: `${cafeCount} orders` },
            { label: 'VRSNB', value: branchSales.VRSNB.revenue, color: 'bg-blue-500',   qty: `${branchSales.VRSNB.qty} items` },
            { label: 'SNB',   value: branchSales.SNB.revenue,   color: 'bg-amber-500',  qty: `${branchSales.SNB.qty} items` },
            { label: 'Hosur', value: branchSales.Hosur.revenue,  color: 'bg-purple-500', qty: `${branchSales.Hosur.qty} items` },
          ].map(row => (
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

      {/* Revenue Share Pie */}
      {revShareData.length > 0 && (
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

      {/* Cafe Revenue Trend */}
      {dateRange !== 'today' && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Cafe Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyRevenueData}>
              <defs>
                <linearGradient id="cafeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="cafe" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cafeGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Breakdown */}
      {payBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Cafe Payment Methods</h3>
          <div className="space-y-2.5">
            {payBreakdown.map((p, i) => {
              const pct = cafeRevenue > 0 ? Math.round((p.value / cafeRevenue) * 100) : 0;
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

      {/* ── Peak Hours Heatmap ── */}
      {cafeOrders.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <Clock className="size-4 text-primary" />Peak Hours
          </h3>
          <p className="text-[10px] text-muted-foreground mb-4">Order volume by hour — plan staffing around these peaks</p>
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
                  <div
                    className={cn('w-full rounded-sm transition-all',
                      isHigh ? 'bg-primary' : isMed ? 'bg-primary/50' : 'bg-muted')}
                    style={{ height: `${Math.max(pct * 100, 4)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-muted-foreground">6am</span>
            <span className="text-[9px] text-muted-foreground">12pm</span>
            <span className="text-[9px] text-muted-foreground">10pm</span>
          </div>
          {/* Peak hour callout */}
          {(() => {
            const peak = peakHours.reduce((a, b) => b.count > a.count ? b : a, peakHours[0]);
            if (peak.count === 0) return null;
            return (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
                <Clock className="size-3.5 text-primary shrink-0" />
                <p className="text-xs text-foreground">
                  Busiest hour: <span className="font-bold">{peak.label}</span> with {peak.count} orders
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Top Items by Revenue */}
      {topCafeItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Top Items by Revenue</h3>
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

  const branchChartData = useMemo(() =>
    Object.entries(branchGroups).map(([branch, emps]) => ({
      branch: branch.length > 10 ? branch.slice(0, 10) + '…' : branch,
      count: emps.length,
      totalSalary: emps.reduce((a, e) => a + (Number(e.grossSalary) || 0), 0),
    })), [branchGroups]);

  const salaryStats = useMemo(() => {
    const total      = employees.reduce((a, e) => a + (Number(e.grossSalary) || 0), 0);
    const advances   = employees.reduce((a, e) => a + (Number(e.salaryAdvance) || 0), 0);
    const deductions = employees.reduce((a, e) => a + (Number(e.uniformDeduction) || 0) + (Number(e.otherDeduction) || 0), 0);
    return { total, advances, deductions, netPayable: total - advances - deductions };
  }, [employees]);

  // Advance-to-salary ratio flags
  const atRiskEmployees = useMemo(() =>
    employees
      .filter(e => Number(e.grossSalary) > 0 && (Number(e.salaryAdvance) / Number(e.grossSalary)) >= 0.5)
      .map(e => ({
        ...e,
        ratio: Math.round((Number(e.salaryAdvance) / Number(e.grossSalary)) * 100),
      }))
      .sort((a, b) => b.ratio - a.ratio),
    [employees]);

  const deptData = useMemo(() => {
    const map = new Map<string, { count: number; salary: number }>();
    employees.forEach(e => {
      const ex = map.get(e.department);
      if (ex) { ex.count++; ex.salary += (Number(e.grossSalary) || 0); }
      else map.set(e.department, { count: 1, salary: (Number(e.grossSalary) || 0) });
    });
    return [...map.entries()]
      .map(([dept, v]) => ({ dept: dept.length > 12 ? dept.slice(0, 12) + '…' : dept, ...v }))
      .sort((a, b) => b.salary - a.salary);
  }, [employees]);

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
      <button onClick={loadEmployees}
        className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-body font-semibold active:scale-95 transition-transform">
        Try again
      </button>
    </div>
  );

  const salaryPieData = [
    { name: 'Net Pay',    value: Math.max(salaryStats.netPayable, 0) },
    { name: 'Advances',   value: salaryStats.advances },
    { name: 'Deductions', value: salaryStats.deductions },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-5">
      {/* Salary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<Users       className="size-4" />} label="Total Staff"   value={String(employees.length)}           color="bg-primary/10 text-primary" />
        <KPI icon={<IndianRupee className="size-4" />} label="Gross Payroll" value={formatCurrency(salaryStats.total)}   color="bg-blue-50 text-blue-700" />
        <KPI icon={<TrendingUp  className="size-4" />} label="Net Payable"   value={formatCurrency(salaryStats.netPayable)} color="bg-emerald-50 text-emerald-700" />
        <KPI icon={<IndianRupee className="size-4" />} label="Advances"      value={formatCurrency(salaryStats.advances)} color="bg-amber-50 text-amber-700" />
      </div>

      {/* ── Advance-to-Salary Risk Flags ── */}
      {atRiskEmployees.length > 0 && (
        <div className="bg-card border border-amber-200 rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />Advance Risk Alerts
          </h3>
          <p className="text-[10px] text-muted-foreground mb-3">
            Staff with advance ≥ 50% of their salary — review before next payout
          </p>
          <div className="space-y-2.5">
            {atRiskEmployees.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{e.name}</p>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0',
                      e.ratio >= 80 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>{e.ratio}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{e.branch} · {e.department}</p>
                  <div className="mt-1 h-1.5 bg-muted rounded-full">
                    <div className={cn('h-full rounded-full transition-all',
                      e.ratio >= 80 ? 'bg-red-500' : 'bg-amber-500')}
                      style={{ width: `${Math.min(e.ratio, 100)}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-amber-600">{formatCurrency(Number(e.salaryAdvance))}</p>
                  <p className="text-[10px] text-muted-foreground">of {formatCurrency(Number(e.grossSalary))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salary Breakdown Pie */}
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

      {/* Staff by Branch chart */}
      {branchChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <Building2 className="size-4 text-primary" />Staff by Branch
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={branchChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" name="Staff Count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Branch Payroll */}
      {branchChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Branch Payroll</h3>
          <div className="space-y-3">
            {branchChartData.map((b, i) => {
              const maxSal = Math.max(...branchChartData.map(x => x.totalSalary), 1);
              return (
                <div key={b.branch}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium truncate">{b.branch}</span>
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(b.totalSalary)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.round((b.totalSalary / maxSal) * 100)}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Department Salary */}
      {deptData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Department Salary</h3>
          <ResponsiveContainer width="100%" height={Math.min(deptData.length * 32, 200)}>
            <BarChart data={deptData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Total Salary']} />
              <Bar dataKey="salary" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Employee List by Branch */}
      {Object.entries(branchGroups).map(([branch, emps]) => (
        <div key={branch} className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">
            {branch} <span className="text-sm text-muted-foreground font-normal">({emps.length} staff)</span>
          </h3>
          <div className="space-y-2">
            {emps.map(e => {
              const advRatio = Number(e.grossSalary) > 0
                ? Math.round((Number(e.salaryAdvance) / Number(e.grossSalary)) * 100) : 0;
              return (
                <div key={e.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <p className="text-sm font-semibold">{e.name}</p>
                    <p className="text-[10px] text-muted-foreground">{e.department}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(e.grossSalary) || 0)}</p>
                    {e.salaryAdvance > 0 && (
                      <p className={cn('text-[10px] font-semibold',
                        advRatio >= 80 ? 'text-red-600' : advRatio >= 50 ? 'text-amber-600' : 'text-muted-foreground')}>
                        Adv: {formatCurrency(Number(e.salaryAdvance) || 0)} ({advRatio}%)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Waste Logs Tab ────────────────────────────────────────────────────────────
function WasteLogsTab() {
  const { items: menuItems, loadMenu } = useMenuStore();
  const [entries, setEntries] = useState<Array<{
    id: string; food_item: string; quantity: string; logged_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => { loadMenu(); }, [loadMenu]);

  useEffect(() => {
    const fetchWaste = async () => {
      setLoading(true); setError('');
      const todayUTC  = new Date().toISOString().slice(0, 10);
      const sinceDate = new Date(todayUTC);
      sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);
      const sinceISO = sinceDate.toISOString().slice(0, 10) + 'T00:00:00';
      const { data, error: err } = await supabase
        .from('kitchen_waste_log').select('*')
        .gte('logged_at', sinceISO).order('logged_at', { ascending: false });
      if (err) setError(err.message);
      else setEntries(data ?? []);
      setLoading(false);
    };
    fetchWaste();
  }, []);

  // Waste cost estimate: try to match food_item name to menu item price
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    menuItems.forEach(item => { map.set(item.name.toLowerCase().trim(), item.price); });
    return map;
  }, [menuItems]);

  const enriched = useMemo(() =>
    entries.map(e => {
      const price = priceMap.get(e.food_item.toLowerCase().trim());
      if (!price) return { ...e, estimatedCost: null as number | null };
      const num = parseFloat(e.quantity);
      if (isNaN(num) || num <= 0) return { ...e, estimatedCost: null as number | null };
      const estimatedCost = /g\b/i.test(e.quantity) && !/kg/i.test(e.quantity) ? price * (num / 1000) : price * num;
      return { ...e, estimatedCost };
    }),
    [entries, priceMap]);

  const totalEstimatedCost = enriched.reduce((s, e) => s + (e.estimatedCost ?? 0), 0);
  const costedCount        = enriched.filter(e => e.estimatedCost !== null).length;

  // Group by date
  const grouped = useMemo(() => {
    const g: Record<string, typeof enriched> = {};
    enriched.forEach(e => {
      const date = e.logged_at.slice(0, 10);
      if (!g[date]) g[date] = [];
      g[date].push(e);
    });
    return g;
  }, [enriched]);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (diff === 0) return `Today · ${label}`;
    if (diff === 1) return `Yesterday · ${label}`;
    return label;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl flex items-center justify-center bg-red-50">
            <Trash2 className="size-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Kitchen Waste Log</p>
            <p className="text-[11px] text-muted-foreground">Last 7 days · logged by kitchen</p>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
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

      {/* ── Waste Cost Estimate Banner ── */}
      {!loading && totalEstimatedCost > 0 && (
        <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-widest mb-1">Estimated Waste Cost</p>
          <p className="font-display text-3xl font-bold text-red-700 tabular-nums">{formatCurrency(totalEstimatedCost)}</p>
          <p className="text-xs text-red-500 mt-1">
            Based on {costedCount} of {entries.length} entries matched to menu prices
          </p>
          {costedCount < entries.length && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {entries.length - costedCount} entries couldn't be priced — item names may not match menu exactly
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 rounded-xl bg-primary/10 animate-pulse" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
            <Trash2 className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No waste logged in the last 7 days</p>
        </div>
      )}

      {/* Grouped by date */}
      {!loading && sortedDates.map(date => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {formatDateLabel(date)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold">
              {grouped[date].length} {grouped[date].length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="space-y-1.5">
            {grouped[date].map(entry => (
              <div key={entry.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                <div className="size-8 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                  <Trash2 className="size-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{entry.food_item}</p>
                  <p className="text-[11px] text-muted-foreground">{entry.quantity}</p>
                </div>
                <div className="text-right shrink-0">
                  {entry.estimatedCost !== null ? (
                    <p className="text-sm font-bold text-red-600 tabular-nums">
                      ~{formatCurrency(entry.estimatedCost)}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">no price</p>
                  )}
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {new Date(entry.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// ── Branch Overview Tab ──────────────────────────────────────────────────────
function BranchOverviewTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, stock, incoming, advanceOrders, creditSales, fetchBranchData } = useBranchStore();
  const { bills, returns, purchases, purchasePayments, bankDeposits, cashierClosures, storeOrders } = useBranchOpsStore();
  const [preset, setPreset] = useState<OwnerDatePreset>('today');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { OWNER_FULL_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);

  const from = useMemo(() => ownerPresetStart(preset), [preset]);
  const to = useMemo(() => ownerEndOfToday(), [preset]);

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
      ...useBranchOpsStore.getState().creditSales.filter(c => c.branch === branch && c.status !== 'Paid' && c.status !== 'Written Off').map(c => moneyNumber(c.balanceDue)),
    ].reduce((a, b) => a + b, 0);
    const lastClosure = cashierClosures.find(c => c.branch === branch && ownerInRange(c.createdAt, from, to));
    const cash = localBills.reduce((sum, b) => sum + (b.paymentMode === 'cash' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.cash) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('cash') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    const upi = localBills.reduce((sum, b) => sum + (b.paymentMode === 'upi' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.upi) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('upi') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    const card = localBills.reduce((sum, b) => sum + (b.paymentMode === 'card' ? moneyNumber(b.total) : b.paymentMode === 'split' ? moneyNumber(b.split?.card) : 0), 0) + dbSales.reduce((sum, s) => sum + ((s.paymentMethod || '').toLowerCase().includes('card') ? moneyNumber(s.unitPrice) * moneyNumber(s.quantitySold) : 0), 0);
    return {
      unit, sales: gross, netSales: Math.max(0, gross - ret), cash, upi, card, credit: openCredit,
      expenses: purchasePaid, purchases: branchPurchases, pendingPayments: Math.max(0, branchPurchases - purchasePaid),
      stockAlerts: lowStock + outStock + incoming[branch].filter(i => !i.confirmed).length,
      closureStatus: lastClosure ? (Math.abs(lastClosure.difference) > 0 ? 'Difference in closure' : 'Closed') : 'Pending closure',
      keyAlert: `${advanceOrders[branch].filter(a => a.status === 'pending').length} advance · ${lowStock + outStock} stock alerts`,
    };
  }), [orders, sales, stock, incoming, advanceOrders, creditSales, bills, returns, purchases, purchasePayments, cashierClosures, storeOrders, from, to]);

  const totals = branchRows.reduce((acc, row) => ({
    sales: acc.sales + row.sales,
    netSales: acc.netSales + row.netSales,
    purchases: acc.purchases + row.purchases,
    expenses: acc.expenses + row.expenses,
    pending: acc.pending + row.pendingPayments,
    alerts: acc.alerts + row.stockAlerts,
  }), { sales: 0, netSales: 0, purchases: 0, expenses: 0, pending: 0, alerts: 0 });

  const chartRows = branchRows.filter(row => row.sales || row.purchases || row.pendingPayments).map(row => ({ name: row.unit.replace(' Branch', ''), Sales: row.netSales, Purchases: row.purchases, Pending: row.pendingPayments }));

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        {(['today', '7d', '30d', 'month'] as OwnerDatePreset[]).map(option => (
          <button key={option} type="button" onClick={() => setPreset(option)} className={cn(preset === option && 'is-active')}>
            {option === 'today' ? 'Today' : option === '7d' ? '7 Days' : option === '30d' ? '30 Days' : 'This Month'}
          </button>
        ))}
        <button type="button" onClick={() => ownerCsvDownload('owner-branch-overview.csv', branchRows.map(r => ({ Unit: r.unit, Sales: r.sales, NetSales: r.netSales, Purchases: r.purchases, PendingPayments: r.pendingPayments, Alerts: r.stockAlerts, Closure: r.closureStatus })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>

      <section className="owner-metric-grid wide">
        <OwnerMetricCard icon={<IndianRupee className="size-5" />} label="Gross Sales" value={formatCurrency(totals.sales)} sub="Cafe + branches" tone="green" />
        <OwnerMetricCard icon={<TrendingUp className="size-5" />} label="Net Sales" value={formatCurrency(totals.netSales)} sub="After returns" tone="blue" />
        <OwnerMetricCard icon={<ShoppingBag className="size-5" />} label="Purchases" value={formatCurrency(totals.purchases)} sub="Store + branches" tone="purple" />
        <OwnerMetricCard icon={<WalletCards className="size-5" />} label="Pending Payments" value={formatCurrency(totals.pending)} sub="Credit + supplier" tone="amber" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Owner Alerts" value={totals.alerts} sub="Stock and sync alerts" tone={totals.alerts ? 'red' : 'green'} />
      </section>

      <section className="owner-panel">
        <div className="owner-panel-head"><div><span>Business Unit Performance</span><h3>Sales, stock, credit, purchases and closure status</h3></div></div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartRows.length ? chartRows : [{ name: 'No data', Sales: 0, Purchases: 0, Pending: 0 }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="Sales" fill="#126d52" radius={[8, 8, 0, 0]} />
            <Bar dataKey="Purchases" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            <Bar dataKey="Pending" fill="#f59e0b" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="owner-business-grid">
        {branchRows.map(row => (
          <article key={row.unit} className="owner-business-card">
            <div className="owner-business-card-head">
              <div><span>{row.unit}</span><strong>{formatCurrency(row.netSales)}</strong></div>
              <em className={cn(row.closureStatus.toLowerCase().includes('pending') && 'warn', row.closureStatus.toLowerCase().includes('difference') && 'danger')}>{row.closureStatus}</em>
            </div>
            <div className="owner-business-mini-grid">
              <p><span>Cash</span><b>{formatCurrency(row.cash)}</b></p>
              <p><span>UPI</span><b>{formatCurrency(row.upi)}</b></p>
              <p><span>Card</span><b>{formatCurrency(row.card)}</b></p>
              <p><span>Credit</span><b>{formatCurrency(row.credit)}</b></p>
              <p><span>Purchases</span><b>{formatCurrency(row.purchases)}</b></p>
              <p><span>Expenses</span><b>{formatCurrency(row.expenses)}</b></p>
            </div>
            <footer><AlertTriangle className="size-4" />{row.keyAlert}</footer>
          </article>
        ))}
      </section>
    </div>
  );
}

// ── Stock Analytics Tab ──────────────────────────────────────────────────────
function StockAnalyticsTab() {
  const { stock, fetchBranchData } = useBranchStore();
  const { purchases } = useBranchOpsStore();
  const [query, setQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | Branch>('all');

  useEffect(() => { OWNER_FULL_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);

  const rows = useMemo(() => OWNER_FULL_BRANCHES.flatMap(branch => (stock[branch] || []).map(item => {
    const status = item.quantity <= 0 ? 'Out of Stock' : item.quantity <= item.minThreshold ? 'Low Stock' : item.quantity == null ? 'Stock Not Available' : 'Healthy';
    const lastPurchase = purchases.find(p => p.branch === branch && p.itemName.toLowerCase() === item.itemName.toLowerCase());
    return {
      branch,
      itemName: item.itemName,
      category: branch === 'Cafe' ? 'Cafe item' : 'Bakery branch item',
      currentStock: Number(item.quantity || 0),
      minimumStock: Number(item.minThreshold || 0),
      unit: item.unit || 'pcs',
      status,
      lastUpdated: lastPurchase?.createdAt || lastPurchase?.invoiceDate || '',
      value: Number(item.quantity || 0) * Number(item.price || 0),
    };
  })), [stock, purchases]);

  const filtered = rows.filter(row =>
    (branchFilter === 'all' || row.branch === branchFilter) &&
    `${row.itemName} ${row.branch} ${row.status}`.toLowerCase().includes(query.toLowerCase())
  );
  const alertRows = filtered.filter(row => row.status !== 'Healthy');
  const healthy = rows.length - rows.filter(row => row.status !== 'Healthy').length;
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const byBranch = OWNER_FULL_BRANCHES.map(branch => ({
    name: ownerBranchDisplay(branch),
    Healthy: rows.filter(r => r.branch === branch && r.status === 'Healthy').length,
    Low: rows.filter(r => r.branch === branch && r.status === 'Low Stock').length,
    Out: rows.filter(r => r.branch === branch && r.status === 'Out of Stock').length,
  }));

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        <div className="owner-search"><Search className="size-4" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search stock alerts" /></div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as 'all' | Branch)}>
          <option value="all">All branches</option>
          {OWNER_FULL_BRANCHES.map(branch => <option key={branch} value={branch}>{ownerBranchDisplay(branch)}</option>)}
        </select>
        <button type="button" onClick={() => ownerCsvDownload('owner-stock-alerts.csv', alertRows.map(r => ({ Item: r.itemName, Category: r.category, Branch: r.branch, CurrentStock: r.currentStock, MinimumStock: r.minimumStock, Unit: r.unit, Status: r.status, LastUpdated: ownerFmtDate(r.lastUpdated) })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>

      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<PackageSearch className="size-5" />} label="Stock Value" value={formatCurrency(stockValue)} sub="Based on available item prices" tone="green" />
        <OwnerMetricCard icon={<CheckCircle2 className="size-5" />} label="Healthy Items" value={healthy} sub="Above minimum level" tone="blue" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Low Stock" value={rows.filter(r => r.status === 'Low Stock').length} sub="Restock soon" tone="amber" />
        <OwnerMetricCard icon={<XCircle className="size-5" />} label="Out of Stock" value={rows.filter(r => r.status === 'Out of Stock').length} sub="Not billable" tone="red" />
      </section>

      <section className="owner-ops-grid compact">
        <div className="owner-panel owner-panel-wide">
          <div className="owner-panel-head"><div><span>Branch-wise Stock Status</span><h3>Healthy vs low/out-of-stock items</h3></div></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byBranch}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Healthy" stackId="a" fill="#16a34a" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Low" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Out" stackId="a" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="owner-panel">
          <div className="owner-panel-head"><div><span>Restock Priority</span><h3>Critical alerts</h3></div></div>
          <div className="owner-alert-list">
            {alertRows.slice(0, 8).map(row => (
              <div key={`${row.branch}-${row.itemName}`} className={cn('owner-alert-row', row.status === 'Out of Stock' ? 'tone-danger' : 'tone-warning')}>
                <strong>{row.currentStock}</strong><div><p>{row.itemName}</p><span>{ownerBranchDisplay(row.branch)} · min {row.minimumStock} {row.unit} · {row.status}</span></div>
              </div>
            ))}
            {!alertRows.length && <EmptyOwnerState title="Stock looks healthy" message="No low-stock or out-of-stock items match the selected filters." />}
          </div>
        </div>
      </section>

      <section className="owner-table-card">
        <div className="owner-panel-head"><div><span>Stock Alert Register</span><h3>Missing, low and out-of-stock items</h3></div></div>
        <div className="overflow-x-auto">
          <table className="owner-data-table">
            <thead><tr><th>Item</th><th>Branch</th><th>Status</th><th>Current</th><th>Minimum</th><th>Unit</th><th>Last Updated</th></tr></thead>
            <tbody>
              {filtered.map(row => (
                <tr key={`${row.branch}-${row.itemName}`}>
                  <td><strong>{row.itemName}</strong><span>{row.category}</span></td>
                  <td>{ownerBranchDisplay(row.branch)}</td>
                  <td><em className={cn('owner-status', row.status === 'Out of Stock' ? 'danger' : row.status === 'Low Stock' ? 'warn' : 'ok')}>{row.status}</em></td>
                  <td>{row.currentStock}</td><td>{row.minimumStock}</td><td>{row.unit}</td><td>{ownerFmtDate(row.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  }).filter(row => branch === 'all' || row.branch === ownerBranchDisplay(branch)), [orders, bills, returns, purchasePayments, bankDeposits, cashierClosures, cashMovements, date, branch]);

  const totals = rows.reduce((acc, r) => ({ net: acc.net + r.netSales, cash: acc.cash + r.cash, diff: acc.diff + r.difference, pending: acc.pending + (r.status === 'Pending' ? 1 : 0) }), { net: 0, cash: 0, diff: 0, pending: 0 });

  const print = () => ownerPrintSection('Owner Daily Closure Overview', `<table><thead><tr><th>Branch</th><th>Status</th><th>Net sales</th><th>Cash</th><th>Expected cash</th><th>Counted cash</th><th>Difference</th><th>Closed by</th><th>Remarks</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.branch}</td><td>${r.status}</td><td>${r.netSales}</td><td>${r.cash}</td><td>${r.expectedCash}</td><td>${r.countedCash}</td><td>${r.difference}</td><td>${r.closedBy}</td><td>${r.remarks}</td></tr>`).join('')}</tbody></table>`);

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
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

      <section className="owner-business-grid">
        {rows.map(row => (
          <article key={row.branch} className="owner-business-card closure">
            <div className="owner-business-card-head"><div><span>{row.branch}</span><strong>{formatCurrency(row.netSales)}</strong></div><em className={cn(row.status === 'Pending' && 'warn', row.status === 'Difference' && 'danger')}>{row.status}</em></div>
            <div className="owner-business-mini-grid">
              <p><span>Opening</span><b>{formatCurrency(row.opening)}</b></p><p><span>Total</span><b>{formatCurrency(row.grossSales)}</b></p><p><span>Cash</span><b>{formatCurrency(row.cash)}</b></p><p><span>UPI</span><b>{formatCurrency(row.upi)}</b></p><p><span>Card</span><b>{formatCurrency(row.card)}</b></p><p><span>Credit</span><b>{formatCurrency(row.credit)}</b></p><p><span>Returns</span><b>{formatCurrency(row.returns)}</b></p><p><span>Expenses</span><b>{formatCurrency(row.expenses)}</b></p><p><span>Purchase Pay.</span><b>{formatCurrency(row.purchases)}</b></p><p><span>Bank Deposit</span><b>{formatCurrency(row.bankDeposits)}</b></p><p><span>Expected</span><b>{formatCurrency(row.expectedCash)}</b></p><p><span>Difference</span><b>{formatCurrency(row.difference)}</b></p>
            </div>
            <footer><ShieldCheck className="size-4" />{row.closedBy} · {ownerFmtDateTime(row.closedAt)} · {row.remarks}</footer>
          </article>
        ))}
      </section>
    </div>
  );
}

// ── Owner Alerts Tab ─────────────────────────────────────────────────────────
function OwnerAlertsTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { stock, creditSales, fetchBranchData } = useBranchStore();
  const { creditSales: branchCredits, purchases, cashierClosures, notifications, storeOrders, returns } = useBranchOpsStore();
  const { invoices, load } = useInvoiceStore();
  const [tone, setTone] = useState<'all' | OwnerAlertTone>('all');

  useEffect(() => { startPolling(7); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { OWNER_FULL_BRANCHES.forEach(branch => fetchBranchData(branch)); }, [fetchBranchData]);
  useEffect(() => { load(); }, [load]);

  const alerts: OwnerAlert[] = useMemo(() => {
    const today = ownerDateInput();
    const list: OwnerAlert[] = [];
    OWNER_FULL_BRANCHES.forEach(branch => {
      const out = (stock[branch] || []).filter(item => item.quantity <= 0);
      const low = (stock[branch] || []).filter(item => item.quantity > 0 && item.quantity <= item.minThreshold);
      if (out.length) list.push({ title: 'Out-of-stock items', value: String(out.length), note: `${ownerBranchDisplay(branch)} has items blocked for billing`, tone: 'danger', branch });
      if (low.length) list.push({ title: 'Low stock warning', value: String(low.length), note: `${ownerBranchDisplay(branch)} needs restocking`, tone: 'warning', branch });
      const dbCredits = (creditSales[branch] || []).filter(c => c.status !== 'settled' && c.dueDate && new Date(c.dueDate) < new Date());
      if (dbCredits.length) list.push({ title: 'Overdue branch credit', value: String(dbCredits.length), note: `${ownerBranchDisplay(branch)} credit due follow-up`, tone: 'danger', branch });
      const closedToday = cashierClosures.some(c => c.branch === branch && ownerLocalDay(c.createdAt) === today);
      if (branch !== 'Cafe' && !closedToday) list.push({ title: 'Daily closure pending', value: '1', note: `${ownerBranchDisplay(branch)} closure not submitted for today`, tone: 'warning', branch });
    });
    const localCreditOverdue = branchCredits.filter(c => c.status !== 'Paid' && c.status !== 'Written Off' && c.dueDate && new Date(c.dueDate) < new Date());
    if (localCreditOverdue.length) list.push({ title: 'Customer credit overdue', value: String(localCreditOverdue.length), note: `${formatCurrency(localCreditOverdue.reduce((s, c) => s + c.balanceDue, 0))} needs collection`, tone: 'danger' });
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
  }, [orders, stock, creditSales, branchCredits, purchases, cashierClosures, notifications, storeOrders, returns, invoices]);

  const visible = alerts.filter(a => tone === 'all' || a.tone === tone);

  return (
    <div className="owner-tab-stack">
      <OwnerToolbar>
        {(['all', 'danger', 'warning', 'neutral', 'success'] as const).map(option => <button key={option} type="button" onClick={() => setTone(option)} className={cn(tone === option && 'is-active')}>{option === 'all' ? 'All alerts' : option}</button>)}
        <button type="button" onClick={() => ownerCsvDownload('owner-alerts.csv', visible.map(a => ({ Alert: a.title, Value: a.value, Branch: a.branch || 'Business', Tone: a.tone, Details: a.note })))}><Download className="size-4" />Export</button>
      </OwnerToolbar>
      <section className="owner-metric-grid">
        <OwnerMetricCard icon={<XCircle className="size-5" />} label="Critical" value={alerts.filter(a => a.tone === 'danger').length} tone="red" />
        <OwnerMetricCard icon={<AlertTriangle className="size-5" />} label="Warning" value={alerts.filter(a => a.tone === 'warning').length} tone="amber" />
        <OwnerMetricCard icon={<Bell className="size-5" />} label="Operational" value={alerts.filter(a => a.tone === 'neutral').length} tone="blue" />
        <OwnerMetricCard icon={<CheckCircle2 className="size-5" />} label="Total Owner Alerts" value={alerts.length} tone="purple" />
      </section>
      <section className="owner-alert-board">
        {visible.map((alert, index) => (
          <article key={`${alert.title}-${index}`} className={cn('owner-alert-card', `tone-${alert.tone}`)}>
            <div><strong>{alert.value}</strong><span>{alert.tone}</span></div>
            <section><h3>{alert.title}</h3><p>{alert.note}</p>{alert.branch && <em>{ownerBranchDisplay(alert.branch)}</em>}</section>
          </article>
        ))}
        {!visible.length && <EmptyOwnerState title="No matching owner alerts" message="Critical issues will appear here automatically from sales, credit, stock, closure and dispatch flows." />}
      </section>
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
          paidAmount: lineItems.length ? paidAmount * (Number(line.totalPrice || line.total_price || 0) / Math.max(grandTotal, 1)) : paidAmount,
          balanceAmount: lineItems.length ? Math.max(0, (Number(line.totalPrice || line.total_price || 0)) - (paidAmount * (Number(line.totalPrice || line.total_price || 0) / Math.max(grandTotal, 1)))) : Math.max(0, grandTotal - paidAmount),
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
            <BarChart data={supplierRows.length ? supplierRows : [{ name: 'No purchase', Amount: 0 }]}><CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${Math.round(Number(v) / 1000)}k`} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="Amount" fill="#8b5cf6" radius={[8,8,0,0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="owner-panel">
          <div className="owner-panel-head"><div><span>Item-wise Purchase Quantity</span><h3>Material movement</h3></div></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={itemRows.length ? itemRows : [{ name: 'No item', Quantity: 0 }]}><CartesianGrid strokeDasharray="3 3" stroke="rgba(120,82,38,.14)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="Quantity" fill="#126d52" radius={[8,8,0,0]} /></BarChart>
          </ResponsiveContainer>
        </div>
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

// ── Main Export ───────────────────────────────────────────────────────────────
type OwnerDashboardTab =
  | 'command'
  | 'branches'
  | 'sales'
  | 'stock'
  | 'credit'
  | 'purchases'
  | 'closure'
  | 'alerts'
  | 'attendance'
  | 'waste';

export default function OwnerDashboard() {
  const [tab, setTab] = useState<OwnerDashboardTab>('command');

  const tabs: Array<{ id: OwnerDashboardTab; label: string; icon: React.ReactNode; hint: string }> = [
    { id: 'command',    label: 'Executive Overview', icon: <Building2     className="size-4" />, hint: 'Owner KPIs' },
    { id: 'branches',   label: 'Branch Overview',    icon: <Store         className="size-4" />, hint: 'Cafe, SNB, VRSNB, Hosur' },
    { id: 'sales',      label: 'Sales & Profit',     icon: <BarChart3     className="size-4" />, hint: 'Trends and payment split' },
    { id: 'stock',      label: 'Stock Analytics',    icon: <PackageSearch className="size-4" />, hint: 'Low and out-of-stock' },
    { id: 'credit',     label: 'Credit Tracking',    icon: <IndianRupee   className="size-4" />, hint: 'Pending collections' },
    { id: 'purchases',  label: 'Store Purchases',    icon: <ShoppingBag   className="size-4" />, hint: 'Supplier and invoice view' },
    { id: 'closure',    label: 'Daily Closure',      icon: <WalletCards   className="size-4" />, hint: 'All unit closing status' },
    { id: 'alerts',     label: 'Owner Alerts',       icon: <Bell          className="size-4" />, hint: 'Actionable risks' },
    { id: 'attendance', label: 'Staff & Payroll',    icon: <CalendarCheck className="size-4" />, hint: 'Attendance and advances' },
    { id: 'waste',      label: 'Waste & Loss',       icon: <Trash2        className="size-4" />, hint: 'Kitchen loss control' },
  ];

  return (
    <div className="owner-dashboard-screen dashboard-screen min-h-screen bg-transparent">
      <header className="owner-dashboard-header">
        <div>
          <span>Owner Portal</span>
          <h1>Executive Business Dashboard</h1>
          <p>Premium owner-level visibility for cafe, bakery, branches, store purchases, sales, profit, balances, stock, credit, closures and alerts.</p>
        </div>
        <div className="owner-header-actions">
          <Link to="/sales-report">Sales Report</Link>
          <Link to="/admin-dashboard">Admin Center</Link>
        </div>
      </header>

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
          {tab === 'command'    && <OwnerCommandCenter />}
          {tab === 'branches'   && <BranchOverviewTab />}
          {tab === 'sales'      && <SalesOverviewTab />}
          {tab === 'stock'      && <StockAnalyticsTab />}
          {tab === 'credit'     && <OwnerCreditTab />}
          {tab === 'purchases'  && <OwnerPurchasesTab />}
          {tab === 'closure'    && <OwnerDailyClosureTab />}
          {tab === 'alerts'     && <OwnerAlertsTab />}
          {tab === 'attendance' && <AttendanceSalaryTab />}
          {tab === 'waste'      && <WasteLogsTab />}
        </main>
      </div>
    </div>
  );
}
