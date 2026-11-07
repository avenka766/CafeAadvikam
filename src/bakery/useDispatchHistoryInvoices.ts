import { useEffect, useMemo, useState } from 'react';
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
  const [records, setRecords] = useState<DispatchInvoiceRecord[]>([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const revisionKey = JSON.stringify(Array.isArray(revision) ? revision.map(row => ({id:row.id,updatedAt:row.updatedAt,status:row.status,dispatchLog:row.dispatchLog})) : revision);
  useEffect(()=>{const changed=()=>setRefresh(n=>n+1);window.addEventListener('dispatch-invoices-changed',changed);return()=>window.removeEventListener('dispatch-invoices-changed',changed);},[]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError('');
    fetchAdminRows<Record<string,unknown>>(() => supabase.from('dispatch_invoices').select('*').neq('status','cancelled')).then(result => {
      if (!active) return;
      if (result.error) { setError(result.error.message); return; }
      setRecords(result.data.map(recordFromRow));
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Could not load dispatch history.');});
    return () => { active = false; };
  }, [enabled, revisionKey, refresh]);
  const byOrder=useMemo(()=>indexDispatchHistory(records,orders),[records,orders]);
  return { byOrder, error };
}
