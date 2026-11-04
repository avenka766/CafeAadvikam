import {changeSampleInvoice} from './sampleInvoiceRequest';
import {combineDispatchReturns,dispatchRevisionError} from './dispatchRevisionValidation';
import {financialLineTotal,financialPercent} from '@/lib/financialRounding';
import {saveWebDispatch} from './webDispatchRequest';
import {closingStockItemSlug} from './itemMatcher';
import {isElectronApp} from '@/lib/platform';
import {automaticDesktopBilling,captureDesktopBill,billingSnapshot,desktopCheckoutIdentity,finishDesktopCheckout} from '@/lib/desktopBilling';
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
import { jsPDF } from 'jspdf';
import { calculatePlannerSalesGst } from './plannerSalesGst';
import { hosurInvoiceLedgerLines,reconcileHosurLedgerTotal } from './hosurGstLedger';
import { buildGstTaxInvoiceHtml, type GstPartyDetails } from './gstTaxInvoice';

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
  gstPricing?: 'exclusive';
  gstBuyerDetails?: GstPartyDetails;
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
  name: 'VRSNB Foods LLP',
  lines: ['109/1C, Bagalur Main Road, Berigai', 'Hosur-635105', 'Phone: 9095445444'],
  gstin: '33AAZFV1266C1ZZ',
  fssai: '12425011000098',
};

