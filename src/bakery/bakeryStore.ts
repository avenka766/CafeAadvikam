import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { BakeryOrder, BakeryOrderItem, PreparedItem, DispatchEntry, WorkflowStatus } from './types';

interface BakeryState {
  orders: BakeryOrder[];
  loading: boolean;
  fetchOrders: () => Promise<void>;
  submitOrder: (items: BakeryOrderItem[], createdBy: string) => Promise<void>;
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

  submitOrder: async (items, createdBy) => {
    const { data, error } = await supabase
      .from('bakery_orders')
      .insert({ items, status: 'pending', created_by: createdBy })
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
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const newEntry: DispatchEntry = { ...entry, id: crypto.randomUUID() };
    const updatedLog = [...(order.dispatchLog || []), newEntry];
    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: 'dispatched' })
      .eq('id', orderId);
    if (!error) {
      set(s => ({
        orders: s.orders.map(o =>
          o.id === orderId ? { ...o, dispatchLog: updatedLog, status: 'dispatched' } : o
        ),
      }));
    }
  },

  // ✅ Deletes a dispatch entry and restores stock automatically
  // Stock is computed as: prepared - sum(remaining dispatch log)
  // If all dispatches are removed, status reverts to 'packed'
  deleteDispatchEntry: async (orderId, entryId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order) return;
    const updatedLog = (order.dispatchLog || []).filter(d => d.id !== entryId);
    const newStatus: WorkflowStatus = updatedLog.length === 0 ? 'packed' : 'dispatched';
    const { error } = await supabase
      .from('bakery_orders')
      .update({ dispatch_log: updatedLog, status: newStatus })
      .eq('id', orderId);
    if (!error) {
      set(s => ({
        orders: s.orders.map(o =>
          o.id === orderId ? { ...o, dispatchLog: updatedLog, status: newStatus } : o
        ),
      }));
    }
  },
}));
