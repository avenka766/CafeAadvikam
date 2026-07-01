import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useBranchStore } from "@/branch/branchStore";
import { useOperationalBranchCatalog } from "@/hooks/useOperationalBranchCatalog";
import { useSnbAdminReports } from "@/hooks/useSnbAdminReports";
import { PurchaseInvoicesTab } from "@/pages/AdminSNBDashboard";
import { AdvancePaymentsTab } from "@/branch/tabs/AdvancePaymentsTab";
import type { BakeryOrder } from "./types";

const panelClass = "rounded-2xl border border-border bg-white shadow-sm";
const inputClass = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300";
const textareaClass = "min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normal(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatQty(value: number, unit?: string) {
  return `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit || "pcs"}`;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] font-semibold text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function StatusMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div className={cn("rounded-xl px-3 py-2 text-xs font-bold", error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{error || success}</div>
  );
}

export function LiveOrderStatusPanel({ orders, loading, onRefresh }: { orders: BakeryOrder[]; loading: boolean; onRefresh: () => void }) {
  const stages: BakeryOrder["status"][] = ["pending", "processing", "baking", "packed", "dispatched"];
  const active = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()),
    [orders],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={cn(panelClass, "flex shrink-0 items-center justify-between gap-3 p-3")}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Live order tracking</p>
          <h2 className="font-display text-lg font-black">Store → Baker → Packing → Dispatch</h2>
          <p className="text-[11px] font-semibold text-muted-foreground">Auto-refreshes every 15 seconds.</p>
        </div>
        <button type="button" onClick={onRefresh} className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-white" aria-label="Refresh live status">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {active.length === 0 ? (
          <div className={cn(panelClass, "flex min-h-64 flex-col items-center justify-center p-8 text-center")}>
            <Clock3 className="mb-2 size-9 text-muted-foreground/40" />
            <p className="text-sm font-black">No SNB orders yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {active.map((order) => {
              const stageIndex = stages.indexOf(order.status);
              return (
                <article key={order.id} className={cn(panelClass, "p-3")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">Order #{order.orderNumber}</p>
                      <p className="text-[11px] font-semibold text-muted-foreground">{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{order.status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-1">
                    {stages.map((stage, index) => (
                      <div key={stage} className="min-w-0 text-center">
                        <div className={cn("mx-auto h-2 w-full rounded-full", index <= stageIndex ? "bg-emerald-500" : "bg-slate-200")} />
                        <p className="mt-1 truncate text-[8px] font-black uppercase text-muted-foreground">{stage}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
                    <p className="text-[11px] font-bold text-slate-700">{order.items.map((item) => `${item.itemName} × ${item.originalPcs ?? item.quantity} ${item.dispatchUnit || "kg"}`).join(", ")}</p>
                    {order.notes ? <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Note: {order.notes}</p> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-muted-foreground">
                    <span>Accepted by: {order.acceptedBy || order.approvedBy || "Pending"}</span>
                    <span>•</span>
                    <span>Last update: {new Date(order.updatedAt || order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type ReturnInvoice = {
  id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number | string;
  balance_amount: number | string;
  payment_method: string | null;
  sync_status: string;
  revision_pending: boolean;
  created_by: string | null;
  created_at: string;
};

type ReturnItem = {
  id: string;
  item_name: string;
  quantity: number | string;
  synced_quantity: number | string;
  unit: string;
  rate: number | string;
  tax: number | string;
  discount: number | string;
  returnedQuantity: number;
  returnableQuantity: number;
  returnQuantity: string;
  itemReason: string;
};

type ReturnRow = {
  id: string;
  return_no: string;
  supplier_name: string;
  invoice_number: string;
  return_date: string;
  reason_type: string;
  settlement_type: string;
  total_amount: number | string;
  entered_by: string;
  status: string;
  created_at: string;
};

type PriorReturnItem = {
  purchase_invoice_item_id: string;
  quantity: number | string;
};

export function SnbPurchaseInvoicePanel() {
  const user = useAuthStore((state) => state.currentUser);
  const fetchBranchData = useBranchStore((state) => state.fetchBranchData);
  const [notice, setNotice] = useState("");
  const today = todayInput();
  const fromDate = `${today.slice(0, 4)}-01-01`;
  const dbReports = useSnbAdminReports(fromDate, today);
  const actorName = `SNB Order - ${user?.displayName || user?.username || "SNB Order"}`;

  return (
    <div className="h-full min-h-0 overflow-auto p-1">
      <div className="space-y-3">
        <div className={cn(panelClass, "flex flex-wrap items-center justify-between gap-3 p-3")}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
              Same purchase workflow as SNB Admin
            </p>
            <h2 className="font-display text-lg font-black">SNB Purchase Invoice Management</h2>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
              Create, edit, re-sync and review the shared SNB purchase ledger. All actions are recorded as SNB Order.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void dbReports.refresh()}
            className="grid size-10 place-items-center rounded-xl border border-border bg-white"
            aria-label="Refresh purchase invoices"
          >
            <RefreshCw className={cn("size-4", dbReports.loading && "animate-spin")} />
          </button>
        </div>

        {notice ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {dbReports.error ? <StatusMessage error={dbReports.error} /> : null}

        <PurchaseInvoicesTab
          userName={actorName}
          fetchBranchData={fetchBranchData}
          setNotice={setNotice}
          dbReports={dbReports}
        />
      </div>
    </div>
  );
}

export function SnbPurchaseReturnPanel() {
  const stock = useBranchStore((state) => state.stock.SNB);
  const user = useAuthStore((state) => state.currentUser);
  const userName = user?.displayName || user?.username || "SNB Order";
  const [invoices, setInvoices] = useState<ReturnInvoice[]>([]);
  const [history, setHistory] = useState<ReturnRow[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [form, setForm] = useState({ returnDate: todayInput(), reasonType: "Damaged", settlementType: "Credit Note", creditNoteNo: "", referenceNo: "", remarks: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    const [invoiceResult, historyResult] = await Promise.all([
      supabase
        .from("snb_purchase_invoices")
        .select("id,supplier_name,invoice_number,invoice_date,total_amount,balance_amount,payment_method,sync_status,revision_pending,created_by,created_at")
        .eq("sync_status", "Synced")
        .eq("revision_pending", false)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("snb_purchase_returns").select("id,return_no,supplier_name,invoice_number,return_date,reason_type,settlement_type,total_amount,entered_by,status,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    setLoading(false);
    if (invoiceResult.error || historyResult.error) setError(invoiceResult.error?.message || historyResult.error?.message || "Unable to load purchase returns");
    else { setInvoices((invoiceResult.data || []) as ReturnInvoice[]); setHistory((historyResult.data || []) as ReturnRow[]); }
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => {
    if (!invoiceId) {
      setItems([]);
      return;
    }

    void (async () => {
      setLoading(true);
      setError("");

      const { data: invoiceItems, error: itemError } = await supabase
        .from("snb_purchase_invoice_items")
        .select("id,item_name,quantity,synced_quantity,unit,rate,tax,discount")
        .eq("purchase_invoice_id", invoiceId)
        .order("item_name");

      if (itemError) {
        setLoading(false);
        setError(itemError.message);
        return;
      }

      const baseItems = (invoiceItems || []) as Array<
        Omit<ReturnItem, "returnedQuantity" | "returnableQuantity" | "returnQuantity" | "itemReason">
      >;
      const itemIds = baseItems.map((item) => item.id);
      let priorReturns: PriorReturnItem[] = [];

      if (itemIds.length > 0) {
        const { data: returnedRows, error: returnedError } = await supabase
          .from("snb_purchase_return_items")
          .select("purchase_invoice_item_id,quantity")
          .in("purchase_invoice_item_id", itemIds);

        if (returnedError) {
          setLoading(false);
          setError(returnedError.message);
          return;
        }

        priorReturns = (returnedRows || []) as PriorReturnItem[];
      }

      const returnedByItem = new Map<string, number>();
      for (const row of priorReturns) {
        returnedByItem.set(
          row.purchase_invoice_item_id,
          (returnedByItem.get(row.purchase_invoice_item_id) || 0) + Number(row.quantity || 0),
        );
      }

      setItems(
        baseItems.map((item) => {
          const returnedQuantity = returnedByItem.get(item.id) || 0;
          const returnableQuantity = Math.max(0, Number(item.synced_quantity || 0) - returnedQuantity);
          return {
            ...item,
            returnedQuantity,
            returnableQuantity,
            returnQuantity: "",
            itemReason: "",
          };
        }),
      );
      setLoading(false);
    })();
  }, [invoiceId]);

  const stockFor = (itemName: string) => stock.find((item) => normal(item.itemName) === normal(itemName));
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);
  const selected = items.filter((item) => Number(item.returnQuantity || 0) > 0);
  const estimated = selected.reduce((sum, item) => {
    const qty = Number(item.returnQuantity || 0); const originalQty = Number(item.quantity || 0); const ratio = originalQty > 0 ? qty / originalQty : 0;
    return sum + Math.max(0, qty * Number(item.rate || 0) + Number(item.tax || 0) * ratio - Number(item.discount || 0) * ratio);
  }, 0);

  const submit = async () => {
    setError(""); setSuccess("");
    if (!invoiceId || !selectedInvoice) return setError("Select a fully synced purchase invoice.");
    if (selectedInvoice.sync_status !== "Synced" || selectedInvoice.revision_pending) {
      return setError("Re-sync the edited purchase invoice before creating a return.");
    }
    if (form.returnDate > todayInput()) return setError("Return date cannot be in the future.");
    if (form.returnDate < selectedInvoice.invoice_date) return setError("Return date cannot be before the invoice date.");
    if (!selected.length) return setError("Enter a return quantity for at least one item.");
    if (form.remarks.trim().length < 5) return setError("Enter clear return remarks.");
    for (const item of selected) {
      const qty = Number(item.returnQuantity || 0);
      const live = stockFor(item.item_name);
      const available = Number(live?.availableQuantity ?? live?.quantity ?? 0);
      if (qty <= 0 || qty > item.returnableQuantity + 0.0001) {
        return setError(`${item.item_name}: only ${formatQty(item.returnableQuantity, item.unit)} remains returnable.`);
      }
      if (qty > available + 0.0001) {
        return setError(`${item.item_name}: only ${formatQty(available, live?.unit || item.unit)} is unreserved in live stock.`);
      }
      if (item.itemReason.trim().length < 3) return setError(`Enter item details for ${item.item_name}.`);
    }
    if (form.settlementType === "Credit Note" && !form.creditNoteNo.trim()) return setError("Credit note number is required.");
    if (["Cash Refund", "Bank Refund"].includes(form.settlementType) && !form.referenceNo.trim()) return setError("Refund reference is required.");
    setSaving(true);
    const { data, error: saveError } = await supabase.rpc("create_snb_order_purchase_return_secure", {
      p_purchase_invoice_id: invoiceId,
      p_return_date: form.returnDate,
      p_reason_type: form.reasonType,
      p_settlement_type: form.settlementType,
      p_credit_note_no: form.creditNoteNo.trim() || null,
      p_reference_no: form.referenceNo.trim() || null,
      p_remarks: form.remarks.trim(),
      p_items: selected.map((item) => ({ purchase_invoice_item_id: item.id, quantity: Number(item.returnQuantity), item_reason: item.itemReason.trim() })),
      p_entered_by: `SNB Order - ${userName}`,
    });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    const result = (data || {}) as Record<string, unknown>;
    setSuccess(`${String(result.returnNo || "Purchase return")} posted and shared with SNB Admin.`);
    setInvoiceId(""); setItems([]); setForm({ returnDate: todayInput(), reasonType: "Damaged", settlementType: "Credit Note", creditNoteNo: "", referenceNo: "", remarks: "" });
    await Promise.all([loadBase(), useBranchStore.getState().fetchBranchData("SNB")]);
  };

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-auto xl:grid-cols-[minmax(380px,1fr)_minmax(0,1fr)]">
      <section className={cn(panelClass, "p-3")}>
        <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Stock deduction is automatic</p><h2 className="font-display text-lg font-black">New Purchase Return</h2></div><RotateCcw className="size-5 text-amber-600" /></div>
        <Field label="Synced Purchase Invoice"><select className={inputClass} value={invoiceId} onChange={(event) => {
          const nextInvoiceId = event.target.value;
          const nextInvoice = invoices.find((invoice) => invoice.id === nextInvoiceId);
          setInvoiceId(nextInvoiceId);
          setError("");
          if (nextInvoice && form.returnDate < nextInvoice.invoice_date) {
            setForm((current) => ({ ...current, returnDate: nextInvoice.invoice_date }));
          }
        }}><option value="">Select invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {invoice.supplier_name}</option>)}</select></Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Return Date"><input type="date" min={selectedInvoice?.invoice_date} max={todayInput()} className={inputClass} value={form.returnDate} onChange={(event) => setForm({ ...form, returnDate: event.target.value })} /></Field><Field label="Reason"><select className={inputClass} value={form.reasonType} onChange={(event) => setForm({ ...form, reasonType: event.target.value })}><option>Damaged</option><option>Expired</option><option>Quality Issue</option><option>Short Received</option><option>Wrong Item</option><option>Other</option></select></Field><Field label="Settlement"><select className={inputClass} value={form.settlementType} onChange={(event) => setForm({ ...form, settlementType: event.target.value })}><option>Credit Note</option><option>Replacement</option><option>Cash Refund</option><option>Bank Refund</option><option>No Financial Adjustment</option></select></Field>{form.settlementType === "Credit Note" ? <Field label="Credit Note No"><input className={inputClass} value={form.creditNoteNo} onChange={(event) => setForm({ ...form, creditNoteNo: event.target.value })} /></Field> : ["Cash Refund", "Bank Refund"].includes(form.settlementType) ? <Field label="Reference No"><input className={inputClass} value={form.referenceNo} onChange={(event) => setForm({ ...form, referenceNo: event.target.value })} /></Field> : <div />}</div>
        <div className="mt-3 space-y-2">{loading && invoiceId ? <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin" /></div> : items.map((item) => { const live = stockFor(item.item_name); return <div key={item.id} className="rounded-2xl border border-border bg-slate-50 p-2.5"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black">{item.item_name}</p><p className="text-[10px] font-semibold text-muted-foreground">Purchased: {formatQty(Number(item.synced_quantity ?? item.quantity), item.unit)} · Returned: {formatQty(item.returnedQuantity, item.unit)} · Returnable: {formatQty(item.returnableQuantity, item.unit)} · Live unreserved: {formatQty(Number(live?.availableQuantity ?? live?.quantity ?? 0), live?.unit || item.unit)}</p></div><input type="number" min="0" max={Math.min(item.returnableQuantity, Number(live?.availableQuantity ?? live?.quantity ?? 0))} step="0.001" disabled={item.returnableQuantity <= 0} value={item.returnQuantity} onChange={(event) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, returnQuantity: event.target.value } : line))} placeholder="Qty" className="h-9 w-24 rounded-xl border border-border px-2 text-right text-xs font-black outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div><input value={item.itemReason} onChange={(event) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, itemReason: event.target.value } : line))} placeholder="Damage / return details" className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-xs font-bold outline-none" /></div>; })}</div>
        <div className="mt-3"><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></Field></div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2"><span className="text-xs font-black text-amber-800">Estimated return value</span><strong>{money(estimated)}</strong></div>
        <div className="mt-3"><StatusMessage error={error} success={success} /></div>
        <button type="button" onClick={() => void submit()} disabled={saving} className={cn(primaryButton, "mt-3 w-full")}>{saving ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Post Purchase Return</button>
      </section>
      <section className={cn(panelClass, "min-h-[420px] overflow-auto")}><div className="sticky top-0 border-b border-border bg-white p-3"><h3 className="text-sm font-black">Shared Purchase Return History</h3></div>{history.length === 0 ? <div className="p-8 text-center text-sm font-bold text-muted-foreground">No purchase returns found.</div> : <div className="divide-y divide-border">{history.map((row) => <article key={row.id} className="p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{row.return_no}</p><p className="text-xs font-bold text-muted-foreground">{row.supplier_name} · Invoice {row.invoice_number}</p></div><strong>{money(Number(row.total_amount || 0))}</strong></div><p className="mt-2 text-[11px] font-semibold text-muted-foreground">{row.return_date} · {row.reason_type} · {row.settlement_type}</p><p className="mt-1 text-[10px] font-black text-amber-700">Entered by {row.entered_by}</p></article>)}</div>}</section>
    </div>
  );
}

export type StockMovementMode = "Dump" | "Damage" | "Trans Out";
type WasteRow = { id: string; log_type: StockMovementMode; item_name: string; quantity: number | string; unit: string; reason: string; verified_by: string; created_by_username: string; created_at: string };

export function SnbStockMovementPanel({ mode }: { mode: StockMovementMode }) {
  const { items: catalogItems } = useOperationalBranchCatalog("SNB");
  const stock = useBranchStore((state) => state.stock.SNB);
  const user = useAuthStore((state) => state.currentUser);
  const userName = user?.displayName || user?.username || "SNB Order";
  const first = catalogItems[0];
  const [form, setForm] = useState({ itemName: first?.name || "", barcode: first?.barcode, quantity: "", unit: first?.uom === "Kgs" ? "kg" : "pcs", reason: "", verifiedBy: userName, confirmed: false });
  const [history, setHistory] = useState<WasteRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { if (!form.itemName && first) setForm((current) => ({ ...current, itemName: first.name, barcode: first.barcode, unit: first.uom === "Kgs" ? "kg" : "pcs" })); }, [first, form.itemName]);
  const loadRows = useCallback(async () => { setLoading(true); const { data, error: loadError } = await supabase.from("branch_waste_logs").select("id,log_type,item_name,quantity,unit,reason,verified_by,created_by_username,created_at").eq("branch", "SNB").eq("log_type", mode).order("created_at", { ascending: false }).limit(500); setLoading(false); if (loadError) setError(loadError.message); else setHistory((data || []) as WasteRow[]); }, [mode]);
  useEffect(() => { void loadRows(); }, [loadRows]);
  const stockRow = stock.find((item) => form.barcode != null && item.itemBarcode != null ? item.itemBarcode === form.barcode : normal(item.itemName) === normal(form.itemName));
  const available = Number(stockRow?.availableQuantity ?? stockRow?.quantity ?? 0);
  const choose = (name: string) => { const item = catalogItems.find((entry) => entry.name === name); setForm((current) => ({ ...current, itemName: name, barcode: item?.barcode, unit: item?.uom === "Kgs" ? "kg" : "pcs" })); };
  const submit = async () => {
    setError(""); setSuccess(""); const qty = Number(form.quantity || 0);
    if (!form.itemName || qty <= 0) return setError("Choose an item and enter a valid quantity.");
    if (qty > available) return setError(`Only ${formatQty(available, stockRow?.unit || form.unit)} is available.`);
    if (form.reason.trim().length < 3 || !form.verifiedBy.trim()) return setError("Reason and verifier are required.");
    if (!form.confirmed) return setError("Confirm the physical verification before posting.");
    setSaving(true);
    const { error: saveError } = await supabase.rpc("record_branch_waste_secure", { p_branch: "SNB", p_log_type: mode, p_item_barcode: form.barcode || null, p_item_name: form.itemName, p_quantity: qty, p_unit: form.unit, p_reason: form.reason.trim(), p_verified_by: form.verifiedBy.trim(), p_checklist: ["Quantity physically verified", `Entered by SNB Order - ${userName}`] });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setSuccess(`${mode === "Trans Out" ? "Transfer Out" : mode} posted and shared with SNB Admin.`);
    setForm((current) => ({ ...current, quantity: "", reason: "", confirmed: false }));
    await Promise.all([loadRows(), useBranchStore.getState().fetchBranchData("SNB")]);
  };
  const title = mode === "Trans Out" ? "Transfer Out" : mode;
  const Icon = mode === "Trans Out" ? Truck : mode === "Damage" ? AlertTriangle : Trash2;

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-auto xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
      <section className={cn(panelClass, "p-3")}><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Live stock deduction</p><h2 className="font-display text-lg font-black">New {title}</h2></div><Icon className="size-5 text-amber-600" /></div><div className="space-y-3"><Field label="Item" hint={`Available now: ${formatQty(available, stockRow?.unit || form.unit)}`}><select className={inputClass} value={form.itemName} onChange={(event) => choose(event.target.value)}>{catalogItems.map((item) => <option key={item.barcode}>{item.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input type="number" min="0.001" step="0.001" className={inputClass} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field><Field label="Unit"><input className={inputClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field></div><Field label="Reason / Destination"><textarea className={textareaClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={mode === "Trans Out" ? "Destination and transfer reason" : `${title} reason`} /></Field><Field label="Verified By"><input className={inputClass} value={form.verifiedBy} onChange={(event) => setForm({ ...form, verifiedBy: event.target.value })} /></Field><label className="flex items-start gap-2 rounded-xl border border-border bg-slate-50 p-3 text-xs font-bold"><input type="checkbox" checked={form.confirmed} onChange={(event) => setForm({ ...form, confirmed: event.target.checked })} className="mt-0.5" /><span>I confirm the quantity was physically checked and may be deducted from usable SNB stock.</span></label><StatusMessage error={error} success={success} /><button type="button" onClick={() => void submit()} disabled={saving} className={cn(primaryButton, "w-full")}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Post {title}</button></div></section>
      <section className={cn(panelClass, "min-h-[420px] overflow-auto")}><div className="sticky top-0 flex items-center justify-between border-b border-border bg-white p-3"><h3 className="text-sm font-black">{title} History</h3><button type="button" onClick={() => void loadRows()} className="grid size-9 place-items-center rounded-xl border border-border"><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></button></div>{history.length === 0 ? <div className="p-8 text-center text-sm font-bold text-muted-foreground">No {title.toLowerCase()} records found.</div> : <div className="divide-y divide-border">{history.map((row) => <article key={row.id} className="p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{row.item_name}</p><p className="text-xs font-bold text-muted-foreground">{formatQty(Number(row.quantity), row.unit)} · {row.reason}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">{title}</span></div><p className="mt-2 text-[10px] font-semibold text-muted-foreground">Verified by {row.verified_by} · Entered by {row.created_by_username} · {new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></article>)}</div>}</section>
    </div>
  );
}

export function SnbStockOperationsPanel() {
  const [mode, setMode] = useState<"Dump" | "Damage" | "Trans Out">("Dump");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-3 gap-2 rounded-2xl border border-border bg-white p-2 shadow-sm">
        {(["Dump", "Damage", "Trans Out"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "min-h-10 rounded-xl px-3 py-2 text-xs font-black transition",
              mode === item ? "bg-slate-950 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {item === "Trans Out" ? "Transfer Out" : item}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <SnbStockMovementPanel mode={mode} />
      </div>
    </div>
  );
}

type AdvanceLine = { key: string; barcode: number; itemName: string; quantity: string; sellUnit: "kg" | "pcs"; price: number };

export function SnbAdvanceOrdersPanel() {
  const { items: catalogItems } = useOperationalBranchCatalog("SNB");
  const user = useAuthStore((state) => state.currentUser);
  const userName = user?.displayName || user?.username || "SNB Order";
  const stock = useBranchStore((state) => state.stock.SNB);
  const advanceOrders = useBranchStore((state) => state.advanceOrders.SNB);
  const fetchBranchData = useBranchStore((state) => state.fetchBranchData);
  const first = catalogItems[0];
  const [showForm, setShowForm] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ customerName: "", deliveryDate: todayInput(), notes: "", advanceAmount: "", advanceMethod: "cash" });
  const [lines, setLines] = useState<AdvanceLine[]>([]);
  useEffect(() => { if (!lines.length && first) setLines([{ key: crypto.randomUUID(), barcode: first.barcode, itemName: first.name, quantity: "1", sellUnit: first.uom === "Kgs" ? "kg" : "pcs", price: first.price }]); }, [first, lines.length]);
  useEffect(() => { void fetchBranchData("SNB"); }, [fetchBranchData]);
  const updateLine = (key: string, patch: Partial<AdvanceLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const choose = (key: string, name: string) => { const item = catalogItems.find((entry) => entry.name === name); if (item) updateLine(key, { barcode: item.barcode, itemName: item.name, sellUnit: item.uom === "Kgs" ? "kg" : "pcs", price: item.price }); };
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * line.price, 0);
  const submit = async () => {
    setError(""); setSuccess(""); const advance = Number(form.advanceAmount || 0);
    if (!form.customerName.trim()) return setError("Customer name is required.");
    if (!form.deliveryDate || form.deliveryDate < todayInput()) return setError("Choose today or a future delivery date.");
    if (form.notes.trim().length < 3) return setError("Enter complete order notes.");
    if (!lines.length || lines.some((line) => Number(line.quantity) <= 0)) return setError("Add valid order quantities.");
    if (advance < 0 || advance > subtotal) return setError("Advance amount cannot exceed the order total.");
    for (const line of lines) { const live = stock.find((item) => item.itemBarcode === line.barcode || normal(item.itemName) === normal(line.itemName)); const available = Number(live?.availableQuantity ?? live?.quantity ?? 0); if (Number(line.quantity) > available) return setError(`${line.itemName}: only ${formatQty(available, live?.unit || line.sellUnit)} is available.`); }
    setSaving(true);
    const { error: saveError } = await supabase.rpc("create_snb_order_advance_order_secure", { p_customer_name: form.customerName.trim(), p_items: lines.map((line) => ({ barcode: line.barcode, itemName: line.itemName, quantity: Number(line.quantity), sellUnit: line.sellUnit, price: line.price, lineTotal: Number(line.quantity) * line.price, isCustom: false })), p_subtotal: subtotal, p_advance_amount: advance, p_advance_method: form.advanceMethod, p_delivery_date: form.deliveryDate, p_notes: form.notes.trim(), p_entered_by: `SNB Order - ${userName}` });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setSuccess(`Advance order saved. ${money(advance)} will appear to Admin as “SNB Order collected”.`);
    setForm({ customerName: "", deliveryDate: todayInput(), notes: "", advanceAmount: "", advanceMethod: "cash" });
    setLines(first ? [{ key: crypto.randomUUID(), barcode: first.barcode, itemName: first.name, quantity: "1", sellUnit: first.uom === "Kgs" ? "kg" : "pcs", price: first.price }] : []);
    await fetchBranchData("SNB");
  };

  return (
    <div className="h-full min-h-0 overflow-auto pb-3">
      <section className={cn(panelClass, "mb-3 overflow-hidden")}><button type="button" onClick={() => setShowForm((value) => !value)} className="flex w-full items-center justify-between p-3 text-left"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">SNB Order collection source</p><h2 className="font-display text-lg font-black">Take Advance Order</h2></div><span className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">{showForm ? "Hide" : "New order"}</span></button>{showForm ? <div className="border-t border-border p-3"><div className="grid gap-3 md:grid-cols-3"><Field label="Customer"><input className={inputClass} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></Field><Field label="Delivery Date"><input type="date" min={todayInput()} className={inputClass} value={form.deliveryDate} onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })} /></Field><Field label="Advance Method"><select className={inputClass} value={form.advanceMethod} onChange={(event) => setForm({ ...form, advanceMethod: event.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{lines.map((line) => { const live = stock.find((item) => item.itemBarcode === line.barcode || normal(item.itemName) === normal(line.itemName)); return <div key={line.key} className="rounded-2xl border border-border bg-slate-50 p-2.5"><div className="grid grid-cols-[minmax(0,1fr)_90px_36px] gap-2"><select className={inputClass} value={line.itemName} onChange={(event) => choose(line.key, event.target.value)}>{catalogItems.map((item) => <option key={item.barcode}>{item.name}</option>)}</select><input type="number" min="0.001" step="0.001" className={inputClass} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /><button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))} className="grid place-items-center rounded-xl bg-red-50 text-red-600 disabled:opacity-30"><X className="size-4" /></button></div><div className="mt-2 flex justify-between text-[10px] font-bold text-muted-foreground"><span>Available: {formatQty(Number(live?.availableQuantity ?? live?.quantity ?? 0), live?.unit || line.sellUnit)}</span><span>{money(Number(line.quantity || 0) * line.price)}</span></div></div>; })}</div><button type="button" onClick={() => first && setLines((current) => [...current, { key: crypto.randomUUID(), barcode: first.barcode, itemName: first.name, quantity: "1", sellUnit: first.uom === "Kgs" ? "kg" : "pcs", price: first.price }])} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-xs font-black text-muted-foreground"><Plus className="size-4" /> Add item</button><div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]"><Field label="Complete Order Notes"><textarea className={textareaClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Customer request, packing, delivery instructions" /></Field><div className="space-y-3"><Field label="Advance Collected"><input type="number" min="0" max={subtotal} step="0.01" className={inputClass} value={form.advanceAmount} onChange={(event) => setForm({ ...form, advanceAmount: event.target.value })} /></Field><div className="rounded-xl bg-amber-50 px-3 py-2 text-xs"><div className="flex justify-between font-black"><span>Total</span><span>{money(subtotal)}</span></div><div className="mt-1 flex justify-between font-bold text-amber-700"><span>Balance</span><span>{money(Math.max(0, subtotal - Number(form.advanceAmount || 0)))}</span></div></div></div></div><div className="mt-3"><StatusMessage error={error} success={success} /></div><button type="button" onClick={() => void submit()} disabled={saving} className={cn(primaryButton, "mt-3 w-full")}>{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save Advance Order</button></div> : null}</section>
      <AdvancePaymentsTab branch="SNB" advanceOrders={advanceOrders} />
    </div>
  );
}
