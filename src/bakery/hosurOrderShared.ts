// src/bakery/hosurOrderShared.ts
// Shared helpers for the two places a Hosur shop order can be created:
//   1. HosurShopOrderPanel.tsx's PlaceOrderSection (Planner > Hosur tab)
//   2. HosurDashboard.tsx's NewOrderTab (Hosur's own dashboard)
// Before this file existed, the two saveOrder() implementations had each
// grown their own notes-tag format and itemId scheme, which meant identical
// shop orders looked structurally different depending on which screen
// created them (e.g. one embedded the shop name in notes, the other didn't;
// one's itemId included the order id, the other's didn't). No single bug was
// caused by this, but it made the two flows fragile to touch independently
// and easy to accidentally regress. Centralising the shared pieces here (tag
// format, itemId scheme, and a same-shop duplicate-order guard) keeps both
// screens byte-for-byte consistent going forward.
import { supabase } from '@/lib/supabase';

// The bakery_orders.notes tag that links a bakery_orders row back to the
// hosur_orders row(s) it was created from. submitDispatch() and
// mergeOrdersForStore() in bakeryStore.ts parse this with
// /HOSUR_ORDER_IDS?:([^|]+)/ — that regex only reads up to the first `|`,
// so the extra `|orderNumber|shopName` segments below are for human
// readability / debugging only and are safe to add without touching the
// parsing logic anywhere else.
export function buildHosurOrderTag(orderId: string, orderNumber: string, shopName: string, notes: string): string {
  const trimmedNotes = notes.trim();
  return `HOSUR_ORDER_ID:${orderId}|${orderNumber}|${shopName}${trimmedNotes ? `|${trimmedNotes}` : ''}`;
}

// itemId scheme for a bakery_orders.items[] entry created from a Hosur shop
// order line. Including the order id keeps every item unique per order
// (matches HosurDashboard's original scheme) instead of colliding whenever
// two different shops order the same item name.
export function buildHosurItemId(orderId: string, itemName: string): string {
  return `hosur-${orderId}-${itemName.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

// Guards against the same shop's order being submitted twice in quick
// succession (double-click, slow network causing a retried submit, etc).
// Looks for a hosur_orders row for the same shop, same subtotal, still in
// 'draft' status, created within the last 90 seconds. This is deliberately
// a soft/advisory check (not a DB constraint) so a genuinely-intended
// same-shop repeat order a few minutes later is never blocked.
export async function checkRecentDuplicateHosurOrder(shopId: string, subtotal: number): Promise<{ isDuplicate: boolean; orderNumber?: string }> {
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await supabase
    .from('hosur_orders')
    .select('order_number, subtotal, created_at')
    .eq('shop_id', shopId)
    .eq('status', 'draft')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error || !data) return { isDuplicate: false };
  const match = data.find(row => Math.abs(Number(row.subtotal ?? 0) - subtotal) < 0.01);
  return match ? { isDuplicate: true, orderNumber: String(match.order_number ?? '') } : { isDuplicate: false };
}
