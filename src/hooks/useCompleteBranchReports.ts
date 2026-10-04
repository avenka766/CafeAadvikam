import { useCallback, useEffect, useState } from 'react';
import type { Branch } from '@/branch/types';
import { loadReportSource, REPORT_SOURCES, reportBounds, type ReportSnapshot } from '@/branch/reports/reportSources';

export function useCompleteBranchReports(from: string, to: string, branches: Branch[]) {
  const [snapshot, setSnapshot] = useState<ReportSnapshot>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const branchKey = branches.join(',');
  useEffect(() => {
    let cancelled = false;
    setLoadedAt(''); setError(''); setLoading(true);
    const next: ReportSnapshot = Object.fromEntries(REPORT_SOURCES.map(source => [source.id, { rows: [], status: 'loading', error: '' }]));
    setSnapshot({ ...next });
    void (async () => {
      try {
        reportBounds(from, to);
        // Two independent requests at a time avoid saturating the shared DB.
        const sources = REPORT_SOURCES.filter(source => !source.parent);
        let index = 0;
        const worker = async () => {
          while (index < sources.length && !cancelled) {
            const source = sources[index++];
            const result = await loadReportSource(source, branchKey.split(',') as Branch[], from, to, next, () => cancelled);
            if (cancelled) return;
            next[source.id] = result;
            setSnapshot({ ...next });
          }
        };
        await Promise.all([worker(), worker()]);
        for (const source of REPORT_SOURCES.filter(source => source.parent)) {
          if (cancelled) return;
          next[source.id] = await loadReportSource(source, branchKey.split(',') as Branch[], from, to, next, () => cancelled);
          if (!cancelled) setSnapshot({ ...next });
        }
        if (!cancelled) setLoadedAt(new Date().toISOString());
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [from, to, branchKey, revision]);
  return { snapshot, loading, error, loadedAt, refresh };
}
