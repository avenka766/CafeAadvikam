// Unique-ID pagination retains records even when many share a timestamp.
export async function fetchAdminRows<T>(build: () => any, pageSize = 1000): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = () => {
      let query = build().order('id', { ascending: true });
      if (cursor !== null) query = query.gt('id', cursor);
      return query.limit(pageSize);
    };
    let result = await page();
    for (let retry = 1; result.error && retry <= 2; retry++) {
      await new Promise(resolve => setTimeout(resolve, retry * 500));
      result = await page();
    }
    if (result.error) return { data: rows, error: result.error };
    const data = (result.data || []) as T[];
    rows.push(...data);
    if (data.length < pageSize) return { data: rows, error: null };
    const next = String((data[data.length - 1] as Record<string, unknown>).id ?? '');
    if (!next || next === cursor) return { data: rows, error: { message: 'The report could not continue loading all records.' } };
    cursor = next;
  }
}
export function chronological<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
