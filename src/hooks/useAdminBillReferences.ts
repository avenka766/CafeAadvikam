import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAdminRows } from '@/lib/adminReportData';
import { reportBounds } from '@/branch/reports/reportSources';
export function useAdminBillReferences(from: string, to: string) {
  const [rows, setRows] = useState<Array<{ id: string; branch: string; billNo: string; createdAt: string; total: number; status: string; items: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setRows([]); setError(''); setLoading(true);
    (async () => {
      try {
        const bounds = reportBounds(from, to);
        const result = await fetchAdminRows<Record<string, any>>(() => supabase.from('branch_operation_records').select('id, branch, record_id, status, payload, created_at').eq('record_type', 'bill').in('branch', ['SNB', 'VRSNB']).gte('created_at', bounds.from).lt('created_at', bounds.until));
        if (result.error) throw new Error(result.error.message);
        if (active) setRows(result.data.map(r => ({ id: r.id, branch: r.branch, billNo: String(r.payload?.billNo || ''), createdAt: r.payload?.createdAt || r.created_at, total: Number(r.payload?.total || 0), status: r.status || r.payload?.status || '', items: (r.payload?.items || []).map((i: any) => `${i.itemName || i.name || ''} x ${i.quantity || 0}`).join('; ') })).sort((a,b) => new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load bill references.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [from, to, revision]);
  return { rows, error, loading, refresh: () => setRevision(n => n + 1) };
}
