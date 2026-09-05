import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import AdminDispatchDetailsTab from '@/components/admin/AdminDispatchDetailsTab';
import AdminAdvanceTab from '@/components/admin/AdminAdvanceTab';
import AttendanceSalary from '@/pages/AttendanceSalary';
import AdminWalletTab from '@/components/admin/AdminWalletTab';
import AdminPromotionsTab from '@/components/admin/AdminPromotionsTab';
import AdminInvoicesTab from '@/bakery/AdminInvoicesTab';
import AdminPurchaseOrdersTab from '@/bakery/AdminPurchaseOrdersTab';
import { useBranchLedger } from '@/hooks/useBranchLedger';
import { useNotificationStore } from '@/bakery/notificationStore';
import { supabase } from '@/lib/supabase';
import { exportWorkbook, exportReportPdf, pdfMoney } from '@/lib/exportAdminReport';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, AlertTriangle, Banknote, BarChart3, Bell, CalendarClock,
  CheckCircle2, ChevronDown, ClipboardList, CreditCard, Download, FileDown,
  FileSpreadsheet, Filter, History, IndianRupee, Landmark, LayoutDashboard,
  Lock, Package, PackageSearch, Printer, RefreshCw, Search,
  ShieldCheck, ShoppingBag, Smartphone, Store, TrendingDown, TrendingUp,
  Trash2, WalletCards, Gift, X, Truck,
} from 'lucide-react';

const CHART_COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#ea580c'];
const PAYMENT_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#f97316', '#dc2626'];

// CHANGE 3: Removed 'stock-alerts' from AdminTab union
type AdminTab = 'public-orders' | 'wallet' | 'promotions' | 'overview' | 'cafe' | 'branches' | 'hosur' | 'dispatch-details' | 'items' | 'daily-closure' | 'credits' | 'advance' | 'stock-disputes' | 'stock-variance' | 'waste' | 'audit' | 'invoices' | 'purchase-orders' | 'alerts' | 'complaints' | 'attendance';

type SalesTxn = {
  id: string; branch: Branch; itemName: string; qty: number; revenue: number;
  payment: string; soldAt: string; soldBy: string; billNo: string | null;
};

type ClosureRow = {
  branch: Branch; openingBalance: number; totalSales: number; cashSales: number;
  upiSales: number; cardSales: number; creditSales: number; returns: number;
  netSales: number; expenses: number; purchasePayments: number; bankDeposits: number;
  closingBalance: number; differenceAmount: number; remarks: string;
  status: 'Closed' | 'Pending' | 'Review'; closedBy: string; closedAt: string;
  advanceCollected: number; advanceBalanceCollected: number;
};

// CHANGE 3: Removed 'stock-alerts' nav item
type PublicOrder = { id: string; order_number: string; customer_name: string; customer_phone: string; customer_address: string; location_pin: string; notes: string | null; amount: number; status: string; payment_id: string | null; items: Array<{name:string;qty:number;price:number;venue:string;unit?:string}>; created_at: string };

