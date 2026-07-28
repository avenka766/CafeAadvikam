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
} from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, Branch } from './types';
import { BRANCHES } from './types';
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
  const [tab, setTab] = useState<PlannerTab>('incoming');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOrders().catch(() => {});
    const unsubscribe = subscribe();
    const interval = setInterval(() => { if (!document.hidden) fetchOrders(true); }, 15_000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, [fetchOrders, subscribe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchOrders(true, true); } finally { setRefreshing(false); }
  };

  const incomingOrders   = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const sentOrders        = useMemo(() => orders.filter(o => o.status === 'accepted' || o.status === 'store_confirmed' || o.status === 'produced' || o.status === 'dispatched'), [orders]);
  const mergeableOrders    = useMemo(() => orders.filter(o => o.status === 'pending' || o.status === 'accepted'), [orders]);
  const readyForProduction = useMemo(() => orders.filter(o => o.status === 'store_confirmed'), [orders]);
  const producedOrders    = useMemo(() => orders.filter(o => o.status === 'produced'), [orders]);
  const activeLeftovers    = useMemo(() => orders.filter(o => (o.leftoverStatus ?? 'pending') === 'pending' && o.status === 'dispatched'), [orders]);
  const doneOrders         = useMemo(() => orders.filter(o => o.leftoverStatus === 'done'), [orders]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-slate-900">Planner</h1>
            <p className="text-xs font-semibold text-slate-500">Merge orders · production · dispatch · cake · closure</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', (refreshing || loading) && 'animate-spin')} />
            Refresh
          </button>
        </div>
        <nav className="mx-auto mt-3 flex max-w-7xl gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition',
                tab === t.key ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {t.icon}
              {t.label}
              {t.key === 'incoming' && incomingOrders.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{incomingOrders.length}</span>
              )}
              {t.key === 'production' && readyForProduction.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{readyForProduction.length}</span>
              )}
              {t.key === 'dispatch' && producedOrders.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{producedOrders.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            {tab === 'incoming' && <IncomingOrdersTab orders={incomingOrders} onAdd={submitOrder} />}
            {tab === 'sent' && <SentOrdersTab orders={sentOrders} />}
            {tab === 'merged' && <MergedSummaryTab orders={mergeableOrders} />}
            {tab === 'production' && <ProductionEntryTab orders={readyForProduction} />}
            {tab === 'dispatch' && <DispatchTab orders={producedOrders} allOrders={orders} />}
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
  const stageLabel = (o: BakeryOrder) => o.status === 'produced' ? 'Produced' : o.status === 'dispatched' ? 'Dispatched' : 'Store';
  const stageTone = (o: BakeryOrder) => o.status === 'produced' ? 'bg-purple-100 text-purple-700' : o.status === 'dispatched' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">Sent to Store ({orders.length})</h2>
        <ExportButton
          disabled={orders.length === 0}
          onClick={() => exportToExcel({
            filename: 'sent-orders', sheetName: 'Sent', title: 'Planner — Sent to Store',
            columns: [{ header: 'Order #', key: 'orderNumber' }, { header: 'Branch', key: 'branch' }, { header: 'Stage', key: 'stage' }, { header: 'Item', key: 'item' }, { header: 'Qty', key: 'qty' }, { header: 'Unit', key: 'unit' }],
            rows: orders.flatMap(o => o.items.map(item => ({
              orderNumber: o.orderNumber, branch: o.targetBranch, stage: stageLabel(o), item: item.itemName,
              qty: item.dispatchUnit === 'pcs' ? item.originalPcs ?? item.quantity : item.quantity, unit: item.dispatchUnit || 'kg',
            }))),
          })}
        />
      </div>
      <DayGroupedOrderList orders={orders} badgeLabel={stageLabel} badgeTone={stageTone} />
    </div>
  );
}

