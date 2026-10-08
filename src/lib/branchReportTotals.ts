export function branchReportTotals(bills: Array<{ total: number; status: string }>, refunds: number) {
  const active = bills.filter(b => !/returned|cancelled|void|deleted/i.test(b.status));
  const totalSales = active.reduce((sum, b) => sum + b.total, 0);
  return { totalSales, netSales: totalSales - refunds, returns: refunds, orderCount: active.length };
}
