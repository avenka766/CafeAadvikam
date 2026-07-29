// src/bakery/PlannerDashboard.tsx
// Replaces the old Production stage (baker/sweet_master/savouries_master/
// cookies_master/puffs_master/bakery_master) and the standalone Packing
// Dashboard. Planner is now the single hub for: merging SNB + VRSNB orders,
// handing merged totals to Store, recording actual production, splitting and
// dispatching to branches, tracking leftovers, and cake dispatch — plus the
// migrated Transfer-In and Daily Closure tools from Packing.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList, Layers, Factory, Truck, Cake, PackageCheck,
  ArrowRightLeft, Calendar, Plus, Send, CheckCircle2, Loader2,
  ChevronDown, ChevronUp, X, RefreshCw, AlertTriangle, FileSpreadsheet, Clock3,
  Store, CreditCard, WalletCards, MessageCircle, Bell, CalendarDays, ShieldCheck,
  Search, Printer,
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, Branch } from './types';
import { BRANCHES, BAKERY_ITEMS } from './types';
import { printHtml } from '@/branch/printUtils';
import PackingTransferInTab from './PackingTransferInTab';
import PackingDailyClosureTab from './PackingDailyClosureTab';
import { exportToExcel } from '@/lib/exportExcel';
import HosurDashboard from '@/pages/HosurDashboard';
import HosurShopOrderPanel from './HosurShopOrderPanel';
import PackingCakeOrdersTab from './PackingCakeOrdersTab';

type PlannerTab = 'incoming' | 'sent' | 'merged' | 'production' | 'dispatch' | 'hosur' | 'cake' | 'transfer-in' | 'closure' | 'done';
const TABS: { key: PlannerTab; label: string; icon: React.ReactNode }[] = [
  { key: 'incoming',    label: 'Incoming Orders',  icon: <ClipboardList className="size-4" /> },
  { key: 'sent',        label: 'Sent',             icon: <Send className="size-4" /> },
  { key: 'merged',      label: 'Merged Summary',   icon: <Layers className="size-4" /> },
  { key: 'production',  label: 'Production Entry', icon: <Factory className="size-4" /> },
  { key: 'dispatch',    label: 'Dispatch',         icon: <Truck className="size-4" /> },
  { key: 'hosur',       label: 'Hosur Shops & Billing', icon: <PackageCheck className="size-4" /> },
  { key: 'cake',        label: 'Cake Dispatch',    icon: <Cake className="size-4" /> },
  { key: 'transfer-in', label: 'Transfer In',      icon: <ArrowRightLeft className="size-4" /> },
  { key: 'closure',     label: 'Daily Closure',    icon: <Calendar className="size-4" /> },
  { key: 'done',        label: 'Leftover / Done',  icon: <PackageCheck className="size-4" /> },
];

const BRANCH_META: Record<Branch, { bg: string; text: string; icon: string }> = {
  VRSNB: { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',    icon: '🏙️' },
  SNB:   { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: '🏪' },
  Hosur: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: '🌿' },
};

// ─── Merge helper ────────────────────────────────────────────────────────────
interface MergedRow {
  itemName: string;
  unit: 'pcs' | 'kg';
  totalRequested: number;
  perBranch: Partial<Record<Branch, number>>;
  contributingOrderIds: string[];
}

