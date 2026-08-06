// src/bakery/StorePurchaseOrderTab.tsx
// Store Dashboard "Purchase Order" tab — Store raises a PO (item + qty, no
// price), it goes to the Owner for approval, Store can see whether it's
// still pending / approved / rejected, and once approved can convert it
// into a GRN (opening the same CreateInvoiceModal used by the GRN tab,
// pre-filled from the PO) where price and receiving detail get added for
// the first time and stock finally syncs on submit — identical to how a
// GRN created directly has always worked.
import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Clock, X, Check, Loader2, AlertTriangle, Search, ArrowRightCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { businessDate } from '@/lib/businessDate';
import { useSupplierStore } from './supplierStore';
import { useStorePurchaseOrderStore, type StorePurchaseOrder, type StorePOLineItem } from './storePurchaseOrderStore';
import { useStoreStockStore, type StockUnit } from './storeStockStore';
import { CreateInvoiceModal } from './InvoiceTab';
import { searchItems } from './storeItemMaster';

const num = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 3 });

function normalizeItemName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function invoiceUnit(raw?: string): StockUnit {
  const unit = (raw ?? '').trim().toLowerCase();
  if (['l', 'lt', 'lts', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'].includes(unit)) return 'ltr';
  if (['pc', 'pcs', 'piece', 'pieces', 'pkt', 'pkts', 'packet', 'packets'].includes(unit)) return 'pcs';
  if (['no', 'nos', 'number', 'numbers'].includes(unit)) return 'nos';
  if (['bunch', 'bunches'].includes(unit)) return 'bunch';
  return 'kg';
}

const PO_UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
  { value: 'kg', label: 'KG' },
  { value: 'ltr', label: 'Ltr' },
  { value: 'pcs', label: 'Pcs' },
  { value: 'nos', label: 'Nos' },
  { value: 'bunch', label: 'Bunch' },
];

interface POLineDraft {
  rowId: string;
  itemName: string;
  quantity: string;
  unit: StockUnit;
}

function createPOLineDraft(line?: StorePOLineItem): POLineDraft {
  return {
    rowId: crypto.randomUUID(),
    itemName: line?.itemName ?? '',
    quantity: line ? String(line.quantity) : '1',
    unit: invoiceUnit(line?.unit),
  };
}

// ─── PO Card (list view) ───────────────────────────────────────────────────
function POCard({ po, onConvert }: { po: StorePurchaseOrder; onConvert: (po: StorePurchaseOrder) => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusMeta = {
    pending_approval: { label: 'Pending Owner Approval', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', Icon: Clock },
    approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', Icon: CheckCircle2 },
    rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', Icon: XCircle },
    converted: { label: 'Converted to GRN', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', Icon: CheckCircle2 },
  }[po.status];
  const StatusIcon = statusMeta.Icon;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20" onClick={() => setExpanded(v => !v)}>
        <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0',
          po.status === 'pending_approval' ? 'bg-amber-50' : po.status === 'approved' ? 'bg-emerald-50' : po.status === 'converted' ? 'bg-blue-50' : 'bg-red-50')}>
          <StatusIcon className={cn('size-4',
            po.status === 'pending_approval' ? 'text-amber-600' : po.status === 'approved' ? 'text-emerald-600' : po.status === 'converted' ? 'text-blue-600' : 'text-red-600')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">{po.poNumber}</span>
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1', statusMeta.color)}>
              <span className={cn('size-1.5 rounded-full', statusMeta.dot)} />
              {statusMeta.label}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {po.supplierName} · {po.lineItems.length} item{po.lineItems.length === 1 ? '' : 's'}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          <div className="flex justify-between text-xs font-body text-muted-foreground">
            <span>Expected: {po.expectedDeliveryDate ? new Date(`${po.expectedDeliveryDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}</span>
            <span>Raised: {new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-8">Item</span>
              <span className="col-span-4 text-right">Quantity</span>
            </div>
            {po.lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-border/50 text-xs font-body">
                <span className="col-span-8 font-semibold text-foreground truncate">{li.itemName}</span>
                <span className="col-span-4 text-right text-muted-foreground">{num(li.quantity)} {li.unit}</span>
              </div>
            ))}
          </div>

          {po.notes && (
            <p className="text-xs font-body text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <span className="font-bold text-foreground">Notes: </span>{po.notes}
            </p>
          )}
          {po.reviewNote && (
            <p className={cn('text-xs font-body rounded-xl px-3 py-2', po.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
              <span className="font-bold">Owner{po.reviewedByName ? ` (${po.reviewedByName})` : ''}: </span>{po.reviewNote}
            </p>
          )}
          {po.status === 'approved' && !po.convertedInvoiceId && po.reviewedByName && !po.reviewNote && (
            <p className="text-xs font-body text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
              Approved by {po.reviewedByName}.
            </p>
          )}

          {po.status === 'approved' && (
            <button
              onClick={() => onConvert(po)}
              className="flex w-full h-10 items-center justify-center gap-2 rounded-xl cafe-gradient text-sm font-body font-semibold text-primary-foreground active:scale-[0.98]"
            >
              <ArrowRightCircle className="size-4" /> Convert to GRN
            </button>
          )}
          {po.status === 'converted' && (
            <p className="text-xs font-body text-blue-700 bg-blue-50 rounded-xl px-3 py-2 text-center">
              Already converted — find it in the GRN tab.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Item Picker (no price, reused shape from Invoice tab's picker) ───────
function POItemPicker({ value, rowId, stockItems, selectedItemNames, onChange, onSelect }: {
  value: string;
  rowId: string;
  stockItems: ReturnType<typeof useStoreStockStore.getState>['items'];
  selectedItemNames: string[];
  onChange: (value: string) => void;
  onSelect: (suggestion: { name: string; unit: StockUnit }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    const query = normalizeItemName(value);
    const selected = new Set(selectedItemNames.map(normalizeItemName));
    const byName = new Map<string, { name: string; unit: StockUnit }>();
    for (const stockItem of stockItems) {
      const key = normalizeItemName(stockItem.name);
      if (query && !key.includes(query)) continue;
      byName.set(key, { name: stockItem.name, unit: invoiceUnit(stockItem.unit) });
    }
    for (const masterItem of searchItems(value)) {
      const key = normalizeItemName(masterItem.item);
      if (!byName.has(key)) byName.set(key, { name: masterItem.item, unit: invoiceUnit(masterItem.uom) });
    }
    return Array.from(byName.values())
      .filter(item => !selected.has(normalizeItemName(item.name)) || normalizeItemName(item.name) === normalizeItemName(value))
      .slice(0, 16);
  }, [selectedItemNames, stockItems, value]);

  useEffect(() => { setActiveIndex(0); }, [value, suggestions.length]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        id={`po-item-${rowId}`}
        value={value}
        onChange={event => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length > 0) { event.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
          else if (event.key === 'ArrowUp' && suggestions.length > 0) { event.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
          else if (event.key === 'Enter' && open && suggestions[activeIndex]) {
            event.preventDefault();
            onSelect(suggestions[activeIndex]);
            setOpen(false);
            requestAnimationFrame(() => document.getElementById(`po-qty-${rowId}`)?.focus());
          } else if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="Search item name…"
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {suggestions.length > 0 ? suggestions.map((item, index) => (
            <button type="button" key={normalizeItemName(item.name)} onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(item); setOpen(false); requestAnimationFrame(() => document.getElementById(`po-qty-${rowId}`)?.focus()); }}
              className={cn('flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0', activeIndex === index ? 'bg-primary/5' : 'hover:bg-muted/60')}>
              <p className="truncate text-sm font-body font-semibold text-foreground">{item.name}</p>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-body font-bold text-muted-foreground">
                {PO_UNIT_OPTIONS.find(o => o.value === item.unit)?.label ?? item.unit}
              </span>
            </button>
          )) : (
            <div className="px-3 py-4 text-center text-xs font-body text-muted-foreground">No matching item found. The typed name can still be saved as new.</div>
          )}
        </div>
      )}
    </div>
  );
}

function POSupplierPicker({ value, supplierId, suppliers, onChange, onSelect, firstItemInputId }: {
  value: string;
  supplierId: string;
  suppliers: { id: string; businessName: string; contactName: string }[];
  onChange: (value: string) => void;
  onSelect: (supplier: { id: string; businessName: string; contactName: string }) => void;
  firstItemInputId: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return suppliers.slice(0, 20);
    return suppliers.filter(s => s.businessName.toLowerCase().includes(query) || s.contactName.toLowerCase().includes(query)).slice(0, 20);
  }, [value, suppliers]);
  useEffect(() => { setActiveIndex(0); }, [value, suggestions.length]);
  const selectSupplier = (supplier: { id: string; businessName: string; contactName: string }) => {
    onSelect(supplier);
    setOpen(false);
    requestAnimationFrame(() => document.getElementById(firstItemInputId)?.focus());
  };
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={event => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length > 0) { event.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
          else if (event.key === 'ArrowUp' && suggestions.length > 0) { event.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
          else if (event.key === 'Enter' && open && suggestions[activeIndex]) { event.preventDefault(); selectSupplier(suggestions[activeIndex]); }
          else if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="Search supplier name…"
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {suggestions.length > 0 ? suggestions.map((supplier, index) => (
            <button type="button" key={supplier.id} onMouseDown={e => e.preventDefault()} onClick={() => selectSupplier(supplier)}
              className={cn('flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0', activeIndex === index ? 'bg-primary/5' : 'hover:bg-muted/60', supplierId === supplier.id && 'bg-primary/10')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-body font-semibold text-foreground">{supplier.businessName}</p>
                <p className="text-[10px] font-body text-muted-foreground">{supplier.contactName}</p>
              </div>
              {supplierId === supplier.id && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          )) : <div className="px-3 py-4 text-center text-xs font-body text-muted-foreground">No matching supplier found.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Create PO Modal ────────────────────────────────────────────────────────
function CreatePOModal({ onClose, onCreated }: { onClose: () => void; onCreated: (poNumber: string) => void }) {
  const { suppliers, loaded: suppLoaded, load: loadSuppliers } = useSupplierStore();
  const { items: stockItems, loaded: stockLoaded, load: loadStock } = useStoreStockStore();
  const { createPO } = useStorePurchaseOrderStore();

  useEffect(() => { if (!suppLoaded) void loadSuppliers(); }, [suppLoaded, loadSuppliers]);
  useEffect(() => { if (!stockLoaded) void loadStock(); }, [stockLoaded, loadStock]);

  const [supplierId, setSupplierId] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(businessDate());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POLineDraft[]>([createPOLineDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string[]>>({});

  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const selectedItemNames = lines.map(l => l.itemName).filter(Boolean);

  const updateLine = (rowId: string, patch: Partial<POLineDraft>) => {
    setLines(current => current.map(l => l.rowId === rowId ? { ...l, ...patch } : l));
    setLineErrors(current => { if (!current[rowId]) return current; const next = { ...current }; delete next[rowId]; return next; });
    setError('');
  };
  const selectItem = (rowId: string, suggestion: { name: string; unit: StockUnit }) => updateLine(rowId, { itemName: suggestion.name, unit: suggestion.unit });
  const addLine = () => {
    setLines(current => {
      const next = [...current, createPOLineDraft()];
      requestAnimationFrame(() => document.getElementById(`po-item-${next[next.length - 1].rowId}`)?.focus());
      return next;
    });
  };
  const removeLine = (rowId: string) => setLines(current => current.length > 1 ? current.filter(l => l.rowId !== rowId) : current);

  const validate = (): StorePOLineItem[] | null => {
    setError('');
    const nextLineErrors: Record<string, string[]> = {};
    const seen = new Set<string>();
    const normalized: StorePOLineItem[] = [];
    for (const line of lines) {
      const errors: string[] = [];
      const itemName = line.itemName.trim();
      const quantity = Number(line.quantity);
      const key = normalizeItemName(itemName);
      if (!itemName) errors.push('Select or enter an item name.');
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero.');
      if (itemName && seen.has(key)) errors.push('This item is already present in another row.');
      if (itemName) seen.add(key);
      if (errors.length > 0) nextLineErrors[line.rowId] = errors;
      normalized.push({ itemName, quantity: Number.isFinite(quantity) ? quantity : 0, unit: line.unit });
    }
    setLineErrors(nextLineErrors);
    if (!supplierId) { setError('Select a supplier before saving the purchase order.'); return null; }
    if (Object.keys(nextLineErrors).length > 0) { setError('Correct the highlighted items before saving.'); return null; }
    return normalized;
  };

  const handleSave = async () => {
    if (saving) return;
    const poLines = validate();
    if (!poLines) return;
    setSaving(true);
    setError('');
    try {
      const result = await createPO({ supplierId, expectedDeliveryDate: expectedDeliveryDate || null, lineItems: poLines, notes: notes.trim() });
      if (!result.po) { setError(result.error ?? 'Failed to save the purchase order. Please try again.'); return; }
      onCreated(result.po.poNumber);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the purchase order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:items-center md:justify-center md:p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-background md:max-w-5xl md:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 md:px-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground md:text-xl">New Purchase Order</h3>
              <p className="text-[11px] font-body text-muted-foreground">Item and quantity only — pricing is added when this PO is converted to a GRN after Owner approval. Stock is not affected until then.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="flex size-9 shrink-0 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-50"><X className="size-4" /></button>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 md:px-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h4 className="mb-3 text-sm font-body font-bold text-foreground">Purchase order details</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Supplier *</label>
                <POSupplierPicker
                  value={supplierQuery}
                  supplierId={supplierId}
                  suppliers={suppliers}
                  onChange={value => { setSupplierQuery(value); if (!value) setSupplierId(''); }}
                  onSelect={supplier => { setSupplierId(supplier.id); setSupplierQuery(supplier.businessName); setError(''); }}
                  firstItemInputId={`po-item-${lines[0]?.rowId}`}
                />
                {supplierId && selectedSupplier && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-body text-primary"><Check className="size-3" /> {selectedSupplier.businessName}</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Expected Delivery Date</label>
                <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </section>

          <section className="overflow-visible rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h4 className="text-sm font-body font-bold text-foreground">Items requested</h4>
              <button type="button" onClick={addLine} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 px-3 text-xs font-body font-bold text-primary hover:bg-primary/10">
                <Plus className="size-3.5" /> Add Item
              </button>
            </div>
            <div className="space-y-3 p-3">
              {lines.map((line, index) => (
                <div key={line.rowId} className={cn('rounded-2xl border bg-card p-3 grid grid-cols-[minmax(0,1fr)_110px_100px_40px] items-start gap-2', lineErrors[line.rowId]?.length ? 'border-red-300 bg-red-50/30' : 'border-border')}>
                  <POItemPicker
                    value={line.itemName}
                    rowId={line.rowId}
                    stockItems={stockItems}
                    selectedItemNames={selectedItemNames.filter(n => normalizeItemName(n) !== normalizeItemName(line.itemName))}
                    onChange={itemName => updateLine(line.rowId, { itemName })}
                    onSelect={suggestion => selectItem(line.rowId, suggestion)}
                  />
                  <input
                    id={`po-qty-${line.rowId}`}
                    type="number" min="0" step="any" inputMode="decimal"
                    value={line.quantity}
                    onChange={e => updateLine(line.rowId, { quantity: e.target.value })}
                    placeholder="Qty"
                    className="h-10 w-full rounded-xl border border-border bg-background px-2 text-right text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <select value={line.unit} onChange={e => updateLine(line.rowId, { unit: e.target.value as StockUnit })} className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {PO_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button type="button" onClick={() => removeLine(line.rowId)} disabled={lines.length === 1} className="flex size-9 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-25" aria-label={`Remove item ${index + 1}`}>
                    <Trash2 className="size-4" />
                  </button>
                  {lineErrors[line.rowId]?.length > 0 && (
                    <div className="col-span-4 flex items-start gap-1.5 text-[11px] font-body text-red-700">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" /><span>{lineErrors[line.rowId].join(' ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div>
            <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Reason for this order, urgency, etc…" className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-body text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-4 py-4 md:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-xl border border-border px-5 text-sm font-body font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="flex h-11 min-w-52 items-center justify-center gap-2 rounded-xl cafe-gradient px-5 text-sm font-body font-bold text-primary-foreground disabled:opacity-50 active:scale-[0.99]">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><ClipboardList className="size-4" /> Send for Owner Approval</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
function SuccessToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-32 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-xl md:left-auto md:right-6 md:w-[380px]">
      <CheckCircle2 className="size-5 shrink-0" />
      <div className="flex-1"><p className="text-sm font-body font-bold">{message}</p></div>
      <button type="button" onClick={onClose}><X className="size-4 opacity-70" /></button>
    </div>
  );
}

// ─── Main Purchase Order Tab ────────────────────────────────────────────────
export default function StorePurchaseOrderTab() {
  const { orders, loaded, loading, load } = useStorePurchaseOrderStore();
  const [showCreate, setShowCreate] = useState(false);
  const [convertingPO, setConvertingPO] = useState<StorePurchaseOrder | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_approval' | 'approved' | 'rejected' | 'converted'>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(po => {
      if (filterStatus !== 'all' && po.status !== filterStatus) return false;
      if (q && !po.poNumber.toLowerCase().includes(q) && !po.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, filterStatus]);

  const pending = orders.filter(o => o.status === 'pending_approval').length;
  const approved = orders.filter(o => o.status === 'approved').length;
  const rejected = orders.filter(o => o.status === 'rejected').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending', value: pending, color: pending > 0 ? 'text-amber-600' : 'text-muted-foreground', bg: pending > 0 ? 'bg-amber-50 border-amber-200' : '' },
          { label: 'Approved', value: approved, color: 'text-emerald-600', bg: '' },
          { label: 'Rejected', value: rejected, color: rejected > 0 ? 'text-red-600' : 'text-muted-foreground', bg: '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-lg font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search purchase orders…" className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => setShowCreate(true)} className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95">
          <Plus className="size-3.5" /> New
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { id: 'all', label: 'All' },
          { id: 'pending_approval', label: '⏳ Pending' },
          { id: 'approved', label: '✓ Approved' },
          { id: 'rejected', label: '✗ Rejected' },
          { id: 'converted', label: '→ Converted' },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilterStatus(f.id)} className={cn('shrink-0 text-[11px] font-body font-semibold px-3 py-1.5 rounded-full border transition-all', filterStatus === f.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && !loaded ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <ClipboardList className="size-10 opacity-20" />
          <p className="text-sm font-body">{orders.length === 0 ? 'No purchase orders yet — tap New to raise one' : 'No matches'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(po => <POCard key={po.id} po={po} onConvert={setConvertingPO} />)}
        </div>
      )}

      {showCreate && (
        <CreatePOModal
          onClose={() => setShowCreate(false)}
          onCreated={(poNumber) => { setToast(`${poNumber} sent for Owner approval`); void load(); }}
        />
      )}

      {convertingPO && (
        <CreateInvoiceModal
          sourcePO={{
            id: convertingPO.id,
            poNumber: convertingPO.poNumber,
            supplierId: convertingPO.supplierId,
            supplierName: convertingPO.supplierName,
            lineItems: convertingPO.lineItems,
          }}
          onClose={() => setConvertingPO(null)}
          onCreated={(invoiceNumber) => { setToast(`${convertingPO.poNumber} converted to ${invoiceNumber}`); setConvertingPO(null); void load(); }}
        />
      )}

      {toast && <SuccessToast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
