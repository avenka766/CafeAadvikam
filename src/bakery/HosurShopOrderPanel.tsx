// src/bakery/HosurShopOrderPanel.tsx
// Planner's Hosur shop-order placement (price-list dropdown + custom item)
// and the Dispatch step that was previously missing entirely.
//
// WORKFLOW CHANGE (2026-08-07): "the orders dispatched from Planner
// dashboard dispatch tab should come here and here only — we have to bill
// and send the bill through WhatsApp and be able to take a physical bill
// too." DispatchSection below now covers a shop order's entire post-Planner
// lifecycle in one screen: it used to only show orders still at
// 'pending_packing' (dispatch in progress), which meant that the instant
// Planner's own Dispatch tab finished sending every item — flipping the
// order to 'dispatched' — it fell out of this queue and only surfaced in
// HosurDashboard's separate Receiving/Billing tabs (which were themselves
// unreachable from this app's Hosur nav until a moment ago). Now
// DispatchSection shows both 'pending_packing' AND 'dispatched' orders, and
// dispatchAndBill/dispatchReceiveAndBill (which never assumed a specific
// starting status) confirms receipt, creates the bill, captures payment,
// sends the WhatsApp bill, and enables the "Print Physical Bill" button —
// all from this one tab. HosurDashboard's ReceivingTab/BillingTab still
// exist in code but are no longer wired into Hosur's shared nav bar.
//
// UI/UX NOTE: restyled to the app's premium brand system (cafe-teal / gold,
// font-display headings, card-base/shadow-teal/shadow-gold conventions) in
// place of the previous generic slate/emerald/indigo Tailwind palette. No
// business logic, data fetching, or handler behaviour was changed below.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Store, Search, X, ShoppingCart, Send, Loader2, Plus, Truck, CheckCircle2, AlertTriangle, Printer, PackageX, RotateCcw, ChevronDown, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/lib/exportExcel';
import { printViaIframe } from '@/lib/printViaIframe';
import { dispatchReceiveAndBill } from './hosurBillingBridge';
import { getPackingCounterStatus } from './packingCounter';
import { notifyAdmin } from '@/pages/HosurDashboard';
import { buildHosurOrderTag, buildHosurItemId, checkRecentDuplicateHosurOrder } from './hosurOrderShared';
import { closestRecipeMatch } from './recipeNameMatch';
import KgPackAdder from './KgPackAdder';

const money = (v: number | null | undefined) => 'Rs.' + (v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const normalize = (s: string) => s.trim().toLowerCase();

interface HosurShop { id: string; shopName: string; whatsappNumber: string; address: string; isActive: boolean; discountPercent: number; }
interface HosurShopPrice { id: string; shopId: string; itemName: string; itemUnit: 'pcs' | 'kg'; unitPrice: number; isActive: boolean; }
interface HosurOrder { id: string; orderNumber: string; shopId: string; shopName: string; shopWhatsapp: string; status: string; subtotal: number; createdAt: string; }
interface HosurOrderItem { id: string; orderId: string; itemName: string; unit: 'pcs' | 'kg'; quantity: number; unitPrice: number; lineTotal: number; dispatchedQuantity: number; receivedQuantity: number; cancelledQuantity: number; }
interface DraftItem { itemName: string; unit: 'pcs' | 'kg'; quantity: number; unitPrice: number; lineTotal: number; isCustom?: boolean; }

function mapShop(r: Record<string, unknown>): HosurShop {
  return { id: r.id as string, shopName: String(r.shop_name ?? ''), whatsappNumber: String(r.whatsapp_number ?? ''), address: String(r.address ?? ''), isActive: r.is_active !== false, discountPercent: Number(r.discount_percent ?? 0) };
}
function mapPrice(r: Record<string, unknown>): HosurShopPrice {
  return { id: r.id as string, shopId: r.shop_id as string, itemName: String(r.item_name ?? ''), itemUnit: r.item_unit === 'kg' ? 'kg' : 'pcs', unitPrice: Number(r.unit_price ?? 0), isActive: r.is_active !== false };
}
function mapOrder(r: Record<string, unknown>): HosurOrder {
  return { id: r.id as string, orderNumber: String(r.order_number ?? ''), shopId: r.shop_id as string, shopName: String(r.shop_name ?? ''), shopWhatsapp: String(r.shop_whatsapp ?? ''), status: String(r.status ?? ''), subtotal: Number(r.subtotal ?? 0), createdAt: String(r.created_at ?? '') };
}
function mapItem(r: Record<string, unknown>): HosurOrderItem {
  return { id: r.id as string, orderId: r.order_id as string, itemName: String(r.item_name ?? ''), unit: r.unit === 'kg' ? 'kg' : 'pcs', quantity: Number(r.quantity ?? 0), unitPrice: Number(r.unit_price ?? 0), lineTotal: Number(r.line_total ?? 0), dispatchedQuantity: Number(r.dispatched_quantity ?? 0), receivedQuantity: Number(r.received_quantity ?? 0), cancelledQuantity: Number(r.cancelled_quantity ?? 0) };
}

export default function HosurShopOrderPanel({ section: controlledSection, onPendingCountChange }: { section?: 'place' | 'dispatch'; onPendingCountChange?: (n: number) => void } = {}) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [shops, setShops] = useState<HosurShop[]>([]);
  const [prices, setPrices] = useState<HosurShopPrice[]>([]);
  const [orders, setOrders] = useState<HosurOrder[]>([]);
  const [items, setItems] = useState<HosurOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localSection, setLocalSection] = useState<'place' | 'dispatch'>('place');
  const section = controlledSection ?? localSection;

  const load = useCallback(async () => {
    const [shopsRes, pricesRes, ordersRes, itemsRes] = await Promise.all([
      supabase.from('hosur_shops').select('id, shop_name, whatsapp_number, address, is_active, discount_percent').order('shop_name'),
      supabase.from('hosur_shop_price_lists').select('id, shop_id, item_name, item_unit, unit_price, is_active').eq('is_active', true),
      supabase.from('hosur_orders').select('id, order_number, shop_id, shop_name, shop_whatsapp, status, subtotal, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('hosur_order_items').select('id, order_id, item_name, unit, quantity, unit_price, line_total, dispatched_quantity, received_quantity'),
    ]);
    // BUG FIX: none of these 4 results' `.error` were ever checked — a
    // failed fetch (RLS/network hiccup) rendered as an indistinguishable
    // empty "No orders waiting" state instead of a visible error, so staff
    // had no way to tell "genuinely nothing pending" apart from "the load
    // silently failed."
    const failed = [
      shopsRes.error && 'shops', pricesRes.error && 'price lists',
      ordersRes.error && 'orders', itemsRes.error && 'order items',
    ].filter(Boolean) as string[];
    setLoadError(failed.length > 0 ? `Failed to load Hosur ${failed.join(', ')} — check your connection and refresh.` : null);
    setShops((shopsRes.data ?? []).map(mapShop));
    setPrices((pricesRes.data ?? []).map(mapPrice));
    setOrders((ordersRes.data ?? []).map(mapOrder));
    setItems((itemsRes.data ?? []).map(mapItem));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // WORKFLOW CHANGE (2026-08-07): include 'dispatched' alongside
  // 'pending_packing' — see the file header comment. 'pending_packing' is a
  // shop order Planner's Dispatch tab is still in the middle of sending;
  // 'dispatched' is one it's fully finished sending. Both still need this
  // screen's receive+bill+WhatsApp+physical-print step, so both belong in
  // the same queue instead of the fully-dispatched ones disappearing.
  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'pending_packing' || o.status === 'dispatched'), [orders]);
  useEffect(() => { onPendingCountChange?.(pendingOrders.length); }, [pendingOrders.length, onPendingCountChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {controlledSection === undefined ? (
          <div className="flex gap-2">
            <button
              onClick={() => setLocalSection('place')}
              className={cn(
                'rounded-xl px-4 py-2.5 text-xs font-bold font-body transition-all duration-150',
                section === 'place' ? 'cafe-gradient text-white shadow-teal' : 'bg-secondary text-secondary-foreground hover:bg-muted',
              )}
            >
              <Store className="mr-1 inline size-3.5" /> Place Order
            </button>
            <button
              onClick={() => setLocalSection('dispatch')}
              className={cn(
                'rounded-xl px-4 py-2.5 text-xs font-bold font-body transition-all duration-150',
                section === 'dispatch' ? 'cafe-gradient text-white shadow-teal' : 'bg-secondary text-secondary-foreground hover:bg-muted',
              )}
            >
              <Truck className="mr-1 inline size-3.5" /> Dispatch
              {pendingOrders.length > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black text-accent-foreground">
                  {pendingOrders.length}
                </span>
              )}
            </button>
          </div>
        ) : <div />}
        <button
          type="button"
          title="Refresh Hosur shop data"
          onClick={() => { setLoading(true); void load(); }}
          disabled={loading}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-bold text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {loadError}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-xs font-bold text-muted-foreground font-body">
          <Loader2 className="size-4 animate-spin" /> Loading shop data...
        </div>
      ) : section === 'place' ? (
        <PlaceOrderSection shops={shops} prices={prices} userName={currentUser?.displayName || 'Planner'} onSaved={load} />
      ) : (
        <DispatchSection orders={pendingOrders} items={items} onDone={load} shops={shops} />
      )}
    </div>
  );
}

