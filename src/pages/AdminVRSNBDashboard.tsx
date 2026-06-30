// src/pages/AdminVRSNBDashboard.tsx
// VRSNB Admin Dashboard – manager control center for sales, returns, stock, purchase, balance, salesperson, closure and reports.
import {
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useBranchLedger } from "@/hooks/useBranchLedger";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useBranchStore, type CreditSale } from "@/branch/branchStore";
import {
  money,
  useBranchOpsStore,
  type PurchaseRecord,
  type SalespersonProfile,
} from "@/branch/branchOpsStore";
import { useBranchCatalogStore } from "@/stores/branchCatalogStore";
import { printHtml } from "@/branch/printUtils";
import { downloadExcel, downloadExcelWorkbook } from "@/lib/excelDownload";
import type { Branch } from "@/branch/types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Banknote,
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  IndianRupee,
  Landmark,
  LayoutDashboard,

  MessageSquareWarning,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

const BRANCH: Branch = "VRSNB";
const CHART_COLORS = [
  "#C5973E",
  "#10B981",
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
];
const CREDIT_BRANCHES: Branch[] = ["VRSNB"];
const CREDIT_BRANCH_LABEL: Record<Branch, string> = {
  Cafe: "Cafe / Biller",
  VRSNB: "VRSNB Branch",
  SNB: "SNB Branch",
  Hosur: "Hosur Branch",
};

type TabId =
  | "overview"
  | "sales"
  | "stock"
  | "expenses"
  | "complaints"
  | "waste"
  | "quotations"
  | "credit"
  | "cashier-report"
  | "cashier-closure"
  | "closure"
  | "reports"
  | "audit-stock"
  | "notifications";

const TABS: Array<{
  id: TabId;
  label: string;
  icon: ElementType;
  adminOnly?: boolean;
}> = [
  { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
  { id: "sales", label: "Sales & Returns", icon: Receipt },
  { id: "stock", label: "Low Stock / Stock", icon: Package },
  { id: "expenses", label: "Expenses", icon: WalletCards, adminOnly: true },
  { id: "complaints", label: "Complaints", icon: Bell, adminOnly: true },
  { id: "waste", label: "Waste Logs", icon: Trash2, adminOnly: true },
  { id: "quotations", label: "Quotations", icon: FileSpreadsheet, adminOnly: true },
  {
    id: "credit",
    label: "Credit",
    icon: CreditCard,
    adminOnly: true,
  },
  { id: "cashier-report", label: "Cashier Report", icon: BarChart3, adminOnly: true },
  { id: "cashier-closure", label: "Cashier Closure", icon: WalletCards, adminOnly: true },
  {
    id: "closure",
    label: "Daily Closure Report",
    icon: CalendarClock,
    adminOnly: true,
  },
  {
    id: "reports",
    label: "Branch Reports",
    icon: FileSpreadsheet,
    adminOnly: true,
  },
  {
    id: "audit-stock",
    label: "Stock Audit",
    icon: ClipboardCheck,
    adminOnly: true,
  },
  {
    id: "notifications",
    label: "Notifications & Alerts",
    icon: Bell,
    adminOnly: true,
  },
];

function dateInput(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(value: string) {
  const d = value ? new Date(`${value}T00:00:00`) : new Date(0);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value: string) {
  const d = value
    ? new Date(`${value}T23:59:59`)
    : new Date("2999-12-31T23:59:59");
  d.setHours(23, 59, 59, 999);
  return d;
}

function inRange(iso: string, fromDate: string, toDate: string) {
  const time = new Date(iso).getTime();
  return (
    time >= startOfDay(fromDate).getTime() && time <= endOfDay(toDate).getTime()
  );
}

function localDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useVRSNBCatalog() {
  const catalogue = useBranchCatalogStore((state) => state.items.VRSNB);
  return useMemo(() => catalogue.filter((item) => item.active), [catalogue]);
}

function normal(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeStockRows<T extends { itemName: string; quantity?: number; minThreshold?: number; updatedAt?: string; lastUpdatedAt?: string }>(rows: T[]) {
  const map = new Map<string, T>();
  [...rows].sort((a, b) => Number(new Date(a.updatedAt || a.lastUpdatedAt || 0)) - Number(new Date(b.updatedAt || b.lastUpdatedAt || 0))).forEach((row) => {
    const key = normal(row.itemName);
    // Duplicate rows for the same item are a data sync artifact, not separate
    // stock batches — keep the latest record instead of summing quantities
    // (summing was doubling stock numbers whenever an item appeared twice).
    map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function csvDownload(
  filename: string,
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
) {
  const base = filename.replace(/\.(csv|xlsx?|xls)$/i, "");
  const title = base.replace(/[_-]+/g, " ").trim() || "VRSNB Report";
  downloadExcel(`${base}.xls`, title, rows);
}

function amountForLegacyPayment(
  method: string | null,
  mode: "cash" | "upi" | "card" | "credit",
) {
  const m = (method || "").toLowerCase();
  if (mode === "cash") return m === "cash" || m.includes("cash");
  if (mode === "upi") return m === "upi" || m.includes("upi");
  if (mode === "card") return m === "card" || m.includes("card");
  return m === "credit";
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones = {
    slate: "bg-slate-50 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    purple: "bg-purple-50 text-purple-700 ring-purple-200",
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="absolute -right-6 -top-6 size-20 rounded-full bg-slate-950/5" />
      <div
        className={cn(
          "mb-3 flex size-10 items-center justify-center rounded-2xl ring-1",
          tones,
        )}
      >
        {icon}
      </div>
      <p className="text-2xl font-black tracking-tight text-slate-950 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      {sub && (
        <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
      )}
    </div>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              {icon}
            </div>
          )}
          <h2 className="text-base font-black text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-xs font-black uppercase tracking-wide text-slate-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100";
const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition active:scale-[0.98]";

function StatusBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "purple" | "slate";
}) {
  const cls = {
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function PaymentSplitCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "green" | "blue" | "purple" | "amber";
}) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    purple: "bg-purple-50 text-purple-700 ring-purple-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  }[tone];
  return (
    <div className={cn("rounded-3xl p-4 ring-1", cls)}>
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide opacity-80">
        {label}
        {icon}
      </div>
      <p className="mt-2 text-xl font-black tabular-nums">{money(value)}</p>
    </div>
  );
}

export default function AdminVRSNBDashboard() {
  const { currentUser } = useAuthStore();
  const catalogItems = useVRSNBCatalog();
  const { loadCatalog, subscribe } = useBranchCatalogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { stock, sales, creditSales: dbCreditSales, creditPayments: dbCreditPayments, fetchBranchData, fetchCreditPayments, manualUpdateStock } = useBranchStore();
  const {
    bills,
    returns,
    salespeople,
    purchases,
    purchasePayments,
    purchaseOrders,
    cashMovements,
    bankDeposits,
    cashierClosures,
    notifications,
    auditLogs,
    expenses,
    addSalesperson,
    updateSalesperson,
    removeSalesperson,
    addPurchase,
    addPurchasePayment,
    addPurchaseOrder,
    updatePoStatus,
    markPurchaseSynced,
    addBankDeposit,
    addCashierClosure,
    updateNotificationStatus,
    addAuditLog,
  } = useBranchOpsStore();

  const today = dateInput();
  const requestedTab = searchParams.get("tab") as TabId | null;
  const initialTab = requestedTab && TABS.some((item) => item.id === requestedTab) ? requestedTab : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [lowSearch, setLowSearch] = useState("");
  const [notice, setNotice] = useState("");
  const viewBranch: Branch = BRANCH;
  const viewBranchLabel = "VRSNB Branch";
  const adminLedger = useBranchLedger(fromDate, toDate, [viewBranch]);

  const userName =
    currentUser?.displayName || currentUser?.username || "VRSNB Admin";
  const role = currentUser?.role || "";
  const canManage = ["admin_vrsnb", "admin", "owner"].includes(role);
  const selectTab = (next: TabId) => {
    setTab(next);
    setSearchParams(next === "overview" ? {} : { tab: next });
  };

  useEffect(() => {
    const nextTab = requestedTab && TABS.some((item) => item.id === requestedTab) ? requestedTab : "overview";
    setTab((current) => current === nextTab ? current : nextTab);
  }, [requestedTab]);

  useEffect(() => {
    void loadCatalog('VRSNB');
    return subscribe('VRSNB');
  }, [loadCatalog, subscribe]);

  useEffect(() => {
    fetchBranchData(BRANCH);
    fetchCreditPayments(BRANCH);
  }, [fetchBranchData, fetchCreditPayments]);

  const branchStock = useMemo(() => {
    const catalogueNames = new Set(catalogItems.map((item) => normal(item.name)));
    return dedupeStockRows(stock[BRANCH] || []).filter((item) =>
      catalogueNames.has(normal(item.itemName)),
    );
  }, [stock, catalogItems]);
  const branchSalesRows = useMemo(() => sales[viewBranch] || [], [sales, viewBranch]);
  const branchBills = useMemo(
    () =>
      bills.filter(
        (b) => b.branch === viewBranch && inRange(b.createdAt, fromDate, toDate),
      ),
    [bills, fromDate, toDate, viewBranch],
  );
  const branchReturns = useMemo(
    () =>
      returns.filter(
        (r) => r.branch === viewBranch && inRange(r.createdAt, fromDate, toDate),
      ),
    [returns, fromDate, toDate, viewBranch],
  );
  const billedBillNos = useMemo(
    () =>
      new Set(bills.filter((b) => b.branch === viewBranch).map((b) => b.billNo)),
    [bills, viewBranch],
  );
  const legacySalesRows = useMemo(
    () =>
      branchSalesRows.filter(
        (s) =>
          inRange(s.soldAt, fromDate, toDate) &&
          (!s.billNo || !billedBillNos.has(s.billNo)),
      ),
    [branchSalesRows, fromDate, toDate, billedBillNos],
  );

  const grossFromBills = branchBills.reduce((sum, bill) => sum + bill.total, 0);
  const grossFromLegacy = legacySalesRows.reduce(
    (sum, row) => sum + (row.unitPrice ?? 0) * row.quantitySold,
    0,
  );
  const rawGrossSales = grossFromBills + grossFromLegacy;
  const returnAmount = branchReturns.reduce((sum, ret) => sum + ret.total, 0);
  const rawNetSales = Math.max(0, rawGrossSales - returnAmount);
  const rawBillsCount =
    branchBills.length +
    new Set(legacySalesRows.map((s) => s.billNo || s.id)).size;
  const rawAvgBillValue = rawBillsCount > 0 ? rawNetSales / rawBillsCount : 0;

  const cashSales =
    branchBills.reduce(
      (sum, b) =>
        sum +
        (b.paymentMode === "cash"
          ? b.total
          : b.paymentMode === "split"
            ? (b.split?.cash ?? 0)
            : 0),
      0,
    ) +
    legacySalesRows
      .filter((s) => amountForLegacyPayment(s.paymentMethod, "cash"))
      .reduce((sum, s) => sum + (s.unitPrice ?? 0) * s.quantitySold, 0);
  const upiSales =
    branchBills.reduce(
      (sum, b) =>
        sum +
        (b.paymentMode === "upi"
          ? b.total
          : b.paymentMode === "split"
            ? (b.split?.upi ?? 0)
            : 0),
      0,
    ) +
    legacySalesRows
      .filter((s) => amountForLegacyPayment(s.paymentMethod, "upi"))
      .reduce((sum, s) => sum + (s.unitPrice ?? 0) * s.quantitySold, 0);
  const cardSales =
    branchBills.reduce(
      (sum, b) =>
        sum +
        (b.paymentMode === "card"
          ? b.total
          : b.paymentMode === "split"
            ? (b.split?.card ?? 0)
            : 0),
      0,
    ) +
    legacySalesRows
      .filter((s) => amountForLegacyPayment(s.paymentMethod, "card"))
      .reduce((sum, s) => sum + (s.unitPrice ?? 0) * s.quantitySold, 0);
  const creditBillAmount =
    branchBills
      .filter((b) => b.paymentMode === "credit")
      .reduce((sum, b) => sum + b.total, 0) +
    legacySalesRows
      .filter((s) => amountForLegacyPayment(s.paymentMethod, "credit"))
      .reduce((sum, s) => sum + (s.unitPrice ?? 0) * s.quantitySold, 0);
  const ledgerRows = adminLedger.closureRows.filter((row) => row.branch === viewBranch);
  const hasLedgerRows = ledgerRows.length > 0;
  const ledgerGrossSales = ledgerRows.reduce(
    (sum, row) => sum + Math.max(
      0,
      adminLedger.toNumber(row.sales_total)
        - adminLedger.toNumber(row.advance_collected)
        - adminLedger.toNumber(row.advance_balance_collected),
    ),
    0,
  );
  const ledgerCashSales = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.cash_total), 0);
  const ledgerUpiSales = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.upi_total), 0);
  const ledgerCardSales = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.card_total), 0);
  const ledgerCreditBillAmount = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.credit_billed), 0);
  const ledgerBillsCount = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.bill_count), 0);
  const ledgerAdvanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_collected), 0);
  const ledgerAdvanceBalanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_balance_collected), 0);
  const grossSales = hasLedgerRows ? ledgerGrossSales : rawGrossSales;
  const netSales = Math.max(0, grossSales - returnAmount);
  const billsCount = hasLedgerRows ? ledgerBillsCount : rawBillsCount;
  const avgBillValue = billsCount > 0 ? grossSales / billsCount : rawAvgBillValue;
  const finalCashSales = hasLedgerRows ? ledgerCashSales : cashSales;
  const finalUpiSales = hasLedgerRows ? ledgerUpiSales : upiSales;
  const finalCardSales = hasLedgerRows ? ledgerCardSales : cardSales;
  const finalCreditBillAmount = hasLedgerRows ? ledgerCreditBillAmount : creditBillAmount;
  const advanceCollectionsFallback = cashMovements
    .filter(
      (m) =>
        m.branch === viewBranch &&
        inRange(m.dateTime, fromDate, toDate) &&
        m.direction === "in" &&
        /advance/i.test(m.purpose || ""),
    )
    .reduce((sum, m) => sum + m.amount, 0);
  const advanceCollected = hasLedgerRows ? ledgerAdvanceCollected : advanceCollectionsFallback;
  const advanceBalanceCollected = hasLedgerRows ? ledgerAdvanceBalanceCollected : 0;
  const transparentGrossSales = hasLedgerRows ? ledgerGrossSales : rawGrossSales;
  const salesBreakdown = {
    billSales: transparentGrossSales,
    advanceCollected,
    advanceBalanceCollected,
    creditBilled: finalCreditBillAmount,
    creditCollected: 0,
    returns: returnAmount,
    expenses: 0,
    netSales,
    totalCollections:
      finalCashSales +
      finalUpiSales +
      finalCardSales +
      (hasLedgerRows ? 0 : advanceCollected + advanceBalanceCollected),
  };

  const lowStockRows = useMemo(() => {
    const query = lowSearch.trim().toLowerCase();
    return branchStock
      .filter((item) => item.quantity <= (item.minThreshold ?? 10))
      .filter((item) => !query || item.itemName.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          a.quantity -
          (a.minThreshold ?? 10) -
          (b.quantity - (b.minThreshold ?? 10)),
      );
  }, [branchStock, lowSearch]);

  const movementRows = useMemo(
    () => cashMovements.filter((m) => m.branch === viewBranch),
    [cashMovements, viewBranch],
  );
  const movementInRange = useMemo(
    () => movementRows.filter((m) => inRange(m.dateTime, fromDate, toDate)),
    [movementRows, fromDate, toDate],
  );
  const balanceByMode = (mode: "cash" | "upi" | "card" | "bank") =>
    movementInRange
      .filter((m) => m.paymentMode === mode)
      .reduce(
        (sum, m) => sum + (m.direction === "in" ? m.amount : -m.amount),
        0,
      );
  // Money deposited to the owner's bank account has left the branch's
  // control entirely — it is NOT cash the admin still holds. This total is
  // for record-keeping only and must never be added back into "available"
  // funds at the branch.
  // Bank balance is the total actually deposited. Do not combine it with
  // the matching cash-movement outflow, otherwise Bank Transfer deposits
  // cancel themselves and show an incorrect zero/negative balance.
  const bankBalance = bankDeposits
    .filter((d) => d.branch === viewBranch && inRange(d.createdAt, fromDate, toDate))
    .reduce((sum, d) => sum + d.amount, 0);
  const cashBalance = balanceByMode("cash");
  const upiBalance = balanceByMode("upi");
  const cardBalance = balanceByMode("card");
  const expenseAmount = expenses
    .filter((e) => e.branch === viewBranch && inRange(`${e.expenseDate}T12:00:00`, fromDate, toDate))
    .reduce((sum, e) => sum + e.amount, 0);

  const scopedCredits = dbCreditSales[viewBranch] || [];
  const scopedCreditPayments = dbCreditPayments[viewBranch] || [];
  const pendingCredit = scopedCredits.filter((c) => c.status !== "settled").reduce((sum, c) => sum + c.creditAmount, 0);
  const creditPaymentsInRange = scopedCreditPayments.filter((p) => inRange(p.createdAt, fromDate, toDate));
  const clearedCredit = creditPaymentsInRange.reduce((sum, p) => sum + p.amount, 0);
  salesBreakdown.creditCollected = clearedCredit;
  salesBreakdown.expenses = expenseAmount;
  const purchasePaymentsInRange = purchasePayments.filter(
    (p) => p.branch === viewBranch && inRange(p.createdAt, fromDate, toDate),
  );
  const purchasePaid = purchasePaymentsInRange.reduce((sum, p) => sum + p.amount, 0);
  const purchaseCashPaid = purchasePaymentsInRange
    .filter((p) => p.mode === "cash")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositsInRange = bankDeposits.filter(
    (d) => d.branch === viewBranch && inRange(d.createdAt, fromDate, toDate),
  );
  const depositAmount = depositsInRange.reduce((sum, d) => sum + d.amount, 0);

  const chartData = useMemo(() => {
    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);
    const days: Array<{
      key: string;
      date: string;
      grossSales: number;
      returnAmount: number;
      netSales: number;
    }> = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime() && days.length < 45) {
      const key = dateInput(cursor);
      days.push({
        key,
        date: cursor.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        grossSales: 0,
        returnAmount: 0,
        netSales: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    branchBills.forEach((b) => {
      const row = byKey.get(localDateKey(b.createdAt));
      if (row) row.grossSales += b.total;
    });
    legacySalesRows.forEach((s) => {
      const row = byKey.get(localDateKey(s.soldAt));
      if (row) row.grossSales += (s.unitPrice ?? 0) * s.quantitySold;
    });
    branchReturns.forEach((r) => {
      const row = byKey.get(localDateKey(r.createdAt));
      if (row) row.returnAmount += r.total;
    });
    days.forEach((d) => {
      d.netSales = Math.max(0, d.grossSales - d.returnAmount);
    });
    return days;
  }, [fromDate, toDate, branchBills, legacySalesRows, branchReturns]);

  const topItems = useMemo(() => {
    const map = new Map<
      string,
      { gross: number; qty: number; returns: number; net: number }
    >();
    branchBills.forEach((bill) =>
      bill.items.forEach((item) => {
        const row = map.get(item.itemName) ?? {
          gross: 0,
          qty: 0,
          returns: 0,
          net: 0,
        };
        row.gross += item.lineTotal;
        row.qty += item.quantity;
        map.set(item.itemName, row);
      }),
    );
    legacySalesRows.forEach((sale) => {
      const row = map.get(sale.itemName) ?? {
        gross: 0,
        qty: 0,
        returns: 0,
        net: 0,
      };
      row.gross += (sale.unitPrice ?? 0) * sale.quantitySold;
      row.qty += sale.quantitySold;
      map.set(sale.itemName, row);
    });
    branchReturns.forEach((ret) =>
      ret.items.forEach((item) => {
        const row = map.get(item.itemName) ?? {
          gross: 0,
          qty: 0,
          returns: 0,
          net: 0,
        };
        row.returns += item.lineTotal;
        map.set(item.itemName, row);
      }),
    );
    return [...map.entries()]
      .map(([name, value]) => ({
        name: name.length > 24 ? `${name.slice(0, 24)}…` : name,
        ...value,
        net: Math.max(0, value.gross - value.returns),
      }))
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);
  }, [branchBills, legacySalesRows, branchReturns]);

  const salespersonRows = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        grossSales: number;
        returns: number;
        netSales: number;
        bills: number;
        cash: number;
        upi: number;
        card: number;
      }
    >();
    branchBills.forEach((bill) => {
      const row = map.get(bill.salesperson) ?? {
        name: bill.salesperson,
        grossSales: 0,
        returns: 0,
        netSales: 0,
        bills: 0,
        cash: 0,
        upi: 0,
        card: 0,
      };
      row.grossSales += bill.total;
      row.bills += 1;
      row.cash +=
        bill.paymentMode === "cash"
          ? bill.total
          : bill.paymentMode === "split"
            ? (bill.split?.cash ?? 0)
            : 0;
      row.upi +=
        bill.paymentMode === "upi"
          ? bill.total
          : bill.paymentMode === "split"
            ? (bill.split?.upi ?? 0)
            : 0;
      row.card +=
        bill.paymentMode === "card"
          ? bill.total
          : bill.paymentMode === "split"
            ? (bill.split?.card ?? 0)
            : 0;
      map.set(bill.salesperson, row);
    });
    legacySalesRows.forEach((sale) => {
      const row = map.get(sale.soldBy) ?? {
        name: sale.soldBy,
        grossSales: 0,
        returns: 0,
        netSales: 0,
        bills: 0,
        cash: 0,
        upi: 0,
        card: 0,
      };
      const line = (sale.unitPrice ?? 0) * sale.quantitySold;
      row.grossSales += line;
      row.bills += 1;
      if (amountForLegacyPayment(sale.paymentMethod, "cash")) row.cash += line;
      if (amountForLegacyPayment(sale.paymentMethod, "upi")) row.upi += line;
      if (amountForLegacyPayment(sale.paymentMethod, "card")) row.card += line;
      map.set(sale.soldBy, row);
    });
    branchReturns.forEach((ret) => {
      const original = bills.find(
        (b) => b.billNo === ret.originalBillNo && b.branch === BRANCH,
      );
      const person = original?.salesperson || ret.returnedBy;
      const row = map.get(person) ?? {
        name: person,
        grossSales: 0,
        returns: 0,
        netSales: 0,
        bills: 0,
        cash: 0,
        upi: 0,
        card: 0,
      };
      row.returns += ret.total;
      map.set(person, row);
    });
    return [...map.values()]
      .map((row) => ({
        ...row,
        netSales: Math.max(0, row.grossSales - row.returns),
        avgBillValue:
          row.bills > 0
            ? Math.max(0, row.grossSales - row.returns) / row.bills
            : 0,
      }))
      .sort((a, b) => b.netSales - a.netSales);
  }, [branchBills, legacySalesRows, branchReturns, bills]);

  const paymentPie = [
    { name: "Cash", value: finalCashSales, color: CHART_COLORS[1] },
    { name: "UPI", value: finalUpiSales, color: CHART_COLORS[3] },
    { name: "Card", value: finalCardSales, color: CHART_COLORS[4] },
    { name: "Credit", value: finalCreditBillAmount, color: CHART_COLORS[0] },
  ].filter((row) => row.value > 0);

  const scopedTabs = TABS.filter(
    (item) => !item.adminOnly || canManage,
  );
  const unreadNotifications = notifications.filter(
    (n) => n.branch === BRANCH && n.status === "Unread",
  ).length;
  const pendingSync = purchases.filter(
    (p) =>
      p.branch === BRANCH && !(p.syncedToStock || p.syncStatus === "Synced"),
  ).length;
  const pendingPO = purchaseOrders.filter(
    (p) =>
      p.branch === BRANCH &&
      !["Received", "Closed", "Cancelled", "Rejected"].includes(p.status),
  ).length;

  const commonProps = {
    reportBranch: viewBranch,
    reportLabel: viewBranchLabel,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    canManage,
    userName,
    branchStock,
    grossSales,
    returnAmount,
    netSales,
    billsCount,
    avgBillValue,
    cashSales: finalCashSales,
    upiSales: finalUpiSales,
    cardSales: finalCardSales,
    creditBillAmount: finalCreditBillAmount,
    lowStockRows,
    branchBills,
    branchReturns,
    legacySalesRows,
    topItems,
    chartData,
    paymentPie,
    salespersonRows,
    cashBalance,
    upiBalance,
    cardBalance,
    bankBalance,
    expenseAmount,
    advanceCollected,
    advanceBalanceCollected,
    salesBreakdown,
    pendingCredit,
    clearedCredit,
    creditPaymentsInRange,
    purchasePaid,
    depositAmount,
    movementInRange,
    notice,
    setNotice,
  };

  if (!canManage) {
    return (
      <div className="p-4">
        <Panel
          title="Access restricted"
          icon={<ShieldCheck className="size-4" />}
        >
          <p className="font-semibold text-slate-600">
            VRSNB Admin Dashboard is restricted to VRSNB Admin, Admin, and Owner
            roles.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <main className="min-w-0 space-y-4 px-4 py-5 sm:px-6 xl:px-8">
      <div className="flex items-center justify-between rounded-[2rem] bg-slate-950 p-3 text-white shadow-lg">
        <div><p className="text-xs font-black uppercase tracking-wider text-white/50">Admin Data View</p><p className="text-sm font-bold">Showing {viewBranchLabel} data only</p></div>
        <span className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-black">Branch Scoped</span>
      </div>
      {!["stock", "quotations"].includes(tab) && (
        <DateFilters
          fromDate={fromDate}
          toDate={toDate}
          setFromDate={setFromDate}
          setToDate={setToDate}
        />
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {tab === "overview" && <OverviewTab {...commonProps} />}
      {tab === "sales" && <SalesReturnsTab {...commonProps} />}
      {tab === "stock" && (
        <StockTab
          lowStockOpen={lowStockOpen}
          setLowStockOpen={setLowStockOpen}
          lowSearch={lowSearch}
          setLowSearch={setLowSearch}
          {...commonProps}
        />
      )}
      {tab === "expenses" && <ExpensesTab userName={userName} {...commonProps} />}
      {tab === "complaints" && <ComplaintsTab userName={userName} />}
      {tab === "waste" && <WasteLogsTab userName={userName} />}
      {tab === "quotations" && <QuotationsTab userName={userName} />}
      {tab === "credit" && <CreditTab fromDate={fromDate} toDate={toDate} />}
      {tab === "cashier-report" && <CashierReportTab {...commonProps} />}
      {tab === "cashier-closure" && <CashierClosureTab userName={userName} {...commonProps} />}
      {tab === "closure" && (
        <DailyClosureTab userName={userName} {...commonProps} />
      )}
      {tab === "reports" && <ReportsTab {...commonProps} />}
      {tab === "audit-stock" && (
        <StockAuditTab
          userName={userName}
          branchStock={branchStock}
          manualUpdateStock={manualUpdateStock}
          fetchBranchData={fetchBranchData}
          setNotice={setNotice}
        />
      )}
      {tab === "notifications" && <NotificationsTab userName={userName} />}
    </main>
  );
}

function HeroPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "red" | "green" | "blue";
}) {
  const cls =
    tone === "red"
      ? "text-red-200"
      : tone === "green"
        ? "text-emerald-200"
        : tone === "blue"
          ? "text-blue-200"
          : "text-white";
  return (
    <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
      <p className="text-[10px] font-black uppercase tracking-wide text-white/50">
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-black tabular-nums", cls)}>{value}</p>
    </div>
  );
}

