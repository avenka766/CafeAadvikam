// src/bakery/hosurBillingBridge.ts
// Standalone version of HosurDashboard's "receive -> create bill -> confirm
// payment -> send WhatsApp" sequence, callable directly from Planner's
// Dispatch action so the whole thing happens in one click instead of three.
// Reuses the exact same bill/QR/WhatsApp generation helpers as HosurDashboard
// (imported, not duplicated) so behavior stays identical to the existing,
// already-proven billing flow.
import { supabase } from '@/lib/supabase';
import {
  BRANCH, cleanPhone, notifyAdmin, buildBillMessage, nextBillNo,
  createWhatsappQrMedia, createWhatsappBillDocument, createWhatsappBillImage, uploadWhatsappMedia,
  mapBill, mapBillItem, safeMediaFileName, base64MediaBlob,
  type PaymentType, type BillStatus, type HosurBill, type HosurBillItem, type HosurWhatsappLog,
} from '@/pages/HosurDashboard';
import { getPackingCounterStatus } from './packingCounter';

export interface HosurOrderForBilling {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
}
export interface HosurOrderItemForBilling {
  id: string;
  itemName: string;
  unit: 'pcs' | 'kg';
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
}
export interface PaymentCapture {
  paymentType: PaymentType;
  paidAmount?: number;
  paymentMode?: string | null;
  dueDate?: string | null;
}

