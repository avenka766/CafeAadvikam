// src/bakery/invoiceStore.ts
// Store invoice management - tracks supplier deliveries, syncs stock, notifies admin.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface InvoiceLineItem {
  itemName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
}

export type InvoiceStatus = 'pending_review' | 'approved' | 'rejected';

export interface StoreInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  deliveryDate: string;
  lineItems: InvoiceLineItem[];
  grandTotal: number;
  status: InvoiceStatus;
  notes: string;
  syncedToStock: boolean;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

interface InvoiceState {
  invoices: StoreInvoice[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  createInvoice: (data: Omit<StoreInvoice, 'id' | 'invoiceNumber' | 'status' | 'createdAt'>) => Promise<{ id: string; invoiceNumber: string } | null>;
  updateStatus: (id: string, status: InvoiceStatus, reviewNote?: string) => Promise<string | null>;
  deleteInvoice: (id: string) => Promise<void>;
  pendingCount: () => number;
}

function mapRow(r: Record<string, unknown>): StoreInvoice {
  return {
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    supplierId: r.supplier_id as string,
    supplierName: r.supplier_name as string,
    deliveryDate: r.delivery_date as string,
    lineItems: (r.line_items as InvoiceLineItem[]) ?? [],
    grandTotal: r.grand_total as number,
    status: r.status as InvoiceStatus,
    notes: (r.notes as string) ?? '',
    syncedToStock: r.synced_to_stock as boolean,
    createdAt: r.created_at as string,
    reviewedAt: (r.reviewed_at as string) ?? undefined,
    reviewNote: (r.review_note as string) ?? undefined,
  };
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('store_invoices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ invoices: (data ?? []).map(mapRow), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  createInvoice: async (data) => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const invoiceNumber = `INV-${dateStr}-${rand}`;

    const { data: inserted, error } = await supabase
      .from('store_invoices')
      .insert({
        invoice_number: invoiceNumber,
        supplier_id: data.supplierId,
        supplier_name: data.supplierName,
        delivery_date: data.deliveryDate,
        line_items: data.lineItems,
        grand_total: data.grandTotal,
        status: 'pending_review',
        notes: data.notes,
        synced_to_stock: data.syncedToStock,
      })
      .select('id, invoice_number')
      .single();

    if (error) return null;
    await get().load();
    return { id: inserted.id, invoiceNumber: inserted.invoice_number };
  },

  updateStatus: async (id, status, reviewNote) => {
    const { error } = await supabase
      .from('store_invoices')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote ?? null,
      })
      .eq('id', id);
    if (error) return error.message;
    await get().load();
    return null;
  },

  deleteInvoice: async (id) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from('store_invoices')
      .update({
        status: 'rejected',
        reviewed_at: reviewedAt,
        review_note: 'Cancelled from invoice screen. Record kept for audit.',
      })
      .eq('id', id);
    if (error) return;
    set(s => ({
      invoices: s.invoices.map(x =>
        x.id === id
          ? { ...x, status: 'rejected', reviewedAt, reviewNote: 'Cancelled from invoice screen. Record kept for audit.' }
          : x,
      ),
    }));
  },

  pendingCount: () => get().invoices.filter(i => i.status === 'pending_review').length,
}));
