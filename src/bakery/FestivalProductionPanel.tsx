import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Factory, Loader2, RefreshCw, Search } from 'lucide-react';
import { useBranchCatalogStore } from '@/stores/branchCatalogStore';
import { downloadFestivalReport, festivalSummary, festivalToday, fetchFestivalProduction, saveFestivalProduction, validateFestivalInput, type FestivalEntry, type FestivalInput } from './festivalProduction';

const field = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50';
type Choice = { name: string; branch: 'SNB' | 'VRSNB'; barcode: number; unit: 'kg' | 'pcs' };

export default function FestivalProductionPanel({ reportOnly = false }: { reportOnly?: boolean }) {
  const today = festivalToday();
  const { items, loadCatalog } = useBranchCatalogStore();
  const [festival, setFestival] = useState('');
  const [itemName, setItemName] = useState('');
  const [selected, setSelected] = useState<Choice | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 'pcs'>('kg');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [from, setFrom] = useState(reportOnly ? `${today.slice(0, 7)}-01` : today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<FestivalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const inFlight = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => { if (!reportOnly) { void loadCatalog('SNB'); void loadCatalog('VRSNB'); } }, [loadCatalog, reportOnly]);
  const choices = useMemo(() => (['VRSNB', 'SNB'] as const).flatMap(branch => (items[branch] || []).filter(item => item.active).map(item => ({
    name: item.name, branch, barcode: item.barcode, unit: /^kg/i.test(item.uom) ? 'kg' as const : 'pcs' as const,
  }))).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const matches = useMemo(() => choices.filter(item => item.name.toLowerCase().includes(itemName.toLowerCase().trim())).slice(0, 40), [choices, itemName]);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(''); setRows([]); setPage(1);
    void fetchFestivalProduction(from, to).then(data => { if (active) setRows(data); }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load festival production.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, revision]);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const filtered = useMemo(() => rows.filter(row => [row.item_name, row.festival_name, row.recorded_by_name, row.catalog_branch || 'Custom item', row.notes].some(text => text.toLowerCase().includes(search.toLowerCase()))), [rows, search]);
  const totals = festivalSummary(filtered);
  const totalKg = filtered.filter(row => row.unit === 'kg').reduce((sum, row) => sum + row.quantity, 0);
  const totalPcs = filtered.filter(row => row.unit === 'pcs').reduce((sum, row) => sum + row.quantity, 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pageCount);
  const save = async () => {
    if (inFlight.current) return;
    setSaveError(''); setMessage('');
    const input: FestivalInput = { business_date: date, festival_name: festival.trim() || 'Festival Production', item_name: itemName.trim(),
      catalog_branch: selected?.branch || null, catalog_barcode: selected?.barcode ?? null, quantity: Number(quantity), unit, notes: notes.trim() };
    const error = validateFestivalInput(input);
    if (error) { setSaveError(error); return; }
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    inFlight.current = true; setSaving(true);
    try {
      await saveFestivalProduction(request.current.id, input);
      setMessage(`${input.item_name}: ${input.quantity} ${unit} saved to Festival Production.`);
      request.current = null; setItemName(''); setSelected(null); setQuantity(''); setNotes('');
      setFrom(date); setTo(date); refresh();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Unable to save festival production. Your entry is still here; retry when connected.'); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <section className="space-y-4">
    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4"><h2 className="flex items-center gap-2 text-lg font-black text-purple-950"><Factory className="size-5" />Festival Production</h2><p className="mt-1 text-sm text-purple-800">A separate production register. These quantities do not change normal production, dispatch, or closing stock.</p></div>
    {!reportOnly && <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold">Festival / batch name (optional)<input aria-label="Festival or batch name" maxLength={120} value={festival} onChange={e => setFestival(e.target.value)} placeholder="e.g. Deepavali sweets" className={field} /></label><label className="space-y-1 text-xs font-bold">Production date<input aria-label="Festival production date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={field} required /></label></div>
      <div className="relative"><label className="block space-y-1 text-xs font-bold">Item — VRSNB, SNB or a custom name<input role="combobox" aria-expanded={pickerOpen} aria-controls="festival-item-options" aria-autocomplete="list" aria-label="Festival production item" autoComplete="off" maxLength={240} value={itemName} onChange={e => { setItemName(e.target.value); setSelected(null); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)} onBlur={() => setTimeout(() => setPickerOpen(false), 150)} onKeyDown={e => { if (e.key === 'Escape') setPickerOpen(false); }} placeholder="Search an item or type a new item name…" className={field} required /></label>
        {pickerOpen && <div id="festival-item-options" role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-card shadow-xl">{matches.map(item => <button type="button" role="option" aria-selected={selected?.branch === item.branch && selected?.barcode === item.barcode} key={`${item.branch}-${item.barcode}`} onMouseDown={e => e.preventDefault()} onClick={() => { setSelected(item); setItemName(item.name); setUnit(item.unit); setPickerOpen(false); }} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"><span>{item.name}</span><span className="text-xs font-bold text-muted-foreground">{item.branch} · {item.unit}</span></button>)}<button type="button" className="w-full border-t px-3 py-2 text-left text-sm font-semibold text-purple-700" disabled={!itemName.trim()} onMouseDown={e => e.preventDefault()} onClick={() => { setSelected(null); setPickerOpen(false); }}>Use “{itemName.trim() || 'typed name'}” as a custom item</button></div>}
        <p className="mt-1 text-xs text-muted-foreground">{selected ? `${selected.branch} catalogue item · ${selected.barcode}` : 'Typed names are saved as custom festival items. The normal catalogue is not changed.'}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label className="space-y-1 text-xs font-bold">Produced quantity<input aria-label="Festival produced quantity" type="number" min={unit === 'pcs' ? 1 : .001} step={unit === 'pcs' ? 1 : .001} value={quantity} onChange={e => setQuantity(e.target.value)} className={field} required /></label><label className="space-y-1 text-xs font-bold">Unit<select aria-label="Festival production unit" value={unit} onChange={e => setUnit(e.target.value as 'kg' | 'pcs')} className={field}><option value="kg">kg</option><option value="pcs">pcs</option></select></label></div>
      <label className="block space-y-1 text-xs font-bold">Notes<textarea aria-label="Festival production notes" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className={field} rows={2} /></label>
      {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}{message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <button type="submit" disabled={saving} className={`${button} bg-purple-700 text-white`}>{saving && <Loader2 className="size-4 animate-spin" />}{saving ? 'Saving…' : 'Record Festival Production'}</button>
    </form>}
    <div className="rounded-2xl border border-border bg-card p-4"><div className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold">From<input aria-label="Festival report from" type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} /></label><label className="text-xs font-bold">To<input aria-label="Festival report to" type="date" value={to} onChange={e => setTo(e.target.value)} className={field} /></label><label className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border px-3 py-2"><Search className="size-4" /><input aria-label="Search festival report" placeholder="Search festival, item or staff…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full bg-transparent text-sm outline-none" /></label><button type="button" onClick={refresh} disabled={loading} className={button}><RefreshCw className="size-4" />Refresh</button><button type="button" disabled={loading || !!loadError || !filtered.length} onClick={() => downloadFestivalReport(filtered, from, to)} className={`${button} bg-purple-700 text-white`}><Download className="size-4" />Festival Excel</button></div>
      {loadError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Festival report could not be loaded: {loadError}</p> : loading ? <p className="py-8 text-center text-sm">Loading festival production…</p> : <>
        <div className="my-4 grid grid-cols-3 gap-3">{[[filtered.length, 'Entries'], [Number(totalKg.toFixed(3)), 'Kilograms'], [totalPcs, 'Pieces']].map(([value, label]) => <div key={label} className="rounded-xl bg-purple-50 p-3"><p className="text-xl font-black text-purple-950">{value}</p><p className="text-xs text-purple-800">{label}</p></div>)}</div>
        <p className="mb-3 text-xs text-muted-foreground">Excel includes all {filtered.length} matching entries and a separate item summary. Kilograms and pieces are never added together.</p>
        <div className="overflow-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted text-xs"><tr>{['Date', 'Festival / batch', 'Item', 'Catalogue', 'Quantity', 'Unit', 'Recorded by', 'Notes'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{filtered.slice((currentPage - 1) * 50, currentPage * 50).map(row => <tr className="border-t" key={row.id}><td className="p-3">{row.business_date}</td><td className="p-3">{row.festival_name}</td><td className="p-3 font-bold">{row.item_name}</td><td className="p-3">{row.catalog_branch || 'Custom item'}</td><td className="p-3 tabular-nums">{row.quantity}</td><td className="p-3">{row.unit}</td><td className="p-3">{row.recorded_by_name}</td><td className="max-w-64 whitespace-pre-wrap break-words p-3">{row.notes}</td></tr>)}</tbody></table></div>
        {!filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">No festival production matches this date range and search.</p>}
        {pageCount > 1 && <div className="mt-3 flex items-center justify-end gap-3 text-sm"><button className={button} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pageCount}</span><button className={button} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        {totals.length > 0 && <details className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-bold">Festival item summary ({totals.length})</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{totals.map((row, index) => <p className="rounded-lg bg-muted p-3 text-sm" key={index}><strong>{row.Item}</strong> · {row.Festival} · {row['Catalogue branch']}<br />{row.Quantity} {row.Unit} from {row.Entries} entries</p>)}</div></details>}
      </>}
    </div>
  </section>;
}
