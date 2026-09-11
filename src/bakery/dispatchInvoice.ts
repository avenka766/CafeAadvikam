// src/bakery/dispatchInvoice.ts
// Shared invoice + checklist generation for the Planner Dispatch tab's new
// review-before-dispatch flow (2026-08-08 workflow change): selecting items
// and clicking "Dispatch" no longer writes straight to the branch's own
// order dashboard (branch_incoming). It opens a review modal (checklist +
// price/discount entry) — the actual dispatch + branch_incoming write only
// happens once the planner confirms there, and confirming also generates and
// stores this invoice so it can be reprinted later (batch-wise, under
// dispatch_invoices).
//
// Invoice layout matches the reference "TAX INVOICE" format the owner
// supplied (Sn/Item Name/Qty/Rate/Amount table, Total row, Discount,
// Round-Off, Net Bill Amount, Payment Details box) — reusing the same
// business letterhead blocks already proven in branch/printUtils.ts's
// printSnbCounterBill (SNB) and the VRSNB FOODS LLP block from
// printVrsnbReceiptBill (VRSNB / Hosur), so every invoice in the app carries
// the same real company details rather than inventing new ones.
import { supabase, fetchAllRows } from '@/lib/supabase';
import { getAppSessionToken } from '@/lib/appSession';
import { printViaIframe } from '@/lib/printViaIframe';
import type { Branch } from './types';
import { clampQtyForUnit } from './bakeryStore';
import { jsPDF } from 'jspdf';

export interface DispatchInvoiceItem {
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // FEATURE (2026-08-10): "if we add the item and it is not in the
  // dispatched item then it should get marked as extra item" — set on a line
  // added through the bill-edit flow (updateDispatchInvoice below) that
  // wasn't part of the original dispatch. Purely a display flag on the
  // invoice itself (the real "extra" bookkeeping — the Closing Stock ledger
  // entry and dispatch_log entry backing it — is tagged isExtra separately,
  // same as every other extra-item path in the app).
  isExtra?: boolean;
  // FEATURE (2026-09-05): "even if they check the tax invoice box the GST
  // is not getting calculated" — root cause: this printed invoice (the one
  // the checkbox's title actually appears on) never had a tax breakdown at
  // all; the real CGST/SGST/IGST math only ever showed up on a completely
  // separate "GST Tax Invoice (A4)" document the client may never open.
  // Carrying each line's own HSN/GST% here lets renderDispatchInvoiceHtml
  // compute and print the same tax breakdown directly on THIS invoice
  // whenever isGstInvoice is true — set only by callers offering the GST
  // checkbox (see gstLineFor in PlannerDashboard.tsx); undefined/0 for
  // every non-GST dispatch, same as before.
  hsnCode?: string;
  gstPct?: number;
}

// FEATURE (2026-09-03): 'Cake' added as a genuinely separate scope — cake
// dispatches used to be saved under scope 'SNB' (or whichever branch the
// order belonged to), mixing them into that branch's own invoice list/
// sequence. Now cakes get their own scope, their own invoice sequence
// (Cake/26-27/N — see nextDispatchInvoiceNo below), and are excluded from
// the SNB/VRSNB tabs entirely just by virtue of not being scope 'SNB'/'VRSNB'
// any more — no separate filtering needed anywhere that already filters by
// scope.
export type DispatchInvoiceScope = Branch | 'Cake'; // 'VRSNB' | 'SNB' | 'Hosur' | 'Cake'

export interface DispatchInvoiceBusiness {
  name: string;
  lines: string[];
  gstin: string;
  fssai?: string;
}

const SNB_BUSINESS: DispatchInvoiceBusiness = {
  name: 'Sri Nanjundeshwara Bakery',
  lines: ['404, Bagalur Main Road, Berigai Bus Stand, Berigai, Shoolagiri Taluk', 'Krishnagiri, Tamil Nadu, Hosur-635105', 'Phone: 9942266779, 9095445444'],
  gstin: '33AMTPR1760M1ZE',
};

// Same legal entity used for both VRSNB and Hosur wholesale/shop invoices —
// matches the owner-supplied reference invoice exactly (VRSNB FOODS LLP
// letterhead was used there for a Hosur shop's credit bill).
const VRSNB_FOODS_BUSINESS: DispatchInvoiceBusiness = {
  name: 'VRSNB FOODS LLP - HO',
  lines: ['109/1C, Bagalur Main Road, Berigai', 'Hosur-635105', 'Phone: 9095445444'],
  gstin: '33AAZFV1266C1ZZ',
  fssai: '12425011000098',
};

export function businessFor(scope: DispatchInvoiceScope): DispatchInvoiceBusiness {
  // SIMPLIFICATION (2026-09-03): a cake dispatch can, in principle, belong to
  // either SNB or VRSNB (see PackingCakeOrdersTab.tsx's per-branch grouping),
  // but the letterhead choice isn't worth threading a second "real source
  // branch" field through the invoice record for — in practice virtually
  // every cake order is SNB-attributed, so 'Cake' prints SNB's letterhead.
  // Revisit if VRSNB-branded cake invoices turn out to matter.
  return scope === 'SNB' || scope === 'Cake' ? SNB_BUSINESS : VRSNB_FOODS_BUSINESS;
}

// Default discount policy (2026-08-08): only SNB's catalog prices are
// pre-discount, so only SNB gets a real default discount. VRSNB's catalog
// prices are already the sell price and Hosur's shop price lists are already
// discounted — both default to 0% so nothing gets double-discounted. Cake
// pricing (2026-09-03) is a fixed per-order value, not a catalog price, so
// it defaults to 0% too. All remain editable per invoice.
export function defaultDiscountPct(scope: DispatchInvoiceScope): number {
  return scope === 'SNB' ? 15 : 0;
}

