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

export async function dispatchReceiveAndBill(params: {
  order: HosurOrderForBilling;
  items: HosurOrderItemForBilling[];
  payment: PaymentCapture;
  userName: string;
}): Promise<{ billId: string; billNo: string; whatsappStatus: 'sent' | 'failed'; whatsappError: string | null }> {
  const { order, items, payment, userName } = params;

  const counter = await getPackingCounterStatus();
  if (!counter.isOpen) {
    throw new Error("Planner's counter is closed. Open today's counter in Daily Closure before billing.");
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
  if (existingBillRow?.id) {
    billId = existingBillRow.id;
    const { data: b } = await supabase.from('hosur_bills').select('bill_no').eq('id', billId).single();
    billNo = b?.bill_no ?? '';
  } else {
    billNo = await nextBillNo();
    const subtotal = Math.round(items.reduce((sum, i) => sum + i.receivedQuantity * i.unitPrice, 0) * 100) / 100;
    const { data: billData, error: billError } = await supabase.from('hosur_bills').insert({
      bill_no: billNo, order_id: order.id, shop_id: order.shopId, shop_name: order.shopName,
      shop_whatsapp: order.shopWhatsapp, subtotal, paid_amount: 0, credit_amount: 0,
      status: 'draft', whatsapp_status: 'pending',
    }).select('id').single();
    if (billError) throw billError;
    billId = billData.id;

    const rows = items.map(i => ({
      bill_id: billId, item_name: i.itemName, unit: i.unit,
      quantity: i.receivedQuantity, unit_price: i.unitPrice,
      line_total: Math.round(i.receivedQuantity * i.unitPrice * 100) / 100,
    }));
    const { error: itemsError } = await supabase.from('hosur_bill_items').insert(rows);
    if (itemsError) { await supabase.from('hosur_bills').delete().eq('id', billId); throw itemsError; }
  }

  // 3. Capture payment (full / partial / credit) — mirrors confirmBill exactly.
  const total = items.reduce((sum, i) => sum + Math.round(i.receivedQuantity * i.unitPrice * 100) / 100, 0);
  const { paid, credit, status } = computePaymentSplit(total, payment);

  if ((payment.paymentType === 'credit' || payment.paymentType === 'partial') && !payment.dueDate) {
    throw new Error('Due date is mandatory for Credit and Partial Payment bills.');
  }
  if (payment.paymentType === 'partial' && paid <= 0) throw new Error('Enter paid amount for partial payment.');
  if (payment.paymentType === 'partial' && paid >= total) throw new Error('Partial payment paid amount must be less than bill total.');

  const now = new Date().toISOString();
  const paymentMode = payment.paymentType === 'credit' ? null : (payment.paymentMode ?? 'cash');

  const { error: billUpdateError } = await supabase.from('hosur_bills').update({
    paid_amount: paid, credit_amount: credit, payment_type: payment.paymentType,
    payment_mode: paymentMode, due_date: credit > 0 ? payment.dueDate : null,
    status, confirmed_by: userName, confirmed_at: now,
  }).eq('id', billId);
  if (billUpdateError) throw billUpdateError;

  await supabase.from('hosur_orders').update({ status: 'billed', bill_id: billId }).eq('id', order.id);

  if (credit > 0) {
    const { data: creditSale, error: ledgerError } = await supabase.from('branch_credit_sales').insert({
      branch: BRANCH, source: 'hosur', source_id: billId, customer_ref: order.shopId, customer_name: order.shopName,
      customer_phone: order.shopWhatsapp,
      items: items.map(i => ({ itemName: i.itemName, quantity: i.receivedQuantity, sellUnit: i.unit, price: i.unitPrice, lineTotal: i.receivedQuantity * i.unitPrice })),
      subtotal: total, amount_paid: paid, credit_amount: credit, sold_by: userName, bill_no: billNo,
      due_date: payment.dueDate, status: paid > 0 ? 'partial' : 'pending', notes: 'Hosur credit bill',
    }).select('id').single();
    if (ledgerError) throw ledgerError;
    if (paid > 0 && creditSale?.id) {
      await supabase.from('branch_credit_payments').insert({
        credit_sale_id: creditSale.id, branch: BRANCH, bill_no: billNo, amount: paid,
        payment_mode: paymentMode, payment_purpose: 'partial_at_billing', remarks: 'Hosur partial payment at billing',
        collected_by: userName, created_at: now,
      });
    }
    await notifyAdmin('Hosur credit bill created', `${order.shopName} has credit of ₹${credit.toFixed(2)} on bill ${billNo}.`, billId, billNo, { billId, amount: credit });
  }

  if (paid > 0 && items.length > 0) {
    const salesRows = items.map(i => ({
      branch: BRANCH, item_name: i.itemName, quantity_sold: i.receivedQuantity, sold_at: now,
      sold_by: userName, payment_method: paymentMode, unit_price: i.unitPrice, bill_no: billNo, source: 'hosur_wholesale',
    }));
    supabase.from('branch_sales').insert(salesRows).then(({ error }) => { if (error) console.warn('[hosurBillingBridge] branch_sales mirror failed:', error.message); });
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
