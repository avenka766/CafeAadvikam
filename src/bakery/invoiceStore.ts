// src/bakery/invoiceStore.ts
// Store invoice management - tracks supplier deliveries, syncs stock, notifies admin.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

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
  error: string | null;
  load: () => Promise<string | null>;
  createInvoice: (data: Omit<StoreInvoice, 'id' | 'invoiceNumber' | 'status' | 'createdAt'>) => Promise<{ id: string; invoiceNumber: string } | null>;
  updateStatus: (id: string, status: InvoiceStatus, reviewNote?: string) => Promise<string | null>;
  deleteInvoice: (id: string) => Promise<void>;
  pendingCount: () => number;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const quantity = toFiniteNumber(row.quantity);
    const pricePerUnit = toFiniteNumber(row.pricePerUnit ?? row.price_per_unit);
    const suppliedTotal = toFiniteNumber(row.totalPrice ?? row.total_price);

    return {
      itemName: String(row.itemName ?? row.item_name ?? ''),
      quantity,
      unit: String(row.unit ?? ''),
      pricePerUnit,
      totalPrice: suppliedTotal || Number((quantity * pricePerUnit).toFixed(2)),
    };
  });
}

function mapStatus(value: unknown): InvoiceStatus {
  return value === 'approved' || value === 'rejected' ? value : 'pending_review';
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || /could not find the function|schema cache|does not exist/i.test(error.message ?? '');
}

export function mapInvoiceRow(r: Record<string, unknown>): StoreInvoice {
  return {
    id: String(r.id ?? ''),
    invoiceNumber: String(r.invoice_number ?? ''),
    supplierId: String(r.supplier_id ?? ''),
    supplierName: String(r.supplier_name ?? ''),
    deliveryDate: String(r.delivery_date ?? ''),
    lineItems: mapLineItems(r.line_items),
    // PostgreSQL numeric values are returned by PostgREST as strings in this
    // project. Normalise here so every dashboard can safely format the total.
    grandTotal: toFiniteNumber(r.grand_total),
    status: mapStatus(r.status ?? r.purchase_status),
    notes: String(r.notes ?? ''),
    syncedToStock: Boolean(r.synced_to_stock),
    createdAt: String(r.created_at ?? ''),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewNote: r.review_note ? String(r.review_note) : undefined,
  };
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return null;
    set({ loading: true, error: null });
    try {
      const role = useAuthStore.getState().currentUser?.role;
      let data: Record<string, unknown>[] | null = null;
      let error: { message: string; code?: string } | null = null;

      // Admin/owner reads go through a role-checked RPC once the accompanying
      // migration is installed. Keep a compatibility fallback for older DBs.
      if (role === 'admin' || role === 'owner') {
        const result = await supabase.rpc('list_store_invoices_secure');
        data = result.data as Record<string, unknown>[] | null;
        error = result.error;

        if (isMissingRpcError(error)) {
          const fallback = await supabase
            .from('store_invoices')
            .select('*')
            .order('created_at', { ascending: false });
          data = fallback.data as Record<string, unknown>[] | null;
          error = fallback.error;
        }
      } else {
        const result = await supabase
          .from('store_invoices')
          .select('*')
          .order('created_at', { ascending: false });
        data = result.data as Record<string, unknown>[] | null;
        error = result.error;
      }

      if (error) throw error;
      set({ invoices: (data ?? []).map(mapInvoiceRow), loaded: true, error: null });
      return null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load invoices';
      set({ loaded: true, error: message });
      return message;
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
    const reviewedAt = new Date().toISOString();
    const note = reviewNote?.trim() || null;
    let result = await supabase.rpc('review_store_invoice_secure', {
      p_invoice_id: id,
      p_status: status,
      p_review_note: note,
    });

    // Compatibility fallback until the migration is deployed.
    if (isMissingRpcError(result.error)) {
      result = await supabase
        .from('store_invoices')
        .update({
          status,
          // Keep the legacy owner/purchase reporting field in sync as well.
          purchase_status: status,
          reviewed_at: reviewedAt,
          review_note: note,
        })
        .eq('id', id)
        .eq('status', 'pending_review')
        .select('*')
        .maybeSingle();
    }

    const { data, error } = result;
    if (error) return error.message;
    if (!data) return 'This invoice was already reviewed or could not be updated.';

    set((state) => ({
      invoices: state.invoices.map((invoice) =>
        invoice.id === id ? mapInvoiceRow(data as Record<string, unknown>) : invoice,
      ),
      error: null,
    }));
    return null;
  },

  deleteInvoice: async (id) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from('store_invoices')
      .update({
        status: 'rejected',
        purchase_status: 'rejected',
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
