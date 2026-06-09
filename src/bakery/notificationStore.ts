// src/bakery/notificationStore.ts
// Admin notification store – surfaces invoice pending alerts, baker shortages,
// and packing discrepancies in one unified feed.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'invoice_pending'
  | 'baker_shortage'
  | 'packing_discrepancy'
  | 'packing_remainder'
  | 'low_stock'
  | 'credit_sale'
  | 'price_change'
  | 'store_item_change'
  | 'recipe_change';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  refId?: string;
  refLabel?: string;
  meta?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  recipientRole?: string; // which role this notification is for
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
  pushCreditSale: (params: { customerName: string; amount: number; billNo: string; branch: string; soldBy: string; dueDate?: string }) => Promise<void>;
  pushPackingRemainder: (orderId: string, orderNumber: string, branch: string, items: { itemName: string; remainderKg: number; dispatchedPcs: number; preparedKg: number }[]) => Promise<void>;
  pushStoreItemChange: (params: { action: 'created' | 'updated'; itemId: string; itemName: string; category?: string; changedBy?: string }) => Promise<void>;
  pushRecipeChange: (params: { action: 'created' | 'updated'; itemId: string; itemName: string; ingredientCount: number; changedBy?: string }) => Promise<void>;
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
    recipientRole: (r.recipient_role as string) ?? undefined,
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
      const role = useAuthStore.getState().currentUser?.role ?? 'admin';
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('recipient_role', role)
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
    const role = useAuthStore.getState().currentUser?.role ?? 'admin';
    await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('recipient_role', role)
      .eq('is_read', false);
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, isRead: true })),
    }));
  },

  deleteNotification: async (id) => {
    const current = get().notifications.find(n => n.id === id);
    const meta = {
      ...(current?.meta ?? {}),
      archivedAt: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('admin_notifications')
      .update({ is_read: true, meta })
      .eq('id', id);
    if (!error) set(s => ({ notifications: s.notifications.filter(n => n.id !== id) }));
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
      recipient_role: 'admin',
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
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },

  pushPackingDiscrepancy: async (orderId, orderNumber, branch, items) => {
    // UPSERT strategy: if a notification already exists for this order, merge the
    // new discrepant items into it (avoids duplicate cards while preserving ALL items).
    // Previous approach: return-early if any record existed — this caused only the
    // FIRST dispatched item's discrepancy to be saved; all subsequent items were lost.
    const { data: existing } = await supabase
      .from('admin_notifications')
      .select('id, meta')
      .eq('type', 'packing_discrepancy')
      .eq('ref_id', orderId)
      .limit(1);

    // Build the merged items list
    let mergedItems = [...items];
    if (existing && existing.length > 0) {
      const existingMeta = existing[0].meta as { items?: typeof items } | null;
      const existingItems: typeof items = existingMeta?.items ?? [];
      // Merge: existing items not in new list + all new items (new list is authoritative for its items)
      const newItemNames = new Set(items.map(i => i.itemName));
      const carry = existingItems.filter(i => !newItemNames.has(i.itemName));
      mergedItems = [...carry, ...items];
    }

    // Build a human-readable line per item — covers both shortfall AND excess
    const lines = mergedItems
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

    const hasMissing = mergedItems.some(i => i.dispatched < i.requested);
    const hasExtra   = mergedItems.some(i => i.dispatched > i.requested);
    const titleSuffix = hasMissing && hasExtra ? 'Missing & Extra Items' : hasMissing ? 'Missing Items' : 'Extra Items Sent';

    const payload = {
      type: 'packing_discrepancy',
      title: `Packing Discrepancy – ${titleSuffix}`,
      body: `Order ${orderNumber} → ${branch}: ${lines}`,
      ref_id: orderId,
      ref_label: `Order ${orderNumber} → ${branch}`,
      meta: { orderId, orderNumber, branch, items: mergedItems },
      recipient_role: 'admin',
    };

    if (existing && existing.length > 0) {
      // Update the existing row with merged items so the receiver/admin sees ALL discrepancies
      const { error } = await supabase
        .from('admin_notifications')
        .update({ ...payload, is_read: false }) // reset to unread so it surfaces again
        .eq('id', existing[0].id);
      if (error) console.warn('[notificationStore] discrepancy update failed:', error.message);
    } else {
      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (error) console.warn('[notificationStore] discrepancy insert failed:', error.message);
    }
    await get().load();
  },

  pushLowStock: async (items) => {
    // L-04: deduplicate — don't fire if a low_stock alert already exists in the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('type', 'low_stock')
      .eq('recipient_role', 'admin')
      .gte('created_at', sixHoursAgo)
      .limit(1);
    if (existing && existing.length > 0) return; // already alerted recently, skip

    const lines = items
      .map(i => `${i.name}: ${i.quantity.toFixed(2)} ${i.unit} (min ${i.minThreshold} ${i.unit})`)
      .join('; ');
    const { error } = await supabase.from('admin_notifications').insert({
      type:      'low_stock',
      title:     `Low Stock Alert — ${items.length} item${items.length > 1 ? 's' : ''} below threshold`,
      body:      lines,
      ref_label: 'Store Stock',
      meta:      { items },
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },

  pushCreditSale: async ({ customerName, amount, billNo, branch, soldBy, dueDate }) => {
    const amtFmt = amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const shortBill = billNo.split('-').pop() ?? billNo;
    const dueLine = dueDate
      ? ` · Due ${new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
      : '';
    const { error } = await supabase.from('admin_notifications').insert({
      type:      'credit_sale',
      title:     `💳 Credit Sale — ${branch}`,
      body:      `${customerName} · ₹${amtFmt} · Bill #${shortBill} · by ${soldBy}${dueLine}`,
      ref_id:    billNo,
      ref_label: `Bill #${shortBill}`,
      meta:      { customerName, amount, billNo, branch, soldBy, dueDate: dueDate ?? null },
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },



  pushStoreItemChange: async ({ action, itemId, itemName, category, changedBy }) => {
    const verb = action === 'created' ? 'added' : 'updated';
    const actor = changedBy || useAuthStore.getState().currentUser?.displayName || useAuthStore.getState().currentUser?.username || 'Store user';
    const { error } = await supabase.from('admin_notifications').insert({
      type:      'store_item_change',
      title:     `Store Item ${action === 'created' ? 'Added' : 'Updated'}`,
      body:      `${actor} ${verb} ${itemName}${category ? ` in ${category}` : ''}.`,
      ref_id:    itemId,
      ref_label: itemName,
      meta:      { action, itemId, itemName, category: category ?? null, changedBy: actor },
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },

  pushRecipeChange: async ({ action, itemId, itemName, ingredientCount, changedBy }) => {
    const verb = action === 'created' ? 'created' : 'updated';
    const actor = changedBy || useAuthStore.getState().currentUser?.displayName || useAuthStore.getState().currentUser?.username || 'Store user';
    const { error } = await supabase.from('admin_notifications').insert({
      type:      'recipe_change',
      title:     `Recipe ${action === 'created' ? 'Added' : 'Updated'}`,
      body:      `${actor} ${verb} recipe for ${itemName} with ${ingredientCount} ingredient${ingredientCount === 1 ? '' : 's'}.`,
      ref_id:    itemId,
      ref_label: itemName,
      meta:      { action, itemId, itemName, ingredientCount, changedBy: actor },
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },

  pushPackingRemainder: async (orderId, orderNumber, branch, items) => {
    // Dedup — don't fire a remainder alert for the same order twice
    const { data: existing } = await supabase
      .from('admin_notifications')
      .select('id')
      .eq('type', 'packing_remainder')
      .eq('recipient_role', 'admin')
      .eq('ref_id', orderId)
      .limit(1);
    if (existing && existing.length > 0) return;

    const lines = items.map(i => {
      const remainderGrams = Math.round(i.remainderKg * 1000);
      return `${i.itemName}: ${i.preparedKg} kg → ${i.dispatchedPcs} pcs dispatched · ${remainderGrams}g remainder kept at bakery`;
    }).join('; ');

    const { error } = await supabase.from('admin_notifications').insert({
      type:      'packing_remainder',
      title:     `⚖️ Packing Remainder – ${items.length} item${items.length > 1 ? 's' : ''} have leftover grams`,
      body:      `Order ${orderNumber} → ${branch}: ${lines}`,
      ref_id:    orderId,
      ref_label: `Order ${orderNumber} → ${branch}`,
      meta:      { orderId, orderNumber, branch, items },
      recipient_role: 'admin',
    });
    if (!error) await get().load();
  },

}));
