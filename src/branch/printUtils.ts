// src/branch/printUtils.ts
// Shared print utilities for branch billing — used by BranchBillingProTab and BranchBusinessModules

import { BRANCH_LABELS } from './types';
import type { BranchBillRecord } from './branchOpsStore';
import { supabase } from '@/lib/supabase';

export const BRANCH_PRINT_COMPLETE_EVENT = 'cafe-aadvikam:branch-print-complete';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const billRoundOff = (bill: BranchBillRecord) => bill.roundOff ?? roundMoney(
  bill.total - (bill.amountBeforeRoundOff ?? Math.max(0, bill.subtotal + bill.tax - bill.discount)),
);
const discountLabel = (bill: BranchBillRecord) => bill.discountPercent != null
  ? `Discount (${Number(bill.discountPercent).toFixed(2).replace(/\.00$/, '')}%)`
  : 'Discount';

// ─── Generic HTML print helper ─────────────────────────────────────────────────
export function printHtml(title: string, body: string) {
  const w = window.open('', '_blank', 'width=920,height=900');
  if (w) {
    w.document.write(
      `<!doctype html><html><head><title>${title}</title><style>
        @page{size:A4;margin:10mm}
        *{box-sizing:border-box}
        body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45}
        body:before{content:"";position:fixed;inset:0 0 auto 0;height:12px;background:linear-gradient(90deg,#f97316,#059669,#0f172a)}
        main{max-width:980px;margin:0 auto;background:#fff;min-height:100vh;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.08)}
        main:before{content:"${title}";display:block;margin:-4px 0 18px;padding:14px 16px;border-radius:24px;background:#0f172a;color:#fff;font-size:20px;font-weight:900;letter-spacing:.02em}
        h1,h2,h3{margin:0 0 10px;color:#0f172a}h1{font-size:24px}h2{font-size:18px}h3{font-size:14px}
        .b{font-weight:900}.c{text-align:center}.right{text-align:right}.muted{color:#64748b}
        .stamp{display:inline-block;border:0;border-radius:999px;background:#fff7ed;color:#c2410c;padding:7px 12px;text-align:center;font-weight:900;margin-bottom:12px;letter-spacing:.08em;text-transform:uppercase}
        .dash{border-top:1px dashed #cbd5e1;margin:12px 0}
        .row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #e2e8f0;padding:8px 0}
        .row span:first-child{color:#64748b;font-weight:800}.row b{font-weight:900}
        table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #e2e8f0;border-radius:16px;background:#fff}
        th,td{border-bottom:1px solid #e2e8f0;padding:9px 10px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}
        tr:nth-child(even) td{background:#f8fafc}tr:last-child td{border-bottom:0}
        td:last-child,th:last-child{text-align:right}
        .card,.section{border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:14px;margin-bottom:12px}
        @media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}body:before{position:absolute}main{box-shadow:none;max-width:none;padding:18px}button{display:none}.card,.section,table{break-inside:avoid;page-break-inside:avoid}}
      </style></head><body><main>${body}</main><script>window.onload=()=>window.print()</script></body></html>`,
    );
    w.document.close();
  }
}

