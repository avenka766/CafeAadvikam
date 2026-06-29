import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { money, useBranchOpsStore } from '../branchOpsStore';
import type { Branch } from '../types';

type EditableMode = 'cash' | 'upi' | 'card';

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
  editable: boolean;
};

const editableModes: EditableMode[] = ['cash', 'upi', 'card'];

function modeFromRow(row: PaymentRow): BillPayment['mode'] {
  if (row.bill_type === 'credit') return 'credit';
  const modes = Array.from(new Set((row.branch_sale_payments || [])
    .filter((payment) => Number(payment.amount || 0) > 0)
    .map((payment) => payment.payment_mode.toLowerCase())));
  if (modes.length > 1) return 'split';
  return editableModes.includes(modes[0] as EditableMode) ? modes[0] as EditableMode : 'unknown';
}

export function PaymentModeEditTab({ branch }: { branch: Branch }) {
  const { currentUser } = useAuthStore();
  const isVRSNB = branch === 'VRSNB';
  const { updateBillPaymentMode } = useBranchOpsStore();
  const [rows, setRows] = useState<BillPayment[]>([]);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, EditableMode>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
      const mode = modeFromRow(row);
      return {
        id: row.id,
        billNo: row.bill_no,
        billType: row.bill_type,
        salesperson: row.salesperson || 'Not recorded',
        biller: row.biller || 'Not recorded',
        total: Number(row.total || 0),
        createdAt: row.created_at,
        mode,
        editable: editableModes.includes(mode as EditableMode) && row.status !== 'returned',
      };
    });
    setRows(mapped);
    setDrafts(Object.fromEntries(mapped.filter((row) => row.editable).map((row) => [row.id, row.mode as EditableMode])));
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

  const save = async (row: BillPayment) => {
    const nextMode = drafts[row.id];
    if (!row.editable || !nextMode || nextMode === row.mode) return;
    setSavingId(row.id);
    setMessage('');
    const actor = currentUser?.displayName || currentUser?.username || 'Branch Staff';
    const { error } = await supabase.rpc('edit_branch_bill_payment_mode', {
      p_branch: branch,
      p_bill_id: row.id,
      p_new_mode: nextMode,
      p_changed_by: actor,
    });
    if (error) {
      setMessage(/edit_branch_bill_payment_mode|could not find the function|does not exist|schema cache/i.test(error.message)
        ? 'Payment Mode Edit migration is not installed. Run the latest Supabase migration before using this tab.'
        : `Payment mode was not changed: ${error.message}`);
      setSavingId(null);
      return;
    }
    updateBillPaymentMode(row.billNo, nextMode, actor);
    setRows((current) => current.map((bill) => bill.id === row.id ? { ...bill, mode: nextMode } : bill));
    setMessage(`${row.billNo} changed from ${row.mode.toUpperCase()} to ${nextMode.toUpperCase()}.`);
    setSavingId(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><CreditCard className="size-5" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Payment Mode Edit</h2>
            <p className="text-xs font-bold text-slate-500">Only the payment mode can be corrected. Bill amount and items stay locked.</p>
          </div>
        </div>
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isVRSNB ? 'Search bill or cashier' : 'Search bill, salesperson or cashier'} className="h-9 w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-blue-400" />
        </div>
      </div>
      {message && <p className={cn('mx-4 mt-3 rounded-xl px-3 py-2 text-sm font-black', message.includes(' changed ') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{message}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className={cn('w-full text-sm', isVRSNB ? 'min-w-[780px]' : 'min-w-[900px]')}>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Bill</th><th className="p-3">Date</th>{!isVRSNB && <th className="p-3">Salesperson</th>}<th className="p-3">Cashier</th><th className="p-3 text-right">Amount</th><th className="p-3">Current Mode</th><th className="p-3">Correct Mode</th><th className="p-3 text-right">Action</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={isVRSNB ? 7 : 8} className="p-8 text-center font-bold text-slate-500">Loading bill history...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={isVRSNB ? 7 : 8} className="p-8 text-center font-bold text-slate-500">No bills found.</td></tr>
                : filtered.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3 font-black text-slate-950">{row.billNo}</td>
                    <td className="p-3 text-slate-600">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                    {!isVRSNB && <td className="p-3 font-bold">{row.salesperson}</td>}
                    <td className="p-3">{row.biller}</td>
                    <td className="p-3 text-right font-black">{money(row.total)}</td>
                    <td className="p-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black uppercase text-slate-700">{row.mode}</span></td>
                    <td className="p-3">
                      {row.editable ? (
                        <select value={drafts[row.id] || row.mode} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value as EditableMode }))} className="h-9 w-40 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-black uppercase outline-none focus:border-blue-400">
                          <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                        </select>
                      ) : <span className="inline-flex items-center gap-1 text-xs font-black text-slate-400"><Lock className="size-3.5" /> Split, credit or returned bill</span>}
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => void save(row)} disabled={!row.editable || !drafts[row.id] || drafts[row.id] === row.mode || savingId === row.id} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                        <CheckCircle2 className="size-4" />{savingId === row.id ? 'Saving' : 'Update'}
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
