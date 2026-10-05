import { supabase } from '@/lib/supabase';
type Source = 'cafe' | 'branch_headers' | 'branch_payments' | 'branch_references' | 'branch_items';
type Row = { id: string; created_at: string; total?: number | string; amount?: number | string; line_total?: number | string };
type Page = { rows: Row[]; count: number | null; total: number | string | null };

export async function readVerifiedReport<T extends Row>(read: (cursor: Row | null, verify: boolean, size: number) => Promise<Page>, signal?: AbortSignal, amountKey?: 'total' | 'amount' | 'line_total'): Promise<T[]> {
  const rows: T[] = []; const seen = new Set<string>();
  let cursor: Row | null = null; let expected = 0; let expectedTotal = 0; let size = 500;
  for (;;) {
    signal?.throwIfAborted();
    let page: Page;
    try { page = await read(cursor, false, size); }
    catch (error) {
      // Smaller pages reduce payload/scan work. Never silently accept a partial report.
      if ((error as { code?: string }).code !== '57014' || size <= 50) throw error;
      size = Math.max(50, Math.floor(size / 2)); continue;
    }
    if (!cursor) { expected = Number(page.count); expectedTotal = Number(page.total); }
    for (const row of page.rows) {
      if (!row.id || !row.created_at || seen.has(row.id)) throw new Error('Report pagination repeated a record. Refresh before exporting.');
      seen.add(row.id); rows.push(row as T);
    }
    if (!page.rows.length) break;
    cursor = page.rows[page.rows.length - 1];
  }
  signal?.throwIfAborted();
  const verified = await read(cursor, true, size);
  const total = amountKey ? rows.reduce((sum, row) => sum + Number(row[amountKey] || 0), 0) : 0;
  if (!Number.isSafeInteger(expected) || expected < 0 || !Number.isFinite(expectedTotal) || !Number.isFinite(Number(verified.total)) || !Number.isFinite(total) ||
      rows.length !== expected || rows.length !== Number(verified.count) ||
      Math.abs(expectedTotal - Number(verified.total)) > 0.005 ||
      (amountKey && Math.abs(total - expectedTotal) > 0.005)) {
    throw new Error('The report changed while loading or is incomplete. Refresh before viewing or exporting totals.');
  }
  return rows;
}

export async function fetchVerifiedAdminRows<T = Record<string, any>>(source: Source, from: string, until: string, options: { branch?: string; billIds?: string[]; signal?: AbortSignal } = {}): Promise<{ data: T[]; error: { message: string } | null }> {
  try {
    const amountKey = source === 'branch_references' ? undefined : source === 'branch_payments' ? 'amount' : source === 'branch_items' ? 'line_total' : 'total';
    const rows = await readVerifiedReport(async (cursor, verify, size) => {
      let query = supabase.rpc('admin_sales_report_page_v1', {
        p_source: source, p_from: from, p_until: until, p_after_time: cursor?.created_at ?? null,
        p_after_id: cursor?.id ?? null, p_limit: size, p_branch: options.branch ?? null,
        p_bill_ids: options.billIds ?? null, p_verify: verify,
      });
      if (options.signal) query = query.abortSignal(options.signal);
      const { data, error } = await query;
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data as Page;
    }, options.signal, amountKey);
    return { data: rows as T[], error: null };
  } catch (error) { return { data: [], error: { message: error instanceof Error ? error.message : 'Report loading failed.' } }; }
}
