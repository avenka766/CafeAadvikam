import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { money, useBranchOpsStore } from '../branchOpsStore';
import type { Branch } from '../types';

type EditableMode = 'cash' | 'upi' | 'card';
type Allocation = Record<EditableMode, string>;

type PaymentRow = {
  id: string;
  bill_no: string;
  bill_type: string;
  salesperson: string | null;
  biller: string | null;
  total: number | string;
  status: string;
  created_at: string;
  branch_sale_payments?: Array<{ payment_mode: string; amount: number | string }>;
};

type BillPayment = {
  id: string;
  billNo: string;
  billType: string;
  salesperson: string;
  biller: string;
  total: number;
  createdAt: string;
  mode: EditableMode | 'split' | 'credit' | 'unknown';
  allocation: Record<EditableMode, number>;
  editable: boolean;
};

const editableModes: EditableMode[] = ['cash', 'upi', 'card'];
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function allocationFromRow(row: PaymentRow) {
  const allocation = { cash: 0, upi: 0, card: 0 };
  for (const payment of row.branch_sale_payments || []) {
    const mode = payment.payment_mode.toLowerCase() as EditableMode;
    if (editableModes.includes(mode)) allocation[mode] = roundMoney(allocation[mode] + Number(payment.amount || 0));
  }
  return allocation;
}

function modeFromAllocation(row: PaymentRow, allocation: Record<EditableMode, number>): BillPayment['mode'] {
  if (row.bill_type === 'credit') return 'credit';
  const modes = editableModes.filter((mode) => allocation[mode] > 0);
  if (modes.length > 1) return 'split';
  return modes[0] || 'unknown';
}

