import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchVerifiedAdminRows } from '@/lib/adminReportPaging';
import { reportBounds } from '@/branch/reports/reportSources';
export function useAdminBillReferences(from: string, to: string, enabled = true) {
  const [rows, setRows] = useState<Array<{ id: string; sourceBillId?: string; recordNo?: string; branch: string; billNo: string; createdAt: string; total: number; status: string; items: string }>>([]);
  const [gaps, setGaps] = useState<Array<{ branch: string; missing_from: number; missing_to: number; previous_date: string; next_date: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setGaps([]); setRows([]); setError(''); setLoading(true);
    const controller = new AbortController();
    if (!enabled) { setLoading(false); return; }
    (async () => {
      try {
        const bounds = reportBounds(from, to);
        const data: Record<string, any>[] = [];
        for (const branch of ['SNB', 'VRSNB']) {
          const result = await fetchVerifiedAdminRows('branch_references', bounds.from, bounds.until, { branch, signal: controller.signal });
          if (result.error) throw new Error(result.error.message);
          data.push(...result.data);
        }
        const gapResult = await supabase.rpc('admin_branch_number_gaps_v1', { p_from: bounds.from, p_until: bounds.until }).abortSignal(controller.signal);
        if (gapResult.error) throw new Error(gapResult.error.message);
        if (active) setGaps(gapResult.data);
        if (active) setRows(data.map(r => ({ id: r.id, sourceBillId: r.payload?.sourceBillId || r.record_id, recordNo: r.record_no, branch: r.branch, billNo: String(r.payload?.billNo || r.record_no || ''), createdAt: r.payload?.createdAt || r.created_at, total: Number(r.payload?.total ?? r.amount ?? 0), status: r.status || r.payload?.status || '', items: (r.payload?.items || []).map((i: any) => `${i.itemName || i.name || ''} x ${i.quantity || 0}`).join('; ') })).sort((a,b) => new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load bill references.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [from, to, revision, enabled]);
  return { rows, gaps, error, loading, refresh: () => setRevision(n => n + 1) };
}
