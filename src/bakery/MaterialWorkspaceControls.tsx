import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, PackageOpen, RefreshCw, Upload } from 'lucide-react';
import { dateKey, materialRequest, type Material } from './materialWorkspace';
import { readMaterialWorkbook, type MaterialSheet } from './materialWorkspaceExcel';

export const fieldClass = 'min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
export const panelClass = 'rounded-xl border bg-card p-4 shadow-sm sm:p-5';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Please try again.';
type WriteAction = Parameters<typeof materialRequest>[0];

export function useMaterialWorkspace<T>(action: 'stock_read' | 'purchase_read') {
  const [dates, setDates] = useState(() => ({ from: dateKey(), through: dateKey() }));
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState('');
  const [message, setMessage] = useState('');
  const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const reads = useRef(0);
  const realtimeId = useRef<string>();
  const backgroundReload = useRef<() => void>(() => undefined);
  const retries = useRef(new Map<string, string>());

  const reload = useCallback(async (quiet = false) => {
    const sequence = ++reads.current;
    if (!quiet) setLoading(true);
    try {
      const next = await materialRequest<T>(action, dates);
      if (sequence === reads.current) {
        setData(next);
        setReadError('');
      }
    } catch (error) {
      if (sequence === reads.current) setReadError(errorText(error));
    } finally {
      if (sequence === reads.current) setLoading(false);
    }
  }, [action, dates]);

  useEffect(() => {
    backgroundReload.current = () => { if (!document.hidden) void reload(true); };
    void reload();
    const refresh = () => { if (!document.hidden) void reload(true); };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener('focus', refresh);
    return () => {
      reads.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [reload]);

  useEffect(() => {
    realtimeId.current ??= crypto.randomUUID();
    let timer: number | undefined;
    const channel = supabase.channel('material-workspace-' + realtimeId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_raw_stock' }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => backgroundReload.current(), 300);
      }).subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, []);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setWriteError('');
    setMessage('');
    try {
      await task();
      if (success) setMessage(success);
      return true;
    } catch (error) {
      setWriteError(errorText(error));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const save = async (writeAction: WriteAction, payload: object, success: string) => run(async () => {
    const key = JSON.stringify([writeAction, payload]);
    const request = retries.current.get(key) ?? crypto.randomUUID();
    retries.current.set(key, request);
    await materialRequest(writeAction, payload, request);
    retries.current.delete(key);
    await reload(true);
  }, success);

  return { dates, setDates, data, loading, readError, message, writeError, busy, reload, save, run, clearError: () => setWriteError('') };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export function WorkspaceHeader({ title, subtitle, icon, tools }: { title: string; subtitle: string; icon: ReactNode; tools?: ReactNode }) {
  return <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-5 text-white sm:px-7">
    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-300/15 text-teal-200">{icon}</div>
      <div className="min-w-0 break-words"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1><p className="text-sm text-slate-300">{subtitle}</p></div>
    </div>
    {tools && <div className="flex flex-wrap gap-2">{tools}</div>}
  </header>;
}

export function WorkspaceTabs<T extends string>({ tabs, active, change, vertical = false }: { tabs: readonly T[]; active: T; change: (tab: T) => void; vertical?: boolean }) {
  return <nav aria-label="Dashboard sections" className={('flex gap-1.5 rounded-xl border bg-muted/40 p-1.5 ' + (vertical ? 'flex-col' : 'flex-wrap'))}>
    {tabs.map(tab => <button key={tab} type="button" aria-current={active === tab ? 'page' : undefined}
      className={'rounded-lg px-3 py-2 text-sm font-medium ' + (vertical ? 'text-left ' : '') + (active === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
      onClick={() => change(tab)}>{tab}</button>)}
  </nav>;
}

export function DateFilter({ dates, change, refresh, loading }: {
  dates: { from: string; through: string };
  change: (next: { from: string; through: string }) => void; refresh: () => void; loading: boolean;
}) {
  const today = dateKey();
  return <div className="flex flex-wrap items-end gap-3">
    <Field label="From"><Input type="date" required value={dates.from} max={dates.through}
      onChange={event => { if (event.target.value) change({ ...dates, from: event.target.value }); }} /></Field>
    <Field label="Through"><Input type="date" required value={dates.through} min={dates.from} max={today}
      onChange={event => { if (event.target.value) change({ ...dates, through: event.target.value }); }} /></Field>
    <Button variant="outline" type="button" disabled={loading} onClick={refresh}><RefreshCw className="size-4" /> Refresh</Button>
  </div>;
}

type SortValue = ReactNode | Date;
const columnCollator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' });

function cellSortValue(value: SortValue): string | number | null {
  if (value == null || typeof value === 'boolean') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text === '-' || text === '—') return null;
  // The report sheets display English day-month-year dates.
  if (/^\d{1,2} [A-Za-z]{3} \d{4}$/.test(text)) {
    const time = Date.parse(text + ' UTC');
    if (Number.isFinite(time)) return time;
  }
  return text;
}

export function MaterialTable({ headings, rows, sortValues, empty, label }: {
  headings: string[]; rows: ReactNode[][]; sortValues?: SortValue[][]; empty: string; label: string;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ column: number; direction: 'ascending' | 'descending' }>();
  const ordered = useMemo(() => {
    if (!sort) return rows.map((cells, index) => ({ cells, index }));
    return rows.map((cells, index) => ({
      cells, index, value: cellSortValue((sortValues?.[index] ?? cells)[sort.column]),
    })).sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      const comparison = typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value : columnCollator.compare(String(a.value), String(b.value));
      return (sort.direction === 'ascending' ? comparison : -comparison) || a.index - b.index;
    });
  }, [rows, sort, sortValues]);
  const sortColumn = (column: number) => {
    setSort(current => ({ column, direction: current?.column === column && current.direction === 'ascending' ? 'descending' : 'ascending' }));
    setPage(0);
  };
  const count = Math.max(1, Math.ceil(rows.length / 25));
  const shownPage = Math.min(page, count - 1);
  if (!rows.length) return <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-7 text-sm text-muted-foreground">
    <PackageOpen className="size-5" />{empty}
  </div>;
  return <div className="space-y-3">
    <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0} aria-label={label}>
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
          <tr>{headings.map((heading, column) => {
            const direction = sort?.column === column ? sort.direction : undefined;
            const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown;
            return <th key={heading} scope="col" aria-sort={direction} className="whitespace-nowrap px-3 py-2.5 font-semibold">
              <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded text-left focus-visible:outline focus-visible:outline-2"
                onClick={() => sortColumn(column)} aria-label={'Sort by ' + heading}>
                {heading}<Icon className={'size-3.5 shrink-0 ' + (direction ? '' : 'opacity-50')} aria-hidden="true" />
              </button>
            </th>;
          })}</tr>
        </thead>
        <tbody>{ordered.slice(shownPage * 25, (shownPage + 1) * 25).map(({ cells, index }) =>
          <tr key={index} className="border-t odd:bg-card even:bg-muted/30">
            {cells.map((cell, column) => <td key={column} className="px-3 py-2.5 align-top">{cell}</td>)}
          </tr>)}</tbody>
      </table>
    </div>
    {count > 1 && <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>{shownPage * 25 + 1}–{Math.min((shownPage + 1) * 25, rows.length)} of {rows.length}</span>
      <Button type="button" variant="outline" size="sm" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>Previous</Button>
      <Button type="button" variant="outline" size="sm" disabled={shownPage === count - 1} onClick={() => setPage(shownPage + 1)}>Next</Button>
    </div>}
  </div>;
}

export function WorkbookImport({ kind, busy, instruction, download, upload }: {
  kind: 'stock' | 'supplier'; busy: boolean; instruction: string; download: () => void;
  upload: (rows: Awaited<ReturnType<typeof readMaterialWorkbook>>) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File>();
  const [issue, setIssue] = useState('');
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readMaterialWorkbook>>>();
  const input = useRef<HTMLInputElement>(null);
  const review = async () => {
    if (!file) return;
    setReading(true);
    try { setPreview(await readMaterialWorkbook(file, kind)); }
    catch (error) { setIssue(errorText(error)); }
    finally { setReading(false); }
  };
  const commit = async () => {
    if (preview && await upload(preview)) {
      setPreview(undefined);
      setFile(undefined);
      if (input.current) input.current.value = '';
    }
  };
  return <section className={panelClass + ' space-y-3'}>
    <h2 className="font-semibold">Bulk import</h2>
    <p className="text-sm text-muted-foreground">{instruction}</p>
    <div className="flex flex-wrap items-end gap-3">
      <Button type="button" variant="outline" disabled={busy} onClick={download}><Download className="size-4" /> Download template</Button>
      <Field label="Completed workbook"><Input ref={input} type="file" accept=".xlsx" disabled={busy || reading} onChange={event => {
        setFile(event.target.files?.[0]); setIssue(''); setPreview(undefined);
      }} /></Field>
      {preview
        ? <Button type="button" disabled={busy} onClick={() => void commit()}><Upload className="size-4" /> Apply {preview.length} rows</Button>
        : <Button type="button" variant="outline" disabled={busy || reading || !file} onClick={() => void review()}>Review workbook</Button>}
    </div>
    {preview && <p className="text-sm" role="status">{preview.length} rows ready. Applying the workbook updates the shared catalogue.</p>}
    {issue && <p className="text-sm text-destructive" role="alert">{issue}</p>}
  </section>;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function ReportSection({ sheet, empty }: { sheet: MaterialSheet; empty: string }) {
  const [search, setSearch] = useState('');
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = sheet.rows.filter(row => terms.every(term => row.some(cell => String(cell).toLowerCase().includes(term))));
  const rows = filtered.map(row => row.map((cell, index) => sheet.currency?.includes(index) && typeof cell === 'number' ? inr.format(cell) : cell));
  const print = () => {
    const frame = document.createElement('iframe');
    frame.title = 'Print ' + sheet.name;
    frame.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;border:0';
    document.body.append(frame);
    const target = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!target || !doc) { frame.remove(); return; }
    doc.title = sheet.name;
    const css = doc.createElement('style');
    css.textContent = '@page{size:A4 landscape;margin:10mm}body{font:10px system-ui;color:#172b45}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bac6d6;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#e6edf6}tr{break-inside:avoid}';
    doc.head.append(css);
    const title = doc.createElement('h1');
    title.textContent = sheet.name;
    const table = doc.createElement('table');
    const headers = table.createTHead().insertRow();
    sheet.headings.forEach(label => {
      const th = doc.createElement('th');
      th.textContent = label;
      headers.append(th);
    });
    const body = table.createTBody();
    rows.forEach(row => {
      const line = body.insertRow();
      row.forEach(value => { line.insertCell().textContent = String(value); });
    });
    doc.body.append(title, table);
    target.addEventListener('afterprint', () => frame.remove(), { once: true });
    target.focus();
    target.print();
  };
  return <section className={panelClass + ' space-y-3'}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-semibold">{sheet.name}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Search report"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <Button type="button" variant="outline" disabled={!rows.length} onClick={print}>Print / Save PDF</Button>
      </div>
    </div>
    <MaterialTable key={search} label={sheet.name} headings={sheet.headings} rows={rows} sortValues={filtered} empty={terms.length && sheet.rows.length ? 'No report rows match your search.' : empty} />
  </section>;
}

export function MaterialSelect({ materials, selected, change }: { materials: Material[]; selected: string; change: (id: string) => void }) {
  return <select required className={fieldClass} value={selected} onChange={event => change(event.target.value)}>
    <option value="">Select material</option>
    {materials.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
  </select>;
}

