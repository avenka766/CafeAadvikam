import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, MaterialSelect, fieldClass, panelClass } from './MaterialWorkspaceControls';
import { dateKey, poNumber, remainingQuantity, type PurchaseData, type PurchaseOrder } from './materialWorkspace';

type Save<Payload = object> = (payload: Payload) => Promise<boolean>;
const blankLine = () => ({ key: crypto.randomUUID(), stock_id: '', quantity: '', price: '' });

export function PurchaseOrderForm({ data, order, busy, save, close }: {
  data: PurchaseData; order: PurchaseOrder | null; busy: boolean; save: Save<{ status: 'draft' | 'submitted'; id?: string;
    version?: number; supplier_id: string; expected_date: string | null; notes: string;
    rows: Array<{ stock_id: string; unit?: string; quantity: number; price: number }> }>; close: () => void;
}) {
  const [supplier, setSupplier] = useState(order?.supplier_id ?? '');
  const [expected, setExpected] = useState(order?.expected_date ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState(() => order?.lines.map(line => ({ ...blankLine(), stock_id: line.stock_id,
    quantity: String(line.quantity), price: String(line.price) })) ?? [blankLine()]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = button?.value === 'submitted' ? 'submitted' : 'draft';
    const rows = lines.map(line => ({
      stock_id: line.stock_id, unit: data.materials.find(item => item.id === line.stock_id)?.unit,
      quantity: Number(line.quantity), price: Number(line.price),
    }));
    if (await save({ id: order?.id, version: order?.version, supplier_id: supplier, expected_date: expected || null, notes, rows, status })) close();
  };
  return <form className={panelClass + ' space-y-4'} onSubmit={event => void submit(event)}>
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{order ? 'Edit ' + poNumber(order.number) : 'New purchase order'}</h2>
      <Button type="button" variant="ghost" onClick={close} disabled={busy}>Close</Button></div>
    {order?.review_note && <p className="text-sm text-muted-foreground">Owner note · {order.review_note}</p>}
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier"><select className={fieldClass} required value={supplier} onChange={event => {
          const supplierId = event.target.value;
          setSupplier(supplierId);
          setLines(current => current.map(line => ({ ...line, price: line.stock_id ? String(data.catalogue.find(entry =>
            entry.supplier_id === supplierId && entry.stock_id === line.stock_id)?.price ?? '') : '' })));
        }}>
          <option value="">Select supplier</option>
          {data.suppliers.map(item => <option value={item.id} key={item.id}>{item.business_name}</option>)}
        </select></Field>
        <Field label="Expected delivery date"><Input type="date" value={expected} onChange={event => setExpected(event.target.value)} /></Field>
      </div>
      {lines.map((line, index) => {
        const item = data.materials.find(material => material.id === line.stock_id);
        const update = (next: Partial<typeof line>) => setLines(current => current.map(row => row.key === line.key ? { ...row, ...next } : row));
        return <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
          <Field label={'PO item ' + (index + 1)}><MaterialSelect materials={data.materials.filter(material => material.id === line.stock_id || !lines.some(row => row.stock_id === material.id))}
            selected={line.stock_id} change={stock_id => update({ stock_id, quantity: '', price: String(data.catalogue.find(entry =>
              entry.supplier_id === supplier && entry.stock_id === stock_id)?.price ?? '') })} /></Field>
          <Field label={item ? 'Qty (' + item.unit + ')' : 'Quantity'}><Input type="number" min="0.000001" step="any" required value={line.quantity}
            onChange={event => update({ quantity: event.target.value })} /></Field>
          <Field label="Unit price (₹)"><Input type="number" min="0" step="any" required value={line.price}
            onChange={event => update({ price: event.target.value })} /></Field>
          <Button type="button" variant="outline" aria-label={'Remove PO item ' + (index + 1)} disabled={lines.length === 1}
            onClick={() => setLines(current => current.filter(row => row.key !== line.key))}><Trash2 className="size-4" /></Button>
        </div>;
      })}
      <Button type="button" variant="outline" onClick={() => setLines(current => [...current, blankLine()])}
        disabled={lines.length >= data.materials.length || lines.length === 200}><Plus className="size-4" /> Add PO item</Button>
      <Field label="Purchase notes"><textarea className={fieldClass} value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" value="draft">Save Draft</Button>
        <Button type="submit" value="submitted">Submit for Approval</Button>
      </div>
    </fieldset>
  </form>;
}

