// src/pages/AdminVRSNBDashboard.tsx
// VRSNB Admin Dashboard – manager control center for sales, returns, stock, purchase, balance, salesperson, closure and reports.
import {
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
import { VRSNB_ITEMS } from "@/branch/vrsnbItems";
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
  Package,
  PackageCheck,
  Printer,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
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
const CREDIT_BRANCHES: Branch[] = ["Cafe", "VRSNB"];
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
  | "credit"
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
  {
    id: "credit",
    label: "Credit",
    icon: CreditCard,
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
    icon: ClipboardCheck,
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

export default function AdminVRSNBDashboard() {
  const { currentUser } = useAuthStore();
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [lowSearch, setLowSearch] = useState("");
  const [notice, setNotice] = useState("");
  const adminLedger = useBranchLedger(fromDate, toDate, ["VRSNB", "Cafe"]);

  const userName =
    currentUser?.displayName || currentUser?.username || "VRSNB Admin";
  const role = currentUser?.role || "";
  const canManage = ["admin_vrsnb", "admin", "owner"].includes(role);
  const selectTab = (next: TabId) => {
    setTab(next);
    setSearchParams(next === "overview" ? {} : { tab: next });
  };

  useEffect(() => {
    if (requestedTab && TABS.some((item) => item.id === requestedTab) && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    fetchBranchData(BRANCH);
    fetchBranchData("Cafe");
    fetchCreditPayments(BRANCH);
    fetchCreditPayments("Cafe");
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
  const ledgerBillsCount = ledgerRows.reduce((sum, row) => sum + adminLedger.toNumber(row.bill_count), 0);
  const grossSales = hasLedgerRows ? ledgerGrossSales : rawGrossSales;
  const netSales = Math.max(0, grossSales - returnAmount);
  const billsCount = hasLedgerRows ? ledgerBillsCount : rawBillsCount;
  const avgBillValue = billsCount > 0 ? netSales / billsCount : rawAvgBillValue;
  const finalCashSales = hasLedgerRows ? ledgerCashSales : cashSales;
  const finalUpiSales = hasLedgerRows ? ledgerUpiSales : upiSales;
  const finalCardSales = hasLedgerRows ? ledgerCardSales : cardSales;
  const finalCreditBillAmount = hasLedgerRows ? ledgerCreditBillAmount : creditBillAmount;

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

  const scopedCredits = [...(dbCreditSales.Cafe || []), ...(dbCreditSales[BRANCH] || [])];
  const scopedCreditPayments = [...(dbCreditPayments.Cafe || []), ...(dbCreditPayments[BRANCH] || [])];
  const pendingCredit = scopedCredits.filter((c) => c.status !== "settled").reduce((sum, c) => sum + c.creditAmount, 0);
  const clearedCredit = scopedCreditPayments.filter((p) => inRange(p.createdAt, fromDate, toDate)).reduce((sum, p) => sum + p.amount, 0);
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

  const paymentPie = [
    { name: "Cash", value: finalCashSales, color: CHART_COLORS[1] },
    { name: "UPI", value: finalUpiSales, color: CHART_COLORS[3] },
    { name: "Card", value: finalCardSales, color: CHART_COLORS[4] },
    { name: "Credit", value: finalCreditBillAmount, color: CHART_COLORS[0] },
  ].filter((row) => row.value > 0);

  const hiddenVrsnbTabs: TabId[] = [
    "po",
    "invoices",
    "payments",
    "bank",
    "salespersons",
    "salesperson-report",
  ];
  const scopedTabs = TABS.filter(
    (item) => !hiddenVrsnbTabs.includes(item.id) && (!item.adminOnly || canManage),
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
    pendingCredit,
    clearedCredit,
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
    <div className="min-h-screen bg-slate-50/70 pb-6">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-2xl bg-slate-950 p-3 text-white"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
              VRSNB Branch
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
          className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu backdrop"
        />
      )}

      <div className="grid gap-4 px-3 py-4 md:grid-cols-[260px_minmax(0,1fr)] md:px-4 xl:grid-cols-[300px_minmax(0,1fr)] xl:px-5">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[330px] translate-x-[-105%] overflow-y-auto border-r border-slate-800 bg-slate-950 p-3 text-white shadow-2xl transition md:sticky md:top-4 md:z-10 md:h-[calc(100dvh-2rem)] md:w-auto md:max-w-none md:translate-x-0 md:rounded-[2rem] md:border md:shadow-sm",
            mobileOpen && "translate-x-0",
          )}
        >
          <div className="mb-3 rounded-[1.75rem] bg-white/5 p-4 text-white ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge tone="amber">
                <Store className="size-3" /> VRSNB Admin
              </StatusBadge>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-white/70 md:hidden"
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
                  : item.id === "notifications"
                    ? unreadNotifications
                    : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    selectTab(item.id);
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
                  VRSNB Branch Management
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
          {tab === "credit" && <CreditTab />}
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
          className={cn(btnCls, "self-end bg-slate-950 text-white")}
          onClick={() => {
            const t = dateInput();
            setFromDate(t);
            setToDate(t);
          }}
        >
          Today
        </button>
        <button
          className={cn(
            btnCls,
            "self-end bg-white text-slate-700 ring-1 ring-slate-200",
          )}
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
          className={cn(
            btnCls,
            "self-end bg-white text-slate-700 ring-1 ring-slate-200",
          )}
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
      <Panel
        title="Sales and Returns Log"
        icon={<History className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload(
                `VRSNB_Sales_Returns_${dateInput()}.csv`,
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
              VRSNB_ITEMS.find((i) => i.name === s.itemName)?.category ?? "-",
              BRANCH,
            ])}
            empty="No low stock items found."
          />
        )}
      </Panel>
      <Panel
        title="Stock Management View"
        icon={<Package className="size-4" />}
      >
        <DataTable
          headers={[
            "Item",
            "Current Stock",
            "Unit",
            "Minimum",
            "Price",
            "Status",
          ]}
          rows={props.branchStock.map((s: any) => [
            s.itemName,
            s.quantity,
            s.unit ?? "-",
            s.minThreshold ?? 10,
            money(s.price ?? 0),
            <StatusBadge
              key="status"
              tone={s.quantity <= (s.minThreshold ?? 10) ? "red" : "green"}
            >
              {s.quantity <= (s.minThreshold ?? 10) ? "Low" : "OK"}
            </StatusBadge>,
          ])}
          empty="No stock records found."
        />
      </Panel>
    </div>
  );
}

