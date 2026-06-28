// src/bakery/InvoiceTab.tsx
// Store Invoice Tab – create supplier delivery invoices, sync stock, send to admin.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate'; // BUG #14 FIX: needed for synced_to_stock update after invoice created
import {
  FileText, Plus, Trash2, Printer, Send, ChevronDown,
  ChevronUp, CheckCircle2, Clock, X, Check, Loader2,
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

// ─── Create Invoice Modal ─────────────────────────────────────────────────────
function CreateInvoiceModal({
  onClose,
  onCreated,
  editingInvoice,
}: {
  onClose: () => void;
  onCreated: (invoiceNumber: string) => void;
  editingInvoice?: StoreInvoice;
}) {
  const { suppliers, loaded: suppLoaded, load: loadSuppliers } = useSupplierStore();
  const { createInvoice, updateInvoice } = useInvoiceStore();
  const { items: stockItems, addItem, updateItem } = useStoreStockStore();
  const { pushInvoicePending } = useNotificationStore();

  useEffect(() => { if (!suppLoaded) void loadSuppliers(); }, [suppLoaded, loadSuppliers]);

  const [supplierId, setSupplierId]   = useState(editingInvoice?.supplierId ?? '');
  const [deliveryDate, setDeliveryDate] = useState(editingInvoice?.deliveryDate ?? businessDate());
  const [notes, setNotes]             = useState(editingInvoice?.notes ?? '');
  const [lines, setLines]             = useState<InvoiceLineItem[]>(
    editingInvoice?.lineItems ?? [{ itemName: '', quantity: 1, unit: 'kg', pricePerUnit: 0, totalPrice: 0 }]
  );
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Reset dismissed state when item name changes
  const handleItemNameChange = (idx: number, val: string) => {
    updateLine(idx, 'itemName', val);
  };

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const UNIT_OPTIONS: { value: StockUnit; label: string }[] = [
    { value: 'kg', label: 'KG' },
    { value: 'ltr', label: 'Ltr' },
    { value: 'pcs', label: 'Pcs' },
    { value: 'nos', label: 'Nos' },
    { value: 'bunch', label: 'Bunch' },
  ];

  const updateLine = (idx: number, key: keyof InvoiceLineItem, val: string | number) => {
    setLines(prev => {
      const next = [...prev];
      const line = { ...next[idx], [key]: val };
      line.totalPrice = Number((line.quantity * line.pricePerUnit).toFixed(2));
      next[idx] = line;
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { itemName: '', quantity: 1, unit: 'kg', pricePerUnit: 0, totalPrice: 0 }]);
    setDismissedHints(new Set()); // reset so new line shows hint fresh
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const grandTotal = lines.reduce((s, l) => s + l.totalPrice, 0);

  const handleSave = async () => {
    if (!supplierId) { setError('Select a supplier'); return; }
    if (lines.some(l => !l.itemName.trim())) { setError('All items need a name'); return; }
    if (lines.some(l => l.quantity <= 0 || l.pricePerUnit < 0)) { setError('Check quantities and prices'); return; }

    // Edit mode: just update the pending invoice, no stock re-sync
    if (editingInvoice) {
      setSaving(true); setError('');
      const err = await updateInvoice(editingInvoice.id, {
        supplierId,
        supplierName: suppliers.find(s => s.id === supplierId)?.businessName ?? editingInvoice.supplierName,
        deliveryDate,
        lineItems: lines,
        grandTotal,
        notes,
        syncedToStock: editingInvoice.syncedToStock,
      });
      setSaving(false);
      if (err) { setError(`Update failed: ${err}`); return; }
      onCreated(editingInvoice.invoiceNumber);
      onClose();
      return;
    }

    // Date guard: no future dates, max 1 day in the past
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const selectedDate = new Date(deliveryDate); selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate > today) { setError('Delivery date cannot be in the future'); return; }
    if (selectedDate < yesterday) { setError('Delivery date can only be today or yesterday'); return; }

    setSaving(true); setError('');

    // BUG #14 FIX: Create invoice FIRST (as audit trail), THEN sync stock.
    // Previously stock was updated before the invoice was saved — if createInvoice
    // failed, stock quantities were permanently incremented with no invoice record.
    // On retry the stock would be incremented again (double-count).
    const result = await createInvoice({
      supplierId,
      supplierName: selectedSupplier?.businessName ?? '',
      deliveryDate,
      lineItems: lines,
      grandTotal,
      notes,
      syncedToStock: false, // will be set true after stock sync succeeds
    });

    if (!result) {
      setSaving(false);
      setError('Failed to save invoice. Try again.');
      return;
    }

    // H-08 FIX: track which items failed instead of a single boolean flag.
    // Partial sync must NOT be treated as success — show a per-item error list.
    const syncFailedItems: string[] = [];
    for (const li of lines) {
      const name = li.itemName.trim();
      const unit = li.unit as StockUnit;
      const existing = stockItems.find(s => s.name.trim().toLowerCase() === name.toLowerCase());
      // BUG #22 FIX: derive a sensible default threshold (10% of delivered qty, min 1)
      // instead of hardcoding 1 for every new stock item.
      const threshold = Math.max(1, Math.round(li.quantity * 0.1));
      if (existing) {
        const err = await updateItem(existing.id, { quantity: existing.quantity + li.quantity });
        if (err) syncFailedItems.push(`${name} (${err})`);
      } else {
        const err = await addItem(name, unit, li.quantity, threshold);
        if (err) syncFailedItems.push(`${name} (${err})`);
      }
    }

    // Mark invoice as synced (or warn if partial failure)
    // BUG #14 FIX: update syncedToStock flag now that stock is confirmed updated
    if (syncFailedItems.length === 0) {
      await supabase.from('store_invoices').update({ synced_to_stock: true }).eq('id', result.id);
      await useInvoiceStore.getState().load();
    } else {
      // H-08 FIX: surface per-item failures so the operator knows what to retry
      setError(`Invoice saved, but stock sync failed for: ${syncFailedItems.join(', ')}. Please retry stock update manually.`);
      setSaving(false);
      return;
    }

    setSaving(false);

    // Notify admin about the new pending invoice
    await pushInvoicePending(
      result.id,
      result.invoiceNumber,
      selectedSupplier?.businessName ?? '',
      grandTotal,
    );

    onCreated(result.invoiceNumber);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-28 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-foreground">{editingInvoice ? 'Edit Invoice' : 'New Invoice'}</h3>
            <p className="text-[11px] font-body text-muted-foreground">{editingInvoice ? 'Update this pending invoice & resubmit to admin' : 'Add delivery → sync stock → send to admin'}</p>
          </div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* ── STEP 1: Items Delivered ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase">Items Delivered *</label>
            <button
              onClick={addLine}
              className="text-[10px] font-body font-bold text-primary flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary/5"
            >
              <Plus className="size-3" /> Add Row
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((li, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={li.itemName}
                      onChange={e => handleItemNameChange(idx, e.target.value)}
                      placeholder="Item name…"
                      list={`suggestions-${idx}`}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <datalist id={`suggestions-${idx}`}>
                      {searchItems(li.itemName).map(s => <option key={s.item} value={s.item} />)}
                    </datalist>
                  </div>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="size-8 flex items-center justify-center rounded-lg hover:bg-red-50">
                      <Trash2 className="size-3.5 text-red-400" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-body font-bold text-muted-foreground uppercase mb-1 block">Qty</label>
                    <input
                      type="number" min={0} step={0.1}
                      value={li.quantity}
                      onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-body font-bold text-muted-foreground uppercase mb-1 block">Unit</label>
                    <select
                      value={li.unit}
                      onChange={e => updateLine(idx, 'unit', e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-body font-bold text-muted-foreground uppercase mb-1 block">₹/Unit</label>
                    <input
                      type="number" min={0} step={0.01}
                      value={li.pricePerUnit}
                      onChange={e => updateLine(idx, 'pricePerUnit', parseFloat(e.target.value) || 0)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                {li.quantity > 0 && li.pricePerUnit > 0 && (
                  <p className="text-xs font-body text-right text-primary font-bold">
                    Total: ₹{li.totalPrice.toFixed(2)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Grand Total */}
        <div className="flex justify-between items-center px-3 py-3 bg-primary/5 rounded-xl border border-primary/20">
          <span className="text-sm font-body font-bold text-foreground flex items-center gap-2">
            <IndianRupee className="size-4 text-primary" /> Grand Total
          </span>
          <span className="font-display text-xl font-bold text-primary">₹{grandTotal.toFixed(2)}</span>
        </div>

        {/* ── STEP 2: Supplier ── */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Supplier *</label>
          <select
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select supplier…</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.businessName} – {s.contactName}</option>
            ))}
          </select>
          {/* If a supplier is already auto-selected from item hint, confirm it */}
          {supplierId && selectedSupplier && (
            <p className="text-[10px] font-body text-primary mt-1 flex items-center gap-1">
              <Check className="size-3" /> {selectedSupplier.businessName} selected
            </p>
          )}
        </div>

        {/* Delivery date */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Delivery Date *</label>
          <input
            type="date"
            value={deliveryDate}
            min={(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })()}
            max={businessDate()}
            onChange={e => setDeliveryDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-[10px] font-body text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-amber-500">⚠</span> Only today or yesterday allowed
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any remarks about this delivery…"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Stock sync notice */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
          <Package className="size-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs font-body text-blue-700">
            <span className="font-bold">Stock Auto-Sync: </span>
            Saving this invoice will automatically add the delivered quantities to your inventory.
          </p>
        </div>

        {error && <p className="text-xs font-body text-destructive">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
        >
          {saving
            ? <Loader2 className="size-4 animate-spin" />
            : editingInvoice
              ? <><Send className="size-4" /> Update Invoice</>
              : <><Send className="size-4" /> Sync Stock & Send to Admin</>}
        </button>
      </div>
    </div>
  );
}

// ─── Success Toast ────────────────────────────────────────────────────────────
function SuccessToast({ invoiceNumber, onClose }: { invoiceNumber: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-32 left-4 right-4 z-50 bg-emerald-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
      <CheckCircle2 className="size-5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-body font-bold">{invoiceNumber} created!</p>
        <p className="text-xs font-body opacity-80">Stock synced · Sent to admin for review</p>
      </div>
      <button onClick={onClose}><X className="size-4 opacity-70" /></button>
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
  const [toast, setToast]           = useState<string | null>(null);

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
          onCreated={(num) => { setToast(num); load(); }}
        />
      )}

      {editingInvoice && (
        <CreateInvoiceModal
          editingInvoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onCreated={(num) => { setToast(`${num} updated`); setEditingInvoice(null); load(); }}
        />
      )}

      {toast && <SuccessToast invoiceNumber={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
