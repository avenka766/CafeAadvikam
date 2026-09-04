import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Loader2, Package, Plus, Printer, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { printViaIframe } from '@/lib/printViaIframe';
import { sanitizeQtyForUnit, requantizeForUnit } from './PlannerLeftoverTab';

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
  status: 'pending' | 'posted' | 'reversed';
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  request_reason?: string | null;
};

// AUDIT FIX (2026-09-05): "Need the ability to add multiple items at once."
// A transfer_reference is already a shared batch id one real physical
// transfer can carry several items under (the idempotency key below has
// always included item name specifically to support that) — this was
// purely a UI limitation forcing one full form-submit per item. Restructured
// around a per-line "draft" (item/expected/received/unit) that gets added to
// a `lines` cart before a single "Confirm Transfer In" posts every line,
// sharing the one source branch + reference + remarks — same shape as the
// GRN/Invoice multi-item forms elsewhere in this app.
type DraftLine = { itemName: string; expected: string; received: string; unit: Unit };
const emptyDraftLine: DraftLine = { itemName: '', expected: '', received: '', unit: 'kg' };
const emptyBatch = { source: 'SNB' as SourceBranch, reference: '', remarks: '' };

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

export default function PackingTransferInTab() {
  const { currentUser } = useAuthStore();
  const [rows, setRows] = useState<TransferIn[]>([]);
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState(emptyBatch);
  const [draft, setDraft] = useState<DraftLine>(emptyDraftLine);
  const [lines, setLines] = useState<DraftLine[]>([]);
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

  const addLine = () => {
    setError('');
    const received = Number(draft.received || 0);
    if (!draft.itemName.trim()) return setError('Enter an item name before adding it.');
    if (!Number.isFinite(received) || received <= 0) return setError('Received quantity must be greater than zero.');
    const expected = Number(draft.expected || 0);
    if (draft.expected.trim() !== '' && (!Number.isFinite(expected) || expected < 0)) return setError('Expected quantity cannot be negative.');
    setLines((v) => [...v, { ...draft, itemName: draft.itemName.trim() }]);
    setDraft({ ...emptyDraftLine, unit: draft.unit }); // keep the unit toggle, clear the rest
  };
  const removeLine = (index: number) => setLines((v) => v.filter((_, i) => i !== index));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!currentUser?.id) return setError('Your staff session is missing. Sign out and sign in again.');
    if (!batch.reference.trim()) return setError('Transfer reference is required.');
    if (lines.length === 0) return setError('Add at least one item before confirming.');

    setSaving(true);
    try {
      const failures: string[] = [];
      // AUDIT FIX (2026-09-05): posts one line at a time (same RPC, same
      // idempotency-key shape as before — source:reference:item:unit — a
      // real transfer with multiple items already worked this way at the
      // data level, just one form-submit per item). A failure on one line
      // doesn't abandon the rest, matching the "collect warnings, keep
      // going" pattern used across this app's other multi-item write paths
      // — the alternative (stopping at the first failure) would leave the
      // planner unsure which of several already-confirmed items to re-enter.
      for (const line of lines) {
        const expected = Number(line.expected || 0);
        const received = Number(line.received || 0);
        const idempotencyKey = `${batch.source}:${batch.reference.trim()}:${line.itemName.trim().toLowerCase()}:${line.unit}`;
        const { error: saveError } = await supabase.rpc('post_packing_transfer_in_secure', {
          p_source_branch: batch.source,
          p_transfer_reference: batch.reference.trim(),
          p_item_name: line.itemName.trim(),
          p_expected_quantity: expected,
          p_received_quantity: received,
          p_unit: line.unit,
          p_remarks: batch.remarks.trim(),
          p_idempotency_key: idempotencyKey,
        });
        if (saveError) {
          failures.push(`${line.itemName}: ${saveError.code === '23505' ? 'already posted' : saveError.message}`);
        }
      }
      if (failures.length > 0) {
        setError(`${lines.length - failures.length} of ${lines.length} item(s) posted. Failed: ${failures.join(' · ')}`);
      }
      // Clear only the lines that succeeded is unnecessary here — on a
      // partial failure the planner can see exactly which items failed
      // above and re-add just those; clearing everything on any outcome
      // keeps the form's behavior simple and predictable.
      setLines([]);
      setDraft(emptyDraftLine);
      if (failures.length === 0) setBatch(emptyBatch);
      await loadRows();
    } finally {
      setSaving(false);
    }
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

  // BUG FIX ("Planner dashboard print... nothing happens"): same broken
  // window.open('', '_blank', ...) + `if (!win) return;` pattern already
  // diagnosed and fixed for Planner's other print buttons — a blocked popup
  // makes `win` falsy and this used to just silently return. Switched to the
  // hidden-iframe pipeline (printViaIframe) so it can't be popup-blocked.
  const printRegister = () => {
    const body = filtered.map((row) => {
      const variance = Number(row.variance_quantity);
      return `<tr><td>${escapeHtml(new Date(row.received_at).toLocaleString('en-IN'))}</td><td>${escapeHtml(row.source_branch)}</td><td>${escapeHtml(row.transfer_reference)}</td><td>${escapeHtml(row.item_name)}</td><td>${escapeHtml(row.expected_quantity)} ${escapeHtml(row.unit)}</td><td>${escapeHtml(row.received_quantity)} ${escapeHtml(row.unit)}</td><td>${variance.toFixed(3)}</td><td>${escapeHtml(row.status === 'reversed' ? 'Reversed' : variance === 0 ? 'Matched' : variance < 0 ? 'Shortage' : 'Excess / Leftover')}</td><td>${escapeHtml(row.received_by)}</td><td>${escapeHtml(row.remarks || row.reversal_reason || '-')}</td></tr>`;
    }).join('');
    printViaIframe(`<!doctype html><html><head><title>Packing Transfer In Register</title><style>@page{size:auto;margin:6mm}@media print{html,body{height:auto !important}}body{font-family:Arial;padding:16px;color:#111}h1{font-size:20px;margin:0 0 4px}.muted{font-size:11px;color:#666;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:7px;font-size:10px}th{background:#eee;text-align:left}</style></head><body><h1>PACKING TRANSFER-IN REGISTER</h1><div class="muted">Generated ${escapeHtml(new Date().toLocaleString('en-IN'))}</div><table><thead><tr><th>Date</th><th>From</th><th>Reference</th><th>Item</th><th>Expected</th><th>Received</th><th>Variance</th><th>Status</th><th>Received By</th><th>Remarks</th></tr></thead><tbody>${body || '<tr><td colspan="10">No records</td></tr>'}</tbody></table></body></html>`);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Receive stock from SNB or VRSNB</h3>
          <p className="text-xs text-muted-foreground">Every receipt is posted centrally, added to the stock movement ledger, and retained for Admin/Owner audit. Branch-requested returns show up here as <b>Pending</b> once confirmed from Daily Closure ▸ Disputes &amp; Returns.</p>
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
          <label className="block text-xs font-bold">Source branch<select value={batch.source} onChange={(e) => setBatch((v) => ({ ...v, source: e.target.value as SourceBranch }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3"><option value="SNB">SNB</option><option value="VRSNB">VRSNB</option></select></label>
          <label className="block text-xs font-bold">Transfer reference *<input value={batch.reference} onChange={(e) => setBatch((v) => ({ ...v, reference: e.target.value }))} placeholder="Example: TRF-2026-001" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
          <label className="block text-xs font-bold">Remarks (applies to every item below)<textarea value={batch.remarks} onChange={(e) => setBatch((v) => ({ ...v, remarks: e.target.value }))} placeholder="Shortage, excess, return or leftover reason" className="mt-1 min-h-16 w-full rounded-xl border bg-background p-3" /></label>

          <div className="rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-3 space-y-2">
            <p className="text-xs font-black text-teal-900">Add an item</p>
            <label className="block text-xs font-bold">Item name<input value={draft.itemName} onChange={(e) => setDraft((v) => ({ ...v, itemName: e.target.value }))} placeholder="Enter item name" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-bold">Expected<input type="number" min="0" step={draft.unit === 'pcs' ? 1 : 0.001} value={draft.expected} onChange={(e) => setDraft((v) => ({ ...v, expected: sanitizeQtyForUnit(e.target.value, v.unit) }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
              <label className="block text-xs font-bold">Received *<input type="number" min="0.001" step={draft.unit === 'pcs' ? 1 : 0.001} value={draft.received} onChange={(e) => setDraft((v) => ({ ...v, received: sanitizeQtyForUnit(e.target.value, v.unit) }))} className="mt-1 h-11 w-full rounded-xl border bg-background px-3" /></label>
            </div>
            <label className="block text-xs font-bold">Unit<select value={draft.unit} onChange={(e) => { const nextUnit = e.target.value as Unit; setDraft((v) => ({ ...v, unit: nextUnit, expected: requantizeForUnit(v.expected, nextUnit), received: requantizeForUnit(v.received, nextUnit) })); }} className="mt-1 h-11 w-full rounded-xl border bg-background px-3"><option value="kg">KG</option><option value="pcs">Pcs</option></select></label>
            <button type="button" onClick={addLine} className="h-10 w-full rounded-xl bg-teal-600 text-white text-xs font-black flex items-center justify-center gap-2"><Plus className="size-4" />Add Item to Transfer</button>
          </div>

          {lines.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-black text-foreground">{lines.length} item{lines.length === 1 ? '' : 's'} in this transfer</p>
              {lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{line.itemName}</p>
                    <p className="text-muted-foreground">Expected {line.expected || '0'} · Received {line.received} {line.unit}</p>
                  </div>
                  <button type="button" onClick={() => removeLine(i)} aria-label={`Remove ${line.itemName}`} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-600"><X className="size-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <button type="submit" disabled={saving || lines.length === 0} className="h-11 w-full rounded-xl bg-teal-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? 'Posting…' : `Confirm Transfer In${lines.length > 0 ? ` (${lines.length})` : ''}`}</button>
        </form>

        <div className="rounded-2xl border bg-card overflow-hidden min-w-0">
          <div className="border-b p-3 flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, branch or reference" className="h-9 flex-1 bg-transparent outline-none text-sm" /></div>
          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-[1020px] w-full text-xs">
              <thead className="sticky top-0 bg-foreground text-white"><tr>{['Date','From','Reference','Item','Expected','Received','Variance','Status','Received by','Action'].map((x) => <th key={x} className="p-3 text-left">{x}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="p-16 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></td></tr>}
                {!loading && filtered.map((row) => { const variance = Number(row.variance_quantity); return <tr key={row.id} className={`border-t ${row.status === 'reversed' ? 'bg-muted/40 text-muted-foreground line-through' : row.status === 'pending' ? 'bg-blue-50/60' : ''}`}><td className="p-3">{new Date(row.received_at).toLocaleString('en-IN')}</td><td className="p-3 font-black">{row.source_branch}</td><td className="p-3">{row.transfer_reference}</td><td className="p-3 font-bold">{row.item_name}</td><td className="p-3">{row.expected_quantity} {row.unit}</td><td className="p-3">{row.status === 'pending' ? '—' : `${row.received_quantity} ${row.unit}`}</td><td className={`p-3 font-black ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-amber-600' : 'text-teal-600'}`}>{row.status === 'pending' ? '—' : variance.toFixed(3)}</td><td className="p-3">{row.status === 'pending' ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-700">Pending — Confirm in Daily Closure</span> : row.status === 'reversed' ? 'Reversed' : variance === 0 ? 'Matched' : variance < 0 ? 'Shortage' : 'Excess / Leftover'}</td><td className="p-3">{row.status === 'pending' ? (row.requested_by || '-') : row.received_by}</td><td className="p-3">{row.status === 'posted' && <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-bold text-red-600" onClick={() => void reverseRow(row)}><RotateCcw className="size-3" />Reverse</button>}</td></tr>; })}
                {!loading && filtered.length === 0 && <tr><td colSpan={10} className="p-16 text-center text-muted-foreground"><Package className="size-8 mx-auto mb-2" />No transfer-in records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