const PUBLIC_ORDER_STATUS_OPTIONS = [
  { value: 'paid', label: 'Payment received' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const NAV_ITEMS: Array<{ id: AdminTab; label: string; description: string; icon: ElementType; adminOnly?: boolean }> = [
  { id: 'public-orders', label: 'Online Orders', description: 'Paid landing-page orders from Razorpay', icon: Smartphone, adminOnly: true },
  { id: 'wallet', label: 'Wallet', description: 'Create prepaid wallets, credit balances and audit usage', icon: WalletCards, adminOnly: true },
  { id: 'promotions', label: 'Promotions', description: 'Create, test, schedule and analyse promotional campaigns', icon: Gift, adminOnly: true },
  { id: 'overview', label: 'Dashboard Overview', description: 'Business KPIs, charts and reports', icon: LayoutDashboard },
  { id: 'cafe', label: 'Cafe Control', description: 'Cafe sales and payment split', icon: Store },
  { id: 'branches', label: 'Branch Sales', description: 'SNB and VRSNB performance', icon: BarChart3 },
  { id: 'hosur', label: 'Hosur Sales', description: 'Hosur wholesale shop billing and dispatch', icon: Truck },
  { id: 'dispatch-details', label: 'Dispatch Details', description: 'Every Planner dispatch invoice — TO (SNB/VRSNB), SALES (Hosur/Sales) and Cake', icon: FileSpreadsheet },
  { id: 'items', label: 'Items', description: 'SNB and VRSNB item controls', icon: PackageSearch, adminOnly: true },
  { id: 'daily-closure', label: 'Daily Closure', description: 'Cafe and branch closing verification', icon: CalendarClock, adminOnly: true },
  { id: 'credits', label: 'Credit Pending', description: 'Customer credit and due collection', icon: WalletCards, adminOnly: true },
  { id: 'advance', label: 'Advance Orders', description: 'Advance bookings and balances', icon: ClipboardList, adminOnly: true },
  { id: 'stock-disputes', label: 'Stock Disputes', description: 'Incoming stock mismatch approvals', icon: AlertTriangle, adminOnly: true },
  { id: 'stock-variance', label: 'Stock Variance', description: 'Physical stock count differences from branches', icon: AlertTriangle, adminOnly: true },
  { id: 'waste', label: 'Waste & Loss', description: 'Waste deductions reported by every branch', icon: Trash2, adminOnly: true },
  { id: 'audit', label: 'Audit Logs', description: 'Sensitive action history', icon: ShieldCheck, adminOnly: true },
  { id: 'invoices', label: 'GRN', description: 'Goods receipt review and approval', icon: FileSpreadsheet, adminOnly: true },
  { id: 'purchase-orders', label: 'Purchase Orders', description: 'Status of Store purchase orders (Owner approves)', icon: ClipboardList, adminOnly: true },
  { id: 'alerts', label: 'Alerts', description: 'Business alerts (no low-stock)', icon: Bell, adminOnly: true },
  { id: 'complaints', label: 'Complaints', description: 'Branch admin complaints and issues', icon: ClipboardList, adminOnly: true },
  { id: 'attendance', label: 'Attendance & Payroll', description: 'Staff attendance and salary management', icon: CalendarClock, adminOnly: true },
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
// FEATURE (2026-09-04): bill-wise Excel sheets need Date and Time as their
// own columns (not one combined string) — added alongside fmtDate/fmtDateTime
// rather than reformatting those, since several existing sheets/PDFs still
// rely on the combined form.
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
// Cafe orders carry a single paymentType + an optional paymentBreakdown
// (only populated for 'part_payment') rather than the per-payment-row table
// branch/Hosur bills use — this derives the same {cash, upi, card} shape so
// the bill-wise sheet's Cash/UPI/Card columns mean the same thing everywhere.
function cafePaidByMode(paymentType: string, breakdown?: { cash: number; upi: number; card: number } | null, total = 0) {
  if (paymentType === 'part_payment' && breakdown) return { cash: breakdown.cash || 0, upi: breakdown.upi || 0, card: breakdown.card || 0 };
  if (paymentType === 'cash') return { cash: total, upi: 0, card: 0 };
  if (paymentType === 'upi') return { cash: 0, upi: total, card: 0 };
  if (paymentType === 'card') return { cash: 0, upi: 0, card: total };
  return { cash: 0, upi: 0, card: 0 }; // wallet/credit/advance/unpaid — not cash/upi/card
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

function DatePresets({ fromDate, toDate, setFromDate, setToDate }: { fromDate: string; toDate: string; setFromDate: (d: string) => void; setToDate: (d: string) => void }) {
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
      {DATE_PRESETS.map(p => {
        const today = todayInput();
        const expectedFrom = p.days === -1
          ? todayInput(new Date(Date.now() - 86400000))
          : todayInput(new Date(Date.now() - p.days * 86400000));
        const expectedTo = p.days === -1 ? expectedFrom : today;
        const active = fromDate === expectedFrom && toDate === expectedTo;
        return (
          <button key={p.label} onClick={() => applyPreset(p.days)}
            aria-pressed={active}
            className={cn('rounded-full border px-3 py-1 text-xs font-black transition', active
              ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100')}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

const ADMIN_BRANCHES: Branch[] = ['Cafe', 'VRSNB', 'SNB', 'Hosur'];

function AdminDashboard() {
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = ['admin', 'owner'].includes(currentUser?.role || '');
  const adminName = currentUser?.displayName || currentUser?.username || 'Admin';
  const requestedTab = searchParams.get('tab') as AdminTab | null;
  const allowedNavItems = useMemo(() => NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin), [isAdmin]);
  const activeTab: AdminTab = requestedTab && allowedNavItems.some((item) => item.id === requestedTab) ? requestedTab : 'overview';
  const [publicOrders, setPublicOrders] = useState<PublicOrder[]>([]);
  const [publicOrdersLoading, setPublicOrdersLoading] = useState(false);
  const [publicOrderUpdating, setPublicOrderUpdating] = useState<string | null>(null);
  // EGRESS FIX: default to today only — this dashboard used to load a full
  // rolling week of bills across every branch on every mount, even before the
  // admin touched the date filter. Admin can still widen the range with the
  // preset buttons (7d/30d/etc.) below, which is an explicit, on-demand fetch.
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [closureDate, setClosureDate] = useState(todayInput());
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [billSearch, setBillSearch] = useState('');
  const [itemsSection, setItemsSection] = useState<'snb' | 'vrsnb'>('snb');
  // Audit tab filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditBranchFilter, setAuditBranchFilter] = useState<Branch | 'all'>('all');

  const { orders, polling, startPolling, stopPolling, loadOrders, ordersLoading } = useOrderStore(
    useShallow(s => ({ orders: s.orders, polling: s.polling, startPolling: s.startPolling, stopPolling: s.stopPolling, loadOrders: s.loadOrders, ordersLoading: s.loading }))
  );
  const { stock, sales, incoming, creditSales, stockMismatches, fetchBranchData, fetchStockMismatches, confirmIncoming } = useBranchStore();
  const { bills, returns, purchasePayments, cashMovements, bankDeposits, cashierClosures, stockVarianceRecords, auditLogs, notifications, updateNotificationStatus, complaints, updateComplaintStatus, fetchBillsInRange } = useBranchOpsStore();
  // The in-memory `bills` array is capped for performance (see
  // branchOpsStore's hydration limit). Whenever the selected report range
  // changes, fetch that exact range directly (across all branches, since this
  // dashboard covers all of them) so totals are never silently clipped.
  useEffect(() => {
    void fetchBillsInRange(fromDate, toDate);
  }, [fromDate, toDate, fetchBillsInRange]);
  const { notifications: adminNotifications, load: loadAdminNotifications, markRead } = useNotificationStore();
  const adminLedger = useBranchLedger(fromDate, toDate, ['VRSNB', 'SNB', 'Hosur']);
  // Daily Closure tab has its own independent date picker (closureDate), separate
  // from the Overview's fromDate/toDate range — needs its own ledger fetch scoped
  // to that exact date, or it silently misses whenever closureDate falls outside
  // the Overview range (see BUG FIX note in closureRows below).
  const closureLedger = useBranchLedger(closureDate, closureDate, ['VRSNB', 'SNB', 'Hosur']);
  const selectTab = (next: AdminTab) => {
    setSearchParams(next === 'overview' ? {} : { tab: next });
  };

  useEffect(() => { startPolling(90); return () => stopPolling(); }, [startPolling, stopPolling]);
  // AUDIT FIX (2026-09-04): named so the header's "Refresh" button (and the
  // new per-tab Refresh buttons on Overview/Audit below) can call the exact
  // same fetch on demand instead of only ever running once on mount.
  const refreshBranchAndStock = useCallback(() => {
    BRANCHES.forEach(branch => void fetchBranchData(branch));
    void fetchStockMismatches();
  }, [fetchBranchData, fetchStockMismatches]);
  useEffect(() => { refreshBranchAndStock(); }, [refreshBranchAndStock]);
  // Branch waste (dump/damage/transfer-out) is shared across SNB Order, SNB Admin,
  // VRSNB Admin, Owner, and here via the `branch_waste_logs` Supabase table.
  // This used to read a local-only branchOpsStore that never synced across devices.
  const [wasteLogs, setWasteLogs] = useState<Array<{
    id: string; branch: string; logType: string; itemName: string;
    quantity: number; unit: string; reason: string; verifiedBy: string; createdAt: string;
  }>>([]);
  const [wasteLogsLoading, setWasteLogsLoading] = useState(false);
  // AUDIT FIX (2026-09-04): extracted out of the mount/date-change effect
  // below so the Waste & Loss tab (previously refresh-only-on-date-change,
  // with no manual re-fetch) can call this same query on demand — see the
  // `wasteRequestRef` generation-counter pattern's comment further down.
  const wasteRequestRef = useRef(0);
  const fetchWasteLogsNow = useCallback(async () => {
    // BUG FIX: a date <input> can be cleared to an empty string (select-all
    // + delete, or some mobile date pickers) which propagated straight into
    // `${fromDate}T00:00:00` here, producing the literal string "T00:00:00"
    // — invalid timestamptz syntax that Postgres rejected on every keystroke
    // until a new valid date was picked. Skip the query entirely until both
    // dates are actually set rather than sending a malformed filter.
    if (!fromDate || !toDate) return;
    const requestId = ++wasteRequestRef.current;
    setWasteLogsLoading(true);
    const { data, error } = await supabase
      .from('branch_waste_logs')
      .select('id,branch,log_type,item_name,quantity,unit,reason,verified_by,created_at')
      .gte('created_at', `${fromDate}T00:00:00`)
      .lte('created_at', `${toDate}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (wasteRequestRef.current !== requestId) return;
    if (!error && data) {
      setWasteLogs(data.map((d: any) => ({
        id: d.id,
        branch: d.branch,
        logType: d.log_type,
        itemName: d.item_name,
        quantity: Number(d.quantity || 0),
        unit: d.unit,
        reason: d.reason || '',
        verifiedBy: d.verified_by || '',
        createdAt: d.created_at,
      })));
    }
    setWasteLogsLoading(false);
  }, [fromDate, toDate]);
  useEffect(() => {
    void fetchWasteLogsNow();
  }, [fetchWasteLogsNow]);

  // BUG FIX: "Branch sales data is wrong." Branch-wise revenue/trend/payment-
  // split above all derived from `opsBillsInRange` (useBranchOpsStore's
  // `bills`, hydrated from branch_operation_records — a recovery mirror, not
  // the source of truth) merged with `branchTransactions` (the old per-item
  // `branch_sales` table, superseded once real billing moved to
  // branch_bill_headers/branch_bill_items). Investigation found the mirror's
  // payload shape changed over time — many historical bill rows only carry
  // {items, payments, creditAmount} with no `id`/`createdAt`/`total`, so
  // fetchBillsInRange's `.filter(p => p?.id)` silently drops them, making
  // months of real revenue vanish from every branch chart (flat zero, then a
  // spike only on the most recent day). branch_bill_headers +
  // branch_bill_items are the tables the app actually bills against — they
  // have complete, correct data back to day one (confirmed directly against
  // the DB) — same fix pattern Owner Dashboard already applies for Hosur
  // (see useHosurSalesSummary there querying hosur_bills directly instead of
  // this same broken mirror). Also gives Admin real bill-level + item-level
  // drill-down, not just aggregate totals.
  const [realBills, setRealBills] = useState<Array<{
    id: string; billNo: string; branch: Branch; total: number; subtotal: number;
    discount: number; createdAt: string; status: 'original' | 'returned' | 'duplicate_printed';
    salesperson: string; biller: string;
  }>>([]);
  const [realBillItems, setRealBillItems] = useState<Array<{
    billId: string; branch: Branch; itemName: string; quantity: number; unit: string;
    unitPrice: number; lineTotal: number;
  }>>([]);
  const [realPayments, setRealPayments] = useState<Array<{ billId: string; mode: string; amount: number }>>([]);
  const [realSalesLoading, setRealSalesLoading] = useState(false);
  const [realSalesError, setRealSalesError] = useState('');
  // FEATURE: "Hosur Sales" tab — orders Planner has already dispatched to a
  // shop but that never got billed (bill_id still null). Found while
  // investigating why Hosur revenue always showed ₹0: Planner's Dispatch &
  // Billing Queue is the step that's supposed to confirm receipt and create
  // the bill, but it's very rarely being completed — as of this
  // investigation, 106 dispatched orders worth ~₹1.86L had never been
  // billed. Surfacing this list directly (not just the revenue total) is
  // the whole point of "show all the data clearly" for Hosur.
  const [hosurUnbilledDispatched, setHosurUnbilledDispatched] = useState<Array<{
    id: string; orderNumber: string; shopName: string; subtotal: number; createdAt: string;
  }>>([]);
  // BUG FIX: "Purchases & Expenses" — the store's own `purchases`/`expenses`
  // arrays (fed by branchOpsStore's paginated branch_operation_records
  // hydration, capped at 2 pages of 2500 for admin/owner's no-branch-filter
  // path) were badly truncated: real 2-month Expenses total ₹2.97L (143
  // records) showed as ₹1,000 (1 record — just whichever single expense
  // happened to survive being in the top-2500-most-recent-of-19-mixed-types
  // window); real Purchases ₹1.22 crore (750 invoices) showed as ₹10.5L
  // (~9%). Fetch both directly, paged properly, scoped to the exact
  // selected range — same fix pattern as realBills/realBillItems above.
  const [realExpenses, setRealExpenses] = useState<Array<{ id: string; branch: string; amount: number; mode: string; category: string; description: string; createdAt: string }>>([]);
  const [realPurchases, setRealPurchases] = useState<Array<{ id: string; branch: string; supplier: string; total: number; createdAt: string }>>([]);

  // AUDIT FIX (2026-09-04): extracted out of the mount/date-change effect so
  // Overview, Cafe, Branches and Hosur (every tab that reads realBills/
  // realBillItems/realPayments/realExpenses/realPurchases/
  // hosurUnbilledDispatched) can also trigger this exact fetch on demand via
  // their own "Refresh" button, not just implicitly on a date-range change.
  // requestId (rather than the previous cancelled-boolean-per-effect-run
  // pattern) also correctly supersedes an in-flight run when the button is
  // clicked again before the first call resolves.
  const realSalesRequestRef = useRef(0);
  const fetchRealSalesData = useCallback(async () => {
    if (!fromDate || !toDate) return;
    const requestId = ++realSalesRequestRef.current;
    {
      setRealSalesLoading(true);
      setRealSalesError('');
      const fromTs = `${fromDate}T00:00:00`;
      const toTs = `${toDate}T23:59:59.999`;
      // BUG FIX: PostgREST caps rows per request (commonly 1000) regardless
      // of a `.limit()` requesting more — a single request for
      // branch_bill_items on a day with 400+ bills (several items each)
      // silently came back truncated to the first page, so most bills in
      // the "Bills" drill-down below showed 0 items even though the DB had
      // them (confirmed directly against the DB: a bill with 11 real items
      // rendered "No line items recorded"). Page through every query
      // instead of trusting one request to return everything.
      // BUG FIX: this runs 9 independently-paginated fetch streams (headers,
      // items, payments, hosur bills/items, unbilled x2, expenses,
      // purchases) all at once via Promise.all — enough concurrent load on
      // the DB that a page occasionally hits a genuine "canceling statement
      // due to statement timeout" (confirmed live: the exact same query
      // that ran in ~0.4-0.8s standalone timed out here under combined
      // load). One retry after a short backoff clears a transient
      // contention spike without needing to throttle overall concurrency.
      const fetchAllRows = async <T,>(
        build: () => any,
        pageSize = 1000,
        maxRows = 50000,
      ): Promise<{ data: T[]; error: { message: string } | null }> => {
        const rows: T[] = [];
        for (let from = 0; from < maxRows; from += pageSize) {
          let { data, error } = await build().range(from, from + pageSize - 1);
          for (let attempt = 1; error && attempt <= 2; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 800));
            ({ data, error } = await build().range(from, from + pageSize - 1));
          }
          if (error) return { data: rows, error };
          const page = (data || []) as T[];
          rows.push(...page);
          if (page.length < pageSize) break;
        }
        return { data: rows, error: null };
      };

      const [headersRes, itemsRes, paymentsRes, hosurRes, unbilledRes, expensesRes, purchasesRes] = await Promise.all([
        fetchAllRows(() => supabase.from('branch_bill_headers')
          .select('id, branch, bill_no, subtotal, discount, total, status, created_at, salesperson, biller, notes')
          .in('branch', ['SNB', 'VRSNB'])
          .gte('created_at', fromTs).lte('created_at', toTs)
          .order('created_at', { ascending: false })),
        fetchAllRows(() => supabase.from('branch_bill_items')
          .select('bill_id, branch, item_name, quantity, unit, unit_price, line_total')
          .in('branch', ['SNB', 'VRSNB'])
          .gte('created_at', fromTs).lte('created_at', toTs)),
        // BUG FIX (2026-09-05): "the payment mode ... is not displaying" for
        // a handful of Branch Sales bills in the Excel export — those bills'
        // real payment rows exist in branch_sale_payments with purpose
        // 'advance_balance' (balance paid at pickup for an advance order) or
        // 'credit_settlement' (a credit bill paid off, possibly same day),
        // both 100%-verified live to always reference a real bill_id — but
        // this filter only ever allowed 'bill_collection'/'credit_upfront',
        // so billPaidByMode's lookup missed them and every cash/UPI/card
        // column silently fell back to 0 despite a real, nonzero bill total.
        fetchAllRows(() => supabase.from('branch_sale_payments')
          .select('bill_id, payment_mode, amount, payment_purpose')
          .in('branch', ['SNB', 'VRSNB'])
          .in('payment_purpose', ['bill_collection', 'credit_upfront', 'advance_balance', 'credit_settlement'])
          .gte('created_at', fromTs).lte('created_at', toTs)),
        fetchAllRows(() => supabase.from('hosur_bills')
          .select('id, bill_no, shop_name, subtotal, paid_amount, credit_amount, payment_mode, confirmed_at, status')
          .not('confirmed_at', 'is', null)
          .neq('status', 'cancelled')
          .gte('confirmed_at', fromTs).lte('confirmed_at', toTs)),
        fetchAllRows(() => supabase.from('hosur_orders')
          .select('id, order_number, shop_name, subtotal, created_at')
          .eq('status', 'dispatched').is('bill_id', null)
          .gte('created_at', fromTs).lte('created_at', toTs)),
        // BUG FIX (2026-09-03): this used to also query
        // hosur_orders_archive_20260827 (a one-time snapshot table from an
        // 2026-08-27 archival pass) for the same "dispatched, never billed"
        // gap among older archived orders. That table (and every other
        // *_archive_* snapshot table in the schema) was permanently deleted
        // this same day at the owner's explicit request — the query below
        // started failing with "Could not find the table … in the schema
        // cache" on every single load, and since this whole block is one
        // Promise.all, that one failure silently broke Branch Sales' "Bills"
        // panel AND Hosur Sales' "Billed Sales"/"Confirmed Bills" together
        // (both ₹0, both stuck on "Loading bills…" forever) — Cafe Control
        // was unaffected since it reads from a completely separate source
        // (orderStore). If a future archive round adds a new dated table
        // that should be included here, add it deliberately — don't leave a
        // stale reference like this one behind when a table gets dropped.
        fetchAllRows(() => supabase.from('branch_operation_records')
          .select('payload, created_at')
          .eq('record_type', 'expense')
          .gte('created_at', fromTs).lte('created_at', toTs)),
        fetchAllRows(() => supabase.from('branch_operation_records')
          .select('payload, created_at')
          .eq('record_type', 'purchase_invoice')
          .gte('created_at', fromTs).lte('created_at', toTs)),
      ]);
      if (realSalesRequestRef.current !== requestId) return;
      const err = headersRes.error || itemsRes.error || paymentsRes.error || hosurRes.error || unbilledRes.error || expensesRes.error || purchasesRes.error;
      if (err) { setRealSalesError(err.message); setRealSalesLoading(false); return; }

      // BUG FIX (audit 2026-09-02): hosur_bill_items has no branch/date column of its own,
      // so this used to fetch the ENTIRE table (up to fetchAllRows' 50,000-row cap) on
      // every date-range change and filter it client-side against hosurBillIds below —
      // real, unbounded egress. Now that hosurRes (already date-scoped via confirmed_at)
      // has resolved, scope the items fetch server-side to just those bill ids, chunked to
      // stay well under any URL-length limit on a wide date range with many bills.
      const hosurBillIdList = (hosurRes.data as Array<Record<string, unknown>>).map((b) => String(b.id));
      const hosurItemsChunks: Array<Record<string, unknown>> = [];
      const CHUNK_SIZE = 300;
      for (let i = 0; i < hosurBillIdList.length; i += CHUNK_SIZE) {
        const chunk = hosurBillIdList.slice(i, i + CHUNK_SIZE);
        const chunkRes = await fetchAllRows<Record<string, unknown>>(() => supabase.from('hosur_bill_items')
          .select('bill_id, item_name, quantity, unit, unit_price, line_total')
          .in('bill_id', chunk));
        if (chunkRes.error) { setRealSalesError(chunkRes.error.message); setRealSalesLoading(false); return; }
        hosurItemsChunks.push(...chunkRes.data);
      }
      if (realSalesRequestRef.current !== requestId) return;
      const hosurItemsRes = { data: hosurItemsChunks, error: null as { message: string } | null };
      setHosurUnbilledDispatched((unbilledRes.data as Array<Record<string, unknown>>).map((o) => ({
        id: String(o.id), orderNumber: String(o.order_number ?? ''), shopName: String(o.shop_name ?? ''),
        subtotal: Number(o.subtotal || 0), createdAt: String(o.created_at),
      })));
      setRealExpenses((expensesRes.data as Array<{ payload: Record<string, unknown>; created_at: string }>).map((r) => ({
        id: String(r.payload?.id ?? ''), branch: String(r.payload?.branch ?? ''), amount: Number(r.payload?.amount || 0),
        mode: String(r.payload?.mode ?? ''), category: String(r.payload?.category ?? ''), description: String(r.payload?.description ?? ''),
        createdAt: String(r.payload?.createdAt ?? r.created_at),
      })));
      setRealPurchases((purchasesRes.data as Array<{ payload: Record<string, unknown>; created_at: string }>).map((r) => ({
        id: String(r.payload?.id ?? ''), branch: String(r.payload?.branch ?? ''), supplier: String(r.payload?.supplier ?? ''),
        total: Number(r.payload?.total || 0), createdAt: String(r.payload?.createdAt ?? r.created_at),
      })));

      const headers = (headersRes.data || []) as Array<Record<string, unknown>>;
      const hosurBills = (hosurRes.data || []) as Array<Record<string, unknown>>;
      const hosurBillIds = new Set(hosurBills.map((b) => String(b.id)));

      setRealBills([
        ...headers.map((h) => ({
          id: String(h.id), billNo: String(h.bill_no ?? ''), branch: h.branch as Branch,
          total: Number(h.total || 0), subtotal: Number(h.subtotal || 0), discount: Number(h.discount || 0),
          createdAt: String(h.created_at), status: (h.status as 'original' | 'returned' | 'duplicate_printed') || 'original',
          salesperson: String(h.salesperson ?? ''), biller: String(h.biller ?? ''),
        })),
        ...hosurBills.map((h) => ({
          id: String(h.id), billNo: String(h.bill_no ?? ''), branch: 'Hosur' as Branch,
          total: Number(h.subtotal || 0), subtotal: Number(h.subtotal || 0), discount: 0,
          createdAt: String(h.confirmed_at), status: 'original' as const,
          salesperson: '', biller: String(h.shop_name ?? ''),
        })),
      ]);

      const items = (itemsRes.data || []) as Array<Record<string, unknown>>;
      const hosurItems = (hosurItemsRes.data || []) as Array<Record<string, unknown>>;
      setRealBillItems([
        ...items.map((i) => ({
          billId: String(i.bill_id), branch: i.branch as Branch, itemName: String(i.item_name ?? ''),
          quantity: Number(i.quantity || 0), unit: String(i.unit ?? ''), unitPrice: Number(i.unit_price || 0),
          lineTotal: Number(i.line_total || 0),
        })),
        // hosur_bill_items has no branch/date column of its own — scope it to
        // just the confirmed Hosur bills already fetched in this same range.
        ...hosurItems.filter((i) => hosurBillIds.has(String(i.bill_id))).map((i) => ({
          billId: String(i.bill_id), branch: 'Hosur' as Branch, itemName: String(i.item_name ?? ''),
          quantity: Number(i.quantity || 0), unit: String(i.unit ?? ''), unitPrice: Number(i.unit_price || 0),
          lineTotal: Number(i.line_total || 0),
        })),
      ]);

      const payments = (paymentsRes.data || []) as Array<Record<string, unknown>>;

      // BUG FIX (2026-09-05): "this Excel is used for GST filing" — even
      // after including 'advance_balance'/'credit_settlement' above, an
      // advance-order bill's Cash/UPI/Card still didn't add up to its Total
      // Sales. Reason: the deposit taken when the advance order was PLACED
      // is its own branch_sale_payments row with payment_purpose
      // 'advance_paid' and bill_id = null (no bill exists yet at that
      // point) — only the *balance* paid at pickup/billing carries the real
      // bill_id, and some advance orders are fully covered by the deposit
      // alone (no balance row at all). The reliable link (confirmed live
      // across every advance-order bill, not just ones with a balance
      // payment) is the advance order's own tag string, e.g. "SNB-ADV-259":
      // branch_bill_headers.notes always starts with it, and the deposit
      // row's `bill_no` holds the same tag. Fetched separately (not
      // date-scoped) because the deposit is very often collected on an
      // earlier day than the balance/billing.
      const advanceTagByBillId = new Map<string, string>();
      headers.forEach((h) => {
        const match = /^([A-Za-z]+-ADV-\d+)/.exec(String(h.notes ?? ''));
        if (match) advanceTagByBillId.set(String(h.id), match[1]);
      });
      const advanceTags = Array.from(new Set(advanceTagByBillId.values()));
      let advanceDeposits: Array<Record<string, unknown>> = [];
      if (advanceTags.length > 0) {
        const depositRes = await fetchAllRows<Record<string, unknown>>(() => supabase.from('branch_sale_payments')
          .select('bill_no, payment_mode, amount')
          .eq('payment_purpose', 'advance_paid')
          .in('bill_no', advanceTags));
        if (!depositRes.error) advanceDeposits = depositRes.data;
      }
      const depositsByTag = new Map<string, Array<{ mode: string; amount: number }>>();
      advanceDeposits.forEach((d) => {
        const tag = String(d.bill_no ?? '').trim();
        const list = depositsByTag.get(tag) ?? [];
        list.push({ mode: String(d.payment_mode ?? '').toLowerCase(), amount: Number(d.amount || 0) });
        depositsByTag.set(tag, list);
      });

      setRealPayments([
        ...payments.map((p) => ({ billId: String(p.bill_id), mode: String(p.payment_mode ?? '').toLowerCase(), amount: Number(p.amount || 0) })),
        // The matched deposit is attributed to the FINAL bill's id (from the
        // header it was matched via), not left under its own null bill_id —
        // that's what makes it show up on the right bill's row.
        ...Array.from(advanceTagByBillId.entries()).flatMap(([billId, tag]) =>
          (depositsByTag.get(tag) ?? []).map((d) => ({ billId, mode: d.mode, amount: d.amount }))),
        ...hosurBills.map((h) => ({ billId: String(h.id), mode: String(h.payment_mode ?? '').toLowerCase() || 'cash', amount: Number(h.paid_amount || 0) })),
      ]);
      setRealSalesLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { void fetchRealSalesData(); }, [fetchRealSalesData]);

  useEffect(() => { void loadAdminNotifications(); }, [loadAdminNotifications]);
  const loadPublicOrders = useCallback(async () => {
    setPublicOrdersLoading(true);
    const { data, error } = await supabase.rpc('list_public_orders_secure', {
      p_limit: 250,
      p_offset: 0,
      p_include_full_contact: true,
      p_purpose: 'order_fulfilment',
    });
    if (error) {
      setPublicOrdersLoading(false);
      throw error;
    }
    setPublicOrders(((data ?? []) as PublicOrder[]).filter((order) => !['payment_pending', 'payment_failed'].includes(order.status)));
    setPublicOrdersLoading(false);
  }, []);

  const updatePublicOrderStatus = useCallback(async (orderId: string, status: string) => {
    setPublicOrderUpdating(orderId);
    const { error } = await supabase.rpc('update_public_order_status_secure', {
      p_order_id: orderId,
      p_status: status,
    });
    if (error) {
      setPublicOrderUpdating(null);
      alert(error.message || 'Unable to update online order status.');
      return;
    }
    await loadPublicOrders();
    setPublicOrderUpdating(null);
  }, [loadPublicOrders]);

  useEffect(() => { void loadPublicOrders(); }, [loadPublicOrders]);
  useEffect(() => {
    if (requestedTab === 'items') navigate('/bakery/items', { replace: true });
  }, [navigate, requestedTab]);
  useEffect(() => {
    if (!requestedTab) return;
    const allowed = allowedNavItems.some((item) => item.id === requestedTab);
    if (!allowed) {
      setSearchParams({}, { replace: true });
    }
  }, [allowedNavItems, requestedTab, setSearchParams]);

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
        result.push({ id: s.id, branch, itemName: s.itemName, qty: Number(s.quantitySold || 0), revenue: Number(s.unitPrice || 0) * Number(s.quantitySold || 0), payment: s.paymentMethod || '-', soldAt: s.soldAt, soldBy: s.soldBy, billNo: s.billNo });
      });
    });
    return result.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales, fromDate, toDate]);

  const opsBillsInRange = useMemo(() => bills.filter(b => inRange(b.createdAt, fromDate, toDate)), [bills, fromDate, toDate]);
  const branchRevenueFromSales = useMemo(() => branchTransactions.reduce((sum, t) => sum + t.revenue, 0), [branchTransactions]);
  const opsBillRevenue = useMemo(() => opsBillsInRange.reduce((sum, b) => sum + Number(b.total || 0), 0), [opsBillsInRange]);
  const billedNumbers = new Set(opsBillsInRange.map((bill) => bill.billNo));
  const legacyOnlyRevenue = branchTransactions
    .filter((transaction) => !transaction.billNo || !billedNumbers.has(transaction.billNo))
    .reduce((sum, transaction) => sum + transaction.revenue, 0);
  const branchSalesTotal = opsBillRevenue + legacyOnlyRevenue;
  const businessTotalSales = cafeSalesTotal + branchSalesTotal;

  // Real, non-returned bills for the selected range — see the fetch effect
  // above for why this replaces opsBillsInRange/branchTransactions as the
  // source of truth for every branch-sales figure below.
  const realBillsInRange = useMemo(() => realBills.filter(b => b.status !== 'returned'), [realBills]);

  const branchSalesByBranch = useMemo(() => {
    return BRANCHES.map(branch => {
      if (branch === 'Cafe') return { branch, label: 'Cafe', sales: cafeSalesTotal, orders: cafeServedOrders.length, returns: 0 };
      const bills = realBillsInRange.filter(b => b.branch === branch);
      const revenue = bills.reduce((sum, bill) => sum + bill.total, 0);
      return { branch, label: branch, sales: revenue, orders: bills.length, returns: returns.filter(r => r.branch === branch && inRange(r.createdAt, fromDate, toDate)).reduce((sum, r) => sum + Number(r.total || 0), 0) };
    });
  }, [cafeSalesTotal, cafeServedOrders.length, realBillsInRange, returns, fromDate, toDate]);

  // CHANGE 5: filtered branch sales for overview
  const filteredBranchSalesByBranch = useMemo(() => branchFilter === 'all' ? branchSalesByBranch : branchSalesByBranch.filter(b => b.branch === branchFilter), [branchSalesByBranch, branchFilter]);

  // FEATURE: "Admin should see complete details of each branch — total
  // sales including advance amount and advance collected and expenses all
  // those." Full financial breakdown per branch for the selected date
  // range, reusing the same real ledger/purchase/expense records Owner
  // Dashboard already reads from (not the broken bills mirror) so these
  // numbers are trustworthy and match what Owner sees.
  const branchFinancialDetail = useMemo(() => {
    return BRANCHES.map((branch) => {
      if (branch === 'Cafe') {
        return {
          branch, totalSales: cafeSalesTotal, advanceCollected: 0, advanceBalanceCollected: 0,
          cash: cafePaymentSplit.cash, upi: cafePaymentSplit.upi, card: cafePaymentSplit.card, credit: cafePaymentSplit.credit,
          expenses: 0, purchases: 0, returns: 0, orderCount: cafeServedOrders.length,
        };
      }
      const ledgerRows = adminLedger.closureRows.filter((row) => row.branch === branch);
      const totalSales = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.sales_total), 0);
      const advanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_collected), 0);
      const advanceBalanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_balance_collected), 0);
      const cash = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.cash_total), 0);
      const upi = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.upi_total), 0);
      const card = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.card_total), 0);
      const credit = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.credit_billed), 0);
      // BUG FIX: was summing branch_daily_closures.expenses (only populated
      // when a cashier has actually submitted a closure for that day) and
      // the flaky `purchases` store field (same truncation as expenseTotal/
      // purchaseTotal above — confirmed via direct DB check). Both now use
      // the same direct, fully-paginated fetch used everywhere else on this
      // page.
      const expensesForBranch = realExpenses.filter((e) => e.branch === branch).reduce((sum, e) => sum + e.amount, 0);
      const purchasesForBranch = realPurchases.filter((p) => p.branch === branch).reduce((sum, p) => sum + p.total, 0);
      const returnsForBranch = returns.filter((r) => r.branch === branch && inRange(r.createdAt, fromDate, toDate)).reduce((sum, r) => sum + Number(r.total || 0), 0);
      const orderCount = ledgerRows.reduce((sum, row) => sum + Number(row.bill_count || 0), 0);
      return { branch, totalSales, advanceCollected, advanceBalanceCollected, cash, upi, card, credit, expenses: expensesForBranch, purchases: purchasesForBranch, returns: returnsForBranch, orderCount };
    });
  }, [adminLedger, cafeSalesTotal, cafeServedOrders.length, cafePaymentSplit, realExpenses, realPurchases, returns, fromDate, toDate]);

  const dailySalesTrend = useMemo(() => {
    const days: Record<string, { date: string; Cafe: number; SNB: number; VRSNB: number; Hosur: number; Total: number }> = {};
    for (let d = new Date(`${fromDate}T00:00:00`); d <= endOfDay(toDate); d.setDate(d.getDate() + 1)) {
      const key = todayInput(d);
      days[key] = { date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), Cafe: 0, SNB: 0, VRSNB: 0, Hosur: 0, Total: 0 };
    }
    cafeServedOrders.forEach(o => { const key = localDateKey(o.createdAt); if (!days[key]) return; days[key].Cafe += Number(o.total || 0); days[key].Total += Number(o.total || 0); });
    realBillsInRange.forEach((bill) => {
      const key = localDateKey(bill.createdAt); if (!days[key]) return;
      days[key][bill.branch] += bill.total; days[key].Total += bill.total;
    });
    return Object.values(days);
  }, [fromDate, toDate, cafeServedOrders, realBillsInRange]);

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
    const representedBills = new Set(opsBillsInRange.map((bill) => bill.billNo).filter(Boolean));
    branchTransactions.filter((transaction) => !transaction.billNo || !representedBills.has(transaction.billNo)).forEach(t => {
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
    const filteredItems = branchFilter === 'all' || branchFilter === 'Cafe' ? realBillItems : realBillItems.filter(i => i.branch === branchFilter);
    filteredCafeOrders.forEach(o => o.items.forEach(ci => {
      const key = ci.menuItem.name;
      const existing = map.get(key) || { item: key, qty: 0, revenue: 0 };
      existing.qty += Number(ci.quantity || 0); existing.revenue += Number(ci.menuItem.price || 0) * Number(ci.quantity || 0);
      map.set(key, existing);
    }));
    filteredItems.forEach(i => {
      const existing = map.get(i.itemName) || { item: i.itemName, qty: 0, revenue: 0 };
      existing.qty += i.quantity; existing.revenue += i.lineTotal; map.set(i.itemName, existing);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map(item => ({ ...item, short: item.item.length > 16 ? `${item.item.slice(0, 16)}…` : item.item }));
  }, [cafeServedOrders, realBillItems, branchFilter]);

  // CHANGE 3: stockAlerts kept for OverviewTab KpiCard only (no StockAlertsTab)
  const stockAlerts = useMemo(() => {
    let count = 0;
    BRANCHES.filter(b => b !== 'Cafe').forEach(branch => {
      (stock[branch] || []).forEach(s => { if (Number(s.quantity || 0) <= 0) count++; });
    });
    return count;
  }, [stock]);

  const creditPendingTotal = useMemo(() => BRANCHES.reduce((sum, branch) => sum + (creditSales[branch] || []).filter(c => c.status !== 'settled').reduce((s, c) => s + Number(c.creditAmount || 0), 0), 0), [creditSales]);
  const purchaseTotal = useMemo(() => realPurchases.reduce((sum, p) => sum + p.total, 0), [realPurchases]);
  // BUG FIX: "Purchases & Expenses" always showed ₹0 for Expenses regardless
  // of range — it was reading `cashMovements` (till cash in/out adjustments,
  // record_type 'cash_movement') filtered for a purpose containing
  // "expense", but real expenses are recorded as their own distinct
  // `record_type: 'expense'` (143 real records confirmed in the DB) and
  // already load into this same store's dedicated `expenses` array — this
  // just wasn't reading it.
  const expenseTotal = useMemo(() => realExpenses.reduce((sum, e) => sum + e.amount, 0), [realExpenses]);

  const balanceSummary = useMemo(() => {
    const totals = { cash: 0, upi: 0, card: 0, bank: 0 };
    cashMovements.filter((movement) => inRange(movement.dateTime, fromDate, toDate)).forEach(m => {
      if (!['cash', 'upi', 'card', 'bank'].includes(m.paymentMode)) return;
      const key = m.paymentMode as keyof typeof totals;
      totals[key] += m.direction === 'in' ? Number(m.amount || 0) : -Number(m.amount || 0);
    });
    bankDeposits.filter((deposit) => inRange(deposit.createdAt, fromDate, toDate)).forEach(d => {
      const amount = Number(d.amount || 0); totals.bank += amount;
      if (d.paymentMode === 'Cash Deposit') totals.cash -= amount;
      if (d.paymentMode === 'UPI Transfer') totals.upi -= amount;
      if (d.paymentMode === 'Card Settlement') totals.card -= amount;
    });
    // BUG FIX: real expenses (record_type 'expense') never show up as a
    // 'cash_movement' entry — confirmed against the DB, every cash_movement
    // row in this business is "Advance balance collection" (direction:
    // in), never an expense outflow — so this balance was overstated by
    // the full expense total (₹2.97L over a recent 2-month check) because
    // money genuinely spent on expenses was never subtracted anywhere.
    realExpenses.forEach((e) => {
      if (e.mode === 'cash') totals.cash -= e.amount;
      else if (e.mode === 'upi') totals.upi -= e.amount;
      else if (e.mode === 'card') totals.card -= e.amount;
      else if (e.mode === 'bank') totals.bank -= e.amount;
    });
    return totals;
  }, [cashMovements, bankDeposits, realExpenses, fromDate, toDate]);

  const closureRows = useMemo<ClosureRow[]>(() => {
    return BRANCHES.map(branch => {
      const ledger = closureLedger.closureByBranchDate.get(`${branch}:${closureDate}`);
      const savedLedgerClosure = closureLedger.savedClosureByBranchDate.get(`${branch}:${closureDate}`);
      if (branch !== 'Cafe' && ledger) {
        const openingBalance = Number(savedLedgerClosure?.opening_cash || 0);
        // BUG FIX: "branch sales data is wrong" / see the matching fix in
        // OwnerDashboard.tsx — totalSales used to subtract advance_collected
        // + advance_balance_collected from sales_total, so it disagreed with
        // this same row's own cash/upi/card/credit breakdown just below
        // (those were never adjusted). Use sales_total directly so both
        // always match; advance amounts now surface as their own explicit
        // fields instead of silently being subtracted out of the total.
        const totalSales = adminLedger.toNumber(ledger.sales_total);
        const advanceCollected = adminLedger.toNumber(ledger.advance_collected);
        const advanceBalanceCollected = adminLedger.toNumber(ledger.advance_balance_collected);
        const cashSales = adminLedger.toNumber(ledger.cash_total);
        const upiSales = adminLedger.toNumber(ledger.upi_total);
        const cardSales = adminLedger.toNumber(ledger.card_total);
        const creditSalesDay = adminLedger.toNumber(ledger.credit_billed);
        const returnsDay = adminLedger.toNumber(savedLedgerClosure?.refunds || 0);
        const expensesDay = adminLedger.toNumber(savedLedgerClosure?.expenses || 0);
        // BUG FIX (audit 2026-09-02): this projected-balance estimate (only used when no
        // savedLedgerClosure exists yet) omitted purchase payments and bank deposits —
        // the exact same formula in the fallback branch path just below (line ~832)
        // correctly subtracts both. purchase_payments IS a real column on this ledger row
        // (already read below for display); bank deposits has no column here (see the
        // bankDeposits:0 comment below), so read it from the same raw per-date store array
        // the fallback path uses.
        const purchasePaymentsDay = adminLedger.toNumber(savedLedgerClosure?.purchase_payments || 0);
        const bankDepositsDay = bankDeposits.filter(d => d.branch === branch && localDateKey(d.createdAt) === closureDate).reduce((sum, d) => sum + Number(d.amount || 0), 0);
        const closingBalance = savedLedgerClosure ? adminLedger.toNumber(savedLedgerClosure.actual_cash) : openingBalance + cashSales - returnsDay - expensesDay - purchasePaymentsDay - bankDepositsDay;
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
          purchasePayments: purchasePaymentsDay,
          // BUG FIX (audit 2026-09-02): branch_daily_closures has no bank_deposits column
          // (see LedgerSavedClosure), so this literally always showed 0 regardless of real
          // deposits — now sourced from the same raw snb_bank_deposits/vrsnb_bank_deposits-
          // backed store array (bankDepositsDay, computed above) the non-ledger fallback
          // path already used correctly.
          bankDeposits: bankDepositsDay,
          closingBalance,
          differenceAmount,
          remarks: savedLedgerClosure?.notes || (savedLedgerClosure ? 'Closed and verified from Supabase' : 'Pending branch closure'),
          status,
          closedBy: savedLedgerClosure?.cashier || '-',
          closedAt: savedLedgerClosure ? fmtDateTime(savedLedgerClosure.created_at) : '-',
          advanceCollected,
          advanceBalanceCollected,
        };
      }
      const closureRecords = cashierClosures.filter(c => c.branch === branch && localDateKey(c.createdAt) === closureDate);
      const latestClosure = closureRecords[0] || null;
      // BUG FIX: previously sourced from branchTransactions/opsBillsInRange, which
      // are pre-filtered to the Overview tab's fromDate/toDate range. This tab has
      // its own independent closureDate picker, so whenever closureDate fell
      // outside that range (the common case), these silently returned empty and
      // the whole card showed ₹0 sales despite a real saved closing balance.
      // Read straight from the raw, unscoped store arrays instead.
      const txns: SalesTxn[] = branch === 'Cafe' ? [] : (sales[branch] || [])
        .filter(s => localDateKey(s.soldAt) === closureDate)
        .map(s => ({ id: s.id, branch, itemName: s.itemName, qty: Number(s.quantitySold || 0), revenue: Number(s.unitPrice || 0) * Number(s.quantitySold || 0), payment: s.paymentMethod || '-', soldAt: s.soldAt, soldBy: s.soldBy, billNo: s.billNo }));
      const opsBills = bills.filter(b => b.branch === branch && localDateKey(b.createdAt) === closureDate);
      const cafeDayOrders = branch === 'Cafe' ? orders.filter(o => localDateKey(o.createdAt) === closureDate && o.status === 'served') : [];
      const representedBills = new Set(opsBills.map((bill) => bill.billNo).filter(Boolean));
      const legacyTxns = txns.filter((transaction) => !transaction.billNo || !representedBills.has(transaction.billNo));
      const totalSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) : opsBills.reduce((sum, b) => sum + Number(b.total || 0), 0) + legacyTxns.reduce((sum, t) => sum + t.revenue, 0);
      const cashSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.cash || 0) : o.paymentType === 'cash' ? Number(o.total || 0) : 0), 0) : opsBills.reduce((sum, b) => sum + (b.paymentMode === 'cash' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.cash || 0) : 0), 0) + legacyTxns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'cash'), 0);
      const upiSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.upi || 0) : o.paymentType === 'upi' ? Number(o.total || 0) : 0), 0) : opsBills.reduce((sum, b) => sum + (b.paymentMode === 'upi' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.upi || 0) : 0), 0) + legacyTxns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'upi'), 0);
      const cardSales = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'part_payment' ? Number(o.paymentBreakdown?.card || 0) : o.paymentType === 'card' ? Number(o.total || 0) : 0), 0) : opsBills.reduce((sum, b) => sum + (b.paymentMode === 'card' ? Number(b.total || 0) : b.paymentMode === 'split' ? Number(b.split?.card || 0) : 0), 0) + legacyTxns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'card'), 0);
      const creditSalesDay = branch === 'Cafe' ? cafeDayOrders.reduce((sum, o) => sum + (o.paymentType === 'unpaid' ? Number(o.total || 0) : 0), 0) : opsBills.reduce((sum, b) => sum + (b.paymentMode === 'credit' ? Number(b.total || 0) : 0), 0) + legacyTxns.reduce((sum, t) => sum + paymentAmount(t.revenue, t.payment, 'credit'), 0);
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
      return { branch, openingBalance, totalSales, cashSales, upiSales, cardSales, creditSales: creditSalesDay, returns: returnsDay, netSales: totalSales - returnsDay, expenses: expensesDay, purchasePayments: paymentsDay, bankDeposits: depositsDay, closingBalance, differenceAmount, remarks: latestClosure?.notes || (latestClosure ? 'Closed and verified' : 'Pending branch closure'), status, closedBy: latestClosure?.cashier || '-', closedAt: latestClosure ? fmtDateTime(latestClosure.createdAt) : '-', advanceCollected: 0, advanceBalanceCollected: 0 };
    });
  }, [closureLedger, cashierClosures, sales, bills, orders, returns, cashMovements, purchasePayments, bankDeposits, closureDate]);

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

  const exportDailyClosure = () => exportWorkbook(`Admin_DailyClosure_${closureDate}`, [{
    name: 'Sales Details', title: `Daily Closure — Sales Detail (${closureDate})`,
    columns: [
      { header: 'Branch', key: 'Branch' }, { header: 'Opening Balance', key: 'Opening Balance' }, { header: 'Total Sales', key: 'Total Sales' },
      { header: 'Cash Sales', key: 'Cash Sales' }, { header: 'UPI Sales', key: 'UPI Sales' }, { header: 'Card Sales', key: 'Card Sales' }, { header: 'Credit Sales', key: 'Credit Sales' },
      { header: 'Returns', key: 'Returns' }, { header: 'Net Sales', key: 'Net Sales' }, { header: 'Expenses', key: 'Expenses' }, { header: 'Purchase Payments', key: 'Purchase Payments' },
      { header: 'Bank Deposits', key: 'Bank Deposits' }, { header: 'Closing Balance', key: 'Closing Balance' }, { header: 'Difference', key: 'Difference' },
      { header: 'Remarks', key: 'Remarks', width: 24 }, { header: 'Status', key: 'Status' }, { header: 'Closed By', key: 'Closed By' }, { header: 'Closed At', key: 'Closed At', width: 18 },
    ],
    rows: filteredClosureRows.map(r => ({
      Branch: BRANCH_LABELS[r.branch], 'Opening Balance': r.openingBalance, 'Total Sales': r.totalSales,
      'Cash Sales': r.cashSales, 'UPI Sales': r.upiSales, 'Card Sales': r.cardSales, 'Credit Sales': r.creditSales,
      Returns: r.returns, 'Net Sales': r.netSales, Expenses: r.expenses, 'Purchase Payments': r.purchasePayments,
      'Bank Deposits': r.bankDeposits, 'Closing Balance': r.closingBalance, Difference: r.differenceAmount,
      Remarks: r.remarks, Status: r.status, 'Closed By': r.closedBy, 'Closed At': r.closedAt,
    })),
  }]);

  const exportDailyClosurePdf = () => exportReportPdf({
    filename: `Admin_DailyClosure_${closureDate}`,
    title: 'Daily Closure Verification',
    subtitle: `Date: ${closureDate}`,
    kpis: [
      { label: 'Total Sales', value: formatCurrency(closureTotals.sales) },
      { label: 'Cash', value: formatCurrency(closureTotals.cash) },
      { label: 'UPI', value: formatCurrency(closureTotals.upi) },
      { label: 'Card', value: formatCurrency(closureTotals.card) },
      { label: 'Credit', value: formatCurrency(closureTotals.credit) },
      { label: 'Difference', value: formatCurrency(closureTotals.diff) },
    ],
    sections: [{
      heading: 'Branch Closure Detail',
      columns: [{ header: 'Branch', width: 22 }, { header: 'Status', width: 18 }, { header: 'Opening', width: 20, align: 'right' }, { header: 'Total Sales', width: 22, align: 'right' }, { header: 'Cash', width: 20, align: 'right' }, { header: 'UPI', width: 20, align: 'right' }, { header: 'Card', width: 18, align: 'right' }, { header: 'Credit', width: 20, align: 'right' }, { header: 'Returns', width: 18, align: 'right' }, { header: 'Closing', width: 20, align: 'right' }, { header: 'Difference', width: 20, align: 'right' }, { header: 'Closed By', width: 30 }],
      rows: filteredClosureRows.map(r => [BRANCH_LABELS[r.branch], r.status, pdfMoney(r.openingBalance), pdfMoney(r.totalSales), pdfMoney(r.cashSales), pdfMoney(r.upiSales), pdfMoney(r.cardSales), pdfMoney(r.creditSales), pdfMoney(r.returns), pdfMoney(r.closingBalance), pdfMoney(r.differenceAmount), r.closedBy]),
    }],
  });

  const printDailyClosure = () => {
    const rows = filteredClosureRows.map(r => `<tr><td>${BRANCH_LABELS[r.branch]}</td><td>${r.status}</td><td>₹${r.openingBalance.toFixed(2)}</td><td>₹${r.totalSales.toFixed(2)}</td><td>₹${r.cashSales.toFixed(2)}</td><td>₹${r.upiSales.toFixed(2)}</td><td>₹${r.cardSales.toFixed(2)}</td><td>₹${r.creditSales.toFixed(2)}</td><td>₹${r.returns.toFixed(2)}</td><td>₹${r.purchasePayments.toFixed(2)}</td><td>₹${r.bankDeposits.toFixed(2)}</td><td>₹${r.closingBalance.toFixed(2)}</td><td>₹${r.differenceAmount.toFixed(2)}</td><td>${r.closedBy}</td><td>${r.remarks}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Daily Closure ${closureDate}</title><style>@page{size:landscape;margin:9mm}@media print{html,body{height:auto !important}}*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif;font-size:12px}body:before{content:"";display:block;height:12px;background:linear-gradient(90deg,#f97316,#059669,#111827)}main{background:#fff;min-height:100vh;padding:24px}.hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px;border-bottom:2px solid #111827;padding-bottom:14px}.stamp{display:inline-block;border-radius:999px;background:#fff7ed;color:#c2410c;padding:7px 12px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}h1{font-size:24px;line-height:1.05;margin:7px 0 0;font-weight:900}.muted{color:#64748b;font-size:12px;font-weight:700}table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid #e2e8f0;padding:9px 10px;font-size:12px;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}tr:nth-child(even) td{background:#f8fafc}tr:last-child td{border-bottom:0}@media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}main{padding:16px}tr{break-inside:avoid}button{display:none}}</style></head><body><main><div class="hero"><div><div class="stamp">Admin Report</div><h1>Daily Closure Verification</h1></div><p class="muted">Date: ${closureDate}<br/>Generated ${new Date().toLocaleString('en-IN')}</p></div><table><thead><tr><th>Branch</th><th>Status</th><th>Opening</th><th>Total Sales</th><th>Cash</th><th>UPI</th><th>Card</th><th>Credit</th><th>Returns</th><th>Purchase Pay.</th><th>Bank Deposit</th><th>Closing</th><th>Difference</th><th>Closed By</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></main></body></html>`;
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
  const overviewPaymentSplit = useMemo(() => {
    const isAll = branchFilter === 'all';
    const isCafe = branchFilter === 'Cafe';
    const totals = { cash: 0, upi: 0, card: 0, credit: 0 };
    if (isAll || isCafe) {
      totals.cash += cafePaymentSplit.cash; totals.upi += cafePaymentSplit.upi;
      totals.card += cafePaymentSplit.card; totals.credit += cafePaymentSplit.credit;
    }
    if (isAll || !isCafe) {
      const filteredBills = isAll ? realBillsInRange : realBillsInRange.filter(b => b.branch === branchFilter);
      const billIds = new Set(filteredBills.map(b => b.id));
      // What was actually collected, by mode — sum straight from
      // branch_sale_payments/hosur_bills rather than a single paymentMode
      // string per bill, so a split payment counts correctly under each mode.
      const paidByBill = new Map<string, number>();
      realPayments.filter(p => billIds.has(p.billId)).forEach(p => {
        if (p.mode === 'cash') totals.cash += p.amount;
        else if (p.mode === 'upi') totals.upi += p.amount;
        else if (p.mode === 'card' || p.mode === 'card_pos' || p.mode === 'card_swipe') totals.card += p.amount;
        paidByBill.set(p.billId, (paidByBill.get(p.billId) || 0) + p.amount);
      });
      // Whatever a bill's total isn't covered by a collected payment is the
      // credit portion — matches how the branch billing screens themselves
      // treat an under-collected bill (see branch_credit_sales).
      filteredBills.forEach(b => {
        const shortfall = b.total - (paidByBill.get(b.id) || 0);
        if (shortfall > 0.5) totals.credit += shortfall;
      });
    }
    return [{ name: 'Cash', value: totals.cash }, { name: 'UPI', value: totals.upi }, { name: 'Card', value: totals.card }, { name: 'Credit', value: totals.credit }].filter(item => item.value > 0);
  }, [branchFilter, cafePaymentSplit, realBillsInRange, realPayments]);

  const exportOverviewExcel = () => exportWorkbook(`Admin_Overview_${fromDate}_${toDate}`, [
    {
      name: 'Sales Details', title: `Dashboard Overview — Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Branch', key: 'branch' }, { header: 'Sales', key: 'sales' }, { header: 'Transactions', key: 'orders' }, { header: 'Returns', key: 'returns' }],
      rows: filteredBranchSalesByBranch.map(r => ({ branch: r.label, sales: r.sales, orders: r.orders, returns: r.returns })),
    },
    {
      name: 'Payment Split', title: `Dashboard Overview — Payment Mode Split (${fromDate} to ${toDate})`,
      columns: [{ header: 'Mode', key: 'name' }, { header: 'Amount', key: 'value' }],
      rows: overviewPaymentSplit,
    },
  ]);

  const exportOverviewPdf = () => exportReportPdf({
    filename: `Admin_Overview_${fromDate}_${toDate}`,
    title: 'Dashboard Overview',
    subtitle: `${fromDate} to ${toDate} · ${branchFilter === 'all' ? 'All branches' : BRANCH_LABELS[branchFilter]}`,
    kpis: overviewPaymentSplit.map(p => ({ label: p.name, value: formatCurrency(p.value) })),
    sections: [
      {
        heading: 'Branch-wise Sales', columns: [{ header: 'Branch', width: 60 }, { header: 'Sales', width: 50, align: 'right' }, { header: 'Transactions', width: 50, align: 'right' }, { header: 'Returns', width: 50, align: 'right' }],
        rows: filteredBranchSalesByBranch.map(r => [r.label, pdfMoney(r.sales), String(r.orders), pdfMoney(r.returns)]),
      },
      {
        heading: 'Payment Mode Split', columns: [{ header: 'Mode', width: 60 }, { header: 'Amount', width: 60, align: 'right' }],
        rows: overviewPaymentSplit.map(p => [p.name, pdfMoney(p.value)]),
      },
    ],
  });

  const OverviewTab = (
    <div className="space-y-5">
      {/* TOP BAR: date presets + branch filter + excel */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap items-center gap-2">
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
          {/* AUDIT FIX (2026-09-04): this whole tab (branch-wise sales,
              payment split, daily trend, top items, purchases/expenses,
              available balance) previously had no manual refresh at all —
              realBills/realExpenses/realPurchases (fetchRealSalesData) and
              the ledger-backed balance figures (adminLedger) only ever
              re-fetch on a fromDate/toDate change, and `orders` only via the
              90s background poll. */}
          <button
            onClick={() => { void fetchRealSalesData(); refreshBranchAndStock(); adminLedger.refresh(); void loadOrders(90); }}
            disabled={realSalesLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', realSalesLoading && 'animate-spin')} />Refresh
          </button>
          <button onClick={exportOverviewExcel}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={exportOverviewPdf}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <Panel title="Branch-wise Sales Comparison" subtitle="Cafe, SNB, VRSNB and Hosur revenue for selected range">
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

        <Panel title="Payment Mode Split" subtitle={`Cash, UPI, card and credit mix${branchFilter !== 'all' ? ` — ${BRANCH_LABELS[branchFilter]}` : ' — All branches'}`}>
          {overviewPaymentSplit.length === 0 ? <EmptyState label="No payment data in selected range." /> : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overviewPaymentSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={4}>
                    {overviewPaymentSplit.map((_, index) => <Cell key={index} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={value => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
          <div className="grid grid-cols-2 gap-2">
            {overviewPaymentSplit.map((row, index) => (
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

  // FEATURE (2026-09-02): "the Excel report should contain 3 sheets — total sales
  // (cash/upi/card etc), item-wise sales, bill-wise sales" — requested for Cafe Control,
  // Branch Sales and Hosur Sales alike. Previously this tab's "Bill Details" sheet mixed
  // both concerns (one row per item, repeating the bill total on every line) with no
  // standalone item-wise totals anywhere. Split into 3 clean sheets; item-wise is
  // aggregated from cafeServedOrders only (cancelled orders never actually sold anything).
  const cafeItemWiseSales = useMemo(() => {
    const map = new Map<string, { itemName: string; qty: number; revenue: number; bills: number }>();
    cafeServedOrders.forEach(o => o.items.forEach(i => {
      const row = map.get(i.menuItem.id) ?? { itemName: i.menuItem.name, qty: 0, revenue: 0, bills: 0 };
      row.qty += i.quantity;
      row.revenue += Number(i.menuItem.price || 0) * Number(i.quantity || 0);
      row.bills += 1;
      map.set(i.menuItem.id, row);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [cafeServedOrders]);

  const exportCafeExcel = () => exportWorkbook(`Admin_Cafe_${fromDate}_${toDate}`, [
    {
      name: 'Total Sales', title: `Cafe Control — Total Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Metric', key: 'metric' }, { header: 'Amount', key: 'amount' }],
      rows: [
        { metric: 'Total Sales', amount: cafeSalesTotal },
        { metric: 'Cash', amount: cafePaymentSplit.cash },
        { metric: 'UPI', amount: cafePaymentSplit.upi },
        { metric: 'Card', amount: cafePaymentSplit.card },
        { metric: 'Credit', amount: cafePaymentSplit.credit },
        { metric: 'Served Orders', amount: cafeServedOrders.length },
        { metric: 'Cancelled Orders', amount: cafeCancelledOrders.length },
      ],
    },
    {
      name: 'Item-wise Sales', title: `Cafe Control — Item-wise Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Item Name', key: 'itemName', width: 28 }, { header: 'Qty Sold', key: 'qty' }, { header: 'Revenue', key: 'revenue' }, { header: 'Bills', key: 'bills' }],
      rows: cafeItemWiseSales,
    },
    {
      // FEATURE (2026-09-04): standardized bill-wise column set across
      // Cafe Control / Branch Sales / Hosur Sales / Dispatch Details —
      // Branch, Bill No, Date, Time, Total Sales, Cash, UPI, Card,
      // Salesperson, Biller, in that exact order.
      name: 'Bill-wise Sales', title: `Cafe Control — Bill-wise Sales (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Time', key: 'time', width: 12 },
        { header: 'Total Sales', key: 'totalSales' }, { header: 'Cash', key: 'cash' }, { header: 'UPI', key: 'upi' }, { header: 'Card', key: 'card' },
        { header: 'Salesperson', key: 'salesperson', width: 18 }, { header: 'Biller', key: 'biller', width: 18 },
      ],
      rows: cafeOrdersInRange.map(o => {
        const paid = cafePaidByMode(o.paymentType, o.paymentBreakdown, o.total || 0);
        return { branch: 'Cafe', billNo: o.orderNumber, date: fmtDate(o.createdAt), time: fmtTime(o.createdAt), totalSales: o.total || 0, cash: paid.cash, upi: paid.upi, card: paid.card, salesperson: o.createdBy || '-', biller: o.billedBy || o.createdBy || '-' };
      }),
    },
    {
      // FEATURE (2026-09-04): "extra sheet with bill number and what all
      // item was sold in that bill" — one row per item per bill, same order
      // set as the Bill-wise Sales sheet above.
      name: 'Bill Items', title: `Cafe Control — Bill Items (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Item Name', key: 'itemName', width: 28 },
        { header: 'Qty', key: 'qty' }, { header: 'Unit Price', key: 'unitPrice' }, { header: 'Line Total', key: 'lineTotal' },
      ],
      rows: cafeOrdersInRange.flatMap(o => o.items.map(i => ({
        billNo: o.orderNumber, date: fmtDate(o.createdAt), itemName: i.menuItem.name, qty: i.quantity,
        unitPrice: Number(i.menuItem.price || 0), lineTotal: Number(i.menuItem.price || 0) * Number(i.quantity || 0),
      }))),
    },
  ]);

  const exportCafePdf = () => exportReportPdf({
    filename: `Admin_Cafe_${fromDate}_${toDate}`,
    title: 'Cafe Control',
    subtitle: `${fromDate} to ${toDate}`,
    kpis: [
      { label: 'Total Sales', value: formatCurrency(cafeSalesTotal) },
      { label: 'Served Orders', value: String(cafeServedOrders.length) },
      { label: 'Cancelled', value: String(cafeCancelledOrders.length) },
      { label: 'Cash', value: formatCurrency(cafePaymentSplit.cash) },
      { label: 'UPI', value: formatCurrency(cafePaymentSplit.upi) },
      { label: 'Card', value: formatCurrency(cafePaymentSplit.card) },
    ],
    sections: [
      {
        heading: 'Orders', columns: [{ header: 'Order No', width: 30 }, { header: 'Customer', width: 45 }, { header: 'Items', width: 20, align: 'right' }, { header: 'Payment', width: 30 }, { header: 'Total', width: 30, align: 'right' }, { header: 'Status', width: 25 }, { header: 'Time', width: 40 }],
        rows: cafeOrdersInRange.map(o => [String(o.orderNumber), o.customerName || '-', String(o.items.reduce((s, i) => s + i.quantity, 0)), o.paymentType || '-', pdfMoney(o.total || 0), o.status, fmtDateTime(o.createdAt)]),
      },
    ],
  });

  // CHANGE 14: Removed top KPI grid from CafeTab. CHANGE 4/6: Added date presets + Excel download, no branch filter (cafe only)
  const CafeTab = (
    <div className="space-y-5">
      {/* TOP BAR: date presets + date range + excel (no branch filter - cafe only) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          {/* AUDIT FIX (2026-09-04): Cafe Control's every figure derives
              from `orders` (useOrderStore), which only ever refreshes via
              its own 90s background poll — no way to force a fresh pull
              right now. loadOrders always does a real re-fetch (not a
              throttled/cached call). */}
          <button
            onClick={() => void loadOrders(90)}
            disabled={ordersLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', ordersLoading && 'animate-spin')} />Refresh
          </button>
          <button onClick={exportCafeExcel}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={exportCafePdf}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Sales" value={formatCurrency(cafeSalesTotal)} icon={<IndianRupee className="size-5" />} tone="green" sub={`${cafeServedOrders.length} orders`} />
        <KpiCard label="Cancelled" value={cafeCancelledOrders.length} icon={<TrendingDown className="size-5" />} tone="red" sub="Cancelled orders" />
        <KpiCard label="Cash Collected" value={formatCurrency(cafePaymentSplit.cash)} icon={<Banknote className="size-5" />} tone="blue" />
        <KpiCard label="UPI Collected" value={formatCurrency(cafePaymentSplit.upi)} icon={<Smartphone className="size-5" />} tone="purple" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Cafe Sales Trend" subtitle="Cafe-only revenue trend">
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

        <Panel title="Cafe Payment Split" subtitle="Cash, UPI, Card and Credit breakdown">
          {Object.values(cafePaymentSplit).every(v => v === 0) ? <EmptyState label="No payment data for selected range." /> : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ name: 'Cash', value: cafePaymentSplit.cash }, { name: 'UPI', value: cafePaymentSplit.upi }, { name: 'Card', value: cafePaymentSplit.card }, { name: 'Credit', value: cafePaymentSplit.credit }].filter(d => d.value > 0)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={4}>
                    {PAYMENT_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                  </Pie>
                  <Tooltip formatter={value => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[{ name: 'Cash', value: cafePaymentSplit.cash, color: PAYMENT_COLORS[0] }, { name: 'UPI', value: cafePaymentSplit.upi, color: PAYMENT_COLORS[1] }, { name: 'Card', value: cafePaymentSplit.card, color: PAYMENT_COLORS[2] }, { name: 'Credit', value: cafePaymentSplit.credit, color: PAYMENT_COLORS[3] }].filter(d => d.value > 0).map(d => (
              <div key={d.name} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: d.color }} /><p className="text-xs font-black text-slate-700">{d.name}</p></div>
                <p className="mt-1 text-sm font-black text-slate-950">{formatCurrency(d.value)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

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

      {/* FEATURE: "cafe cancelled details" — a dedicated view of just the
          cancelled orders (the KPI card above only showed a count), with
          full item and value detail per order. */}
      <Panel title="Cancelled Orders" subtitle={`${cafeCancelledOrders.length} cancelled order${cafeCancelledOrders.length === 1 ? '' : 's'} in selected range`}>
        {cafeCancelledOrders.length === 0 ? <EmptyState label="No cancelled orders in this range." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3 text-right">Value</th><th className="p-3">Time</th></tr></thead>
              <tbody className="divide-y">
                {cafeCancelledOrders.map(o => {
                  // BUG FIX: a cancelled order's `total` is never actually
                  // computed/stored (confirmed against the DB — cancellation
                  // happens before checkout totals the order), so every
                  // cancelled order showed a misleading ₹0 here even with
                  // real items attached. Compute the would-have-been value
                  // from the items themselves so this reflects real lost
                  // revenue, not a data gap.
                  const itemsValue = o.items.reduce((sum, i) => sum + Number(i.menuItem.price || 0) * Number(i.quantity || 0), 0);
                  return (
                    <tr key={o.id} className="hover:bg-red-50/40">
                      <td className="p-3 font-bold">#{String(o.orderNumber).padStart(3, '0')}</td>
                      <td className="p-3">{o.customerName || '-'}</td>
                      <td className="p-3 text-slate-500">{o.items.map(i => `${i.menuItem.name} × ${i.quantity}`).join(', ')}</td>
                      <td className="p-3 text-right font-black text-red-600">{formatCurrency(o.total || itemsValue)}</td>
                      <td className="p-3 text-slate-500">{fmtDateTime(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs font-semibold text-slate-500">Total value cancelled: <span className="font-black text-red-600">{formatCurrency(cafeCancelledOrders.reduce((sum, o) => sum + (Number(o.total) || o.items.reduce((s, i) => s + Number(i.menuItem.price || 0) * Number(i.quantity || 0), 0)), 0))}</span></p>
          </div>
        )}
      </Panel>
    </div>
  );

  // CHANGE 7: Branch filter + date presets + Excel. CHANGE 14: Removed KPI grid. Cafe excluded from branch filter
  // FEATURE: "Branch Sales tab should show VRSNB/SNB only, Hosur gets its
  // own tab" — Hosur is a wholesale/shop-billing business with a completely
  // different flow (dispatch-then-bill, not counter billing), so mixing it
  // into the same branch comparison charts/table was more confusing than
  // useful. See the 'hosur' tab below for its dedicated view.
  const BRANCH_ONLY_OPTIONS: Branch[] = ['VRSNB', 'SNB'];
  const branchOnlyFilter = (branchFilter === 'Cafe' || branchFilter === 'Hosur' ? 'all' : branchFilter) as Branch | 'all';
  // Real bills for the "Branch Sales Transactions" drill-down below — see
  // realBillsInRange for why this replaced the old per-item branchTransactions list.
  const filteredRealBills = useMemo(() => {
    const snbVrsnb = realBillsInRange.filter(b => b.branch === 'VRSNB' || b.branch === 'SNB');
    const scoped = branchOnlyFilter === 'all' ? snbVrsnb : snbVrsnb.filter(b => b.branch === branchOnlyFilter);
    const q = billSearch.trim().toLowerCase();
    const searched = q ? scoped.filter(b => b.billNo.toLowerCase().includes(q) || b.biller.toLowerCase().includes(q) || b.salesperson.toLowerCase().includes(q)) : scoped;
    return [...searched].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [realBillsInRange, branchOnlyFilter, billSearch]);
  const realBillItemsByBillId = useMemo(() => {
    const map = new Map<string, typeof realBillItems>();
    realBillItems.forEach(item => {
      const list = map.get(item.billId) ?? [];
      list.push(item);
      map.set(item.billId, list);
    });
    return map;
  }, [realBillItems]);
  const billPaidByMode = useMemo(() => {
    const map = new Map<string, { cash: number; upi: number; card: number }>();
    realPayments.forEach(p => {
      const row = map.get(p.billId) ?? { cash: 0, upi: 0, card: 0 };
      if (p.mode === 'cash') row.cash += p.amount;
      else if (p.mode === 'upi') row.upi += p.amount;
      else row.card += p.amount;
      map.set(p.billId, row);
    });
    return map;
  }, [realPayments]);
  const branchFinancialDetailScoped = useMemo(
    () => branchFinancialDetail.filter(row => (row.branch === 'VRSNB' || row.branch === 'SNB') && (branchOnlyFilter === 'all' || row.branch === branchOnlyFilter)),
    [branchFinancialDetail, branchOnlyFilter],
  );

  // FEATURE (2026-09-02): same 3-sheet restructure as Cafe Control above — Total Sales /
  // Item-wise Sales / Bill-wise Sales. The old "Bill Details" sheet mixed items and bills
  // into one row-per-item table; item-wise totals are now their own sheet, and bill-wise
  // is one row per real bill (with its own cash/upi/card split via billPaidByMode) instead
  // of repeating the bill total on every item line.
  const branchItemWiseSales = useMemo(() => {
    const map = new Map<string, { itemName: string; qty: number; revenue: number; bills: number }>();
    filteredRealBills.forEach(b => (realBillItemsByBillId.get(b.id) ?? []).forEach(i => {
      const row = map.get(i.itemName) ?? { itemName: i.itemName, qty: 0, revenue: 0, bills: 0 };
      row.qty += i.quantity;
      row.revenue += i.lineTotal;
      row.bills += 1;
      map.set(i.itemName, row);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredRealBills, realBillItemsByBillId]);

  const exportBranchSalesExcel = () => exportWorkbook(`Admin_BranchSales_${fromDate}_${toDate}`, [
    {
      name: 'Total Sales', title: `Branch Sales — Total Sales (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Total Sales', key: 'totalSales' }, { header: 'Advance Collected', key: 'advanceCollected' },
        { header: 'Advance Balance Collected', key: 'advanceBalanceCollected', width: 22 }, { header: 'Cash', key: 'cash' }, { header: 'UPI', key: 'upi' },
        { header: 'Card', key: 'card' }, { header: 'Credit', key: 'credit' }, { header: 'Expenses', key: 'expenses' }, { header: 'Purchases', key: 'purchases' },
        { header: 'Returns', key: 'returns' }, { header: 'Bills', key: 'orderCount' },
      ],
      rows: branchFinancialDetailScoped,
    },
    {
      name: 'Item-wise Sales', title: `Branch Sales — Item-wise Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Item Name', key: 'itemName', width: 28 }, { header: 'Qty Sold', key: 'qty' }, { header: 'Revenue', key: 'revenue' }, { header: 'Bills', key: 'bills' }],
      rows: branchItemWiseSales,
    },
    {
      // FEATURE (2026-09-04): standardized bill-wise column set across
      // Cafe Control / Branch Sales / Hosur Sales / Dispatch Details.
      name: 'Bill-wise Sales', title: `Branch Sales — Bill-wise Sales (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Time', key: 'time', width: 12 },
        { header: 'Total Sales', key: 'totalSales' }, { header: 'Cash', key: 'cash' }, { header: 'UPI', key: 'upi' }, { header: 'Card', key: 'card' },
        { header: 'Salesperson', key: 'salesperson' }, { header: 'Biller', key: 'biller' },
      ],
      rows: filteredRealBills.map(b => {
        const paid = billPaidByMode.get(b.id) ?? { cash: 0, upi: 0, card: 0 };
        return { branch: b.branch, billNo: b.billNo, date: fmtDate(b.createdAt), time: fmtTime(b.createdAt), totalSales: b.total, cash: paid.cash, upi: paid.upi, card: paid.card, salesperson: b.salesperson, biller: b.biller };
      }),
    },
    {
      // FEATURE (2026-09-04): "extra sheet with bill number and what all
      // item was sold in that bill" — one row per item per bill.
      name: 'Bill Items', title: `Branch Sales — Bill Items (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Item Name', key: 'itemName', width: 28 },
        { header: 'Qty', key: 'qty' }, { header: 'Line Total', key: 'lineTotal' },
      ],
      rows: filteredRealBills.flatMap(b => (realBillItemsByBillId.get(b.id) ?? []).map(i => ({
        branch: b.branch, billNo: b.billNo, date: fmtDate(b.createdAt), itemName: i.itemName, qty: i.quantity, lineTotal: i.lineTotal,
      }))),
    },
  ]);

  const exportBranchSalesPdf = () => {
    const PDF_BILL_CAP = 300;
    const cappedBills = filteredRealBills.slice(0, PDF_BILL_CAP);
    return exportReportPdf({
      filename: `Admin_BranchSales_${fromDate}_${toDate}`,
      title: 'Branch Sales',
      subtitle: `${fromDate} to ${toDate} · ${branchOnlyFilter === 'all' ? 'VRSNB & SNB' : BRANCH_LABELS[branchOnlyFilter]}`,
      kpis: [
        { label: 'Total Sales', value: formatCurrency(branchFinancialDetailScoped.reduce((s, r) => s + r.totalSales, 0)) },
        { label: 'Cash', value: formatCurrency(branchFinancialDetailScoped.reduce((s, r) => s + r.cash, 0)) },
        { label: 'UPI', value: formatCurrency(branchFinancialDetailScoped.reduce((s, r) => s + r.upi, 0)) },
        { label: 'Card', value: formatCurrency(branchFinancialDetailScoped.reduce((s, r) => s + r.card, 0)) },
        { label: 'Credit', value: formatCurrency(branchFinancialDetailScoped.reduce((s, r) => s + r.credit, 0)) },
        { label: 'Bills', value: String(filteredRealBills.length) },
      ],
      sections: [
        {
          heading: 'Branch Financial Detail',
          columns: [{ header: 'Branch', width: 25 }, { header: 'Total Sales', width: 28, align: 'right' }, { header: 'Advance', width: 25, align: 'right' }, { header: 'Cash', width: 25, align: 'right' }, { header: 'UPI', width: 25, align: 'right' }, { header: 'Card', width: 22, align: 'right' }, { header: 'Credit', width: 25, align: 'right' }, { header: 'Expenses', width: 25, align: 'right' }, { header: 'Purchases', width: 25, align: 'right' }, { header: 'Returns', width: 25, align: 'right' }, { header: 'Bills', width: 18, align: 'right' }],
          rows: branchFinancialDetailScoped.map(r => [BRANCH_LABELS[r.branch], pdfMoney(r.totalSales), pdfMoney(r.advanceCollected), pdfMoney(r.cash), pdfMoney(r.upi), pdfMoney(r.card), pdfMoney(r.credit), pdfMoney(r.expenses), pdfMoney(r.purchases), pdfMoney(r.returns), String(r.orderCount)]),
        },
        {
          heading: filteredRealBills.length > PDF_BILL_CAP ? `Bills (first ${PDF_BILL_CAP} of ${filteredRealBills.length} — full list in Excel export)` : 'Bills',
          columns: [{ header: 'Branch', width: 20 }, { header: 'Bill No', width: 28 }, { header: 'Total', width: 25, align: 'right' }, { header: 'Salesperson', width: 35 }, { header: 'Biller', width: 35 }, { header: 'Time', width: 40 }],
          rows: cappedBills.map(b => [b.branch, b.billNo, pdfMoney(b.total), b.salesperson, b.biller, fmtDateTime(b.createdAt)]),
        },
      ],
    });
  };

  const BranchesTab = (
    <div className="space-y-5">
      {/* TOP BAR: date presets + branch filter (no Cafe) + excel */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <select value={branchOnlyFilter} onChange={e => setBranchFilter(e.target.value as Branch | 'all')} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none">
            <option value="all">All branches</option>
            {BRANCH_ONLY_OPTIONS.map(branch => <option key={branch} value={branch}>{BRANCH_LABELS[branch]}</option>)}
          </select>
          {/* AUDIT FIX (2026-09-04): "Bills" and "Branch Financial Detail"
              below (realBills/realBillItems/realPayments/adminLedger) only
              ever re-fetch on a fromDate/toDate change — no manual refresh. */}
          <button
            onClick={() => { void fetchRealSalesData(); adminLedger.refresh(); }}
            disabled={realSalesLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', realSalesLoading && 'animate-spin')} />Refresh
          </button>
          <button onClick={exportBranchSalesExcel}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={exportBranchSalesPdf}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Branch KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {branchSalesByBranch.filter(b => b.branch === 'VRSNB' || b.branch === 'SNB').map((b, i) => (
          <KpiCard key={b.branch} label={b.label} value={formatCurrency(b.sales)} icon={<Store className="size-5" />} tone={(['green', 'blue', 'purple'] as const)[i % 3]} sub={`${b.orders} transactions`} />
        ))}
        <KpiCard label="Total Branch Revenue" value={formatCurrency(branchSalesByBranch.filter(b => b.branch === 'VRSNB' || b.branch === 'SNB').reduce((sum, b) => sum + b.sales, 0))} icon={<TrendingUp className="size-5" />} tone="amber" />
      </div>

      <Panel title="Branch Financial Detail" subtitle="Total sales, advance, expenses, purchases and returns — SNB and VRSNB, for the selected range">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="p-3">Branch</th>
                <th className="p-3 text-right">Total Sales</th>
                <th className="p-3 text-right">Advance Collected</th>
                <th className="p-3 text-right">Advance Balance Collected</th>
                <th className="p-3 text-right">Cash</th>
                <th className="p-3 text-right">UPI</th>
                <th className="p-3 text-right">Card</th>
                <th className="p-3 text-right">Credit</th>
                <th className="p-3 text-right">Expenses</th>
                <th className="p-3 text-right">Purchases</th>
                <th className="p-3 text-right">Returns</th>
                <th className="p-3 text-right">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {branchFinancialDetailScoped.map(row => (
                <tr key={row.branch} className="hover:bg-slate-50">
                  <td className="p-3"><BranchPill branch={row.branch} /></td>
                  <td className="p-3 text-right font-black">{formatCurrency(row.totalSales)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.advanceCollected)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.advanceBalanceCollected)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.cash)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.upi)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.card)}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(row.credit)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600">{formatCurrency(row.expenses)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600">{formatCurrency(row.purchases)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600">{formatCurrency(row.returns)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{row.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Branch Sales Comparison" subtitle="Revenue by branch for selected range">
          <ChartWrap>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchOnlyFilter === 'all' ? branchSalesByBranch.filter(b => b.branch === 'VRSNB' || b.branch === 'SNB') : branchSalesByBranch.filter(b => b.branch === branchOnlyFilter)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${Number(v) / 1000}k`} width={72} />
                <Tooltip formatter={value => formatCurrency(Number(value))} />
                <Bar dataKey="sales" radius={[10, 10, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
        </Panel>

        <Panel title="Daily Branch Sales Trend" subtitle="Day-by-day revenue for selected range">
          <ChartWrap>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySalesTrend}>
                <defs>
                  <linearGradient id="snbFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                  <linearGradient id="vrsnbFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${Number(v) / 1000}k`} width={72} />
                <Tooltip formatter={value => formatCurrency(Number(value))} />
                {(branchOnlyFilter === 'all' || branchOnlyFilter === 'SNB') && <Area type="monotone" dataKey="SNB" stroke="#2563eb" fill="url(#snbFill)" strokeWidth={2} />}
                {(branchOnlyFilter === 'all' || branchOnlyFilter === 'VRSNB') && <Area type="monotone" dataKey="VRSNB" stroke="#7c3aed" fill="url(#vrsnbFill)" strokeWidth={2} />}
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrap>
        </Panel>
      </div>

      <Panel title="Bills" subtitle={`SNB and VRSNB bills — every bill and its line items, real source of truth${realSalesLoading ? ' (loading…)' : ''}`}>
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-slate-400" />
          <input value={billSearch} onChange={e => setBillSearch(e.target.value)} placeholder="Search bill no, biller or salesperson…"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
          <span className="ml-auto text-xs font-semibold text-slate-500">{filteredRealBills.length} bill{filteredRealBills.length === 1 ? '' : 's'}</span>
        </div>
        {realSalesError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{realSalesError}</p>}
        {filteredRealBills.length === 0 ? <EmptyState label={realSalesLoading ? 'Loading bills…' : 'No bills in this range.'} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3 w-8" /><th className="p-3">Branch</th><th className="p-3">Bill No</th><th className="p-3 text-right">Items</th><th className="p-3 text-right">Bill Price</th><th className="p-3">Biller / Salesperson</th><th className="p-3">Time</th></tr></thead>
              <tbody className="divide-y">
                {filteredRealBills.slice(0, 200).map(b => {
                  const items = realBillItemsByBillId.get(b.id) ?? [];
                  const paid = billPaidByMode.get(b.id);
                  const expanded = expandedBillId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr onClick={() => setExpandedBillId(expanded ? null : b.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="p-3"><ChevronDown className={cn('size-4 text-slate-400 transition-transform', expanded && 'rotate-180')} /></td>
                        <td className="p-3"><BranchPill branch={b.branch} /></td>
                        <td className="p-3 font-semibold">{b.billNo || '—'}{b.status === 'returned' && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">Returned</span>}</td>
                        <td className="p-3 text-right tabular-nums text-slate-500">{items.length}</td>
                        <td className="p-3 text-right font-black">{formatCurrency(b.total)}</td>
                        <td className="p-3 text-slate-500">{b.biller || b.salesperson || '—'}</td>
                        <td className="p-3 text-slate-500">{fmtDateTime(b.createdAt)}</td>
                      </tr>
                      {expanded && (
                        <tr key={`${b.id}-detail`}>
                          <td colSpan={7} className="bg-slate-50/70 p-4">
                            {items.length === 0 ? <p className="text-xs text-slate-500">No line items recorded for this bill.</p> : (
                              <table className="w-full text-xs">
                                <thead><tr className="text-left uppercase text-slate-400"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5">Unit</th><th className="py-1.5 text-right">Unit Price</th><th className="py-1.5 text-right">Line Total</th></tr></thead>
                                <tbody className="divide-y divide-slate-200">
                                  {items.map((i, idx) => (
                                    <tr key={idx}>
                                      <td className="py-1.5 font-semibold text-slate-700">{i.itemName}</td>
                                      <td className="py-1.5 text-right tabular-nums">{i.quantity}</td>
                                      <td className="py-1.5 text-slate-500">{i.unit}</td>
                                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(i.unitPrice)}</td>
                                      <td className="py-1.5 text-right font-bold">{formatCurrency(i.lineTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                              <span>Subtotal: <b className="text-slate-800">{formatCurrency(b.subtotal)}</b></span>
                              <span>Discount: <b className="text-slate-800">{formatCurrency(b.discount)}</b></span>
                              <span>Cash paid: <b className="text-slate-800">{formatCurrency(paid?.cash || 0)}</b></span>
                              <span>UPI paid: <b className="text-slate-800">{formatCurrency(paid?.upi || 0)}</b></span>
                              <span>Card paid: <b className="text-slate-800">{formatCurrency(paid?.card || 0)}</b></span>
                              <span>Bill total: <b className="text-slate-800">{formatCurrency(b.total)}</b></span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  // FEATURE: dedicated "Hosur Sales" tab — Hosur is wholesale shop billing
  // (dispatch first, bill later), not counter billing like SNB/VRSNB, so it
  // never belonged in the same comparison charts. Shows real confirmed
  // billing (hosur_bills, same source Owner Dashboard's Hosur card already
  // uses) AND, just as importantly, the dispatched-but-never-billed backlog
  // — the real reason Hosur revenue always looked like ₹0 elsewhere.
  const hosurBillsInRange = useMemo(() => realBillsInRange.filter(b => b.branch === 'Hosur'), [realBillsInRange]);
  const hosurBillItemsInRange = useMemo(() => realBillItems.filter(i => i.branch === 'Hosur'), [realBillItems]);
  const hosurTotalBilled = useMemo(() => hosurBillsInRange.reduce((sum, b) => sum + b.total, 0), [hosurBillsInRange]);
  const hosurUnbilledTotal = useMemo(() => hosurUnbilledDispatched.reduce((sum, o) => sum + o.subtotal, 0), [hosurUnbilledDispatched]);
  const hosurPaidByMode = useMemo(() => {
    const totals = { cash: 0, upi: 0, card: 0 };
    const hosurBillIds = new Set(hosurBillsInRange.map(b => b.id));
    realPayments.filter(p => hosurBillIds.has(p.billId)).forEach(p => {
      if (p.mode === 'cash') totals.cash += p.amount;
      else if (p.mode === 'upi') totals.upi += p.amount;
      else totals.card += p.amount;
    });
    return totals;
  }, [realPayments, hosurBillsInRange]);

  // FEATURE (2026-09-02): Hosur Sales had no Excel export at all, only PDF — added the
  // same 3-sheet Total Sales / Item-wise Sales / Bill-wise Sales structure as Cafe
  // Control and Branch Sales above. Item-wise is aggregated from hosurBillItemsInRange,
  // scoped to bills actually confirmed in this range (the dispatched-but-unbilled
  // backlog has no items resolved to it yet — that stays its own KPI/section, not a
  // sales line, since nothing has actually been billed for it).
  const hosurItemWiseSales = useMemo(() => {
    const map = new Map<string, { itemName: string; qty: number; revenue: number; bills: number }>();
    hosurBillsInRange.forEach(b => hosurBillItemsInRange.filter(i => i.billId === b.id).forEach(i => {
      const row = map.get(i.itemName) ?? { itemName: i.itemName, qty: 0, revenue: 0, bills: 0 };
      row.qty += i.quantity;
      row.revenue += i.lineTotal;
      row.bills += 1;
      map.set(i.itemName, row);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [hosurBillsInRange, hosurBillItemsInRange]);

  const exportHosurExcel = () => exportWorkbook(`Admin_Hosur_${fromDate}_${toDate}`, [
    {
      name: 'Total Sales', title: `Hosur Sales — Total Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Metric', key: 'metric' }, { header: 'Amount', key: 'amount' }],
      rows: [
        { metric: 'Billed Sales', amount: hosurTotalBilled },
        { metric: 'Cash', amount: hosurPaidByMode.cash },
        { metric: 'UPI', amount: hosurPaidByMode.upi },
        { metric: 'Card', amount: hosurPaidByMode.card },
        { metric: 'Confirmed Bills', amount: hosurBillsInRange.length },
        { metric: 'Dispatched, Not Yet Billed (Orders)', amount: hosurUnbilledDispatched.length },
        { metric: 'Dispatched, Not Yet Billed (Value)', amount: hosurUnbilledTotal },
      ],
    },
    {
      name: 'Item-wise Sales', title: `Hosur Sales — Item-wise Sales (${fromDate} to ${toDate})`,
      columns: [{ header: 'Item Name', key: 'itemName', width: 28 }, { header: 'Qty Sold', key: 'qty' }, { header: 'Revenue', key: 'revenue' }, { header: 'Bills', key: 'bills' }],
      rows: hosurItemWiseSales,
    },
    {
      // FEATURE (2026-09-04): standardized bill-wise column set across
      // Cafe Control / Branch Sales / Hosur Sales / Dispatch Details. Hosur
      // bills go through the same realPayments table as branch bills, so
      // billPaidByMode (built above from realPayments) covers these too.
      name: 'Bill-wise Sales', title: `Hosur Sales — Bill-wise Sales (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Branch', key: 'branch' }, { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Time', key: 'time', width: 12 },
        { header: 'Total Sales', key: 'totalSales' }, { header: 'Cash', key: 'cash' }, { header: 'UPI', key: 'upi' }, { header: 'Card', key: 'card' },
        { header: 'Salesperson', key: 'salesperson', width: 18 }, { header: 'Biller', key: 'biller' },
      ],
      rows: hosurBillsInRange.map(b => {
        const paid = billPaidByMode.get(b.id) ?? { cash: 0, upi: 0, card: 0 };
        return { branch: 'Hosur', billNo: b.billNo || '—', date: fmtDate(b.createdAt), time: fmtTime(b.createdAt), totalSales: b.total, cash: paid.cash, upi: paid.upi, card: paid.card, salesperson: b.salesperson || '—', biller: b.biller || '—' };
      }),
    },
    {
      // FEATURE (2026-09-04): "extra sheet with bill number and what all
      // item was sold in that bill" — one row per item per bill.
      name: 'Bill Items', title: `Hosur Sales — Bill Items (${fromDate} to ${toDate})`,
      columns: [
        { header: 'Bill No', key: 'billNo' }, { header: 'Date', key: 'date', width: 14 }, { header: 'Item Name', key: 'itemName', width: 28 },
        { header: 'Qty', key: 'qty' }, { header: 'Line Total', key: 'lineTotal' },
      ],
      rows: hosurBillsInRange.flatMap(b => hosurBillItemsInRange.filter(i => i.billId === b.id).map(i => ({
        billNo: b.billNo || '—', date: fmtDate(b.createdAt), itemName: i.itemName, qty: i.quantity, lineTotal: i.lineTotal,
      }))),
    },
  ]);

  const exportHosurPdf = () => {
    const PDF_BILL_CAP = 300;
    return exportReportPdf({
      filename: `Admin_Hosur_${fromDate}_${toDate}`,
      title: 'Hosur Sales',
      subtitle: `${fromDate} to ${toDate}`,
      kpis: [
        { label: 'Billed Sales', value: formatCurrency(hosurTotalBilled) },
        { label: 'Dispatched, Not Billed', value: formatCurrency(hosurUnbilledTotal) },
        { label: 'Cash Collected', value: formatCurrency(hosurPaidByMode.cash) },
        { label: 'UPI Collected', value: formatCurrency(hosurPaidByMode.upi) },
      ],
      sections: [
        {
          heading: 'Dispatched, Not Yet Billed',
          columns: [{ header: 'Order', width: 30 }, { header: 'Shop', width: 45 }, { header: 'Value', width: 30, align: 'right' }, { header: 'Dispatched', width: 40 }],
          rows: [...hosurUnbilledDispatched].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, PDF_BILL_CAP).map(o => [o.orderNumber || '—', o.shopName || '—', pdfMoney(o.subtotal), fmtDateTime(o.createdAt)]),
        },
        {
          heading: hosurBillsInRange.length > PDF_BILL_CAP ? `Confirmed Bills (first ${PDF_BILL_CAP} of ${hosurBillsInRange.length})` : 'Confirmed Bills',
          columns: [{ header: 'Bill No', width: 30 }, { header: 'Items', width: 20, align: 'right' }, { header: 'Total', width: 30, align: 'right' }, { header: 'Biller', width: 40 }, { header: 'Time', width: 40 }],
          rows: hosurBillsInRange.slice(0, PDF_BILL_CAP).map(b => [b.billNo || '—', String((realBillItemsByBillId.get(b.id) ?? []).length), pdfMoney(b.total), b.biller || b.salesperson || '—', fmtDateTime(b.createdAt)]),
        },
      ],
    });
  };

  const HosurTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          {/* AUDIT FIX (2026-09-04): "Dispatched, Not Yet Billed" and
              "Confirmed Bills" below (hosurUnbilledDispatched/realBills) —
              same fetchRealSalesData source as Branches Sales, only ever
              re-fetching on a fromDate/toDate change with no manual refresh. */}
          <button
            onClick={() => void fetchRealSalesData()}
            disabled={realSalesLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', realSalesLoading && 'animate-spin')} />Refresh
          </button>
          <button onClick={exportHosurExcel}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={exportHosurPdf}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Billed Sales" value={formatCurrency(hosurTotalBilled)} icon={<IndianRupee className="size-5" />} tone="green" sub={`${hosurBillsInRange.length} confirmed bills`} />
        <KpiCard label="Dispatched, Not Yet Billed" value={formatCurrency(hosurUnbilledTotal)} icon={<AlertTriangle className="size-5" />} tone="red" sub={`${hosurUnbilledDispatched.length} orders`} />
        <KpiCard label="Cash Collected" value={formatCurrency(hosurPaidByMode.cash)} icon={<Banknote className="size-5" />} tone="blue" />
        <KpiCard label="UPI Collected" value={formatCurrency(hosurPaidByMode.upi)} icon={<Smartphone className="size-5" />} tone="purple" />
      </div>

      {hosurUnbilledDispatched.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          <AlertTriangle className="mr-2 inline size-4" />
          {hosurUnbilledDispatched.length} order{hosurUnbilledDispatched.length === 1 ? '' : 's'} worth {formatCurrency(hosurUnbilledTotal)} {hosurUnbilledDispatched.length === 1 ? 'has' : 'have'} been dispatched to shops but never confirmed/billed in Planner's Hosur Shops &amp; Billing → Dispatch &amp; Billing Queue. This is real revenue not yet tracked as collected.
        </div>
      )}

      <Panel title="Dispatched, Not Yet Billed" subtitle="Orders sitting in the Dispatch & Billing Queue that were never confirmed into a bill">
        {hosurUnbilledDispatched.length === 0 ? <EmptyState label="Nothing outstanding — every dispatched order in this range has been billed." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Order</th><th className="p-3">Shop</th><th className="p-3 text-right">Value</th><th className="p-3">Dispatched</th></tr></thead>
              <tbody className="divide-y">
                {hosurUnbilledDispatched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200).map(o => (
                  <tr key={o.id} className="hover:bg-red-50/40">
                    <td className="p-3 font-bold">{o.orderNumber || '—'}</td>
                    <td className="p-3">{o.shopName || '—'}</td>
                    <td className="p-3 text-right font-black text-red-600">{formatCurrency(o.subtotal)}</td>
                    <td className="p-3 text-slate-500">{fmtDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Confirmed Bills" subtitle={`Hosur bills actually confirmed and collected in this range${realSalesLoading ? ' (loading…)' : ''}`}>
        {realSalesError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{realSalesError}</p>}
        {hosurBillsInRange.length === 0 ? <EmptyState label={realSalesLoading ? 'Loading bills…' : 'No confirmed Hosur bills in this range.'} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3 w-8" /><th className="p-3">Bill No</th><th className="p-3">Shop</th><th className="p-3 text-right">Items</th><th className="p-3 text-right">Bill Price</th><th className="p-3">Time</th></tr></thead>
              <tbody className="divide-y">
                {[...hosurBillsInRange].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200).map(b => {
                  const items = hosurBillItemsInRange.filter(i => i.billId === b.id);
                  const expanded = expandedBillId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr onClick={() => setExpandedBillId(expanded ? null : b.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="p-3"><ChevronDown className={cn('size-4 text-slate-400 transition-transform', expanded && 'rotate-180')} /></td>
                        <td className="p-3 font-semibold">{b.billNo || '—'}</td>
                        <td className="p-3">{b.biller || '—'}</td>
                        <td className="p-3 text-right tabular-nums text-slate-500">{items.length}</td>
                        <td className="p-3 text-right font-black">{formatCurrency(b.total)}</td>
                        <td className="p-3 text-slate-500">{fmtDateTime(b.createdAt)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50/70 p-4">
                            {items.length === 0 ? <p className="text-xs text-slate-500">No line items recorded for this bill.</p> : (
                              <table className="w-full text-xs">
                                <thead><tr className="text-left uppercase text-slate-400"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5">Unit</th><th className="py-1.5 text-right">Unit Price</th><th className="py-1.5 text-right">Line Total</th></tr></thead>
                                <tbody className="divide-y divide-slate-200">
                                  {items.map((i, idx) => (
                                    <tr key={idx}>
                                      <td className="py-1.5 font-semibold text-slate-700">{i.itemName}</td>
                                      <td className="py-1.5 text-right tabular-nums">{i.quantity}</td>
                                      <td className="py-1.5 text-slate-500">{i.unit}</td>
                                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(i.unitPrice)}</td>
                                      <td className="py-1.5 text-right font-bold">{formatCurrency(i.lineTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* FEATURE (2026-09-02): "Admin should see the credit details and they
          should only clear the Credit and payment collections. The payment
          collection is totally done by the Admin." — Hosur Sales previously
          had zero credit visibility; the collect-payment action lived only
          in Planner's Hosur dashboard, reachable by planner/owner/branch_hosur
          with no restriction. That action has been removed from Planner (now
          a read-only Credit Ledger there) and moved here, admin-only —
          reusing AdminCreditTab (already proven for Cafe/SNB/VRSNB) scoped to
          just Hosur so this stays one component, not a second implementation. */}
      <Panel title="Hosur Credit & Payment Collection" subtitle="Outstanding shop credit and payment collection — Admin is the only role that can clear these.">
        <AdminCreditTab branches={['Hosur']} accentColor="text-teal-700" />
      </Panel>
    </div>
  );

  const ItemsTab = (
    <div className="space-y-5">
      <Panel title="Item Controls" subtitle="Items without stock are marked unavailable and cannot be billed from the branch billing flow.">
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

  const [disputeQtyById, setDisputeQtyById] = useState<Record<string, string>>({});
  const [savingDisputeId, setSavingDisputeId] = useState('');
  const [disputeMessage, setDisputeMessage] = useState('');
  const stockDisputes = useMemo(() => ADMIN_BRANCHES.flatMap(branch =>
    (incoming[branch] || [])
      .filter(item => item.disputed && !item.confirmed)
      .map(item => ({ ...item, branch })),
  ).sort((a, b) => new Date(b.disputedAt || b.receivedAt).getTime() - new Date(a.disputedAt || a.receivedAt).getTime()), [incoming]);

  useEffect(() => {
    setDisputeQtyById(prev => {
      const next = { ...prev };
      let changed = false;
      stockDisputes.forEach(item => {
        if (next[item.id] === undefined) {
          next[item.id] = String(item.quantity);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [stockDisputes]);

  const resolveStockDispute = async (branch: Branch, incomingId: string) => {
    const item = stockDisputes.find(row => row.branch === branch && row.id === incomingId);
    if (!item) return;
    const correctedQty = Number(disputeQtyById[incomingId] ?? item.quantity);
    if (!Number.isFinite(correctedQty) || correctedQty < 0) {
      setDisputeMessage('Enter a valid corrected quantity before confirming.');
      return;
    }
    setSavingDisputeId(incomingId);
    setDisputeMessage('');
    // AUDIT FIX (2026-09-02): pcs items must stay whole numbers — this used
    // the same kg-precision rounding (Math.round(x*1000)/1000) regardless
    // of unit, so a typo/partial correction like "45.5" for a pcs item
    // saved a fractional piece count into real branch stock. Same bug class
    // fixed at 15+ other input sites (see project_pcs_decimal_fix_gaps /
    // project_planner_audit_round2/3 memories).
    const correctedQtySafe = item.unit === 'pcs' ? Math.round(correctedQty) : Math.round(correctedQty * 1000) / 1000;
    const { error } = await supabase
      .from('branch_incoming')
      .update({
        quantity: correctedQtySafe,
        disputed: false,
        dispute_reason: `${item.disputeReason || 'Dispute'} | Resolved by ${adminName}`,
      })
      .eq('id', incomingId)
      .eq('branch', branch);
    if (error) {
      setDisputeMessage(`Could not update disputed stock: ${error.message}`);
      setSavingDisputeId('');
      return;
    }
    await fetchBranchData(branch, false, ['incoming']); // EGRESS FIX: resolving a dispute only touches incoming
    const confirmError = await confirmIncoming(branch, incomingId);
    if (confirmError) {
      setDisputeMessage(confirmError);
      setSavingDisputeId('');
      return;
    }
    notifications
      .filter(n => n.branch === branch && n.type === 'Stock Dispute' && n.status !== 'Resolved' && n.details.includes(item.itemName))
      .forEach(n => updateNotificationStatus(n.id, 'Resolved', adminName));
    await fetchBranchData(branch, false, ['incoming']); // EGRESS FIX: resolving a dispute only touches incoming
    setDisputeMessage(`${BRANCH_LABELS[branch]} ${item.itemName} confirmed with corrected quantity ${correctedQty} ${item.unit}. Stock synced.`);
    setSavingDisputeId('');
  };

  const StockDisputesTab = (
    <div className="space-y-5">
      <Panel
        title="Incoming Stock Disputes"
        subtitle="Admin approval is required before disputed incoming stock can sync to branch stock."
        action={<Badge tone={stockDisputes.length > 0 ? 'amber' : 'green'}>{stockDisputes.length} pending</Badge>}
      >
        {disputeMessage && (
          <p className="mb-3 rounded-2xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">{disputeMessage}</p>
        )}
        {stockDisputes.length === 0 ? <EmptyState label="No incoming stock disputes pending." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Branch</th>
                  <th className="p-3">Item</th>
                  <th className="p-3 text-right">Dispatched</th>
                  <th className="p-3">Correct Qty</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Raised By</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockDisputes.map(item => (
                  <tr key={`${item.branch}-${item.id}`} className="hover:bg-slate-50">
                    <td className="p-3"><BranchPill branch={item.branch} /></td>
                    <td className="p-3 font-black">{item.itemName}</td>
                    <td className="p-3 text-right font-black tabular-nums">{item.quantity} {item.unit}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        step={item.unit === 'kg' ? '0.001' : '1'}
                        value={disputeQtyById[item.id] ?? String(item.quantity)}
                        onChange={event => setDisputeQtyById(prev => ({ ...prev, [item.id]: event.target.value }))}
                        className="h-10 w-28 rounded-2xl border border-slate-200 px-3 text-sm font-black tabular-nums"
                      />
                    </td>
                    <td className="p-3 text-slate-600">{item.disputeReason || '-'}</td>
                    <td className="p-3 text-slate-600">{item.disputedBy || '-'}</td>
                    <td className="p-3 text-slate-500">{fmtDateTime(item.disputedAt || item.receivedAt)}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        disabled={savingDisputeId === item.id}
                        onClick={() => void resolveStockDispute(item.branch, item.id)}
                        className="rounded-2xl bg-orange-500 px-4 py-2 text-xs font-black text-white shadow-lg shadow-orange-200 disabled:opacity-50"
                      >
                        {savingDisputeId === item.id ? 'Saving...' : 'Confirm & Sync'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        action={<div className="flex flex-wrap gap-2"><button onClick={() => closureLedger.refresh()} disabled={closureLedger.loading} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black disabled:opacity-60"><RefreshCw className={cn('size-3.5', closureLedger.loading && 'animate-spin')} />Refresh</button><button onClick={printDailyClosure} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black"><Printer className="size-3.5" />Print</button><button onClick={exportDailyClosure} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><FileSpreadsheet className="size-3.5" />Excel</button><button onClick={exportDailyClosurePdf} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><FileDown className="size-3.5" />PDF</button></div>}>
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

  // CreditsTab KPI data
  const { creditSales: allCreditSalesMap, advanceOrders: allAdvanceOrdersMap } = useBranchStore(useShallow(s => ({ creditSales: s.creditSales, advanceOrders: s.advanceOrders })));
  const allCredits = useMemo(() => ADMIN_BRANCHES.flatMap(branch => (allCreditSalesMap[branch] || []).map(c => ({ ...c, branch }))), [allCreditSalesMap]);
  const pendingCredits = useMemo(() => allCredits.filter(c => c.status === 'pending'), [allCredits]);
  const partialCredits = useMemo(() => allCredits.filter(c => c.status === 'partial'), [allCredits]);
  const settledCredits = useMemo(() => allCredits.filter(c => c.status === 'settled'), [allCredits]);
  const totalPending = useMemo(() => pendingCredits.reduce((s, c) => s + Number(c.creditAmount || 0), 0), [pendingCredits]);

  // AdvanceTab KPI data
  const allAdvances = useMemo(() => ADMIN_BRANCHES.flatMap(branch => (allAdvanceOrdersMap[branch] || []).map(a => ({ ...a, branch }))), [allAdvanceOrdersMap]);
  const pendingAdvances = useMemo(() => allAdvances.filter(a => a.status === 'pending'), [allAdvances]);
  const deliveredAdvances = useMemo(() => allAdvances.filter(a => a.status === 'completed'), [allAdvances]);
  const totalAdvanceValue = useMemo(() => allAdvances.reduce((s, a) => s + Number(a.subtotal || 0), 0), [allAdvances]);
  const advanceBalanceDue = useMemo(() => allAdvances.reduce((s, a) => s + Number(a.balanceDue || 0), 0), [allAdvances]);

  const CreditsTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Credits" value={allCredits.length} icon={<WalletCards className="size-5" />} tone="slate" />
        <KpiCard label="Pending" value={pendingCredits.length} icon={<AlertTriangle className="size-5" />} tone={pendingCredits.length > 0 ? 'red' : 'slate'} sub={formatCurrency(totalPending)} />
        <KpiCard label="Partial" value={partialCredits.length} icon={<CreditCard className="size-5" />} tone="amber" />
        <KpiCard label="Settled" value={settledCredits.length} icon={<TrendingUp className="size-5" />} tone="green" />
      </div>
      <Panel title="Credit Management" subtitle="All branches — pending, partial and settled credit sales">
        <AdminCreditTab branches={ADMIN_BRANCHES} />
      </Panel>
    </div>
  );

  const exportAdvanceExcel = () => exportWorkbook(`Admin_AdvanceOrders_${fromDate}_${toDate}`, [{
    name: 'Advance Orders', title: `Advance Orders (${fromDate} to ${toDate})`,
    columns: [{ header: 'Branch', key: 'Branch' }, { header: 'Customer', key: 'Customer' }, { header: 'Delivery Date', key: 'Delivery Date' }, { header: 'Subtotal', key: 'Subtotal' }, { header: 'Advance Paid', key: 'Advance Paid' }, { header: 'Balance Due', key: 'Balance Due' }, { header: 'Status', key: 'Status' }],
    rows: allAdvances.map(a => ({ Branch: a.branch, Customer: a.customerName || '-', 'Delivery Date': a.deliveryDate || '-', Subtotal: a.subtotal || 0, 'Advance Paid': a.advanceAmount || 0, 'Balance Due': a.balanceDue || 0, Status: a.status })),
  }]);

  const exportAdvancePdf = () => exportReportPdf({
    filename: `Admin_AdvanceOrders_${fromDate}_${toDate}`,
    title: 'Advance Orders',
    subtitle: `${fromDate} to ${toDate}`,
    kpis: [
      { label: 'Total Orders', value: String(allAdvances.length) },
      { label: 'Active', value: String(pendingAdvances.length) },
      { label: 'Delivered', value: String(deliveredAdvances.length) },
      { label: 'Balance Due', value: formatCurrency(advanceBalanceDue) },
      { label: 'Total Value', value: formatCurrency(totalAdvanceValue) },
    ],
    sections: [{
      heading: 'Advance Orders',
      columns: [{ header: 'Branch', width: 20 }, { header: 'Customer', width: 40 }, { header: 'Delivery Date', width: 25 }, { header: 'Subtotal', width: 25, align: 'right' }, { header: 'Advance Paid', width: 25, align: 'right' }, { header: 'Balance Due', width: 25, align: 'right' }, { header: 'Status', width: 20 }],
      rows: allAdvances.map(a => [a.branch, a.customerName || '-', a.deliveryDate || '-', pdfMoney(a.subtotal || 0), pdfMoney(a.advanceAmount || 0), pdfMoney(a.balanceDue || 0), a.status]),
    }],
  });

  // AdvanceTab — improved with top bar + KPI summary
  const AdvanceTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <DatePresets fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibond text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <button onClick={exportAdvanceExcel}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={exportAdvancePdf}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Orders" value={allAdvances.length} icon={<ClipboardList className="size-5" />} tone="slate" />
        <KpiCard label="Active Orders" value={pendingAdvances.length} icon={<AlertTriangle className="size-5" />} tone={pendingAdvances.length > 0 ? 'amber' : 'slate'} />
        <KpiCard label="Delivered" value={deliveredAdvances.length} icon={<TrendingUp className="size-5" />} tone="green" />
        <KpiCard label="Balance Due" value={formatCurrency(advanceBalanceDue)} icon={<IndianRupee className="size-5" />} tone={advanceBalanceDue > 0 ? 'red' : 'slate'} sub={`of ${formatCurrency(totalAdvanceValue)} total`} />
      </div>
      <Panel title="Advance Order Management" subtitle="Advance bookings and balance verification across all branches">
        <AdminAdvanceTab branches={ADMIN_BRANCHES} />
      </Panel>
    </div>
  );

  const [varianceBranchFilter, setVarianceBranchFilter] = useState<Branch | 'all'>('all');
  const [varianceSearch, setVarianceSearch] = useState('');
  const filteredVarianceRecords = useMemo(() => {
    return stockVarianceRecords
      .filter(r => varianceBranchFilter === 'all' || r.branch === varianceBranchFilter)
      .filter(r => !varianceSearch || r.itemName.toLowerCase().includes(varianceSearch.toLowerCase()) || r.reportNo?.toLowerCase().includes(varianceSearch.toLowerCase()));
  }, [stockVarianceRecords, varianceBranchFilter, varianceSearch]);
  const excessVariance = filteredVarianceRecords.filter(r => r.difference > 0);
  const shortVariance = filteredVarianceRecords.filter(r => r.difference < 0);

  const exportStockVarianceExcel = () => exportWorkbook('Admin_StockVariance', [{
    name: 'Stock Variance', title: 'Stock Variance Records',
    columns: [{ header: 'Date', key: 'Date', width: 18 }, { header: 'Branch', key: 'Branch' }, { header: 'Report', key: 'Report' }, { header: 'Item', key: 'Item' }, { header: 'Unit', key: 'Unit' }, { header: 'System Qty', key: 'System Qty' }, { header: 'Physical Qty', key: 'Physical Qty' }, { header: 'Difference', key: 'Difference' }, { header: 'Reported By', key: 'Reported By' }, { header: 'Confirmed By', key: 'Confirmed By' }],
    rows: filteredVarianceRecords.map(r => ({ Date: fmtDateTime(r.createdAt), Branch: r.branch, Report: r.reportNo, Item: r.itemName, Unit: r.unit || '', 'System Qty': r.systemQty, 'Physical Qty': r.physicalQty, Difference: r.difference, 'Reported By': r.reportedBy, 'Confirmed By': r.confirmedBy })),
  }]);

  const exportStockVariancePdf = () => exportReportPdf({
    filename: 'Admin_StockVariance',
    title: 'Stock Variance Records',
    subtitle: 'Physical stock-count differences confirmed by branch admin',
    kpis: [
      { label: 'Total Variances', value: String(filteredVarianceRecords.length) },
      { label: 'Excess', value: String(excessVariance.length) },
      { label: 'Short', value: String(shortVariance.length) },
    ],
    sections: [{
      heading: 'Stock Variance Records',
      columns: [{ header: 'Date', width: 30 }, { header: 'Branch', width: 20 }, { header: 'Report', width: 25 }, { header: 'Item', width: 40 }, { header: 'System', width: 20, align: 'right' }, { header: 'Physical', width: 20, align: 'right' }, { header: 'Difference', width: 20, align: 'right' }, { header: 'Reported By', width: 30 }],
      rows: filteredVarianceRecords.map(r => [fmtDateTime(r.createdAt), r.branch, r.reportNo || '-', `${r.itemName}${r.unit ? ` (${r.unit})` : ''}`, String(r.systemQty), String(r.physicalQty), String(r.difference), r.reportedBy || '-']),
    }],
  });

  const StockVarianceTab = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <select value={varianceBranchFilter} onChange={e => setVarianceBranchFilter(e.target.value as Branch | 'all')} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none">
            <option value="all">All branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={varianceSearch} onChange={e => setVarianceSearch(e.target.value)} placeholder="Search item or report" className="rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none" />
          </div>
        </div>
        {/* AUDIT FIX (2026-09-04): stockVarianceRecords is a useBranchOpsStore
            field hydrated from branch_stock_variance_records via Zustand's
            persist storage — it only ever loads once, at store creation.
            persist.rehydrate() re-runs that same Supabase-backed hydration
            on demand. */}
        <button onClick={() => void useBranchOpsStore.persist.rehydrate()}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          <RefreshCw className="size-3.5" />Refresh
        </button>
        <button onClick={exportStockVarianceExcel}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
          <FileSpreadsheet className="size-3.5" /> Excel
        </button>
        <button onClick={exportStockVariancePdf}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
          <FileDown className="size-3.5" /> PDF
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total Variances" value={filteredVarianceRecords.length} icon={<AlertTriangle className="size-5" />} tone="slate" />
        <KpiCard label="Excess (Physical > System)" value={excessVariance.length} icon={<TrendingUp className="size-5" />} tone="blue" />
        <KpiCard label="Short (Physical < System)" value={shortVariance.length} icon={<TrendingDown className="size-5" />} tone={shortVariance.length > 0 ? 'red' : 'slate'} />
      </div>
      <Panel title="Stock Variance Records" subtitle="Physical stock-count differences confirmed by branch admin">
        {filteredVarianceRecords.length === 0 ? (
          <EmptyState label={stockVarianceRecords.length === 0 ? "No stock variance records yet. Differences appear after SNB Admin confirms a stock-count report." : "No records match current filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Report</th><th className="p-3">Item</th>
                  <th className="p-3 text-right">System</th><th className="p-3 text-right">Physical</th><th className="p-3 text-right">Difference</th>
                  <th className="p-3">Reported By</th><th className="p-3">Confirmed By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredVarianceRecords.slice(0, 300).map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{fmtDateTime(row.createdAt)}</td>
                    <td className="p-3"><BranchPill branch={row.branch} /></td>
                    <td className="p-3 font-bold">{row.reportNo}</td>
                    <td className="p-3 font-semibold">{row.itemName}</td>
                    <td className="p-3 text-right tabular-nums">{row.systemQty} {row.unit}</td>
                    <td className="p-3 text-right tabular-nums">{row.physicalQty} {row.unit}</td>
                    <td className="p-3 text-right"><Badge tone={row.difference > 0 ? 'blue' : row.difference < 0 ? 'red' : 'slate'}>{row.difference > 0 ? `+${row.difference}` : row.difference}</Badge></td>
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

  // CHANGE 12: Simplified AuditTab — shows only main details
  const AuditTab = (
    <div className="space-y-5">
      <Panel title="Admin Audit Logs" subtitle="Sensitive edits, stock changes, duplicate prints and closure actions"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              // AUDIT FIX (2026-09-04): this used to call the same
              // fetchBranchData/fetchStockMismatches pair as the page
              // header's own Refresh — neither one touches auditLogs at all
              // (it's a useBranchOpsStore field, hydrated from
              // branch_operation_records via Zustand's persist storage, not
              // fetchBranchData). The button looked like it refreshed this
              // tab's own data but never actually did. persist.rehydrate()
              // re-runs that same Supabase-backed hydration on demand — the
              // real "force a fresh pull" for audit logs.
              onClick={() => { refreshBranchAndStock(); void useBranchOpsStore.persist.rehydrate(); }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
              <RefreshCw className="size-3.5" />Refresh
            </button>
            <button onClick={() => exportWorkbook('Admin_AuditLogs', [{ name: 'Audit Logs', title: 'Admin Audit Logs', columns: [{ header: 'Time', key: 'Time', width: 18 }, { header: 'Branch', key: 'Branch' }, { header: 'User', key: 'User', width: 22 }, { header: 'Action', key: 'Action', width: 28 }], rows: filteredAuditLogs.map(l => ({ Time: fmtDateTime(l.createdAt), Branch: l.branch, User: l.user, Action: l.action })) }])}
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
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500"><th className="p-3">Time</th><th className="p-3">Branch</th><th className="p-3">User</th><th className="p-3">Action</th></tr></thead>
              <tbody className="divide-y">
                {filteredAuditLogs.slice(0, 150).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{fmtDateTime(log.createdAt)}</td>
                    <td className="p-3"><BranchPill branch={log.branch} /></td>
                    <td className="p-3 font-semibold">{log.user}</td>
                    <td className="p-3">{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  // Invoices Tab — uses the full AdminInvoicesTab so admin can view, approve and reject
  // Alerts Tab — no low stock
  const nonLowStockNotifications = useMemo(() =>
    adminNotifications.filter(n => n.type !== 'low_stock'),
    [adminNotifications]
  );
  const AlertsTab = (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total Alerts" value={nonLowStockNotifications.length} icon={<Bell className="size-5" />} tone="slate" />
        <KpiCard label="Unread" value={nonLowStockNotifications.filter(n => !n.isRead).length} icon={<AlertTriangle className="size-5" />} tone={nonLowStockNotifications.filter(n => !n.isRead).length > 0 ? 'red' : 'slate'} />
        <KpiCard label="Credit Alerts" value={nonLowStockNotifications.filter(n => n.type === 'credit_sale').length} icon={<WalletCards className="size-5" />} tone="amber" />
      </div>
      <Panel title="Business Alerts" subtitle="Credit, packing, invoice and operational alerts — low stock excluded"
        // AUDIT FIX (2026-09-04): adminNotifications only ever loads once, on
        // mount (loadAdminNotifications) — no manual refresh anywhere on this tab.
        action={
          <button onClick={() => void loadAdminNotifications()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
            <RefreshCw className="size-3.5" />Refresh
          </button>
        }>
        {nonLowStockNotifications.length === 0 ? <EmptyState label="No alerts. Credit sales, invoice and packing alerts will appear here." /> : (
          <div className="space-y-3">
            {nonLowStockNotifications.slice(0, 50).map(n => (
              <button type="button" key={n.id} onClick={() => { if (!n.isRead) void markRead(n.id); }} className={cn('w-full rounded-2xl border p-4 text-left transition', n.isRead ? 'border-slate-100 bg-slate-50' : 'border-amber-200 bg-amber-50 hover:bg-amber-100')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{n.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{n.body}</p>
                    <p className="mt-2 text-[10px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <Badge tone={n.isRead ? 'slate' : 'amber'}>{n.isRead ? 'Read' : 'Unread'}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );

  // Complaints Tab — from VRSNB and SNB admins
  const adminComplaints = useMemo(() =>
    (complaints || []).filter(c => ['VRSNB', 'SNB'].includes(c.branch))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [complaints]
  );
  const [complaintStatusUpdate, setComplaintStatusUpdate] = useState<Record<string, string>>({});
  const ComplaintsTab = (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total Complaints" value={adminComplaints.length} icon={<ClipboardList className="size-5" />} tone="slate" />
        <KpiCard label="Open" value={adminComplaints.filter(c => c.status === 'Open').length} icon={<AlertTriangle className="size-5" />} tone={adminComplaints.filter(c => c.status === 'Open').length > 0 ? 'red' : 'slate'} />
        <KpiCard label="In Review" value={adminComplaints.filter(c => c.status === 'In Review').length} icon={<ShieldCheck className="size-5" />} tone="amber" />
      </div>
      <Panel title="Branch Admin Complaints" subtitle="Complaints raised by VRSNB and SNB admins"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* AUDIT FIX (2026-09-04): complaints is a useBranchOpsStore field
                hydrated from branch_complaint_tickets via Zustand's persist
                storage — it only ever loads once, at store creation.
                persist.rehydrate() re-runs that same Supabase-backed
                hydration on demand. */}
            <button onClick={() => void useBranchOpsStore.persist.rehydrate()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
              <RefreshCw className="size-3.5" />Refresh
            </button>
            <button onClick={() => exportWorkbook('Admin_Complaints', [{ name: 'Complaints', title: 'Branch Admin Complaints', columns: [{ header: 'Branch', key: 'Branch' }, { header: 'Area', key: 'Area', width: 20 }, { header: 'Title', key: 'Title', width: 24 }, { header: 'Details', key: 'Details', width: 40 }, { header: 'Raised By', key: 'Raised By', width: 22 }, { header: 'Status', key: 'Status' }, { header: 'Date', key: 'Date', width: 14 }], rows: adminComplaints.map(c => ({ Branch: c.branch, Area: c.complaintArea, Title: c.title, Details: c.details, 'Raised By': c.raisedBy, Status: c.status, Date: fmtDate(c.createdAt) })) }])}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              <FileSpreadsheet className="size-3.5" /> Excel
            </button>
          </div>
        }>
        {adminComplaints.length === 0 ? <EmptyState label="No complaints from VRSNB or SNB admins yet." /> : (
          <div className="space-y-4">
            {adminComplaints.slice(0, 50).map(c => (
              <div key={c.id} className={cn('rounded-3xl border p-4', c.status === 'Open' ? 'border-red-200 bg-red-50' : c.status === 'In Review' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    <BranchPill branch={c.branch} />
                    <div>
                      <p className="text-sm font-black text-slate-900">{c.title}</p>
                      <p className="text-xs text-slate-500">{c.complaintArea} · Raised by {c.raisedBy} · {fmtDate(c.createdAt)}</p>
                    </div>
                  </div>
                  <Badge tone={c.status === 'Open' ? 'red' : c.status === 'In Review' ? 'amber' : 'green'}>{c.status}</Badge>
                </div>
                <p className="mt-3 text-sm text-slate-700">{c.details}</p>
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={complaintStatusUpdate[c.id] || c.status}
                    onChange={e => setComplaintStatusUpdate(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold outline-none">
                    <option value="Open">Open</option>
                    <option value="In Review">In Review</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                  <button
                    onClick={() => {
                      const newStatus = complaintStatusUpdate[c.id] || c.status;
                      if (newStatus !== c.status) {
                        updateComplaintStatus(c.id, newStatus as 'Open' | 'In Review' | 'Resolved', adminName);
                      }
                    }}
                    className="rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-black text-white">
                    Update
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );

  const filteredWasteLogs = useMemo(() => wasteLogs.filter(row => inRange(row.createdAt, fromDate, toDate)), [wasteLogs, fromDate, toDate]);

  const exportWastePdf = () => exportReportPdf({
    filename: `Admin_WasteLoss_${fromDate}_${toDate}`,
    title: 'Branch Waste & Loss',
    subtitle: `${fromDate} to ${toDate} · Confirmed dump, damage and transfer-out entries from all branches`,
    kpis: [{ label: 'Total Entries', value: String(filteredWasteLogs.length) }],
    sections: [{
      heading: 'Waste & Loss Log',
      columns: [{ header: 'Date', width: 35 }, { header: 'Branch', width: 20 }, { header: 'Type', width: 25 }, { header: 'Item', width: 40 }, { header: 'Quantity', width: 25, align: 'right' }, { header: 'Reason', width: 45 }, { header: 'Verified By', width: 30 }],
      rows: filteredWasteLogs.map(row => [fmtDateTime(row.createdAt), row.branch, row.logType, row.itemName, `${row.quantity} ${row.unit}`, row.reason || '-', row.verifiedBy || '-']),
    }],
  });

  const WasteTab = (
    <Panel title="Branch Waste & Loss" subtitle="Confirmed dump, damage and transfer-out entries from all branches"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {/* AUDIT FIX (2026-09-04): wasteLogs only ever re-fetched on a
              fromDate/toDate change — no manual refresh. */}
          <button
            onClick={() => void fetchWasteLogsNow()}
            disabled={wasteLogsLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={cn('size-3.5', wasteLogsLoading && 'animate-spin')} />Refresh
          </button>
          <button onClick={exportWastePdf} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><FileDown className="size-3.5" /> PDF</button>
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>{['Date', 'Branch', 'Type', 'Item', 'Quantity', 'Reason', 'Verified By'].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredWasteLogs.map(row => (
              <tr key={row.id} className="hover:bg-amber-50/50">
                <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-600">{fmtDateTime(row.createdAt)}</td>
                <td className="px-3 py-3"><BranchPill branch={row.branch as Branch} /></td>
                <td className="px-3 py-3 font-black text-slate-800">{row.logType}</td>
                <td className="px-3 py-3 font-black text-slate-950">{row.itemName}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black tabular-nums">{row.quantity} {row.unit}</td>
                <td className="px-3 py-3 text-slate-600">{row.reason}</td>
                <td className="px-3 py-3 font-bold text-slate-700">{row.verifiedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredWasteLogs.length === 0 && <p className="p-8 text-center text-sm font-bold text-slate-500">No branch waste recorded for this period.</p>}
      </div>
    </Panel>
  );

  // Attendance Tab — embeds the full AttendanceSalary page
  const AttendanceTab = (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-blue-50"><CalendarClock className="size-5 text-blue-600" /></div>
          <div>
            <p className="font-black text-slate-900">Staff Attendance & Payroll</p>
            <p className="text-xs text-slate-500">Manage attendance, calculate salaries and track advances for all staff</p>
          </div>
        </div>
      </div>
      <AttendanceSalary />
    </div>
  );

  const PublicOrdersTab = (
    <Panel title="Paid Online Orders" subtitle="Orders appear here only after Razorpay signature verification succeeds"
      // AUDIT FIX (2026-09-04): publicOrders only ever loads once, on mount
      // (loadPublicOrders) — no manual refresh anywhere on this tab.
      action={
        <button onClick={() => void loadPublicOrders()} disabled={publicOrdersLoading}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={cn('size-3.5', publicOrdersLoading && 'animate-spin')} />Refresh
        </button>
      }>
      {publicOrdersLoading ? <p className="p-8 text-center text-sm font-bold text-slate-500">Loading online orders…</p> : publicOrders.length === 0 ? <p className="p-8 text-center text-sm font-bold text-slate-500">No paid online orders yet.</p> : (
        <div className="space-y-3">{publicOrders.map(order => <article key={order.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-950">{order.order_number} · {order.customer_name}</p><p className="text-xs text-slate-500">{order.customer_phone} · {fmtDateTime(order.created_at)}</p></div><div className="text-right"><p className="font-black text-emerald-700">{formatCurrency(order.amount)}</p><Badge tone="green">{order.status}</Badge></div></div>
          <p className="mt-2 text-sm text-slate-700">{order.customer_address}</p><p className="text-xs text-slate-500">PIN: {order.location_pin}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{(order.items || []).map((item, idx) => <div key={idx} className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-black">{item.name}</span> × {item.qty}<span className="float-right font-bold">{formatCurrency(item.price * item.qty)}</span></div>)}</div>
          {order.notes && <p className="mt-2 text-xs text-slate-600">Note: {order.notes}</p>}
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Customer tracking status</p><p className="mt-1 text-xs font-bold text-slate-700">Changing this updates the customer tracking page immediately.</p></div>
            <select
              value={order.status}
              disabled={publicOrderUpdating === order.id}
              onChange={(event) => void updatePublicOrderStatus(order.id, event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 outline-none disabled:opacity-50"
            >
              {PUBLIC_ORDER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <p className="mt-2 text-[10px] font-bold text-slate-400">Payment ID: {order.payment_id || '—'} · Tax included: 3%</p>
        </article>)}</div>
      )}
    </Panel>
  );

  const activeContent: Record<AdminTab, ReactNode> = {
    'public-orders': PublicOrdersTab,
    wallet: <AdminWalletTab />,
    promotions: <AdminPromotionsTab />,
    overview: OverviewTab,
    cafe: CafeTab,
    branches: BranchesTab,
    hosur: HosurTab,
    'dispatch-details': <AdminDispatchDetailsTab />,
    items: ItemsTab,
    'daily-closure': DailyClosureTab,
    credits: CreditsTab,
    advance: AdvanceTab,
    'stock-disputes': StockDisputesTab,
    'stock-variance': StockVarianceTab,
    waste: WasteTab,
    audit: AuditTab,
    invoices: <AdminInvoicesTab />,
    'purchase-orders': <AdminPurchaseOrdersTab />,
    alerts: AlertsTab,
    complaints: ComplaintsTab,
    attendance: AttendanceTab,
  };

  const activeMeta = NAV_ITEMS.find(item => item.id === activeTab) || NAV_ITEMS[0];

  return (
    <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-5 xl:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={polling ? 'blue' : 'amber'}>{polling ? 'Auto refresh on' : 'Auto refresh off'}</Badge>
          </div>
          <h2 className="mt-1 font-display text-2xl font-black text-slate-950 sm:text-3xl">{activeMeta.label}</h2>
          <p className="mt-1 text-sm text-slate-500">{activeMeta.description}</p>
        </div>
        <button onClick={refreshBranchAndStock} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="size-3.5" />Refresh</button>
      </div>

      {!isAdmin && (
        <div className="mb-5 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Lock className="size-5 shrink-0" /> Admin-only actions are locked for this role. View-only monitoring remains available.
        </div>
      )}

      {activeContent[activeTab]}
    </main>
  );
}

export default AdminDashboard;