export function computeMergedSummary(orders: BakeryOrder[]): MergedRow[] {
  const rows = new Map<string, MergedRow>();
  for (const order of orders) {
    if (!order.targetBranch) continue;
    for (const item of order.items) {
      const unit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
      const qty = unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
      const key = `${item.itemName.trim().toLowerCase()}__${unit}`;
      const existing = rows.get(key);
      if (existing) {
        existing.totalRequested += qty;
        existing.perBranch[order.targetBranch] = (existing.perBranch[order.targetBranch] || 0) + qty;
        if (!existing.contributingOrderIds.includes(order.id)) existing.contributingOrderIds.push(order.id);
      } else {
        rows.set(key, {
          itemName: item.itemName,
          unit,
          totalRequested: qty,
          perBranch: { [order.targetBranch]: qty },
          contributingOrderIds: [order.id],
        });
      }
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.totalRequested - a.totalRequested);
}

// Category lookup (Sweets / Savouries / Bakery / Cookies / Other) by item name.
const ITEM_CATEGORY_BY_NAME = new Map(BAKERY_ITEMS.map(i => [i.name.trim().toLowerCase(), i.category]));
export function categoryForItem(itemName: string): string {
  return ITEM_CATEGORY_BY_NAME.get(itemName.trim().toLowerCase()) || 'Other';
}
const CATEGORY_ORDER = ['Sweets', 'Savouries', 'Bakery', 'Cookies', 'Other'];

export interface ProductionRow extends MergedRow {
  category: string;
  preparedTotal: number;
  /** 'not_started' = planner hasn't entered anything yet · 'pending' = partially entered, more coming ·
   *  'completed' = baker fully produced this item, ready to dispatch. */
  itemStatus: 'not_started' | 'pending' | 'completed';
}

// Builds merged rows (same shape as computeMergedSummary) but enriched with the
// planner's per-item production status, read from each contributing order's
// producedItems[].status (no schema change needed — reuses the existing jsonb field).
export function computeProductionRows(orders: BakeryOrder[]): ProductionRow[] {
  const merged = computeMergedSummary(orders);
  return merged.map(row => {
    const contributing = orders.filter(o => row.contributingOrderIds.includes(o.id));
    let preparedTotal = 0;
    let anyRecorded = false;
    let allCompleted = contributing.length > 0;
    for (const order of contributing) {
      const item = order.items.find(i => i.itemName === row.itemName);
      const prod = item ? order.producedItems?.find(p => p.itemId === item.itemId) : undefined;
      if (prod) {
        anyRecorded = true;
        preparedTotal += prod.quantityPrepared;
        if (prod.status !== 'completed') allCompleted = false;
      } else {
        allCompleted = false;
      }
    }
    const itemStatus: ProductionRow['itemStatus'] = allCompleted ? 'completed' : anyRecorded ? 'pending' : 'not_started';
    return { ...row, category: categoryForItem(row.itemName), preparedTotal, itemStatus };
  });
}

// Proportional auto-split of a produced total across the contributing orders,
// weighted by each order's original requested share for that item.
export function autoSplitForItem(orders: BakeryOrder[], itemName: string, totalProduced: number): Record<string, number> {
  const contributing = orders.filter(o => o.items.some(i => i.itemName === itemName));
  const shares = contributing.map(o => {
    const item = o.items.find(i => i.itemName === itemName)!;
    const isPcs = item.dispatchUnit === 'pcs';
    const requested = isPcs && item.originalPcs != null ? item.originalPcs : item.quantity;
    return { orderId: o.id, requested };
  });
  const totalRequested = shares.reduce((s, x) => s + x.requested, 0) || 1;
  const split: Record<string, number> = {};
  for (const s of shares) {
    split[s.orderId] = Math.round((totalProduced * (s.requested / totalRequested)) * 100) / 100;
  }
  return split;
}

export default function PlannerDashboard() {
  const { orders, loading, fetchOrders, subscribe, submitOrder } = useBakeryStore();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as PlannerTab | null;
  const tab: PlannerTab = urlTab && TABS.some(t => t.key === urlTab) ? urlTab : 'incoming';

  useEffect(() => {
    fetchOrders().catch(() => {});
    const unsubscribe = subscribe();
    const interval = setInterval(() => { if (!document.hidden) fetchOrders(true); }, 15_000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, [fetchOrders, subscribe]);

  const incomingOrders   = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const sentOrders        = useMemo(() => orders.filter(o => o.status === 'accepted' || o.status === 'store_confirmed' || o.status === 'produced' || o.status === 'dispatched'), [orders]);
  const mergeableOrders    = useMemo(() => orders.filter(o => o.status === 'pending' || o.status === 'accepted'), [orders]);
  const readyForProduction = useMemo(() => orders.filter(o => o.status === 'store_confirmed'), [orders]);
  const producedOrders    = useMemo(() => orders.filter(o => o.status === 'produced'), [orders]);
  // Union used by Production Entry + Dispatch: an order flips to 'produced' as soon as any
  // one item is recorded, but individual items may still be pending — both tabs need the
  // full set and decide per-item (per-row) visibility themselves.
  const productionSourceOrders = useMemo(() => orders.filter(o => o.status === 'store_confirmed' || o.status === 'produced'), [orders]);
  const activeLeftovers    = useMemo(() => orders.filter(o => (o.leftoverStatus ?? 'pending') === 'pending' && o.status === 'dispatched'), [orders]);
  const doneOrders         = useMemo(() => orders.filter(o => o.leftoverStatus === 'done'), [orders]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            {tab === 'incoming' && <IncomingOrdersTab orders={incomingOrders} onAdd={submitOrder} />}
            {tab === 'sent' && <SentOrdersTab orders={sentOrders} />}
            {tab === 'merged' && <MergedSummaryTab orders={mergeableOrders} />}
            {tab === 'production' && <ProductionEntryTab orders={productionSourceOrders} />}
            {tab === 'dispatch' && <DispatchTab orders={productionSourceOrders} allOrders={orders} />}
            {tab === 'hosur' && <HosurUnifiedSection />}
            {tab === 'cake' && <PackingCakeOrdersTab />}
            {tab === 'transfer-in' && <PackingTransferInTab />}
            {tab === 'closure' && <PackingDailyClosureTab />}
            {tab === 'done' && <LeftoverDoneTab active={activeLeftovers} done={doneOrders} />}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Tab: Incoming Orders ───────────────────────────────────────────────────
function IncomingOrdersTab({ orders, onAdd }: { orders: BakeryOrder[]; onAdd: ReturnType<typeof useBakeryStore.getState>['submitOrder'] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [branch, setBranch] = useState<Branch>('SNB');
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<'pcs' | 'kg'>('kg');
  const [saving, setSaving] = useState(false);
  const currentUser = useAuthStore(s => s.currentUser);

  const handleAdd = async () => {
    if (!itemName.trim() || !qty || Number(qty) <= 0) return;
    setSaving(true);
    try {
      const item: BakeryOrderItem = {
        itemId: `manual-${Date.now()}`,
        itemName: itemName.trim(),
        quantity: unit === 'pcs' ? Number(qty) : Number(qty),
        dispatchUnit: unit,
        originalPcs: unit === 'pcs' ? Number(qty) : undefined,
      };
      await onAdd([item], currentUser?.displayName || 'Planner', branch, 'Added directly by Planner');
      setItemName(''); setQty(''); setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">Incoming Orders ({orders.length})</h2>
        <div className="flex gap-2">
          <ExportButton
            disabled={orders.length === 0}
            onClick={() => exportToExcel({
              filename: 'incoming-orders',
              sheetName: 'Incoming Orders',
              title: 'Planner — Incoming Orders',
              columns: [
                { header: 'Order #', key: 'orderNumber' },
                { header: 'Branch', key: 'branch' },
                { header: 'Status', key: 'status' },
                { header: 'Item', key: 'item' },
                { header: 'Qty', key: 'qty' },
                { header: 'Unit', key: 'unit' },
              ],
              rows: orders.flatMap(o => o.items.map(item => ({
                orderNumber: o.orderNumber, branch: o.targetBranch, status: o.status,
                item: item.itemName,
                qty: item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity,
                unit: item.dispatchUnit || 'kg',
              }))),
            })}
          />
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
            <Plus className="size-4" /> Add Order
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <select value={branch} onChange={e => setBranch(e.target.value as Branch)} className="rounded-xl border border-border px-3 py-2 text-sm">
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Item name" className="rounded-xl border border-border px-3 py-2 text-sm sm:col-span-2" />
            <div className="flex gap-2">
              <input value={qty} onChange={e => setQty(e.target.value)} type="number" placeholder="Qty" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
              <select value={unit} onChange={e => setUnit(e.target.value as 'pcs' | 'kg')} className="rounded-xl border border-border px-2 py-2 text-sm">
                <option value="kg">kg</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
          </div>
          <button onClick={handleAdd} disabled={saving} className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit Order
          </button>
        </div>
      )}

      <DayGroupedOrderList orders={orders} badgeLabel="Pending" badgeTone="bg-amber-100 text-amber-700" />
    </div>
  );
}

// Groups orders by calendar day (newest day first), each with a day header
// and a running count — used by both Incoming and Sent tabs.
function DayGroupedOrderList({ orders, badgeLabel, badgeTone }: { orders: BakeryOrder[]; badgeLabel: string | ((o: BakeryOrder) => string); badgeTone: string | ((o: BakeryOrder) => string) }) {
  const groups = useMemo(() => {
    const map = new Map<string, BakeryOrder[]>();
    for (const order of orders) {
      const day = new Date(order.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(order);
    }
    return Array.from(map.entries()).sort((a, b) => new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime());
  }, [orders]);

  if (orders.length === 0) return <EmptyState text="Nothing here right now." />;

  return (
    <div className="space-y-5">
      {groups.map(([day, dayOrders]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">{day}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{dayOrders.length}</span>
          </div>
          <div className="space-y-2">
            {dayOrders.map(order => {
              const label = typeof badgeLabel === 'function' ? badgeLabel(order) : badgeLabel;
              const tone = typeof badgeTone === 'function' ? badgeTone(order) : badgeTone;
              return (
                <div key={order.id} className={cn('rounded-2xl border p-4 shadow-sm', BRANCH_META[order.targetBranch || 'SNB'].bg)}>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-sm font-black', BRANCH_META[order.targetBranch || 'SNB'].text)}>
                      {BRANCH_META[order.targetBranch || 'SNB'].icon} {order.targetBranch} — Order #{order.orderNumber}
                    </span>
                    <span className={cn('rounded-full px-2 py-1 text-[10px] font-black', tone)}>{label}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                    {order.items.map((item, i) => (
                      <li key={i}>{item.itemName} — {item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity} {item.dispatchUnit || 'kg'}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Sent ──────────────────────────────────────────────────────────────
function SentOrdersTab({ orders }: { orders: BakeryOrder[] }) {
  const [date, setDate] = useState(''); // '' = all dates

  const dateFiltered = useMemo(() => {
    if (!date) return orders;
    return orders.filter(o => {
      const d = new Date(o.createdAt);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return local === date;
    });
  }, [orders, date]);

  const merged = useMemo(() => computeMergedSummary(dateFiltered), [dateFiltered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-700">Sent — Merged Summary ({merged.length} items)</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-slate-600"
          />
          {date && (
            <button onClick={() => setDate('')} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">Clear</button>
          )}
          <ExportButton
            disabled={merged.length === 0}
            onClick={() => exportToExcel({
              filename: 'sent-merged-summary', sheetName: 'Sent', title: 'Planner — Sent (Merged Summary)',
              columns: [
                { header: 'Item', key: 'item' },
                ...BRANCHES.map(b => ({ header: b, key: b })),
                { header: 'Total', key: 'total' },
                { header: 'Unit', key: 'unit' },
              ],
              rows: merged.map(row => ({
                item: row.itemName, VRSNB: row.perBranch.VRSNB ?? '', SNB: row.perBranch.SNB ?? '', Hosur: row.perBranch.Hosur ?? '',
                total: row.totalRequested, unit: row.unit,
              })),
            })}
          />
        </div>
      </div>
      {merged.length === 0 ? <EmptyState text="Nothing sent for this date yet." /> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                {BRANCHES.map(b => <th key={b} className="px-4 py-3 text-right">{b}</th>)}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(row => (
                <tr key={`${row.itemName}-${row.unit}`} className="border-t border-border">
                  <td className="px-4 py-3 font-bold text-slate-800">{row.itemName}</td>
                  {BRANCHES.map(b => (
                    <td key={b} className="px-4 py-3 text-right text-slate-600">{row.perBranch[b] ? `${row.perBranch[b]} ${row.unit}` : '—'}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-black text-slate-900">{row.totalRequested} {row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Merged Summary ────────────────────────────────────────────────────
function MergedSummaryTab({ orders }: { orders: BakeryOrder[] }) {
  const { acceptOrder } = useBakeryStore();
  const merged = useMemo(() => computeMergedSummary(orders), [orders]);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSendToStore = async () => {
    setSendingAll(true); setNotice(null);
    try {
      const ids = Array.from(new Set(merged.flatMap(r => r.contributingOrderIds)));
      for (const id of ids) {
        const order = orders.find(o => o.id === id);
        // Hand the order to Store's Orders queue - Store then picks which
        // items to confirm/send, and the rest stays there for later.
        if (order && order.status === 'pending') await acceptOrder(id);
      }
      setNotice(`Merged order sent to Store for ${ids.length} order(s).`);
    } finally {
      setSendingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">Merged Summary</h2>
        <div className="flex gap-2">
          <ExportButton
            disabled={merged.length === 0}
            onClick={() => exportToExcel({
              filename: 'merged-summary',
              sheetName: 'Merged Summary',
              title: 'Planner — Merged Order Summary',
              columns: [
                { header: 'Item', key: 'item' },
                ...BRANCHES.map(b => ({ header: b, key: b })),
                { header: 'Total', key: 'total' },
                { header: 'Unit', key: 'unit' },
              ],
              rows: merged.map(row => ({
                item: row.itemName,
                VRSNB: row.perBranch.VRSNB ?? '',
                SNB: row.perBranch.SNB ?? '',
                Hosur: row.perBranch.Hosur ?? '',
                total: row.totalRequested,
                unit: row.unit,
              })),
            })}
          />
          <button onClick={handleSendToStore} disabled={sendingAll || merged.length === 0} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {sendingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Merged Order to Store
          </button>
        </div>
      </div>
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</div>}
      {merged.length === 0 ? <EmptyState text="No pending orders to merge yet." /> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                {BRANCHES.map(b => <th key={b} className="px-4 py-3 text-right">{b}</th>)}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(row => (
                <tr key={`${row.itemName}-${row.unit}`} className="border-t border-border">
                  <td className="px-4 py-3 font-bold text-slate-800">{row.itemName}</td>
                  {BRANCHES.map(b => (
                    <td key={b} className="px-4 py-3 text-right text-slate-600">{row.perBranch[b] ? `${row.perBranch[b]} ${row.unit}` : '—'}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-black text-slate-900">{row.totalRequested} {row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Production Entry ──────────────────────────────────────────────────
function ProductionEntryTab({ orders }: { orders: BakeryOrder[] }) {
  const { recordProduction } = useBakeryStore();
  const rows = useMemo(() => computeProductionRows(orders).filter(r => r.itemStatus !== 'completed'), [orders]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  // Single unified flow: Save -> ask Completed/Pending -> if Completed, ask again to confirm.
  const [askItem, setAskItem] = useState<ProductionRow | null>(null);
  const [confirmItem, setConfirmItem] = useState<ProductionRow | null>(null);

  const filtered = useMemo(() => rows.filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, ProductionRow[]>();
    for (const r of filtered) { if (!map.has(r.category)) map.set(r.category, []); map.get(r.category)!.push(r); }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [filtered]);

  const doSave = async (row: ProductionRow, status: 'pending' | 'completed') => {
    const enteredQty = qty[row.itemName] ? Number(qty[row.itemName]) : (status === 'completed' ? row.totalRequested : 0);
    if (enteredQty <= 0) return;
    setSaving(row.itemName);
    try {
      const split = autoSplitForItem(orders, row.itemName, enteredQty);
      for (const orderId of row.contributingOrderIds) {
        const order = orders.find(o => o.id === orderId);
        const item = order?.items.find(i => i.itemName === row.itemName);
        if (!order || !item) continue;
        const others = (order.producedItems || []).filter(p => p.itemId !== item.itemId);
        const merged: PreparedItem[] = [...others, { itemId: item.itemId, itemName: item.itemName, quantityPrepared: split[orderId] ?? 0, preparedAt: new Date().toISOString(), dispatchUnit: item.dispatchUnit, status }];
        await recordProduction(order.id, merged);
      }
      setQty(v => ({ ...v, [row.itemName]: '' }));
    } finally {
      setSaving(null);
      setAskItem(null);
      setConfirmItem(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-700">Production Entry ({rows.length} items)</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <ExportButton
            disabled={rows.length === 0}
            onClick={() => exportToExcel({
              filename: 'production-entry', sheetName: 'Production', title: 'Planner — Production Entry',
              columns: [{ header: 'Category', key: 'category' }, { header: 'Item', key: 'item' }, { header: 'Ordered Qty', key: 'ordered' }, { header: 'Produced So Far', key: 'produced' }, { header: 'Unit', key: 'unit' }, { header: 'Status', key: 'status' }],
              rows: rows.map(row => ({ category: row.category, item: row.itemName, ordered: row.totalRequested, produced: row.preparedTotal, unit: row.unit, status: row.itemStatus })),
            })}
          />
        </div>
      </div>
      {rows.length === 0 && <EmptyState text="No items waiting on production entry." />}
      {grouped.map(([category, items]) => (
        <div key={category}>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{category} ({items.length})</p>
          <div className="space-y-2">
            {items.map(row => (
              <div key={row.itemName} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-800">{row.itemName}</p>
                  <p className="text-xs font-bold text-slate-400">
                    Ordered {row.totalRequested} {row.unit}{row.preparedTotal > 0 ? ` · Produced so far ${row.preparedTotal} ${row.unit}` : ''}
                    {row.itemStatus === 'pending' && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">More to come</span>}
                  </p>
                </div>
                <input type="number" placeholder="Qty produced" value={qty[row.itemName] ?? ''} onChange={e => setQty(v => ({ ...v, [row.itemName]: e.target.value }))}
                  className="w-28 rounded-lg border border-border px-2 py-1.5 text-right text-xs font-bold" />
                <button onClick={() => setAskItem(row)} disabled={saving === row.itemName || !qty[row.itemName]}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40">
                  {saving === row.itemName ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Save
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Step 1: after Save, ask Completed or Pending. */}
      {askItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black text-slate-800">"{askItem.itemName}" — {qty[askItem.itemName]} {askItem.unit} entered</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Is the baker completely done with this item, or still baking more?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAskItem(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
              <button onClick={() => { doSave(askItem, 'pending'); }} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600">
                <Clock3 className="size-3.5" /> Pending — more coming
              </button>
              <button onClick={() => { setConfirmItem(askItem); setAskItem(null); }} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                <CheckCircle2 className="size-3.5" /> Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Completed needs a second confirmation before it moves to Dispatch. */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-black text-slate-800">Confirm: mark "{confirmItem.itemName}" as Completed?</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">This sends {qty[confirmItem.itemName] || confirmItem.totalRequested} {confirmItem.unit} to Dispatch and removes it from Production Entry. This can't be undone from here.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmItem(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Go back</button>
              <button onClick={() => doSave(confirmItem, 'completed')} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">Yes, Confirm Completed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Hosur — one unified, grouped sub-tab bar controlling shop
// ordering/dispatch (this component) and the embedded billing/credit/
// reports panel (HosurDashboard), instead of two separate stacked tab bars.
type HosurSubTab = 'place' | 'dispatch' | 'shops' | 'credit' | 'collection' | 'whatsapp' | 'reminders' | 'closure' | 'reports' | 'notifications';
const HOSUR_SUB_TAB_GROUPS: { label: string; tabs: { key: HosurSubTab; label: string; icon: React.ReactNode; ownedByPanel: boolean }[] }[] = [
  { label: 'Orders', tabs: [
    { key: 'place',    label: 'Place Order', icon: <Store className="size-3.5" />, ownedByPanel: true },
    { key: 'dispatch', label: 'Dispatch',    icon: <Truck className="size-3.5" />, ownedByPanel: true },
  ] },
  { label: 'Money', tabs: [
    { key: 'credit',     label: 'Credit Ledger',      icon: <CreditCard className="size-3.5" />, ownedByPanel: false },
    { key: 'collection', label: 'Payment Collection', icon: <WalletCards className="size-3.5" />, ownedByPanel: false },
  ] },
  { label: 'Communication', tabs: [
    { key: 'whatsapp',  label: 'WhatsApp Logs',    icon: <MessageCircle className="size-3.5" />, ownedByPanel: false },
    { key: 'reminders', label: 'Reminder History', icon: <Bell className="size-3.5" />, ownedByPanel: false },
  ] },
  { label: 'Admin', tabs: [
    { key: 'shops',         label: 'Shop Master',   icon: <Store className="size-3.5" />, ownedByPanel: false },
    { key: 'closure',       label: 'Daily Closure', icon: <CalendarDays className="size-3.5" />, ownedByPanel: false },
    { key: 'reports',       label: 'Reports',       icon: <FileSpreadsheet className="size-3.5" />, ownedByPanel: false },
    { key: 'notifications', label: 'Notifications', icon: <ShieldCheck className="size-3.5" />, ownedByPanel: false },
  ] },
];

function HosurUnifiedSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('hosurTab') as HosurSubTab | null;
  const activeTab: HosurSubTab = urlTab && HOSUR_SUB_TAB_GROUPS.some(g => g.tabs.some(t => t.key === urlTab)) ? urlTab : 'place';
  const [pendingDispatchCount, setPendingDispatchCount] = useState(0);

  const selectTab = (key: HosurSubTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('hosurTab', key);
    if (!HOSUR_SUB_TAB_GROUPS.find(g => g.tabs.find(t => t.key === key))?.tabs.find(t => t.key === key)?.ownedByPanel) {
      params.set('tab', key);
    }
    setSearchParams(params, { replace: true });
  };

  const panelSection: 'place' | 'dispatch' | undefined = activeTab === 'place' || activeTab === 'dispatch' ? activeTab : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {HOSUR_SUB_TAB_GROUPS.map(group => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => selectTab(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
                      activeTab === t.key ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {t.icon} {t.label}
                    {t.key === 'dispatch' && pendingDispatchCount > 0 && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-black', activeTab === t.key ? 'bg-white text-emerald-700' : 'bg-red-100 text-red-700')}>{pendingDispatchCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={panelSection ? '' : 'hidden'}>
        <HosurShopOrderPanel section={panelSection ?? 'place'} onPendingCountChange={setPendingDispatchCount} />
      </div>
      <div className={panelSection ? 'hidden' : ''}>
        <HosurDashboard hideNav />
      </div>
    </div>
  );
}

function DispatchTab({ orders, allOrders }: { orders: BakeryOrder[]; allOrders: BakeryOrder[] }) {
  const { submitDispatch } = useBakeryStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const rows = useMemo(() => computeProductionRows(orders).filter(r => r.itemStatus !== 'not_started'), [orders]);
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'active' | 'completed'>('active');
  const [checklistItem, setChecklistItem] = useState<ProductionRow | null>(null);

  const dispatchedQtyForItem = (row: ProductionRow) => {
    let sum = 0;
    for (const order of orders) {
      if (!row.contributingOrderIds.includes(order.id)) continue;
      sum += (order.dispatchLog || []).filter(d => d.itemName === row.itemName).reduce((s, d) => s + d.quantity, 0);
    }
    return sum;
  };

  const filtered = rows.filter(r => r.itemName.toLowerCase().includes(search.trim().toLowerCase()));
  const fullyDispatched = (row: ProductionRow) => dispatchedQtyForItem(row) >= row.preparedTotal - 0.01 && row.preparedTotal > 0;
  const activeRows = filtered.filter(r => !fullyDispatched(r))
    .sort((a, b) => (dispatchedQtyForItem(b) > 0 ? 1 : 0) - (dispatchedQtyForItem(a) > 0 ? 1 : 0));
  const completedRows = filtered.filter(r => fullyDispatched(r));
  const shown = subTab === 'active' ? activeRows : completedRows;

  const inProgressRows = filtered.filter(r => !fullyDispatched(r) && dispatchedQtyForItem(r) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-700">Dispatch</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item..." className="rounded-xl border border-border py-1.5 pl-8 pr-3 text-xs font-bold" />
          </div>
          <ExportButton
            disabled={rows.length === 0}
            onClick={() => exportToExcel({
              filename: 'dispatch', sheetName: 'Dispatch', title: 'Planner — Dispatch',
              columns: [{ header: 'Item', key: 'item' }, ...BRANCHES.map(b => ({ header: `${b} Req`, key: b })), { header: 'Produced', key: 'produced' }, { header: 'Dispatched', key: 'dispatched' }, { header: 'Status', key: 'status' }],
              rows: rows.map(row => ({ item: row.itemName, VRSNB: row.perBranch.VRSNB ?? '', SNB: row.perBranch.SNB ?? '', Hosur: row.perBranch.Hosur ?? '', produced: row.preparedTotal, dispatched: dispatchedQtyForItem(row), status: row.itemStatus })),
            })}
          />
        </div>
      </div>

      {/* Pinned summary — partially dispatched items with more still coming from the baker,
          always at the top regardless of sub-tab, with each branch's required vs dispatched. */}
      {inProgressRows.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-700">Still In Progress — More To Come ({inProgressRows.length})</p>
          <div className="space-y-2">
            {inProgressRows.map(row => (
              <div key={row.itemName} className="rounded-xl bg-white p-2.5">
                <p className="text-sm font-black text-slate-800">{row.itemName}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                  {BRANCHES.filter(b => row.perBranch[b]).map(b => {
                    const branchDispatched = orders.filter(o => o.targetBranch === b && row.contributingOrderIds.includes(o.id))
                      .reduce((s, o) => s + (o.dispatchLog || []).filter(d => d.itemName === row.itemName).reduce((s2, d) => s2 + d.quantity, 0), 0);
                    return <span key={b} className="rounded-lg bg-amber-100 px-2 py-1">{b}: required {row.perBranch[b]} {row.unit} · dispatched {branchDispatched} {row.unit}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setSubTab('active')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'active' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>To Dispatch ({activeRows.length})</button>
        <button onClick={() => setSubTab('completed')} className={cn('rounded-xl px-3 py-1.5 text-xs font-bold', subTab === 'completed' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>Dispatched ({completedRows.length})</button>
      </div>

      {shown.length === 0 && <EmptyState text={subTab === 'active' ? 'Nothing waiting on dispatch.' : 'Nothing dispatched yet.'} />}
      <div className="space-y-2">
        {shown.map(row => {
          const dispatched = dispatchedQtyForItem(row);
          return (
            <div key={row.itemName} className="rounded-2xl border border-border bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-800">{row.itemName} <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black', row.itemStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{row.itemStatus === 'completed' ? 'Completed' : 'More to come'}</span></p>
                  <p className="text-xs font-bold text-slate-400">Produced {row.preparedTotal} {row.unit}{dispatched > 0 ? ` · Dispatched ${dispatched} ${row.unit}` : ''}</p>
                </div>
                {subTab === 'active' && (
                  <button onClick={() => setChecklistItem(row)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                    <Truck className="size-3.5" /> Dispatch
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                {BRANCHES.filter(b => row.perBranch[b]).map(b => <span key={b} className="rounded-lg bg-slate-50 px-2 py-1">{b} requested {row.perBranch[b]} {row.unit}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      {checklistItem && (
        <DispatchChecklistModal
          row={checklistItem}
          orders={orders}
          onClose={() => setChecklistItem(null)}
          onDispatch={submitDispatch}
          dispatchedBy={currentUser?.displayName || 'Planner'}
        />
      )}
    </div>
  );
}

function DispatchChecklistModal({ row, orders, onClose, onDispatch, dispatchedBy }: {
  row: ProductionRow; orders: BakeryOrder[]; onClose: () => void;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch']; dispatchedBy: string;
}) {
  const branchOrders = useMemo(() => {
    const map = new Map<string, { order: BakeryOrder; item: BakeryOrderItem }[]>();
    for (const orderId of row.contributingOrderIds) {
      const order = orders.find(o => o.id === orderId);
      const item = order?.items.find(i => i.itemName === row.itemName);
      if (!order || !item || !order.targetBranch) continue;
      if (!map.has(order.targetBranch)) map.set(order.targetBranch, []);
      map.get(order.targetBranch)!.push({ order, item });
    }
    return map;
  }, [row, orders]);

  const autoSplit = useMemo(() => autoSplitForItem(orders, row.itemName, row.preparedTotal), [orders, row]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const qtyFor = (orderId: string) => qty[orderId] !== undefined ? Number(qty[orderId] || 0) : Math.round((autoSplit[orderId] ?? 0) * 100) / 100;

  const CHECKLIST_BY_BRANCH: Record<string, string[]> = {
    SNB: ['Verify SNB quantity matches this checklist', 'Cross-check SNB boxes/kg/pcs before loading', 'Load onto SNB delivery vehicle', 'Hand over and get SNB counter sign-off'],
    VRSNB: ['Verify VRSNB quantity matches this checklist', 'Pack VRSNB items in labeled crates', 'Load onto VRSNB delivery vehicle', 'Hand over and get VRSNB counter sign-off'],
    Hosur: ['Verify Hosur shop-wise split matches this checklist', 'Pack per-shop bags separately for Hosur', 'Load onto Hosur delivery vehicle', 'Hand over and get Hosur receiver sign-off'],
  };
  const checklistFor = (branch: string) => CHECKLIST_BY_BRANCH[branch] || CHECKLIST_BY_BRANCH.SNB;

  const confirmDispatch = async () => {
    setSending(true);
    try {
      for (const [branch, entries] of branchOrders) {
        for (const { order, item } of entries) {
          const q = qtyFor(order.id);
          if (q <= 0) continue;
          await onDispatch(order.id, { itemName: item.itemName, quantity: q, unit: item.dispatchUnit || 'kg', branch: branch as Branch, dispatchedBy, dispatchedAt: new Date().toISOString() });
        }
      }
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  const printChecklist = () => {
    const win = window.open('', '_blank'); if (!win) return;
    const sections = Array.from(branchOrders.entries()).map(([branch, entries]) => {
      const qtyTotal = entries.reduce((s, { order }) => s + qtyFor(order.id), 0);
      return `<h2>${branch} — ${row.itemName}: ${qtyTotal} ${row.unit}</h2><ol>${checklistFor(branch).map(s => `<li>${s}</li>`).join('')}</ol>`;
    }).join('<hr/>');
    win.document.write(`<html><body style="font-family:sans-serif;padding:24px">${sections}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm font-black text-slate-800">Dispatch Checklist — {row.itemName}</p>
        {!done ? (
          <>
            <div className="mt-3 space-y-3">
              {Array.from(branchOrders.entries()).map(([branch, entries]) => (
                <div key={branch} className="rounded-xl border border-border p-3">
                  <p className="mb-1.5 text-xs font-black text-slate-700">{branch} (requested {row.perBranch[branch as Branch] ?? 0} {row.unit})</p>
                  {entries.map(({ order }) => (
                    <div key={order.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs font-bold text-slate-500">Order #{order.orderNumber}</span>
                      <input type="number" value={qty[order.id] ?? qtyFor(order.id)} onChange={e => setQty(v => ({ ...v, [order.id]: e.target.value }))} className="w-24 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold" />
                    </div>
                  ))}
                  <ul className="mt-2 space-y-1 text-[11px] font-semibold text-slate-500">
                    {checklistFor(branch).map(s => <li key={s}>☐ {s}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={printChecklist} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"><Printer className="size-3.5" /> Print</button>
              <button onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
              <button onClick={confirmDispatch} disabled={sending} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} Confirm Dispatch
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs font-semibold text-emerald-600">Dispatched. This item now shows in the Dispatched sub-tab{row.itemStatus === 'pending' ? ' — still marked pending, more expected from the baker.' : '.'}</p>
            <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">Close</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Leftover / Done ───────────────────────────────────────────────────
function LeftoverDoneTab({ active, done }: { active: BakeryOrder[]; done: BakeryOrder[] }) {
  const { markDone } = useBakeryStore();
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-700">Active Leftovers ({active.length})</h2>
          <ExportButton
            disabled={active.length === 0 && done.length === 0}
            onClick={() => exportToExcel({
              filename: 'leftover-done', sheetName: 'Leftover-Done', title: 'Planner — Leftover / Done',
              columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Branch', key: 'branch' }, { header: 'Status', key: 'status' }],
              rows: [
                ...active.map(o => ({ orderNumber: o.orderNumber, branch: o.targetBranch, status: 'Active Leftover' })),
                ...done.map(o => ({ orderNumber: o.orderNumber, branch: o.targetBranch, status: 'Done' })),
              ],
            })}
          />
        </div>
        {active.length === 0 ? <EmptyState text="No leftovers pending reconciliation." /> : (
          <div className="space-y-2">
            {active.map(order => (
              <div key={order.id} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <p className="text-sm font-black text-amber-800">{order.targetBranch} · Order #{order.orderNumber}</p>
                  <p className="text-xs font-semibold text-amber-700">Dispatched — awaiting reconciliation.</p>
                </div>
                <button onClick={() => markDone(order.id)} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">
                  <CheckCircle2 className="size-4" /> Mark Done
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-black text-slate-700">Done ({done.length})</h2>
        {done.length === 0 ? <EmptyState text="Nothing marked done yet." /> : (
          <div className="space-y-2">
            {done.map(order => (
              <div key={order.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-black text-emerald-800">{order.targetBranch} · Order #{order.orderNumber} — Done</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
    >
      <FileSpreadsheet className="size-4" /> Export Excel
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
      <AlertTriangle className="size-6 text-slate-300" />
      <p className="text-xs font-bold text-slate-400">{text}</p>
    </div>
  );
}
