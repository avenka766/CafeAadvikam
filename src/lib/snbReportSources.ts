export function snbReportSources(tab: string): number[] {
  switch (tab) {
    case 'history': case 'sales': return [14];
    case 'salesperson-report': return [14, 4];
    case 'cashier-report': return [1, 3];
    case 'cashier-closure': case 'closure': return [1, 2];
    case 'invoices': case 'purchase-returns': case 'payments': return [13];
    case 'overview': return [14, 1, 2, 13];
    case 'reports': return [14, 1, 2, 5, 6, 7, 13];
    default: return [];
  }
}