export function businessFor(scope: DispatchInvoiceScope): DispatchInvoiceBusiness {
  // Planner dispatch invoices use the same legal entity, including cakes.
  return VRSNB_FOODS_BUSINESS;
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
    const prefix = scope === 'SNB' || scope === 'VRSNB' || scope === 'Cake' ? 'TO' : scope === 'Hosur' ? 'SALES' : scope;
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
  workflowResult?: Record<string,any>;
  workflowDuplicate?: boolean;
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
  desktopActions?: Record<string,unknown>[];
  desktopCakeOrders?:Record<string,any>[];
  desktopHosurBilling?: Record<string,unknown>;
  desktopKey?:string;
}): Promise<DispatchInvoiceRecord> {
  // AUDIT FIX (2026-09-02): discountPct is planner-entered and, until now, was
  // trusted verbatim with no bound in either direction — a stray value (typo,
  // bad state, or a compromised session) could zero out or invert a real
  // dispatch invoice. Clamped here so this single choke point protects every
  // caller; the DB now also enforces the same 0-100 range as a hard backstop
  // (dispatch_invoices_discount_pct_range constraint) in case a future write
  // path bypasses this function entirely.
  if(input.desktopHosurBilling || input.desktopCakeOrders?.length) input={...input,items:input.items.map(i=>({...i,lineTotal:financialLineTotal(i.quantity,i.unitPrice)}))};
  const safeDiscountPct = Math.min(100, Math.max(0, input.discountPct || 0));
  const subtotal = Math.round(input.items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const discountAmount = financialPercent(subtotal,safeDiscountPct);
  const preRound = subtotal - discountAmount;
  const exclusiveGst = input.isGstInvoice && input.items.some(i => i.gstPricing === 'exclusive');
  const total = exclusiveGst ? calculatePlannerSalesGst(subtotal, discountAmount, true, input.items.find(i=>i.gstPricing === 'exclusive')?.gstPct || 0, input.gstSupplyType).total : Math.round(preRound);
  const roundOff = exclusiveGst ? 0 : Math.round((total - preRound) * 100) / 100;
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
  const rpcArgs = {
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
    p_number_scope: input.numberScope ?? (input.scope === 'Cake' ? 'SNB' : null),
  };
  const desktopLedgerLines=input.desktopHosurBilling?reconcileHosurLedgerTotal(hosurInvoiceLedgerLines(input.items,safeDiscountPct),total):[];
  const desktop=automaticDesktopBilling()?await captureDesktopBill({kind:'dispatch',family:(input.numberScope==='Hosur'||input.scope==='Hosur')?'SALES':'TO',key:input.desktopKey||((input.dispatchEntryIds?.length)?'dispatch:'+input.dispatchEntryIds.map(r=>r.dispatchEntryId).sort().join(','):'invoice:'+desktopCheckoutIdentity('dispatch-invoice:'+input.scope)),rpc:'save_dispatch_invoice_secure',args:rpcArgs,
    dispatchActions:input.desktopActions||[],cakeOrders:input.desktopCakeOrders||[],hosurBilling:input.desktopHosurBilling?{...input.desktopHosurBilling,ledgerLines:desktopLedgerLines,total}:undefined,
    receipt:{...input,subtotal,discountPct:safeDiscountPct,discountAmount,roundOff,total,status}}):null;
  const regular=Boolean(input.desktopActions?.length);
  const {data,error}=desktop?{data:desktop.data,error:null}:(regular || input.desktopHosurBilling || input.desktopCakeOrders?.length) ? {data:await saveWebDispatch({p_invoice:regular?{...rpcArgs,p_regular_actions:input.desktopActions,p_regular_hosur:input.desktopHosurBilling||null}:rpcArgs,p_hosur:!regular&&input.desktopHosurBilling?{...input.desktopHosurBilling,ledgerLines:desktopLedgerLines,total}:null,p_cakes:input.desktopCakeOrders||[]}),error:null} : await supabase.rpc('save_dispatch_invoice_secure',rpcArgs).single();
  if (error) throw error;
  if(desktop)finishDesktopCheckout('dispatch-invoice:'+input.scope);
  const row = data as { id: string; invoice_no: string; created_at: string; paid_at: string | null;workflow_result?:Record<string,any>;workflow_duplicate?:boolean };
  const invoiceNo = row.invoice_no;

  return {
    id: row.id,
    workflowResult:row.workflow_result,workflowDuplicate:row.workflow_duplicate,
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
export async function markDispatchInvoicePaid(record: DispatchInvoiceRecord, _recordedBy: string): Promise<{ ok: true } | { error: string }> {
  try { await changeSampleInvoice(record,'pay'); return {ok:true}; }
  catch(cause){return {error:cause instanceof Error?cause.message:'Invoice could not be confirmed.'};}
}

// Sales (New Bill / Sample Bill, bakery_walkin_bills) shares dispatch
// invoices' printed template but not its table — these three moved here
// (2026-09-03, previously PlannerDashboard.tsx-local) so Admin's Dispatch
// Details tab can render/print Sales rows through the identical invoice
// template without importing that whole page module.
export interface WalkinBillItem { stockSlug?: string; itemName: string; unit: string; price: number; quantity: number; lineTotal: number; hsnCode?: string; gstPct?: number; gstPricing?: 'exclusive'; gstBuyerDetails?: GstPartyDetails }
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
}, requestId: string = crypto.randomUUID()): Promise<WalkinBillRow> {
  const {data,error} = await supabase.rpc('save_walkin_bill_atomic_v1', {
    p_request_id: requestId,
    p_sale: {...input,items:input.items.map(i=>({...i,...(i.unit!=='charge'?{stockSlug:closingStockItemSlug(i.itemName)}:{})}))},
  }).single();
  if (error) throw error;
  return mapWalkinBill(data as Record<string, unknown>);
}

export function walkinExpectedSnapshot(bill: WalkinBillRow) {
  return {items:bill.items,subtotal:bill.subtotal,discountType:bill.discountType,discountValue:bill.discountValue,
    discountAmount:bill.discountAmount,total:bill.total,paymentMode:bill.paymentMode,status:bill.status,
    customerName:bill.customerName,customerMobile:bill.customerMobile,isGstInvoice:bill.isGstInvoice,gstSupplyType:bill.gstSupplyType};
}
export async function changeWalkinBillAtomic(bill:WalkinBillRow,action:'edit'|'cancel',change:Record<string,unknown>,reason:string,requestId:string):Promise<WalkinBillRow> {
  const update={...change,...(Array.isArray(change.items)?{items:(change.items as WalkinBillItem[]).map(i=>({...i,...(i.unit!=='charge'?{stockSlug:closingStockItemSlug(i.itemName)}:{})}))}:{})};
  const {data,error}=await supabase.rpc('change_walkin_bill_atomic_v1',{
    p_request_id:requestId,p_bill_id:bill.id,p_expected:walkinExpectedSnapshot(bill),p_action:action,p_change:update,
    p_original_slugs:bill.items.map(i=>closingStockItemSlug(i.itemName)),p_reason:reason,
  }).single();
  if(error)throw new Error(error.message);
  return mapWalkinBill(data as Record<string,unknown>);
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
    items: bill.items.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: i.price, lineTotal: i.lineTotal, hsnCode: i.hsnCode, gstPct: i.gstPct, gstPricing: i.gstPricing, gstBuyerDetails: i.gstBuyerDetails })),
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