export async function nextDispatchInvoiceNo(scope: DispatchInvoiceScope): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_dispatch_invoice_number', { p_scope: scope });
  if (error || !data) {
    // FEATURE (2026-09-03): "SNB/VRSNB -> TO/26-27/N (shared), Hosur -> same
    // SALES/26-27/N sequence as the Sales tab, Cake -> its own Cake/26-27/N"
    // — the RPC (get_next_dispatch_invoice_number) is the real counter; this
    // only fires if that call itself failed, so it can't reproduce a real
    // sequence number — it just keeps the SAME prefix/FY shape (millisecond
    // suffix instead of a real count) so a rare fallback invoice still reads
    // consistently with the rest, rather than reverting to an unrelated
    // date-stamp format. Mirrors the RPC's own prefix mapping exactly.
    const now = new Date();
    const prefix = scope === 'SNB' || scope === 'VRSNB' ? 'TO' : scope === 'Hosur' ? 'SALES' : scope;
    const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = `${String(fyStartYear % 100).padStart(2, '0')}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
    return `${prefix}/${fy}/${String(now.getTime()).slice(-4)}`;
  }
  return String(data);
}

export interface DispatchInvoiceRecord {
  id: string;
  invoiceNo: string;
  scope: DispatchInvoiceScope;
  hosurShopId: string | null;
  hosurShopName: string | null;
  hosurShopPhone: string | null;
  // FEATURE (2026-08-09): "Custom" dispatch of planning-stock items direct to
  // a walk-in customer (no branch involved) — the planner enters these three
  // fields at dispatch time instead of picking a branch/shop. When set, the
  // printed invoice/checklist shows this customer's details instead of the
  // branch/shop line.
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  dispatchedBy: string;
  items: DispatchInvoiceItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  roundOff: number;
  total: number;
  // FEATURE (2026-08-09): "Sample Bill" — a bill created for a Billing
  // (Walk-in) customer before they've actually paid. 'unpaid' until the
  // planner hits "Mark as Paid" (see markDispatchInvoicePaid below), which is
  // the moment stock actually gets deducted. Every other invoice in this
  // table (branch/shop/custom-sale dispatch) is created at the moment goods
  // physically leave, so it defaults to already-'paid'.
  status: 'paid' | 'unpaid' | 'cancelled';
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  // Exposed (2026-08-10) so updateDispatchInvoice can trace each invoice
  // line back to the real dispatch_log entry it came from — see that
  // function's comment for why this lookup is the safest way to edit a bill
  // without duplicating submitDispatch/deleteDispatchEntry's stock logic.
  dispatchEntryIds: { orderId: string; dispatchEntryId: string }[];
  // FEATURE (2026-09-05): "only if we check the invoice box should the bill
  // be called tax invoice, or else just invoice — for SNB, VRSNB and all"
  // — this printed document (renderDispatchInvoiceHtml below) previously
  // always titled itself "TAX INVOICE" regardless of whether the separate
  // GST Tax Invoice checkbox (gstEnabled in PlannerDashboard.tsx) was ever
  // checked for this transaction — misleading for the vast majority of
  // dispatches (SNB/VRSNB/Cake/most Hosur/Custom) that never check it and
  // carry no real GST breakdown. Captured once at save time from whichever
  // caller's own checkbox state applies; defaults false for every scope
  // that never offers the checkbox at all.
  isGstInvoice: boolean;
  // 'intra' -> CGST+SGST split, 'inter' -> IGST — same field the separate
  // GST Tax Invoice document already uses (gstSupplyType). Only meaningful
  // when isGstInvoice is true; defaults 'intra'.
  gstSupplyType: 'intra' | 'inter';
  // FEATURE (2026-09-06): "add a cancel button ... invoice should be
  // cancelled" — set only when status === 'cancelled', by cancelDispatchInvoice
  // below. null for every invoice that's never been cancelled.
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  // FEATURE (2026-09-06): "add a Return sub tab ... invoice should clearly
  // show the return items and quantity and already sent items" — a return is
  // implemented as a normal updateDispatchInvoice() quantity-reduction (same
  // stock-reversal engine cancel/edit already use), but that alone leaves no
  // trace distinguishing "this bill was corrected" from "the customer
  // returned goods". originalItems is a one-time snapshot of `items` taken
  // the FIRST time a return is ever applied (stays null forever otherwise);
  // returnLog is the full per-event audit trail (who/when/why/what). Both are
  // purely additive — every existing reader of `items`/`total` etc. is
  // unaffected, since a return still recomputes those exactly like any other
  // bill edit.
  originalItems: DispatchInvoiceItem[] | null;
  returnLog: { at: string; by: string; reason: string | null; items: { itemName: string; unit: string; qty: number }[] }[];
  // FEATURE (2026-09-08): "Advance Sales — the invoice should include total
  // amount, advance amount and payable amount, plus a delivery date" — these
  // are only ever set by advanceSaleToInvoiceRecord() below; every other
  // invoice source (dispatch, walk-in bill, return) leaves them null/undefined
  // and renderDispatchInvoiceHtml's summary/header stay exactly as before.
  advanceAmount?: number | null;
  balanceAmount?: number | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
}

export async function saveDispatchInvoice(input: {
  scope: DispatchInvoiceScope;
  hosurShopId?: string | null;
  hosurShopName?: string | null;
  hosurShopPhone?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  dispatchedBy: string;
  items: DispatchInvoiceItem[];
  discountPct: number;
  dispatchEntryIds?: { orderId: string; dispatchEntryId: string }[];
  status?: 'paid' | 'unpaid';
  notes?: string | null;
  // FEATURE (2026-09-01): "New Bill and Sample Bill should both use the
  // same [SALES/26-27/N] numbering" — Sample Bill reuses this function
  // purely for its ready-made invoice-record/reprint infrastructure, but
  // its invoice number needs to come from the shared Sales sequence
  // (next_sales_bill_number), not this branch's own dispatch sequence.
  // Prefer `numberScope` (generates atomically inside the same save —
  // pass 'Hosur' to route to the shared SALES/26-27/N sequence while
  // `scope` stays 'SNB'/'VRSNB' purely for the letterhead). `invoiceNo` is
  // still accepted for a caller that already has a real, already-saved
  // number (e.g. reusing one from elsewhere) — but do NOT fetch a fresh
  // number yourself before calling this function; that recreates the
  // exact "number burned, insert fails, no row" gap this was built to
  // close (see project_dispatch_invoice_number_gap_bug memory — confirmed
  // live on SALES/26-27/73, /74).
  invoiceNo?: string;
  numberScope?: DispatchInvoiceScope;
  // See DispatchInvoiceRecord.isGstInvoice — defaults false (plain "INVOICE").
  isGstInvoice?: boolean;
  gstSupplyType?: 'intra' | 'inter';
}): Promise<DispatchInvoiceRecord> {
  // AUDIT FIX (2026-09-02): discountPct is planner-entered and, until now, was
  // trusted verbatim with no bound in either direction — a stray value (typo,
  // bad state, or a compromised session) could zero out or invert a real
  // dispatch invoice. Clamped here so this single choke point protects every
  // caller; the DB now also enforces the same 0-100 range as a hard backstop
  // (dispatch_invoices_discount_pct_range constraint) in case a future write
  // path bypasses this function entirely.
  const safeDiscountPct = Math.min(100, Math.max(0, input.discountPct || 0));
  const subtotal = Math.round(input.items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const discountAmount = Math.round(subtotal * (safeDiscountPct / 100) * 100) / 100;
  const preRound = subtotal - discountAmount;
  const total = Math.round(preRound);
  const roundOff = Math.round((total - preRound) * 100) / 100;
  const status = input.status ?? 'paid';

  // BUG FIX (2026-09-11): "TO/26-27/66 unable to see bill its missing" — this
  // used to call nextDispatchInvoiceNo() (its own committed transaction,
  // burning the sequence number) and then a SEPARATE .insert() — the real
  // goods dispatch already happened before either step (see the caller,
  // DispatchReviewModal.confirm), so any failure on the insert alone
  // (network blip, tab closed, a bad field) left a permanently burned
  // invoice number with NO invoice row and no paper trail for goods that
  // genuinely went out. Confirmed live on TO/26-27/66. One RPC call now does
  // the number generation (when input.invoiceNo isn't already supplied by
  // the caller) AND the insert in a single transaction — a failed insert
  // rolls the number back too, instead of silently skipping it.
  const { data, error } = await supabase.rpc('save_dispatch_invoice_secure', {
    p_scope: input.scope,
    p_hosur_shop_id: input.hosurShopId ?? null,
    p_hosur_shop_name: input.hosurShopName ?? null,
    p_hosur_shop_phone: input.hosurShopPhone ?? null,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_customer_address: input.customerAddress ?? null,
    p_dispatched_by: input.dispatchedBy,
    p_items: input.items,
    p_subtotal: subtotal,
    p_discount_pct: safeDiscountPct,
    p_discount_amount: discountAmount,
    p_round_off: roundOff,
    p_total: total,
    p_dispatch_entry_ids: input.dispatchEntryIds ?? [],
    p_status: status,
    p_notes: input.notes ?? null,
    p_is_gst_invoice: input.isGstInvoice ?? false,
    p_gst_supply_type: input.gstSupplyType ?? 'intra',
    p_invoice_no: input.invoiceNo ?? null,
    p_number_scope: input.numberScope ?? null,
  }).single();
  if (error) throw error;
  const row = data as { id: string; invoice_no: string; created_at: string; paid_at: string | null };
  const invoiceNo = row.invoice_no;

  return {
    id: row.id,
    invoiceNo,
    scope: input.scope,
    hosurShopId: input.hosurShopId ?? null,
    hosurShopName: input.hosurShopName ?? null,
    hosurShopPhone: input.hosurShopPhone ?? null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    customerAddress: input.customerAddress ?? null,
    dispatchedBy: input.dispatchedBy,
    items: input.items,
    subtotal,
    discountPct: safeDiscountPct,
    discountAmount,
    roundOff,
    total,
    status,
    paidAt: row.paid_at ?? null,
    notes: input.notes ?? null,
    createdAt: row.created_at,
    dispatchEntryIds: input.dispatchEntryIds ?? [],
    isGstInvoice: input.isGstInvoice ?? false,
    gstSupplyType: input.gstSupplyType ?? 'intra',
    cancelledBy: null,
    cancelledAt: null,
    cancelledReason: null,
    originalItems: null,
    returnLog: [],
  };
}

// FEATURE (2026-08-09): the moment a Sample Bill actually gets paid — flips
// it to 'paid' and, only now, debits the Closing Stock pool for every item
// on it (mirrors submitDispatch's own debit: non-fatal, allowed to go
// negative rather than ever blocking the sale). Tagged in the Movement Log
// as "Sales Online" per the owner's explicit ask, distinguishing it from a
// regular Billing (Walk-in) sale that deducts stock immediately at creation.
export async function markDispatchInvoicePaid(record: DispatchInvoiceRecord, recordedBy: string): Promise<{ ok: true } | { error: string }> {
  if (record.status === 'paid') return { ok: true };
  const paidAt = new Date().toISOString();
  const { error } = await supabase.from('dispatch_invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', record.id);
  if (error) return { error: error.message };

  const { recordLeftoverMovement, kolkataToday } = await import('./PlannerLeftoverTab');
  for (const item of record.items) {
    try {
      const result = await recordLeftoverMovement({
        itemName: item.itemName,
        unit: item.unit === 'pcs' ? 'pcs' : 'kg',
        delta: -Math.abs(item.quantity),
        businessDate: kolkataToday(),
        reason: 'dispatch',
        recordedBy,
        notes: `Sales Online — Sample Bill ${record.invoiceNo}${record.customerName ? ` — ${record.customerName}` : ''}`,
      });
      if ('error' in result) {
        console.error('[markDispatchInvoicePaid] Closing Stock pool debit failed:', result.error);
      }
    } catch (err) {
      console.error('[markDispatchInvoicePaid] Closing Stock pool debit threw:', err);
    }
  }
  return { ok: true };
}

// Sales (New Bill / Sample Bill, bakery_walkin_bills) shares dispatch
// invoices' printed template but not its table — these three moved here
// (2026-09-03, previously PlannerDashboard.tsx-local) so Admin's Dispatch
// Details tab can render/print Sales rows through the identical invoice
// template without importing that whole page module.
export interface WalkinBillItem { itemName: string; unit: string; price: number; quantity: number; lineTotal: number; hsnCode?: string; gstPct?: number }
export interface WalkinBillRow {
  id: string; billNo: string; items: WalkinBillItem[]; subtotal: number;
  discountType: 'none' | 'percent' | 'amount'; discountValue: number; discountAmount: number; total: number;
  paymentMode: string; cashierName: string | null; status: 'active' | 'cancelled'; createdAt: string;
  customerName: string | null; customerMobile: string | null;
  isGstInvoice: boolean;
  gstSupplyType: 'intra' | 'inter';
  cancelledAt: string | null;
  cancelledReason: string | null;
}

export function mapWalkinBill(d: Record<string, unknown>): WalkinBillRow {
  return {
    id: d.id as string, billNo: d.bill_no as string,
    items: Array.isArray(d.items) ? (d.items as WalkinBillItem[]) : [],
    subtotal: Number(d.subtotal) || 0,
    discountType: (d.discount_type as WalkinBillRow['discountType']) || 'none',
    discountValue: Number(d.discount_value) || 0,
    discountAmount: Number(d.discount_amount) || 0,
    total: Number(d.total) || 0,
    paymentMode: (d.payment_mode as string) || 'cash',
    cashierName: (d.cashier_name as string | null) ?? null,
    status: (d.status as WalkinBillRow['status']) || 'active',
    createdAt: d.created_at as string,
    customerName: (d.customer_name as string | null) ?? null,
    customerMobile: (d.customer_mobile as string | null) ?? null,
    isGstInvoice: Boolean(d.is_gst_invoice),
    gstSupplyType: (d.gst_supply_type as 'intra' | 'inter' | null) ?? 'intra',
    cancelledAt: (d.cancelled_at as string | null) ?? null,
    cancelledReason: (d.cancelled_reason as string | null) ?? null,
  };
}

// BUG FIX (2026-09-11): "SALES/26-27/73 and /74 missing" — New Bill's own
// saveBill (PlannerDashboard.tsx BillingTab) used to call next_sales_bill_number()
// (its own committed RPC, burning the number) and then a SEPARATE
// bakery_walkin_bills insert — the exact same gap shape as
// save_dispatch_invoice_secure was built to close, just for this table
// instead. #73/#74 had zero recoverable trace (a walk-in bill isn't linked
// to any order/dispatch_log, unlike a branch dispatch) — could not be
// backfilled, only explained. This RPC does the number + insert atomically.
export async function saveWalkinBillSecure(input: {
  items: WalkinBillItem[];
  subtotal: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  discountAmount: number;
  total: number;
  paymentMode: string;
  cashierName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  isGstInvoice?: boolean;
  gstSupplyType?: 'intra' | 'inter';
}): Promise<WalkinBillRow> {
  const { data, error } = await supabase.rpc('save_walkin_bill_secure', {
    p_items: input.items,
    p_subtotal: input.subtotal,
    p_discount_type: input.discountType,
    p_discount_value: input.discountValue,
    p_discount_amount: input.discountAmount,
    p_total: input.total,
    p_payment_mode: input.paymentMode,
    p_cashier_name: input.cashierName,
    p_customer_name: input.customerName,
    p_customer_mobile: input.customerMobile,
    p_is_gst_invoice: input.isGstInvoice ?? false,
    p_gst_supply_type: input.gstSupplyType ?? 'intra',
  }).single();
  if (error) throw error;
  return mapWalkinBill(data as Record<string, unknown>);
}

// WORKFLOW CHANGE (2026-08-09): "All bills in this dashboard should use a
// standard format, sourced from the Dispatch tab's invoice format" — adapts
// the saved bakery_walkin_bills row into the same DispatchInvoiceRecord
// shape so it renders through the identical renderDispatchInvoiceHtml
// template as every other invoice in the app.
export function walkinBillToInvoiceRecord(bill: WalkinBillRow): DispatchInvoiceRecord {
  return {
    id: bill.id,
    invoiceNo: bill.billNo,
    // BUG FIX (2026-09-10): "Sales tab invoices use Sri Nanjundeshwara
    // Bakery as the title — should be VRSNB FOODS LLP." This was hardcoded
    // to 'SNB' purely to pick a letterhead (businessFor()); scope has no
    // other effect here since a walk-in bill isn't a real dispatch_invoices
    // row (bakery_walkin_bills has no scope column of its own — this object
    // is only ever built in-memory, right before printing).
    scope: 'VRSNB',
    hosurShopId: null, hosurShopName: null, hosurShopPhone: null,
    customerName: bill.customerName || 'Walk-in Customer',
    customerPhone: bill.customerMobile,
    customerAddress: null,
    dispatchedBy: bill.cashierName || 'Planner',
    items: bill.items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: i.price, lineTotal: i.lineTotal, hsnCode: i.hsnCode, gstPct: i.gstPct })),
    subtotal: bill.subtotal,
    discountPct: bill.discountType === 'percent' ? bill.discountValue : 0,
    discountAmount: bill.discountAmount,
    roundOff: 0,
    total: bill.total,
    // BUG FIX (2026-09-06): this used to hardcode 'paid' regardless of the
    // bill's real status — a cancelled Sales bill (see cancelBill in
    // PlannerDashboard.tsx) would silently reprint as a normal paid invoice
    // with no indication it had been cancelled at all.
    status: bill.status === 'cancelled' ? 'cancelled' : 'paid',
    paidAt: bill.createdAt,
    notes: `Walk-in Bill · Payment: ${bill.paymentMode.toUpperCase()}`,
    createdAt: bill.createdAt,
    dispatchEntryIds: [], // not a real dispatch — nothing to trace back to
    isGstInvoice: bill.isGstInvoice,
    gstSupplyType: bill.gstSupplyType,
    cancelledBy: null, // bakery_walkin_bills doesn't track who cancelled it
    cancelledAt: bill.cancelledAt,
    cancelledReason: bill.cancelledReason,
    originalItems: null, // Sales bills aren't part of the Return feature (dispatch_invoices only)
    returnLog: [],
  };
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Renders the TAX INVOICE layout (matches the owner-supplied reference
// image) — same content for A4 and thermal, just different @page size and
// font scale, same as every other print helper in this app.
export function renderDispatchInvoiceHtml(record: DispatchInvoiceRecord, mode: 'a4' | 'thermal'): string {
  const business = businessFor(record.scope);
  const createdAt = new Date(record.createdAt);
  const dateStr = createdAt.toLocaleDateString('en-GB');
  const timeStr = createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const customerLine = record.customerName
    ? `${esc(record.customerName)}${record.customerPhone ? ` ${esc(record.customerPhone)}` : ''}`
    : record.scope === 'Hosur'
    ? `${esc(record.hosurShopName || 'Hosur Shop')}${record.hosurShopPhone ? ` ${esc(record.hosurShopPhone)}` : ''}`
    : `${esc(record.scope)} Branch`;
  const addressLine = record.customerName && record.customerAddress ? `<div class="row small"><span>${esc(record.customerAddress)}</span></div>` : '';
  // BUG FIX (2026-09-10): "other charges getting added with the item list —
  // should be mentioned separately, and the quantity should not be shown."
  // A named charge (Delivery Fee, Transportation, ...) is modeled as an item
  // with unit:'charge', quantity 1 (see BillingTab/DispatchReviewModal) so
  // every existing subtotal/discount/total calculation just sums lineTotal
  // without special-casing it — but that meant it also printed as a literal
  // row in the Sn/Item Name/Qty/Rate/Amount table, with a quantity ("1")
  // that means nothing for a charge, AND got counted into "Total Qty" at the
  // bottom of that table (inflating it — e.g. 36 real items + 1 charge
  // showing as "Total Qty: 37"). Split charge lines out of the item table
  // entirely; they print in their own section below instead (see chargesHtml).
  const chargeItems = record.items.filter(i => i.unit === 'charge');
  const totalQty = record.items.filter(i => i.unit !== 'charge').reduce((s, i) => s + i.quantity, 0);

  // BUG FIX (2026-09-05): "even if they check the tax invoice box the GST
  // is not getting calculated for the items" — this invoice (the one whose
  // title the checkbox actually controls) never computed or showed any tax
  // at all; the real CGST/SGST/IGST math only ever lived on a completely
  // separate "GST Tax Invoice" print button the client may never open.
  // Treats each line's rate as tax-INCLUSIVE (extracts tax from within the
  // already-charged, post-discount amount) rather than adding tax on top —
  // record.total (what's actually billed/collected in the credit ledger)
  // must stay exactly what it already is; GST here is a compliance
  // breakdown of that same amount, not a second, larger total.
  const isGst = record.isGstInvoice;
  const discountMult = 1 - (record.discountPct || 0) / 100;
  const gstLineCalc = isGst ? record.items.map((i) => {
    const gstPct = Math.max(0, Number(i.gstPct) || 0);
    const chargedAmount = Math.round(i.lineTotal * discountMult * 100) / 100;
    const taxableValue = gstPct > 0 ? Math.round((chargedAmount / (1 + gstPct / 100)) * 100) / 100 : chargedAmount;
    const taxAmount = Math.round((chargedAmount - taxableValue) * 100) / 100;
    const cgstAmt = record.gstSupplyType === 'intra' ? Math.round((taxAmount / 2) * 100) / 100 : 0;
    const sgstAmt = record.gstSupplyType === 'intra' ? Math.round((taxAmount - cgstAmt) * 100) / 100 : 0;
    const igstAmt = record.gstSupplyType === 'inter' ? taxAmount : 0;
    return { hsnCode: (i.hsnCode || '').trim(), gstPct, taxableValue, cgstAmt, sgstAmt, igstAmt, taxAmount };
  }) : [];
  const gstByRate = new Map<number, { taxableValue: number; cgstAmt: number; sgstAmt: number; igstAmt: number; hsnCodes: Set<string> }>();
  gstLineCalc.forEach((l) => {
    const row = gstByRate.get(l.gstPct) ?? { taxableValue: 0, cgstAmt: 0, sgstAmt: 0, igstAmt: 0, hsnCodes: new Set<string>() };
    row.taxableValue += l.taxableValue; row.cgstAmt += l.cgstAmt; row.sgstAmt += l.sgstAmt; row.igstAmt += l.igstAmt;
    if (l.hsnCode) row.hsnCodes.add(l.hsnCode);
    gstByRate.set(l.gstPct, row);
  });
  const gstSummaryRows = Array.from(gstByRate.entries()).sort(([a], [b]) => a - b).map(([gstPct, row]) => ({
    gstPct, taxableValue: row.taxableValue, cgstAmt: row.cgstAmt, sgstAmt: row.sgstAmt, igstAmt: row.igstAmt,
    hsnCode: row.hsnCodes.size === 1 ? Array.from(row.hsnCodes)[0] : row.hsnCodes.size > 1 ? 'Multiple' : '-',
  }));
  const totalTax = Math.round(gstLineCalc.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;

  // FEATURE (2026-09-06): "the invoice should clearly show the return items
  // and quantity and already sent items" — when this invoice has ever been
  // returned against (originalItems set — see returnDispatchInvoiceItems),
  // iterate the ORIGINAL item list (so a fully-returned line still shows,
  // with Net 0) and add Sent/Returned/Net columns instead of a single Qty
  // column. A never-returned invoice (the overwhelming majority) keeps
  // today's exact single-Qty layout — originalItems is null, isReturned is
  // false, nothing here changes for it.
  const isReturned = !!record.originalItems;
  const itemKey = (name: string, unit: string) => `${name.trim().toLowerCase()}|${unit}`;
  const fmtQty = (n: number) => (n % 1 === 0 ? n : n.toFixed(3));
  const returnedByKey = new Map<string, number>();
  for (const entry of record.returnLog) {
    for (const it of entry.items) {
      const k = itemKey(it.itemName, it.unit);
      returnedByKey.set(k, (returnedByKey.get(k) ?? 0) + it.qty);
    }
  }
  const netByKey = new Map(record.items.map(i => [itemKey(i.itemName, i.unit), i]));
  // Charge lines never belong in the real-item table (see chargeItems above)
  // — same exclusion applied to whichever source array (returned invoices
  // read from originalItems instead of record.items).
  const rowSourceItems = (isReturned ? (record.originalItems ?? record.items) : record.items).filter(i => i.unit !== 'charge');
  const rows = rowSourceItems.map((i, idx) => {
    const k = itemKey(i.itemName, i.unit);
    const netItem = netByKey.get(k);
    const netQty = netItem ? netItem.quantity : 0;
    const netAmount = netItem ? netItem.lineTotal : 0;
    const returnedQty = returnedByKey.get(k) ?? 0;
    return `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(i.itemName)}</td>
      ${isGst ? `<td class="c">${esc(i.hsnCode || '—')}</td>` : ''}
      ${isReturned
        ? `<td class="num">${fmtQty(i.quantity)}</td><td class="num">${returnedQty > 0 ? fmtQty(returnedQty) : '-'}</td><td class="num">${fmtQty(netQty)}</td>`
        : `<td class="num">${fmtQty(i.quantity)}</td>`}
      <td class="num">${Math.round(i.unitPrice)}</td>
      <td class="num">${Math.round(netAmount)}</td>
    </tr>`;
  }).join('');
  // The item table's own Total must now sum only the rows actually printed
  // in it (charges excluded) — record.subtotal itself still includes
  // charges (nothing about how it's computed upstream changes), so using it
  // here directly would show a "Total" the visible item rows don't add up
  // to. The gap between this and the final Net Bill Amount below is exactly
  // what chargesHtml prints.
  const itemsSubtotal = Math.round(rowSourceItems.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  // Named charges (Delivery Fee, Transportation, ...) print here — a short
  // Name/Amount list under the real item table, no quantity column, since a
  // charge was never a physical unit count. See chargeItems above.
  const chargesHtml = chargeItems.length > 0 ? `
    <div class="row" style="margin-top:6px"><span style="font-weight:900">Other Charges</span><span></span></div>
    ${chargeItems.map(c => `<div class="row"><span>${esc(c.itemName)}</span><span>${Math.round(c.lineTotal)}</span></div>`).join('')}` : '';
  const returnNoteHtml = record.returnLog.length > 0 ? `
    <div class="stamp-return">
      ${record.returnLog.map(entry => {
        const itemsDesc = entry.items.map(it => `${fmtQty(it.qty)} ${it.unit} ${esc(it.itemName)}`).join(', ');
        return `<div>Returned by ${esc(entry.by)} on ${esc(new Date(entry.at).toLocaleString('en-IN'))}: ${itemsDesc}${entry.reason ? ` — ${esc(entry.reason)}` : ''}</div>`;
      }).join('')}
    </div>` : '';

  const gstSummaryHtml = isGst && gstSummaryRows.length > 0 ? `
    <table>
      <thead><tr>
        <th>HSN</th><th class="num">Taxable Value</th>
        ${record.gstSupplyType === 'intra'
          ? '<th class="num">CGST</th><th class="num">SGST</th>'
          : '<th class="num">IGST</th>'}
        <th class="num">Tax Amt</th>
      </tr></thead>
      <tbody>
        ${gstSummaryRows.map((r) => `
        <tr>
          <td>${esc(r.hsnCode)} (${r.gstPct}%)</td>
          <td class="num">${Math.round(r.taxableValue)}</td>
          ${record.gstSupplyType === 'intra'
            ? `<td class="num">${Math.round(r.cgstAmt)}</td><td class="num">${Math.round(r.sgstAmt)}</td>`
            : `<td class="num">${Math.round(r.igstAmt)}</td>`}
          <td class="num">${Math.round(r.cgstAmt + r.sgstAmt + r.igstAmt)}</td>
        </tr>`).join('')}
        <tr class="total-row"><td colspan="${record.gstSupplyType === 'intra' ? 4 : 3}">Total Tax (included above)</td><td class="num">${Math.round(totalTax)}</td></tr>
      </tbody>
    </table>` : '';

  const style = mode === 'thermal'
    ? `@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111;width:72mm}.brand{font-size:16px}.doc{font-size:13px}.summary{width:100%}`
    : `@page{size:auto;margin:12mm}body{font-family:Arial,sans-serif;font-size:13px;color:#111}.brand{font-size:22px}.doc{font-size:16px}.summary{width:320px;margin-left:auto}`;

  return `<!doctype html><html><head><title>Invoice ${esc(record.invoiceNo)}</title><style>
    ${style}
    body{padding:10px}
    .c{text-align:center}
    .small{font-size:10px}
    .row,.pay{display:flex;justify-content:space-between;gap:8px}
    .dash{border-top:1px solid #111;margin:6px 0}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th{border-top:1px solid #111;border-bottom:1px solid #111;text-align:left;padding:3px 2px;font-size:11px}
    td{padding:3px 2px;vertical-align:top}
    .num{text-align:right}
    .total-row td{border-top:1px solid #111;font-weight:900}
    .summary .row{padding:2px 0}
    .net{border-top:1px solid #111;border-bottom:1px solid #111;font-size:16px;font-weight:900;margin-top:4px;padding:4px 0}
    .paybox{margin-top:10px;text-align:center}
    .paytitle{border-top:1px solid #111;border-bottom:1px solid #111;display:inline-block;min-width:64%;padding:2px 0}
    .footer{margin-top:12px;text-align:center;font-size:13px;font-weight:800}
    .stamp-cancel{border:2px solid #b91c1c;color:#b91c1c;text-align:center;font-weight:900;font-size:14px;letter-spacing:1px;padding:4px 0;margin:6px 0}
    .stamp-return{border:1.5px solid #b45309;color:#92400e;font-size:10.5px;font-weight:700;padding:5px 6px;margin:8px 0;border-radius:2px}
    .stamp-return div+div{margin-top:3px}
  </style></head><body>
    <div class="c" style="font-weight:900;font-size:${mode === 'thermal' ? '16px' : '20px'}">${esc(business.name)}</div>
    <div class="c small">${business.lines.map(esc).join('<br/>')}</div>
    <div class="c small">GSTIN : ${esc(business.gstin)}${business.fssai ? ` &nbsp; FSSAI : ${esc(business.fssai)}` : ''}</div>
    <div class="c doc" style="font-weight:900;margin:6px 0">${record.status === 'cancelled' ? 'CANCELLED INVOICE' : record.advanceAmount != null ? (record.status === 'unpaid' ? 'ADVANCE BILL — BALANCE DUE' : 'BILL (ADVANCE SETTLED)') : `${record.isGstInvoice ? 'TAX INVOICE' : 'INVOICE'}${record.status === 'unpaid' ? ' — SAMPLE (AWAITING PAYMENT)' : ''}`}</div>
    ${record.status === 'cancelled' ? `<div class="stamp-cancel">CANCELLED${record.cancelledAt ? ` — ${esc(new Date(record.cancelledAt).toLocaleString('en-IN'))}` : ''}${record.cancelledBy ? ` by ${esc(record.cancelledBy)}` : ''}</div>` : ''}
    <div class="row"><span>Bill No : ${esc(record.invoiceNo)}</span><span>Date : ${esc(dateStr)}</span></div>
    <div class="row"><span>${customerLine}</span><span>Time : ${esc(timeStr)}</span></div>
    ${addressLine}
    ${record.deliveryDate ? `<div class="row"><span>Delivery : ${esc(new Date(record.deliveryDate).toLocaleDateString('en-GB'))}${record.deliveryTime ? ` ${esc(record.deliveryTime)}` : ''}</span><span></span></div>` : ''}
    <div class="dash"></div>
    <table>
      <thead><tr><th>Sn</th><th>Item Name</th>${isGst ? '<th>HSN</th>' : ''}${isReturned ? '<th class="num">Sent</th><th class="num">Returned</th><th class="num">Net</th>' : '<th class="num">Qty</th>'}<th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td></td><td>Total</td>${isGst ? '<td></td>' : ''}${isReturned ? `<td></td><td></td><td class="num">${fmtQty(totalQty)}</td>` : `<td class="num">${fmtQty(totalQty)}</td>`}<td></td><td class="num">${Math.round(itemsSubtotal)}</td></tr>
      </tbody>
    </table>
    ${chargesHtml}
    ${gstSummaryHtml}
    ${returnNoteHtml}
    <div class="summary">
      <div class="row"><span>Discount${record.discountPct ? ` (${record.discountPct}%)` : ''} :</span><span>${Math.round(record.discountAmount)}</span></div>
      <div class="row"><span>Round-Off :</span><span>${record.roundOff >= 0 ? '+' : ''}${Math.round(record.roundOff)}</span></div>
      ${isGst ? `<div class="row"><span>Includes GST :</span><span>Rs ${Math.round(totalTax)}</span></div>` : ''}
      <div class="row net"><span>Net Bill Amount :</span><span>Rs ${Math.round(record.total)}</span></div>
      ${record.advanceAmount != null ? `
      <div class="row"><span>Advance Paid :</span><span>- Rs ${Math.round(record.advanceAmount)}</span></div>
      <div class="row" style="font-weight:900;${record.status === 'unpaid' ? 'color:#b45309' : 'color:#047857'}"><span>${record.status === 'unpaid' ? 'Balance Due' : 'Balance Settled'} :</span><span>Rs ${Math.round(record.balanceAmount ?? Math.max(0, record.total - record.advanceAmount))}</span></div>` : ''}
    </div>
    <div class="paybox"><div class="paytitle">Dispatched By</div><div class="pay"><span>${esc(record.dispatchedBy)}</span><span>${esc(dateStr)} ${esc(timeStr)}</span></div></div>
    <div class="dash"></div>
    <div class="footer">Thank you, Visit Again</div>
  </body></html>`;
}

