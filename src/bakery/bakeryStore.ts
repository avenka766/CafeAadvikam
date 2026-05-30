import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, DispatchEntry, WorkflowStatus, Branch } from './types';
import { useNotificationStore } from './notificationStore'; // BUG #16 FIX: needed to fire baker shortage notifications

interface BakeryState {
  orders: BakeryOrder[];
  loading: boolean;
  // FIX: added `silent` param — background polls pass true so loading stays false,
  // preventing the StoreDashboard list from unmounting and resetting card state.
  fetchOrders: (silent?: boolean) => Promise<void>;
  submitOrder: (items: BakeryOrderItem[], createdBy: string, targetBranch: Branch) => Promise<void>;
  updateExpectedOutput: (orderId: string, qty: number) => Promise<void>;
  sendToBaker: (orderId: string) => Promise<void>;
  submitPrepared: (orderId: string, preparedItems: PreparedItem[]) => Promise<void>;
  submitDispatch: (orderId: string, entry: Omit<DispatchEntry, 'id'>) => Promise<void>;
  deleteDispatchEntry: (orderId: string, entryId: string) => Promise<void>;
}

function rowToOrder(d: Record<string, unknown>): BakeryOrder {
  return {
    id: d.id as string,
    orderNumber: d.order_number as number,
    items: (d.items as BakeryOrderItem[]) || [],
    status: d.status as WorkflowStatus,
    createdBy: d.created_by as string,
    createdAt: d.created_at as string,
    expectedOutput: d.expected_output as number | undefined,
    materialsCalculatedAt: d.materials_calculated_at as string | undefined,
    preparedItems: (d.prepared_items as PreparedItem[]) || [],
    sentToPackingAt: d.sent_to_packing_at as string | undefined,
    dispatchLog: (d.dispatch_log as DispatchEntry[]) || [],
    targetBranch: d.target_branch as Branch | undefined,
    notes: d.notes as string | undefined, // U-14 FIX
  };
}

export const useBakeryStore = create<BakeryState>((set, get) => ({
  orders: [],
  loading: false,

  // FIX: `silent=true` skips setting loading:true so background 15s polls
  // don't cause the StoreDashboard list to flash/unmount and lose local state.
  fetchOrders: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('bakery_orders')
        .select('*')
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

  submitOrder: async (items, createdBy, targetBranch) => {
    const { data, error } = await supabase
      .from('bakery_orders')
      .insert({ items, status: 'pending', created_by: createdBy, target_branch: targetBranch })
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

  sendToBaker: async (orderId) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ status: 'baking' })
      .eq('id', orderId);
    if (error) throw error;
    set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'baking' } : o) }));
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

  submitDispatch: async (orderId, entry) => {
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };

    // Fetch fresh order from DB — includes order_number for notifications.
    // BUG #3 FIX: fetching from DB avoids stale React state in the dispatch log.
    const { data: freshOrder, error: fetchErr } = await supabase
      .from('bakery_orders')
      .select('dispatch_log, prepared_items, order_number')
      .eq('id', orderId)
      .single();
    if (fetchErr || !freshOrder) return;

    const updatedLog: DispatchEntry[] = [
      ...((freshOrder.dispatch_log as DispatchEntry[]) || []),
      newEntry,
    ];

    // Only mark 'dispatched' when every prepared item is fully covered by the log.
    // FIX B7: for pcs items, compare totalDispatched (pcs) against flooredPcs
    // (Math.floor of kg→pcs conversion), NOT against raw quantityPrepared (kg).
    // Without this, 7 pcs dispatched from 1.5 kg never satisfies "7 >= 1.5" → stuck forever.
    const preparedItems = (freshOrder.prepared_items as PreparedItem[]) || [];

    // We need order items for weightGrams/dispatchUnit — fetch lazily; reused below too.
    const { data: fullOrderData } = await supabase
      .from('bakery_orders')
      .select('items, order_number')
      .eq('id', orderId)
      .single();
    const orderItems = (fullOrderData?.items as import('./types').BakeryOrderItem[]) ?? [];
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
    const newStatus: WorkflowStatus = allFullyDispatched ? 'dispatched' : 'packed';

    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus })
      .eq('id', orderId);
    if (error) return;

    // ── DISCREPANCY-FIX (B2+B3+B4+B6): check with receiver's original request ──
    // Root causes fixed:
    //  B2/B4: was using p.quantityPrepared (baker's kg) as "requested".
    //         Must use originalPcs for pcs items (what receiver actually ordered).
    //  B3:    multi-dispatch: alert fires per-item when that item is fully covered,
    //         so partial batches (8 pcs + 1 pcs later) both get checked independently.
    //  B6:    alert also fires when allFullyDispatched so permanent shortfalls surface.
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

      const isItemFullyCovered = totalDispatched >= preparedInUnit - 0.001;
      const isExactVsRequested = Math.abs(totalDispatched - requested) <= 0.001;

      // Fire alert for THIS item if:
      //  (a) it's now fully dispatched (covers all prepared) AND differs from requested, OR
      //  (b) the whole order just finished and this item is still short
      if (p.itemName === entry.itemName && isItemFullyCovered && !isExactVsRequested) {
        discrepancies.push({ itemName: p.itemName, dispatched: totalDispatched, requested, unit: isPcs ? 'pcs' : 'kg' });
      } else if (allFullyDispatched && !isExactVsRequested) {
        // Catch all remaining discrepancies when order completes
        discrepancies.push({ itemName: p.itemName, dispatched: totalDispatched, requested, unit: isPcs ? 'pcs' : 'kg' });
      }
    }
    // Deduplicate (allFullyDispatched path may add same item twice)
    const seen = new Set<string>();
    const uniqueDiscrepancies = discrepancies.filter(d => { if (seen.has(d.itemName)) return false; seen.add(d.itemName); return true; });

    if (uniqueDiscrepancies.length > 0) {
      const orderNumber = (freshOrder.order_number as number | string) ?? orderId;
      const { useNotificationStore } = await import('./notificationStore');
      void useNotificationStore.getState().pushPackingDiscrepancy(
        orderId, String(orderNumber), entry.branch, uniqueDiscrepancies,
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

    const { error: incomingErr } = await supabase.from('branch_incoming').upsert({
      dispatch_id:   newEntry.id,
      branch:        newEntry.branch,
      item_name:     newEntry.itemName,
      quantity:      parseFloat(String(newEntry.quantity)),
      unit:          newEntry.unit ?? 'kg',
      received_at:   newEntry.dispatchedAt,
      dispatched_by: newEntry.dispatchedBy,
      confirmed:     false,
    }, { onConflict: 'dispatch_id' });
    if (incomingErr) {
      console.error('[submitDispatch] branch_incoming write failed:', incomingErr);
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
      const totalDispatched = updatedLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      return totalDispatched >= p.quantityPrepared - 0.001;
    });
    const newStatus: WorkflowStatus = allStillCovered ? 'dispatched' : 'packed';

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
}));
