// src/pages/AdminSNBDashboard.tsx
// SNB Admin Dashboard – manager control center for sales, returns, stock, purchase, balance, salesperson, closure and reports.
import {
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useBranchLedger } from "@/hooks/useBranchLedger";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useBranchStore } from "@/branch/branchStore";
import {
  money,
  useBranchOpsStore,
  type PurchaseRecord,
  type SalespersonProfile,
} from "@/branch/branchOpsStore";
import { SNB_ITEMS } from "@/branch/snbItems";
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
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
  Menu,
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

const BRANCH: Branch = "SNB";
type TabId =
  | "overview"
  | "sales"
  | "stock"
  | "suppliers"
  | "expenses"
  | "complaints"
  | "waste"
  | "quotations"
  | "credit"
  | "invoices"
  | "payments"
  | "bank"
  | "salespersons"
  | "salesperson-report"
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
    id: "payments",
    label: "Supplier Payments",
    icon: WalletCards,
    adminOnly: true,
  },
  { id: "bank", label: "Bank Deposits", icon: Landmark, adminOnly: true },
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
    id: "notifications",
    label: "Admin Notifications",
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

function normal(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeStockRows<T extends { itemName: string; quantity?: number; minThreshold?: number }>(rows: T[]) {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const key = normal(row.itemName);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      return;
    }
    map.set(key, {
      ...existing,
      ...row,
      quantity: Number(existing.quantity || 0) + Number(row.quantity || 0),
      minThreshold: existing.minThreshold ?? row.minThreshold,
    } as T);
  });
  return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function csvDownload(
  filename: string,
  rows: Array<Record<string, string | number | null | undefined>>,
) {
  const safeRows = rows.length
    ? rows
    : [{ Note: "No data for selected filters" }];
  const headers = Object.keys(safeRows[0]);
  const csv = [
    headers.join(","),
    ...safeRows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const { stock, sales, creditSales: dbCreditSales, creditPayments: dbCreditPayments, fetchBranchData, fetchCreditPayments, manualUpdateStock } = useBranchStore();
  const {
    bills,
    returns,
    purchases,
    cashMovements,
    bankDeposits,
    notifications,
    expenses,
  } = useBranchOpsStore();

  const today = dateInput();
  const [tab, setTab] = useState<TabId>("overview");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [lowSearch, setLowSearch] = useState("");
  const [notice, setNotice] = useState("");
  const adminLedger = useBranchLedger(fromDate, toDate, [BRANCH]);

  const userName =
    currentUser?.displayName || currentUser?.username || "SNB Admin";
  const role = currentUser?.role || "";
  const canManage = ["admin_snb", "admin", "owner"].includes(role);

  useEffect(() => {
    fetchBranchData(BRANCH);
    fetchCreditPayments(BRANCH);
  }, [fetchBranchData, fetchCreditPayments]);

  const branchStock = useMemo(() => dedupeStockRows(stock[BRANCH] || []), [stock]);
  const branchSalesRows = sales[BRANCH] || [];
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
  const ledgerGrossSales = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.sales_total) + adminLedger.toNumber(row.advance_collected) + adminLedger.toNumber(row.advance_balance_collected), 0);
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
  const avgBillValue = billsCount > 0 ? netSales / billsCount : rawAvgBillValue;
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
  const transparentGrossSales = hasLedgerRows
    ? ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.sales_total), 0)
    : rawGrossSales;
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
      advanceCollected +
      advanceBalanceCollected,
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
    movementRows
      .filter((m) => m.paymentMode === mode)
      .reduce(
        (sum, m) => sum + (m.direction === "in" ? m.amount : -m.amount),
        0,
      );
  const bankBalance =
    bankDeposits
      .filter((d) => d.branch === BRANCH)
      .reduce((sum, d) => sum + d.amount, 0) + balanceByMode("bank");
  const cashBalance = balanceByMode("cash");
  const upiBalance = balanceByMode("upi");
  const cardBalance = balanceByMode("card");

  const pendingCredit = (dbCreditSales[BRANCH] || []).filter((c) => c.status !== "settled").reduce((sum, c) => sum + c.creditAmount, 0);
  const clearedCredit = (dbCreditPayments[BRANCH] || []).filter((p) => inRange(p.createdAt, fromDate, toDate)).reduce((sum, p) => sum + p.amount, 0);
  salesBreakdown.creditCollected = clearedCredit;
  const purchasePaid = purchasePayments
    .filter(
      (p) => p.branch === BRANCH && inRange(p.createdAt, fromDate, toDate),
    )
    .reduce((sum, p) => sum + p.amount, 0);
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
    purchasePaid,
    expenseAmount,
    advanceCollected,
    advanceBalanceCollected,
    salesBreakdown,
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
            SNB Admin Dashboard is restricted to SNB Admin, Admin, and Owner
            roles.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 pb-6">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-2xl bg-slate-950 p-3 text-white"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
              SNB Branch
            </p>
            <h1 className="truncate text-lg font-black text-slate-950">
              Admin Control Center
            </h1>
          </div>
          <StatusBadge tone="amber">Net {money(netSales)}</StatusBadge>
        </div>
      </div>

      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu backdrop"
        />
      )}

      <div className="grid gap-4 px-3 py-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-5">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[330px] translate-x-[-105%] overflow-y-auto border-r border-slate-800 bg-slate-950 p-3 text-white shadow-2xl transition lg:sticky lg:top-4 lg:z-10 lg:h-[calc(100dvh-2rem)] lg:w-auto lg:max-w-none lg:translate-x-0 lg:rounded-[2rem] lg:border lg:shadow-sm",
            mobileOpen && "translate-x-0",
          )}
        >
          <div className="mb-3 rounded-[1.75rem] bg-white/5 p-4 text-white ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone="amber">
                <Store className="size-3" /> SNB Admin
              </StatusBadge>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-white/70 lg:hidden"
              >
                <X className="size-4" />
              </button>
            </div>
            <h2 className="mt-4 text-2xl font-black leading-tight">
              Branch Control Center
            </h2>
            <p className="mt-2 text-xs font-semibold text-white/60">
              Sales, returns, purchases, stock, balances and closure.
            </p>
          </div>
          <nav className="space-y-2">
            {scopedTabs.map((item) => {
              const Icon = item.icon;
              const count =
                item.id === "stock"
                  ? lowStockRows.length
                  : item.id === "invoices"
                    ? pendingSync
                    : item.id === "notifications"
                        ? unreadNotifications
                        : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition",
                    tab === item.id
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-200"
                      : "bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100">
              <p className="text-[10px] font-black uppercase text-amber-700">
                Low Stock
              </p>
              <p className="text-xl font-black text-amber-800">
                {lowStockRows.length}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
              <p className="text-[10px] font-black uppercase text-emerald-700">
                Net Sales
              </p>
              <p className="text-xl font-black text-emerald-800">
                {money(netSales)}
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <header className="hidden">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                  SNB Branch Management
                </p>
                <h1 className="mt-2 text-4xl font-black tracking-tight">
                  Admin Control Center
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold text-white/60">
                  Net sales always deduct return amount. Purchase sync is
                  protected against duplicate stock updates.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[780px]">
                <HeroPill label="Gross Sales" value={money(grossSales)} />
                <HeroPill
                  label="Return Amount"
                  value={money(returnAmount)}
                  tone="red"
                />
                <HeroPill
                  label="Net Sales"
                  value={money(netSales)}
                  tone="green"
                />
                <HeroPill
                  label="Available Balance"
                  value={money(
                    cashBalance + upiBalance + cardBalance + bankBalance,
                  )}
                  tone="blue"
                />
              </div>
            </div>
          </header>

          <DateFilters
            fromDate={fromDate}
            toDate={toDate}
            setFromDate={setFromDate}
            setToDate={setToDate}
          />
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
          {tab === "suppliers" && <SuppliersTab userName={userName} />}
          {tab === "expenses" && <ExpensesTab userName={userName} {...commonProps} />}
          {tab === "complaints" && <ComplaintsTab userName={userName} />}
          {tab === "waste" && <WasteLogsTab userName={userName} />}
          {tab === "quotations" && <QuotationsTab userName={userName} />}
          {tab === "credit" && <CreditTab />}
          {tab === "invoices" && (
            <PurchaseInvoicesTab
              userName={userName}
              branchStock={branchStock}
              manualUpdateStock={manualUpdateStock}
              fetchBranchData={fetchBranchData}
              setNotice={setNotice}
            />
          )}
          {tab === "payments" && <SupplierPaymentsTab userName={userName} />}
          {tab === "bank" && (
            <BankDepositsTab
              userName={userName}
              cashBalance={cashBalance}
              upiBalance={upiBalance}
              cardBalance={cardBalance}
              bankBalance={bankBalance}
            />
          )}
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
              manualUpdateStock={manualUpdateStock}
              fetchBranchData={fetchBranchData}
              setNotice={setNotice}
            />
          )}
          {tab === "notifications" && <NotificationsTab userName={userName} />}
        </main>
      </div>
    </div>
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

function OverviewTab(props: any) {
  return (
    <div className="space-y-4">
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
      <RupeeBreakdown breakdown={props.salesBreakdown} />
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
        <Panel title="Payment Split" icon={<CreditCard className="size-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <PaymentSplitCard
              label="Cash Sales"
              value={props.cashSales}
              icon={<Banknote className="size-4" />}
              tone="green"
            />
            <PaymentSplitCard
              label="UPI Sales"
              value={props.upiSales}
              icon={<Smartphone className="size-4" />}
              tone="blue"
            />
            <PaymentSplitCard
              label="Card Sales"
              value={props.cardSales}
              icon={<CreditCard className="size-4" />}
              tone="purple"
            />
            <PaymentSplitCard
              label="Credit Sales"
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
              label="Bank Balance"
              value={money(props.bankBalance)}
              icon={<Landmark className="size-5" />}
              tone="amber"
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
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
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
                `SNB_Sales_Returns_${dateInput()}.csv`,
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
            <StatusBadge key="t" tone={r.type === "Return" ? "red" : "green"}>
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
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Total Stock Items"
          value={props.branchStock.length}
          icon={<Package className="size-5" />}
        />
        <Kpi
          label="Low Stock Alerts"
          value={props.lowStockRows.length}
          icon={<AlertTriangle className="size-5" />}
          tone={props.lowStockRows.length ? "red" : "green"}
        />
        <Kpi
          label="Stock Value"
          value={money(
            props.branchStock.reduce(
              (s: number, i: any) =>
                s + Math.max(0, i.quantity) * (i.price ?? 0),
              0,
            ),
          )}
          icon={<Database className="size-5" />}
          tone="blue"
        />
      </div>
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
              SNB_ITEMS.find((i) => i.name === s.itemName)?.category ?? "-",
              BRANCH,
            ])}
            empty="No low stock items found."
          />
        )}
      </Panel>
    </div>
  );
}