function PlaceOrderSection({ shops, prices, userName, onSaved }: { shops: HosurShop[]; prices: HosurShopPrice[]; userName: string; onSaved: () => void }) {
  const activeShops = shops.filter(s => s.isActive);
  const [shopId, setShopId] = useState(activeShops[0]?.id || '');
  const [search, setSearch] = useState('');
  // Cart is keyed by shopId so switching shops does NOT clear items already
  // added for other shops — each shop keeps its own running cart.
  const [cartByShop, setCartByShop] = useState<Record<string, Record<string, DraftItem>>>({});
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState<'pcs' | 'kg'>('kg');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState('');
  const [showCustomSuggestions, setShowCustomSuggestions] = useState(false);

  // Every item name already priced for ANY shop, so a custom item typed here
  // suggests the existing spelling instead of silently creating a near-duplicate
  // (e.g. "Bun" vs "Buns") in hosur_shop_price_lists.
  const allHosurItemNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prices) {
      const key = normalize(p.itemName);
      if (key && !seen.has(key)) seen.set(key, p.itemName);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [prices]);
  const customNameSuggestions = useMemo(() => {
    const q = normalize(customName);
    if (!q) return [];
    return allHosurItemNames.filter(n => normalize(n).includes(q) && normalize(n) !== q).slice(0, 8);
  }, [customName, allHosurItemNames]);
  // BUG FIX (audit): the substring-only suggestion list above misses genuine
  // typos/spelling variants (transpositions, missing letters — neither
  // string is a substring of the other), which is exactly how this table
  // fragmented before ("Egg Puff" vs "Egg Puff (Full Egg)" vs "Egg Puff
  // Full" all silently became separate items across Production/Dispatch/
  // Closing Stock, requiring a manual data cleanup). Reuse the same
  // Levenshtein matcher already used for Recipe Management mismatches, but
  // compare against this shop's OWN existing item names instead — flags a
  // near-duplicate spelling before it's added, without nagging about names
  // that are legitimately new (that's the common, fine case).
  const customNameNearDuplicate = useMemo(() => {
    if (!customName.trim()) return null;
    const result = closestRecipeMatch(customName, allHosurItemNames);
    return result && result.status === 'mismatch' ? result.match : null;
  }, [customName, allHosurItemNames]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!shopId && activeShops[0]) setShopId(activeShops[0].id); }, [activeShops, shopId]);
  const selectedShop = activeShops.find(s => s.id === shopId) ?? activeShops[0];

  const shopItems = useMemo(() => {
    if (!selectedShop) return [];
    return prices.filter(p => p.shopId === selectedShop.id && p.isActive).sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [prices, selectedShop]);

  const filteredItems = useMemo(() => shopItems.filter(i => !search.trim() || normalize(i.itemName).includes(normalize(search))), [shopItems, search]);

  const cart = selectedShop ? (cartByShop[selectedShop.id] ?? {}) : {};
  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotal, 0);

  // Total items across ALL shops, so the person can see everything they've queued before sending.
  const shopsWithItems = Object.entries(cartByShop).filter(([, items]) => Object.keys(items).length > 0);
  const grandTotal = shopsWithItems.reduce((sum, [, items]) => sum + Object.values(items).reduce((s, i) => s + i.lineTotal, 0), 0);

  const setQty = (item: { itemName: string; itemUnit: 'pcs' | 'kg'; unitPrice: number }, qty: number) => {
    if (!selectedShop) return;
    const safeQty = Math.max(0, Math.round(qty * 1000) / 1000);
    setCartByShop(prev => {
      const shopCart = { ...(prev[selectedShop.id] ?? {}) };
      if (safeQty <= 0) delete shopCart[item.itemName];
      else shopCart[item.itemName] = { itemName: item.itemName, unit: item.itemUnit, quantity: safeQty, unitPrice: item.unitPrice, lineTotal: Math.round(safeQty * item.unitPrice * 100) / 100 };
      return { ...prev, [selectedShop.id]: shopCart };
    });
  };

  const addCustomItem = () => {
    if (!selectedShop) return;
    if (!customName.trim() || !customQty || Number(customQty) <= 0 || !customPrice || Number(customPrice) < 0) {
      setError('Enter a valid custom item name, quantity, and price.');
      return;
    }
    const qty = Number(customQty);
    const price = Number(customPrice);
    setCartByShop(prev => ({
      ...prev,
      [selectedShop.id]: {
        ...(prev[selectedShop.id] ?? {}),
        [customName.trim()]: { itemName: customName.trim(), unit: customUnit, quantity: qty, unitPrice: price, lineTotal: Math.round(qty * price * 100) / 100, isCustom: true },
      },
    }));
    setCustomName(''); setCustomQty(''); setCustomPrice(''); setShowCustom(false); setError('');
  };

  const removeItem = (itemName: string) => {
    if (!selectedShop) return;
    setCartByShop(prev => {
      const shopCart = { ...(prev[selectedShop.id] ?? {}) };
      delete shopCart[itemName];
      return { ...prev, [selectedShop.id]: shopCart };
    });
  };

  // Saves ONE order per shop that currently has items in its cart.
  const saveOrder = async () => {
    if (shopsWithItems.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true); setError('');
    try {
      for (const [sId, items] of shopsWithItems) {
        const shop = activeShops.find(s => s.id === sId);
        if (!shop) continue;
        const items_ = Object.values(items);
        const shopSubtotal = items_.reduce((s, i) => s + i.lineTotal, 0);

        // DUPLICATE-ORDER GUARD: same shop, same subtotal, submitted again
        // within the last 90s (double-click, slow-network retry, etc.) —
        // block it instead of silently creating a second identical order.
        const dupeCheck = await checkRecentDuplicateHosurOrder(shop.id, shopSubtotal);
        if (dupeCheck.isDuplicate) {
          throw new Error(`${shop.shopName} already has a matching order (${dupeCheck.orderNumber}) placed moments ago — check Hosur order history before resending.`);
        }

        const orderDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
        const orderNumber = 'HSR-ORD-' + orderDate + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
        // 'draft' — NOT yet ready to pack. This shop order first needs to go
        // through Planner's Incoming → Merged → Production → Dispatch pipeline
        // (as a bakery_orders row below). bakeryStore's dispatch sync flips
        // this to 'pending_packing'/'dispatched' once Planner actually dispatches
        // it — this record should never jump straight into the Hosur "To
        // Dispatch" queue on creation.
        const { data: order, error: orderError } = await supabase.from('hosur_orders').insert({
          order_number: orderNumber, shop_id: shop.id, shop_name: shop.shopName,
          shop_whatsapp: shop.whatsappNumber, shop_address: shop.address,
          status: 'draft', subtotal: shopSubtotal, created_by: userName, notes: notes.trim() || null,
        }).select('id').single();
        if (orderError) throw orderError;

        const rows = items_.map(item => ({
          order_id: order.id, item_name: item.itemName, unit: item.unit, quantity: item.quantity,
          unit_price: item.unitPrice, line_total: item.lineTotal, dispatched_quantity: 0, received_quantity: 0,
        }));
        const { error: itemsError } = await supabase.from('hosur_order_items').insert(rows);
        if (itemsError) { await supabase.from('hosur_orders').delete().eq('id', order.id); throw itemsError; }

        const customRows = items_.filter(i => i.isCustom).map(i => ({
          shop_id: shop.id, item_name: i.itemName, item_unit: i.unit, unit_price: i.unitPrice, is_active: true,
        }));
        // BUG FIX (2026-08-07): this upsert's error was never checked — a
        // failed write silently let the order go through while the custom
        // item never actually got added to the shop's permanent price list,
        // so it wouldn't show as a priced item next time and couldn't be
        // caught by the near-duplicate-name check later. Not fatal to the
        // order itself, so this only warns rather than aborting the send.
        if (customRows.length > 0) {
          const { error: priceListError } = await supabase.from('hosur_shop_price_lists').upsert(customRows, { onConflict: 'shop_id,item_name' });
          if (priceListError) console.warn(`[HosurShopOrderPanel] Failed to register custom item(s) in ${shop.shopName}'s price list:`, priceListError.message);
        }

        // Push this shop's requirement into the central bakery workflow so
        // Planner sees it in Incoming Orders, just like a VRSNB/SNB requirement.
        // bakeryStore's submitDispatch matches on the HOSUR_ORDER_ID tag in
        // notes to sync status back onto the hosur_orders row above.
        // itemId/notes-tag scheme unified with HosurDashboard.tsx's NewOrderTab
        // (both now go through hosurOrderShared.ts) so an order looks
        // identical downstream regardless of which screen created it.
        const bakeryItems = items_.map(item => ({
          itemId: buildHosurItemId(order.id, item.itemName),
          itemName: item.itemName,
          quantity: item.quantity,
          originalPcs: item.unit === 'pcs' ? item.quantity : undefined,
          dispatchUnit: item.unit,
          isCustom: item.isCustom ?? false,
        }));
        const { error: bakeryOrderError } = await supabase.from('bakery_orders').insert({
          items: bakeryItems, status: 'pending', created_by: userName, target_branch: 'Hosur',
          notes: buildHosurOrderTag(order.id, orderNumber, shop.shopName, notes),
        });
        // BUG FIX (2026-08-07): if this insert failed, the hosur_orders +
        // hosur_order_items rows created just above were left behind as an
        // orphaned 'draft' — invisible to the Dispatch queue (which only
        // shows 'pending_packing') and to the Leftover panel's recent-orders
        // query (which only shows dispatched/received_confirmed/billed), yet
        // still blocking a retry: checkRecentDuplicateHosurOrder matches on
        // 'draft' status too, so resending within 90s got rejected as a
        // false "duplicate" of an order that never actually went anywhere.
        // Mirror the same cleanup the items-insert failure above already does.
        if (bakeryOrderError) {
          await supabase.from('hosur_order_items').delete().eq('order_id', order.id);
          await supabase.from('hosur_orders').delete().eq('id', order.id);
          throw bakeryOrderError;
        }

        void notifyAdmin('New Hosur shop order', `${shop.shopName} order ${orderNumber} created by ${userName} and sent to Store. Total ${money(shopSubtotal)}.`, order.id, orderNumber, { shopId: shop.id, subtotal: shopSubtotal });
      }

      setCartByShop({}); setNotes(''); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3 card-base p-5">
        <div className="flex items-center gap-3 pb-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <Store className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-foreground">Place Shop Order</h3>
            <p className="text-xs font-bold text-muted-foreground font-body">Pick a shop, add priced or custom items, then send.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Shop</span>
            <select value={selectedShop?.id ?? ''} onChange={e => setShopId(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30">
              {activeShops.map(s => <option key={s.id} value={s.id}>{s.shopName}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Search item</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search price list..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </label>
        </div>

        {selectedShop && (
          <div className="rounded-xl border border-teal bg-primary/5 p-3 text-sm">
            <p className="font-black text-primary">{selectedShop.shopName}</p>
            <p className="text-xs font-bold text-primary/80">{selectedShop.whatsappNumber}</p>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-muted-foreground">No priced items match -- add as custom below.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredItems.map(item => {
              const current = cart[item.itemName]?.quantity ?? 0;
              const step = item.itemUnit === 'kg' ? 0.25 : 1;
              return (
                <article key={item.id} className={cn('rounded-xl border p-3 transition-colors', current > 0 ? 'border-teal bg-primary/5' : 'border-border bg-muted/40')}>
                  <p className="text-sm font-black text-foreground">{item.itemName}</p>
                  <p className="text-xs font-bold text-muted-foreground">{item.itemUnit} - {money(item.unitPrice)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-card font-black text-foreground hover:bg-muted">-</button>
                    <input type="number" value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border bg-background text-center text-sm font-black" />
                    <button onClick={() => setQty(item, current + step)} className="size-8 rounded-lg bg-primary font-black text-primary-foreground hover:opacity-90">+</button>
                  </div>
                  {item.itemUnit === 'kg' && <KgPackAdder onAdd={(kg) => setQty(item, current + kg)} />}
                </article>
              );
            })}
          </div>
        )}

        <button onClick={() => setShowCustom(v => !v)} className="flex items-center gap-1.5 text-xs font-bold text-accent hover:underline">
          <Plus className="size-3.5" /> Add custom item (not in price list)
        </button>
        {showCustom && (
          <div className="grid gap-2 rounded-xl border border-gold bg-accent/10 p-3 sm:grid-cols-5">
            <div className="relative sm:col-span-2">
              <input
                value={customName}
                onChange={e => { setCustomName(e.target.value); setShowCustomSuggestions(true); }}
                onFocus={() => setShowCustomSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCustomSuggestions(false), 150)}
                placeholder="Item name"
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold"
              />
              {showCustomSuggestions && customNameSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  {customNameSuggestions.map(name => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setCustomName(name); setShowCustomSuggestions(false); }}
                      className="block w-full truncate px-2.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-muted"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {customNameNearDuplicate && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="size-3 shrink-0" />
                  Close to an existing item — did you mean{' '}
                  <button type="button" onMouseDown={e => { e.preventDefault(); setCustomName(customNameNearDuplicate); }} className="underline decoration-dotted underline-offset-2 hover:text-amber-900">
                    "{customNameNearDuplicate}"
                  </button>
                  ? Using a new spelling will list it separately everywhere (Production, Dispatch, Closing Stock).
                </p>
              )}
            </div>
            <input value={customQty} onChange={e => setCustomQty(e.target.value)} type="number" placeholder="Qty" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
            <select value={customUnit} onChange={e => setCustomUnit(e.target.value as 'pcs' | 'kg')} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold">
              <option value="kg">kg</option><option value="pcs">pcs</option>
            </select>
            <input value={customPrice} onChange={e => setCustomPrice(e.target.value)} type="number" placeholder="Price/unit" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
            <button onClick={addCustomItem} className="sm:col-span-5 rounded-lg gold-gradient py-1.5 text-xs font-bold text-white shadow-gold">Add to Order</button>
          </div>
        )}
      </section>

      <aside className="space-y-3 card-base p-5">
        <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-primary" /><h3 className="font-display text-lg font-bold text-foreground">Requirement{selectedShop ? ` — ${selectedShop.shopName}` : ''}</h3></div>
        {cartItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-bold text-muted-foreground">No items selected</div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-auto">
            {cartItems.map(item => (
              <div key={item.itemName} className="rounded-xl bg-muted/40 p-2.5">
                <div className="flex justify-between gap-2">
                  <p className="text-xs font-black text-foreground">{item.itemName} {item.isCustom && <span className="text-accent">(custom)</span>}</p>
                  <button onClick={() => removeItem(item.itemName)}><X className="size-3.5 text-destructive" /></button>
                </div>
                <p className="text-[11px] font-bold text-muted-foreground">{num(item.quantity)} {item.unit} x {money(item.unitPrice)} = {money(item.lineTotal)}</p>
              </div>
            ))}
          </div>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold" />
        {shopsWithItems.length > 1 && (
          <div className="space-y-2 rounded-xl border border-teal bg-primary/5 p-2.5">
            <p className="text-[11px] font-black text-primary">{shopsWithItems.length} shops queued</p>
            {shopsWithItems.map(([sId, items]) => {
              const shopName = activeShops.find(s => s.id === sId)?.shopName ?? sId;
              const itemList = Object.values(items);
              return (
                <div key={sId} className="rounded-lg bg-card/70 p-2">
                  <p className="text-[11px] font-black text-primary">{shopName}</p>
                  <p className="text-[10px] font-bold text-primary/80">
                    {itemList.map(i => `${i.itemName} (${num(i.quantity)} ${i.unit})`).join(', ')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl cafe-gradient px-4 py-2.5 text-primary-foreground shadow-teal">
          <span className="text-xs font-black">{shopsWithItems.length > 1 ? 'Grand Total (all shops)' : 'Total'}</span>
          <span className="text-lg font-black">{money(shopsWithItems.length > 1 ? grandTotal : subtotal)}</span>
        </div>
        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</p>}
        <button onClick={saveOrder} disabled={saving || shopsWithItems.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl cafe-gradient text-sm font-black text-white shadow-teal disabled:opacity-40">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Order{shopsWithItems.length > 1 ? `s (${shopsWithItems.length} shops)` : ''}
        </button>
      </aside>
    </div>
  );
}

const PAYMENT_MODES = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'cheque', label: 'Cheque' },
] as const;

function DispatchSection({ orders, items, onDone, shops }: { orders: HosurOrder[]; items: HosurOrderItem[]; onDone: () => void; shops: HosurShop[] }) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  // BUG FIX: an order sits in this queue (status 'pending_packing') as soon
  // as ANY one of its items has been dispatched from production — the other
  // items on the same order might still be sitting at 0 dispatched. The
  // form used to default every item's billable quantity to what was
  // ORDERED, not what actually arrived, so opening an order here and
  // clicking Dispatch could bill (and mark fully sent) items that were never
  // physically produced/sent yet. Everything below now defaults to what
  // production has actually dispatched (item.dispatchedQuantity), and a
  // shop search narrows the queue down to one shop at a time.
  const [shopSearch, setShopSearch] = useState('');
  const filteredOrders = useMemo(() => {
    const q = shopSearch.trim().toLowerCase();
    return q ? orders.filter(o => o.shopName.toLowerCase().includes(q)) : orders;
  }, [orders, shopSearch]);
  const [paymentType, setPaymentType] = useState<Record<string, 'full' | 'partial' | 'credit'>>({});
  const [paymentMode, setPaymentMode] = useState<Record<string, string>>({});
  const [paidAmount, setPaidAmount] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  // BUG FIX: dispatchReceiveAndBill already refuses to bill when Planner's
  // counter is closed, but it only surfaced that as an error AFTER the
  // planner filled in the whole payment form and clicked Dispatch. Check
  // proactively so it's clear upfront, before any billing details are
  // entered — matches "should only be able to bill once the counter is
  // opened".
  // BUG FIX (2026-08-07): this only ever fetched ONCE on mount (empty deps).
  // Because this whole Hosur section stays mounted (just CSS-hidden) the
  // entire session, opening Planner's counter in a different tab afterward
  // never updated this already-mounted copy — the Dispatch/Bill button
  // stayed permanently disabled until a full page reload, with no visible
  // explanation once the one-time banner above scrolled out of view. Poll it
  // like every other live figure in this app so it self-corrects.
  const [counterOpen, setCounterOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () => getPackingCounterStatus().then(s => { if (!cancelled) setCounterOpen(s.isOpen); }).catch(() => { if (!cancelled) setCounterOpen(null); });
    check();
    const interval = setInterval(() => { if (!document.hidden) check(); }, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Leftover pool rows the planner has chosen to apply against a currently
  // pending item (keyed by `${orderId}::${itemId}`) — the override quantity
  // is reduced immediately so the bill reflects it, and the leftover row
  // itself is only actually consumed once that order is really dispatched.
  const [appliedLeftovers, setAppliedLeftovers] = useState<Record<string, { leftoverId: string; qty: number }>>({});
  const [leftoverTick, setLeftoverTick] = useState(0);
  // `maxApplyQty` is computed by the caller (HosurLeftoverAndCancelPanel),
  // which knows how much of this leftover is still actually unpromised —
  // recomputing it here from the raw leftover.quantity would ignore any
  // amount already applied to a DIFFERENT pending order and could promise
  // more stock than really exists in the pool.
  // CRITICAL BUG FIX (2026-08-07): this used to SUBTRACT the applied leftover
  // from the billed quantity (and fall back to item.quantity — the full
  // ORDERED amount — as its baseline when no manual override existed yet,
  // even though the visible field and every other billed-quantity read in
  // this file default to item.dispatchedQuantity). Net effect: clicking
  // "Apply" reduced what the shop was billed while the leftover stock still
  // physically went out to them on top of production's dispatch — giving
  // away real stock unbilled, sometimes by a lot (e.g. ordered 20kg, only
  // 15kg produced, applying an 8kg leftover set the bill to 20-8=12kg
  // instead of the correct 15+8=23kg... capped at the 20kg ordered).
  // Leftover stock is a real, billable top-up on what production already
  // sent — applying it must ADD to the bill, capped at what's still owed on
  // this line (ordered − already billed), never subtract from it.
  const applyLeftoverToItem = (leftover: LeftoverRow, order: HosurOrder, item: HosurOrderItem, maxApplyQty: number) => {
    const currentQty = overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.dispatchedQuantity;
    const remainingOwed = Math.max(0, Math.round((item.quantity - currentQty) * 1000) / 1000);
    const applyQty = Math.round(Math.max(0, Math.min(maxApplyQty, remainingOwed)) * 1000) / 1000;
    if (applyQty <= 0) return;
    setOverrides(v => ({ ...v, [item.id]: String(Math.round((currentQty + applyQty) * 1000) / 1000) }));
    setAppliedLeftovers(v => ({ ...v, [`${order.id}::${item.id}`]: { leftoverId: leftover.id, qty: applyQty } }));
    setExpanded(order.id);
  };

  const orderTotal = (order: HosurOrder) => {
    const orderItems = items.filter(i => i.orderId === order.id);
    return orderItems.reduce((sum, item) => {
      const qty = overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.dispatchedQuantity;
      return sum + qty * item.unitPrice;
    }, 0);
  };

  // Bill snapshot kept per order purely for the "Print Physical Bill" button —
  // dispatchReceiveAndBill doesn't return line items, so this is reconstructed
  // from what was actually entered (post-override) at the moment of dispatch.
  const [lastBillSnapshot, setLastBillSnapshot] = useState<Record<string, { billNo: string; order: HosurOrder; items: { itemName: string; unit: string; quantity: number; unitPrice: number }[] }>>({});

  const dispatchAndBill = async (order: HosurOrder) => {
    const orderItems = items.filter(i => i.orderId === order.id);
    const pType = paymentType[order.id] ?? 'full';
    setBusy(order.id);
    setResult(r => ({ ...r, [order.id]: undefined as any }));
    try {
      const billItems = orderItems.map(item => ({
        id: item.id, itemName: item.itemName, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice,
        receivedQuantity: overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.dispatchedQuantity,
      }));
      const outcome = await dispatchReceiveAndBill({
        order: { id: order.id, orderNumber: order.orderNumber, shopId: order.shopId, shopName: order.shopName, shopWhatsapp: order.shopWhatsapp },
        items: billItems,
        payment: {
          paymentType: pType,
          paidAmount: pType === 'partial' ? Number(paidAmount[order.id] || 0) : undefined,
          paymentMode: pType === 'credit' ? null : (paymentMode[order.id] || 'cash'),
          dueDate: pType !== 'full' ? (dueDate[order.id] || null) : null,
        },
        userName: currentUser?.displayName || 'Planner',
      });
      setResult(r => ({ ...r, [order.id]: {
        ok: outcome.whatsappStatus === 'sent',
        message: outcome.whatsappStatus === 'sent'
          ? `Dispatched, billed (${outcome.billNo}), and WhatsApp bill sent to ${order.shopName}.`
          : `Dispatched and billed (${outcome.billNo}), but WhatsApp send failed: ${outcome.whatsappError}. Retry from WhatsApp Logs below.`,
      }}));
      setLastBillSnapshot(v => ({ ...v, [order.id]: {
        billNo: outcome.billNo, order,
        items: billItems.map(i => ({ itemName: i.itemName, unit: i.unit, quantity: i.receivedQuantity, unitPrice: i.unitPrice })),
      }}));
      // Whatever was ordered but not actually sent (planner reduced the qty
      // below what was ordered) goes into the leftover pool — never silently
      // dropped, so it can be offered to the same shop's next matching order.
      // BUG FIX (2026-08-07): `i.receivedQuantity` (== billItems' quantity)
      // now already INCLUDES any applied leftover (applyLeftoverToItem adds
      // it on top of the dispatched baseline, and it's what's actually
      // billed) — so it must NOT also be subtracted here separately, or a
      // real shortfall gets understated by exactly the applied amount every
      // time leftover was used on this line.
      const shortfalls = billItems
        .map(i => ({ ...i, shortfall: Math.round((i.quantity - i.receivedQuantity) * 1000) / 1000 }))
        .filter(i => i.shortfall > 0.01);
      if (shortfalls.length > 0) {
        await supabase.from('hosur_leftover_pool').insert(shortfalls.map(s => ({
          item_name: s.itemName, unit: s.unit, quantity: s.shortfall, unit_price: s.unitPrice,
          source_order_id: order.id, source_shop_name: order.shopName, reason: 'dispatch_shortfall',
        })));
      }
      // Actually consume any leftover the planner applied to this order —
      // reduce the pool row by what was used, or resolve it fully if used up.
      const appliedForOrder = (Object.entries(appliedLeftovers) as [string, { leftoverId: string; qty: number }][]).filter(([key]) => key.startsWith(`${order.id}::`));
      for (const [key, applied] of appliedForOrder) {
        const { data: leftoverRow, error: leftoverReadError } = await supabase.from('hosur_leftover_pool').select('quantity').eq('id', applied.leftoverId).maybeSingle();
        // BUG FIX (2026-08-07): a failed read here used to fall through
        // `?? 0`, making a real leftover row's quantity look like it was
        // already zero — the code below would then mark it "resolved" with
        // quantity 0, permanently destroying tracked stock that was never
        // actually consumed, with no error shown (the bill/WhatsApp send had
        // already succeeded by this point, so the planner saw a clean
        // success message). Skip the write instead and warn, leaving the
        // pool row untouched so it can be reconciled manually rather than
        // silently corrupted.
        if (leftoverReadError || !leftoverRow) {
          console.warn(`[HosurShopOrderPanel] Could not read leftover pool row ${applied.leftoverId} to consume it — left untouched to avoid corrupting real stock:`, leftoverReadError?.message);
          setAppliedLeftovers(v => { const next = { ...v }; delete next[key]; return next; });
          continue;
        }
        const currentQty = Number(leftoverRow.quantity ?? 0);
        const remaining = Math.round((currentQty - applied.qty) * 1000) / 1000;
        if (remaining <= 0.01) {
          await supabase.from('hosur_leftover_pool').update({
            status: 'resolved', quantity: Math.max(0, remaining), resolved_at: new Date().toISOString(),
            resolved_order_id: order.id, resolved_shop_name: order.shopName,
          }).eq('id', applied.leftoverId);
        } else {
          await supabase.from('hosur_leftover_pool').update({
            quantity: remaining, resolved_order_id: order.id, resolved_shop_name: order.shopName,
          }).eq('id', applied.leftoverId);
        }
        setAppliedLeftovers(v => { const next = { ...v }; delete next[key]; return next; });
      }
      setLeftoverTick(t => t + 1);
      onDone();
    } catch (err) {
      setResult(r => ({ ...r, [order.id]: { ok: false, message: err instanceof Error ? err.message : 'Failed to dispatch and bill this order.' } }));
    } finally {
      // BUG FIX (2026-08-07): unconditionally nulling `busy` here let a
      // still-in-flight dispatch for a DIFFERENT order get re-enabled the
      // moment any other order's request finished — e.g. dispatch order A,
      // switch to order B before A resolves, click B (busy='B'); if A then
      // finishes, this used to null busy globally, re-enabling B's button
      // while B's own request was still pending, risking a double
      // dispatch/double bill/double WhatsApp send for B. Only clear it if
      // it's still pointing at the order whose request just finished.
      setBusy(b => (b === order.id ? null : b));
    }
  };

  // BUG FIX (2026-08-09): this used the pre-fix `window.open('', '_blank')` +
  // immediate `win.print()` pattern (no size args, no document.open(), no
  // onload/setTimeout guard) — the anti-pattern already fixed elsewhere via
  // printViaIframe. This was one of the print calls behind the "unable to
  // print any bill" report for Planner's Hosur Shops & Billing tab.
  const printPhysicalBill = (snap: { billNo: string; order: HosurOrder; items: { itemName: string; unit: string; quantity: number; unitPrice: number }[] }) => {
    const rows = snap.items.map(i => `<tr><td>${i.itemName}</td><td style="text-align:right">${num(i.quantity)} ${i.unit}</td><td style="text-align:right">${money(i.unitPrice)}</td><td style="text-align:right">${money(i.quantity * i.unitPrice)}</td></tr>`).join('');
    const total = snap.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    printViaIframe(`<html><head><title>Bill ${snap.billNo}</title><style>
      @page { size: 80mm auto; margin: 4mm; } body { font-family: monospace; font-size: 11px; width: 72mm; padding: 6px; color:#000; }
      h1 { font-size: 13px; margin: 0 0 4px; text-align:center; } .meta { font-size: 10px; text-align:center; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; } th, td { padding: 2px 0; } th { border-bottom: 1px dashed #000; text-align:left; }
      .grand { font-weight:bold; font-size:13px; border-top:1px solid #000; margin-top:6px; padding-top:4px; display:flex; justify-content:space-between; }
    </style></head><body>
      <h1>Cafe Aadvikam — Hosur Bill</h1>
      <div class="meta">Bill #${snap.billNo} · Order #${snap.order.orderNumber}<br/>${snap.order.shopName}<br/>${new Date().toLocaleString('en-IN')}</div>
      <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="grand"><span>Total</span><span>${money(total)}</span></div>
    </body></html>`);
  };

  return (
    <div className="space-y-3">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <Truck className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-foreground">Dispatch &amp; Billing Queue</h3>
            <p className="text-xs font-bold text-muted-foreground font-body">Every shop order Planner's Dispatch tab has sent — partially or fully — lands here and only here. Auto-filled from what's actually been dispatched from production (not just ordered). One click confirms receipt, creates the bill, captures payment, sends the WhatsApp bill, and unlocks Print Physical Bill.</p>
          </div>
        </div>
        <button
          onClick={() => exportToExcel({
            filename: 'hosur-dispatch-queue', sheetName: 'Dispatch Queue', title: 'Hosur - Pending Dispatch',
            columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Shop', key: 'shop' }, { header: 'Item', key: 'item' }, { header: 'Ordered', key: 'qty' }, { header: 'Dispatched', key: 'dispatched' }, { header: 'Unit', key: 'unit' }],
            rows: filteredOrders.flatMap(o => items.filter(i => i.orderId === o.id).map(i => ({ orderNumber: o.orderNumber, shop: o.shopName, item: i.itemName, qty: i.quantity, dispatched: i.dispatchedQuantity, unit: i.unit }))),
          })}
          className="rounded-xl border border-teal bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
        >Export Excel</button>
      </div>
      {counterOpen === false && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">
          {/* BUG FIX (2026-08-07): "Daily Closure" on its own is ambiguous
              inside this merged Hosur tab — the Hosur nav bar has its OWN
              "Daily Closure" sub-tab (Money group) that opens a completely
              different counter (hosur_counter_sessions) and does nothing
              for this gate. This checks Planner's own packing counter
              (app_state "packing-daily-closure:<date>"), opened from the
              top-level Planner "Daily Closure" tab — name both explicitly
              so staff don't open the wrong one and stay stuck. */}
          <AlertTriangle className="size-4 shrink-0" /> Planner's counter is closed — open today's counter from Planner's own "Daily Closure" tab (top nav, not the Hosur "Daily Closure" sub-tab) before billing any Hosur order.
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={shopSearch}
          onChange={e => setShopSearch(e.target.value)}
          placeholder="Select / search a shop..."
          className="w-full max-w-sm rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm font-body"
        />
      </div>
      {orders.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-xs font-bold text-muted-foreground">No orders waiting on dispatch.</div>}
      {orders.length > 0 && filteredOrders.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-xs font-bold text-muted-foreground">No pending orders match "{shopSearch}".</div>}
      {filteredOrders.map(order => {
        const orderItems = items.filter(i => i.orderId === order.id);
        const pType = paymentType[order.id] ?? 'full';
        const total = orderTotal(order);
        const res = result[order.id];
        // At-a-glance dispatch completeness for this shop's order — this is
        // the summary that used to be missing: an order can sit in this
        // queue with only one of several items actually sent from
        // production, and without this the collapsed card gave no hint of
        // that before opening it.
        const readyCount = orderItems.filter(i => i.dispatchedQuantity >= i.quantity - 0.01).length;
        const partialCount = orderItems.filter(i => i.dispatchedQuantity > 0.01 && i.dispatchedQuantity < i.quantity - 0.01).length;
        const notDispatchedCount = orderItems.filter(i => i.dispatchedQuantity <= 0.01).length;
        return (
          <div key={order.id} className="card-base p-4">
            <button onClick={() => setExpanded(v => v === order.id ? null : order.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
              <span className="text-sm font-black text-foreground">{order.shopName} - #{order.orderNumber} <span className="ml-2 text-xs font-bold text-muted-foreground">{money(total)}</span></span>
              <span className="flex items-center gap-1.5">
                {notDispatchedCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">{notDispatchedCount} not dispatched yet</span>
                )}
                {partialCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{partialCount} partial</span>
                )}
                {readyCount > 0 && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black text-teal-700">{readyCount} ready</span>
                )}
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{expanded === order.id ? 'Hide' : 'Open'}</span>
              </span>
            </button>

            {expanded === order.id && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  {orderItems.map(item => {
                    const applied = appliedLeftovers[`${order.id}::${item.id}`];
                    // BUG FIX: this input had no validation at all — a
                    // negative value or a stray extra digit flowed straight
                    // into the bill total (orderTotal) and the receivedQuantity
                    // sent to dispatchReceiveAndBill, silently producing a
                    // wrong/negative bill for a real shop. Clamp to >= 0 on
                    // entry, and flag (without hard-blocking — a shop's order
                    // can legitimately be corrected upward at dispatch time)
                    // whenever the billed amount exceeds what was ordered.
                    // BUG FIX (this pass): default billable qty is now what
                    // production has actually DISPATCHED for this item, not
                    // the full originally-ordered amount — billing "whatever
                    // was ordered" regardless of what physically arrived was
                    // exactly what caused "dispatch one item and everything
                    // looks ready to send" confusion.
                    const overrideVal = overrides[item.id];
                    const overrideNum = overrideVal !== undefined ? Number(overrideVal) : item.dispatchedQuantity;
                    const exceedsOrdered = Number.isFinite(overrideNum) && overrideNum > item.quantity + 0.001;
                    const exceedsDispatched = Number.isFinite(overrideNum) && overrideNum > item.dispatchedQuantity + 0.001;
                    const notYetDispatched = item.dispatchedQuantity <= 0.01;
                    return (
                      <div key={item.id} className={cn('rounded-lg px-3 py-1.5', notYetDispatched ? 'bg-red-50' : 'bg-muted/40')}>
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{item.itemName} <span className="text-muted-foreground">(ordered {num(item.quantity)} {item.unit} · dispatched {num(item.dispatchedQuantity)} {item.unit})</span></span>
                          <input
                            type="number"
                            min={0}
                            value={overrideVal ?? item.dispatchedQuantity}
                            onChange={e => {
                              const raw = e.target.value;
                              const n = Number(raw);
                              // Reject negative numbers outright; anything
                              // else (including blank, mid-typing) passes
                              // through as-is so typing isn't interrupted.
                              if (raw !== '' && Number.isFinite(n) && n < 0) return;
                              setOverrides(v => ({ ...v, [item.id]: raw }));
                            }}
                            className={cn('w-24 rounded-lg border bg-background px-2 py-1 text-right', exceedsOrdered ? 'border-amber-400' : exceedsDispatched ? 'border-amber-300' : 'border-border')}
                          />
                        </div>
                        {notYetDispatched && !applied && <p className="mt-0.5 text-[10px] font-black text-red-700">Not yet dispatched from production — billing this will send 0 unless you know it's already physically with this shop.</p>}
                        {exceedsOrdered && <p className="mt-0.5 text-[10px] font-black text-amber-700">More than ordered ({num(item.quantity)} {item.unit}) — double-check before dispatching.</p>}
                        {!exceedsOrdered && exceedsDispatched && <p className="mt-0.5 text-[10px] font-black text-amber-700">More than what's been dispatched from production ({num(item.dispatchedQuantity)} {item.unit}) so far — double-check before dispatching.</p>}
                        {applied && <p className="mt-0.5 text-[10px] font-black text-teal-700">Using {num(applied.qty)} {item.unit} from leftover pool</p>}
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const mode = paymentMode[order.id] ?? 'cash';
                  const modeLabel = PAYMENT_MODES.find(m => m.key === mode)?.label ?? 'Cash';
                  const paidNow = pType === 'partial' ? Number(paidAmount[order.id] || 0) : pType === 'full' ? total : 0;
                  const balance = pType === 'credit' ? total : Math.max(0, Math.round((total - paidNow) * 100) / 100);
                  const needsDueDate = pType !== 'full';
                  const dueDateMissing = needsDueDate && !dueDate[order.id];
                  const partialInvalid = pType === 'partial' && (!paidAmount[order.id] || paidNow <= 0 || paidNow >= total);
                  // BUG FIX: nothing previously stopped dispatching a $0 or
                  // negative bill (e.g. every quantity zeroed/typo'd out) —
                  // require a genuinely positive total.
                  const canDispatch = !dueDateMissing && !partialInvalid && counterOpen !== false && total > 0.001;
                  return (
                    <>
                      <div className="rounded-xl border border-gold bg-accent/10 p-3 space-y-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-amber-800">Payment Collection</p>
                        <div className="flex gap-2">
                          {(['full', 'partial', 'credit'] as const).map(t => (
                            <button key={t} onClick={() => setPaymentType(v => ({ ...v, [order.id]: t }))} className={cn('rounded-lg px-3 py-1.5 text-xs font-bold capitalize', pType === t ? 'gold-gradient text-white shadow-gold' : 'bg-card text-amber-800 border border-gold')}>
                              {t === 'full' ? 'Full Payment' : t === 'partial' ? 'Partial Payment' : 'Full Credit'}
                            </button>
                          ))}
                        </div>

                        {pType !== 'credit' && (
                          <div>
                            <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Payment Mode</p>
                            <div className="flex flex-wrap gap-1.5">
                              {PAYMENT_MODES.map(m => (
                                <button
                                  key={m.key}
                                  onClick={() => setPaymentMode(v => ({ ...v, [order.id]: m.key }))}
                                  className={cn('rounded-lg px-3 py-1.5 text-xs font-bold', mode === m.key ? 'bg-primary text-primary-foreground shadow-teal' : 'border border-border bg-card text-foreground')}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {pType === 'partial' && (
                          <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Amount Paid Now</span>
                              <input type="number" placeholder="0" value={paidAmount[order.id] ?? ''} onChange={e => setPaidAmount(v => ({ ...v, [order.id]: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Due Date *</span>
                              <input type="date" value={dueDate[order.id] ?? ''} onChange={e => setDueDate(v => ({ ...v, [order.id]: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                            </label>
                          </div>
                        )}
                        {pType === 'credit' && (
                          <label className="block space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Due Date *</span>
                            <input type="date" value={dueDate[order.id] ?? ''} onChange={e => setDueDate(v => ({ ...v, [order.id]: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                          </label>
                        )}

                        {/* Complete, at-a-glance breakdown of exactly what's owed and what's being collected. */}
                        <div className="space-y-1 rounded-lg bg-card/70 p-2.5 text-xs font-bold">
                          <div className="flex justify-between"><span className="text-muted-foreground">Bill Total</span><span className="text-foreground">{money(total)}</span></div>
                          {pType === 'full' && (
                            <div className="flex justify-between text-primary"><span>Collecting Now ({modeLabel})</span><span>{money(total)}</span></div>
                          )}
                          {pType === 'partial' && (
                            <>
                              <div className="flex justify-between text-primary"><span>Collecting Now ({modeLabel})</span><span>{money(paidNow)}</span></div>
                              <div className="flex justify-between text-destructive"><span>Balance Due{dueDate[order.id] ? ` by ${dueDate[order.id]}` : ''}</span><span>{money(balance)}</span></div>
                            </>
                          )}
                          {pType === 'credit' && (
                            <div className="flex justify-between text-destructive"><span>Full Amount on Credit{dueDate[order.id] ? ` — due ${dueDate[order.id]}` : ''}</span><span>{money(total)}</span></div>
                          )}
                        </div>

                        {dueDateMissing && <p className="text-[10px] font-bold text-destructive">Due date is required for {pType} payment.</p>}
                        {partialInvalid && !dueDateMissing && <p className="text-[10px] font-bold text-destructive">Enter a paid amount less than the bill total.</p>}
                      </div>

                      {/* BUG FIX (2026-08-07): repeat the counter-closed reason right
                          next to the button it disables — the banner up top is easy to
                          scroll past on a long order, which is exactly what made this
                          look like "the button just doesn't work" with no visible cause. */}
                      {counterOpen === false && (
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-destructive">
                          <AlertTriangle className="size-3.5 shrink-0" /> Disabled — Planner's counter is closed. Open it from the top-level "Daily Closure" tab (not the Hosur one).
                        </p>
                      )}

                      {res && (
                        <div className="space-y-2">
                          <p className={cn('rounded-xl px-3 py-2 text-xs font-bold', res.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200')}>{res.message}</p>
                          {lastBillSnapshot[order.id] && (
                            <button onClick={() => printPhysicalBill(lastBillSnapshot[order.id])} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted">
                              <Printer className="size-3.5" /> Print Physical Bill
                            </button>
                          )}
                        </div>
                      )}

                      <button onClick={() => dispatchAndBill(order)} disabled={busy === order.id || !canDispatch} className="flex w-full items-center justify-center gap-2 rounded-xl cafe-gradient py-2.5 text-sm font-black text-white shadow-teal hover:opacity-90 disabled:opacity-50">
                        {busy === order.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Dispatch, Bill &amp; Send WhatsApp
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      <HosurLeftoverAndCancelPanel
        pendingOrders={orders}
        pendingItems={items}
        appliedLeftovers={appliedLeftovers}
        overrides={overrides}
        onApply={applyLeftoverToItem}
        refreshTick={leftoverTick}
        shops={shops}
      />
    </div>
  );
}

// ─── Leftover pool + post-dispatch cancellation ─────────────────────────────
// Two things the planner asked for that don't exist anywhere else: (1) a
// place to see stock that didn't reach a shop (dispatched less than ordered,
// or a shop cancelled after the item already went out) so it can be offered
// again next time the same item is ordered, and (2) a way to cancel part of
// an already-billed order. Cancelling never rewrites the original bill row —
// it records a credit-note-style adjustment (hosur_bill_adjustments) and, if
// the bill still has unpaid credit, reduces that credit by the cancelled
// amount. Money already collected is never auto-refunded — that's flagged
// for the planner to settle with the shop directly.
interface LeftoverRow {
  id: string; itemName: string; unit: string; quantity: number; unitPrice: number;
  sourceShopName: string | null; reason: 'dispatch_shortfall' | 'post_dispatch_cancel' | 'manual_entry';
  status: 'available' | 'resolved'; createdAt: string;
}
// Single source of truth for how each reason reads in the UI, Excel, and PDF
// — used in three different places (this file's leftover row, and the
// Reports tab's table/Excel/PDF in PlannerDashboard.tsx), so a new reason
// value added here must also be added to the copy of this map there.
export function leftoverReasonLabel(reason: string): string {
  if (reason === 'dispatch_shortfall') return 'Not sent at dispatch';
  if (reason === 'manual_entry') return 'Manually added';
  return 'Cancelled after dispatch';
}
function mapLeftover(r: Record<string, unknown>): LeftoverRow {
  return {
    id: r.id as string, itemName: String(r.item_name ?? ''), unit: String(r.unit ?? 'kg'),
    quantity: Number(r.quantity ?? 0), unitPrice: Number(r.unit_price ?? 0),
    sourceShopName: (r.source_shop_name as string) ?? null,
    reason: (r.reason as LeftoverRow['reason']) || 'dispatch_shortfall',
    status: (r.status as LeftoverRow['status']) || 'available',
    createdAt: String(r.created_at ?? ''),
  };
}

interface RecentDispatchedOrder { id: string; orderNumber: string; shopName: string; createdAt: string; billId: string | null; billStatus: string | null; creditAmount: number; }

function HosurLeftoverAndCancelPanel({ pendingOrders, pendingItems, appliedLeftovers, overrides, onApply, refreshTick, shops }: {
  pendingOrders: HosurOrder[]; pendingItems: HosurOrderItem[];
  appliedLeftovers: Record<string, { leftoverId: string; qty: number }>;
  // Needed so the "Apply" button's displayed/actual cap matches what
  // applyLeftoverToItem will really do (remaining owed = ordered − already
  // billed), instead of the old display-only cap of the full ordered
  // quantity, which could overstate how much would actually get applied.
  overrides: Record<string, string>;
  onApply: (leftover: LeftoverRow, order: HosurOrder, item: HosurOrderItem, maxApplyQty: number) => void;
  refreshTick: number;
  shops: HosurShop[];
}) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [open, setOpen] = useState(false);
  const [leftovers, setLeftovers] = useState<LeftoverRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentDispatchedOrder[]>([]);
  const [recentItems, setRecentItems] = useState<HosurOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [cancelQty, setCancelQty] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual "Add Leftover Item" — for stock the planner is physically holding
  // that didn't come from an auto-tracked shortfall or cancellation (e.g. a
  // stock count, or something returned outside the app).
  const [showAddForm, setShowAddForm] = useState(false);
  const [addItemName, setAddItemName] = useState('');
  const [addUnit, setAddUnit] = useState<'kg' | 'pcs'>('kg');
  const [addQty, setAddQty] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addShopName, setAddShopName] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Direct "Dispatch this leftover to a shop right now" — separate from
  // "Apply" (which only reduces an existing pending order's quantity): this
  // creates a real order + bill from scratch for stock that isn't attached
  // to anything yet, going through the exact same billing/WhatsApp pipeline
  // as a normal dispatch so nothing about money/stock tracking is special-cased.
  const [dispatchRowId, setDispatchRowId] = useState<string | null>(null);
  const [dispatchShopId, setDispatchShopId] = useState('');
  const [dispatchQty, setDispatchQty] = useState('');
  const [dispatchPrice, setDispatchPrice] = useState('');
  const [dispatchPaymentType, setDispatchPaymentType] = useState<'full' | 'partial' | 'credit'>('full');
  const [dispatchPaymentMode, setDispatchPaymentMode] = useState('cash');
  const [dispatchPaidAmount, setDispatchPaidAmount] = useState('');
  const [dispatchDueDate, setDispatchDueDate] = useState('');
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [dispatchBillSnapshot, setDispatchBillSnapshot] = useState<Record<string, { billNo: string; shopName: string; orderNumber: string; itemName: string; unit: string; quantity: number; unitPrice: number }>>({});
  const [counterOpen, setCounterOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPackingCounterStatus().then(s => { if (!cancelled) setCounterOpen(s.isOpen); }).catch(() => { if (!cancelled) setCounterOpen(null); });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [leftoverRes, ordersRes] = await Promise.all([
      supabase.from('hosur_leftover_pool').select('*').eq('status', 'available').order('created_at', { ascending: false }).limit(50),
      supabase.from('hosur_orders').select('id, order_number, shop_name, created_at, bill_id, status')
        .in('status', ['dispatched', 'received_confirmed', 'billed']).order('created_at', { ascending: false }).limit(25),
    ]);
    setLeftovers((leftoverRes.data ?? []).map(mapLeftover));
    const orderRows = (ordersRes.data ?? []) as Record<string, unknown>[];
    const billIds = orderRows.map(o => o.bill_id).filter(Boolean) as string[];
    const billsRes = billIds.length > 0
      ? await supabase.from('hosur_bills').select('id, status, credit_amount').in('id', billIds)
      : { data: [] as Record<string, unknown>[] };
    const billMap = new Map<string, Record<string, unknown>>((billsRes.data ?? []).map((b: Record<string, unknown>) => [String(b.id), b]));
    setRecentOrders(orderRows.map(o => {
      const bill = o.bill_id ? billMap.get(o.bill_id as string) : undefined;
      return {
        id: o.id as string, orderNumber: String(o.order_number ?? ''), shopName: String(o.shop_name ?? ''),
        createdAt: String(o.created_at ?? ''), billId: (o.bill_id as string) ?? null,
        billStatus: (bill?.status as string) ?? null, creditAmount: Number(bill?.credit_amount ?? 0),
      };
    }));
    if (orderRows.length > 0) {
      const { data: itemRows } = await supabase.from('hosur_order_items').select('*').in('order_id', orderRows.map(o => o.id as string));
      setRecentItems((itemRows ?? []).map(mapItem));
    } else {
      setRecentItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load, refreshTick]);

  // BUG FIX: a leftover row's DB quantity only shrinks once the order it was
  // applied to is actually dispatched — but nothing stopped the planner from
  // applying the SAME leftover to two different pending orders in the
  // meantime (e.g. two shops reordered the same item), which would silently
  // promise more stock than actually exists in the pool. Subtract everything
  // currently pending-applied against a leftover (regardless of which order)
  // before treating any of it as available for a new match.
  const appliedTotalsByLeftoverId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const applied of Object.values(appliedLeftovers)) {
      totals.set(applied.leftoverId, (totals.get(applied.leftoverId) ?? 0) + applied.qty);
    }
    return totals;
  }, [appliedLeftovers]);
  const remainingFor = useCallback((row: LeftoverRow) => {
    const alreadyPromised = appliedTotalsByLeftoverId.get(row.id) ?? 0;
    return Math.round((row.quantity - alreadyPromised) * 1000) / 1000;
  }, [appliedTotalsByLeftoverId]);

  // Cross-reference: any available leftover item whose name matches an item
  // on a currently pending shop order (any shop) — this is the "send the
  // leftover to whoever reorders the same item" match the planner needs to
  // see before it goes stale.
  const matchesFor = useCallback((row: LeftoverRow) => {
    if (remainingFor(row) <= 0.01) return []; // fully promised elsewhere already
    const key = normalize(row.itemName);
    const out: { order: HosurOrder; item: HosurOrderItem }[] = [];
    for (const order of pendingOrders) {
      for (const item of pendingItems) {
        if (item.orderId !== order.id) continue;
        if (normalize(item.itemName) !== key) continue;
        if (appliedLeftovers[`${order.id}::${item.id}`]) continue; // this exact item already has a leftover applied
        out.push({ order, item });
      }
    }
    return out;
  }, [pendingOrders, pendingItems, appliedLeftovers, remainingFor]);

  const resolveLeftover = async (row: LeftoverRow) => {
    await supabase.from('hosur_leftover_pool').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', row.id);
    load();
  };

  const addManualLeftover = async () => {
    if (!addItemName.trim() || !addQty || Number(addQty) <= 0) { setAddError('Enter an item name and a valid quantity.'); return; }
    // BUG FIX (2026-08-07): `Number(addPrice) || 0` treats a negative price
    // string as truthy, so it passed straight through unvalidated — unlike
    // the "Dispatch Leftover to Shop" form below, which explicitly rejects
    // price < 0. A negative price here would pre-fill that other form's
    // price field the next time this row is dispatched, and show a negative
    // "Total" if opened without editing it first.
    if (addPrice.trim() !== '' && Number(addPrice) < 0) { setAddError('Price cannot be negative.'); return; }
    setAddSaving(true); setAddError('');
    try {
      const { error } = await supabase.from('hosur_leftover_pool').insert({
        item_name: addItemName.trim(), unit: addUnit, quantity: Number(addQty),
        unit_price: Number(addPrice) || 0, source_shop_name: addShopName.trim() || null,
        reason: 'manual_entry',
      });
      if (error) throw error;
      setAddItemName(''); setAddQty(''); setAddPrice(''); setAddShopName(''); setShowAddForm(false);
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add this item.');
    } finally {
      setAddSaving(false);
    }
  };

  const activeShops = shops.filter(s => s.isActive);

  // Reduces (or fully resolves) a leftover pool row by whatever quantity was
  // just actually sent out — same consumption logic used when an "Apply to a
  // pending order" match gets dispatched, just triggered from here instead.
  // BUG FIX (2026-08-07): this used to compute `remaining` from `row.quantity`
  // — a value from React state that may be stale relative to the DB if this
  // same leftover row was consumed by something else since the last `load()`
  // (the sibling consumption path inside dispatchAndBill guards against
  // exactly this by re-reading the current quantity first). Re-read fresh
  // here too so two near-simultaneous consumptions of the same row can't
  // compute the wrong remaining balance.
  const consumeLeftover = async (row: LeftoverRow, qty: number, orderId: string, shopName: string) => {
    const { data: freshRow, error: freshReadError } = await supabase.from('hosur_leftover_pool').select('quantity').eq('id', row.id).maybeSingle();
    if (freshReadError || !freshRow) {
      console.warn(`[HosurShopOrderPanel] Could not read leftover pool row ${row.id} to consume it — left untouched to avoid corrupting real stock:`, freshReadError?.message);
      return;
    }
    const remaining = Math.round((Number(freshRow.quantity ?? 0) - qty) * 1000) / 1000;
    if (remaining <= 0.01) {
      await supabase.from('hosur_leftover_pool').update({
        status: 'resolved', quantity: Math.max(0, remaining), resolved_at: new Date().toISOString(),
        resolved_order_id: orderId, resolved_shop_name: shopName,
      }).eq('id', row.id);
    } else {
      await supabase.from('hosur_leftover_pool').update({ quantity: remaining, resolved_order_id: orderId, resolved_shop_name: shopName }).eq('id', row.id);
    }
  };

  const dispatchLeftoverToShop = async (row: LeftoverRow) => {
    const shop = activeShops.find(s => s.id === dispatchShopId);
    const qty = Number(dispatchQty || 0);
    const price = Number(dispatchPrice || 0);
    const remaining = remainingFor(row);
    if (!shop) { setDispatchResult(v => ({ ...v, [row.id]: { ok: false, message: 'Pick a shop first.' } })); return; }
    if (qty <= 0 || qty > remaining + 0.01) { setDispatchResult(v => ({ ...v, [row.id]: { ok: false, message: `Enter a quantity up to ${num(remaining)} ${row.unit}.` } })); return; }
    if (price < 0) { setDispatchResult(v => ({ ...v, [row.id]: { ok: false, message: 'Enter a valid price.' } })); return; }
    if ((dispatchPaymentType === 'credit' || dispatchPaymentType === 'partial') && !dispatchDueDate) {
      setDispatchResult(v => ({ ...v, [row.id]: { ok: false, message: 'Due date is required for credit/partial payment.' } })); return;
    }
    setDispatchBusy(true);
    setDispatchResult(v => ({ ...v, [row.id]: undefined as any }));
    try {
      // A real order + item row backs this exactly like any normal shop
      // order, so it goes through the same billing/WhatsApp pipeline and
      // shows up in the shop's own order history — nothing about a leftover
      // dispatch is a special, untracked side-channel.
      const orderDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
      const orderNumber = 'HSR-LO-' + orderDate + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
      const lineTotal = Math.round(qty * price * 100) / 100;
      const { data: newOrder, error: orderError } = await supabase.from('hosur_orders').insert({
        order_number: orderNumber, shop_id: shop.id, shop_name: shop.shopName,
        shop_whatsapp: shop.whatsappNumber, shop_address: shop.address,
        status: 'pending_packing', subtotal: lineTotal, created_by: currentUser?.displayName || 'Planner',
        notes: `Leftover dispatch (${row.reason === 'dispatch_shortfall' ? 'not sent at earlier dispatch' : row.reason === 'manual_entry' ? 'manually recorded stock' : 'cancelled after dispatch'})`,
      }).select('id').single();
      if (orderError || !newOrder) throw orderError || new Error('Failed to create the order for this dispatch.');

      const { data: newItem, error: itemError } = await supabase.from('hosur_order_items').insert({
        order_id: newOrder.id, item_name: row.itemName, unit: row.unit, quantity: qty,
        unit_price: price, line_total: lineTotal, dispatched_quantity: 0, received_quantity: 0,
      }).select('id').single();
      if (itemError || !newItem) throw itemError || new Error('Failed to create the item for this dispatch.');

      const outcome = await dispatchReceiveAndBill({
        order: { id: newOrder.id, orderNumber, shopId: shop.id, shopName: shop.shopName, shopWhatsapp: shop.whatsappNumber },
        items: [{ id: newItem.id, itemName: row.itemName, unit: row.unit === 'pcs' ? 'pcs' : 'kg', quantity: qty, unitPrice: price, receivedQuantity: qty }],
        payment: {
          paymentType: dispatchPaymentType,
          paidAmount: dispatchPaymentType === 'partial' ? Number(dispatchPaidAmount || 0) : undefined,
          paymentMode: dispatchPaymentType === 'credit' ? null : (dispatchPaymentMode || 'cash'),
          dueDate: dispatchPaymentType !== 'full' ? (dispatchDueDate || null) : null,
        },
        userName: currentUser?.displayName || 'Planner',
      });

      // BUG FIX: the bill is already real and paid/credited at this point —
      // reporting the outcome BEFORE the pool-consumption update means a
      // failure in that (comparatively minor) bookkeeping step can never be
      // mistaken for the dispatch itself having failed. Reporting it after
      // would have let the catch block below show "Failed to dispatch" for
      // an order that had actually already been billed, tempting the
      // planner to dispatch it a second time and double-bill the shop.
      setDispatchResult(v => ({ ...v, [row.id]: {
        ok: outcome.whatsappStatus === 'sent',
        message: outcome.whatsappStatus === 'sent'
          ? `Dispatched, billed (${outcome.billNo}), and WhatsApp bill sent to ${shop.shopName}.`
          : `Dispatched and billed (${outcome.billNo}), but WhatsApp send failed: ${outcome.whatsappError}. Retry from WhatsApp Logs.`,
      }}));
      setDispatchBillSnapshot(v => ({ ...v, [row.id]: { billNo: outcome.billNo, shopName: shop.shopName, orderNumber, itemName: row.itemName, unit: row.unit, quantity: qty, unitPrice: price } }));
      setDispatchQty(''); setDispatchPrice(''); setDispatchPaidAmount(''); setDispatchDueDate('');
      try {
        await consumeLeftover(row, qty, newOrder.id, shop.shopName);
      } catch {
        // The bill succeeded regardless — only the pool bookkeeping failed.
        // Surface it as an addendum, not a failure of the dispatch itself.
        setDispatchResult(v => ({ ...v, [row.id]: { ok: true, message: `Dispatched and billed (${outcome.billNo}) successfully, but the leftover pool couldn't be updated automatically — reduce "${row.itemName}" by ${num(qty)} ${row.unit} manually or refresh this panel.` } }));
      }
      load();
    } catch (err) {
      setDispatchResult(v => ({ ...v, [row.id]: { ok: false, message: err instanceof Error ? err.message : 'Failed to dispatch this leftover.' } }));
    } finally {
      setDispatchBusy(false);
    }
  };

  // BUG FIX (2026-08-09): same broken window.open+immediate-print pattern as
  // printPhysicalBill above.
  const printLeftoverBill = (snap: { billNo: string; shopName: string; orderNumber: string; itemName: string; unit: string; quantity: number; unitPrice: number }) => {
    const total = snap.quantity * snap.unitPrice;
    printViaIframe(`<html><head><title>Bill ${snap.billNo}</title><style>
      @page { size: 80mm auto; margin: 4mm; } body { font-family: monospace; font-size: 11px; width: 72mm; padding: 6px; color:#000; }
      h1 { font-size: 13px; margin: 0 0 4px; text-align:center; } .meta { font-size: 10px; text-align:center; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; } th, td { padding: 2px 0; } th { border-bottom: 1px dashed #000; text-align:left; }
      .grand { font-weight:bold; font-size:13px; border-top:1px solid #000; margin-top:6px; padding-top:4px; display:flex; justify-content:space-between; }
    </style></head><body>
      <h1>Cafe Aadvikam — Hosur Bill (Leftover)</h1>
      <div class="meta">Bill #${snap.billNo} · Order #${snap.orderNumber}<br/>${snap.shopName}<br/>${new Date().toLocaleString('en-IN')}</div>
      <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th></tr></thead>
      <tbody><tr><td>${snap.itemName}</td><td style="text-align:right">${num(snap.quantity)} ${snap.unit}</td><td style="text-align:right">${money(snap.unitPrice)}</td><td style="text-align:right">${money(total)}</td></tr></tbody></table>
      <div class="grand"><span>Total</span><span>${money(total)}</span></div>
    </body></html>`);
  };

  const selectedOrder = recentOrders.find(o => o.id === selectedOrderId);
  const selectedOrderItems = recentItems.filter(i => i.orderId === selectedOrderId);

  const cancelItem = async (item: HosurOrderItem) => {
    if (!selectedOrder) return;
    const qty = Number(cancelQty[item.id] || 0);
    const stillAvailable = Math.round((item.dispatchedQuantity - item.cancelledQuantity) * 1000) / 1000;
    if (qty <= 0 || qty > stillAvailable + 0.01) return;
    setBusyItemId(item.id);
    setNotice(null);
    try {
      await supabase.from('hosur_order_items').update({ cancelled_quantity: Math.round((item.cancelledQuantity + qty) * 1000) / 1000 }).eq('id', item.id);
      await supabase.from('hosur_leftover_pool').insert({
        item_name: item.itemName, unit: item.unit, quantity: qty, unit_price: item.unitPrice,
        source_order_id: selectedOrder.id, source_shop_name: selectedOrder.shopName, reason: 'post_dispatch_cancel',
        notes: cancelReason.trim() || null,
      });
      const adjustmentAmount = -Math.round(qty * item.unitPrice * 100) / 100;
      if (selectedOrder.billId) {
        await supabase.from('hosur_bill_adjustments').insert({
          bill_id: selectedOrder.billId, order_id: selectedOrder.id, item_name: item.itemName, unit: item.unit,
          quantity: qty, unit_price: item.unitPrice, adjustment_amount: adjustmentAmount,
          reason: cancelReason.trim() || null, created_by: currentUser?.displayName || 'Planner',
        });
        // Only reduce money not yet collected — anything already paid is left
        // untouched and flagged for the planner to settle with the shop.
        if (selectedOrder.creditAmount > 0) {
          const newCredit = Math.max(0, Math.round((selectedOrder.creditAmount + adjustmentAmount) * 100) / 100);
          await supabase.from('hosur_bills').update({ credit_amount: newCredit }).eq('id', selectedOrder.billId);
        }
      }
      setNotice(`Cancelled ${num(qty)} ${item.unit} of ${item.itemName} — added to the leftover pool.${selectedOrder.billId && selectedOrder.creditAmount <= 0 ? ' This bill was already fully paid — settle the refund with the shop directly.' : ''}`);
      setCancelQty(v => ({ ...v, [item.id]: '' }));
      load();
    } finally {
      // BUG FIX (2026-08-07): same shape of bug as HosurShopOrderPanel's
      // dispatch `busy` flag — unconditionally nulling here let a still-in-
      // flight cancel on item A get re-enabled by item B's cancel finishing
      // first, allowing a second click on A to re-run cancelItem against the
      // same stale item.cancelledQuantity/selectedOrder.creditAmount
      // snapshot (neither is an atomic server-side increment), risking a
      // lost update — a double leftover-pool insert or a wrong credit total.
      setBusyItemId(id => (id === item.id ? null : id));
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <PackageX className="size-4 text-muted-foreground" />
          <span className="text-sm font-black text-foreground">Leftover &amp; Cancellations</span>
          {leftovers.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">{leftovers.length} in pool</span>}
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Leftover Pool ({leftovers.length})</p>
                  <button onClick={() => setShowAddForm(v => !v)} className="flex items-center gap-1 rounded-lg border border-teal-200 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
                    <Plus className="size-3" /> Add Leftover Item
                  </button>
                </div>

                {showAddForm && (
                  <div className="mb-3 grid gap-2 rounded-xl border border-teal bg-primary/5 p-3 sm:grid-cols-6">
                    <input value={addItemName} onChange={e => setAddItemName(e.target.value)} placeholder="Item name" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold sm:col-span-2" />
                    <input value={addQty} onChange={e => setAddQty(e.target.value)} type="number" placeholder="Qty" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                    <select value={addUnit} onChange={e => setAddUnit(e.target.value as 'kg' | 'pcs')} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold">
                      <option value="kg">kg</option><option value="pcs">pcs</option>
                    </select>
                    <input value={addPrice} onChange={e => setAddPrice(e.target.value)} type="number" placeholder="Price/unit (optional)" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                    <input value={addShopName} onChange={e => setAddShopName(e.target.value)} placeholder="Shop / source (optional)" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" />
                    {addError && <p className="sm:col-span-6 text-[11px] font-bold text-destructive">{addError}</p>}
                    <button onClick={addManualLeftover} disabled={addSaving} className="sm:col-span-6 flex items-center justify-center gap-1.5 rounded-lg cafe-gradient py-1.5 text-xs font-bold text-white shadow-teal disabled:opacity-50">
                      {addSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add to Pool
                    </button>
                  </div>
                )}

                {counterOpen === false && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[11px] font-bold text-destructive">
                    <AlertTriangle className="size-3.5 shrink-0" /> Planner's counter is closed — dispatching a leftover to a shop (which bills it) needs today's counter open in Daily Closure.
                  </div>
                )}

                {leftovers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs font-bold text-muted-foreground">Nothing in the leftover pool.</p>
                ) : (
                  <div className="space-y-1.5">
                    {leftovers.map(row => {
                      const matches = matchesFor(row);
                      const remaining = remainingFor(row);
                      const dispatchOpen = dispatchRowId === row.id;
                      const dResult = dispatchResult[row.id];
                      const dSnap = dispatchBillSnapshot[row.id];
                      return (
                        <div key={row.id} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-black text-amber-900">{row.itemName} — {num(row.quantity)} {row.unit}{remaining < row.quantity - 0.01 && <span className="ml-1 font-bold text-amber-600">({num(remaining)} {row.unit} unpromised)</span>}</p>
                              <p className="text-[11px] font-bold text-amber-700">
                                {leftoverReasonLabel(row.reason)} · {row.sourceShopName || 'Unknown shop'} · {new Date(row.createdAt).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => { setDispatchRowId(v => v === row.id ? null : row.id); setDispatchShopId(''); setDispatchQty(String(remaining)); setDispatchPrice(String(row.unitPrice || '')); }}
                                disabled={remaining <= 0.01}
                                className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-40"
                              >
                                <Truck className="size-3" /> Dispatch to Shop
                              </button>
                              {/* Guarded: if part of this row is already promised to a pending
                                  order (Apply was clicked but that order isn't dispatched yet),
                                  manually resolving it here would conflict with that pending
                                  consumption — force the planner to dispatch that order first. */}
                              <button
                                onClick={() => resolveLeftover(row)}
                                disabled={remaining < row.quantity - 0.01}
                                title={remaining < row.quantity - 0.01 ? 'Part of this is already applied to a pending order — dispatch that order first.' : undefined}
                                className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 disabled:opacity-40 disabled:hover:bg-amber-600"
                              >
                                <RotateCcw className="size-3 " /> Mark Sent / Resolved
                              </button>
                            </div>
                          </div>

                          {dispatchOpen && (
                            <div className="mt-2 space-y-2 rounded-lg border border-teal-200 bg-white p-2.5">
                              <div className="grid gap-1.5 sm:grid-cols-4">
                                <select value={dispatchShopId} onChange={e => setDispatchShopId(e.target.value)} className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold sm:col-span-2">
                                  <option value="">Select shop…</option>
                                  {activeShops.map(s => <option key={s.id} value={s.id}>{s.shopName}</option>)}
                                </select>
                                <input type="number" value={dispatchQty} onChange={e => setDispatchQty(e.target.value)} placeholder="Qty" className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
                                <input type="number" value={dispatchPrice} onChange={e => setDispatchPrice(e.target.value)} placeholder="Price/unit" className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(['full', 'partial', 'credit'] as const).map(t => (
                                  <button key={t} onClick={() => setDispatchPaymentType(t)} className={cn('rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize', dispatchPaymentType === t ? 'gold-gradient text-white' : 'border border-gold bg-card text-amber-800')}>
                                    {t === 'full' ? 'Full Payment' : t === 'partial' ? 'Partial' : 'Credit'}
                                  </button>
                                ))}
                                {dispatchPaymentType !== 'credit' && (
                                  <select value={dispatchPaymentMode} onChange={e => setDispatchPaymentMode(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold">
                                    {PAYMENT_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                  </select>
                                )}
                                {dispatchPaymentType === 'partial' && (
                                  <input type="number" value={dispatchPaidAmount} onChange={e => setDispatchPaidAmount(e.target.value)} placeholder="Paid now" className="w-24 rounded-lg border border-border px-2 py-1 text-[11px] font-bold" />
                                )}
                                {dispatchPaymentType !== 'full' && (
                                  <input type="date" value={dispatchDueDate} onChange={e => setDispatchDueDate(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold" />
                                )}
                              </div>
                              <p className="text-[11px] font-bold text-muted-foreground">
                                Total: {money(Number(dispatchQty || 0) * Number(dispatchPrice || 0))} · up to {num(remaining)} {row.unit} available
                              </p>
                              {dResult && <p className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-bold', dResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200')}>{dResult.message}</p>}
                              {dSnap && (
                                <button onClick={() => printLeftoverBill(dSnap)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted">
                                  <Printer className="size-3" /> Print Physical Bill
                                </button>
                              )}
                              <button
                                onClick={() => dispatchLeftoverToShop(row)}
                                disabled={dispatchBusy || counterOpen === false}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg cafe-gradient py-2 text-xs font-black text-white shadow-teal disabled:opacity-50"
                              >
                                {dispatchBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Confirm Dispatch, Bill &amp; Send WhatsApp
                              </button>
                            </div>
                          )}

                          {matches.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-amber-200 pt-2">
                              <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">Matching new order{matches.length > 1 ? 's' : ''} — this shop reordered the same item</p>
                              {matches.map(({ order, item }) => (
                                <div key={`${order.id}-${item.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                                  <span className="text-[11px] font-bold text-foreground">{order.shopName} — #{order.orderNumber} needs {num(item.quantity)} {item.unit}</span>
                                  <button onClick={() => onApply(row, order, item, remainingFor(row))} className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-teal-700">
                                    Apply {num(Math.min(remainingFor(row), Math.max(0, item.quantity - (overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.dispatchedQuantity))))} {row.unit}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Cancel Part of a Dispatched Order</p>
                <select value={selectedOrderId} onChange={e => { setSelectedOrderId(e.target.value); setNotice(null); }} className="w-full rounded-xl border border-border px-3 py-2 text-xs font-bold">
                  <option value="">Select a recently dispatched order…</option>
                  {recentOrders.map(o => <option key={o.id} value={o.id}>{o.shopName} — #{o.orderNumber} ({new Date(o.createdAt).toLocaleDateString('en-IN')})</option>)}
                </select>
                {selectedOrder && (
                  <div className="mt-2 space-y-1.5">
                    {selectedOrderItems.length === 0 ? (
                      <p className="text-xs font-bold text-muted-foreground">No items found for this order.</p>
                    ) : selectedOrderItems.map(item => {
                      const stillAvailable = Math.round((item.dispatchedQuantity - item.cancelledQuantity) * 1000) / 1000;
                      if (stillAvailable <= 0.01) return null;
                      return (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2.5">
                          <div>
                            <p className="text-xs font-black text-foreground">{item.itemName}</p>
                            <p className="text-[11px] font-bold text-muted-foreground">Dispatched {num(item.dispatchedQuantity)} {item.unit}{item.cancelledQuantity > 0 ? ` · already cancelled ${num(item.cancelledQuantity)} ${item.unit}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input type="number" placeholder="Qty" value={cancelQty[item.id] ?? ''} onChange={e => setCancelQty(v => ({ ...v, [item.id]: e.target.value }))} className="w-20 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold" />
                            <button onClick={() => cancelItem(item)} disabled={busyItemId === item.id || !cancelQty[item.id]} className="flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-40">
                              {busyItemId === item.id ? <Loader2 className="size-3 animate-spin" /> : <PackageX className="size-3" />} Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason (optional) — e.g. shop refused delivery" className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold" />
                  </div>
                )}
                {notice && <p className="mt-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{notice}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