// ─── VRSNB receipt-style counter bill ─────────────────────────────────────────
// Matches the physical receipt format from the SNB/VRSNB receipt image.
function printVrsnbReceiptBill(bill: BranchBillRecord, duplicate = false, target?: Window | null) {
  const returnBill = bill as BranchBillRecord & { _isReturn?: boolean; _originalBillNo?: string; _returnReason?: string };
  const printedAt = new Date(bill.createdAt);

  // DD/MM/YY format
  const dd = String(printedAt.getDate()).padStart(2, '0');
  const mm = String(printedAt.getMonth() + 1).padStart(2, '0');
  const yy = String(printedAt.getFullYear()).slice(-2);
  const dateStr = `${dd}/${mm}/${yy}`;

  // HH:MM format
  const timeStr = printedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const totalQty = bill.items.reduce((s, i) => s + i.quantity, 0);
  const payModeLabel = bill.paymentMode === 'split'
    ? (() => {
        const parts: string[] = [];
        if (bill.split?.cash) parts.push(`Cash ₹${Number(bill.split.cash).toFixed(2)}`);
        if (bill.split?.upi) parts.push(`UPI ₹${Number(bill.split.upi).toFixed(2)}`);
        if (bill.split?.card) parts.push(`Card ₹${Number(bill.split.card).toFixed(2)}`);
        return parts.join(' + ');
      })()
    : bill.paymentMode.toUpperCase();

  const customerNameLine = bill.paymentMode === 'credit' && bill.creditCustomerName
    ? bill.creditCustomerName
    : '';

  const html = `<!doctype html><html><head><title>${duplicate ? 'DUPLICATE BILL' : 'BILL'} ${bill.billNo}</title><style>
    @page{size:80mm auto;margin:3mm}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;width:72mm}
    .c{text-align:center}
    .bold{font-weight:900}
    .brand{font-size:22px;font-weight:900;letter-spacing:.04em;text-align:center;margin:4px 0}
    .sub{font-size:11px;text-align:center;margin:2px 0}
    .dash{border-top:1px solid #111;margin:5px 0}
    .row{display:flex;justify-content:space-between;gap:4px;padding:1px 0}
    .stamp{border:2px solid #111;padding:4px 8px;text-align:center;font-weight:900;font-size:13px;margin:4px 0;letter-spacing:.06em}
    table{width:100%;border-collapse:collapse}
    th{font-size:10px;font-weight:900;padding:3px 2px;border-top:1px solid #111;border-bottom:1px solid #111}
    td{font-size:11px;padding:2px 2px;vertical-align:top}
    .num{text-align:right}
    .total-row td{border-top:1px solid #111;font-weight:700;font-size:11px}
    .summary{font-size:11px;margin-top:4px}.summary .row{padding:1px 0}
    .grand{font-size:14px;font-weight:900;display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #111;border-bottom:1px solid #111;margin:4px 0}
    .footer{text-align:center;font-weight:900;font-size:12px;margin-top:6px}
    .paid-via{font-size:10px;margin:3px 0}
  </style></head><body>
    <div class="c sub">SHREE NANJUNDESHWARA BAKERY</div>
    <div class="brand">SNB</div>
    <div class="c sub">SWEETS &amp; BAKES</div>
    <div class="c sub">VRSNB FOODS LLP</div>
    ${returnBill._isReturn ? '<div class="stamp">RETURN BILL</div>' : duplicate ? '<div class="stamp">DUPLICATE BILL</div>' : '<div class="c bold" style="font-size:14px;margin:5px 0">PAID</div>'}
    <div class="dash"></div>
    <div class="c bold" style="font-size:13px">VRSNB FOODS LLP</div>
    <div class="c sub">#109/1C, Hosur main Road, Berigai,</div>
    <div class="c sub">Soolagiri TK, Krishnagiri DT,</div>
    <div class="c sub">Tamilnadu 635105</div>
    <div class="c sub">GST NO: 33AAZFV1266C1ZZ</div>
    <div class="c sub">FSSAI NO: 12425011000098</div>
    <div class="dash"></div>
    <div>Name: ${customerNameLine}</div>
    <div class="dash"></div>
    <div class="row"><span>Date: ${dateStr}</span><span class="bold">Pick Up</span></div>
    <div>${timeStr}</div>
    <div class="row"><span>Cashier: ${bill.biller}</span><span>Bill No.: ${bill.billNo}</span></div>
    ${returnBill._isReturn ? `<div class="row"><span>Original Bill</span><span>${returnBill._originalBillNo || '-'}</span></div><div>Reason: ${returnBill._returnReason || '-'}</div>` : ''}
    <div class="dash"></div>
    <table>
      <thead><tr><th style="text-align:left">Item</th><th class="num">Qty.</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${bill.items.map((i) => `<tr><td>${i.itemName}</td><td class="num">${i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(2)}</td><td class="num">${i.price.toFixed(2)}</td><td class="num">${i.lineTotal.toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="1"></td><td colspan="1" style="font-size:10px">Total Qty: ${totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)}</td><td style="font-size:10px;text-align:right">Sub Total</td><td class="num">${bill.subtotal.toFixed(2)}</td></tr>
      </tbody>
    </table>
    <div class="summary">
      ${Number(bill.additionalCharges || 0) > 0 ? `<div class="row"><span>Additional Charges</span><span>&#x20B9;${Number(bill.additionalCharges).toFixed(2)}</span></div>` : ''}
      <div class="row"><span>${discountLabel(bill)}</span><span>-&#x20B9;${bill.discount.toFixed(2)}</span></div>
      <div class="row"><span>Amount before round-off</span><span>&#x20B9;${(bill.amountBeforeRoundOff ?? Math.max(0, bill.subtotal + bill.tax - bill.discount)).toFixed(2)}</span></div>
      <div class="row"><span>Round-Off</span><span>${billRoundOff(bill) >= 0 ? '+' : ''}${billRoundOff(bill).toFixed(2)}</span></div>
    </div>
    <div class="grand"><span>Grand Total</span><span>&#x20B9;${bill.total.toFixed(2)}</span></div>
    <div class="paid-via">Paid via ${payModeLabel}</div>
    ${Number(bill.refundAmount || 0) > 0 ? `<div class="row bold"><span>Refunded via ${String(bill.refundMode || '').toUpperCase()}</span><span>&#x20B9;${Number(bill.refundAmount).toFixed(2)}</span></div>` : ''}
    <div class="dash"></div>
    <div class="footer">Thank You &amp; Visit Again...!!!</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const win = target ?? window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.open(); win.document.write(html); win.document.close(); }
}