function SuppliersTab({ userName }: { userName: string }) {
  const { suppliers, addSupplier } = useBranchOpsStore();
  const [form, setForm] = useState({
    name: "",
    address: "",
    mobile: "",
    gstNumber: "",
    itemsProvided: "",
    notes: "",
  });
  const rows = suppliers.filter((s) => s.branch === BRANCH);
  const save = () => {
    if (!form.name.trim() || !form.mobile.trim()) return;
    addSupplier({ branch: BRANCH, ...form, createdBy: userName });
    setForm({ name: "", address: "", mobile: "", gstNumber: "", itemsProvided: "", notes: "" });
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <Panel title="Add Supplier" icon={<Truck className="size-4" />}>
        <div className="space-y-3">
          <Field label="Supplier Name *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile *"><input className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="GST"><input className={inputCls} value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Items They Provide"><input className={inputCls} value={form.itemsProvided} onChange={(e) => setForm({ ...form, itemsProvided: e.target.value })} /></Field>
          <Field label="Main Details / Notes"><textarea className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}><Plus className="size-4" /> Save Supplier</button>
        </div>
      </Panel>
      <Panel title="Supplier List" icon={<BookOpenCheck className="size-4" />}>
        <DataTable
          headers={["Name", "Mobile", "GST", "Items", "Address", "Notes", "Added"]}
          rows={rows.map((s) => [s.name, s.mobile, s.gstNumber || "-", s.itemsProvided || "-", s.address || "-", s.notes || "-", fmtDateTime(s.createdAt)])}
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
        <Panel title="Expense History" icon={<History className="size-4" />}>
          <DataTable headers={["Date", "Category", "Details", "Amount", "Mode", "Entered By"]} rows={rows.map((e) => [fmtDate(e.expenseDate), e.category, e.description, money(e.amount), e.mode.toUpperCase(), e.enteredBy])} empty="No expenses added." />
        </Panel>
      </div>
    </div>
  );
}

