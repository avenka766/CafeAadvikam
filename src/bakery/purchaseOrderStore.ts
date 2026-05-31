// src/bakery/purchaseOrderStore.ts
// Purchase order management — raised when store stock goes below threshold.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type POStatus = 'draft' | 'sent' | 'received';

export interface POItem {
  materialName: string;
  quantity: number;
  unit: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  items: POItem[];
  status: POStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
}

interface POState {
  orders: PurchaseOrder[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  createPO: (data: Omit<PurchaseOrder, 'id' | 'orderNumber' | 'createdAt' | 'sentAt' | 'receivedAt'>) => Promise<string | null>;
  updateStatus: (id: string, status: POStatus) => Promise<string | null>;
  deletePO: (id: string) => Promise<void>;
}

function mapRow(r: Record<string, unknown>): PurchaseOrder {
  return {
    id:           r.id as string,
    orderNumber:  r.order_number as string,
    supplierId:   r.supplier_id as string,
    supplierName: r.supplier_name as string,
    items:        (r.items as POItem[]) ?? [],
    status:       r.status as POStatus,
    notes:        (r.notes as string) ?? '',
    createdBy:    r.created_by as string,
    createdAt:    r.created_at as string,
    sentAt:       (r.sent_at as string) ?? undefined,
    receivedAt:   (r.received_at as string) ?? undefined,
  };
}

export const usePurchaseOrderStore = create<POState>((set, get) => ({
  orders:  [],
  loaded:  false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        set({ orders: data.map(r => mapRow(r as Record<string, unknown>)), loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },

  createPO: async (data) => {
    const { data: row, error } = await supabase
      .from('purchase_orders')
      .insert({
        supplier_id:   data.supplierId,
        supplier_name: data.supplierName,
        items:         data.items,
        status:        data.status,
        notes:         data.notes,
        created_by:    data.createdBy,
      })
      .select()
      .single();
    if (error) return error.message;
    if (row) set(s => ({ orders: [mapRow(row as Record<string, unknown>), ...s.orders] }));
    return null;
  },

  updateStatus: async (id, status) => {
    const payload: Record<string, unknown> = { status };
    if (status === 'sent')     payload.sent_at     = new Date().toISOString();
    if (status === 'received') payload.received_at = new Date().toISOString();
    const { error } = await supabase.from('purchase_orders').update(payload).eq('id', id);
    if (error) return error.message;
    set(s => ({
      orders: s.orders.map(o =>
        o.id === id ? {
          ...o, status,
          sentAt:     status === 'sent'     ? new Date().toISOString() : o.sentAt,
          receivedAt: status === 'received' ? new Date().toISOString() : o.receivedAt,
        } : o
      ),
    }));
    return null;
  },

  deletePO: async (id) => {
    await supabase.from('purchase_orders').delete().eq('id', id);
    set(s => ({ orders: s.orders.filter(o => o.id !== id) }));
  },
}));
