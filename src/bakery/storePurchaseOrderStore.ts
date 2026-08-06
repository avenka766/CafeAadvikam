// src/bakery/storePurchaseOrderStore.ts
// Store Dashboard "Purchase Order" workflow: Store raises a PO (item + qty,
// no price) -> Owner approves/rejects it -> once approved, Store converts it
// into a GRN (store_invoices row), where quantity/price/receiving detail can
// still be edited before it's submitted to Admin and stock is synced.
//
// Deliberately named/tabled distinctly from the existing `purchaseOrderStore.ts`
// / `purchase_orders` table — that is a separate, unrelated low-stock reorder
// feature used by the Branch and Order Receiver dashboards. This store talks
// to its own `store_purchase_orders` table so the two features never collide.
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export interface StorePOLineItem {
  itemName: string;
  quantity: number;
  unit: string;
}

export type StorePOStatus = 'pending_approval' | 'approved' | 'rejected' | 'converted';

export interface StorePurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  expectedDeliveryDate: string | null;
  lineItems: StorePOLineItem[];
  status: StorePOStatus;
  notes: string;
  createdByName: string | null;
  createdAt: string;
  reviewedAt?: string;
  reviewedByName?: string;
  reviewNote?: string;
  convertedInvoiceId?: string;
  convertedAt?: string;
}

interface StorePOState {
  orders: StorePurchaseOrder[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<string | null>;
  createPO: (data: {
    supplierId: string;
    expectedDeliveryDate: string | null;
    lineItems: StorePOLineItem[];
    notes: string;
  }) => Promise<{ po: StorePurchaseOrder | null; error: string | null }>;
  updatePO: (id: string, data: {
    supplierId: string;
    expectedDeliveryDate: string | null;
    lineItems: StorePOLineItem[];
    notes: string;
  }) => Promise<string | null>;
  reviewPO: (id: string, status: 'approved' | 'rejected', reviewNote?: string) => Promise<string | null>;
  pendingCount: () => number;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLineItems(value: unknown): StorePOLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      itemName: String(row.itemName ?? row.item_name ?? ''),
      quantity: toFiniteNumber(row.quantity),
      unit: String(row.unit ?? ''),
    };
  });
}

function mapStatus(value: unknown): StorePOStatus {
  return value === 'approved' || value === 'rejected' || value === 'converted' ? value : 'pending_approval';
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || /could not find the function|schema cache|does not exist/i.test(error.message ?? '');
}

function friendlyPOError(error: { message?: string; code?: string } | null, action: string): string {
  const message = error?.message ?? '';
  if (/SESSION_REQUIRED/i.test(message) || error?.code === '28000') return 'Your session has expired. Please log in again and retry.';
  if (/ROLE_NOT_ALLOWED/i.test(message) || error?.code === '42501') return action === 'review'
    ? 'Only the Owner can approve or reject a purchase order.'
    : 'You do not have permission to do that.';
  if (/PO_ALREADY_REVIEWED/i.test(message)) return 'This purchase order was already reviewed and can no longer be changed.';
  if (/PO_NOT_FOUND/i.test(message)) return 'The purchase order could not be found. Refresh and try again.';
  if (/PO_NOT_APPROVED/i.test(message)) return 'This purchase order has not been approved by the Owner yet.';
  if (/SUPPLIER_NOT_FOUND/i.test(message)) return 'The selected supplier is no longer active. Choose another supplier.';
  if (/INVALID_PO_ITEM|INVALID_PO_LINES/i.test(message)) return 'One or more items contain an invalid name, quantity or unit.';
  if (/DUPLICATE_PO_ITEM/i.test(message)) return 'The same item cannot appear more than once in a purchase order.';
  return message || `Unable to ${action} the purchase order. Please try again.`;
}

