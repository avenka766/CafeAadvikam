import { useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrderStore } from '@/stores/orderStore';
import { useShallow } from 'zustand/react/shallow';
import { useBranchStore } from '@/branch/branchStore';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Branch } from '@/branch/types';
import { BRANCHES, BRANCH_LABELS, BRANCH_COLORS } from '@/branch/types';
import SnbItemsTab from '@/components/admin/SnbItemsTab';
import VrsnbItemsTab from '@/components/admin/VrsnbItemsTab';
import AdminCreditTab from '@/components/admin/AdminCreditTab';
import AdminAdvanceTab from '@/components/admin/AdminAdvanceTab';
import { useBranchLedger } from '@/hooks/useBranchLedger';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, AlertTriangle, Banknote, BarChart3, Bell, CalendarClock,
  CheckCircle2, ChevronDown, ClipboardList, CreditCard, Download,
  FileSpreadsheet, Filter, History, IndianRupee, Landmark, LayoutDashboard,
  Lock, Menu, Package, PackageSearch, Printer, Receipt, RefreshCw, Search,
  ShieldCheck, ShoppingBag, Smartphone, Store, TrendingDown, TrendingUp,
  WalletCards, X,
} from 'lucide-react';

const CHART_COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#ea580c'];
const PAYMENT_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#f97316', '#dc2626'];

// CHANGE 3: Removed 'stock-alerts' from AdminTab union
type AdminTab = 'overview' | 'cafe' | 'branches' | 'items' | 'daily-closure' | 'credits' | 'advance' | 'stock-variance' | 'audit';

type SalesTxn = {
  id: string; branch: Branch; itemName: string; qty: number; revenue: number;
  payment: string; soldAt: string; soldBy: string;
};

type ClosureRow = {
  branch: Branch; openingBalance: number; totalSales: number; cashSales: number;
  upiSales: number; cardSales: number; creditSales: number; returns: number;
  netSales: number; expenses: number; purchasePayments: number; bankDeposits: number;
  closingBalance: number; differenceAmount: number; remarks: string;
  status: 'Closed' | 'Pending' | 'Review'; closedBy: string; closedAt: string;
};

// CHANGE 3: Removed 'stock-alerts' nav item
const NAV_ITEMS: Array<{ id: AdminTab; label: string; description: string; icon: ElementType; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Dashboard Overview', description: 'Business KPIs, charts and reports', icon: LayoutDashboard },
  { id: 'cafe', label: 'Cafe Control', description: 'Cafe sales and payment split', icon: Store },
  { id: 'branches', label: 'Branch Sales', description: 'SNB, VRSNB and Hosur performance', icon: BarChart3 },
  { id: 'items', label: 'Items', description: 'Bakery SNB and VRSNB item controls', icon: PackageSearch, adminOnly: true },
  { id: 'daily-closure', label: 'Daily Closure', description: 'Cafe and branch closing verification', icon: CalendarClock, adminOnly: true },
  { id: 'credits', label: 'Credit Pending', description: 'Customer credit and due collection', icon: WalletCards, adminOnly: true },
  { id: 'advance', label: 'Advance Orders', description: 'Advance bookings and balances', icon: ClipboardList, adminOnly: true },
  { id: 'stock-variance', label: 'Stock Variance', description: 'Physical stock count differences from branches', icon: AlertTriangle, adminOnly: true },
  { id: 'audit', label: 'Audit Logs', description: 'Sensitive action history', icon: ShieldCheck, adminOnly: true },
];

