import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { POCard } from '@/bakery/StorePurchaseOrderTab';
import type { StorePurchaseOrder, StorePOStatus } from '@/bakery/storePurchaseOrderStore';
import PlannerSalesGstFields, { type PlannerGstDetails } from '@/bakery/PlannerSalesGstFields';
import { gstBuyerError } from '@/bakery/plannerSalesGst';
import '@/index.css';

const statuses: StorePOStatus[] = ['pending_approval', 'approved', 'rejected', 'converted'];
const orders = statuses.map((status, index): StorePurchaseOrder => ({
  id: String(index), poNumber: 'DEMO-PO-' + (101 + index), supplierId: 'demo',
  supplierName: ['Sree Grain Supplies', 'Hosur Dairy Supply', 'Sample Packaging', 'Bakery Ingredients Co.'][index],
  supplierAddress: 'Sample supplier address, Hosur', expectedDeliveryDate: '2026-11-07', status,
  lineItems: [
    { itemName: 'Baking flour', itemCode: 'RM-001', quantity: 25, unit: 'kg', pricePerUnit: 38, totalPrice: 950 },
    { itemName: 'Sugar', itemCode: 'RM-002', quantity: 10, unit: 'kg', pricePerUnit: 48, totalPrice: 480 },
  ],
  grandTotal: 1430, notes: 'Sample purchase order for print preview.', createdByName: 'Store',
  createdAt: '2026-11-05T06:00:00Z',
}));
const blank: PlannerGstDetails = { name: '', gstin: '', address: '', stateName: 'Tamil Nadu', stateCode: '33', hsnCode: '', rate: '5', supplyType: 'intra' };
const sample = { name: 'Demo Hosur Foods LLP', gstin: '33ABCDE1234F1Z5' };

function Preview() {
  const [enabled, setEnabled] = useState(false);
  const [details, setDetails] = useState(blank);
  const [profile, setProfile] = useState<Pick<PlannerGstDetails, 'name' | 'gstin'> | null>(null);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const error = gstBuyerError(details.name, details.gstin);
    setInvalid(Boolean(error));
    if (error) { setMessage(error); return; }
    setProfile(profile ?? { name: details.name.trim(), gstin: details.gstin.trim().toUpperCase() });
    setMessage('Sample details saved for this session. Start the next bill and enable GST to see both fields autofill.');
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl bg-[#163c32] p-6 text-white">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-200">Interactive preview · sample data</p>
          <h1 className="font-display text-3xl font-bold">Store PO printing and Hosur GST</h1>
          <p className="mt-2 text-sm text-emerald-100">Print a sample A4 purchase order, then try entering and reusing a shop’s GST details.</p>
        </header>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-display text-xl font-bold">Store → Purchase Order</h2>
            <p className="text-sm text-muted-foreground">Use Print on any card to open the sample purchase order. Select a card to expand it.</p>
            {orders.map(po => <POCard key={po.id} po={po} onConvert={() => window.alert('GRN conversion is outside this preview.')} />)}
          </section>
          <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="font-display text-xl font-bold">Planner → Hosur GST billing</h2>
            <p className="text-sm text-muted-foreground">Sample shop · Hosur Foods. GST profile changes are simulated in this preview.</p>
            <PlannerSalesGstFields enabled={enabled} details={details}
              onEnabledChange={value => { setEnabled(value); if (value && profile) setDetails(current => ({...current, ...profile})); }}
              onChange={patch => setDetails(current => ({...current, ...patch}))} />
            {enabled && <div className="flex flex-wrap gap-2">
              <button className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => setDetails(current => ({...current, ...sample}))}>Use sample GST details</button>
              <button className="rounded-lg bg-[#163c32] px-3 py-2 text-sm font-semibold text-white" onClick={save}>Save sample details</button>
            </div>}
            <button className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => {setEnabled(false); setDetails(blank); setMessage(''); setInvalid(false);}}>Start next bill</button>
            {message && <p role="status" className={invalid ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>{message}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
