// src/bakery/supplierStore.ts
// Supplier management for the Store dashboard.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  itemsSupplied: string; // comma-separated list of items
  createdAt?: string;
  archivedAt?: string;
}

interface SupplierState {
  suppliers: Supplier[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt'>) => Promise<string | null>;
  updateSupplier: (id: string, data: Partial<Omit<Supplier, 'id' | 'createdAt'>>) => Promise<string | null>;
  deleteSupplier: (id: string) => Promise<void>;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('store_suppliers')
        .select('id, business_name, contact_name, phone, email, address, items_supplied, created_at, archived_at')
        .order('business_name', { ascending: true });
      if (error) throw error;
      const suppliers: Supplier[] = (data ?? []).filter((r: Record<string, unknown>) => !r.archived_at).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        businessName: String(r.business_name ?? ''),
        contactName: String(r.contact_name ?? ''),
        phone: String(r.phone ?? ''),
        email: String(r.email ?? ''),
        address: String(r.address ?? ''),
        itemsSupplied: String(r.items_supplied ?? ''),
        createdAt: r.created_at as string,
        archivedAt: (r.archived_at as string | null) ?? undefined,
      }));
      set({ suppliers, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  addSupplier: async (data) => {
    const { error } = await supabase.from('store_suppliers').insert({
      business_name: data.businessName.trim(),
      contact_name: data.contactName.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      address: data.address.trim(),
      items_supplied: data.itemsSupplied.trim(),
    });
    if (error) return error.message;
    await get().load();
    return null;
  },

  updateSupplier: async (id, data) => {
    const payload: Record<string, unknown> = {};
    if (data.businessName !== undefined) payload.business_name = data.businessName.trim();
    if (data.contactName !== undefined) payload.contact_name = data.contactName.trim();
    if (data.phone !== undefined) payload.phone = data.phone.trim();
    if (data.email !== undefined) payload.email = data.email.trim();
    if (data.address !== undefined) payload.address = data.address.trim();
    if (data.itemsSupplied !== undefined) payload.items_supplied = data.itemsSupplied.trim();
    const { error } = await supabase.from('store_suppliers').update(payload).eq('id', id);
    if (error) return error.message;
    await get().load();
    return null;
  },

  deleteSupplier: async (id) => {
    // BUG #17 FIX: check for existing invoices before deleting.
    // Previously a delete would either silently fail (FK constraint) or leave
    // dangling supplier references on existing invoices.
    const { count, error: countErr } = await supabase
      .from('store_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', id);
    if (countErr) throw new Error('Failed to check supplier invoices. Please try again.');
    if ((count ?? 0) > 0) {
      throw new Error(
        `Cannot delete — ${count} invoice${count === 1 ? '' : 's'} exist for this supplier. ` +
        'Delete or reassign the invoices first.'
      );
    }
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from('store_suppliers').update({ archived_at: archivedAt }).eq('id', id);
    if (error) throw new Error(error.message);
    set(s => ({ suppliers: s.suppliers.filter(x => x.id !== id) }));
  },
}));
