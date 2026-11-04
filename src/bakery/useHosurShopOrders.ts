import {useEffect,useMemo,useState} from 'react';
import {fetchRowsForIds} from '@/lib/fetchRowsForIds';
import type {ProductionRow} from './PlannerDashboard';
import type {BakeryOrder} from './types';

export function collectHosurOrderIds(row: ProductionRow, orders: BakeryOrder[]): string[] {
  // BUG FIX (audit 2026-08-26): this used to require targetBranch ===
  // 'Hosur' — but mergeOrdersForStore already correctly preserves the
  // HOSUR_ORDER_IDS tag in notes from every contributing order, even when
  // the merge's surviving primary order isn't itself Hosur-targeted (a
  // date-only cross-branch merge could combine a Hosur order with a
  // VRSNB/SNB one). Checking the tag's actual presence in notes, rather
  // than a branch field a merged order may not carry, means this doesn't
  // silently drop shop-level tracking for a merged order.
  const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id) && /HOSUR_ORDER_IDS?:/.test(o.notes ?? ''));
  const ids = new Set<string>();
  for (const o of contributing) {
    const text = String(o.notes ?? '');
    const plural = text.match(/HOSUR_ORDER_IDS:([^|]+)/);
    if (plural?.[1]) { plural[1].split(',').map(s => s.trim()).filter(Boolean).forEach(id => ids.add(id)); continue; }
    const singular = text.match(/HOSUR_ORDER_ID:([^|]+)/);
    if (singular?.[1]) ids.add(singular[1].trim());
  }
  return Array.from(ids).sort();
}

export interface HosurShopOrderCard {
  orderId: string;
  orderNumber: string;
  shopName: string;
  shopId: string | null;
  shopPhone: string | null;
  // ROOT-CAUSE FIX (2026-08-09, "cancel item throws P0001 Order item not
  // found"): `itemName` here is the *display* name after sameItem() groups
  // spelling variants under one canonical row name (see below) — it can
  // legitimately differ from what's actually stored in
  // hosur_order_items.item_name. cancel_hosur_order_item_remaining_secure
  // does an EXACT `item_name = p_item_name` match against that raw column,
  // so passing the display name through to the RPC failed whenever the two
  // diverged. `rawItemName` carries the untouched hosur_order_items value
  // specifically so cancel calls always match a real row.
  items: { itemName: string; rawItemName: string; unit: string; requested: number; dispatched: number; cancelled: number; cancellationReason: string | null }[];
  // FEATURE (2026-08-30): "Only for Hosur sub tab keep the date wise
  // orders" — the shop-first view (this card's own dispatch panel) is the
  // one Planner actually sees by default (hosurView defaults to 'shop'),
  // but only the item-first view had date-grouping (see rowDateGroups in
  // DispatchTab) — invisible in normal use. Each card is exactly one Hosur
  // order, so its own created_at is the real date to group by, no proxying
  // through a contributing BakeryOrder needed.
  createdAt: string;
}

