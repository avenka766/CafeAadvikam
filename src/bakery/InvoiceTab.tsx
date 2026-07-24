// src/bakery/InvoiceTab.tsx
// Store Invoice Tab – create supplier delivery invoices, sync stock, send to admin.

import { useState, useEffect, useMemo } from 'react';
import { businessDate } from '@/lib/businessDate'; // BUG #14 FIX: needed for synced_to_stock update after invoice created
import {
  FileText, Plus, Trash2, Printer, Send, ChevronDown,
  ChevronUp, CheckCircle2, X, Check, Loader2, AlertTriangle,
  Search, IndianRupee, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupplierStore } from './supplierStore';
import { useInvoiceStore, type StoreInvoice, type InvoiceLineItem } from './invoiceStore';
import { useStoreStockStore, type StockUnit } from './storeStockStore';
import { useNotificationStore } from './notificationStore';
import { searchItems } from './storeItemMaster';

// ─── Print helper ─────────────────────────────────────────────────────────────
function printInvoice(invoice: StoreInvoice) {
  const win = window.open('', '_blank', 'width=480,height=700');
  if (!win) return;

  const rows = invoice.lineItems.map((li, i) => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:7px 8px;">${i + 1}</td>
      <td style="padding:7px 8px;font-weight:600;">${li.itemName}</td>
      <td style="padding:7px 8px;text-align:right;">${li.quantity} ${li.unit}</td>
      <td style="padding:7px 8px;text-align:right;">₹${li.pricePerUnit.toFixed(2)}</td>
      <td style="padding:7px 8px;text-align:right;font-weight:700;">₹${li.totalPrice.toFixed(2)}</td>
    </tr>
  `).join('');

  const statusColor = invoice.status === 'approved'
    ? '#16a34a' : invoice.status === 'rejected' ? '#dc2626' : '#d97706';
  const statusLabel = invoice.status === 'approved'
    ? 'Approved' : invoice.status === 'rejected' ? 'Rejected' : 'Pending Review';

  win.document.write(`
    <!DOCTYPE html><html><head>
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#1a1a1a; padding:28px; }
      .header { border-bottom:2px solid #e5e7eb; padding-bottom:16px; margin-bottom:20px; }
      .logo { font-size:20px; font-weight:800; color:#2D7D6F; }
      .sub { font-size:11px; color:#888; margin-top:2px; }
      .inv-meta { display:flex; justify-content:space-between; margin-bottom:20px; }
      .inv-meta div { font-size:12px; }
      .inv-meta strong { display:block; font-size:15px; color:#1a1a1a; margin-bottom:2px; }
      .status { display:inline-block; padding:3px 10px; border-radius:100px; font-size:11px;
                font-weight:700; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44; }
      table { width:100%; border-collapse:collapse; margin-bottom:24px; }
      thead th { background:#f9fafb; padding:8px; text-align:left; font-size:10px;
                 text-transform:uppercase; letter-spacing:.05em; color:#666; border-bottom:2px solid #e5e7eb; }
      thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align:right; }
      .total-row td { padding:10px 8px; font-weight:800; font-size:15px; border-top:2px solid #e5e7eb; }
      .total-row td:last-child { color:#2D7D6F; text-align:right; }
      .footer { margin-top:28px; padding-top:12px; border-top:1px solid #e5e7eb;
                font-size:10px; color:#aaa; text-align:center; }
      .notes { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;
               padding:10px 14px; font-size:12px; color:#555; margin-bottom:16px; }
    </style>
    </head><body>
    <div class="header">
      <div class="logo">Cafe Aadvikam</div>
      <div class="sub">Store Purchase Invoice</div>
    </div>

    <div class="inv-meta">
      <div>
        <strong>${invoice.invoiceNumber}</strong>
        <span class="status">${statusLabel}</span>
        <div style="margin-top:8px;color:#555;">
          <div><b>Supplier:</b> ${invoice.supplierName}</div>
          <div><b>Delivery Date:</b> ${new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          <div><b>Created:</b> ${new Date(invoice.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    </div>

    <div className="table-scroll-container"><div className="table-inner-scroll"><table>
      <thead>
        <tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4">Grand Total</td>
          <td>₹${invoice.grandTotal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table></div></div>

    ${invoice.notes ? `<div class="notes"><b>Notes:</b> ${invoice.notes}</div>` : ''}
    ${invoice.reviewNote ? `<div class="notes" style="border-color:${statusColor}44;"><b>Admin Note:</b> ${invoice.reviewNote}</div>` : ''}

    <div class="footer">
      Cafe Aadvikam · Store Purchase Invoice · ${invoice.syncedToStock ? 'Stock Synced ✓' : 'Stock not synced'}
    </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ─── Invoice Card (list view) ─────────────────────────────────────────────────
function InvoiceCard({ invoice, onPrint, onEdit }: { invoice: StoreInvoice; onPrint: (inv: StoreInvoice) => void; onEdit?: (inv: StoreInvoice) => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusMeta = {
    pending_review: { label: 'Pending Review', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    approved:       { label: 'Approved',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    rejected:       { label: 'Rejected',       color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  }[invoice.status];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-muted/20"
        onClick={() => setExpanded(v => !v)}
      >
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center shrink-0',
          invoice.status === 'pending_review' ? 'bg-amber-50' : invoice.status === 'approved' ? 'bg-emerald-50' : 'bg-red-50'
        )}>
          <FileText className={cn('size-4', invoice.status === 'pending_review' ? 'text-amber-600' : invoice.status === 'approved' ? 'text-emerald-600' : 'text-red-600')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">{invoice.invoiceNumber}</span>
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border flex items-center gap-1', statusMeta.color)}>
              <span className={cn('size-1.5 rounded-full', statusMeta.dot)} />
              {statusMeta.label}
            </span>
            {invoice.syncedToStock && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Stock Synced ✓
              </span>
            )}
            {invoice.editedAt && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1">
                ✎ Edited {invoice.editCount && invoice.editCount > 1 ? `(×${invoice.editCount})` : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {invoice.supplierName} · ₹{invoice.grandTotal.toFixed(2)}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          <div className="flex justify-between text-xs font-body text-muted-foreground">
            <span>Delivery: {new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span>Created: {new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-5">Item</span>
              <span className="col-span-3 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Total</span>
            </div>
            {invoice.lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-border/50 text-xs font-body">
                <span className="col-span-5 font-semibold text-foreground truncate">{li.itemName}</span>
                <span className="col-span-3 text-right text-muted-foreground">{li.quantity} {li.unit}</span>
                <span className="col-span-2 text-right text-muted-foreground">₹{li.pricePerUnit}</span>
                <span className="col-span-2 text-right font-bold text-foreground">₹{li.totalPrice.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2.5 bg-primary/5 border-t border-primary/20">
              <span className="text-xs font-body font-bold text-foreground">Grand Total</span>
              <span className="text-sm font-display font-bold text-primary">₹{invoice.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {invoice.notes && (
            <p className="text-xs font-body text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <span className="font-bold text-foreground">Notes: </span>{invoice.notes}
            </p>
          )}
          {invoice.reviewNote && (
            <p className={cn('text-xs font-body rounded-xl px-3 py-2',
              invoice.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            )}>
              <span className="font-bold">Admin: </span>{invoice.reviewNote}
            </p>
          )}
          {invoice.editedAt && (
            <p className="text-[11px] font-body text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              ✎ Last edited {new Date(invoice.editedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {invoice.editCount && invoice.editCount > 1 && ` · ${invoice.editCount} edits total`}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onPrint(invoice)}
              className="flex-1 h-10 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-body font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Printer className="size-4" /> Print
            </button>
            {invoice.status === 'pending_review' && onEdit && (
              <button
                onClick={() => onEdit(invoice)}
                className="flex-1 h-10 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-sm font-body font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                ✎ Edit & Resubmit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create / Edit Invoice ────────────────────────────────────────────────────
const INVOICE_UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
  { value: 'kg', label: 'KG' },
  { value: 'ltr', label: 'Ltr' },
  { value: 'pcs', label: 'Pcs' },
  { value: 'nos', label: 'Nos' },
  { value: 'bunch', label: 'Bunch' },
];

interface InvoiceLineDraft {
  rowId: string;
  itemName: string;
  quantity: string;
  unit: StockUnit;
  pricePerUnit: string;
}

interface InvoiceItemSuggestion {
  name: string;
  unit: StockUnit;
  category: string;
  stockQuantity?: number;
}

function invoiceUnit(raw?: string): StockUnit {
  const unit = (raw ?? '').trim().toLowerCase();
  if (['l', 'lt', 'lts', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'].includes(unit)) return 'ltr';
  if (['pc', 'pcs', 'piece', 'pieces', 'pkt', 'pkts', 'packet', 'packets'].includes(unit)) return 'pcs';
  if (['no', 'nos', 'number', 'numbers'].includes(unit)) return 'nos';
  if (['bunch', 'bunches'].includes(unit)) return 'bunch';
  return 'kg';
}

function createLineDraft(line?: InvoiceLineItem): InvoiceLineDraft {
  return {
    rowId: crypto.randomUUID(),
    itemName: line?.itemName ?? '',
    quantity: line ? String(line.quantity) : '1',
    unit: invoiceUnit(line?.unit),
    pricePerUnit: line ? String(line.pricePerUnit) : '',
  };
}

function draftNumber(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItemName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatStockQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function InvoiceItemPicker({
  value,
  stockItems,
  selectedItemNames,
  onChange,
  onSelect,
}: {
  value: string;
  stockItems: ReturnType<typeof useStoreStockStore.getState>['items'];
  selectedItemNames: string[];
  onChange: (value: string) => void;
  onSelect: (suggestion: InvoiceItemSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo<InvoiceItemSuggestion[]>(() => {
    const query = normalizeItemName(value);
    const selected = new Set(selectedItemNames.map(normalizeItemName));
    const byName = new Map<string, InvoiceItemSuggestion>();

    for (const stockItem of stockItems) {
      const key = normalizeItemName(stockItem.name);
      if (query && !key.includes(query)) continue;
      byName.set(key, {
        name: stockItem.name,
        unit: invoiceUnit(stockItem.unit),
        category: 'Inventory',
        stockQuantity: stockItem.quantity,
      });
    }

    for (const masterItem of searchItems(value)) {
      const key = normalizeItemName(masterItem.item);
      if (!byName.has(key)) {
        byName.set(key, {
          name: masterItem.item,
          unit: invoiceUnit(masterItem.uom),
          category: masterItem.category || 'Item Master',
        });
      }
    }

    return Array.from(byName.values())
      .filter(item => !selected.has(normalizeItemName(item.name)) || normalizeItemName(item.name) === normalizeItemName(value))
      .slice(0, 16);
  }, [selectedItemNames, stockItems, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, suggestions.length]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={event => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault();
            setActiveIndex(index => Math.min(index + 1, suggestions.length - 1));
          } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
            event.preventDefault();
            setActiveIndex(index => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && suggestions[activeIndex]) {
            event.preventDefault();
            onSelect(suggestions[activeIndex]);
            setOpen(false);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Search item name…"
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {suggestions.length > 0 ? suggestions.map((item, index) => (
            <button
              type="button"
              key={normalizeItemName(item.name)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => { onSelect(item); setOpen(false); }}
              className={cn(
                'flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-0',
                activeIndex === index ? 'bg-primary/5' : 'hover:bg-muted/60',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-body font-semibold text-foreground">{item.name}</p>
                <p className="text-[10px] font-body text-muted-foreground">
                  {item.category}
                  {item.stockQuantity !== undefined ? ` · Stock ${formatStockQuantity(item.stockQuantity)} ${INVOICE_UNIT_OPTIONS.find(option => option.value === item.unit)?.label ?? item.unit}` : ' · Item master'}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-body font-bold text-muted-foreground">
                {INVOICE_UNIT_OPTIONS.find(option => option.value === item.unit)?.label ?? item.unit}
              </span>
            </button>
          )) : (
            <div className="px-3 py-4 text-center text-xs font-body text-muted-foreground">
              No matching item found. The typed name can still be saved as a new inventory item.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InvoiceLineEditor({
  line,
  index,
  stockItems,
  selectedItemNames,
  errors,
  canRemove,
  onUpdate,
  onSelectItem,
  onRemove,
}: {
  line: InvoiceLineDraft;
  index: number;
  stockItems: ReturnType<typeof useStoreStockStore.getState>['items'];
  selectedItemNames: string[];
  errors: string[];
  canRemove: boolean;
  onUpdate: (patch: Partial<InvoiceLineDraft>) => void;
  onSelectItem: (suggestion: InvoiceItemSuggestion) => void;
  onRemove: () => void;
}) {
  const quantity = draftNumber(line.quantity);
  const rate = draftNumber(line.pricePerUnit);
  const total = Number((quantity * rate).toFixed(2));

  return (
    <div className={cn(
      'rounded-2xl border bg-card p-3 md:grid md:grid-cols-[minmax(230px,2.4fr)_minmax(90px,.7fr)_minmax(105px,.8fr)_minmax(110px,.85fr)_minmax(105px,.85fr)_40px] md:items-start md:gap-2 md:rounded-none md:border-x-0 md:border-t-0 md:p-2.5',
      errors.length > 0 ? 'border-red-300 bg-red-50/30' : 'border-border',
    )}>
      <div>
        <label className="mb-1 block text-[9px] font-body font-bold uppercase text-muted-foreground md:hidden">Item {index + 1}</label>
        <InvoiceItemPicker
          value={line.itemName}
          stockItems={stockItems}
          selectedItemNames={selectedItemNames}
          onChange={itemName => onUpdate({ itemName })}
          onSelect={onSelectItem}
        />
      </div>

      <div className="mt-2 md:mt-0">
        <label className="mb-1 block text-[9px] font-body font-bold uppercase text-muted-foreground md:hidden">Quantity</label>
        <input
          type="number"
          min="0"
          step="any"
          value={line.quantity}
          onChange={event => onUpdate({ quantity: event.target.value })}
          placeholder="0"
          inputMode="decimal"
          className="h-10 w-full rounded-xl border border-border bg-background px-2 text-right text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="mt-2 md:mt-0">
        <label className="mb-1 block text-[9px] font-body font-bold uppercase text-muted-foreground md:hidden">Unit</label>
        <select
          value={line.unit}
          onChange={event => onUpdate({ unit: event.target.value as StockUnit })}
          className="h-10 w-full rounded-xl border border-border bg-background px-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {INVOICE_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="mt-2 md:mt-0">
        <label className="mb-1 block text-[9px] font-body font-bold uppercase text-muted-foreground md:hidden">Rate</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-body text-muted-foreground">₹</span>
          <input
            type="number"
            min="0"
            step="any"
            value={line.pricePerUnit}
            onChange={event => onUpdate({ pricePerUnit: event.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            className="h-10 w-full rounded-xl border border-border bg-background pl-6 pr-2 text-right text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="mt-2 flex h-10 items-center justify-between rounded-xl bg-primary/5 px-3 md:mt-0 md:justify-end">
        <span className="text-[9px] font-body font-bold uppercase text-muted-foreground md:hidden">Amount</span>
        <span className="text-sm font-body font-bold tabular-nums text-primary">₹{total.toFixed(2)}</span>
      </div>

      <div className="mt-2 flex justify-end md:mt-1">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex size-9 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-25"
          aria-label={`Remove item ${index + 1}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {errors.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] font-body text-red-700 md:col-span-6 md:mt-0">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>{errors.join(' ')}</span>
        </div>
      )}
    </div>
  );
}

function CreateInvoiceModal({
  onClose,
  onCreated,
  editingInvoice,
}: {
  onClose: () => void;
  onCreated: (invoiceNumber: string, mode: 'created' | 'updated') => void;
  editingInvoice?: StoreInvoice;
}) {
  const { suppliers, loaded: suppLoaded, load: loadSuppliers } = useSupplierStore();
  const { createInvoice, updateInvoice } = useInvoiceStore();
  const { items: stockItems, loaded: stockLoaded, load: loadStock } = useStoreStockStore();
  const { pushInvoicePending } = useNotificationStore();

  useEffect(() => { if (!suppLoaded) void loadSuppliers(); }, [suppLoaded, loadSuppliers]);
  useEffect(() => { if (!stockLoaded) void loadStock(); }, [stockLoaded, loadStock]);

  const [supplierId, setSupplierId] = useState(editingInvoice?.supplierId ?? '');
  const [deliveryDate, setDeliveryDate] = useState(editingInvoice?.deliveryDate ?? businessDate());
  const [notes, setNotes] = useState(editingInvoice?.notes ?? '');
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => {
    const initialLines = editingInvoice?.lineItems.map(createLineDraft) ?? [createLineDraft()];
    return initialLines.length > 0 ? initialLines : [createLineDraft()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string[]>>({});

  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);
  const selectedItemNames = lines.map(line => line.itemName).filter(Boolean);
  const grandTotal = lines.reduce((sum, line) => sum + draftNumber(line.quantity) * draftNumber(line.pricePerUnit), 0);

  const today = businessDate();
  const yesterday = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }, [today]);
  const minimumDate = editingInvoice && editingInvoice.deliveryDate < yesterday ? editingInvoice.deliveryDate : yesterday;

  const updateLine = (rowId: string, patch: Partial<InvoiceLineDraft>) => {
    setLines(current => current.map(line => line.rowId === rowId ? { ...line, ...patch } : line));
    setLineErrors(current => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setError('');
  };

  const selectItem = (rowId: string, suggestion: InvoiceItemSuggestion) => {
    const currentLine = lines.find(line => line.rowId === rowId);
    const duplicate = lines.find(line => line.rowId !== rowId && normalizeItemName(line.itemName) === normalizeItemName(suggestion.name));

    if (duplicate && currentLine) {
      const mergedQuantity = draftNumber(duplicate.quantity) + Math.max(1, draftNumber(currentLine.quantity));
      setLines(current => current
        .filter(line => line.rowId !== rowId)
        .map(line => line.rowId === duplicate.rowId ? { ...line, quantity: String(mergedQuantity) } : line));
      setInfo(`${suggestion.name} was already added. Its quantity has been increased instead of creating a duplicate row.`);
      return;
    }

    updateLine(rowId, { itemName: suggestion.name, unit: suggestion.unit });
    setInfo('');
  };

  const addLine = () => {
    setLines(current => [...current, createLineDraft()]);
    setInfo('');
  };

  const removeLine = (rowId: string) => {
    setLines(current => current.length > 1 ? current.filter(line => line.rowId !== rowId) : current);
    setLineErrors(current => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  };

  const validate = (): InvoiceLineItem[] | null => {
    setError('');
    setInfo('');
    const nextLineErrors: Record<string, string[]> = {};
    const seenNames = new Set<string>();
    const normalizedLines: InvoiceLineItem[] = [];

    for (const line of lines) {
      const errors: string[] = [];
      const itemName = line.itemName.trim();
      const quantity = Number(line.quantity);
      const pricePerUnit = Number(line.pricePerUnit || '0');
      const key = normalizeItemName(itemName);

      if (!itemName) errors.push('Select or enter an item name.');
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero.');
      if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) errors.push('Rate cannot be negative.');
      if (itemName && seenNames.has(key)) errors.push('This item is already present in another row.');
      if (itemName) seenNames.add(key);

      if (errors.length > 0) nextLineErrors[line.rowId] = errors;
      normalizedLines.push({
        itemName,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: line.unit,
        pricePerUnit: Number.isFinite(pricePerUnit) ? pricePerUnit : 0,
        totalPrice: Number(((Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(pricePerUnit) ? pricePerUnit : 0)).toFixed(2)),
      });
    }

    setLineErrors(nextLineErrors);
    if (!supplierId) { setError('Select a supplier before saving the invoice.'); return null; }
    if (!deliveryDate) { setError('Select a delivery date.'); return null; }
    const originalOldDate = Boolean(editingInvoice && deliveryDate === editingInvoice.deliveryDate && deliveryDate < yesterday);
    if (deliveryDate > today) { setError('Delivery date cannot be in the future.'); return null; }
    if (deliveryDate < yesterday && !originalOldDate) { setError('Delivery date can only be today or yesterday.'); return null; }
    if (Object.keys(nextLineErrors).length > 0) { setError('Correct the highlighted invoice items before saving.'); return null; }
    return normalizedLines;
  };


  const handleSave = async () => {
    if (saving) return;
    const invoiceLines = validate();
    if (!invoiceLines) return;

    const supplier = suppliers.find(item => item.id === supplierId);
    if (!supplier) { setError('The selected supplier is no longer available. Refresh and select it again.'); return; }

    setSaving(true);
    setError('');
    const normalizedNotes = notes.trim();
    const normalizedGrandTotal = Number(invoiceLines.reduce((sum, line) => sum + line.totalPrice, 0).toFixed(2));

    try {
      if (editingInvoice) {
        const updateError = await updateInvoice(editingInvoice.id, {
          supplierId,
          supplierName: supplier.businessName,
          deliveryDate,
          lineItems: invoiceLines,
          grandTotal: normalizedGrandTotal,
          notes: normalizedNotes,
          syncedToStock: editingInvoice.syncedToStock,
        });
        if (updateError) { setError(updateError); return; }

        await loadStock();
        try {
          await pushInvoicePending(editingInvoice.id, editingInvoice.invoiceNumber, supplier.businessName, normalizedGrandTotal);
        } catch (notificationError) {
          console.warn('[InvoiceTab] Invoice updated, but the Admin notification refresh failed.', notificationError);
        }
        onCreated(editingInvoice.invoiceNumber, 'updated');
        onClose();
        return;
      }

      const createResult = await createInvoice({
        supplierId,
        supplierName: supplier.businessName,
        deliveryDate,
        lineItems: invoiceLines,
        grandTotal: normalizedGrandTotal,
        notes: normalizedNotes,
        syncedToStock: false,
      });

      if (!createResult.invoice) {
        setError(createResult.error ?? 'Failed to save the invoice. Please try again.');
        return;
      }

      if (!createResult.invoice.syncedToStock) {
        setError('The invoice was not synchronized to inventory. Apply the latest database migration and retry.');
        return;
      }

      await loadStock();

      try {
        await pushInvoicePending(createResult.invoice.id, createResult.invoice.invoiceNumber, supplier.businessName, normalizedGrandTotal);
      } catch (notificationError) {
        console.warn('[InvoiceTab] Invoice created, but the Admin notification refresh failed.', notificationError);
      }
      onCreated(createResult.invoice.invoiceNumber, 'created');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:items-center md:justify-center md:p-4" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-background md:max-w-6xl md:rounded-3xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground md:text-xl">{editingInvoice ? `Edit ${editingInvoice.invoiceNumber}` : 'New Store Invoice'}</h3>
              <p className="text-[11px] font-body text-muted-foreground">
                {editingInvoice ? 'Changes update the pending invoice and adjust inventory only by the quantity difference.' : 'Add supplier delivery items, update inventory and send the invoice to Admin.'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="flex size-9 shrink-0 items-center justify-center rounded-xl hover:bg-muted disabled:opacity-50">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 md:px-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-body font-bold text-foreground">Invoice details</h4>
                <p className="text-[10px] font-body text-muted-foreground">Choose the supplier and delivery date first.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Supplier *</label>
                <select
                  value={supplierId}
                  onChange={event => { setSupplierId(event.target.value); setError(''); }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.businessName} – {supplier.contactName}</option>
                  ))}
                </select>
                {supplierId && selectedSupplier && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-body text-primary"><Check className="size-3" /> {selectedSupplier.businessName}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Delivery Date *</label>
                <input
                  type="date"
                  value={deliveryDate}
                  min={minimumDate}
                  max={today}
                  onChange={event => { setDeliveryDate(event.target.value); setError(''); }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-[10px] font-body text-muted-foreground">New dates are limited to today or yesterday.</p>
              </div>
            </div>
          </section>

          <section className="overflow-visible rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h4 className="text-sm font-body font-bold text-foreground">Items delivered</h4>
                <p className="text-[10px] font-body text-muted-foreground">Search inventory or the item master. Unit is filled automatically.</p>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 px-3 text-xs font-body font-bold text-primary hover:bg-primary/10"
              >
                <Plus className="size-3.5" /> Add Item
              </button>
            </div>

            <div className="hidden grid-cols-[minmax(230px,2.4fr)_minmax(90px,.7fr)_minmax(105px,.8fr)_minmax(110px,.85fr)_minmax(105px,.85fr)_40px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[9px] font-body font-bold uppercase text-muted-foreground md:grid">
              <span>Item</span><span className="text-right">Quantity</span><span>Unit</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
            </div>

            <div className="space-y-3 p-3 md:space-y-0 md:p-0">
              {lines.map((line, index) => (
                <InvoiceLineEditor
                  key={line.rowId}
                  line={line}
                  index={index}
                  stockItems={stockItems}
                  selectedItemNames={selectedItemNames.filter(name => normalizeItemName(name) !== normalizeItemName(line.itemName))}
                  errors={lineErrors[line.rowId] ?? []}
                  canRemove={lines.length > 1}
                  onUpdate={patch => updateLine(line.rowId, patch)}
                  onSelectItem={suggestion => selectItem(line.rowId, suggestion)}
                  onRemove={() => removeLine(line.rowId)}
                />
              ))}
            </div>
          </section>

          {info && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-body text-blue-700">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /><span>{info}</span>
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div>
              <label className="mb-1.5 block text-[10px] font-body font-bold uppercase text-muted-foreground">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={event => { setNotes(event.target.value); setError(''); }}
                placeholder="Remarks about this delivery…"
                rows={3}
                maxLength={1000}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-right text-[9px] font-body text-muted-foreground">{notes.length}/1000</p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-body font-bold text-foreground"><IndianRupee className="size-4 text-primary" /> Grand Total</span>
                <span className="font-display text-2xl font-bold tabular-nums text-primary">₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="mt-3 flex items-start gap-2 border-t border-primary/15 pt-3 text-[11px] font-body text-blue-700">
                <Package className="mt-0.5 size-3.5 shrink-0" />
                <span>{editingInvoice ? 'Inventory will be changed only by the difference between the original and edited quantities.' : 'Inventory is synchronized with this invoice when it is saved.'}</span>
              </div>
            </div>
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-body text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-xl border border-border px-5 text-sm font-body font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex h-11 min-w-52 items-center justify-center gap-2 rounded-xl cafe-gradient px-5 text-sm font-body font-bold text-primary-foreground disabled:opacity-50 active:scale-[0.99]"
            >
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving safely…</> : editingInvoice ? <><Send className="size-4" /> Update & Resubmit</> : <><Send className="size-4" /> Save & Send to Admin</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Success Toast ────────────────────────────────────────────────────────────
function SuccessToast({ invoiceNumber, mode, onClose }: { invoiceNumber: string; mode: 'created' | 'updated'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed bottom-32 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-xl md:left-auto md:right-6 md:w-[380px]">
      <CheckCircle2 className="size-5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-body font-bold">{invoiceNumber} {mode === 'created' ? 'created' : 'updated'} successfully</p>
        <p className="text-xs font-body opacity-80">Inventory synchronized · Sent to Admin for review</p>
      </div>
      <button type="button" onClick={onClose}><X className="size-4 opacity-70" /></button>
    </div>
  );
}

// ─── Main Invoice Tab ─────────────────────────────────────────────────────────
export default function InvoiceTab() {
  const { invoices, loaded, loading, load, deleteInvoice } = useInvoiceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<StoreInvoice | null>(null);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
  const [toast, setToast] = useState<{ invoiceNumber: string; mode: 'created' | 'updated' } | null>(null);

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
      if (q && !inv.invoiceNumber.toLowerCase().includes(q) && !inv.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, search, filterStatus]);

  const pending  = invoices.filter(i => i.status === 'pending_review').length;
  const approved = invoices.filter(i => i.status === 'approved').length;
  const total    = invoices.reduce((s, i) => s + i.grandTotal, 0);

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending',  value: pending,  color: pending > 0 ? 'text-amber-600' : 'text-muted-foreground', bg: pending > 0 ? 'bg-amber-50 border-amber-200' : '' },
          { label: 'Approved', value: approved, color: 'text-emerald-600', bg: '' },
          { label: 'Total ₹',  value: `₹${(total / 1000).toFixed(1)}k`, color: 'text-primary', bg: '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-lg font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + New */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-10 px-3 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center gap-1.5 active:scale-95"
        >
          <Plus className="size-3.5" /> New
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { id: 'all',            label: 'All' },
          { id: 'pending_review', label: '⏳ Pending' },
          { id: 'approved',       label: '✓ Approved' },
          { id: 'rejected',       label: '✗ Rejected' },
        ] as const).map(f => (
          <button
            key={f.id}
            onClick={() => setFilterStatus(f.id)}
            className={cn(
              'shrink-0 text-[11px] font-body font-semibold px-3 py-1.5 rounded-full border transition-all',
              filterStatus === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/40'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && !loaded ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <FileText className="size-10 opacity-20" />
          <p className="text-sm font-body">
            {invoices.length === 0 ? 'No invoices yet — tap New to create one' : 'No matches'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => (
            <InvoiceCard key={inv.id} invoice={inv} onPrint={printInvoice} onEdit={setEditingInvoice} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={(invoiceNumber, mode) => { setToast({ invoiceNumber, mode }); void load(); }}
        />
      )}

      {editingInvoice && (
        <CreateInvoiceModal
          editingInvoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onCreated={(invoiceNumber, mode) => { setToast({ invoiceNumber, mode }); setEditingInvoice(null); void load(); }}
        />
      )}

      {toast && <SuccessToast invoiceNumber={toast.invoiceNumber} mode={toast.mode} onClose={() => setToast(null)} />}
    </div>
  );
}