function DateFilters({
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}: {
  fromDate: string;
  toDate: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
}) {
  const today = dateInput();
  const seven = new Date();
  seven.setDate(seven.getDate() - 6);
  const thirty = new Date();
  thirty.setDate(thirty.getDate() - 29);
  const isToday = fromDate === today && toDate === today;
  const isSeven = fromDate === dateInput(seven) && toDate === today;
  const isThirty = fromDate === dateInput(thirty) && toDate === today;
  const quickCls = (active: boolean) =>
    cn(
      btnCls,
      "self-end ring-1",
      active
        ? "bg-orange-500 text-white shadow-lg shadow-orange-200 ring-orange-500"
        : "bg-white text-slate-700 ring-slate-200",
    );
  return (
    <Panel title="Filters" icon={<Filter className="size-4" />}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
        <Field label="From Date">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="To Date">
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <button
          className={quickCls(isToday)}
          onClick={() => {
            const t = dateInput();
            setFromDate(t);
            setToDate(t);
          }}
        >
          Today
        </button>
        <button
          className={quickCls(isSeven)}
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - 6);
            setFromDate(dateInput(d));
            setToDate(dateInput());
          }}
        >
          7 Days
        </button>
        <button
          className={quickCls(isThirty)}
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - 29);
            setFromDate(dateInput(d));
            setToDate(dateInput());
          }}
        >
          30 Days
        </button>
      </div>
    </Panel>
  );
}

function printOverview(props: any, branchLabel: string) {
  const rows = [
    ["Date Range", `${props.fromDate} to ${props.toDate}`],
    ["Bills", props.billsCount],
    ["Gross Sales", money(props.grossSales)],
    ["Return Amount", money(props.returnAmount)],
    ["Net Sales", money(props.netSales)],
    ["Average Bill", money(props.avgBillValue)],
    ["—", "—"],
    ["Regular Bill Sales", money(props.salesBreakdown.billSales)],
    ["Advance Collected", money(props.salesBreakdown.advanceCollected)],
    ["Advance Balance Collected", money(props.salesBreakdown.advanceBalanceCollected)],
    ["Credit Billed", money(props.salesBreakdown.creditBilled)],
    ["Credit Collected", money(props.salesBreakdown.creditCollected)],
    ["Expenses", money(props.expenseAmount)],
    ["—", "—"],
    ["Cash Collected", money(props.cashSales)],
    ["UPI Collected", money(props.upiSales)],
    ["Card Collected", money(props.cardSales)],
    ["Credit Billed", money(props.creditBillAmount)],
    ["—", "—"],
    ["Cash Available", money(props.cashBalance)],
    ["UPI Available", money(props.upiBalance)],
    ["Card Available", money(props.cardBalance)],
    ["Deposited to Owner (Not Available)", money(props.bankBalance)],
  ];
  const body = `<div class="stamp">BRANCH OVERVIEW REPORT</div><h2 class="c">${branchLabel}</h2><div class="c" style="margin-bottom:8px">Generated by ${props.userName} on ${new Date().toLocaleString("en-IN")}</div>${rows
    .map(([label, value]) =>
      label === "—"
        ? `<div class="dash"></div>`
        : `<div class="row"><span>${label}</span><b>${value}</b></div>`,
    )
    .join("")}`;
  printHtml(`${branchLabel} Overview Report`, body);
}

