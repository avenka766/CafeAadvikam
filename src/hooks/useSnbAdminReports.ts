import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SnbCounterCalculatedRow = {
  counter_session_id: string;
  business_date: string;
  cashier_user_id: string | null;
  cashier_username: string | null;
  opening_cash: number | string | null;
  bill_count: number | string | null;
  gross_sales: number | string | null;
  discounts: number | string | null;
  cash_sales: number | string | null;
  upi_sales: number | string | null;
  card_sales: number | string | null;
  credit_sales: number | string | null;
  credit_collected: number | string | null;
  credit_cash_collected: number | string | null;
  credit_upi_collected: number | string | null;
  credit_card_collected: number | string | null;
  credit_bank_collected: number | string | null;
  advance_collected: number | string | null;
  advance_cash_collected: number | string | null;
  returns: number | string | null;
  cash_refunds: number | string | null;
  net_sales: number | string | null;
  expected_cash_before_outflows: number | string | null;
};

export type SnbCounterSessionRow = {
  id: string;
  branch?: string;
  business_date: string;
  cashier_user_id: string | null;
  cashier_username: string | null;
  cashier_display_name: string | null;
  opening_cash: number | string | null;
  opened_at: string;
  status: string;
  gross_sales: number | string | null;
  discounts: number | string | null;
  returns: number | string | null;
  net_sales: number | string | null;
  cash_sales: number | string | null;
  upi_sales: number | string | null;
  card_sales: number | string | null;
  credit_sales: number | string | null;
  credit_collected: number | string | null;
  advance_collected: number | string | null;
  refunds: number | string | null;
  expenses: number | string | null;
  supplier_payments: number | string | null;
  bank_deposits: number | string | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
  bill_count: number | string | null;
  notes: string | null;
  closed_at: string | null;
  closed_by_username: string | null;
  credit_cash_collected: number | string | null;
  credit_upi_collected: number | string | null;
  credit_card_collected: number | string | null;
  credit_bank_collected: number | string | null;
  advance_cash_collected: number | string | null;
  advance_upi_collected: number | string | null;
  advance_card_collected: number | string | null;
  cash_refunds: number | string | null;
};

export type SnbDailyCounterSummaryRow = {
  business_date: string;
  closed_counter_count: number | string | null;
  open_counter_count: number | string | null;
  gross_sales: number | string | null;
  discounts: number | string | null;
  returns: number | string | null;
  net_sales: number | string | null;
  cash_sales: number | string | null;
  upi_sales: number | string | null;
  card_sales: number | string | null;
  credit_sales: number | string | null;
  credit_collected: number | string | null;
  advance_collected: number | string | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
};

export type SnbCashierBillRow = {
  id: string;
  bill_no: string;
  created_at: string;
  cashier_user_id: string | null;
  cashier_username: string | null;
  counter_session_id: string | null;
  total: number | string | null;
  discount: number | string | null;
  balance: number | string | null;
  status: string | null;
};

export type SnbSalespersonBillRow = {
  bill_id: string;
  bill_no: string;
  created_at: string;
  business_date: string;
  salesperson: string | null;
  subtotal: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string | null;
  cashier_username: string | null;
  counter_session_id: string | null;
};

export type SnbItemSalesRow = {
  business_date: string;
  item_name: string;
  unit: string | null;
  quantity_sold: number | string | null;
  gross_sales: number | string | null;
  item_discount: number | string | null;
  tax: number | string | null;
  net_item_sales: number | string | null;
  bill_count: number | string | null;
};

export type SnbCategorySalesRow = {
  business_date: string;
  category: string;
  quantity_sold: number | string | null;
  gross_sales: number | string | null;
  item_discount: number | string | null;
  net_item_sales: number | string | null;
  bill_count: number | string | null;
};

export type SnbDiscountBillRow = {
  bill_id: string;
  bill_no: string;
  business_date: string;
  bill_datetime: string;
  cashier: string | null;
  salesperson: string | null;
  customer_name: string | null;
  subtotal: number | string | null;
  discount: number | string | null;
  discount_percent: number | string | null;
  tax: number | string | null;
  round_off: number | string | null;
  total: number | string | null;
  effective_discount_percent: number | string | null;
};

