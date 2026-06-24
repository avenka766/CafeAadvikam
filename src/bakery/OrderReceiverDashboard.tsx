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
} from "lucide-react";
import { useBakeryStore } from "./bakeryStore";
import { useAuthStore } from "@/stores/authStore";
import { useNotificationStore } from "./notificationStore";
import type { BakeryOrder, BakeryOrderItem, Branch } from "./types";
import BranchStockForm from "./BranchStockForm";
import PurchaseOrderTab from "./PurchaseOrderTab";
import { useBranchStore, type StockItem } from "@/branch/branchStore";
import { StockTab } from "@/branch/tabs/StockTab";
import { useBranchOpsStore } from "@/branch/branchOpsStore";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import { SNB_ITEMS } from "@/branch/snbItems";
import { VRSNB_ITEMS } from "@/branch/vrsnbItems";

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

type TabKey = "order" | "placed" | "notifications" | "stock" | "po" | "stock-count";
type DatePreset = "today" | "yesterday" | "7d" | "15d" | "1m" | "custom";

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

function PlacedOrdersPanel({
  branch,
  orders,
  loading,
}: {
  branch: Branch;
  orders: BakeryOrder[];
  loading: boolean;
}) {
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState(toDateInputValue(new Date()));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));

  const range = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const branchOrders = useMemo(
    () => orders.filter((o) => o.targetBranch === branch),
    [orders, branch],
  );

  const filteredOrders = useMemo(
    () =>
      branchOrders.filter((order) => {
        const created = new Date(order.createdAt);
        return created >= range.start && created <= range.end;
      }),
    [branchOrders, range.start, range.end],
  );

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
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-white/95 p-4 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-body font-black uppercase tracking-[0.18em] text-muted-foreground">
                Downloadable history
              </p>
              <h2 className="font-display text-2xl font-black leading-tight text-foreground">
                Placed Orders
              </h2>
              <p className="text-sm font-body font-bold text-muted-foreground mt-1">
                {range.label}: {range.start.toLocaleDateString("en-IN")} –{" "}
                {range.end.toLocaleDateString("en-IN")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadExcelReport}
            disabled={filteredOrders.length === 0}
            className="h-11 rounded-2xl cafe-gradient px-4 text-sm font-body font-black text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-45 active:scale-95 transition-all"
          >
            <Download className="size-4" /> Download Excel
          </button>
        </div>

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

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              {branchOrders.length}
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
        <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-soft">
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
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {order.items.map((item, i) => (
                    <span
                      key={`${order.id}-${i}`}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-body font-black text-muted-foreground"
                    >
                      {item.itemName} × {displayQty(item)} {displayUnit(item)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
        const master = SNB_ITEMS.find((item) => normalize(item.name) === normalize(price.itemName));
        return {
          ...price,
          category: master?.category ?? "Custom",
          barcode: master?.barcode ?? price.id,
        };
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [prices, selectedShop]);

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
  const [counts, setCounts] = useState<Record<string, string>>({});
  const touchedCounts = useRef<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rows = useMemo(() => {
    const stockMap = new Map(branchStock.map((item) => [item.itemName, item]));
    const itemMaster = branch === "VRSNB" ? VRSNB_ITEMS : SNB_ITEMS;
    return itemMaster.map((item) => {
      const stockItem = stockMap.get(item.name);
      const unit = stockItem?.unit ?? (item.uom === "Kgs" || item.uom === "kg" ? "kg" : "pcs");
      return {
        itemName: item.name,
        unit,
        systemQty: Number(stockItem?.quantity ?? 0),
      };
    });
  }, [branch, branchStock]);

  useEffect(() => {
    setCounts((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        if (!touchedCounts.current[row.itemName]) next[row.itemName] = String(row.systemQty);
      });
      return next;
    });
  }, [rows]);

  const differenceCount = rows.filter((row) => {
    const physical = Number(counts[row.itemName] || 0);
    return Math.abs(row.systemQty - physical) > 0.0001;
  }).length;

  const submit = async () => {
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
      setNotice(`${report.reportNo} sent to ${branch} Admin for confirmation.`);
    } catch (error) {
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
              Enter counted stock. Difference is System Qty minus Physical Qty.
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
          <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-body font-black text-emerald-700">
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
                const physical = Number(counts[row.itemName] || 0);
                const diff = Math.round((row.systemQty - physical) * 1000) / 1000;
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
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-center text-xs font-black tabular-nums",
                        diff === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : diff > 0
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {diff}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function tabFromParams(value: string | null): TabKey {
  if (value === "history" || value === "placed" || value === "orders") return "placed";
  if (value === "alert" || value === "alerts" || value === "notifications") return "notifications";
  if (value === "stock" || value === "incoming") return "stock";
  if (value === "po" || value === "purchase" || value === "purchase-order") return "po";
  if (value === "stock-count" || value === "count" || value === "daily-stock-take") return "stock-count";
  return "order";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
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
  const tab = branch !== "SNB" && requestedTab === "po" ? "order" : requestedTab;
  const userName =
    currentUser?.displayName || currentUser?.username || `${branch ?? "SNB"} Receiver`;

  const stableFetch = useCallback(() => {
    fetchOrders();
  }, [fetchOrders]);
  useEffect(() => {
    stableFetch();
    const id = setInterval(() => {
      fetchOrders(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [stableFetch, fetchOrders]);
  useEffect(() => {
    if (refreshKey > 0) stableFetch();
  }, [refreshKey, stableFetch]);

  useEffect(() => {
    if (!loaded) load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load, loaded]);

  const loadHosurReceiverData = useCallback(async () => {
    if (branch !== "Hosur") return;
    setHosurLoading(true);
    try {
      const [shopsRes, pricesRes, ordersRes, itemsRes] = await Promise.all([
        supabase.from("hosur_shops").select("*").eq("is_active", true).order("shop_name", { ascending: true }),
        supabase.from("hosur_shop_price_lists").select("*").eq("is_active", true),
        supabase.from("hosur_orders").select("*").order("created_at", { ascending: false }).limit(250),
        supabase.from("hosur_order_items").select("*").order("created_at", { ascending: true }).limit(3000),
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
      void refreshStock(false);
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
    tab === "placed"
      ? "Placed Orders"
      : tab === "notifications"
        ? "Packing Alerts"
        : tab === "stock"
          ? "Stock / Incoming"
          : tab === "po"
            ? "Purchase Order"
            : tab === "stock-count"
              ? "Daily Stock Take"
              : "Place New Order";
  const subheading =
    tab === "placed"
      ? "Filter by date range and download your branch order history."
      : tab === "notifications"
        ? "Shortage, excess and remainder alerts from packing are shown here."
        : tab === "stock"
          ? `Confirm incoming stock, update stock manually and maintain thresholds for ${branch}.`
          : tab === "po"
            ? `Create and track ${branch} purchase orders from the receiver dashboard.`
            : tab === "stock-count"
              ? `Record the physical end-of-day count and send differences to ${branch} Admin.`
              : "Create today’s bakery requirement without the old history/search clutter.";
  const receiverTabs: Array<{ key: TabKey; label: string }> = [
    { key: "order", label: "Order" },
    { key: "placed", label: "Placed Orders" },
    { key: "notifications", label: "Notifications" },
    ...(branch === "SNB" || branch === "VRSNB"
      ? ([
          { key: "stock", label: "Stock / Incoming" },
          { key: "stock-count", label: "Stock Count" },
          ...(branch === "SNB" ? [{ key: "po", label: "Purchase Order" } as { key: TabKey; label: string }] : []),
        ] as Array<{ key: TabKey; label: string }>)
      : []),
  ];

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pb-6 font-semibold">
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

      <div className="mb-4 hidden flex-wrap gap-2 rounded-3xl border border-border bg-white/90 p-2 shadow-soft">
        {receiverTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSearchParams({ tab: item.key })}
            className={cn(
              "rounded-2xl px-4 py-2 text-xs font-body font-black transition-all",
              tab === item.key
                ? "bg-slate-950 text-white shadow-lg shadow-slate-200"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
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
                  setSearchParams({ tab: "history" });
                }}
              />
            </div>
          )
        )}

        {tab === "placed" && (
          branch === "Hosur" ? (
            <HosurHistoryPanel orders={hosurOrders} orderItems={hosurOrderItems} loading={hosurLoading} />
          ) : (
            <PlacedOrdersPanel
              branch={branch}
              orders={orders}
              loading={loading}
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
          />
        )}

        {tab === "po" && branch === "SNB" && <PurchaseOrderTab branchScope="SNB" />}

        {tab === "stock-count" && (branch === "SNB" || branch === "VRSNB") && (
          <StockCountPanel branch={branch} branchStock={stock[branch]} userName={userName} />
        )}
      </div>
    </div>
  );
}
