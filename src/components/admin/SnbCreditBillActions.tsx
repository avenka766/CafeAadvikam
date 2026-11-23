import { useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CreditSale } from '@/branch/branchStore';

const field = 'w-full rounded-lg border bg-white px-3 py-2 text-sm';
const button = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50';

export default function SnbCreditBillActions({ credit, onSaved }: {
  credit: CreditSale;
  onSaved: () => Promise<void>;
}) {
  const [action, setAction] = useState<'edit' | 'cancel' | null>(null);
  const original = { name: credit.customerName, phone: credit.customerPhone, dueDate: credit.dueDate };
  const [draft, setDraft] = useState(original);
  const [expectedDue, setExpectedDue] = useState(credit.creditAmount);
  const [reason, setReason] = useState('');
  const [refundMode, setRefundMode] = useState('');
  const [returned, setReturned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const originalEdit = useRef(original);
  const canCancel = ['branch_checkout', 'payment_mode_edit'].includes(credit.source ?? '');
  const open = (next: 'edit' | 'cancel') => {
    originalEdit.current = original;
    setDraft(original);
    setExpectedDue(credit.creditAmount);
    setReason('');
    setRefundMode('');
    setReturned(false);
    setMessage('');
    setAction(next);
  };
  const save = async () => {
    if (!action || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setMessage('');
    try {
      const result = action === 'edit'
        ? await supabase.rpc('edit_snb_credit_bill_v1', {
            p_credit_id: credit.id, p_original: originalEdit.current, p_name: draft.name,
            p_phone: draft.phone || null, p_due_date: draft.dueDate || null,
          })
        : await supabase.rpc('cancel_snb_credit_bill_v1', {
            p_credit_id: credit.id, p_expected_due: expectedDue, p_reason: reason.trim(),
            p_refund_mode: refundMode || null, p_items_returned: returned,
          });
      if (result.error) throw Error(result.error.message);
      setAction(null);
      setMessage(action === 'edit' ? 'Credit bill details updated.' : 'Credit bill cancelled and return recorded.');
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the credit bill.');
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  };

  if (credit.cancelledAt) return null;
  return (
    <div className="space-y-2">
      {!action ? <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open('edit')} className={button}><Pencil className="size-3.5" /> Edit credit bill</button>
        {canCancel && <button type="button" onClick={() => open('cancel')} className={button + ' text-red-700'}><X className="size-3.5" /> Cancel credit bill</button>}
      </div> : (
        <form className="space-y-3 rounded-xl border bg-white p-3" onSubmit={event => { event.preventDefault(); void save(); }}>
          {action === 'edit' ? <>
            <label className="block text-xs font-bold">Customer name<input required maxLength={120} className={field} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="block text-xs font-bold">Phone<input type="tel" maxLength={40} className={field} value={draft.phone ?? ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label className="block text-xs font-bold">Due date<input type="date" className={field} value={draft.dueDate ?? ''} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
          </> : <>
            <label className="block text-xs font-bold">Cancellation reason<textarea className={field} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
            {credit.amountPaid > 0 && <label className="block text-xs font-bold">Refund method<select required className={field} value={refundMode} onChange={event => setRefundMode(event.target.value)}>
              <option value="">Select refund method</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
            </select></label>}
            <label className="flex items-start gap-2 text-xs font-semibold"><input type="checkbox" required checked={returned} onChange={event => setReturned(event.target.checked)} />All items were physically returned to stock.</label>
          </>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={button + ' bg-slate-950 text-white'}>{saving ? 'Saving…' : action === 'edit' ? 'Save changes' : 'Confirm cancellation'}</button>
            <button type="button" disabled={saving} onClick={() => setAction(null)} className={button}>Back</button>
          </div>
        </form>
      )}
      {message && <p role="status" className="text-xs font-semibold">{message}</p>}
    </div>
  );
}