function RupeeBreakdown({ breakdown }: { breakdown: any }) {
  const rows = [
    ["Regular bill sales", breakdown.billSales],
    ["Advance amount collected", breakdown.advanceCollected],
    ["Advance balance collected", breakdown.advanceBalanceCollected],
    ["Credit billed", breakdown.creditBilled],
    ["Credit collected", breakdown.creditCollected],
    ["Returns deducted", -breakdown.returns],
    ["Expenses deducted", -breakdown.expenses],
    ["Net sales shown", breakdown.netSales],
  ];
  return (
    <Panel title="Rupee Source Breakdown" icon={<IndianRupee className="size-4" />}>
      <div className="grid gap-2 md:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className={cn("mt-1 text-lg font-black tabular-nums", Number(value) < 0 ? "text-red-600" : "text-slate-950")}>
              {money(Number(value))}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OverviewTab(props: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => printOverview(props, props.reportLabel || "VRSNB Branch")}
          className={cn(btnCls, "bg-slate-950 text-white")}
        >
          <Printer className="size-4" />
          Print Overview
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Gross Sales"
          value={money(props.grossSales)}
          sub="Before returns"
          icon={<IndianRupee className="size-5" />}
          tone="amber"
        />
        <Kpi
          label="Return Amount"
          value={money(props.returnAmount)}
          sub="Deducted from sales"
          icon={<RotateCcw className="size-5" />}
          tone="red"
        />
        <Kpi
          label="Net Sales"
          value={money(props.netSales)}
          sub="Gross Sales - Total Returns"
          icon={<IndianRupee className="size-5" />}
          tone="green"
        />
        <Kpi
          label="Average Bill"
          value={money(props.avgBillValue)}
          sub={`${props.billsCount} bill entries`}
          icon={<Receipt className="size-5" />}
          tone="blue"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
        <Panel
          title="Gross / Returns / Net Sales Trend"
          icon={<Activity className="size-4" />}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={props.chartData}>
                <defs>
                  <linearGradient id="netSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `₹${Number(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    money(Number(v)),
                    name === "grossSales"
                      ? "Gross Sales"
                      : name === "returnAmount"
                        ? "Return Amount"
                        : "Net Sales",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="grossSales"
                  stroke="#C5973E"
                  fill="transparent"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="returnAmount"
                  stroke="#EF4444"
                  fill="transparent"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="netSales"
                  stroke="#10B981"
                  fill="url(#netSalesFill)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Collections by Payment Mode" icon={<CreditCard className="size-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <PaymentSplitCard
              label="Cash Collected"
              value={props.cashSales}
              icon={<Banknote className="size-4" />}
              tone="green"
            />
            <PaymentSplitCard
              label="UPI Collected"
              value={props.upiSales}
              icon={<Smartphone className="size-4" />}
              tone="blue"
            />
            <PaymentSplitCard
              label="Card Collected"
              value={props.cardSales}
              icon={<CreditCard className="size-4" />}
              tone="purple"
            />
            <PaymentSplitCard
              label="Credit Billed"
              value={props.creditBillAmount}
              icon={<WalletCards className="size-4" />}
              tone="amber"
            />
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Top Items by Net Sales"
          icon={<PackageCheck className="size-4" />}
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={props.topItems} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `₹${Number(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => money(Number(v))} />
                <Bar dataKey="net" fill="#C5973E" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Balance Snapshot"
          icon={<WalletCards className="size-4" />}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              label="Cash Available"
              value={money(props.cashBalance)}
              icon={<Banknote className="size-5" />}
              tone="green"
            />
            <Kpi
              label="UPI Available"
              value={money(props.upiBalance)}
              icon={<Smartphone className="size-5" />}
              tone="blue"
            />
            <Kpi
              label="Card Available"
              value={money(props.cardBalance)}
              icon={<CreditCard className="size-5" />}
              tone="purple"
            />
            <Kpi
              label="Deposited to Owner (Not Available)"
              value={money(props.bankBalance)}
              icon={<Landmark className="size-5" />}
              tone="slate"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SalesReturnsTab(props: any) {
  const salesRows = [
    ...props.branchBills.map((b: any) => ({
      type: "Sale",
      no: b.billNo,
      date: b.createdAt,
      customer: b.creditCustomerName || "-",
      person: b.salesperson,
      gross: b.total,
      returns: 0,
      net: b.total,
      payment: b.paymentMode,
    })),
    ...props.legacySalesRows.map((s: any) => ({
      type: "Sale",
      no: s.billNo || s.id,
      date: s.soldAt,
      customer: "-",
      person: s.soldBy,
      gross: (s.unitPrice ?? 0) * s.quantitySold,
      returns: 0,
      net: (s.unitPrice ?? 0) * s.quantitySold,
      payment: s.paymentMethod || "-",
    })),
    ...props.branchReturns.map((r: any) => ({
      type: "Return",
      no: r.returnNo,
      date: r.createdAt,
      customer: r.originalBillNo,
      person: r.returnedBy,
      gross: 0,
      returns: r.total,
      net: -r.total,
      payment: "refund",
    })),
    ...(props.movementInRange || [])
      .filter((m: any) => m.direction === "in" && /advance/i.test(m.purpose || ""))
      .map((m: any) => ({
        type: "Advance",
        no: m.referenceNumber || "-",
        date: m.dateTime,
        customer: m.remarks || "-",
        person: m.enteredBy,
        gross: m.amount,
        returns: 0,
        net: m.amount,
        payment: m.paymentMode,
      })),
    ...(props.creditPaymentsInRange || []).map((p: any) => ({
      type: "Credit Collected",
      no: p.billNo,
      date: p.createdAt,
      customer: p.remarks || "-",
      person: p.collectedBy,
      gross: p.amount,
      returns: 0,
      net: p.amount,
      payment: p.paymentMode,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Gross Sales"
          value={money(props.grossSales)}
          icon={<Receipt className="size-5" />}
          tone="amber"
        />
        <Kpi
          label="Return Amount"
          value={money(props.returnAmount)}
          icon={<RotateCcw className="size-5" />}
          tone="red"
        />
        <Kpi
          label="Net Sales"
          value={money(props.netSales)}
          icon={<IndianRupee className="size-5" />}
          tone="green"
        />
        <Kpi
          label="Advance Collected"
          value={money(props.salesBreakdown.advanceCollected + props.salesBreakdown.advanceBalanceCollected)}
          icon={<WalletCards className="size-5" />}
          tone="blue"
        />
        <Kpi
          label="Credit Collected"
          value={money(props.salesBreakdown.creditCollected)}
          icon={<CreditCard className="size-5" />}
          tone="purple"
        />
      </div>
      <RupeeBreakdown breakdown={props.salesBreakdown} />
      <Panel
        title="Sales and Returns Log"
        icon={<History className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload(
                `VRSNB_Sales_Returns_${dateInput()}.xls`,
                salesRows.map((r) => ({
                  Type: r.type,
                  Number: r.no,
                  Date: fmtDateTime(r.date),
                  Person: r.person,
                  GrossSales: r.gross,
                  ReturnAmount: r.returns,
                  NetSales: r.net,
                  Payment: r.payment,
                })),
              )
            }
          >
            <Download className="size-4" />
            Export
          </button>
        }
      >
        <DataTable
          headers={[
            "Type",
            "No",
            "Date",
            "Person",
            "Gross Sales",
            "Return Amount",
            "Net Sales",
            "Payment",
          ]}
          rows={salesRows.map((r) => [
            <StatusBadge
              key="t"
              tone={
                r.type === "Return"
                  ? "red"
                  : r.type === "Advance"
                    ? "blue"
                    : r.type === "Credit Collected"
                      ? "amber"
                      : "green"
              }
            >
              {r.type}
            </StatusBadge>,
            r.no,
            fmtDateTime(r.date),
            r.person,
            money(r.gross),
            money(r.returns),
            <span
              key="n"
              className={cn(
                "font-black",
                r.net < 0 ? "text-red-600" : "text-emerald-700",
              )}
            >
              {money(r.net)}
            </span>,
            String(r.payment).toUpperCase(),
          ])}
          empty="No sales or return records for selected date range."
        />
      </Panel>
    </div>
  );
}

function StockTab(props: any) {
  const catalogItems = useVRSNBCatalog();
  const [stockSearch, setStockSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [unit, setUnit] = useState("All");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const categories = useMemo(() => Array.from(new Set(catalogItems.map((item) => item.category || "Uncategorized"))).sort(), [catalogItems]);
  const units = useMemo(() => Array.from(new Set(props.branchStock.map((item: any) => item.unit || catalogItems.find((catalog) => normal(catalog.name) === normal(item.itemName))?.uom || "pcs"))).sort(), [props.branchStock, catalogItems]);
  const enrichedRows = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    return props.branchStock
      .map((item: any) => {
        const catalog = catalogItems.find((candidate) => normal(candidate.name) === normal(item.itemName));
        const current = Number(item.quantity || 0);
        const minimum = Number(item.minThreshold ?? 10);
        const shortage = Math.max(0, minimum - current);
        const rowStatus = current <= 0 ? "Out of Stock" : current <= minimum * 0.5 ? "Critical" : current <= minimum ? "Low" : "OK";
        const rowUnit = item.unit || catalog?.uom || "pcs";
        const price = Number(item.price ?? catalog?.price ?? 0);
        return {
          ...item,
          category: catalog?.category || "Uncategorized",
          unit: rowUnit,
          price,
          stockValue: Math.max(0, current) * price,
          current,
          minimum,
          shortage,
          status: rowStatus,
          reorder: shortage > 0 ? Math.max(shortage, minimum) : 0,
          lastChange: item.lastUpdatedAt || item.updatedAt || "",
        };
      })
      .filter((item: any) => !query || item.itemName.toLowerCase().includes(query) || String(item.itemBarcode || "").includes(query))
      .filter((item: any) => category === "All" || item.category === category)
      .filter((item: any) => status === "All" || item.status === status)
      .filter((item: any) => unit === "All" || item.unit === unit)
      .filter((item: any) => minQty === "" || item.current >= Number(minQty))
      .filter((item: any) => maxQty === "" || item.current <= Number(maxQty))
      .sort((a: any, b: any) => a.status.localeCompare(b.status) || a.itemName.localeCompare(b.itemName));
  }, [props.branchStock, catalogItems, stockSearch, category, status, unit, minQty, maxQty]);
  const stockValue = enrichedRows.reduce((sum: number, item: any) => sum + item.stockValue, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Total Stock Items"
          value={enrichedRows.length}
          icon={<Package className="size-5" />}
        />
        <Kpi
          label="Low Stock Alerts"
          value={enrichedRows.filter((item: any) => item.status !== "OK").length}
          icon={<AlertTriangle className="size-5" />}
          tone={enrichedRows.some((item: any) => item.status !== "OK") ? "red" : "green"}
        />
        <Kpi
          label="Stock Value"
          value={money(stockValue)}
          icon={<Database className="size-5" />}
          tone="blue"
        />
      </div>
      <Panel title="Stock Register" icon={<Package className="size-4" />}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(120px,1fr))]">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2">
            <Search className="size-4 text-slate-400" />
            <input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Search item or barcode" className="w-full bg-transparent text-sm font-black outline-none" />
          </div>
          <select className={inputCls} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All</option>
            {categories.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className={inputCls} value={status} onChange={(event) => setStatus(event.target.value)}>
            {["All", "OK", "Low", "Critical", "Out of Stock"].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className={inputCls} value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option>All</option>
            {units.map((value: string) => <option key={value}>{value}</option>)}
          </select>
          <input className={inputCls} type="number" min="0" placeholder="Min qty" value={minQty} onChange={(event) => setMinQty(event.target.value)} />
          <input className={inputCls} type="number" min="0" placeholder="Max qty" value={maxQty} onChange={(event) => setMaxQty(event.target.value)} />
        </div>
        <div className="mt-3">
          <DataTable
            headers={["Item", "Category", "Barcode", "Current", "Minimum", "Shortage", "Unit", "Value", "Status", "Reorder Suggestion", "Last Change"]}
            rows={enrichedRows.map((item: any) => [
              item.itemName,
              item.category,
              item.itemBarcode || "-",
              <span key="q" className="font-black tabular-nums">{item.current}</span>,
              item.minimum,
              item.shortage ? <span key="s" className="font-black text-red-600">{item.shortage}</span> : "-",
              item.unit,
              money(item.stockValue),
              <StatusBadge key="status" tone={item.status === "OK" ? "green" : item.status === "Low" ? "amber" : "red"}>{item.status}</StatusBadge>,
              item.reorder ? `${item.reorder} ${item.unit}` : "-",
              item.lastChange ? fmtDateTime(item.lastChange) : "-",
            ])}
            empty="No stock items match the selected filters."
          />
        </div>
      </Panel>
      <Panel
        title="Low Stock Alerts"
        icon={<AlertTriangle className="size-4" />}
        action={
          <button
            className={cn(
              btnCls,
              "bg-white text-slate-700 ring-1 ring-slate-200",
            )}
            onClick={() => props.setLowStockOpen((v: boolean) => !v)}
          >
            <ChevronDown
              className={cn(
                "size-4 transition",
                !props.lowStockOpen && "-rotate-90",
              )}
            />
            Dropdown
          </button>
        }
      >
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2">
          <Search className="size-4 text-slate-400" />
          <input
            value={props.lowSearch}
            onChange={(e) => props.setLowSearch(e.target.value)}
            placeholder="Search low stock item"
            className="w-full bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        {props.lowStockOpen && (
          <DataTable
            headers={[
              "Item Name",
              "Current Stock",
              "Minimum Stock",
              "Unit",
              "Category",
              "Branch",
            ]}
            rows={props.lowStockRows.map((s: any) => [
              s.itemName,
              <span key="q" className="font-black text-red-600">
                {s.quantity}
              </span>,
              s.minThreshold ?? 10,
              s.unit ?? "-",
              catalogItems.find((i) => i.name === s.itemName)?.category ?? "-",
              BRANCH,
            ])}
            empty="No low stock items found."
          />
        )}
      </Panel>
    </div>
  );
}

function ExpensesTab({ userName, expenseAmount, cashBalance }: any) {
  const { expenses, addExpense } = useBranchOpsStore();
  const [form, setForm] = useState({
    expenseDate: dateInput(),
    category: "",
    description: "",
    amount: "",
    mode: "cash",
  });
  const rows = expenses.filter((e) => e.branch === BRANCH);
  const save = () => {
    const amount = Number(form.amount);
    if (!form.category.trim() || !form.description.trim() || !amount) return;
    addExpense({ branch: BRANCH, expenseDate: form.expenseDate, category: form.category, description: form.description, amount, mode: form.mode as any, enteredBy: userName });
    setForm({ ...form, category: "", description: "", amount: "" });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Expenses In Range" value={money(expenseAmount)} icon={<Banknote className="size-5" />} tone="red" />
        <Kpi label="Cash After Expenses" value={money(cashBalance)} icon={<WalletCards className="size-5" />} tone="green" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel title="Add Expense" icon={<Banknote className="size-4" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className={inputCls} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></Field>
              <Field label="Amount"><input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            </div>
            <Field label="Category"><input className={inputCls} placeholder="Tea, flowers, cleaning..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Details"><textarea className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Mode">
              <select className={inputCls} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option>
              </select>
            </Field>
            <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Save Expense</button>
          </div>
        </Panel>
        <Panel title="Expense History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("VRSNB_Expenses.xls", rows.map((e) => ({ Date: e.expenseDate, Category: e.category, Details: e.description, Amount: e.amount, Mode: e.mode, EnteredBy: e.enteredBy })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Category", "Details", "Amount", "Mode", "Entered By"]} rows={rows.map((e) => [fmtDate(e.expenseDate), e.category, e.description, money(e.amount), e.mode.toUpperCase(), e.enteredBy])} empty="No expenses added." />
        </Panel>
      </div>
    </div>
  );
}

function ComplaintsTab({ userName }: { userName: string }) {
  const [form, setForm] = useState({ complaintArea: "VRSNB", title: "", details: "" });
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from("branch_complaint_tickets")
      .select("*")
      .eq("branch", BRANCH)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRows(data || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!form.title.trim() || !form.details.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("create_branch_complaint_ticket", {
        p_branch: BRANCH,
        p_complaint_area: form.complaintArea,
        p_category: "General",
        p_subject: form.title.trim(),
        p_description: form.details.trim(),
        p_priority: "Medium",
      });
      if (rpcError) {
        const missingRpc = /create_branch_complaint_ticket|could not find the function|function .* does not exist/i.test(rpcError.message);
        if (!missingRpc) throw rpcError;
        const { error: insertError } = await supabase.from("branch_complaint_tickets").insert({
          ticket_no: "",
          branch: BRANCH,
          complaint_area: form.complaintArea,
          category: "General",
          subject: form.title.trim(),
          description: form.details.trim(),
          priority: "Medium",
          status: "Open",
          created_by_username: userName,
        });
        if (insertError) throw insertError;
      }
      setForm({ ...form, title: "", details: "" });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to submit complaint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title="Raise Complaint" icon={<MessageSquareWarning className="size-4" />}>
        <div className="space-y-3">
          <Field label="Complaint Area">
            <select className={inputCls} value={form.complaintArea} onChange={(e) => setForm({ ...form, complaintArea: e.target.value })}>
              {["Cafe", "VRSNB", "Store", "Packing", "Baker", "SNB", "Hosur"].map((area) => <option key={area}>{area}</option>)}
            </select>
          </Field>
          <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Details"><textarea className={inputCls} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 ring-1 ring-red-200">{error}</p>}
          <button disabled={saving} onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:opacity-50")}>
            {saving ? "Submitting..." : "Submit Complaint"}
          </button>
        </div>
      </Panel>
      <Panel title="Complaint Ticket Register" icon={<Bell className="size-4" />}>
        <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 ring-1 ring-blue-200">
          VRSNB Admin can raise tickets and add branch details. Review, resolution and closure are restricted to Owner and Main Admin.
        </p>
        <DataTable
          headers={["Ticket", "Date", "Area", "Subject", "Details", "Raised By", "Status"]}
          rows={rows.map((c) => [
            c.ticket_no,
            fmtDateTime(c.created_at),
            c.complaint_area,
            c.subject,
            c.description,
            c.created_by_username,
            <StatusBadge key="s" tone={c.status === "Resolved" || c.status === "Closed" ? "green" : c.status === "Under Review" || c.status === "In Progress" ? "blue" : "amber"}>{c.status}</StatusBadge>,
          ])}
          empty="No complaint tickets raised."
        />
      </Panel>
    </div>
  );
}

function printWasteLog(entry: any, branchLabel: string) {
  const rows = [
    ["Type", entry.logType],
    ["Item", entry.itemName],
    ["Quantity", `${entry.quantity} ${entry.unit}`],
    ["Reason", entry.reason],
    ["Verified By", entry.verifiedBy],
    ["Logged By", entry.createdBy],
  ];
  const checklistHtml = entry.checklist.length
    ? `<div class="dash"></div><div class="b">Checklist Confirmed</div>${entry.checklist
        .map((c: string) => `<div class="row"><span>&#10003; ${c}</span></div>`)
        .join("")}`
    : "";
  const body = `<div class="stamp">WASTE LOG — ${String(entry.logType).toUpperCase()}</div><h2 class="c">${branchLabel}</h2>${rows
    .map(([label, value]) => `<div class="row"><span>${label}</span><b>${value}</b></div>`)
    .join("")}${checklistHtml}<div class="dash"></div><div class="c">Stock updated automatically · Printed ${new Date().toLocaleString("en-IN")}</div>`;
  printHtml(`${branchLabel} Waste Log - ${entry.itemName}`, body);
}

function WasteLogsTab({ userName }: { userName: string }) {
  const catalogItems = useVRSNBCatalog();
  const { wasteLogs, addWasteLog } = useBranchOpsStore();
  const { stock } = useBranchStore();
  const [subTab, setSubTab] = useState<"Dump" | "Damage" | "Trans Out">("Dump");
  const [form, setForm] = useState({ itemName: catalogItems[0]?.name || "", quantity: "", unit: "pcs", reason: "", verifiedBy: "", checklist: [] as string[] });
  const transferOutChecklist = [
    "Verify standard quantity in box or Kgs or Pcs before transfer",
    "Cross-check all box or Kgs or Pcs before transfer-out and sync",
    "Sync the data in the Transfer-Out module",
    "Manual verification by 2 employees against transfer-out list",
    "Intimate factory and bill for extra products if received quantity exceeds list",
    "Sync store computer after goods received",
    "Perform Transfer In in the Billmaxo system",
    "Store In-Charge final acknowledgement collected",
  ];
  const checklistOptions = subTab === "Trans Out"
    ? transferOutChecklist
    : ["Item counted", "Reason checked", "Verified by responsible person", "Stock adjustment required"];
  const rows = wasteLogs.filter((w) => w.branch === BRANCH);
  const [validationError, setValidationError] = useState("");
  const save = async () => {
    const qty = Number(form.quantity);
    setValidationError("");
    if (!form.itemName || !Number.isFinite(qty) || qty <= 0) {
      setValidationError("Enter a valid quantity greater than zero.");
      return;
    }
    if (!form.reason.trim() || !form.verifiedBy.trim()) {
      setValidationError("Reason and Verified By are mandatory.");
      return;
    }
    if (checklistOptions.some((item) => !form.checklist.includes(item))) {
      setValidationError("Complete every checklist item before saving.");
      return;
    }
    const catalogItem = catalogItems.find((item) => normal(item.name) === normal(form.itemName));
    const currentRow = (stock[BRANCH] || []).find((stockItem) =>
      catalogItem?.barcode != null && stockItem.itemBarcode != null
        ? stockItem.itemBarcode === catalogItem.barcode
        : normal(stockItem.itemName) === normal(form.itemName),
    );
    const currentQty = Number(currentRow?.quantity || 0);
    if (qty > currentQty) {
      setValidationError(`Cannot deduct ${qty} ${form.unit}; available stock is ${currentQty}.`);
      return;
    }
    try {
      const { error: rpcError } = await supabase.rpc("record_branch_waste_secure", {
        p_branch: BRANCH,
        p_log_type: subTab,
        p_item_barcode: catalogItem?.barcode ?? null,
        p_item_name: currentRow?.itemName || form.itemName,
        p_quantity: qty,
        p_unit: form.unit,
        p_reason: form.reason.trim(),
        p_verified_by: form.verifiedBy.trim(),
        p_checklist: form.checklist,
      });
      if (rpcError) {
        const missingRpc = /record_branch_waste_secure|could not find the function|function .* does not exist/i.test(rpcError.message);
        if (!missingRpc) throw rpcError;
        const { error: insertError } = await supabase.from("branch_waste_logs").insert({
          branch: BRANCH,
          log_type: subTab,
          item_barcode: catalogItem?.barcode ?? null,
          item_name: currentRow?.itemName || form.itemName,
          quantity: qty,
          unit: form.unit,
          reason: form.reason.trim(),
          verified_by: form.verifiedBy.trim(),
          checklist: form.checklist,
          created_by_username: userName,
        });
        if (insertError) throw insertError;
      }
      addWasteLog({ branch: BRANCH, logType: subTab, itemName: form.itemName, quantity: qty, unit: form.unit, reason: form.reason, verifiedBy: form.verifiedBy, checklist: form.checklist, createdBy: userName });
      printWasteLog({ ...form, quantity: qty, logType: subTab, createdBy: userName }, "VRSNB");
      setForm({ ...form, quantity: "", reason: "", verifiedBy: "", checklist: [] });
    } catch (saveError) {
      setValidationError(saveError instanceof Error ? saveError.message : "Unable to save waste log");
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["Dump", "Damage", "Trans Out"] as const).map((name) => <button key={name} onClick={() => setSubTab(name)} className={cn(btnCls, subTab === name ? "bg-orange-500 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{name}</button>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel title={`${subTab} Entry`} icon={<Trash2 className="size-4" />}>
          <div className="space-y-3">
            <Field label="Item"><select className={inputCls} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })}>{catalogItems.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity"><input type="number" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
              <Field label="Unit"><select className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option>pcs</option><option>kg</option><option>g</option><option>box</option></select></Field>
            </div>
            <Field label="Reason"><textarea className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <Field label="Verified By"><input className={inputCls} value={form.verifiedBy} onChange={(e) => setForm({ ...form, verifiedBy: e.target.value })} /></Field>
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
              {checklistOptions.map((item) => (
                <label key={item} className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={form.checklist.includes(item)} onChange={(e) => setForm((f) => ({ ...f, checklist: e.target.checked ? [...f.checklist, item] : f.checklist.filter((x) => x !== item) }))} />
                  {item}
                </label>
              ))}
            </div>
            {validationError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 ring-1 ring-red-200">{validationError}</p>}
            <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Save Waste Log</button>
          </div>
        </Panel>
        <Panel title="Waste Log History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("VRSNB_Waste_Logs.xls", rows.map((w) => ({ Date: w.createdAt, Type: w.logType, Item: w.itemName, Quantity: w.quantity, Unit: w.unit, Reason: w.reason, VerifiedBy: w.verifiedBy })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Type", "Item", "Qty", "Reason", "Verified By", "Checklist"]} rows={rows.map((w) => [fmtDateTime(w.createdAt), w.logType, w.itemName, `${w.quantity} ${w.unit}`, w.reason, w.verifiedBy, w.checklist.join(", ") || "-"])} empty="No waste logs saved." />
        </Panel>
      </div>
    </div>
  );
}

function QuotationsTab({ userName }: { userName: string }) {
  const catalogItems = useVRSNBCatalog();
  const { quotations, addQuotation, updateQuotationStatus } = useBranchOpsStore();
  const [mode, setMode] = useState<"list" | "custom">("list");
  const [form, setForm] = useState({ customerName: "", companyName: "", mobile: "", gstNumber: "", itemName: catalogItems[0]?.name || "", customName: "", qty: "1", rate: "", deliveryCharges: "0", packingCharges: "0", extraCharges: "0", discount: "0" });
  const [lines, setLines] = useState<any[]>([]);
  const rows = quotations.filter((q) => q.branch === BRANCH);
  const addLine = () => {
    const qty = Number(form.qty);
    const item = catalogItems.find((i) => i.name === form.itemName);
    const name = mode === "custom" ? form.customName.trim() : form.itemName;
    const rate = mode === "custom" ? Number(form.rate) : Number((item as any)?.price || form.rate);
    if (!name || !qty || !rate) return;
    setLines((current) => [...current, { itemName: name, quantity: qty, unit: (item as any)?.uom === "Kgs" ? "kg" : "pcs", price: rate, tax: 0, discount: 0, lineTotal: qty * rate }]);
    setForm({ ...form, customName: "", qty: "1", rate: "" });
  };
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = Math.max(0, subtotal + Number(form.deliveryCharges || 0) + Number(form.packingCharges || 0) + Number(form.extraCharges || 0) - Number(form.discount || 0));
  const save = () => {
    if (!form.customerName.trim() || !form.mobile.trim() || lines.length === 0) return;
    addQuotation({ branch: BRANCH, customerName: form.customerName, companyName: form.companyName, mobile: form.mobile, gstNumber: form.gstNumber, items: lines, customItems: lines.filter((l) => !catalogItems.some((i) => i.name === l.itemName)), subtotal, deliveryCharges: Number(form.deliveryCharges || 0), packingCharges: Number(form.packingCharges || 0), extraCharges: Number(form.extraCharges || 0), discount: Number(form.discount || 0), total, salesperson: userName });
    setLines([]);
    setForm({ ...form, customerName: "", companyName: "", mobile: "", gstNumber: "", deliveryCharges: "0", packingCharges: "0", extraCharges: "0", discount: "0" });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
      <Panel title="Create Quotation" icon={<FileSpreadsheet className="size-4" />}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer / Company"><input className={inputCls} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
            <Field label="Mobile"><input className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company Name"><input className={inputCls} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
            <Field label="GST Number"><input className={inputCls} value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></Field>
          </div>
          <div className="flex gap-2">{(["list", "custom"] as const).map((x) => <button key={x} onClick={() => setMode(x)} className={cn(btnCls, mode === x ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-700")}>{x === "list" ? "Item List" : "Custom Item"}</button>)}</div>
          {mode === "list" ? <Field label="Item"><select className={inputCls} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })}>{catalogItems.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field> : <Field label="Custom Item"><input className={inputCls} value={form.customName} onChange={(e) => setForm({ ...form, customName: e.target.value })} /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty"><input type="number" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
            <Field label="Rate"><input type="number" className={inputCls} value={form.rate} placeholder={mode === "list" ? "Auto from item" : ""} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
          </div>
          <button onClick={addLine} className={cn(btnCls, "w-full bg-white text-slate-700 ring-1 ring-slate-200")}><Plus className="size-4" /> Add Item</button>
          {lines.map((line, i) => <div key={`${line.itemName}-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2 text-sm font-bold"><span>{line.itemName} - {line.quantity} x {money(line.price)}</span><button onClick={() => setLines((current) => current.filter((_, idx) => idx !== i))} className="text-red-600"><X className="size-4" /></button></div>)}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery"><input type="number" className={inputCls} value={form.deliveryCharges} onChange={(e) => setForm({ ...form, deliveryCharges: e.target.value })} /></Field>
            <Field label="Packing"><input type="number" className={inputCls} value={form.packingCharges} onChange={(e) => setForm({ ...form, packingCharges: e.target.value })} /></Field>
            <Field label="Extra"><input type="number" className={inputCls} value={form.extraCharges} onChange={(e) => setForm({ ...form, extraCharges: e.target.value })} /></Field>
            <Field label="Discount"><input type="number" className={inputCls} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 font-black text-emerald-700">Quotation Total: {money(total)}</div>
          <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Save Quotation</button>
        </div>
      </Panel>
      <Panel title="Quotation History" icon={<History className="size-4" />}>
        <DataTable headers={["No", "Customer", "Mobile", "GST", "Items", "Charges", "Discount", "Total", "Status", "Action"]} rows={rows.map((q) => [q.quoteNo, q.customerName, q.mobile || "-", q.gstNumber || "-", q.items.length, money((q.deliveryCharges || 0) + (q.packingCharges || 0) + (q.extraCharges || 0)), money(q.discount || 0), money(q.total), q.status, <div key="a" className="flex gap-2"><button className={cn(btnCls, "bg-emerald-50 text-emerald-700")} onClick={() => updateQuotationStatus(q.id, "Converted", userName)}>Convert</button><button className={cn(btnCls, "bg-red-50 text-red-600")} onClick={() => updateQuotationStatus(q.id, "Cancelled", userName)}>Cancel</button></div>])} empty="No quotations saved." />
      </Panel>
    </div>
  );
}

function CashierReportTab(props: any) {
  const rows = useMemo(() => {
    const map = new Map<string, any>();
    const ensure = (name: string) => {
      const key = name || "Unknown";
      const row = map.get(key) ?? {
        name: key,
        grossSales: 0,
        returns: 0,
        netSales: 0,
        bills: 0,
        cash: 0,
        upi: 0,
        card: 0,
        credit: 0,
      };
      map.set(key, row);
      return row;
    };
    props.branchBills.forEach((bill: any) => {
      const row = ensure(bill.biller || bill.salesperson);
      row.grossSales += bill.total;
      row.bills += 1;
      if (bill.paymentMode === "cash") row.cash += bill.total;
      if (bill.paymentMode === "upi") row.upi += bill.total;
      if (bill.paymentMode === "card") row.card += bill.total;
      if (bill.paymentMode === "credit") row.credit += bill.total;
      if (bill.paymentMode === "split") {
        row.cash += bill.split?.cash ?? 0;
        row.upi += bill.split?.upi ?? 0;
        row.card += bill.split?.card ?? 0;
      }
    });
    props.legacySalesRows.forEach((sale: any) => {
      const row = ensure(sale.biller || sale.soldBy);
      const line = (sale.unitPrice ?? 0) * sale.quantitySold;
      row.grossSales += line;
      row.bills += 1;
      if (amountForLegacyPayment(sale.paymentMethod, "cash")) row.cash += line;
      if (amountForLegacyPayment(sale.paymentMethod, "upi")) row.upi += line;
      if (amountForLegacyPayment(sale.paymentMethod, "card")) row.card += line;
      if (amountForLegacyPayment(sale.paymentMethod, "credit")) row.credit += line;
    });
    props.branchReturns.forEach((ret: any) => {
      const original = props.branchBills.find((bill: any) => bill.billNo === ret.originalBillNo);
      const row = ensure(original?.biller || ret.returnedBy);
      row.returns += ret.total;
    });
    return Array.from(map.values())
      .map((row) => ({ ...row, netSales: Math.max(0, row.grossSales - row.returns) }))
      .sort((a, b) => b.netSales - a.netSales);
  }, [props.branchBills, props.branchReturns, props.legacySalesRows]);
  const totalNet = rows.reduce((sum: number, r: any) => sum + r.netSales, 0);
  const totalBills = rows.reduce((sum: number, r: any) => sum + r.bills, 0);
  const best = rows[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Cashiers" value={rows.length} icon={<UserRound className="size-5" />} />
        <Kpi label="Total Bills" value={totalBills} icon={<Receipt className="size-5" />} tone="blue" />
        <Kpi label="Combined Net Sales" value={money(totalNet)} icon={<IndianRupee className="size-5" />} tone="green" />
        <Kpi label="Top Cashier" value={best ? best.name : "-"} sub={best ? money(best.netSales) : undefined} icon={<BarChart3 className="size-5" />} tone="amber" />
      </div>
      <Panel title="Cashier Report" icon={<BarChart3 className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("VRSNB_Cashier_Report.xls", rows.map((r: any) => ({ CashierLogin: r.name, GrossSales: r.grossSales, Returns: r.returns, NetSales: r.netSales, Bills: r.bills, Cash: r.cash, UPI: r.upi, Card: r.card, Credit: r.credit })))}><Download className="size-4" /> Export</button>}>
        <DataTable headers={["Rank", "Cashier Login", "Gross", "Returns", "Net", "Bills", "Cash", "UPI", "Card", "Credit"]} rows={rows.map((r: any, idx: number) => [`#${idx + 1}`, r.name, money(r.grossSales), money(r.returns), <span key="n" className="font-black text-emerald-700">{money(r.netSales)}</span>, r.bills, money(r.cash), money(r.upi), money(r.card), money(r.credit)])} empty="No cashier sales data found." />
      </Panel>
    </div>
  );
}

