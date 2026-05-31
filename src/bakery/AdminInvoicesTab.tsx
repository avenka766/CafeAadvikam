// src/bakery/AdminInvoicesTab.tsx
// Admin view – review store purchase invoices sent by the Store user.

import { useState, useEffect, useMemo } from 'react';
import {
  FileText, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Clock, Printer, Search, RefreshCw,
  AlertCircle, Check, X, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvoiceStore, type StoreInvoice, type InvoiceStatus } from './invoiceStore';

// ─── Re-use print logic (duplicated inline to keep file self-contained) ───────
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
    </tr>`).join('');
  const statusColor = invoice.status === 'approved' ? '#16a34a' : invoice.status === 'rejected' ? '#dc2626' : '#d97706';
  const statusLabel = invoice.status === 'approved' ? 'Approved' : invoice.status === 'rejected' ? 'Rejected' : 'Pending Review';
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:28px;}
      .logo{font-size:20px;font-weight:800;color:#2D7D6F;}
      .sub{font-size:11px;color:#888;margin-top:2px;margin-bottom:16px;}
      .status{display:inline-block;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;}
      table{width:100%;border-collapse:collapse;margin:16px 0;}
      thead th{background:#f9fafb;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:2px solid #e5e7eb;}
      thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:right;}
      .total-row td{padding:10px 8px;font-weight:800;font-size:15px;border-top:2px solid #e5e7eb;}
      .total-row td:last-child{color:#2D7D6F;text-align:right;}
      .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#aaa;text-align:center;}
    </style></head><body>
    <div class="logo">Cafe Aadvikam</div>
    <div class="sub">Store Purchase Invoice · Admin Copy</div>
    <div><strong style="font-size:15px;">${invoice.invoiceNumber}</strong> &nbsp;<span class="status">${statusLabel}</span></div>
    <div style="margin-top:10px;font-size:12px;color:#555;">
      <div><b>Supplier:</b> ${invoice.supplierName}</div>
      <div><b>Delivery Date:</b> ${new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <div><b>Created:</b> ${new Date(invoice.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
    <table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="4">Grand Total</td><td>₹${invoice.grandTotal.toFixed(2)}</td></tr></tfoot></table>
    ${invoice.notes ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:12px;color:#555;margin-bottom:8px;"><b>Notes:</b> ${invoice.notes}</div>` : ''}
    ${invoice.reviewNote ? `<div style="background:${statusColor}11;border:1px solid ${statusColor}44;border-radius:8px;padding:10px 14px;font-size:12px;color:${statusColor};"><b>Review Note:</b> ${invoice.reviewNote}</div>` : ''}
    <div class="footer">Cafe Aadvikam · Admin Review Copy · ${invoice.syncedToStock ? 'Stock Synced ✓' : ''}</div>
    </body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 300);
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({
  invoice,
  onClose,
  onReview,
}: {
  invoice: StoreInvoice;
  onClose: () => void;
  onReview: (id: string, status: InvoiceStatus, note: string) => Promise<void>;
}) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async (status: InvoiceStatus) => {
    setSaving(true);
    await onReview(invoice.id, status, note);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-28 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-foreground">Review Invoice</h3>
            <p className="text-[11px] font-body text-muted-foreground">{invoice.invoiceNumber} · {invoice.supplierName}</p>
          </div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-12 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
            <span className="col-span-5">Item</span>
            <span className="col-span-3 text-right">Qty</span>
            <span className="col-span-4 text-right">Total</span>
          </div>
          {invoice.lineItems.map((li, i) => (
            <div key={i} className="grid grid-cols-12 px-3 py-2 border-t border-border/50 text-xs font-body">
              <span className="col-span-5 font-semibold truncate">{li.itemName}</span>
              <span className="col-span-3 text-right text-muted-foreground">{li.quantity} {li.unit}</span>
              <span className="col-span-4 text-right font-bold">₹{li.totalPrice.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2.5 bg-primary/5 border-t border-primary/20">
            <span className="text-xs font-body font-bold">Grand Total</span>
            <span className="text-base font-display font-bold text-primary">₹{invoice.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Review note */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">Note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note to the store team…"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handle('rejected')}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Reject
          </button>
          <button
            onClick={() => handle('approved')}
            disabled={saving}
            className="flex-1 h-12 rounded-xl bg-emerald-600 text-white text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Invoice Card ───────────────────────────────────────────────────────
function AdminInvoiceCard({
  invoice,
  onReview,
}: {
  invoice: StoreInvoice;
  onReview: (inv: StoreInvoice) => void;
}) {
  const [expanded, setExpanded] = useState(invoice.status === 'pending_review');

  const statusMeta = {
    pending_review: { label: 'Pending Review', cardBorder: 'border-amber-300', headerBg: 'bg-amber-50', iconColor: 'text-amber-600', badgeCls: 'bg-amber-100 text-amber-700 border-amber-300' },
    approved:       { label: 'Approved',       cardBorder: 'border-border',    headerBg: 'bg-card',    iconColor: 'text-emerald-600', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected:       { label: 'Rejected',       cardBorder: 'border-border',    headerBg: 'bg-card',    iconColor: 'text-red-500',     badgeCls: 'bg-red-100 text-red-700 border-red-200' },
  }[invoice.status];

  return (
    <div className={cn('rounded-2xl border-2 overflow-hidden transition-all', statusMeta.cardBorder)}>
      <button
        className={cn('w-full px-4 py-3.5 flex items-center gap-3 text-left', statusMeta.headerBg)}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="size-9 rounded-xl bg-white/70 flex items-center justify-center shrink-0 shadow-sm">
          {invoice.status === 'pending_review'
            ? <Clock className="size-4 text-amber-600" />
            : invoice.status === 'approved'
            ? <CheckCircle2 className="size-4 text-emerald-600" />
            : <XCircle className="size-4 text-red-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm text-foreground">{invoice.invoiceNumber}</span>
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', statusMeta.badgeCls)}>
              {statusMeta.label}
            </span>
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {invoice.supplierName} · ₹{invoice.grandTotal.toFixed(2)} · {new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs font-body">
            <div className="bg-muted/40 rounded-xl p-2.5">
              <p className="text-muted-foreground text-[10px] font-bold uppercase mb-0.5">Supplier</p>
              <p className="font-semibold text-foreground">{invoice.supplierName}</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-2.5">
              <p className="text-muted-foreground text-[10px] font-bold uppercase mb-0.5">Delivery</p>
              <p className="font-semibold text-foreground">{new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-5">Item</span>
              <span className="col-span-3 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Amt</span>
            </div>
            {invoice.lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 px-3 py-2 border-t border-border/50 text-xs font-body">
                <span className="col-span-5 font-semibold text-foreground truncate">{li.itemName}</span>
                <span className="col-span-3 text-right text-muted-foreground">{li.quantity} {li.unit}</span>
                <span className="col-span-2 text-right text-muted-foreground">₹{li.pricePerUnit}</span>
                <span className="col-span-2 text-right font-bold text-foreground">₹{li.totalPrice.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2.5 bg-primary/5 border-t border-primary/20">
              <span className="text-xs font-body font-bold">Grand Total</span>
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
              <span className="font-bold">Your note: </span>{invoice.reviewNote}
            </p>
          )}
          {invoice.reviewedAt && (
            <p className="text-[10px] font-body text-muted-foreground text-right">
              Reviewed: {new Date(invoice.reviewedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => printInvoice(invoice)}
              className="flex-1 h-10 rounded-xl border border-border bg-muted/30 text-foreground text-xs font-body font-semibold flex items-center justify-center gap-1.5 hover:bg-muted active:scale-[0.98]"
            >
              <Printer className="size-3.5" /> Print
            </button>
            {invoice.status === 'pending_review' && (
              <button
                onClick={() => onReview(invoice)}
                className="flex-1 h-10 rounded-xl cafe-gradient text-primary-foreground text-xs font-body font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-sm"
              >
                <Check className="size-3.5" /> Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Invoices Tab ──────────────────────────────────────────────────
export default function AdminInvoicesTab() {
  const { invoices, loaded, loading, load, updateStatus } = useInvoiceStore();
  const [reviewInvoice, setReviewInvoice] = useState<StoreInvoice | null>(null);
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  // Poll every 30s so admin sees new invoices without refresh
  useEffect(() => {
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const pending  = invoices.filter(i => i.status === 'pending_review').length;
  const approved = invoices.filter(i => i.status === 'approved').length;
  const rejected = invoices.filter(i => i.status === 'rejected').length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
      if (q && !inv.invoiceNumber.toLowerCase().includes(q) && !inv.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, search, filterStatus]);

  const handleReview = async (id: string, status: InvoiceStatus, note: string) => {
    await updateStatus(id, status, note);
  };

  return (
    <div className="space-y-4">
      {/* Pending alert banner */}
      {pending > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-2xl">
          <AlertCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-body font-bold text-amber-800">
              {pending} invoice{pending > 1 ? 's' : ''} pending your review
            </p>
            <p className="text-[11px] font-body text-amber-700 mt-0.5">
              Store has submitted supplier deliveries that need approval
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending',  value: pending,  color: pending > 0 ? 'text-amber-600' : 'text-muted-foreground', bg: pending > 0 ? 'bg-amber-50 border-amber-200' : '' },
          { label: 'Approved', value: approved, color: 'text-emerald-600', bg: '' },
          { label: 'Rejected', value: rejected, color: rejected > 0 ? 'text-red-600' : 'text-muted-foreground', bg: '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
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
        <button onClick={() => load()} disabled={loading} className="size-10 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90">
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {([
          { id: 'pending_review', label: `⏳ Pending (${pending})` },
          { id: 'all',            label: 'All' },
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

      {/* Invoice list */}
      {loading && !loaded ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <FileText className="size-10 opacity-20" />
          <p className="text-sm font-body">
            {filterStatus === 'pending_review' ? 'No pending invoices — all caught up!' : 'No invoices match'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => (
            <AdminInvoiceCard key={inv.id} invoice={inv} onReview={setReviewInvoice} />
          ))}
        </div>
      )}

      {reviewInvoice && (
        <ReviewModal
          invoice={reviewInvoice}
          onClose={() => setReviewInvoice(null)}
          onReview={handleReview}
        />
      )}
    </div>
  );
}