export function PaymentModeEditTab({ branch }: { branch: Branch }) {
  const { currentUser } = useAuthStore();
  const isVRSNB = branch === 'VRSNB';
  const { updateBillPaymentMode } = useBranchOpsStore();
  const [rows, setRows] = useState<BillPayment[]>([]);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Allocation>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [convertingRow, setConvertingRow] = useState<BillPayment | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('branch_bill_headers')
      .select('id, bill_no, bill_type, salesperson, biller, total, status, created_at, branch_sale_payments(payment_mode, amount)')
      .eq('branch', branch)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      setRows([]);
      setMessage(/branch_bill_headers|does not exist|schema cache/i.test(error.message)
        ? 'The Supabase branch bill ledger is not installed, so payment modes cannot be edited safely.'
        : `Could not load bill history: ${error.message}`);
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as PaymentRow[]).map((row) => {
      const allocation = allocationFromRow(row);
      const mode = modeFromAllocation(row, allocation);
      return {
        id: row.id,
        billNo: row.bill_no,
        billType: row.bill_type,
        salesperson: row.salesperson || 'Not recorded',
        biller: row.biller || 'Not recorded',
        total: Number(row.total || 0),
        createdAt: row.created_at,
        mode,
        allocation,
        editable: row.bill_type !== 'credit' && row.status !== 'returned',
      };
    });
    setRows(mapped);
    setDrafts(Object.fromEntries(mapped.map((row) => [row.id, {
      cash: row.allocation.cash ? String(row.allocation.cash) : '',
      upi: row.allocation.upi ? String(row.allocation.upi) : '',
      card: row.allocation.card ? String(row.allocation.card) : '',
    }])));
    setLoading(false);
  }, [branch]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return rows.filter((row) => !value
      || row.billNo.toLowerCase().includes(value)
      || (!isVRSNB && row.salesperson.toLowerCase().includes(value))
      || row.biller.toLowerCase().includes(value));
  }, [isVRSNB, query, rows]);

  const draftTotal = (id: string) => {
    const draft = drafts[id] || { cash: '', upi: '', card: '' };
    return roundMoney(editableModes.reduce((sum, mode) => sum + Number(draft[mode] || 0), 0));
  };

  const fillRemaining = (row: BillPayment, field: EditableMode) => {
    setDrafts((current) => {
      const draft = current[row.id] || { cash: '', upi: '', card: '' };
      const other = editableModes.filter((mode) => mode !== field).reduce((sum, mode) => sum + Number(draft[mode] || 0), 0);
      return { ...current, [row.id]: { ...draft, [field]: String(roundMoney(Math.max(0, row.total - other))) } };
    });
  };

  const save = async (row: BillPayment) => {
    const draft = drafts[row.id];
    if (!row.editable || !draft) return;
    const allocations = editableModes.map((mode) => ({ mode, amount: roundMoney(Number(draft[mode] || 0)) })).filter((entry) => entry.amount > 0);
    if (!allocations.length || draftTotal(row.id) !== roundMoney(row.total)) {
      setMessage(`Split allocation for ${row.billNo} must equal ${money(row.total)} exactly.`);
      return;
    }
    setSavingId(row.id);
    setMessage('');
    const actor = currentUser?.username || currentUser?.displayName || 'Branch Staff';
    let { error } = await supabase.rpc('edit_branch_bill_payment_allocations', {
      p_branch: branch,
      p_bill_id: row.id,
      p_allocations: allocations,
      p_changed_by: actor,
    });
    if (error && allocations.length === 1 && /edit_branch_bill_payment_allocations|could not find the function|does not exist|schema cache/i.test(error.message)) {
      const legacy = await supabase.rpc('edit_branch_bill_payment_mode', {
        p_branch: branch,
        p_bill_id: row.id,
        p_new_mode: allocations[0].mode,
        p_changed_by: actor,
      });
      error = legacy.error;
    }
    if (error) {
      setMessage(/edit_branch_bill_payment_allocations|could not find the function|does not exist|schema cache/i.test(error.message)
        ? 'The split-payment edit migration is not installed. Apply the latest Supabase migration before using this tab.'
        : `Payment allocation was not changed: ${error.message}`);
      setSavingId(null);
      return;
    }
    const nextAllocation = { cash: 0, upi: 0, card: 0 };
    allocations.forEach((entry) => { nextAllocation[entry.mode] = entry.amount; });
    const nextMode = allocations.length > 1 ? 'split' : allocations[0].mode;
    if (allocations.length === 1) updateBillPaymentMode(row.billNo, allocations[0].mode, actor);
    setRows((current) => current.map((bill) => bill.id === row.id ? { ...bill, mode: nextMode, allocation: nextAllocation } : bill));
    setMessage(`${row.billNo} payment allocation was updated and audited.`);
    setSavingId(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><CreditCard className="size-5" /></div>
          <div><h2 className="text-base font-black text-slate-950 sm:text-lg">Payment Mode Edit</h2><p className="text-[11px] font-bold text-slate-500">Cash, UPI, Card and split allocations can be corrected; bill items and amount remain locked.</p></div>
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isVRSNB ? 'Search bill or cashier' : 'Search bill, salesperson or cashier'} className="h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-blue-400" /></div>
      </div>
      {message && <p className={cn('mx-3 mt-2 shrink-0 rounded-xl px-3 py-2 text-sm font-black', message.includes('updated') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{message}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <table className={cn('w-full text-sm', isVRSNB ? 'min-w-[920px]' : 'min-w-[1040px]')}>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500"><tr><th className="p-2">Bill</th><th className="p-2">Date</th>{!isVRSNB && <th className="p-2">Salesperson</th>}<th className="p-2">Cashier</th><th className="p-2 text-right">Amount</th><th className="p-2">Current</th><th className="p-2">Correct Allocation</th><th className="p-2 text-right">Action</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={isVRSNB ? 7 : 8} className="p-8 text-center font-bold text-slate-500">Loading bill history...</td></tr> : filtered.length === 0 ? <tr><td colSpan={isVRSNB ? 7 : 8} className="p-8 text-center font-bold text-slate-500">No bills found.</td></tr> : filtered.map((row) => {
            const valid = draftTotal(row.id) === roundMoney(row.total);
            return <tr key={row.id} className="border-t border-slate-100 align-middle">
              <td className="p-2 font-black text-slate-950">{row.billNo}</td><td className="p-2 text-xs text-slate-600">{new Date(row.createdAt).toLocaleString('en-IN')}</td>{!isVRSNB && <td className="p-2 font-bold">{row.salesperson}</td>}<td className="p-2">{row.biller}</td><td className="p-2 text-right font-black">{money(row.total)}</td><td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black uppercase text-slate-700">{row.mode}</span></td>
              <td className="p-2">{row.editable ? <div><div className="grid grid-cols-3 gap-1">{editableModes.map((mode) => <div key={mode} className="flex overflow-hidden rounded-lg border"><input type="number" min="0" max={row.total} value={drafts[row.id]?.[mode] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...(current[row.id] || { cash:'',upi:'',card:'' }), [mode]: event.target.value } }))} placeholder={mode.toUpperCase()} className="h-8 min-w-0 flex-1 px-2 text-xs font-black outline-none"/><button type="button" onClick={() => fillRemaining(row, mode)} className="border-l bg-slate-100 px-1 text-[8px] font-black">REST</button></div>)}</div><p className={cn('mt-1 text-[10px] font-black', valid ? 'text-emerald-600' : 'text-red-600')}>{money(draftTotal(row.id))} / {money(row.total)}</p></div> : <span className="inline-flex items-center gap-1 text-xs font-black text-slate-400"><Lock className="size-3.5" /> Credit or returned bill</span>}</td>
              <td className="p-2 text-right"><div className="flex flex-col items-end gap-1"><button onClick={() => void save(row)} disabled={!row.editable || !valid || savingId === row.id} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="size-4" />{savingId === row.id ? 'Saving' : 'Update'}</button>{row.editable && <button onClick={() => setConvertingRow(row)} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-700">Convert to Credit</button>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {convertingRow && (
        <ConvertToCreditModal
          branch={branch}
          row={convertingRow}
          onClose={() => setConvertingRow(null)}
          onConverted={(text) => { setConvertingRow(null); setMessage(text); void loadRows(); }}
        />
      )}
    </section>
  );
}