// Shop-centric Hosur dispatch view: one card per shop ORDER (not just shop
// name — a shop can have more than one order in flight), with every item
// that order contains listed underneath, mirroring the same order-card
// pattern already used in the Hosur Shops & Billing → Dispatch queue so both
// screens feel consistent. Batches a single query across every row's Hosur
// order ids rather than one query per item.
export function useHosurShopOrders(rows: ProductionRow[], orders: BakeryOrder[], sameItem:(a:string,b:string)=>boolean) {
  const hosurOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) collectHosurOrderIds(row, orders).forEach(id => ids.add(id));
    return Array.from(ids).sort();
  }, [rows, orders]);
  const idsKey = hosurOrderIds.join(',');
  const visibleRowsKey = JSON.stringify(rows.map(r => ({itemName:r.itemName,unit:r.unit})).sort((a,b)=>a.itemName.localeCompare(b.itemName)||String(a.unit).localeCompare(String(b.unit))));
  const [shopOrders, setShopOrders] = useState<HosurShopOrderCard[] | null>(null);
  const [error,setError]=useState<string|null>(null);
  // BUG FIX (audit): the effect below only re-fires when the SET of Hosur
  // order ids changes — but sending a shop's order changes those same ids'
  // dispatched_quantity, not the set itself, so the just-sent card kept
  // showing pre-dispatch numbers until an unrelated re-render. reloadTick
  // gives callers (sendCard) an explicit way to force a refetch.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const queryIds = idsKey ? idsKey.split(',') : [];
    const visibleRows = JSON.parse(visibleRowsKey) as {itemName:string;unit:string}[];
    setError(null);setShopOrders(null);
    if (queryIds.length === 0) { setShopOrders([]); return; }
    (async () => {
      // BUG FIX (2026-09-16): "dispatched to Jos bakery theni... not visible
      // in the hosur dispatched [tab]" — these were plain `.in(...)` queries
      // with no pagination, silently capped at PostgREST's 1000-row response
      // limit (same bug class as the 2026-09-08 fix on listDispatchInvoices/
      // useCafeOrderSales — see fetchAllRows's own comment in lib/supabase.ts).
      // Confirmed live: with the Hosur order history now past ~230 order ids,
      // hosur_order_items' true match count was 1,050 rows for a 233-id
      // `.in()` — Supabase returned exactly 1000 with no error, silently
      // dropping whichever orders' items happened to fall in the truncated
      // tail (that day it was Jos Bakery Theni + mathampatti). Since neither
      // query is ordered, which shop(s) go missing is arbitrary and shifts
      // day to day as more Hosur history accumulates — paginating with
      // fetchAllRows (already used elsewhere for this exact cap) fixes it
      // for good instead of just for today's specific shops.
      const [{ data: ordersData, error: ordersErr }, { data: itemsData, error: itemsErr }] = await Promise.all([
        fetchRowsForIds<Record<string, unknown>>('hosur_orders','id',queryIds,'id, order_number, shop_name, shop_id, created_at'),
        fetchRowsForIds<Record<string, unknown>>('hosur_order_items','order_id',queryIds,'id, order_id, item_name, unit, quantity, dispatched_quantity, cancelled_quantity, cancellation_reason'),
      ]);
      if (cancelled) return;
      // AUDIT FIX (2026-09-03): neither error was ever checked — a transient
      // fetch failure fell straight through to setShopOrders([]) below,
      // making the whole "Dispatch & Billing Queue" (real, unbilled orders)
      // vanish as if there were genuinely nothing pending. Leave whatever
      // was already showing (or the loading state) alone instead of wiping
      // it on a failed fetch — reload() (already called elsewhere on a
      // timer/manual refresh) will pick it back up on the next success.
      if (ordersErr || itemsErr) {setError(ordersErr||itemsErr);return;}
      // Invoice needs the shop's phone number ("if it's Hosur mention the
      // shop name and number") — hosur_orders itself only stores shop_id, so
      // resolve phone via a second lookup against hosur_shops.
      const shopIds = Array.from(new Set(((ordersData ?? []) as Record<string, unknown>[]).map(o => o.shop_id as string | null).filter((id): id is string => !!id)));
      const phoneByShopId = new Map<string, string>();
      if (shopIds.length > 0) {
        const { data: shopsData,error:shopsError } = await fetchRowsForIds<Record<string,unknown>>('hosur_shops','id',shopIds,'id, whatsapp_number');
        if(cancelled)return;if(shopsError){setError(shopsError);return;}
        for (const s of (shopsData ?? []) as Record<string, unknown>[]) {
          phoneByShopId.set(s.id as string, String(s.whatsapp_number ?? ''));
        }
      }
      if (cancelled) return;
      const metaById = new Map<string, { orderNumber: string; shopName: string; shopId: string | null; shopPhone: string | null; createdAt: string }>(
        ((ordersData ?? []) as Record<string, unknown>[]).map((o) => {
          const shopId = (o.shop_id as string | null) ?? null;
          return [o.id as string, {
            orderNumber: String(o.order_number ?? ''), shopName: String(o.shop_name ?? ''),
            shopId, shopPhone: shopId ? (phoneByShopId.get(shopId) || null) : null,
            createdAt: String(o.created_at ?? ''),
          }];
        }),
      );
      const byOrder = new Map<string, { itemName: string; rawItemName: string; unit: string; requested: number; dispatched: number; cancelled: number; cancellationReason: string | null }[]>();
      for (const item of (itemsData ?? []) as Record<string, unknown>[]) {
        const rawName = String(item.item_name ?? '');
        // Only surface items that belong to the currently-visible row set
        // (e.g. only "active" or only "dispatched" items, matching whichever
        // sub-tab is open) — and display using the row's canonical name so
        // spelling variants across shops collapse into one line.
        const matchedRow = visibleRows.find(r => sameItem(r.itemName, rawName));
        if (!matchedRow) continue;
        const orderId = item.order_id as string;
        const list = byOrder.get(orderId) ?? [];
        list.push({
          itemName: matchedRow.itemName,
          rawItemName: rawName,
          unit: String(item.unit ?? matchedRow.unit ?? 'pcs'),
          requested: Number(item.quantity ?? 0),
          dispatched: Number(item.dispatched_quantity ?? 0),
          cancelled: Number(item.cancelled_quantity ?? 0),
          cancellationReason: (item.cancellation_reason as string | null) ?? null,
        });
        byOrder.set(orderId, list);
      }
      const cards: HosurShopOrderCard[] = [];
      for (const [orderId, items] of byOrder) {
        const meta = metaById.get(orderId);
        if (!meta || items.length === 0) continue;
        cards.push({
          orderId, orderNumber: meta.orderNumber, shopName: meta.shopName,
          shopId: meta.shopId, shopPhone: meta.shopPhone, createdAt: meta.createdAt,
          items: items.sort((a, b) => a.itemName.localeCompare(b.itemName)),
        });
      }
      cards.sort((a, b) => a.shopName.localeCompare(b.shopName));
      setShopOrders(cards);
    })();
    return () => { cancelled = true; };
  }, [idsKey, visibleRowsKey, reloadTick, sameItem]);

  return { shopOrders,error, reload: () => setReloadTick(t => t + 1) };
}

