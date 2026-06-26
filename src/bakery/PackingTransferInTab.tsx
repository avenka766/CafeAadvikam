import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Loader2, Package, Printer, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

type SourceBranch = 'SNB' | 'VRSNB';
type Unit = 'kg' | 'pcs';
type TransferIn = {
  id: string;
  source_branch: SourceBranch;
  transfer_reference: string;
  item_name: string;
  expected_quantity: number;
  received_quantity: number;
  variance_quantity: number;
  unit: Unit;
  received_at: string;
  received_by: string;
  remarks: string | null;
  status: 'posted' | 'reversed';
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
};

const emptyForm = { source: 'SNB' as SourceBranch, reference: '', itemName: '', expected: '', received: '', unit: 'kg' as Unit, remarks: '' };

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

export default function PackingTransferInTab() {
  const { currentUser } = useAuthStore();
  const [rows, setRows] = useState<TransferIn[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    if (!currentUser?.id) {
      setError('Your staff session is missing. Sign out and sign in again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase.rpc('list_packing_transfer_in_secure');
    if (loadError) setError(`Unable to load Transfer In records: ${loadError.message}`);
    else setRows((data ?? []) as TransferIn[]);
    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.source_branch} ${row.transfer_reference} ${row.item_name} ${row.remarks ?? ''} ${row.status}`.toLowerCase().includes(q));
  }, [rows, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!currentUser?.id) return setError('Your staff session is missing. Sign out and sign in again.');
    const expected = Number(form.expected || 0);
    const received = Number(form.received || 0);
    if (!form.reference.trim()) return setError('Transfer reference is required.');
    if (!form.itemName.trim()) return setError('Item name is required.');
    if (!Number.isFinite(received) || received <= 0) return setError('Received quantity must be greater than zero.');
    if (!Number.isFinite(expected) || expected < 0) return setError('Expected quantity cannot be negative.');

    setSaving(true);
    const idempotencyKey = `${form.source}:${form.reference.trim()}:${form.itemName.trim().toLowerCase()}:${form.unit}`;
    const { error: saveError } = await supabase.rpc('post_packing_transfer_in_secure', {
      p_source_branch: form.source,
      p_transfer_reference: form.reference.trim(),
      p_item_name: form.itemName.trim(),
      p_expected_quantity: expected,
      p_received_quantity: received,
      p_unit: form.unit,
      p_remarks: form.remarks.trim(),
      p_idempotency_key: idempotencyKey,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.code === '23505' ? 'This transfer item has already been posted.' : saveError.message);
      return;
    }
    setForm(emptyForm);
    await loadRows();
  };

  const reverseRow = async (row: TransferIn) => {
    if (!currentUser?.id || row.status !== 'posted') return;
    const reason = window.prompt(`Reason for reversing ${row.item_name} from ${row.transfer_reference}:`);
    if (!reason?.trim()) return;
    const { error: reverseError } = await supabase.rpc('reverse_packing_transfer_in_secure', {
      p_id: row.id,
      p_reason: reason.trim(),
    });
    if (reverseError) setError(reverseError.message);
    else await loadRows();
  };

  const printRegister = () => {
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return;
    const body = filtered.map((row) => {
      const variance = Number(row.variance_quantity);
      return `<tr><td>${escapeHtml(new Date(row.received_at).toLocaleString('en-IN'))}</td><td>${escapeHtml(row.source_branch)}</td><td>${escapeHtml(row.transfer_reference)}</td><td>${escapeHtml(row.item_name)}</td><td>${escapeHtml(row.expected_quantity)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.received_quantity)} ${escapeHtml(row.unit)}</td><td>${variance.toFixed(3)}</td><td>${escapeHtml(row.status === 'reversed' ? 'Reversed' : variance === 0 ? 'Matched' : variance < 0 ? 'Shortage' : 'Excess / Leftover')}</td><td>${escapeHtml(row.received_by)}</td><td>${escapeHtml(row.remarks || row.reversal_reason || '-')}</td></tr>`;
    }).join('');
    win.document.write(`<!doctype html><html><head><title>Packing Transfer In Register</title><style>body{font-family:Arial;padding:22px;color:#111}h1{font-size:20px;margin:0 0 4px}.muted{font-size:11px;color:#666;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:7px;font-size:10px}th{background:#eee;text-align:left}@media print{button{display:none}}</style></head><body><h1>PACKING TRANSFER-IN REGISTER</h1><div class="muted">Generated ${escapeHtml(new Date().toLocaleString('en-IN'))}</div><table><thead><tr><th>Date</th><th>From</th><th>Reference</th><th>Item</th><th>Expected</th><th>Received</th><th>Variance</th><th>Status</th><th>Received By</th><th>Remarks</th></tr></thead><tbody>${body || '<tr><td colspan="10">No records</td></tr>'}</tbody></table></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 250);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Receive stock from SNB or VRSNB</h3>
          <p className="text-xs text-muted-foreground">Every receipt is posted centrally, added to the stock movement ledger, and retained for Admin/Owner audit.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadRows()} className="h-10 rounded-xl border bg-card px-4 text-xs font-bold flex items-center gap-2"><RefreshCw className="size-4" />Refresh</button>
          <button type="button" onClick={printRegister} className="h-10 rounded-xl border bg-card px-4 text-xs font-bold flex items-center gap-2"><Printer className="size-4" />Print Register</button>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <form onSubmit={submit} className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-black"><ArrowDownToLine className="size-4" />New Transfer In</div>
          <label className="block text-xs font-bold">Source branch<select value={form.source} onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as SourceBranch }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3"><option value="SNB">SNB</option><option value="VRSNB">VRSNB</option></select></label>
          <label className="block text-xs font-bold">Transfer reference *<input value={form.reference} onChange={(e) => setForm((v) => ({ ...v, reference: e.target.value }))} placeholder="Example: TRF-2026-001" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
          <label className="block text-xs font-bold">Item name *<input value={form.itemName} onChange={(e) => setForm((v) => ({ ...v, itemName: e.target.value }))} placeholder="Enter item name" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold">Expected<input type="number" min="0" step="0.001" value={form.expected} onChange={(e) => setForm((v) => ({ ...v, expected: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
            <label className="block text-xs font-bold">Received *<input type="number" min="0.001" step="0.001" value={form.received} onChange={(e) => setForm((v) => ({ ...v, received: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
          </div>
          <label className="block text-xs font-bold">Unit<select value={form.unit} onChange={(e) => setForm((v) => ({ ...v, unit: e.target.value as Unit }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3"><option value="kg">KG</option><option value="pcs">Pcs</option></select></label>
          <label className="block text-xs font-bold">Remarks<textarea value={form.remarks} onChange={(e) => setForm((v) => ({ ...v, remarks: e.target.value }))} placeholder="Shortage, excess, return or leftover reason" className="mt-1 min-h-24 w-full rounded-xl border bg-background p-3" /></label>
          <button type="submit" disabled={saving} className="h-11 w-full rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? 'Posting…' : 'Confirm Transfer In'}</button>
        </form>

        <div className="rounded-2xl border bg-card overflow-hidden min-w-0">
          <div className="border-b p-3 flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, branch or reference" className="h-9 flex-1 bg-transparent outline-none text-sm" /></div>
          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-[1020px] w-full text-xs">
              <thead className="sticky top-0 bg-slate-950 text-white"><tr>{['Date','From','Reference','Item','Expected','Received','Variance','Status','Received by','Action'].map((x) => <th key={x} className="p-3 text-left">{x}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="p-16 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></td></tr>}
                {!loading && filtered.map((row) => { const variance = Number(row.variance_quantity); return <tr key={row.id} className={`border-t ${row.status === 'reversed' ? 'bg-slate-50 text-slate-500 line-through' : ''}`}><td className="p-3">{new Date(row.received_at).toLocaleString('en-IN')}</td><td className="p-3 font-black">{row.source_branch}</td><td className="p-3">{row.transfer_reference}</td><td className="p-3 font-bold">{row.item_name}</td><td className="p-3">{row.expected_quantity} {row.unit}</td><td className="p-3">{row.received_quantity} {row.unit}</td><td className={`p-3 font-black ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{variance.toFixed(3)}</td><td className="p-3">{row.status === 'reversed' ? 'Reversed' : variance === 0 ? 'Matched' : variance < 0 ? 'Shortage' : 'Excess / Leftover'}</td><td className="p-3">{row.received_by}</td><td className="p-3">{row.status === 'posted' && <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-bold text-red-600" onClick={() => void reverseRow(row)}><RotateCcw className="size-3" />Reverse</button>}</td></tr>; })}
                {!loading && filtered.length === 0 && <tr><td colSpan={10} className="p-16 text-center text-muted-foreground"><Package className="size-8 mx-auto mb-2" />No transfer-in records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
