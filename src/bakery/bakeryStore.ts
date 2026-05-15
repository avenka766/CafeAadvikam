import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, DispatchEntry, WorkflowStatus, Branch } from './types';

interface BakeryState {
  orders: BakeryOrder[];
  loading: boolean;
  fetchOrders: () => Promise<void>;
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

  fetchOrders: async () => {
    set({ loading: true });
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
      set({ loading: false });
    }
  },

  submitOrder: async (items, createdBy, targetBranch) => {
    const { data, error } = await supabase
      .from('bakery_orders')
      .insert({ items, status: 'pending', created_by: createdBy, target_branch: targetBranch })
      .select()
      .single();
    if (!error && data) {
      set(s => ({ orders: [rowToOrder(data as Record<string, unknown>), ...s.orders] }));
    }
  },

  updateExpectedOutput: async (orderId, qty) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ expected_output: qty, materials_calculated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (!error) {
      set(s => ({
        orders: s.orders.map(o =>
          o.id === orderId ? { ...o, expectedOutput: qty, materialsCalculatedAt: new Date().toISOString() } : o
        ),
      }));
    }
  },

  sendToBaker: async (orderId) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ status: 'baking' })
      .eq('id', orderId);
    if (!error) {
      set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'baking' } : o) }));
    }
  },

  submitPrepared: async (orderId, preparedItems) => {
    const { error } = await supabase
      .from('bakery_orders')
      .update({ prepared_items: preparedItems, sent_to_packing_at: new Date().toISOString(), status: 'packed' })
      .eq('id', orderId);
    if (!error) {
      set(s => ({
        orders: s.orders.map(o =>
          o.id === orderId
            ? { ...o, preparedItems, sentToPackingAt: new Date().toISOString(), status: 'packed' }
            : o
        ),
      }));
    }
  },

  submitDispatch: async (orderId, entry) => {
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };

    // 1. Fetch the LATEST dispatch_log directly from DB to avoid race conditions.
    //    Using local state (get().orders) risks overwriting sibling dispatches that
    //    were written between the last fetchOrders and now.
    const { data: freshOrder, error: fetchErr } = await supabase
      .from('bakery_orders')
      .select('dispatch_log')
      .eq('id', orderId)
      .single();
    if (fetchErr || !freshOrder) return;

    const updatedLog: DispatchEntry[] = [
      ...((freshOrder.dispatch_log as DispatchEntry[]) || []),
      newEntry,
    ];

    // 2. Update bakery_orders dispatch_log
    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: 'dispatched' })
      .eq('id', orderId);
    if (error) return;

    // 2. Write to branch_incoming
    //    quantity is explicitly cast to float to avoid silent failure if DB column is integer type.
    //    confirmed:false ensures it shows in Incoming Stock awaiting branch confirmation.
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


    // NOTE: branch_stock is NOT updated here intentionally.
    // Stock is only added when the branch confirms the incoming item (confirmIncoming).
    // This ensures dispatched items appear in Incoming Stock first, waiting for branch confirmation.

    // 4. Update local state
    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, dispatchLog: updatedLog, status: 'dispatched' } : o
      ),
    }));
  },

  // ✅ Deletes a dispatch entry and restores stock automatically
  // Stock is computed as: prepared - sum(remaining dispatch log)
  // If all dispatches are removed, status reverts to 'packed'
  deleteDispatchEntry: async (orderId, entryId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const removedEntry = (order.dispatchLog || []).find(d => d.id === entryId);
    const updatedLog = (order.dispatchLog || []).filter(d => d.id !== entryId);
    const newStatus: WorkflowStatus = updatedLog.length === 0 ? 'packed' : 'dispatched';

    // 1. Update bakery_orders
    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus })
      .eq('id', orderId);
    if (error) return;

    // 2. Reverse branch_stock and remove branch_incoming entry
    if (removedEntry) {
      const { data: existingStock } = await supabase
        .from('branch_stock')
        .select('quantity')
        .eq('branch', removedEntry.branch)
        .eq('item_name', removedEntry.itemName)
        .maybeSingle();

      if (existingStock) {
        await supabase.from('branch_stock')
          .update({ quantity: Math.max(0, existingStock.quantity - removedEntry.quantity) })
          .eq('branch', removedEntry.branch)
          .eq('item_name', removedEntry.itemName);
      }

      // TXN-03 FIX: branch_incoming was inserted with dispatch_id = entryId,
      // NOT with id = entryId (those are different columns).
      // Using .eq('id', entryId) matched 0 rows — cancelled dispatches never cleaned up.
      await supabase.from('branch_incoming')
        .delete()
        .eq('dispatch_id', entryId);
    }

    // 3. Update local state
    set(s => ({
      orders: s.orders.map(o =>
        o.id === orderId ? { ...o, dispatchLog: updatedLog, status: newStatus } : o
      ),
    }));
  },
}));
