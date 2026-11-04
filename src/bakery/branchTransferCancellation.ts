import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBakeryStore } from './bakeryStore';
import { closingStockItemSlug } from './itemMatcher';
import type { DispatchInvoiceRecord } from './dispatchInvoice';

const running = new Map<string, Promise<Record<string, unknown>>>();
export function cancelBranchTransfer(record: DispatchInvoiceRecord, reason = 'Cancelled branch transfer'): Promise<Record<string, unknown>> {
  const staff = useAuthStore.getState().currentUser?.id;
  if (!staff) return Promise.reject(new Error('Sign in before cancelling an invoice.'));
  const key = `branch-transfer-cancel:${staff}:${record.id}`;
  if (running.has(key)) return running.get(key)!;
  const promise = (async () => {
    if (localStorage.getItem(`dispatch-invoice-revision:${staff}:${record.id}`)) throw new Error('An invoice correction needs confirmation first. Retry that correction before cancelling.');
    const raw = localStorage.getItem(key);
    let request = raw ? JSON.parse(raw) : null;
    if (!request) {
      await useBakeryStore.getState().fetchOrders(true, true);
      const orders = useBakeryStore.getState().orders;
      const slugs: Record<string, string> = {};
      for (const ref of record.dispatchEntryIds) {
        const entry = orders.find(o => o.id === ref.orderId)?.dispatchLog?.find(e => e.id === ref.dispatchEntryId);
        if (!entry) throw new Error('A linked dispatch could not be loaded. Refresh before cancelling; nothing has been removed.');
        slugs[ref.dispatchEntryId] = closingStockItemSlug(entry.itemName);
      }
      request = { p_request: crypto.randomUUID(), p_invoice: record.id,
        p_expected: { items: record.items, total: record.total, status: record.status, dispatchEntryIds: record.dispatchEntryIds },
        p_slugs: slugs, p_reason: reason.trim() || 'Cancelled branch transfer' };
      localStorage.setItem(key, JSON.stringify(request));
    }
    const { data, error } = await supabase.rpc('cancel_branch_transfer_once_v1', request);
    if (error) {
      if (error.code === 'PGRST202') throw new Error('The safe cancellation update is not installed on the server yet. Nothing was cancelled. Your request is saved for retry after installation.');
      if (error.code && /^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501|P0002|P0003)$/.test(error.code)) localStorage.removeItem(key);
      throw new Error(error.code ? error.message : 'Cancellation confirmation was lost. Retry this invoice; the original request is saved.');
    }
    if (data?.id !== record.id || data.status !== 'cancelled') throw new Error('Cancellation confirmation is incomplete. Retry the saved request.');
    localStorage.removeItem(key);
    // A refresh is a projection, not a second financial operation.
    void useBakeryStore.getState().fetchOrders(true, true).catch(cause => console.warn('Cancelled transfer refresh failed', cause));
    return data;
  })().finally(() => running.delete(key));
  running.set(key, promise);
  return promise;
}