// BUG FIX (2026-08-08): "invoice also we are unable to print... even for
// the Dispatched tab reprint bill is not working" — this used to open a new
// `window.open('', '_blank')` tab and silently do nothing (`if (!win)
// return;`, no direct win.print() call, relying only on an in-page onload
// script) whenever that popup was blocked. Now prints via a hidden iframe
// (see printViaIframe) which never opens a new window/tab, so it can't be
// blocked by a popup blocker.
//
// BUG FIX (2026-08-11): "planner dashboard thermal printer issues — nothing
// prints / printer not found" on dispatch invoice / bill / walk-in receipt.
// The hidden-iframe path above only ever calls the browser's native
// window.print(), which always goes to whatever printer is set as the
// machine's Windows default (or shows the manual OS picker) — it has no way
// to target a specific named thermal printer. On a PC where the thermal
// roll printer isn't (or can't be) set as the OS default — the exact same
// failure mode already diagnosed and fixed for the Biller dashboard's KOT/
// Bill printers via QZ Tray (see src/lib/qzPrint.ts + BillingDashboard's
// Printer Setup modal) — that manifests as "nothing prints" or the OS
// print dialog reporting no usable/default printer. Planner thermal prints
// now try QZ Tray first (role 'planner-bill', configured once via Planner's
// own Printer Setup) and only fall back to the untouched hidden-iframe
// browser-print path if QZ Tray isn't installed/running or no printer has
// been assigned yet — so nothing changes for anyone who hasn't set QZ up.
// A4 prints are unaffected (still meant for a normal page-size printer/PDF,
// not the raw thermal roll QZ targets).
// ── QZ TRAY REMOVED FROM THIS PATH (2026-08-13) ──────────────────────────
// The QZ-first branch above was a silent-failure trap and the single most
// likely cause of "Planner thermal print does nothing", which survived ~20
// other fixes:
//
//   const printedViaQz = await printViaQz('planner-bill', html);
//   if (printedViaQz) return;          // <-- returns with NO fallback
//
// printViaQz resolves TRUE whenever QZ Tray accepts the job — not when
// paper actually comes out. So if a printer name was ever saved in Planner's
// Printer Setup and QZ Tray was reachable, but that saved name was stale,
// offline, renamed in Windows, or pointed at a driver that silently
// discards the job, this returned early and the reliable browser print path
// below was NEVER reached. From the user's side: click Print, nothing
// happens, no error, forever — and no amount of fixing the HTML or the
// iframe could ever help, because the print never got that far.
//
// It also failed closed in a way nobody could see: the saved printer name
// lives in localStorage on ONE machine, so this could break for the Planner
// PC while every other dashboard kept printing normally — exactly the
// reported "Branch and Cafe are fine, only Planner is broken" pattern.
//
// Planner now always uses the same browser print pipeline that Branch and
// Cafe use successfully every day. Choosing the thermal printer is done in
// the normal OS print dialog (or by setting it as the machine default).
export async function printDispatchInvoice(record: DispatchInvoiceRecord, mode: 'a4' | 'thermal') {
  // DIAGNOSTIC (2026-08-16): "Planner print does nothing, console is
  // clean" — every plausible cause found via code review so far (popup
  // blocker, QZ Tray silently swallowing the job) was already fixed in
  // prior sessions and confirmed dead in this one. Rather than guess
  // again, trace every step so the *next* failed attempt tells us exactly
  // where it stops, instead of nothing. Safe to remove once the real cause
  // is found — this changes no behavior, only what gets logged.
  console.log('[printDispatchInvoice] called', { invoiceNo: record.invoiceNo, mode, itemCount: record.items?.length });
  let html: string;
  try {
    html = renderDispatchInvoiceHtml(record, mode);
    console.log('[printDispatchInvoice] HTML generated ok, length:', html.length);
  } catch (err) {
    console.error('[printDispatchInvoice] renderDispatchInvoiceHtml THREW — this is why nothing happened:', err);
    throw err;
  }
  printViaIframe(html);
  console.log('[printDispatchInvoice] printViaIframe call returned (does not mean printing succeeded, just that it was invoked)');
}