function ConvertToCreditModal({ branch, row, onClose, onConverted }: {
  branch: Branch;
  row: BillPayment;
  onClose: () => void;
  onConverted: (message: string) => void;
}) {
  const { currentUser } = useAuthStore();
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amountPaid, setAmountPaid] = useState('0');
  const [amountPaidMode, setAmountPaidMode] = useState<EditableMode>('cash');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amountPaidNum = Math.max(0, Math.min(row.total, Number(amountPaid) || 0));
  const creditAmount = roundMoney(row.total - amountPaidNum);

  const submit = async () => {
    if (!customerName.trim() || !customerMobile.trim() || !dueDate) {
      setError('Customer name, mobile and due date are required for a credit bill.');
      return;
    }
    if (!reason.trim() || !password) {
      setError('Reason and login password are required.');
      return;
    }
    if (creditAmount <= 0) {
      setError('Nothing left to convert - reduce the amount already collected.');
      return;
    }
    setSaving(true);
    setError('');
    const actor = currentUser?.username || currentUser?.displayName || 'Branch Staff';
    const { error: rpcError } = await supabase.rpc('convert_branch_bill_to_credit_secure', {
      p_branch: branch,
      p_bill_id: row.id,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerMobile.trim(),
      p_due_date: dueDate,
      p_amount_paid: amountPaidNum,
      p_amount_paid_mode: amountPaidMode,
      p_reason: reason.trim(),
      p_password: password,
      p_changed_by: actor,
    });
    setSaving(false);
    if (rpcError) {
      if (rpcError.message.includes('INVALID_PASSWORD')) { setError('Incorrect login password.'); return; }
      if (/convert_branch_bill_to_credit_secure|could not find the function|does not exist|schema cache/i.test(rpcError.message)) {
        setError('The convert-to-credit migration is not installed. Apply the latest Supabase migration before using this action.');
        return;
      }
      setError(rpcError.message);
      return;
    }
    onConverted(`${row.billNo} was converted to a credit bill (${money(creditAmount)} owed).`);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-3">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950">Convert to Credit Bill</h3>
            <p className="text-sm font-bold text-slate-500">{row.billNo} - {money(row.total)}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl bg-slate-100"><X className="size-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Customer Name *</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Customer Mobile *</label>
            <input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Due Date *</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Already Collected</label>
              <input type="number" min="0" max={row.total} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
            </div>
            {amountPaidNum > 0 && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Collected Via</label>
                <select value={amountPaidMode} onChange={(e) => setAmountPaidMode(e.target.value as EditableMode)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400">
                  {editableModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="rounded-xl bg-amber-50 p-3 text-sm font-black text-amber-800">Credit amount owed: {money(creditAmount)}</div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Reason *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being converted to a credit bill?" className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Login Password *</label>
            <input type="password" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700">Back</button>
            <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-sm font-black text-white disabled:opacity-50">{saving ? 'Converting...' : 'Convert to Credit'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
