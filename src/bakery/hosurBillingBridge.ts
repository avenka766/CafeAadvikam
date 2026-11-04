import {financialLineTotal} from '@/lib/financialRounding';
import {webDispatchIdentity,finishWebDispatchIdentity} from './webDispatchRequest';
import {automaticDesktopBilling,billingSnapshot,desktopCheckoutIdentity,finishDesktopCheckout} from '@/lib/desktopBilling';
import { hosurInvoiceLedgerLines } from './hosurGstLedger';
import type { DispatchInvoiceItem, DispatchInvoiceRecord } from './dispatchInvoice';
import type { GstPartyDetails } from './gstTaxInvoice';
// src/bakery/hosurBillingBridge.ts
// Standalone version of HosurDashboard's "receive -> create bill -> confirm
// payment -> send WhatsApp" sequence, callable directly from Planner's
// Dispatch action so the whole thing happens in one click instead of three.
// Reuses the exact same bill/QR/WhatsApp generation helpers as HosurDashboard
// (imported, not duplicated) so behavior stays identical to the existing,
// already-proven billing flow.
import { supabase, fetchAllRows } from '@/lib/supabase';
import { getAppSessionToken } from '@/lib/appSession';
import {
  BRANCH, cleanPhone, notifyAdmin, buildBillMessage,
  createWhatsappQrMedia, createWhatsappBillDocument, createWhatsappBillImage, uploadWhatsappMedia,
  mapBill, mapBillItem, safeMediaFileName, base64MediaBlob,
  type PaymentType, type BillStatus, type HosurBill, type HosurBillItem, type HosurWhatsappLog,
} from '@/pages/HosurDashboard';
import { getPackingCounterStatus } from './packingCounter';
import { saveDispatchInvoice } from './dispatchInvoice';
import { registerReplayHandler, useOfflineQueueStore } from '@/lib/offlineQueue';

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
      legacyFileName = `${safeMediaFileName(params.billForMedia.invoiceNo ?? params.billForMedia.billNo)}-bill-and-qr.png`;
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
        // SECURITY FIX (2026-09-09): the function now requires a valid staff
        // session — see send-hosur-whatsapp/index.ts.
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-cafe-session': getAppSessionToken() ?? '' },
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
  let paid: number, credit: number;
  if (payment.paymentType === 'full') { paid = total; credit = 0; }
  else if (payment.paymentType === 'credit') { paid = 0; credit = total; }
  else { paid = Math.max(0, Math.min(total, Number(payment.paidAmount || 0))); credit = Math.max(0, total - paid); }
  const status: BillStatus = credit <= 0 ? 'paid' : payment.paymentType === 'credit' ? 'credit_open' : 'partial_credit';
  return { paid, credit, status };
}

/**
 * BUG FIX (2026-09-14): the money-losing half of the 2026-09-13 duplicate-
 * bill incident (see project_hosur_duplicate_rebill memory) — pulled out as
 * its own pure function so it has direct regression coverage instead of only
 * being reachable through the full dispatchReceiveAndBill call (which needs
 * a live Supabase session and a counter/order/bill round-trip to exercise).
 * `currentReceivedById` is what's already recorded as billed in
 * `hosur_order_items.received_quantity` for each item, keyed by item id;
 * `items` is what THIS call is about to bill. True only if at least one item
 * shows a real increase — dispatchedQuantity only ever grows, so a genuine
 * new batch always clears this, and a stale repeat of an already-billed
 * order never does.
 */
