type BillIdentity = { id: string; branch: string; billNo?: string; sourceBillId?: string; items?: unknown[] };

// Checkout and the browser mirror can have different record IDs for one sale.
// Bill numbers are unique within a branch; never merge across branches.
export function uniqueBranchBills<T extends BillIdentity>(bills: T[]): T[] {
  const saved = new Map<string, T>();
  const score = (b: T) => (b.sourceBillId && b.id === b.sourceBillId ? 4 : b.sourceBillId ? 2 : 0) + (b.items?.length ? 1 : 0);
  for (const bill of bills) {
    const key = JSON.stringify([bill.branch, bill.billNo?.trim() || bill.sourceBillId || bill.id]);
    const previous = saved.get(key);
    if (!previous || score(bill) > score(previous)) saved.set(key, bill);
  }
  return [...saved.values()];
}
