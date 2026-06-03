// ─── OrderReceiverDashboard — Branch-locked, role-driven ─────────────────────
// receiver_vrsnb → VRSNB branch only, VRSNB items only
// receiver_snb   → SNB branch only,   SNB items only
// receiver_hosur → Hosur branch only, Hosur/SNB items only
//
// Each receiver has left-navigation driven sections:
//   • Order          — place today's requirement
//   • Placed Orders  — date-range order history with CSV download
//   • Alerts         — packing discrepancies / remainders for their branch

import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";
import { useBakeryStore } from "./bakeryStore";
import { useAuthStore } from "@/stores/authStore";
import { useNotificationStore } from "./notificationStore";
import type { BakeryOrder, BakeryOrderItem, Branch } from "./types";
import BranchStockForm from "./BranchStockForm";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

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
  receiver_hosur: {
    branch: "Hosur",
    label: "Hosur Order",
    icon: "🌿",
    dot: "bg-emerald-500",
    ring: "ring-emerald-400",
    pill: "bg-emerald-50 border-emerald-200",
    pillText: "text-emerald-700",
    headerBg: "from-emerald-50 via-white to-background",
  },
};

type TabKey = "order" | "placed" | "notifications";
type DatePreset = "today" | "yesterday" | "7d" | "15d" | "1m" | "custom";

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

function csvEscape(value: string | number | undefined): string {
  const safe = String(value ?? "");
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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

  const downloadCsv = () => {
    const rows: Array<Array<string | number | undefined>> = [
      [
        "Order No",
        "Date",
        "Time",
        "Branch",
        "Status",
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
          item.itemName,
          displayQty(item),
          displayUnit(item),
          order.createdBy,
        ]);
      }),
    ];

    const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${branch.toLowerCase()}-placed-orders-${toDateInputValue(range.start)}-to-${toDateInputValue(range.end)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
            onClick={downloadCsv}
            disabled={filteredOrders.length === 0}
            className="h-11 rounded-2xl cafe-gradient px-4 text-sm font-body font-black text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-45 active:scale-95 transition-all"
          >
            <Download className="size-4" /> Download CSV
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

function tabFromParams(value: string | null): TabKey {
  if (value === "placed" || value === "orders") return "placed";
  if (value === "alerts" || value === "notifications") return "notifications";
  return "order";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const { notifications, loaded, load, markRead, markAllRead } =
    useNotificationStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [refreshKey, setRefreshKey] = useState(0);

  // Derive branch from role
  const role = currentUser?.role as UserRole | undefined;
  const meta = role ? BRANCH_META[role] : null;
  const branch = meta?.branch as Branch | undefined;
  const tab = tabFromParams(searchParams.get("tab"));

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

  // Stats
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
        : "Place New Order";
  const subheading =
    tab === "placed"
      ? "Filter by date range and download your branch order history."
      : tab === "notifications"
        ? "Shortage, excess and remainder alerts from packing are shown here."
        : "Create today’s bakery requirement without the old history/search clutter.";

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pb-6 font-semibold">
      {/* Receiver header */}
      <div
        className={cn(
          "rounded-3xl border border-border bg-gradient-to-br p-4 shadow-soft mb-4",
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

      {/* Content */}
      <div>
        {tab === "order" && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-soft">
            <BranchStockForm
              branch={branch}
              onSubmitted={() => {
                setRefreshKey((k) => k + 1);
                setSearchParams({ tab: "placed" });
              }}
            />
          </div>
        )}

        {tab === "placed" && (
          <PlacedOrdersPanel
            branch={branch}
            orders={orders}
            loading={loading}
          />
        )}

        {tab === "notifications" && (
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
        )}
      </div>
    </div>
  );
}