function mapPORow(r: Record<string, unknown>): StorePurchaseOrder {
  return {
    id: String(r.id ?? ''),
    poNumber: String(r.po_number ?? ''),
    supplierId: String(r.supplier_id ?? ''),
    supplierName: String(r.supplier_name ?? ''),
    expectedDeliveryDate: r.expected_delivery_date ? String(r.expected_delivery_date) : null,
    lineItems: mapLineItems(r.line_items),
    status: mapStatus(r.status),
    notes: String(r.notes ?? ''),
    createdByName: r.created_by_name ? String(r.created_by_name) : null,
    createdAt: String(r.created_at ?? ''),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
    reviewedByName: r.reviewed_by_name ? String(r.reviewed_by_name) : undefined,
    reviewNote: r.review_note ? String(r.review_note) : undefined,
    convertedInvoiceId: r.converted_invoice_id ? String(r.converted_invoice_id) : undefined,
    convertedAt: r.converted_at ? String(r.converted_at) : undefined,
  };
}

const PO_SELECT = 'id, po_number, supplier_id, supplier_name, expected_delivery_date, line_items, status, notes, created_by_name, created_at, reviewed_at, reviewed_by_name, review_note, converted_invoice_id, converted_at';

export const useStorePurchaseOrderStore = create<StorePOState>((set, get) => ({
  orders: [],
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

      if (role === 'admin' || role === 'owner') {
        const result = await supabase.rpc('list_store_purchase_orders_secure');
        data = result.data as Record<string, unknown>[] | null;
        error = result.error;
        if (isMissingRpcError(error)) {
          const fallback = await supabase.from('store_purchase_orders').select(PO_SELECT).order('created_at', { ascending: false });
          data = fallback.data as Record<string, unknown>[] | null;
          error = fallback.error;
        }
      } else {
        const result = await supabase.from('store_purchase_orders').select(PO_SELECT).order('created_at', { ascending: false });
        data = result.data as Record<string, unknown>[] | null;
        error = result.error;
      }

      if (error) throw error;
      set({ orders: (data ?? []).map(mapPORow), loaded: true, error: null });
      return null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load purchase orders';
      set({ loaded: true, error: message });
      return message;
    } finally {
      set({ loading: false });
    }
  },

  createPO: async (data) => {
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const poNumber = `PO-${rand}`;
    const result = await supabase.rpc('create_store_purchase_order_secure', {
      p_po_number: poNumber,
      p_supplier_id: data.supplierId,
      p_expected_delivery_date: data.expectedDeliveryDate,
      p_line_items: data.lineItems,
      p_notes: data.notes.trim(),
    });

    if (result.error) {
      if (isMissingRpcError(result.error)) {
        return { po: null, error: 'The Purchase Order workflow is not installed in the database. Apply the latest Supabase migration first.' };
      }
      return { po: null, error: friendlyPOError(result.error, 'create') };
    }

    const po = mapPORow(result.data as unknown as Record<string, unknown>);
    set(s => ({ orders: [po, ...s.orders] }));
    return { po, error: null };
  },

  updatePO: async (id, data) => {
    const result = await supabase.rpc('update_store_purchase_order_secure', {
      p_po_id: id,
      p_supplier_id: data.supplierId,
      p_expected_delivery_date: data.expectedDeliveryDate,
      p_line_items: data.lineItems,
      p_notes: data.notes.trim(),
    });
    if (result.error) return friendlyPOError(result.error, 'update');
    const po = mapPORow(result.data as unknown as Record<string, unknown>);
    set(s => ({ orders: s.orders.map(o => o.id === id ? po : o) }));
    return null;
  },

  reviewPO: async (id, status, reviewNote) => {
    const result = await supabase.rpc('review_store_purchase_order_secure', {
      p_po_id: id,
      p_status: status,
      p_review_note: reviewNote?.trim() || null,
    });
    if (result.error) return friendlyPOError(result.error, 'review');
    const po = mapPORow(result.data as unknown as Record<string, unknown>);
    set(s => ({ orders: s.orders.map(o => o.id === id ? po : o) }));
    return null;
  },

  pendingCount: () => get().orders.filter(o => o.status === 'pending_approval').length,
}));
