// FEATURE (2026-09-03): "In Dispatch tab > Hosur ... checkbox ... GST field
// ... same invoice as it is in the sales invoice tab" + "For Sales tab in
// cart add this checkbox with all the details" — the Sales tab's own
// "Invoice" sub-tab (GstInvoiceTab in PlannerDashboard.tsx) already builds a
// proper GST Tax Invoice matching a real VRSNB FOODS LLP sample (seller/
// buyer/consignee blocks, HSN/SAC + CGST/SGST/IGST per line, a GST Summary
// table, amount in words, bank details, authorised signatory). That template
// used to live entirely inline inside GstInvoiceTab's generateInvoice() —
// extracted here, verbatim, so the Hosur dispatch popup (DispatchReviewModal)
// and the Sales tab's own "New Bill" cart (BillingTab) can opt in to
// generating the EXACT same document via one shared function instead of a
// second, separately-maintained copy that could drift out of sync.
import { supabase } from '@/lib/supabase';

export const GST_INVOICE_SELLER_DEFAULT = {
  name: 'VRSNB FOODS LLP',
  addressLines: ['109/C, Hosur Main Road, Berigai, Shoolagiri', 'Hosur-635105, Tamil Nadu'],
  contact: 'vrsnbfoods@yahoo.com, 9095445444',
  gstin: '33AAZFV1266C1ZZ',
  stateName: 'Tamil Nadu',
  stateCode: '33',
};

export const GST_INVOICE_BANK_DEFAULT = {
  accountNo: '120032512285',
  accountName: 'VRSNB FOODS LLP',
  bankName: 'Canara Bank',
  branchName: 'HOSUR',
  ifscCode: 'CNRB0004385',
};