export function renderSavedSalesTaxInvoice(bill: WalkinBillRow, paper:'a4'|'thermal'=isElectronApp()?'thermal':'a4') {
  const first = bill.items.find(item => item.unit !== 'charge');
  const buyer = first?.gstBuyerDetails ?? {name: bill.customerName || 'Walk-in Customer', address: '', gstin: '', stateName: 'Tamil Nadu', stateCode: '33'};
  return buildGstTaxInvoiceHtml({
    paper, buyer, consignee: buyer, invoiceNo: bill.billNo, invoiceDate: new Date(bill.createdAt).toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}), supplyType: bill.gstSupplyType,
    preparedBy: bill.cashierName || 'Planner', modeOfPayment: bill.paymentMode,
    lines: bill.items.map(item => ({itemName:item.itemName,qty:item.quantity,rate:item.price,uom:item.unit==='pcs'?'Nos':item.unit==='kg'?'Kg':item.unit,hsnCode:first?.hsnCode || '',gstPct:first?.gstPct || 0})),
    overallSalesTax: {subtotal:bill.subtotal,discountAmount:bill.discountAmount,gstPct:first?.gstPct || 0},
  }).html;
}

export function renderSavedDispatchTaxInvoice(record: DispatchInvoiceRecord,paper:'a4'|'thermal'=isElectronApp()?'thermal':'a4') {
  const first = record.items.find(i => i.unit !== 'charge');
  const buyer = first?.gstBuyerDetails ?? {name:record.customerName || record.hosurShopName || 'Customer', address:record.customerAddress || '', gstin:'', stateName:'Tamil Nadu', stateCode:'33'};
  return buildGstTaxInvoiceHtml({paper,buyer,consignee:buyer,invoiceNo:record.invoiceNo,invoiceDate:new Date(record.createdAt).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),supplyType:record.gstSupplyType,preparedBy:record.dispatchedBy,
    lines:record.items.map(i=>({itemName:i.itemName,qty:i.quantity,rate:i.unitPrice,uom:i.unit==='pcs'?'Nos':i.unit==='kg'?'Kg':i.unit,hsnCode:first?.hsnCode || '',gstPct:first?.gstPct || 0})),
    overallSalesTax:{subtotal:record.subtotal,discountAmount:record.discountAmount,gstPct:first?.gstPct || 0}}).html;
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
    : record.scope === 'VRSNB' ? 'Cafe Aadvikam' : `${esc(record.scope)} Branch`;
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
  //
  // REDESIGN (2026-09-12): "the client is not satisfied with the gst bill —
  // they want the same [document], same details as the sales tab invoice
  // bill, and the gst should not be on each item, it should be on the
  // overall [bill], and the gst amount is not calculated correctly." Two
  // real bugs, both fixed by computing tax ONCE on the whole bill instead of
  // per line:
  //  1. The old per-line calc rebuilt a "charged amount" via `discountMult =
  //     1 - (record.discountPct || 0) / 100` — discountPct is only ever set
  //     for a PERCENT-type discount (see walkinBillToInvoiceRecord), so a
  //     flat-₹ discount left discountMult at 1 (no discount applied) and the
  //     printed GST figure was computed on the wrong, pre-discount amount.
  //  2. Per-item HSN/GST% inputs (one per cart line) produced a confusing
  //     multi-row "GST Summary" grouped by rate — the client wants ONE flat
  //     rate for the whole bill instead.
  // BillingTab/DispatchReviewModal now write the SAME gstPct/hsnCode onto
  // every line at save time (see their own comments) — take the first
  // non-charge line's values as "the" bill-level rate/HSN, and tax the
  // bill's own final `total` directly (already reflects every discount type
  // + charges) — structurally can't disagree with the Net Bill Amount shown
  // right below it, whatever the discount type.
  const isGst = record.isGstInvoice;
  const gstPct = isGst ? Math.max(0, Number(record.items.find(i => i.unit !== 'charge')?.gstPct) || 0) : 0;
  const gstHsnCode = isGst ? (record.items.find(i => i.unit !== 'charge')?.hsnCode || '').trim() : '';
  const chargedAmount = Math.round(record.total * 100) / 100;
  const exclusiveGst = isGst && record.items.some(item => item.gstPricing === 'exclusive');
  const formatAmount = (value: number) => exclusiveGst ? value.toFixed(2) : String(Math.round(value));
  const taxableValue = exclusiveGst ? Math.round(Math.max(0, record.subtotal - record.discountAmount) * 100) / 100 : isGst && gstPct > 0 ? Math.round((chargedAmount / (1 + gstPct / 100)) * 100) / 100 : chargedAmount;
  const totalTax = isGst && gstPct > 0 ? Math.round((chargedAmount - taxableValue) * 100) / 100 : 0;
  const cgstAmt = isGst && record.gstSupplyType === 'intra' ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const sgstAmt = isGst && record.gstSupplyType === 'intra' ? Math.round((totalTax - cgstAmt) * 100) / 100 : 0;
  const igstAmt = isGst && record.gstSupplyType === 'inter' ? totalTax : 0;

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
  // BUG FIX (2026-09-28): "DILPASAND was sent 200 pcs but its showing as 2"
  // — a dispatch can split one item into an ordered line + an "EXTRA
  // (non-requested item)" line (see submitDispatch's extraNote in
  // bakeryStore.ts). Those were kept as separate DispatchInvoiceItem array
  // entries, so this printed tax invoice showed the same item name twice
  // with no explanation at all (worse than the app, which at least has a
  // ledger note) — matches the same duplicate-row complaint already fixed
  // in the branch Incoming tab (StockTab.tsx), now applied here too. Sum
  // same-key entries into ONE aggregated value, keyed the same way
  // returnedByKey already was, instead of the old last-write-wins Map.
  const netByKey = new Map<string, { quantity: number; lineTotal: number }>();
  for (const i of record.items) {
    const k = itemKey(i.itemName, i.unit);
    const existing = netByKey.get(k);
    if (existing) { existing.quantity += i.quantity; existing.lineTotal += i.lineTotal; }
    else netByKey.set(k, { quantity: i.quantity, lineTotal: i.lineTotal });
  }
  // Charge lines never belong in the real-item table (see chargeItems above)
  // — same exclusion applied to whichever source array (returned invoices
  // read from originalItems instead of record.items).
  const rowSourceItems = (isReturned ? (record.originalItems ?? record.items) : record.items).filter(i => i.unit !== 'charge');
  interface MergedRow { itemName: string; unit: string; quantity: number; lineTotal: number }
  const mergedByKey = new Map<string, MergedRow>();
  const mergedOrder: string[] = [];
  for (const i of rowSourceItems) {
    const k = itemKey(i.itemName, i.unit);
    const existing = mergedByKey.get(k);
    if (existing) { existing.quantity += i.quantity; existing.lineTotal += i.lineTotal; }
    else { mergedByKey.set(k, { itemName: i.itemName, unit: i.unit, quantity: i.quantity, lineTotal: i.lineTotal }); mergedOrder.push(k); }
  }
  const rows = mergedOrder.map((k, idx) => {
    const m = mergedByKey.get(k)!;
    const netItem = netByKey.get(k);
    const netQty = netItem ? netItem.quantity : 0;
    const netAmount = netItem ? netItem.lineTotal : 0;
    const returnedQty = returnedByKey.get(k) ?? 0;
    const effectiveRate = m.quantity > 0 ? m.lineTotal / m.quantity : 0;
    return `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(m.itemName)}</td>
      ${isReturned
        ? `<td class="num">${fmtQty(m.quantity)}</td><td class="num">${returnedQty > 0 ? fmtQty(returnedQty) : '-'}</td><td class="num">${fmtQty(netQty)}</td>`
        : `<td class="num">${fmtQty(m.quantity)}</td>`}
      <td class="num">${formatAmount(effectiveRate)}</td>
      <td class="num">${formatAmount(netAmount)}</td>
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
    ${chargeItems.map(c => `<div class="row"><span>${esc(c.itemName)}</span><span>${formatAmount(c.lineTotal)}</span></div>`).join('')}` : '';
  const returnNoteHtml = record.returnLog.length > 0 ? `
    <div class="stamp-return">
      ${record.returnLog.map(entry => {
        const itemsDesc = entry.items.map(it => `${fmtQty(it.qty)} ${it.unit} ${esc(it.itemName)}`).join(', ');
        return `<div>Returned by ${esc(entry.by)} on ${esc(new Date(entry.at).toLocaleString('en-IN'))}: ${itemsDesc}${entry.reason ? ` — ${esc(entry.reason)}` : ''}</div>`;
      }).join('')}
    </div>` : '';

  // ONE row for the whole bill (not per item/rate) — matches the client's
  // explicit ask; see the REDESIGN comment above gstPct.
  const gstSummaryHtml = isGst && gstPct > 0 ? `
    <table>
      <thead><tr>
        ${gstHsnCode ? '<th>HSN</th>' : ''}<th class="num">Taxable Value</th>
        ${record.gstSupplyType === 'intra'
          ? `<th class="num">CGST @ ${(gstPct / 2).toFixed(2)}%</th><th class="num">SGST @ ${(gstPct / 2).toFixed(2)}%</th>`
          : `<th class="num">IGST @ ${gstPct.toFixed(2)}%</th>`}
        <th class="num">Tax Amt</th>
      </tr></thead>
      <tbody>
        <tr>
          ${gstHsnCode ? `<td>${esc(gstHsnCode)}</td>` : ''}
          <td class="num">${formatAmount(taxableValue)}</td>
          ${record.gstSupplyType === 'intra'
            ? `<td class="num">${formatAmount(cgstAmt)}</td><td class="num">${formatAmount(sgstAmt)}</td>`
            : `<td class="num">${formatAmount(igstAmt)}</td>`}
          <td class="num">${formatAmount(totalTax)}</td>
        </tr>
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
      <thead><tr><th>Sn</th><th>Item Name</th>${isReturned ? '<th class="num">Sent</th><th class="num">Returned</th><th class="num">Net</th>' : '<th class="num">Qty</th>'}<th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td></td><td>Total</td>${isReturned ? `<td></td><td></td><td class="num">${fmtQty(totalQty)}</td>` : `<td class="num">${fmtQty(totalQty)}</td>`}<td></td><td class="num">${formatAmount(itemsSubtotal)}</td></tr>
      </tbody>
    </table>
    ${chargesHtml}
    ${gstSummaryHtml}
    ${returnNoteHtml}
    <div class="summary">
      <div class="row"><span>Discount${record.discountPct ? ` (${record.discountPct}%)` : ''} :</span><span>${formatAmount(record.discountAmount)}</span></div>
      <div class="row"><span>Round-Off :</span><span>${record.roundOff >= 0 ? '+' : ''}${formatAmount(record.roundOff)}</span></div>
      ${isGst && gstPct > 0 ? `<div class="row"><span>${exclusiveGst ? 'GST added' : 'Includes GST'} @ ${gstPct}% :</span><span>Rs ${formatAmount(totalTax)}</span></div>` : ''}
      <div class="row net"><span>Net Bill Amount :</span><span>Rs ${formatAmount(record.total)}</span></div>
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
    html = record.isGstInvoice && record.items.some(i=>i.gstPricing === 'exclusive') ? renderSavedDispatchTaxInvoice(record,mode) : renderDispatchInvoiceHtml(record, mode);
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
  const remote=(data??[]).map(recordFromRow);
  if(!automaticDesktopBilling())return remote;
  const local=(await billingSnapshot()).actions.filter(a=>a.kind==='dispatch'&&a.sync?.state!=='synced'&&(!opts.scope||a.receipt.scope===opts.scope)&&new Date(a.createdAt)>=new Date(opts.fromDate)&&new Date(a.createdAt)<new Date(opts.toDate)).filter(a=>!remote.some(r=>r.invoiceNo===a.billNo)).map(a=>({...a.receipt,id:a.id,invoiceNo:a.billNo,createdAt:a.createdAt,paidAt:a.receipt.status==='unpaid'?null:a.createdAt,dispatchEntryIds:a.receipt.dispatchEntryIds||[],cancelledBy:null,cancelledAt:null,cancelledReason:null,originalItems:null,returnLog:[]} as unknown as DispatchInvoiceRecord));
  return [...remote,...local].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

// Invoice, stock, credit and return audit changes are committed by one RPC.
export async function updateDispatchInvoice(params: {
  invoiceId:string;updatedItems:DispatchInvoiceItem[];updatedDiscountPct:number;editedBy:string;
  isGstInvoice?:boolean;gstSupplyType?:'intra'|'inter';
}):Promise<{ok:true;record:DispatchInvoiceRecord;stockSynced:boolean;hosurWhatsapp?:{ok:boolean;billNo?:string;whatsappStatus?:'sent'|'failed';whatsappError?:string|null;message?:string}}|{error:string}>{
 const invalid=dispatchRevisionError(params.updatedItems,params.updatedDiscountPct);if(invalid)return {error:invalid};
 const {data,error}=await supabase.from('dispatch_invoices').select('*').eq('id',params.invoiceId).single();
 if(error||!data)return {error:error?.message||'Invoice not found.'};const original=recordFromRow(data);
 try {
  const items=params.updatedItems.filter(i=>i.itemName.trim()&&(i.unit==='charge'||i.quantity>0)).map(i=>({...i,itemName:i.itemName.trim(),quantity:i.unit==='charge'?1:i.quantity,lineTotal:financialLineTotal(i.unit==='charge'?1:i.quantity,i.unitPrice)}));
  if(original.notes?.startsWith('Sample Bill')&&!original.dispatchEntryIds.length){
   if(params.isGstInvoice)return {error:'Use the Sales GST billing workflow for a tax invoice.'};
   return {ok:true,record:recordFromRow(await changeSampleInvoice(original,'edit',{items,discountPct:params.updatedDiscountPct},'Edited sample bill')),stockSynced:true};
  }
  const {reviseDispatchInvoice}=await import('./dispatchInvoiceRevision');
  const row=await reviseDispatchInvoice(original,'edit',{items,discountPct:params.updatedDiscountPct,isGstInvoice:params.isGstInvoice??original.isGstInvoice,gstSupplyType:params.gstSupplyType??original.gstSupplyType});
  const record=recordFromRow(row);const hosurWhatsapp=await notifyRevisedHosur(row,record);
  return {ok:true,record,stockSynced:true,hosurWhatsapp};
 }catch(cause){return {error:cause instanceof Error?cause.message:'The correction could not be confirmed.'};}
}

async function notifyRevisedHosur(row:Record<string,unknown>,record:DispatchInvoiceRecord){
 if(!row.revision_hosur_bill_id||row.revision_duplicate)return undefined;
 try {const {notifyConfirmedHosurInvoice}=await import('./hosurBillingBridge');
  const sent=await notifyConfirmedHosurInvoice({...record,workflowResult:{hosurBillId:row.revision_hosur_bill_id}});
  return {ok:sent.whatsappStatus==='sent',billNo:sent.billNo,whatsappStatus:sent.whatsappStatus,whatsappError:sent.whatsappError};
 }catch(cause){return {ok:false,message:cause instanceof Error?cause.message:'Invoice saved; WhatsApp needs retry.'};}
}

export async function cancelDispatchInvoice(params:{invoiceId:string;reason?:string}):Promise<{ok:true;record:DispatchInvoiceRecord}|{error:string}>{
 if(automaticDesktopBilling()&&(await billingSnapshot()).actions.some(a=>a.id===params.invoiceId&&a.sync?.state!=='synced'))return {error:'This invoice is saved on this computer and is waiting to sync. Reconnect and wait for Synced before cancelling it.'};
 const {data,error}=await supabase.rpc('get_dispatch_invoice_for_change_v1',{p_invoice:params.invoiceId});
 if(error||!data)return {error:error?.message||'Invoice confirmation could not load. Refresh before cancelling; nothing was changed.'};const original=recordFromRow(data);
 try {
  let row:Record<string,unknown>;
  if(original.notes?.startsWith('Sample Bill')&&!original.dispatchEntryIds.length)row=await changeSampleInvoice(original,'cancel',{},params.reason||'Cancelled sample bill');
  else if(['SNB','VRSNB'].includes(original.scope)&&!original.customerName&&!original.hosurShopId){const {cancelBranchTransfer}=await import('./branchTransferCancellation');row=await cancelBranchTransfer(original,params.reason);}
  else {const {reviseDispatchInvoice}=await import('./dispatchInvoiceRevision');row=await reviseDispatchInvoice(original,'cancel',{},params.reason||'Cancelled invoice');}
  return {ok:true,record:recordFromRow(row)};
 }catch(cause){return {error:cause instanceof Error?cause.message:'Cancellation could not be confirmed.'};}
}

export async function returnDispatchInvoiceItems(params:{invoiceId:string;returns:{itemName:string;unit:string;qty:number}[];reason?:string;returnedBy:string}):Promise<{ok:true;record:DispatchInvoiceRecord;whatsapp?:{ok:boolean;error?:string}}|{error:string}>{
 let returns:ReturnType<typeof combineDispatchReturns>;
 try {returns=combineDispatchReturns(params.returns);}catch(cause){return {error:cause instanceof Error?cause.message:'Invalid return quantities.'};}
 if(!returns.length)return {error:'Enter a return quantity for at least one item.'};
 const {data,error}=await supabase.from('dispatch_invoices').select('*').eq('id',params.invoiceId).single();
 if(error||!data)return {error:error?.message||'Invoice not found.'};const original=recordFromRow(data);
 try {
  const {reviseDispatchInvoice,hasPendingDispatchInvoiceRevision}=await import('./dispatchInvoiceRevision');
  if(!hasPendingDispatchInvoiceRevision(original.id)){
 const invalid=dispatchRevisionError(original.items,original.discountPct);if(invalid)return {error:invalid};
 const key=(i:{itemName:string;unit:string})=>JSON.stringify([i.itemName.trim().toLowerCase(),i.unit]);
 const current=new Map(original.items.map(i=>[key(i),i]));if(current.size!==original.items.length)return {error:'Repeated invoice lines need reconciliation before returning items.'};
 for(const ret of returns){const item=current.get(key(ret));if(!item||ret.qty>item.quantity+1e-9)return {error:`Can't return ${ret.qty} ${ret.unit} of ${ret.itemName}; it exceeds the remaining invoice quantity.`};}
  }
  const row=await reviseDispatchInvoice(original,'return',{returns},params.reason||'Returned invoice items');const record=recordFromRow(row);
  const sent=await notifyRevisedHosur(row,record);let whatsapp=sent?{ok:sent.ok,error:sent.whatsappError||sent.message}:undefined;
  if(!sent&&!row.revision_duplicate){const phone=record.customerPhone||record.hosurShopPhone;if(phone){try{await sendDispatchInvoiceWhatsapp(record,returns,phone);whatsapp={ok:true,error:undefined};}catch(cause){whatsapp={ok:false,error:cause instanceof Error?cause.message:'Invoice saved; WhatsApp needs retry.'};}}}
  return {ok:true,record,whatsapp};
 }catch(cause){return {error:cause instanceof Error?cause.message:'The return could not be confirmed.'};}
}

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
  const who = record.customerName || record.hosurShopName || (record.scope === 'VRSNB' ? 'Cafe Aadvikam' : `${record.scope} Branch`);
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
