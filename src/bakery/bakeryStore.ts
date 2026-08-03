import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, DispatchEntry, WorkflowStatus, Branch } from './types';
import { useNotificationStore } from './notificationStore'; // BUG #16 FIX: needed to fire baker shortage notifications

// Planner's "Planning" tab tags a proactive/extra-production batch with this
// marker in `notes` (target_branch stays null since the destination branch
// isn't decided until Dispatch). Exported so PlannerDashboard.tsx can both
// write it and recognize it consistently everywhere it groups/filters orders.
export const PLANNED_STOCK_TAG = 'PLANNER_PLANNED_STOCK';
export function isPlannedOrder(order: { notes?: string | null; targetBranch?: string | null }): boolean {
  return !order.targetBranch && String(order.notes ?? '').includes(PLANNED_STOCK_TAG);
}

interface BakeryState {
  orders: BakeryOrder[];
  loading: boolean;
  // FIX: added `silent` param — background polls pass true so loading stays false,
  // preventing the StoreDashboard list from unmounting and resetting card state.
  fetchOrders: (silent?: boolean, force?: boolean) => Promise<void>;
  submitOrder: (items: BakeryOrderItem[], createdBy: string, targetBranch: Branch, notes?: string) => Promise<void>;
  // Planner's "Planning" tab: proactive extra-production batches that are NOT
  // tied to any actual VRSNB/SNB/Hosur order yet. target_branch stays null —
  // the destination branch is chosen later, per item, at actual Dispatch time
  // (see the Dispatch tab's "Planned" sub-tab).
  submitPlannedOrder: (items: BakeryOrderItem[], createdBy: string, notes?: string) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  // Combines several branch orders (same target branch) into a single
  // order before handing it to Store, so Store sees one combined order
  // instead of several separate ones.
  mergeOrdersForStore: (orderIds: string[]) => Promise<void>;
  updateExpectedOutput: (orderId: string, qty: number) => Promise<void>;
  confirmStock: (orderId: string) => Promise<void>;
  // Store selects a subset of items to confirm/send; the rest stays behind
  // in the order (still 'pending'/'accepted') so it keeps showing in Orders.
  confirmStockSelected: (orderId: string, selectedIndexes: number[], sentBy?: string) => Promise<void>;
  recordProduction: (orderId: string, producedItems: PreparedItem[]) => Promise<void>;
  setDispatchSplit: (orderId: string, split: Record<string, Record<string, number>>) => Promise<void>;
  submitDispatch: (orderId: string, entry: Omit<DispatchEntry, 'id'>) => Promise<void>;
  deleteDispatchEntry: (orderId: string, entryId: string) => Promise<void>;
  markDone: (orderId: string) => Promise<void>;
  subscribe: () => () => void; // returns unsubscribe fn
}

export function rowToOrder(d: Record<string, unknown>): BakeryOrder {
  return {
    id: d.id as string,
    orderNumber: d.order_number as number,
    items: (d.items as BakeryOrderItem[]) || [],
    status: d.status as WorkflowStatus,
    createdBy: d.created_by as string,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string | undefined,
    expectedOutput: d.expected_output as number | undefined,
    materialsCalculatedAt: d.materials_calculated_at as string | undefined,
    preparedItems: (d.prepared_items as PreparedItem[]) || [],
    producedItems: (d.produced_items as PreparedItem[]) || [],
    dispatchSplit: (d.dispatch_split as Record<string, Record<string, number>>) || {},
    leftoverStatus: (d.leftover_status as 'pending' | 'done') || 'pending',
    storeConfirmedAt: d.store_confirmed_at as string | undefined,
    plannerNotes: d.planner_notes as string | undefined,
    sentToPackingAt: d.sent_to_packing_at as string | undefined,
    dispatchLog: (d.dispatch_log as DispatchEntry[]) || [],
    targetBranch: d.target_branch as Branch | undefined,
    storeSourceOrderNumber: d.store_source_order_number as number | undefined,
    storeSendRequestId: d.store_send_request_id as string | undefined,
    notes: d.notes as string | undefined, // U-14 FIX
    correctionRequest: d.correction_request as BakeryOrder['correctionRequest'],
  };
}

const BAKERY_ORDER_COLUMNS = 'id, order_number, items, status, created_by, created_at, expected_output, materials_calculated_at, prepared_items, produced_items, dispatch_split, leftover_status, store_confirmed_at, planner_notes, sent_to_packing_at, dispatch_log, target_branch, store_source_order_number, store_send_request_id, notes, correction_request';
let bakeryFetchInFlight: Promise<void> | null = null;
let bakeryLastFetchedAt = 0;
const BAKERY_FETCH_FRESH_MS = 60_000;