// ─── Tab: Merged Summary ────────────────────────────────────────────────────
function MergedSummaryTab({ orders }: { orders: BakeryOrder[] }) {
  const { confirmStock } = useBakeryStore();
  const merged = useMemo(() => computeMergedSummary(orders), [orders]);
  const [sendingAll, setSendingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSendToStore = async () => {
    setSendingAll(true); setNotice(null);
    try {
      const ids = Array.from(new Set(merged.flatMap(r => r.contributingOrderIds)));
      for (const id of ids) {
        const order = orders.find(o => o.id === id);
        if (order && order.status !== 'store_confirmed') await confirmStock(id);
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
  const merged = useMemo(() => computeMergedSummary(orders), [orders]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [itemStatus, setItemStatus] = useState<Record<string, 'pending' | 'completed'>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const producedSoFar = (row: MergedRow) => {
    // Sum what's already recorded across contributing orders for this item.
    let sum = 0;
    for (const order of orders) {
      if (!row.contributingOrderIds.includes(order.id)) continue;
      const item = order.items.find(i => i.itemName === row.itemName);
      const prod = item ? order.producedItems?.find(p => p.itemId === item.itemId) : undefined;
      if (prod) sum += prod.quantityPrepared;
    }
    return sum;
  };

  const handleMark = async (row: MergedRow, status: 'pending' | 'completed') => {
    const enteredQty = status === 'completed'
      ? (qty[row.itemName] ? Number(qty[row.itemName]) : row.totalRequested)
      : Number(qty[row.itemName] || 0);
    if (status === 'pending' && enteredQty <= 0) return;

    setSaving(row.itemName);
    try {
      const split = autoSplitForItem(orders, row.itemName, enteredQty);
      for (const orderId of row.contributingOrderIds) {
        const order = orders.find(o => o.id === orderId);
        if (!order) continue;
        const item = order.items.find(i => i.itemName === row.itemName);
        if (!item) continue;
        const others = (order.producedItems || []).filter(p => p.itemId !== item.itemId);
        const merged: PreparedItem[] = [
          ...others,
          { itemId: item.itemId, itemName: item.itemName, quantityPrepared: split[orderId] ?? 0, preparedAt: new Date().toISOString(), dispatchUnit: item.dispatchUnit },
        ];
        await recordProduction(order.id, merged);
      }
      setItemStatus(s => ({ ...s, [row.itemName]: status }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">Production Entry ({merged.length} items)</h2>
        <ExportButton
          disabled={merged.length === 0}
          onClick={() => exportToExcel({
            filename: 'production-entry', sheetName: 'Production', title: 'Planner — Production Entry',
            columns: [{ header: 'Item', key: 'item' }, { header: 'Ordered Qty', key: 'ordered' }, { header: 'Produced So Far', key: 'produced' }, { header: 'Unit', key: 'unit' }, { header: 'Status', key: 'status' }],
            rows: merged.map(row => ({ item: row.itemName, ordered: row.totalRequested, produced: producedSoFar(row), unit: row.unit, status: itemStatus[row.itemName] ?? '—' })),
          })}
        />
      </div>
      {merged.length === 0 && <EmptyState text="No items waiting on production entry." />}
      <div className="space-y-2">
        {merged.map(row => {
          const already = producedSoFar(row);
          const status = itemStatus[row.itemName];
          return (
            <div key={row.itemName} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-800">{row.itemName}</p>
                <p className="text-xs font-bold text-slate-400">Ordered {row.totalRequested} {row.unit}{already > 0 ? ` · Produced so far ${already} ${row.unit}` : ''}</p>
              </div>
              <input
                type="number"
                placeholder={status === 'completed' ? String(row.totalRequested) : 'Qty produced'}
                value={qty[row.itemName] ?? ''}
                onChange={e => setQty(v => ({ ...v, [row.itemName]: e.target.value }))}
                className="w-28 rounded-lg border border-border px-2 py-1.5 text-right text-xs font-bold"
              />
              <button
                title="Completed — baker fully produced this item"
                onClick={() => handleMark(row, 'completed')}
                disabled={saving === row.itemName}
                className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', status === 'completed' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')}
              >
                {saving === row.itemName ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              </button>
              <button
                title="Pending — baker sent some, more still baking"
                onClick={() => handleMark(row, 'pending')}
                disabled={saving === row.itemName}
                className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', status === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100')}
              >
                <Clock3 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Dispatch ──────────────────────────────────────────────────────────
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
    // HosurDashboard reads its own tab from the plain `tab` param — keep both in sync.
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

      {/* HosurShopOrderPanel owns 'place'/'dispatch'; hidden (not unmounted) for the
          others so its data stays loaded and switching back is instant. */}
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
  const { setDispatchSplit, submitDispatch } = useBakeryStore();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700">Dispatch ({orders.length})</h2>
        <ExportButton
          disabled={orders.length === 0}
          onClick={() => exportToExcel({
            filename: 'dispatch',
            sheetName: 'Dispatch',
            title: 'Planner — Dispatch',
            columns: [
              { header: 'Order #', key: 'orderNumber' },
              { header: 'Branch', key: 'branch' },
              { header: 'Item', key: 'item' },
              { header: 'Dispatched Qty', key: 'qty' },
              { header: 'Unit', key: 'unit' },
              { header: 'Dispatched At', key: 'at' },
            ],
            rows: orders.flatMap(o => (o.dispatchLog || []).map(d => ({
              orderNumber: o.orderNumber, branch: o.targetBranch, item: d.itemName,
              qty: d.quantity, unit: d.unit || 'kg', at: d.dispatchedAt,
            }))),
          })}
        />
      </div>
      {orders.length === 0 && <EmptyState text="No produced orders waiting on dispatch." />}
      {orders.map(order => (
        <DispatchOrderCard key={order.id} order={order} allOrders={allOrders} onSplit={setDispatchSplit} onDispatch={submitDispatch} />
      ))}
    </div>
  );
}

function DispatchOrderCard({
  order, allOrders, onSplit, onDispatch,
}: {
  order: BakeryOrder;
  allOrders: BakeryOrder[];
  onSplit: (id: string, split: Record<string, Record<string, number>>) => Promise<void>;
  onDispatch: ReturnType<typeof useBakeryStore.getState>['submitDispatch'];
}) {
  const currentUser = useAuthStore(s => s.currentUser);
  const [sending, setSending] = useState<string | null>(null);

  // Auto-calc: this order's share of each item's total production, by default.
  const autoQty = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of order.items) {
      const produced = order.producedItems?.find(p => p.itemId === item.itemId)?.quantityPrepared ?? 0;
      const split = autoSplitForItem(allOrders, item.itemName, produced);
      result[item.itemId] = split[order.id] ?? produced;
    }
    return result;
  }, [order, allOrders]);

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const effectiveQty = (itemId: string) => overrides[itemId] !== undefined ? Number(overrides[itemId] || 0) : autoQty[itemId];

  const handleDispatchItem = async (item: BakeryOrderItem) => {
    if (!order.targetBranch) return;
    setSending(item.itemId);
    try {
      await onSplit(order.id, { ...(order.dispatchSplit || {}), [order.targetBranch]: { ...(order.dispatchSplit?.[order.targetBranch] || {}), [item.itemId]: effectiveQty(item.itemId) } });
      await onDispatch(order.id, {
        itemName: item.itemName,
        quantity: effectiveQty(item.itemId),
        unit: item.dispatchUnit || 'kg',
        branch: order.targetBranch,
        dispatchedBy: currentUser?.displayName || 'Planner',
        dispatchedAt: new Date().toISOString(),
      });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-black text-slate-800">{order.targetBranch} · Order #{order.orderNumber}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">Auto-split, editable</span>
      </div>
      <div className="space-y-2">
        {order.items.map(item => {
          const alreadyDispatched = (order.dispatchLog || []).some(d => d.itemName === item.itemName);
          return (
            <div key={item.itemId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-xs font-bold text-slate-600">{item.itemName}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={overrides[item.itemId] ?? autoQty[item.itemId] ?? ''}
                  onChange={e => setOverrides(v => ({ ...v, [item.itemId]: e.target.value }))}
                  className="w-24 rounded-lg border border-border px-2 py-1 text-right text-xs font-bold"
                />
                <span className="text-[10px] font-bold text-slate-400">{item.dispatchUnit || 'kg'}</span>
                <button
                  onClick={() => handleDispatchItem(item)}
                  disabled={sending === item.itemId || alreadyDispatched}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sending === item.itemId ? <Loader2 className="size-3 animate-spin" /> : <Truck className="size-3" />}
                  {alreadyDispatched ? 'Dispatched' : 'Dispatch'}
                </button>
              </div>
            </div>
          );
        })}
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
