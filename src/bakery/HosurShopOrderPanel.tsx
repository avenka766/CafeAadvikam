// src/bakery/HosurShopOrderPanel.tsx
// Planner's Hosur shop-order placement (price-list dropdown + custom item)
// and the Dispatch step that was previously missing entirely -- this is what
// moves a shop order from 'pending_packing' to 'dispatched', after which the
// embedded Hosur receiving/billing/WhatsApp flow (in HosurDashboard) takes over.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Store, Search, X, ShoppingCart, Send, Loader2, Plus, Truck, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/lib/exportExcel';
import { dispatchReceiveAndBill } from './hosurBillingBridge';

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
          <button onClick={() => setLocalSection('place')} className={cn('rounded-xl px-3 py-2 text-xs font-bold', section === 'place' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>
            <Store className="mr-1 inline size-3.5" /> Place Order
          </button>
          <button onClick={() => setLocalSection('dispatch')} className={cn('rounded-xl px-3 py-2 text-xs font-bold', section === 'dispatch' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>
            <Truck className="mr-1 inline size-3.5" /> Dispatch ({pendingOrders.length})
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-xs font-bold text-slate-400">Loading shop data...</div>
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
  const [cart, setCart] = useState<Record<string, DraftItem>>({});
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

  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((s, i) => s + i.lineTotal, 0);

  const setQty = (item: { itemName: string; itemUnit: 'pcs' | 'kg'; unitPrice: number }, qty: number) => {
    const safeQty = Math.max(0, Math.round(qty * 1000) / 1000);
    setCart(prev => {
      const next = { ...prev };
      if (safeQty <= 0) delete next[item.itemName];
      else next[item.itemName] = { itemName: item.itemName, unit: item.itemUnit, quantity: safeQty, unitPrice: item.unitPrice, lineTotal: Math.round(safeQty * item.unitPrice * 100) / 100 };
      return next;
    });
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customQty || Number(customQty) <= 0 || !customPrice || Number(customPrice) < 0) {
      setError('Enter a valid custom item name, quantity, and price.');
      return;
    }
    const qty = Number(customQty);
    const price = Number(customPrice);
    setCart(prev => ({
      ...prev,
      [customName.trim()]: { itemName: customName.trim(), unit: customUnit, quantity: qty, unitPrice: price, lineTotal: Math.round(qty * price * 100) / 100, isCustom: true },
    }));
    setCustomName(''); setCustomQty(''); setCustomPrice(''); setShowCustom(false); setError('');
  };

  const saveOrder = async () => {
    if (!selectedShop) { setError('Select a shop first.'); return; }
    if (cartItems.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true); setError('');
    try {
      const orderDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
      const orderNumber = 'HSR-ORD-' + orderDate + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
      const { data: order, error: orderError } = await supabase.from('hosur_orders').insert({
        order_number: orderNumber, shop_id: selectedShop.id, shop_name: selectedShop.shopName,
        shop_whatsapp: selectedShop.whatsappNumber, shop_address: selectedShop.address,
        status: 'pending_packing', subtotal, created_by: userName, notes: notes.trim() || null,
      }).select('id').single();
      if (orderError) throw orderError;

      const rows = cartItems.map(item => ({
        order_id: order.id, item_name: item.itemName, unit: item.unit, quantity: item.quantity,
        unit_price: item.unitPrice, line_total: item.lineTotal, dispatched_quantity: 0, received_quantity: 0,
      }));
      const { error: itemsError } = await supabase.from('hosur_order_items').insert(rows);
      if (itemsError) { await supabase.from('hosur_orders').delete().eq('id', order.id); throw itemsError; }

      const customRows = cartItems.filter(i => i.isCustom).map(i => ({
        shop_id: selectedShop.id, item_name: i.itemName, item_unit: i.unit, unit_price: i.unitPrice, is_active: true,
      }));
      if (customRows.length > 0) await supabase.from('hosur_shop_price_lists').upsert(customRows, { onConflict: 'shop_id,item_name' });

      setCart({}); setNotes(''); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase text-slate-500">Shop</span>
            <select value={selectedShop?.id ?? ''} onChange={e => { setShopId(e.target.value); setCart({}); }} className="h-11 w-full rounded-xl border border-border px-3 text-sm font-bold">
              {activeShops.map(s => <option key={s.id} value={s.id}>{s.shopName}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-black uppercase text-slate-500">Search item</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search price list..." className="h-11 w-full rounded-xl border border-border pl-9 pr-3 text-sm font-bold" />
            </div>
          </label>
        </div>

        {selectedShop && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-black text-emerald-800">{selectedShop.shopName}</p>
            <p className="text-xs font-bold text-emerald-700">{selectedShop.whatsappNumber}</p>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs font-bold text-slate-400">No priced items match -- add as custom below.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredItems.map(item => {
              const current = cart[item.itemName]?.quantity ?? 0;
              const step = item.itemUnit === 'kg' ? 0.25 : 1;
              return (
                <article key={item.id} className={cn('rounded-xl border p-3', current > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-slate-50')}>
                  <p className="text-sm font-black text-slate-800">{item.itemName}</p>
                  <p className="text-xs font-bold text-slate-500">{item.itemUnit} - {money(item.unitPrice)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setQty(item, current - step)} className="size-8 rounded-lg border border-border bg-white font-black">-</button>
                    <input type="number" value={current || ''} onChange={e => setQty(item, Number(e.target.value))} placeholder="0" className="h-8 w-full rounded-lg border border-border text-center text-sm font-black" />
                    <button onClick={() => setQty(item, current + step)} className="size-8 rounded-lg bg-emerald-600 font-black text-white">+</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <button onClick={() => setShowCustom(v => !v)} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
          <Plus className="size-3.5" /> Add custom item (not in price list)
        </button>
        {showCustom && (
          <div className="grid gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 sm:grid-cols-5">
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Item name" className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold sm:col-span-2" />
            <input value={customQty} onChange={e => setCustomQty(e.target.value)} type="number" placeholder="Qty" className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
            <select value={customUnit} onChange={e => setCustomUnit(e.target.value as 'pcs' | 'kg')} className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold">
              <option value="kg">kg</option><option value="pcs">pcs</option>
            </select>
            <input value={customPrice} onChange={e => setCustomPrice(e.target.value)} type="number" placeholder="Price/unit" className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
            <button onClick={addCustomItem} className="sm:col-span-5 rounded-lg bg-indigo-600 py-1.5 text-xs font-bold text-white">Add to Order</button>
          </div>
        )}
      </section>

      <aside className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-emerald-700" /><h3 className="text-sm font-black">Requirement</h3></div>
        {cartItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-bold text-slate-400">No items selected</div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-auto">
            {cartItems.map(item => (
              <div key={item.itemName} className="rounded-xl bg-slate-50 p-2.5">
                <div className="flex justify-between gap-2">
                  <p className="text-xs font-black text-slate-800">{item.itemName} {item.isCustom && <span className="text-indigo-500">(custom)</span>}</p>
                  <button onClick={() => setCart(prev => { const n = { ...prev }; delete n[item.itemName]; return n; })}><X className="size-3.5 text-red-500" /></button>
                </div>
                <p className="text-[11px] font-bold text-slate-500">{num(item.quantity)} {item.unit} x {money(item.unitPrice)} = {money(item.lineTotal)}</p>
              </div>
            ))}
          </div>
        )}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full rounded-xl border border-border px-3 py-2 text-xs font-bold" />
        <div className="flex items-center justify-between rounded-xl bg-emerald-700 px-4 py-2.5 text-white">
          <span className="text-xs font-black">Total</span><span className="text-lg font-black">{money(subtotal)}</span>
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <button onClick={saveOrder} disabled={saving || cartItems.length === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-40">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Order
        </button>
      </aside>
    </div>
  );
}

function DispatchSection({ orders, items, onDone }: { orders: HosurOrder[]; items: HosurOrderItem[]; onDone: () => void }) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<Record<string, 'full' | 'partial' | 'credit'>>({});
  const [paidAmount, setPaidAmount] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});

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
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">Auto-filled from ordered quantity. Dispatching also creates the bill, captures payment, and sends the WhatsApp bill — one click.</p>
        <button
          onClick={() => exportToExcel({
            filename: 'hosur-dispatch-queue', sheetName: 'Dispatch Queue', title: 'Hosur - Pending Dispatch',
            columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Shop', key: 'shop' }, { header: 'Item', key: 'item' }, { header: 'Qty', key: 'qty' }, { header: 'Unit', key: 'unit' }],
            rows: orders.flatMap(o => items.filter(i => i.orderId === o.id).map(i => ({ orderNumber: o.orderNumber, shop: o.shopName, item: i.itemName, qty: i.quantity, unit: i.unit }))),
          })}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
        >Export Excel</button>
      </div>
      {orders.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-xs font-bold text-slate-400">No orders waiting on dispatch.</div>}
      {orders.map(order => {
        const orderItems = items.filter(i => i.orderId === order.id);
        const pType = paymentType[order.id] ?? 'full';
        const total = orderTotal(order);
        const res = result[order.id];
        return (
          <div key={order.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <button onClick={() => setExpanded(v => v === order.id ? null : order.id)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-black text-slate-800">{order.shopName} - #{order.orderNumber} <span className="ml-2 text-xs font-bold text-slate-400">₹{total.toFixed(2)}</span></span>
              <span className="text-xs font-bold text-slate-400">{expanded === order.id ? 'Hide' : 'Open'}</span>
            </button>

            {expanded === order.id && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  {orderItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-bold">
                      <span>{item.itemName} <span className="text-slate-400">(ordered {num(item.quantity)} {item.unit})</span></span>
                      <input type="number" value={overrides[item.id] ?? item.quantity} onChange={e => setOverrides(v => ({ ...v, [item.id]: e.target.value }))} className="w-24 rounded-lg border border-border px-2 py-1 text-right" />
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                  <p className="mb-2 text-[11px] font-black uppercase text-indigo-700">Payment</p>
                  <div className="flex gap-2">
                    {(['full', 'partial', 'credit'] as const).map(t => (
                      <button key={t} onClick={() => setPaymentType(v => ({ ...v, [order.id]: t }))} className={cn('rounded-lg px-3 py-1.5 text-xs font-bold capitalize', pType === t ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-200')}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {pType === 'partial' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Paid amount" value={paidAmount[order.id] ?? ''} onChange={e => setPaidAmount(v => ({ ...v, [order.id]: e.target.value }))} className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
                      <input type="date" value={dueDate[order.id] ?? ''} onChange={e => setDueDate(v => ({ ...v, [order.id]: e.target.value }))} className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
                    </div>
                  )}
                  {pType === 'credit' && (
                    <div className="mt-2">
                      <input type="date" placeholder="Due date" value={dueDate[order.id] ?? ''} onChange={e => setDueDate(v => ({ ...v, [order.id]: e.target.value }))} className="w-full rounded-lg border border-border px-2 py-1.5 text-xs font-bold" />
                    </div>
                  )}
                </div>

                {res && (
                  <p className={cn('rounded-xl px-3 py-2 text-xs font-bold', res.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200')}>{res.message}</p>
                )}

                <button onClick={() => dispatchAndBill(order)} disabled={busy === order.id} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === order.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Dispatch, Bill &amp; Send WhatsApp
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
