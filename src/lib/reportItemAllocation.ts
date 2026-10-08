// Allocate the saved bill total in cents; retain raw item amounts separately.
export function allocateReportItems<T extends { lineTotal: number }>(items: T[], billTotal: number) {
  const raw = items.reduce((s, i) => s + i.lineTotal, 0);
  let remaining = Math.round(billTotal * 100);
  return items.map((item, index) => {
    const cents = index === items.length - 1 ? remaining : Math.round(billTotal * 100 * (raw ? item.lineTotal / raw : 1 / items.length));
    remaining -= cents;
    return { ...item, allocatedSales: cents / 100, billAdjustment: cents / 100 - item.lineTotal };
  });
}