function ComplaintsTab({ userName }: { userName: string }) {
  const { complaints, addComplaint, updateComplaintStatus } = useBranchOpsStore();
  const [form, setForm] = useState({ complaintArea: "SNB", title: "", details: "" });
  const rows = complaints.filter((c) => c.branch === BRANCH);
  const save = () => {
    if (!form.title.trim() || !form.details.trim()) return;
    addComplaint({ branch: BRANCH, complaintArea: form.complaintArea, title: form.title, details: form.details, raisedBy: userName });
    setForm({ ...form, title: "", details: "" });
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
          <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Submit Complaint</button>
        </div>
      </Panel>
      <Panel title="Complaint Register" icon={<Bell className="size-4" />}>
        <DataTable
          headers={["Date", "Area", "Title", "Details", "Raised By", "Status", "Action"]}
          rows={rows.map((c) => [
            fmtDateTime(c.createdAt),
            c.complaintArea,
            c.title,
            c.details,
            c.raisedBy,
            <StatusBadge key="s" tone={c.status === "Resolved" ? "green" : c.status === "In Review" ? "blue" : "amber"}>{c.status}</StatusBadge>,
            <div key="a" className="flex gap-2">
              <button className={cn(btnCls, "bg-blue-50 text-blue-700")} onClick={() => updateComplaintStatus(c.id, "In Review", userName)}>Review</button>
              <button className={cn(btnCls, "bg-emerald-50 text-emerald-700")} onClick={() => updateComplaintStatus(c.id, "Resolved", userName)}>Resolve</button>
            </div>,
          ])}
          empty="No complaints raised."
        />
      </Panel>
    </div>
  );
}