// Exported (2026-09-03) so callers that need a one-off row lookup outside
// listDispatchInvoices' date-range/scope query (e.g. PackingCakeOrdersTab's
// "find this cake's own invoice" lookup) don't have to duplicate this mapping.
export function recordFromRow(row: Record<string, unknown>): DispatchInvoiceRecord {
  return {
    id: row.id as string,
    invoiceNo: String(row.invoice_no ?? ''),
    scope: row.scope as DispatchInvoiceScope,
    hosurShopId: (row.hosur_shop_id as string | null) ?? null,
    hosurShopName: (row.hosur_shop_name as string | null) ?? null,
    hosurShopPhone: (row.hosur_shop_phone as string | null) ?? null,
    customerName: (row.customer_name as string | null) ?? null,
    customerPhone: (row.customer_phone as string | null) ?? null,
    customerAddress: (row.customer_address as string | null) ?? null,
    dispatchedBy: String(row.dispatched_by ?? ''),
    items: (row.items as DispatchInvoiceItem[] | null) ?? [],
    subtotal: Number(row.subtotal ?? 0),
    discountPct: Number(row.discount_pct ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    roundOff: Number(row.round_off ?? 0),
    total: Number(row.total ?? 0),
    status: ((row.status as string | null) ?? 'paid') as 'paid' | 'unpaid' | 'cancelled',
    paidAt: (row.paid_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    dispatchEntryIds: (row.dispatch_entry_ids as { orderId: string; dispatchEntryId: string }[] | null) ?? [],
    isGstInvoice: Boolean(row.is_gst_invoice),
    gstSupplyType: (row.gst_supply_type as 'intra' | 'inter' | null) ?? 'intra',
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    cancelledReason: (row.cancelled_reason as string | null) ?? null,
    originalItems: (row.original_items as DispatchInvoiceItem[] | null) ?? null,
    returnLog: (row.return_log as DispatchInvoiceRecord['returnLog'] | null) ?? [],
  };
}

// FEATURE (2026-08-08): "In Invoice tab if once batch is send it should
// store as one batch — if we click on it, it should show. Under each branch
// we should be able to take the pdf and I need date range filter — if I
// select month and select the branch I should be able to download that
// month complete data." Every confirmed dispatch (branch flat dispatch,
// per-shop Hosur dispatch, cake dispatch) now writes one dispatch_invoices
// row via saveDispatchInvoice above — this reads them back for the Invoice
// tab's batch browser, grouped by branch, filterable by date range.
export async function listDispatchInvoices(opts: {
  fromDate: string; // inclusive, ISO date (yyyy-mm-dd) or full timestamp
  toDate: string;   // exclusive, ISO date/timestamp — pass the START of the day AFTER the range end
  scope?: DispatchInvoiceScope;
}): Promise<DispatchInvoiceRecord[]> {
  // BUG FIX (2026-09-08): a plain `.limit(5000)` here is silently capped at
  // 1000 rows by PostgREST's project-wide response cap — see fetchAllRows
  // in src/lib/supabase.ts. This feeds Admin Dispatch Details' aggregate
  // totals, so a range with >1000 dispatch invoices would silently
  // under-report exactly like the Cafe sales bug found this session.
  const { data, error } = await fetchAllRows<Record<string, unknown>>(
    'dispatch_invoices',
    (q) => {
      let query = q.select('*')
        .gte('created_at', opts.fromDate)
        .lt('created_at', opts.toDate)
        .order('created_at', { ascending: false });
      if (opts.scope) query = query.eq('scope', opts.scope);
      return query;
    },
    { maxRows: 20000 },
  );
  if (error) throw new Error(error);
  return (data ?? []).map(recordFromRow);
}

// FEATURE (2026-08-10): "for the dispatched items bill we need the edit
// option — delete the item, change price/quantity/unit/discount/name...
// complete edit access. If we minus or delete the item it should come back
// to stock, and if we add an item it should minus from stock and get marked
// as extra item if it wasn't in the original dispatch."
//
// Rather than re-implementing branch-stock / Closing-Stock-pool / Hosur-sync
// bookkeeping a second time here, every quantity-affecting edit is expressed
// as a delete + (re)create of the underlying bakery_orders dispatch_log
// entry, reusing submitDispatch/deleteDispatchEntry from bakeryStore — the
// same two functions every other dispatch surface in the app already goes
// through — so a bill edit rolls back/reapplies stock exactly the way a
// normal dispatch/undo already does (branch stock, Closing Stock ledger,
// Hosur shop sync, branch_incoming), instead of a second, easier-to-drift
// copy of that logic living only here.
//
// Matching an edited item back to its real dispatch_log entry: the invoice's
// own items have no direct link to one (an item can even be split across
// several dispatch_log rows/orders — see autoSplitForItem). What DOES carry
// that link is `dispatchEntryIds`, saved alongside every branch/Hosur/
// Custom-sale invoice — each {orderId, dispatchEntryId} pair points at one
// real DispatchEntry, which itself carries the true itemName/quantity/unit.
// Resolving every ref against live order data gives an exact map of "which
// entries make up which invoice line" with no guessing.
//
// Cake invoices are the one dispatch_invoices row this can't reconcile stock
// for — cake_master_orders never has a bakery_orders/dispatch_log entry at
// all, and a made-to-order cake isn't part of the shared Closing Stock pool
// in the first place (it's a bespoke, one-off line, not a catalog balance).
// When no ref resolves to a real dispatch_log entry, this falls back to a
// bill-only edit (name/qty/unit/price/discount on the invoice itself) with
// no stock reconciliation attempted — there's nothing to reconcile. The
// `stockSynced` flag on the result tells the caller which case happened, so
// the UI can be honest with the planner about what did/didn't touch stock.
export async function updateDispatchInvoice(params: {
  invoiceId: string;
  updatedItems: DispatchInvoiceItem[];
  updatedDiscountPct: number;
  editedBy: string;
}): Promise<{ ok: true; record: DispatchInvoiceRecord; stockSynced: boolean; hosurWhatsapp?: { ok: boolean; billNo?: string; whatsappStatus?: 'sent' | 'failed'; whatsappError?: string | null; message?: string } } | { error: string }> {
  const { data: invRow, error: invErr } = await supabase.from('dispatch_invoices').select('*').eq('id', params.invoiceId).single();
  if (invErr || !invRow) return { error: invErr?.message || 'Invoice not found — it may have been removed.' };
  const original = recordFromRow(invRow as Record<string, unknown>);
  if (original.status === 'cancelled') return { error: 'This invoice has been cancelled and can no longer be edited.' };

  // AUDIT FIX (2026-09-03): quantities used to be trusted verbatim from the
  // caller — the only defense was the Edit Bill modal's own per-keystroke
  // clamp on the qty box, which isn't reapplied if the unit dropdown is
  // switched afterward (e.g. type "10.5" while unit=kg, then switch to
  // pcs). That let a fractional-pcs quantity reach here, get saved/printed
  // on the invoice verbatim, while the real stock write below (submitDispatch,
  // step 3) independently rounds it — the printed bill and the actual stock
  // movement could silently disagree on how much left the shelf. Clamp here
  // too, at the single choke point every edit funnels through, same as the
  // real stock write already does.
  // BUG FIX (2026-09-10): a charge line (unit === 'charge' — a Delivery Fee
  // etc.) carries its amount in unitPrice with quantity conceptually pinned
  // to 1. Filtering it on `quantity > 0` meant that if any caller ever sent
  // it with quantity 0 (the Edit Bill modal did exactly this when a planner
  // zeroed the fake "Qty" box trying to change the amount), the whole charge
  // was silently dropped from the bill — confirmed live on SALES/26-27/156.
  // Keep charge lines on name + non-negative amount alone, and always
  // normalise their quantity back to 1.
  const cleanedUpdatedItems = params.updatedItems
    .filter(i => i.itemName.trim() && i.unitPrice >= 0 && (i.unit === 'charge' || i.quantity > 0))
    .map(i => ({ ...i, itemName: i.itemName.trim(), quantity: i.unit === 'charge' ? 1 : clampQtyForUnit(i.quantity, i.unit === 'kg' ? 'kg' : 'pcs') }));
  if (cleanedUpdatedItems.length === 0) {
    return { error: 'A bill needs at least one item with a name, quantity above 0 and a valid price — cancel the whole bill instead if it should no longer exist.' };
  }

  const key = (it: { itemName: string; unit: string }) => `${it.itemName.trim().toLowerCase()}|${it.unit}`;
  const originalByKey = new Map(original.items.map(i => [key(i), i]));
  const updatedByKey = new Map(cleanedUpdatedItems.map(i => [key(i), i]));

  const { useBakeryStore } = await import('./bakeryStore');
  // Force a fresh order fetch — this reconciliation reads dispatch_log
  // straight off `orders`, and a bill can be edited long after the last poll.
  await useBakeryStore.getState().fetchOrders(true, true);
  const freshOrders = useBakeryStore.getState().orders;

  type EntryDetail = { orderId: string; dispatchEntryId: string; itemName: string; unit: string; quantity: number; isExtra: boolean; targetHosurOrderId?: string; isCustomSale: boolean };
  const entryDetails: EntryDetail[] = original.dispatchEntryIds
    .map((ref): EntryDetail | null => {
      const order = freshOrders.find(o => o.id === ref.orderId);
      const entry = order?.dispatchLog?.find(d => d.id === ref.dispatchEntryId);
      if (!entry) return null;
      return {
        orderId: ref.orderId, dispatchEntryId: ref.dispatchEntryId,
        itemName: entry.itemName, unit: entry.unit ?? 'kg', quantity: entry.quantity,
        isExtra: Boolean(entry.isExtra), targetHosurOrderId: entry.targetHosurOrderId, isCustomSale: Boolean(entry.isCustomSale),
      };
    })
    .filter((x): x is EntryDetail => x !== null);

  const stockSynced = entryDetails.length > 0;
  const entriesByKey = new Map<string, EntryDetail[]>();
  for (const e of entryDetails) {
    const k = `${e.itemName.trim().toLowerCase()}|${e.unit}`;
    if (!entriesByKey.has(k)) entriesByKey.set(k, []);
    entriesByKey.get(k)!.push(e);
  }

  // AUDIT FIX (2026-09-03): charge lines (unit === 'charge' — a named fee
  // like a delivery/packing charge, not a real catalog item) have no
  // backing dispatch_log entry, so entriesByKey.get(k) for one is always
  // empty. Step 2 below correctly no-ops on that (nothing to delete), but
  // step 3 didn't know a charge key was different from a real item key —
  // it reissued the "changed quantity" charge as a brand-new dispatch,
  // coercing its unit to 'kg' and debiting the shared Closing Stock pool
  // for a fabricated stock item literally named after the charge (e.g.
  // "Packing Charge"), anchored onto an unrelated real order. Charges are
  // bill-only lines — excluded from the whole stock-sync reconciliation,
  // same as saveBill/cancelBill/EditWalkinBillModal already exclude them.
  const isChargeKey = (k: string) => (originalByKey.get(k)?.unit ?? updatedByKey.get(k)?.unit) === 'charge';
  const removedKeys = [...originalByKey.keys()].filter(k => !updatedByKey.has(k) && !isChargeKey(k));
  const addedKeys = [...updatedByKey.keys()].filter(k => !originalByKey.has(k) && !isChargeKey(k));
  const changedQtyKeys = [...updatedByKey.keys()].filter(k => {
    if (!originalByKey.has(k) || isChargeKey(k)) return false;
    return Math.abs(originalByKey.get(k)!.quantity - updatedByKey.get(k)!.quantity) > 0.001;
  });

  // TYPE NOTE (2026-09-03): only used below inside `if (stockSynced)`, which
  // is only ever true when real dispatch_log entries were found (entryDetails
  // resolved from bakeryOrders) — a Cake invoice (see its own doc comment
  // above) never has those, so this cast is never actually exercised for
  // scope 'Cake'; it's just here so submitDispatch's stricter Branch param
  // type-checks for the SNB/VRSNB/Hosur cases that do reach it.
  const branch = original.scope as Branch;
  // Fallback anchor for a genuinely brand-new item (never had any entry to
  // anchor off) — any order already targeting this branch, same as
  // ExtraItemDispatchForm's own anchorOrderId logic elsewhere in Dispatch.
  const fallbackAnchorOrderId = entryDetails[0]?.orderId ?? freshOrders.find(o => o.targetBranch === branch)?.id ?? null;
  // BUG FIX (audit): a changed-quantity item used to always get re-anchored
  // onto the SAME single order as entryDetails[0], even when its own
  // original entries lived on a *different* order. That order may not even
  // list this item in its own `items` array, which several dispatched-total
  // calculations elsewhere (branchDispatchedForRow, dispatchedQtyForItem)
  // key off via `row.contributingOrderIds` — landing a reissued entry on the
  // wrong order risked it silently dropping out of those totals even though
  // it's correctly on the invoice. Anchor each changed item on ONE of its
  // OWN original entries' orders (captured before deletion) instead, and
  // only fall back to the generic branch anchor for items with no prior
  // entry of their own (true adds).
  const anchorFor = (itemKey: string): string | null => entriesByKey.get(itemKey)?.[0]?.orderId ?? fallbackAnchorOrderId;
  const anchorHosurOrderId = branch === 'Hosur' ? entryDetails.find(e => e.targetHosurOrderId)?.targetHosurOrderId : undefined;
  const isCustomSale = entryDetails[0]?.isCustomSale ?? Boolean(original.customerName && !original.hosurShopId);

  if (stockSynced && (removedKeys.length > 0 || changedQtyKeys.length > 0 || addedKeys.length > 0) && !fallbackAnchorOrderId) {
    return { error: `Can't apply this edit — no linked ${branch} order was found to attach the stock change to. Refresh and try again, or ask an admin to check this order.` };
  }

  const store = useBakeryStore.getState();
  const reissuedRefs: { orderId: string; dispatchEntryId: string }[] = [];

  if (stockSynced) {
    // 1. Fully-removed items: delete every backing dispatch_log entry —
    //    restores branch stock, the Closing Stock pool, and Hosur sync in
    //    one call each (exactly what "Remove" already does everywhere else
    //    in Dispatch).
    for (const k of removedKeys) {
      for (const e of entriesByKey.get(k) ?? []) {
        await store.deleteDispatchEntry(e.orderId, e.dispatchEntryId);
      }
    }
    // 2. Quantity/unit/name changes: delete the old entry/entries the same
    //    way (full restock) — the fresh entry with the new value is
    //    (re)created in step 3 below.
    for (const k of changedQtyKeys) {
      for (const e of entriesByKey.get(k) ?? []) {
        await store.deleteDispatchEntry(e.orderId, e.dispatchEntryId);
      }
    }
    // 3. Brand-new items AND changed-quantity items (just deleted above) get
    //    a fresh dispatch_log entry — debits branch stock / Closing Stock /
    //    Hosur sync exactly like a normal dispatch. Brand-new items are
    //    tagged isExtra=true per the "mark it as an extra item" ask;
    //    changed-quantity items carry forward whatever isExtra they already
    //    had (editing quantity alone doesn't turn a normal item into extra).
    const toReissue = [
      ...addedKeys.map(k => ({ k, isExtra: true })),
      ...changedQtyKeys.map(k => ({ k, isExtra: entriesByKey.get(k)?.[0]?.isExtra ?? false })),
    ];
    // BUG FIX (audit): explicitly minting each new entry's id here (instead
    // of letting submitDispatch auto-generate one) so the dispatchEntryIds
    // rebuild below can record EXACTLY the entry this call created — the
    // previous version re-fetched the anchor order afterward and matched by
    // itemName+unit, which could wrongly pick up an unrelated dispatch_log
    // entry already sitting on that same order for the same item (e.g. from
    // a completely different invoice), silently mis-linking this bill to
    // someone else's dispatch record.
    for (const { k, isExtra } of toReissue) {
      const item = updatedByKey.get(k);
      const orderId = anchorFor(k);
      if (!item || item.quantity <= 0 || !orderId) continue;
      const newId = crypto.randomUUID();
      await store.submitDispatch(orderId, {
        id: newId,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit === 'pcs' ? 'pcs' : 'kg',
        branch,
        dispatchedBy: params.editedBy,
        dispatchedAt: new Date().toISOString(),
        ...(anchorHosurOrderId ? { targetHosurOrderId: anchorHosurOrderId } : {}),
        isExtra,
        ...(isCustomSale ? { isCustomSale: true, customerName: original.customerName ?? undefined } : {}),
      });
      reissuedRefs.push({ orderId, dispatchEntryId: newId });
    }
  }

  // 4. Recompute the invoice's own numbers from the final edited item list —
  //    identical formula to saveDispatchInvoice, so a reprint looks the same
  //    as any freshly-created bill.
  const finalItems: DispatchInvoiceItem[] = cleanedUpdatedItems.map(i => {
    const k = key(i);
    // A charge line's amount is its unitPrice (quantity is always 1); a real
    // item's is quantity × unitPrice.
    const lineTotal = i.unit === 'charge'
      ? Math.round((Number(i.unitPrice) || 0) * 100) / 100
      : Math.round(i.quantity * i.unitPrice * 100) / 100;
    return {
      itemName: i.itemName,
      unit: i.unit,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal,
      isExtra: addedKeys.includes(k) ? true : (originalByKey.get(k)?.isExtra ?? i.isExtra ?? false),
    };
  });
  // AUDIT FIX (2026-09-02): same clamp as saveDispatchInvoice — see its comment.
  const safeUpdatedDiscountPct = Math.min(100, Math.max(0, params.updatedDiscountPct || 0));
  const subtotal = Math.round(finalItems.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const discountAmount = Math.round(subtotal * (safeUpdatedDiscountPct / 100) * 100) / 100;
  const preRound = subtotal - discountAmount;
  const total = Math.round(preRound);
  const roundOff = Math.round((total - preRound) * 100) / 100;

  // Re-collect dispatchEntryIds for the edited bill: keep every ref whose
  // item wasn't touched, drop refs for removed/changed items, and add the
  // exact refs step 3 just created — keeps a FUTURE edit of this same bill
  // able to trace back correctly again.
  let finalDispatchEntryIds = original.dispatchEntryIds;
  if (stockSynced) {
    const keptRefs = original.dispatchEntryIds.filter(ref => {
      const entry = entryDetails.find(e => e.orderId === ref.orderId && e.dispatchEntryId === ref.dispatchEntryId);
      if (!entry) return true; // unresolved — leave untouched rather than silently drop
      const k = `${entry.itemName.trim().toLowerCase()}|${entry.unit}`;
      return !removedKeys.includes(k) && !changedQtyKeys.includes(k);
    });
    finalDispatchEntryIds = [...keptRefs, ...reissuedRefs];
  }

  const editNote = `Edited by ${params.editedBy} on ${new Date().toLocaleString('en-IN')}`;
  const finalNotes = original.notes ? `${original.notes} · ${editNote}` : editNote;
  const { error: updateErr } = await supabase.from('dispatch_invoices').update({
    items: finalItems,
    subtotal,
    discount_pct: safeUpdatedDiscountPct,
    discount_amount: discountAmount,
    round_off: roundOff,
    total,
    dispatch_entry_ids: finalDispatchEntryIds,
    notes: finalNotes,
  }).eq('id', params.invoiceId);
  if (updateErr) return { error: updateErr.message || 'Failed to save the edited bill.' };

  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Edited Dispatch Invoice',
      detail: `Invoice ${original.invoiceNo} (${original.scope}) edited — ${finalItems.length} item(s), new total Rs. ${Math.round(total)}`,
      branch: original.scope,
    });
  }

  // FEATURE (2026-09-03): "if they edit the bill the new invoice should go
  // to the client with the update invoice in whatsapp" — Hosur is the only
  // scope with a real client-facing WhatsApp bill (hosur_bills/hosur_bill_
  // items, created by dispatchReceiveAndBill at dispatch time); this pushes
  // the corrected amount there too and resends it. Best-effort: an edit to
  // the dispatch_invoices record above has already succeeded and must stand
  // regardless of whether the shop's bill/WhatsApp resync works.
  let hosurWhatsapp: { ok: boolean; billNo?: string; whatsappStatus?: 'sent' | 'failed'; whatsappError?: string | null; message?: string } | undefined;
  if (branch === 'Hosur' && anchorHosurOrderId) {
    try {
      // BUG FIX (2026-09-03, live incident — Shree Skanda Villas): a single
      // Hosur order can be dispatched across multiple separate batches, each
      // with its OWN dispatch_invoices row, but they all share ONE hosur_bills
      // row (dispatchReceiveAndBill reuses the existing draft bill by
      // order_id). Syncing only THIS invoice's items would silently discard
      // whatever the order's OTHER invoice(s) already contributed to that
      // shared bill. Pull every other non-cancelled Hosur invoice for the
      // same shop, keep only the ones whose own dispatch entries resolve to
      // this SAME hosur order, apply EACH one's own discount to get its real
      // billed prices, and combine with this edit's own final items before
      // syncing — so the shop's credit bill always reflects the full,
      // combined total across every batch, not just the one just edited.
      const finalPriced = (items: DispatchInvoiceItem[], discountPct: number) => {
        const mult = 1 - Math.max(0, Math.min(100, discountPct || 0)) / 100;
        return items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: Math.round(i.unitPrice * mult * 100) / 100 }));
      };
      let combinedItems = finalPriced(finalItems, safeUpdatedDiscountPct);
      if (original.hosurShopId) {
        const { data: siblingRows } = await supabase.from('dispatch_invoices')
          .select('id, items, discount_pct, dispatch_entry_ids')
          .eq('scope', 'Hosur').eq('hosur_shop_id', original.hosurShopId).neq('status', 'cancelled').neq('id', params.invoiceId);
        for (const row of (siblingRows ?? []) as { id: string; items: DispatchInvoiceItem[]; discount_pct: number; dispatch_entry_ids: { orderId: string; dispatchEntryId: string }[] }[]) {
          const belongsToSameOrder = (row.dispatch_entry_ids ?? []).some(ref => {
            const order = freshOrders.find(o => o.id === ref.orderId);
            const entry = order?.dispatchLog?.find(d => d.id === ref.dispatchEntryId);
            return entry?.targetHosurOrderId === anchorHosurOrderId;
          });
          if (belongsToSameOrder) combinedItems = combinedItems.concat(finalPriced(row.items ?? [], row.discount_pct ?? 0));
        }
      }
      const { syncHosurBillWithInvoiceEdit } = await import('./hosurBillingBridge');
      hosurWhatsapp = await syncHosurBillWithInvoiceEdit({ hosurOrderId: anchorHosurOrderId, items: combinedItems });
    } catch (err) {
      hosurWhatsapp = { ok: false, message: err instanceof Error ? err.message : 'Failed to sync the updated invoice to the shop.' };
    }
  }

  return {
    ok: true,
    stockSynced,
    hosurWhatsapp,
    record: {
      ...original,
      items: finalItems,
      subtotal, discountPct: safeUpdatedDiscountPct, discountAmount, roundOff, total,
      dispatchEntryIds: finalDispatchEntryIds,
      notes: finalNotes,
    },
  };
}

