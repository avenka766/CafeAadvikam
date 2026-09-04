import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Shared by PlannerDashboard.tsx's in-page tab strip and WorkspaceChrome.tsx's
// sidebar (a separate, hardcoded nav list — see the "Advance Orders" comment
// in WorkspaceChrome.tsx for why both need their own badge wiring) so a cake
// order sitting at 'Ready for Packing' or 'Packed' — i.e. ready for the
// Planner to dispatch, the same "Ready" view PackingCakeOrdersTab itself
// shows — surfaces as a small indicator without either place having to
// duplicate PackingCakeOrdersTab's full ~20-column, 2000-row query. This is a
// count-only ({ head: true }) query, essentially free compared to that.
const READY_STATUSES = ['Ready for Packing', 'Packed'];

let instanceCounter = 0;

export function useCakeReadyCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  // BUG FIX (2026-09-05): PlannerDashboard.tsx and WorkspaceChrome.tsx both
  // call this hook at the same time on the /bakery/planner route (one for
  // its in-page tab strip when embedded, one for its sidebar), and a
  // hardcoded channel name meant the second `.subscribe()` call crashed the
  // whole page with "cannot add postgres_changes callbacks ... after
  // subscribe()" — Supabase realtime channel names must be unique per
  // subscription, not per logical purpose. Each hook instance now gets its
  // own channel.
  const instanceIdRef = useRef<number>();
  if (instanceIdRef.current === undefined) instanceIdRef.current = ++instanceCounter;

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;
    const refresh = async () => {
      const { count: c } = await supabase
        .from('cake_master_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', READY_STATUSES);
      if (!cancelled) setCount(c ?? 0);
    };
    void refresh();

    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(refresh, 800);
    };
    const channel = supabase
      .channel(`cake_ready_count_badge_${instanceIdRef.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cake_master_orders' }, scheduleRefresh)
      .subscribe();

    const refreshOnVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      cancelled = true;
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [enabled]);

  return count;
}