function WasteLogsTab({ userName }: { userName: string }) {
  const { wasteLogs, addWasteLog } = useBranchOpsStore();
  const [subTab, setSubTab] = useState<"Dump" | "Damage" | "Trans Out">("Dump");
  const [form, setForm] = useState({ itemName: SNB_ITEMS[0]?.name || "", quantity: "", unit: "pcs", reason: "", verifiedBy: "", checklist: [] as string[] });
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
  const save = () => {
    const qty = Number(form.quantity);
    if (!form.itemName || !qty || !form.reason.trim() || !form.verifiedBy.trim()) return;
    addWasteLog({ branch: BRANCH, logType: subTab, itemName: form.itemName, quantity: qty, unit: form.unit, reason: form.reason, verifiedBy: form.verifiedBy, checklist: form.checklist, createdBy: userName });
    setForm({ ...form, quantity: "", reason: "", verifiedBy: "", checklist: [] });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["Dump", "Damage", "Trans Out"] as const).map((name) => <button key={name} onClick={() => setSubTab(name)} className={cn(btnCls, subTab === name ? "bg-orange-500 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{name}</button>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel title={`${subTab} Entry`} icon={<Trash2 className="size-4" />}>
          <div className="space-y-3">
            <Field label="Item"><select className={inputCls} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })}>{SNB_ITEMS.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field>
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
            <button onClick={save} className={cn(btnCls, "w-full bg-slate-950 text-white")}>Save Waste Log</button>
          </div>
        </Panel>
        <Panel title="Waste Log History" icon={<History className="size-4" />}>
          <DataTable headers={["Date", "Type", "Item", "Qty", "Reason", "Verified By", "Checklist"]} rows={rows.map((w) => [fmtDateTime(w.createdAt), w.logType, w.itemName, `${w.quantity} ${w.unit}`, w.reason, w.verifiedBy, w.checklist.join(", ") || "-"])} empty="No waste logs saved." />
        </Panel>
      </div>
    </div>
  );
}

function QuotationsTab({ userName }: { userName: string }) {
  const { quotations, addQuotation, updateQuotationStatus } = useBranchOpsStore();
  const [mode, setMode] = useState<"list" | "custom">("list");
  const [form, setForm] = useState({ customerName: "", companyName: "", mobile: "", gstNumber: "", itemName: SNB_ITEMS[0]?.name || "", customName: "", qty: "1", rate: "", deliveryCharges: "0", packingCharges: "0", extraCharges: "0", discount: "0" });
  const [lines, setLines] = useState<any[]>([]);
  const rows = quotations.filter((q) => q.branch === BRANCH);
  const addLine = () => {
    const qty = Number(form.qty);
    const item = SNB_ITEMS.find((i) => i.name === form.itemName);
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
    addQuotation({ branch: BRANCH, customerName: form.customerName, companyName: form.companyName, mobile: form.mobile, gstNumber: form.gstNumber, items: lines, customItems: lines.filter((l) => !SNB_ITEMS.some((i) => i.name === l.itemName)), subtotal, deliveryCharges: Number(form.deliveryCharges || 0), packingCharges: Number(form.packingCharges || 0), extraCharges: Number(form.extraCharges || 0), discount: Number(form.discount || 0), total, salesperson: userName });
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
          {mode === "list" ? <Field label="Item"><select className={inputCls} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })}>{SNB_ITEMS.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field> : <Field label="Custom Item"><input className={inputCls} value={form.customName} onChange={(e) => setForm({ ...form, customName: e.target.value })} /></Field>}
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

function CreditTab() {
  const { creditSales, creditPayments } = useBranchStore();
  const credits = creditSales[BRANCH] || [];
  const payments = creditPayments[BRANCH] || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Open Credit" value={money(credits.filter((c) => c.status !== "settled").reduce((s, c) => s + c.creditAmount, 0))} icon={<WalletCards className="size-5" />} tone="red" />
        <Kpi label="Collected" value={money(payments.reduce((s, p) => s + p.amount, 0))} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Credit Bills" value={credits.length} icon={<Receipt className="size-5" />} tone="amber" />
      </div>
      <Panel title="SNB Branch Credit Register" icon={<WalletCards className="size-4" />}>
        <DataTable headers={["Bill", "Customer", "Mobile", "Total", "Paid", "Balance", "Due", "Status"]} rows={credits.map((c) => [c.billNo, c.customerName, c.customerPhone || "-", money(c.subtotal), money(c.amountPaid), money(c.creditAmount), c.dueDate || "-", c.status])} empty="No SNB credit sales found." />
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
  return (
    <Panel title="Cashier Report" icon={<BarChart3 className="size-4" />} action={<button className={cn(btnCls, "bg-slate-950 text-white")} onClick={() => csvDownload("SNB_Cashier_Report.csv", rows.map((r: any) => ({ CashierLogin: r.name, GrossSales: r.grossSales, Returns: r.returns, NetSales: r.netSales, Bills: r.bills, Cash: r.cash, UPI: r.upi, Card: r.card, Credit: r.credit })))}><Download className="size-4" /> Export</button>}>
      <DataTable headers={["Cashier Login", "Gross", "Returns", "Net", "Bills", "Cash", "UPI", "Card", "Credit"]} rows={rows.map((r: any) => [r.name, money(r.grossSales), money(r.returns), money(r.netSales), r.bills, money(r.cash), money(r.upi), money(r.card), money(r.credit)])} empty="No cashier sales data found." />
    </Panel>
  );
}