// FEATURE (2026-09-06): "next to the dispatch invoices add a cancel button —
// once confirmed all items should return to stock, the invoice should be
// cancelled, reprinting shows it as a cancelled invoice, and it should be
// recorded in the report and Admin Dispatch Details tab too." Reuses the
// exact same stock-reversal primitive updateDispatchInvoice's own "fully
// removed items" step already uses (deleteDispatchEntry per backing
// dispatch_log entry) — cancelling is that same reversal applied to every
// item on the invoice at once, then a status flip instead of a re-save.
export async function cancelDispatchInvoice(params: {
  invoiceId: string;
  reason?: string;
}): Promise<{ ok: true; record: DispatchInvoiceRecord } | { error: string }> {
  const { data: invRow, error: invErr } = await supabase.from('dispatch_invoices').select('*').eq('id', params.invoiceId).single();
  if (invErr || !invRow) return { error: invErr?.message || 'Invoice not found — it may have been removed.' };
  const original = recordFromRow(invRow as Record<string, unknown>);
  if (original.status === 'cancelled') return { error: 'This invoice is already cancelled.' };

  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  const cancelledByName = user?.displayName || 'Planner';

  const cancelledAt = new Date().toISOString();
  const cancelNote = `Cancelled by ${cancelledByName} on ${new Date().toLocaleString('en-IN')}${params.reason ? ` — ${params.reason}` : ''}`;
  const finalNotes = original.notes ? `${original.notes} · ${cancelNote}` : cancelNote;

  // BUG FIX (2026-09-06, audit): flip the status FIRST, atomically — the
  // early `original.status === 'cancelled'` check above reads a snapshot
  // that two concurrent cancel clicks (two admins, or one impatient
  // double-click that slipped past the client-side ref guard) could both
  // pass before either write lands, and both would then reverse stock below
  // — a real double-restock. `.neq('status','cancelled')` makes this update
  // a compare-and-swap: only the request that actually flips a row is
  // allowed to proceed to stock reversal; a request that loses the race gets
  // back zero affected rows and stops here instead.
  const { data: claimed, error: claimErr } = await supabase.from('dispatch_invoices').update({
    status: 'cancelled',
    cancelled_by: cancelledByName,
    cancelled_at: cancelledAt,
    cancelled_reason: params.reason ?? null,
    notes: finalNotes,
  }).eq('id', params.invoiceId).neq('status', 'cancelled').select('id');
  if (claimErr) return { error: claimErr.message || 'Failed to cancel the invoice.' };
  if (!claimed || claimed.length === 0) return { error: 'This invoice is already cancelled.' };

  // Cake invoices (see updateDispatchInvoice's own doc comment above) never
  // have a real dispatch_log entry to reconcile — nothing to restock, so
  // cancelling one is a pure status flip.
  const { useBakeryStore } = await import('./bakeryStore');
  // Resolve each ref's real targetHosurOrderId BEFORE deleting anything below
  // — deleteDispatchEntry removes the entry from the order's own dispatchLog,
  // so looking this up AFTER deletion would always come back empty and the
  // Hosur bill resync further down could never find the order to sync.
  let anchorHosurOrderId: string | undefined;
  if (original.scope !== 'Cake' && original.dispatchEntryIds.length > 0) {
    try {
      await useBakeryStore.getState().fetchOrders(true, true);
      const freshOrders = useBakeryStore.getState().orders;
      const store = useBakeryStore.getState();
      anchorHosurOrderId = original.dispatchEntryIds
        .map(ref => freshOrders.find(o => o.id === ref.orderId)?.dispatchLog?.find(d => d.id === ref.dispatchEntryId)?.targetHosurOrderId)
        .find((id): id is string => Boolean(id));
      for (const ref of original.dispatchEntryIds) {
        const order = freshOrders.find(o => o.id === ref.orderId);
        const entry = order?.dispatchLog?.find(d => d.id === ref.dispatchEntryId);
        if (!entry) continue; // already gone/unresolved — nothing left to reverse
        await store.deleteDispatchEntry(ref.orderId, ref.dispatchEntryId);
      }
    } catch (err) {
      // BUG FIX (2026-09-06, audit): the status claim above already
      // committed — if stock reversal then throws partway through, the
      // invoice would be stuck permanently "cancelled" with some (or all)
      // of its stock never actually returned, and no way to retry (the
      // Cancel button only shows for a non-cancelled invoice). Revert the
      // claim so the planner can see the failure and try again, instead of
      // silently losing stock.
      await supabase.from('dispatch_invoices').update({
        status: original.status, cancelled_by: null, cancelled_at: null, cancelled_reason: null, notes: original.notes,
      }).eq('id', params.invoiceId);
      return { error: err instanceof Error ? `Stock reversal failed partway through — the invoice was NOT cancelled, please try again: ${err.message}` : 'Stock reversal failed partway through — the invoice was NOT cancelled, please try again.' };
    }
  }

  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Cancelled Dispatch Invoice',
      detail: `Invoice ${original.invoiceNo} (${original.scope}) cancelled — ${original.items.length} item(s), Rs. ${Math.round(original.total)} returned to stock${params.reason ? ` — ${params.reason}` : ''}`,
      branch: original.scope,
    });
  }

  // Best-effort: for a Hosur shop invoice, recompute the shop's combined
  // WhatsApp bill/credit ledger from whatever OTHER (still non-cancelled)
  // invoices share the same underlying Hosur order — same reconciliation
  // updateDispatchInvoice's own edit-sync already does; this cancelled
  // invoice naturally drops out since the sibling query excludes cancelled
  // rows. If NOTHING else was ever billed for that order (this was the only
  // invoice), there's nothing left to sync — the shop's hosur_bills row
  // itself is marked cancelled/zeroed instead so its credit ledger doesn't
  // keep showing money owed for goods that came back. Never blocks the
  // invoice cancellation itself if any of this fails.
  if (original.scope === 'Hosur' && original.hosurShopId) {
    try {
      const freshOrders = useBakeryStore.getState().orders;
      if (anchorHosurOrderId) {
        const { data: siblingRows } = await supabase.from('dispatch_invoices')
          .select('items, discount_pct, dispatch_entry_ids')
          .eq('scope', 'Hosur').eq('hosur_shop_id', original.hosurShopId).neq('status', 'cancelled').neq('id', params.invoiceId);
        const finalPriced = (items: DispatchInvoiceItem[], discountPct: number) => {
          const mult = 1 - Math.max(0, Math.min(100, discountPct || 0)) / 100;
          return items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: Math.round(i.unitPrice * mult * 100) / 100 }));
        };
        let combinedItems: { itemName: string; unit: string; quantity: number; unitPrice: number }[] = [];
        for (const row of (siblingRows ?? []) as { items: DispatchInvoiceItem[]; discount_pct: number; dispatch_entry_ids: { orderId: string; dispatchEntryId: string }[] }[]) {
          const belongsToSameOrder = (row.dispatch_entry_ids ?? []).some(ref => {
            const order = freshOrders.find(o => o.id === ref.orderId);
            const entry = order?.dispatchLog?.find(d => d.id === ref.dispatchEntryId);
            return entry?.targetHosurOrderId === anchorHosurOrderId;
          });
          if (belongsToSameOrder) combinedItems = combinedItems.concat(finalPriced(row.items ?? [], row.discount_pct ?? 0));
        }
        if (combinedItems.length > 0) {
          const { syncHosurBillWithInvoiceEdit } = await import('./hosurBillingBridge');
          await syncHosurBillWithInvoiceEdit({ hosurOrderId: anchorHosurOrderId, items: combinedItems });
        } else {
          await supabase.from('hosur_bills').update({ status: 'cancelled', subtotal: 0, credit_amount: 0, updated_at: cancelledAt })
            .eq('order_id', anchorHosurOrderId).neq('status', 'cancelled');
        }
      }
    } catch (err) {
      console.error('[cancelDispatchInvoice] Hosur bill resync failed (non-fatal):', err);
    }
  }

  return {
    ok: true,
    record: {
      ...original,
      status: 'cancelled',
      cancelledBy: cancelledByName,
      cancelledAt,
      cancelledReason: params.reason ?? null,
      notes: finalNotes,
    },
  };
}

