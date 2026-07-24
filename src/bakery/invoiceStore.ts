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
  editedAt?: string;
  editCount?: number;
}

interface InvoiceState {
  invoices: StoreInvoice[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<string | null>;
  createInvoice: (data: Omit<StoreInvoice, 'id' | 'invoiceNumber' | 'status' | 'createdAt'>) => Promise<{ invoice: { id: string; invoiceNumber: string; syncedToStock: boolean } | null; error: string | null }>;
  updateInvoice: (id: string, data: Omit<StoreInvoice, 'id' | 'invoiceNumber' | 'status' | 'createdAt' | 'editedAt' | 'editCount'>) => Promise<string | null>;
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

function friendlyInvoiceWriteError(error: { message?: string; code?: string } | null, action: 'create' | 'update'): string {
  const message = error?.message ?? '';
  if (/SESSION_REQUIRED/i.test(message) || error?.code === '28000') return 'Your session has expired. Please log in again and retry.';
  if (/ROLE_NOT_ALLOWED/i.test(message) || error?.code === '42501') return 'You do not have permission to save store invoices.';
  if (/INVOICE_ALREADY_REVIEWED/i.test(message)) return 'This invoice was already reviewed and can no longer be edited.';
  if (/INVOICE_NOT_FOUND/i.test(message)) return 'The invoice could not be found. Refresh the invoice list and try again.';
  if (/SUPPLIER_NOT_FOUND/i.test(message)) return 'The selected supplier is no longer active. Choose another supplier.';
  if (/INVALID_DELIVERY_DATE/i.test(message)) return 'Delivery date can only be today or yesterday.';
  if (/DUPLICATE_INVOICE_ITEM/i.test(message)) return 'The same item cannot appear more than once in an invoice.';
  if (/INVALID_INVOICE_ITEM|INVALID_INVOICE_LINES/i.test(message)) return 'One or more invoice items contain an invalid name, quantity, unit or rate.';
  if (/STOCK_UNIT_MISMATCH:([^\n]+)/i.test(message)) {
    const item = message.match(/STOCK_UNIT_MISMATCH:([^\n]+)/i)?.[1]?.trim();
    return `The unit for ${item || 'an item'} does not match its inventory unit. Correct the unit and retry.`;
  }
  if (/STOCK_ITEM_NOT_FOUND:([^\n]+)/i.test(message)) {
    const item = message.match(/STOCK_ITEM_NOT_FOUND:([^\n]+)/i)?.[1]?.trim();
    return `Inventory could not be adjusted because ${item || 'an original item'} is missing from stock.`;
  }
  if (/INSUFFICIENT_STOCK_FOR_INVOICE_EDIT:([^\n]+)/i.test(message)) {
    const item = message.match(/INSUFFICIENT_STOCK_FOR_INVOICE_EDIT:([^\n]+)/i)?.[1]?.trim();
    return `The invoice cannot be reduced because some of ${item || 'the item'} has already been consumed. Correct the inventory first, then retry.`;
  }
  if (/GRAND_TOTAL_MISMATCH/i.test(message)) return 'The invoice total changed while saving. Review the item quantities and rates, then retry.';
  if (/notes.*not-null|null value in column "notes"/i.test(message)) return 'The invoice notes could not be saved. Refresh the page and retry.';
  return message || `Unable to ${action} the invoice. Please try again.`;
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
    editedAt: r.edited_at ? String(r.edited_at) : undefined,
    editCount: r.edit_count ? Number(r.edit_count) : undefined,
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
            .select('id, invoice_number, supplier_id, supplier_name, delivery_date, line_items, grand_total, status, purchase_status, notes, synced_to_stock, created_at, reviewed_at, review_note, edited_at, edit_count')
            .order('created_at', { ascending: false });
          data = fallback.data as Record<string, unknown>[] | null;
          error = fallback.error;
        }
      } else {
        const result = await supabase
          .from('store_invoices')
          .select('id, invoice_number, supplier_id, supplier_name, delivery_date, line_items, grand_total, status, purchase_status, notes, synced_to_stock, created_at, reviewed_at, review_note, edited_at, edit_count')
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
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const invoiceNumber = `VRSNB-PENDING-${rand}`;
    const notes = data.notes.trim();

    const secureResult = await supabase.rpc('create_store_invoice_secure', {
      p_invoice_number: invoiceNumber,
      p_supplier_id: data.supplierId,
      p_supplier_name: data.supplierName,
      p_delivery_date: data.deliveryDate,
      p_line_items: data.lineItems,
      p_grand_total: data.grandTotal,
      p_notes: notes,
    });

    if (!secureResult.error && secureResult.data) {
      const row = secureResult.data as unknown as Record<string, unknown>;
      await get().load();
      return {
        invoice: {
          id: String(row.id ?? ''),
          invoiceNumber: String(row.invoice_number ?? invoiceNumber),
          syncedToStock: Boolean(row.synced_to_stock),
        },
        error: null,
      };
    }

    if (isMissingRpcError(secureResult.error)) {
      return {
        invoice: null,
        error: 'The secure invoice workflow is not installed in the database. Apply the latest Supabase migration before creating an invoice.',
      };
    }

    return { invoice: null, error: friendlyInvoiceWriteError(secureResult.error, 'create') };
  },

