import { allocateReportItems } from './reportItemAllocation';

type Bill = { id: string; branch: string; billNo: string; createdAt: string; status: string; total: number };
type Item = { billId: string; itemName: string; unit: string; quantity: number; lineTotal: number };
type Receipt = { branch: string; originalBillNo: string; returnNo: string; createdAt: string; amount: number; items: unknown };
const money = (value: number) => Math.round(value * 100) / 100;

// Refunds belong to the date of the return, even when the original sale is
// outside the range. Keep those as explicit negative rows, never lose them.
export function branchNetSales(bills: Bill[], items: Item[], receipts: Receipt[]) {
  const rows = bills.map(b => ({ ...b, grossSales: /returned|cancelled|void|deleted/i.test(b.status) ? 0 : b.total, returns: 0, netSales: 0 }));
  const byBill = new Map(rows.filter(b => b.grossSales !== 0).map(b => [JSON.stringify([b.branch, b.billNo]), b]));
  const itemsByBill = new Map<string, Item[]>();
  for (const item of items) itemsByBill.set(item.billId, [...(itemsByBill.get(item.billId) ?? []), item]);
  const lines: Array<Item & {branch: string; billNo: string; createdAt: string; returnNo: string; allocatedSales: number}> = [];
  for (const bill of rows) {
    if (!bill.grossSales) continue;
    const saved = itemsByBill.get(bill.id) ?? [];
    const allocation = saved.length ? saved : [{billId: bill.id, itemName: 'Sale adjustment (items unavailable)', unit: '', quantity: 0, lineTotal: bill.grossSales}];
    lines.push(...allocateReportItems(allocation, bill.grossSales).map(i => ({...i, branch: bill.branch, billNo: bill.billNo, createdAt: bill.createdAt, returnNo: ''})));
  }
  for (const receipt of receipts) {
    const original = byBill.get(JSON.stringify([receipt.branch, receipt.originalBillNo]));
    if (original) original.returns = money(original.returns + receipt.amount);
    else rows.push({id: `return:${receipt.branch}:${receipt.returnNo}`, branch: receipt.branch, billNo: receipt.originalBillNo, createdAt: receipt.createdAt, status: `Return ${receipt.returnNo}`, total: 0, grossSales: 0, returns: receipt.amount, netSales: 0});
    const saved = Array.isArray(receipt.items) ? receipt.items as Record<string, unknown>[] : [];
    const returned = saved.map(i => ({billId: original?.id ?? '', itemName: String(i.itemName || 'Return adjustment'), unit: String(i.unit || ''), quantity: -Math.abs(Number(i.quantity) || 0), lineTotal: Math.abs(Number(i.lineTotal ?? (Number(i.quantity) * Number(i.price ?? i.unitPrice))) || 0)}));
    const allocation = returned.length ? returned : [{billId: original?.id ?? '', itemName: 'Return adjustment (items unavailable)', unit: '', quantity: 0, lineTotal: receipt.amount}];
    lines.push(...allocateReportItems(allocation, -receipt.amount).map(i => ({...i, branch: receipt.branch, billNo: receipt.originalBillNo, createdAt: receipt.createdAt, returnNo: receipt.returnNo})));
  }
  rows.forEach(b => {b.netSales = money(b.grossSales - b.returns);});
  const grouped = new Map<string, {itemName: string; unit: string; qty: number; revenue: number}>();
  for (const line of lines) {
    const key = JSON.stringify([line.itemName.trim().toLowerCase(), line.unit]);
    const row = grouped.get(key) ?? {itemName: line.itemName, unit: line.unit, qty: 0, revenue: 0};
    row.qty += line.quantity;
    row.revenue = money(row.revenue + line.allocatedSales);
    grouped.set(key, row);
  }
  return {bills: rows, lines, items: [...grouped.values()], netSales: money(rows.reduce((sum, b) => sum + b.netSales, 0))};
}