// ─── Full-format counter bill (SNB style / tax invoice) ───────────────────────
function printSnbCounterBill(bill: BranchBillRecord, duplicate = false, target?: Window | null) {
  const returnBill = bill as BranchBillRecord & { _isReturn?: boolean; _originalBillNo?: string; _returnReason?: string };
  const title = returnBill._isReturn ? 'RETURN BILL' : duplicate ? 'DUPLICATE BILL' : 'ORIGINAL BILL';
  const business = {
    name: 'Sri Nanjundeshwara Bakery',
    lines: ['404, Bagalur Main Road, Berigai Bus Stand, Berigai, Shoolagiri Taluk', 'Krishnagiri, Tamil Nadu, Hosur-635105', 'Phone: 9942266779, 9095445444'],
    gstin: '33AMTPR1760M1ZE',
  };
  const printedAt = new Date(bill.createdAt);
  const paymentRows = bill.paymentMode === 'split' && bill.split
    ? Object.entries(bill.split).filter(([, amount]) => Number(amount) > 0).map(([mode, amount]) => `<div class="pay"><span>${mode.toUpperCase()}</span><span>${Number(amount).toFixed(2)}</span></div>`).join('')
    : `<div class="pay"><span>${bill.paymentMode.toUpperCase()}</span><span>${(bill.paymentMode === 'credit' ? bill.tendered : bill.total).toFixed(2)}</span></div>`;
  const html = `<!doctype html><html><head><title>${title} ${bill.billNo}</title><style>
    @page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}.c{text-align:center}.brand{font-size:20px;font-weight:900;line-height:1.05}.small{font-size:10px}.doc{font-size:14px;font-weight:900;letter-spacing:.03em;margin:8px 0}.row,.pay{display:flex;justify-content:space-between;gap:8px}.dash{border-top:1px solid #111;margin:6px 0}table{width:100%;border-collapse:collapse}th{border-top:1px solid #111;border-bottom:1px solid #111;font-size:11px;text-align:left;padding:3px 2px}td{padding:3px 2px;vertical-align:top}.num{text-align:right}.total-row td{border-top:1px solid #111;font-weight:900}.summary{margin-left:auto;width:72%;font-size:12px}.summary .row{padding:2px 0}.net{border-top:1px solid #111;border-bottom:1px solid #111;font-size:16px;font-weight:900;margin-top:4px;padding:4px 0}.paybox{margin-top:8px;text-align:center}.paytitle{border-top:1px solid #111;border-bottom:1px solid #111;display:inline-block;min-width:64%;padding:2px 0}.gst{font-size:9px;margin-top:8px}.gst th,.gst td{border:1px solid #111;padding:2px;text-align:right}.gst th:first-child,.gst td:first-child{text-align:left}.footer{margin-top:10px;text-align:center;font-size:13px;font-weight:800}.copy{border:1px solid #111;font-weight:900;margin-bottom:5px;padding:3px;text-align:center}
  </style></head><body>
    ${(duplicate || returnBill._isReturn) ? `<div class="copy">${title}</div>` : ''}
    <div class="c brand">${business.name}</div>
    <div class="c small">${business.lines.join('<br/>')}</div>
    <div class="c">GSTIN : ${business.gstin}</div>
    <div class="c doc">TAX INVOICE</div>
    <div class="row"><span>Bill No : ${bill.billNo}</span><span>Date : ${printedAt.toLocaleDateString('en-GB')}</span></div>
    ${returnBill._isReturn ? `<div class="row"><span>Original Bill :</span><span>${returnBill._originalBillNo || '-'}</span></div><div class="row"><span>Reason :</span><span>${returnBill._returnReason || '-'}</span></div>` : ''}
    <div class="row"><span>${bill.invoiceNo}</span><span>Time : ${printedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
    <table><thead><tr><th>Sn</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
      ${bill.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.itemName}</td><td class="num">${i.quantity.toFixed(i.unit === 'kg' ? 2 : 0)}</td><td class="num">${i.price.toFixed(2)}</td><td class="num">${i.lineTotal.toFixed(2)}</td></tr>`).join('')}
      <tr class="total-row"><td></td><td>Total</td><td class="num">${bill.items.reduce((s, i) => s + i.quantity, 0).toFixed(2)}</td><td></td><td class="num">${bill.subtotal.toFixed(2)}</td></tr>
    </tbody></table>
    <div class="summary"><div class="row"><span>${discountLabel(bill)} :</span><span>${bill.discount.toFixed(2)}</span></div><div class="row"><span>Additional Charges :</span><span>${Number(bill.additionalCharges || 0).toFixed(2)}</span></div><div class="row"><span>GST :</span><span>${bill.tax.toFixed(2)}</span></div><div class="row"><span>Amount Before Round-Off :</span><span>${(bill.amountBeforeRoundOff ?? Math.max(0, bill.subtotal + bill.tax - bill.discount)).toFixed(2)}</span></div><div class="row"><span>Round-Off :</span><span>${billRoundOff(bill) >= 0 ? '+' : ''}${billRoundOff(bill).toFixed(2)}</span></div><div class="row net"><span>Net Bill Amount :</span><span>Rs ${bill.total.toFixed(2)}</span></div></div>
    <div class="paybox"><div class="paytitle">Payment Details</div>${paymentRows}${Number(bill.refundAmount || 0) > 0 ? `<div class="pay"><span>REFUND ${String(bill.refundMode || '').toUpperCase()}</span><span>-${Number(bill.refundAmount).toFixed(2)}</span></div>` : ''}</div>
    ${bill.paymentMode === 'credit' ? `<div class="dash"></div><div class="row"><span>Credit Customer</span><span>${bill.creditCustomerName || '-'}</span></div><div class="row"><span>Mobile</span><span>${bill.creditCustomerMobile || '-'}</span></div><div class="row"><span>Due Date</span><span>${bill.creditDueDate || '-'}</span></div><div class="row"><span>Credit Due</span><span>${bill.balance.toFixed(2)}</span></div>` : ''}
    <div class="c small">Salesperson : ${bill.salesperson}</div>
    <div class="footer">Thank you, Visit Again</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const win = target ?? window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.open(); win.document.write(html); win.document.close(); }
}

// ─── Branch Cashier Closure print — same layout/style as the Biller (DailyClosure) print ──
function safeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const inr = (n: number) => `₹${Number(n || 0).toFixed(2)}`;

const SMALL_NUMBER_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS_WORDS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberBelowThousandToWords(value: number): string {
  const number = Math.floor(Math.max(0, value));
  if (number < 20) return SMALL_NUMBER_WORDS[number];
  if (number < 100) {
    const remainder = number % 10;
    return `${TENS_WORDS[Math.floor(number / 10)]}${remainder ? ` ${SMALL_NUMBER_WORDS[remainder]}` : ''}`;
  }
  const remainder = number % 100;
  return `${SMALL_NUMBER_WORDS[Math.floor(number / 100)]} Hundred${remainder ? ` ${numberBelowThousandToWords(remainder)}` : ''}`;
}

function amountInIndianWords(value: number): string {
  const amount = Math.round(Math.max(0, Number(value || 0)) * 100) / 100;
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0) return paise ? `Zero Rupees and ${numberBelowThousandToWords(paise)} Paise Only` : 'Zero Rupees Only';

  const groups: Array<[number, string]> = [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1_000, 'Thousand'],
  ];
  let remaining = rupees;
  const words: string[] = [];
  for (const [divisor, label] of groups) {
    const group = Math.floor(remaining / divisor);
    if (group > 0) {
      words.push(`${numberBelowThousandToWords(group)} ${label}`);
      remaining %= divisor;
    }
  }
  if (remaining > 0) words.push(numberBelowThousandToWords(remaining));
  return `${words.join(' ')} Rupees${paise ? ` and ${numberBelowThousandToWords(paise)} Paise` : ''} Only`;
}

export type AccountingVoucherPrintInput = {
  voucherType: 'Expense Voucher' | 'Supplier Payment Voucher';
  voucherNo: string;
  voucherDate: string;
  createdAt?: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  paymentMode: string;
  narration: string;
  reference?: string;
  createdBy: string;
  allocationLines?: Array<{ label: string; amount: number }>;
};