  updateInvoice: async (id, data) => {
    const notes = data.notes.trim();
    const result = await supabase.rpc('update_store_invoice_secure', {
      p_invoice_id: id,
      p_supplier_id: data.supplierId,
      p_supplier_name: data.supplierName,
      p_delivery_date: data.deliveryDate,
      p_line_items: data.lineItems,
      p_grand_total: data.grandTotal,
      p_notes: notes,
    });

    if (result.error && isMissingRpcError(result.error)) {
      // A direct edit is safe only when stock has never been synchronized. Once
      // inventory was updated, the database RPC is required so invoice and stock
      // changes happen in one transaction.
      if (data.syncedToStock) {
        return 'The secure invoice update is not installed in the database. Apply the latest Supabase migration before editing a stock-synced invoice.';
      }

      const currentInvoice = get().invoices.find(invoice => invoice.id === id);
      const editedAt = new Date().toISOString();
      const { data: updated, error: fallbackError } = await supabase
        .from('store_invoices')
        .update({
          supplier_id: data.supplierId,
          supplier_name: data.supplierName,
          delivery_date: data.deliveryDate,
          line_items: data.lineItems,
          grand_total: data.grandTotal,
          notes,
          edited_at: editedAt,
          edit_count: (currentInvoice?.editCount ?? 0) + 1,
        })
        .eq('id', id)
        .eq('status', 'pending_review')
        .select('id')
        .maybeSingle();

      if (fallbackError) return friendlyInvoiceWriteError(fallbackError, 'update');
      if (!updated) return 'This invoice is no longer pending and cannot be edited.';
    } else if (result.error) {
      return friendlyInvoiceWriteError(result.error, 'update');
    } else if (!result.data) {
      return 'The invoice could not be updated. Refresh the list and try again.';
    }

    await get().load();
    return null;
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
        .select('id, invoice_number, supplier_id, supplier_name, delivery_date, line_items, grand_total, status, purchase_status, notes, synced_to_stock, created_at, reviewed_at, review_note, edited_at, edit_count')
        .maybeSingle();
    }

    const { data, error } = result;
    if (error) {
      // Map custom Postgres exception messages to user-friendly strings.
      const msg = error.message ?? '';
      if (msg.includes('INVOICE_ALREADY_REVIEWED')) return 'This invoice was already reviewed by another admin.';
      if (msg.includes('INVOICE_NOT_FOUND')) return 'Invoice not found. It may have been deleted.';
      if (msg.includes('SESSION_REQUIRED') || error.code === '28000') return 'Your session has expired. Please log in again.';
      if (msg.includes('ROLE_NOT_ALLOWED') || error.code === '42501') return 'You do not have permission to review invoices.';
      return error.message;
    }
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
