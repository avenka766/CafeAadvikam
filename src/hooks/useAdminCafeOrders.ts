import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAdminRows, chronological } from '@/lib/adminReportData';
import { dbRowToOrder } from '@/stores/orderStore';
import { reportBounds } from '@/branch/reports/reportSources';
import type { Order } from '@/types';

export function useAdminCafeOrders(from: string, to: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setOrders([]); setLoading(true); setError('');
    (async () => {
      try {
        const bounds = reportBounds(from, to);
        const result = await fetchAdminRows<Record<string, unknown>>(() => supabase.from('orders').select('*').gte('created_at', bounds.from).lt('created_at', bounds.until));
        if (result.error) throw new Error(result.error.message);
        if (active) setOrders(chronological(result.data.map(dbRowToOrder)));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the Cafe register.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [from, to, revision]);
  return { orders, loading, error, refresh: () => setRevision(n => n + 1) };
}
