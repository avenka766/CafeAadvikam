import { useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { businessDateTime } from '@/lib/businessDate';
import { useBranchStore, type CreditPayment, type CreditSale } from '@/branch/branchStore';

export const snbCreditPartyKey = (credit: CreditSale) => {
  const phone = credit.customerPhone?.replace(/\D/g, '');
  return credit.customerRef ? 'customer:' + credit.customerRef : phone ? 'phone:' + phone : 'name:' + credit.customerName.trim().toLowerCase();
};

const field = 'w-full rounded-xl border bg-white px-3 py-2 text-sm';
const btn = 'rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50';
type BatchRequest = {
  p_request: string; p_party: string; p_mode: string; p_reference: string | null;
  p_remarks: string; p_allocations: { creditId: string; amount: number }[];
};

function readPending(key: string): BatchRequest | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}

export default function SnbCreditPaymentBatch({ credits, onSaved }: {
  credits: CreditSale[];
  onSaved: () => Promise<void>;
}) {
  const staff = useAuthStore(state => state.currentUser);
  const staffId = staff?.id;
  const settleCreditSale = useBranchStore(state => state.settleCreditSale);
  const batchEnabled = import.meta.env.VITE_SNB_CREDIT_BATCH_ENABLED !== 'false';
  const storageKey = 'snb-credit-batch:' + staffId;
  const [partySearch, setPartySearch] = useState('');
  const [billSearch, setBillSearch] = useState('');
  const [party, setParty] = useState('');
  const [mode, setMode] = useState<Exclude<CreditPayment['paymentMode'], 'mixed'>>('cash');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<BatchRequest | null>(() => readPending(storageKey));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  const open = credits.filter(credit => !credit.cancelledAt && credit.creditAmount > 0);
  const parties = new Map(open.map(credit => [snbCreditPartyKey(credit),
    [credit.customerName, credit.customerPhone].filter(Boolean).join(' · ')]));
  const options = [...parties].filter(([, label]) => label.toLowerCase().includes(partySearch.trim().toLowerCase()))
    .sort(([, a], [, b]) => a.localeCompare(b));
  const bills = party ? open.filter(credit => snbCreditPartyKey(credit) === party) : [];
  const visible = bills.filter(credit => (credit.billNo + ' ' + credit.createdAt.slice(0, 10) + ' ' + businessDateTime(credit.createdAt))
    .toLowerCase().includes(billSearch.trim().toLowerCase()));
  const selected = bills.filter(credit => values[credit.id]?.trim() && Number(values[credit.id]) !== 0);
  const amountFor = (id: string) => Number(values[id] || 0);
  const total = selected.reduce((sum, credit) => sum + amountFor(credit.id), 0);

  const post = async () => {
    if (inFlight.current || !staffId) return;
    setMessage('');
    let request = pending ?? readPending(storageKey);
    if (!batchEnabled && (request || selected.length > 1)) {
      setMessage('Choose one bill per payment. Multi-bill posting is awaiting deployment.'); return;
    }
    if (!request) {
      if (!party || !selected.length || (batchEnabled && !remarks.trim())) {
        setMessage(batchEnabled ? 'Choose a party, enter remarks and allocate a payment.' : 'Choose a party and enter the payment against one bill.'); return;
      }
      if (selected.length > 100 || selected.some(credit => {
        const amount = amountFor(credit.id);
        return !Number.isFinite(amount) || amount <= 0 || amount > credit.creditAmount ||
          Math.abs(Math.round(amount * 100) - amount * 100) > 0.00001;
      })) {
        setMessage('Enter valid amounts up to the amount due on each bill. A batch can cover up to 100 bills.'); return;
      }
      request = {
        p_request: crypto.randomUUID(), p_party: party, p_mode: mode, p_reference: reference.trim() || null,
        p_remarks: remarks.trim(), p_allocations: selected.map(credit => ({ creditId: credit.id, amount: amountFor(credit.id) })),
      };
    }
    inFlight.current = true;
    setSaving(true);
    try {
      if (!batchEnabled) {
        if (mode !== 'cash' && !reference.trim()) throw Error('Enter the payment reference for ' + mode.toUpperCase() + '.');
        const [allocation] = request.p_allocations;
        const error = await settleCreditSale('SNB', allocation.creditId, allocation.amount, {
          mode, reference: reference.trim(), remarks: remarks.trim() || 'SNB Admin credit collection',
          collectedBy: staff?.displayName || staff?.username || 'Staff', collectedRole: staff?.role,
        });
        if (error) throw Error(error);
        setMessage('Submitted ' + formatCurrency(allocation.amount) + ' for one bill.');
        setValues({});
        setRemarks('');
        setReference('');
        await onSaved();
        return;
      }
      localStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      const { data, error } = await supabase.rpc('collect_snb_credit_batch_v1', request);
      if (error) {
        if (/^(P0001|22[A-Z0-9]{3}|23[A-Z0-9]{3}|42501)$/.test(error.code ?? '') && !/CREDIT_REQUEST_ALREADY_USED/i.test(error.message)) {
          localStorage.removeItem(storageKey);
          setPending(null);
        }
        throw Error(error.message);
      }
      if (!data?.batchId || data.batchId !== request.p_request) throw Error('The result could not be verified. Retry the saved batch.');
      localStorage.removeItem(storageKey);
      setPending(null);
      setValues({});
      setRemarks('');
      setReference('');
      setMessage('Posted ' + formatCurrency(Number(data.amount)) + ' across ' + data.count + ' bill(s).');
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not confirm payment. Retry the saved batch.');
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <section className="space-y-3 rounded-2xl border bg-slate-50 p-4">
        <h3 className="font-black">{batchEnabled ? 'Credit Payment Batch' : 'Collect Credit Payment'}</h3>
        <fieldset className="space-y-3" disabled={saving || Boolean(pending)}>
          <label className="block text-xs font-bold">Find party<input className={field} placeholder="Search customer name or phone" value={partySearch} onChange={event => setPartySearch(event.target.value)} /></label>
          <label className="block text-xs font-bold">Party<select className={field} value={party} onChange={event => { setParty(event.target.value); setValues({}); setBillSearch(''); }}>
            <option value="">Choose a party</option>
            {party && !options.some(([key]) => key === party) && <option value={party}>{parties.get(party) ?? 'Selected party'}</option>}
            {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold">Payment mode<select className={field} value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option>
            </select></label>
            <div className="text-xs font-bold">{batchEnabled ? 'Batch total' : 'Payment total'}<p className="rounded-xl bg-slate-950 px-3 py-2 text-sm text-white">{formatCurrency(total)}</p></div>
          </div>
          <label className="block text-xs font-bold">{batchEnabled || mode === 'cash' ? 'Reference (optional)' : 'Payment reference'}<input className={field} value={reference} onChange={event => setReference(event.target.value)} /></label>
          <label className="block text-xs font-bold">Remarks<textarea className={field} placeholder="Payment or approval notes" value={remarks} onChange={event => setRemarks(event.target.value)} /></label>
        </fieldset>
        {pending && <p className="text-xs text-amber-800">A batch is awaiting confirmation. Retry it before recording another payment.</p>}
        <button type="button" onClick={() => void post()} disabled={saving || (Boolean(pending) && !batchEnabled) || (!pending && (!selected.length || (batchEnabled && !remarks.trim())))}
          className={btn + ' w-full bg-slate-950 text-white'}>{saving ? 'Posting…' : pending ? 'Retry saved batch' : 'Post ' + formatCurrency(total)}</button>
        {message && <p role="status" className="text-xs font-bold">{message}</p>}
      </section>
      <section className="min-w-0 space-y-3 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black">Allocate Pending Credit Bills</h3>
          <div className="flex gap-2">
            {batchEnabled && <button type="button" disabled={saving || Boolean(pending) || !visible.length} className={btn} onClick={() =>
              setValues(current => ({ ...current, ...Object.fromEntries(visible.map(credit => [credit.id, String(credit.creditAmount)])) }))}>Pay All Due</button>}
            <button type="button" disabled={saving || Boolean(pending) || !selected.length} className={btn} onClick={() => setValues({})}>Clear</button>
          </div>
        </div>
        <input aria-label="Search pending bills" className={field} placeholder="Search bill number or date" value={billSearch} onChange={event => setBillSearch(event.target.value)} />
        {!visible.length && <p className="text-sm text-slate-500">{party ? 'No pending bills match your search.' : 'Choose a party to see pending bills.'}</p>}
        {visible.map(credit => (
          <div key={credit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div><p className="font-black">{credit.billNo}</p><p className="text-xs text-slate-600">{businessDateTime(credit.createdAt)} · Total {formatCurrency(credit.subtotal)} · Paid {formatCurrency(credit.amountPaid)}</p><b className="text-sm text-red-700">Due {formatCurrency(credit.creditAmount)}</b></div>
            <label className="w-32 text-xs font-bold">Pay amount
              <input aria-label={'Pay amount for ' + credit.billNo} type="number" min="0" max={credit.creditAmount} step="0.01" className={field}
                disabled={saving || Boolean(pending)} value={values[credit.id] ?? ''} onChange={event =>
                  setValues(current => ({ ...(batchEnabled ? current : {}), [credit.id]: event.target.value }))} />
            </label>
          </div>
        ))}
      </section>
    </div>
  );
}
