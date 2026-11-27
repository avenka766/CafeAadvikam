import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { mapInvoiceRow, type StoreInvoice } from './invoiceStore';
import { PurchasePriceAnalytics } from './StoreAnalyticsTab';
import { panelClass } from './MaterialWorkspaceControls';
import type { Material } from './materialWorkspace';

async function readPurchaseHistory(signal: AbortSignal): Promise<StoreInvoice[]> {
  const invoices: StoreInvoice[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc('material_purchase_analytics_v1', { p_after: cursor }).abortSignal(signal);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('Purchase history returned an invalid response.');
    for (const row of data) invoices.push(mapInvoiceRow(row));
    if (data.length < 250) return invoices;
    const next = data.at(-1)?.cursor;
    if (typeof next !== 'string' || next === cursor) throw new Error('Purchase history could not be paged.');
    cursor = next;
  }
}

export default function GrnAnalyticsTab({ stockItems }: { stockItems: Material[] }) {
  const [invoices, setInvoices] = useState<StoreInvoice[]>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = () => { setError(''); setInvoices(undefined); setRevision(current => current + 1); };
  useEffect(() => {
    const controller = new AbortController();
    readPurchaseHistory(controller.signal).then(data => {
      if (!controller.signal.aborted) setInvoices(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Request failed.');
    });
    return () => controller.abort();
  }, [revision]);

  if (error) return <section className={panelClass}>
    <p role="alert">Purchase analytics could not load. {error}</p>
    <Button className="mt-3" variant="outline" onClick={refresh}>Retry</Button>
  </section>;
  if (!invoices) return <p role="status" className="text-sm text-muted-foreground">Loading purchase analytics.</p>;
  return <div className="min-w-0 space-y-3">
    <Button variant="outline" onClick={refresh}>Refresh purchase history</Button>
    <PurchasePriceAnalytics invoices={invoices} stockItems={stockItems} grn />
  </div>;
}