export function ReceiptForm({ data, order, busy, save, close }: {
  data: PurchaseData; order: PurchaseOrder; busy: boolean; save: Save; close: () => void;
}) {
  const today = dateKey();
  const [inward, setInward] = useState(today);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [invoice, setInvoice] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState(() => order.lines.map(line => ({
    ...line, received: '', rate: String(line.price), receivingUnit: line.unit,
  })));
  const [problem, setProblem] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem('');
    const entered = rows.filter(row => row.received !== '' && Number(row.received) !== 0);
    if (!entered.length) {
      setProblem('Enter a received quantity for at least one item.');
      return;
    }
    if (await save({ id: order.id, inward_date: inward, supplier_invoice_date: invoiceDate, supplier_invoice: invoice,
      delivery_reference: deliveryReference, notes, rows: entered.map(row => ({
        stock_id: row.stock_id, unit: row.receivingUnit, quantity: Number(row.received), price: Number(row.rate),
      })) })) close();
  };
  return <form className={panelClass + ' space-y-4'} onSubmit={event => void submit(event)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Receive {poNumber(order.number)}</h2>
        <p className="text-sm text-muted-foreground">{order.supplier} · Leave items you did not receive blank.</p></div>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>Close</Button>
    </div>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Supplier invoice number"><Input value={invoice} onChange={event => setInvoice(event.target.value)} maxLength={120} required /></Field>
        <Field label="Supplier invoice date"><Input type="date" value={invoiceDate} max={inward} onChange={event => setInvoiceDate(event.target.value)} required /></Field>
        <Field label="Item inward date"><Input type="date" value={inward} max={today} onChange={event => setInward(event.target.value)} required /></Field>
        <Field label="Delivery reference / vehicle"><Input value={deliveryReference} maxLength={120} onChange={event => setDeliveryReference(event.target.value)} /></Field>
      </div>
      {rows.map(row => {
        const remaining = remainingQuantity(order, row, data.receipts);
        const stock = data.materials.find(item => item.id === row.stock_id);
        const update = (next: Partial<typeof row>) => setRows(current => current.map(item => item.stock_id === row.stock_id ? { ...item, ...next } : item));
        return <div key={row.stock_id} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div><p className="font-medium">{row.name}</p>
            <p className="text-sm text-muted-foreground">Ordered {row.quantity} {row.unit} · Remaining {remaining} {row.unit}</p>
            {stock && stock.unit.toLowerCase() !== row.unit.toLowerCase() && <p className="text-sm text-destructive">Stock currently uses {stock.unit}.</p>}
          </div>
          <Field label="Received quantity"><Input type="number" min="0" max={remaining} step="any" disabled={remaining <= 0}
            value={row.received} onChange={event => update({ received: event.target.value })} /></Field>
          <Field label="UOM"><Input value={row.receivingUnit} maxLength={12} disabled={remaining <= 0}
            required={Number(row.received) > 0} onChange={event => update({ receivingUnit: event.target.value })} /></Field>
          <Field label="GRN unit price (₹)"><Input type="number" min="0" step="any" disabled={remaining <= 0}
            required={Number(row.received) > 0} value={row.rate} onChange={event => update({ rate: event.target.value })} /></Field>
        </div>;
      })}
      <Field label="Receipt notes"><textarea className={fieldClass} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></Field>
      <Button type="submit">Record GRN and update stock</Button>
    </fieldset>
  </form>;
}

export function ReviewForm({ order, busy, save, close }: { order: PurchaseOrder; busy: boolean; save: Save; close: () => void }) {
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const review = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const status = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    if (!status) return;
    if (status === 'rejected' && !reason.trim()) { setProblem('Enter a reason for rejection.'); return; }
    setProblem('');
    if (await save({ id: order.id, version: order.version, status, reason })) close();
  };
  return <form className={panelClass + ' space-y-4'} onSubmit={event => void review(event)}>
    <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Review {poNumber(order.number)}</h2>
      <p className="text-sm text-muted-foreground">{order.supplier} · Submitted by {order.created_by}</p></div>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>Close</Button></div>
    <ul className="space-y-1 text-sm">{order.lines.map(line => <li key={line.stock_id}>{line.name} · {line.quantity} {line.unit} at ₹{line.price}</li>)}</ul>
    {order.notes && <p className="text-sm">{order.notes}</p>}
    <Field label="Review note (required for rejection)"><textarea className={fieldClass} maxLength={2000} value={reason}
      disabled={busy} onChange={event => setReason(event.target.value)} /></Field>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    <div className="flex gap-2"><Button type="submit" value="approved" disabled={busy}>Approve PO</Button>
      <Button type="submit" variant="destructive" value="rejected" disabled={busy}>Reject PO</Button></div>
  </form>;
}