export type SnbSupplierOutstandingRow = {
  purchase_invoice_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  balance_amount: number | string | null;
  return_amount?: number | string | null;
  payment_method: string | null;
  sync_status: string | null;
  created_at: string;
  updated_at: string;
};

export type SnbPurchaseInvoiceRow = {
  id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number | string;
  paid_amount: number | string;
  balance_amount: number | string;
  return_amount?: number | string | null;
  payment_method: string | null;
  sync_status: string;
  synced_at: string | null;
  synced_by: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revision_number?: number | string | null;
  revision_pending?: boolean | null;
  last_edit_reason?: string | null;
  last_edited_by?: string | null;
  last_edited_at?: string | null;
  last_resynced_by?: string | null;
  last_resynced_at?: string | null;
};

export type SnbSupplierPaymentRow = {
  id: string;
  purchase_invoice_id: string | null;
  supplier_name: string;
  payment_date: string;
  amount: number | string;
  payment_method: string;
  reference_no: string | null;
  remarks: string | null;
  paid_by: string | null;
  paid_by_user_id: string | null;
  counter_session_id: string | null;
  payment_batch_id: string | null;
  batch_total: number | string | null;
  allocation_order: number | string | null;
  created_at: string;
};

export type SnbPurchaseReturnRow = {
  id: string;
  return_no: string;
  purchase_invoice_id: string;
  supplier_name: string;
  invoice_number: string;
  return_date: string;
  reason_type: string;
  settlement_type: string;
  credit_note_no: string | null;
  reference_no: string | null;
  remarks: string;
  total_amount: number | string;
  entered_by: string;
  status: string;
  created_at: string;
};

export type SnbPurchaseReturnItemRow = {
  id: string;
  purchase_return_id: string;
  purchase_invoice_item_id: string;
  item_name: string;
  quantity: number | string;
  unit: string;
  rate: number | string;
  tax: number | string;
  discount: number | string;
  line_total: number | string;
  item_reason: string;
  batch_no: string | null;
  expiry_date: string | null;
  stock_before: number | string;
  stock_after: number | string;
  created_at: string;
};

type ReportState = {
  counterTotals: SnbCounterCalculatedRow[];
  counterSessions: SnbCounterSessionRow[];
  dailySummary: SnbDailyCounterSummaryRow[];
  cashierBills: SnbCashierBillRow[];
  salespersonBills: SnbSalespersonBillRow[];
  itemSales: SnbItemSalesRow[];
  categorySales: SnbCategorySalesRow[];
  discountBills: SnbDiscountBillRow[];
  supplierOutstanding: SnbSupplierOutstandingRow[];
  purchaseInvoices: SnbPurchaseInvoiceRow[];
  supplierPayments: SnbSupplierPaymentRow[];
  purchaseReturns: SnbPurchaseReturnRow[];
  purchaseReturnItems: SnbPurchaseReturnItemRow[];
};

type SnbPurchaseWorkflowSnapshot = {
  purchaseInvoices: SnbPurchaseInvoiceRow[];
  supplierOutstanding: SnbSupplierOutstandingRow[];
  supplierPayments: SnbSupplierPaymentRow[];
  purchaseReturns: SnbPurchaseReturnRow[];
  purchaseReturnItems: SnbPurchaseReturnItemRow[];
};

const EMPTY: ReportState = {
  counterTotals: [],
  counterSessions: [],
  dailySummary: [],
  cashierBills: [],
  salespersonBills: [],
  itemSales: [],
  categorySales: [],
  discountBills: [],
  supplierOutstanding: [],
  purchaseInvoices: [],
  supplierPayments: [],
  purchaseReturns: [],
  purchaseReturnItems: [],
};