// FEATURE (2026-09-06): "In dispatch tab create a Return sub tab — search by
// invoice number, show items+qty, let them edit the return qty, on save the
// items should go back to stock, the updated bill should go on WhatsApp, and
// the reprinted invoice should clearly show the return items/quantity and
// the already-sent items." A return is expressed as a normal quantity
// reduction — updateDispatchInvoice above already does the hard part (stock
// reversal via deleteDispatchEntry/submitDispatch, recomputing subtotal/
// total, the Activity Log entry, and for Hosur the shop-bill/WhatsApp
// resync). This wraps that call with: per-item validation against what's
// still actually on the bill, a durable return record (originalItems snapshot
// + returnLog audit trail — see the DispatchInvoiceRecord fields above) so a
// reprint can show both figures, a distinct "Returned" activity-log entry,
// and (for scopes updateDispatchInvoice doesn't already WhatsApp — i.e.
// anything but Hosur) a best-effort WhatsApp send of the corrected invoice
// PDF to whatever phone is on file (Custom's customerPhone; SNB/VRSNB have
// none, so nothing is sent for them, only the stock/bill correction happens).
export async function returnDispatchInvoiceItems(params: {
  invoiceId: string;
  returns: { itemName: string; unit: string; qty: number }[];
  reason?: string;
  returnedBy: string;
}): Promise<{ ok: true; record: DispatchInvoiceRecord; whatsapp?: { ok: boolean; error?: string } } | { error: string }> {
  const cleanedReturns = params.returns
    .filter(r => r.itemName.trim() && r.qty > 0)
    .map(r => ({ ...r, itemName: r.itemName.trim() }));
  if (cleanedReturns.length === 0) return { error: 'Enter a return quantity for at least one item.' };

  const { data: invRow, error: invErr } = await supabase.from('dispatch_invoices').select('*').eq('id', params.invoiceId).single();
  if (invErr || !invRow) return { error: invErr?.message || 'Invoice not found — it may have been removed.' };
  const original = recordFromRow(invRow as Record<string, unknown>);
  if (original.status === 'cancelled') return { error: 'This invoice is cancelled — there is nothing to return.' };

  const key = (it: { itemName: string; unit: string }) => `${it.itemName.trim().toLowerCase()}|${it.unit}`;
  const currentByKey = new Map(original.items.map(i => [key(i), i]));
  for (const r of cleanedReturns) {
    const current = currentByKey.get(key(r));
    if (!current) return { error: `"${r.itemName}" (${r.unit}) isn't on this invoice — refresh and try again.` };
    if (r.qty > current.quantity + 0.01) {
      return { error: `Can't return ${r.qty} ${r.unit} of ${r.itemName} — only ${current.quantity % 1 === 0 ? current.quantity : current.quantity.toFixed(3)} ${r.unit} is currently on this invoice.` };
    }
  }

  const updatedItems: DispatchInvoiceItem[] = original.items
    .map(i => {
      const ret = cleanedReturns.find(r => key(r) === key(i));
      if (!ret) return i;
      const newQty = Math.max(0, i.quantity - ret.qty);
      return { ...i, quantity: newQty, lineTotal: Math.round(newQty * i.unitPrice * 100) / 100 };
    })
    .filter(i => i.quantity > 0.001);
  if (updatedItems.length === 0) {
    return { error: 'That would return every item on this bill — use Cancel Invoice instead so it prints as a proper cancellation.' };
  }

  const updateResult = await updateDispatchInvoice({
    invoiceId: params.invoiceId,
    updatedItems,
    updatedDiscountPct: original.discountPct,
    editedBy: params.returnedBy,
  });
  if ('error' in updateResult) return { error: updateResult.error };

  // Record the return itself — separate from updateDispatchInvoice's own
  // "Edited Dispatch Invoice" write above, which only knows about the final
  // item list, not that this particular edit was a customer return. Never
  // block on this: the stock/bill correction above already succeeded and
  // must stand even if this bookkeeping write fails.
  const returnLogEntry = { at: new Date().toISOString(), by: params.returnedBy, reason: params.reason?.trim() || null, items: cleanedReturns };
  const newOriginalItems = original.originalItems ?? original.items;
  const newReturnLog = [...original.returnLog, returnLogEntry];
  const { data: afterRow, error: afterErr } = await supabase.from('dispatch_invoices')
    .update({ original_items: newOriginalItems, return_log: newReturnLog })
    .eq('id', params.invoiceId)
    .select('*')
    .single();
  if (afterErr) console.error('[returnDispatchInvoiceItems] Return succeeded but saving the return record failed:', afterErr);
  const finalRecord = afterRow ? recordFromRow(afterRow as Record<string, unknown>) : updateResult.record;

  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    const itemsDesc = cleanedReturns.map(r => `${r.qty % 1 === 0 ? r.qty : r.qty.toFixed(3)} ${r.unit} ${r.itemName}`).join(', ');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Returned Dispatch Invoice Items',
      detail: `Invoice ${original.invoiceNo} (${original.scope}) — returned ${itemsDesc}${params.reason ? ` — ${params.reason}` : ''}. New total Rs. ${Math.round(finalRecord.total)}`,
      branch: original.scope,
    });
  }

  // WhatsApp: Hosur is already handled inside updateDispatchInvoice (it
  // resyncs the shop's real hosur_bills row and resends via the proven
  // sendHosurWhatsapp path) — just surface that result. Everything else with
  // a phone on file (currently only Custom) gets a new, generic PDF send;
  // SNB/VRSNB have no phone at all, so nothing is attempted for them.
  let whatsapp: { ok: boolean; error?: string } | undefined;
  if (updateResult.hosurWhatsapp) {
    whatsapp = {
      ok: updateResult.hosurWhatsapp.ok && updateResult.hosurWhatsapp.whatsappStatus !== 'failed',
      error: updateResult.hosurWhatsapp.whatsappError ?? updateResult.hosurWhatsapp.message ?? undefined,
    };
  } else {
    const phone = finalRecord.customerPhone || finalRecord.hosurShopPhone;
    if (phone) {
      try {
        await sendDispatchInvoiceWhatsapp(finalRecord, cleanedReturns, phone);
        whatsapp = { ok: true };
      } catch (err) {
        whatsapp = { ok: false, error: err instanceof Error ? err.message : 'WhatsApp send failed.' };
      }
    }
  }

  return { ok: true, record: finalRecord, whatsapp };
}

