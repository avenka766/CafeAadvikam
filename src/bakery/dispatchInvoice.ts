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
import { supabase } from '@/lib/supabase';
import type { Branch } from './types';

export interface DispatchInvoiceItem {
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type DispatchInvoiceScope = Branch; // 'VRSNB' | 'SNB' | 'Hosur'

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
  return scope === 'SNB' ? SNB_BUSINESS : VRSNB_FOODS_BUSINESS;
}

// Default discount policy (2026-08-08): only SNB's catalog prices are
// pre-discount, so only SNB gets a real default discount. VRSNB's catalog
// prices are already the sell price and Hosur's shop price lists are already
// discounted — both default to 0% so nothing gets double-discounted. All
// three remain editable per invoice.
export function defaultDiscountPct(scope: DispatchInvoiceScope): number {
  return scope === 'SNB' ? 15 : 0;
}

export async function nextDispatchInvoiceNo(scope: DispatchInvoiceScope): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_dispatch_invoice_number', { p_scope: scope });
  if (error || !data) {
    const now = new Date();
    const prefix = scope === 'Hosur' ? 'HSR' : scope;
    return `${prefix}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${String(now.getTime()).slice(-4)}`;
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
  dispatchedBy: string;
  items: DispatchInvoiceItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  roundOff: number;
  total: number;
  createdAt: string;
}

export async function saveDispatchInvoice(input: {
  scope: DispatchInvoiceScope;
  hosurShopId?: string | null;
  hosurShopName?: string | null;
  hosurShopPhone?: string | null;
  dispatchedBy: string;
  items: DispatchInvoiceItem[];
  discountPct: number;
  dispatchEntryIds: { orderId: string; dispatchEntryId: string }[];
}): Promise<DispatchInvoiceRecord> {
  const subtotal = Math.round(input.items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const discountAmount = Math.round(subtotal * (input.discountPct / 100) * 100) / 100;
  const preRound = subtotal - discountAmount;
  const total = Math.round(preRound);
  const roundOff = Math.round((total - preRound) * 100) / 100;
  const invoiceNo = await nextDispatchInvoiceNo(input.scope);

  const { data, error } = await supabase.from('dispatch_invoices').insert({
    invoice_no: invoiceNo,
    scope: input.scope,
    hosur_shop_id: input.hosurShopId ?? null,
    hosur_shop_name: input.hosurShopName ?? null,
    hosur_shop_phone: input.hosurShopPhone ?? null,
    dispatched_by: input.dispatchedBy,
    items: input.items,
    subtotal,
    discount_pct: input.discountPct,
    discount_amount: discountAmount,
    round_off: roundOff,
    total,
    dispatch_entry_ids: input.dispatchEntryIds,
  }).select('id, created_at').single();
  if (error) throw error;

  return {
    id: data.id as string,
    invoiceNo,
    scope: input.scope,
    hosurShopId: input.hosurShopId ?? null,
    hosurShopName: input.hosurShopName ?? null,
    hosurShopPhone: input.hosurShopPhone ?? null,
    dispatchedBy: input.dispatchedBy,
    items: input.items,
    subtotal,
    discountPct: input.discountPct,
    discountAmount,
    roundOff,
    total,
    createdAt: data.created_at as string,
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
  const customerLine = record.scope === 'Hosur'
    ? `${esc(record.hosurShopName || 'Hosur Shop')}${record.hosurShopPhone ? ` ${esc(record.hosurShopPhone)}` : ''}`
    : `${esc(record.scope)} Branch`;
  const totalQty = record.items.reduce((s, i) => s + i.quantity, 0);
  const rows = record.items.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(i.itemName)}</td>
      <td class="num">${i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(3)}</td>
      <td class="num">${i.unitPrice.toFixed(2)}</td>
      <td class="num">${i.lineTotal.toFixed(2)}</td>
    </tr>`).join('');

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
  </style></head><body>
    <div class="c" style="font-weight:900;font-size:${mode === 'thermal' ? '16px' : '20px'}">${esc(business.name)}</div>
    <div class="c small">${business.lines.map(esc).join('<br/>')}</div>
    <div class="c small">GSTIN : ${esc(business.gstin)}${business.fssai ? ` &nbsp; FSSAI : ${esc(business.fssai)}` : ''}</div>
    <div class="c doc" style="font-weight:900;margin:6px 0">TAX INVOICE</div>
    <div class="row"><span>Bill No : ${esc(record.invoiceNo)}</span><span>Date : ${esc(dateStr)}</span></div>
    <div class="row"><span>${customerLine}</span><span>Time : ${esc(timeStr)}</span></div>
    <div class="dash"></div>
    <table>
      <thead><tr><th>Sn</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td></td><td>Total</td><td class="num">${totalQty % 1 === 0 ? totalQty : totalQty.toFixed(3)}</td><td></td><td class="num">${record.subtotal.toFixed(2)}</td></tr>
      </tbody>
    </table>
    <div class="summary">
      <div class="row"><span>Discount${record.discountPct ? ` (${record.discountPct}%)` : ''} :</span><span>${record.discountAmount.toFixed(2)}</span></div>
      <div class="row"><span>Round-Off :</span><span>${record.roundOff >= 0 ? '+' : ''}${record.roundOff.toFixed(2)}</span></div>
      <div class="row net"><span>Net Bill Amount :</span><span>Rs ${record.total.toFixed(2)}</span></div>
    </div>
    <div class="paybox"><div class="paytitle">Dispatched By</div><div class="pay"><span>${esc(record.dispatchedBy)}</span><span>${esc(dateStr)} ${esc(timeStr)}</span></div></div>
    <div class="dash"></div>
    <div class="footer">Thank you, Visit Again</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

export function printDispatchInvoice(record: DispatchInvoiceRecord, mode: 'a4' | 'thermal') {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(renderDispatchInvoiceHtml(record, mode));
  win.document.close();
}

function recordFromRow(row: Record<string, unknown>): DispatchInvoiceRecord {
  return {
    id: row.id as string,
    invoiceNo: String(row.invoice_no ?? ''),
    scope: row.scope as DispatchInvoiceScope,
    hosurShopId: (row.hosur_shop_id as string | null) ?? null,
    hosurShopName: (row.hosur_shop_name as string | null) ?? null,
    hosurShopPhone: (row.hosur_shop_phone as string | null) ?? null,
    dispatchedBy: String(row.dispatched_by ?? ''),
    items: (row.items as DispatchInvoiceItem[] | null) ?? [],
    subtotal: Number(row.subtotal ?? 0),
    discountPct: Number(row.discount_pct ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    roundOff: Number(row.round_off ?? 0),
    total: Number(row.total ?? 0),
    createdAt: String(row.created_at ?? ''),
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
  let query = supabase.from('dispatch_invoices').select('*')
    .gte('created_at', opts.fromDate)
    .lt('created_at', opts.toDate)
    .order('created_at', { ascending: false });
  if (opts.scope) query = query.eq('scope', opts.scope);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(recordFromRow);
}
