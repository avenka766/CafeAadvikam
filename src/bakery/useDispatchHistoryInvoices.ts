import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAdminRows } from '@/lib/adminReportData';
import { recordFromRow, type DispatchInvoiceRecord } from './dispatchInvoice';
import type { BakeryOrder } from './types';
import { itemNamesMatch } from './itemMatcher';

export function indexDispatchHistory(records: DispatchInvoiceRecord[], orders?: BakeryOrder[]) {
  const knownOrders = orders ? new Map(orders.map(o => [o.id, o])) : null;
  const map = new Map<string, DispatchInvoiceRecord[]>();
  for (const record of records) {
    if (record.status === 'cancelled') continue;
    for (const entry of record.dispatchEntryIds || []) {
      if (!entry.orderId) continue;
      if (knownOrders) {
        const order = knownOrders.get(entry.orderId);
        if (!order || !(order.dispatchLog || []).some(d => d.id === entry.dispatchEntryId && !d.isExtra && order.items.some(item => itemNamesMatch(item.itemName, d.itemName)))) continue;
      }
      const list = map.get(entry.orderId) || [];
      if (!list.some(i => i.id === record.id)) list.push(record);
      map.set(entry.orderId, list);
    }
  }
  return map;
}
export function useDispatchHistoryInvoices(enabled: boolean, revision: unknown, orders?: BakeryOrder[]) {
  const [byOrder, setByOrder] = useState(new Map<string, DispatchInvoiceRecord[]>());
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError('');
    fetchAdminRows<any>(() => supabase.from('dispatch_invoices').select('*')).then(result => {
      if (!active) return;
      if (result.error) { setError(result.error.message); return; }
      setByOrder(indexDispatchHistory(result.data.map(recordFromRow), orders));
    });
    return () => { active = false; };
  }, [enabled, revision, orders]);
  return { byOrder, error };
}