// Hand-drawn jsPDF bill, same technique as HosurDashboard's own
// createWhatsappBillDocument (proven in production) — deliberately not an
// html2canvas render of renderDispatchInvoiceHtml, since html2canvas isn't a
// project dependency and this keeps the WhatsApp media generation entirely
// client-side with a library already in use.
export async function createDispatchInvoiceWhatsappPdf(
  record: DispatchInvoiceRecord,
  justReturned: { itemName: string; unit: string; qty: number }[] = [],
): Promise<{ base64: string; mimeType: 'application/pdf'; fileName: string; caption: string }> {
  const business = businessFor(record.scope);
  const pageHeight = Math.max(190, 140 + record.items.length * 10 + justReturned.length * 6);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, pageHeight], compress: true });
  const left = 5;
  const right = 75;
  let y = 8;
  const line = (text: string, size = 8, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const x = align === 'center' ? 40 : align === 'right' ? right : left;
    doc.text(text, x, y, { align });
    y += size <= 8 ? 4.3 : 5.2;
  };
  const divider = () => {
    doc.setDrawColor(110);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(left, y, right, y);
    doc.setLineDashPattern([], 0);
    y += 4;
  };

  line(business.name.toUpperCase(), 11, true, 'center');
  line('UPDATED INVOICE (RETURN PROCESSED)', 8, true, 'center');
  divider();
  line(`Invoice No: ${record.invoiceNo}`, 8, true);
  line(`Date: ${new Date(record.createdAt).toLocaleString('en-IN')}`, 7.5);
  const who = record.customerName || record.hosurShopName || `${record.scope} Branch`;
  line(`To: ${who}`, 8, true);
  divider();

  record.items.forEach((item, index) => {
    const itemLines = doc.splitTextToSize(`${index + 1}. ${item.itemName}`, 45) as string[];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(itemLines, left, y);
    const itemHeight = Math.max(4, itemLines.length * 3.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(`${item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(3)} ${item.unit}`, 53, y, { align: 'right' });
    doc.text(`Rs. ${Math.round(item.lineTotal)}`, right, y, { align: 'right' });
    y += itemHeight + 1.5;
  });
  divider();
  line(`New Total: Rs. ${Math.round(record.total)}`, 10, true, 'right');
  divider();

  if (justReturned.length > 0) {
    doc.setTextColor(180, 40, 40);
    line('ITEMS RETURNED', 8.5, true, 'center');
    justReturned.forEach(r => {
      line(`- ${r.qty % 1 === 0 ? r.qty : r.qty.toFixed(3)} ${r.unit} ${r.itemName}`, 7.5, false, 'left');
    });
    doc.setTextColor(0, 0, 0);
    divider();
  }

  line('Thank you!', 9, true, 'center');

  const dataUri = doc.output('datauristring');
  const comma = dataUri.indexOf(',');
  return {
    base64: dataUri.slice(comma + 1),
    mimeType: 'application/pdf',
    fileName: `${record.invoiceNo.replace(/[^a-z0-9._-]+/gi, '-')}-updated.pdf`,
    caption: `${record.invoiceNo} — Updated (return processed) — New Total Rs. ${Math.round(record.total)}`,
  };
}