// Standalone, on-demand query — deliberately NOT part of the polled Zustand
// store above. Used by features that need an arbitrary/historical date range
// (e.g. BakerDashboard's Completed-orders report, OrderReceiverDashboard's
// Placed-orders panel) so they always see the full history the user asks for,
// regardless of the 60-day window the live 15s poll is bounded to.
export async function fetchBakeryOrdersInRange(options: {
  fromIso: string;
  toIso: string;
  statuses?: WorkflowStatus[];
  targetBranch?: Branch;
  // When true, filters on completion date (sent_to_packing_at, falling back to
  // created_at for orders never sent to packing) instead of created_at — matches
  // the semantics of orderCompletedAt() used by BakerDashboard's Completed tab.
  useCompletionDate?: boolean;
}): Promise<BakeryOrder[]> {
  const { fromIso, toIso, statuses, targetBranch, useCompletionDate } = options;
  let query = supabase.from('bakery_orders').select(BAKERY_ORDER_COLUMNS);
  if (statuses && statuses.length > 0) query = query.in('status', statuses);
  if (targetBranch) query = query.eq('target_branch', targetBranch);
  query = useCompletionDate
    ? query.or(`and(sent_to_packing_at.gte.${fromIso},sent_to_packing_at.lte.${toIso}),and(sent_to_packing_at.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`)
    : query.gte('created_at', fromIso).lte('created_at', toIso);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  return (data ?? []).map((d) => rowToOrder(d as Record<string, unknown>));
}

