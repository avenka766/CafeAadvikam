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
    set(s => ({ orders: [rowToOrder(data as Record<string, unknown>), ...s.orders] }));
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
      const shortages = order.items
        .map(item => {
          const prep = preparedItems.find(p => p.itemId === item.itemId);
          return {
            itemName:  item.itemName,
            requested: item.quantity,
            prepared:  prep?.quantityPrepared ?? 0,
            unit:      item.dispatchUnit ?? 'kg',
          };
        })
        .filter(x => x.prepared < x.requested - 0.001);
      if (shortages.length > 0) {
        // Fire-and-forget — notification failure must not block the baker workflow
        void useNotificationStore.getState()
          .pushBakerShortage(orderId, String(order.orderNumber), shortages);
      }
    }
  },

  submitDispatch: async (orderId, entry) => {
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };

    // BUG #3 FIX: fetch full order (not just dispatch_log) so we can check
    // prepared_items to determine if this is truly a full dispatch.
    const { data: freshOrder, error: fetchErr } = await supabase
      .from('bakery_orders')
      .select('dispatch_log, prepared_items')
      .eq('id', orderId)
      .single();
    if (fetchErr || !freshOrder) return;

    const updatedLog: DispatchEntry[] = [
      ...((freshOrder.dispatch_log as DispatchEntry[]) || []),
      newEntry,
    ];

    // Only mark 'dispatched' when every prepared item is fully covered by the log.
    const preparedItems = (freshOrder.prepared_items as PreparedItem[]) || [];
    const allFullyDispatched = preparedItems.length > 0 && preparedItems.every(p => {
      const totalDispatched = updatedLog
        .filter(d => d.itemName === p.itemName)
        .reduce((s, d) => s + d.quantity, 0);
      return totalDispatched >= p.quantityPrepared - 0.001;
    });
    const newStatus: WorkflowStatus = allFullyDispatched ? 'dispatched' : 'packed';

    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus })
      .eq('id', orderId);
    if (error) return;

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

    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, dispatchLog: updatedLog, status: 'dispatched' } : o
      ),
    }));
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
      const { data: existingStock } = await supabase
        .from('branch_stock')
        .select('quantity')
        .eq('branch', removedEntry.branch)
        .eq('item_name', removedEntry.itemName)
        .maybeSingle();

      if (existingStock) {
        await supabase.rpc('decrement_branch_stock', {
          p_branch:    removedEntry.branch,
          p_item_name: removedEntry.itemName,
          p_qty:       removedEntry.quantity,
        });
      }

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
