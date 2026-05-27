// src/bakery/notificationStore.ts
// Admin notification store – surfaces invoice pending alerts, baker shortages,
// and packing discrepancies in one unified feed.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'invoice_pending'
  | 'baker_shortage'
  | 'packing_discrepancy'
  | 'low_stock';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  refId?: string;        // invoice id / order id
  refLabel?: string;     // "INV-20250522-4321" / "Order #42"
  meta?: Record<string, unknown>; // structured detail for the detail view
  isRead: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: AdminNotification[];
  loaded: boolean;
  loading: boolean;
  unreadCount: () => number;
  load: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  // Called by other stores/actions to fire notifications
  pushInvoicePending: (invoiceId: string, invoiceNumber: string, supplierName: string, grandTotal: number) => Promise<void>;
  pushBakerShortage: (orderId: string, orderNumber: string, items: { itemName: string; prepared: number; requested: number; unit: string }[]) => Promise<void>;
  pushPackingDiscrepancy: (orderId: string, orderNumber: string, branch: string, items: { itemName: string; dispatched: number; requested: number; unit: string }[]) => Promise<void>;
  pushLowStock: (items: { name: string; quantity: number; minThreshold: number; unit: string }[]) => Promise<void>;
}

// ─── Map row ──────────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): AdminNotification {
  return {
    id: r.id as string,
    type: r.type as NotificationType,
    title: r.title as string,
    body: r.body as string,
    refId: (r.ref_id as string) ?? undefined,
    refLabel: (r.ref_label as string) ?? undefined,
    meta: (r.meta as Record<string, unknown>) ?? undefined,
    isRead: r.is_read as boolean,
    createdAt: r.created_at as string,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loaded: false,
  loading: false,

  unreadCount: () => get().notifications.filter(n => !n.isRead).length,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      set({ notifications: (data ?? []).map(mapRow), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  markRead: async (id) => {
    // H-09 FIX: update local state only after DB write succeeds — avoids
    // showing notifications as read when the DB write silently failed.
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (!error) {
      set(s => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n),
      }));
    }
  },

  markAllRead: async () => {
    await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, isRead: true })),
    }));
  },

  deleteNotification: async (id) => {
    await supabase.from('admin_notifications').delete().eq('id', id);
    set(s => ({ notifications: s.notifications.filter(n => n.id !== id) }));
  },

  // ── Push helpers ─────────────────────────────────────────────────────────

  pushInvoicePending: async (invoiceId, invoiceNumber, supplierName, grandTotal) => {
    const { error } = await supabase.from('admin_notifications').insert({
      type: 'invoice_pending',
      title: 'New Invoice Pending Review',
      body: `${invoiceNumber} from ${supplierName} · ₹${grandTotal.toFixed(2)} — awaiting your approval.`,
      ref_id: invoiceId,
      ref_label: invoiceNumber,
      meta: { supplierName, grandTotal },
    });
    if (!error) await get().load();
  },

  pushBakerShortage: async (orderId, orderNumber, items) => {
    const lines = items
      .map(i => `${i.itemName}: prepared ${i.prepared} ${i.unit} vs requested ${i.requested} ${i.unit}`)
      .join('; ');
    const { error } = await supabase.from('admin_notifications').insert({
      type: 'baker_shortage',
      title: 'Baker Shortage – Incomplete Items Sent',
      body: `Order ${orderNumber}: baker sent fewer items than packing required. ${lines}`,
      ref_id: orderId,
      ref_label: `Order ${orderNumber}`,
      meta: { orderId, orderNumber, items },
    });
    if (!error) await get().load();
  },

  pushPackingDiscrepancy: async (orderId, orderNumber, branch, items) => {
    // Build a human-readable line per item — covers both shortfall AND excess
    const lines = items
      .map(i => {
        const diff = i.requested - i.dispatched;
        if (diff > 0) {
          return `${i.itemName}: requested ${i.requested} ${i.unit}, dispatched ${i.dispatched} ${i.unit} — ${diff} ${i.unit} short`;
        } else if (diff < 0) {
          return `${i.itemName}: requested ${i.requested} ${i.unit}, dispatched ${i.dispatched} ${i.unit} — ${Math.abs(diff)} ${i.unit} extra`;
        }
        return `${i.itemName}: ${i.dispatched} ${i.unit} ✓`;
      })
      .join('; ');

    const hasMissing = items.some(i => i.dispatched < i.requested);
    const hasExtra   = items.some(i => i.dispatched > i.requested);
    const titleSuffix = hasMissing && hasExtra ? 'Missing & Extra Items' : hasMissing ? 'Missing Items' : 'Extra Items Sent';

    const { error } = await supabase.from('admin_notifications').insert({
      type: 'packing_discrepancy',
      title: `Packing Discrepancy – ${titleSuffix}`,
      body: `Order ${orderNumber} → ${branch}: ${lines}`,
      ref_id: orderId,
      ref_label: `Order ${orderNumber} → ${branch}`,
      meta: { orderId, orderNumber, branch, items },
    });
    if (!error) await get().load();
  },

  pushLowStock: async (items) => {
    const lines = items
      .map(i => `${i.name}: ${i.quantity.toFixed(2)} ${i.unit} (min ${i.minThreshold} ${i.unit})`)
      .join('; ');
    const { error } = await supabase.from('admin_notifications').insert({
      type:      'low_stock',
      title:     `Low Stock Alert — ${items.length} item${items.length > 1 ? 's' : ''} below threshold`,
      body:      lines,
      ref_label: 'Store Stock',
      meta:      { items },
    });
    if (!error) await get().load();
  },

}));