function todayInput(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function lastWeekInput() { const d = new Date(); d.setDate(d.getDate() - 6); return todayInput(d); }
function startOfDay(value: string) { const d = value ? new Date(`${value}T00:00:00`) : new Date(0); d.setHours(0,0,0,0); return d; }
function endOfDay(value: string) { const d = value ? new Date(`${value}T23:59:59`) : new Date('2999-12-31T23:59:59'); d.setHours(23,59,59,999); return d; }
function inRange(iso: string, fromDate: string, toDate: string) { const t = new Date(iso).getTime(); return t >= startOfDay(fromDate).getTime() && t <= endOfDay(toDate).getTime(); }
function localDateKey(iso: string) { return todayInput(new Date(iso)); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso: string) { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function csvDownload(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  const safeRows = rows.length ? rows : [{ Note: 'No records for selected filters' }];
  const headers = Object.keys(safeRows[0]);
  const csv = [headers.join(','), ...safeRows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function paymentIncludes(payment: string | null | undefined, key: 'cash' | 'upi' | 'card' | 'credit') {
  const m = (payment || '').toLowerCase();
  if (key === 'cash') return m === 'cash' || m.includes('cash');
  if (key === 'upi') return m === 'upi' || m.includes('upi');
  if (key === 'card') return m === 'card' || m.includes('card');
  return m === 'credit' || m.includes('credit');
}
function paymentAmount(revenue: number, payment: string | null | undefined, key: 'cash' | 'upi' | 'card' | 'credit') {
  return paymentIncludes(payment, key) ? revenue : 0;
}

function Panel({ title, subtitle, action, children, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 overflow-hidden', className)}>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-slate-950">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, sub, icon, tone = 'slate' }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'purple' }) {
  const tones = { slate: 'bg-slate-50 text-slate-700 ring-slate-200', green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', red: 'bg-red-50 text-red-700 ring-red-200', blue: 'bg-blue-50 text-blue-700 ring-blue-200', purple: 'bg-purple-50 text-purple-700 ring-purple-200' };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <div className="mt-2 font-display text-2xl font-black leading-none text-slate-950 tabular-nums">{value}</div>
          {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={cn('grid size-11 shrink-0 place-items-center rounded-2xl ring-1', tones[tone])}>{icon}</div>
      </div>
    </div>
  );
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'purple' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700', purple: 'bg-purple-100 text-purple-700' };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', tones[tone])}>{children}</span>;
}

function BranchPill({ branch }: { branch: Branch }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase', BRANCH_COLORS[branch]?.badge)}>{BRANCH_LABELS[branch] ?? branch}</span>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function ChartWrap({ children, minHeight = 260 }: { children: ReactNode; minHeight?: number }) {
  return <div style={{ minHeight }} className="h-[280px] w-full">{children}</div>;
}

// CHANGE 4: Date preset component
const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: -1 },
  { label: '7 Days', days: 6 },
  { label: '15 Days', days: 14 },
  { label: '1 Month', days: 29 },
] as const;

function DatePresets({ setFromDate, setToDate }: { setFromDate: (d: string) => void; setToDate: (d: string) => void }) {
  function applyPreset(days: number) {
    const today = todayInput();
    if (days === -1) {
      const d = new Date(); d.setDate(d.getDate() - 1);
      const y = todayInput(d);
      setFromDate(y); setToDate(y);
    } else {
      const d = new Date(); d.setDate(d.getDate() - days);
      setFromDate(todayInput(d)); setToDate(today);
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {DATE_PRESETS.map(p => (
        <button key={p.label} onClick={() => applyPreset(p.days)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-950 hover:text-white transition">
          {p.label}
        </button>
      ))}
    </div>
  );
}

const ADMIN_BRANCHES: Branch[] = ['Cafe', 'VRSNB', 'SNB', 'Hosur'];

function AdminDashboard() {
  const { currentUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = ['admin', 'owner'].includes(currentUser?.role || '');
  const adminName = currentUser?.displayName || currentUser?.username || 'Admin';
  const requestedTab = searchParams.get('tab') as AdminTab | null;
  const initialTab = requestedTab && NAV_ITEMS.some((item) => item.id === requestedTab) ? requestedTab : 'overview';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [fromDate, setFromDate] = useState(lastWeekInput());
  const [toDate, setToDate] = useState(todayInput());
  const [closureDate, setClosureDate] = useState(todayInput());
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');
  const [itemsSection, setItemsSection] = useState<'snb' | 'vrsnb'>('snb');
  // Audit tab filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditBranchFilter, setAuditBranchFilter] = useState<Branch | 'all'>('all');

  const { orders, polling, startPolling, stopPolling } = useOrderStore(
    useShallow(s => ({ orders: s.orders, polling: s.polling, startPolling: s.startPolling, stopPolling: s.stopPolling }))
  );
  const { stock, sales, creditSales, stockMismatches, fetchBranchData, fetchStockMismatches } = useBranchStore();
  const { bills, returns, purchases, purchasePayments, cashMovements, bankDeposits, cashierClosures, stockVarianceRecords, auditLogs } = useBranchOpsStore();
  const adminLedger = useBranchLedger(fromDate, toDate, ['VRSNB', 'SNB', 'Hosur']);
  const selectTab = (next: AdminTab) => {
    setActiveTab(next);
    setSearchParams(next === 'overview' ? {} : { tab: next });
  };

  useEffect(() => { startPolling(90); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { BRANCHES.forEach(branch => void fetchBranchData(branch)); void fetchStockMismatches(); }, [fetchBranchData, fetchStockMismatches]);
  useEffect(() => {
    if (requestedTab && NAV_ITEMS.some((item) => item.id === requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, activeTab]);

  const rangeLabel = fromDate === toDate
    ? new Date(`${fromDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : `${new Date(`${fromDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(`${toDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const cafeOrdersInRange = useMemo(() => orders.filter(o => inRange(o.createdAt, fromDate, toDate)), [orders, fromDate, toDate]);
  const cafeServedOrders = useMemo(() => cafeOrdersInRange.filter(o => o.status === 'served'), [cafeOrdersInRange]);
  const cafeCancelledOrders = useMemo(() => cafeOrdersInRange.filter(o => o.status === 'cancelled'), [cafeOrdersInRange]);
  const cafeSalesTotal = useMemo(() => cafeServedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0), [cafeServedOrders]);

  const cafePaymentSplit = useMemo(() => {
    const split = { cash: 0, upi: 0, card: 0, credit: 0 };
    cafeServedOrders.forEach(o => {
      if (o.paymentType === 'cash') split.cash += Number(o.total || 0);
      else if (o.paymentType === 'upi') split.upi += Number(o.total || 0);
      else if (o.paymentType === 'card') split.card += Number(o.total || 0);
      else if (o.paymentType === 'unpaid') split.credit += Number(o.total || 0);
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        split.cash += Number(o.paymentBreakdown.cash || 0);
        split.upi += Number(o.paymentBreakdown.upi || 0);
        split.card += Number(o.paymentBreakdown.card || 0);
      }
    });
    return split;
  }, [cafeServedOrders]);

  const branchTransactions = useMemo<SalesTxn[]>(() => {
    const result: SalesTxn[] = [];
    BRANCHES.filter(b => b !== 'Cafe').forEach(branch => {
      (sales[branch] || []).filter(s => inRange(s.soldAt, fromDate, toDate)).forEach(s => {
        result.push({ id: s.id, branch, itemName: s.itemName, qty: Number(s.quantitySold || 0), revenue: Number(s.unitPrice || 0) * Number(s.quantitySold || 0), payment: s.paymentMethod || '-', soldAt: s.soldAt, soldBy: s.soldBy });
      });
    });
    return result.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales, fromDate, toDate]);

  const opsBillsInRange = useMemo(() => bills.filter(b => inRange(b.createdAt, fromDate, toDate)), [bills, fromDate, toDate]);
  const branchRevenueFromSales = useMemo(() => branchTransactions.reduce((sum, t) => sum + t.revenue, 0), [branchTransactions]);
  const opsBillRevenue = useMemo(() => opsBillsInRange.reduce((sum, b) => sum + Number(b.total || 0), 0), [opsBillsInRange]);
  const branchSalesTotal = Math.max(branchRevenueFromSales, opsBillRevenue);
  const businessTotalSales = cafeSalesTotal + branchSalesTotal;

  const branchSalesByBranch = useMemo(() => {
    return BRANCHES.map(branch => {
      if (branch === 'Cafe') return { branch, label: 'Cafe', sales: cafeSalesTotal, orders: cafeServedOrders.length, returns: 0 };
      const txns = branchTransactions.filter(t => t.branch === branch);
      const ops = opsBillsInRange.filter(b => b.branch === branch);
      const revenue = Math.max(txns.reduce((sum, t) => sum + t.revenue, 0), ops.reduce((sum, b) => sum + Number(b.total || 0), 0));
      return { branch, label: branch, sales: revenue, orders: Math.max(txns.length, ops.length), returns: returns.filter(r => r.branch === branch && inRange(r.createdAt, fromDate, toDate)).reduce((sum, r) => sum + Number(r.total || 0), 0) };
    });
  }, [cafeSalesTotal, cafeServedOrders.length, branchTransactions, opsBillsInRange, returns, fromDate, toDate]);

  // CHANGE 5: filtered branch sales for overview
  const filteredBranchSalesByBranch = useMemo(() => branchFilter === 'all' ? branchSalesByBranch : branchSalesByBranch.filter(b => b.branch === branchFilter), [branchSalesByBranch, branchFilter]);

  const dailySalesTrend = useMemo(() => {
    const days: Record<string, { date: string; Cafe: number; SNB: number; VRSNB: number; Hosur: number; Total: number }> = {};
    for (let d = new Date(`${fromDate}T00:00:00`); d <= endOfDay(toDate); d.setDate(d.getDate() + 1)) {
      const key = todayInput(d);
      days[key] = { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), Cafe: 0, SNB: 0, VRSNB: 0, Hosur: 0, Total: 0 };
    }
    cafeServedOrders.forEach(o => { const key = localDateKey(o.createdAt); if (!days[key]) return; days[key].Cafe += Number(o.total || 0); days[key].Total += Number(o.total || 0); });
    branchTransactions.forEach(t => { const key = localDateKey(t.soldAt); if (!days[key] || t.branch === 'Cafe') return; days[key][t.branch] += t.revenue; days[key].Total += t.revenue; });
    return Object.values(days);
  }, [fromDate, toDate, cafeServedOrders, branchTransactions]);

  const filteredDailySalesTrend = useMemo(() => {
    if (branchFilter === 'all') return dailySalesTrend;
    return dailySalesTrend.map(d => ({ ...d, Total: d[branchFilter as keyof typeof d] as number }));
  }, [dailySalesTrend, branchFilter]);

  const paymentSplit = useMemo(() => {
    const totals = { cash: cafePaymentSplit.cash, upi: cafePaymentSplit.upi, card: cafePaymentSplit.card, credit: cafePaymentSplit.credit };
    opsBillsInRange.forEach(b => {
      if (b.paymentMode === 'cash') totals.cash += Number(b.total || 0);
      else if (b.paymentMode === 'upi') totals.upi += Number(b.total || 0);
      else if (b.paymentMode === 'card') totals.card += Number(b.total || 0);
      else if (b.paymentMode === 'credit') totals.credit += Number(b.total || 0);
      else if (b.paymentMode === 'split') { totals.cash += Number(b.split?.cash || 0); totals.upi += Number(b.split?.upi || 0); totals.card += Number(b.split?.card || 0); }
    });
    branchTransactions.forEach(t => {
      if (paymentIncludes(t.payment, 'cash')) totals.cash += t.revenue;
      else if (paymentIncludes(t.payment, 'upi')) totals.upi += t.revenue;
      else if (paymentIncludes(t.payment, 'card')) totals.card += t.revenue;
      else if (paymentIncludes(t.payment, 'credit')) totals.credit += t.revenue;
    });
    return [{ name: 'Cash', value: totals.cash }, { name: 'UPI', value: totals.upi }, { name: 'Card', value: totals.card }, { name: 'Credit', value: totals.credit }].filter(item => item.value > 0);
  }, [cafePaymentSplit, opsBillsInRange, branchTransactions]);

  const topSellingItems = useMemo(() => {
    const map = new Map<string, { item: string; qty: number; revenue: number }>();
    const filteredCafeOrders = branchFilter === 'all' || branchFilter === 'Cafe' ? cafeServedOrders : [];
    const filteredTxns = branchFilter === 'all' ? branchTransactions : branchTransactions.filter(t => t.branch === branchFilter);
    filteredCafeOrders.forEach(o => o.items.forEach(ci => {
      const key = ci.menuItem.name;
      const existing = map.get(key) || { item: key, qty: 0, revenue: 0 };
      existing.qty += Number(ci.quantity || 0); existing.revenue += Number(ci.menuItem.price || 0) * Number(ci.quantity || 0);
      map.set(key, existing);
    }));
    filteredTxns.forEach(t => {
      const existing = map.get(t.itemName) || { item: t.itemName, qty: 0, revenue: 0 };
      existing.qty += t.qty; existing.revenue += t.revenue; map.set(t.itemName, existing);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map(item => ({ ...item, short: item.item.length > 16 ? `${item.item.slice(0, 16)}…` : item.item }));
  }, [cafeServedOrders, branchTransactions, branchFilter]);

  // CHANGE 3: stockAlerts kept for OverviewTab KpiCard only (no StockAlertsTab)
  const stockAlerts = useMemo(() => {
    let count = 0;
    BRANCHES.filter(b => b !== 'Cafe').forEach(branch => {
      (stock[branch] || []).forEach(s => { if (Number(s.quantity || 0) <= 0) count++; });
    });
    return count;
  }, [stock]);

  const creditPendingTotal = useMemo(() => BRANCHES.reduce((sum, branch) => sum + (creditSales[branch] || []).filter(c => c.status !== 'settled').reduce((s, c) => s + Number(c.creditAmount || 0), 0), 0), [creditSales]);
  const purchaseTotal = useMemo(() => purchases.filter(p => inRange(p.createdAt, fromDate, toDate)).reduce((sum, p) => sum + Number(p.total || 0), 0), [purchases, fromDate, toDate]);
  const expenseTotal = useMemo(() => cashMovements.filter(m => inRange(m.dateTime, fromDate, toDate) && m.direction === 'out' && m.purpose.toLowerCase().includes('expense')).reduce((sum, m) => sum + Number(m.amount || 0), 0), [cashMovements, fromDate, toDate]);

  const balanceSummary = useMemo(() => {
    const totals = { cash: 0, upi: 0, card: 0, bank: 0 };
    cashMovements.forEach(m => {
      if (!['cash', 'upi', 'card', 'bank'].includes(m.paymentMode)) return;
      const key = m.paymentMode as keyof typeof totals;
      totals[key] += m.direction === 'in' ? Number(m.amount || 0) : -Number(m.amount || 0);
    });
    bankDeposits.forEach(d => {
      const amount = Number(d.amount || 0); totals.bank += amount;
      if (d.paymentMode === 'Cash Deposit') totals.cash -= amount;
      if (d.paymentMode === 'UPI Transfer') totals.upi -= amount;
      if (d.paymentMode === 'Card Settlement') totals.card -= amount;
    });
    return totals;
  }, [cashMovements, bankDeposits]);

  const closureRows = useMemo<ClosureRow[]>(() => {
    return BRANCHES.map(branch => {
      const ledger = adminLedger.closureByBranchDate.get(`${branch}:${closureDate}`);
      const savedLedgerClosure = adminLedger.savedClosureByBranchDate.get(`${branch}:${closureDate}`);
      if (branch !== 'Cafe' && ledger) {
        const openingBalance = Number(savedLedgerClosure?.opening_cash || 0);
        const totalSales = adminLedger.toNumber(ledger.sales_total) + adminLedger.toNumber(ledger.advance_collected) + adminLedger.toNumber(ledger.advance_balance_collected);
        const cashSales = adminLedger.toNumber(ledger.cash_total);
        const upiSales = adminLedger.toNumber(ledger.upi_total);
        const cardSales = adminLedger.toNumber(ledger.card_total);
        const creditSalesDay = adminLedger.toNumber(ledger.credit_billed);
        const returnsDay = adminLedger.toNumber(savedLedgerClosure?.refunds || 0);
        const expensesDay = adminLedger.toNumber(savedLedgerClosure?.expenses || 0);
        const closingBalance = savedLedgerClosure ? adminLedger.toNumber(savedLedgerClosure.actual_cash) : openingBalance + cashSales - returnsDay - expensesDay;
        const differenceAmount = savedLedgerClosure ? adminLedger.toNumber(savedLedgerClosure.difference) : 0;
        const status: ClosureRow['status'] = savedLedgerClosure ? (Math.abs(differenceAmount) >= 10 ? 'Review' : 'Closed') : 'Pending';
        return {
          branch,
          openingBalance,
          totalSales,
          cashSales,
          upiSales,
          cardSales,
          creditSales: creditSalesDay,
          returns: returnsDay,
          netSales: Math.max(0, totalSales - returnsDay),
          expenses: expensesDay,
          purchasePayments: expensesDay,
          bankDeposits: 0,
          closingBalance,
          differenceAmount,
          remarks: savedLedgerClosure?.notes || (savedLedgerClosure ? 'Closed and verified from Supabase' : 'Pending branch closure'),
          status,
          closedBy: savedLedgerClosure?.cashier || '-',
          closedAt: savedLedgerClosure ? fmtDateTime(savedLedgerClosure.created_at) : '-',
        };
      }
      const closureRecords = cashierClosures.filter(c => c.branch === branch && localDateKey(c.createdAt) === closureDate);
      const latestClosure = closureRecords[0] || null;
      const txns = branch === 'Cafe' ? [] : branchTransactions.filter(t => t.branch === branch && localDateKey(t.soldAt) === closureDate);
      const opsBills = opsBillsInRange.filter(b => b.branch === branch && localDateKey(b.createdAt) === closureDate);
      const cafeDayOrders = branch === 'Cafe' ? orders.filter(o => localDateKey(o.createdAt) === closureDate && o.status === 'served') : [];
      const totalSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) : Math.max(txns.reduce((sum, t) => sum + t.revenue, 0), opsBills.reduce((sum, b) => sum + Number(b.total || 0), 0));
      const cashSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.cash || 0) : o.paymentType === 'cash' ? Number(o.total || 0) : 0), 0) : Math.max(txns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'cash'), 0), opsBills.reduce((sum, b) => sum + (b.paymentMode === 'cash' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.cash || 0) : 0), 0));
      const upiSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.upi || 0) : o.paymentType === 'upi' ? Number(o.total || 0) : 0), 0) : Math.max(txns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'upi'), 0), opsBills.reduce((sum, b) => sum + (b.paymentMode === 'upi' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.upi || 0) : 0), 0));
      const cardSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.card || 0) : o.paymentType === 'card' ? Number(o.total || 0) : 0), 0) : Math.max(txns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'card'), 0), opsBills.reduce((sum, b) => sum + (b.paymentMode === 'card' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.card || 0) : 0), 0));
      const creditSalesDay = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'unpaid' ? Number(o.total || 0) : 0), 0) : Math.max(txns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'credit'), 0), opsBills.reduce((sum, b) => sum + (b.paymentMode === 'credit' ? Number(b.total || 0) : 0), 0));
      const returnsDay = returns.filter(r => r.branch === branch && localDateKey(r.createdAt) === closureDate).reduce((sum, r) => sum + Number(r.total || 0), 0);
      const expensesDay = cashMovements.filter(m => m.branch === branch && localDateKey(m.dateTime) === closureDate && m.direction === 'out' && m.purpose.toLowerCase().includes('expense')).reduce((sum, m) => sum + Number(m.amount || 0), 0);
      const paymentsDay = purchasePayments.filter(p => p.branch === branch && localDateKey(p.createdAt) === closureDate).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const depositsDay = bankDeposits.filter(d => d.branch === branch && localDateKey(d.createdAt) === closureDate).reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const previousClosure = cashierClosures.filter(c => c.branch === branch && localDateKey(c.createdAt) < closureDate).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const openingBalance = Number(previousClosure?.closingCash || 0);
      const closingBalance = latestClosure ? Number(latestClosure.closingCash || 0) : openingBalance + cashSales - returnsDay - expensesDay - paymentsDay - depositsDay;
      const differenceAmount = latestClosure ? Number(latestClosure.difference || 0) : 0;
      // CHANGE 9b: improved status badge logic
      const status: ClosureRow['status'] = latestClosure ? (Math.abs(differenceAmount) >= 10 ? 'Review' : 'Closed') : 'Pending';
      return { branch, openingBalance, totalSales, cashSales, upiSales, cardSales, creditSales: creditSalesDay, returns: returnsDay, netSales: totalSales - returnsDay, expenses: expensesDay, purchasePayments: paymentsDay, bankDeposits: depositsDay, closingBalance, differenceAmount, remarks: latestClosure?.notes || (latestClosure ? 'Closed and verified' : 'Pending branch closure'), status, closedBy: latestClosure?.cashier || '-', closedAt: latestClosure ? fmtDateTime(latestClosure.createdAt) : '-' };
    });
  }, [adminLedger.closureByBranchDate, adminLedger.savedClosureByBranchDate, cashierClosures, branchTransactions, opsBillsInRange, orders, returns, cashMovements, purchasePayments, bankDeposits, closureDate]);

  const closureStatusChart = useMemo(() => [
    { status: 'Closed', count: closureRows.filter(r => r.status === 'Closed').length },
    { status: 'Review', count: closureRows.filter(r => r.status === 'Review').length },
    { status: 'Pending', count: closureRows.filter(r => r.status === 'Pending').length },
  ], [closureRows]);
  const filteredClosureRows = useMemo(() => closureRows.filter(row => branchFilter === 'all' || row.branch === branchFilter), [closureRows, branchFilter]);

  // CHANGE 9d: Closure totals summary
  const closureTotals = useMemo(() => ({
    sales: filteredClosureRows.reduce((s, r) => s + r.totalSales, 0),
    cash: filteredClosureRows.reduce((s, r) => s + r.cashSales, 0),
    upi: filteredClosureRows.reduce((s, r) => s + r.upiSales, 0),
    card: filteredClosureRows.reduce((s, r) => s + r.cardSales, 0),
    credit: filteredClosureRows.reduce((s, r) => s + r.creditSales, 0),
    diff: filteredClosureRows.reduce((s, r) => s + Math.abs(r.differenceAmount), 0),
  }), [filteredClosureRows]);

  const exportDailyClosure = () => {
    csvDownload(`Admin_DailyClosure_${closureDate}.csv`, filteredClosureRows.map(r => ({
      Branch: BRANCH_LABELS[r.branch], 'Opening Balance': r.openingBalance, 'Total Sales': r.totalSales,
      'Cash Sales': r.cashSales, 'UPI Sales': r.upiSales, 'Card Sales': r.cardSales, 'Credit Sales': r.creditSales,
      Returns: r.returns, 'Net Sales': r.netSales, Expenses: r.expenses, 'Purchase Payments': r.purchasePayments,
      'Bank Deposits': r.bankDeposits, 'Closing Balance': r.closingBalance, Difference: r.differenceAmount,
      Remarks: r.remarks, Status: r.status, 'Closed By': r.closedBy, 'Closed At': r.closedAt,
    })));
  };

  const printDailyClosure = () => {
    const rows = filteredClosureRows.map(r => `<tr><td>${BRANCH_LABELS[r.branch]}</td><td>${r.status}</td><td>₹${r.openingBalance.toFixed(2)}</td><td>₹${r.totalSales.toFixed(2)}</td><td>₹${r.cashSales.toFixed(2)}</td><td>₹${r.upiSales.toFixed(2)}</td><td>₹${r.cardSales.toFixed(2)}</td><td>₹${r.creditSales.toFixed(2)}</td><td>₹${r.returns.toFixed(2)}</td><td>₹${r.purchasePayments.toFixed(2)}</td><td>₹${r.bankDeposits.toFixed(2)}</td><td>₹${r.closingBalance.toFixed(2)}</td><td>₹${r.differenceAmount.toFixed(2)}</td><td>${r.closedBy}</td><td>${r.remarks}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Daily Closure ${closureDate}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:6px}th{background:#f3f4f6}@media print{button{display:none}}</style></head><body><h1>Admin Daily Closure</h1><p>Date: ${closureDate}</p><table><thead><tr><th>Branch</th><th>Status</th><th>Opening</th><th>Total Sales</th><th>Cash</th><th>UPI</th><th>Card</th><th>Credit</th><th>Returns</th><th>Purchase Pay.</th><th>Bank Deposit</th><th>Closing</th><th>Difference</th><th>Closed By</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (win) { win.document.write(html); win.document.close(); }
  };

  // CHANGE 12: Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs
      .filter(l => auditBranchFilter === 'all' || l.branch === auditBranchFilter)
      .filter(l => inRange(l.createdAt, fromDate, toDate))
      .filter(l => !q || `${l.action} ${l.user} ${l.branch}`.toLowerCase().includes(q));
  }, [auditLogs, auditBranchFilter, fromDate, toDate, auditSearch]);

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white/95 shadow-sm md:w-64 xl:w-72">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Admin Portal</p>
            <h1 className="mt-1 font-display text-xl font-black text-slate-950">Business Control</h1>
            <p className="mt-1 text-xs text-slate-500">Cafe · SNB · VRSNB · Hosur</p>
          </div>
          <button className="rounded-xl p-2 hover:bg-slate-100 md:hidden" onClick={() => setMobileNavOpen(false)}><X className="size-4" /></button>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const disabled = item.adminOnly && !isAdmin;
          return (
            <button key={item.id} type="button" disabled={disabled} onClick={() => { selectTab(item.id); setMobileNavOpen(false); }}
              className={cn('w-full rounded-2xl px-3 py-3 text-left transition', activeTab === item.id ? 'bg-slate-950 text-white shadow-lg shadow-slate-200' : 'text-slate-600 hover:bg-slate-100', disabled && 'cursor-not-allowed opacity-45')}>
              <div className="flex items-center gap-3">
                <div className={cn('grid size-10 place-items-center rounded-xl', activeTab === item.id ? 'bg-white/15' : 'bg-slate-100 text-slate-600')}>
                  {disabled ? <Lock className="size-4" /> : <Icon className="size-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black">{item.label}</p>
                  <p className={cn('mt-0.5 truncate text-[10px]', activeTab === item.id ? 'text-white/70' : 'text-slate-400')}>{item.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </nav>
      {/* CHANGE 13: Replaced "Role protected" box with user info */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 truncate">{adminName}</p>
            <p className="text-[10px] text-slate-500 capitalize">{currentUser?.role?.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>
    </aside>
  );

  const rangeControls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
        From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
      </label>
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
        To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
      </label>
      <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as Branch | 'all')} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none">
        <option value="all">All branches</option>
        {BRANCHES.map(branch => <option key={branch} value={branch}>{BRANCH_LABELS[branch]}</option>)}
      </select>
    </div>
  );

  // CHANGE 14: Removed top KPI grid from OverviewTab. CHANGE 4/5: Added date presets + branch filter + Excel download
  const OverviewTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePresets setFromDate={setFromDate} setToDate={setToDate} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <Panel title="Branch-wise Sales Comparison" subtitle="Cafe, SNB, VRSNB and Hosur revenue for selected range"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {rangeControls}
              <button onClick={() => csvDownload(`Admin_Overview_${fromDate}_${toDate}.csv`, filteredBranchSalesByBranch.map(r => ({ Branch: r.label, Sales: r.sales, Transactions: r.orders, Returns: r.returns, 'Date From': fromDate, 'Date To': toDate })))}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
                <FileSpreadsheet className="size-3.5" /> Excel
              </button>
            </div>
          }>
          <ChartWrap>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredBranchSalesByBranch}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={v => `₹${Number(v) / 1000}k`} />
                <Tooltip formatter={value => formatCurrency(Number(value))} />
                <Bar dataKey="sales" radius={[10, 10, 0, 0]}>
                  {filteredBranchSalesByBranch.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
        </Panel>

        <Panel title="Payment Mode Split" subtitle="Cash, UPI, card and credit mix">
          {paymentSplit.length === 0 ? <EmptyState label="No payment data in selected range." /> : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={4}>
                    {paymentSplit.map((_, index) => <Cell key={index} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={value => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
          <div className="grid grid-cols-2 gap-2">
            {paymentSplit.map((row, index) => (
              <div key={row.name} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }} /><p className="text-xs font-black text-slate-700">{row.name}</p></div>
                <p className="mt-1 text-sm font-black text-slate-950">{formatCurrency(row.value)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Daily Sales Trend" subtitle="Trend helps identify slow days and peak days">
          <ChartWrap>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredDailySalesTrend}>
                <defs><linearGradient id="totalSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={v => `₹${Number(v) / 1000}k`} />
                <Tooltip formatter={value => formatCurrency(Number(value))} />
                <Area type="monotone" dataKey="Total" stroke="#2563eb" fill="url(#totalSalesFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrap>
        </Panel>

        <Panel title="Top-selling Items" subtitle="Highest revenue items across cafe and branches">
          {topSellingItems.length === 0 ? <EmptyState label="No sold items for selected range." /> : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSellingItems.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${Number(v) / 1000}k`} />
                  <YAxis type="category" dataKey="short" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={value => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill="#059669" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Purchases & Expenses" subtitle="Cost visibility for selected range">
          <div className="space-y-3">
            <KpiCard label="Purchases" value={formatCurrency(purchaseTotal)} icon={<ShoppingBag className="size-5" />} tone="blue" />
            <KpiCard label="Expenses" value={formatCurrency(expenseTotal)} icon={<TrendingDown className="size-5" />} tone="red" />
          </div>
        </Panel>
        <Panel title="Available Balance" subtitle="Ledger-based current balance split">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Cash" value={formatCurrency(balanceSummary.cash)} icon={<Banknote className="size-5" />} tone="green" />
            <KpiCard label="UPI" value={formatCurrency(balanceSummary.upi)} icon={<Smartphone className="size-5" />} tone="blue" />
            <KpiCard label="Card" value={formatCurrency(balanceSummary.card)} icon={<CreditCard className="size-5" />} tone="purple" />
            <KpiCard label="Bank" value={formatCurrency(balanceSummary.bank)} icon={<Landmark className="size-5" />} tone="slate" />
          </div>
        </Panel>
        <Panel title="Daily Closure Status" subtitle={`Status for ${closureDate}`}>
          <div className="space-y-3">
            {closureStatusChart.map((row, index) => (
              <div key={row.status} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: CHART_COLORS[index] }} /><p className="text-sm font-bold text-slate-700">{row.status}</p></div>
                <p className="text-xl font-black text-slate-950">{row.count}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );

  // CHANGE 14: Removed top KPI grid from CafeTab. CHANGE 4/6: Added date presets + Excel download
  const CafeTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePresets setFromDate={setFromDate} setToDate={setToDate} />
      </div>
      <Panel title="Cafe Sales Trend" subtitle="Cafe-only revenue trend"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {rangeControls}
            <button onClick={() => csvDownload(`Admin_Cafe_${fromDate}_${toDate}.csv`, cafeOrdersInRange.map(o => ({ OrderNo: o.orderNumber, Customer: o.customerName || '-', Items: o.items.reduce((s, i) => s + i.quantity, 0), Payment: o.paymentType || '-', Total: o.total || 0, Status: o.status, Time: fmtDateTime(o.createdAt) })))}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              <FileSpreadsheet className="size-3.5" /> Excel
            </button>
          </div>
        }>
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailySalesTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${Number(v) / 1000}k`} width={72} />
              <Tooltip formatter={value => formatCurrency(Number(value))} />
              <Line dataKey="Cafe" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Panel>
      <Panel title="Recent Cafe Orders" subtitle="Served and cancelled orders in selected range">
        {cafeOrdersInRange.length === 0 ? <EmptyState label="No cafe orders in this range." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Payment</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3">Time</th></tr></thead>
              <tbody className="divide-y">
                {cafeOrdersInRange.slice(0, 60).map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold">#{String(o.orderNumber).padStart(3, '0')}</td>
                    <td className="p-3">{o.customerName || '-'}</td>
                    <td className="p-3 text-slate-500">{o.items.reduce((s, i) => s + i.quantity, 0)} item(s)</td>
                    <td className="p-3 uppercase">{o.paymentType || '-'}</td>
                    <td className="p-3 text-right font-black">{formatCurrency(o.total || 0)}</td>
                    <td className="p-3"><Badge tone={o.status === 'served' ? 'green' : o.status === 'cancelled' ? 'red' : 'amber'}>{o.status}</Badge></td>
                    <td className="p-3 text-slate-500">{fmtDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  // CHANGE 7: Branch filter + date presets + Excel. CHANGE 14: Removed KPI grid
  const filteredBranchTxns = branchFilter === 'all' ? branchTransactions : branchTransactions.filter(t => t.branch === branchFilter);
  const BranchesTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePresets setFromDate={setFromDate} setToDate={setToDate} />
      </div>
      <Panel title="Branch Sales Comparison" subtitle="Revenue by branch and selected range"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {rangeControls}
            <button onClick={() => csvDownload(`Admin_BranchSales_${fromDate}_${toDate}.csv`, filteredBranchTxns.map(t => ({ Branch: t.branch, Item: t.itemName, Qty: t.qty, Payment: t.payment, Revenue: t.revenue, 'Sold By': t.soldBy, Time: fmtDateTime(t.soldAt) })))}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              <FileSpreadsheet className="size-3.5" /> Excel
            </button>
          </div>
        }>
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={branchFilter === 'all' ? branchSalesByBranch.filter(b => b.branch !== 'Cafe') : branchSalesByBranch.filter(b => b.branch === branchFilter)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${Number(v) / 1000}k`} width={72} />
              <Tooltip formatter={value => formatCurrency(Number(value))} />
              <Bar dataKey="sales" radius={[10, 10, 0, 0]} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Panel>
      <Panel title="Branch Sales Transactions" subtitle="SNB, VRSNB and Hosur sales details">
        {filteredBranchTxns.length === 0 ? <EmptyState label="No branch sales in this range." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Branch</th><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3">Payment</th><th className="p-3 text-right">Revenue</th><th className="p-3">Sold By</th><th className="p-3">Time</th></tr></thead>
              <tbody className="divide-y">
                {filteredBranchTxns.slice(0, 100).map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="p-3"><BranchPill branch={t.branch} /></td>
                    <td className="p-3 font-semibold">{t.itemName}</td>
                    <td className="p-3 text-right tabular-nums">{t.qty}</td>
                    <td className="p-3 uppercase text-slate-500">{t.payment}</td>
                    <td className="p-3 text-right font-black">{formatCurrency(t.revenue)}</td>
                    <td className="p-3 text-slate-500">{t.soldBy}</td>
                    <td className="p-3 text-slate-500">{fmtDateTime(t.soldAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const ItemsTab = (
    <div className="space-y-5">
      <Panel title="Items > Bakery" subtitle="Items without stock are marked unavailable and cannot be billed from the branch billing flow.">
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button onClick={() => setItemsSection('snb')} className={cn('rounded-2xl border p-4 text-left transition', itemsSection === 'snb' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:bg-slate-50')}>
            <p className="font-black">SNB Items</p>
            <p className={cn('mt-1 text-xs', itemsSection === 'snb' ? 'text-white/70' : 'text-slate-500')}>Shared SNB and Hosur bakery price list with stock badges</p>
          </button>
          <button onClick={() => setItemsSection('vrsnb')} className={cn('rounded-2xl border p-4 text-left transition', itemsSection === 'vrsnb' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:bg-slate-50')}>
            <p className="font-black">VRSNB Items</p>
            <p className={cn('mt-1 text-xs', itemsSection === 'vrsnb' ? 'text-white/70' : 'text-slate-500')}>VRSNB item list with stock validation visibility</p>
          </button>
        </div>
        {itemsSection === 'snb' ? <SnbItemsTab /> : <VrsnbItemsTab />}
      </Panel>
    </div>
  );

  // CHANGE 9: Improved DailyClosureTab with presets, better layout, summary totals. CHANGE 14: Removed KPI grid
  const DailyClosureTab = (
    <div className="space-y-5">
      {/* CHANGE 9c: closure date presets (Today/Yesterday only) */}
      <div className="flex gap-1.5">
        {[{ label: 'Today', days: 0 }, { label: 'Yesterday', days: 1 }].map(p => (
          <button key={p.label} onClick={() => { const d = new Date(); d.setDate(d.getDate() - p.days); setClosureDate(todayInput(d)); }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-950 hover:text-white transition">
            {p.label}
          </button>
        ))}
      </div>
      <Panel title="Daily Closure Verification" subtitle="Cafe, SNB Branch, VRSNB Branch and Hosur Branch"
        action={<div className="flex flex-wrap gap-2"><button onClick={printDailyClosure} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black"><Printer className="size-3.5" />Print</button><button onClick={exportDailyClosure} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Download className="size-3.5" />Export</button></div>}>
        <div className="mb-4 grid gap-2 lg:grid-cols-[180px_220px_1fr]">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            Date<input type="date" value={closureDate} onChange={e => setClosureDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value as Branch | 'all')} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
            <option value="all">All branches</option>
            {BRANCHES.map(branch => <option key={branch} value={branch}>{BRANCH_LABELS[branch]}</option>)}
          </select>
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500"><Filter className="size-4" />Verify sales, collections, expenses, deposits and closing differences before approving.</div>
        </div>

        {/* CHANGE 9a: Better visual layout per branch card */}
        <div className="grid gap-4">
          {filteredClosureRows.map(row => (
            <div key={row.branch} className="rounded-3xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn('grid size-12 place-items-center rounded-2xl', BRANCH_COLORS[row.branch].bg)}><Store className={cn('size-5', BRANCH_COLORS[row.branch].text)} /></div>
                  <div><h4 className="font-display text-lg font-black text-slate-950">{BRANCH_LABELS[row.branch]}</h4><p className="text-xs text-slate-500">Closed by {row.closedBy} · {row.closedAt}</p></div>
                </div>
                <Badge tone={row.status === 'Closed' ? 'green' : row.status === 'Review' ? 'red' : 'amber'}>{row.status}</Badge>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase text-slate-500">Cash Flow</p>
                  <div className="space-y-1.5">
                    {[['Opening', row.openingBalance, 'text-slate-700'], ['Cash Sales', row.cashSales, 'text-emerald-700'], ['Returns', -row.returns, row.returns > 0 ? 'text-red-600' : 'text-slate-500'], ['Expenses', -row.expenses, row.expenses > 0 ? 'text-red-600' : 'text-slate-500'], ['Purchase Payments', -row.purchasePayments, row.purchasePayments > 0 ? 'text-red-600' : 'text-slate-500'], ['Bank Deposits', -row.bankDeposits, row.bankDeposits > 0 ? 'text-red-600' : 'text-slate-500'], ['Closing Balance', row.closingBalance, 'text-slate-900 font-black'], ['Difference', row.differenceAmount, Math.abs(row.differenceAmount) >= 10 ? 'text-red-600 font-black' : 'text-emerald-600']].map(([label, value, cls]) => (
                      <div key={String(label)} className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className={cn('tabular-nums', String(cls))}>{formatCurrency(Number(value))}</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase text-slate-500">Digital & Credit</p>
                  <div className="space-y-1.5">
                    {[['Total Sales', row.totalSales, 'text-slate-900 font-black'], ['UPI Sales', row.upiSales, 'text-blue-700'], ['Card Sales', row.cardSales, 'text-purple-700'], ['Credit Sales', row.creditSales, 'text-amber-700'], ['Net Sales', row.netSales, 'text-emerald-700 font-black']].map(([label, value, cls]) => (
                      <div key={String(label)} className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className={cn('tabular-nums', String(cls))}>{formatCurrency(Number(value))}</span></div>
                    ))}
                  </div>
                </div>
              </div>
              {row.remarks && <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Remarks:</b> {row.remarks}</p>}
            </div>
          ))}
        </div>

        {/* CHANGE 9d: Summary totals row */}
        {filteredClosureRows.length > 1 && (
          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-[10px] font-black uppercase text-slate-500">Totals — All Branches</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[['Total Sales', closureTotals.sales], ['Cash', closureTotals.cash], ['UPI', closureTotals.upi], ['Card', closureTotals.card], ['Credit', closureTotals.credit], ['Difference', closureTotals.diff]].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-white border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-black text-slate-950 tabular-nums">{formatCurrency(Number(value))}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );

  // CHANGE 14: Removed KPI grid from CreditsTab. CHANGE 4/10: Date presets passed via props
  const CreditsTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePresets setFromDate={setFromDate} setToDate={setToDate} />
      </div>
      <Panel title="Credit Management" subtitle="Credit collection flow remains inside the existing credit module, now embedded in Admin control.">
        <AdminCreditTab branches={ADMIN_BRANCHES} />
      </Panel>
    </div>
  );

  // CHANGE 4/11: Date presets for AdvanceTab
  const AdvanceTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <DatePresets setFromDate={setFromDate} setToDate={setToDate} />
      </div>
      <Panel title="Advance Order Management" subtitle="Advance bookings and balance verification across Cafe, SNB, VRSNB and Hosur.">
        <AdminAdvanceTab branches={ADMIN_BRANCHES} />
      </Panel>
    </div>
  );

  const StockVarianceTab = (
    <div className="space-y-5">
      <Panel
        title="Stock Variance"
        subtitle="Physical stock-count differences confirmed by branch admin"
        action={
          <button
            onClick={() =>
              csvDownload(
                'Admin_StockVariance.csv',
                stockVarianceRecords.map(row => ({
                  Date: fmtDateTime(row.createdAt),
                  Branch: row.branch,
                  Report: row.reportNo,
                  Item: row.itemName,
                  Unit: row.unit || '',
                  'System Qty': row.systemQty,
                  'Physical Qty': row.physicalQty,
                  Difference: row.difference,
                  'Reported By': row.reportedBy,
                  'Confirmed By': row.confirmedBy,
                })),
              )
            }
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
          >
            <FileSpreadsheet className="size-3.5" />Excel
          </button>
        }
      >
        {stockVarianceRecords.length === 0 ? (
          <EmptyState label="No stock variance records yet. Differences will appear after SNB Admin confirms a stock-count report." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Date</th>
                  <th className="p-3">Branch</th>
                  <th className="p-3">Report</th>
                  <th className="p-3">Item</th>
                  <th className="p-3 text-right">System</th>
                  <th className="p-3 text-right">Physical</th>
                  <th className="p-3 text-right">Difference</th>
                  <th className="p-3">Reported By</th>
                  <th className="p-3">Confirmed By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockVarianceRecords.slice(0, 300).map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{fmtDateTime(row.createdAt)}</td>
                    <td className="p-3"><BranchPill branch={row.branch} /></td>
                    <td className="p-3 font-bold">{row.reportNo}</td>
                    <td className="p-3 font-semibold">{row.itemName}</td>
                    <td className="p-3 text-right tabular-nums">{row.systemQty} {row.unit}</td>
                    <td className="p-3 text-right tabular-nums">{row.physicalQty} {row.unit}</td>
                    <td className="p-3 text-right"><Badge tone={row.difference > 0 ? 'red' : 'blue'}>{row.difference}</Badge></td>
                    <td className="p-3 text-slate-500">{row.reportedBy}</td>
                    <td className="p-3 text-slate-500">{row.confirmedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  // CHANGE 12: Improved AuditTab with filters, search, refresh, empty message, Excel export
  const AuditTab = (
    <div className="space-y-5">
      <Panel title="Admin Audit Logs" subtitle="Sensitive edits, stock changes, duplicate prints and closure actions"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { BRANCHES.forEach(b => void fetchBranchData(b)); void fetchStockMismatches(); }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
              <RefreshCw className="size-3.5" />Refresh
            </button>
            <button onClick={() => csvDownload('Admin_AuditLogs.csv', filteredAuditLogs.map(l => ({ Time: fmtDateTime(l.createdAt), Branch: l.branch, User: l.user, Action: l.action, Previous: l.previousValue, New: l.newValue })))}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              <FileSpreadsheet className="size-3.5" />Excel
            </button>
          </div>
        }>
        <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_180px_200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search action, user or branch" className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <select value={auditBranchFilter} onChange={e => setAuditBranchFilter(e.target.value as Branch | 'all')} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
            <option value="all">All branches</option>
            {BRANCHES.map(branch => <option key={branch} value={branch}>{BRANCH_LABELS[branch]}</option>)}
          </select>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
            </label>
            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
            </label>
          </div>
        </div>
        {filteredAuditLogs.length === 0 ? (
          <EmptyState label={auditLogs.length === 0 ? "Audit logs are written when stock edits, duplicate prints, and closure actions occur in branch dashboards." : "No audit logs match the current filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Time</th><th className="p-3">Branch</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Previous</th><th className="p-3">New</th></tr></thead>
              <tbody className="divide-y">
                {filteredAuditLogs.slice(0, 150).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{fmtDateTime(log.createdAt)}</td>
                    <td className="p-3"><BranchPill branch={log.branch} /></td>
                    <td className="p-3 font-semibold">{log.user}</td>
                    <td className="p-3">{log.action}</td>
                    <td className="p-3 text-slate-500">{log.previousValue}</td>
                    <td className="p-3 text-slate-500">{log.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const activeContent: Record<AdminTab, ReactNode> = {
    overview: OverviewTab,
    cafe: CafeTab,
    branches: BranchesTab,
    items: ItemsTab,
    'daily-closure': DailyClosureTab,
    credits: CreditsTab,
    advance: AdvanceTab,
    'stock-variance': StockVarianceTab,
    audit: AuditTab,
  };

  const activeMeta = NAV_ITEMS.find(item => item.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-[100dvh] bg-slate-50/80">
      <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setMobileNavOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-sm font-black text-white"><Menu className="size-4" />Menu</button>
          <div className="text-right"><p className="text-xs font-black uppercase tracking-wider text-primary">Admin</p><p className="text-sm font-bold text-slate-950">{activeMeta.label}</p></div>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileNavOpen(false)} />
          <div className="relative h-full w-[88vw] max-w-sm">{sidebar}</div>
        </div>
      )}

      <div className="mx-auto flex min-h-[100dvh] max-w-[1800px]">
        <div className="sticky top-0 hidden h-[100dvh] shrink-0 md:block">{sidebar}</div>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-5 xl:px-8">
          <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Complete Business Control</p>
                <Badge tone={polling ? 'green' : 'amber'}>{polling ? 'Live' : 'Offline'}</Badge>
              </div>
              <h2 className="mt-1 font-display text-2xl font-black text-slate-950 sm:text-3xl">{activeMeta.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{activeMeta.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><Activity className="size-4 text-emerald-600" />{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <button onClick={() => { BRANCHES.forEach(b => void fetchBranchData(b)); void fetchStockMismatches(); }} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="size-3.5" />Refresh</button>
            </div>
          </div>

          {!isAdmin && (
            <div className="mb-5 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Lock className="size-5 shrink-0" /> Admin-only actions are locked for this role. View-only monitoring remains available.
            </div>
          )}

          {activeContent[activeTab]}
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
