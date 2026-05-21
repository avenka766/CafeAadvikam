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
      const suppliers: Supplier[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        businessName: r.business_name as string,
        contactName: r.contact_name as string,
        phone: r.phone as string,
        email: r.email as string,
        address: r.address as string,
        itemsSupplied: r.items_supplied as string,
        createdAt: r.created_at as string,
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
    await supabase.from('store_suppliers').delete().eq('id', id);
    set(s => ({ suppliers: s.suppliers.filter(x => x.id !== id) }));
  },
}));
