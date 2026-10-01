// Shared list-loading hook for the 4 homepage-CMS admin tabs (Testimonials,
// Cake Gallery, Promo Banners, Leads) — all four had their own near-identical
// load/loading/reload boilerplate; this pulls that out, plus a small
// "flash" success-message slot (auto-clears after a few seconds) so every
// tab can show the same "Saved." / "Deleted." confirmation without each
// tab wiring its own setTimeout.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type QueryBuilder = ReturnType<ReturnType<typeof supabase.from>['select']>;

export function useSupabaseRows<T>(table: string, build: (q: QueryBuilder) => QueryBuilder) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlashState] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  // `build` is typically passed as a fresh inline arrow function on every
  // render — holding it in a ref (instead of a reload() dependency) means
  // reload()'s own identity stays stable, so the mount-effect below doesn't
  // re-fire on every render while still always calling the LATEST query.
  const buildRef = useRef(build);
  buildRef.current = build;

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await buildRef.current(supabase.from(table).select('*'));
    setRows((data as T[]) ?? []);
    setLoading(false);
  }, [table]);

  useEffect(() => { void reload(); }, [reload]);

  const setFlash = useCallback((msg: string) => {
    setFlashState(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashState(''), 4000);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  return { rows, loading, reload, flash, setFlash };
}