function CashierClosureTab(props: any) {
  const { cashierClosures } = useBranchOpsStore();
  const rows = cashierClosures.filter((c) => c.branch === BRANCH);
  const totalDifference = rows.reduce((sum, c) => sum + c.difference, 0);
  const mismatches = rows.filter((c) => c.difference !== 0).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Closures Logged" value={rows.length} icon={<CalendarClock className="size-5" />} />
        <Kpi label="Matched Closures" value={rows.length - mismatches} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Mismatches" value={mismatches} icon={<AlertTriangle className="size-5" />} tone={mismatches ? "red" : "green"} />
        <Kpi label="Net Difference" value={money(totalDifference)} icon={<IndianRupee className="size-5" />} tone={totalDifference === 0 ? "green" : "red"} />
      </div>
      <Panel
        title="All Cashier Closure Data"
        icon={<CalendarClock className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload(
                "VRSNB_All_Cashier_Closures.xls",
                rows.map((c) => ({
                  Date: fmtDateTime(c.createdAt),
                  Cashier: c.cashier,
                  Opening: c.openingCash,
                  Expected: c.expectedCash,
                  Closing: c.closingCash,
                  Difference: c.difference,
                  Bills: c.billsCount,
                  Cash: c.cash,
                  UPI: c.upi,
                  Card: c.card,
                  Returns: c.returns,
                  CreditSales: c.creditSales ?? 0,
                  CreditCollections: c.creditCollections ?? 0,
                  Notes: c.notes,
                })),
              )
            }
          >
            <Download className="size-4" />
            Export
          </button>
        }
      >
        <DataTable
          headers={["Date", "Cashier", "Opening", "Expected", "Closing", "Difference", "Status", "Bills", "Cash", "UPI", "Card", "Returns", "Credit Sales", "Credit Collections", "Notes"]}
          rows={rows.map((c) => [
            fmtDateTime(c.createdAt),
            c.cashier,
            money(c.openingCash),
            money(c.expectedCash),
            money(c.closingCash),
            <span key="d" className={cn("font-black", c.difference === 0 ? "text-emerald-700" : "text-red-600")}>{money(c.difference)}</span>,
            <StatusBadge key="s" tone={c.difference === 0 ? "green" : "red"}>{c.difference === 0 ? "Matched" : "Mismatch"}</StatusBadge>,
            c.billsCount,
            money(c.cash),
            money(c.upi),
            money(c.card),
            money(c.returns),
            money(c.creditSales ?? 0),
            money(c.creditCollections ?? 0),
            c.notes || "-",
          ])}
          empty="No cashier closures saved."
        />
      </Panel>
    </div>
  );
}

