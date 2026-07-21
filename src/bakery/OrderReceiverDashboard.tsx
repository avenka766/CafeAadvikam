// ─── OrderReceiverDashboard — Branch-locked, role-driven ─────────────────────
// receiver_vrsnb → VRSNB branch only, VRSNB items only
// receiver_snb   → SNB branch only,   SNB items only
//
// Each receiver has left-navigation driven sections:
//   • Order          — place today's requirement
//   • Placed Orders  — date-range order history with CSV download
//   • Alerts         — packing discrepancies / remainders for their branch

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  Bell,
  MapPin,
  Package,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Search,
  Send,
  ShoppingCart,
  Store,
  X,
  Trash2,
  RefreshCw,
  Receipt,
  RotateCcw,
  ArrowRightLeft,
  Clock3,
} from "lucide-react";
import { useBakeryStore, fetchBakeryOrdersInRange } from "./bakeryStore";
import { useAuthStore } from "@/stores/authStore";
import { useNotificationStore } from "./notificationStore";
import type { BakeryOrder, BakeryOrderItem, Branch } from "./types";
import BranchStockForm from "./BranchStockForm";
import PurchaseOrderTab from "./PurchaseOrderTab";
import { useBranchStore, type StockItem } from "@/branch/branchStore";
import { StockTab } from "@/branch/tabs/StockTab";
import { AdvanceCakeOrdersTab, CashierClosureTab } from "@/branch/tabs/BranchBusinessModules";
import { useBranchOpsStore } from "@/branch/branchOpsStore";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import { useOperationalBranchCatalog } from "@/hooks/useOperationalBranchCatalog";
import {
  LiveOrderStatusPanel,
  SnbPurchaseInvoicePanel,
  SnbPurchaseReturnPanel,
  SnbStockOperationsPanel,
} from "./SnbReceiverSharedTabs";

// ── Branch config ──────────────────────────────────────────────────────────────

interface BranchMeta {
  branch: Branch;
  label: string;
  icon: string;
  dot: string;
  ring: string;
  pill: string;
  pillText: string;
  headerBg: string;
}

const BRANCH_META: Record<string, BranchMeta> = {
  receiver_vrsnb: {
    branch: "VRSNB",
    label: "VRSNB Order",
    icon: "🏙️",
    dot: "bg-blue-500",
    ring: "ring-blue-400",
    pill: "bg-blue-50 border-blue-200",
    pillText: "text-blue-700",
    headerBg: "from-blue-50 via-white to-background",
  },
  receiver_snb: {
    branch: "SNB",
    label: "SNB Order",
    icon: "🏪",
    dot: "bg-amber-500",
    ring: "ring-amber-400",
    pill: "bg-amber-50 border-amber-200",
    pillText: "text-amber-700",
    headerBg: "from-amber-50 via-white to-background",
  },
};

type TabKey =
  | "order"
  | "live"
  | "placed"
  | "notifications"
  | "stock"
  | "po"
  | "purchase-invoice"
  | "purchase-return"
  | "stock-movements"
  | "stock-count"
  | "advance"
  | "closure";
type DatePreset = "today" | "yesterday" | "7d" | "15d" | "1m" | "custom";

interface SharedOperationRow {
  id: string;
  type: "Purchase Invoice" | "Purchase Return" | "Dump" | "Damage" | "Transfer Out";
  reference: string;
  party: string;
  details: string;
  amount?: number;
  status: string;
  createdAt: string;
}

interface SharedAdvanceRow {
  id: string;
  reference: string;
  customer: string;
  items: string;
  total: number;
  advance: number;
  balance: number;
  status: string;
  deliveryDate?: string;
  notes?: string;
  createdAt: string;
}

interface HosurShop {
  id: string;
  shopName: string;
  whatsappNumber: string;
  address: string;
  isActive: boolean;
}

interface HosurShopPrice {
  id: string;
  shopId: string;
  itemName: string;
  itemUnit: "pcs" | "kg";
  unitPrice: number;
  isActive: boolean;
}

interface HosurOrder {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  status: string;
  subtotal: number;
  createdBy: string;
  createdAt: string;
  notes?: string | null;
}

interface HosurOrderItem {
  id: string;
  orderId: string;
  itemName: string;
  unit: "pcs" | "kg";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
}

interface HosurDraftItem {
  itemName: string;
  unit: "pcs" | "kg";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  category: string;
}

// ── Notification item ─────────────────────────────────────────────────────────

interface DiscrepancyItem {
  itemName: string;
  requested: number;
  dispatched: number;
  unit: string;
}

interface RemainderItem {
  itemName: string;
  remainderKg: number;
  dispatchedPcs: number;
  preparedKg: number;
}

