import { useSearchParams } from 'react-router-dom';
import { stockWorkspaceTabs } from '@/lib/routing';
import { useState, type FormEvent } from 'react';
import { ArrowUpFromLine, Download, Layers3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateFilter, Field, MaterialSelect, MaterialTable, WorkbookImport, WorkspaceHeader,
  fieldClass, panelClass, ReportSection, useMaterialWorkspace } from './MaterialWorkspaceControls';
import { stockStatus, type Material, type StockData } from './materialWorkspace';
import { downloadMaterialWorkbook, stockHeadings, stockSheets } from './materialWorkspaceExcel';

const emptyLine = () => ({ key: crypto.randomUUID(), stock_id: '', quantity: '' });

function IssueForm({ materials, busy, submit }: { materials: Material[]; busy: boolean; submit: (payload: object) => Promise<boolean> }) {
  const [section, setSection] = useState('');
  const [recipe, setRecipe] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const submitIssue = async (event: FormEvent) => {
    event.preventDefault();
    const rows = lines.map(line => ({ stock_id: line.stock_id, quantity: Number(line.quantity),
      unit: materials.find(item => item.id === line.stock_id)?.unit }));
    if (await submit({ section, recipe, reason, rows })) {
      setRecipe('');
      setReason('');
      setLines([emptyLine()]);
    }
  };
  return <form className={panelClass + ' space-y-4'} onSubmit={event => void submitIssue(event)}>
    <div><h2 className="font-semibold">Issue raw materials</h2>
      <p className="text-sm text-muted-foreground">All lines in this issue are recorded under the same section and recipe. Create a separate issue for another recipe.</p></div>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Section name"><Input value={section} onChange={event => setSection(event.target.value)} maxLength={150} placeholder="e.g. Sweets" required /></Field>
        <Field label="Recipe or production item"><Input value={recipe} onChange={event => setRecipe(event.target.value)} maxLength={180} placeholder="e.g. Mysore Pak" required /></Field>
      </div>
      <Field label="Reason"><textarea className={fieldClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} required /></Field>
      {lines.map((line, index) => {
        const material = materials.find(item => item.id === line.stock_id);
        const update = (next: Partial<typeof line>) => setLines(current => current.map(item => item.key === line.key ? { ...item, ...next } : item));
        return <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" key={line.key}>
          <Field label={'Raw material ' + (index + 1)}><MaterialSelect materials={materials.filter(item => item.id === line.stock_id || !lines.some(other => other.stock_id === item.id))}
            selected={line.stock_id} change={stock_id => update({ stock_id, quantity: '' })} /></Field>
          <Field label={material ? 'Quantity (' + material.unit + ')' : 'Quantity'}><Input type="number" value={line.quantity}
            onChange={event => update({ quantity: event.target.value })} required min="0.000001" step="any" /></Field>
          <Button type="button" variant="outline" disabled={lines.length === 1} aria-label={'Remove raw material ' + (index + 1)}
            onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 className="size-4" /></Button>
          {material && <p className="text-xs text-muted-foreground sm:col-span-3">Available {material.quantity} {material.unit}</p>}
        </div>;
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={lines.length >= materials.length || lines.length === 200}
          onClick={() => setLines(current => [...current, emptyLine()])}><Plus className="size-4" /> Add material</Button>
        <Button type="submit"><ArrowUpFromLine className="size-4" /> Record deduction</Button>
      </div>
    </fieldset>
  </form>;
}

export default function StockWorkspace() {
  const workspace = useMaterialWorkspace<StockData>('stock_read');
  const [params] = useSearchParams();
  const tab = stockWorkspaceTabs.find(item => item === params.get('tab')) ?? stockWorkspaceTabs[0];
  const [search, setSearch] = useState('');
  const { data, dates, busy, loading, readError } = workspace;
  const sheets = data && stockSheets(data, dates.from);
  const visible = data?.materials.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const low = data?.materials.filter(item => stockStatus(item) === 'Below minimum').length ?? 0;
  const high = data?.materials.filter(item => stockStatus(item) === 'Above maximum').length ?? 0;

  return <main className="mx-auto grid max-w-[1500px] gap-4 px-3 py-4 sm:px-6">
    <WorkspaceHeader title="Stock" subtitle="Stock & material movement" icon={<Layers3 className="size-6" />}
      tools={<Button variant="secondary" disabled={!sheets || busy || loading || !!readError}
        onClick={() => sheets && void workspace.run(() => downloadMaterialWorkbook('Stock-' + dates.from + '.xlsx', sheets))}>
        <Download className="size-4" /> Download Excel report
      </Button>} />
    {workspace.message && <p role="status" className="rounded-lg border border-teal-400/50 bg-teal-500/10 p-3 text-sm">{workspace.message}</p>}
    {(workspace.writeError || readError) && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{workspace.writeError || readError}</p>}
    {(tab === 'Opening Stock' || tab === 'Outward Report' || !data) && <section className={panelClass}>
      <DateFilter dates={dates} change={workspace.setDates} refresh={() => void workspace.reload()} loading={loading} />
    </section>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading stock records…</p>}
    {data && tab === 'Opening Stock' && <>
      <section className={panelClass + ' space-y-3'}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">Available now</h2><p className="text-sm text-muted-foreground">{data.materials.length} materials · {low} below minimum · {high} above maximum</p></div>
          <Field label="Find raw material"><Input type="search" placeholder="Search by name" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        </div>
        <MaterialTable key={search} label="Available raw materials" empty="No raw materials match your search."
          headings={['Raw material', 'Available', 'UOM', 'Minimum', 'Maximum', 'Stock level']}
          rows={visible.map(item => [item.name, item.quantity, item.unit, item.minimum ?? 0, item.maximum ?? '—', stockStatus(item)])} />
      </section>
      {!loading && !readError && sheets && <ReportSection key="opening" sheet={sheets[0]} empty="No opening balance was captured for this date. Snapshots are recorded at midnight India time." />}
    </>}
    {!loading && !readError && sheets && tab === 'Outward Report' && <ReportSection key="outward" sheet={sheets[1]} empty="No material issues were recorded during this date range." />}
    {data && tab === 'Custom Stock Deduction' && <IssueForm materials={data.materials} busy={busy || !!readError}
      submit={payload => workspace.save('issue', payload, 'Deduction recorded and stock updated.')} />}
    {data && tab === 'Bulk Import' && <WorkbookImport kind="stock" busy={busy || !!readError}
      instruction="Edit Qty and stock limits in the workbook. Leave Downloaded Qty unchanged for existing materials and blank for new rows."
      download={() => void workspace.run(() => downloadMaterialWorkbook('Stock-Import-Template.xlsx', [{
        name: 'Raw Material Import', headings: stockHeadings, rows: data.materials.map(item =>
          [item.name, item.quantity, item.unit, item.minimum ?? 0, item.maximum ?? '', item.quantity]),
      }]))}
      upload={rows => workspace.save('stock_import', { rows }, 'Workbook applied. Raw material stock and thresholds are up to date.')} />}
  </main>;
}

