import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Download, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/authStore';
import { DateFilter, Field, MaterialTable, WorkbookImport, WorkspaceHeader, panelClass,
  ReportSection, useMaterialWorkspace } from './MaterialWorkspaceControls';
import { PurchaseOrderForm, ReceiptForm, ReviewForm } from './GrnWorkspaceForms';
import { displayDate, poNumber, statusLabel, type PurchaseData, type PurchaseOrder } from './materialWorkspace';
import { downloadMaterialWorkbook, purchaseSheets, supplierHeadings } from './materialWorkspaceExcel';

const tabs = ['Daily PO Report', 'Approved Status', 'GRN Report', 'Suppliers'] as const;
type Tab = typeof tabs[number];
type Editor = { kind: 'po'; order: PurchaseOrder | null } | { kind: 'receive' | 'review'; order: PurchaseOrder };

function SupplierCatalogue({ data }: { data: PurchaseData }) {
  const [filter, setFilter] = useState('');
  const materials = new Map(data.materials.map(item => [item.id, item]));
  const rows = data.suppliers.map(supplier => {
    const entries = data.catalogue.filter(entry => entry.supplier_id === supplier.id);
    return { supplier, supplied: entries.flatMap(entry => {
      const material = materials.get(entry.stock_id);
      return material ? [material.name + ' (' + material.unit + ')' + (entry.preferred ? ' · Preferred' : '')] : [];
    }).join(', ') };
  }).filter(({ supplier, supplied }) => (supplier.business_name + ' ' + supplier.items_supplied + ' ' + supplied).toLowerCase().includes(filter.trim().toLowerCase()));
  return <section className={panelClass + ' space-y-3'}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-semibold">Supplier directory</h2>
      <Field label="Find supplier or material"><Input type="search" value={filter} onChange={event => setFilter(event.target.value)} /></Field>
    </div>
    <MaterialTable key={filter} label="Suppliers" headings={['Supplier', 'Contact', 'Materials on file', 'GRN catalogue']}
      rows={rows.map(({ supplier, supplied }) => [supplier.business_name,
        <span>{[supplier.contact_name, supplier.phone, supplier.email].filter(Boolean).join(' · ') || '—'}</span>,
        supplier.items_supplied || '—', supplied || '—'])} empty="No suppliers match your search." />
  </section>;
}

