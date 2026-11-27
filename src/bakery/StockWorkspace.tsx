import IssueForm, { type StockDeductionTab } from './StockExtraIssueForm';
import { useSearchParams } from 'react-router-dom';
import { StockProductionOrders, useStockProduction } from './StockProductionOrders';
import { stockWorkspaceTabs } from '@/lib/routing';
import { useState } from 'react';
import { Download, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateFilter, Field, MaterialTable, WorkbookImport, WorkspaceHeader,
  panelClass, ReportSection, useMaterialWorkspace } from './MaterialWorkspaceControls';
import { materialRequest, stockStatus, type StockData } from './materialWorkspace';
import { downloadMaterialWorkbook, stockImportSheet, stockSheets } from './materialWorkspaceExcel';

export default function StockWorkspace() {
  const workspace = useMaterialWorkspace<StockData>('stock_read');
  const [params] = useSearchParams();
  const tab = stockWorkspaceTabs.find(item => item === params.get('tab')) ?? stockWorkspaceTabs[0];
  const [deductionTab, setDeductionTab] = useState<StockDeductionTab>('Recipe Materials');
  const productionTab = tab === 'Orders' || (tab === 'Custom Stock Deduction' && deductionTab === 'Recipe Materials');
  const production = useStockProduction(productionTab, tab === 'Orders' ? 'orders' : 'custom');
  const saveProduction = (action: 'release' | 'release_batch' | 'extra', payload: object) => workspace.run(async () => {
    await production.save(action, payload);
    await workspace.reload(true);
  }, action !== 'extra' ? 'Sent to production. Raw materials deducted.' : 'Extra deduction recorded against the root card.');
  const [search, setSearch] = useState('');
  const { data, dates, busy, loading, readError } = workspace;
  const sheets = data && stockSheets(data, dates.from);
  const visible = data?.materials.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const low = data?.materials.filter(item => stockStatus(item) === 'Below minimum').length ?? 0;
  const high = data?.materials.filter(item => stockStatus(item) === 'Above maximum').length ?? 0;

  return <main className="mx-auto grid min-w-0 max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-4 px-3 py-4 sm:px-6">
    <WorkspaceHeader title="Stock" subtitle="Stock & material movement" icon={<Layers3 className="size-6" />}
      tools={<Button variant="secondary" disabled={!sheets || busy || loading || !!readError}
        onClick={() => void workspace.run(async () => {
          const latest = await materialRequest<StockData>('stock_read', dates);
          await downloadMaterialWorkbook('Stock-' + dates.from + '.xlsx', stockSheets(latest, dates.from));
        })}>
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
    {productionTab && production.error && <div role="alert" className={panelClass}>{production.error} <Button variant="outline" onClick={() => void production.refresh()}>Retry</Button></div>}
    {productionTab && !production.data && !production.error && <p role="status">Loading orders and root cards…</p>}
    {data && production.data && tab === 'Orders' && <StockProductionOrders orders={production.data.orders} materials={data.materials}
      busy={busy || !!readError || !!production.error} refresh={() => void production.refresh()} send={orders => orders.length === 1 ? saveProduction('release',orders[0]) : saveProduction('release_batch',{ orders })}/>}
    {data && tab === 'Custom Stock Deduction' && <IssueForm cards={production.error ? [] : production.data?.cards ?? []} materials={data.materials}
      tab={deductionTab} changeTab={setDeductionTab} busy={busy || !!readError}
      submitRecipe={payload => saveProduction('extra', payload)}
      submitCustom={payload => workspace.save('issue', { ...payload, section: 'Production', recipe: 'Custom deduction' }, 'Custom deduction recorded.')} />}
    {data && tab === 'Bulk Import' && <WorkbookImport kind="stock" busy={busy || !!readError}
      instruction="Edit Qty and stock limits in the workbook. Leave Downloaded Qty unchanged for existing materials and blank for new rows."
      download={() => void workspace.run(async () => {
        const latest = await materialRequest<StockData>('stock_read', dates);
        await downloadMaterialWorkbook('Stock-Import-Template.xlsx', [stockImportSheet(latest.materials)]);
      })}
      upload={rows => workspace.save('stock_import', { rows }, 'Workbook applied. Raw material stock and thresholds are up to date.')} />}
  </main>;
}