export function printAccountingVoucher(input: AccountingVoucherPrintInput) {
  const amount = Number(input.amount || 0);
  const allocationRows = (input.allocationLines || []).map((line) => `
    <tr><td>${safeHtml(line.label)}</td><td class="right">${safeHtml(inr(line.amount))}</td></tr>`).join('');
  const createdAt = new Date(input.createdAt || input.voucherDate);
  const createdTime = Number.isNaN(createdAt.getTime()) ? '-' : createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const html = `<!doctype html><html><head><title>${safeHtml(input.voucherType)} ${safeHtml(input.voucherNo)}</title><style>
    @page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:11px;background:#fff}
    .voucher{border:1.5px solid #111;min-height:270mm;padding:12px;display:flex;flex-direction:column}
    .company{text-align:center;line-height:1.35}.company h1{font-size:18px;margin:0 0 2px}.company p{margin:0}
    .meta{display:grid;grid-template-columns:1fr auto;gap:20px;margin-top:15px}.meta p{margin:2px 0}.right{text-align:right}.center{text-align:center}
    .title{text-align:center;margin:14px 0 8px}.title h2{font-size:18px;margin:0;text-transform:uppercase}.mode{font-size:14px;font-weight:800;margin-top:7px;text-transform:uppercase}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:7px;vertical-align:top}th{font-size:10px;text-transform:uppercase;background:#f5f5f5}.amount{font-weight:800;text-align:right;white-space:nowrap}
    .ledger{min-height:92px}.narration{margin-top:18px;white-space:pre-wrap}.allocations{margin-top:14px}.allocations h3{font-size:11px;margin:0 0 5px;text-transform:uppercase}
    .spacer{flex:1}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:28px}.signature{border-top:1px solid #111;padding-top:5px;text-align:center}
    .words{display:grid;grid-template-columns:1fr 180px;border:1px solid #777;margin-top:16px;font-weight:800}.words div{padding:8px}.words div+div{border-left:1px solid #777;text-align:right}
    @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.voucher{min-height:275mm}}
  </style></head><body><main class="voucher">
    <header class="company"><h1>SRI NANJUNDESHWARA BAKERY</h1><p>Berigai, Krishnagiri, Tamil Nadu</p><p>SNB Branch Accounts</p></header>
    <section class="meta"><div><p><b>Date:</b> ${safeHtml(input.voucherDate)}</p><p><b>Time:</b> ${safeHtml(createdTime)}</p></div><div class="right"><p><b>Voucher No.:</b> ${safeHtml(input.voucherNo)}</p><p><b>Reference:</b> ${safeHtml(input.reference || '-')}</p></div></section>
    <section class="title"><h2>${safeHtml(input.voucherType)}</h2><div class="mode">${safeHtml(input.paymentMode)}</div></section>
    <table class="ledger"><thead><tr><th>Title and Narration</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead><tbody>
      <tr><td><b>${safeHtml(input.debitAccount)}</b></td><td class="amount">${safeHtml(inr(amount))}</td><td></td></tr>
      <tr><td><b>${safeHtml(input.creditAccount)}</b></td><td></td><td class="amount">${safeHtml(inr(amount))}</td></tr>
    </tbody></table>
    <div class="narration"><b>Payment Remarks:</b> ${safeHtml(input.narration || '-')}</div>
    ${allocationRows ? `<section class="allocations"><h3>Invoice Allocations</h3><table><thead><tr><th>Invoice / Reference</th><th class="right">Amount</th></tr></thead><tbody>${allocationRows}</tbody></table></section>` : ''}
    <div class="spacer"></div>
    <section class="signatures"><div class="signature">Created By: ${safeHtml(input.createdBy)}</div><div class="signature">Checked By</div><div class="signature">Approved By</div><div class="signature">Received By</div></section>
    <section class="words"><div>Paid INR ${safeHtml(amountInIndianWords(amount))}</div><div>${safeHtml(inr(amount))}</div></section>
  </main><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open('', '_blank', 'width=920,height=900');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export type BranchCashierClosurePrintInput = {
  branch: import('./types').Branch;
  cashier: string;
  counterSessionId?: string;
  date: string;
  openedAt?: string;
  closedAt?: string;
  grossSalesBeforeDiscount: number;
  discounts: number;
  totalSales: number;
  advanceCollected: number;
  advanceInitial: number;
  advanceBalance: number;
  advanceCash: number;
  advanceUpi: number;
  advanceCard: number;
  advanceBank: number;
  advancePaymentCount: number;
  totalSalesIncAdvance: number;
  billsCount: number;
  cancelledCount: number;
  cash: number; upi: number; card: number; splitTotal: number;
  actualUpi: number; upiDifference: number; upiNotes?: string;
  creditSales: number; creditCollected: number;
  creditCollectionCash: number; creditCollectionUpi: number; creditCollectionCard: number; creditCollectionOther: number;
  openingCash: number; expenses: number; supplierPayments: number; bankDeposits: number; cashOutflows: number; refunds: number;
  expected: number; counted: number; difference: number;
  openingDenominations?: Record<string, string | number>;
  closingDenominations?: Record<string, string | number>;
  notes?: string;
  bills: Array<{ billNo: string; createdAt: string; customerName?: string; paymentMode: string; total: number; biller: string }>;
  refundRows: Array<{ returnNo: string; originalBillNo: string; createdAt: string; paymentMode: string; reason: string; cashier: string; amount: number; creditAdjusted?: number; grossReturn?: number }>;
  advanceRows: Array<{ createdAt: string; purpose: string; paymentMode: string; amount: number; reference: string; enteredBy: string }>;
  creditSaleRows: Array<{ createdAt: string; billNo: string; customerName: string; amountPaid: number; creditAmount: number; status: string; soldBy: string }>;
  creditCollectionRows: Array<{ createdAt: string; billNo: string; amount: number; paymentMode: string; reference: string; collectedBy: string }>;
  expenseRows: Array<{ createdAt: string; category: string; description: string; amount: number; mode: string; enteredBy: string }>;
  supplierPaymentRows: Array<{ createdAt: string; supplier: string; amount: number; mode: string; reference: string; paidBy: string }>;
  bankDepositRows: Array<{ createdAt: string; bankAccount: string; amount: number; paymentMode: string; reference: string; enteredBy: string }>;
};

export function printBranchCashierClosure(
  input: BranchCashierClosurePrintInput,
  options: { silent?: boolean } = {},
) {
  const printedAt = new Date().toLocaleString('en-IN');
  const billRowsHtml = input.bills.length === 0
    ? '<tr><td colspan="6" class="muted center">No bills closed for this date.</td></tr>'
    : input.bills.map((b) => `
        <tr>
          <td>${safeHtml(b.billNo)}</td>
          <td>${safeHtml(new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}</td>
          <td>${safeHtml(b.customerName || 'Walk-in')}</td>
          <td>${safeHtml(b.paymentMode)}</td>
          <td class="right">${safeHtml(inr(b.total))}</td>
          <td>${safeHtml(b.biller)}</td>
        </tr>`).join('');
  const notesHtml = input.notes?.trim() ? `<div class="notes"><b>Closure Notes</b><p>${safeHtml(input.notes)}</p></div>` : '';
  const upiNotesHtml = input.upiNotes?.trim() ? `<div class="notes"><b>UPI Audit Remarks</b><p>${safeHtml(input.upiNotes)}</p></div>` : '';
  const refundRowsHtml = input.refundRows.length === 0
    ? '<tr><td colspan="9" class="muted center">No refunds in this counter session.</td></tr>'
    : input.refundRows.map((r) => `<tr><td>${safeHtml(r.returnNo)}</td><td>${safeHtml(r.originalBillNo)}</td><td>${safeHtml(new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}</td><td>${safeHtml(r.paymentMode.toUpperCase())}</td><td>${safeHtml(r.reason)}</td><td>${safeHtml(r.cashier)}</td><td class="right">${safeHtml(inr(r.grossReturn ?? r.amount))}</td><td class="right">${safeHtml(inr(r.creditAdjusted ?? 0))}</td><td class="right strong">-${safeHtml(inr(r.amount))}</td></tr>`).join('');
  const timeLabel = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const advanceRowsHtml = input.advanceRows.length === 0
    ? '<tr><td colspan="6" class="muted center">No itemized advance collections in this session.</td></tr>'
    : input.advanceRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.purpose)}</td><td>${safeHtml(row.paymentMode.toUpperCase())}</td><td>${safeHtml(row.reference || '-')}</td><td>${safeHtml(row.enteredBy)}</td><td class="right strong">${safeHtml(inr(row.amount))}</td></tr>`).join('');
  const creditSaleRowsHtml = input.creditSaleRows.length === 0
    ? '<tr><td colspan="7" class="muted center">No credit sales in this session.</td></tr>'
    : input.creditSaleRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.billNo)}</td><td>${safeHtml(row.customerName)}</td><td class="right">${safeHtml(inr(row.amountPaid))}</td><td class="right strong">${safeHtml(inr(row.creditAmount))}</td><td>${safeHtml(row.status)}</td><td>${safeHtml(row.soldBy)}</td></tr>`).join('');
  const creditCollectionRowsHtml = input.creditCollectionRows.length === 0
    ? '<tr><td colspan="6" class="muted center">No credit collections in this session.</td></tr>'
    : input.creditCollectionRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.billNo)}</td><td>${safeHtml(row.paymentMode.toUpperCase())}</td><td>${safeHtml(row.reference || '-')}</td><td>${safeHtml(row.collectedBy)}</td><td class="right strong">${safeHtml(inr(row.amount))}</td></tr>`).join('');
  const expenseRowsHtml = input.expenseRows.length === 0
    ? '<tr><td colspan="6" class="muted center">No expenses in this session.</td></tr>'
    : input.expenseRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.category)}</td><td>${safeHtml(row.description)}</td><td>${safeHtml(row.mode.toUpperCase())}</td><td>${safeHtml(row.enteredBy)}</td><td class="right strong">${safeHtml(inr(row.amount))}</td></tr>`).join('');
  const supplierPaymentRowsHtml = input.supplierPaymentRows.length === 0
    ? '<tr><td colspan="6" class="muted center">No supplier payments in this session.</td></tr>'
    : input.supplierPaymentRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.supplier)}</td><td>${safeHtml(row.mode.toUpperCase())}</td><td>${safeHtml(row.reference || '-')}</td><td>${safeHtml(row.paidBy)}</td><td class="right strong">${safeHtml(inr(row.amount))}</td></tr>`).join('');
  const bankDepositRowsHtml = input.bankDepositRows.length === 0
    ? '<tr><td colspan="6" class="muted center">No bank deposits in this session.</td></tr>'
    : input.bankDepositRows.map((row) => `<tr><td>${safeHtml(timeLabel(row.createdAt))}</td><td>${safeHtml(row.bankAccount)}</td><td>${safeHtml(row.paymentMode)}</td><td>${safeHtml(row.reference || '-')}</td><td>${safeHtml(row.enteredBy)}</td><td class="right strong">${safeHtml(inr(row.amount))}</td></tr>`).join('');
  const denominationRows = (values?: Record<string, string | number>) => Object.entries(values || {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([denomination, count]) => `<tr><td>INR ${safeHtml(denomination)} x ${safeHtml(count)}</td><td class="right">${safeHtml(inr(Number(denomination) * Number(count)))}</td></tr>`).join('')
    || '<tr><td colspan="2" class="muted center">No denomination count entered.</td></tr>';

  const html = `<!DOCTYPE html><html><head><title>${safeHtml(BRANCH_LABELS[input.branch])} Cashier Closure</title>
    <style>
      @page { size: A4; margin: 7mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      body { font-size: 11px; line-height: 1.35; }
      .closure-print { width: 100%; }
      .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
      h1 { margin: 0; font-size: 22px; line-height: 1; }
      h2 { margin: 0 0 7px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #374151; }
      .muted { color: #6b7280; } .right { text-align: right; } .center { text-align: center; } .strong { font-weight: 800; }
      .badge { display: inline-block; margin-top: 5px; padding: 3px 8px; border: 1px solid #111827; border-radius: 999px; font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
      .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 9px; break-inside: avoid; }
      .label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; font-weight: 800; }
      .value { margin-top: 4px; font-size: 16px; font-weight: 900; }
      .section { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px; margin-bottom: 10px; break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 4px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
      tr:last-child td { border-bottom: 0; }
      .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .notes { border: 1px dashed #9ca3af; border-radius: 10px; padding: 8px; margin-bottom: 10px; }
      .notes p { margin: 4px 0 0; white-space: pre-wrap; }
      .footer { margin-top: 14px; display: flex; justify-content: space-between; gap: 20px; }
      .sign { width: 34%; border-top: 1px solid #111827; padding-top: 5px; text-align: center; color: #374151; }
      @media print {
        html, body { width: 210mm; min-height: 297mm; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .section, .card { break-inside: avoid; page-break-inside: avoid; }
      }
    </style></head><body>
    <main class="closure-print">
      <div class="header">
        <div>
          <h1>${safeHtml(BRANCH_LABELS[input.branch])} Cashier Counter Open &amp; Closure</h1>
          <div class="badge">${safeHtml(input.date)}</div>
        </div>
        <div class="right muted">
          <div><b>Session:</b> ${safeHtml(input.counterSessionId || '-')}</div>
          <div><b>Opened:</b> ${safeHtml(input.openedAt ? new Date(input.openedAt).toLocaleString('en-IN') : '-')}</div>
          <div><b>Closed:</b> ${safeHtml(input.closedAt ? new Date(input.closedAt).toLocaleString('en-IN') : printedAt)}</div>
          <div><b>Closed by:</b> ${safeHtml(input.cashier)}</div>
          <div><b>Printed:</b> ${safeHtml(printedAt)}</div>
        </div>
      </div>

      <div class="grid">
        <div class="card"><div class="label">Total Sales</div><div class="value">${safeHtml(inr(input.totalSalesIncAdvance))}</div></div>
        <div class="card"><div class="label">Collection</div><div class="value">${safeHtml(inr(input.cash + input.upi + input.card))}</div></div>
        <div class="card"><div class="label">Bills Closed</div><div class="value">${input.billsCount}</div></div>
        <div class="card"><div class="label">Cancelled</div><div class="value">${input.cancelledCount}</div></div>
      </div>

      <div class="totals">
        <section class="section"><h2>Payment Collection</h2><table><tbody>
          <tr><td>Cash</td><td class="right">${safeHtml(inr(input.cash))}</td></tr>
          <tr><td>UPI</td><td class="right">${safeHtml(inr(input.upi))}</td></tr>
          <tr><td>Card</td><td class="right">${safeHtml(inr(input.card))}</td></tr>
          <tr><td>Split Payments</td><td class="right">${safeHtml(inr(input.splitTotal))}</td></tr>
          <tr><td>Credit Collected</td><td class="right">${safeHtml(inr(input.creditCollected))}</td></tr>
          <tr><td class="strong">Total Collection</td><td class="right strong">${safeHtml(inr(input.cash + input.upi + input.card))}</td></tr>
        </tbody></table></section>
        <section class="section"><h2>Cash Counter</h2><table><tbody>
          <tr><td>Opening Cash</td><td class="right">${safeHtml(inr(input.openingCash))}</td></tr>
          <tr><td>System Cash Collection</td><td class="right">${safeHtml(inr(input.cash))}</td></tr>
          <tr><td>Cash Outflows</td><td class="right">-${safeHtml(inr(input.cashOutflows))}</td></tr>
          <tr><td>Expected Cash</td><td class="right">${safeHtml(inr(input.expected))}</td></tr>
          <tr><td>Physical Cash</td><td class="right">${safeHtml(inr(input.counted))}</td></tr>
          <tr><td class="strong">Cash Difference</td><td class="right strong">${safeHtml(inr(input.difference))}</td></tr>
        </tbody></table></section>
      </div>

      <div class="totals">
        <section class="section"><h2>Sales Calculation</h2><table><tbody>
          <tr><td>Gross Before Discount</td><td class="right">${safeHtml(inr(input.grossSalesBeforeDiscount))}</td></tr>
          <tr><td>Discounts</td><td class="right">-${safeHtml(inr(input.discounts))}</td></tr>
          <tr><td>Refunds / Returns</td><td class="right">-${safeHtml(inr(input.refunds))}</td></tr>
          <tr><td>Normal Net Sales</td><td class="right strong">${safeHtml(inr(input.totalSales))}</td></tr>
          <tr><td>Advance Collected</td><td class="right strong">${safeHtml(inr(input.advanceCollected))}</td></tr>
          <tr><td>Total Activity</td><td class="right strong">${safeHtml(inr(input.totalSalesIncAdvance))}</td></tr>
        </tbody></table></section>
        <section class="section"><h2>Cash Outflow Calculation</h2><table><tbody>
          <tr><td>Expenses</td><td class="right">${safeHtml(inr(input.expenses))}</td></tr>
          <tr><td>Supplier Payments</td><td class="right">${safeHtml(inr(input.supplierPayments))}</td></tr>
          <tr><td>Bank Deposits</td><td class="right">${safeHtml(inr(input.bankDeposits))}</td></tr>
          <tr><td class="strong">Cash-mode Outflows Used</td><td class="right strong">${safeHtml(inr(input.cashOutflows))}</td></tr>
        </tbody></table></section>
      </div>

      <section class="section"><h2>UPI Audit</h2><table><tbody>
        <tr><td>System UPI Total</td><td class="right">${safeHtml(inr(input.upi))}</td></tr>
        <tr><td>Verified / Entered UPI Amount</td><td class="right">${safeHtml(inr(input.actualUpi))}</td></tr>
        <tr><td class="strong">UPI Difference</td><td class="right strong">${safeHtml(inr(input.upiDifference))}</td></tr>
      </tbody></table></section>

      <div class="grid">
        <div class="card"><div class="label">Credit Sales</div><div class="value">${safeHtml(inr(input.creditSales))}</div></div>
        <div class="card"><div class="label">Credit Collected</div><div class="value">${safeHtml(inr(input.creditCollected))}</div></div>
        <div class="card"><div class="label">Advance Collected</div><div class="value">${safeHtml(inr(input.advanceCollected))}</div></div>
        <div class="card"><div class="label">Normal Sales</div><div class="value">${safeHtml(inr(input.totalSales))}</div></div>
      </div>

      <div class="totals">
        <section class="section"><h2>Advance Collection Breakdown</h2><table><tbody>
          <tr><td>Initial Advance</td><td class="right">${safeHtml(inr(input.advanceInitial))}</td></tr>
          <tr><td>Balance Collection</td><td class="right">${safeHtml(inr(input.advanceBalance))}</td></tr>
          <tr><td>Cash</td><td class="right">${safeHtml(inr(input.advanceCash))}</td></tr>
          <tr><td>UPI</td><td class="right">${safeHtml(inr(input.advanceUpi))}</td></tr>
          <tr><td>Card</td><td class="right">${safeHtml(inr(input.advanceCard))}</td></tr>
          <tr><td>Bank / Other</td><td class="right">${safeHtml(inr(input.advanceBank))}</td></tr>
          <tr><td>Payment Entries</td><td class="right">${safeHtml(input.advancePaymentCount)}</td></tr>
          <tr><td class="strong">Total Advance Collected</td><td class="right strong">${safeHtml(inr(input.advanceCollected))}</td></tr>
        </tbody></table></section>
        <section class="section"><h2>Credit Collection Breakdown</h2><table><tbody>
          <tr><td>Credit Sales Raised</td><td class="right">${safeHtml(inr(input.creditSales))}</td></tr>
          <tr><td>Collected by Cash</td><td class="right">${safeHtml(inr(input.creditCollectionCash))}</td></tr>
          <tr><td>Collected by UPI</td><td class="right">${safeHtml(inr(input.creditCollectionUpi))}</td></tr>
          <tr><td>Collected by Card</td><td class="right">${safeHtml(inr(input.creditCollectionCard))}</td></tr>
          <tr><td>Collected by Bank / Other</td><td class="right">${safeHtml(inr(input.creditCollectionOther))}</td></tr>
          <tr><td class="strong">Total Credit Collected</td><td class="right strong">${safeHtml(inr(input.creditCollected))}</td></tr>
        </tbody></table></section>
      </div>

      <div class="totals">
        <section class="section"><h2>Opening Denominations</h2><table><tbody>${denominationRows(input.openingDenominations)}</tbody></table></section>
        <section class="section"><h2>Closing Denominations</h2><table><tbody>${denominationRows(input.closingDenominations)}</tbody></table></section>
      </div>

      ${upiNotesHtml}
      ${notesHtml}
      <section class="section"><h2>Advance Collection Register</h2><table><thead><tr><th>Time</th><th>Purpose</th><th>Mode</th><th>Reference</th><th>Entered By</th><th class="right">Amount</th></tr></thead><tbody>${advanceRowsHtml}</tbody></table></section>
      <section class="section"><h2>Credit Sales Register</h2><table><thead><tr><th>Time</th><th>Bill</th><th>Customer</th><th class="right">Paid</th><th class="right">Credit</th><th>Status</th><th>Sold By</th></tr></thead><tbody>${creditSaleRowsHtml}</tbody></table></section>
      <section class="section"><h2>Credit Collection Register</h2><table><thead><tr><th>Time</th><th>Bill</th><th>Mode</th><th>Reference</th><th>Collected By</th><th class="right">Amount</th></tr></thead><tbody>${creditCollectionRowsHtml}</tbody></table></section>
      <section class="section"><h2>Expense Register</h2><table><thead><tr><th>Time</th><th>Category</th><th>Description</th><th>Mode</th><th>Entered By</th><th class="right">Amount</th></tr></thead><tbody>${expenseRowsHtml}</tbody></table></section>
      <section class="section"><h2>Supplier Payment Register</h2><table><thead><tr><th>Time</th><th>Supplier</th><th>Mode</th><th>Reference</th><th>Paid By</th><th class="right">Amount</th></tr></thead><tbody>${supplierPaymentRowsHtml}</tbody></table></section>
      <section class="section"><h2>Bank Deposit Register</h2><table><thead><tr><th>Time</th><th>Bank Account</th><th>Mode</th><th>Reference</th><th>Entered By</th><th class="right">Amount</th></tr></thead><tbody>${bankDepositRowsHtml}</tbody></table></section>
      <section class="section"><h2>Refund Register</h2><table><thead><tr><th>Return</th><th>Original Bill</th><th>Time</th><th>Mode</th><th>Reason</th><th>Cashier</th><th class="right">Gross</th><th class="right">Credit Adjusted</th><th class="right">Refund</th></tr></thead><tbody>${refundRowsHtml}</tbody></table></section>
      <section class="section"><h2>Closed Bills</h2><table><thead><tr><th>Bill</th><th>Time</th><th>Customer</th><th>Payment</th><th class="right">Paid</th><th>Cashier</th></tr></thead><tbody>${billRowsHtml}</tbody></table></section>
      <div class="footer"><div class="sign">Cashier Signature</div><div class="sign">Manager Signature</div></div>
    </main>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
  if (options.silent) {
    printThermalHtml(html);
    return;
  }
  const win = window.open('', '_blank', 'width=920,height=900');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}


// ─── Thermal cashier counter open/close slip ───────────────────────────────
// Unlike printBranchCashierClosure (a detailed A4 audit report opened in a
// new tab, still available via the manual "Print Closure" button), this is
// a compact 80mm thermal receipt auto-printed the moment the counter is
// opened or closed, via the same silent iframe approach used for bills so
// it goes straight to the thermal printer with no popup window.
function printThermalHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);
  const target = frame.contentWindow;
  if (!target) { frame.remove(); return; }
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; frame.remove(); };
  target.onafterprint = cleanup;
  window.setTimeout(cleanup, 60_000);
  target.document.open();
  target.document.write(html);
  target.document.close();
}

const THERMAL_SLIP_STYLE = `
  @page{size:80mm auto;margin:3mm}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;width:72mm;margin:0}
  .c{text-align:center}
  .bold{font-weight:900}
  .brand{font-size:18px;font-weight:900;letter-spacing:.04em;text-align:center;margin:4px 0}
  .stamp{border:2px solid #111;padding:4px 8px;text-align:center;font-weight:900;font-size:13px;margin:6px 0;letter-spacing:.06em}
  .dash{border-top:1px dashed #111;margin:6px 0}
  .row{display:flex;justify-content:space-between;gap:6px;padding:2px 0}
  .row b{font-weight:900}
  .foot{margin-top:8px;text-align:center;font-size:10px}
`;

export function printCounterOpenSlip(input: {
  branch: import('./types').Branch;
  cashier: string;
  openingCash: number;
  denominations?: Record<string, string | number>;
  openedAt?: string;
}) {
  const openedAt = input.openedAt ? new Date(input.openedAt) : new Date();
  const denomRows = Object.entries(input.denominations || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([denom, count]) => `<div class="row"><span>₹${safeHtml(denom)} × ${safeHtml(count)}</span><b>${safeHtml(inr(Number(denom) * Number(count)))}</b></div>`)
    .join('');
  const html = `<!doctype html><html><head><title>Counter Open ${safeHtml(input.branch)}</title><style>${THERMAL_SLIP_STYLE}</style></head><body>
    <div class="brand">${safeHtml(BRANCH_LABELS[input.branch])}</div>
    <div class="c">Cashier Counter</div>
    <div class="stamp">COUNTER OPENED</div>
    <div class="dash"></div>
    <div class="row"><span>Cashier</span><b>${safeHtml(input.cashier)}</b></div>
    <div class="row"><span>Date</span><b>${safeHtml(openedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</b></div>
    <div class="row"><span>Time</span><b>${safeHtml(openedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}</b></div>
    <div class="dash"></div>
    <div class="row bold"><span>Opening Cash</span><span>${safeHtml(inr(input.openingCash))}</span></div>
    ${denomRows ? `<div class="dash"></div>${denomRows}` : ''}
    <div class="dash"></div>
    <div class="foot">Verify the float above before starting billing.</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  printThermalHtml(html);
}

export function printCounterCloseSlip(input: {
  branch: import('./types').Branch;
  cashier: string;
  openingCash: number;
  cash: number; upi: number; card: number;
  creditSales: number; creditCollected: number;
  expected: number; counted: number; difference: number;
  billsCount: number;
  closedAt?: string;
}) {
  const closedAt = input.closedAt ? new Date(input.closedAt) : new Date();
  const totalCollection = input.cash + input.upi + input.card;
  const html = `<!doctype html><html><head><title>Counter Close ${safeHtml(input.branch)}</title><style>${THERMAL_SLIP_STYLE}</style></head><body>
    <div class="brand">${safeHtml(BRANCH_LABELS[input.branch])}</div>
    <div class="c">Cashier Counter</div>
    <div class="stamp">COUNTER CLOSED</div>
    <div class="dash"></div>
    <div class="row"><span>Cashier</span><b>${safeHtml(input.cashier)}</b></div>
    <div class="row"><span>Date</span><b>${safeHtml(closedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</b></div>
    <div class="row"><span>Time</span><b>${safeHtml(closedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}</b></div>
    <div class="dash"></div>
    <div class="row"><span>Bills Closed</span><b>${input.billsCount}</b></div>
    <div class="row"><span>Cash</span><span>${safeHtml(inr(input.cash))}</span></div>
    <div class="row"><span>UPI</span><span>${safeHtml(inr(input.upi))}</span></div>
    <div class="row"><span>Card</span><span>${safeHtml(inr(input.card))}</span></div>
    <div class="row bold"><span>Total Collection</span><span>${safeHtml(inr(totalCollection))}</span></div>
    <div class="dash"></div>
    <div class="row"><span>Credit Sales</span><span>${safeHtml(inr(input.creditSales))}</span></div>
    <div class="row"><span>Credit Collected</span><span>${safeHtml(inr(input.creditCollected))}</span></div>
    <div class="dash"></div>
    <div class="row"><span>Opening Cash</span><span>${safeHtml(inr(input.openingCash))}</span></div>
    <div class="row"><span>Expected Cash</span><span>${safeHtml(inr(input.expected))}</span></div>
    <div class="row"><span>Physical Cash</span><span>${safeHtml(inr(input.counted))}</span></div>
    <div class="row bold"><span>Difference</span><span>${safeHtml(inr(input.difference))}</span></div>
    <div class="dash"></div>
    <div class="foot">Counter closed. Signature: ____________________</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  printThermalHtml(html);
}

export async function printCounterBill(bill: BranchBillRecord, duplicate = false) {
  // Allocate the controlled copy first, then print through an off-screen iframe.
  // This avoids opening or leaving a visible "Preparing print" browser page.
  const { data, error } = await supabase.rpc('allocate_document_print', {
    p_document_type: 'branch_bill',
    p_document_id: bill.id || bill.billNo,
    p_branch: bill.branch,
    p_reason: duplicate ? 'User-requested duplicate print' : null,
    p_device_info: navigator.userAgent,
  });
  if (error || !data) throw new Error(error?.message || 'Unable to allocate controlled print copy.');

  const row = Array.isArray(data) ? data[0] : data;
  const isDuplicate = String((row as { copy_type?: string }).copy_type) === 'duplicate';
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);

  const target = frame.contentWindow;
  if (!target) {
    frame.remove();
    throw new Error('Unable to create the direct print frame.');
  }
  let cleaned = false;
  const cleanup = (notify = false) => {
    if (cleaned) return;
    cleaned = true;
    frame.remove();
    if (notify) {
      window.dispatchEvent(new CustomEvent(BRANCH_PRINT_COMPLETE_EVENT, {
        detail: { billNo: bill.billNo, branch: bill.branch },
      }));
    }
  };
  target.onafterprint = () => cleanup(true);
  window.setTimeout(() => cleanup(false), 60_000);

  if (bill.branch === 'VRSNB') printVrsnbReceiptBill(bill, isDuplicate, target);
  else printSnbCounterBill(bill, isDuplicate, target);
}
