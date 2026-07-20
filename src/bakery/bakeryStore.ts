import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, DispatchEntry, WorkflowStatus, Branch } from './types';
import { useNotificationStore } from './notificationStore'; // BUG #16 FIX: needed to fire baker shortage notifications

interface BakeryState {
  orders: BakeryOrder[];
  loading: boolean;
  // FIX: added `silent` param — background polls pass true so loading stays false,
  // preventing the StoreDashboard list from unmounting and resetting card state.
  fetchOrders: (silent?: boolean) => Promise<void>;
  submitOrder: (items: BakeryOrderItem[], createdBy: string, targetBranch: Branch, notes?: string) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  updateExpectedOutput: (orderId: string, qty: number) => Promise<void>;
  sendToBaker: (orderId: string, selectedIndexes: number[], requestId: string) => Promise<{ sentOrderNumber: number; remainingCount: number }>;
  submitPrepared: (orderId: string, preparedItems: PreparedItem[]) => Promise<void>;
  addStagedItem: (orderId: string, item: PreparedItem) => Promise<void>;
  removeStagedItem: (orderId: string, itemId: string) => Promise<void>;
  sendStagedToPacking: (orderId: string) => Promise<void>;
  submitDispatch: (orderId: string, entry: Omit<DispatchEntry, 'id'>) => Promise<void>;
  deleteDispatchEntry: (orderId: string, entryId: string) => Promise<void>;
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
    stagedItems: (d.staged_items as PreparedItem[]) || [],
    sentToPackingAt: d.sent_to_packing_at as string | undefined,
    dispatchLog: (d.dispatch_log as DispatchEntry[]) || [],
    targetBranch: d.target_branch as Branch | undefined,
    storeSourceOrderNumber: d.store_source_order_number as number | undefined,
    storeSendRequestId: d.store_send_request_id as string | undefined,
    notes: d.notes as string | undefined, // U-14 FIX
  };
}