export const useBakeryStore = create<BakeryState>((set, get) => ({
  orders: [],
  loading: false,

  // FIX: `silent=true` skips setting loading:true so background 15s polls
  // don't cause the StoreDashboard list to flash/unmount and lose local state.
  //
  // EGRESS FIX: bounded to a 60-day rolling window, matching the same pattern
  // already used for the café orders table (orderStore.ts). Every downstream
  // consumer (StoreDashboard, PackingDashboard, BakerDashboard, OrderReceiverDashboard,
  // BakeryItemManagement) filters this list by STATUS only (pending/baking/packed/
  // dispatched etc.), never by date, and a bakery order moves from placed to
  // dispatched within days — so 60 days comfortably covers real operational use
  // while stopping this 15 s poll from re-fetching the entire order history forever.
  fetchOrders: async (silent = false, force = false) => {
    if (bakeryFetchInFlight) return bakeryFetchInFlight;
    if (!force && silent && Date.now() - bakeryLastFetchedAt < BAKERY_FETCH_FRESH_MS) return;

    const request = (async () => {
      if (!silent) set({ loading: true });
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const query = supabase
          .from('bakery_orders')
          .select(BAKERY_ORDER_COLUMNS)
          .gte('created_at', cutoff.toISOString())
          .order('created_at', { ascending: false });
        const { data, error } = await query;
        if (!error && data) {
          set({ orders: data.map(d => rowToOrder(d as Record<string, unknown>)) });
          bakeryLastFetchedAt = Date.now();
        }
      } catch (e) {
        console.error('fetchOrders error:', e);
      } finally {
        if (!silent) set({ loading: false });
      }
    })();
    bakeryFetchInFlight = request;
    try {
      await request;
    } finally {
      if (bakeryFetchInFlight === request) bakeryFetchInFlight = null;
    }
  },

  submitOrder: async (items, createdBy, targetBranch, notes) => {
    const { data, error } = await supabase
      .from('bakery_orders')
      .insert({ items, status: 'pending', created_by: createdBy, target_branch: targetBranch, notes: notes || null })
      .select()
      .single();
    if (error || !data) throw new Error('Failed to submit order. Please try again.');
    const order = rowToOrder(data as Record<string, unknown>);
    set(s => ({ orders: [order, ...s.orders] }));
    // Activity log
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId:   user.id,
        staffName: user.displayName,
        role:      user.role,
        action:    'Submitted Order',
        detail:    `Order #${order.orderNumber} for ${targetBranch} — ${items.length} item(s)`,
        branch:    targetBranch,
      });
    }
  },

  submitPlannedOrder: async (items, createdBy, notes) => {
    const taggedNotes = `${PLANNED_STOCK_TAG}${notes?.trim() ? `|${notes.trim()}` : ''}`;
    const { data, error } = await supabase
      .from('bakery_orders')
      .insert({ items, status: 'pending', created_by: createdBy, target_branch: null, notes: taggedNotes })
      .select()
      .single();
    if (error || !data) throw new Error('Failed to submit the production plan. Please try again.');
    const order = rowToOrder(data as Record<string, unknown>);
    set(s => ({ orders: [order, ...s.orders] }));
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId: user.id, staffName: user.displayName, role: user.role,
        action: 'Submitted Production Plan', detail: `Plan #${order.orderNumber} — ${items.length} item(s), extra production`,
      });
    }
  },

  acceptOrder: async (orderId) => {
    const order = get().orders.find(o => o.id === orderId);
    const { error } = await supabase
      .from('bakery_orders')
      .update({ status: 'accepted' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'accepted' } : o) }));
    if (order?.notes) {
      const { useAuthStore } = await import('@/stores/authStore');
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const user = useAuthStore.getState().currentUser;
      const acceptedBy = user?.displayName || user?.username || 'Store';
      const orderNo = order.notes.split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'store', acceptedBy);
    }
  },

  mergeOrdersForStore: async (orderIds) => {
    const group = orderIds
      .map(id => get().orders.find(o => o.id === id))
      .filter((o): o is BakeryOrder => Boolean(o));
    if (group.length === 0) return;

    if (group.length === 1) {
      await get().acceptOrder(group[0].id);
      return;
    }

    // Combine items with the same name + unit across all orders in the group.
    const combined: BakeryOrderItem[] = [];
    for (const o of group) {
      for (const item of o.items) {
        const unit = item.dispatchUnit === 'pcs' ? 'pcs' : 'kg';
        const existing = combined.find(c =>
          c.itemName.trim().toLowerCase() === item.itemName.trim().toLowerCase() &&
          (c.dispatchUnit === 'pcs' ? 'pcs' : 'kg') === unit);
        if (existing) {
          existing.quantity += item.quantity;
          if (item.originalPcs != null) existing.originalPcs = (existing.originalPcs ?? 0) + item.originalPcs;
        } else {
          combined.push({ ...item });
        }
      }
    }

    const [primary, ...others] = group;

    // BUG FIX: every order in this merge group may carry its own Hosur
    // shop-order tag (HOSUR_ORDER_ID:<id>, written by HosurShopOrderPanel/
    // HosurDashboard when the shop order was placed). The old code below
    // deletes every order in `others`, keeping only `primary`'s row and its
    // single tag — so as soon as 2+ Hosur shop orders were merged together
    // in one "Send Merged Order to Store" action, every shop except the
    // primary one permanently lost its HOSUR_ORDER_ID tag. submitDispatch's
    // Hosur-sync block (further below) can then never find those shops
    // again, so their hosur_orders row stays stuck at 'draft' forever even
    // though the item was actually produced and dispatched — exactly the
    // "dispatch doesn't reflect in the Hosur Dispatch tab" bug. Fix: collect
    // every contributing order's tag (old singular or already-merged
    // plural form) and write them all back as one HOSUR_ORDER_IDS:id1,id2
    // tag on the surviving primary row.
    const collectHosurIds = (notes: string | undefined | null): string[] => {
      const text = notes ?? '';
      const plural = text.match(/HOSUR_ORDER_IDS:([^|]+)/);
      if (plural?.[1]) return plural[1].split(',').map(s => s.trim()).filter(Boolean);
      const singular = text.match(/HOSUR_ORDER_ID:([^|]+)/);
      return singular?.[1] ? [singular[1].trim()] : [];
    };
    const hosurIds = Array.from(new Set(group.flatMap(o => collectHosurIds(o.notes))));
    // Planned-stock batches (Planning tab, target_branch null) need the same
    // tag preserved across a merge, or they'd silently fall out of the
    // "Planned" bucket in Merged Summary / Production Entry / Dispatch.
    const anyPlanned = group.some(o => isPlannedOrder(o));
    const mergedNotes = hosurIds.length > 0
      ? `HOSUR_ORDER_IDS:${hosurIds.join(',')}`
      : anyPlanned
        ? (primary.notes?.includes(PLANNED_STOCK_TAG) ? primary.notes : PLANNED_STOCK_TAG)
        : (primary.notes ?? null);

    const { error: updateError } = await supabase
      .from('bakery_orders')
      .update({ items: combined, status: 'accepted', notes: mergedNotes })
      .eq('id', primary.id);
    if (updateError) throw new Error('Failed to merge orders for Store — please try again.');

    if (others.length > 0) {
      const { error: deleteError } = await supabase
        .from('bakery_orders')
        .delete()
        .in('id', others.map(o => o.id));
      if (deleteError) throw new Error('Merged order saved, but the old separate entries could not be cleaned up.');
    }

    set(s => ({
      orders: s.orders
        .filter(o => !others.some(x => x.id === o.id))
        .map(o => o.id === primary.id ? { ...o, items: combined, status: 'accepted' as WorkflowStatus, notes: mergedNotes ?? undefined } : o),
    }));
  },

  updateExpectedOutput: async (orderId, qty) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ expected_output: qty, materials_calculated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw new Error('Failed to save — please try again.');
    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, expectedOutput: qty, materialsCalculatedAt: new Date().toISOString() } : o
      ),
    }));
  },

  // Store confirms it has deducted raw-material stock against the Planner's
  // merged order — replaces the old "send to production" step.
  confirmStock: async (orderId) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('bakery_orders')
      .update({ status: 'store_confirmed', store_confirmed_at: now })
      .eq('id', orderId);
    if (error) throw new Error('Failed to confirm stock — please try again.');
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'store_confirmed', storeConfirmedAt: now } : o),
    }));
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      const order = get().orders.find(o => o.id === orderId);
      void useActivityLogStore.getState().log({
        staffId: user.id, staffName: user.displayName, role: user.role,
        action: 'Confirmed Stock', detail: `Order #${order?.orderNumber} — stock deducted by Store`,
        branch: order?.targetBranch,
      });
    }
  },

  // Planner enters the actual produced quantity per item, next to the order.
  // Replaces the old baker "submitPrepared"/staging flow.
  confirmStockSelected: async (orderId, selectedIndexes, sentBy) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order was not found — please refresh.');
    const selectedSet = new Set(selectedIndexes);
    const selectedItems = order.items.filter((_, i) => selectedSet.has(i));
    const remainingItems = order.items.filter((_, i) => !selectedSet.has(i));
    if (selectedItems.length === 0) return;

    // Nothing left behind — same as confirming the whole order.
    if (remainingItems.length === 0) {
      await get().confirmStock(orderId);
      return;
    }

    const now = new Date().toISOString();
    // BUG FIX: this used to overwrite notes with a plain "Store batch from
    // order #N" string, discarding any HOSUR_ORDER_ID(S) tag the original
    // order carried. That silently broke the Hosur dispatch-tab sync for
    // any Hosur shop order that Store only partially confirmed (a very
    // common case — Store rarely has every ingredient for every item at
    // once). Carry the tag forward so submitDispatch can still find it.
    const hosurTagMatch = String(order.notes ?? '').match(/HOSUR_ORDER_IDS?:[^|]+/);
    const tagPrefix = hosurTagMatch ? `${hosurTagMatch[0]}|` : isPlannedOrder(order) ? `${PLANNED_STOCK_TAG}|` : '';
    const carriedNotes = `${tagPrefix}Store batch from order #${order.orderNumber}`;
    const { data, error: insertError } = await supabase
      .from('bakery_orders')
      .insert({
        items: selectedItems,
        status: 'store_confirmed',
        created_by: order.createdBy,
        target_branch: order.targetBranch,
        notes: carriedNotes,
        store_confirmed_at: now,
        store_source_order_number: order.orderNumber,
      })
      .select()
      .single();
    if (insertError || !data) throw new Error('Failed to send selected items — please try again.');
    const sentOrder = rowToOrder(data as Record<string, unknown>);

    const { error: updateError } = await supabase
      .from('bakery_orders')
      .update({ items: remainingItems })
      .eq('id', orderId);
    if (updateError) throw new Error('Items were sent, but the remaining order could not be updated — please refresh.');

    set(s => ({
      orders: [sentOrder, ...s.orders.map(o => o.id === orderId ? { ...o, items: remainingItems } : o)],
    }));

    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId: user.id, staffName: user.displayName, role: user.role,
        action: 'Confirmed Stock (Partial)',
        detail: `Order #${order.orderNumber} — ${selectedItems.length} item(s) sent as Order #${sentOrder.orderNumber}, ${remainingItems.length} left in Orders`,
        branch: order.targetBranch,
      });
    }
    void sentBy;
  },

  recordProduction: async (orderId, producedItems) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ produced_items: producedItems, status: 'produced' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, producedItems, status: 'produced' } : o),
    }));

    const order = get().orders.find(o => o.id === orderId);
    if (order) {
      const { kgToPcs } = await import('./itemMatcher');
      const shortages = order.items
        .map(item => {
          const prod = producedItems.find(p => p.itemId === item.itemId);
          const isPcs = item.dispatchUnit === 'pcs';
          const requested = isPcs && item.originalPcs != null ? item.originalPcs : item.quantity;
          const prodKg = prod?.quantityPrepared ?? 0;
          const produced = isPcs && item.weightGrams != null
            ? (kgToPcs(prodKg, item.weightGrams) ?? prodKg)
            : prodKg;
          return { itemName: item.itemName, requested, prepared: produced, unit: isPcs ? 'pcs' : 'kg' };
        })
        .filter(x => x.prepared < x.requested - 0.001);
      if (shortages.length > 0) {
        void useNotificationStore.getState().pushBakerShortage(orderId, String(order.orderNumber), shortages);
      }
      const { useAuthStore } = await import('@/stores/authStore');
      const user = useAuthStore.getState().currentUser;
      if (user) {
        const { useActivityLogStore } = await import('./activityLogStore');
        void useActivityLogStore.getState().log({
          staffId: user.id, staffName: user.displayName, role: user.role,
          action: 'Recorded Production', detail: `Order #${order.orderNumber} — ${producedItems.length} item(s) produced`,
          branch: order.targetBranch,
        });
      }
    }
  },

  // Auto-calculated (proportional to each branch's original order share) by
  // default in the UI; this just persists whatever split the planner confirms,
  // whether auto or manually overridden.
  setDispatchSplit: async (orderId, split) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_split: split })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, dispatchSplit: split } : o),
    }));
  },

  markDone: async (orderId) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ leftover_status: 'done' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, leftoverStatus: 'done' } : o),
    }));
  },


  submitDispatch: async (orderId, entry) => {
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };

    // Fetch fresh order from DB — includes order_number for notifications.
    // BUG #3 FIX: fetching from DB avoids stale React state in the dispatch log.
    const { data: freshOrder, error: fetchErr } = await supabase
      .from('bakery_orders')
      .select('dispatch_log, produced_items, order_number, items, notes, target_branch')
      .eq('id', orderId)
      .single();
    if (fetchErr || !freshOrder) {
      throw new Error(fetchErr?.message || 'Dispatch failed because the bakery order could not be loaded.');
    }

    const existingLog: DispatchEntry[] = (freshOrder.dispatch_log as DispatchEntry[]) || [];
    // FIX (MD Bug #18): check if this entry was already appended (idempotency guard for retries).
    // The root race condition (two different devices dispatching different items of the same order
    // concurrently) still exists at the DB level — the proper fix is a server-side RPC using
    // jsonb_array_append in a single atomic UPDATE. This guard at minimum prevents double-appending
    // on retries within a single session.
    // Server-side RPC appends the dispatch entry atomically so concurrent packers do not overwrite each other.
    const alreadyAppended = existingLog.some(e => e.id === newEntry.id);
    const updatedLog: DispatchEntry[] = alreadyAppended
      ? existingLog
      : [...existingLog, newEntry];

    // Only mark 'dispatched' when every prepared item is fully covered by the log.
    // FIX B7: for pcs items, compare totalDispatched (pcs) against flooredPcs
    // (Math.floor of kg→pcs conversion), NOT against raw quantityPrepared (kg).
    // Without this, 7 pcs dispatched from 1.5 kg never satisfies "7 >= 1.5" → stuck forever.
    const preparedItems = (freshOrder.produced_items as PreparedItem[]) || [];

    // Reuse the single fresh-order query for item metadata and notifications.
    const fullOrderData = freshOrder;
    const orderItems = (freshOrder.items as import('./types').BakeryOrderItem[]) ?? [];
    const { kgToPcs } = await import('./itemMatcher');

    const allFullyDispatched = preparedItems.length > 0 && preparedItems.every(p => {
      const orderItem = orderItems.find(oi => oi.itemName === p.itemName);
      const isPcs     = orderItem?.dispatchUnit === 'pcs';
      const totalDispatched = updatedLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      if (isPcs && orderItem?.weightGrams != null) {
        // For pcs items: max dispatchable = floor(kg → pcs). 
        // If totalDispatched (pcs) >= that floor, item is done — even if grams remain.
        const flooredPcs = kgToPcs(p.quantityPrepared, orderItem.weightGrams) ?? 0;
        return totalDispatched >= flooredPcs;
      }
      // kg items: standard comparison
      return totalDispatched >= p.quantityPrepared - 0.001;
    });
    // BUG FIX: `allFullyDispatched` only looks at items the baker has already sent
    // (prepared_items) — it says nothing about whether the baker still has items
    // left to prepare. Without this check, dispatching the *partial* batch that
    // was sent so far would prematurely stamp the whole order 'dispatched', even
    // though other items are still sitting unprepared with the baker. That made
    // the order vanish from the Baker's Orders tab with those items unreachable.
    // Only allow 'packed'/'dispatched' once every item on the order has actually
    // been sent to packing at least once; otherwise stay 'partially_packed' so
    // the order (and its still-pending items) remains visible to the baker.
    const isOrderFullyPrepared = orderItems.length > 0 &&
      orderItems.every(oi => preparedItems.some(p => p.itemId === oi.itemId));
    const newStatus: WorkflowStatus = allFullyDispatched && isOrderFullyPrepared ? 'dispatched' : 'produced';

    const { error } = await supabase.rpc('append_bakery_dispatch_log', {
      p_order_id: orderId,
      p_entry: newEntry,
      p_status: newStatus,
    });
    if (error) {
      throw new Error(error.message || 'Dispatch failed while saving the dispatch log.');
    }

    // Keep the Hosur shop-order record(s) behind the bakery workflow. It
    // becomes visible in the Hosur "Dispatch" sub-tab only after Packing has
    // actually dispatched it.
    //
    // BUG FIX: a bakery_orders row dispatched here can represent MORE than
    // one original Hosur shop order — mergeOrdersForStore now writes a
    // plural HOSUR_ORDER_IDS:id1,id2,... tag when several shops' pending
    // orders were combined into one production batch (previously only a
    // single shop's tag survived that merge, silently orphaning every other
    // shop at 'draft' forever). Support both the plural tag and the
    // original singular HOSUR_ORDER_ID:<id> tag for orders that were never
    // merged with anything else.
    const hosurIdsMatch = String(freshOrder.notes ?? '').match(/HOSUR_ORDER_IDS?:([^|]+)/);
    const hosurOrderIds = hosurIdsMatch?.[1]
      ? hosurIdsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (entry.branch === 'Hosur' && hosurOrderIds.length > 0) {
      const itemDispatchTotal = updatedLog
        .filter(d => d.branch === 'Hosur' && d.itemName === entry.itemName)
        .reduce((sum, d) => sum + Number(d.quantity || 0), 0);

      // Split this item's total dispatched quantity across every
      // contributing shop, weighted by that shop's own originally-ordered
      // quantity — same proportional-split idea used for VRSNB/SNB
      // (autoSplitForItem), so a merged multi-shop batch still attributes
      // dispatch correctly to each shop instead of dumping it all on one.
      const { data: itemRows, error: itemRowsError } = await supabase
        .from('hosur_order_items')
        .select('order_id, quantity')
        .in('order_id', hosurOrderIds)
        .eq('item_name', entry.itemName);
      if (itemRowsError) throw new Error(`Hosur dispatch sync failed: ${itemRowsError.message}`);
      const rows = itemRows ?? [];
      const totalRequested = rows.reduce((s, r) => s + Number(r.quantity || 0), 0) || 1;

      for (const row of rows) {
        const share = Math.round(itemDispatchTotal * (Number(row.quantity || 0) / totalRequested) * 100) / 100;
        const { error: hosurItemError } = await supabase
          .from('hosur_order_items')
          .update({ dispatched_quantity: share })
          .eq('order_id', row.order_id as string)
          .eq('item_name', entry.itemName);
        if (hosurItemError) throw new Error(`Hosur dispatch sync failed: ${hosurItemError.message}`);
      }

      // Each shop's hosur_orders row only flips to 'dispatched' once every
      // ONE of its own items is fully covered — not just the item that was
      // just dispatched (a merged batch's other items may still be pending).
      for (const hosurOrderId of hosurOrderIds) {
        const { data: allItems, error: allItemsError } = await supabase
          .from('hosur_order_items')
          .select('quantity, dispatched_quantity')
          .eq('order_id', hosurOrderId);
        if (allItemsError) throw new Error(`Hosur order status sync failed: ${allItemsError.message}`);
        const fullyDone = (allItems ?? []).length > 0 &&
          (allItems ?? []).every(r => Number(r.dispatched_quantity || 0) >= Number(r.quantity || 0) - 0.01);
        const { error: hosurOrderError } = await supabase
          .from('hosur_orders')
          .update({ status: fullyDone ? 'dispatched' : 'pending_packing' })
          .eq('id', hosurOrderId);
        if (hosurOrderError) throw new Error(`Hosur order status sync failed: ${hosurOrderError.message}`);
      }
    }

    // ── DISCREPANCY CHECK: collect ALL items' discrepancies each time we dispatch ──
    // Strategy: always pass the full list of discrepant items to pushPackingDiscrepancy
    // on every dispatch call. pushPackingDiscrepancy now upserts (merges) rather than
    // deduping, so repeated calls safely update the single notification row for this order.
    // This ensures that even if Item A dispatches first and Item B dispatches second,
    // both discrepancies end up in the same notification record.
    //
    // NOTE: orderItems and kgToPcs already fetched above in the allFullyDispatched block.

    const discrepancies: { itemName: string; dispatched: number; requested: number; unit: string }[] = [];

    for (const p of preparedItems) {
      const orderItem  = orderItems.find(oi => oi.itemName === p.itemName);
      const isPcs      = orderItem?.dispatchUnit === 'pcs';

      // requested = what the RECEIVER ordered (in pcs or kg)
      const requested = isPcs && orderItem?.originalPcs != null
        ? orderItem.originalPcs
        : orderItem?.quantity ?? p.quantityPrepared;

      // totalDispatched is always in the dispatch unit (pcs or kg)
      const totalDispatched = updatedLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);

      // prepared = baker's output converted to dispatch unit for comparison
      const preparedInUnit = isPcs && orderItem?.weightGrams != null
        ? (kgToPcs(p.quantityPrepared, orderItem.weightGrams) ?? p.quantityPrepared)
        : p.quantityPrepared;

      // Only include items that have been touched by at least one dispatch entry
      // (avoids flagging items the packer hasn't dispatched yet as "0 dispatched")
      const hasBeenDispatched = updatedLog.some(d => d.itemName === p.itemName);
      if (!hasBeenDispatched) continue;

      const isExactVsRequested = Math.abs(totalDispatched - requested) <= 0.001;
      if (!isExactVsRequested) {
        discrepancies.push({ itemName: p.itemName, dispatched: totalDispatched, requested, unit: isPcs ? 'pcs' : 'kg' });
      }
    }

    if (discrepancies.length > 0) {
      const orderNumber = (freshOrder.order_number as number | string) ?? orderId;
      const { useNotificationStore } = await import('./notificationStore');
      void useNotificationStore.getState().pushPackingDiscrepancy(
        orderId, String(orderNumber), entry.branch, discrepancies,
      );
    }
    // ─────────────────────────────────────────────────────────────────────

    // FIX B8: Calculate and notify remainder grams for pcs items.
    // When baker sends 1.5 kg of a 200g item → 7 pcs dispatched, 100g leftover.
    // These grams cannot form a whole piece, so they stay at the bakery.
    // Admin must know about them so they can track waste / partial batches.
    if (allFullyDispatched) {
      const remainderItems: { itemName: string; remainderKg: number; dispatchedPcs: number; preparedKg: number }[] = [];
      for (const p of preparedItems) {
        const orderItem = orderItems.find(oi => oi.itemName === p.itemName);
        if (orderItem?.dispatchUnit !== 'pcs' || !orderItem.weightGrams) continue;
        const flooredPcs   = kgToPcs(p.quantityPrepared, orderItem.weightGrams) ?? 0;
        const usedKg       = (flooredPcs * orderItem.weightGrams) / 1000;
        const remainderKg  = Math.round((p.quantityPrepared - usedKg) * 1000) / 1000;
        if (remainderKg > 0.001) { // more than 1g remainder
          remainderItems.push({
            itemName:     p.itemName,
            remainderKg,
            dispatchedPcs: flooredPcs,
            preparedKg:   p.quantityPrepared,
          });
        }
      }
      if (remainderItems.length > 0) {
        const orderNumber = (fullOrderData?.order_number as number | string) ?? orderId;
        const { useNotificationStore } = await import('./notificationStore');
        void useNotificationStore.getState().pushPackingRemainder(
          orderId, String(orderNumber), entry.branch, remainderItems,
        );
      }
    }

    // DISPATCH-FIX: Don't rely on onConflict:'dispatch_id' — that requires a unique
    // constraint in the DB which may not exist, causing the upsert to silently fail.
    // Instead: check if a row with this dispatch_id already exists, insert only if not.
    const { data: existingRow } = await supabase
      .from('branch_incoming')
      .select('id')
      .eq('dispatch_id', newEntry.id)
      .maybeSingle();

    if (!existingRow) {
      const { error: incomingErr } = await supabase.from('branch_incoming').insert({
        dispatch_id:   newEntry.id,
        branch:        newEntry.branch,
        item_name:     newEntry.itemName,
        quantity:      parseFloat(String(newEntry.quantity)),
        unit:          newEntry.unit ?? 'kg',
        received_at:   newEntry.dispatchedAt,
        dispatched_by: newEntry.dispatchedBy,
        confirmed:     false,
      });
      if (incomingErr) {
        console.error('[submitDispatch] branch_incoming write failed:', incomingErr);
        throw new Error(incomingErr.message || 'Dispatch failed while creating branch incoming stock.');
      }
    }

    // H-01 FIX: use computed newStatus instead of hardcoding 'dispatched'.
    // Partial dispatch correctly shows as 'packed'; only full dispatch becomes 'dispatched'.
    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, dispatchLog: updatedLog, status: newStatus } : o
      ),
    }));

    // Activity log
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    const dispatchedOrder = get().orders.find(o => o.id === orderId);
    if (user && dispatchedOrder) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId:   user.id,
        staffName: user.displayName,
        role:      user.role,
        action:    'Dispatched Items',
        detail:    `Order #${dispatchedOrder.orderNumber} → ${entry.branch}: ${entry.quantity} ${entry.unit ?? 'kg'} of ${entry.itemName}`,
        branch:    entry.branch,
      });
    }
    if (newStatus === 'dispatched' && fullOrderData?.notes) {
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const by = user?.displayName || user?.username || 'Packing';
      const orderNo = (fullOrderData.notes as string).split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'dispatched', by);
    }
  },

  deleteDispatchEntry: async (orderId, entryId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const removedEntry = (order.dispatchLog || []).find(d => d.id === entryId);
    const updatedLog = (order.dispatchLog || []).filter(d => d.id !== entryId);
    // BUG #6 FIX: don't use log.length to decide status — check actual coverage.
    // If remaining dispatches still fully cover all prepared items → dispatched.
    // Otherwise (or if log is empty) → back to 'packed' so packing can continue.
    const preparedItems = order.producedItems || [];
    const allStillCovered = updatedLog.length > 0 && preparedItems.length > 0 && preparedItems.every(p => {
      const orderItem = order.items.find(i => i.itemName === p.itemName);
      const totalDispatched = updatedLog
        .filter(d => d.itemName === p.itemName)
        .reduce((sum, d) => sum + d.quantity, 0);
      if (orderItem?.dispatchUnit === 'pcs' && orderItem.weightGrams && orderItem.weightGrams > 0) {
        const requiredPcs = Math.floor((p.quantityPrepared * 1000) / orderItem.weightGrams);
        return totalDispatched >= requiredPcs;
      }
      return totalDispatched >= p.quantityPrepared - 0.001;
    });
    const isOrderFullyPrepared = order.items.length > 0 &&
      order.items.every(oi => preparedItems.some(p => p.itemId === oi.itemId));
    const newStatus: WorkflowStatus = allStillCovered && isOrderFullyPrepared ? 'dispatched' : 'produced';

    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus, leftover_status: 'pending' })
      .eq('id', orderId);
    if (error) return;

    if (removedEntry) {
      // M-02 FIX: always call decrement_branch_stock regardless of whether the row exists.
      // The old guard `if (existingStock)` skipped rollback when the row was missing, leaving
      // incorrect stock totals. The RPC handles missing rows gracefully (no-op or creates at 0).
      await supabase.rpc('decrement_branch_stock', {
        p_branch:    removedEntry.branch,
        p_item_name: removedEntry.itemName,
        p_qty:       removedEntry.quantity,
      });

      await supabase.from('branch_incoming')
        .delete()
        .eq('dispatch_id', entryId);
    }

    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, dispatchLog: updatedLog, status: newStatus } : o
      ),
    }));
  },

  // Realtime subscription — any INSERT/UPDATE to bakery_orders triggers immediate re-fetch.
  // Returns an unsubscribe fn — call on unmount to avoid duplicate channels.
  subscribe: () => makeSingletonSubscriber('bakery-orders-live-all', (ch) =>
    ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'bakery_orders',
    },
      (payload) => {
        const event = payload as { eventType?: string; new?: Record<string, unknown>; old?: { id?: string } };
        const id = String(event.new?.id ?? event.old?.id ?? '');
        if (!id) return;
        if (event.eventType === 'DELETE') {
          set((state) => ({ orders: state.orders.filter((order) => order.id !== id) }));
          return;
        }
        const changed = rowToOrder(event.new ?? {});
        set((state) => ({
          orders: [changed, ...state.orders.filter((order) => order.id !== id)]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        }));
      }),
  )(),
}));
