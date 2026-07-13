// src/pages/AdminSNBDashboard.tsx
// SNB Admin Dashboard – manager control center for sales, returns, stock, purchase, balance, salesperson, closure and reports.
import {
  Fragment,
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
import { asNumber, useSnbAdminReports } from "@/hooks/useSnbAdminReports";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useBranchStore } from "@/branch/branchStore";
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Banknote,
  ArrowUpDown,
  Eye,
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
  Pencil,
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

const BRANCH: Branch = "SNB";
type TabId =
  | "overview"
  | "sales"
  | "stock"
  | "update-stock"
  | "suppliers"
  | "expenses"
  | "complaints"
  | "waste"
  | "quotations"
  | "credit"
  | "invoices"
  | "purchase-returns"
  | "payments"
  | "bank"
  | "current-cash"
  | "salespersons"
  | "salesperson-report"
  | "cashier-report"
  | "cashier-closure"
  | "closure"
  | "reports"
  | "audit-stock"
  | "history"
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
  { id: "update-stock", label: "Update Stock", icon: Pencil, adminOnly: true },
  { id: "suppliers", label: "Suppliers", icon: Truck, adminOnly: true },
  { id: "expenses", label: "Expenses", icon: Banknote, adminOnly: true },
  { id: "complaints", label: "Complaints", icon: MessageSquareWarning, adminOnly: true },
  { id: "waste", label: "Waste Logs", icon: Trash2, adminOnly: true },
  { id: "quotations", label: "Quotations", icon: FileSpreadsheet, adminOnly: true },
  { id: "credit", label: "Credit", icon: WalletCards, adminOnly: true },
  {
    id: "invoices",
    label: "Purchase Invoices",
    icon: ShoppingCart,
    adminOnly: true,
  },
  {
    id: "purchase-returns",
    label: "Purchase Returns",
    icon: RotateCcw,
    adminOnly: true,
  },
  {
    id: "payments",
    label: "Supplier Payments",
    icon: WalletCards,
    adminOnly: true,
  },
  { id: "bank", label: "Bank Deposits", icon: Landmark, adminOnly: true },
  { id: "current-cash", label: "Current Cash", icon: IndianRupee, adminOnly: true },
  {
    id: "salespersons",
    label: "Salesperson Management",
    icon: UserRound,
    adminOnly: true,
  },
  {
    id: "salesperson-report",
    label: "Salesperson Report",
    icon: BarChart3,
    adminOnly: true,
  },
  {
    id: "cashier-report",
    label: "Cashier Report",
    icon: BarChart3,
    adminOnly: true,
  },
  {
    id: "cashier-closure",
    label: "Cashier Closure",
    icon: CalendarClock,
    adminOnly: true,
  },
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
    icon: PackageCheck,
    adminOnly: true,
  },
  {
    id: "history",
    label: "History",
    icon: History,
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

function useSNBCatalog() {
  const catalogue = useBranchCatalogStore((state) => state.items.SNB);
  return useMemo(() => catalogue.filter((item) => item.active), [catalogue]);
}

function normal(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Same round-off convention as branch sales billing: 2-decimal money rounding,
// and whole-rupee rounding for the final payable total.
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundWholeRupee = (value: number) => Math.round(Math.max(0, value));

function isSyncedPurchaseStatus(value: unknown) {
  const status = normal(String(value ?? ""));
  return status.includes("synced")
    && !status.includes("not synced")
    && !status.includes("unsynced");
}

function purchaseUnitFromCatalog(uom?: string): NonNullable<PurchaseRecord["unit"]> {
  return uom === "Kgs" ? "kg" : "nos";
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
  const title = base.replace(/[_-]+/g, " ").trim() || "SNB Report";
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

export default function AdminSNBDashboard() {
  const { currentUser } = useAuthStore();
  const catalogItems = useSNBCatalog();
  const { loadCatalog, subscribe } = useBranchCatalogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { stock, sales, creditSales: dbCreditSales, creditPayments: dbCreditPayments, fetchBranchData, fetchCreditPayments, manualUpdateStock } = useBranchStore();
  const {
    bills,
    returns,
    purchases,
    purchasePayments,
    cashMovements,
    bankDeposits,
    notifications,
    expenses,
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
  const adminLedger = useBranchLedger(fromDate, toDate, [BRANCH]);
  const dbReports = useSnbAdminReports(fromDate, toDate);

  const userName =
    currentUser?.username || currentUser?.displayName || "SNB Admin";
  const role = currentUser?.role || "";
  const canManage = ["admin_snb", "admin", "owner"].includes(role);
  const selectTab = (next: TabId) => {
    setTab(next);
    setSearchParams(next === "overview" ? {} : { tab: next });
  };

  useEffect(() => {
    const nextTab = requestedTab && TABS.some((item) => item.id === requestedTab) ? requestedTab : "overview";
    setTab((current) => current === nextTab ? current : nextTab);
  }, [requestedTab]);

  useEffect(() => {
    void loadCatalog('SNB');
    return subscribe('SNB');
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
  const branchSalesRows = useMemo(() => sales[BRANCH] || [], [sales]);
  const branchBills = useMemo(
    () =>
      bills.filter(
        (b) => b.branch === BRANCH && inRange(b.createdAt, fromDate, toDate),
      ),
    [bills, fromDate, toDate],
  );
  const branchReturns = useMemo(
    () =>
      returns.filter(
        (r) => r.branch === BRANCH && inRange(r.createdAt, fromDate, toDate),
      ),
    [returns, fromDate, toDate],
  );
  const billedBillNos = useMemo(
    () =>
      new Set(bills.filter((b) => b.branch === BRANCH).map((b) => b.billNo)),
    [bills],
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
  const ledgerRows = adminLedger.closureRows.filter((row) => row.branch === BRANCH);
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
  const ledgerAdvanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_collected), 0);
  const ledgerAdvanceBalanceCollected = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.advance_balance_collected), 0);
  const ledgerBillsCount = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.bill_count), 0);
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
        m.branch === BRANCH &&
        inRange(m.dateTime, fromDate, toDate) &&
        m.direction === "in" &&
        /advance/i.test(m.purpose || ""),
    )
    .reduce((sum, m) => sum + m.amount, 0);
  const advanceCollected = hasLedgerRows ? ledgerAdvanceCollected : advanceCollectionsFallback;
  const advanceBalanceCollected = hasLedgerRows ? ledgerAdvanceBalanceCollected : 0;
  const expenseAmount = expenses
    .filter((e) => e.branch === BRANCH && inRange(`${e.expenseDate}T12:00:00`, fromDate, toDate))
    .reduce((sum, e) => sum + e.amount, 0);
  const transparentGrossSales = hasLedgerRows ? ledgerGrossSales : rawGrossSales;
  const salesBreakdown = {
    billSales: transparentGrossSales,
    advanceCollected,
    advanceBalanceCollected,
    creditBilled: finalCreditBillAmount,
    creditCollected: 0,
    returns: returnAmount,
    expenses: expenseAmount,
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
    () => cashMovements.filter((m) => m.branch === BRANCH),
    [cashMovements],
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
    .filter((d) => d.branch === BRANCH && inRange(d.createdAt, fromDate, toDate))
    .reduce((sum, d) => sum + d.amount, 0);
  const cashBalance = balanceByMode("cash");
  const upiBalance = balanceByMode("upi");
  const cardBalance = balanceByMode("card");

  const pendingCredit = (dbCreditSales[BRANCH] || []).filter((c) => c.status !== "settled").reduce((sum, c) => sum + c.creditAmount, 0);
  const creditPaymentsInRange = (dbCreditPayments[BRANCH] || []).filter((p) => inRange(p.createdAt, fromDate, toDate));
  const clearedCredit = creditPaymentsInRange.reduce((sum, p) => sum + p.amount, 0);
  salesBreakdown.creditCollected = clearedCredit;
  if (!hasLedgerRows) salesBreakdown.totalCollections += clearedCredit;
  const localPurchasePaymentsInRange = purchasePayments.filter(
    (p) => p.branch === BRANCH && inRange(p.createdAt, fromDate, toDate),
  );
  const databasePurchasePaymentsInRange = dbReports.supplierPayments.filter((payment) =>
    inRange(payment.payment_date, fromDate, toDate),
  );
  const useDatabasePurchasePayments = dbReports.refreshedAt !== null && !dbReports.error.includes("snb_supplier_payments");
  const purchasePaid = useDatabasePurchasePayments
    ? databasePurchasePaymentsInRange.reduce((sum, payment) => sum + asNumber(payment.amount), 0)
    : localPurchasePaymentsInRange.reduce((sum, payment) => sum + payment.amount, 0);
  const purchaseCashPaid = useDatabasePurchasePayments
    ? databasePurchasePaymentsInRange
        .filter((payment) => payment.payment_method === "cash")
        .reduce((sum, payment) => sum + asNumber(payment.amount), 0)
    : localPurchasePaymentsInRange
        .filter((payment) => payment.mode === "cash")
        .reduce((sum, payment) => sum + payment.amount, 0);
  const depositsInRange = bankDeposits.filter(
    (d) => d.branch === BRANCH && inRange(d.createdAt, fromDate, toDate),
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
        credit: number;
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
        credit: 0,
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
      row.credit += bill.paymentMode === "credit" ? bill.total : 0;
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
        credit: 0,
      };
      const line = (sale.unitPrice ?? 0) * sale.quantitySold;
      row.grossSales += line;
      row.bills += 1;
      if (amountForLegacyPayment(sale.paymentMethod, "cash")) row.cash += line;
      if (amountForLegacyPayment(sale.paymentMethod, "upi")) row.upi += line;
      if (amountForLegacyPayment(sale.paymentMethod, "card")) row.card += line;
      if (amountForLegacyPayment(sale.paymentMethod, "credit")) row.credit += line;
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
        credit: 0,
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

  const scopedTabs = TABS.filter((item) => !item.adminOnly || canManage);
  const unreadNotifications = notifications.filter(
    (n) => n.branch === BRANCH && n.status === "Unread",
  ).length;
  const pendingSync = purchases.filter(
    (p) =>
      p.branch === BRANCH && !(p.syncedToStock || p.syncStatus === "Synced"),
  ).length;

  const commonProps = {
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
    salespersonRows,
    cashBalance,
    upiBalance,
    cardBalance,
    bankBalance,
    pendingCredit,
    clearedCredit,
    creditPaymentsInRange,
    purchasePaid,
    purchaseCashPaid,
    expenseAmount,
    advanceCollected,
    advanceBalanceCollected,
    salesBreakdown,
    depositAmount,
    movementInRange,
    notice,
    setNotice,
    dbReports,
  };

  if (!canManage) {
    return (
      <div className="p-4">
        <Panel
          title="Access restricted"
          icon={<ShieldCheck className="size-4" />}
        >
          <p className="font-semibold text-slate-600">
            SNB Admin Dashboard is restricted to SNB Admin, Admin, and Owner
            roles.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <main className="min-w-0 space-y-4 px-4 py-5 sm:px-6 xl:px-8">
      {!["stock", "update-stock", "suppliers", "quotations", "salespersons"].includes(tab) && (
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
      {tab === "update-stock" && (
        <UpdateStockTab
          userName={userName}
          branchStock={branchStock}
          catalogItems={catalogItems}
          fetchBranchData={fetchBranchData}
          setNotice={setNotice}
        />
      )}
      {tab === "suppliers" && <SuppliersTab userName={userName} />}
      {tab === "expenses" && <ExpensesTab userName={userName} {...commonProps} />}
      {tab === "complaints" && <ComplaintsTab userName={userName} />}
      {tab === "waste" && <WasteLogsTab userName={userName} />}
      {tab === "quotations" && <QuotationsTab userName={userName} />}
      {tab === "credit" && <CreditTab userName={userName} role={role} fromDate={fromDate} toDate={toDate} />}
      {tab === "invoices" && (
        <PurchaseInvoicesTab
          userName={userName}
          fetchBranchData={fetchBranchData}
          setNotice={setNotice}
          dbReports={dbReports}
        />
      )}
      {tab === "purchase-returns" && (
        <PurchaseReturnsTab
          userName={userName}
          branchStock={branchStock}
          fetchBranchData={fetchBranchData}
          dbReports={dbReports}
          setNotice={setNotice}
        />
      )}
      {tab === "payments" && <SupplierPaymentsTab userName={userName} dbReports={dbReports} setNotice={setNotice} />}
      {tab === "bank" && (
        <BankDepositsTab
          userName={userName}
          cashBalance={cashBalance}
          upiBalance={upiBalance}
          cardBalance={cardBalance}
          bankBalance={bankBalance}
        />
      )}
      {tab === "current-cash" && <CurrentCashTab {...commonProps} />}
      {tab === "salespersons" && (
        <SalespersonManagementTab userName={userName} />
      )}
      {tab === "salesperson-report" && (
        <SalespersonReportTab {...commonProps} />
      )}
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
      {tab === "history" && <HistoryTab {...commonProps} />}
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
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateInput(yesterdayDate);
  const sevenDate = new Date();
  sevenDate.setDate(sevenDate.getDate() - 6);
  const seven = dateInput(sevenDate);
  const preset = fromDate === today && toDate === today
    ? "today"
    : fromDate === yesterday && toDate === yesterday
      ? "yesterday"
      : fromDate === seven && toDate === today
        ? "seven"
        : "custom";
  const quickCls = (active: boolean) =>
    cn(
      btnCls,
      "self-end ring-1",
      active
        ? "bg-orange-500 text-white shadow-lg shadow-orange-200 ring-orange-500"
        : "bg-white text-slate-700 ring-slate-200",
    );
  return (
    <Panel title="Date & Report Filters" icon={<Filter className="size-4" />}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_auto_auto_auto_auto]">
        <Field label="From Date">
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To Date">
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </Field>
        <button className={quickCls(preset === "today")} onClick={() => { setFromDate(today); setToDate(today); }}>Today</button>
        <button className={quickCls(preset === "yesterday")} onClick={() => { setFromDate(yesterday); setToDate(yesterday); }}>Yesterday</button>
        <button className={quickCls(preset === "seven")} onClick={() => { setFromDate(seven); setToDate(today); }}>7 Days</button>
        <button className={quickCls(preset === "custom")} type="button">Custom</button>
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

function OverviewTab(props: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => printOverview(props, "SNB")}
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

function buildSalesRows(props: any) {
  return [
    ...props.branchBills.map((b: any) => ({
      type: "Sale",
      no: b.billNo,
      date: b.createdAt,
      customer: b.creditCustomerName || "-",
      person: b.salesperson,
      cashier: b.biller || "-",
      gross: b.total,
      returns: 0,
      net: b.total,
      payment: b.paymentMode,
      items: b.items || [],
    })),
    ...props.legacySalesRows.map((s: any) => ({
      type: "Sale",
      no: s.billNo || s.id,
      date: s.soldAt,
      customer: "-",
      person: s.soldBy,
      cashier: s.soldBy || "-",
      gross: (s.unitPrice ?? 0) * s.quantitySold,
      returns: 0,
      net: (s.unitPrice ?? 0) * s.quantitySold,
      payment: s.paymentMethod || "-",
      items: [{ itemName: s.itemName, quantity: s.quantitySold, unit: s.unit || "", price: s.unitPrice ?? 0, discount: 0, tax: 0, lineTotal: (s.unitPrice ?? 0) * s.quantitySold }],
    })),
    ...props.branchReturns.map((r: any) => ({
      type: "Return",
      no: r.returnNo,
      date: r.createdAt,
      customer: r.originalBillNo,
      person: r.returnedBy,
      cashier: r.returnedBy || "-",
      gross: 0,
      returns: r.total,
      net: -r.total,
      payment: "refund",
      items: r.items || [],
    })),
    ...(props.movementInRange || [])
      .filter((m: any) => m.direction === "in" && /advance/i.test(m.purpose || ""))
      .map((m: any) => ({
        type: "Advance",
        no: m.referenceNumber || "-",
        date: m.dateTime,
        customer: m.remarks || "-",
        person: m.enteredBy,
        cashier: m.enteredBy || "-",
        gross: m.amount,
        returns: 0,
        net: m.amount,
        payment: m.paymentMode,
        items: [],
      })),
    ...(props.creditPaymentsInRange || []).map((p: any) => ({
      type: "Credit Collected",
      no: p.billNo,
      date: p.createdAt,
      customer: p.remarks || "-",
      person: p.collectedBy,
      cashier: p.collectedBy || "-",
      gross: p.amount,
      returns: 0,
      net: p.amount,
      payment: p.paymentMode,
      items: [],
    })),

  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function SalesReturnsTab(props: any) {
  const salesRows = buildSalesRows(props);
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
                `SNB_Sales_Returns_${dateInput()}.xls`,
                salesRows.map((r) => ({
                  Type: r.type,
                  Number: r.no,
                  Date: fmtDateTime(r.date),
                  Salesperson: r.person,
                  Cashier: r.cashier,
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
            "Salesperson",
            "Cashier",
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
            r.cashier,
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
  const catalogItems = useSNBCatalog();
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
      <Panel
        title="Stock Register"
        icon={<Package className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload(
                `SNB_Stock_${dateInput()}.xls`,
                enrichedRows.map((item: any) => ({
                  Item: item.itemName,
                  Category: item.category,
                  Barcode: item.itemBarcode || "-",
                  SystemStock: item.current,
                  Minimum: item.minimum,
                  Shortage: item.shortage,
                  Unit: item.unit,
                  Value: item.stockValue,
                  Status: item.status,
                  ReorderSuggestion: item.reorder,
                  LastChange: item.lastChange ? fmtDateTime(item.lastChange) : "-",
                })),
              )
            }
          >
            <Download className="size-4" />
            Export
          </button>
        }
      >
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

function UpdateStockTab({
  userName,
  branchStock,
  catalogItems,
  fetchBranchData,
  setNotice,
}: {
  userName: string;
  branchStock: any[];
  catalogItems: Array<{ name: string; barcode?: number; category?: string; uom?: string }>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const [selectedItem, setSelectedItem] = useState(catalogItems[0]?.name || "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedCatalog = catalogItems.find((item) => item.name === selectedItem);
  const current = branchStock.find((row) => normal(row.itemName) === normal(selectedItem));

  useEffect(() => {
    if (!selectedItem && catalogItems[0]?.name) setSelectedItem(catalogItems[0].name);
  }, [catalogItems, selectedItem]);

  const save = async () => {
    const nextQty = Number(quantity);
    setError("");
    if (!selectedItem) return setError("Select an item.");
    if (!Number.isFinite(nextQty) || nextQty < 0) return setError("Enter a valid stock quantity of zero or more.");
    if (reason.trim().length < 3) return setError("Enter a clear reason for the stock adjustment.");
    if (!password) return setError("Enter your login password to authorize this stock update.");
    if (!window.confirm(`Set ${selectedItem} stock from ${current?.quantity ?? 0} to ${nextQty}?`)) return;

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("admin_update_snb_stock_secure", {
      p_item_barcode: selectedCatalog?.barcode ?? current?.itemBarcode ?? null,
      p_item_name: selectedItem,
      p_new_quantity: Math.round(nextQty * 1000) / 1000,
      p_password: password,
      p_reason: reason.trim(),
    });
    setSaving(false);
    setPassword("");
    if (rpcError) {
      setError(/password|credential|secret/i.test(rpcError.message)
        ? "Authorization failed. Check your login password and try again."
        : `Stock update failed: ${rpcError.message}`);
      return;
    }
    await fetchBranchData(BRANCH);
    setQuantity("");
    setReason("");
    setNotice(`${selectedItem} stock updated securely by ${userName}.`);
    if (data && typeof data === "object" && "warning" in (data as Record<string, unknown>)) {
      setError(String((data as Record<string, unknown>).warning || ""));
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title="Secure Stock Update" icon={<ShieldCheck className="size-4" />}>
        <div className="space-y-3">
          <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">
            Every adjustment is password-authorized and written to the stock audit trail. Use this only for verified physical corrections.
          </div>
          <Field label="Item">
            <select
              className={inputCls}
              value={selectedItem}
              onChange={(e) => {
                setSelectedItem(e.target.value);
                setQuantity("");
                setError("");
              }}
            >
              {catalogItems.map((item) => <option key={`${item.barcode ?? item.name}-${item.name}`} value={item.name}>{item.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Current Stock</p>
              <p className="mt-1 text-2xl font-black">{current?.quantity ?? 0} <span className="text-sm text-slate-500">{current?.unit || selectedCatalog?.uom || ""}</span></p>
            </div>
            <Field label="New Quantity">
              <input type="number" min="0" step="0.001" className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason for Adjustment">
            <textarea className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Physical count correction, damaged stock correction, opening balance correction..." />
          </Field>
          <Field label="Admin Login Password">
            <input type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700 ring-1 ring-red-100">{error}</p>}
          <button disabled={saving} onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-60")}>
            {saving ? <RefreshCcw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {saving ? "Updating..." : "Authorize & Update Stock"}
          </button>
        </div>
      </Panel>
      <Panel
        title="Current SNB Stock"
        icon={<Package className="size-4" />}
        action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => void fetchBranchData(BRANCH)}><RefreshCcw className="size-4" /> Refresh</button>}
      >
        <DataTable
          headers={["Item", "Category", "Barcode", "Quantity", "Unit", "Minimum", "Action"]}
          rows={branchStock.map((row) => {
            const item = catalogItems.find((candidate) => normal(candidate.name) === normal(row.itemName));
            return [
              row.itemName,
              item?.category || "-",
              item?.barcode ?? row.itemBarcode ?? "-",
              row.quantity,
              row.unit || item?.uom || "-",
              row.minThreshold ?? 0,
              <button key="select" className={cn(btnCls, "bg-blue-50 text-blue-700")} onClick={() => { setSelectedItem(row.itemName); setQuantity(String(row.quantity)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Select</button>,
            ];
          })}
          empty="No stock records found."
        />
      </Panel>
    </div>
  );
}

function SuppliersTab({ userName }: { userName: string }) {
  const { suppliers, addSupplier, updateSupplier, removeSupplier } = useBranchOpsStore();
  const [form, setForm] = useState({
    name: "",
    address: "",
    mobile: "",
    gstNumber: "",
    itemsProvided: "",
    notes: "",
  });
  const [editingId, setEditingId] = useState("");
  const rows = suppliers.filter((s) => s.branch === BRANCH);
  const reset = () => { setEditingId(""); setForm({ name: "", address: "", mobile: "", gstNumber: "", itemsProvided: "", notes: "" }); };
  const save = () => {
    if (!form.name.trim() || !form.mobile.trim()) return;
    if (editingId) updateSupplier(editingId, { ...form, createdBy: userName }, userName);
    else addSupplier({ branch: BRANCH, ...form, createdBy: userName });
    reset();
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title={editingId ? "Edit Supplier" : "Add Supplier"} icon={<Truck className="size-4" />}>
        <div className="space-y-3">
          <Field label="Supplier Name *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile *"><input className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="GST"><input className={inputCls} value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Items They Provide"><input className={inputCls} value={form.itemsProvided} onChange={(e) => setForm({ ...form, itemsProvided: e.target.value })} /></Field>
          <Field label="Main Details / Notes"><textarea className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex gap-2"><button onClick={save} className={cn(btnCls, "flex-1 bg-slate-950 text-white")}><Plus className="size-4" /> {editingId ? "Update Supplier" : "Save Supplier"}</button>{editingId && <button onClick={reset} className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")}>Cancel</button>}</div>
        </div>
      </Panel>
      <Panel title="Supplier List" icon={<BookOpenCheck className="size-4" />}>
        <DataTable
          headers={["Name", "Mobile", "GST", "Items", "Address", "Notes", "Added", "Actions"]}
          rows={rows.map((supplier) => [supplier.name, supplier.mobile, supplier.gstNumber || "-", supplier.itemsProvided || "-", supplier.address || "-", supplier.notes || "-", fmtDateTime(supplier.createdAt), <div key={supplier.id} className="flex gap-2"><button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => { setEditingId(supplier.id); setForm({ name: supplier.name, address: supplier.address, mobile: supplier.mobile, gstNumber: supplier.gstNumber, itemsProvided: supplier.itemsProvided, notes: supplier.notes }); }}>Edit</button><button className={cn(btnCls, "bg-red-50 text-red-700 ring-1 ring-red-200")} onClick={() => { if (window.confirm(`Delete ${supplier.name}?`)) removeSupplier(supplier.id, userName); }}>Delete</button></div>])}
          empty="No suppliers added."
        />
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
        <Panel title="Expense History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Expenses.xls", rows.map((e) => ({ Date: e.expenseDate, Category: e.category, Details: e.description, Amount: e.amount, Mode: e.mode, EnteredBy: e.enteredBy })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Category", "Details", "Amount", "Mode", "Entered By"]} rows={rows.map((e) => [fmtDate(e.expenseDate), e.category, e.description, money(e.amount), e.mode.toUpperCase(), e.enteredBy])} empty="No expenses added." />
        </Panel>
      </div>
    </div>
  );
}

function ComplaintsTab({ userName }: { userName: string }) {
  const [form, setForm] = useState({ complaintArea: "SNB", title: "", details: "" });
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
          SNB Admin can raise tickets and add branch details. Review, resolution and closure are restricted to Owner and Main Admin.
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

function printWasteLogBatch(entries: Array<{ itemName: string; quantity: number; unit: string }>, logType: string, reason: string, verifiedBy: string, createdBy: string, checklist: string[], branchLabel: string) {
  const itemRows = entries
    .map((entry) => `<div class="row"><span>${entry.itemName}</span><b>${entry.quantity} ${entry.unit}</b></div>`)
    .join("");
  const rows = [
    ["Reason", reason],
    ["Verified By", verifiedBy],
    ["Logged By", createdBy],
  ];
  const checklistHtml = checklist.length
    ? `<div class="dash"></div><div class="b">Checklist Confirmed</div>${checklist
        .map((c: string) => `<div class="row"><span>&#10003; ${c}</span></div>`)
        .join("")}`
    : "";
  const body = `<div class="stamp">WASTE LOG — ${String(logType).toUpperCase()} (${entries.length} ITEMS)</div><h2 class="c">${branchLabel}</h2><div class="dash"></div><div class="b">Items</div>${itemRows}<div class="dash"></div>${rows
    .map(([label, value]) => `<div class="row"><span>${label}</span><b>${value}</b></div>`)
    .join("")}${checklistHtml}<div class="dash"></div><div class="c">Stock updated automatically · Printed ${new Date().toLocaleString("en-IN")}</div>`;
  printHtml(`${branchLabel} Waste Log - ${entries.length} items`, body);
}

function WasteLogsTab({ userName }: { userName: string }) {
  const catalogItems = useSNBCatalog();
  const { addWasteLog } = useBranchOpsStore();
  const { stock } = useBranchStore();
  const [subTab, setSubTab] = useState<"Dump" | "Damage" | "Trans Out">("Dump");
  const [lineDraft, setLineDraft] = useState({ itemName: catalogItems[0]?.name || "", quantity: "", unit: "pcs" });
  const [lines, setLines] = useState<Array<{ lineId: string; itemName: string; quantity: string; unit: string }>>([]);
  const [meta, setMeta] = useState({ reason: "", verifiedBy: "", checklist: [] as string[] });
  // Waste logs are shared across SNB Order, SNB Admin, and Owner via the
  // `branch_waste_logs` Supabase table (written by record_branch_waste_batch_secure).
  // The previous version read only from the local branchOpsStore, so entries
  // made from SNB Order never showed here and vice-versa across devices.
  const [rows, setRows] = useState<Array<{ id: string; logType: string; itemName: string; quantity: number; unit: string; reason: string; verifiedBy: string; createdBy: string; createdAt: string; checklist: string[] }>>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const loadRows = async () => {
    setRowsLoading(true);
    const { data, error: loadError } = await supabase
      .from("branch_waste_logs")
      .select("id,log_type,item_name,quantity,unit,reason,verified_by,created_by_username,created_at,checklist")
      .eq("branch", BRANCH)
      .order("created_at", { ascending: false })
      .limit(1000);
    setRowsLoading(false);
    if (!loadError && data) {
      setRows(
        data.map((d: any) => ({
          id: d.id,
          logType: d.log_type === "Trans Out" ? "Trans Out" : d.log_type,
          itemName: d.item_name,
          quantity: Number(d.quantity || 0),
          unit: d.unit,
          reason: d.reason || "",
          verifiedBy: d.verified_by || "",
          createdBy: d.created_by_username || "",
          createdAt: d.created_at,
          checklist: Array.isArray(d.checklist) ? d.checklist : [],
        })),
      );
    }
  };
  useEffect(() => { void loadRows(); }, []);
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
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the queued list whenever the subtab changes so a Dump list doesn't bleed into Damage, etc.
  useEffect(() => { setLines([]); setValidationError(""); }, [subTab]);
  useEffect(() => {
    if (lineDraft.itemName) {
      const correctUnit = stockRowFor(lineDraft.itemName)?.unit;
      if (correctUnit && correctUnit !== lineDraft.unit) setLineDraft((current) => ({ ...current, unit: correctUnit }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineDraft.itemName, stock]);

  const stockRowFor = (itemName: string) => {
    const catalogItem = catalogItems.find((item) => normal(item.name) === normal(itemName));
    return (stock[BRANCH] || []).find((stockItem) =>
      catalogItem?.barcode != null && stockItem.itemBarcode != null
        ? stockItem.itemBarcode === catalogItem.barcode
        : normal(stockItem.itemName) === normal(itemName),
    );
  };
  const draftCurrentQty = Number(stockRowFor(lineDraft.itemName)?.quantity || 0);
  const queuedForDraftItem = lines.filter((line) => normal(line.itemName) === normal(lineDraft.itemName)).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const draftRemaining = Math.max(0, draftCurrentQty - queuedForDraftItem);

  const addLine = () => {
    setValidationError("");
    const qty = Number(lineDraft.quantity);
    if (!lineDraft.itemName || !Number.isFinite(qty) || qty <= 0) {
      setValidationError("Enter a valid quantity greater than zero.");
      return;
    }
    if (qty > draftRemaining) {
      setValidationError(`Cannot queue ${qty} ${lineDraft.unit} for ${lineDraft.itemName}; only ${draftRemaining} available (after items already added).`);
      return;
    }
    setLines((current) => [...current, { lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemName: lineDraft.itemName, quantity: lineDraft.quantity, unit: lineDraft.unit }]);
    setLineDraft((current) => ({ ...current, quantity: "" }));
  };
  const removeLine = (lineId: string) => setLines((current) => current.filter((line) => line.lineId !== lineId));

  const save = async () => {
    setValidationError("");
    if (lines.length === 0) {
      setValidationError("Add at least one item to the list before saving.");
      return;
    }
    if (!meta.reason.trim() || !meta.verifiedBy.trim()) {
      setValidationError("Reason and Verified By are mandatory.");
      return;
    }
    if (checklistOptions.some((item) => !meta.checklist.includes(item))) {
      setValidationError("Complete every checklist item before saving.");
      return;
    }
    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc("record_branch_waste_batch_secure", {
        p_branch: BRANCH,
        p_log_type: subTab,
        p_items: lines.map((line) => {
          const catalogItem = catalogItems.find((item) => normal(item.name) === normal(line.itemName));
          const currentRow = stockRowFor(line.itemName);
          return {
            itemBarcode: catalogItem?.barcode ?? null,
            itemName: currentRow?.itemName || line.itemName,
            quantity: Number(line.quantity),
            unit: line.unit,
          };
        }),
        p_reason: meta.reason.trim(),
        p_verified_by: meta.verifiedBy.trim(),
        p_checklist: meta.checklist,
      });
      if (rpcError) {
        const missingRpc = /record_branch_waste_batch_secure|could not find the function|function .* does not exist/i.test(rpcError.message);
        if (missingRpc) {
          throw new Error("Stock movement service is temporarily unavailable. Refresh the dashboard and retry.");
        }
        throw rpcError;
      }
      for (const line of lines) {
        addWasteLog({ branch: BRANCH, logType: subTab, itemName: line.itemName, quantity: Number(line.quantity), unit: line.unit, reason: meta.reason, verifiedBy: meta.verifiedBy, checklist: meta.checklist, createdBy: userName });
      }
      printWasteLogBatch(
        lines.map((line) => ({ itemName: line.itemName, quantity: Number(line.quantity), unit: line.unit })),
        subTab,
        meta.reason,
        meta.verifiedBy,
        userName,
        meta.checklist,
        "SNB",
      );
      setLines([]);
      setMeta({ reason: "", verifiedBy: "", checklist: [] });
      await loadRows();
    } catch (saveError) {
      setValidationError(saveError instanceof Error ? saveError.message : "Unable to save waste log");
    } finally {
      setSaving(false);
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
            <Field label="Item" hint={`In stock: ${draftRemaining} ${lineDraft.unit}`}><select className={inputCls} value={lineDraft.itemName} onChange={(e) => { const unit = stockRowFor(e.target.value)?.unit || "pcs"; setLineDraft({ ...lineDraft, itemName: e.target.value, unit }); }}>{catalogItems.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity"><input type="number" className={inputCls} value={lineDraft.quantity} onChange={(e) => setLineDraft({ ...lineDraft, quantity: e.target.value })} /></Field>
              <Field label="Unit"><input className={cn(inputCls, "bg-slate-100 text-slate-500")} value={lineDraft.unit} readOnly disabled title="Unit is fixed to the item's live stock unit" /></Field>
            </div>
            <button type="button" onClick={addLine} className={cn(btnCls, "w-full bg-amber-500 text-white")}><Plus className="size-4" /> Add item to list</button>

            {lines.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">{lines.length} item{lines.length > 1 ? "s" : ""} queued for this {subTab === "Trans Out" ? "transfer out" : subTab.toLowerCase()}</p>
                <div className="space-y-1.5">
                  {lines.map((line) => (
                    <div key={line.lineId} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      <div className="text-sm font-bold"><span className="font-black">{line.itemName}</span> · {line.quantity} {line.unit}</div>
                      <button type="button" onClick={() => removeLine(line.lineId)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Field label="Reason"><textarea className={inputCls} value={meta.reason} onChange={(e) => setMeta({ ...meta, reason: e.target.value })} /></Field>
            <Field label="Verified By"><input className={inputCls} value={meta.verifiedBy} onChange={(e) => setMeta({ ...meta, verifiedBy: e.target.value })} /></Field>
            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
              {checklistOptions.map((item) => (
                <label key={item} className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={meta.checklist.includes(item)} onChange={(e) => setMeta((f) => ({ ...f, checklist: e.target.checked ? [...f.checklist, item] : f.checklist.filter((x) => x !== item) }))} />
                  {item}
                </label>
              ))}
            </div>
            {validationError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 ring-1 ring-red-200">{validationError}</p>}
            <button onClick={save} disabled={saving || lines.length === 0} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-50")}>{saving ? "Saving…" : `Save Waste Log (${lines.length} item${lines.length === 1 ? "" : "s"})`}</button>
          </div>
        </Panel>
        <Panel title="Waste Log History" icon={<History className="size-4" />} action={<div className="flex items-center gap-2"><button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => void loadRows()}><RefreshCcw className={cn("size-4", rowsLoading && "animate-spin")} /> Refresh</button><button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Waste_Logs.xls", rows.map((w) => ({ Date: w.createdAt, Type: w.logType, Item: w.itemName, Quantity: w.quantity, Unit: w.unit, Reason: w.reason, VerifiedBy: w.verifiedBy })))}><Download className="size-4" /> Excel</button></div>}>
          <DataTable headers={["Date", "Type", "Item", "Qty", "Reason", "Verified By", "Checklist"]} rows={rows.map((w) => [fmtDateTime(w.createdAt), w.logType, w.itemName, `${w.quantity} ${w.unit}`, w.reason, w.verifiedBy, w.checklist.join(", ") || "-"])} empty="No waste logs saved." />
        </Panel>
      </div>
    </div>
  );
}

function QuotationsTab({ userName }: { userName: string }) {
  const catalogItems = useSNBCatalog();
  const { quotations, addQuotation, updateQuotationStatus } = useBranchOpsStore();
  const [mode, setMode] = useState<"list" | "custom">("list");
  const [form, setForm] = useState({ customerName: "", companyName: "", mobile: "", gstNumber: "", itemName: catalogItems[0]?.name || "", customName: "", qty: "1", rate: "", deliveryCharges: "0", packingCharges: "0", extraCharges: "0", discount: "0" });
  const [lines, setLines] = useState<any[]>([]);
  const rows = quotations.filter((q) => q.branch === BRANCH);
  const addLine = () => {
    const qty = Number(form.qty);
    const item = catalogItems.find((i) => i.name === form.itemName);
    const name = mode === "custom" ? form.customName.trim() : form.itemName;
    const rate = mode === "custom" ? Number(form.rate) : Number(item?.price || form.rate);
    if (!name || !qty || !rate) return;
    setLines((current) => [...current, { itemName: name, quantity: qty, unit: item?.uom === "Kgs" ? "kg" : "pcs", price: rate, tax: 0, discount: 0, lineTotal: qty * rate }]);
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

function CreditTab({ userName, role, fromDate, toDate }: { userName: string; role: string; fromDate: string; toDate: string }) {
  const { creditSales, creditPayments, settleCreditSale, applyCreditDiscount, fetchBranchData, fetchCreditPayments } = useBranchStore();
  const credits = creditSales[BRANCH] || [];
  const payments = creditPayments[BRANCH] || [];
  const paymentsInRange = payments.filter((payment) => inRange(payment.createdAt, fromDate, toDate));
  const pending = credits.filter((credit) => credit.status !== "settled" && credit.creditAmount > 0);
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi" | "card" | "bank">("cash");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = pending.find((credit) => credit.id === selectedId);

  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountMessage, setDiscountMessage] = useState("");

  useEffect(() => {
    if (selectedId && !pending.some((credit) => credit.id === selectedId)) {
      setSelectedId("");
      setAmount("");
    }
  }, [pending, selectedId]);

  const collect = async () => {
    const value = Number(amount);
    setMessage("");
    if (!selected) return setMessage("Select a pending credit bill.");
    if (!Number.isFinite(value) || value <= 0) return setMessage("Enter a valid collection amount.");
    if (value > selected.creditAmount + 0.001) return setMessage(`Collection cannot exceed ${money(selected.creditAmount)}.`);
    if (mode !== "cash" && !reference.trim()) return setMessage(`Enter the ${mode.toUpperCase()} reference number.`);
    setSaving(true);
    const error = await settleCreditSale(BRANCH, selected.id, value, {
      mode,
      reference: reference.trim(),
      remarks: remarks.trim() || "SNB Admin credit collection",
      collectedBy: userName,
      collectedRole: role,
    });
    setSaving(false);
    if (error) return setMessage(error);
    await Promise.all([fetchBranchData(BRANCH), fetchCreditPayments(BRANCH)]);
    setMessage(`Collected ${money(value)} against ${selected.billNo}.`);
    setSelectedId("");
    setAmount("");
    setReference("");
    setRemarks("");
  };

  const applyDiscount = async () => {
    const value = Number(discountAmount);
    setDiscountMessage("");
    if (!selected) return setDiscountMessage("Select a pending credit bill.");
    if (!Number.isFinite(value) || value <= 0) return setDiscountMessage("Enter a valid discount amount.");
    if (value > selected.creditAmount + 0.001) return setDiscountMessage(`Discount cannot exceed ${money(selected.creditAmount)}.`);
    setApplyingDiscount(true);
    const error = await applyCreditDiscount(BRANCH, selected.id, value, discountReason.trim() || undefined, userName);
    setApplyingDiscount(false);
    if (error) return setDiscountMessage(error);
    await Promise.all([fetchBranchData(BRANCH), fetchCreditPayments(BRANCH)]);
    setDiscountMessage(`Discount of ${money(value)} applied to ${selected.billNo}.`);
    setSelectedId("");
    setDiscountAmount("");
    setDiscountReason("");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Open Credit" value={money(pending.reduce((sum, credit) => sum + credit.creditAmount, 0))} icon={<WalletCards className="size-5" />} tone="red" />
        <Kpi label="Collected (Selected Dates)" value={money(paymentsInRange.reduce((sum, payment) => sum + payment.amount, 0))} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Credit Bills" value={credits.length} icon={<Receipt className="size-5" />} tone="amber" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel title="Collect Credit Payment" icon={<IndianRupee className="size-4" />}>
          <div className="space-y-3">
            <Field label="Pending Credit Bill">
              <select
                className={inputCls}
                value={selectedId}
                onChange={(e) => {
                  const credit = pending.find((row) => row.id === e.target.value);
                  setSelectedId(e.target.value);
                  setAmount(credit ? String(credit.creditAmount) : "");
                  setMessage("");
                }}
              >
                <option value="">Select bill</option>
                {pending.map((credit) => (
                  <option key={credit.id} value={credit.id}>
                    {credit.billNo} · {credit.customerName} · Due {money(credit.creditAmount)}
                  </option>
                ))}
              </select>
            </Field>
            {selected && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                <div className="flex justify-between gap-3"><span>Customer</span><b>{selected.customerName}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Mobile</span><b>{selected.customerPhone || "-"}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Due date</span><b>{selected.dueDate || "-"}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Balance</span><b className="text-red-600">{money(selected.creditAmount)}</b></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input type="number" min="0.01" max={selected?.creditAmount || undefined} step="0.01" className={inputCls} value={amount} onChange={(e) => { setAmount(e.target.value); setMessage(""); }} />
              </Field>
              <Field label="Collection Mode">
                <select className={inputCls} value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setMessage(""); }}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </Field>
            </div>
            <Field label={mode === "cash" ? "Reference (optional)" : `${mode.toUpperCase()} Reference *`}>
              <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <textarea className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
            {message && <p className={cn("rounded-2xl p-3 text-sm font-black ring-1", message.startsWith("Collected") ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-red-50 text-red-700 ring-red-100")}>{message}</p>}
            <button disabled={saving || !selected} onClick={collect} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-50")}>
              {saving ? <RefreshCcw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {saving ? "Saving…" : "Save Credit Collection"}
            </button>
          </div>
        </Panel>
        <Panel title="Give Credit Discount" icon={<WalletCards className="size-4" />}>
          <div className="space-y-3">
            <Field label="Pending Credit Bill">
              <select
                className={inputCls}
                value={selectedId}
                onChange={(e) => {
                  const credit = pending.find((row) => row.id === e.target.value);
                  setSelectedId(e.target.value);
                  setDiscountAmount(credit ? String(credit.creditAmount) : "");
                  setDiscountMessage("");
                }}
              >
                <option value="">Select bill</option>
                {pending.map((credit) => (
                  <option key={credit.id} value={credit.id}>
                    {credit.billNo} · {credit.customerName} · Due {money(credit.creditAmount)}
                  </option>
                ))}
              </select>
            </Field>
            {selected && (
              <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-slate-700 ring-1 ring-amber-200">
                <div className="flex justify-between gap-3"><span>Customer</span><b>{selected.customerName}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Balance</span><b className="text-red-600">{money(selected.creditAmount)}</b></div>
              </div>
            )}
            <Field label="Discount Amount">
              <input type="number" min="0.01" max={selected?.creditAmount || undefined} step="0.01" className={inputCls} value={discountAmount} onChange={(e) => { setDiscountAmount(e.target.value); setDiscountMessage(""); }} />
            </Field>
            <Field label="Reason (optional)">
              <input className={inputCls} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="e.g. loyal customer, minor complaint" />
            </Field>
            {discountMessage && <p className={cn("rounded-2xl p-3 text-sm font-black ring-1", discountMessage.startsWith("Discount of") ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-red-50 text-red-700 ring-red-100")}>{discountMessage}</p>}
            <button disabled={applyingDiscount || !selected} onClick={applyDiscount} className={cn(btnCls, "w-full bg-amber-600 text-white disabled:cursor-not-allowed disabled:opacity-50")}>
              {applyingDiscount ? <RefreshCcw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {applyingDiscount ? "Saving…" : "Apply Discount"}
            </button>
            <p className="text-[11px] text-slate-500">This writes off the balance directly — it is not counted as cash/UPI/card collected.</p>
          </div>
        </Panel>
        <Panel title="SNB Branch Credit Register" icon={<WalletCards className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Credit_Register.xls", credits.map((credit) => ({ Bill: credit.billNo, Customer: credit.customerName, Mobile: credit.customerPhone || "-", Total: credit.subtotal, Paid: credit.amountPaid, Balance: credit.creditAmount, Due: credit.dueDate || "-", Status: credit.status })))}><Download className="size-4" /> Excel</button>}>
          <DataTable
            headers={["Bill", "Customer", "Mobile", "Total", "Paid", "Balance", "Due", "Status"]}
            rows={credits.map((credit) => [credit.billNo, credit.customerName, credit.customerPhone || "-", money(credit.subtotal), money(credit.amountPaid), money(credit.creditAmount), credit.dueDate || "-", <StatusBadge key="status" tone={credit.status === "settled" ? "green" : credit.status === "partial" ? "amber" : "red"}>{credit.status}</StatusBadge>])}
            empty="No SNB credit sales found."
          />
        </Panel>
      </div>
      <Panel title="Credit Collection History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Credit_Collections.xls", paymentsInRange.map((payment) => ({ Date: payment.createdAt, Bill: payment.billNo, Amount: payment.amount, Mode: payment.paymentMode, Reference: payment.reference || "-", CollectedBy: payment.collectedBy, Remarks: payment.remarks || "-" })))}><Download className="size-4" /> Excel</button>}>
        <DataTable
          headers={["Date", "Bill", "Amount", "Mode", "Reference", "Collected By", "Remarks"]}
          rows={paymentsInRange.map((payment) => [fmtDateTime(payment.createdAt), payment.billNo, money(payment.amount), payment.paymentMode.toUpperCase(), payment.reference || "-", payment.collectedBy, payment.remarks || "-"])}
          empty="No credit collections found."
        />
      </Panel>
    </div>
  );
}

function CashierManagementTab({ userName }: { userName: string }) {
  const { cashiers, addCashier, updateCashier } = useBranchOpsStore();
  const [form, setForm] = useState({ name: "", mobile: "", status: "Active", notes: "" });
  const rows = cashiers.filter((c) => c.branch === BRANCH);
  const save = () => {
    if (!form.name.trim()) return;
    addCashier({ branch: BRANCH, name: form.name, mobile: form.mobile, status: form.status as any, notes: form.notes, createdBy: userName });
    setForm({ name: "", mobile: "", status: "Active", notes: "" });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title="Add Cashier" icon={<UserRound className="size-4" />}>
        <div className="space-y-3">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Mobile"><input className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          <Field label="Status"><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Active</option><option>Inactive</option></select></Field>
          <Field label="Notes"><textarea className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Save Cashier</button>
        </div>
      </Panel>
      <Panel title="Cashier List" icon={<BookOpenCheck className="size-4" />}>
        <DataTable headers={["Name", "Mobile", "Status", "Notes", "Action"]} rows={rows.map((c) => [c.name, c.mobile || "-", <StatusBadge key="s" tone={c.status === "Active" ? "green" : "red"}>{c.status}</StatusBadge>, c.notes || "-", <button key="a" className={cn(btnCls, "bg-slate-100 text-slate-700")} onClick={() => updateCashier(c.id, { status: c.status === "Active" ? "Inactive" : "Active" }, userName)}>{c.status === "Active" ? "Deactivate" : "Activate"}</button>])} empty="No cashiers added." />
      </Panel>
    </div>
  );
}

function CurrentCashTab(props: any) {
  const openingCash = (props.dbReports.counterSessions || [])
    .filter((row: any) => row.branch === BRANCH || !row.branch)
    .reduce((sum: number, row: any) => sum + asNumber(row.opening_cash), 0);
  const creditCash = props.creditPaymentsInRange
    .filter((payment: any) => payment.paymentMode === "cash")
    .reduce((sum: number, payment: any) => sum + payment.amount, 0);
  const advanceCash = props.movementInRange
    .filter((m: any) => m.paymentMode === "cash" && m.direction === "in" && /advance/i.test(m.purpose || ""))
    .reduce((sum: number, m: any) => sum + m.amount, 0);
  const cashRefunds = props.branchReturns
    .filter((row: any) => (row.returnPayMode || row.originalPaymentMode || "cash") === "cash")
    .reduce((sum: number, row: any) => sum + Number(row.refundAmount ?? row.total ?? 0), 0);
  const cashExpenses = props.movementInRange
    .filter((m: any) => m.paymentMode === "cash" && m.direction === "out" && /expense/i.test(m.purpose || ""))
    .reduce((sum: number, m: any) => sum + m.amount, 0);
  const cashAdjustIn = props.movementInRange
    .filter((m: any) => m.paymentMode === "cash" && m.direction === "in" && !/advance|credit/i.test(m.purpose || ""))
    .reduce((sum: number, m: any) => sum + m.amount, 0);
  const cashAdjustOut = props.movementInRange
    .filter((m: any) => m.paymentMode === "cash" && m.direction === "out" && !/expense|purchase|supplier|bank/i.test(m.purpose || ""))
    .reduce((sum: number, m: any) => sum + m.amount, 0);
  const expectedPhysicalCash = openingCash + props.cashSales + creditCash + advanceCash + cashAdjustIn - cashRefunds - cashExpenses - props.purchaseCashPaid - props.depositAmount - cashAdjustOut;
  const rows = [
    { label: "Opening cash", amount: openingCash, kind: "in" },
    { label: "Cash sales", amount: props.cashSales, kind: "in" },
    { label: "Cash credit collections", amount: creditCash, kind: "in" },
    { label: "Cash advance collections", amount: advanceCash, kind: "in" },
    { label: "Other approved cash in", amount: cashAdjustIn, kind: "in" },
    { label: "Cash refunds", amount: cashRefunds, kind: "out" },
    { label: "Expenses paid by cash", amount: cashExpenses, kind: "out" },
    { label: "Cash purchase / supplier payments", amount: props.purchaseCashPaid, kind: "out" },
    { label: "Cash bank deposits", amount: props.depositAmount, kind: "out" },
    { label: "Other approved cash out", amount: cashAdjustOut, kind: "out" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Expected Physical Cash" value={money(expectedPhysicalCash)} icon={<Banknote className="size-5" />} tone={expectedPhysicalCash >= 0 ? "green" : "red"} />
        <Kpi label="Bank Balance" value={money(props.bankBalance)} icon={<Landmark className="size-5" />} tone="blue" />
        <Kpi label="Expenses" value={money(props.expenseAmount)} icon={<WalletCards className="size-5" />} tone="red" />
        <Kpi label="Bank Deposits" value={money(props.depositAmount)} icon={<ShieldCheck className="size-5" />} tone="purple" />
      </div>
      <Panel title="Cash Position Breakdown" icon={<IndianRupee className="size-4" />}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" hide /><YAxis /><Tooltip formatter={(value: number) => money(value)} /><Bar dataKey="amount" radius={[8,8,0,0]} /></BarChart>
          </ResponsiveContainer>
          <div className="space-y-2">{rows.map((row) => <div key={row.label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="text-sm font-bold text-slate-600">{row.label}</span><span className={cn("font-black", row.kind === "out" ? "text-red-600" : "text-emerald-700")}>{row.kind === "out" ? "−" : "+"}{money(row.amount)}</span></div>)}</div>
        </div>
      </Panel>
      <Panel title="Source Transactions" icon={<History className="size-4" />}>
        <DataTable
          headers={["Source", "Direction", "Amount", "Meaning"]}
          rows={rows.map((row) => [
            row.label,
            row.kind === "in" ? "In" : "Out",
            <span key="amount" className={cn("font-black", row.kind === "out" ? "text-red-600" : "text-emerald-700")}>{money(row.amount)}</span>,
            row.kind === "in" ? "Adds to expected physical cash" : "Reduces expected physical cash",
          ])}
          empty="No cash source rows found."
        />
      </Panel>
    </div>
  );
}

function CashierReportTab(props: any) {
  const rows = useMemo(() => {
    if (props.dbReports.counterTotals.length) {
      const map = new Map<string, any>();
      props.dbReports.counterTotals.forEach((entry: any) => {
        const name = entry.cashier_username || "Legacy / Unattributed";
        const row = map.get(name) || { name, grossSales: 0, returns: 0, netSales: 0, bills: 0, cash: 0, upi: 0, card: 0, credit: 0, creditCollected: 0, advance: 0, sessions: 0 };
        row.grossSales += asNumber(entry.gross_sales);
        row.returns += asNumber(entry.returns);
        row.netSales += asNumber(entry.net_sales);
        row.bills += asNumber(entry.bill_count);
        row.cash += asNumber(entry.cash_sales);
        row.upi += asNumber(entry.upi_sales);
        row.card += asNumber(entry.card_sales);
        row.credit += asNumber(entry.credit_sales);
        row.creditCollected += asNumber(entry.credit_collected);
        row.advance += asNumber(entry.advance_collected);
        row.sessions += 1;
        map.set(name, row);
      });
      return Array.from(map.values()).sort((a: any, b: any) => b.netSales - a.netSales);
    }

    const map = new Map<string, any>();
    const ensure = (name: string) => {
      const key = name || "Legacy / Unattributed";
      const row = map.get(key) ?? { name: key, grossSales: 0, returns: 0, netSales: 0, bills: 0, cash: 0, upi: 0, card: 0, credit: 0, creditCollected: 0, advance: 0, sessions: 0 };
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
    props.branchReturns.forEach((ret: any) => {
      const original = props.branchBills.find((bill: any) => bill.billNo === ret.originalBillNo);
      ensure(original?.biller || ret.returnedBy).returns += ret.total;
    });
    return Array.from(map.values()).map((row: any) => ({ ...row, netSales: Math.max(0, row.grossSales - row.returns) })).sort((a: any, b: any) => b.netSales - a.netSales);
  }, [props.branchBills, props.branchReturns, props.dbReports.counterTotals]);

  const totalNet = rows.reduce((sum: number, row: any) => sum + row.netSales, 0);
  const totalBills = rows.reduce((sum: number, row: any) => sum + row.bills, 0);
  const best = rows[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Cashier Logins" value={rows.length} icon={<UserRound className="size-5" />} />
        <Kpi label="Total Bills" value={totalBills} icon={<Receipt className="size-5" />} tone="blue" />
        <Kpi label="Combined Net Sales" value={money(totalNet)} icon={<IndianRupee className="size-5" />} tone="green" />
        <Kpi label="Top Cashier" value={best ? best.name : "-"} sub={best ? money(best.netSales) : undefined} icon={<BarChart3 className="size-5" />} tone="amber" />
      </div>
      {props.dbReports.error && <div className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800 ring-1 ring-amber-100">Some database reports could not load: {props.dbReports.error}</div>}
      <Panel title="Cashier Accountability Report" icon={<BarChart3 className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Cashier_Report.xls", rows.map((row: any) => ({ CashierLogin: row.name, Sessions: row.sessions, GrossSales: row.grossSales, Returns: row.returns, NetSales: row.netSales, Bills: row.bills, Cash: row.cash, UPI: row.upi, Card: row.card, CreditSales: row.credit, CreditCollected: row.creditCollected, AdvanceCollected: row.advance })))}><Download className="size-4" /> Excel</button>}>
        <DataTable headers={["Rank", "Cashier Login", "Sessions", "Gross", "Returns", "Net", "Bills", "Cash", "UPI", "Card", "Credit Sales", "Credit Collected", "Advance"]} rows={rows.map((row: any, index: number) => [`#${index + 1}`, row.name, row.sessions || "-", money(row.grossSales), money(row.returns), <span key="net" className="font-black text-emerald-700">{money(row.netSales)}</span>, row.bills, money(row.cash), money(row.upi), money(row.card), money(row.credit), money(row.creditCollected), money(row.advance)])} empty="No cashier sales data found for the selected date range." />
      </Panel>
    </div>
  );
}

function CashierClosureTab(props: any) {
  const { cashierClosures } = useBranchOpsStore();
  const databaseRows = props.dbReports.counterSessions as any[];
  const useDatabase = props.dbReports.refreshedAt !== null && !props.dbReports.error.includes("branch_counter_sessions");
  const rows = useDatabase
    ? databaseRows
    : cashierClosures.filter((closure) => closure.branch === BRANCH).map((closure) => ({
        id: closure.id,
        business_date: localDateKey(closure.createdAt),
        cashier_username: closure.cashier,
        opened_at: closure.createdAt,
        closed_at: closure.createdAt,
        status: "closed",
        opening_cash: closure.openingCash,
        gross_sales: closure.totalSales,
        discounts: 0,
        returns: closure.returns,
        net_sales: closure.totalSales - closure.returns,
        cash_sales: closure.cash,
        upi_sales: closure.upi,
        card_sales: closure.card,
        credit_sales: closure.creditSales || 0,
        credit_collected: closure.creditCollections || 0,
        advance_collected: closure.advanceCollections || 0,
        expenses: closure.expenses,
        supplier_payments: closure.purchasePayments,
        bank_deposits: closure.bankDeposits,
        expected_cash: closure.expectedCash,
        counted_cash: closure.closingCash,
        difference: closure.difference,
        bill_count: closure.billsCount,
        notes: closure.notes,
      }));
  const closedRows = rows.filter((row: any) => row.status === "closed");
  const totalDifference = closedRows.reduce((sum: number, row: any) => sum + asNumber(row.difference), 0);
  const mismatches = closedRows.filter((row: any) => Math.abs(asNumber(row.difference)) > 0.009).length;
  const openCounters = rows.filter((row: any) => row.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Closed Sessions" value={closedRows.length} icon={<CalendarClock className="size-5" />} />
        <Kpi label="Open Counters" value={openCounters} icon={<Activity className="size-5" />} tone={openCounters ? "amber" : "green"} />
        <Kpi label="Mismatches" value={mismatches} icon={<AlertTriangle className="size-5" />} tone={mismatches ? "red" : "green"} />
        <Kpi label="Net Difference" value={money(totalDifference)} icon={<IndianRupee className="size-5" />} tone={Math.abs(totalDifference) < 0.01 ? "green" : "red"} />
      </div>
      <Panel title="Per-Cashier Counter Sessions" icon={<CalendarClock className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Cashier_Closures.xls", rows.map((row: any) => ({ BusinessDate: row.business_date, CashierLogin: row.cashier_display_name || row.cashier_username || "Legacy / Unattributed", OpenedAt: row.opened_at, ClosedAt: row.closed_at || "", Status: row.status, OpeningCash: asNumber(row.opening_cash), GrossSales: asNumber(row.gross_sales), Discounts: asNumber(row.discounts), Returns: asNumber(row.returns), NetSales: asNumber(row.net_sales), CashSales: asNumber(row.cash_sales), UPISales: asNumber(row.upi_sales), CardSales: asNumber(row.card_sales), CreditSales: asNumber(row.credit_sales), CreditCollected: asNumber(row.credit_collected), AdvanceCollected: asNumber(row.advance_collected), Expenses: asNumber(row.expenses), SupplierPayments: asNumber(row.supplier_payments), BankDeposits: asNumber(row.bank_deposits), ExpectedCash: asNumber(row.expected_cash), CountedCash: asNumber(row.counted_cash), Difference: asNumber(row.difference), Bills: asNumber(row.bill_count), Notes: row.notes || "" })))}><Download className="size-4" /> Excel</button>}>
        <DataTable
          headers={["Date", "Cashier Login", "Session", "Status", "Opening", "Gross", "Returns", "Net", "Expected", "Counted", "Difference", "Bills", "Cash", "UPI", "Card", "Credit Collected", "Advance", "Expenses", "Supplier Payments", "Bank Deposits", "Notes"]}
          rows={rows.map((row: any) => [
            row.business_date,
            row.cashier_display_name || row.cashier_username || "Legacy / Unattributed",
            `${fmtDateTime(row.opened_at)}${row.closed_at ? ` → ${fmtDateTime(row.closed_at)}` : ""}`,
            <StatusBadge key="status" tone={row.status === "closed" ? "green" : "amber"}>{row.status}</StatusBadge>,
            money(asNumber(row.opening_cash)),
            money(asNumber(row.gross_sales)),
            money(asNumber(row.returns)),
            money(asNumber(row.net_sales)),
            money(asNumber(row.expected_cash)),
            row.status === "closed" ? money(asNumber(row.counted_cash)) : "-",
            <span key="difference" className={cn("font-black", Math.abs(asNumber(row.difference)) < 0.01 ? "text-emerald-700" : "text-red-600")}>{row.status === "closed" ? money(asNumber(row.difference)) : "-"}</span>,
            asNumber(row.bill_count),
            money(asNumber(row.cash_sales)),
            money(asNumber(row.upi_sales)),
            money(asNumber(row.card_sales)),
            money(asNumber(row.credit_collected)),
            money(asNumber(row.advance_collected)),
            money(asNumber(row.expenses)),
            money(asNumber(row.supplier_payments)),
            money(asNumber(row.bank_deposits)),
            row.notes || "-",
          ])}
          empty="No cashier counter sessions found for the selected date range."
        />
      </Panel>
    </div>
  );
}

function PurchaseOrdersTab({ userName }: { userName: string }) {
  const catalogItems = useSNBCatalog();
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
  const [lines, setLines] = useState<Array<{ itemName: string; quantity: number; expectedRate: number; totalAmount: number }>>([]);
  const rows = purchaseOrders.filter((p) => p.branch === BRANCH);
  const addLine = () => {
    const qty = Number(form.quantity);
    const rate = Number(form.expectedRate);
    if (!qty || !rate) return;
    setLines((current) => [
      ...current,
      { itemName: form.itemName, quantity: qty, expectedRate: rate, totalAmount: qty * rate },
    ]);
    setForm({ ...form, quantity: "", expectedRate: "" });
  };
  const create = () => {
    const draftLines = lines.length
      ? lines
      : Number(form.quantity) && Number(form.expectedRate)
        ? [{ itemName: form.itemName, quantity: Number(form.quantity), expectedRate: Number(form.expectedRate), totalAmount: Number(form.quantity) * Number(form.expectedRate) }]
        : [];
    if (!form.supplier.trim() || draftLines.length === 0) return;
    const first = draftLines[0];
    addPurchaseOrder({
      branch: BRANCH,
      supplier: form.supplier,
      itemName: draftLines.length > 1 ? `${draftLines.length} items` : first.itemName,
      quantity: draftLines.reduce((sum, line) => sum + line.quantity, 0),
      expectedRate: draftLines.length > 1 ? 0 : first.expectedRate,
      items: draftLines,
      totalAmount: draftLines.reduce((sum, line) => sum + line.totalAmount, 0),
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
    setLines([]);
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
          <button
            onClick={addLine}
            className={cn(btnCls, "w-full bg-white text-slate-700 ring-1 ring-slate-200")}
          >
            <Plus className="size-4" />
            Add Item To Order
          </button>
          {lines.length > 0 && (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">
              {lines.map((line, index) => (
                <div key={`${line.itemName}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-bold">
                  <span>{line.itemName} - {line.quantity} x {money(line.expectedRate)}</span>
                  <button className="text-red-600" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
                "SNB_Purchase_Orders.xls",
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

export function PurchaseInvoicesTab({
  userName,
  fetchBranchData,
  setNotice,
  dbReports,
}: {
  userName: string;
  fetchBranchData: any;
  setNotice: (v: string) => void;
  dbReports: ReturnType<typeof useSnbAdminReports>;
}) {
  type PurchaseUnit = NonNullable<PurchaseRecord["unit"]>;
  type PurchaseLine = NonNullable<PurchaseRecord["items"]>[number];

  const catalogItems = useSNBCatalog();
  const {
    purchases,
    suppliers,
    addPurchase,
    updatePurchase,
    markPurchaseSynced,
    addAuditLog,
  } = useBranchOpsStore();

  const itemFromCatalog = (itemName: string) =>
    catalogItems.find((item) => normal(item.name) === normal(itemName));
  const createBlankForm = () => {
    const first = catalogItems[0];
    return {
      supplier: "",
      invoiceNo: "",
      invoiceDate: dateInput(),
      itemName: first?.name || "",
      quantity: "",
      unit: purchaseUnitFromCatalog(first?.uom),
      rate: first ? String(first.price) : "",
      tax: "0",
      discount: "0",
      remarks: "",
      editReason: "",
    };
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [form, setForm] = useState(createBlankForm);
  const [itemSearch, setItemSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState<"all" | "synced" | "not-synced">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRecord | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [syncedBaseline, setSyncedBaseline] = useState<Array<{ itemName: string; quantity: number; unit?: PurchaseUnit }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.itemName && catalogItems[0]) {
      const first = catalogItems[0];
      setForm((current) => ({
        ...current,
        itemName: first.name,
        unit: purchaseUnitFromCatalog(first.uom),
        rate: String(first.price),
      }));
    }
  }, [catalogItems, form.itemName]);

  const supplierForItem = (itemName: string) =>
    suppliers.find(
      (supplier) =>
        supplier.branch === BRANCH &&
        supplier.itemsProvided.toLowerCase().includes(itemName.toLowerCase()),
    );

  const selectedCatalogItem = itemFromCatalog(form.itemName);
  const selectedSupplier = supplierForItem(form.itemName);
  const filteredCatalogItems = catalogItems.filter((item) =>
    item.name.toLowerCase().includes(itemSearch.trim().toLowerCase()),
  );
  const itemOptions = selectedCatalogItem && !filteredCatalogItems.some((item) => item.barcode === selectedCatalogItem.barcode)
    ? [selectedCatalogItem, ...filteredCatalogItems]
    : filteredCatalogItems;

  const rows = useMemo(() => {
    const localRows = purchases.filter((purchase) => purchase.branch === BRANCH);
    const localByDatabaseId = new Map(
      localRows.filter((purchase) => purchase.dbId).map((purchase) => [purchase.dbId as string, purchase]),
    );
    const databaseRows: PurchaseRecord[] = dbReports.purchaseInvoices.map((invoice) => {
      const local = localByDatabaseId.get(invoice.id) || localRows.find(
        (purchase) => normal(purchase.supplier) === normal(invoice.supplier_name) && normal(purchase.invoiceNo) === normal(invoice.invoice_number),
      );
      if (local) {
        return {
          ...local,
          dbId: invoice.id,
          supplier: invoice.supplier_name,
          invoiceNo: invoice.invoice_number,
          invoiceDate: invoice.invoice_date,
          total: asNumber(invoice.total_amount),
          paidAmount: asNumber(invoice.paid_amount),
          paymentMethod: ((invoice.payment_method || "credit").toLowerCase() as PurchaseRecord["paymentMethod"]),
          remarks: invoice.remarks || local.remarks,
          syncStatus: (invoice.sync_status || "Not Synced") as PurchaseRecord["syncStatus"],
          syncedToStock: invoice.sync_status === "Synced",
          syncedAt: invoice.synced_at || undefined,
          syncedBy: invoice.synced_by || undefined,
          lastEditedAt: invoice.last_edited_at || local.lastEditedAt,
          lastEditedBy: invoice.last_edited_by || local.lastEditedBy,
          createdAt: invoice.created_at || local.createdAt,
        };
      }
      return {
        id: `db:${invoice.id}`,
        dbId: invoice.id,
        branch: BRANCH,
        supplier: invoice.supplier_name,
        invoiceNo: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        itemName: "Database purchase invoice",
        quantity: 0,
        unit: "nos",
        cost: 0,
        tax: 0,
        discount: 0,
        total: asNumber(invoice.total_amount),
        createdAt: invoice.created_at,
        enteredBy: invoice.created_by || "SNB Admin",
        paidAmount: asNumber(invoice.paid_amount),
        paymentMethod: ((invoice.payment_method || "credit").toLowerCase() as PurchaseRecord["paymentMethod"]),
        remarks: invoice.remarks || undefined,
        syncStatus: (invoice.sync_status || "Not Synced") as PurchaseRecord["syncStatus"],
        syncedToStock: invoice.sync_status === "Synced",
        syncedAt: invoice.synced_at || undefined,
        syncedBy: invoice.synced_by || undefined,
        lastEditedAt: invoice.last_edited_at || undefined,
        lastEditedBy: invoice.last_edited_by || undefined,
      };
    });
    const databaseIds = new Set(databaseRows.map((purchase) => purchase.dbId).filter(Boolean));
    const databaseKeys = new Set(databaseRows.map((purchase) => `${normal(purchase.supplier)}|${normal(purchase.invoiceNo)}`));
    const localOnly = localRows.filter((purchase) =>
      !(purchase.dbId && databaseIds.has(purchase.dbId)) &&
      !databaseKeys.has(`${normal(purchase.supplier)}|${normal(purchase.invoiceNo)}`),
    );
    return [...databaseRows, ...localOnly]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dbReports.purchaseInvoices, purchases]);

  const visibleRows = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    const filtered = rows.filter((purchase) => {
      const isSynced = purchase.syncedToStock || purchase.syncStatus === "Synced";
      const syncMatches =
        syncFilter === "all" ||
        (syncFilter === "synced" && isSynced) ||
        (syncFilter === "not-synced" && !isSynced);
      const itemText = (purchase.items?.length
        ? purchase.items.map((line) => line.itemName).join(" ")
        : purchase.itemName
      ).toLowerCase();
      const searchMatches =
        !query ||
        purchase.invoiceNo.toLowerCase().includes(query) ||
        purchase.supplier.toLowerCase().includes(query) ||
        itemText.includes(query);
      const invoiceDateKey = (purchase.invoiceDate || localDateKey(purchase.createdAt)).slice(0, 10);
      const dateMatches =
        (!dateFrom || invoiceDateKey >= dateFrom) &&
        (!dateTo || invoiceDateKey <= dateTo);
      return syncMatches && searchMatches && dateMatches;
    });
    return filtered.sort((a, b) => {
      const aKey = a.invoiceDate || localDateKey(a.createdAt);
      const bKey = b.invoiceDate || localDateKey(b.createdAt);
      const diff = new Date(aKey).getTime() - new Date(bKey).getTime();
      return dateSort === "newest" ? -diff : diff;
    });
  }, [invoiceSearch, rows, syncFilter, dateFrom, dateTo, dateSort]);

  const selectedPurchase = editingPurchaseId
    ? rows.find((purchase) => purchase.id === editingPurchaseId)
    : undefined;

  const findDatabaseInvoiceId = async (purchase?: PurchaseRecord) => {
    if (purchase?.dbId) return purchase.dbId;
    if (!purchase) return null;
    const { data, error } = await supabase
      .from("snb_purchase_invoices")
      .select("id")
      .eq("supplier_name", purchase.supplier)
      .eq("invoice_number", purchase.invoiceNo)
      .maybeSingle();
    if (error) throw new Error(`Failed to locate purchase invoice: ${error.message}`);
    return data?.id ? String(data.id) : null;
  };

  const persistDatabaseInvoice = async (
    purchase: PurchaseRecord | undefined,
    invoiceData: {
      supplier: string;
      invoiceNo: string;
      invoiceDate?: string;
      total: number;
      paymentMethod?: string;
      remarks?: string;
    },
    normalizedLines: PurchaseLine[],
    editReason: string,
  ) => {
    const databaseId = await findDatabaseInvoiceId(purchase);
    const rpcItems = normalizedLines.map((line) => ({
      item_name: line.itemName,
      quantity: Number(line.quantity || 0),
      unit: line.unit || "pcs",
      rate: Number(line.cost || 0),
      tax: Number(line.tax || 0),
      discount: Number(line.discount || 0),
      total_amount: lineTotal(line),
    }));
    const revisionEdit = Boolean(
      purchase && databaseId && (
        purchase.syncedToStock ||
        purchase.syncStatus === "Synced" ||
        purchase.syncStatus === "Re-sync Required"
      ),
    );
    const rpcName = revisionEdit
      ? "save_snb_purchase_invoice_revision_secure"
      : "save_snb_purchase_invoice_secure";
    const payload = revisionEdit
      ? {
          p_invoice_id: databaseId,
          p_supplier_name: invoiceData.supplier,
          p_invoice_number: invoiceData.invoiceNo,
          p_invoice_date: invoiceData.invoiceDate || dateInput(),
          p_items: rpcItems,
          p_payment_method: invoiceData.paymentMethod || "credit",
          p_remarks: invoiceData.remarks || null,
          p_edit_reason: editReason.trim(),
        }
      : {
          p_invoice_id: databaseId,
          p_supplier_name: invoiceData.supplier,
          p_invoice_number: invoiceData.invoiceNo,
          p_invoice_date: invoiceData.invoiceDate || dateInput(),
          p_items: rpcItems,
          p_payment_method: invoiceData.paymentMethod || "credit",
          p_remarks: invoiceData.remarks || null,
        };
    const { data, error } = await supabase.rpc(rpcName, payload);
    if (error) {
      const missingRpc = /save_snb_purchase_invoice|could not find the function|does not exist|schema cache/i.test(error.message);
      if (missingRpc) {
        throw new Error("The audited purchase-invoice revision migration is missing. Apply the included SNB revision migration before editing synced invoices.");
      }
      throw new Error(`Failed to save purchase invoice: ${error.message}`);
    }
    const result = data as Record<string, unknown> | null;
    const invoiceId = String(result?.invoiceId || result?.invoice_id || databaseId || "");
    if (!invoiceId) throw new Error("Purchase invoice saved without a database ID.");
    return {
      invoiceId,
      status: String(result?.status || (revisionEdit ? "Re-sync Required" : "Not Synced")),
      revisionNumber: Number(result?.revisionNumber || 0),
    };
  };

  const databaseInvoiceFor = (purchase: PurchaseRecord) =>
    dbReports.supplierOutstanding.find((row) =>
      (purchase.dbId && row.purchase_invoice_id === purchase.dbId) ||
      (normal(row.supplier_name) === normal(purchase.supplier) && normal(row.invoice_number) === normal(purchase.invoiceNo)),
    );
  const paidFor = (purchase: PurchaseRecord) =>
    databaseInvoiceFor(purchase) ? asNumber(databaseInvoiceFor(purchase)?.paid_amount) : Number(purchase.paidAmount || 0);
  const balanceFor = (purchase: PurchaseRecord) =>
    databaseInvoiceFor(purchase) ? asNumber(databaseInvoiceFor(purchase)?.balance_amount) : Math.max(0, Number(purchase.total || 0) - Number(purchase.paidAmount || 0));

  const totalInvoiceValue = rows.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const totalOutstanding = rows.reduce((sum, purchase) => sum + balanceFor(purchase), 0);
  const pendingSyncCount = rows.filter(
    (purchase) => !(purchase.syncedToStock || purchase.syncStatus === "Synced"),
  ).length;

  const lineTotal = (line: Pick<PurchaseLine, "quantity" | "cost" | "tax" | "discount">) =>
    Math.max(
      0,
      Number(line.quantity || 0) * Number(line.cost || 0) +
        Number(line.tax || 0) -
        Number(line.discount || 0),
    );

  const invoiceAmountBeforeRoundOff = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const invoiceRoundOff = roundMoney(roundWholeRupee(invoiceAmountBeforeRoundOff) - invoiceAmountBeforeRoundOff);
  const invoiceTotal = roundWholeRupee(invoiceAmountBeforeRoundOff);

  const chooseItem = (itemName: string) => {
    const item = itemFromCatalog(itemName);
    const suggestedSupplier = supplierForItem(itemName);
    setForm((current) => ({
      ...current,
      itemName,
      unit: purchaseUnitFromCatalog(item?.uom),
      rate: item ? String(item.price) : current.rate,
      supplier: current.supplier || suggestedSupplier?.name || "",
    }));
  };

  const openCreate = () => {
    setEditingPurchaseId(null);
    setForm(createBlankForm());
    setLines([]);
    setSyncedBaseline([]);
    setItemSearch("");
    setEditorOpen(true);
  };

  const purchaseLines = (purchase: PurchaseRecord): PurchaseLine[] =>
    purchase.items?.length
      ? purchase.items.map((line) => ({
          ...line,
          tax: Number(line.tax || 0),
          discount: Number(line.discount || 0),
          total: lineTotal(line),
        }))
      : [
          {
            itemName: purchase.itemName,
            quantity: Number(purchase.quantity || 0),
            unit: purchase.unit || "pcs",
            cost: Number(purchase.cost || 0),
            tax: Number(purchase.tax || 0),
            discount: Number(purchase.discount || 0),
            total: Number(purchase.total || 0),
          },
        ];

  const openEdit = async (purchase: PurchaseRecord) => {
    let editableLines = purchaseLines(purchase);
    let baselineLines: Array<{ itemName: string; quantity: number; unit?: PurchaseUnit }> = [];
    if (purchase.dbId) {
      const { data, error } = await supabase
        .from("snb_purchase_invoice_items")
        .select("item_name,quantity,unit,rate,tax,discount,total_amount,synced_quantity")
        .eq("purchase_invoice_id", purchase.dbId)
        .order("created_at", { ascending: true });
      if (error) {
        setNotice(`Unable to load invoice items: ${error.message}`);
        return;
      }
      if (data?.length) {
        editableLines = data
          .filter((line) => asNumber(line.quantity) > 0)
          .map((line) => ({
            itemName: String(line.item_name),
            quantity: asNumber(line.quantity),
            unit: (String(line.unit || "nos").toLowerCase() as PurchaseUnit),
            cost: asNumber(line.rate),
            tax: asNumber(line.tax),
            discount: asNumber(line.discount),
            total: asNumber(line.total_amount),
          }));
        baselineLines = data
          .filter((line) => asNumber(line.synced_quantity) > 0)
          .map((line) => ({
            itemName: String(line.item_name),
            quantity: asNumber(line.synced_quantity),
            unit: (String(line.unit || "nos").toLowerCase() as PurchaseUnit),
          }));
      }
    }
    const first = catalogItems[0];
    setEditingPurchaseId(purchase.id);
    setForm({
      supplier: purchase.supplier,
      invoiceNo: purchase.invoiceNo,
      invoiceDate: purchase.invoiceDate || localDateKey(purchase.createdAt),
      itemName: first?.name || purchase.itemName,
      quantity: "",
      unit: purchaseUnitFromCatalog(first?.uom),
      rate: first ? String(first.price) : "",
      tax: "0",
      discount: "0",
      remarks: purchase.remarks || "",
      editReason: "",
    });
    setLines(editableLines);
    setSyncedBaseline(baselineLines);
    setItemSearch("");
    setEditorOpen(true);
  };

  const addLine = () => {
    const quantity = Number(form.quantity);
    const cost = Number(form.rate);
    const tax = Number(form.tax || 0);
    const discount = Number(form.discount || 0);
    if (!form.itemName || !Number.isFinite(quantity) || quantity <= 0) {
      setNotice("Enter a valid item quantity before adding it to the invoice.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setNotice("Enter a valid item price before adding it to the invoice.");
      return;
    }
    const newLine: PurchaseLine = {
      itemName: form.itemName,
      quantity,
      unit: form.unit,
      cost,
      tax: Math.max(0, tax),
      discount: Math.max(0, discount),
      total: 0,
    };
    newLine.total = lineTotal(newLine);
    setLines((current) => [...current, newLine]);
    setForm((current) => ({
      ...current,
      quantity: "",
      tax: "0",
      discount: "0",
    }));
  };

  const updateLine = (index: number, updates: Partial<PurchaseLine>) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...updates };
        return { ...next, total: lineTotal(next) };
      }),
    );
  };

  const changeLineItem = (index: number, itemName: string) => {
    const item = itemFromCatalog(itemName);
    updateLine(index, {
      itemName,
      unit: purchaseUnitFromCatalog(item?.uom),
      cost: item ? Number(item.price) : 0,
    });
  };

  const aggregateQuantities = (purchaseLinesToAggregate: Array<{ itemName: string; quantity: number }>) => {
    const map = new Map<string, { itemName: string; quantity: number }>();
    purchaseLinesToAggregate.forEach((line) => {
      const key = normal(line.itemName);
      const current = map.get(key);
      map.set(key, {
        itemName: current?.itemName || line.itemName,
        quantity: Number(current?.quantity || 0) + Number(line.quantity || 0),
      });
    });
    return map;
  };

  const requiresRevisionReason = Boolean(
    selectedPurchase && (
      selectedPurchase.syncedToStock ||
      selectedPurchase.syncStatus === "Synced" ||
      selectedPurchase.syncStatus === "Re-sync Required"
    ),
  );

  const stockAdjustments = (() => {
    if (!requiresRevisionReason) {
      return [] as Array<{ itemName: string; delta: number }>;
    }
    const oldMap = aggregateQuantities(syncedBaseline);
    const newMap = aggregateQuantities(lines);
    return Array.from(new Set([...oldMap.keys(), ...newMap.keys()]))
      .map((key) => ({
        itemName: newMap.get(key)?.itemName || oldMap.get(key)?.itemName || key,
        delta: Number(newMap.get(key)?.quantity || 0) - Number(oldMap.get(key)?.quantity || 0),
      }))
      .filter((adjustment) => Math.abs(adjustment.delta) > 0.0001);
  })();

  const saveInvoice = async () => {
    if (saving) return;
    if (!form.supplier.trim()) {
      setNotice("Supplier is required.");
      return;
    }
    if (!form.invoiceNo.trim()) {
      setNotice("Invoice number is required.");
      return;
    }
    if (!lines.length) {
      setNotice("Add at least one item to the invoice.");
      return;
    }
    const duplicate = rows.find(
      (purchase) =>
        purchase.id !== editingPurchaseId &&
        purchase.invoiceNo.trim().toLowerCase() === form.invoiceNo.trim().toLowerCase(),
    );
    if (duplicate) {
      setNotice(`Invoice number ${form.invoiceNo.trim()} already exists.`);
      return;
    }

    const normalizedLines = lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity || 0),
      cost: Number(line.cost || 0),
      tax: Math.max(0, Number(line.tax || 0)),
      discount: Math.max(0, Number(line.discount || 0)),
      total: lineTotal(line),
    }));
    if (normalizedLines.some((line) => !line.itemName || line.quantity <= 0 || line.cost < 0)) {
      setNotice("Every invoice item must have a valid item, quantity, unit, and price.");
      return;
    }
    const duplicateItemNames = normalizedLines
      .map((line) => normal(line.itemName))
      .filter((name, index, all) => all.indexOf(name) !== index);
    if (duplicateItemNames.length) {
      setNotice("Each item can appear only once in a purchase invoice. Combine duplicate quantities before saving.");
      return;
    }
    if (requiresRevisionReason && form.editReason.trim().length < 5) {
      setNotice("Enter a clear reason for editing this synced purchase invoice.");
      return;
    }
    const rawTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.total, 0));
    const total = roundWholeRupee(rawTotal);
    const roundOff = roundMoney(total - rawTotal);
    if (selectedPurchase && total + 0.001 < paidFor(selectedPurchase)) {
      setNotice(`Invoice total cannot be below the already paid amount of ${money(paidFor(selectedPurchase))}.`);
      return;
    }

    const first = normalizedLines[0];
    const invoiceData = {
      supplier: form.supplier.trim(),
      invoiceNo: form.invoiceNo.trim(),
      invoiceDate: form.invoiceDate,
      itemName: normalizedLines.length > 1 ? `${normalizedLines.length} items` : first.itemName,
      quantity: normalizedLines.reduce((sum, line) => sum + line.quantity, 0),
      unit: first.unit || "pcs",
      cost: normalizedLines.length > 1 ? 0 : first.cost,
      items: normalizedLines,
      tax: normalizedLines.reduce((sum, line) => sum + line.tax, 0),
      discount: normalizedLines.reduce((sum, line) => sum + Number(line.discount || 0), 0),
      total,
      amountBeforeRoundOff: rawTotal,
      roundOff,
      paymentMethod: selectedPurchase?.paymentMethod || ("credit" as const),
      remarks: form.remarks.trim(),
    };

    setSaving(true);
    try {
      const saved = await persistDatabaseInvoice(
        selectedPurchase,
        invoiceData,
        normalizedLines,
        form.editReason,
      );
      const dbId = saved.invoiceId;
      const localPurchase = selectedPurchase
        ? purchases.find((purchase) => purchase.id === selectedPurchase.id || purchase.dbId === dbId)
        : undefined;
      if (localPurchase) {
        updatePurchase(localPurchase.id, { ...invoiceData, dbId }, userName);
      } else {
        addPurchase({
          branch: BRANCH,
          dbId,
          ...invoiceData,
          enteredBy: userName,
        });
      }
      if (requiresRevisionReason) {
        addAuditLog({
          branch: BRANCH,
          user: userName,
          action: "SNB Synced Purchase Invoice Edited",
          previousValue: selectedPurchase?.invoiceNo || form.invoiceNo.trim(),
          newValue: `Revision ${saved.revisionNumber} · ${form.editReason.trim()} · waiting for stock re-sync`,
        });
        setNotice(`${form.invoiceNo.trim()} updated. Revision ${saved.revisionNumber} is waiting for Sync Again; Admin and Owner were notified.`);
      } else {
        setNotice(selectedPurchase
          ? `${form.invoiceNo.trim()} updated in the SNB purchase ledger.`
          : `${form.invoiceNo.trim()} saved in the SNB purchase ledger. Stock sync is pending.`);
      }
      await dbReports.refresh();
      setEditorOpen(false);
      setEditingPurchaseId(null);
      setLines([]);
      setSyncedBaseline([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Purchase invoice save failed.");
    } finally {
      setSaving(false);
    }
  };

  const sync = async (purchase: PurchaseRecord) => {
    if (purchase.syncedToStock || purchase.syncStatus === "Synced") {
      setNotice("This purchase invoice is already synced to stock. Duplicate sync prevented.");
      return;
    }
    const isResync = purchase.syncStatus === "Re-sync Required";
    setSaving(true);
    try {
      const invoiceId = await findDatabaseInvoiceId(purchase);
      if (!invoiceId) throw new Error("This invoice is not present in the SNB database ledger. Edit and save it once before stock sync.");
      const { error } = await supabase.rpc("snb_sync_purchase_invoice_to_stock", {
        p_invoice_id: invoiceId,
        p_synced_by: userName,
      });
      if (error) throw new Error(`${isResync ? "Stock re-sync" : "Stock sync"} failed: ${error.message}`);
      const localPurchase = purchases.find((entry) => entry.id === purchase.id || entry.dbId === invoiceId);
      if (localPurchase) markPurchaseSynced(localPurchase.id, userName, "Synced");
      addAuditLog({
        branch: BRANCH,
        user: userName,
        action: isResync ? "SNB Purchase Revision Re-synced" : "SNB Purchase Sync To Stock",
        previousValue: purchase.invoiceNo,
        newValue: isResync
          ? `${purchase.invoiceNo} revision delta applied to stock`
          : `${purchaseLines(purchase).length} item(s) synced from ${purchase.invoiceNo}`,
      });
      await Promise.all([fetchBranchData(BRANCH), dbReports.refresh()]);
      setNotice(isResync
        ? `${purchase.invoiceNo} changes were re-synced to SNB stock successfully. The audit notification was updated.`
        : `${purchase.invoiceNo} synced to SNB stock successfully.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Purchase stock sync failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Purchase Invoices"
          value={rows.length}
          sub={`${visibleRows.length} currently shown`}
          icon={<Receipt className="size-5" />}
          tone="blue"
        />
        <Kpi
          label="Purchase Value"
          value={money(totalInvoiceValue)}
          sub="All recorded invoices"
          icon={<IndianRupee className="size-5" />}
          tone="purple"
        />
        <Kpi
          label="Outstanding"
          value={money(totalOutstanding)}
          sub="Pending supplier payment"
          icon={<WalletCards className="size-5" />}
          tone="amber"
        />
        <Kpi
          label="Pending Stock Sync"
          value={pendingSyncCount}
          sub="Invoices waiting for stock update"
          icon={<PackageCheck className="size-5" />}
          tone={pendingSyncCount ? "red" : "green"}
        />
      </div>

      <Panel
        title="Purchase Invoice Management"
        icon={<ShoppingCart className="size-4" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")}
              onClick={() =>
                csvDownload(
                  "SNB_Purchase_Invoices.xls",
                  visibleRows.map((purchase) => ({
                    Invoice: purchase.invoiceNo,
                    Date: purchase.invoiceDate || localDateKey(purchase.createdAt),
                    Supplier: purchase.supplier,
                    Items: purchase.items?.length || 1,
                    Total: purchase.total,
                    Paid: paidFor(purchase),
                    Balance: balanceFor(purchase),
                    SyncStatus: purchase.syncStatus ?? "Not Synced",
                    LastEditedBy: purchase.lastEditedBy || "",
                  })),
                )
              }
            >
              <Download className="size-4" /> Export
            </button>
            <button
              className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")}
              onClick={() =>
                csvDownload(
                  "SNB_Purchase_Invoices_Itemwise.xls",
                  visibleRows.flatMap((purchase) =>
                    purchaseLines(purchase).map((line) => ({
                      Invoice: purchase.invoiceNo,
                      Date: purchase.invoiceDate || localDateKey(purchase.createdAt),
                      Supplier: purchase.supplier,
                      Item: line.itemName,
                      Quantity: line.quantity,
                      Unit: line.unit,
                      Rate: line.cost,
                      Tax: line.tax || 0,
                      Discount: line.discount || 0,
                      LineTotal: line.total,
                      InvoiceTotal: purchase.total,
                      SyncStatus: purchase.syncStatus ?? "Not Synced",
                    })),
                  ),
                )
              }
            >
              <Download className="size-4" /> Export (Item-wise)
            </button>
            <button
              className={cn(btnCls, "bg-slate-950 text-white")}
              onClick={openCreate}
            >
              <Plus className="size-4" /> New Invoice
            </button>
          </div>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_150px_150px_auto_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputCls, "pl-10")}
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Search invoice, supplier, or item"
            />
          </label>
          <label className="relative">
            <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <select
              className={cn(inputCls, "pl-10")}
              value={syncFilter}
              onChange={(event) => setSyncFilter(event.target.value as typeof syncFilter)}
            >
              <option value="all">All stock statuses</option>
              <option value="not-synced">Not synced</option>
              <option value="synced">Synced</option>
            </select>
          </label>
          <input
            type="date"
            className={inputCls}
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            title="Invoice date from"
          />
          <input
            type="date"
            className={inputCls}
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            title="Invoice date to"
          />
          <button
            className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")}
            onClick={() => setDateSort((current) => (current === "newest" ? "oldest" : "newest"))}
            title="Toggle date sort order"
          >
            <ArrowUpDown className="size-4" /> {dateSort === "newest" ? "Newest first" : "Oldest first"}
          </button>
          {(invoiceSearch || syncFilter !== "all" || dateFrom || dateTo) && (
            <button
              className={cn(btnCls, "bg-slate-100 text-slate-700")}
              onClick={() => {
                setInvoiceSearch("");
                setSyncFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="size-4" /> Clear
            </button>
          )}
        </div>

        <DataTable
          headers={["Invoice", "Supplier", "Items", "Total", "Balance", "Payment", "Stock", "Actions"]}
          rows={visibleRows.map((purchase) => {
            const balance = balanceFor(purchase);
            const paidAmount = paidFor(purchase);
            const paymentStatus = balance <= 0 ? "Cleared" : paidAmount > 0 ? "Partial" : "Pending";
            const isSynced = purchase.syncedToStock || purchase.syncStatus === "Synced";
            const needsResync = purchase.syncStatus === "Re-sync Required";
            const invoiceLines = purchaseLines(purchase);
            return [
              <div key="invoice" className="min-w-[130px]">
                <p className="font-black text-slate-950">{purchase.invoiceNo}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {fmtDate(purchase.invoiceDate || purchase.createdAt)}
                </p>
                {purchase.lastEditedBy && (
                  <p className="mt-1 text-[10px] font-bold text-blue-600">
                    Edited by {purchase.lastEditedBy}
                  </p>
                )}
              </div>,
              <div key="supplier" className="min-w-[140px]">
                <p className="font-black text-slate-800">{purchase.supplier}</p>
                {purchase.remarks && <p className="mt-1 max-w-[180px] truncate text-xs text-slate-500">{purchase.remarks}</p>}
              </div>,
              <div key="items" className="min-w-[160px]">
                <p className="font-black text-slate-800">
                  {invoiceLines.length} item{invoiceLines.length === 1 ? "" : "s"}
                </p>
                <p className="mt-1 max-w-[210px] truncate text-xs text-slate-500">
                  {invoiceLines.map((line) => line.itemName).join(", ")}
                </p>
              </div>,
              <div key="total" className="font-black tabular-nums text-slate-950">{money(purchase.total)}</div>,
              <div key="balance" className="tabular-nums">
                <p className="font-black text-slate-800">{money(balance)}</p>
                <p className="mt-1 text-xs text-slate-500">Paid {money(paidAmount)}</p>
              </div>,
              <StatusBadge key="payment" tone={paymentStatus === "Cleared" ? "green" : paymentStatus === "Partial" ? "blue" : "amber"}>
                {paymentStatus}
              </StatusBadge>,
              <StatusBadge key="stock" tone={isSynced ? "green" : needsResync ? "red" : "amber"}>
                {purchase.syncStatus ?? "Not Synced"}
              </StatusBadge>,
              <div key="actions" className="flex min-w-[210px] flex-wrap gap-2">
                <button
                  onClick={() => setViewingPurchase(purchase)}
                  className={cn(btnCls, "bg-slate-50 px-3 py-1.5 text-slate-700 ring-1 ring-slate-200")}
                >
                  <Eye className="size-3.5" /> View
                </button>
                <button
                  onClick={() => void openEdit(purchase)}
                  className={cn(btnCls, "bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100")}
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button
                  onClick={() => sync(purchase)}
                  disabled={isSynced}
                  className={cn(
                    btnCls,
                    "px-3 py-1.5",
                    isSynced
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-emerald-600 text-white",
                  )}
                >
                  <RefreshCcw className="size-3.5" />
                  {isSynced ? "Synced" : needsResync ? "Sync Again" : "Sync"}
                </button>
              </div>,
            ];
          })}
          empty="No purchase invoices match the current search and filters."
        />
      </Panel>

      {editorOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setEditorOpen(false);
          }}
        >
          <section className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
                  {selectedPurchase ? "Edit existing invoice" : "Create purchase invoice"}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {selectedPurchase ? selectedPurchase.invoiceNo : "New Purchase Invoice"}
                </h2>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
                onClick={() => !saving && setEditorOpen(false)}
                aria-label="Close invoice editor"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              <Panel title="Invoice Details" icon={<Receipt className="size-4" />}>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Supplier *">
                    <input
                      className={inputCls}
                      value={form.supplier}
                      onChange={(event) => setForm({ ...form, supplier: event.target.value })}
                      list="snb-purchase-suppliers"
                      placeholder="Enter or select supplier"
                    />
                    <datalist id="snb-purchase-suppliers">
                      {suppliers
                        .filter((supplier) => supplier.branch === BRANCH)
                        .map((supplier) => <option key={supplier.id} value={supplier.name} />)}
                    </datalist>
                  </Field>
                  <Field label="Invoice No *">
                    <input
                      className={inputCls}
                      value={form.invoiceNo}
                      onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })}
                      placeholder="Supplier invoice number"
                    />
                  </Field>
                  <Field label="Invoice Date">
                    <input
                      type="date"
                      className={inputCls}
                      value={form.invoiceDate}
                      onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Add Invoice Item"
                icon={<Package className="size-4" />}
                action={
                  <StatusBadge tone="blue">Price and unit autofill</StatusBadge>
                }
              >
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-4">
                    <Field label="Search Item">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className={cn(inputCls, "pl-10")}
                          value={itemSearch}
                          onChange={(event) => setItemSearch(event.target.value)}
                          placeholder="Search catalogue"
                        />
                      </div>
                    </Field>
                  </div>
                  <div className="lg:col-span-4">
                    <Field label="Item *">
                      <select
                        className={inputCls}
                        value={form.itemName}
                        onChange={(event) => chooseItem(event.target.value)}
                      >
                        {itemOptions.map((item) => (
                          <option key={item.barcode} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="lg:col-span-2">
                    <Field label="Quantity *">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={inputCls}
                        value={form.quantity}
                        onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                        placeholder="0"
                      />
                    </Field>
                  </div>
                  <div className="lg:col-span-2">
                    <Field label="Unit *">
                      <select
                        className={inputCls}
                        value={form.unit}
                        onChange={(event) => setForm({ ...form, unit: event.target.value as PurchaseUnit })}
                      >
                        <option value="pcs">Pcs</option>
                        <option value="kg">KG</option>
                        <option value="ltr">Ltr</option>
                        <option value="nos">Nos</option>
                        <option value="bunch">Bunch</option>
                      </select>
                    </Field>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label="Item Price / Rate *">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        value={form.rate}
                        onChange={(event) => setForm({ ...form, rate: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label="Tax Amount">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        value={form.tax}
                        onChange={(event) => setForm({ ...form, tax: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label="Discount Amount">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={inputCls}
                        value={form.discount}
                        onChange={(event) => setForm({ ...form, discount: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="flex items-end lg:col-span-3">
                    <button
                      onClick={addLine}
                      className={cn(btnCls, "w-full bg-amber-500 text-slate-950")}
                    >
                      <Plus className="size-4" /> Add Item
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                  {selectedCatalogItem && (
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
                      Catalogue: {money(selectedCatalogItem.price)} / {purchaseUnitFromCatalog(selectedCatalogItem.uom)}
                    </span>
                  )}
                  {selectedSupplier && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                      Suggested supplier: {selectedSupplier.name}
                    </span>
                  )}
                  <span>The auto-filled price and unit can be changed before adding the item.</span>
                </div>
              </Panel>

              <Panel
                title={`Invoice Items (${lines.length})`}
                icon={<ShoppingCart className="size-4" />}
                action={<p className="text-sm font-black text-slate-950">Before round-off: {money(invoiceAmountBeforeRoundOff)} · Round-off {invoiceRoundOff >= 0 ? "+" : ""}{money(invoiceRoundOff)} · Total: {money(invoiceTotal)}</p>}
              >
                {lines.length ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Item</th>
                          <th className="px-3 py-2.5">Qty</th>
                          <th className="px-3 py-2.5">Unit</th>
                          <th className="px-3 py-2.5">Rate</th>
                          <th className="px-3 py-2.5">Tax</th>
                          <th className="px-3 py-2.5">Discount</th>
                          <th className="px-3 py-2.5 text-right">Amount</th>
                          <th className="w-14 px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {lines.map((line, index) => (
                          <tr key={`${line.itemName}-${index}`}>
                            <td className="min-w-[230px] px-3 py-2.5">
                              <select
                                className="w-full rounded-xl border border-slate-200 px-2 py-1.5 font-black text-slate-800 outline-none focus:border-amber-400"
                                value={line.itemName}
                                onChange={(event) => changeLineItem(index, event.target.value)}
                              >
                                {catalogItems.map((item) => (
                                  <option key={item.barcode} value={item.name}>{item.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 font-bold outline-none focus:border-amber-400"
                                value={line.quantity}
                                onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 font-bold outline-none focus:border-amber-400"
                                value={line.unit || "pcs"}
                                onChange={(event) => updateLine(index, { unit: event.target.value as PurchaseUnit })}
                              >
                                <option value="pcs">Pcs</option>
                                <option value="kg">KG</option>
                                <option value="ltr">Ltr</option>
                                <option value="nos">Nos</option>
                                <option value="bunch">Bunch</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-28 rounded-xl border border-slate-200 px-2 py-1.5 font-bold outline-none focus:border-amber-400"
                                value={line.cost}
                                onChange={(event) => updateLine(index, { cost: Number(event.target.value) })}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 font-bold outline-none focus:border-amber-400"
                                value={line.tax}
                                onChange={(event) => updateLine(index, { tax: Number(event.target.value) })}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 font-bold outline-none focus:border-amber-400"
                                value={line.discount || 0}
                                onChange={(event) => updateLine(index, { discount: Number(event.target.value) })}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-950">{money(lineTotal(line))}</td>
                            <td className="px-3 py-2.5">
                              <button
                                className="flex size-8 items-center justify-center rounded-xl bg-red-50 text-red-600"
                                onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                                aria-label={`Remove ${line.itemName}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">
                    Select an item above, confirm its auto-filled unit and price, and click Add Item.
                  </div>
                )}
              </Panel>

              {requiresRevisionReason && (
                <Panel title="Reason for Editing Synced Invoice *" icon={<AlertTriangle className="size-4" />}>
                  <textarea
                    className={cn(inputCls, "min-h-24 resize-y border-amber-300 bg-amber-50/50")}
                    value={form.editReason}
                    onChange={(event) => setForm({ ...form, editReason: event.target.value })}
                    placeholder="Explain why this synced invoice is being changed. This reason is saved in the audit history and sent to Admin and Owner."
                  />
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Saving will not change stock immediately. The invoice will move to Re-sync Required and the stock difference must be applied with Sync Again.
                  </p>
                </Panel>
              )}

              <Panel title="Remarks" icon={<BookOpenCheck className="size-4" />}>
                <textarea
                  className={cn(inputCls, "min-h-24 resize-y")}
                  value={form.remarks}
                  onChange={(event) => setForm({ ...form, remarks: event.target.value })}
                  placeholder="Optional invoice notes"
                />
              </Panel>

              {requiresRevisionReason ? (
                <div className={cn(
                  "rounded-3xl p-4 ring-1",
                  stockAdjustments.length
                    ? "bg-amber-50 text-amber-900 ring-amber-200"
                    : "bg-emerald-50 text-emerald-900 ring-emerald-200",
                )}>
                  <div className="flex items-start gap-3">
                    {stockAdjustments.length ? <AlertTriangle className="mt-0.5 size-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0" />}
                    <div>
                      <p className="font-black">
                        {stockAdjustments.length ? "Stock difference waiting for re-sync" : "No stock quantity difference detected"}
                      </p>
                      <p className="mt-1 text-sm font-semibold opacity-80">
                        {stockAdjustments.length
                          ? stockAdjustments.map((adjustment) => `${adjustment.itemName}: ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta}`).join(" · ")
                          : "Price, tax, discount, supplier, invoice number, or remarks changes still require an audited Sync Again confirmation."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Invoice Total</p>
                <p className="text-2xl font-black tabular-nums text-slate-950">{money(invoiceTotal)}</p>
                <p className="text-xs font-bold text-slate-500">Before round-off {money(invoiceAmountBeforeRoundOff)} · Round-off {invoiceRoundOff >= 0 ? "+" : ""}{money(invoiceRoundOff)}</p>
                {selectedPurchase && paidFor(selectedPurchase) > 0 && (
                  <p className="text-xs font-bold text-slate-500">Already paid: {money(paidFor(selectedPurchase))}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className={cn(btnCls, "bg-slate-100 text-slate-700")}
                  onClick={() => !saving && setEditorOpen(false)}
                >
                  Cancel
                </button>
                <button
                  disabled={saving || !lines.length}
                  className={cn(
                    btnCls,
                    "min-w-[180px]",
                    saving || !lines.length
                      ? "cursor-not-allowed bg-slate-200 text-slate-400"
                      : "bg-slate-950 text-white",
                  )}
                  onClick={saveInvoice}
                >
                  <CheckCircle2 className="size-4" />
                  {saving
                    ? "Saving..."
                    : requiresRevisionReason
                      ? "Save Changes & Require Re-sync"
                      : selectedPurchase
                        ? "Update Invoice"
                        : "Save Invoice"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {viewingPurchase && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingPurchase(null); }}
        >
          <section className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Purchase Invoice</p>
                <h3 className="text-lg font-black text-slate-950">{viewingPurchase.invoiceNo}</h3>
              </div>
              <button onClick={() => setViewingPurchase(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Supplier</p><p className="font-black text-slate-900">{viewingPurchase.supplier}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Invoice Date</p><p className="font-black text-slate-900">{fmtDate(viewingPurchase.invoiceDate || viewingPurchase.createdAt)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Payment</p><p className="font-black text-slate-900 capitalize">{viewingPurchase.paymentMethod || "credit"}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Stock Status</p><p className="font-black text-slate-900">{viewingPurchase.syncStatus ?? "Not Synced"}</p></div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="p-3">Item</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">Tax</th>
                      <th className="p-3 text-right">Discount</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseLines(viewingPurchase).map((line, idx) => (
                      <tr key={`${line.itemName}-${idx}`} className="border-t">
                        <td className="p-3 font-bold text-slate-800">{line.itemName}</td>
                        <td className="p-3 text-right tabular-nums">{line.quantity} {line.unit}</td>
                        <td className="p-3 text-right tabular-nums">{money(line.cost)}</td>
                        <td className="p-3 text-right tabular-nums">{money(line.tax || 0)}</td>
                        <td className="p-3 text-right tabular-nums">{money(line.discount || 0)}</td>
                        <td className="p-3 text-right font-black tabular-nums">{money(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm font-bold">
                <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="text-slate-900">{money(viewingPurchase.total)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-slate-900">{money(paidFor(viewingPurchase))}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base"><span className="font-black text-slate-950">Balance</span><span className="font-black text-slate-950">{money(balanceFor(viewingPurchase))}</span></div>
              </div>
              {viewingPurchase.remarks && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{viewingPurchase.remarks}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setViewingPurchase(null)} className={cn(btnCls, "bg-slate-100 text-slate-700")}>Close</button>
              <button onClick={() => { setViewingPurchase(null); void openEdit(viewingPurchase); }} className={cn(btnCls, "bg-slate-950 text-white")}>
                <Pencil className="size-3.5" /> Edit This Invoice
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function PurchaseReturnsTab({
  userName,
  branchStock,
  fetchBranchData,
  dbReports,
  setNotice,
}: {
  userName: string;
  branchStock: any[];
  fetchBranchData: (branch: Branch) => Promise<void>;
  dbReports: ReturnType<typeof useSnbAdminReports>;
  setNotice: (message: string) => void;
}) {
  type InvoiceItemRow = {
    id: string;
    purchase_invoice_id: string;
    item_name: string;
    quantity: number | string;
    unit: string;
    rate: number | string;
    tax: number | string;
    discount: number | string;
    total_amount: number | string;
    synced_quantity: number | string;
  };
  type ReturnLine = InvoiceItemRow & {
    returnable: number;
    stockAvailable: number;
    returnQuantity: string;
    itemReason: string;
    batchNo: string;
    expiryDate: string;
  };

  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [returnDate, setReturnDate] = useState(dateInput());
  const [reasonType, setReasonType] = useState("Damaged");
  const [settlementType, setSettlementType] = useState("Credit Note");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const eligibleInvoices = useMemo(() => dbReports.purchaseInvoices
    .filter((invoice) => isSyncedPurchaseStatus(invoice.sync_status))
    .sort((a, b) => {
      const aTime = new Date(a.invoice_date || a.created_at || 0).getTime();
      const bTime = new Date(b.invoice_date || b.created_at || 0).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    }), [dbReports.purchaseInvoices]);

  const selectedInvoice = eligibleInvoices.find((invoice) => String(invoice.id) === invoiceId);
  const syncedInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    return eligibleInvoices
      .filter((invoice) =>
        !query ||
        String(invoice.invoice_number || "").toLowerCase().includes(query) ||
        String(invoice.supplier_name || "").toLowerCase().includes(query),
      );
  }, [eligibleInvoices, invoiceSearch]);
  const invoiceOptions = selectedInvoice && !syncedInvoices.some((invoice) => invoice.id === selectedInvoice.id)
    ? [selectedInvoice, ...syncedInvoices]
    : syncedInvoices;

  const returnedQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    dbReports.purchaseReturnItems.forEach((item) => {
      map.set(item.purchase_invoice_item_id, (map.get(item.purchase_invoice_item_id) || 0) + asNumber(item.quantity));
    });
    return map;
  }, [dbReports.purchaseReturnItems]);

  useEffect(() => {
    if (!invoiceId) {
      setLines([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingItems(true);
      setError("");
      const { data, error: queryError } = await supabase
        .from("snb_purchase_invoice_items")
        .select("*")
        .eq("purchase_invoice_id", invoiceId)
        .order("item_name", { ascending: true });
      if (cancelled) return;
      setLoadingItems(false);
      if (queryError) {
        setLines([]);
        setError(`Unable to load invoice items: ${queryError.message}`);
        return;
      }
      const next = ((data || []) as InvoiceItemRow[]).map((item) => {
        const stockRow = branchStock.find((stock) => normal(stock.itemName) === normal(item.item_name));
        const returnable = Math.max(0, asNumber(item.synced_quantity) - (returnedQtyByItem.get(item.id) || 0));
        return {
          ...item,
          returnable,
          stockAvailable: asNumber(stockRow?.quantity),
          returnQuantity: "",
          itemReason: "",
          batchNo: "",
          expiryDate: "",
        };
      });
      setLines(next);
    };
    void load();
    return () => { cancelled = true; };
  }, [invoiceId, branchStock, returnedQtyByItem]);

  const selectedLines = lines.filter((line) => asNumber(line.returnQuantity) > 0);
  const lineValue = (line: ReturnLine) => {
    const quantity = asNumber(line.returnQuantity);
    const originalQty = asNumber(line.quantity);
    const ratio = originalQty > 0 ? quantity / originalQty : 0;
    return Math.max(0, quantity * asNumber(line.rate) + asNumber(line.tax) * ratio - asNumber(line.discount) * ratio);
  };
  const totalQuantity = selectedLines.reduce((sum, line) => sum + asNumber(line.returnQuantity), 0);
  const estimatedTotal = selectedLines.reduce((sum, line) => sum + lineValue(line), 0);

  const updateLine = (id: string, patch: Partial<ReturnLine>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
    setError("");
  };

  const clearForm = () => {
    setInvoiceId("");
    setReturnDate(dateInput());
    setReasonType("Damaged");
    setSettlementType("Credit Note");
    setCreditNoteNo("");
    setReferenceNo("");
    setRemarks("");
    setConfirmed(false);
    setLines([]);
    setError("");
  };

  const submitReturn = async () => {
    setError("");
    if (!selectedInvoice) return setError("Select a synced purchase invoice.");
    if (!returnDate) return setError("Return date is required.");
    if (returnDate > dateInput()) return setError("Return date cannot be in the future.");
    if (!selectedLines.length) return setError("Enter a return quantity for at least one item.");
    if (remarks.trim().length < 5) return setError("Enter clear return remarks with at least 5 characters.");
    if (settlementType === "Credit Note" && !creditNoteNo.trim()) return setError("Credit note number is mandatory for a credit-note return.");
    if (["Cash Refund", "Bank Refund"].includes(settlementType) && !referenceNo.trim()) return setError("Refund reference number is mandatory.");
    for (const line of selectedLines) {
      const qty = asNumber(line.returnQuantity);
      if (qty <= 0) return setError(`Enter a valid return quantity for ${line.item_name}.`);
      if (qty > line.returnable + 0.0001) return setError(`${line.item_name} can return only ${line.returnable} ${line.unit}.`);
      if (qty > line.stockAvailable + 0.0001) return setError(`${line.item_name} has only ${line.stockAvailable} ${line.unit} in live SNB stock.`);
      if (line.itemReason.trim().length < 3) return setError(`Enter damage/quality details for ${line.item_name}.`);
      if (reasonType === "Expired" && !line.expiryDate) return setError(`Expiry date is required for ${line.item_name}.`);
    }
    if (!confirmed) return setError("Confirm that the returned items were physically verified and removed from usable stock.");
    if (!window.confirm(`Post purchase return for ${selectedInvoice.invoice_number}? ${totalQuantity.toFixed(3)} item units will be deducted from SNB stock.`)) return;

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("create_snb_purchase_return_secure", {
      p_purchase_invoice_id: selectedInvoice.id,
      p_return_date: returnDate,
      p_reason_type: reasonType,
      p_settlement_type: settlementType,
      p_credit_note_no: creditNoteNo.trim() || null,
      p_reference_no: referenceNo.trim() || null,
      p_remarks: remarks.trim(),
      p_items: selectedLines.map((line) => ({
        purchase_invoice_item_id: line.id,
        quantity: asNumber(line.returnQuantity),
        item_reason: line.itemReason.trim(),
        batch_no: line.batchNo.trim() || null,
        expiry_date: line.expiryDate || null,
      })),
    });
    setSaving(false);
    if (rpcError) {
      setError(`Purchase return failed: ${rpcError.message}`);
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    await Promise.all([fetchBranchData(BRANCH), dbReports.refresh()]);
    setNotice(`${String(result.returnNo || "Purchase return")} posted by ${userName}. Damaged stock was deducted${asNumber(result.financialAdjustment) > 0 ? " and supplier payable was adjusted" : " without changing supplier payable"}.`);
    clearForm();
  };

  const historyRows = dbReports.purchaseReturns.map((entry) => {
    const items = dbReports.purchaseReturnItems.filter((item) => item.purchase_return_id === entry.id);
    return {
      entry,
      items,
      summary: items.map((item) => `${item.item_name} ${asNumber(item.quantity)} ${item.unit}`).join(", "),
    };
  });

  const printReturn = (entry: (typeof historyRows)[number]) => {
    printHtml(
      `Purchase Return ${entry.entry.return_no}`,
      `<div class="stamp">PURCHASE RETURN</div>
       <div class="section"><div class="row"><span>Return No</span><b>${entry.entry.return_no}</b></div><div class="row"><span>Date</span><b>${entry.entry.return_date}</b></div><div class="row"><span>Supplier</span><b>${entry.entry.supplier_name}</b></div><div class="row"><span>Invoice</span><b>${entry.entry.invoice_number}</b></div><div class="row"><span>Reason</span><b>${entry.entry.reason_type}</b></div><div class="row"><span>Settlement</span><b>${entry.entry.settlement_type}</b></div><div class="row"><span>Credit / Reference</span><b>${entry.entry.credit_note_no || entry.entry.reference_no || "-"}</b></div></div>
       <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Damage / Return Details</th><th>Stock Before</th><th>Stock After</th><th>Value</th></tr></thead><tbody>${entry.items.map((item) => `<tr><td>${item.item_name}</td><td>${asNumber(item.quantity)}</td><td>${item.unit}</td><td>${item.item_reason}${item.batch_no ? `<br/>Batch: ${item.batch_no}` : ""}</td><td>${asNumber(item.stock_before)}</td><td>${asNumber(item.stock_after)}</td><td>${money(asNumber(item.line_total))}</td></tr>`).join("")}</tbody></table>
       <div class="section"><div class="row"><span>Total Return Value</span><b>${money(asNumber(entry.entry.total_amount))}</b></div><div class="row"><span>Remarks</span><b>${entry.entry.remarks}</b></div><div class="row"><span>Entered By</span><b>${entry.entry.entered_by}</b></div></div>`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Purchase Returns" value={dbReports.purchaseReturns.length} icon={<RotateCcw className="size-5" />} tone="amber" />
        <Kpi label="Returned Quantity" value={dbReports.purchaseReturnItems.reduce((sum, item) => sum + asNumber(item.quantity), 0).toFixed(3)} icon={<Package className="size-5" />} tone="red" />
        <Kpi label="Return Value" value={money(dbReports.purchaseReturns.reduce((sum, entry) => sum + asNumber(entry.total_amount), 0))} icon={<IndianRupee className="size-5" />} tone="purple" />
        <Kpi label="Synced Invoices" value={eligibleInvoices.length} sub={`${syncedInvoices.length} match current search`} icon={<CheckCircle2 className="size-5" />} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel title="Purchase Return Details" icon={<RotateCcw className="size-4" />}>
          <div className="space-y-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">
              Posting a return permanently removes the selected damaged quantity from live SNB stock and reduces the supplier payable balance.
            </div>
            <Field label="Find Invoice">
              <input className={inputCls} value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Search invoice or supplier" />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
              <span>{dbReports.loading ? "Loading purchase invoices…" : `${eligibleInvoices.length} stock-synced invoice(s) available`}</span>
              <button type="button" className={cn(btnCls, "bg-white px-3 py-1.5 text-slate-700 ring-1 ring-slate-200")} onClick={() => void dbReports.refresh()} disabled={dbReports.loading}>
                <RefreshCcw className={cn("size-3.5", dbReports.loading && "animate-spin")} /> Refresh
              </button>
            </div>
            {!dbReports.loading && eligibleInvoices.length === 0 && (
              <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">
                {dbReports.purchaseInvoices.length > 0
                  ? "Purchase invoices exist, but none are stock-synced yet. Sync an invoice in Purchase Invoices before creating its return."
                  : "No purchase invoices were returned by the database. Apply the latest SNB workflow migration, then refresh this screen."}
              </div>
            )}
            {!dbReports.loading && invoiceSearch.trim() && syncedInvoices.length === 0 && eligibleInvoices.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200">No synced invoice matches “{invoiceSearch.trim()}”.</div>
            )}
            <Field label="Synced Purchase Invoice *">
              <select className={inputCls} value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setError(""); }}>
                <option value="">Select invoice</option>
                {invoiceOptions.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {invoice.supplier_name} · {invoice.invoice_date}</option>
                ))}
              </select>
            </Field>
            {selectedInvoice && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                <div className="flex justify-between gap-3"><span>Supplier</span><b>{selectedInvoice.supplier_name}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Invoice total</span><b>{money(asNumber(selectedInvoice.total_amount))}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Supplier adjustments</span><b>{money(asNumber(selectedInvoice.return_amount))}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span>Current payable</span><b className="text-amber-700">{money(asNumber(selectedInvoice.balance_amount))}</b></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Return Date *"><input type="date" max={dateInput()} className={inputCls} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></Field>
              <Field label="Reason Type *"><select className={inputCls} value={reasonType} onChange={(event) => setReasonType(event.target.value)}><option>Damaged</option><option>Expired</option><option>Quality Issue</option><option>Short Received</option><option>Wrong Item</option><option>Other</option></select></Field>
            </div>
            <Field label="Supplier Settlement *"><select className={inputCls} value={settlementType} onChange={(event) => setSettlementType(event.target.value)}><option>Credit Note</option><option>Replacement</option><option>Cash Refund</option><option>Bank Refund</option><option>Pending</option></select></Field>
            {settlementType === "Credit Note" && <Field label="Credit Note Number *"><input className={inputCls} value={creditNoteNo} onChange={(event) => setCreditNoteNo(event.target.value)} /></Field>}
            <Field label={["Cash Refund", "Bank Refund"].includes(settlementType) ? "Refund Reference *" : "Reference Number"}><input className={inputCls} value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="Supplier reference, LR number, refund transaction…" /></Field>
            <Field label="Mandatory Remarks *"><textarea className={cn(inputCls, "min-h-24")} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Explain the damage, supplier communication and return handling." /></Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <input type="checkbox" className="mt-1 size-4" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span className="text-sm font-bold text-slate-700">I physically verified these items and confirm they must be removed from usable SNB stock.</span>
            </label>
            {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700 ring-1 ring-red-100">{error}</p>}
            <button disabled={saving || loadingItems} onClick={submitReturn} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-50")}>
              {saving ? <RefreshCcw className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {saving ? "Posting Return…" : `Post Return · ${money(estimatedTotal)}`}
            </button>
          </div>
        </Panel>

        <Panel title="Damaged / Return Items" icon={<Package className="size-4" />}>
          {loadingItems ? (
            <div className="flex min-h-64 items-center justify-center"><RefreshCcw className="size-6 animate-spin text-slate-400" /></div>
          ) : !invoiceId ? (
            <div className="rounded-3xl bg-slate-50 p-10 text-center font-black text-slate-400">Select a synced purchase invoice to load its items.</div>
          ) : !lines.length ? (
            <div className="rounded-3xl bg-red-50 p-10 text-center font-black text-red-600">No returnable invoice items were found.</div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => {
                const qty = asNumber(line.returnQuantity);
                const invalid = qty > line.returnable || qty > line.stockAvailable;
                return (
                  <div key={line.id} className={cn("rounded-3xl border p-4", qty > 0 ? "border-orange-200 bg-orange-50/40" : "border-slate-200 bg-white")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-black text-slate-950">{line.item_name}</p><p className="text-xs font-bold text-slate-500">Purchased {asNumber(line.quantity)} {line.unit} · Returnable {line.returnable} · Live stock {line.stockAvailable}</p></div>
                      <p className="font-black text-slate-950">{money(lineValue(line))}</p>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Return Qty *"><input type="number" min="0" max={Math.min(line.returnable, line.stockAvailable)} step="0.001" className={cn(inputCls, invalid && "border-red-400 bg-red-50")} value={line.returnQuantity} onChange={(event) => updateLine(line.id, { returnQuantity: event.target.value })} /></Field>
                      <Field label="Damage / Item Details *"><input className={inputCls} value={line.itemReason} onChange={(event) => updateLine(line.id, { itemReason: event.target.value })} placeholder="Broken pack, leakage, fungus…" /></Field>
                      <Field label="Batch Number"><input className={inputCls} value={line.batchNo} onChange={(event) => updateLine(line.id, { batchNo: event.target.value })} /></Field>
                      <Field label={reasonType === "Expired" ? "Expiry Date *" : "Expiry Date"}><input type="date" className={inputCls} value={line.expiryDate} onChange={(event) => updateLine(line.id, { expiryDate: event.target.value })} /></Field>
                    </div>
                    {invalid && <p className="mt-2 text-xs font-black text-red-600">Quantity cannot exceed both returnable invoice quantity and current live stock.</p>}
                  </div>
                );
              })}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-[10px] font-black uppercase text-white/60">Selected Items</p><p className="mt-1 text-2xl font-black">{selectedLines.length}</p></div>
                <div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-[10px] font-black uppercase text-white/60">Return Quantity</p><p className="mt-1 text-2xl font-black">{totalQuantity.toFixed(3)}</p></div>
                <div className="rounded-2xl bg-orange-500 p-4 text-white"><p className="text-[10px] font-black uppercase text-white/70">Estimated Value</p><p className="mt-1 text-2xl font-black">{money(estimatedTotal)}</p></div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Purchase Return History"
        icon={<History className="size-4" />}
        action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Purchase_Returns.xls", historyRows.map(({ entry, summary }) => ({ ReturnNo: entry.return_no, Date: entry.return_date, Supplier: entry.supplier_name, Invoice: entry.invoice_number, Items: summary, Reason: entry.reason_type, Settlement: entry.settlement_type, CreditNote: entry.credit_note_no || "", Reference: entry.reference_no || "", Total: asNumber(entry.total_amount), EnteredBy: entry.entered_by, Remarks: entry.remarks })))}><Download className="size-4" /> Excel</button>}
      >
        <DataTable
          headers={["Return No", "Date", "Supplier", "Invoice", "Items", "Reason", "Settlement", "Value", "Entered By", "Action"]}
          rows={historyRows.map((row) => [row.entry.return_no, row.entry.return_date, row.entry.supplier_name, row.entry.invoice_number, row.summary || "-", row.entry.reason_type, row.entry.settlement_type, money(asNumber(row.entry.total_amount)), row.entry.entered_by, <button key="print" className={cn(btnCls, "bg-slate-100 text-slate-700")} onClick={() => printReturn(row)}><Printer className="size-4" /> Print</button>])}
          empty="No purchase returns found for the selected date range."
        />
      </Panel>
    </div>
  );
}

function SupplierPaymentsTab({
  userName,
  dbReports,
  setNotice,
}: {
  userName: string;
  dbReports: ReturnType<typeof useSnbAdminReports>;
  setNotice: (message: string) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [search, setSearch] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"cash" | "upi" | "card" | "bank" | "cheque">("cash");
  const [reference, setReference] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(dateInput());
  const [chequeBank, setChequeBank] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pendingRows = useMemo(() => dbReports.supplierOutstanding
    .filter((row) => asNumber(row.balance_amount) > 0.0001 && String(row.supplier_name || "").trim())
    .sort((a, b) => {
      const aTime = new Date(a.invoice_date || a.created_at || 0).getTime();
      const bTime = new Date(b.invoice_date || b.created_at || 0).getTime();
      return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    }), [dbReports.supplierOutstanding]);
  const suppliers = useMemo(() => {
    const names = new Map<string, string>();
    pendingRows.forEach((row) => {
      const displayName = String(row.supplier_name || "").trim();
      const key = normal(displayName);
      if (key && !names.has(key)) names.set(key, displayName);
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [pendingRows]);
  const visibleSuppliers = useMemo(() => {
    const query = normal(supplierSearch);
    const filtered = query ? suppliers.filter((name) => normal(name).includes(query)) : suppliers;
    return supplier && !filtered.some((name) => normal(name) === normal(supplier))
      ? [supplier, ...filtered]
      : filtered;
  }, [supplier, supplierSearch, suppliers]);
  const allSupplierRows = pendingRows.filter((row) => normal(String(row.supplier_name || "")) === normal(supplier));
  const invoiceQuery = search.trim().toLowerCase();
  const supplierRows = allSupplierRows.filter((row) =>
    !invoiceQuery ||
    String(row.invoice_number || "").toLowerCase().includes(invoiceQuery) ||
    String(row.invoice_date || "").toLowerCase().includes(invoiceQuery),
  );
  const allocationRows = allSupplierRows
    .map((row) => ({ row, amount: asNumber(allocations[row.purchase_invoice_id]) }))
    .filter(({ amount }) => amount > 0);
  const total = allocationRows.reduce((sum, entry) => sum + entry.amount, 0);

  useEffect(() => {
    if (supplier && !suppliers.some((name) => normal(name) === normal(supplier))) {
      setSupplier("");
      setAllocations({});
    }
  }, [supplier, suppliers]);

  const selectAllDue = () => {
    const next: Record<string, string> = {};
    allSupplierRows.forEach((row) => { next[row.purchase_invoice_id] = String(asNumber(row.balance_amount)); });
    setAllocations(next);
    setError("");
  };

  const clearAllocations = () => {
    setAllocations({});
    setError("");
  };

  const save = async () => {
    setError("");
    if (!supplier) return setError("Select a supplier.");
    if (!allocationRows.length) return setError("Enter a payment amount against at least one invoice.");
    for (const { row, amount } of allocationRows) {
      if (amount <= 0 || amount > asNumber(row.balance_amount) + 0.001) {
        return setError(`Allocation for ${row.invoice_number} cannot exceed ${money(asNumber(row.balance_amount))}.`);
      }
    }
    if (mode !== "cash" && mode !== "cheque" && !reference.trim()) return setError(`${mode.toUpperCase()} reference number is mandatory.`);
    if (mode === "cheque" && (!chequeNo.trim() || !chequeDate || !chequeBank.trim())) return setError("Cheque number, cheque date and bank are mandatory.");
    if (remarks.trim().length < 3) return setError("Enter payment remarks.");
    const paymentReference = mode === "cheque"
      ? `${chequeNo.trim()} | ${chequeDate} | ${chequeBank.trim()}`
      : reference.trim();
    if (!window.confirm(`Post ${money(total)} to ${supplier} across ${allocationRows.length} invoice(s)?`)) return;

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("post_snb_supplier_payment_batch", {
      p_supplier_name: supplier,
      p_allocations: allocationRows.map(({ row, amount }) => ({ invoice_id: row.purchase_invoice_id, amount })),
      p_payment_method: mode,
      p_reference_no: paymentReference || null,
      p_remarks: remarks.trim(),
    });
    setSaving(false);
    if (rpcError) {
      setError(`Supplier payment failed: ${rpcError.message}`);
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    await dbReports.refresh();
    setNotice(`Supplier payment batch ${String(result.batchId || "")} saved by ${userName}: ${money(total)} to ${supplier}.`);
    setAllocations({});
    setReference("");
    setChequeNo("");
    setChequeDate(dateInput());
    setChequeBank("");
    setRemarks("");
  };

  const paymentRows = dbReports.supplierPayments;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Outstanding Suppliers" value={suppliers.length} icon={<Truck className="size-5" />} tone="amber" />
        <Kpi label="Pending Invoices" value={pendingRows.length} icon={<Receipt className="size-5" />} tone="red" />
        <Kpi label="Total Outstanding" value={money(pendingRows.reduce((sum, row) => sum + asNumber(row.balance_amount), 0))} icon={<IndianRupee className="size-5" />} tone="purple" />
        <Kpi label="Selected Payment" value={money(total)} sub={`${allocationRows.length} invoice allocation(s)`} icon={<WalletCards className="size-5" />} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel title="Supplier Payment Batch" icon={<WalletCards className="size-4" />}>
          <div className="space-y-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-800 ring-1 ring-blue-100">
              Select one supplier and distribute a single payment across any number of pending invoices. The server prevents overpayment and records one auditable batch.
            </div>
            <Field label="Find Supplier">
              <input className={inputCls} value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search supplier name" />
            </Field>
            <Field label="Supplier *">
              <select className={inputCls} value={supplier} onChange={(event) => { setSupplier(event.target.value); setAllocations({}); setError(""); }}>
                <option value="">Select supplier</option>
                {visibleSuppliers.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
              <span>{dbReports.loading ? "Loading supplier balances…" : `${suppliers.length} supplier(s) with pending balances`}</span>
              <button type="button" className={cn(btnCls, "bg-white px-3 py-1.5 text-slate-700 ring-1 ring-slate-200")} onClick={() => void dbReports.refresh()} disabled={dbReports.loading}>
                <RefreshCcw className={cn("size-3.5", dbReports.loading && "animate-spin")} /> Refresh
              </button>
            </div>
            {!dbReports.loading && suppliers.length === 0 && (
              <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">
                {dbReports.purchaseInvoices.length > 0
                  ? "All loaded purchase invoices are fully paid, or their balance values are zero."
                  : "No supplier invoices were returned by the database. Apply the latest SNB workflow migration, then refresh this screen."}
              </div>
            )}
            {!dbReports.loading && supplierSearch.trim() && visibleSuppliers.length === 0 && suppliers.length > 0 && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200">No supplier matches “{supplierSearch.trim()}”.</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Mode *"><select className={inputCls} value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setError(""); }}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank Transfer</option><option value="cheque">Cheque</option></select></Field>
              <Field label="Batch Total"><div className="flex min-h-11 items-center rounded-xl bg-slate-950 px-3 font-black text-white">{money(total)}</div></Field>
            </div>
            {mode === "cheque" ? (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <Field label="Cheque Number *"><input className={inputCls} value={chequeNo} onChange={(event) => setChequeNo(event.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="Cheque Date *"><input type="date" className={inputCls} value={chequeDate} onChange={(event) => setChequeDate(event.target.value)} /></Field><Field label="Bank *"><input className={inputCls} value={chequeBank} onChange={(event) => setChequeBank(event.target.value)} /></Field></div>
              </div>
            ) : (
              <Field label={mode === "cash" ? "Reference (optional)" : `${mode.toUpperCase()} Reference *`}><input className={inputCls} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
            )}
            <Field label="Remarks *"><textarea className={cn(inputCls, "min-h-20")} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Purpose, approval or payment notes" /></Field>
            {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700 ring-1 ring-red-100">{error}</p>}
            <button disabled={saving || total <= 0} onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-50")}>
              {saving ? <RefreshCcw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {saving ? "Posting Batch…" : `Post ${money(total)}`}
            </button>
          </div>
        </Panel>

        <Panel
          title="Allocate Pending Invoices"
          icon={<Receipt className="size-4" />}
          action={<div className="flex gap-2"><button disabled={!allSupplierRows.length} className={cn(btnCls, "bg-emerald-50 text-emerald-700 disabled:opacity-40")} onClick={selectAllDue}>Pay All Due</button><button disabled={!Object.keys(allocations).length} className={cn(btnCls, "bg-slate-100 text-slate-700 disabled:opacity-40")} onClick={clearAllocations}>Clear</button></div>}
        >
          <div className="mb-3"><input className={inputCls} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice number or date" /></div>
          {!supplier ? (
            <div className="rounded-3xl bg-slate-50 p-10 text-center font-black text-slate-400">Select a supplier to view pending invoices.</div>
          ) : !allSupplierRows.length ? (
            <div className="rounded-3xl bg-emerald-50 p-10 text-center font-black text-emerald-700">No outstanding invoices for this supplier.</div>
          ) : !supplierRows.length ? (
            <div className="rounded-3xl bg-slate-50 p-10 text-center font-black text-slate-500">No pending invoice matches the current search.</div>
          ) : (
            <div className="space-y-2">
              {supplierRows.map((row) => {
                const amount = allocations[row.purchase_invoice_id] || "";
                const invalid = asNumber(amount) > asNumber(row.balance_amount);
                return (
                  <div key={row.purchase_invoice_id} className={cn("grid gap-3 rounded-2xl border p-3 md:grid-cols-[minmax(0,1fr)_140px]", asNumber(amount) > 0 ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white")}>
                    <div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{row.invoice_number}</p><StatusBadge tone={row.sync_status === "Synced" ? "green" : "amber"}>{row.sync_status || "-"}</StatusBadge></div><p className="mt-1 text-xs font-bold text-slate-500">Invoice {row.invoice_date || "-"} · Total {money(asNumber(row.total_amount))} · Paid {money(asNumber(row.paid_amount))}</p><p className="mt-1 font-black text-red-600">Due {money(asNumber(row.balance_amount))}</p></div>
                    <Field label="Pay Amount"><input type="number" min="0" max={asNumber(row.balance_amount)} step="0.01" className={cn(inputCls, invalid && "border-red-400 bg-red-50")} value={amount} onChange={(event) => setAllocations((current) => ({ ...current, [row.purchase_invoice_id]: event.target.value }))} /></Field>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Supplier Payment History" icon={<History className="size-4" />} action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Supplier_Payments.xls", paymentRows.map((payment) => ({ Date: payment.payment_date, Supplier: payment.supplier_name, InvoiceId: payment.purchase_invoice_id || "", Amount: asNumber(payment.amount), Mode: payment.payment_method, Reference: payment.reference_no || "", BatchId: payment.payment_batch_id || "", BatchTotal: asNumber(payment.batch_total), PaidBy: payment.paid_by || "", Remarks: payment.remarks || "" })))}><Download className="size-4" /> Excel</button>}>
        <DataTable headers={["Date", "Supplier", "Amount", "Mode", "Reference", "Batch Total", "Paid By", "Remarks"]} rows={paymentRows.map((payment) => [fmtDateTime(payment.payment_date), payment.supplier_name, money(asNumber(payment.amount)), payment.payment_method.toUpperCase(), payment.reference_no || "-", money(asNumber(payment.batch_total || payment.amount)), payment.paid_by || "-", payment.remarks || "-"])} empty="No supplier payments found for the selected date range." />
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
    bankAccount: "SNB Main Bank Account",
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
          action={<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => csvDownload("SNB_Bank_Deposits.xls", rows.map((d) => ({ Date: d.depositDate, Amount: d.amount, Method: d.paymentMode, BankAccount: d.bankAccount, Slip: d.slipNo, Ref: d.transactionRef, EnteredBy: d.enteredBy, Remarks: d.remarks })))}><Download className="size-4" /> Excel</button>}
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
                onClick={() => {
                  if (window.confirm(`Delete salesperson ${p.name}?`)) {
                    removeSalesperson(p.id, userName);
                  }
                }}
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
  const [selectedPerson, setSelectedPerson] = useState("All");
  const paymentByPerson = useMemo(() => {
    const map = new Map<string, { cash: number; upi: number; card: number; credit: number }>();
    const ensure = (name: string) => {
      const current = map.get(name) ?? { cash: 0, upi: 0, card: 0, credit: 0 };
      map.set(name, current);
      return current;
    };
    (props.branchBills || []).forEach((bill: any) => {
      const row = ensure(bill.salesperson || "Unassigned");
      if (bill.paymentMode === "cash") row.cash += asNumber(bill.total);
      else if (bill.paymentMode === "upi") row.upi += asNumber(bill.total);
      else if (bill.paymentMode === "card") row.card += asNumber(bill.total);
      else if (bill.paymentMode === "credit") row.credit += asNumber(bill.total);
      else if (bill.paymentMode === "split") {
        row.cash += asNumber(bill.split?.cash);
        row.upi += asNumber(bill.split?.upi);
        row.card += asNumber(bill.split?.card);
      }
    });
    (props.legacySalesRows || []).forEach((sale: any) => {
      const row = ensure(sale.soldBy || "Unassigned");
      const value = asNumber(sale.unitPrice) * asNumber(sale.quantitySold);
      const mode = String(sale.paymentMethod || "").toLowerCase();
      if (mode.includes("cash")) row.cash += value;
      else if (mode.includes("upi")) row.upi += value;
      else if (mode.includes("card")) row.card += value;
      else if (mode.includes("credit")) row.credit += value;
    });
    return map;
  }, [props.branchBills, props.legacySalesRows]);

  const rows = useMemo(() => {
    if (props.dbReports.salespersonBills.length) {
      const map = new Map<string, any>();
      props.dbReports.salespersonBills.forEach((bill: any) => {
        const name = bill.salesperson || "Unassigned";
        const allocations = paymentByPerson.get(name) ?? { cash: 0, upi: 0, card: 0, credit: 0 };
        const row = map.get(name) || { name, grossSales: 0, discounts: 0, netSales: 0, bills: 0, outstanding: 0, cashierLogins: new Set<string>(), ...allocations };
        row.grossSales += asNumber(bill.subtotal);
        row.discounts += asNumber(bill.discount);
        row.netSales += asNumber(bill.total);
        row.outstanding += asNumber(bill.balance);
        row.bills += 1;
        if (bill.cashier_username) row.cashierLogins.add(bill.cashier_username);
        map.set(name, row);
      });
      return Array.from(map.values()).map((row: any) => ({ ...row, avgBillValue: row.bills ? row.netSales / row.bills : 0, cashierCount: row.cashierLogins.size })).sort((a: any, b: any) => b.netSales - a.netSales);
    }
    return [...props.salespersonRows].map((row: any) => ({ ...row, discounts: Math.max(0, row.grossSales - row.netSales - row.returns), outstanding: 0, cashierCount: 0, credit: asNumber(row.credit) })).sort((a: any, b: any) => b.netSales - a.netSales);
  }, [props.dbReports.salespersonBills, props.salespersonRows, paymentByPerson]);
  const filteredRows = selectedPerson === "All" ? rows : rows.filter((row: any) => row.name === selectedPerson);
  const topPerformer = rows[0];
  const totalNet = rows.reduce((sum: number, row: any) => sum + row.netSales, 0);
  const totalDiscount = rows.reduce((sum: number, row: any) => sum + row.discounts, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Salespersons" value={rows.length} icon={<UserRound className="size-5" />} />
        <Kpi label="Top Performer" value={topPerformer ? topPerformer.name : "-"} sub={topPerformer ? money(topPerformer.netSales) : undefined} icon={<BarChart3 className="size-5" />} tone="amber" />
        <Kpi label="Net Sales" value={money(totalNet)} icon={<IndianRupee className="size-5" />} tone="green" />
        <Kpi label="Discounts" value={money(totalDiscount)} icon={<RotateCcw className="size-5" />} tone="red" />
      </div>
      {rows.length > 0 && (
        <Panel title="Net Sales by Salesperson" icon={<Activity className="size-4" />}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => `₹${Number(value / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => money(Number(value))} />
                <Bar dataKey="netSales" fill="#C5973E" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
      <Panel
        title="Salesperson Performance"
        icon={<BarChart3 className="size-4" />}
        action={
          <div className="flex flex-wrap gap-2">
            <select className={inputCls} value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)}>
              <option value="All">All Salespersons</option>
              {rows.map((row: any) => <option key={row.name} value={row.name}>{row.name}</option>)}
            </select>
            <button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Salesperson_Report.xls", filteredRows.map((row: any) => ({ Salesperson: row.name, GrossSales: row.grossSales, Discounts: row.discounts, NetSales: row.netSales, Cash: row.cash, UPI: row.upi, Card: row.card, CreditSales: row.credit, Reconciliation: row.cash + row.upi + row.card + row.credit, Bills: row.bills, AverageBill: row.avgBillValue, Outstanding: row.outstanding, CashierLogins: row.cashierCount })))}><Download className="size-4" /> Excel</button>
          </div>
        }
      >
        <DataTable headers={["Rank", "Salesperson", "Gross", "Discounts", "Net", "Cash", "UPI", "Card", "Credit", "Payment Reconciliation", "Bills", "Avg Bill", "Outstanding", "Cashier Logins"]} rows={filteredRows.map((row: any) => [`#${rows.indexOf(row) + 1}`, row.name, money(row.grossSales), money(row.discounts), <span key="net" className="font-black text-emerald-700">{money(row.netSales)}</span>, money(row.cash), money(row.upi), money(row.card), money(row.credit), money(asNumber(row.cash) + asNumber(row.upi) + asNumber(row.card) + asNumber(row.credit)), row.bills, money(row.avgBillValue), money(row.outstanding), row.cashierCount || "-"])} empty="No salesperson sales data for the selected period." />
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
  const db = props.dbReports as ReturnType<typeof useSnbAdminReports>;
  const dailyRows = db.dailySummary;
  const sessionRows = db.counterSessions as any[];
  const totalGross = dailyRows.reduce((sum, row) => sum + asNumber(row.gross_sales), 0);
  const totalNet = dailyRows.reduce((sum, row) => sum + asNumber(row.net_sales), 0);
  const totalExpected = dailyRows.reduce((sum, row) => sum + asNumber(row.expected_cash), 0);
  const totalCounted = dailyRows.reduce((sum, row) => sum + asNumber(row.counted_cash), 0);
  const totalDifference = dailyRows.reduce((sum, row) => sum + asNumber(row.difference), 0);
  const openCounters = dailyRows.reduce((sum, row) => sum + asNumber(row.open_counter_count), 0);
  const closedCounters = dailyRows.reduce((sum, row) => sum + asNumber(row.closed_counter_count), 0);

  const printClosureReport = () => {
    printHtml(
      `SNB Daily Closure ${props.fromDate} to ${props.toDate}`,
      `<div class="stamp">DAILY CLOSURE REPORT</div>
       <div class="section"><div class="row"><span>Date Range</span><b>${props.fromDate} to ${props.toDate}</b></div><div class="row"><span>Prepared By</span><b>${userName}</b></div><div class="row"><span>Closed Counters</span><b>${closedCounters}</b></div><div class="row"><span>Open Counters</span><b>${openCounters}</b></div></div>
       <table><thead><tr><th>Date</th><th>Gross</th><th>Discounts</th><th>Returns</th><th>Net</th><th>Expected Cash</th><th>Counted Cash</th><th>Difference</th></tr></thead><tbody>${dailyRows.map((row) => `<tr><td>${row.business_date}</td><td>${money(asNumber(row.gross_sales))}</td><td>${money(asNumber(row.discounts))}</td><td>${money(asNumber(row.returns))}</td><td>${money(asNumber(row.net_sales))}</td><td>${money(asNumber(row.expected_cash))}</td><td>${money(asNumber(row.counted_cash))}</td><td>${money(asNumber(row.difference))}</td></tr>`).join("")}</tbody></table>
       <div class="section"><div class="row"><span>Total Gross</span><b>${money(totalGross)}</b></div><div class="row"><span>Total Net</span><b>${money(totalNet)}</b></div><div class="row"><span>Expected Cash</span><b>${money(totalExpected)}</b></div><div class="row"><span>Counted Cash</span><b>${money(totalCounted)}</b></div><div class="row"><span>Difference</span><b>${money(totalDifference)}</b></div></div>`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Closed Counters" value={closedCounters} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Open Counters" value={openCounters} icon={<Activity className="size-5" />} tone={openCounters ? "amber" : "green"} />
        <Kpi label="Net Sales" value={money(totalNet)} icon={<IndianRupee className="size-5" />} tone="blue" />
        <Kpi label="Cash Difference" value={money(totalDifference)} icon={<AlertTriangle className="size-5" />} tone={Math.abs(totalDifference) < 0.01 ? "green" : "red"} />
      </div>

      <div className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-900 ring-1 ring-blue-100">
        Daily closure is consolidated from each cashier's individual counter session. SNB Admin cannot overwrite a cashier's closure, which preserves accountability.
      </div>

      <Panel
        title="Consolidated Daily Closure"
        icon={<CalendarClock className="size-4" />}
        action={<div className="flex flex-wrap gap-2"><button disabled={db.loading} className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200 disabled:opacity-50")} onClick={() => void db.refresh()}><RefreshCcw className={cn("size-4", db.loading && "animate-spin")} /> Refresh</button><button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={printClosureReport}><Printer className="size-4" /> Print</button><button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Daily_Closure.xls", dailyRows.map((row) => ({ Date: row.business_date, ClosedCounters: asNumber(row.closed_counter_count), OpenCounters: asNumber(row.open_counter_count), GrossSales: asNumber(row.gross_sales), Discounts: asNumber(row.discounts), Returns: asNumber(row.returns), NetSales: asNumber(row.net_sales), CashSales: asNumber(row.cash_sales), UPISales: asNumber(row.upi_sales), CardSales: asNumber(row.card_sales), CreditSales: asNumber(row.credit_sales), CreditCollected: asNumber(row.credit_collected), AdvanceCollected: asNumber(row.advance_collected), ExpectedCash: asNumber(row.expected_cash), CountedCash: asNumber(row.counted_cash), Difference: asNumber(row.difference) })))}><Download className="size-4" /> Excel</button></div>}
      >
        <DataTable headers={["Date", "Closed Counters", "Open Counters", "Gross", "Discounts", "Returns", "Net", "Cash", "UPI", "Card", "Credit Sales", "Credit Collected", "Advance", "Expected Cash", "Counted Cash", "Difference"]} rows={dailyRows.map((row) => [row.business_date, asNumber(row.closed_counter_count), asNumber(row.open_counter_count), money(asNumber(row.gross_sales)), money(asNumber(row.discounts)), money(asNumber(row.returns)), money(asNumber(row.net_sales)), money(asNumber(row.cash_sales)), money(asNumber(row.upi_sales)), money(asNumber(row.card_sales)), money(asNumber(row.credit_sales)), money(asNumber(row.credit_collected)), money(asNumber(row.advance_collected)), money(asNumber(row.expected_cash)), money(asNumber(row.counted_cash)), <span key="difference" className={cn("font-black", Math.abs(asNumber(row.difference)) < 0.01 ? "text-emerald-700" : "text-red-600")}>{money(asNumber(row.difference))}</span>])} empty="No consolidated daily closure data found for the selected date range." />
      </Panel>

      <Panel title="Cashier Session Drill-down" icon={<UserRound className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Daily_Closure_Cashier_Detail.xls", sessionRows.map((row) => ({ Date: row.business_date, CashierLogin: row.cashier_display_name || row.cashier_username || "Legacy / Unattributed", Status: row.status, OpenedAt: row.opened_at, ClosedAt: row.closed_at || "", OpeningCash: asNumber(row.opening_cash), GrossSales: asNumber(row.gross_sales), Discounts: asNumber(row.discounts), Returns: asNumber(row.returns), NetSales: asNumber(row.net_sales), CashSales: asNumber(row.cash_sales), UPISales: asNumber(row.upi_sales), CardSales: asNumber(row.card_sales), CreditSales: asNumber(row.credit_sales), CreditCollected: asNumber(row.credit_collected), AdvanceCollected: asNumber(row.advance_collected), Expenses: asNumber(row.expenses), SupplierPayments: asNumber(row.supplier_payments), BankDeposits: asNumber(row.bank_deposits), ExpectedCash: asNumber(row.expected_cash), CountedCash: asNumber(row.counted_cash), Difference: asNumber(row.difference), Bills: asNumber(row.bill_count), Notes: row.notes || "" })))}><Download className="size-4" /> Excel Detail</button>}>
        <DataTable headers={["Date", "Cashier Login", "Status", "Opened", "Closed", "Opening", "Gross", "Returns", "Net", "Expected", "Counted", "Difference", "Bills", "Expenses", "Supplier Payments", "Bank Deposits", "Notes"]} rows={sessionRows.map((row) => [row.business_date, row.cashier_display_name || row.cashier_username || "Legacy / Unattributed", <StatusBadge key="status" tone={row.status === "closed" ? "green" : "amber"}>{row.status}</StatusBadge>, fmtDateTime(row.opened_at), row.closed_at ? fmtDateTime(row.closed_at) : "-", money(asNumber(row.opening_cash)), money(asNumber(row.gross_sales)), money(asNumber(row.returns)), money(asNumber(row.net_sales)), money(asNumber(row.expected_cash)), row.status === "closed" ? money(asNumber(row.counted_cash)) : "-", row.status === "closed" ? money(asNumber(row.difference)) : "-", asNumber(row.bill_count), money(asNumber(row.expenses)), money(asNumber(row.supplier_payments)), money(asNumber(row.bank_deposits)), row.notes || "-"])} empty="No cashier sessions found for the selected date range." />
      </Panel>
    </div>
  );
}

function HistoryTab(props: any) {
  const db = props.dbReports as ReturnType<typeof useSnbAdminReports>;
  const historyRows = buildSalesRows(props);
  const itemsSoldRows = db.itemSales || [];
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const exportAll = () =>
    downloadExcelWorkbook(`SNB_History_${props.fromDate}_to_${props.toDate}.xls`, [
      {
        name: "Branch History",
        rows: historyRows.map((r: any) => ({
          Type: r.type,
          Number: r.no,
          Date: fmtDateTime(r.date),
          Salesperson: r.person,
          Cashier: r.cashier,
          GrossSales: r.gross,
          ReturnAmount: r.returns,
          NetSales: r.net,
          Payment: r.payment,
        })),
      },
      {
        name: "Bill Items",
        rows: historyRows.flatMap((r: any) =>
          (r.items || []).map((item: any) => ({
            Type: r.type,
            BillNo: r.no,
            Date: fmtDateTime(r.date),
            Salesperson: r.person,
            Cashier: r.cashier,
            Item: item.itemName,
            Quantity: item.quantity,
            Unit: item.unit || "",
            UnitPrice: item.price,
            Discount: item.discount || 0,
            Tax: item.tax || 0,
            LineTotal: item.lineTotal,
          })),
        ),
      },
      {
        name: "Items Sold",
        rows: itemsSoldRows.map((row: any) => ({
          Date: row.business_date,
          Item: row.item_name,
          Unit: row.unit || "",
          Quantity: asNumber(row.quantity_sold),
          Gross: asNumber(row.gross_sales),
          Discount: asNumber(row.item_discount),
          Tax: asNumber(row.tax),
          Net: asNumber(row.net_item_sales),
          Bills: asNumber(row.bill_count),
        })),
      },
    ]);

  return (
    <div className="space-y-4">
      <Panel
        title="SNB Branch History"
        icon={<History className="size-4" />}
        action={
          <button className={cn(btnCls, "bg-slate-950 text-white")} onClick={exportAll}>
            <Download className="size-4" />
            Export Excel
          </button>
        }
      >
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                <th className="p-2">Type</th>
                <th className="p-2">No</th>
                <th className="p-2">Date</th>
                <th className="p-2">Salesperson</th>
                <th className="p-2">Cashier</th>
                <th className="p-2 text-right">Gross Sales</th>
                <th className="p-2 text-right">Return Amount</th>
                <th className="p-2 text-right">Net Sales</th>
                <th className="p-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center font-bold text-slate-500">
                    No history records for selected date range.
                  </td>
                </tr>
              ) : (
                historyRows.map((r: any, index: number) => {
                  const rowKey = `${r.type}-${r.no}-${index}`;
                  const hasItems = (r.items || []).length > 0;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-t">
                        <td className="p-2">
                          <StatusBadge
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
                          </StatusBadge>
                        </td>
                        <td className="p-2 font-black">
                          {hasItems ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => setExpandedRow(expandedRow === rowKey ? null : rowKey)}
                            >
                              <ChevronDown className={cn("size-4 transition", expandedRow === rowKey && "rotate-180")} />
                              {r.no}
                            </button>
                          ) : (
                            r.no
                          )}
                        </td>
                        <td className="p-2 text-xs">{fmtDateTime(r.date)}</td>
                        <td className="p-2">{r.person}</td>
                        <td className="p-2">{r.cashier}</td>
                        <td className="p-2 text-right font-black">{money(r.gross)}</td>
                        <td className="p-2 text-right font-black">{money(r.returns)}</td>
                        <td className={cn("p-2 text-right font-black", r.net < 0 ? "text-red-600" : "text-emerald-700")}>
                          {money(r.net)}
                        </td>
                        <td className="p-2 uppercase">{String(r.payment)}</td>
                      </tr>
                      {expandedRow === rowKey && hasItems && (
                        <tr className="border-t bg-slate-50">
                          <td colSpan={9} className="p-2">
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[620px] text-xs">
                                <thead>
                                  <tr className="text-left uppercase text-slate-500">
                                    <th className="p-2">Item</th>
                                    <th className="p-2 text-right">Qty</th>
                                    <th className="p-2">Unit</th>
                                    <th className="p-2 text-right">Unit Price</th>
                                    <th className="p-2 text-right">Discount</th>
                                    <th className="p-2 text-right">Tax</th>
                                    <th className="p-2 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.items.map((item: any, itemIndex: number) => (
                                    <tr key={`${item.itemName}-${itemIndex}`} className="border-t">
                                      <td className="p-2 font-bold">{item.itemName}</td>
                                      <td className="p-2 text-right">{item.quantity}</td>
                                      <td className="p-2">{item.unit || "-"}</td>
                                      <td className="p-2 text-right">{money(item.price)}</td>
                                      <td className="p-2 text-right">{money(item.discount || 0)}</td>
                                      <td className="p-2 text-right">{money(item.tax || 0)}</td>
                                      <td className="p-2 text-right font-black">{money(item.lineTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Items Sold" icon={<Package className="size-4" />}>
        <DataTable
          headers={["Date", "Item", "Unit", "Qty", "Gross", "Discount", "Tax", "Net", "Bills"]}
          rows={itemsSoldRows.map((row: any) => [
            row.business_date,
            row.item_name,
            row.unit || "-",
            asNumber(row.quantity_sold),
            money(asNumber(row.gross_sales)),
            money(asNumber(row.item_discount)),
            money(asNumber(row.tax)),
            money(asNumber(row.net_item_sales)),
            asNumber(row.bill_count),
          ])}
          empty="No item-wise sales for this date range."
        />
      </Panel>
    </div>
  );
}

function ReportsTab(props: any) {
  const { creditSales } = useBranchStore();
  const { expenses, bankDeposits, wasteLogs, quotations } = useBranchOpsStore();
  const db = props.dbReports as ReturnType<typeof useSnbAdminReports>;
  const dueCredits = (creditSales[BRANCH] || []).filter((credit) => credit.status !== "settled");
  const branchExpenses = expenses.filter((entry) => entry.branch === BRANCH && inRange(entry.expenseDate || entry.createdAt, props.fromDate, props.toDate));
  const branchDeposits = bankDeposits.filter((entry) => entry.branch === BRANCH && inRange(entry.createdAt, props.fromDate, props.toDate));
  const branchWaste = wasteLogs.filter((entry) => entry.branch === BRANCH && inRange(entry.createdAt, props.fromDate, props.toDate));
  const branchQuotes = quotations.filter((entry) => entry.branch === BRANCH && inRange(entry.createdAt, props.fromDate, props.toDate));

  const databaseGross = db.dailySummary.reduce((sum, row) => sum + asNumber(row.gross_sales), 0);
  const databaseNet = db.dailySummary.reduce((sum, row) => sum + asNumber(row.net_sales), 0);
  const databaseReturns = db.dailySummary.reduce((sum, row) => sum + asNumber(row.returns), 0);
  const databaseDiscounts = db.dailySummary.reduce((sum, row) => sum + asNumber(row.discounts), 0);
  const grossSales = db.dailySummary.length ? databaseGross : props.grossSales;
  const netSales = db.dailySummary.length ? databaseNet : props.netSales;
  const returnAmount = db.dailySummary.length ? databaseReturns : props.returnAmount;
  const discountAmount = db.dailySummary.length ? databaseDiscounts : db.discountBills.reduce((sum, row) => sum + asNumber(row.discount), 0);
  const supplierDue = db.supplierOutstanding.reduce((sum, row) => sum + asNumber(row.balance_amount), 0);
  const purchaseTotal = db.supplierOutstanding.reduce((sum, row) => sum + asNumber(row.total_amount), 0);
  const purchaseReturnValue = db.purchaseReturns.reduce((sum, row) => sum + asNumber(row.total_amount), 0);
  const supplierPaymentTotal = db.supplierPayments.reduce((sum, row) => sum + asNumber(row.amount), 0);
  const collectionTotal = db.dailySummary.length
    ? db.dailySummary.reduce((sum, row) => sum + asNumber(row.cash_sales) + asNumber(row.upi_sales) + asNumber(row.card_sales) + asNumber(row.credit_collected) + asNumber(row.advance_collected), 0)
    : props.cashSales + props.upiSales + props.cardSales + props.clearedCredit + props.advanceCollected + props.advanceBalanceCollected;

  const refreshButton = (
    <button disabled={db.loading} className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200 disabled:opacity-50")} onClick={() => void db.refresh()}>
      <RefreshCcw className={cn("size-4", db.loading && "animate-spin")} /> Refresh Database
    </button>
  );
  const downloadBranchWorkbook = () => downloadExcelWorkbook("SNB_Branch_Report_Workbook.xls", [
    {
      name: "Summary",
      rows: [{
        FromDate: props.fromDate,
        ToDate: props.toDate,
        GeneratedBy: props.userName,
        GrossSales: grossSales,
        Discounts: discountAmount,
        SalesReturns: returnAmount,
        NetSales: netSales,
        TotalCollections: collectionTotal,
        PendingCredit: props.pendingCredit,
        PurchaseInvoiceValue: purchaseTotal,
        PurchaseReturns: purchaseReturnValue,
        SupplierPayments: supplierPaymentTotal,
        SupplierDue: supplierDue,
        Expenses: props.expenseAmount,
        BankDeposits: props.depositAmount,
      }],
    },
    {
      name: "Item Sales",
      rows: db.itemSales.map((row) => ({
        Date: row.business_date,
        Item: row.item_name,
        Unit: row.unit || "",
        Quantity: asNumber(row.quantity_sold),
        Gross: asNumber(row.gross_sales),
        Discount: asNumber(row.item_discount),
        Tax: asNumber(row.tax),
        Net: asNumber(row.net_item_sales),
        Bills: asNumber(row.bill_count),
      })),
    },
    {
      name: "Category Sales",
      rows: db.categorySales.map((row) => ({
        Date: row.business_date,
        Category: row.category,
        Quantity: asNumber(row.quantity_sold),
        Gross: asNumber(row.gross_sales),
        Discount: asNumber(row.item_discount),
        Net: asNumber(row.net_item_sales),
        Bills: asNumber(row.bill_count),
      })),
    },
    {
      name: "Discounts",
      rows: db.discountBills.map((row) => ({
        Bill: row.bill_no,
        DateTime: row.bill_datetime,
        Cashier: row.cashier || "",
        Salesperson: row.salesperson || "",
        Customer: row.customer_name || "",
        Subtotal: asNumber(row.subtotal),
        Discount: asNumber(row.discount),
        DiscountPercent: asNumber(row.effective_discount_percent),
        Tax: asNumber(row.tax),
        RoundOff: asNumber(row.round_off),
        Total: asNumber(row.total),
      })),
    },
    {
      name: "Daily Closure",
      rows: db.dailySummary.map((row) => ({
        Date: row.business_date,
        ClosedCounters: asNumber(row.closed_counter_count),
        OpenCounters: asNumber(row.open_counter_count),
        Gross: asNumber(row.gross_sales),
        Discounts: asNumber(row.discounts),
        Returns: asNumber(row.returns),
        Net: asNumber(row.net_sales),
        Cash: asNumber(row.cash_sales),
        UPI: asNumber(row.upi_sales),
        Card: asNumber(row.card_sales),
        CreditSales: asNumber(row.credit_sales),
        CreditCollected: asNumber(row.credit_collected),
        Advance: asNumber(row.advance_collected),
        ExpectedCash: asNumber(row.expected_cash),
        CountedCash: asNumber(row.counted_cash),
        Difference: asNumber(row.difference),
      })),
    },
    {
      name: "Supplier Outstanding",
      rows: db.supplierOutstanding.map((row) => ({
        Supplier: row.supplier_name,
        Invoice: row.invoice_number,
        InvoiceDate: row.invoice_date || "",
        Total: asNumber(row.total_amount),
        Returned: asNumber(row.return_amount),
        Paid: asNumber(row.paid_amount),
        Balance: asNumber(row.balance_amount),
        PaymentMethod: row.payment_method || "",
        SyncStatus: row.sync_status || "",
      })),
    },
    {
      name: "Supplier Payments",
      rows: db.supplierPayments.map((row) => ({
        Date: row.payment_date,
        Supplier: row.supplier_name,
        Amount: asNumber(row.amount),
        Mode: row.payment_method,
        Reference: row.reference_no || "",
        Batch: row.payment_batch_id || "",
        PaidBy: row.paid_by || "",
      })),
    },
    {
      name: "Purchase Returns",
      rows: db.purchaseReturns.map((row) => ({
        Return: row.return_no,
        Date: row.return_date,
        Supplier: row.supplier_name,
        Invoice: row.invoice_number,
        Reason: row.reason_type,
        Settlement: row.settlement_type,
        Value: asNumber(row.total_amount),
        EnteredBy: row.entered_by,
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
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Net Sales" value={money(netSales)} sub={`${props.fromDate} to ${props.toDate}`} icon={<IndianRupee className="size-5" />} tone="green" />
        <Kpi label="Returns + Discounts" value={money(returnAmount + discountAmount)} icon={<RotateCcw className="size-5" />} tone="red" />
        <Kpi label="Supplier Due" value={money(supplierDue)} icon={<Truck className="size-5" />} tone="amber" />
        <Kpi label="Purchase Returns" value={money(purchaseReturnValue)} icon={<Package className="size-5" />} tone="purple" />
      </div>

      {db.error && <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-100">Some database report sources could not load. Available reports are still shown. {db.error}</div>}

      <Panel
        title="SNB Branch Report Summary"
        icon={<FileSpreadsheet className="size-4" />}
        action={<div className="flex flex-wrap gap-2">{refreshButton}<button className={cn(btnCls, "bg-white text-slate-700 ring-1 ring-slate-200")} onClick={() => printOverview({ ...props, grossSales, netSales, returnAmount }, "SNB")}><Printer className="size-4" /> Print</button><button className={cn(btnCls, "bg-slate-950 text-white")} onClick={downloadBranchWorkbook}><Download className="size-4" /> Excel Workbook</button></div>}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Gross sales", grossSales, "Before discounts and returns"],
            ["Discounts", -discountAmount, "Bill and item discounts"],
            ["Sales returns", -returnAmount, "Customer return impact"],
            ["Net sales", netSales, "Final sales value"],
            ["Collections", collectionTotal, "Cash, UPI, card, credit and advance"],
            ["Purchase invoices", purchaseTotal, "Supplier invoice value"],
            ["Purchase returns", -purchaseReturnValue, "Damaged/returned purchase value"],
            ["Supplier due", supplierDue, "Current payable after payments and returns"],
          ].map(([label, value, note]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
              <p className={cn("mt-1 text-xl font-black tabular-nums", Number(value) < 0 ? "text-red-600" : "text-slate-950")}>{money(Number(value))}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-500">{note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Item-wise Sales" icon={<Package className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Item_Wise_Sales.xls", db.itemSales.map((row) => ({ Date: row.business_date, Item: row.item_name, Unit: row.unit || "", Quantity: asNumber(row.quantity_sold), Gross: asNumber(row.gross_sales), Discount: asNumber(row.item_discount), Tax: asNumber(row.tax), Net: asNumber(row.net_item_sales), Bills: asNumber(row.bill_count) })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Item", "Unit", "Qty", "Gross", "Discount", "Tax", "Net", "Bills"]} rows={db.itemSales.map((row) => [row.business_date, row.item_name, row.unit || "-", asNumber(row.quantity_sold), money(asNumber(row.gross_sales)), money(asNumber(row.item_discount)), money(asNumber(row.tax)), money(asNumber(row.net_item_sales)), asNumber(row.bill_count)])} empty="No item-wise database sales for this date range." />
        </Panel>

        <Panel title="Category-wise Sales" icon={<BarChart3 className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Category_Wise_Sales.xls", db.categorySales.map((row) => ({ Date: row.business_date, Category: row.category, Quantity: asNumber(row.quantity_sold), Gross: asNumber(row.gross_sales), Discount: asNumber(row.item_discount), Net: asNumber(row.net_item_sales), Bills: asNumber(row.bill_count) })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Category", "Qty", "Gross", "Discount", "Net", "Bills"]} rows={db.categorySales.map((row) => [row.business_date, row.category, asNumber(row.quantity_sold), money(asNumber(row.gross_sales)), money(asNumber(row.item_discount)), money(asNumber(row.net_item_sales)), asNumber(row.bill_count)])} empty="No category-wise database sales for this date range." />
        </Panel>

        <Panel title="Discount Report" icon={<Receipt className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Discount_Report.xls", db.discountBills.map((row) => ({ Bill: row.bill_no, DateTime: row.bill_datetime, Cashier: row.cashier || "", Salesperson: row.salesperson || "", Customer: row.customer_name || "", Subtotal: asNumber(row.subtotal), Discount: asNumber(row.discount), DiscountPercent: asNumber(row.effective_discount_percent), Tax: asNumber(row.tax), RoundOff: asNumber(row.round_off), Total: asNumber(row.total) })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Bill", "Date", "Cashier", "Salesperson", "Customer", "Subtotal", "Discount", "%", "Tax", "Total"]} rows={db.discountBills.map((row) => [row.bill_no, fmtDateTime(row.bill_datetime), row.cashier || "Legacy / Unattributed", row.salesperson || "-", row.customer_name || "Walk-in", money(asNumber(row.subtotal)), money(asNumber(row.discount)), `${asNumber(row.effective_discount_percent).toFixed(2)}%`, money(asNumber(row.tax)), money(asNumber(row.total))])} empty="No discounted bills for this date range." />
        </Panel>

        <Panel title="Daily Counter Summary" icon={<CalendarClock className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Daily_Counter_Summary.xls", db.dailySummary.map((row) => ({ Date: row.business_date, ClosedCounters: asNumber(row.closed_counter_count), OpenCounters: asNumber(row.open_counter_count), Gross: asNumber(row.gross_sales), Discounts: asNumber(row.discounts), Returns: asNumber(row.returns), Net: asNumber(row.net_sales), Cash: asNumber(row.cash_sales), UPI: asNumber(row.upi_sales), Card: asNumber(row.card_sales), CreditSales: asNumber(row.credit_sales), CreditCollected: asNumber(row.credit_collected), Advance: asNumber(row.advance_collected), ExpectedCash: asNumber(row.expected_cash), CountedCash: asNumber(row.counted_cash), Difference: asNumber(row.difference) })))}><Download className="size-4" /> Excel</button>}>
          <DataTable headers={["Date", "Closed", "Open", "Gross", "Discounts", "Returns", "Net", "Cash", "UPI", "Card", "Credit", "Credit Collected", "Advance", "Expected", "Counted", "Difference"]} rows={db.dailySummary.map((row) => [row.business_date, asNumber(row.closed_counter_count), asNumber(row.open_counter_count), money(asNumber(row.gross_sales)), money(asNumber(row.discounts)), money(asNumber(row.returns)), money(asNumber(row.net_sales)), money(asNumber(row.cash_sales)), money(asNumber(row.upi_sales)), money(asNumber(row.card_sales)), money(asNumber(row.credit_sales)), money(asNumber(row.credit_collected)), money(asNumber(row.advance_collected)), money(asNumber(row.expected_cash)), money(asNumber(row.counted_cash)), money(asNumber(row.difference))])} empty="No daily counter summaries for this date range." />
        </Panel>
      </div>

      <Panel title="Supplier Outstanding Position" icon={<Truck className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Supplier_Outstanding.xls", db.supplierOutstanding.map((row) => ({ Supplier: row.supplier_name, Invoice: row.invoice_number, InvoiceDate: row.invoice_date || "", Total: asNumber(row.total_amount), Returned: asNumber(row.return_amount), Paid: asNumber(row.paid_amount), Balance: asNumber(row.balance_amount), PaymentMethod: row.payment_method || "", SyncStatus: row.sync_status || "" })))}><Download className="size-4" /> Excel</button>}>
        <DataTable headers={["Supplier", "Invoice", "Date", "Total", "Returned", "Paid", "Balance", "Payment", "Stock Sync"]} rows={db.supplierOutstanding.map((row) => [row.supplier_name, row.invoice_number, row.invoice_date || "-", money(asNumber(row.total_amount)), money(asNumber(row.return_amount)), money(asNumber(row.paid_amount)), <span key="balance" className="font-black text-red-600">{money(asNumber(row.balance_amount))}</span>, row.payment_method || "-", row.sync_status || "-"])} empty="No supplier invoices found." />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Supplier Payments" icon={<WalletCards className="size-4" />}>
          <DataTable headers={["Date", "Supplier", "Amount", "Mode", "Reference", "Batch", "Paid By"]} rows={db.supplierPayments.map((row) => [fmtDateTime(row.payment_date), row.supplier_name, money(asNumber(row.amount)), row.payment_method.toUpperCase(), row.reference_no || "-", row.payment_batch_id || "-", row.paid_by || "-"])} empty="No supplier payments for this date range." />
        </Panel>
        <Panel title="Purchase Returns" icon={<RotateCcw className="size-4" />}>
          <DataTable headers={["Return", "Date", "Supplier", "Invoice", "Reason", "Settlement", "Value", "Entered By"]} rows={db.purchaseReturns.map((row) => [row.return_no, row.return_date, row.supplier_name, row.invoice_number, row.reason_type, row.settlement_type, money(asNumber(row.total_amount)), row.entered_by])} empty="No purchase returns for this date range." />
        </Panel>
      </div>

      <Panel title="Due Customer Credits" icon={<WalletCards className="size-4" />}>
        <DataTable headers={["Customer", "Bill", "Total", "Paid", "Balance", "Due Date", "Status"]} rows={dueCredits.map((credit) => [credit.customerName, credit.billNo, money(credit.subtotal), money(credit.amountPaid), money(credit.creditAmount), credit.dueDate || "-", credit.status])} empty="No due credit records." />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Expenses & Bank Deposits" icon={<Landmark className="size-4" />}>
          <DataTable headers={["Type", "Date", "Details", "Amount", "Mode / Bank"]} rows={[...branchExpenses.map((entry) => ["Expense", fmtDate(entry.expenseDate), `${entry.category} - ${entry.description}`, money(entry.amount), entry.mode.toUpperCase()]), ...branchDeposits.map((entry) => ["Bank Deposit", fmtDate(entry.depositDate), entry.remarks || entry.transactionRef || entry.slipNo || "-", money(entry.amount), entry.bankAccount])]} empty="No expenses or deposits for this date range." />
        </Panel>
        <Panel title="Waste & Quotations" icon={<Trash2 className="size-4" />}>
          <DataTable headers={["Type", "Date", "Reference", "Details", "Value / Qty", "Status"]} rows={[...branchWaste.map((entry) => ["Waste", fmtDateTime(entry.createdAt), entry.logType, `${entry.itemName} - ${entry.reason}`, `${entry.quantity} ${entry.unit}`, entry.verifiedBy]), ...branchQuotes.map((entry) => ["Quotation", fmtDateTime(entry.createdAt), entry.quoteNo, entry.customerName, money(entry.total), entry.status])]} empty="No waste or quotations for this date range." />
        </Panel>
      </div>
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
  const catalogItems = useSNBCatalog();
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
      `Confirm ${report.reportNo} and update SNB stock to the physical counted quantities?`,
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
      setNotice(`${report.reportNo} confirmed. SNB stock updated and variance sent to Owner/Admin.`);
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
          <p className="text-sm font-bold text-slate-500">No SNB receiver stock-count reports submitted yet.</p>
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
  const { notifications, cashierClosures, updateNotificationStatus } = useBranchOpsStore();
  const { creditSales } = useBranchStore();
  const [priceNotifications, setPriceNotifications] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .in("type", ["price_change", "snb_purchase_invoice_revision"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (!error) {
        setPriceNotifications(
          (data || []).filter((n: any) => {
            const metaBranch = n.meta?.branch;
            const label = String(n.ref_label || "");
            return n.type === "snb_purchase_invoice_revision" || metaBranch === BRANCH || label.includes(BRANCH);
          }),
        );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);
  const rows = [
    ...priceNotifications.map((n) => {
      const isPurchaseRevision = n.type === "snb_purchase_invoice_revision";
      const changes = Array.isArray(n.meta?.changes)
        ? n.meta.changes
            .map((change: any) => `${change.itemName}: ${Number(change.delta) > 0 ? "+" : ""}${Number(change.delta || 0)}`)
            .join(" · ")
        : "";
      return {
        id: `${isPurchaseRevision ? "purchase-revision" : "price"}-${n.id}`,
        date: n.created_at,
        type: isPurchaseRevision ? "Purchase Invoice Revision" : "Price Change",
        title: n.title,
        details: isPurchaseRevision
          ? `${n.body || n.ref_label || "-"}${n.meta?.editReason ? ` Reason: ${n.meta.editReason}.` : ""}${changes ? ` Stock change: ${changes}.` : ""}`
          : n.body || n.ref_label || "-",
        raisedBy: isPurchaseRevision ? n.meta?.editedBy || n.meta?.resyncedBy || "SNB Admin" : n.meta?.updatedBy || "Admin",
        status: isPurchaseRevision ? n.meta?.status || "Pending Re-sync" : "Unread",
        source: "supabase",
      };
    }),
    ...notifications
      .filter((n) => n.branch === BRANCH && n.type === "Complaint")
      .map((n) => ({
        id: n.id,
        date: n.createdAt,
        type: "Complaint Reply",
        title: n.title,
        details: n.details,
        raisedBy: n.raisedBy,
        status: n.status,
        source: "branchOps",
      })),
    ...(creditSales[BRANCH] || []).map((c) => ({
      id: `credit-${c.id}`,
      date: c.createdAt,
      type: "Credit Sale",
      title: `${c.billNo} credit sale`,
      details: `${c.customerName} pending ${money(c.creditAmount)} due ${c.dueDate || "-"}`,
      raisedBy: c.soldBy,
      status: c.status,
      source: "credit",
    })),
    ...cashierClosures
      .filter((c) => c.branch === BRANCH && Number(c.difference || 0) !== 0)
      .map((c) => ({
        id: `closure-${c.id}`,
        date: c.createdAt,
        type: "Cash Closure Difference",
        title: `${c.cashier} closure difference`,
        details: `Expected ${money(c.expectedCash)} / counted ${money(c.closingCash)} / difference ${money(c.difference)}`,
        raisedBy: c.cashier,
        status: "Open",
        source: "closure",
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
          fmtDateTime(n.date),
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
          n.source === "branchOps" ? (
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
            </div>
          ) : (
            <StatusBadge key="a" tone="blue">Auto</StatusBadge>
          ),
        ])}
        empty="No SNB Admin notifications for purchase revisions, price changes, complaint replies, credit sales, or cash closure differences."
      />
    </Panel>
    </div>
  );
}

function tableCellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(tableCellText).join(" ");
  if (isValidElement(node)) return tableCellText((node.props as { children?: ReactNode }).children);
  return "";
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
  const safeRows = useMemo(() => rows || [], [rows]);
  const [query, setQuery] = useState("");
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = safeRows.length > 150 ? 50 : 25;

  const preparedRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = !search
      ? [...safeRows]
      : safeRows.filter((row) => row.some((cell) => tableCellText(cell).toLowerCase().includes(search)));
    if (sortIndex == null) return filtered;
    const direction = sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const left = tableCellText(a[sortIndex]).trim();
      const right = tableCellText(b[sortIndex]).trim();
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
              placeholder="Filter this table…"
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