function PurchaseOrdersTab({ userName }: { userName: string }) {
  const { purchaseOrders, addPurchaseOrder, updatePoStatus } =
    useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    itemName: VRSNB_ITEMS[0]?.name || "",
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
              {VRSNB_ITEMS.map((item) => (
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
                "VRSNB_Purchase_Orders.csv",
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
    addPurchase,
    addPurchasePayment,
    markPurchaseSynced,
    addAuditLog,
  } = useBranchOpsStore();
  const [form, setForm] = useState({
    supplier: "",
    invoiceNo: "",
    invoiceDate: dateInput(),
    itemName: VRSNB_ITEMS[0]?.name || "",
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
    const existing = branchStock.find(
      (s) => normal(s.itemName) === normal(p.itemName),
    );
    const currentQty = Number(existing?.quantity ?? 0);
    const err = await manualUpdateStock(
      BRANCH,
      existing?.itemName || p.itemName,
      currentQty + Number(p.quantity),
      userName,
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
              {VRSNB_ITEMS.map((item) => (
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
                "VRSNB_Salesperson_Report.csv",
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

function CreditTab() {
  const {
    creditSales,
    creditPayments,
    fetchCreditSales,
    fetchCreditPayments,
    settleCreditSale,
  } = useBranchStore();
  const { currentUser } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "settled">("pending");
  const [branchFilter, setBranchFilter] = useState<Branch | "all">("all");
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
    if (branchFilter !== "all" && sale.branch !== branchFilter) return false;
    return true;
  });
  const openCredit = sales
    .filter((sale) => sale.status !== "settled")
    .reduce((sum, sale) => sum + sale.creditAmount, 0);
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
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
      collectedRole: currentUser?.role || "admin_vrsnb",
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
        <Kpi label="Collected" value={money(collected)} icon={<CheckCircle2 className="size-5" />} tone="green" />
        <Kpi label="Collected Today" value={money(todayCollected)} icon={<IndianRupee className="size-5" />} tone="blue" />
        <Kpi label="Credit Bills" value={sales.length} icon={<Receipt className="size-5" />} tone="amber" />
      </div>
      <Panel
        title="Cafe + VRSNB Credit Register"
        icon={<CreditCard className="size-4" />}
        action={
          <div className="flex flex-wrap gap-2">
            <select className={cn(inputCls, "h-10 w-36 py-1")} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as Branch | "all")}>
              <option value="all">All units</option>
              {CREDIT_BRANCHES.map((branch) => <option key={branch} value={branch}>{CREDIT_BRANCH_LABEL[branch]}</option>)}
            </select>
            <select className={cn(inputCls, "h-10 w-32 py-1")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="settled">Settled</option>
            </select>
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
          empty="No Cafe or VRSNB credit sales found."
        />
      </Panel>
      <Panel title="Credit Collections" icon={<History className="size-4" />}>
        <DataTable
          headers={["Unit", "Bill", "Amount", "Mode", "Collected By", "Date", "Remarks"]}
          rows={payments.map((payment) => [
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
      refunds: props.returnAmount,
      expenses: props.purchasePaid,
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
                csvDownload("VRSNB_Daily_Closure.csv", [
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
  const dueCredits = (["Cafe", BRANCH] as const)
    .flatMap((branch) => creditSales[branch] || [])
    .filter((c) => c.status !== "settled");
  const whatsappRows: any[] = [];
  const reminderRows: any[] = [];
  const disputeRows: any[] = [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          label="Shop-wise/Customer Sales"
          value={
            props.branchBills.filter((b: any) => b.creditCustomerName).length
          }
          icon={<Store className="size-5" />}
        />
        <Kpi
          label="Due Credits"
          value={dueCredits.length}
          icon={<WalletCards className="size-5" />}
          tone="red"
        />
        <Kpi
          label="Item Reports"
          value={props.topItems.length}
          icon={<Package className="size-5" />}
          tone="blue"
        />
        <Kpi
          label="Disputes"
          value={disputeRows.length}
          icon={<AlertTriangle className="size-5" />}
          tone="amber"
        />
      </div>
      <Panel
        title="Branch Reports"
        icon={<FileSpreadsheet className="size-4" />}
        action={
          <button
            className={cn(btnCls, "bg-slate-950 text-white")}
            onClick={() =>
              csvDownload("VRSNB_Branch_Report.csv", [
                {
                  GrossSales: props.grossSales,
                  ReturnAmount: props.returnAmount,
                  NetSales: props.netSales,
                  CashSales: props.cashSales,
                  UPISales: props.upiSales,
                  CardSales: props.cardSales,
                  CreditSales: props.creditBillAmount,
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
          /confirm_branch_stock_count_report|could not find the function|does not exist|schema cache/i.test(
            rpcError.message || "",
          );
        if (!missingRpc) {
          setNotice(`Stock count confirmation failed: ${rpcError.message}`);
          return;
        }
        for (const line of report.lines) {
          const error = await manualUpdateStock(BRANCH, line.itemName, line.physicalQty, userName);
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Pending Reports" value={pending.length} icon={<ClipboardCheck className="size-4" />} tone="amber" />
        <Kpi label="Total Reports" value={reports.length} icon={<PackageCheck className="size-4" />} tone="blue" />
        <Kpi label="Open Difference Lines" value={openDifferences} icon={<AlertTriangle className="size-4" />} tone="red" />
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
              "VRSNB_Audit_Logs.csv",
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
