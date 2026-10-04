import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, RefreshCcw, Search, ArrowUpDown, AlertTriangle } from 'lucide-react';
import type { Branch } from '@/branch/types';
import { useCompleteBranchReports } from '@/hooks/useCompleteBranchReports';
import { buildReportSections, reportColumns, type ReportRow, type ReportValue } from '@/branch/reports/reportModel';
import { REPORT_SOURCES } from '@/branch/reports/reportSources';
import { downloadReportWorkbook } from '@/branch/reports/reportWorkbook';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50';
const currency = (value: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
function display(value: ReportValue | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  return value;
}

type ReportProps = {
  fromDate: string; toDate: string; reportBranches: Branch[]; userName: string;
};
export default function VrsnbBranchReports({ fromDate, toDate, reportBranches, userName }: ReportProps) {
  const report = useCompleteBranchReports(fromDate, toDate, reportBranches);
  return <BranchReportView key={`${fromDate}|${toDate}|${reportBranches.join(',')}`} fromDate={fromDate} toDate={toDate} reportBranches={reportBranches} userName={userName} report={report} />;
}

export function BranchReportView({ fromDate, toDate, reportBranches, userName, report }: ReportProps & { report: ReturnType<typeof useCompleteBranchReports> }) {
  const sections = useMemo(() => buildReportSections(report.snapshot, reportBranches), [report.snapshot, reportBranches]);
  const [sectionId, setSectionId] = useState('summary');
  const [sectionSearch, setSectionSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null);
  const [detail, setDetail] = useState<ReportRow | null>(null);
  const [allColumns, setAllColumns] = useState(false);
  const [exportError, setExportError] = useState('');
  const active = sections.find(section => section.id === sectionId) || sections[0];
  const columns = useMemo(() => reportColumns(active.rows), [active.rows]);
  const visibleColumns = allColumns ? columns : columns.slice(0, 8);
  const filtered = useMemo(() => {
    const result = active.rows.filter(row => !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())));
    if (sort) result.sort((a, b) => {
      const left = a[sort.key], right = b[sort.key];
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
      return sort.descending ? -comparison : comparison;
    });
    return result;
  }, [active.rows, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 50, currentPage * 50);
  const failures = Object.entries(report.snapshot).filter(([, source]) => source.status === 'error');
  const completed = Object.values(report.snapshot).filter(source => source.status !== 'loading').length;
  const summary = sections[0].rows;
  const total = (key: string) => summary.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  const source = report.snapshot[active.sourceId];
  const groups = [...new Set(sections.map(section => section.group))];
  const exportWorkbook = () => {
    setExportError('');
    try { downloadReportWorkbook(sections, { from: fromDate, to: toDate, branches: reportBranches, generatedBy: userName, loadedAt: report.loadedAt, snapshot: report.snapshot }); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Unable to export the workbook.'); }
  };
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-amber-300">VRSNB ADMIN / REPORTS</p>
          <h2 className="text-2xl font-bold sm:text-3xl">Cafe & VRSNB sales performance</h2>
          <p className="mt-2 text-sm text-slate-300">{reportBranches.join(' + ')} · {fromDate} to {toDate} · INR</p>
          <p className="mt-1 text-xs text-slate-400">Use the branch and date controls above. Current registers are labelled separately.</p></div>
        <div className="flex flex-wrap gap-2"><button className={cn(button, 'bg-white/10')} onClick={report.refresh} disabled={report.loading}><RefreshCcw className={cn('size-4', report.loading && 'animate-spin')} />Refresh data</button>
          <button className={cn(button, 'bg-amber-300 text-slate-950')} onClick={exportWorkbook} disabled={report.loading || !!report.error || !report.loadedAt}><Download className="size-4" />{failures.length ? 'Export available data' : 'Download complete Excel'}</button></div>
      </div>
      <div className="grid grid-cols-2 border-t border-white/10 lg:grid-cols-4">
        {([['Recorded sales', 'Recorded sales (INR)'], ['Sales returns', 'Sales returns (INR)'], ['Net sales', 'Sales less returns (INR)'], ['Sale records', 'Sale records']] as const).map(([title, key]) => <div className="border-r border-white/10 px-6 py-5" key={key}><p className="text-xs text-slate-300">{title}</p><p className="mt-2 text-xl font-bold tabular-nums">{report.loading || failures.length || report.error ? '—' : key === 'Sale records' ? total(key).toLocaleString('en-IN') : currency(total(key))}</p></div>)}
      </div>
    </section>
    <div aria-live="polite" className="space-y-3">
      {report.loading && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Loading report sources: {completed} of {REPORT_SOURCES.length}. Excel will be available when loading finishes.<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${completed / REPORT_SOURCES.length * 100}%` }} /></div></div>}
      {(report.error || exportError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{report.error || exportError}</p>}
      {failures.length > 0 && <details className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><summary className="cursor-pointer font-bold">{failures.length} source(s) could not be fully loaded. This report is incomplete.</summary><ul className="mt-2 space-y-1">{failures.map(([id, data]) => <li key={id}>{REPORT_SOURCES.find(s => s.id === id)?.title}: {data.error}</li>)}</ul><p className="mt-2">Refresh to retry. Any export will clearly list these failures in Contents.</p></details>}
    </div>
    {!report.loading && !report.error && failures.length === 0 && <div className="grid gap-4 xl:grid-cols-2">
      {(['topItems', 'categories'] as const).map(id => {
        const section = sections.find(s => s.id === id)!;
        const rows = section.rows.slice(0, 6);
        const max = Math.max(1, ...rows.map(row => Number(row['Net revenue (INR)'] || 0)));
        return <section key={id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold text-slate-950">{section.title}</h3><button className="text-xs font-bold text-amber-800 underline" onClick={() => { setSectionId(id); setQuery(''); setPage(1); }}>View all</button></div>
          <p className="mb-4 text-xs text-slate-500">Net revenue after allocated discounts and returns. All categories and items are included in Excel.</p>
          {rows.length ? <div className="space-y-4">{rows.map((row, index) => <div key={index}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words font-semibold">{String(row[id === 'topItems' ? 'Item' : 'Category'])}<span className="ml-2 text-xs font-normal text-slate-500">{row.Branch}</span></span><span className="whitespace-nowrap font-bold tabular-nums">{currency(row['Net revenue (INR)'])}</span></div><div className="h-2 rounded-full bg-slate-100"><div className={cn('h-2 rounded-full', row.Branch === 'Cafe' ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.max(0, Number(row['Net revenue (INR)'] || 0)) / max * 100}%` }} /></div></div>)}</div> : <p className="text-sm text-slate-500">No sales in this period.</p>}
        </section>;
      })}
    </div>}
    <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-4">
        <label className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2"><Search className="size-4 text-slate-500" /><input aria-label="Find report section" value={sectionSearch} onChange={e => setSectionSearch(e.target.value)} placeholder="Find a report…" className="min-w-0 bg-transparent text-sm outline-none" /></label>
        <nav aria-label="Report sections" className="max-h-[560px] overflow-y-auto">
          {groups.map(group => { const list = sections.filter(section => section.group === group && section.title.toLowerCase().includes(sectionSearch.toLowerCase())); return list.length ? <div key={group} className="mb-4"><h3 className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group}</h3>{list.map(section => <button key={section.id} onClick={() => { setSectionId(section.id); setQuery(''); setPage(1); setSort(null); setDetail(null); }} className={cn('mb-1 flex w-full items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm', active.id === section.id ? 'bg-slate-950 font-bold text-white' : 'text-slate-700 hover:bg-slate-100')}><span>{section.title}</span><span className="rounded-md bg-slate-400/15 px-1.5 text-xs tabular-nums">{section.rows.length}</span></button>)}</div> : null; })}
        </nav>
      </aside>
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-bold text-slate-950">{active.title}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{active.rows.length.toLocaleString('en-IN')} records</span></div><p className="mt-2 text-sm leading-relaxed text-slate-600">{active.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3"><label className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><Search className="size-4 text-slate-400" /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} aria-label="Search report records" placeholder="Search every field in this report…" className="w-full min-w-0 text-sm outline-none" /></label><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={allColumns} onChange={e => setAllColumns(e.target.checked)} />Show all {columns.length} columns</label></div>
          {!allColumns && columns.length > 8 && <p className="mt-2 text-xs text-slate-500">Showing key columns. Select View details for every field. Excel includes all columns and all rows, regardless of this search.</p>}
        </div>
        {source?.status === 'error' && <p className="flex gap-2 bg-amber-50 px-5 py-3 text-sm text-amber-900"><AlertTriangle className="size-4 shrink-0" />This section may be incomplete. See the source errors above.</p>}
        {['summary', 'analytics'].includes(active.sourceId) && (report.loading || failures.length > 0) ? <p className="p-10 text-center text-slate-600">Summary unavailable until all sources load successfully. Individual available records can still be reviewed.</p> : !visible.length ? <div className="p-12 text-center"><FileSpreadsheet className="mx-auto mb-3 size-8 text-slate-400" /><p className="font-semibold text-slate-600">{source?.status === 'loading' || report.loading ? 'Loading records…' : source?.status === 'error' ? 'Records could not be loaded.' : query ? 'No records match this search.' : 'No records for this scope.'}</p></div> : <>
          <div className="max-h-[640px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-xs text-slate-600"><tr>{visibleColumns.map(key => <th key={key} className="whitespace-nowrap p-3"><button className="inline-flex items-center gap-1" onClick={() => setSort({ key, descending: sort?.key === key ? !sort.descending : false })}>{key}<ArrowUpDown className="size-3" /></button></th>)}<th className="p-3">Details</th></tr></thead><tbody>{visible.map((row, i) => <tr key={`${currentPage}-${i}`} className="border-t border-slate-100 even:bg-slate-50/60">{visibleColumns.map(key => <td key={key} className="max-w-72 whitespace-pre-wrap break-words p-3 align-top tabular-nums"><span className="line-clamp-3">{display(row[key])}</span></td>)}<td className="p-3 align-top"><button className="whitespace-nowrap font-bold text-amber-800 underline underline-offset-4" onClick={() => setDetail(row)}>View details</button></td></tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs text-slate-600"><span>{(currentPage - 1) * 50 + 1}–{Math.min(currentPage * 50, filtered.length)} of {filtered.length} matching records</span><div className="flex items-center gap-2"><button aria-label="Previous report page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button><span>{currentPage} / {pageCount}</span><button aria-label="Next report page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
        </>}
      </section>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm"><summary className="cursor-pointer font-bold text-slate-700">Data coverage & refresh status</summary><p className="my-3 text-xs text-slate-500">Last completed refresh: {report.loadedAt ? new Date(report.loadedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'Not completed'}. Counts below refer to source records and may overlap.</p><div className="grid gap-2 md:grid-cols-2">{REPORT_SOURCES.map(source => <div className="flex justify-between gap-3 rounded-lg bg-slate-50 p-2" key={source.id}><span>{source.title}</span><span className="font-semibold">{report.snapshot[source.id]?.status === 'error' ? 'Incomplete' : report.snapshot[source.id]?.status === 'ready' ? `${report.snapshot[source.id].rows.length} loaded` : 'Loading'}</span></div>)}</div></details>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[85vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>{active.title} — record details</DialogTitle><DialogDescription>Every recorded field for this row. Linked item and payment detail sections are listed in the report navigation.</DialogDescription></DialogHeader><dl className="divide-y divide-slate-100">{detail && Object.entries(detail).map(([key, value]) => <div key={key} className="grid gap-1 py-3 sm:grid-cols-[190px_minmax(0,1fr)]"><dt className="text-xs font-bold text-slate-500">{key}</dt><dd className="whitespace-pre-wrap break-words text-sm">{display(value)}</dd></div>)}</dl></DialogContent></Dialog>
  </div>;
}