export default function GrnWorkspace() {
  const canPurchase = useAuthStore(state => state.currentUser?.role === 'grn');
  const workspace = useMaterialWorkspace<PurchaseData>('purchase_read');
  const [params, setParams] = useSearchParams();
  const tab = tabs.find(item => item === params.get('tab')) ?? (canPurchase ? tabs[0] : 'Approved Status');
  const [editorTab, setEditorTab] = useState<Tab>(tab);
  const [editor, setEditor] = useState<Editor>();
  if (tab !== editorTab) {
    setEditorTab(tab);
    setEditor(undefined);
  }
  const { data, dates, loading, busy, readError } = workspace;
  const sheets = data && purchaseSheets(data, dates.from, dates.through);
  const draft = data?.orders.filter(order => order.status === 'draft' || order.status === 'rejected') ?? [];
  const pending = data?.orders.filter(order => order.status === 'submitted') ?? [];
  const approved = data?.orders.filter(order => order.status === 'approved') ?? [];
  const preferred = new Set(data?.catalogue.filter(entry => entry.preferred && data.suppliers.some(supplier => supplier.id === entry.supplier_id))
    .map(entry => entry.stock_id));
  const unmapped = data?.materials.filter(item => item.quantity < (item.minimum ?? 0) && !preferred.has(item.id)) ?? [];
  const close = () => setEditor(undefined);
  const open = (next: Editor) => { workspace.clearError(); setEditor(next); };
  const orderQueue = (queue: PurchaseOrder[], action: (order: PurchaseOrder) => React.ReactNode, title: string, empty: string) =>
    <section className={panelClass + ' space-y-3'}>
      <h2 className="font-semibold">{title}</h2>
      <MaterialTable key={title} label={title} headings={['PO number', 'Supplier', 'Items', 'Status', 'PO date', 'Action']}
        rows={queue.map(order => [poNumber(order.number), order.supplier,
          <span title={order.lines.map(line => line.name).join(', ')}>{order.lines.length} {order.lines.length === 1 ? 'item' : 'items'}{order.automatic && ' · Low stock'}</span>,
          statusLabel[order.status], displayDate(order.created_at), action(order)])} empty={empty} />
    </section>;

  return <main className="mx-auto grid max-w-[1500px] gap-4 px-3 py-4 sm:px-6">
    <WorkspaceHeader title="GRN" subtitle="Purchase & GRN tracking" icon={<Truck className="size-6" />}
      tools={<>
        <Button variant="secondary" disabled={!sheets || busy || loading || !!readError}
          onClick={() => sheets && void workspace.run(() => downloadMaterialWorkbook('Purchases-' + dates.from + '-to-' + dates.through + '.xlsx', sheets))}>
          <Download className="size-4" /> Download Excel report
        </Button>
        {canPurchase && <Button disabled={busy || !data || !!readError}
          onClick={() => { setEditorTab('Daily PO Report'); setParams({ tab: 'Daily PO Report' }); open({ kind: 'po', order: null }); }}><Plus className="size-4" /> New PO</Button>}
      </>} />
    {workspace.message && <p role="status" className="rounded-lg border border-teal-400/50 bg-teal-500/10 p-3 text-sm">{workspace.message}</p>}
    {(workspace.writeError || readError) && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{workspace.writeError || readError}</p>}
    {(tab !== 'Suppliers' || !data) && <section className={panelClass}>
      <DateFilter dates={dates} change={workspace.setDates} refresh={() => void workspace.reload()} loading={loading} />
    </section>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading purchase records…</p>}
    {data && editor?.kind === 'po' && canPurchase && <PurchaseOrderForm key={editor.order?.id ?? 'new'} data={data} order={editor.order} busy={busy || !!readError}
      close={close} save={payload => workspace.save('po_save', payload, 'Purchase order saved.')} />}
    {data && editor?.kind === 'receive' && canPurchase && <ReceiptForm key={editor.order.id} data={data} order={editor.order} busy={busy || !!readError}
      close={close} save={payload => workspace.save('receive', payload, 'GRN recorded and raw material stock updated.')} />}
    {editor?.kind === 'review' && !canPurchase && <ReviewForm key={editor.order.id} order={editor.order} busy={busy || !!readError}
      close={close} save={payload => workspace.save('review', payload, 'Purchase order reviewed.')} />}

    {data && tab === 'Daily PO Report' && canPurchase && <>
      {unmapped.length > 0 && <details className={panelClass + ' text-sm'}>
        <summary className="cursor-pointer font-medium">{unmapped.length} low-stock materials need a preferred supplier</summary>
        <p className="mt-2 text-muted-foreground">Add a preferred supplier and price in Suppliers to include these materials in automatic draft POs.</p>
        <ul className="mt-2 flex flex-wrap gap-2">{unmapped.map(item => <li className="rounded bg-muted px-2 py-1" key={item.id}>{item.name}</li>)}</ul>
      </details>}
      {orderQueue(draft, order => <Button type="button" size="sm" variant="outline" disabled={busy || !!readError}
        onClick={() => open({ kind: 'po', order })}>Review draft</Button>, 'Drafts and rejected orders', 'No draft or rejected POs to edit.')}
    </>}
    {data && tab === 'Approved Status' && orderQueue(pending, order => canPurchase ? 'Awaiting Owner'
      : <Button type="button" size="sm" variant="outline" disabled={busy || !!readError} onClick={() => open({ kind: 'review', order })}>
        <ClipboardCheck className="size-4" /> Review</Button>, 'Pending approval', 'No purchase orders are waiting for approval.')}
    {data && tab === 'GRN Report' && orderQueue(approved, order => canPurchase
      ? <Button type="button" size="sm" variant="outline" disabled={busy || !!readError} onClick={() => open({ kind: 'receive', order })}>Create GRN</Button>
      : 'Ready to receive', 'Approved POs with stock outstanding', 'No approved purchase orders have outstanding items.')}
    {data && tab === 'Suppliers' && <>
      {canPurchase && <WorkbookImport kind="supplier" busy={busy || !!readError}
        instruction="Use one row per supplier and material. Enter the unit and unit price. Mark one supplier Yes per material to allow automatic POs."
        download={() => void workspace.run(() => downloadMaterialWorkbook('Supplier-Import-Template.xlsx', [{
          name: 'Supplier Import', headings: supplierHeadings, currency: [3],
          rows: data.catalogue.flatMap(entry => {
            const supplier = data.suppliers.find(item => item.id === entry.supplier_id);
            const material = data.materials.find(item => item.id === entry.stock_id);
            return supplier && material ? [[supplier.business_name, material.name, material.unit, entry.price, entry.preferred ? 'Yes' : 'No',
              supplier.contact_name, supplier.phone, supplier.email, supplier.address]] : [];
          }),
        }]))}
        upload={rows => workspace.save('supplier_import', { rows }, 'Supplier catalogue imported and raw materials synced.')} />}
      <SupplierCatalogue data={data} />
    </>}
    {!loading && !readError && sheets && tab !== 'Suppliers' && <ReportSection key={tab} sheet={sheets[tabs.indexOf(tab)]} empty="No report rows fall within this date range." />}
  </main>;
}