export function hasUnbilledQuantity(
  items: { id: string; receivedQuantity: number }[],
  currentReceivedById: Map<string, number>,
): boolean {
  return items.some(i => i.receivedQuantity > (currentReceivedById.get(i.id) ?? 0) + 0.009);
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

// OFFLINE SUPPORT (2026-10-01): "I need complete offline bill when network is
// not there" — HosurShopOrderPanel.tsx's "Dispatch & Bill" quick action
// (dispatchAndBill) used to just refuse outright when offline (see the guard
// added earlier this pass). This is the real queue-and-replay path instead,
// built the same way as every other offline-capable flow in this app
// (branch_checkout, cafe_order_submit): capture the operator's intent now,
// defer EVERY actual write — invoice minting, the bill itself, leftover-pool
// bookkeeping — to replay time, when they run for real against live server
// state. Deliberately does NOT pre-validate or pre-mint anything client-side
// (no provisional invoice number, nothing "frozen" and reconciled later) —
// unlike branch_checkout's offline path, this one is a single shared
// function called identically whether it runs immediately (online) or later
// (replay), so there is no second, parallel implementation to keep in sync
// and no way for the two paths to silently diverge.
//
// This is deliberately SAFER than it might look at first glance, precisely
// BECAUSE nothing is decided early: the exact same duplicate-rebill guard
// (hasUnbilledQuantity, inside dispatchReceiveAndBill) and the exact same
// atomic invoice-number minting (saveDispatchInvoice) run at replay time
// against whatever the server actually looks like then — identical to the
// operator simply waiting for a connection and clicking the button
// themselves, just automated. See project_hosur_duplicate_rebill memory for
// why that live check exists and must never be bypassed or weakened.
//
// Restricted to credit payment only (mirrors branch_checkout's own
// `offlineEligible` restriction, and this codebase's existing stated
// philosophy for Hosur: "no need to open the counter because everything is
// recorded as credit" — a full/partial cash payment needs the counter
// reconciled live, which is meaningless without a connection anyway).
export interface HosurDispatchAndBillPayload {
  order: HosurOrderForBilling;
  billItems: { knownReceivedQuantity?:number; id: string; itemName: string; unit: 'pcs' | 'kg'; quantity: number; unitPrice: number; receivedQuantity: number }[];
  charges: HosurBillCharge[];
  // Full payment capture (full/partial/credit) — NOT hardcoded to credit:
  // this function backs BOTH the normal online call (every payment type) and
  // the offline queue (which separately restricts ITSELF to credit before
  // ever constructing a payload — see the offline branch in
  // HosurShopOrderPanel.tsx). Hardcoding credit here would silently break
  // full/partial payment for the online path too.
  payment: PaymentCapture;
  userName: string;
  gst: { on: boolean; pct: number; hsn: string; supplyType: 'intra' | 'inter'; buyer?: GstPartyDetails } | null;
  // Leftover-pool rows the operator had already matched to this order before
  // going offline (HosurShopOrderPanel's `appliedLeftovers`, filtered to this
  // order) — captured as a snapshot of operator intent, not re-derived from
  // whatever local state happens to exist when this replays.
  appliedLeftovers: { leftoverId: string; qty: number }[];
}

// A provider/read failure after commit must never repeat financial writes.
export async function notifyConfirmedHosurInvoice(invoiceRecord:DispatchInvoiceRecord):Promise<{billNo:string;whatsappStatus:'sent'|'failed';whatsappError:string|null;invoice:DispatchInvoiceRecord}>{
  if(invoiceRecord.workflowDuplicate)return {billNo:invoiceRecord.invoiceNo,whatsappStatus:'failed',whatsappError:'This batch was already saved. Check WhatsApp Logs before resending.',invoice:invoiceRecord};
  try {
    const id=invoiceRecord.workflowResult?.hosurBillId;
    if(!id)throw Error('Confirmed Hosur bill reference is unavailable.');
    const [billResult,itemResult]=await Promise.all([supabase.from('hosur_bills').select('*').eq('id',id).single(),fetchAllRows<Record<string,unknown>>('hosur_bill_items',q=>q.select('*').eq('bill_id',id).order('id'))]);
    if(billResult.error||itemResult.error||!billResult.data)throw billResult.error||(itemResult.error?Error(itemResult.error):Error('Confirmed bill could not load for WhatsApp.'));
    const bill=mapBill(billResult.data),items=(itemResult.data||[]).map(mapBillItem);
    const sent=await sendHosurWhatsapp({shopId:bill.shopId,shopName:bill.shopName,phone:bill.shopWhatsapp,billId:bill.id,billNo:invoiceRecord.invoiceNo,messageType:'bill',body:buildBillMessage(bill,items),billForMedia:bill,itemsForMedia:items});
    return {billNo:invoiceRecord.invoiceNo,whatsappStatus:sent.status==='sent'?'sent':'failed',whatsappError:sent.errorMessage||null,invoice:invoiceRecord};
  } catch(cause){return {billNo:invoiceRecord.invoiceNo,whatsappStatus:'failed',whatsappError:cause instanceof Error?cause.message:'Bill saved; notification could not complete.',invoice:invoiceRecord};}
}

export async function runHosurDispatchAndBillCore(payload: HosurDispatchAndBillPayload): Promise<{ billNo: string; whatsappStatus: 'sent' | 'failed'; whatsappError: string | null;invoice?:DispatchInvoiceRecord }> {
  const { order, charges, gst } = payload;
    if(payload.payment.paymentType!=='credit' && !(await getPackingCounterStatus()).isOpen)throw Error('Open the Planner counter before collecting payment.');
    // The form's received quantity is cumulative. Invoice only the unbilled increment.
    const state=automaticDesktopBilling()?await billingSnapshot():{actions:[]};
    const prior=state.actions.filter(a=>a.hosurBilling?.orderId===order.id && a.sync?.state!=='rejected');
    const billItems=payload.billItems.map(i=>{const known=Math.max(i.knownReceivedQuantity||0,...prior.flatMap(a=>(a.hosurBilling?.targets||[]).filter((t:any)=>t.id===i.id).map((t:any)=>t.target)));return {...i,knownReceivedQuantity:known,receivedQuantity:Math.max(0,Math.round((i.receivedQuantity-known)*1000)/1000)};}).filter(i=>i.receivedQuantity>0);
    if(!billItems.length)throw Error('This quantity has already been billed. Refresh before sending a new batch.');

  const invoiceItems: DispatchInvoiceItem[] = [
    ...billItems.map(i => ({
      itemName: i.itemName, unit: i.unit, quantity: i.receivedQuantity, unitPrice: i.unitPrice,
      lineTotal: financialLineTotal(i.receivedQuantity,i.unitPrice),
      ...(gst?.on ? { hsnCode: gst.hsn, gstPct: gst.pct, gstPricing: 'exclusive' as const, gstBuyerDetails:gst.buyer } : {}),
    })),
    ...charges.map(c => ({ itemName: c.name, unit: 'charge', quantity: 1, unitPrice: c.amount, lineTotal: c.amount })),
  ];

  if (gst?.on && (!Number.isFinite(gst.pct) || gst.pct <= 0 || gst.pct > 100)) throw new Error('Enter a valid GST percentage above 0 and up to 100.');
  const invoiceRecord = await saveDispatchInvoice({
    scope: 'Hosur',
    hosurShopId: order.shopId, hosurShopName: order.shopName, hosurShopPhone: order.shopWhatsapp,
    dispatchedBy: payload.userName,
    items: invoiceItems,
    discountPct: 0,
    isGstInvoice: gst?.on ?? false,
    gstSupplyType: gst?.supplyType ?? 'intra',
    ...{desktopKey:'hosur:'+order.id+':'+JSON.stringify(payload.billItems.map(i=>[i.id,i.receivedQuantity])),desktopHosurBilling:{orderId:order.id,shopId:order.shopId,payment:payload.payment,targets:billItems.map(i=>({id:i.id,base:i.knownReceivedQuantity||0,target:(i.knownReceivedQuantity||0)+i.receivedQuantity})),appliedLeftovers:payload.appliedLeftovers}},
  });
  if(automaticDesktopBilling())return {billNo:invoiceRecord.invoiceNo,whatsappStatus:'failed',whatsappError:'Bill saved on this computer. Check synchronization status before sending WhatsApp.',invoice:invoiceRecord};
  return notifyConfirmedHosurInvoice(invoiceRecord);
}

/**
 * Queues a "Dispatch & Bill" intent for replay once back online — see the
 * module comment above `runHosurDispatchAndBillCore`. Caller is responsible
 * for deciding when to use this (credit payment + !navigator.onLine) and for
 * any local UI state (marking the order "queued", clearing drafts) — this
 * only owns the queue entry itself.
 */
export async function queueHosurDispatchAndBill(payload: HosurDispatchAndBillPayload): Promise<void> {
  await useOfflineQueueStore.getState().enqueue('hosur_dispatch_and_bill', payload);
}

registerReplayHandler('hosur_dispatch_and_bill', async (_kind, payload) => {
  try {
    await runHosurDispatchAndBillCore(payload as HosurDispatchAndBillPayload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to dispatch and bill this order.' };
  }
});

// OFFLINE SUPPORT (2026-10-01): same reasoning as hosur_dispatch_and_bill
// above, for HosurShopOrderPanel.tsx's "dispatch leftover stock to a shop"
// action — the one real difference is there's no pre-existing hosur_orders
// row to bill against (a leftover dispatch synthesizes one on the spot), so
// that creation is ALSO deferred to replay time rather than happening eagerly
// (which would otherwise leave an orphaned pending order if the device never
// reconnects). Reuses runHosurDispatchAndBillCore's own appliedLeftovers
// consumption for the pool bookkeeping instead of a second copy of that
// read-then-update logic.
export interface HosurLeftoverDispatchPayload {
  shop: { id: string; shopName: string; whatsappNumber: string; address: string | null };
  leftoverRowId: string;
  itemName: string;
  unit: 'pcs' | 'kg';
  reason: string;
  qty: number;
  price: number;
  payment: PaymentCapture;
  userName: string;
}

export async function runHosurLeftoverDispatchCore(payload: HosurLeftoverDispatchPayload): Promise<{ billNo: string; whatsappStatus: 'sent' | 'failed'; whatsappError: string | null; orderNumber: string }> {
  const { shop, qty, price } = payload;
  {
   if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0||(payload.unit==='pcs'&&!Number.isInteger(qty)))throw Error('Enter a valid quantity and price.');
   if(payload.payment.paymentType!=='credit'&&!(await getPackingCounterStatus()).isOpen)throw Error('Open the Planner counter before collecting payment.');
   const scope='hosur-leftover:'+payload.leftoverRowId;const identity=automaticDesktopBilling()?desktopCheckoutIdentity:webDispatchIdentity;const id=identity(scope);const itemId=identity(scope+':item');const orderNumber='HSR-LO-'+id.slice(0,8).toUpperCase();
   const record=await saveDispatchInvoice({scope:'Hosur',hosurShopId:shop.id,hosurShopName:shop.shopName,hosurShopPhone:shop.whatsappNumber,dispatchedBy:payload.userName,items:[{itemName:payload.itemName,unit:payload.unit,quantity:qty,unitPrice:price,lineTotal:financialLineTotal(qty,price)}],discountPct:0,desktopKey:'hosur-leftover:'+id,desktopHosurBilling:{orderId:id,shopId:shop.id,payment:payload.payment,newOrder:{id,orderNumber,itemId,itemName:payload.itemName,unit:payload.unit,quantity:qty,unitPrice:price,shopName:shop.shopName,shopWhatsapp:shop.whatsappNumber,shopAddress:shop.address},targets:[{id:itemId,base:0,target:qty}],appliedLeftovers:[{leftoverId:payload.leftoverRowId,qty}]}});
   const finish=automaticDesktopBilling()?finishDesktopCheckout:finishWebDispatchIdentity;finish(scope);finish(scope+':item');if(!automaticDesktopBilling())return {...await notifyConfirmedHosurInvoice(record),orderNumber};return {billNo:record.invoiceNo,whatsappStatus:'failed',whatsappError:'Saved on this computer; check synchronization before sending WhatsApp.',orderNumber};
  }

}

export async function queueHosurLeftoverDispatch(payload: HosurLeftoverDispatchPayload): Promise<void> {
  await useOfflineQueueStore.getState().enqueue('hosur_leftover_dispatch', payload);
}

registerReplayHandler('hosur_leftover_dispatch', async (_kind, payload) => {
  try {
    await runHosurLeftoverDispatchCore(payload as HosurLeftoverDispatchPayload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to dispatch this leftover.' };
  }
});

// OFFLINE SUPPORT (2026-10-01): HosurDashboard.tsx's older manual 3-tab
// billing flow (Receiving tab's createDraftBill, Billing tab's confirmBill)
// is a genuinely two-step, asynchronous workflow — a draft bill is created
// when stock is received, and payment is confirmed later (possibly much
// later, possibly by different staff) once the shop actually pays. That
// shape doesn't map onto "queue one combined action" the way the one-click
// Dispatch & Bill button did, so createDraftBill stays online-only (refusing
// to create a brand-new bill number with no connection is the safe choice —
// see the guard in HosurDashboard.tsx). confirmBill, however, operates on a
// bill that already exists and is already visible on screen — structurally
// identical in shape to everything else made offline-capable this pass:
// capture the payment intent, defer every write to replay time, same
// `.eq('status','draft')` double-confirm guard runs for real then. Also
// credit-only when queued, same reasoning as dispatchAndBill — and skips
// printBill() (a live browser print dialog popping up unprompted during a
// background replay, possibly minutes later with the screen long since
// navigated away from, would be confusing rather than useful; the bill is
// reachable to print normally once synced).
export interface HosurConfirmBillPayload {
  bill: { id: string; orderId: string | null; shopId: string; shopName: string; shopWhatsapp: string; billNo: string; invoiceNo: string | null; subtotal: number };
  items: { itemName: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }[];
  paymentType: PaymentType;
  paidAmount?: number;
  paymentMode: string | null;
  dueDate: string | null;
  userName: string;
  userRole: string;
}

export async function runHosurConfirmBillCore(payload: HosurConfirmBillPayload): Promise<{bill:HosurBill;items:HosurBillItem[];duplicate:boolean;notificationWarning?:string}> {
  const {data,error}=await supabase.rpc('confirm_hosur_draft_once_v1',{
    p_bill:payload.bill.id,p_payment_type:payload.paymentType,p_paid_amount:payload.paymentType==='partial'?Number(payload.paidAmount||0):null,
    p_payment_mode:payload.paymentType==='credit'?null:payload.paymentMode,p_due_date:payload.paymentType==='full'?null:payload.dueDate,p_expected_subtotal:payload.bill.subtotal,
  });
  if(error)throw error;
  if(data?.bill?.id!==payload.bill.id)throw Error('Bill confirmation is incomplete. Retry this same bill before collecting anything again.');
  const bill=mapBill(data.bill);let items:HosurBillItem[]=[];
  try {
    const itemResult=await fetchAllRows<Record<string,unknown>>('hosur_bill_items',q=>q.select('*').eq('bill_id',bill.id).order('id'));
    if(itemResult.error)throw Error(itemResult.error);
    items=(itemResult.data||[]).map(mapBillItem);
    if(!items.length)throw Error('Saved bill items could not load. Print from bill history after refreshing.');
    if(!data.duplicate){
      const sent=await sendHosurWhatsapp({shopId:bill.shopId,shopName:bill.shopName,phone:bill.shopWhatsapp,billId:bill.id,billNo:bill.invoiceNo||bill.billNo,messageType:'bill',body:buildBillMessage(bill,items),billForMedia:bill,itemsForMedia:items});
      if(sent.status==='failed')throw Error(sent.errorMessage||'WhatsApp delivery needs attention. Retry from WhatsApp Logs.');
    }
    return {bill,items,duplicate:Boolean(data.duplicate)};
  }catch(cause){
    // Confirmation already committed. A provider or print-data failure must
    // never rewind money or leave an offline replay repeating collections.
    return {bill,items,duplicate:Boolean(data.duplicate),notificationWarning:cause instanceof Error?cause.message:'Bill saved; notification needs attention.'};
  }
}

export async function queueHosurConfirmBill(payload: HosurConfirmBillPayload): Promise<void> {
  await useOfflineQueueStore.getState().enqueue('hosur_confirm_bill', payload);
}

registerReplayHandler('hosur_confirm_bill', async (_kind, payload) => {
  try {
    await runHosurConfirmBillCore(payload as HosurConfirmBillPayload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to confirm this bill.' };
  }
});

