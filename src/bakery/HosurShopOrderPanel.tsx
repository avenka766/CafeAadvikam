// src/bakery/HosurShopOrderPanel.tsx
// Planner's Hosur shop-order placement (price-list dropdown + custom item)
// and the Dispatch step that was previously missing entirely -- this is what
// moves a shop order from 'pending_packing' to 'dispatched', after which the
// embedded Hosur receiving/billing/WhatsApp flow (in HosurDashboard) takes over.
//
// UI/UX NOTE: restyled to the app's premium brand system (cafe-teal / gold,
// font-display headings, card-base/shadow-teal/shadow-gold conventions) in
// place of the previous generic slate/emerald/indigo Tailwind palette. No
// business logic, data fetching, or handler behaviour was changed below.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Store, Search, X, ShoppingCart, Send, Loader2, Plus, Truck, CheckCircle2, AlertTriangle, Printer, PackageX, RotateCcw, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/lib/exportExcel';
import { dispatchReceiveAndBill } from './hosurBillingBridge';
import { getPackingCounterStatus } from './packingCounter';

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

  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'pending_packing'), [orders]);
  useEffect(() => { onPendingCountChange?.(pendingOrders.length); }, [pendingOrders.length, onPendingCountChange]);

  return (
    <div className="space-y-4">
      {controlledSection === undefined && (
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
      )}

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
        if (customRows.length > 0) await supabase.from('hosur_shop_price_lists').upsert(customRows, { onConflict: 'shop_id,item_name' });

        // Push this shop's requirement into the central bakery workflow so
        // Planner sees it in Incoming Orders, just like a VRSNB/SNB requirement.
        // bakeryStore's submitDispatch matches on the HOSUR_ORDER_ID tag in
        // notes to sync status back onto the hosur_orders row above.
        const bakeryItems = items_.map(item => ({
          itemId: `hosur-${normalize(item.itemName)}`,
          itemName: item.itemName,
          quantity: item.quantity,
          dispatchUnit: item.unit,
        }));
        const { error: bakeryOrderError } = await supabase.from('bakery_orders').insert({
          items: bakeryItems, status: 'pending', created_by: userName, target_branch: 'Hosur',
          notes: `HOSUR_ORDER_ID:${order.id}${notes.trim() ? ` | ${notes.trim()}` : ''}`,
        });
        if (bakeryOrderError) throw bakeryOrderError;
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
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Item name" className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold sm:col-span-2" />
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
  const [counterOpen, setCounterOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPackingCounterStatus().then(s => { if (!cancelled) setCounterOpen(s.isOpen); }).catch(() => { if (!cancelled) setCounterOpen(null); });
    return () => { cancelled = true; };
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
  const applyLeftoverToItem = (leftover: LeftoverRow, order: HosurOrder, item: HosurOrderItem, maxApplyQty: number) => {
    // BUG FIX: base the reduction on whatever qty is currently entered for
    // this item (a manual override the planner may have already typed in),
    // not the original ordered quantity — otherwise applying a leftover
    // silently discards any manual edit made before it.
    const currentQty = overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.quantity;
    const applyQty = Math.round(Math.max(0, Math.min(maxApplyQty, currentQty)) * 1000) / 1000;
    if (applyQty <= 0) return;
    setOverrides(v => ({ ...v, [item.id]: String(Math.max(0, Math.round((currentQty - applyQty) * 1000) / 1000)) }));
    setAppliedLeftovers(v => ({ ...v, [`${order.id}::${item.id}`]: { leftoverId: leftover.id, qty: applyQty } }));
    setExpanded(order.id);
  };

  const orderTotal = (order: HosurOrder) => {
    const orderItems = items.filter(i => i.orderId === order.id);
    return orderItems.reduce((sum, item) => {
      const qty = overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.quantity;
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
        receivedQuantity: overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.quantity,
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
      // BUG FIX: if some of that reduction was because the planner applied an
      // EXISTING leftover to this item (via appliedLeftovers), that portion
      // is already being consumed from the pool a few lines below — without
      // this subtraction it would also get re-counted here as a brand-new
      // shortfall, doubling the same stock in the pool.
      const shortfalls = billItems
        .map(i => {
          const applied = appliedLeftovers[`${order.id}::${i.id}`]?.qty ?? 0;
          const shortfall = Math.round((i.quantity - i.receivedQuantity - applied) * 1000) / 1000;
          return { ...i, shortfall };
        })
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
        const { data: leftoverRow } = await supabase.from('hosur_leftover_pool').select('quantity').eq('id', applied.leftoverId).maybeSingle();
        const currentQty = Number(leftoverRow?.quantity ?? 0);
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
      setBusy(null);
    }
  };

  const printPhysicalBill = (snap: { billNo: string; order: HosurOrder; items: { itemName: string; unit: string; quantity: number; unitPrice: number }[] }) => {
    const win = window.open('', '_blank'); if (!win) return;
    const rows = snap.items.map(i => `<tr><td>${i.itemName}</td><td style="text-align:right">${num(i.quantity)} ${i.unit}</td><td style="text-align:right">${money(i.unitPrice)}</td><td style="text-align:right">${money(i.quantity * i.unitPrice)}</td></tr>`).join('');
    const total = snap.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    win.document.write(`<html><head><title>Bill ${snap.billNo}</title><style>
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
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-3">
      <div className="card-base flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl cafe-gradient text-white shadow-teal">
            <Truck className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-foreground">Dispatch Queue</h3>
            <p className="text-xs font-bold text-muted-foreground font-body">Auto-filled from ordered quantity. Dispatching also creates the bill, captures payment, and sends the WhatsApp bill — one click.</p>
          </div>
        </div>
        <button
          onClick={() => exportToExcel({
            filename: 'hosur-dispatch-queue', sheetName: 'Dispatch Queue', title: 'Hosur - Pending Dispatch',
            columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Shop', key: 'shop' }, { header: 'Item', key: 'item' }, { header: 'Qty', key: 'qty' }, { header: 'Unit', key: 'unit' }],
            rows: orders.flatMap(o => items.filter(i => i.orderId === o.id).map(i => ({ orderNumber: o.orderNumber, shop: o.shopName, item: i.itemName, qty: i.quantity, unit: i.unit }))),
          })}
          className="rounded-xl border border-teal bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
        >Export Excel</button>
      </div>
      {counterOpen === false && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> Planner's counter is closed — open today's counter in Daily Closure before billing any Hosur order.
        </div>
      )}
      {orders.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-xs font-bold text-muted-foreground">No orders waiting on dispatch.</div>}
      {orders.map(order => {
        const orderItems = items.filter(i => i.orderId === order.id);
        const pType = paymentType[order.id] ?? 'full';
        const total = orderTotal(order);
        const res = result[order.id];
        return (
          <div key={order.id} className="card-base p-4">
            <button onClick={() => setExpanded(v => v === order.id ? null : order.id)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-black text-foreground">{order.shopName} - #{order.orderNumber} <span className="ml-2 text-xs font-bold text-muted-foreground">{money(total)}</span></span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{expanded === order.id ? 'Hide' : 'Open'}</span>
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
                    // whenever the dispatched amount exceeds what was ordered.
                    const overrideVal = overrides[item.id];
                    const overrideNum = overrideVal !== undefined ? Number(overrideVal) : item.quantity;
                    const exceedsOrdered = Number.isFinite(overrideNum) && overrideNum > item.quantity + 0.001;
                    return (
                      <div key={item.id} className="rounded-lg bg-muted/40 px-3 py-1.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{item.itemName} <span className="text-muted-foreground">(ordered {num(item.quantity)} {item.unit})</span></span>
                          <input
                            type="number"
                            min={0}
                            value={overrideVal ?? item.quantity}
                            onChange={e => {
                              const raw = e.target.value;
                              const n = Number(raw);
                              // Reject negative numbers outright; anything
                              // else (including blank, mid-typing) passes
                              // through as-is so typing isn't interrupted.
                              if (raw !== '' && Number.isFinite(n) && n < 0) return;
                              setOverrides(v => ({ ...v, [item.id]: raw }));
                            }}
                            className={cn('w-24 rounded-lg border bg-background px-2 py-1 text-right', exceedsOrdered ? 'border-amber-400' : 'border-border')}
                          />
                        </div>
                        {exceedsOrdered && <p className="mt-0.5 text-[10px] font-black text-amber-700">More than ordered ({num(item.quantity)} {item.unit}) — double-check before dispatching.</p>}
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

function HosurLeftoverAndCancelPanel({ pendingOrders, pendingItems, appliedLeftovers, onApply, refreshTick, shops }: {
  pendingOrders: HosurOrder[]; pendingItems: HosurOrderItem[];
  appliedLeftovers: Record<string, { leftoverId: string; qty: number }>;
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
  const consumeLeftover = async (row: LeftoverRow, qty: number, orderId: string, shopName: string) => {
    const remaining = Math.round((row.quantity - qty) * 1000) / 1000;
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

  const printLeftoverBill = (snap: { billNo: string; shopName: string; orderNumber: string; itemName: string; unit: string; quantity: number; unitPrice: number }) => {
    const win = window.open('', '_blank'); if (!win) return;
    const total = snap.quantity * snap.unitPrice;
    win.document.write(`<html><head><title>Bill ${snap.billNo}</title><style>
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
    win.document.close(); win.print();
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
      setBusyItemId(null);
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
                                    Apply {num(Math.min(remainingFor(row), item.quantity))} {row.unit}
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
