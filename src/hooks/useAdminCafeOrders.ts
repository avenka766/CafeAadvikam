import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { chronological } from '@/lib/adminReportData';
import { fetchVerifiedAdminRows } from '@/lib/adminReportPaging';
import { dbRowToOrder } from '@/stores/orderStore';
import { reportBounds } from '@/branch/reports/reportSources';
import type { Order } from '@/types';

export type CafeNumberGap = { missing_from: number; missing_to: number; previous_bill: number; next_bill: number; previous_date: string; next_date: string };
export function useAdminCafeOrders(from: string, to: string, enabled = true) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [gaps, setGaps] = useState<CafeNumberGap[]>([]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!enabled) { setLoading(false); return; }
    setGaps([]);
    setOrders([]); setLoading(true); setError('');
    (async () => {
      try {
        const bounds = reportBounds(from, to);
        const result = await fetchVerifiedAdminRows<Record<string, unknown>>('cafe', bounds.from, bounds.until, { signal: controller.signal });
        if (result.error) throw new Error(result.error.message);
        const gapResult = await supabase.rpc('admin_cafe_number_gaps_v1', { p_from: bounds.from, p_until: bounds.until }).abortSignal(controller.signal);
        if (gapResult.error) throw new Error(gapResult.error.message);
        if (active) { setOrders(chronological(result.data.map(dbRowToOrder))); setGaps(gapResult.data as CafeNumberGap[]); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the Cafe register.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [from, to, revision, enabled]);
  return { orders, gaps, loading, error, refresh: () => setRevision(n => n + 1) };
}