function NotificationCard({
  n,
  onRead,
}: {
  n: {
    id: string;
    type?: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
    meta?: Record<string, unknown>;
  };
  onRead: (id: string) => void;
}) {
  const meta = n.meta as
    | { items?: DiscrepancyItem[] | RemainderItem[] }
    | undefined;
  const items = meta?.items ?? [];
  const isRemainder = n.type === "packing_remainder";
  const remainderItems = isRemainder ? (items as RemainderItem[]) : [];
  const discrepItems = isRemainder ? [] : (items as DiscrepancyItem[]);

  return (
    <div
      className={cn(
        "rounded-3xl border p-4 space-y-3 transition-all shadow-sm",
        n.isRead
          ? "bg-card border-border opacity-80"
          : "bg-white border-amber-200 shadow-lifted",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-10 rounded-2xl flex items-center justify-center shrink-0 text-lg",
            n.isRead ? "bg-muted" : "bg-amber-50 ring-1 ring-amber-100",
          )}
        >
          <AlertTriangle
            className={cn(
              "size-4",
              n.isRead ? "text-muted-foreground" : "text-amber-600",
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-body font-black leading-snug",
              n.isRead ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {n.title}
          </p>
          <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
            {new Date(n.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        {!n.isRead && (
          <span className="size-2.5 rounded-full bg-amber-500 shrink-0 mt-1 shadow-gold" />
        )}
      </div>

      {/* Per-item breakdown — discrepancy type */}
      {!isRemainder && discrepItems.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {discrepItems.map((item, i) => {
            const diff = item.dispatched - item.requested;
            const isShort = diff < 0;
            const isExcess = diff > 0;
            const isExact = diff === 0;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-bold",
                  isShort
                    ? "bg-red-50 border border-red-100"
                    : isExcess
                      ? "bg-amber-50 border border-amber-100"
                      : "bg-emerald-50 border border-emerald-100",
                )}
              >
                <span className="font-body font-black text-foreground truncate flex-1">
                  {item.itemName}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-muted-foreground">
                    req <strong>{item.requested}</strong> {item.unit}
                  </span>
                  {isShort && (
                    <span className="flex items-center gap-0.5 text-red-600 font-black">
                      <ArrowDown className="size-3" />
                      {Math.abs(diff)} {item.unit} short
                    </span>
                  )}
                  {isExcess && (
                    <span className="flex items-center gap-0.5 text-amber-600 font-black">
                      <ArrowUp className="size-3" />
                      {diff} {item.unit} extra
                    </span>
                  )}
                  {isExact && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-black">
                      <CheckCircle2 className="size-3" /> exact
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-item breakdown — remainder type */}
      {isRemainder && remainderItems.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {remainderItems.map((item, i) => {
            const remainderGrams = Math.round(item.remainderKg * 1000);
            return (
              <div
                key={i}
                className="px-3 py-2 rounded-2xl text-xs font-bold bg-amber-50 border border-amber-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-body font-black text-foreground truncate flex-1">
                    {item.itemName}
                  </span>
                  <span className="flex items-center gap-0.5 text-amber-600 font-black shrink-0 ml-2">
                    <AlertTriangle className="size-3" />
                    {remainderGrams}g at bakery
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 font-semibold">
                  {item.preparedKg} kg →{" "}
                  <strong>{item.dispatchedPcs} pcs</strong> dispatched ·{" "}
                  {remainderGrams}g cannot form a whole piece
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!n.isRead && (
        <button
          onClick={() => onRead(n.id)}
          className="w-full py-2.5 rounded-2xl bg-muted text-xs font-body font-black text-muted-foreground active:bg-muted/70"
        >
          Mark as read
        </button>
      )}
    </div>
  );
}

// ── Placed orders helpers ────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function presetRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
) {
  const today = startOfDay(new Date());
  if (preset === "yesterday") {
    const y = addDays(today, -1);
    return { start: startOfDay(y), end: endOfDay(y), label: "Yesterday" };
  }
  if (preset === "7d") {
    return {
      start: startOfDay(addDays(today, -6)),
      end: endOfDay(today),
      label: "Last 7 days",
    };
  }
  if (preset === "15d") {
    return {
      start: startOfDay(addDays(today, -14)),
      end: endOfDay(today),
      label: "Last 15 days",
    };
  }
  if (preset === "1m") {
    return {
      start: startOfDay(addDays(today, -30)),
      end: endOfDay(today),
      label: "Last 1 month",
    };
  }
  if (preset === "custom") {
    const start = parseDateInput(customStart) ?? today;
    const end = parseDateInput(customEnd) ?? start;
    return {
      start: startOfDay(start),
      end: endOfDay(end < start ? start : end),
      label: "Custom date range",
    };
  }
  return { start: startOfDay(today), end: endOfDay(today), label: "Today" };
}

function htmlEscape(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadExcel(filename: string, rows: Array<Array<string | number | undefined>>) {
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${rows
    .map((row, rowIndex) => `<tr>${row
      .map((cell) => rowIndex === 0 ? `<th>${htmlEscape(cell)}</th>` : `<td>${htmlEscape(cell)}</td>`)
      .join("")}</tr>`)
    .join("")}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const money = (value: number | null | undefined) =>
  `Rs ${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mapHosurShop(row: Record<string, unknown>): HosurShop {
  return {
    id: row.id as string,
    shopName: String(row.shop_name ?? ""),
    whatsappNumber: String(row.whatsapp_number ?? ""),
    address: String(row.address ?? ""),
    isActive: row.is_active !== false,
  };
}

function mapHosurPrice(row: Record<string, unknown>): HosurShopPrice {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    itemName: String(row.item_name ?? ""),
    itemUnit: row.item_unit === "kg" ? "kg" : "pcs",
    unitPrice: Number(row.unit_price ?? 0),
    isActive: row.is_active !== false,
  };
}

function mapHosurOrder(row: Record<string, unknown>): HosurOrder {
  return {
    id: row.id as string,
    orderNumber: String(row.order_number ?? ""),
    shopId: row.shop_id as string,
    shopName: String(row.shop_name ?? ""),
    status: String(row.status ?? "pending_packing"),
    subtotal: Number(row.subtotal ?? 0),
    createdBy: String(row.created_by ?? "Receiver"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    notes: row.notes as string | null | undefined,
  };
}

function mapHosurOrderItem(row: Record<string, unknown>): HosurOrderItem {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    itemName: String(row.item_name ?? ""),
    unit: row.unit === "kg" ? "kg" : "pcs",
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    lineTotal: Number(row.line_total ?? 0),
    dispatchedQuantity: Number(row.dispatched_quantity ?? 0),
    receivedQuantity: Number(row.received_quantity ?? 0),
  };
}

function displayQty(item: BakeryOrderItem): number {
  return item.dispatchUnit === "pcs" && item.originalPcs != null
    ? item.originalPcs
    : item.quantity;
}

function displayUnit(item: BakeryOrderItem): "pcs" | "kg" {
  return item.dispatchUnit ?? "kg";
}

function statusBadgeClass(status: BakeryOrder["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "processing":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "baking":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "packed":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "dispatched":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function orderLocationLabel(status: BakeryOrder["status"]) {
  switch (status) {
    case "pending":
    case "processing":
      return "In Store";
    case "baking":
      return "In Baker";
    case "packed":
      return "In Packing";
    case "dispatched":
      return "Dispatched";
    default:
      return "In Store";
  }
}

function orderAcceptedBy(order: BakeryOrder) {
  const legacy = order as unknown as { accepted_by?: string; approved_by?: string };
  return order.acceptedBy || order.approvedBy || legacy.accepted_by || legacy.approved_by || "";
}


function SharedBranchOperationsPanel({ branch }: { branch: Branch }) {
  const [rows, setRows] = useState<SharedOperationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"All" | SharedOperationRow["type"]>("All");
  const [query, setQuery] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [invoiceRes, returnRes, wasteRes, operationRes] = await Promise.all([
        supabase
          .from("snb_purchase_invoices")
          .select("id,supplier_name,invoice_number,invoice_date,total_amount,balance_amount,sync_status,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("snb_purchase_returns")
          .select("id,return_no,supplier_name,invoice_number,return_date,reason_type,settlement_type,total_amount,status,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("branch_waste_logs")
          .select("id,log_type,item_name,quantity,unit,reason,verified_by,created_by_username,created_at")
          .eq("branch", branch)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.rpc("get_branch_receiver_shared_operations", { p_branch: branch }),
      ]);
      if ([invoiceRes, returnRes, wasteRes, operationRes].every((result) => Boolean(result.error))) {
        throw invoiceRes.error || returnRes.error || wasteRes.error || operationRes.error || new Error("Shared records are unavailable.");
      }
      const next: SharedOperationRow[] = [];
      for (const raw of invoiceRes.error ? [] : invoiceRes.data ?? []) {
        const row = raw as Record<string, unknown>;
        next.push({
          id: String(row.id),
          type: "Purchase Invoice",
          reference: String(row.invoice_number || "-"),
          party: String(row.supplier_name || "-"),
          details: `Invoice ${String(row.invoice_date || "-")} · Outstanding ₹${Number(row.balance_amount || 0).toFixed(2)}`,
          amount: Number(row.total_amount || 0),
          status: String(row.sync_status || "Not Synced"),
          createdAt: String(row.created_at || row.invoice_date || ""),
        });
      }
      for (const raw of returnRes.error ? [] : returnRes.data ?? []) {
        const row = raw as Record<string, unknown>;
        next.push({
          id: String(row.id),
          type: "Purchase Return",
          reference: String(row.return_no || "-"),
          party: String(row.supplier_name || "-"),
          details: `${String(row.reason_type || "Return")} · Invoice ${String(row.invoice_number || "-")} · ${String(row.settlement_type || "Pending")}`,
          amount: Number(row.total_amount || 0),
          status: String(row.status || "Posted"),
          createdAt: String(row.created_at || row.return_date || ""),
        });
      }
      for (const raw of wasteRes.error ? [] : wasteRes.data ?? []) {
        const row = raw as Record<string, unknown>;
        const logType = String(row.log_type || "Damage");
        const type: SharedOperationRow["type"] = logType === "Trans Out" ? "Transfer Out" : logType === "Dump" ? "Dump" : "Damage";
        next.push({
          id: String(row.id),
          type,
          reference: `${type}-${String(row.id).slice(0, 8)}`,
          party: String(row.item_name || "-"),
          details: `${Number(row.quantity || 0)} ${String(row.unit || "")} · ${String(row.reason || "-")} · Verified by ${String(row.verified_by || "-")}`,
          status: "Posted",
          createdAt: String(row.created_at || ""),
        });
      }
      for (const raw of operationRes.error ? [] : Array.isArray(operationRes.data) ? operationRes.data : []) {
        const row = raw as Record<string, unknown>;
        const payload = (row.payload || {}) as Record<string, unknown>;
        const recordType = String(row.record_type || "");
        const operationLogType = String(payload.logType || payload.log_type || "").toLowerCase();
        const type: SharedOperationRow["type"] = recordType === "purchase_invoice"
          ? "Purchase Invoice"
          : recordType === "purchase_return"
            ? "Purchase Return"
            : recordType === "transfer_out" || operationLogType.includes("trans")
              ? "Transfer Out"
              : recordType === "dump" || operationLogType === "dump"
                ? "Dump"
                : "Damage";
        next.push({
          id: `operation-${String(row.id)}`,
          type,
          reference: String(row.record_no || payload.invoiceNo || payload.invoiceNumber || payload.returnNo || payload.reference || "-"),
          party: String(payload.supplier || payload.supplierName || payload.itemName || payload.item_name || "-"),
          details: String(payload.reason || payload.reasonType || payload.remarks || payload.notes || payload.settlementType || "Shared branch record"),
          amount: Number(row.amount || payload.total || 0),
          status: String(row.status || payload.status || "Posted"),
          createdAt: String(row.created_at || payload.createdAt || payload.updatedAt || ""),
        });
      }
      const unique = new Map<string, SharedOperationRow>();
      next.forEach((row) => unique.set(`${row.type}|${row.reference}`, row));
      setRows([...unique.values()].sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt))));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load shared operations");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (filter === "All" || row.type === filter) && (!needle || `${row.type} ${row.reference} ${row.party} ${row.details} ${row.status}`.toLowerCase().includes(needle)));
  }, [rows, filter, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Shared from SNB Admin</p>
            <h2 className="font-display text-xl font-black">Purchase, return and stock-out records</h2>
          </div>
          <button type="button" onClick={() => void loadRows()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-black">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["All", "Purchase Invoice", "Purchase Return", "Dump", "Damage", "Transfer Out"] as const).map((name) => (
            <button key={name} type="button" onClick={() => setFilter(name)} className={cn("rounded-full px-3 py-1.5 text-[11px] font-black", filter === name ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700")}>{name}</button>
          ))}
          <label className="ml-auto flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared records" className="w-full bg-transparent text-xs font-bold outline-none" />
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white shadow-sm">
        {error ? <p className="m-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center"><ClipboardList className="mb-2 size-8 text-muted-foreground" /><p className="text-sm font-black">No shared records found.</p></div>
        ) : (
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Supplier / Item</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>{visible.map((row) => <tr key={`${row.type}-${row.id}`} className="border-b border-border/60 align-top"><td className="whitespace-nowrap px-3 py-2 font-bold">{row.createdAt ? new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-"}</td><td className="px-3 py-2"><span className="rounded-full bg-amber-50 px-2 py-1 font-black text-amber-800">{row.type}</span></td><td className="px-3 py-2 font-black">{row.reference}</td><td className="px-3 py-2 font-bold">{row.party}</td><td className="max-w-[360px] px-3 py-2 text-slate-600">{row.details}</td><td className="px-3 py-2 text-right font-black">{row.amount == null ? "-" : `₹${row.amount.toFixed(2)}`}</td><td className="px-3 py-2 font-bold">{row.status}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SharedAdvanceOrdersPanel({ branch }: { branch: Branch }) {
  const { advanceCakeOrders } = useBranchOpsStore();
  const [databaseRows, setDatabaseRows] = useState<SharedAdvanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [advanceResult, operationResult] = await Promise.all([
        supabase.rpc("get_branch_receiver_advance_orders", { p_branch: branch }),
        supabase
          .from("branch_operation_records")
          .select("id,record_no,amount,status,payload,created_at")
          .eq("branch", branch)
          .eq("record_type", "advance_order")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (advanceResult.error && operationResult.error) throw advanceResult.error || operationResult.error;
      const directRows: SharedAdvanceRow[] = (advanceResult.error ? [] : Array.isArray(advanceResult.data) ? advanceResult.data : []).map((raw) => {
        const row = raw as Record<string, unknown>;
        const items = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
        return {
          id: String(row.id),
          reference: `ADV-${String(row.id).slice(0, 8).toUpperCase()}`,
          customer: String(row.customer_name || "Walk-in"),
          items: items.map((item) => `${String(item.itemName || item.item_name || "Item")} × ${Number(item.quantity || 0)}`).join(", ") || "-",
          total: Number(row.subtotal || 0),
          advance: Number(row.advance_amount || 0),
          balance: Number(row.balance_due || 0),
          status: String(row.status || "pending"),
          deliveryDate: row.delivery_date ? String(row.delivery_date) : undefined,
          notes: row.notes ? String(row.notes) : undefined,
          createdAt: String(row.created_at || ""),
        };
      });
      const operationRows: SharedAdvanceRow[] = (operationResult.error ? [] : operationResult.data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        const payload = (row.payload || {}) as Record<string, unknown>;
        const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
        return {
          id: `operation-${String(row.id)}`,
          reference: String(row.record_no || payload.orderNo || `ADV-${String(row.id).slice(0, 8).toUpperCase()}`),
          customer: String(payload.customerName || payload.customer_name || "Walk-in"),
          items: items.map((item) => `${String(item.itemName || item.item_name || "Item")} × ${Number(item.quantity || 0)}`).join(", ") || String(payload.flavor || "-"),
          total: Number(row.amount || payload.orderValue || payload.subtotal || 0),
          advance: Number(payload.advanceAmount || payload.advance_amount || 0),
          balance: Number(payload.balanceAmount || payload.balance_due || 0),
          status: String(row.status || payload.status || "pending"),
          deliveryDate: payload.deliveryDate ? String(payload.deliveryDate) : undefined,
          notes: String(payload.designNotes || payload.messageOnCake || payload.notes || "") || undefined,
          createdAt: String(row.created_at || payload.createdAt || ""),
        };
      });
      const merged = new Map<string, SharedAdvanceRow>();
      [...operationRows, ...directRows].forEach((row) => merged.set(row.reference, row));
      setDatabaseRows([...merged.values()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load advance orders");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const localRows = useMemo<SharedAdvanceRow[]>(() => advanceCakeOrders.filter((order) => order.branch === branch).map((order) => ({
    id: order.id,
    reference: order.orderNo,
    customer: order.customerName,
    items: order.items?.map((item) => `${item.itemName} × ${item.quantity}`).join(", ") || `${order.cakeKg || "-"} kg ${order.flavor || "Cake"}`,
    total: order.orderValue,
    advance: order.advanceAmount,
    balance: order.balanceAmount,
    status: order.storeStatus ? `${order.status} · ${order.storeStatus}` : order.status,
    deliveryDate: order.deliveryDate,
    notes: order.designNotes || order.messageOnCake,
    createdAt: order.createdAt,
  })), [advanceCakeOrders, branch]);

  const rows = useMemo(() => {
    const byKey = new Map<string, SharedAdvanceRow>();
    [...databaseRows, ...localRows].forEach((row) => byKey.set(`${row.reference}-${row.customer}`, row));
    const needle = query.trim().toLowerCase();
    return [...byKey.values()].filter((row) => !needle || `${row.reference} ${row.customer} ${row.items} ${row.status} ${row.notes || ""}`.toLowerCase().includes(needle)).sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  }, [databaseRows, localRows, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Shared from {branch} Branch</p><h2 className="font-display text-xl font-black">Advance order pipeline</h2></div>
          <div className="flex gap-2"><label className="flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-border px-3"><Search className="size-3.5"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, order or item" className="w-full bg-transparent text-xs font-bold outline-none"/></label><button type="button" onClick={() => void loadRows()} className="grid size-9 place-items-center rounded-xl border border-border"><RefreshCw className={cn("size-3.5", loading && "animate-spin")}/></button></div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white shadow-sm">
        {error ? <p className="m-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        {loading && rows.length === 0 ? <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin"/></div> : rows.length === 0 ? <div className="flex h-full flex-col items-center justify-center p-8"><Clock3 className="mb-2 size-8 text-muted-foreground"/><p className="text-sm font-black">No advance orders found.</p></div> : <table className="w-full min-w-[980px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-950 text-white"><tr><th className="px-3 py-2">Created</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Items / Cake</th><th className="px-3 py-2">Delivery</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Advance</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Live Status</th><th className="px-3 py-2">Note</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.reference}-${row.id}`} className="border-b border-border/60 align-top"><td className="whitespace-nowrap px-3 py-2 font-bold">{new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-3 py-2 font-black">{row.reference}</td><td className="px-3 py-2 font-bold">{row.customer}</td><td className="max-w-[280px] px-3 py-2">{row.items}</td><td className="px-3 py-2 font-bold">{row.deliveryDate || "-"}</td><td className="px-3 py-2 text-right font-black">₹{row.total.toFixed(2)}</td><td className="px-3 py-2 text-right font-black text-emerald-700">₹{row.advance.toFixed(2)}</td><td className="px-3 py-2 text-right font-black text-amber-700">₹{row.balance.toFixed(2)}</td><td className="px-3 py-2"><span className="rounded-full bg-blue-50 px-2 py-1 font-black text-blue-700">{row.status}</span></td><td className="max-w-[260px] px-3 py-2 text-slate-600">{row.notes || "-"}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );
}

function PlacedOrdersPanel({
  branch,
}: {
  branch: Branch;
}) {
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState(toDateInputValue(new Date()));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));

  // Remove item state
  const [removeTarget, setRemoveTarget] = useState<{ order: BakeryOrder; itemIndex: number } | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [customRemoveReason, setCustomRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const REMOVE_PRESETS = ["Wrong item", "Damaged on arrival", "Quantity error", "Not needed", "Custom reason"];

  const finalRemoveReason = removeReason === "Custom reason" ? customRemoveReason.trim() : removeReason;

  const handleRemoveItem = async () => {
    if (!removeTarget || !finalRemoveReason) return;
    setRemoving(true); setRemoveError("");
    const { order, itemIndex } = removeTarget;
    const item = order.items[itemIndex];
    const tableName = branch === "Hosur" ? "hosur_orders" : "bakery_orders";

    // Fetch current removed_items
    const { data: current } = await supabase
      .from(tableName)
      .select("removed_items")
      .eq("id", order.id)
      .single();

    const existing = Array.isArray((current as Record<string,unknown>)?.removed_items)
      ? (current as Record<string,unknown>).removed_items as unknown[]
      : [];

    const removedEntry = {
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.dispatchUnit ?? "pcs",
      reason: finalRemoveReason,
      removedAt: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(tableName)
      .update({ removed_items: [...existing, removedEntry] })
      .eq("id", order.id);

    if (error) {
      setRemoveError(`Failed to remove item: ${error.message}`);
      setRemoving(false);
      return;
    }

    // Insert notification
    await supabase.from("store_notifications").insert({
      type: "item_removed",
      title: `Item removed from Order #${order.orderNumber}`,
      body: `${item.itemName} removed — ${finalRemoveReason}`,
      branch,
      meta: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        itemName: item.itemName,
        reason: finalRemoveReason,
        branch,
      },
    }).select().maybeSingle(); // fire-and-forget; ignore if notifications table schema differs

    setRemoving(false);
    setRemoveTarget(null);
    setRemoveReason("");
    setCustomRemoveReason("");
  };

  const range = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const [filteredOrders, setFilteredOrders] = useState<BakeryOrder[]>([]);
  const [totalBranchOrderCount, setTotalBranchOrderCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rows, countResult] = await Promise.all([
        fetchBakeryOrdersInRange({
          fromIso: range.start.toISOString(),
          toIso: range.end.toISOString(),
          targetBranch: branch,
        }),
        // Lightweight count-only query (head:true returns zero rows, just a
        // count) so the lifetime total stat stays accurate without pulling
        // the branch's entire order history over the wire.
        supabase
          .from("bakery_orders")
          .select("id", { count: "exact", head: true })
          .eq("target_branch", branch),
      ]);
      setFilteredOrders(rows);
      setTotalBranchOrderCount(countResult.count ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load placed orders.");
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end, branch]);

  useEffect(() => { void load(); }, [load]);

  const itemCount = filteredOrders.reduce(
    (sum, order) => sum + order.items.length,
    0,
  );

  const downloadExcelReport = () => {
    const summary = new Map<string, { itemName: string; unit: string; quantity: number }>();
    filteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        const key = `${item.itemName}|${displayUnit(item)}`;
        const existing = summary.get(key) ?? { itemName: item.itemName, unit: displayUnit(item), quantity: 0 };
        existing.quantity += displayQty(item);
        summary.set(key, existing);
      });
    });
    const rows: Array<Array<string | number | undefined>> = [
      [`${branch} Ordered Quantity Report`],
      ["Date Range", `${toDateInputValue(range.start)} to ${toDateInputValue(range.end)}`],
      [],
      ["Item Summary"],
      ["Item Name", "Total Quantity", "Unit"],
      ...Array.from(summary.values()).map((item) => [item.itemName, Number(item.quantity.toFixed(3)), item.unit]),
      [],
      ["Order Details"],
      [
        "Order No",
        "Date",
        "Time",
        "Branch",
        "Status",
        "Location",
        "Accepted / Approved By",
        "Item Name",
        "Quantity",
        "Unit",
        "Created By",
        "Order Note",
      ],
      ...filteredOrders.flatMap((order) => {
        const created = new Date(order.createdAt);
        return order.items.map((item) => [
          order.orderNumber,
          created.toLocaleDateString("en-IN"),
          created.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          branch,
          order.status,
          orderLocationLabel(order.status),
          orderAcceptedBy(order) || "-",
          item.itemName,
          displayQty(item),
          displayUnit(item),
          order.createdBy,
          order.notes || "-",
        ]);
      }),
    ];

    downloadExcel(
      `${branch.toLowerCase()}-ordered-quantity-${toDateInputValue(range.start)}-to-${toDateInputValue(range.end)}.xls`,
      rows,
    );
  };

  const presets: Array<{ key: DatePreset; label: string }> = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "7d", label: "7 days" },
    { key: "15d", label: "15 days" },
    { key: "1m", label: "1 month" },
    { key: "custom", label: "Date range" },
  ];

  return (
    <>
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-border bg-white/95 p-3 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-body font-black uppercase tracking-[0.18em] text-muted-foreground">
                Downloadable history
              </p>
              <h2 className="font-display text-xl font-black leading-tight text-foreground">
                Placed Orders
              </h2>
              <p className="text-sm font-body font-bold text-muted-foreground mt-1">
                {range.label}: {range.start.toLocaleDateString("en-IN")} –{" "}
                {range.end.toLocaleDateString("en-IN")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="h-11 rounded-2xl border border-border bg-background px-4 text-sm font-body font-black text-foreground flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
            </button>
            <button
              type="button"
              onClick={downloadExcelReport}
              disabled={filteredOrders.length === 0}
              className="h-11 rounded-2xl cafe-gradient px-4 text-sm font-body font-black text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-45 active:scale-95 transition-all"
            >
              <Download className="size-4" /> Download Excel
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700">
            {loadError} — tap Refresh to try again.
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPreset(item.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-body font-black transition-all",
                preset === item.key
                  ? "border-primary bg-primary text-primary-foreground shadow-teal"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-body font-black uppercase tracking-wide text-muted-foreground">
                From date
              </span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm font-body font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-body font-black uppercase tracking-wide text-muted-foreground">
                To date
              </span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm font-body font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border bg-background p-3">
            <p className="font-display text-2xl font-black leading-none text-foreground">
              {filteredOrders.length}
            </p>
            <p className="mt-1 text-[10px] font-body font-black uppercase tracking-wide text-muted-foreground">
              Orders
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-3">
            <p className="font-display text-2xl font-black leading-none text-foreground">
              {itemCount}
            </p>
            <p className="mt-1 text-[10px] font-body font-black uppercase tracking-wide text-muted-foreground">
              Line items
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-3 col-span-2 sm:col-span-1">
            <p className="font-display text-2xl font-black leading-none text-foreground">
              {totalBranchOrderCount ?? "—"}
            </p>
            <p className="mt-1 text-[10px] font-body font-black uppercase tracking-wide text-muted-foreground">
              Total branch orders
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-white/70 p-10 text-center">
          <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-body text-sm font-black text-foreground">
            No placed orders in this range.
          </p>
          <p className="mt-1 text-xs font-body font-bold text-muted-foreground">
            Try another preset or choose a custom date range.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white shadow-soft">
          <div className="divide-y divide-border/60">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xl font-black text-foreground">
                      #{order.orderNumber}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-body font-black uppercase tracking-wide",
                        statusBadgeClass(order.status),
                      )}
                    >
                      {order.status}
                    </span>
                  </div>
                  <span className="text-xs font-body font-black text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-body font-black text-blue-700">
                    <MapPin className="size-3" />
                    {orderLocationLabel(order.status)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-body font-black text-slate-700">
                    <CheckCircle2 className="size-3" />
                    {orderAcceptedBy(order)
                      ? `Accepted by ${orderAcceptedBy(order)}`
                      : "Awaiting approval"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1" aria-label={`Live order status: ${orderLocationLabel(order.status)}`}>
                  {(["pending", "processing", "baking", "packed", "dispatched"] as const).map((stage, index, stages) => {
                    const currentIndex = stages.indexOf(order.status);
                    const complete = index <= currentIndex;
                    return (
                      <div key={stage} className="min-w-0">
                        <div className={cn("h-1.5 rounded-full", complete ? "bg-emerald-500" : "bg-slate-200")} />
                        <p className={cn("mt-1 truncate text-[9px] font-black uppercase", complete ? "text-emerald-700" : "text-slate-400")}>{orderLocationLabel(stage)}</p>
                      </div>
                    );
                  })}
                </div>
                {order.notes ? (
                  <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-wide text-blue-500">Complete Order Note</p>
                    <p className="mt-0.5 text-xs font-bold text-blue-900">{order.notes}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {order.items.map((item, i) => {
                    const removedItems = (order as unknown as { removed_items?: Array<{ itemName: string }> }).removed_items ?? [];
                    const isRemoved = removedItems.some(r => r.itemName === item.itemName);
                    return (
                      <span
                        key={`${order.id}-${i}`}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-body font-black flex items-center gap-1.5",
                          isRemoved
                            ? "bg-red-50 text-red-400 line-through border border-red-100"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {item.itemName} × {displayQty(item)} {displayUnit(item)}
                        {!isRemoved && (
                          <button
                            type="button"
                            onClick={() => { setRemoveTarget({ order, itemIndex: i }); setRemoveReason(""); setCustomRemoveReason(""); setRemoveError(""); }}
                            className="ml-0.5 text-red-400 hover:text-red-600 transition-colors"
                            title="Remove this item"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                        {isRemoved && <span className="text-[9px] text-red-400 font-body normal-case no-underline">(removed)</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Remove Item Modal */}
      {removeTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setRemoveTarget(null); }}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-foreground">Remove Item</h3>
              <button onClick={() => setRemoveTarget(null)} className="size-7 rounded-lg bg-muted flex items-center justify-center">
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <p className="text-xs font-body font-bold text-red-700">
                  {removeTarget.order.items[removeTarget.itemIndex].itemName}
                </p>
                <p className="text-[11px] font-body text-red-500 mt-0.5">
                  Order #{removeTarget.order.orderNumber}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Reason *</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {REMOVE_PRESETS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRemoveReason(r)}
                      className={cn(
                        "text-[11px] font-body font-semibold px-2.5 py-1.5 rounded-xl border transition-all",
                        removeReason === r
                          ? "bg-red-600 text-white border-transparent"
                          : "bg-muted/40 border-border text-foreground hover:border-red-300"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {removeReason === "Custom reason" && (
                  <input
                    value={customRemoveReason}
                    onChange={e => setCustomRemoveReason(e.target.value)}
                    placeholder="Describe the reason…"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                )}
              </div>
              {removeError && (
                <p className="text-xs font-body text-red-600 bg-red-50 rounded-xl px-3 py-2">{removeError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setRemoveTarget(null)}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveItem}
                  disabled={removing || !finalRemoveReason}
                  className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-body font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                >
                  {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HosurOrderPanel({
  shops,
  prices,
  userName,
  onSaved,
}: {
  shops: HosurShop[];
  prices: HosurShopPrice[];
  userName: string;
  onSaved: () => void;
}) {
  const { items: snbItems } = useOperationalBranchCatalog('SNB');
  const [shopId, setShopId] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, HosurDraftItem>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeShops = shops.filter((shop) => shop.isActive);
  const selectedShop = activeShops.find((shop) => shop.id === shopId) ?? activeShops[0];

  useEffect(() => {
    if (!shopId && activeShops[0]) setShopId(activeShops[0].id);
  }, [activeShops, shopId]);

  const shopItems = useMemo(() => {
    if (!selectedShop) return [];
    return prices
      .filter((price) => price.shopId === selectedShop.id && price.isActive)
      .map((price) => {
        const master = snbItems.find((item) => normalize(item.name) === normalize(price.itemName));
        return {
          ...price,
          category: master?.category ?? "Custom",
          barcode: master?.barcode ?? price.id,
        };
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [prices, selectedShop, snbItems]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(shopItems.map((item) => item.category)))],
    [shopItems],
  );

  const filteredItems = useMemo(() => {
    return shopItems.filter((item) => {
      if (search.trim() && !normalize(item.itemName).includes(normalize(search))) return false;
      return category === "All" || item.category === category;
    });
  }, [shopItems, search, category]);

  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const setQty = (item: typeof shopItems[number], qty: number) => {
    const safeQty = Math.max(0, Math.round(qty * 1000) / 1000);
    setCart((prev) => {
      const next = { ...prev };
      if (safeQty <= 0) delete next[item.itemName];
      else {
        next[item.itemName] = {
          itemName: item.itemName,
          unit: item.itemUnit,
          quantity: safeQty,
          unitPrice: item.unitPrice,
          lineTotal: Math.round(safeQty * item.unitPrice * 100) / 100,
          category: item.category,
        };
      }
      return next;
    });
  };

  const saveOrder = async () => {
    if (!selectedShop) { setError("Select a shop before sending the order."); return; }
    if (cartItems.length === 0) { setError("Add at least one item requirement."); return; }
    setSaving(true);
    setError("");
    try {
      const orderDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
      const orderNumber = `HSR-ORD-${orderDate}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const { data: order, error: orderError } = await supabase.from("hosur_orders").insert({
        order_number: orderNumber,
        shop_id: selectedShop.id,
        shop_name: selectedShop.shopName,
        shop_whatsapp: selectedShop.whatsappNumber,
        shop_address: selectedShop.address,
        status: "pending_packing",
        subtotal,
        created_by: userName,
        notes: notes.trim() || null,
      }).select("id").single();
      if (orderError) throw orderError;

      const rows = cartItems.map((item) => ({
        order_id: order.id,
        item_name: item.itemName,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        dispatched_quantity: 0,
        received_quantity: 0,
      }));
      const { error: itemsError } = await supabase.from("hosur_order_items").insert(rows);
      if (itemsError) {
        await supabase.from("hosur_orders").delete().eq("id", order.id);
        throw itemsError;
      }

      setCart({});
      setNotes("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send Hosur order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-body font-black uppercase tracking-wide text-muted-foreground">Shop</span>
            <select
              value={selectedShop?.id ?? ""}
              onChange={(event) => { setShopId(event.target.value); setCart({}); setError(""); }}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm font-body font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            >
              {activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopName}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-body font-black uppercase tracking-wide text-muted-foreground">Search item</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this shop's item list"
                className="h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm font-body font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              />
            </div>
          </label>
        </div>

        {selectedShop && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-body">
            <p className="font-black text-emerald-800">{selectedShop.shopName}</p>
            <p className="mt-0.5 text-xs font-bold text-emerald-700">{selectedShop.whatsappNumber}</p>
            <p className="mt-1 text-xs text-emerald-700/75">{selectedShop.address || "No address saved"}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => { setCategory(cat); setSearch(""); }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-body font-black",
                category === cat && !search ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background text-muted-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {activeShops.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center">
            <Store className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="font-body text-sm font-black text-foreground">No active Hosur shops found.</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">Add shops and shop-wise prices from the Hosur branch dashboard first.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center">
            <Package className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="font-body text-sm font-black text-foreground">No items assigned for this shop/category.</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">Only active shop price-list items are shown here.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredItems.map((item) => {
              const current = cart[item.itemName]?.quantity ?? 0;
              const step = item.itemUnit === "kg" ? 0.25 : 1;
              return (
                <article key={`${item.shopId}-${item.itemName}`} className={cn("rounded-2xl border p-3", current > 0 ? "border-emerald-300 bg-emerald-50" : "border-border bg-card")}>
                  <div className="min-h-14">
                    <p className="line-clamp-2 text-sm font-body font-black text-foreground">{item.itemName}</p>
                    <p className="mt-0.5 text-xs font-bold text-muted-foreground">{item.category} · {item.itemUnit} · {money(item.unitPrice)}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" className="size-9 rounded-xl border border-border bg-white font-black" onClick={() => setQty(item, current - step)}>-</button>
                    <input
                      type="number"
                      step={step}
                      min={0}
                      value={current || ""}
                      onChange={(event) => setQty(item, Number(event.target.value))}
                      placeholder="0"
                      className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-white text-center text-sm font-black"
                    />
                    <button type="button" className="size-9 rounded-xl bg-emerald-600 font-black text-white" onClick={() => setQty(item, current + step)}>+</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-4 xl:sticky xl:top-28 xl:h-fit">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-emerald-700" />
          <h2 className="font-display text-xl font-black text-foreground">Requirement</h2>
        </div>
        {cartItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm font-bold text-muted-foreground">No items selected</div>
        ) : (
          <div className="max-h-[42dvh] space-y-2 overflow-auto pr-1">
            {cartItems.map((item) => (
              <div key={item.itemName} className="rounded-2xl border border-border bg-muted/30 p-3">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-black text-foreground">{item.itemName}</p>
                  <button type="button" className="text-red-600" onClick={() => setCart((prev) => { const next = { ...prev }; delete next[item.itemName]; return next; })}>
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs font-bold text-muted-foreground">{num(item.quantity)} {item.unit} x {money(item.unitPrice)} = {money(item.lineTotal)}</p>
              </div>
            ))}
          </div>
        )}
        <label className="space-y-1.5 block">
          <span className="text-[11px] font-body font-black uppercase tracking-wide text-muted-foreground">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Optional notes for store or packing"
            className="w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm font-body font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
          />
        </label>
        <div className="flex items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-white">
          <span className="text-sm font-black">Total</span>
          <span className="font-display text-2xl font-black">{money(subtotal)}</span>
        </div>
        {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">{error}</p>}
        <button
          type="button"
          onClick={saveOrder}
          disabled={saving || cartItems.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-body font-black text-white disabled:opacity-45"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send Requirement
        </button>
      </aside>
    </div>
  );
}

function HosurHistoryPanel({ orders, orderItems, loading }: { orders: HosurOrder[]; orderItems: HosurOrderItem[]; loading: boolean }) {
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState(toDateInputValue(new Date()));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));
  const range = useMemo(() => presetRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const created = new Date(order.createdAt);
    return created >= range.start && created <= range.end;
  }), [orders, range.start, range.end]);
  const filteredIds = new Set(filteredOrders.map((order) => order.id));
  const filteredItems = orderItems.filter((item) => filteredIds.has(item.orderId));

  const downloadExcelReport = () => {
    const summary = new Map<string, { itemName: string; unit: string; quantity: number; amount: number }>();
    filteredItems.forEach((item) => {
      const key = `${item.itemName}|${item.unit}`;
      const existing = summary.get(key) ?? { itemName: item.itemName, unit: item.unit, quantity: 0, amount: 0 };
      existing.quantity += item.quantity;
      existing.amount += item.lineTotal;
      summary.set(key, existing);
    });
    const rows: Array<Array<string | number | undefined>> = [
      ["Hosur Shop Ordered Quantity Report"],
      ["Date Range", `${toDateInputValue(range.start)} to ${toDateInputValue(range.end)}`],
      [],
      ["Item Summary"],
      ["Item Name", "Total Quantity", "Unit", "Amount"],
      ...Array.from(summary.values()).map((item) => [item.itemName, Number(item.quantity.toFixed(3)), item.unit, item.amount]),
      [],
      ["Order Details"],
      ["Order No", "Date", "Shop", "Status", "Item", "Quantity", "Unit", "Price", "Line Total", "Created By"],
      ...filteredOrders.flatMap((order) => {
        const created = new Date(order.createdAt);
        return filteredItems.filter((item) => item.orderId === order.id).map((item) => [
          order.orderNumber,
          created.toLocaleDateString("en-IN"),
          order.shopName,
          order.status,
          item.itemName,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.lineTotal,
          order.createdBy,
          order.notes || "-",
        ]);
      }),
    ];
    downloadExcel(`hosur-ordered-quantity-${toDateInputValue(range.start)}-to-${toDateInputValue(range.end)}.xls`, rows);
  };

  const presets: Array<{ key: DatePreset; label: string }> = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "7d", label: "7 days" },
    { key: "15d", label: "15 days" },
    { key: "1m", label: "1 month" },
    { key: "custom", label: "Date range" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-body font-black uppercase tracking-[0.18em] text-muted-foreground">Hosur shop order history</p>
            <h2 className="font-display text-2xl font-black text-foreground">History</h2>
          </div>
          <button type="button" onClick={downloadExcelReport} disabled={filteredOrders.length === 0} className="h-11 rounded-2xl bg-emerald-600 px-4 text-sm font-body font-black text-white flex items-center justify-center gap-2 disabled:opacity-45">
            <Download className="size-4" /> Download Excel
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((item) => (
            <button key={item.key} type="button" onClick={() => setPreset(item.key)} className={cn("rounded-full border px-3 py-1.5 text-xs font-body font-black", preset === item.key ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background text-muted-foreground")}>{item.label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="h-11 rounded-2xl border border-border bg-background px-3 text-sm font-bold" />
            <input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} className="h-11 rounded-2xl border border-border bg-background px-3 text-sm font-bold" />
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-white/70 p-10 text-center">
          <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-body text-sm font-black text-foreground">No Hosur orders in this range.</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          {filteredOrders.map((order) => (
            <div key={order.id} className="p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-display text-lg font-black text-foreground">{order.orderNumber}</p><p className="text-sm font-bold text-muted-foreground">{order.shopName}</p></div>
                <div className="text-xs font-black text-muted-foreground">{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {filteredItems.filter((item) => item.orderId === order.id).map((item) => (
                  <span key={item.id} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-body font-black text-muted-foreground">{item.itemName} x {num(item.quantity)} {item.unit}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HosurAlertsPanel({ orders, orderItems }: { orders: HosurOrder[]; orderItems: HosurOrderItem[] }) {
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const alerts = orderItems
    .filter((item) => item.dispatchedQuantity > 0 && Math.abs(item.dispatchedQuantity - item.quantity) > 0.001)
    .map((item) => ({ item, order: orderMap.get(item.orderId), diff: item.dispatchedQuantity - item.quantity }))
    .sort((a, b) => new Date(b.order?.createdAt ?? 0).getTime() - new Date(a.order?.createdAt ?? 0).getTime());

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-border bg-white/90 p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-amber-600" />
          <p className="text-sm font-body font-black text-foreground">Hosur Packing Alerts</p>
          {alerts.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{alerts.length}</span>}
        </div>
        <p className="mt-1 text-xs font-bold text-muted-foreground">Brief alerts appear when packing dispatches more or less than the shop requested.</p>
      </div>
      {alerts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-white/70 p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-500" />
          <p className="font-body text-sm font-black text-foreground">No quantity mismatch alerts.</p>
        </div>
      ) : alerts.map(({ item, order, diff }) => (
        <article key={item.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-body font-black text-foreground">{item.itemName}</p>
              <p className="text-xs font-bold text-muted-foreground">{order?.shopName ?? "Hosur shop"} · {order?.orderNumber ?? item.orderId}</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", diff > 0 ? "bg-amber-200 text-amber-800" : "bg-red-100 text-red-700")}>
              {diff > 0 ? `${num(diff)} ${item.unit} extra` : `${num(Math.abs(diff))} ${item.unit} short`}
            </span>
          </div>
          <p className="mt-2 text-xs font-bold text-muted-foreground">Requested {num(item.quantity)} {item.unit}; packing sent {num(item.dispatchedQuantity)} {item.unit}.</p>
        </article>
      ))}
    </div>
  );
}

type StockCalculatorOperator = "+" | "-" | "*" | "/";

const calculatorOperatorLabel: Record<StockCalculatorOperator, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

function roundStockQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function formatStockQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  return String(roundStockQuantity(value));
}

function applyStockCalculatorOperation(
  left: number,
  operator: StockCalculatorOperator,
  right: number,
) {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (right === 0) throw new Error("Cannot divide by zero.");
  return left / right;
}

function PhysicalStockCalculator({
  itemName,
  unit,
  baseQuantity,
  hasConfirmedCount,
  onCancel,
  onDone,
  onReset,
}: {
  itemName: string;
  unit: string;
  baseQuantity: number;
  hasConfirmedCount: boolean;
  onCancel: () => void;
  onDone: (quantity: number) => void;
  onReset: () => void;
}) {
  const isKg = unit.toLowerCase().includes("kg");
  const [accumulator, setAccumulator] = useState(baseQuantity);
  const [pendingOperator, setPendingOperator] = useState<StockCalculatorOperator>("+");
  const [currentInput, setCurrentInput] = useState("");
  const [steps, setSteps] = useState<Array<{ operator: StockCalculatorOperator; value: number }>>([]);
  const [error, setError] = useState("");
  const [confirmingZero, setConfirmingZero] = useState(false);

  const currentNumber = currentInput === "" || currentInput === "." ? 0 : Number(currentInput);
  const preview = useMemo(() => {
    if (!Number.isFinite(currentNumber)) return accumulator;
    try {
      return applyStockCalculatorOperation(accumulator, pendingOperator, currentNumber);
    } catch {
      return accumulator;
    }
  }, [accumulator, currentNumber, pendingOperator]);

  const expression = [
    formatStockQuantity(baseQuantity),
    ...steps.flatMap((step) => [calculatorOperatorLabel[step.operator], formatStockQuantity(step.value)]),
    calculatorOperatorLabel[pendingOperator],
    currentInput || "0",
  ].join(" ");

  const appendDigit = useCallback((value: string) => {
    setError("");
    setCurrentInput((previous) => {
      if (value === ".") {
        if (!isKg || previous.includes(".")) return previous;
        return previous ? `${previous}.` : "0.";
      }
      if (previous === "0") return value;
      if (previous.replace(".", "").length >= 9) return previous;
      return `${previous}${value}`;
    });
  }, [isKg]);

  const chooseOperator = useCallback((operator: StockCalculatorOperator) => {
    setError("");
    if (currentInput === "" || currentInput === ".") {
      setPendingOperator(operator);
      return;
    }

    const operand = Number(currentInput);
    try {
      const result = applyStockCalculatorOperation(accumulator, pendingOperator, operand);
      if (!Number.isFinite(result)) throw new Error("Invalid calculation.");
      setAccumulator(roundStockQuantity(result));
      setSteps((previous) => [...previous, { operator: pendingOperator, value: operand }]);
      setPendingOperator(operator);
      setCurrentInput("");
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Invalid calculation.");
    }
  }, [accumulator, currentInput, pendingOperator]);

  const clearCalculator = useCallback(() => {
    setAccumulator(baseQuantity);
    setPendingOperator("+");
    setCurrentInput("");
    setSteps([]);
    setError("");
    setConfirmingZero(false);
  }, [baseQuantity]);

  const finishCalculation = useCallback(() => {
    setError("");
    let result = accumulator;
    try {
      if (currentInput !== "" && currentInput !== ".") {
        result = applyStockCalculatorOperation(accumulator, pendingOperator, Number(currentInput));
      }
      result = roundStockQuantity(result);
      if (!Number.isFinite(result)) throw new Error("Invalid calculation.");
      if (result < 0) throw new Error("Physical stock cannot be negative.");
      if (!isKg && !Number.isInteger(result)) {
        throw new Error("Piece items must have a whole-number quantity.");
      }
      if (result === 0) {
        setConfirmingZero(true);
        return;
      }
      onDone(result);
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Invalid calculation.");
    }
  }, [accumulator, currentInput, isKg, onDone, pendingOperator]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmingZero) {
        if (event.key === "Enter") {
          event.preventDefault();
          onDone(0);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setConfirmingZero(false);
        }
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        appendDigit(event.key);
      } else if (event.key === ".") {
        event.preventDefault();
        appendDigit(".");
      } else if (["+", "-", "*", "/"].includes(event.key)) {
        event.preventDefault();
        chooseOperator(event.key as StockCalculatorOperator);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setCurrentInput((previous) => previous.slice(0, -1));
        setError("");
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        finishCalculation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendDigit, chooseOperator, confirmingZero, finishCalculation, onCancel, onDone]);

  const calculatorButtons: Array<string | StockCalculatorOperator> = [
    "7", "8", "9", "/",
    "4", "5", "6", "*",
    "1", "2", "3", "-",
    "0", ".", "backspace", "+",
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="physical-stock-calculator-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">SNB Physical Stock</p>
            <h3 id="physical-stock-calculator-title" className="truncate text-lg font-black text-slate-900">{itemName}</h3>
            <p className="text-xs font-bold text-slate-500">
              Current physical: {hasConfirmedCount ? `${formatStockQuantity(baseQuantity)} ${unit}` : "Not counted"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Close calculator"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right text-white shadow-inner">
            <p className="min-h-5 overflow-x-auto whitespace-nowrap text-xs font-bold text-slate-400">{expression}</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{formatStockQuantity(preview)}</p>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{unit}</p>
          </div>

          {confirmingZero ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-black text-red-800">Confirm physical stock as zero?</p>
                    <p className="mt-1 text-xs font-bold leading-relaxed text-red-700">
                      Use Confirm Zero only when the item was physically checked and no stock was found. To clear this count and start again, choose Reset as Uncounted.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onReset}
                className="h-11 w-full rounded-2xl border border-amber-200 bg-amber-50 text-xs font-black text-amber-800 hover:bg-amber-100"
              >
                Reset as Uncounted
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingZero(false)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => onDone(0)}
                  className="h-11 rounded-2xl bg-red-600 text-xs font-black text-white shadow-lg shadow-red-200 hover:bg-red-700"
                >
                  Confirm Zero
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">{error}</div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {calculatorButtons.map((button) => {
                  const isOperator = ["+", "-", "*", "/"].includes(button);
                  const isBackspace = button === "backspace";
                  const isDecimalDisabled = button === "." && !isKg;
                  return (
                    <button
                      key={button}
                      type="button"
                      disabled={isDecimalDisabled}
                      onClick={() => {
                        if (isBackspace) {
                          setCurrentInput((previous) => previous.slice(0, -1));
                          setError("");
                        } else if (isOperator) {
                          chooseOperator(button as StockCalculatorOperator);
                        } else {
                          appendDigit(button);
                        }
                      }}
                      className={cn(
                        "h-12 rounded-2xl text-lg font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30",
                        isOperator
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : isBackspace
                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-slate-100 text-slate-900 hover:bg-slate-200",
                      )}
                      aria-label={isBackspace ? "Backspace" : undefined}
                    >
                      {isBackspace ? "⌫" : isOperator ? calculatorOperatorLabel[button as StockCalculatorOperator] : button}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={clearCalculator} className="h-11 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50">Clear Entry</button>
                <button type="button" onClick={onReset} className="h-11 rounded-2xl border border-red-200 bg-red-50 text-xs font-black text-red-700 hover:bg-red-100">Reset Count</button>
                <button type="button" onClick={onCancel} className="h-11 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={finishCalculation} className="h-11 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700">Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StockCountPanel({
  branch,
  branchStock,
  userName,
}: {
  branch: Extract<Branch, "SNB" | "VRSNB">;
  branchStock: StockItem[];
  userName: string;
}) {
  const { submitStockCountReport } = useBranchOpsStore();
  const { items: itemMaster } = useOperationalBranchCatalog(branch);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [countedItems, setCountedItems] = useState<Record<string, boolean>>({});
  const touchedCounts = useRef<Record<string, boolean>>({});
  const [calculatorRow, setCalculatorRow] = useState<{ itemName: string; unit: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [submitting, setSubmitting] = useState(false);

  const rows = useMemo(() => {
    const stockMap = new Map(branchStock.map((item) => [item.itemName, item]));
    return itemMaster.map((item) => {
      const stockItem = stockMap.get(item.name);
      const unit = stockItem?.unit ?? (item.uom === "Kgs" ? "kg" : "pcs");
      return {
        itemName: item.name,
        unit,
        systemQty: Number(stockItem?.quantity ?? 0),
      };
    });
  }, [branchStock, itemMaster]);

  useEffect(() => {
    setCounts((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        if (!touchedCounts.current[row.itemName]) {
          next[row.itemName] = branch === "SNB" ? "0" : String(row.systemQty);
        }
      });
      return next;
    });
  }, [branch, rows]);

  const differenceCount = rows.filter((row) => {
    if (branch === "SNB" && !countedItems[row.itemName]) return false;
    const physical = Number(counts[row.itemName] || 0);
    return Math.abs(row.systemQty - physical) > 0.0001;
  }).length;

  const submit = async () => {
    if (branch === "SNB") {
      const uncountedRows = rows.filter((row) => !countedItems[row.itemName]);
      if (uncountedRows.length > 0) {
        setNoticeTone("error");
        setNotice(
          `${uncountedRows.length} item${uncountedRows.length === 1 ? " is" : "s are"} still uncounted. Count each item or explicitly confirm zero before sending to SNB Admin.`,
        );
        return;
      }
    }

    setSubmitting(true);
    setNotice("");
    try {
      const report = await submitStockCountReport({
        branch,
        reportedBy: userName,
        lines: rows.map((row) => {
          const physicalQty = Math.max(0, Number(counts[row.itemName] || 0));
          return {
            itemName: row.itemName,
            unit: row.unit,
            systemQty: row.systemQty,
            physicalQty,
            difference: Math.round((row.systemQty - physicalQty) * 1000) / 1000,
          };
        }),
      });
      setNoticeTone("success");
      setNotice(`${report.reportNo} sent to ${branch} Admin for confirmation.`);
    } catch (error) {
      setNoticeTone("error");
      setNotice(error instanceof Error ? error.message : "Could not save the stock count report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-body font-black uppercase tracking-[0.18em] text-muted-foreground">
              End-of-day physical count
            </p>
            <h2 className="font-display text-2xl font-black text-foreground">
              Daily Stock Take
            </h2>
            <p className="text-sm font-body font-bold text-muted-foreground">
              {branch === "SNB"
                ? "Tap Physical to add stock counted from each location. Difference is System Qty minus Physical Qty."
                : "Enter counted stock. Difference is System Qty minus Physical Qty."}
            </p>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-body font-black text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending..." : `Send to ${branch} Admin`}
          </button>
        </div>
        {notice && (
          <div
            className={cn(
              "mt-3 rounded-2xl px-4 py-2 text-sm font-body font-black",
              noticeTone === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "border border-red-200 bg-red-50 text-red-700",
            )}
          >
            {notice}
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-2xl font-black tabular-nums">{rows.length}</p>
            <p className="text-[10px] font-black uppercase text-slate-500">Items</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3">
            <p className="text-2xl font-black tabular-nums text-amber-700">{differenceCount}</p>
            <p className="text-[10px] font-black uppercase text-amber-700">Differences</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="text-2xl font-black tabular-nums text-blue-700">{new Date().toLocaleDateString("en-IN")}</p>
            <p className="text-[10px] font-black uppercase text-blue-700">Count Date</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-soft">
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[minmax(180px,1fr)_90px_120px_100px] gap-3 border-b bg-slate-50 px-4 py-3 text-[11px] font-black uppercase text-slate-500">
              <span>Item</span>
              <span>System</span>
              <span>Physical</span>
              <span>Diff</span>
            </div>
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-border/60">
              {rows.map((row) => {
                const hasConfirmedCount = branch !== "SNB" || Boolean(countedItems[row.itemName]);
                const physical = Number(counts[row.itemName] || 0);
                const diff = hasConfirmedCount
                  ? Math.round((row.systemQty - physical) * 1000) / 1000
                  : null;
                return (
                  <div
                    key={row.itemName}
                    className="grid grid-cols-[minmax(180px,1fr)_90px_120px_100px] items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-body font-black text-foreground">{row.itemName}</p>
                      <p className="text-[11px] font-bold text-slate-500">{row.unit}</p>
                    </div>
                    <span className="font-black tabular-nums">{row.systemQty}</span>
                    {branch === "SNB" ? (
                      <button
                        type="button"
                        onClick={() => setCalculatorRow({ itemName: row.itemName, unit: row.unit })}
                        className={cn(
                          "flex h-10 items-center justify-between rounded-2xl border px-3 text-sm font-black tabular-nums transition focus:outline-none focus:ring-2 focus:ring-amber-200",
                          hasConfirmedCount
                            ? "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300 hover:bg-amber-100"
                            : "border-dashed border-slate-300 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50",
                        )}
                        aria-label={`Enter physical stock for ${row.itemName}`}
                      >
                        <span className="leading-tight">
                          <span className="block">{formatStockQuantity(physical)}</span>
                          {!hasConfirmedCount && <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400">Uncounted</span>}
                        </span>
                        <span className="text-base leading-none text-amber-600">＋</span>
                      </button>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step={row.unit === "kg" ? "0.001" : "1"}
                        value={counts[row.itemName] ?? ""}
                        onChange={(e) => {
                          touchedCounts.current[row.itemName] = true;
                          setCounts((prev) => ({ ...prev, [row.itemName]: e.target.value }));
                        }}
                        className="h-10 rounded-2xl border border-slate-200 px-3 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-center text-xs font-black tabular-nums",
                        diff === null
                          ? "bg-slate-100 text-[10px] text-slate-500"
                          : diff === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : diff > 0
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {diff === null ? "Not counted" : diff}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {branch === "SNB" && calculatorRow && (
        <PhysicalStockCalculator
          key={calculatorRow.itemName}
          itemName={calculatorRow.itemName}
          unit={calculatorRow.unit}
          baseQuantity={countedItems[calculatorRow.itemName]
            ? Math.max(0, Number(counts[calculatorRow.itemName] || 0))
            : 0}
          hasConfirmedCount={Boolean(countedItems[calculatorRow.itemName])}
          onCancel={() => setCalculatorRow(null)}
          onDone={(quantity) => {
            touchedCounts.current[calculatorRow.itemName] = true;
            setCountedItems((previous) => ({
              ...previous,
              [calculatorRow.itemName]: true,
            }));
            setCounts((previous) => ({
              ...previous,
              [calculatorRow.itemName]: formatStockQuantity(quantity),
            }));
            setNotice("");
            setCalculatorRow(null);
          }}
          onReset={() => {
            touchedCounts.current[calculatorRow.itemName] = false;
            setCountedItems((previous) => ({
              ...previous,
              [calculatorRow.itemName]: false,
            }));
            setCounts((previous) => ({
              ...previous,
              [calculatorRow.itemName]: "0",
            }));
            setNotice("");
            setCalculatorRow(null);
          }}
        />
      )}
    </div>
  );
}

function tabFromParams(value: string | null): TabKey {
  if (value === "live" || value === "live-status" || value === "tracking") return "live";
  if (value === "history" || value === "placed" || value === "orders") return "placed";
  if (value === "alert" || value === "alerts" || value === "notifications") return "notifications";
  if (value === "stock" || value === "incoming") return "stock";
  if (value === "po" || value === "purchase" || value === "purchase-order") return "po";
  if (value === "stock-count" || value === "count" || value === "daily-stock-take") return "stock-count";
  if (value === "purchase-invoice" || value === "purchase-invoices" || value === "invoice") return "purchase-invoice";
  if (value === "purchase-return" || value === "purchase-returns" || value === "return") return "purchase-return";
  if (value === "dump" || value === "damage" || value === "transfer-out" || value === "transfer" || value === "stock-movements" || value === "waste") return "stock-movements";
  if (value === "shared" || value === "admin-shared" || value === "shared-data") return "purchase-invoice";
  if (value === "advance" || value === "advance-orders") return "advance";
  if (value === "closure" || value === "daily-closure" || value === "cashier-closure") return "closure";
  return "order";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading, subscribe: subscribeOrders } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const {
    stock,
    incoming,
    thresholds,
    stockMismatches,
    loading: branchLoading,
    fetchBranchData,
    fetchStockMismatches,
    subscribeToStock,
  } = useBranchStore();
  const { notifications, loaded, load, markRead, markAllRead } =
    useNotificationStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [refreshKey, setRefreshKey] = useState(0);
  const [hosurShops, setHosurShops] = useState<HosurShop[]>([]);
  const [hosurPrices, setHosurPrices] = useState<HosurShopPrice[]>([]);
  const [hosurOrders, setHosurOrders] = useState<HosurOrder[]>([]);
  const [hosurOrderItems, setHosurOrderItems] = useState<HosurOrderItem[]>([]);
  const [hosurLoading, setHosurLoading] = useState(false);

  // Derive branch from role
  const role = currentUser?.role as UserRole | undefined;
  const meta = role ? BRANCH_META[role] : null;
  const branch = meta?.branch as Branch | undefined;
  const requestedTab = tabFromParams(searchParams.get("tab"));
  const snbOnlyTabs: TabKey[] = ["po", "purchase-invoice", "purchase-return", "stock-movements", "advance", "closure"];
  const tab = branch !== "SNB" && snbOnlyTabs.includes(requestedTab) ? "order" : requestedTab;
  const userName =
    currentUser?.displayName || currentUser?.username || `${branch ?? "SNB"} Receiver`;

  const stableFetch = useCallback(() => {
    fetchOrders();
  }, [fetchOrders]);
  useEffect(() => {
    stableFetch();
    const unsubscribe = subscribeOrders();
    const id = setInterval(() => {
      if (!document.hidden) fetchOrders(true);
    }, 15 * 60_000);
    return () => { unsubscribe(); clearInterval(id); };
  }, [stableFetch, fetchOrders, subscribeOrders]);
  useEffect(() => {
    if (refreshKey > 0) stableFetch();
  }, [refreshKey, stableFetch]);

  useEffect(() => {
    if (!loaded) load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 10 * 60_000);
    return () => clearInterval(id);
  }, [load, loaded]);

  const loadHosurReceiverData = useCallback(async () => {
    if (branch !== "Hosur") return;
    setHosurLoading(true);
    try {
      const [shopsRes, pricesRes, ordersRes, itemsRes] = await Promise.all([
        supabase.from("hosur_shops").select("id, shop_name, whatsapp_number, address, is_active").eq("is_active", true).order("shop_name", { ascending: true }),
        supabase.from("hosur_shop_price_lists").select("id, shop_id, item_name, item_unit, unit_price, is_active").eq("is_active", true),
        supabase.from("hosur_orders").select("id, order_number, shop_id, shop_name, status, subtotal, created_by, created_at, notes").order("created_at", { ascending: false }).limit(250),
        supabase.from("hosur_order_items").select("id, order_id, item_name, unit, quantity, unit_price, line_total, dispatched_quantity, received_quantity").order("created_at", { ascending: true }).limit(3000),
      ]);
      if (shopsRes.error) throw shopsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (itemsRes.error) throw itemsRes.error;
      setHosurShops((shopsRes.data ?? []).map(mapHosurShop));
      setHosurPrices((pricesRes.data ?? []).map(mapHosurPrice));
      setHosurOrders((ordersRes.data ?? []).map(mapHosurOrder));
      setHosurOrderItems((itemsRes.data ?? []).map(mapHosurOrderItem));
    } finally {
      setHosurLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    loadHosurReceiverData();
  }, [loadHosurReceiverData, refreshKey]);

  useEffect(() => {
    if (branch !== "SNB" && branch !== "VRSNB") return;

    let cancelled = false;
    const refreshStock = async (forceIncomingSync = false) => {
      await useBranchStore.getState().syncIncomingFromDispatches(branch, forceIncomingSync);
      if (!cancelled) await fetchStockMismatches();
    };

    void refreshStock(true);
    const unsubscribe = subscribeToStock(branch);
    const refreshId = window.setInterval(() => {
      if (!document.hidden) void refreshStock(false);
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      unsubscribe();
    };
  }, [branch, fetchStockMismatches, subscribeToStock]);

  // Guard — should never happen if routing is correct
  if (!meta || !branch) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-muted-foreground text-sm font-bold">
          No branch assigned to your account. Please contact admin.
        </p>
      </div>
    );
  }

  const today = new Date().toDateString();
  const branchOrders = orders.filter((o) => o.targetBranch === branch);
  const todayCount = branchOrders.filter(
    (o) => new Date(o.createdAt).toDateString() === today,
  ).length;
  const pendingCount = branchOrders.filter(
    (o) => o.status === "pending",
  ).length;
  const doneCount = branchOrders.filter(
    (o) => o.status === "dispatched",
  ).length;

  // Branch-specific packing_discrepancy AND packing_remainder notifications
  const branchNotifications = notifications.filter(
    (n) =>
      (n.type === "packing_discrepancy" || n.type === "packing_remainder") &&
      (n.meta as { branch?: string } | undefined)?.branch === branch,
  );
  const unreadCount = branchNotifications.filter((n) => !n.isRead).length;

  const heading =
    tab === "live"
      ? "Live Order Status"
      : tab === "placed"
        ? "Placed Orders"
        : tab === "notifications"
          ? "Packing Alerts"
          : tab === "stock"
            ? "Stock / Incoming"
            : tab === "po"
              ? "Purchase Order"
              : tab === "purchase-invoice"
                ? "Purchase Invoice"
                : tab === "purchase-return"
                  ? "Purchase Return"
                  : tab === "stock-movements"
                    ? "Dump / Damage / Transfer Out"
                    : tab === "stock-count"
                      ? "Daily Stock Take"
                      : tab === "advance"
                        ? "Advance Orders"
                        : tab === "closure"
                          ? "Daily Closure"
                          : "Place New Order";
  const subheading =
    tab === "live"
      ? "See each order move live through store, baker, packing and dispatch."
      : tab === "placed"
        ? "Filter by date range and download your branch order history."
        : tab === "notifications"
          ? "Shortage, excess and remainder alerts from packing are shown here."
          : tab === "stock"
            ? `Confirm incoming stock, update stock manually and maintain thresholds for ${branch}.`
            : tab === "po"
              ? `Create and track ${branch} purchase orders with current store stock beside every item.`
              : tab === "purchase-invoice"
                ? "Create purchase invoices and view the same shared records available to SNB Admin."
                : tab === "purchase-return"
                  ? "Post verified purchase returns with live stock deduction and shared Admin history."
                  : tab === "stock-movements"
                    ? "Record dump, damage and transfer-out activity with live stock deduction and operation-specific history."
                    : tab === "stock-count"
                      ? `Record the physical end-of-day count and send differences to ${branch} Admin.`
                      : tab === "advance"
                        ? "Open the SNB Order counter first, then take advance orders and collect payments."
                        : tab === "closure"
                          ? "Open the counter, verify SNB Order advance collections and save the same cashier closure used by SNB Branch."
                          : "Create today’s bakery requirement with live branch stock and a complete-order note.";


  return (
    <div className="order-receiver-workspace dashboard-screen flex h-full min-h-0 flex-col overflow-hidden bg-transparent pb-2 font-semibold">
      {/* Receiver header */}
      <div
        className={cn(
          "hidden rounded-3xl border border-border bg-gradient-to-br p-4 shadow-soft mb-4",
          meta.headerBg,
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-body font-black text-muted-foreground uppercase tracking-[0.22em] mb-1">
              Bakery Receiver
            </p>
            <div className="flex items-center gap-2">
              <span className="text-3xl">{meta.icon}</span>
              <div>
                <h1 className="font-display text-3xl font-black text-foreground leading-none">
                  {heading}
                </h1>
                <p className="text-sm font-body font-bold text-muted-foreground mt-1">
                  {subheading}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-black",
                meta.pill,
              )}
            >
              <MapPin className={cn("size-3", meta.pillText)} />
              <span
                className={cn(
                  "text-[11px] font-body font-black",
                  meta.pillText,
                )}
              >
                {branch} Branch
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-body font-black">Live</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {[
            {
              label: "Today",
              value: todayCount,
              color: "text-foreground",
              bg: "bg-white/75",
            },
            {
              label: "Pending",
              value: pendingCount,
              color: pendingCount > 0 ? "text-amber-600" : "text-foreground",
              bg: pendingCount > 0 ? "bg-amber-50" : "bg-white/75",
            },
            {
              label: tab === "notifications" ? "Unread" : "Dispatched",
              value: tab === "notifications" ? unreadCount : doneCount,
              color:
                tab === "notifications" && unreadCount > 0
                  ? "text-red-600"
                  : "text-emerald-600",
              bg:
                tab === "notifications" && unreadCount > 0
                  ? "bg-red-50"
                  : "bg-emerald-50",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={cn(
                "border border-border rounded-2xl p-3.5 text-center shadow-sm",
                s.bg,
              )}
            >
              <p
                className={cn(
                  "font-display text-2xl font-black tabular-nums leading-none",
                  s.color,
                )}
              >
                {s.value}
              </p>
              <p className="text-[9px] font-body font-black text-muted-foreground uppercase tracking-wide mt-1">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile navigation is provided only by the WorkspaceChrome Menu drawer. */}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "order" && (
          branch === "Hosur" ? (
            <HosurOrderPanel
              shops={hosurShops}
              prices={hosurPrices}
              userName={userName}
              onSaved={() => {
                setRefreshKey((k) => k + 1);
                setSearchParams({ tab: "history" });
              }}
            />
          ) : (
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-soft">
              <BranchStockForm
                branch={branch}
                onSubmitted={() => {
                  setRefreshKey((k) => k + 1);
                  setSearchParams({ tab: "placed" });
                }}
              />
            </div>
          )
        )}

        {tab === "live" && (
          <LiveOrderStatusPanel
            orders={branchOrders}
            loading={loading}
            onRefresh={() => fetchOrders(true, true)}
          />
        )}

        {tab === "placed" && (
          branch === "Hosur" ? (
            <HosurHistoryPanel orders={hosurOrders} orderItems={hosurOrderItems} loading={hosurLoading} />
          ) : (
            <PlacedOrdersPanel
              branch={branch}
            />
          )
        )}

        {tab === "notifications" && (
          branch === "Hosur" ? (
            <HosurAlertsPanel orders={hosurOrders} orderItems={hosurOrderItems} />
          ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between rounded-3xl border border-border bg-white/90 p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" />
                <p className="text-sm font-body font-black text-foreground">
                  Packing Alerts
                </p>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-black">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-body font-black text-muted-foreground underline underline-offset-2"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Info pill */}
            <div
              className={cn(
                "flex items-start gap-2 px-3.5 py-2.5 rounded-2xl border",
                meta.pill,
              )}
            >
              <AlertTriangle
                className={cn("size-3.5 shrink-0 mt-0.5", meta.pillText)}
              />
              <p
                className={cn(
                  "text-[11px] font-body font-bold leading-relaxed",
                  meta.pillText,
                )}
              >
                You are notified whenever packing dispatches{" "}
                <strong>fewer</strong> or <strong>more</strong> items than
                requested for <strong>{branch}</strong>, or when items have
                leftover grams kept at the bakery.
              </p>
            </div>

            {/* Notification list */}
            {branchNotifications.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center rounded-3xl border border-dashed border-border bg-white/70">
                <CheckCircle2 className="size-10 text-emerald-400 mb-3" />
                <p className="font-body font-black text-foreground text-sm">
                  All good!
                </p>
                <p className="text-xs font-bold text-muted-foreground mt-1">
                  No packing alerts for {branch} yet.
                </p>
              </div>
            ) : (
              branchNotifications.map((n) => (
                <NotificationCard key={n.id} n={n} onRead={markRead} />
              ))
            )}
          </div>
          )
        )}

        {tab === "stock" && (branch === "SNB" || branch === "VRSNB") && (
          <StockTab
            branch={branch}
            branchStock={stock[branch]}
            branchIncoming={incoming[branch]}
            branchThresholds={thresholds[branch]}
            loading={branchLoading}
            stockMismatches={stockMismatches}
            allowManualUpdate={false}
          />
        )}

        {tab === "po" && branch === "SNB" && <PurchaseOrderTab branchScope="SNB" />}

        {tab === "purchase-invoice" && branch === "SNB" && <SnbPurchaseInvoicePanel />}

        {tab === "purchase-return" && branch === "SNB" && <SnbPurchaseReturnPanel />}

        {tab === "stock-movements" && branch === "SNB" && <SnbStockOperationsPanel />}

        {tab === "advance" && branch === "SNB" && (
          <AdvanceCakeOrdersTab branch="SNB" branchStock={stock.SNB} source="snb-order" />
        )}

        {tab === "closure" && branch === "SNB" && (
          <CashierClosureTab branch="SNB" branchStock={stock.SNB} source="snb-order" />
        )}

        {tab === "stock-count" && (branch === "SNB" || branch === "VRSNB") && (
          <StockCountPanel branch={branch} branchStock={stock[branch]} userName={userName} />
        )}
      </div>
    </div>
  );
}