const BAKERY_ORDER_COLUMNS = 'id, order_number, items, status, created_by, created_at, expected_output, materials_calculated_at, prepared_items, staged_items, sent_to_packing_at, dispatch_log, target_branch, store_source_order_number, store_send_request_id, notes';

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
  fetchOrders: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      const { data, error } = await supabase
        .from('bakery_orders')
        .select(BAKERY_ORDER_COLUMNS)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });
      if (!error && data) {
        set({ orders: data.map(d => rowToOrder(d as Record<string, unknown>)) });
      }
    } catch (e) {
      console.error('fetchOrders error:', e);
    } finally {
      if (!silent) set({ loading: false });
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

  acceptOrder: async (orderId) => {
    const order = get().orders.find(o => o.id === orderId);
    const { error } = await supabase
      .from('bakery_orders')
      .update({ status: 'processing' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'processing' } : o) }));
    if (order?.notes) {
      const { useAuthStore } = await import('@/stores/authStore');
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const user = useAuthStore.getState().currentUser;
      const acceptedBy = user?.displayName || user?.username || 'Store';
      const orderNo = order.notes.split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'store', acceptedBy);
    }
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

  sendToBaker: async (orderId, selectedIndexes, requestId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) throw new Error('The Store order is no longer available.');
    const user = (await import('@/stores/authStore')).useAuthStore.getState().currentUser;
    const actor = user?.displayName || user?.username || 'Store';
    const { data, error } = await supabase.rpc('send_selected_bakery_items_to_baker', {
      p_order_id: orderId,
      p_selected_indexes: selectedIndexes,
      p_request_id: requestId,
      p_actor: actor,
    });
    if (error) throw error;
    const result = data as { sentOrderNumber?: number; remainingCount?: number } | null;
    if (!result?.sentOrderNumber) throw new Error('Baker batch was not returned.');
    await get().fetchOrders(true);
    if (order?.notes) {
      const { useAuthStore } = await import('@/stores/authStore');
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const user = useAuthStore.getState().currentUser;
      const acceptedBy = user?.displayName || user?.username || 'Store';
      const orderNo = order.notes.split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'baking', acceptedBy);
    }
    if (order?.targetBranch === 'VRSNB') {
      const { useAuthStore } = await import('@/stores/authStore');
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const user = useAuthStore.getState().currentUser;
      const acceptedBy = user?.displayName || user?.username || 'Store';
      const acceptedAt = new Date().toLocaleString('en-IN');
      useBranchOpsStore.getState().addNotification({
        branch: 'VRSNB',
        type: 'Store Confirmation',
        title: 'Store accepted VRSNB advance order',
        details: `Store accepted bakery order #${order.orderNumber} by ${acceptedBy} at ${acceptedAt}. ${order.notes || ''}`,
        raisedBy: acceptedBy,
      });
    }
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId: user.id,
        staffName: user.displayName,
        role: user.role,
        action: 'Sent Selected Items to Baker',
        detail: `Order #${order.orderNumber}: ${selectedIndexes.length} item(s) sent as Baker order #${result.sentOrderNumber}; ${Number(result.remainingCount || 0)} item(s) remain at Store`,
        branch: order.targetBranch,
      });
    }
    return { sentOrderNumber: result.sentOrderNumber, remainingCount: Number(result.remainingCount || 0) };
  },

  submitPrepared: async (orderId, preparedItems) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ prepared_items: preparedItems, sent_to_packing_at: new Date().toISOString(), status: 'packed' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId
          ? { ...o, preparedItems, sentToPackingAt: new Date().toISOString(), status: 'packed' }
          : o
      ),
    }));

    // BUG #16 FIX: pushBakerShortage was defined in notificationStore but never called.
    // Compare each prepared qty against the requested qty and notify admin of any shortfall.
    const order = get().orders.find(o => o.id === orderId);
    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (order?.notes) {
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const by = user?.displayName || user?.username || 'Baker';
      const orderNo = order.notes.split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'packing', by);
    }
    if (order) {
      // FIX B1+B5: compare in the receiver's original unit (pcs or kg).
      // item.quantity is always in kg (even for pcs items after conversion).
      // For pcs items we must use originalPcs as "requested" and convert
      // the baker's kg output → pcs so the numbers and units actually match.
      const { kgToPcs } = await import('./itemMatcher');
      const shortages = order.items
        .map(item => {
          const prep   = preparedItems.find(p => p.itemId === item.itemId);
          const isPcs  = item.dispatchUnit === 'pcs';
          // requested: receiver's original entry
          const requested = isPcs && item.originalPcs != null
            ? item.originalPcs
            : item.quantity;
          // prepared: baker always submits in kg; convert to pcs if needed
          const prepKg  = prep?.quantityPrepared ?? 0;
          const prepared = isPcs && item.weightGrams != null
            ? (kgToPcs(prepKg, item.weightGrams) ?? prepKg)
            : prepKg;
          return {
            itemName:  item.itemName,
            requested,
            prepared,
            unit: isPcs ? 'pcs' : 'kg',
          };
        })
        .filter(x => x.prepared < x.requested - 0.001);
      if (shortages.length > 0) {
        // Fire-and-forget — notification failure must not block the baker workflow
        void useNotificationStore.getState()
          .pushBakerShortage(orderId, String(order.orderNumber), shortages);
      }
      // Activity log
      const { useAuthStore } = await import('@/stores/authStore');
      const user = useAuthStore.getState().currentUser;
      if (user) {
        const { useActivityLogStore } = await import('./activityLogStore');
        void useActivityLogStore.getState().log({
          staffId:   user.id,
          staffName: user.displayName,
          role:      user.role,
          action:    'Submitted Prepared Items',
          detail:    `Order #${order.orderNumber} — ${preparedItems.length} item(s) sent to packing`,
          branch:    order.targetBranch,
        });
      }
    }
  },

  // Baker enters a prepared qty for one item and taps "Add" — this is saved
  // immediately (not just held in the browser) so a refresh or the 15s
  // background poll never loses in-progress work. Does NOT touch status or
  // send anything to packing yet.
  addStagedItem: async (orderId, item) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const existing = order.stagedItems ?? [];
    const updated = [...existing.filter(s => s.itemId !== item.itemId), item];
    const { error } = await supabase
      .from('bakery_orders')
      .update({ staged_items: updated })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, stagedItems: updated } : o),
    }));
  },

  // Baker removes an item from the staged (not-yet-sent) table before sending,
  // moving it back to "Pending".
  removeStagedItem: async (orderId, itemId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const updated = (order.stagedItems ?? []).filter(s => s.itemId !== itemId);
    const { error } = await supabase
      .from('bakery_orders')
      .update({ staged_items: updated })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, stagedItems: updated } : o),
    }));
  },

  // Sends whatever is currently staged to Packing. Items not yet staged stay
  // pending on the order — the order only fully leaves "Orders" once every
  // item has been sent across one or more of these batches.
  sendStagedToPacking: async (orderId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const staged = order.stagedItems ?? [];
    if (staged.length === 0) return;

    const existingPrepared = order.preparedItems ?? [];
    const mergedPrepared = [
      ...existingPrepared.filter(p => !staged.some(s => s.itemId === p.itemId)),
      ...staged,
    ];
    const isFullyPrepared = order.items.every(i => mergedPrepared.some(p => p.itemId === i.itemId));
    const newStatus: WorkflowStatus = isFullyPrepared ? 'packed' : 'partially_packed';

    const updatePayload: Record<string, unknown> = {
      prepared_items: mergedPrepared,
      staged_items: [],
      status: newStatus,
    };
    const sentToPackingAt = isFullyPrepared ? new Date().toISOString() : order.sentToPackingAt;
    if (isFullyPrepared) updatePayload.sent_to_packing_at = sentToPackingAt;

    const { error } = await supabase
      .from('bakery_orders')
      .update(updatePayload)
      .eq('id', orderId);
    if (error) throw error;

    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId
          ? { ...o, preparedItems: mergedPrepared, stagedItems: [], status: newStatus, sentToPackingAt }
          : o
      ),
    }));

    if (order.notes) {
      const { useAuthStore } = await import('@/stores/authStore');
      const { useBranchOpsStore } = await import('@/branch/branchOpsStore');
      const user = useAuthStore.getState().currentUser;
      const by = user?.displayName || user?.username || 'Baker';
      const orderNo = order.notes.split('|')[0]?.trim();
      if (orderNo) useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(orderNo, 'packing', by);
    }

    // Only run the shortage check once the order is fully prepared — comparing
    // a partial batch against the full order would falsely flag every
    // not-yet-staged item as a 100% shortage.
    if (isFullyPrepared) {
      const { kgToPcs } = await import('./itemMatcher');
      const shortages = order.items
        .map(item => {
          const prep = mergedPrepared.find(p => p.itemId === item.itemId);
          const isPcs = item.dispatchUnit === 'pcs';
          const requested = isPcs && item.originalPcs != null ? item.originalPcs : item.quantity;
          const prepKg = prep?.quantityPrepared ?? 0;
          const prepared = isPcs && item.weightGrams != null
            ? (kgToPcs(prepKg, item.weightGrams) ?? prepKg)
            : prepKg;
          return { itemName: item.itemName, requested, prepared, unit: isPcs ? 'pcs' : 'kg' };
        })
        .filter(x => x.prepared < x.requested - 0.001);
      if (shortages.length > 0) {
        void useNotificationStore.getState()
          .pushBakerShortage(orderId, String(order.orderNumber), shortages);
      }
    }

    const { useAuthStore } = await import('@/stores/authStore');
    const user = useAuthStore.getState().currentUser;
    if (user) {
      const { useActivityLogStore } = await import('./activityLogStore');
      void useActivityLogStore.getState().log({
        staffId:   user.id,
        staffName: user.displayName,
        role:      user.role,
        action:    'Submitted Prepared Items',
        detail:    `Order #${order.orderNumber} — ${staged.length} item(s) sent to packing${isFullyPrepared ? ' (order complete)' : ' (partial)'}`,
        branch:    order.targetBranch,
      });
    }
  },

  submitDispatch: async (orderId, entry) => {
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };

    // Fetch fresh order from DB — includes order_number for notifications.
    // BUG #3 FIX: fetching from DB avoids stale React state in the dispatch log.
    const { data: freshOrder, error: fetchErr } = await supabase
      .from('bakery_orders')
      .select('dispatch_log, prepared_items, order_number, items, notes, target_branch')
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
    const preparedItems = (freshOrder.prepared_items as PreparedItem[]) || [];

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
    const newStatus: WorkflowStatus = !isOrderFullyPrepared
      ? 'partially_packed'
      : allFullyDispatched ? 'dispatched' : 'packed';

    const { error } = await supabase.rpc('append_bakery_dispatch_log', {
      p_order_id: orderId,
      p_entry: newEntry,
      p_status: newStatus,
    });
    if (error) {
      throw new Error(error.message || 'Dispatch failed while saving the dispatch log.');
    }

    // Keep the Hosur shop-order record behind the bakery workflow. It becomes
    // visible in "Received From Packing" only after Packing has dispatched it.
    const hosurOrderMatch = String(freshOrder.notes ?? '').match(/HOSUR_ORDER_ID:([^|]+)/);
    if (entry.branch === 'Hosur' && hosurOrderMatch?.[1]) {
      const hosurOrderId = hosurOrderMatch[1];
      const itemDispatchTotal = updatedLog
        .filter(d => d.branch === 'Hosur' && d.itemName === entry.itemName)
        .reduce((sum, d) => sum + Number(d.quantity || 0), 0);
      const { error: hosurItemError } = await supabase
        .from('hosur_order_items')
        .update({ dispatched_quantity: itemDispatchTotal })
        .eq('order_id', hosurOrderId)
        .eq('item_name', entry.itemName);
      if (hosurItemError) throw new Error(`Hosur dispatch sync failed: ${hosurItemError.message}`);

      const { error: hosurOrderError } = await supabase
        .from('hosur_orders')
        .update({ status: allFullyDispatched ? 'dispatched' : 'pending_packing' })
        .eq('id', hosurOrderId);
      if (hosurOrderError) throw new Error(`Hosur order status sync failed: ${hosurOrderError.message}`);
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
    const preparedItems = order.preparedItems || [];
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
    const newStatus: WorkflowStatus = !isOrderFullyPrepared
      ? 'partially_packed'
      : allStillCovered ? 'dispatched' : 'packed';

    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus })
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
  subscribe: makeSingletonSubscriber('bakery-orders-live', (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bakery_orders' },
      () => { get().fetchOrders(true); }),
  ),
}));