// Generic WhatsApp send for a corrected invoice — reuses the send-hosur-
// whatsapp Edge Function directly (despite its name, it's a plain WhatsApp
// Cloud API relay: phone/message/optional document, nothing Hosur-specific
// in its implementation) rather than duplicating a second Edge Function for
// exactly the same job. messageType 'manual' skips the payment-QR
// requirement the 'bill'/'reminder' types carry — a return notice isn't a
// payment collection ask.
async function sendDispatchInvoiceWhatsapp(
  record: DispatchInvoiceRecord,
  justReturned: { itemName: string; unit: string; qty: number }[],
  phone: string,
): Promise<void> {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  if (!supabaseUrl || !anonKey) throw new Error('Supabase URL or publishable key is missing in the deployed app.');

  const pdf = await createDispatchInvoiceWhatsappPdf(record, justReturned);
  const itemsDesc = justReturned.map(r => `${r.qty % 1 === 0 ? r.qty : r.qty.toFixed(3)} ${r.unit} ${r.itemName}`).join(', ');
  const message = `Hello, your bill ${record.invoiceNo} has been updated — ${itemsDesc} returned. New total: Rs. ${Math.round(record.total)}. Updated invoice attached.`;
  const normalizedPhone = phone.replace(/\D/g, '');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);
  let response: Response;
  try {
    response = await window.fetch(`${supabaseUrl}/functions/v1/send-hosur-whatsapp`, {
      method: 'POST',
      // SECURITY FIX (2026-09-09): the function now requires a valid staff
      // session — see send-hosur-whatsapp/index.ts.
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-cafe-session': getAppSessionToken() ?? '' },
      body: JSON.stringify({ phone: normalizedPhone, message, messageType: 'manual', billDocument: pdf, billNo: record.invoiceNo }),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
  const responseText = await response.text();
  let fnData: { ok?: boolean; error?: string; mediaErrors?: string[] } = {};
  if (responseText) {
    try { fnData = JSON.parse(responseText); } catch { throw new Error(`WhatsApp service returned an invalid response (HTTP ${response.status}).`); }
  }
  if (!response.ok || !fnData.ok) {
    throw new Error([fnData.error, ...(fnData.mediaErrors ?? [])].filter(Boolean).join(' | ') || `WhatsApp service returned HTTP ${response.status}.`);
  }
}

// FEATURE (2026-09-08): Planner Sales tab's new "Advance Sales" sub-tab — bill
// store/cafe/custom items with a partial advance now, collect the balance and
// print the final bill later. Lives in its own `advance_sales` table (not
// bakery_walkin_bills/dispatch_invoices) since it's a genuinely different
// lifecycle (advance -> paid, with a delivery date and a balance still owed)
// rather than a one-shot bill. The "ADV/26-27/N continues as BILL/26-27/N"
// requirement needs no special numbering trick: ONE number (`fySeq`) is
// minted once via next_advance_sale_number() and never re-minted — the
// printed prefix is derived purely from `status` (see advanceSaleToInvoiceRecord
// below), so "settling" an advance never changes its number, only its label.
export interface AdvanceSaleItem { itemName: string; unit: string; quantity: number; unitPrice: number; lineTotal: number; hsnCode?: string; gstPct?: number }

export interface AdvanceSaleRecord {
  id: string;
  fySeq: string;
  source: 'store' | 'cafe' | 'custom';
  customerName: string | null;
  customerPhone: string | null;
  items: AdvanceSaleItem[];
  subtotal: number;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  discountAmount: number;
  roundOff: number;
  total: number;
  advanceAmount: number;
  balanceAmount: number;
  advancePaymentMode: string | null;
  finalPaymentMode: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  status: 'advance' | 'paid' | 'cancelled';
  isGstInvoice: boolean;
  gstSupplyType: 'intra' | 'inter';
  createdBy: string;
  createdAt: string;
  paidAt: string | null;
  paidBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelledReason: string | null;
  notes: string | null;
}

function mapAdvanceSale(row: Record<string, unknown>): AdvanceSaleRecord {
  return {
    id: row.id as string,
    fySeq: String(row.fy_seq ?? ''),
    source: (row.source as AdvanceSaleRecord['source']) ?? 'store',
    customerName: (row.customer_name as string | null) ?? null,
    customerPhone: (row.customer_phone as string | null) ?? null,
    items: (row.items as AdvanceSaleItem[] | null) ?? [],
    subtotal: Number(row.subtotal ?? 0),
    discountType: (row.discount_type as AdvanceSaleRecord['discountType']) ?? 'none',
    discountValue: Number(row.discount_value ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    roundOff: Number(row.round_off ?? 0),
    total: Number(row.total ?? 0),
    advanceAmount: Number(row.advance_amount ?? 0),
    balanceAmount: Number(row.balance_amount ?? 0),
    advancePaymentMode: (row.advance_payment_mode as string | null) ?? null,
    finalPaymentMode: (row.final_payment_mode as string | null) ?? null,
    deliveryDate: (row.delivery_date as string | null) ?? null,
    deliveryTime: (row.delivery_time as string | null) ?? null,
    status: (row.status as AdvanceSaleRecord['status']) ?? 'advance',
    isGstInvoice: Boolean(row.is_gst_invoice),
    gstSupplyType: (row.gst_supply_type as 'intra' | 'inter' | null) ?? 'intra',
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
    paidAt: (row.paid_at as string | null) ?? null,
    paidBy: (row.paid_by as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    cancelledReason: (row.cancelled_reason as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

// Adapts an AdvanceSaleRecord into the shared DispatchInvoiceRecord shape so
// it renders/prints through the exact same renderDispatchInvoiceHtml template
// as every other bill in the app (see the advanceAmount/balanceAmount/
// deliveryDate fields added to that interface above).
export function advanceSaleToInvoiceRecord(sale: AdvanceSaleRecord): DispatchInvoiceRecord {
  const invoiceNo = `${sale.status === 'paid' ? 'BILL' : 'ADV'}/${sale.fySeq}`;
  return {
    id: sale.id,
    invoiceNo,
    scope: 'SNB',
    hosurShopId: null, hosurShopName: null, hosurShopPhone: null,
    customerName: sale.customerName || 'Walk-in Customer',
    customerPhone: sale.customerPhone,
    customerAddress: null,
    dispatchedBy: sale.status === 'paid' ? (sale.paidBy || sale.createdBy) : sale.createdBy,
    items: sale.items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, hsnCode: i.hsnCode, gstPct: i.gstPct })),
    subtotal: sale.subtotal,
    discountPct: sale.discountType === 'percent' ? sale.discountValue : 0,
    discountAmount: sale.discountAmount,
    roundOff: sale.roundOff,
    total: sale.total,
    status: sale.status === 'cancelled' ? 'cancelled' : sale.status === 'paid' ? 'paid' : 'unpaid',
    paidAt: sale.paidAt,
    notes: sale.notes,
    createdAt: sale.createdAt,
    dispatchEntryIds: [],
    isGstInvoice: sale.isGstInvoice,
    gstSupplyType: sale.gstSupplyType,
    cancelledBy: sale.cancelledBy,
    cancelledAt: sale.cancelledAt,
    cancelledReason: sale.cancelledReason,
    originalItems: null,
    returnLog: [],
    advanceAmount: sale.advanceAmount,
    balanceAmount: sale.balanceAmount,
    deliveryDate: sale.deliveryDate,
    deliveryTime: sale.deliveryTime,
  };
}

export async function saveAdvanceSale(input: {
  source: 'store' | 'cafe' | 'custom';
  customerName?: string | null;
  customerPhone?: string | null;
  items: AdvanceSaleItem[];
  discountType?: 'none' | 'percent' | 'amount';
  discountValue?: number;
  advanceAmount: number;
  advancePaymentMode: 'cash' | 'upi' | 'card';
  deliveryDate: string;
  deliveryTime?: string | null;
  createdBy: string;
  isGstInvoice?: boolean;
  gstSupplyType?: 'intra' | 'inter';
  notes?: string | null;
}): Promise<{ ok: true; record: AdvanceSaleRecord } | { error: string }> {
  const cleanedItems = input.items.filter(i => i.itemName.trim() && i.quantity > 0 && i.unitPrice >= 0);
  if (cleanedItems.length === 0) return { error: 'Add at least one item with a name, quantity above 0 and a valid price.' };
  if (!input.deliveryDate) return { error: 'Delivery date is required.' };
  if (!(input.advanceAmount > 0)) return { error: 'Enter an advance amount greater than 0.' };

  const subtotal = Math.round(cleanedItems.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const discountType = input.discountType ?? 'none';
  const safeDiscountValue = Math.max(0, input.discountValue ?? 0);
  const discountAmount = discountType === 'percent'
    ? Math.round(subtotal * (Math.min(100, safeDiscountValue) / 100) * 100) / 100
    : discountType === 'amount'
    ? Math.min(subtotal, safeDiscountValue)
    : 0;
  const preRound = subtotal - discountAmount;
  const total = Math.max(0, Math.round(preRound));
  const roundOff = Math.round((total - preRound) * 100) / 100;

  if (input.advanceAmount > total) return { error: `Advance amount can't exceed the total bill amount (Rs ${total}).` };
  const balanceAmount = Math.round((total - input.advanceAmount) * 100) / 100;

  const { data: fySeq, error: seqErr } = await supabase.rpc('next_advance_sale_number');
  if (seqErr || !fySeq) return { error: seqErr?.message || 'Failed to generate the advance bill number.' };

  const { data, error } = await supabase.from('advance_sales').insert({
    fy_seq: fySeq,
    source: input.source,
    customer_name: input.customerName?.trim() || null,
    customer_phone: input.customerPhone?.trim() || null,
    items: cleanedItems,
    subtotal, discount_type: discountType, discount_value: safeDiscountValue, discount_amount: discountAmount,
    round_off: roundOff, total,
    advance_amount: input.advanceAmount, balance_amount: balanceAmount,
    advance_payment_mode: input.advancePaymentMode,
    delivery_date: input.deliveryDate, delivery_time: input.deliveryTime || null,
    status: 'advance',
    is_gst_invoice: input.isGstInvoice ?? false, gst_supply_type: input.gstSupplyType ?? 'intra',
    created_by: input.createdBy,
    notes: input.notes || null,
  }).select('*').single();
  if (error || !data) return { error: error?.message || 'Failed to save the advance sale.' };

  const record = mapAdvanceSale(data as Record<string, unknown>);
  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Created Advance Sale',
      detail: `${invoiceNoFor(record)} — ${record.customerName || 'Walk-in'} — Total Rs. ${Math.round(total)}, Advance Rs. ${Math.round(input.advanceAmount)}, Balance Rs. ${Math.round(balanceAmount)}, Delivery ${input.deliveryDate}`,
      branch: 'SNB',
    });
  }
  return { ok: true, record };
}

function invoiceNoFor(sale: AdvanceSaleRecord): string {
  return `${sale.status === 'paid' ? 'BILL' : 'ADV'}/${sale.fySeq}`;
}

export async function settleAdvanceSale(params: {
  id: string;
  finalPaymentMode: 'cash' | 'upi' | 'card';
  settledBy: string;
}): Promise<{ ok: true; record: AdvanceSaleRecord } | { error: string }> {
  const { data: row, error: fetchErr } = await supabase.from('advance_sales').select('*').eq('id', params.id).single();
  if (fetchErr || !row) return { error: fetchErr?.message || 'Advance sale not found.' };
  const original = mapAdvanceSale(row as Record<string, unknown>);
  if (original.status === 'cancelled') return { error: 'This advance sale has been cancelled.' };
  if (original.status === 'paid') return { error: 'This advance sale is already fully paid.' };

  const paidAt = new Date().toISOString();
  // Compare-and-swap: only the request that actually flips 'advance' -> 'paid'
  // proceeds to debit stock below — same race-safety pattern already used by
  // cancelDispatchInvoice/cancelBill this session.
  const { data: claimed, error: claimErr } = await supabase.from('advance_sales')
    .update({ status: 'paid', paid_at: paidAt, paid_by: params.settledBy, final_payment_mode: params.finalPaymentMode })
    .eq('id', params.id).eq('status', 'advance').select('id');
  if (claimErr) return { error: claimErr.message || 'Failed to settle the advance sale.' };
  if (!claimed || claimed.length === 0) return { error: 'This advance sale was already settled or cancelled by someone else — refresh and try again.' };

  // Stock debits only now, at final settlement (per owner's explicit
  // decision) — Cafe items are a separate POS domain with no Closing Stock
  // pool entry, so only 'store'/'custom' sourced lines get a movement.
  if (original.source !== 'cafe') {
    try {
      const { recordLeftoverMovement, kolkataToday } = await import('./PlannerLeftoverTab');
      for (const item of original.items) {
        if (item.unit === 'charge') continue;
        const result = await recordLeftoverMovement({
          itemName: item.itemName,
          unit: item.unit === 'pcs' ? 'pcs' : 'kg',
          delta: -Math.abs(item.quantity),
          businessDate: kolkataToday(),
          reason: 'dispatch',
          recordedBy: params.settledBy,
          notes: `Advance Sale settled — ${invoiceNoFor({ ...original, status: 'paid' })}${original.customerName ? ` — ${original.customerName}` : ''}`,
        });
        if ('error' in result) console.error('[settleAdvanceSale] Stock debit failed for', item.itemName, result.error);
      }
    } catch (err) {
      console.error('[settleAdvanceSale] Stock debit threw:', err);
    }
  }

  const { data: freshRow } = await supabase.from('advance_sales').select('*').eq('id', params.id).single();
  const record = freshRow ? mapAdvanceSale(freshRow as Record<string, unknown>) : { ...original, status: 'paid' as const, paidAt, paidBy: params.settledBy, finalPaymentMode: params.finalPaymentMode };

  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Settled Advance Sale',
      detail: `${invoiceNoFor(record)} (was ${invoiceNoFor({ ...original, status: 'advance' })}) — ${record.customerName || 'Walk-in'} — Balance Rs. ${Math.round(original.balanceAmount)} paid via ${params.finalPaymentMode.toUpperCase()}`,
      branch: 'SNB',
    });
  }
  return { ok: true, record };
}

export async function cancelAdvanceSale(params: {
  id: string;
  reason?: string;
  cancelledBy: string;
}): Promise<{ ok: true; record: AdvanceSaleRecord } | { error: string }> {
  const cancelledAt = new Date().toISOString();
  // BUG FIX (audit pass): .single() throws (PGRST116) instead of returning
  // data:null when the compare-and-swap matches zero rows — the exact "lost
  // the race / already settled" case this needs to detect gracefully. Same
  // fix shape as cancelDispatchInvoice/cancelBill: select as an array and
  // check its length instead.
  const { data: claimed, error: claimErr } = await supabase.from('advance_sales')
    .update({ status: 'cancelled', cancelled_at: cancelledAt, cancelled_by: params.cancelledBy, cancelled_reason: params.reason ?? null })
    .eq('id', params.id).neq('status', 'cancelled').neq('status', 'paid').select('*');
  if (claimErr) return { error: claimErr.message || 'Failed to cancel the advance sale.' };
  if (!claimed || claimed.length === 0) return { error: "Can't cancel — this advance sale is already fully paid or was already cancelled." };

  const record = mapAdvanceSale(claimed[0] as Record<string, unknown>);
  const { useAuthStore } = await import('@/stores/authStore');
  const user = useAuthStore.getState().currentUser;
  if (user) {
    const { useActivityLogStore } = await import('./activityLogStore');
    void useActivityLogStore.getState().log({
      staffId: user.id, staffName: user.displayName, role: user.role,
      action: 'Cancelled Advance Sale',
      detail: `${invoiceNoFor(record)} — ${record.customerName || 'Walk-in'}${params.reason ? ` — ${params.reason}` : ''}`,
      branch: 'SNB',
    });
  }
  return { ok: true, record };
}

export async function listAdvanceSales(opts: {
  fromDate: string;
  toDate: string;
  status?: 'advance' | 'paid' | 'cancelled';
}): Promise<AdvanceSaleRecord[]> {
  // BUG FIX (2026-09-08): plain `.limit()` calls are silently capped at
  // 1000 rows by PostgREST's project-wide response cap — see fetchAllRows
  // in src/lib/supabase.ts. Paged from the start here rather than waiting
  // to discover it the same way the Cafe sales bug was found.
  const { data, error } = await fetchAllRows<Record<string, unknown>>(
    'advance_sales',
    (q) => {
      let query = q.select('*')
        .gte('created_at', opts.fromDate).lt('created_at', opts.toDate)
        .order('created_at', { ascending: false });
      if (opts.status) query = query.eq('status', opts.status);
      return query;
    },
    { maxRows: 20000 },
  );
  if (error) throw new Error(error);
  return (data ?? []).map(mapAdvanceSale);
}