async function sendHosurWhatsapp(params: {
  shopId?: string | null; shopName: string; phone: string;
  billId?: string | null; billNo?: string | null;
  messageType: HosurWhatsappLog['messageType']; body: string;
  billForMedia: HosurBill; itemsForMedia: HosurBillItem[];
}): Promise<{ status: 'sent' | 'failed'; errorMessage: string | null }> {
  const normalizedPhone = cleanPhone(params.phone);
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage: string | null = null;
  try {
    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
    if (!supabaseUrl || !anonKey) throw new Error('Supabase URL or publishable key is missing in the deployed app.');

    const billDocument = params.messageType === 'bill'
      ? await createWhatsappBillDocument(params.billForMedia, params.itemsForMedia)
      : null;
    const qrMedia = params.messageType === 'bill' || params.messageType === 'reminder'
      ? await createWhatsappQrMedia(
          params.billForMedia.creditAmount > 0 ? params.billForMedia.creditAmount : params.billForMedia.subtotal,
          params.billNo,
        )
      : null;

    let legacyMediaUrl: string | null = null;
    let legacyFileName: string | null = null;
    if (params.messageType === 'bill') {
      const imageBlob = await createWhatsappBillImage(params.billForMedia, params.itemsForMedia);
      legacyFileName = `${safeMediaFileName(params.billForMedia.billNo)}-bill-and-qr.png`;
      legacyMediaUrl = await uploadWhatsappMedia(imageBlob, legacyFileName);
    } else if (params.messageType === 'reminder' && qrMedia) {
      const qrBlob = base64MediaBlob(qrMedia.base64, qrMedia.mimeType);
      legacyFileName = qrMedia.fileName;
      legacyMediaUrl = await uploadWhatsappMedia(qrBlob, legacyFileName);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60000);
    let response: Response;
    try {
      response = await window.fetch(`${supabaseUrl}/functions/v1/send-hosur-whatsapp`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone, message: params.body, shopId: params.shopId, billId: params.billId,
          billNo: params.billNo, messageType: params.messageType, billDocument, qrImage: qrMedia,
          mediaUrl: legacyMediaUrl, mediaType: legacyMediaUrl ? 'image' : null, fileName: legacyFileName,
        }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    const responseText = await response.text();
    let fnData: { ok?: boolean; error?: string; mediaErrors?: string[]; sentAs?: string; fallbackUsed?: boolean; imageError?: string | null; sentParts?: { billDocument?: boolean; qrImage?: boolean } } = {};
    if (responseText) {
      try { fnData = JSON.parse(responseText); } catch { throw new Error(`WhatsApp service returned an invalid response (HTTP ${response.status}).`); }
    }
    if (!response.ok || !fnData.ok) {
      throw new Error([fnData.error, ...(fnData.mediaErrors ?? [])].filter(Boolean).join(' | ') || `WhatsApp service returned HTTP ${response.status}.`);
    }
    if (fnData.fallbackUsed || fnData.sentAs === 'text') {
      throw new Error(fnData.imageError || 'The message text was sent, but WhatsApp could not download the bill/QR image. Retry from WhatsApp Logs.');
    }
    if (fnData.sentParts && (!fnData.sentParts.billDocument || !fnData.sentParts.qrImage)) {
      throw new Error('WhatsApp did not confirm both the bill document and QR image.');
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'WhatsApp Edge Function not configured or sending failed.';
  }

  const payload = {
    shop_id: params.shopId ?? null, shop_name: params.shopName, phone: normalizedPhone,
    bill_id: params.billId ?? null, bill_no: params.billNo ?? null, message_type: params.messageType,
    message_body: params.body, status, error_message: errorMessage,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  };
  await supabase.from('hosur_whatsapp_logs').insert(payload);
  if (params.billId) await supabase.from('hosur_bills').update({ whatsapp_status: status }).eq('id', params.billId);

  return { status, errorMessage };
}

/**
 * The full one-click flow: order already 'dispatched' with received_quantity
 * set == receive confirmed -> create the bill -> capture payment -> send the
 * WhatsApp bill. Mirrors HosurDashboard's confirmOrder + createDraftBill +
 * confirmBill + sendWhatsapp exactly, just invoked in one call instead of
 * three separate manual tab visits.
 */
export function computePaymentSplit(total: number, payment: PaymentCapture): { paid: number; credit: number; status: BillStatus } {
  let paid = 0, credit = 0;
  if (payment.paymentType === 'full') { paid = total; credit = 0; }
  else if (payment.paymentType === 'credit') { paid = 0; credit = total; }
  else { paid = Math.max(0, Math.min(total, Number(payment.paidAmount || 0))); credit = Math.max(0, total - paid); }
  const status: BillStatus = credit <= 0 ? 'paid' : payment.paymentType === 'credit' ? 'credit_open' : 'partial_credit';
  return { paid, credit, status };
}

// FEATURE (2026-09-02): "give the option to enter the charges field — a
// field to enter the charge name and a field to enter the amount" — an
// ad-hoc named charge (delivery fee, packing charge, etc.) added on top of
// the item total. Deliberately NOT modeled as a hosur_order_items row (a
// charge was never "ordered" or physically dispatched — there's no stock to
// receive/reconcile), so it bypasses step 1's received_quantity update
// entirely and only ever affects the bill total + an extra hosur_bill_items
// row. Only applied when a brand-new bill is created (the "reuse an
// existing draft bill" path below is a same-order retry-idempotency
// safeguard — re-adding charges there on a retry would duplicate them).
export interface HosurBillCharge { name: string; amount: number }

export async function dispatchReceiveAndBill(params: {
  order: HosurOrderForBilling;
  items: HosurOrderItemForBilling[];
  charges?: HosurBillCharge[];
  payment: PaymentCapture;
  userName: string;
  // FEATURE (2026-09-02): "for hosur dispatch no need to open the counter
  // because everything is recorded as credit — don't block the physical
  // dispatch." The counter gate exists to reconcile cash/UPI/card actually
  // collected at billing time; a pure-credit bill collects nothing, so
  // there's nothing to reconcile. Defaults to true (unchanged behavior) for
  // the existing manual Hosur tab caller, which still allows full/partial
  // payment and does need the counter open for that cash.
  requireCounterOpen?: boolean;
}): Promise<{ billId: string; billNo: string; whatsappStatus: 'sent' | 'failed'; whatsappError: string | null }> {
  const { order, items, payment, userName, requireCounterOpen = true } = params;
  const charges = (params.charges ?? []).filter(c => c.name.trim() && Number.isFinite(c.amount) && c.amount > 0);
  const chargesTotal = Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

  if (requireCounterOpen) {
    const counter = await getPackingCounterStatus();
    if (!counter.isOpen) {
      throw new Error("Planner's counter is closed. Open today's counter in Daily Closure before billing.");
    }
  }

  // 1. Mark items received == what was dispatched (Planner is both sender and
  //    confirmer now, so there is no separate physical receiving step).
  for (const item of items) {
    const { error } = await supabase.from('hosur_order_items')
      .update({ received_quantity: item.receivedQuantity }).eq('id', item.id);
    if (error) throw error;
  }
  await supabase.from('hosur_orders').update({ status: 'received_confirmed', received_at: new Date().toISOString() }).eq('id', order.id);

  // 2. Create the draft bill (idempotent — reuses an existing draft bill for this order if present).
  const { data: existingBillRow } = await supabase.from('hosur_bills').select('id').eq('order_id', order.id).neq('status', 'cancelled').maybeSingle();
  let billId: string;
  let billNo: string;
  // BUG FIX (2026-09-02, alongside the charges feature): payment capture
  // below used to recompute `total` fresh from `items` alone — correct when
  // this is a brand-new bill, but on the "reuse an existing draft bill"
  // retry path, that recompute would silently drop any charges that were
  // already added to the bill on the FIRST attempt (charges only ever get
  // (re-)inserted when creating a new bill, not on a retry). Track the
  // bill's own authoritative subtotal in both branches and use that for
  // payment capture instead of recomputing it.
  let billSubtotal: number;
  if (existingBillRow?.id) {
    billId = existingBillRow.id;
    const { data: b } = await supabase.from('hosur_bills').select('bill_no, subtotal').eq('id', billId).single();
    billNo = b?.bill_no ?? '';
    billSubtotal = Number(b?.subtotal ?? 0);
  } else {
    billNo = await nextBillNo();
    const subtotal = Math.round((items.reduce((sum, i) => sum + i.receivedQuantity * i.unitPrice, 0) + chargesTotal) * 100) / 100;
    billSubtotal = subtotal;
    const { data: billData, error: billError } = await supabase.from('hosur_bills').insert({
      bill_no: billNo, order_id: order.id, shop_id: order.shopId, shop_name: order.shopName,
      shop_whatsapp: order.shopWhatsapp, subtotal, paid_amount: 0, credit_amount: 0,
      status: 'draft', whatsapp_status: 'pending',
    }).select('id').single();
    // AUDIT FIX (2026-09-03): the SELECT-then-INSERT above is a genuine
    // check-then-act race — two near-simultaneous calls for the same order
    // (two tabs, a slow retry) could both pass the SELECT before either
    // INSERT lands, and used to both succeed, creating two separate bills
    // for one dispatch. A DB-level unique constraint on order_id now makes
    // the SECOND insert fail instead (code 23505) — recover gracefully by
    // re-fetching the bill the OTHER call just created, rather than
    // surfacing a raw constraint-violation error for what is, from the
    // planner's point of view, a real success (their order did get billed —
    // just by the other in-flight request).
    if (billError?.code === '23505') {
      const { data: raceBillRow } = await supabase.from('hosur_bills').select('id, bill_no, subtotal').eq('order_id', order.id).neq('status', 'cancelled').maybeSingle();
      if (!raceBillRow) throw billError;
      billId = raceBillRow.id;
      billNo = raceBillRow.bill_no;
      billSubtotal = Number(raceBillRow.subtotal ?? 0);
    } else {
    if (billError) throw billError;
    billId = billData.id;

    const rows = [
      ...items.map(i => ({
        bill_id: billId, item_name: i.itemName, unit: i.unit,
        quantity: i.receivedQuantity, unit_price: i.unitPrice,
        line_total: Math.round(i.receivedQuantity * i.unitPrice * 100) / 100,
      })),
      // Charges: quantity 1, unit_price == the charge amount == its own
      // line_total — same shape a real 1-unit line item would have, so
      // every downstream reader (bill print, WhatsApp message, exports)
      // that just sums line_total needs no special-casing for these.
      ...charges.map(c => ({
        bill_id: billId, item_name: c.name.trim(), unit: 'charge',
        quantity: 1, unit_price: Math.round(c.amount * 100) / 100,
        line_total: Math.round(c.amount * 100) / 100,
      })),
    ];
    const { error: itemsError } = await supabase.from('hosur_bill_items').insert(rows);
    if (itemsError) { await supabase.from('hosur_bills').delete().eq('id', billId); throw itemsError; }
    }
  }

  // 3. Capture payment (full / partial / credit) — mirrors confirmBill exactly.
  const total = billSubtotal;
  const { paid, credit, status } = computePaymentSplit(total, payment);

  if ((payment.paymentType === 'credit' || payment.paymentType === 'partial') && !payment.dueDate) {
    throw new Error('Due date is mandatory for Credit and Partial Payment bills.');
  }
  if (payment.paymentType === 'partial' && paid <= 0) throw new Error('Enter paid amount for partial payment.');
  if (payment.paymentType === 'partial' && paid >= total) throw new Error('Partial payment paid amount must be less than bill total.');

  const now = new Date().toISOString();
  const paymentMode = payment.paymentType === 'credit' ? null : (payment.paymentMode ?? 'cash');

  // BUG FIX (2026-08-12, audit): guard against confirming the same draft bill
  // twice (this bridge racing with itself, or with HosurDashboard's own
  // confirmBill, on the same bill) — mirrors the same fix in confirmBill.
  const { data: updatedBillRow, error: billUpdateError } = await supabase.from('hosur_bills').update({
    paid_amount: paid, credit_amount: credit, payment_type: payment.paymentType,
    payment_mode: paymentMode, due_date: credit > 0 ? payment.dueDate : null,
    status, confirmed_by: userName, confirmed_at: now,
  }).eq('id', billId).eq('status', 'draft').select('id').maybeSingle();
  if (billUpdateError) throw billUpdateError;
  if (!updatedBillRow) throw new Error('This bill has already been confirmed (possibly from another tab/device) — refresh and check its status before retrying.');

  const { error: orderStatusError } = await supabase.from('hosur_orders').update({ status: 'billed', bill_id: billId }).eq('id', order.id);
  if (orderStatusError) console.warn('[hosurBillingBridge] failed to mark order billed:', orderStatusError.message);

  if (credit > 0) {
    // BUG FIX (2026-08-12, audit): roll the bill back to 'draft' if the
    // credit ledger insert fails, same reasoning as confirmBill — otherwise
    // it's left confirmed with a credit balance no ledger row backs.
    const rollbackToDraft = async () => {
      await supabase.from('hosur_bills').update({
        paid_amount: 0, credit_amount: 0, payment_type: null, payment_mode: null,
        due_date: null, status: 'draft', confirmed_by: null, confirmed_at: null,
      }).eq('id', billId).eq('status', status);
    };
    const { data: creditSale, error: ledgerError } = await supabase.from('branch_credit_sales').insert({
      branch: BRANCH, source: 'hosur', source_id: billId, customer_ref: order.shopId, customer_name: order.shopName,
      customer_phone: order.shopWhatsapp,
      items: [
        ...items.map(i => ({ itemName: i.itemName, quantity: i.receivedQuantity, sellUnit: i.unit, price: i.unitPrice, lineTotal: i.receivedQuantity * i.unitPrice })),
        ...charges.map(c => ({ itemName: c.name.trim(), quantity: 1, sellUnit: 'charge', price: c.amount, lineTotal: c.amount })),
      ],
      subtotal: total, amount_paid: paid, credit_amount: credit, sold_by: userName, bill_no: billNo,
      due_date: payment.dueDate, status: paid > 0 ? 'partial' : 'pending', notes: 'Hosur credit bill',
    }).select('id').single();
    if (ledgerError) { await rollbackToDraft(); throw ledgerError; }
    if (paid > 0 && creditSale?.id) {
      const { error: paymentError } = await supabase.from('branch_credit_payments').insert({
        credit_sale_id: creditSale.id, branch: BRANCH, bill_no: billNo, amount: paid,
        payment_mode: paymentMode, payment_purpose: 'partial_at_billing', remarks: 'Hosur partial payment at billing',
        collected_by: userName, created_at: now,
      });
      if (paymentError) { await rollbackToDraft(); await supabase.from('branch_credit_sales').delete().eq('id', creditSale.id); throw paymentError; }
    }
    await notifyAdmin('Hosur credit bill created', `${order.shopName} has credit of ₹${credit.toFixed(2)} on bill ${billNo}.`, billId, billNo, { billId, amount: credit });
  }

  if (paid > 0 && items.length > 0) {
    const salesRows = items.map(i => ({
      branch: BRANCH, item_name: i.itemName, quantity_sold: i.receivedQuantity, sold_at: now,
      sold_by: userName, payment_method: paymentMode, unit_price: i.unitPrice, bill_no: billNo, source: 'hosur_wholesale',
    }));
    // AUDIT FIX (2026-09-03): un-awaited, console.warn-only on failure — the
    // real bill/credit record above is correct either way, but a failure
    // here silently under-reports this sale on the branch sales dashboard
    // forever (nothing retries it, nothing else surfaces it). Notify admin
    // on failure too, same as the credit-bill notification right above.
    void supabase.from('branch_sales').insert(salesRows).then(({ error }) => {
      if (error) {
        console.warn('[hosurBillingBridge] branch_sales mirror failed:', error.message);
        void notifyAdmin('Hosur sale missing from branch_sales report', `Bill ${billNo} (${order.shopName}) was billed correctly, but its branch_sales report row failed to save: ${error.message}. This sale is under-reported in Branch Sales until fixed manually.`, billId, billNo, { billId, error: error.message });
      }
    });
  }

  // 4. Send the WhatsApp bill — the actual automation the user asked for.
  const { data: billRow } = await supabase.from('hosur_bills').select('*').eq('id', billId).single();
  const { data: billItemRows } = await supabase.from('hosur_bill_items').select('*').eq('bill_id', billId);
  const finalBill = mapBill(billRow);
  const finalItems = (billItemRows ?? []).map(mapBillItem);
  const body = buildBillMessage(finalBill, finalItems);
  const whatsapp = await sendHosurWhatsapp({
    shopId: order.shopId, shopName: order.shopName, phone: order.shopWhatsapp,
    billId, billNo, messageType: 'bill', body, billForMedia: finalBill, itemsForMedia: finalItems,
  });
  if (whatsapp.status === 'failed') {
    await notifyAdmin('Hosur WhatsApp bill failed', `${billNo} for ${order.shopName} could not be sent. Retry from WhatsApp Logs.`, billId, billNo, { error: whatsapp.errorMessage });
  }

  return { billId, billNo, whatsappStatus: whatsapp.status, whatsappError: whatsapp.errorMessage };
}

// FEATURE (2026-09-03): "if they edit the bill the new invoice should go to
// the client with the update invoice in whatsapp" — a Hosur dispatch is
// auto-billed the moment it's confirmed (dispatchReceiveAndBill above), but
// Planner can later correct that same dispatch from Dispatch tab → Recent
// Dispatch Invoices → Edit Bill (updateDispatchInvoice in dispatchInvoice.ts).
// That edit only ever touched the printable dispatch_invoices record — the
// actual credit ledger (hosur_bills/hosur_bill_items/branch_credit_sales)
// and the WhatsApp bill the shop already has in hand were left silently out
// of sync with the corrected amount. Called from updateDispatchInvoice
// itself right after a Hosur-scope edit saves, so the shop's copy never
// disagrees with what Planner actually billed.
export async function syncHosurBillWithInvoiceEdit(params: {
  hosurOrderId: string;
  // FINAL (already-discounted, actually-billed) line items — the caller is
  // responsible for applying each source invoice's own discount_pct before
  // calling this. BUG FIX (2026-09-03): a single Hosur order is very often
  // dispatched across multiple separate batches, each getting its own
  // dispatch_invoices row but sharing ONE hosur_bills row (dispatchReceiveAndBill
  // reuses the existing draft bill by order_id — see its "2. Create the
  // draft bill" comment above). The caller must pass the FULL combined item
  // list across every dispatch_invoices row for this Hosur order, not just
  // the one that was just edited — passing only one invoice's items here
  // silently discards whatever the order's OTHER invoice(s) already
  // contributed (confirmed live: Shree Skanda Villas' first ₹905.28 batch
  // vanished from the credit ledger when its second ₹1,132.20 batch was
  // edited, because the caller used to pass only the edited invoice's items).
  items: { itemName: string; unit: string; quantity: number; unitPrice: number }[];
// Single optional-field shape (not a discriminated union) — this repo's
// strictNullChecks:false gotcha silently breaks `ok`-based narrowing on a
// real union, see project memory / other `ok:boolean` result shapes in
// this codebase.
}): Promise<{ ok: boolean; billNo?: string; whatsappStatus?: 'sent' | 'failed'; whatsappError?: string | null; message?: string }> {
  const { data: billRow, error: billErr } = await supabase.from('hosur_bills').select('*').eq('order_id', params.hosurOrderId).neq('status', 'cancelled').maybeSingle();
  if (billErr) return { ok: false, message: billErr.message };
  if (!billRow) return { ok: false, message: 'No linked Hosur bill found for this order — nothing to sync.' };
  const bill = mapBill(billRow);
  if (bill.status === 'draft') return { ok: false, message: 'This order has not been billed yet — nothing to sync.' };

  const rows = params.items
    .filter(i => i.itemName.trim() && i.quantity > 0)
    .map(i => {
      const unitPrice = Math.round(i.unitPrice * 100) / 100;
      return { bill_id: bill.id, item_name: i.itemName.trim(), unit: i.unit, quantity: i.quantity, unit_price: unitPrice, line_total: Math.round(i.quantity * unitPrice * 100) / 100 };
    });
  if (rows.length === 0) return { ok: false, message: 'No items left to bill.' };
  const newSubtotal = Math.round(rows.reduce((s, r) => s + r.line_total, 0) * 100) / 100;

  const { error: delErr } = await supabase.from('hosur_bill_items').delete().eq('bill_id', bill.id);
  if (delErr) return { ok: false, message: delErr.message };
  const { error: insErr } = await supabase.from('hosur_bill_items').insert(rows);
  if (insErr) return { ok: false, message: insErr.message };

  // Hosur is always full credit (see dispatchReceiveAndBill's payment param
  // above) — paid_amount stays whatever it already was (0 in practice).
  const newCredit = Math.max(0, newSubtotal - bill.paidAmount);
  const { error: updBillErr } = await supabase.from('hosur_bills').update({ subtotal: newSubtotal, credit_amount: newCredit, updated_at: new Date().toISOString() }).eq('id', bill.id);
  if (updBillErr) return { ok: false, message: updBillErr.message };

  // Keep the credit ledger of record (branch_credit_sales, linked via the
  // same source_id used when it was first created) matching too — otherwise
  // Owner/Admin credit reports would keep showing the pre-edit amount.
  const { error: ledgerErr } = await supabase.from('branch_credit_sales').update({
    items: rows.map(r => ({ itemName: r.item_name, quantity: r.quantity, sellUnit: r.unit, price: r.unit_price, lineTotal: r.line_total })),
    subtotal: newSubtotal, credit_amount: newCredit,
  }).eq('source', 'hosur').eq('source_id', bill.id);
  if (ledgerErr) console.warn('[syncHosurBillWithInvoiceEdit] credit ledger sync failed:', ledgerErr.message);

  const { data: freshBillRow } = await supabase.from('hosur_bills').select('*').eq('id', bill.id).single();
  const { data: freshItemRows } = await supabase.from('hosur_bill_items').select('*').eq('bill_id', bill.id);
  const finalBill = mapBill(freshBillRow);
  const finalItems = (freshItemRows ?? []).map(mapBillItem);
  const body = `*UPDATED INVOICE — please discard the earlier copy*\n\n${buildBillMessage(finalBill, finalItems)}`;
  const whatsapp = await sendHosurWhatsapp({
    shopId: finalBill.shopId, shopName: finalBill.shopName, phone: finalBill.shopWhatsapp,
    billId: bill.id, billNo: bill.billNo, messageType: 'bill', body, billForMedia: finalBill, itemsForMedia: finalItems,
  });
  if (whatsapp.status === 'failed') {
    await notifyAdmin('Hosur updated invoice WhatsApp failed', `${bill.billNo} for ${finalBill.shopName} was corrected but the updated invoice could not be sent. Retry from WhatsApp Logs.`, bill.id, bill.billNo, { error: whatsapp.errorMessage });
  }
  return { ok: true, billNo: bill.billNo, whatsappStatus: whatsapp.status, whatsappError: whatsapp.errorMessage };
}
