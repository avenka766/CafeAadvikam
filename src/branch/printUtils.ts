// src/branch/printUtils.ts
// Shared print utilities for branch billing — used by BranchBillingProTab and BranchBusinessModules

import { BRANCH_LABELS } from './types';
import type { BranchBillRecord } from './branchOpsStore';

// ─── Generic HTML print helper ─────────────────────────────────────────────────
export function printHtml(title: string, body: string) {
  const w = window.open('', '_blank', 'width=600,height=800');
  if (w) {
    w.document.write(
      `<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}.b{font-weight:800}.c{text-align:center}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.right{text-align:right}.stamp{border:2px solid #111;padding:8px;text-align:center;font-weight:900;margin-bottom:12px}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`,
    );
    w.document.close();
  }
}

// ─── VRSNB receipt-style counter bill ─────────────────────────────────────────
// Matches the physical receipt format from the SNB/VRSNB receipt image.
function printVrsnbReceiptBill(bill: BranchBillRecord, duplicate = false) {
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
    <div class="grand"><span>Grand Total</span><span>&#x20B9;${bill.total.toFixed(2)}</span></div>
    <div class="paid-via">Paid via ${payModeLabel}</div>
    <div class="dash"></div>
    <div class="footer">Thank You &amp; Visit Again...!!!</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Full-format counter bill (SNB style / tax invoice) ───────────────────────
function printSnbCounterBill(bill: BranchBillRecord, duplicate = false) {
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
    <div class="summary"><div class="row"><span>Discount :</span><span>${bill.discount.toFixed(2)}</span></div><div class="row"><span>Delivery Charges :</span><span>0.00</span></div><div class="row"><span>GST :</span><span>${bill.tax.toFixed(2)}</span></div><div class="row"><span>Round-Off :</span><span>0.00</span></div><div class="row net"><span>Net Bill Amount :</span><span>Rs ${bill.total.toFixed(2)}</span></div></div>
    <div class="paybox"><div class="paytitle">Payment Details</div>${paymentRows}</div>
    ${bill.paymentMode === 'credit' ? `<div class="dash"></div><div class="row"><span>Credit Customer</span><span>${bill.creditCustomerName || '-'}</span></div><div class="row"><span>Mobile</span><span>${bill.creditCustomerMobile || '-'}</span></div><div class="row"><span>Due Date</span><span>${bill.creditDueDate || '-'}</span></div><div class="row"><span>Credit Due</span><span>${bill.balance.toFixed(2)}</span></div>` : ''}
    <table class="gst"><thead><tr><th>Taxable Value</th><th>CGST %</th><th>CGST Amt</th><th>SGST %</th><th>SGST Amt</th><th>Total GST</th></tr></thead><tbody><tr><td>${bill.total.toFixed(2)}</td><td>0</td><td>0.00</td><td>0</td><td>0.00</td><td>0.00</td></tr></tbody></table>
    <div class="c small">Staff Name : ${bill.biller}</div>
    <div class="footer">Thank you, Visit Again</div><div class="c small">www.billmaxo.com</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const win = window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Branch Cashier Closure print — same layout/style as the Biller (DailyClosure) print ──
function safeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const inr = (n: number) => `₹${Number(n || 0).toFixed(2)}`;

export function printBranchCashierClosure(input: {
  branch: import('./types').Branch;
  cashier: string;
  date: string;
  totalSales: number;
  advanceCollected: number;
  totalSalesIncAdvance: number;
  billsCount: number;
  cancelledCount: number;
  cash: number; upi: number; card: number; splitTotal: number;
  creditSales: number; creditCollected: number;
  openingCash: number; expenses: number; refunds: number;
  expected: number; counted: number; difference: number;
  notes?: string;
  bills: Array<{ billNo: string; createdAt: string; customerName?: string; paymentMode: string; total: number; biller: string }>;
}) {
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

  const win = window.open('', '_blank', 'width=920,height=900');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${safeHtml(BRANCH_LABELS[input.branch])} Cashier Closure</title>
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
          <tr><td>Cash Expenses</td><td class="right">${safeHtml(inr(input.expenses))}</td></tr>
          <tr><td>Refunds</td><td class="right">${safeHtml(inr(input.refunds))}</td></tr>
          <tr><td>Expected Cash</td><td class="right">${safeHtml(inr(input.expected))}</td></tr>
          <tr><td>Physical Cash</td><td class="right">${safeHtml(inr(input.counted))}</td></tr>
          <tr><td class="strong">Difference</td><td class="right strong">${safeHtml(inr(input.difference))}</td></tr>
        </tbody></table></section>
      </div>

      <div class="grid">
        <div class="card"><div class="label">Credit Sales</div><div class="value">${safeHtml(inr(input.creditSales))}</div></div>
        <div class="card"><div class="label">Credit Collected</div><div class="value">${safeHtml(inr(input.creditCollected))}</div></div>
        <div class="card"><div class="label">Advance Collected</div><div class="value">${safeHtml(inr(input.advanceCollected))}</div></div>
        <div class="card"><div class="label">Normal Sales</div><div class="value">${safeHtml(inr(input.totalSales))}</div></div>
      </div>

      ${notesHtml}
      <section class="section"><h2>Closed Bills</h2><table><thead><tr><th>Bill</th><th>Time</th><th>Customer</th><th>Payment</th><th class="right">Paid</th><th>Cashier</th></tr></thead><tbody>${billRowsHtml}</tbody></table></section>
      <div class="footer"><div class="sign">Cashier Signature</div><div class="sign">Manager Signature</div></div>
    </main>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
  win.document.close();
}


export function printCounterBill(bill: BranchBillRecord, duplicate = false) {
  if (bill.branch === 'VRSNB') {
    printVrsnbReceiptBill(bill, duplicate);
  } else {
    printSnbCounterBill(bill, duplicate);
  }
}