function PurchaseOrdersTab({ userName }: { userName: string }) {
  const catalogItems = useVRSNBCatalog();
  const { purchaseOrders, addPurchaseOrder, updatePoStatus } =
    useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    itemName: catalogItems[0]?.name || "",
    quantity: "",
    expectedRate: "",
    expectedDeliveryDate: dateInput(),
    remarks: "",
  });
  const rows = purchaseOrders.filter((p) => p.branch === BRANCH);
  const create = () => {
    const qty = Number(form.quantity);
    const rate = Number(form.expectedRate);
    if (!form.supplier.trim() || !qty || !rate) return;
    addPurchaseOrder({
      branch: BRANCH,
      supplier: form.supplier,
      itemName: form.itemName,
      quantity: qty,
      expectedRate: rate,
      totalAmount: qty * rate,
      expectedDeliveryDate: form.expectedDeliveryDate,
      remarks: form.remarks,
      createdBy: userName,
    });
    setForm({
      ...form,
      supplier: "",
      quantity: "",
      expectedRate: "",
      remarks: "",
    });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Panel
        title="Create Purchase Order"
        icon={<ClipboardCheck className="size-4" />}
      >
        <div className="space-y-3">
          <Field label="Supplier">
            <input
              className={inputCls}
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </Field>
          <Field label="Item">
            <select
              className={inputCls}
              value={form.itemName}
              onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            >
              {catalogItems.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input
                type="number"
                className={inputCls}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
            <Field label="Purchase Price">
              <input
                type="number"
                className={inputCls}
                value={form.expectedRate}
                onChange={(e) =>
                  setForm({ ...form, expectedRate: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Expected Delivery">
            <input
              type="date"
              className={inputCls}
              value={form.expectedDeliveryDate}
              onChange={(e) =>
                setForm({ ...form, expectedDeliveryDate: e.target.value })
              }
            />
          </Field>
          <Field label="Remarks">
            <textarea
              className={inputCls}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </Field>
          <button
            onClick={create}
            className={cn(btnCls, "w-full bg-slate-950 text-white")}
          >
            <ClipboardCheck className="size-4" />
            Create PO
          </button>
        </div>
      </Panel>
      <Panel
        title="PO Management"
        icon={<Truck className="size-4" />}
        action={
          <button
            className={cn(
              btnCls,
              "bg-white text-slate-700 ring-1 ring-slate-200",
            )}
            onClick={() =>
              csvDownload(
                "VRSNB_Purchase_Orders.xls",
                rows.map((p) => ({
                  PONumber: p.poNo,
                  Supplier: p.supplier,
                  Item: p.itemName,
                  Quantity: p.quantity,
                  Rate: p.expectedRate,
                  Total: p.totalAmount,
                  Status: p.status,
                })),
              )
            }
          >
            <Download className="size-4" />
            Export
          </button>
        }
      >
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="rounded-3xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black text-slate-950">
                    {p.poNo} · {p.supplier}
                  </p>
                  <p className="text-sm font-semibold text-slate-500">
                    {p.itemName} · {p.quantity} × {money(p.expectedRate)} ·{" "}
                    {money(p.totalAmount)}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    Expected {p.expectedDeliveryDate || "-"} ·{" "}
                    {p.remarks || "No remarks"}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    p.status === "Received" || p.status === "Closed"
                      ? "green"
                      : p.status === "Rejected" || p.status === "Cancelled"
                        ? "red"
                        : "amber"
                  }
                >
                  {p.status}
                </StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    "Draft",
                    "Ordered",
                    "Partially Received",
                    "Received",
                    "Cancelled",
                  ] as const
                ).map((status) => (
                  <button
                    key={status}
                    className={cn(
                      btnCls,
                      "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
                    )}
                    onClick={() => updatePoStatus(p.id, status, userName)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PurchaseInvoicesTab({
  userName,
  branchStock,
  manualUpdateStock,
  fetchBranchData,
  setNotice,
}: {
  userName: string;
  branchStock: any[];
  manualUpdateStock: any;
  fetchBranchData: any;
  setNotice: (v: string) => void;
}) {
  const catalogItems = useVRSNBCatalog();
  const {
    purchases,
    addPurchase,
    addPurchasePayment,
    markPurchaseSynced,
    addAuditLog,
  } = useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    invoiceNo: "",
    invoiceDate: dateInput(),
    itemName: catalogItems[0]?.name || "",
    quantity: "",
    unit: "pcs",
    rate: "",
    tax: "0",
    discount: "0",
    paidAmount: "0",
    paymentMethod: "cash",
    remarks: "",
  });
  const rows = purchases.filter((p) => p.branch === BRANCH);
  const create = () => {
    const qty = Number(form.quantity);
    const rate = Number(form.rate);
    const tax = Number(form.tax || 0);
    const discount = Number(form.discount || 0);
    const total = Math.max(0, qty * rate + tax - discount);
    const paid = Math.min(Number(form.paidAmount || 0), total);
    if (!form.supplier.trim() || !form.invoiceNo.trim() || !qty || !rate)
      return;
    const purchase = addPurchase({
      branch: BRANCH,
      supplier: form.supplier,
      invoiceNo: form.invoiceNo,
      invoiceDate: form.invoiceDate,
      itemName: form.itemName,
      quantity: qty,
      unit: form.unit as any,
      cost: rate,
      tax,
      discount,
      total,
      enteredBy: userName,
      paymentMethod: paid > 0 ? (form.paymentMethod as any) : "credit",
      remarks: form.remarks,
    });
    if (paid > 0)
      addPurchasePayment({
        branch: BRANCH,
        purchaseId: purchase.id,
        supplier: form.supplier,
        amount: paid,
        mode: form.paymentMethod as any,
        reference: form.invoiceNo,
        remarks: "Payment during invoice creation",
        paidBy: userName,
      });
    setForm({
      ...form,
      invoiceNo: "",
      invoiceDate: dateInput(),
      quantity: "",
      rate: "",
      tax: "0",
      discount: "0",
      paidAmount: "0",
      remarks: "",
    });
  };
  const sync = async (p: PurchaseRecord) => {
    if (p.syncedToStock || p.syncStatus === "Synced") {
      setNotice(
        "This purchase invoice is already synced to stock. Duplicate sync prevented.",
      );
      return;
    }
    const catalogItem = catalogItems.find((item) => normal(item.name) === normal(p.itemName));
    const existing = branchStock.find((stockItem) =>
      catalogItem?.barcode != null && stockItem.itemBarcode != null
        ? stockItem.itemBarcode === catalogItem.barcode
        : normal(stockItem.itemName) === normal(p.itemName),
    );
    const currentQty = Number(existing?.quantity ?? 0);
    const err = await manualUpdateStock(
      BRANCH,
      existing?.itemName || p.itemName,
      currentQty + Number(p.quantity),
      userName,
      catalogItem?.barcode,
    );
    if (err) {
      setNotice(err);
      return;
    }
    markPurchaseSynced(p.id, userName, "Synced");
    addAuditLog({
      branch: BRANCH,
      user: userName,
      action: "VRSNB Purchase Sync To Stock",
      previousValue: `${p.itemName}: ${currentQty}`,
      newValue: `${p.itemName}: ${currentQty + Number(p.quantity)} from ${p.invoiceNo}`,
    });
    await fetchBranchData(BRANCH);
    setNotice(`${p.invoiceNo} synced to VRSNB stock successfully.`);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel
        title="Create Purchase Invoice"
        icon={<Receipt className="size-4" />}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <input
                className={inputCls}
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </Field>
            <Field label="Invoice No">
              <input
                className={inputCls}
                value={form.invoiceNo}
                onChange={(e) =>
                  setForm({ ...form, invoiceNo: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Invoice Date">
            <input
              type="date"
              className={inputCls}
              value={form.invoiceDate}
              onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
            />
          </Field>
          <Field label="Item">
            <select
              className={inputCls}
              value={form.itemName}
              onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            >
              {catalogItems.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input
                type="number"
                className={inputCls}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
            <Field label="Unit">
              <select
                className={inputCls}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                <option value="pcs">Pcs</option>
                <option value="kg">KG</option>
                <option value="ltr">Ltr</option>
                <option value="nos">Nos</option>
                <option value="bunch">Bunch</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Rate">
              <input
                type="number"
                className={inputCls}
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </Field>
            <Field label="Tax">
              <input
                type="number"
                className={inputCls}
                value={form.tax}
                onChange={(e) => setForm({ ...form, tax: e.target.value })}
              />
            </Field>
            <Field label="Discount">
              <input
                type="number"
                className={inputCls}
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid Amount">
              <input
                type="number"
                className={inputCls}
                value={form.paidAmount}
                onChange={(e) =>
                  setForm({ ...form, paidAmount: e.target.value })
                }
              />
            </Field>
            <Field label="Payment Method">
              <select
                className={inputCls}
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm({ ...form, paymentMethod: e.target.value })
                }
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
            </Field>
          </div>
          <Field label="Remarks">
            <input
              className={inputCls}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </Field>
          <button
            onClick={create}
            className={cn(btnCls, "w-full bg-slate-950 text-white")}
          >
            <Receipt className="size-4" />
            Save Invoice
          </button>
        </div>
      </Panel>
      <Panel
        title="Purchase Invoice Management & Stock Sync"
        icon={<PackageCheck className="size-4" />}
        action={
          <StatusBadge tone="amber">
            {
              rows.filter(
                (r) => !(r.syncedToStock || r.syncStatus === "Synced"),
              ).length
            }{" "}
            Not Synced
          </StatusBadge>
        }
      >
        <DataTable
          headers={[
            "Invoice",
            "Supplier",
            "Date",
            "Item",
            "Qty",
            "Total",
            "Paid",
            "Balance",
            "Sync Status",
            "Action",
          ]}
          rows={rows.map((p) => [
            p.invoiceNo,
            p.supplier,
            p.invoiceDate ? new Date(p.invoiceDate).toLocaleDateString("en-IN") : "-",
            p.itemName,
            `${p.quantity} ${p.unit ?? ""}`,
            money(p.total),
            money(p.paidAmount),
            money(Math.max(0, p.total - p.paidAmount)),
            <StatusBadge
              key="s"
              tone={
                p.syncedToStock || p.syncStatus === "Synced" ? "green" : "amber"
              }
            >
              {p.syncStatus ?? "Not Synced"}
            </StatusBadge>,
            <button
              key="a"
              onClick={() => sync(p)}
              disabled={p.syncedToStock || p.syncStatus === "Synced"}
              className={cn(
                btnCls,
                p.syncedToStock || p.syncStatus === "Synced"
                  ? "bg-slate-100 text-slate-400"
                  : "bg-emerald-600 text-white",
              )}
            >
              <RefreshCcw className="size-4" />
              Sync to Stock
            </button>,
          ])}
          empty="No purchase invoices created."
        />
      </Panel>
    </div>
  );
}

function SupplierPaymentsTab({ userName }: { userName: string }) {
  const { purchases, purchasePayments, addPurchasePayment } =
    useBranchOpsStore();
  const pendingPurchases = purchases.filter(
    (p) => p.branch === BRANCH && p.total > p.paidAmount,
  );
  const [form, setForm] = useState({
    purchaseId: "",
    supplier: "",
    amount: "",
    mode: "cash",
    reference: "",
    remarks: "",
  });
  const selected = pendingPurchases.find((p) => p.id === form.purchaseId);
  const save = () => {
    const amount = Number(form.amount);
    const supplier = selected?.supplier || form.supplier;
    if (!supplier.trim() || !amount) return;
    const due = selected ? Math.max(0, Number(selected.total || 0) - Number(selected.paidAmount || 0)) : 0;
    if (selected && amount > due) {
      window.alert(`Payment cannot exceed pending due ${money(due)}.`);
      return;
    }
    try {
      addPurchasePayment({
        branch: BRANCH,
        purchaseId: selected?.id,
        supplier,
        amount,
        mode: form.mode as any,
        reference: form.reference,
        remarks: form.remarks || "Supplier payment",
        paidBy: userName,
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Purchase payment failed.');
      return;
    }
    setForm({
      purchaseId: "",
      supplier: "",
      amount: "",
      mode: "cash",
      reference: "",
      remarks: "",
    });
  };
  const rows = purchasePayments.filter((p) => p.branch === BRANCH);
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title="Pay Supplier" icon={<WalletCards className="size-4" />}>
        <div className="space-y-3">
          <Field label="Pending Invoice">
            <select
              className={inputCls}
              value={form.purchaseId}
              onChange={(e) => {
                const p = pendingPurchases.find((x) => x.id === e.target.value);
                setForm({
                  ...form,
                  purchaseId: e.target.value,
                  supplier: p?.supplier || "",
                  amount: p ? String(Math.max(0, p.total - p.paidAmount)) : "",
                });
              }}
            >
              <option value="">Manual / Select invoice</option>
              {pendingPurchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.invoiceNo} · {p.supplier} · Due{" "}
                  {money(Math.max(0, p.total - p.paidAmount))}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier">
            <input
              className={inputCls}
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input
                type="number"
                className={inputCls}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Mode">
              <select
                className={inputCls}
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
            </Field>
          </div>
          <Field label="Reference">
            <input
              className={inputCls}
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
          <Field label="Remarks">
            <input
              className={inputCls}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </Field>
          <button
            onClick={save}
            className={cn(btnCls, "w-full bg-slate-950 text-white")}
          >
            <WalletCards className="size-4" />
            Save Payment
          </button>
        </div>
      </Panel>
      <Panel title="Payment History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("VRSNB_Supplier_Payments.xls", rows.map((p) => ({ Date: p.createdAt, Supplier: p.supplier, Amount: p.amount, Mode: p.mode, Reference: p.reference || "-", PaidBy: p.paidBy })))}><Download className="size-4" /> Excel</button>}>
        <DataTable
          headers={[
            "Date",
            "Supplier",
            "Amount",
            "Mode",
            "Reference",
            "Paid By",
            "Remarks",
          ]}
          rows={rows.map((p) => [
            fmtDateTime(p.createdAt),
            p.supplier,
            money(p.amount),
            p.mode.toUpperCase(),
            p.reference,
            p.paidBy,
            p.remarks,
          ])}
          empty="No supplier payments yet."
        />
      </Panel>
    </div>
  );
}

function BankDepositsTab({
  userName,
  cashBalance,
  upiBalance,
  cardBalance,
  bankBalance,
}: {
  userName: string;
  cashBalance: number;
  upiBalance: number;
  cardBalance: number;
  bankBalance: number;
}) {
  const { bankDeposits, addBankDeposit } = useBranchOpsStore();
  const [form, setForm] = useState({
    depositDate: dateInput(),
    amount: "",
    bankAccount: "VRSNB Main Bank Account",
    paymentMode: "Cash Deposit",
    slipNo: "",
    transactionRef: "",
    remarks: "",
  });
  const save = () => {
    const amount = Number(form.amount);
    if (!amount) return;
    addBankDeposit({
      branch: BRANCH,
      depositDate: form.depositDate,
      amount,
      bankAccount: form.bankAccount,
      paymentMode: form.paymentMode as any,
      slipNo: form.slipNo,
      transactionRef: form.transactionRef,
      remarks: form.remarks,
      enteredBy: userName,
    });
    setForm({
      ...form,
      amount: "",
      slipNo: "",
      transactionRef: "",
      remarks: "",
    });
  };
  const rows = bankDeposits.filter((d) => d.branch === BRANCH);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          label="Cash Balance"
          value={money(cashBalance)}
          icon={<Banknote className="size-5" />}
          tone="green"
        />
        <Kpi
          label="UPI Balance"
          value={money(upiBalance)}
          icon={<Smartphone className="size-5" />}
          tone="blue"
        />
        <Kpi
          label="Card Balance"
          value={money(cardBalance)}
          icon={<CreditCard className="size-5" />}
          tone="purple"
        />
        <Kpi
          label="Total Deposited to Owner"
          value={money(bankBalance)}
          icon={<Landmark className="size-5" />}
          tone="slate"
        />
      </div>
      <div className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600 ring-1 ring-slate-100">
        Money deposited here has been handed over to the Owner's bank account — it is no longer with the branch. Cash/UPI/Card Balance above already reduces automatically by the deposited amount.
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel
          title="Bank Deposit Entry"
          icon={<Landmark className="size-4" />}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deposit Date">
                <input
                  type="date"
                  className={inputCls}
                  value={form.depositDate}
                  onChange={(e) =>
                    setForm({ ...form, depositDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  className={inputCls}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Bank Account">
              <input
                className={inputCls}
                value={form.bankAccount}
                onChange={(e) =>
                  setForm({ ...form, bankAccount: e.target.value })
                }
              />
            </Field>
            <Field label="Deposit Method">
              <select
                className={inputCls}
                value={form.paymentMode}
                onChange={(e) =>
                  setForm({ ...form, paymentMode: e.target.value })
                }
              >
                <option>Cash Deposit</option>
                <option>UPI Transfer</option>
                <option>Card Settlement</option>
                <option>Bank Transfer</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slip No">
                <input
                  className={inputCls}
                  value={form.slipNo}
                  onChange={(e) => setForm({ ...form, slipNo: e.target.value })}
                />
              </Field>
              <Field label="Transaction Ref">
                <input
                  className={inputCls}
                  value={form.transactionRef}
                  onChange={(e) =>
                    setForm({ ...form, transactionRef: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Remarks">
              <input
                className={inputCls}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </Field>
            <button
              onClick={save}
              className={cn(btnCls, "w-full bg-slate-950 text-white")}
            >
              <Landmark className="size-4" />
              Save Deposit
            </button>
          </div>
        </Panel>
        <Panel
          title="Bank Deposit History"
          icon={<History className="size-4" />}
        >
          <DataTable
            headers={[
              "Date",
              "Amount",
              "Method",
              "Bank",
              "Slip",
              "Ref",
              "Entered By",
              "Remarks",
            ]}
            rows={rows.map((d) => [
              fmtDate(d.depositDate),
              money(d.amount),
              d.paymentMode,
              d.bankAccount,
              d.slipNo,
              d.transactionRef,
              d.enteredBy,
              d.remarks,
            ])}
            empty="No bank deposits saved."
          />
        </Panel>
      </div>
    </div>
  );
}

function SalespersonManagementTab({ userName }: { userName: string }) {
  const { salespeople, addSalesperson, updateSalesperson, removeSalesperson } =
    useBranchOpsStore();
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    address: "",
    role: "Salesperson",
    joiningDate: dateInput(),
    status: "Active",
    remarks: "",
  });
  const rows = salespeople.filter((p) => p.branch === BRANCH);
  const reset = () => {
    setEditId("");
    setForm({
      name: "",
      mobile: "",
      address: "",
      role: "Salesperson",
      joiningDate: dateInput(),
      status: "Active",
      remarks: "",
    });
  };
  const save = () => {
    if (!form.name.trim()) return;
    const details: Partial<SalespersonProfile> = {
      mobile: form.mobile,
      address: form.address,
      role: form.role,
      joiningDate: form.joiningDate,
      status: form.status as any,
      active: form.status === "Active",
      assignedBranch: BRANCH,
      remarks: form.remarks,
    };
    if (editId)
      updateSalesperson(
        editId,
        form.name,
        form.status === "Active",
        userName,
        details,
      );
    else addSalesperson(BRANCH, form.name, userName, details);
    reset();
  };
  const edit = (p: SalespersonProfile) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      mobile: p.mobile || "",
      address: p.address || "",
      role: p.role || "Salesperson",
      joiningDate: p.joiningDate || dateInput(),
      status: p.active ? "Active" : "Inactive",
      remarks: p.remarks || "",
    });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel
        title={editId ? "Edit Salesperson" : "Add Salesperson"}
        icon={<UserRound className="size-4" />}
      >
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile">
              <input
                className={inputCls}
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </Field>
            <Field label="Joining Date">
              <input
                type="date"
                className={inputCls}
                value={form.joiningDate}
                onChange={(e) =>
                  setForm({ ...form, joiningDate: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <input
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
          <Field label="Address">
            <textarea
              className={inputCls}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Remarks">
            <input
              className={inputCls}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={save}
              className={cn(btnCls, "flex-1 bg-slate-950 text-white")}
            >
              {editId ? "Update" : "Add"} Salesperson
            </button>
            {editId && (
              <button
                onClick={reset}
                className={cn(
                  btnCls,
                  "bg-white text-slate-700 ring-1 ring-slate-200",
                )}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </Panel>
      <Panel
        title="Salesperson Master"
        icon={<BookOpenCheck className="size-4" />}
      >
        <DataTable
          headers={[
            "Name",
            "Mobile",
            "Role",
            "Joining",
            "Status",
            "Address",
            "Remarks",
            "Action",
          ]}
          rows={rows.map((p) => [
            p.name,
            p.mobile || "-",
            p.role || "Salesperson",
            p.joiningDate || "-",
            <StatusBadge key="s" tone={p.active ? "green" : "red"}>
              {p.active ? "Active" : "Inactive"}
            </StatusBadge>,
            p.address || "-",
            p.remarks || "-",
            <div key="a" className="flex gap-2">
              <button
                className={cn(btnCls, "bg-amber-50 text-amber-700")}
                onClick={() => edit(p)}
              >
                Edit
              </button>
              <button
                className={cn(btnCls, "bg-red-50 text-red-600")}
                onClick={() => removeSalesperson(p.id, userName)}
              >
                Delete
              </button>
            </div>,
          ])}
          empty="No salesperson profiles added."
        />
      </Panel>
    </div>
  );
}

function SalespersonReportTab(props: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Active Salespersons"
          value={props.salespersonRows.length}
          icon={<UserRound className="size-5" />}
        />
        <Kpi
          label="Net Sales"
          value={money(props.netSales)}
          icon={<IndianRupee className="size-5" />}
          tone="green"
        />
        <Kpi
          label="Return Amount"
          value={money(props.returnAmount)}
          icon={<RotateCcw className="size-5" />}
          tone="red"
        />
      </div>
      <Panel
        title="Salesperson Performance"
        icon={<BarChart3 className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload(
                "VRSNB_Salesperson_Report.xls",
                props.salespersonRows.map((r: any) => ({
                  Salesperson: r.name,
                  GrossSales: r.grossSales,
                  ReturnAmount: r.returns,
                  NetSales: r.netSales,
                  Bills: r.bills,
                  AvgBill: r.avgBillValue,
                  Cash: r.cash,
                  UPI: r.upi,
                  Card: r.card,
                })),
              )
            }
          >
            <Download className="size-4" />
            Export
          </button>
        }
      >
        <DataTable
          headers={[
            "Salesperson",
            "Gross Sales",
            "Return Amount",
            "Net Sales",
            "Bills",
            "Avg Bill",
            "Cash",
            "UPI",
            "Card",
          ]}
          rows={props.salespersonRows.map((r: any) => [
            r.name,
            money(r.grossSales),
            money(r.returns),
            <span key="n" className="font-black text-emerald-700">
              {money(r.netSales)}
            </span>,
            r.bills,
            money(r.avgBillValue),
            money(r.cash),
            money(r.upi),
            money(r.card),
          ])}
          empty="No salesperson sales data for selected period."
        />
      </Panel>
    </div>
  );
}

function CreditTab({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const {
    creditSales,
    creditPayments,
    fetchCreditSales,
    fetchCreditPayments,
    settleCreditSale,
  } = useBranchStore();
  const { currentUser } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "settled">("pending");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, "cash" | "upi" | "card" | "bank">>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    CREDIT_BRANCHES.forEach((branch) => {
      void fetchCreditSales(branch);
      void fetchCreditPayments(branch);
    });
  }, [fetchCreditPayments, fetchCreditSales]);

  const sales = useMemo(
    () =>
      CREDIT_BRANCHES.flatMap((branch) =>
        (creditSales[branch] || []).map((sale) => ({ ...sale, branch })),
      ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [creditSales],
  );
  const payments = useMemo(
    () =>
      CREDIT_BRANCHES.flatMap((branch) =>
        (creditPayments[branch] || []).map((payment) => ({ ...payment, branch })),
      ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [creditPayments],
  );
  const visibleSales = sales.filter((sale) => {
    if (statusFilter !== "all" && sale.status !== statusFilter) return false;
    return true;
  });
  const openCredit = sales
    .filter((sale) => sale.status !== "settled")
    .reduce((sum, sale) => sum + sale.creditAmount, 0);
  const paymentsInRange = payments.filter((payment) => inRange(payment.createdAt, fromDate, toDate));
  const collected = paymentsInRange.reduce((sum, payment) => sum + payment.amount, 0);
  const todayCollected = payments
    .filter((payment) => inRange(payment.createdAt, dateInput(), dateInput()))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const collect = async (sale: CreditSale & { branch: Branch }) => {
    const amount = Number(amounts[sale.id] || sale.creditAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid collection amount.");
      return;
    }
    if (amount > sale.creditAmount) {
      setMessage("Collection amount cannot be more than the pending balance.");
      return;
    }
    const error = await settleCreditSale(sale.branch, sale.id, amount, {
      mode: modes[sale.id] || "cash",
      collectedBy: currentUser?.displayName || currentUser?.username || "VRSNB Admin",
      collectedRole: currentUser?.role || "unknown",
      remarks: "Collected from VRSNB Admin credit tab",
    });
    if (error) {
      setMessage(error);
      return;
    }
    setAmounts((current) => ({ ...current, [sale.id]: "" }));
    setMessage("Credit collection saved.");
    await fetchCreditSales(sale.branch);
    await fetchCreditPayments(sale.branch);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Open Credit" value={money(openCredit)} icon={<WalletCards className="size-5" />} tone="red" />
        <Kpi label="Collected (Selected Dates)" value={money(collected)} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Collected Today" value={money(todayCollected)} icon={<IndianRupee className="size-5" />} tone="blue" />
        <Kpi label="Credit Bills" value={sales.length} icon={<Receipt className="size-5" />} tone="amber" />
      </div>
      <Panel
        title="VRSNB Credit Register"
        icon={<CreditCard className="size-4" />}
        action={
          <div className="flex flex-wrap gap-2">
            <select className={cn(inputCls, "h-10 w-32 py-1")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="settled">Settled</option>
            </select>
            <button
              className={cn(btnCls, "h-10 bg-white text-slate-700 ring-1 ring-slate-200")}
              onClick={() =>
                csvDownload(
                  "VRSNB_Credit_Register.xls",
                  visibleSales.map((s) => ({
                    Unit: CREDIT_BRANCH_LABEL[s.branch],
                    Bill: s.billNo,
                    Customer: s.customerName,
                    Mobile: s.customerPhone || "-",
                    Total: s.subtotal,
                    Paid: s.amountPaid,
                    Balance: s.creditAmount,
                    Due: s.dueDate || "-",
                    Status: s.status,
                  })),
                )
              }
            >
              <Download className="size-4" /> Excel
            </button>
          </div>
        }
      >
        {message && (
          <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 ring-1 ring-amber-100">
            {message}
          </div>
        )}
        <DataTable
          headers={["Unit", "Bill", "Customer", "Mobile", "Total", "Paid", "Balance", "Due", "Status", "Collect"]}
          rows={visibleSales.map((sale) => [
            CREDIT_BRANCH_LABEL[sale.branch],
            sale.billNo,
            sale.customerName,
            sale.customerPhone || "-",
            money(sale.subtotal),
            money(sale.amountPaid),
            money(sale.creditAmount),
            sale.dueDate || "-",
            <StatusBadge key="status" tone={sale.status === "settled" ? "green" : sale.status === "partial" ? "amber" : "red"}>{sale.status}</StatusBadge>,
            sale.status === "settled" ? (
              <span key="done" className="text-xs font-black text-emerald-700">Settled</span>
            ) : (
              <div key="collect" className="flex min-w-[300px] flex-wrap gap-2">
                <input
                  type="number"
                  min="0"
                  max={sale.creditAmount}
                  className={cn(inputCls, "h-10 w-24 py-1")}
                  placeholder={String(sale.creditAmount)}
                  value={amounts[sale.id] || ""}
                  onChange={(e) => setAmounts((current) => ({ ...current, [sale.id]: e.target.value }))}
                />
                <select
                  className={cn(inputCls, "h-10 w-24 py-1")}
                  value={modes[sale.id] || "cash"}
                  onChange={(e) => setModes((current) => ({ ...current, [sale.id]: e.target.value as any }))}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
                <button onClick={() => void collect(sale)} className={cn(btnCls, "bg-orange-500 text-white shadow-lg shadow-orange-200")}>
                  Collect
                </button>
              </div>
            ),
          ])}
          empty="No VRSNB credit sales found."
        />
      </Panel>
      <Panel title="Credit Collections" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("VRSNB_Credit_Collections.xls", paymentsInRange.map((p) => ({ Unit: CREDIT_BRANCH_LABEL[p.branch], Bill: p.billNo, Amount: p.amount, Mode: p.paymentMode, CollectedBy: p.collectedBy, Date: p.createdAt, Remarks: p.remarks })))}><Download className="size-4" /> Excel</button>}>
        <DataTable
          headers={["Unit", "Bill", "Amount", "Mode", "Collected By", "Date", "Remarks"]}
          rows={paymentsInRange.map((payment) => [
            CREDIT_BRANCH_LABEL[payment.branch],
            payment.billNo,
            money(payment.amount),
            payment.paymentMode.toUpperCase(),
            payment.collectedBy || "-",
            fmtDateTime(payment.createdAt),
            payment.remarks || "-",
          ])}
          empty="No credit collections recorded."
        />
      </Panel>
    </div>
  );
}

function printDailyClosure(props: any, branchLabel: string) {
  const rows = [
    ["Date", dateInput()],
    ["Cashier", props.userName],
    ["Opening Balance", money(props.openingCash)],
    ["—", "—"],
    ["Gross Sales", money(props.grossSales)],
    ["Return Amount", money(props.returnAmount)],
    ["Net Sales", money(props.netSales)],
    ["Cash Sales", money(props.cashSales)],
    ["UPI Sales", money(props.upiSales)],
    ["Card Sales", money(props.cardSales)],
    ["Credit Sales", money(props.creditBillAmount)],
    ["Credit Collections", money(props.clearedCredit)],
    ["Advance Collected", money(props.advanceCollected)],
    ["Advance Balance Collected", money(props.advanceBalanceCollected)],
    ["Purchase Payments", money(props.purchasePaid)],
    ["Expenses", money(props.expenseAmount)],
    ["Bank Deposits", money(props.depositAmount)],
    ["Pending Credit", money(props.pendingCredit)],
    ["—", "—"],
    ["Expected Cash", money(props.expectedCash)],
    ["Closing Cash Counted", money(props.closingCash)],
    ["Difference", money(props.diff)],
    ["Remarks", props.remarks || "-"],
  ];
  const body = `<div class="stamp">DAILY CLOSURE REPORT</div><h2 class="c">${branchLabel}</h2>${rows
    .map(([label, value]) =>
      label === "—"
        ? `<div class="dash"></div>`
        : `<div class="row"><span>${label}</span><b>${value}</b></div>`,
    )
    .join("")}<div class="dash"></div><div class="c">Printed ${new Date().toLocaleString("en-IN")}</div>`;
  printHtml(`${branchLabel} Daily Closure - ${dateInput()}`, body);
}

function DailyClosureTab({ userName, ...props }: any) {
  const { cashierClosures, addCashierClosure } = useBranchOpsStore();
  const [remoteClosures, setRemoteClosures] = useState<any[]>([]);
  const [form, setForm] = useState({
    openingCash: "0",
    closingCash: "",
    remarks: "",
  });
  const cashMovementsNet = props.movementInRange
    .filter((m: any) => m.paymentMode === "cash")
    .reduce(
      (s: number, m: any) => s + (m.direction === "in" ? m.amount : -m.amount),
      0,
    );
  const expectedCash = Number(form.openingCash || 0) + cashMovementsNet;
  const diff = Number(form.closingCash || 0) - expectedCash;
  const save = async () => {
    const closureDate = dateInput();
    const payload = {
      branch: BRANCH,
      closure_date: closureDate,
      cashier: userName,
      opening_cash: Number(form.openingCash || 0),
      cash_total: props.cashSales,
      upi_total: props.upiSales,
      card_total: props.cardSales,
      credit_billed: props.creditBillAmount,
      credit_collected: props.clearedCredit,
      advance_collected: props.advanceCollected,
      advance_balance_collected: props.advanceBalanceCollected,
      refunds: props.returnAmount,
      expenses: props.expenseAmount,
      purchase_payments: props.purchasePaid,
      discounts: 0,
      bill_count: props.billsCount,
      duplicate_prints: 0,
      expected_cash: expectedCash,
      actual_cash: Number(form.closingCash || 0),
      difference: diff,
      notes: form.remarks || null,
      status: "finalized",
    };
    const { data: existingClosure, error: lookupError } = await supabase
      .from("branch_daily_closures")
      .select("id,status,cashier")
      .eq("branch", BRANCH)
      .eq("closure_date", closureDate)
      .maybeSingle();
    if (lookupError) {
      window.alert(`Failed to check closure status: ${lookupError.message}`);
      return;
    }
    if (existingClosure?.status === "finalized") {
      window.alert(`The ${BRANCH} closure for ${closureDate} is already finalized by ${existingClosure.cashier}. Reopen it with admin approval before making changes.`);
      return;
    }
    const saveQuery = existingClosure?.id
      ? supabase.from("branch_daily_closures").update(payload).eq("id", existingClosure.id)
      : supabase.from("branch_daily_closures").insert(payload);
    const { error } = await saveQuery;
    if (error) {
      window.alert(`Failed to save closure in Supabase: ${error.message}`);
      return;
    }
    addCashierClosure({
      branch: BRANCH,
      cashier: userName,
      openingCash: Number(form.openingCash || 0),
      closingCash: Number(form.closingCash || 0),
      expectedCash,
      difference: diff,
      cash: props.cashSales,
      upi: props.upiSales,
      card: props.cardSales,
      returns: props.returnAmount,
      discounts: 0,
      billsCount: props.billsCount,
      duplicateBills: 0,
      creditSales: props.creditBillAmount,
      creditCollections: props.clearedCredit,
      notes: form.remarks,
    });
    setForm({ openingCash: "0", closingCash: "", remarks: "" });
  };
  useEffect(() => {
    let alive = true;
    const loadClosures = async () => {
      const { data, error } = await supabase
        .from("branch_daily_closures")
        .select("*")
        .in("branch", CREDIT_BRANCHES)
        .order("closure_date", { ascending: false });
      if (!alive) return;
      if (!error && Array.isArray(data)) setRemoteClosures(data);
    };
    void loadClosures();
    return () => {
      alive = false;
    };
  }, []);
  const rows = useMemo(() => {
    const localRows = cashierClosures.filter((c) => CREDIT_BRANCHES.includes(c.branch as Branch));
    const mappedRemote = remoteClosures.map((row) => ({
      id: `remote-${row.branch}-${row.closure_date}-${row.cashier}`,
      branch: row.branch as Branch,
      createdAt: row.created_at || `${row.closure_date || dateInput()}T00:00:00`,
      cashier: row.cashier || "-",
      openingCash: Number(row.opening_cash || 0),
      expectedCash: Number(row.expected_cash || 0),
      closingCash: Number(row.actual_cash || 0),
      difference: Number(row.difference || 0),
      billsCount: Number(row.bill_count || 0),
      cash: Number(row.cash_total || 0),
      upi: Number(row.upi_total || 0),
      card: Number(row.card_total || 0),
      returns: Number(row.refunds || 0),
      notes: row.notes || "",
    }));
    const seen = new Set<string>();
    return [...mappedRemote, ...localRows].filter((row) => {
      const key = `${row.branch}-${new Date(row.createdAt).toDateString()}-${row.cashier}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [cashierClosures, remoteClosures]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          label="Gross Sales"
          value={money(props.grossSales)}
          icon={<Receipt className="size-5" />}
          tone="amber"
        />
        <Kpi
          label="Return Amount"
          value={money(props.returnAmount)}
          icon={<RotateCcw className="size-5" />}
          tone="red"
        />
        <Kpi
          label="Net Sales"
          value={money(props.netSales)}
          icon={<IndianRupee className="size-5" />}
          tone="green"
        />
        <Kpi
          label="Pending Credit"
          value={money(props.pendingCredit)}
          icon={<WalletCards className="size-5" />}
          tone="purple"
        />
      </div>
      <Panel
        title="Daily Closure Summary"
        icon={<CalendarClock className="size-4" />}
        action={
          <div className="flex gap-2">
            <button
              onClick={() =>
                printDailyClosure(
                  {
                    openingCash: Number(form.openingCash || 0),
                    closingCash: Number(form.closingCash || 0),
                    expectedCash,
                    diff,
                    remarks: form.remarks,
                    userName,
                    ...props,
                  },
                  "VRSNB",
                )
              }
              className={cn(
                btnCls,
                "bg-white text-slate-700 ring-1 ring-slate-200",
              )}
            >
              <Printer className="size-4" />
              Print
            </button>
            <button
              onClick={() =>
                csvDownload("VRSNB_Daily_Closure.xls", [
                  {
                    OpeningBalance: form.openingCash,
                    GrossSales: props.grossSales,
                    ReturnAmount: props.returnAmount,
                    NetSales: props.netSales,
                    CashSales: props.cashSales,
                    UPISales: props.upiSales,
                    CardSales: props.cardSales,
                    CreditSales: props.creditBillAmount,
                    PurchasePayments: props.purchasePaid,
                    BankDeposits: props.depositAmount,
                    ClosingBalance: form.closingCash,
                    Difference: diff,
                    Remarks: form.remarks,
                  },
                ])
              }
              className={cn(btnCls, "bg-slate-950 text-white")}
            >
              <Download className="size-4" />
              Export
            </button>
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-3">
            <Field label="Opening Balance">
              <input
                type="number"
                className={inputCls}
                value={form.openingCash}
                onChange={(e) =>
                  setForm({ ...form, openingCash: e.target.value })
                }
              />
            </Field>
            <Field label="Closing Cash Counted">
              <input
                type="number"
                className={inputCls}
                value={form.closingCash}
                onChange={(e) =>
                  setForm({ ...form, closingCash: e.target.value })
                }
              />
            </Field>
            <Field label="Remarks">
              <textarea
                className={inputCls}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </Field>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-black uppercase text-slate-500">
                Expected Cash
              </p>
              <p className="text-2xl font-black">{money(expectedCash)}</p>
              <p
                className={cn(
                  "text-sm font-black",
                  diff === 0 ? "text-emerald-700" : "text-red-600",
                )}
              >
                Difference {money(diff)}
              </p>
            </div>
            <button
              className={cn(btnCls, "w-full bg-slate-950 text-white")}
              onClick={save}
            >
              Save Closure
            </button>
          </div>
          <DataTable
            headers={["Field", "Amount"]}
            rows={[
              ["Opening balance", money(Number(form.openingCash || 0))],
              ["Total gross sales", money(props.grossSales)],
              ["Return amount", money(props.returnAmount)],
              ["Net sales", money(props.netSales)],
              ["Cash sales", money(props.cashSales)],
              ["UPI sales", money(props.upiSales)],
              ["Card sales", money(props.cardSales)],
              ["Credit sales", money(props.creditBillAmount)],
              ["Purchase payments", money(props.purchasePaid)],
              ["Bank deposits", money(props.depositAmount)],
              ["Cleared credit", money(props.clearedCredit)],
              ["Pending credit", money(props.pendingCredit)],
              ["Closing balance", money(Number(form.closingCash || 0))],
              ["Difference", money(diff)],
            ]}
          />
        </div>
      </Panel>
      <Panel title="Cashier Counter Open & Closure Reports" icon={<History className="size-4" />}>
        <DataTable
          headers={[
            "Unit",
            "Date",
            "Cashier",
            "Opening",
            "Expected",
            "Closing",
            "Difference",
            "Bills",
            "Cash",
            "UPI",
            "Card",
            "Returns",
            "Remarks",
          ]}
          rows={rows.map((c) => [
            CREDIT_BRANCH_LABEL[c.branch as Branch] || c.branch,
            fmtDateTime(c.createdAt),
            c.cashier,
            money(c.openingCash),
            money(c.expectedCash),
            money(c.closingCash),
            money(c.difference),
            c.billsCount,
            money(c.cash),
            money(c.upi),
            money(c.card),
            money(c.returns),
            c.notes,
          ])}
          empty="No cashier counter closure reports saved."
        />
      </Panel>
    </div>
  );
}

function ReportsTab(props: any) {
  const { creditSales } = useBranchStore();
  const { purchases, purchasePayments, expenses, bankDeposits, wasteLogs, quotations, cashierClosures } =
    useBranchOpsStore();
  const dueCredits = (creditSales[BRANCH] || []).filter((c) => c.status !== "settled");
  const whatsappRows: any[] = [];
  const reminderRows: any[] = [];
  const disputeRows: any[] = [];
  const branchPurchases = purchases.filter((p) => p.branch === BRANCH);
  const supplierDue = branchPurchases.reduce((sum, p) => sum + Math.max(0, p.total - p.paidAmount), 0);
  const purchaseTotal = branchPurchases.reduce((sum, p) => sum + p.total, 0);
  const branchExpenses = expenses.filter((e) => e.branch === BRANCH);
  const branchDeposits = bankDeposits.filter((d) => d.branch === BRANCH);
  const branchWaste = wasteLogs.filter((w) => w.branch === BRANCH);
  const branchQuotes = quotations.filter((q) => q.branch === BRANCH);
  const branchClosures = cashierClosures.filter((c) => c.branch === BRANCH);
  const collectionTotal = props.cashSales + props.upiSales + props.cardSales + props.clearedCredit + props.advanceCollected + props.advanceBalanceCollected;
  const rupeeRows = [
    ["Regular bill sales", props.salesBreakdown.billSales, "Bill value before advances and credit recovery"],
    ["Cash sales collected", props.cashSales, "Cash received from bill payments"],
    ["UPI sales collected", props.upiSales, "UPI received from bill payments"],
    ["Card sales collected", props.cardSales, "Card received from bill payments"],
    ["Advance collected", props.salesBreakdown.advanceCollected, "New advance money collected"],
    ["Advance balance collected", props.salesBreakdown.advanceBalanceCollected, "Pending advance balance collected"],
    ["Credit billed", props.salesBreakdown.creditBilled, "Credit value created"],
    ["Credit collected", props.salesBreakdown.creditCollected, "Old credit recovered"],
    ["Returns deducted", -props.salesBreakdown.returns, "Refund / return impact"],
    ["Expenses deducted", -props.salesBreakdown.expenses, "Admin expenses impact"],
    ["Total collections", collectionTotal, "Cash + UPI + card + credit recovery + advances"],
    ["Net sales shown", props.salesBreakdown.netSales, "Sales after returns"],
  ];
  const downloadBranchWorkbook = () => downloadExcelWorkbook("VRSNB_Branch_Report_Workbook.xls", [
    {
      name: "Summary",
      rows: [{
        FromDate: props.fromDate,
        ToDate: props.toDate,
        Branch: props.reportLabel || "VRSNB Branch",
        GeneratedBy: props.userName,
        BillSales: props.salesBreakdown.billSales,
        GrossSales: props.grossSales,
        ReturnAmount: props.returnAmount,
        NetSales: props.netSales,
        CashSales: props.cashSales,
        UPISales: props.upiSales,
        CardSales: props.cardSales,
        CreditSales: props.creditBillAmount,
        CreditCollections: props.clearedCredit,
        AdvanceCollected: props.advanceCollected,
        AdvanceBalanceCollected: props.advanceBalanceCollected,
        TotalCollections: collectionTotal,
        PurchaseTotal: purchaseTotal,
        SupplierDue: supplierDue,
        SupplierPayments: props.purchasePaid,
        Expenses: props.expenseAmount,
        BankDeposits: props.depositAmount,
        PendingCredit: props.pendingCredit,
      }],
    },
    {
      name: "Rupee Story",
      rows: rupeeRows.map(([Source, Amount, Meaning]) => ({ Source, Amount, Meaning })),
    },
    {
      name: "Item Sales",
      rows: props.topItems.map((item: any) => ({
        Item: item.name,
        Quantity: item.qty,
        Gross: item.gross,
        Returns: item.returns,
        Net: item.net,
      })),
    },
    {
      name: "Credit",
      rows: dueCredits.map((credit) => ({
        Customer: credit.customerName,
        Bill: credit.billNo,
        Total: credit.subtotal,
        Paid: credit.amountPaid,
        Balance: credit.creditAmount,
        DueDate: credit.dueDate || "",
        Status: credit.status,
      })),
    },
    {
      name: "Purchases",
      rows: branchPurchases.map((purchase) => ({
        Invoice: purchase.invoiceNo,
        Supplier: purchase.supplier,
        Total: purchase.total,
        Paid: purchase.paidAmount,
        Due: Math.max(0, purchase.total - purchase.paidAmount),
        Status: Math.max(0, purchase.total - purchase.paidAmount) <= 0 ? "Cleared" : purchase.paidAmount > 0 ? "Partial" : "Pending",
      })),
    },
    {
      name: "Supplier Payments",
      rows: purchasePayments.filter((payment) => payment.branch === BRANCH).map((payment) => ({
        Date: payment.createdAt,
        Supplier: payment.supplier,
        Amount: payment.amount,
        Mode: payment.mode,
        Reference: payment.reference || "",
      })),
    },
    {
      name: "Expenses Deposits",
      rows: [
        ...branchExpenses.map((entry) => ({ Type: "Expense", Date: entry.expenseDate, Details: `${entry.category} - ${entry.description}`, Amount: entry.amount, ModeOrBank: entry.mode.toUpperCase() })),
        ...branchDeposits.map((entry) => ({ Type: "Bank Deposit", Date: entry.depositDate, Details: entry.remarks || entry.transactionRef || entry.slipNo || "", Amount: entry.amount, ModeOrBank: entry.bankAccount })),
      ],
    },
    {
      name: "Waste Quotations",
      rows: [
        ...branchWaste.map((entry) => ({ Type: "Waste", Date: entry.createdAt, Reference: entry.logType, Details: `${entry.itemName} - ${entry.reason}`, ValueOrQty: `${entry.quantity} ${entry.unit}`, Status: entry.verifiedBy })),
        ...branchQuotes.map((entry) => ({ Type: "Quotation", Date: entry.createdAt, Reference: entry.quoteNo, Details: entry.customerName, ValueOrQty: entry.total, Status: entry.status })),
      ],
    },
    {
      name: "Cashier Closures",
      rows: branchClosures.map((closure) => ({
        Date: closure.createdAt,
        Cashier: closure.cashier,
        Expected: closure.expectedCash,
        Closing: closure.closingCash,
        Difference: closure.difference,
        Cash: closure.cash,
        UPI: closure.upi,
        Card: closure.card,
        CreditCollections: closure.creditCollections ?? 0,
      })),
    },
  ]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total Collections"
          value={money(collectionTotal)}
          icon={<IndianRupee className="size-5" />}
          tone="green"
        />
        <Kpi
          label="Pending Credit"
          value={money(props.pendingCredit)}
          icon={<WalletCards className="size-5" />}
          tone="red"
        />
        <Kpi
          label="Supplier Due"
          value={money(supplierDue)}
          icon={<Truck className="size-5" />}
          tone="amber"
        />
        <Kpi
          label="Expenses"
          value={money(props.expenseAmount)}
          icon={<Banknote className="size-5" />}
          tone="red"
        />
      </div>
      <Panel
        title="Complete Branch Reports"
        icon={<FileSpreadsheet className="size-4" />}
        action={
          <div className="flex gap-2">
            <button
              className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")}
              onClick={() => printOverview(props, props.reportLabel || "VRSNB Branch")}
            >
              <Printer className="size-4" />
              Print Summary
            </button>
            <button
              className={cn(btnCls, "bg-slate-950 text-white")}
              onClick={downloadBranchWorkbook}
            >
              <Download className="size-4" />
              Excel Workbook
            </button>
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <div className="mb-3 rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-600">Rupee Story</p>
                  <h3 className="font-serif text-2xl font-black text-slate-950">Where the money came from</h3>
                </div>
                <p className="text-xs font-bold text-slate-500">Every rupee is split by source before totals.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {rupeeRows.map(([label, value, note]) => (
                  <div key={String(label)} className={cn("rounded-2xl border bg-white p-3 shadow-sm", Number(value) < 0 ? "border-red-100" : "border-slate-100")}>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
                    <p className={cn("mt-1 text-xl font-black tabular-nums", Number(value) < 0 ? "text-red-600" : "text-slate-950")}>{money(Number(value))}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">{note}</p>
                  </div>
                ))}
              </div>
            </div>
            <DataTable
              headers={["Source", "Amount", "Meaning"]}
              rows={rupeeRows.map(([label, value, note]) => [label, money(Number(value)), note])}
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Item-wise Sales</h3>
            <DataTable
              headers={["Item", "Qty", "Gross", "Returns", "Net"]}
              rows={props.topItems.map((i: any) => [
                i.name,
                i.qty,
                money(i.gross),
                money(i.returns),
                money(i.net),
              ])}
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Due Payment Report</h3>
            <DataTable
              headers={[
                "Customer",
                "Bill",
                "Total",
                "Paid",
                "Balance",
                "Due Date",
                "Status",
              ]}
              rows={dueCredits.map((c) => [
                c.customerName,
                c.billNo,
                money(c.subtotal),
                money(c.amountPaid),
                money(c.creditAmount),
                c.dueDate,
                c.status,
              ])}
              empty="No due credit records."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Supplier Purchase Position</h3>
            <DataTable
              headers={["Invoice", "Supplier", "Total", "Paid", "Due", "Status"]}
              rows={branchPurchases.map((p) => {
                const due = Math.max(0, p.total - p.paidAmount);
                return [
                  p.invoiceNo,
                  p.supplier,
                  money(p.total),
                  money(p.paidAmount),
                  money(due),
                  due <= 0 ? "Cleared" : p.paidAmount > 0 ? "Partial" : "Pending",
                ];
              })}
              empty="No purchase invoices."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Supplier Payments</h3>
            <DataTable
              headers={["Date", "Supplier", "Amount", "Mode", "Reference"]}
              rows={purchasePayments.filter((p) => p.branch === BRANCH).map((p) => [
                fmtDateTime(p.createdAt),
                p.supplier,
                money(p.amount),
                p.mode.toUpperCase(),
                p.reference || "-",
              ])}
              empty="No supplier payments."
            />
          </div>
          <div className="xl:col-span-2">
            <h3 className="mb-2 font-black">Expenses And Bank Deposits</h3>
            <DataTable
              headers={["Type", "Date", "Details", "Amount", "Mode / Bank"]}
              rows={[
                ...branchExpenses.map((e) => ["Expense", fmtDate(e.expenseDate), `${e.category} - ${e.description}`, money(e.amount), e.mode.toUpperCase()]),
                ...branchDeposits.map((d) => ["Bank Deposit", fmtDate(d.depositDate), d.remarks || d.transactionRef || d.slipNo || "-", money(d.amount), d.bankAccount]),
              ]}
              empty="No expenses or deposits."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Waste Logs</h3>
            <DataTable
              headers={["Date", "Type", "Item", "Qty", "Reason", "Verified By"]}
              rows={branchWaste.map((w) => [fmtDateTime(w.createdAt), w.logType, w.itemName, `${w.quantity} ${w.unit}`, w.reason, w.verifiedBy])}
              empty="No waste logs."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Quotations</h3>
            <DataTable
              headers={["Quote", "Customer", "Mobile", "Items", "Total", "Status"]}
              rows={branchQuotes.map((q) => [q.quoteNo, q.customerName, q.mobile || "-", q.items.length, money(q.total), q.status])}
              empty="No quotations."
            />
          </div>
          <div className="xl:col-span-2">
            <h3 className="mb-2 font-black">Cashier Closure Reconciliation</h3>
            <DataTable
              headers={["Date", "Cashier", "Expected", "Closing", "Difference", "Cash", "UPI", "Card", "Credit Collections"]}
              rows={branchClosures.map((c) => [
                fmtDateTime(c.createdAt),
                c.cashier,
                money(c.expectedCash),
                money(c.closingCash),
                money(c.difference),
                money(c.cash),
                money(c.upi),
                money(c.card),
                money(c.creditCollections ?? 0),
              ])}
              empty="No cashier closures."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">
              WhatsApp Bill Sent/Failed Report
            </h3>
            <DataTable
              headers={["Bill", "Customer", "Status", "Date"]}
              rows={whatsappRows}
              empty="No WhatsApp log table is connected yet. Supabase migration includes vrsnb_whatsapp_logs."
            />
          </div>
          <div>
            <h3 className="mb-2 font-black">Payment Reminder Report</h3>
            <DataTable
              headers={["Bill", "Customer", "Pending", "Last Reminder"]}
              rows={reminderRows}
              empty="No reminder history yet. Supabase migration includes vrsnb_payment_reminders."
            />
          </div>
          <div className="xl:col-span-2">
            <h3 className="mb-2 font-black">Dispute Report</h3>
            <DataTable
              headers={["Date", "Title", "Details", "Raised By", "Status"]}
              rows={disputeRows.map((d) => [
                fmtDateTime(d.createdAt),
                d.title,
                d.details,
                d.raisedBy,
                d.status,
              ])}
              empty="No disputes."
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function StockAuditTab({
  userName,
  branchStock,
  manualUpdateStock,
  fetchBranchData,
  setNotice,
}: {
  userName: string;
  branchStock: Array<{ itemName: string; price: number | null }>;
  manualUpdateStock: (branch: Branch, itemName: string, quantity: number, updatedBy: string, itemBarcode?: number) => Promise<string | null>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const catalogItems = useVRSNBCatalog();
  const { stockCountReports, updateStockCountPhysicalQty, confirmStockCountReport } = useBranchOpsStore();
  const [savingId, setSavingId] = useState("");
  const [savingLine, setSavingLine] = useState("");
  const [physicalDrafts, setPhysicalDrafts] = useState<Record<string, string>>({});
  const [reversingId, setReversingId] = useState("");
  const [reportReversals, setReportReversals] = useState<Record<string, { by: string; reason: string; at: string }>>({});
  const [sort, setSort] = useState<{ field: "difference" | "value"; direction: "asc" | "desc" }>({
    field: "difference",
    direction: "desc",
  });
  const reports = stockCountReports
    .filter((report) => report.branch === BRANCH)
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  const pending = reports.filter((report) => report.status === "Pending Admin Review");

  useEffect(() => {
    let mounted = true;
    void supabase
      .from("branch_operation_records")
      .select("record_id, actor, payload, created_at")
      .eq("branch", BRANCH)
      .eq("record_type", "stock_count_reversal")
      .then(({ data }) => {
        if (!mounted) return;
        const next: Record<string, { by: string; reason: string; at: string }> = {};
        ((data || []) as Array<Record<string, unknown>>).forEach((row) => {
          const payload = (row.payload || {}) as Record<string, unknown>;
          next[String(row.record_id)] = {
            by: String(row.actor || payload.reversedBy || "Admin"),
            reason: String(payload.reason || ""),
            at: String(payload.reversedAt || row.created_at || ""),
          };
        });
        setReportReversals(next);
      });
    return () => { mounted = false; };
  }, []);

  const itemMeta = useMemo(() => {
    const map = new Map<string, { price: number; category: string }>();
    catalogItems.forEach((item) => {
      map.set(normal(item.name), { price: Number(item.price || 0), category: String(item.category || "-") });
    });
    branchStock.forEach((item) => {
      const key = normal(item.itemName);
      const current = map.get(key) ?? { price: 0, category: "-" };
      const livePrice = Number(item.price);
      map.set(key, { ...current, price: Number.isFinite(livePrice) && livePrice > 0 ? livePrice : current.price });
    });
    return map;
  }, [branchStock, catalogItems]);

  const linePrice = (itemName: string) => itemMeta.get(normal(itemName))?.price ?? 0;
  const lineValue = (line: { itemName: string; difference: number }) =>
    Math.round(Number(line.difference || 0) * linePrice(line.itemName) * 100) / 100;
  const openDifferences = pending.reduce(
    (sum, report) => sum + report.lines.filter((line) => line.difference !== 0).length,
    0,
  );
  const openVarianceValue = pending.reduce(
    (sum, report) => sum + report.lines.reduce((lineSum, line) => lineSum + Math.abs(lineValue(line)), 0),
    0,
  );

  const toggleSort = (field: "difference" | "value") => {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const sortedLines = (report: (typeof reports)[number]) =>
    [...report.lines].sort((a, b) => {
      const left = sort.field === "difference" ? Number(a.difference || 0) : lineValue(a);
      const right = sort.field === "difference" ? Number(b.difference || 0) : lineValue(b);
      const result = left - right;
      return (sort.direction === "asc" ? result : -result) || a.itemName.localeCompare(b.itemName);
    });

  const savePhysicalQty = async (report: (typeof reports)[number], line: (typeof report.lines)[number]) => {
    const key = `${report.id}::${line.itemName}`;
    const raw = physicalDrafts[key] ?? String(line.physicalQty);
    if (raw.trim() === "") {
      setNotice("Enter a physical quantity before saving.");
      return;
    }
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setNotice("Physical stock must be a valid number greater than or equal to zero.");
      return;
    }
    const unit = String(line.unit || "").toLowerCase();
    if ((unit === "pcs" || unit.includes("nos")) && !Number.isInteger(quantity)) {
      setNotice("Piece items must use a whole-number physical quantity.");
      return;
    }
    const rounded = Math.round(quantity * 1000) / 1000;
    if (Math.abs(rounded - Number(line.physicalQty || 0)) < 0.0001) {
      setNotice(`${line.itemName} already has physical stock ${rounded}.`);
      return;
    }
    const ok = window.confirm(
      `Change ${line.itemName} physical stock in ${report.reportNo} from ${line.physicalQty} to ${rounded}?`,
    );
    if (!ok) return;
    setSavingLine(key);
    try {
      const error = await updateStockCountPhysicalQty(report.id, line.itemName, rounded, userName);
      if (error) {
        setNotice(error);
        return;
      }
      setPhysicalDrafts((current) => ({ ...current, [key]: String(rounded) }));
      setNotice(`${report.reportNo}: ${line.itemName} physical stock updated to ${rounded}.`);
    } finally {
      setSavingLine("");
    }
  };

  const downloadAudit = () => {
    const rows = reports.flatMap((report) =>
      sortedLines(report).map((line) => {
        const differenceValue = lineValue(line);
        return {
          "Report No": report.reportNo,
          "Report Status": report.status,
          "Reported Date": fmtDateTime(report.createdAt),
          "Reported By": report.reportedBy,
          "Confirmed By": report.confirmedBy || "",
          "Reversed By": reportReversals[report.id]?.by || "",
          "Reversal Reason": reportReversals[report.id]?.reason || "",
          "Reversed At": reportReversals[report.id]?.at ? fmtDateTime(reportReversals[report.id].at) : "",
          Category: itemMeta.get(normal(line.itemName))?.category ?? "-",
          Item: line.itemName,
          Unit: line.unit || "",
          "System Qty": line.systemQty,
          "Physical Qty": line.physicalQty,
          Difference: line.difference,
          "Difference Value": differenceValue,
          "Absolute Difference Value": Math.abs(differenceValue),
          Status: line.difference > 0 ? "Short" : line.difference < 0 ? "Excess" : "Matched",
          "Admin Edited": line.editedAt ? "Yes" : "No",
          "Original Physical Qty": line.originalPhysicalQty ?? line.physicalQty,
          "Edited By": line.editedBy || "",
          "Edited At": line.editedAt ? fmtDateTime(line.editedAt) : "",
        };
      }),
    );
    downloadExcel(
      `${BRANCH}_Stock_Audit_${dateInput()}.xls`,
      `${BRANCH} Stock Audit`,
      rows,
    );
  };

  const confirmReport = async (reportId: string) => {
    const report = reports.find((row) => row.id === reportId);
    if (!report) return;
    if (report.status !== "Pending Admin Review") {
      setNotice(`${report.reportNo} is already ${report.status}.`);
      return;
    }
    const ok = window.confirm(
      `Confirm ${report.reportNo} and update VRSNB stock to the physical counted quantities?`,
    );
    if (!ok) return;
    setSavingId(reportId);
    try {
      const { error: rpcError } = await supabase.rpc("confirm_branch_stock_count_report", {
        p_report_id: report.id,
        p_confirmed_by: userName,
      });
      if (rpcError) {
        const missingRpc =
          /confirm_branch_stock_count_report|could not find the function|does not exist|schema cache|not found/i.test(
            rpcError.message || "",
          );
        if (!missingRpc) {
          setNotice(`Stock count confirmation failed: ${rpcError.message}`);
          return;
        }
        for (const line of report.lines) {
          const catalogItem = catalogItems.find((item) => normal(item.name) === normal(line.itemName));
          const error = await manualUpdateStock(BRANCH, line.itemName, line.physicalQty, userName, catalogItem?.barcode);
          if (error) {
            setNotice(
              `${report.reportNo} stopped at ${line.itemName}: ${error}. Re-check Stock Audit before confirming again.`,
            );
            return;
          }
        }
      }
      confirmStockCountReport(report.id, userName);
      await fetchBranchData(BRANCH);
      setNotice(`${report.reportNo} confirmed. VRSNB stock updated and variance sent to Owner/Admin.`);
    } finally {
      setSavingId("");
    }
  };

  const reverseReport = async (reportId: string) => {
    const report = reports.find((row) => row.id === reportId);
    if (!report || report.status !== "Confirmed") return;
    if (reportReversals[report.id]) {
      setNotice(`${report.reportNo} was already reversed.`);
      return;
    }
    const reason = window.prompt(`Reason for reversing ${report.reportNo}?`)?.trim() || "";
    if (!reason) {
      setNotice("A reversal reason is mandatory.");
      return;
    }
    if (!window.confirm(`Reverse ${report.reportNo} and restore the exact pre-confirmation quantities? This is blocked if stock changed after confirmation.`)) return;
    setReversingId(report.id);
    try {
      const { data, error } = await supabase.rpc("reverse_branch_stock_count_report", {
        p_report_id: report.id,
        p_reversed_by: userName,
        p_reason: reason,
      });
      if (error) {
        setNotice(`Stock audit reversal failed: ${error.message}`);
        return;
      }
      const payload = (data || {}) as Record<string, unknown>;
      setReportReversals((current) => ({ ...current, [report.id]: { by: userName, reason, at: new Date().toISOString() } }));
      await fetchBranchData(BRANCH);
      setNotice(`${String(payload.reportNo || report.reportNo)} reversed. Pre-confirmation stock was restored.`);
    } finally {
      setReversingId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pending Reports" value={pending.length} icon={<ClipboardCheck className="size-4" />} tone="amber" />
        <Kpi label="Total Reports" value={reports.length} icon={<PackageCheck className="size-4" />} tone="blue" />
        <Kpi label="Open Difference Lines" value={openDifferences} icon={<AlertTriangle className="size-4" />} tone="red" />
        <Kpi label="Open Variance Value" value={money(openVarianceValue)} icon={<IndianRupee className="size-4" />} tone={openVarianceValue ? "red" : "green"} />
      </div>

      <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">Admin stock verification</p>
          <p className="text-xs font-semibold text-slate-500">Pending physical quantities can be corrected before confirmation. Click Difference or Difference Value to sort.</p>
        </div>
        <button type="button" onClick={downloadAudit} className={cn(btnCls, "bg-emerald-600 text-white shadow-lg shadow-emerald-100")}>
          <FileSpreadsheet className="size-4" /> Download Excel
        </button>
      </div>

      {reports.length === 0 ? (
        <Panel title="Incoming Stock Count Reports" icon={<ClipboardCheck className="size-4" />}>
          <p className="text-sm font-bold text-slate-500">No VRSNB receiver stock-count reports submitted yet.</p>
        </Panel>
      ) : (
        reports.map((report) => (
          <Panel
            key={report.id}
            title={`${report.reportNo} - ${report.status}`}
            icon={<ClipboardCheck className="size-4" />}
            action={
              report.status === "Pending Admin Review" ? (
                <button
                  type="button"
                  disabled={savingId === report.id || Boolean(savingLine)}
                  onClick={() => confirmReport(report.id)}
                  className={cn(btnCls, "bg-orange-500 text-white shadow-lg shadow-orange-200 disabled:opacity-50")}
                >
                  {savingId === report.id ? "Saving..." : "Confirm & Save"}
                </button>
              ) : reportReversals[report.id] ? (
                <StatusBadge tone="amber">Reversed</StatusBadge>
              ) : (
                <button
                  type="button"
                  disabled={reversingId === report.id}
                  onClick={() => void reverseReport(report.id)}
                  className={cn(btnCls, "bg-red-600 text-white shadow-lg shadow-red-100 disabled:opacity-50")}
                >
                  <RotateCcw className="size-4" /> {reversingId === report.id ? "Reversing..." : "Reverse Confirmation"}
                </button>
              )
            }
          >
            <div className="mb-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-3">
              <span>Reported by: <b className="text-slate-900">{report.reportedBy}</b></span>
              <span>Date: <b className="text-slate-900">{fmtDateTime(report.createdAt)}</b></span>
              <span>Confirmed by: <b className="text-slate-900">{report.confirmedBy || "-"}</b></span>
              {reportReversals[report.id] && <span className="sm:col-span-3 rounded-xl bg-red-50 p-2 text-red-700">Reversed by <b>{reportReversals[report.id].by}</b> · {reportReversals[report.id].at ? fmtDateTime(reportReversals[report.id].at) : ""} · {reportReversals[report.id].reason}</span>}
            </div>
            <div className="overflow-x-auto rounded-3xl border border-slate-200">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">System Qty</th>
                    <th className="px-4 py-3">Physical Qty</th>
                    <th className="px-4 py-3 text-right">
                      <button type="button" onClick={() => toggleSort("difference")} className="ml-auto flex items-center gap-1" title="Sort by stock difference">
                        Difference
                        <ChevronDown className={cn("size-3 transition", sort.field !== "difference" && "opacity-30", sort.field === "difference" && sort.direction === "asc" && "rotate-180")} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button type="button" onClick={() => toggleSort("value")} className="ml-auto flex items-center gap-1" title="Sort by difference value">
                        Difference Value
                        <ChevronDown className={cn("size-3 transition", sort.field !== "value" && "opacity-30", sort.field === "value" && sort.direction === "asc" && "rotate-180")} />
                      </button>
                    </th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Edit History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sortedLines(report).map((line) => {
                    const key = `${report.id}::${line.itemName}`;
                    const draft = physicalDrafts[key] ?? String(line.physicalQty);
                    const parsedDraft = Number(draft);
                    const changed = draft.trim() !== "" && Number.isFinite(parsedDraft) && Math.abs(parsedDraft - Number(line.physicalQty || 0)) >= 0.0001;
                    const differenceValue = lineValue(line);
                    const unit = String(line.unit || "").toLowerCase();
                    const step = unit === "pcs" || unit.includes("nos") ? "1" : "0.001";
                    return (
                      <tr key={line.itemName} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-900">{line.itemName}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{itemMeta.get(normal(line.itemName))?.category ?? "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums text-slate-700">{line.systemQty} {line.unit}</td>
                        <td className="px-4 py-3">
                          {report.status === "Pending Admin Review" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step={step}
                                value={draft}
                                onChange={(event) => setPhysicalDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right font-black tabular-nums outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                                aria-label={`Edit physical stock for ${line.itemName}`}
                              />
                              <span className="text-xs font-bold text-slate-400">{line.unit}</span>
                              <button
                                type="button"
                                disabled={!changed || savingLine === key}
                                onClick={() => savePhysicalQty(report, line)}
                                className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                {savingLine === key ? "Saving..." : "Save"}
                              </button>
                            </div>
                          ) : (
                            <span className="font-black tabular-nums">{line.physicalQty} {line.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StatusBadge tone={line.difference === 0 ? "green" : line.difference > 0 ? "red" : "blue"}>
                            {line.difference > 0 ? `+${line.difference}` : line.difference}
                          </StatusBadge>
                        </td>
                        <td className={cn("px-4 py-3 text-right font-black tabular-nums", differenceValue > 0 ? "text-red-600" : differenceValue < 0 ? "text-blue-600" : "text-emerald-700")}>
                          {money(differenceValue)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={line.difference === 0 ? "green" : line.difference > 0 ? "red" : "blue"}>
                            {line.difference > 0 ? "Short" : line.difference < 0 ? "Excess" : "Matched"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                          {line.editedAt ? (
                            <div className="space-y-1">
                              <p className="font-black text-amber-700">Admin corrected</p>
                              <p>Original: <b className="text-slate-800">{line.originalPhysicalQty ?? line.physicalQty} {line.unit}</b></p>
                              <p>{line.editedBy || "Admin"} · {fmtDateTime(line.editedAt)}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400">Not edited</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}

function IncomingDisputeReview({ userName }: { userName: string }) {
  const { incoming, fetchBranchData, confirmIncoming } = useBranchStore();
  const { notifications, updateNotificationStatus } = useBranchOpsStore();
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const disputes = (incoming[BRANCH] || []).filter((item) => item.disputed && !item.confirmed);

  useEffect(() => {
    void fetchBranchData(BRANCH);
  }, [fetchBranchData]);

  useEffect(() => {
    setQtyById((prev) => {
      const next = { ...prev };
      disputes.forEach((item) => {
        if (next[item.id] === undefined) next[item.id] = String(item.quantity);
      });
      return next;
    });
  }, [disputes]);

  const resolveAndConfirm = async (incomingId: string) => {
    const item = disputes.find((row) => row.id === incomingId);
    if (!item) return;
    const correctedQty = Number(qtyById[incomingId] ?? item.quantity);
    if (!Number.isFinite(correctedQty) || correctedQty < 0) {
      setMessage("Enter a valid corrected quantity before confirming.");
      return;
    }
    setSavingId(incomingId);
    setMessage("");
    const { error } = await supabase
      .from("branch_incoming")
      .update({
        quantity: Math.round(correctedQty * 1000) / 1000,
        disputed: false,
        dispute_reason: `${item.disputeReason || "Dispute"} | Resolved by ${userName}`,
      })
      .eq("id", incomingId)
      .eq("branch", BRANCH);
    if (error) {
      setMessage(`Could not update disputed stock: ${error.message}`);
      setSavingId("");
      return;
    }
    await fetchBranchData(BRANCH);
    const confirmError = await confirmIncoming(BRANCH, incomingId);
    if (confirmError) {
      setMessage(confirmError);
      setSavingId("");
      return;
    }
    notifications
      .filter((n) => n.branch === BRANCH && n.type === "Stock Dispute" && n.status !== "Resolved" && n.details.includes(item.itemName))
      .forEach((n) => updateNotificationStatus(n.id, "Resolved", userName));
    setMessage(`${item.itemName} confirmed with corrected quantity ${correctedQty} ${item.unit}. Stock synced.`);
    setSavingId("");
    await fetchBranchData(BRANCH);
  };

  if (disputes.length === 0) return null;

  return (
    <Panel title="Incoming Stock Dispute Review" icon={<AlertTriangle className="size-4" />}>
      {message && <p className="mb-3 rounded-2xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">{message}</p>}
      <DataTable
        headers={["Item", "Dispatched Qty", "Correct Qty", "Reason", "Raised By", "Action"]}
        rows={disputes.map((item) => [
          <span key="i" className="font-black">{item.itemName}</span>,
          <span key="d" className="font-black tabular-nums">{item.quantity} {item.unit}</span>,
          <input
            key="q"
            type="number"
            min="0"
            step={item.unit === "kg" ? "0.001" : "1"}
            value={qtyById[item.id] ?? String(item.quantity)}
            onChange={(event) => setQtyById((prev) => ({ ...prev, [item.id]: event.target.value }))}
            className="h-10 w-28 rounded-2xl border border-slate-200 px-3 text-sm font-black tabular-nums"
          />,
          item.disputeReason || "-",
          item.disputedBy || "-",
          <button
            key="a"
            type="button"
            disabled={savingId === item.id}
            onClick={() => void resolveAndConfirm(item.id)}
            className={cn(btnCls, "bg-orange-500 text-white shadow-lg shadow-orange-200 disabled:opacity-50")}
          >
            {savingId === item.id ? "Saving..." : "Confirm & Sync"}
          </button>,
        ])}
      />
    </Panel>
  );
}

function NotificationsTab({ userName }: { userName: string }) {
  const { notifications, updateNotificationStatus } = useBranchOpsStore();
  const rows = notifications.filter((n) => n.branch === BRANCH && n.type !== "Stock Dispute");
  return (
    <div className="space-y-4">
      <Panel title="Admin Notifications" icon={<Bell className="size-4" />}>
        <DataTable
          headers={[
            "Date",
            "Type",
            "Title",
            "Details",
            "Raised By",
            "Status",
            "Action",
          ]}
          rows={rows.map((n) => [
            fmtDateTime(n.createdAt),
            n.type,
            n.title,
            n.details,
            n.raisedBy,
            <StatusBadge
              key="s"
              tone={
                n.status === "Resolved"
                  ? "green"
                  : n.status === "Seen"
                    ? "blue"
                    : "amber"
              }
            >
              {n.status}
            </StatusBadge>,
            <div key="a" className="flex gap-2">
              <button
                className={cn(btnCls, "bg-blue-50 text-blue-700")}
                onClick={() => updateNotificationStatus(n.id, "Seen", userName)}
              >
                Review
              </button>
              <button
                className={cn(btnCls, "bg-emerald-50 text-emerald-700")}
                onClick={() =>
                  updateNotificationStatus(n.id, "Resolved", userName)
                }
              >
                Clear / Resolve
              </button>
            </div>,
          ])}
          empty="No notifications for VRSNB."
        />
      </Panel>
    </div>
  );
}

function AuditTab() {
  const { auditLogs } = useBranchOpsStore();
  const rows = auditLogs.filter((a) => a.branch === BRANCH);
  return (
    <Panel
      title="Audit Logs"
      icon={<ShieldCheck className="size-4" />}
      action={
        <button
          className={cn(btnCls, "bg-slate-950 text-white")}
          onClick={() =>
            csvDownload(
              "VRSNB_Audit_Logs.xls",
              rows.map((r) => ({
                Date: fmtDateTime(r.createdAt),
                User: r.user,
                Action: r.action,
                Previous: r.previousValue,
                New: r.newValue,
              })),
            )
          }
        >
          <Download className="size-4" />
          Export
        </button>
      }
    >
      <DataTable
        headers={["Date", "User", "Action", "Previous", "New"]}
        rows={rows.map((r) => [
          fmtDateTime(r.createdAt),
          r.user,
          r.action,
          r.previousValue,
          r.newValue,
        ])}
        empty="No audit logs found."
      />
    </Panel>
  );
}

function DataTable({
  headers,
  rows,
  empty = "No records found.",
}: {
  headers: string[];
  rows?: ReactNode[][];
  empty?: string;
}) {
  const safeRows = rows || [];
  const [query, setQuery] = useState("");
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = safeRows.length > 150 ? 50 : 25;

  const cellText = (node: ReactNode): string => {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(cellText).join(" ");
    if (isValidElement(node)) return cellText((node.props as { children?: ReactNode }).children);
    return "";
  };

  const preparedRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = !search
      ? [...safeRows]
      : safeRows.filter((row) => row.some((cell) => cellText(cell).toLowerCase().includes(search)));
    if (sortIndex == null) return filtered;
    const direction = sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = cellText(a[sortIndex]).trim();
      const right = cellText(b[sortIndex]).trim();
      const leftNumber = Number(left.replace(/[₹,%\s,]/g, ""));
      const rightNumber = Number(right.replace(/[₹,%\s,]/g, ""));
      const bothNumbers = left !== "" && right !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
      if (bothNumbers) return (leftNumber - rightNumber) * direction;
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [query, safeRows, sortDirection, sortIndex]);

  useEffect(() => {
    setPage(1);
  }, [query, sortDirection, sortIndex, safeRows.length]);

  if (!safeRows.length)
    return (
      <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400 ring-1 ring-slate-100">
        {empty}
      </div>
    );

  const totalPages = Math.max(1, Math.ceil(preparedRows.length / pageSize));
  const activePage = Math.min(page, totalPages);
  const pageRows = preparedRows.slice((activePage - 1) * pageSize, activePage * pageSize);
  const toggleSort = (index: number) => {
    if (sortIndex === index) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortIndex(index);
      setSortDirection("asc");
    }
  };

  return (
    <div className="space-y-3">
      {safeRows.length > 5 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputCls, "pl-10")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter this table..."
            />
          </label>
          <p className="text-xs font-black text-slate-500">{preparedRows.length} of {safeRows.length} records</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-3xl border border-slate-200">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map((header, index) => (
                <th key={`${header}-${index}`} className="px-4 py-3">
                  <button type="button" className="flex w-full items-center gap-1 text-left hover:text-slate-950" onClick={() => toggleSort(index)}>
                    <span>{header}</span>
                    <ArrowUpDown className={cn("size-3", sortIndex === index ? "text-orange-500" : "text-slate-300")} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {pageRows.map((row, rowIndex) => (
              <tr key={`${activePage}-${rowIndex}`} className="align-top hover:bg-slate-50/70">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 font-semibold text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preparedRows.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
          <p className="text-xs font-black text-slate-500">Page {activePage} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button disabled={activePage <= 1} className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200 disabled:opacity-40")} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="size-4" /> Previous</button>
            <button disabled={activePage >= totalPages} className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200 disabled:opacity-40")} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next <ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

