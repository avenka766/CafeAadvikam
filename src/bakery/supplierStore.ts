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
        .select('*')
        .order('business_name', { ascending: true });
      if (error) throw error;
      const suppliers: Supplier[] = (data ?? []).filter((r: Record<string, unknown>) => !r.archived_at).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        businessName: r.business_name as string,
        contactName: r.contact_name as string,
        phone: r.phone as string,
        email: r.email as string,
        address: r.address as string,
        itemsSupplied: r.items_supplied as string,
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
      business_name: data.businessName,
      contact_name: data.contactName,
      phone: data.phone,
      email: data.email,
      address: data.address,
      items_supplied: data.itemsSupplied,
    });
    if (error) return error.message;
    await get().load();
    return null;
  },

  updateSupplier: async (id, data) => {
    const payload: Record<string, unknown> = {};
    if (data.businessName !== undefined) payload.business_name = data.businessName;
    if (data.contactName !== undefined) payload.contact_name = data.contactName;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.email !== undefined) payload.email = data.email;
    if (data.address !== undefined) payload.address = data.address;
    if (data.itemsSupplied !== undefined) payload.items_supplied = data.itemsSupplied;
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