function CashierClosureTab(props: any) {
  const { cashierClosures } = useBranchOpsStore();
  const rows = cashierClosures.filter((c) => c.branch === BRANCH);
  return (
    <Panel
      title="All Cashier Closure Data"
      icon={<CalendarClock className="size-4" />}
      action={
        <button
          className={cn(btnCls, "bg-slate-950 text-white")}
          onClick={() =>
            csvDownload(
              "SNB_All_Cashier_Closures.csv",
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
        headers={["Date", "Cashier", "Opening", "Expected", "Closing", "Difference", "Bills", "Cash", "UPI", "Card", "Returns", "Credit Sales", "Credit Collections", "Notes"]}
        rows={rows.map((c) => [
          fmtDateTime(c.createdAt),
          c.cashier,
          money(c.openingCash),
          money(c.expectedCash),
          money(c.closingCash),
          <span key="d" className={cn("font-black", c.difference === 0 ? "text-emerald-700" : "text-red-600")}>{money(c.difference)}</span>,
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
  );
}

function PurchaseOrdersTab({ userName }: { userName: string }) {
  const { purchaseOrders, addPurchaseOrder, updatePoStatus } =
    useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    itemName: SNB_ITEMS[0]?.name || "",
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
              {SNB_ITEMS.map((item) => (
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
                "SNB_Purchase_Orders.csv",
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
  const {
    purchases,
    suppliers,
    addPurchase,
    markPurchaseSynced,
    addAuditLog,
  } = useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    invoiceNo: "",
    itemName: SNB_ITEMS[0]?.name || "",
    quantity: "",
    unit: "pcs",
    rate: "",
    tax: "0",
    discount: "0",
    paidAmount: "0",
    remarks: "",
  });
  const [itemSearch, setItemSearch] = useState("");
  const [lines, setLines] = useState<Array<{ itemName: string; quantity: number; unit: any; cost: number; tax: number; discount: number; total: number }>>([]);
  const filteredItems = SNB_ITEMS.filter((item) => item.name.toLowerCase().includes(itemSearch.toLowerCase()));
  const supplierForItem = (itemName: string) =>
    suppliers.find(
      (s) =>
        s.branch === BRANCH &&
        s.itemsProvided.toLowerCase().includes(itemName.toLowerCase()),
    );
  const selectedSupplier = supplierForItem(form.itemName);
  const rows = purchases.filter((p) => p.branch === BRANCH);
  const addLine = () => {
    const qty = Number(form.quantity);
    const rate = Number(form.rate);
    const tax = Number(form.tax || 0);
    const discount = Number(form.discount || 0);
    const total = Math.max(0, qty * rate + tax - discount);
    if (!qty || !rate) return;
    setLines((current) => [...current, { itemName: form.itemName, quantity: qty, unit: form.unit, cost: rate, tax, discount, total }]);
    setForm({ ...form, quantity: "", rate: "", tax: "0", discount: "0" });
  };
  const create = async () => {
    const draftLines = lines.length
      ? lines
      : Number(form.quantity) && Number(form.rate)
        ? [{ itemName: form.itemName, quantity: Number(form.quantity), unit: form.unit, cost: Number(form.rate), tax: Number(form.tax || 0), discount: Number(form.discount || 0), total: Math.max(0, Number(form.quantity) * Number(form.rate) + Number(form.tax || 0) - Number(form.discount || 0)) }]
        : [];
    const total = draftLines.reduce((sum, line) => sum + line.total, 0);
    if (!form.supplier.trim() || !form.invoiceNo.trim() || draftLines.length === 0)
      return;
    const first = draftLines[0];
    const purchase = addPurchase({
      branch: BRANCH,
      supplier: form.supplier,
      invoiceNo: form.invoiceNo,
      itemName: draftLines.length > 1 ? `${draftLines.length} items` : first.itemName,
      quantity: draftLines.reduce((sum, line) => sum + line.quantity, 0),
      unit: first.unit,
      cost: draftLines.length > 1 ? 0 : first.cost,
      items: draftLines,
      tax: draftLines.reduce((sum, line) => sum + line.tax, 0),
      discount: draftLines.reduce((sum, line) => sum + line.discount, 0),
      total,
      enteredBy: userName,
      paymentMethod: "credit",
      remarks: form.remarks,
    });
    for (const line of draftLines) {
      const existing = branchStock.find(
        (s) => normal(s.itemName) === normal(line.itemName),
      );
      const currentQty = Number(existing?.quantity ?? 0);
      const err = await manualUpdateStock(
        BRANCH,
        existing?.itemName || line.itemName,
        currentQty + Number(line.quantity),
        userName,
      );
      if (err) {
        setNotice(err);
        return;
      }
    }
    markPurchaseSynced(purchase.id, userName, "Synced");
    await fetchBranchData(BRANCH);
    setNotice(`${form.invoiceNo} saved and synced to SNB stock.`);
    setForm({
      ...form,
      invoiceNo: "",
      quantity: "",
      rate: "",
      tax: "0",
      discount: "0",
      paidAmount: "0",
      remarks: "",
    });
    setLines([]);
  };
  const sync = async (p: PurchaseRecord) => {
    if (p.syncedToStock || p.syncStatus === "Synced") {
      setNotice(
        "This purchase invoice is already synced to stock. Duplicate sync prevented.",
      );
      return;
    }
    const syncLines = p.items?.length
      ? p.items
      : [{ itemName: p.itemName, quantity: p.quantity }];
    for (const line of syncLines) {
      const existing = branchStock.find(
        (s) => normal(s.itemName) === normal(line.itemName),
      );
      const currentQty = Number(existing?.quantity ?? 0);
      const err = await manualUpdateStock(
        BRANCH,
        existing?.itemName || line.itemName,
        currentQty + Number(line.quantity),
        userName,
      );
      if (err) {
        setNotice(err);
        return;
      }
    }
    markPurchaseSynced(p.id, userName, "Synced");
    addAuditLog({
      branch: BRANCH,
      user: userName,
      action: "SNB Purchase Sync To Stock",
      previousValue: p.itemName,
      newValue: `${syncLines.length} item(s) synced from ${p.invoiceNo}`,
    });
    await fetchBranchData(BRANCH);
    setNotice(`${p.invoiceNo} synced to SNB stock successfully.`);
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
                placeholder={selectedSupplier ? `Suggested: ${selectedSupplier.name}` : "Enter or choose by item"}
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
          <Field label="Search Item">
            <input
              className={inputCls}
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search purchase item"
            />
          </Field>
          <Field label="Item">
            <select
              className={inputCls}
              value={form.itemName}
              onChange={(e) => {
                const itemName = e.target.value;
                const suggested = supplierForItem(itemName);
                setForm({ ...form, itemName, supplier: form.supplier || suggested?.name || "" });
              }}
            >
              {filteredItems.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </Field>
          {selectedSupplier && (
            <div className="rounded-2xl bg-blue-50 p-3 text-sm font-black text-blue-700">
              Supplier found for this item: {selectedSupplier.name}
            </div>
          )}
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
          <button
            onClick={addLine}
            className={cn(btnCls, "w-full bg-white text-slate-700 ring-1 ring-slate-200")}
          >
            <Plus className="size-4" />
            Add Item To Invoice
          </button>
          {lines.length > 0 && (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">
              {lines.map((line, index) => (
                <div key={`${line.itemName}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-bold">
                  <span>{line.itemName} - {line.quantity} {line.unit} x {money(line.cost)}</span>
                  <button className="text-red-600" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
            "Item",
            "Qty",
            "Total",
            "Paid",
            "Balance",
            "Payment Status",
            "Pending Days",
            "Sync Status",
            "Action",
          ]}
          rows={rows.map((p) => {
            const balance = Math.max(0, p.total - p.paidAmount);
            const payStatus = balance <= 0 ? "Cleared" : p.paidAmount > 0 ? "Partial" : "Pending";
            const pendingDays = balance <= 0 ? 0 : Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000));
            return [
              p.invoiceNo,
              p.supplier,
              p.itemName,
              `${p.quantity} ${p.unit ?? ""}`,
              money(p.total),
              money(p.paidAmount),
              money(balance),
              <StatusBadge key="p" tone={payStatus === "Cleared" ? "green" : payStatus === "Partial" ? "blue" : "amber"}>{payStatus}</StatusBadge>,
              pendingDays ? `${pendingDays} days` : "-",
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
            ];
          })}
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
    chequeNo: "",
    chequeDate: dateInput(),
    chequeBank: "",
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
        chequeNo: form.mode === "cheque" ? form.chequeNo : undefined,
        chequeDate: form.mode === "cheque" ? form.chequeDate : undefined,
        chequeBank: form.mode === "cheque" ? form.chequeBank : undefined,
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
        chequeNo: "",
        chequeDate: dateInput(),
        chequeBank: "",
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
                <option value="cheque">Cheque</option>
              </select>
            </Field>
          </div>
          {form.mode === "cheque" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cheque No">
                <input className={inputCls} value={form.chequeNo} onChange={(e) => setForm({ ...form, chequeNo: e.target.value })} />
              </Field>
              <Field label="Cheque Date">
                <input type="date" className={inputCls} value={form.chequeDate} onChange={(e) => setForm({ ...form, chequeDate: e.target.value })} />
              </Field>
              <Field label="Bank">
                <input className={inputCls} value={form.chequeBank} onChange={(e) => setForm({ ...form, chequeBank: e.target.value })} />
              </Field>
            </div>
          )}
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
      <Panel title="Payment History" icon={<History className="size-4" />}>
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
          label="Bank Balance"
          value={money(bankBalance)}
          icon={<Landmark className="size-5" />}
          tone="amber"
        />
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
  const filteredRows = selectedPerson === "All"
    ? props.salespersonRows
    : props.salespersonRows.filter((r: any) => r.name === selectedPerson);
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
          <div className="flex flex-wrap gap-2">
            <select className={inputCls} value={selectedPerson} onChange={(e) => setSelectedPerson(e.target.value)}>
              <option value="All">All Salespersons</option>
              {props.salespersonRows.map((r: any) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
            <button
              className={cn(btnCls, "bg-slate-950 text-white")}
              onClick={() =>
                csvDownload(
                  "SNB_Salesperson_Report.csv",
                  filteredRows.map((r: any) => ({
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
          </div>
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
          rows={filteredRows.map((r: any) => [
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

function DailyClosureTab({ userName, ...props }: any) {
  const { cashierClosures, addCashierClosure } = useBranchOpsStore();
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
      expenses: props.purchasePaid + props.expenseAmount,
      discounts: 0,
      bill_count: props.billsCount,
      duplicate_prints: 0,
      expected_cash: expectedCash,
      actual_cash: Number(form.closingCash || 0),
      difference: diff,
      notes: form.remarks || null,
      status: "finalized",
    };
    const { error } = await supabase
      .from("branch_daily_closures")
      .upsert(payload, { onConflict: "branch,closure_date,cashier" });
    if (error && !/branch_daily_closures|does not exist|schema cache/i.test(error.message)) {
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
  const rows = cashierClosures.filter((c) => c.branch === BRANCH);
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
              onClick={() => window.print()}
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
                csvDownload("SNB_Daily_Closure.csv", [
                  {
                    OpeningBalance: form.openingCash,
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
                    PurchasePayments: props.purchasePaid,
                    Expenses: props.expenseAmount,
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
              ["Credit collections", money(props.clearedCredit)],
              ["Advance collected", money(props.advanceCollected)],
              ["Advance balance collected", money(props.advanceBalanceCollected)],
              ["Purchase payments", money(props.purchasePaid)],
              ["Expenses", money(props.expenseAmount)],
              ["Bank deposits", money(props.depositAmount)],
              ["Pending credit", money(props.pendingCredit)],
              ["Closing balance", money(Number(form.closingCash || 0))],
              ["Difference", money(diff)],
            ]}
          />
        </div>
      </Panel>
      <Panel title="Closure History" icon={<History className="size-4" />}>
        <DataTable
          headers={[
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
          empty="No daily closures saved."
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
  const branchPurchases = purchases.filter((p) => p.branch === BRANCH);
  const supplierDue = branchPurchases.reduce((sum, p) => sum + Math.max(0, p.total - p.paidAmount), 0);
  const purchaseTotal = branchPurchases.reduce((sum, p) => sum + p.total, 0);
  const branchExpenses = expenses.filter((e) => e.branch === BRANCH);
  const branchDeposits = bankDeposits.filter((d) => d.branch === BRANCH);
  const branchWaste = wasteLogs.filter((w) => w.branch === BRANCH);
  const branchQuotes = quotations.filter((q) => q.branch === BRANCH);
  const branchClosures = cashierClosures.filter((c) => c.branch === BRANCH);
  const collectionTotal = props.cashSales + props.upiSales + props.cardSales + props.clearedCredit + props.advanceCollected + props.advanceBalanceCollected;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
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
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload("SNB_Branch_Report.csv", [
                {
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
                },
              ])
            }
          >
            <Download className="size-4" />
            Export Summary
          </button>
        }
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <h3 className="mb-2 font-black">Rupee Source Breakdown</h3>
            <DataTable
              headers={["Source", "Amount"]}
              rows={[
                ["Regular bill sales", money(props.salesBreakdown.billSales)],
                ["Advance collected", money(props.salesBreakdown.advanceCollected)],
                ["Advance balance collected", money(props.salesBreakdown.advanceBalanceCollected)],
                ["Credit billed", money(props.salesBreakdown.creditBilled)],
                ["Credit collected", money(props.salesBreakdown.creditCollected)],
                ["Returns deducted", money(-props.salesBreakdown.returns)],
                ["Expenses deducted", money(-props.salesBreakdown.expenses)],
                ["Total collections", money(collectionTotal)],
                ["Net sales shown", money(props.salesBreakdown.netSales)],
              ]}
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
        </div>
      </Panel>
    </div>
  );
}

function StockAuditTab({
  userName,
  manualUpdateStock,
  fetchBranchData,
  setNotice,
}: {
  userName: string;
  manualUpdateStock: (branch: Branch, itemName: string, quantity: number, updatedBy: string) => Promise<string | null>;
  fetchBranchData: (branch: Branch) => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const { stockCountReports, confirmStockCountReport } = useBranchOpsStore();
  const [savingId, setSavingId] = useState("");
  const reports = stockCountReports
    .filter((report) => report.branch === BRANCH)
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  const pending = reports.filter((report) => report.status === "Pending Admin Review");
  const openDifferences = pending.reduce(
    (sum, report) => sum + report.lines.filter((line) => line.difference !== 0).length,
    0,
  );

  const confirmReport = async (reportId: string) => {
    const report = reports.find((row) => row.id === reportId);
    if (!report) return;
    const ok = window.confirm(
      `Confirm ${report.reportNo} and update SNB stock to the physical counted quantities?`,
    );
    if (!ok) return;
    setSavingId(reportId);
    try {
      for (const line of report.lines) {
        const error = await manualUpdateStock(BRANCH, line.itemName, line.physicalQty, userName);
        if (error) {
          setNotice(error);
          setSavingId("");
          return;
        }
      }
      confirmStockCountReport(report.id, userName);
      await fetchBranchData(BRANCH);
      setNotice(`${report.reportNo} confirmed. SNB stock updated and variance sent to Owner/Admin.`);
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Pending Reports" value={pending.length} icon={<ClipboardCheck className="size-4" />} tone="amber" />
        <Kpi label="Total Reports" value={reports.length} icon={<PackageCheck className="size-4" />} tone="blue" />
        <Kpi label="Open Difference Lines" value={openDifferences} icon={<AlertTriangle className="size-4" />} tone="red" />
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
                  disabled={savingId === report.id}
                  onClick={() => confirmReport(report.id)}
                  className={cn(btnCls, "bg-orange-500 text-white shadow-lg shadow-orange-200 disabled:opacity-50")}
                >
                  {savingId === report.id ? "Saving..." : "Confirm & Save"}
                </button>
              ) : (
                <StatusBadge tone="green">Confirmed</StatusBadge>
              )
            }
          >
            <div className="mb-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-3">
              <span>Reported by: <b className="text-slate-900">{report.reportedBy}</b></span>
              <span>Date: <b className="text-slate-900">{fmtDateTime(report.createdAt)}</b></span>
              <span>Confirmed by: <b className="text-slate-900">{report.confirmedBy || "-"}</b></span>
            </div>
            <DataTable
              headers={["Item", "System Qty", "Physical Qty", "Difference"]}
              rows={report.lines.map((line) => [
                <span key="i" className="font-black">{line.itemName}</span>,
                <span key="s" className="font-black tabular-nums">{line.systemQty} {line.unit}</span>,
                <span key="p" className="font-black tabular-nums">{line.physicalQty} {line.unit}</span>,
                <StatusBadge key="d" tone={line.difference === 0 ? "green" : line.difference > 0 ? "red" : "blue"}>
                  {line.difference}
                </StatusBadge>,
              ])}
              empty="No lines in this report."
            />
          </Panel>
        ))
      )}
    </div>
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
        .eq("type", "price_change")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (!error) {
        setPriceNotifications(
          (data || []).filter((n: any) => {
            const metaBranch = n.meta?.branch;
            const label = String(n.ref_label || "");
            return metaBranch === BRANCH || label.includes(BRANCH);
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
    ...priceNotifications.map((n) => ({
      id: `price-${n.id}`,
      date: n.created_at,
      type: "Price Change",
      title: n.title,
      details: n.body || n.ref_label || "-",
      raisedBy: n.meta?.updatedBy || "Admin",
      status: "Unread",
      source: "supabase",
    })),
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
        empty="No SNB Admin notifications for price changes, complaint replies, credit sales, or cash closure differences."
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
  if (!safeRows.length)
    return (
      <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400 ring-1 ring-slate-100">
        {empty}
      </div>
    );
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {safeRows.map((row, i) => (
            <tr key={i} className="align-top hover:bg-slate-50/70">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 font-semibold text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