// Indian numbering (lakh/crore) integer-to-words, for "Amount in Words".
export function numberToIndianWords(value: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
  const three = (n: number): string => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
  let n = Math.floor(Math.max(0, value));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(three(lakh) + ' Lakh');
  if (thousand) parts.push(three(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  return parts.join(' ');
}

// Indian financial year (Apr-Mar), same rule the DB's next_gst_invoice_number()
// uses — kept here so any caller's signature block ("for {seller}({FY})")
// always matches whatever FY the invoice number itself actually landed in.
export function financialYearForDate(isoDate: string): string {
  const d = new Date(isoDate);
  const startYear = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

// next_gst_invoice_number() is an atomic DB counter (one row per financial
// year) so numbers are gap-free and never repeat even with multiple staff
// generating invoices at once — a real GST-compliance requirement.
export async function getNextGstInvoiceNumber(invoiceDate: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_gst_invoice_number', { p_invoice_date: invoiceDate });
  if (error || !data) throw new Error(error?.message || 'Could not generate the next GST invoice number. Please try again.');
  return String(data);
}

export interface GstTaxInvoiceLine {
  itemName: string;
  hsnCode: string;
  qty: number;
  uom: string;
  rate: number;
  gstPct: number;
}

export interface GstPartyDetails {
  name: string;
  address: string; // newline-separated
  gstin: string;
  stateName: string;
  stateCode: string;
}

export interface GstSellerDetails {
  name: string;
  addressLines: string[];
  contact: string;
  gstin: string;
  stateName: string;
  stateCode: string;
}

export interface BuildGstTaxInvoiceParams {
  seller?: GstSellerDetails;
  buyer: GstPartyDetails;
  consignee?: GstPartyDetails; // defaults to buyer when omitted
  invoiceNo: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  referenceNo?: string;
  referenceDate?: string; // ISO
  remarks?: string;
  deliveryNote?: string;
  modeOfPayment?: string;
  otherReferences?: string;
  buyersOrderNo?: string;
  buyersOrderDate?: string; // ISO
  dispatchDocNo?: string;
  dispatchedThrough?: string;
  destination?: string;
  termsOfDelivery?: string;
  supplyType: 'intra' | 'inter';
  lines: GstTaxInvoiceLine[];
  bank?: typeof GST_INVOICE_BANK_DEFAULT;
  preparedBy: string;
}

export interface BuiltGstTaxInvoice {
  html: string;
  totalAmount: number;
  beforeTaxValue: number;
  totalGst: number;
}

export function buildGstTaxInvoiceHtml(p: BuildGstTaxInvoiceParams): BuiltGstTaxInvoice {
  const seller = p.seller ?? GST_INVOICE_SELLER_DEFAULT;
  const bank = p.bank ?? GST_INVOICE_BANK_DEFAULT;
  const consignee = p.consignee ?? p.buyer;
  const supplyType = p.supplyType;

  const validLines = p.lines.filter(l => l.itemName.trim() && l.qty > 0);
  const computedLines = validLines.map(l => {
    const amount = Math.round(l.qty * l.rate * 100) / 100;
    const gstPct = Math.max(0, l.gstPct);
    const cgstPct = supplyType === 'intra' ? gstPct / 2 : 0;
    const sgstPct = supplyType === 'intra' ? gstPct / 2 : 0;
    const igstPct = supplyType === 'inter' ? gstPct : 0;
    const cgstAmt = Math.round(amount * (cgstPct / 100) * 100) / 100;
    const sgstAmt = Math.round(amount * (sgstPct / 100) * 100) / 100;
    const igstAmt = Math.round(amount * (igstPct / 100) * 100) / 100;
    return { ...l, amount, gstPct, cgstPct, sgstPct, igstPct, cgstAmt, sgstAmt, igstAmt };
  });

  const beforeTaxValue = Math.round(computedLines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const totalCgst = Math.round(computedLines.reduce((s, l) => s + l.cgstAmt, 0) * 100) / 100;
  const totalSgst = Math.round(computedLines.reduce((s, l) => s + l.sgstAmt, 0) * 100) / 100;
  const totalIgst = Math.round(computedLines.reduce((s, l) => s + l.igstAmt, 0) * 100) / 100;
  const totalGst = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;
  const rawTotal = beforeTaxValue + totalGst;
  const totalAmount = Math.round(rawTotal);
  const roundOff = Math.round((totalAmount - rawTotal) * 100) / 100;

  const byRate = new Map<number, { taxableValue: number; cgstAmt: number; sgstAmt: number; igstAmt: number; hsnCodes: Set<string> }>();
  for (const l of computedLines) {
    const key = l.gstPct;
    const row = byRate.get(key) ?? { taxableValue: 0, cgstAmt: 0, sgstAmt: 0, igstAmt: 0, hsnCodes: new Set<string>() };
    row.taxableValue += l.amount; row.cgstAmt += l.cgstAmt; row.sgstAmt += l.sgstAmt; row.igstAmt += l.igstAmt;
    if (l.hsnCode.trim()) row.hsnCodes.add(l.hsnCode.trim());
    byRate.set(key, row);
  }
  const gstSummaryRows = Array.from(byRate.entries()).sort(([a], [b]) => a - b).map(([gstPct, row]) => ({
    gstPct, taxableValue: row.taxableValue, cgstAmt: row.cgstAmt, sgstAmt: row.sgstAmt, igstAmt: row.igstAmt,
    hsnCode: row.hsnCodes.size === 1 ? Array.from(row.hsnCodes)[0] : row.hsnCodes.size > 1 ? 'Multiple' : '-',
  }));
  const gstSummaryTotalTax = gstSummaryRows.reduce((s, r) => s + r.cgstAmt + r.sgstAmt + r.igstAmt, 0);

  const fy = financialYearForDate(p.invoiceDate);
  const dateStr = new Date(p.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const refDateStr = p.referenceDate ? new Date(p.referenceDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '';
  const orderDateStr = p.buyersOrderDate ? new Date(p.buyersOrderDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '';

  const rowsHtml = validLines.map((l, i) => {
    const cl = computedLines[i];
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${l.itemName}</td>
        <td class="c">${l.hsnCode || ''}</td>
        <td class="r">${l.qty} ${l.uom}</td>
        <td class="r">${Math.round(l.rate)}</td>
        <td class="c">${l.uom}</td>
        <td class="r">${Math.round(cl.amount)}</td>
      </tr>`;
  }).join('');

  const taxRowsHtml = gstSummaryRows.map(r => supplyType === 'intra'
    ? `
    <tr><td></td><td class="r b">Output CGST ${r.gstPct / 2}%</td><td></td><td></td><td class="r">${(r.gstPct / 2).toFixed(2)}</td><td class="c">%</td><td class="r">${Math.round(r.cgstAmt)}</td></tr>
    <tr><td></td><td class="r b">Output SGST ${r.gstPct / 2}%</td><td></td><td></td><td class="r">${(r.gstPct / 2).toFixed(2)}</td><td class="c">%</td><td class="r">${Math.round(r.sgstAmt)}</td></tr>`
    : `
    <tr><td></td><td class="r b">Output IGST ${r.gstPct}%</td><td></td><td></td><td class="r">${r.gstPct.toFixed(2)}</td><td class="c">%</td><td class="r">${Math.round(r.igstAmt)}</td></tr>`
  ).join('');

  // AUDIT FIX (2026-09-03): this summary table was hardcoded to only ever
  // show CGST/SGST columns — for an inter-state ('inter'/IGST) invoice
  // every row printed "CGST 0.00% / 0.00" and "SGST 0.00% / 0.00" with no
  // IGST rate/amount shown anywhere in the table, while the same row's own
  // "Total Tax Amount" column showed the real non-zero figure — an
  // internally non-reconciling table on a real, printed GST-compliance
  // document. Show CGST+SGST columns for intra-state, IGST columns for
  // inter-state, matching what the items-table's own tax rows (taxRowsHtml
  // above) already correctly do.
  const gstSummaryHtml = gstSummaryRows.map(r => supplyType === 'intra' ? `
    <tr>
      <td class="c">${r.hsnCode}</td>
      <td class="r">${Math.round(r.taxableValue)}</td>
      <td class="c">${(r.gstPct / 2).toFixed(2)}%</td>
      <td class="r">${Math.round(r.cgstAmt)}</td>
      <td class="c">${(r.gstPct / 2).toFixed(2)}%</td>
      <td class="r">${Math.round(r.sgstAmt)}</td>
      <td class="r">${Math.round(r.cgstAmt + r.sgstAmt + r.igstAmt)}</td>
    </tr>` : `
    <tr>
      <td class="c">${r.hsnCode}</td>
      <td class="r">${Math.round(r.taxableValue)}</td>
      <td class="c">${r.gstPct.toFixed(2)}%</td>
      <td class="r">${Math.round(r.igstAmt)}</td>
      <td class="r">${Math.round(r.cgstAmt + r.sgstAmt + r.igstAmt)}</td>
    </tr>`).join('');

  const optionalHeaderRow = (label: string, value: string | undefined) => (value ?? '').trim()
    ? `<tr><td class="b" style="border:none; padding:1px 4px;">${label}</td><td style="border:none; padding:1px 4px;">${value}</td></tr>`
    : '';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12px;">
      <style>
        .gst-inv table { width:100%; border-collapse: collapse; }
        .gst-inv th, .gst-inv td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; }
        .gst-inv .c { text-align: center; } .gst-inv .r { text-align: right; } .gst-inv .b { font-weight: bold; }
        .gst-inv th { background: #f0f0f0; font-weight: bold; }
        .gst-inv .noborder, .gst-inv .noborder td { border: none; }
      </style>
      <div class="gst-inv">
        <h2 style="text-align:center; margin:0 0 8px; font-size:16px; letter-spacing:1px;">Tax Invoice</h2>

        <table style="margin-bottom:0;">
          <tr>
            <td style="width:55%; vertical-align:top;">
              <p style="margin:2px 0; font-weight:bold; font-size:13px;">${seller.name}</p>
              ${seller.addressLines.filter(Boolean).map(l => `<p style="margin:2px 0;">${l}</p>`).join('')}
              <p style="margin:4px 0 2px;">GSTIN/UIN: ${seller.gstin}</p>
              <p style="margin:2px 0;">State Name: ${seller.stateName}, Code: ${seller.stateCode}</p>
              ${seller.contact.trim() ? `<p style="margin:2px 0;">E-Mail: ${seller.contact}</p>` : ''}
            </td>
            <td style="vertical-align:top; padding:0;">
              <table class="noborder">
                <tr><td class="b" style="border:none; padding:1px 4px; width:45%;">Invoice No.</td><td style="border:none; padding:1px 4px;">${p.invoiceNo}</td>
                    <td class="b" style="border:none; padding:1px 4px; width:20%;">Dated</td><td style="border:none; padding:1px 4px;">${dateStr}</td></tr>
                ${optionalHeaderRow('Delivery Note', p.deliveryNote)}
                ${optionalHeaderRow('Mode/Terms of Payment', p.modeOfPayment)}
                ${optionalHeaderRow('Reference No. &amp; Date.', [p.referenceNo, refDateStr].filter(Boolean).join(' / '))}
                ${optionalHeaderRow('Other References', p.otherReferences)}
                ${optionalHeaderRow("Buyer's Order No.", p.buyersOrderNo)}
                ${optionalHeaderRow('Dated', orderDateStr)}
                ${optionalHeaderRow('Dispatch Doc No.', p.dispatchDocNo)}
                ${optionalHeaderRow('Dispatched through', p.dispatchedThrough)}
                ${optionalHeaderRow('Destination', p.destination)}
                ${optionalHeaderRow('Terms of Delivery', p.termsOfDelivery)}
              </table>
            </td>
          </tr>
        </table>

        <table style="margin-top:-1px;">
          <tr><td style="vertical-align:top;">
            <p style="margin:2px 0; font-weight:bold;">Consignee (Ship to)</p>
            <p style="margin:2px 0; font-weight:bold;">${consignee.name}</p>
            ${consignee.address.split('\n').filter(Boolean).map(l => `<p style="margin:2px 0;">${l}</p>`).join('')}
            ${consignee.gstin.trim() ? `<p style="margin:2px 0;">GSTIN/UIN: ${consignee.gstin}</p>` : ''}
            <p style="margin:2px 0;">State Name: ${consignee.stateName}, Code: ${consignee.stateCode}</p>
          </td></tr>
        </table>
        <table style="margin-top:-1px;">
          <tr><td style="vertical-align:top;">
            <p style="margin:2px 0; font-weight:bold;">Buyer (Bill to)</p>
            <p style="margin:2px 0; font-weight:bold;">${p.buyer.name}</p>
            ${p.buyer.address.split('\n').filter(Boolean).map(l => `<p style="margin:2px 0;">${l}</p>`).join('')}
            ${p.buyer.gstin.trim() ? `<p style="margin:2px 0;">GSTIN/UIN: ${p.buyer.gstin}</p>` : ''}
            <p style="margin:2px 0;">State Name: ${p.buyer.stateName}, Code: ${p.buyer.stateCode}</p>
          </td></tr>
        </table>

        <table style="margin-top:8px;">
          <thead>
            <tr>
              <th style="width:5%;">SI No.</th><th>Description of Goods</th><th style="width:10%;">HSN/SAC</th>
              <th style="width:12%;">Quantity</th><th style="width:10%;">Rate</th><th style="width:6%;">per</th><th style="width:12%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr><td></td><td></td><td></td><td></td><td></td><td></td><td class="r">${Math.round(beforeTaxValue)}</td></tr>
            ${taxRowsHtml}
          </tbody>
          <tfoot>
            <tr class="b">
              <td colspan="3" class="c">Total</td>
              <td class="r">${validLines.reduce((s, l) => s + l.qty, 0)}</td>
              <td></td><td></td>
              <td class="r">Rs. ${Math.round(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <table style="margin-top:-1px;">
          <tr>
            <td class="b" style="width:20%;">Amount Chargeable (in words)</td>
            <td style="width:65%;">INR ${numberToIndianWords(totalAmount)} Only</td>
            <td class="c b" style="width:15%;">E. &amp; O.E</td>
          </tr>
        </table>

        <table style="margin-top:-1px;">
          <thead>
            ${supplyType === 'intra' ? `
            <tr>
              <th rowspan="2" style="vertical-align:middle;">HSN/SAC</th>
              <th rowspan="2" style="vertical-align:middle;">Taxable Value</th>
              <th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th>
              <th rowspan="2" style="vertical-align:middle;">Total Tax Amount</th>
            </tr>
            <tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>` : `
            <tr>
              <th>HSN/SAC</th>
              <th>Taxable Value</th>
              <th>IGST Rate</th>
              <th>IGST Amount</th>
              <th>Total Tax Amount</th>
            </tr>`}
          </thead>
          <tbody>${gstSummaryHtml || `<tr><td colspan="${supplyType === 'intra' ? 7 : 5}" class="c">—</td></tr>`}</tbody>
          <tfoot>
            ${supplyType === 'intra' ? `
            <tr class="b">
              <td class="c">Total</td>
              <td class="r">${Math.round(beforeTaxValue)}</td>
              <td></td><td class="r">${Math.round(totalCgst)}</td>
              <td></td><td class="r">${Math.round(totalSgst)}</td>
              <td class="r">${Math.round(gstSummaryTotalTax)}</td>
            </tr>` : `
            <tr class="b">
              <td class="c">Total</td>
              <td class="r">${Math.round(beforeTaxValue)}</td>
              <td></td><td class="r">${Math.round(totalIgst)}</td>
              <td class="r">${Math.round(gstSummaryTotalTax)}</td>
            </tr>`}
          </tfoot>
        </table>

        <!-- AUDIT FIX (2026-09-03): numberToIndianWords floors its input — passing the raw
             paise-precision gstSummaryTotalTax silently dropped the paise from the printed
             words (e.g. ₹123.45 read out as "One Hundred Twenty-Three Only"). Round first. -->
        <p style="margin:8px 0; font-weight:bold;">Tax Amount (in words) : INR ${numberToIndianWords(Math.round(gstSummaryTotalTax))} Only</p>

        <table style="margin-top:8px;">
          <tr>
            <td style="width:52%; vertical-align:top;">
              <p style="margin:2px 0; font-weight:bold;">Bank Details</p>
              <p style="margin:2px 0;">A/c Holder's Name: ${bank.accountName}</p>
              <p style="margin:2px 0;">Bank Name: ${bank.bankName}</p>
              <p style="margin:2px 0;">A/c No.: ${bank.accountNo}</p>
              <p style="margin:2px 0;">Branch &amp; IFS Code: ${bank.branchName} &amp; ${bank.ifscCode}</p>
              ${(p.remarks ?? '').trim() ? `<p style="margin:8px 0 2px; font-weight:bold;">Remarks:</p><p style="margin:2px 0;">${p.remarks}</p>` : ''}
            </td>
            <td style="vertical-align:top;">
              <p style="margin:2px 0;">Declaration</p>
              <p style="margin:2px 0; font-size:10px;">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
            </td>
            <td style="vertical-align:top; text-align:right; width:26%;">
              <p style="margin:2px 0;">for ${seller.name}(${fy})</p>
              <p style="margin:60px 0 2px;">Authorised Signatory</p>
            </td>
          </tr>
        </table>

        <p style="margin-top:10px; font-size:10px; text-align:center; color:#666;">This is a Computer Generated Invoice · Prepared by ${p.preparedBy}</p>
      </div>
    </div>
  `;

  void roundOff; // computed for parity with GstInvoiceTab's own display; not printed in the HTML itself (matches the original template, which shows it only in its on-screen totals box, not the print)
  return { html, totalAmount, beforeTaxValue, totalGst };
}