async function fetchPaged(
  table: string,
  options: {
    dateColumn?: string;
    fromDate?: string;
    toDate?: string;
    orderColumn?: string;
    branchColumn?: string;
  } = {},
) {
  const pageSize = 1000;
  const maxRows = 30000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase.from(table).select("*");
    if (options.branchColumn) query = query.eq(options.branchColumn, "SNB");
    if (options.dateColumn && options.fromDate) query = query.gte(options.dateColumn, options.fromDate);
    if (options.dateColumn && options.toDate) query = query.lte(options.dateColumn, options.toDate);
    if (options.orderColumn) query = query.order(options.orderColumn, { ascending: false });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function rowsFromPayload<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function fetchSnbPurchaseWorkflowSnapshot(
  fromDate: string,
  toDate: string,
): Promise<SnbPurchaseWorkflowSnapshot> {
  const { data, error } = await supabase.rpc("get_snb_purchase_workflow_data", {
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw new Error(`get_snb_purchase_workflow_data: ${error.message}`);
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    purchaseInvoices: rowsFromPayload<SnbPurchaseInvoiceRow>(payload.purchaseInvoices),
    supplierOutstanding: rowsFromPayload<SnbSupplierOutstandingRow>(payload.supplierOutstanding),
    supplierPayments: rowsFromPayload<SnbSupplierPaymentRow>(payload.supplierPayments),
    purchaseReturns: rowsFromPayload<SnbPurchaseReturnRow>(payload.purchaseReturns),
    purchaseReturnItems: rowsFromPayload<SnbPurchaseReturnItemRow>(payload.purchaseReturnItems),
  };
}

function mergeRows<T>(
  groups: T[][],
  keyFor: (row: T) => string,
): T[] {
  const merged = new Map<string, T>();
  groups.flat().forEach((row, index) => {
    const key = keyFor(row) || `row:${index}`;
    merged.set(key, row);
  });
  return Array.from(merged.values());
}

function isMissingOptionalWorkflowRpc(message: string) {
  return /get_snb_purchase_workflow_data|could not find the function|schema cache|does not exist/i.test(message);
}

export function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function useSnbAdminReports(fromDate: string, toDate: string) {
  const [data, setData] = useState<ReportState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  // Guards against out-of-order responses: if the user changes the date range
  // (e.g. "7 Days" then quickly "Custom" one day) before the first, slower
  // request finishes, the earlier request's result must never overwrite the
  // later one. Each refresh() call gets a ticket; only the most recent
  // ticket's response is applied to state.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    const range = { fromDate, toDate };
    const results = await Promise.allSettled([
      fetchPaged("snb_counter_calculated_totals", { ...range, dateColumn: "business_date", orderColumn: "business_date" }),
      fetchPaged("branch_counter_sessions", { ...range, dateColumn: "business_date", orderColumn: "opened_at", branchColumn: "branch" }),
      fetchPaged("snb_daily_counter_summary", { ...range, dateColumn: "business_date", orderColumn: "business_date" }),
      fetchPaged("snb_cashier_bill_report", { ...range, dateColumn: "created_at", orderColumn: "created_at" }),
      fetchPaged("snb_salesperson_bill_report", { ...range, dateColumn: "business_date", orderColumn: "created_at" }),
      fetchPaged("snb_item_wise_sales_report", { ...range, dateColumn: "business_date", orderColumn: "business_date" }),
      fetchPaged("snb_category_wise_sales_report", { ...range, dateColumn: "business_date", orderColumn: "business_date" }),
      fetchPaged("snb_bill_discount_report", { ...range, dateColumn: "business_date", orderColumn: "bill_datetime" }),
      fetchPaged("snb_supplier_outstanding_report", { orderColumn: "created_at" }),
      fetchPaged("snb_purchase_invoices", { orderColumn: "created_at" }),
      fetchPaged("snb_supplier_payments", { ...range, dateColumn: "payment_date", orderColumn: "payment_date" }),
      fetchPaged("snb_purchase_returns", { ...range, dateColumn: "return_date", orderColumn: "created_at" }),
      fetchPaged("snb_purchase_return_items", { orderColumn: "created_at" }),
      fetchSnbPurchaseWorkflowSnapshot(fromDate, toDate),
    ]);

    const workflowResult = results[13];
    const workflow = workflowResult.status === "fulfilled"
      ? workflowResult.value as SnbPurchaseWorkflowSnapshot
      : null;
    const errors = results
      .slice(0, 13)
      .flatMap((result, index) => {
        if (result.status !== "rejected") return [];
        if (workflow && index >= 8 && index <= 12) return [];
        if (index === 8 && results[9].status === "fulfilled") return [];
        return [result.reason instanceof Error ? result.reason.message : String(result.reason)];
      });
    const rows = (index: number) => results[index].status === "fulfilled" ? results[index].value : [];
    if (workflowResult.status === "rejected") {
      const workflowError = workflowResult.reason instanceof Error
        ? workflowResult.reason.message
        : String(workflowResult.reason);
      const directPurchaseSourcesFailed = results[8].status === "rejected" || results[9].status === "rejected";
      if (directPurchaseSourcesFailed && !isMissingOptionalWorkflowRpc(workflowError)) errors.push(workflowError);
    }

    const purchaseInvoices = mergeRows<SnbPurchaseInvoiceRow>([
      rows(9) as SnbPurchaseInvoiceRow[],
      workflow?.purchaseInvoices ?? [],
    ], (row) => String(row.id || `${row.supplier_name}|${row.invoice_number}`));
    const derivedOutstanding = purchaseInvoices.map((invoice) => ({
      purchase_invoice_id: invoice.id,
      supplier_name: invoice.supplier_name,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total_amount: invoice.total_amount,
      paid_amount: invoice.paid_amount,
      balance_amount: invoice.balance_amount,
      return_amount: invoice.return_amount,
      payment_method: invoice.payment_method,
      sync_status: invoice.sync_status,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    } satisfies SnbSupplierOutstandingRow));
    const supplierOutstanding = mergeRows<SnbSupplierOutstandingRow>([
      derivedOutstanding,
      rows(8) as SnbSupplierOutstandingRow[],
      workflow?.supplierOutstanding ?? [],
    ], (row) => String(row.purchase_invoice_id || `${row.supplier_name}|${row.invoice_number}`));
    const supplierPayments = mergeRows<SnbSupplierPaymentRow>([
      rows(10) as SnbSupplierPaymentRow[],
      workflow?.supplierPayments ?? [],
    ], (row) => String(row.id || `${row.payment_batch_id}|${row.purchase_invoice_id}|${row.payment_date}`));
    const purchaseReturns = mergeRows<SnbPurchaseReturnRow>([
      rows(11) as SnbPurchaseReturnRow[],
      workflow?.purchaseReturns ?? [],
    ], (row) => String(row.id || row.return_no));
    const purchaseReturnItems = mergeRows<SnbPurchaseReturnItemRow>([
      rows(12) as SnbPurchaseReturnItemRow[],
      workflow?.purchaseReturnItems ?? [],
    ], (row) => String(row.id || `${row.purchase_return_id}|${row.purchase_invoice_item_id}`));

    // A newer refresh() started while this one was in flight — discard this
    // stale result instead of letting it overwrite fresher data.
    if (requestId !== requestIdRef.current) return;

    setData({
      counterTotals: rows(0) as SnbCounterCalculatedRow[],
      counterSessions: rows(1) as SnbCounterSessionRow[],
      dailySummary: rows(2) as SnbDailyCounterSummaryRow[],
      cashierBills: rows(3) as SnbCashierBillRow[],
      salespersonBills: rows(4) as SnbSalespersonBillRow[],
      itemSales: rows(5) as SnbItemSalesRow[],
      categorySales: rows(6) as SnbCategorySalesRow[],
      discountBills: rows(7) as SnbDiscountBillRow[],
      supplierOutstanding,
      purchaseInvoices,
      supplierPayments,
      purchaseReturns,
      purchaseReturnItems,
    });
    setError(errors.join(" | "));
    setRefreshedAt(new Date().toISOString());
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasDatabaseReports = useMemo(
    () => Object.values(data).some((rows) => rows.length > 0),
    [data],
  );

  return { ...data, loading, error, refreshedAt, refresh, hasDatabaseReports };
}
