import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAdminRows } from '@/lib/adminReportData';
import { recordFromRow, type DispatchInvoiceRecord } from './dispatchInvoice';

export function indexDispatchHistory(records: DispatchInvoiceRecord[]) {
  const map = new Map<string, DispatchInvoiceRecord[]>();
  for (const record of records) {
    if (record.status === 'cancelled') continue;
    for (const entry of record.dispatchEntryIds || []) {
      if (!entry.orderId) continue;
      const list = map.get(entry.orderId) || [];
      if (!list.some(i => i.id === record.id)) list.push(record);
      map.set(entry.orderId, list);
    }
  }
  return map;
}
export function useDispatchHistoryInvoices(enabled: boolean, revision: unknown) {
  const [byOrder, setByOrder] = useState(new Map<string, DispatchInvoiceRecord[]>());
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError('');
    fetchAdminRows<any>(() => supabase.from('dispatch_invoices').select('*')).then(result => {
      if (!active) return;
      if (result.error) { setError(result.error.message); return; }
      setByOrder(indexDispatchHistory(result.data.map(recordFromRow)));
    });
    return () => { active = false; };
  }, [enabled, revision]);
  return { byOrder, error };
}
