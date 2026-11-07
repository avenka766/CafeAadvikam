type RevisionItem = { itemName: string; unit: string; quantity: number; unitPrice: number };
export type DispatchReturnQuantity = { itemName: string; unit: string; qty: number };

export function planDispatchEditReturns<T extends RevisionItem>(original: T[], lines: (T & {key: number})[]) {
  const returns: DispatchReturnQuantity[] = [];
  let otherEdits = lines.some(line => !original[line.key]);
  const byKey = new Map(lines.map(line => [line.key, line]));
  original.forEach((item, key) => {
    const edited = byKey.get(key);
    if (!edited) {
      if (item.unit === 'charge') otherEdits = true;
      else returns.push({itemName: item.itemName, unit: item.unit, qty: item.quantity});
      return;
    }
    // A return is the only safe physical change an already-delivered invoice
    // can make. Compare the fields the editor actually lets a planner change
    // rather than serialising whole objects: saved rows can contain optional
    // display metadata in a different property order, which used to make a
    // genuine partial return look like an ordinary edit.
    const sameIdentity = edited.itemName === item.itemName && edited.unit === item.unit;
    const sameIdentityAndPrice = sameIdentity && edited.unitPrice === item.unitPrice;
    if (!sameIdentityAndPrice || !Number.isFinite(edited.quantity) ||
        edited.quantity < 0 || edited.quantity > item.quantity) {
      otherEdits = true;
    }
    if (sameIdentity &&
        edited.quantity >= 0 && edited.quantity < item.quantity) {
      if (item.unit === 'charge') otherEdits = true;
      else returns.push({itemName: item.itemName, unit: item.unit, qty: Number((item.quantity - edited.quantity).toFixed(9))});
    }
  });
  return {returns, otherEdits};
}

export function dispatchRevisionError(items: RevisionItem[], discountPct: number): string | null {
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
    return 'Discount must be between 0 and 100%.';
  }
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
        !Number.isFinite(item.quantity * item.unitPrice)) {
      return 'Every item must have a finite, non-negative quantity and price.';
    }
    if (item.unit === 'pcs' && !Number.isInteger(item.quantity)) {
      return 'Piece quantities must be whole numbers.';
    }
  }
  return null;
}

// One return request may contain the same line more than once. Validate the
// combined amount, rather than validating each entry and then using only one.
export function combineDispatchReturns(rows: DispatchReturnQuantity[]): DispatchReturnQuantity[] {
  const grouped = new Map<string, DispatchReturnQuantity>();
  for (const row of rows) {
    if (!Number.isFinite(row.qty) || row.qty < 0) {
      throw new Error('Return quantities must be finite and non-negative.');
    }
    if (row.unit === 'pcs' && !Number.isInteger(row.qty)) {
      throw new Error('Return piece quantities must be whole numbers.');
    }
    if (row.qty === 0) continue;
    const name = row.itemName.trim();
    if (!name) throw new Error('Each returned item needs a name.');
    const key = JSON.stringify([name.toLowerCase(), row.unit]);
    const previous = grouped.get(key);
    const qty = (previous?.qty ?? 0) + row.qty;
    if (!Number.isFinite(qty)) throw new Error('The combined return quantity is too large.');
    grouped.set(key, { itemName: previous?.itemName ?? name, unit: row.unit, qty });
  }
  return [...grouped.values()];
}
