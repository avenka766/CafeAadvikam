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
import { Store, Search, X, ShoppingCart, Send, Loader2, Plus, Truck, CheckCircle2, AlertTriangle } from 'lucide-react';
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
interface HosurOrderItem { id: string; orderId: string; itemName: string; unit: 'pcs' | 'kg'; quantity: number; unitPrice: number; lineTotal: number; dispatchedQuantity: number; receivedQuantity: number; }
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
  return { id: r.id as string, orderId: r.order_id as string, itemName: String(r.item_name ?? ''), unit: r.unit === 'kg' ? 'kg' : 'pcs', quantity: Number(r.quantity ?? 0), unitPrice: Number(r.unit_price ?? 0), lineTotal: Number(r.line_total ?? 0), dispatchedQuantity: Number(r.dispatched_quantity ?? 0), receivedQuantity: Number(r.received_quantity ?? 0) };
}

export default function HosurShopOrderPanel({ section: controlledSection, onPendingCountChange }: { section?: 'place' | 'dispatch'; onPendingCountChange?: (n: number) => void } = {}) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [shops, setShops] = useState<HosurShop[]>([]);
  const [prices, setPrices] = useState<HosurShopPrice[]>([]);
  const [orders, setOrders] = useState<HosurOrder[]>([]);
  const [items, setItems] = useState<HosurOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSection, setLocalSection] = useState<'place' | 'dispatch'>('place');
  const section = controlledSection ?? localSection;

  const load = useCallback(async () => {
    const [shopsRes, pricesRes, ordersRes, itemsRes] = await Promise.all([
      supabase.from('hosur_shops').select('id, shop_name, whatsapp_number, address, is_active, discount_percent').order('shop_name'),
      supabase.from('hosur_shop_price_lists').select('id, shop_id, item_name, item_unit, unit_price, is_active').eq('is_active', true),
      supabase.from('hosur_orders').select('id, order_number, shop_id, shop_name, shop_whatsapp, status, subtotal, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('hosur_order_items').select('id, order_id, item_name, unit, quantity, unit_price, line_total, dispatched_quantity, received_quantity'),
    ]);
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

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-xs font-bold text-muted-foreground font-body">
          <Loader2 className="size-4 animate-spin" /> Loading shop data...
        </div>
      ) : section === 'place' ? (
        <PlaceOrderSection shops={shops} prices={prices} userName={currentUser?.displayName || 'Planner'} onSaved={load} />
      ) : (
        <DispatchSection orders={pendingOrders} items={items} onDone={load} />
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

function DispatchSection({ orders, items, onDone }: { orders: HosurOrder[]; items: HosurOrderItem[]; onDone: () => void }) {
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

  const orderTotal = (order: HosurOrder) => {
    const orderItems = items.filter(i => i.orderId === order.id);
    return orderItems.reduce((sum, item) => {
      const qty = overrides[item.id] !== undefined ? Number(overrides[item.id] || 0) : item.quantity;
      return sum + qty * item.unitPrice;
    }, 0);
  };

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
      onDone();
    } catch (err) {
      setResult(r => ({ ...r, [order.id]: { ok: false, message: err instanceof Error ? err.message : 'Failed to dispatch and bill this order.' } }));
    } finally {
      setBusy(null);
    }
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
                  {orderItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-xs font-bold">
                      <span>{item.itemName} <span className="text-muted-foreground">(ordered {num(item.quantity)} {item.unit})</span></span>
                      <input type="number" value={overrides[item.id] ?? item.quantity} onChange={e => setOverrides(v => ({ ...v, [item.id]: e.target.value }))} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right" />
                    </div>
                  ))}
                </div>

                {(() => {
                  const mode = paymentMode[order.id] ?? 'cash';
                  const modeLabel = PAYMENT_MODES.find(m => m.key === mode)?.label ?? 'Cash';
                  const paidNow = pType === 'partial' ? Number(paidAmount[order.id] || 0) : pType === 'full' ? total : 0;
                  const balance = pType === 'credit' ? total : Math.max(0, Math.round((total - paidNow) * 100) / 100);
                  const needsDueDate = pType !== 'full';
                  const dueDateMissing = needsDueDate && !dueDate[order.id];
                  const partialInvalid = pType === 'partial' && (!paidAmount[order.id] || paidNow <= 0 || paidNow >= total);
                  const canDispatch = !dueDateMissing && !partialInvalid && counterOpen !== false;
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
                        <p className={cn('rounded-xl px-3 py-2 text-xs font-bold', res.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200')}>{res.message}</p>
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
    </div>
  );
}
