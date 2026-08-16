// src/bakery/AdminInvoicesTab.tsx
// Admin view – review store purchase invoices sent by the Store user.

import { useState, useEffect, useMemo } from 'react';
import {
  FileText, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Clock, Printer, Search, RefreshCw,
  AlertCircle, Check, X, Loader2, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvoiceStore, type StoreInvoice, type InvoiceStatus } from './invoiceStore';
// GRN print layout (2026-08-06): the Admin copy used to keep its own
// duplicated, visible-popup print function that had already drifted from
// the Store side's format. Now shares the single GRN-format implementation
// in InvoiceTab.tsx so Store and Admin always print the identical document.
import { printInvoice } from './InvoiceTab';
import { useStorePurchaseOrderStore, type StorePurchaseOrder } from './storePurchaseOrderStore';

// ─── Linked Purchase Order block ───────────────────────────────────────────
// When a GRN was created by converting an Owner-approved PO, Admin should be
// able to see that PO right alongside the GRN — what was originally
// requested, who raised it, and who on the Owner side approved it — rather
// than only seeing the priced GRN in isolation.
function LinkedPOBlock({ po }: { po: StorePurchaseOrder }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-body font-bold text-blue-800">
          Converted from Purchase Order {po.poNumber}
        </p>
        <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-300">
          Owner Approved
        </span>
      </div>
      <div className="rounded-lg border border-blue-200/70 bg-white/70 overflow-hidden">
        <div className="grid grid-cols-12 px-2.5 py-1.5 bg-blue-100/50 text-[9px] font-body font-bold text-blue-800 uppercase">
          <span className="col-span-8">Originally Requested</span>
          <span className="col-span-4 text-right">Qty</span>
        </div>
        {po.lineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-12 px-2.5 py-1.5 border-t border-blue-100 text-[11px] font-body">
            <span className="col-span-8 font-semibold text-foreground truncate">{li.itemName}</span>
            <span className="col-span-4 text-right text-muted-foreground">{li.quantity} {li.unit}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] font-body text-blue-800">
        Raised{po.createdByName ? ` by ${po.createdByName}` : ''} · Approved
        {po.reviewedByName ? ` by ${po.reviewedByName}` : ''}
        {po.reviewedAt ? ` on ${new Date(po.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}
      </p>
      {po.reviewNote && (
        <p className="text-[11px] font-body text-blue-700 bg-white/60 rounded-lg px-2.5 py-1.5">
          <span className="font-bold">Owner note: </span>{po.reviewNote}
        </p>
      )}
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({
  invoice,
  sourcePO,
  onClose,
  onReview,
}: {
  invoice: StoreInvoice;
  sourcePO?: StorePurchaseOrder;
  onClose: () => void;
  onReview: (id: string, status: InvoiceStatus, note: string) => Promise<string | null>;
}) {
  const [note, setNote]               = useState('');
  const [saving, setSaving]           = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handle = async (status: InvoiceStatus) => {
    setSaving(true);
    setActionError(null);
    try {
      const error = await onReview(invoice.id, status, note);
      if (error) {
        setActionError(error);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
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

        {sourcePO && <LinkedPOBlock po={sourcePO} />}

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

        {actionError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-body text-red-700" role="alert">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

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
  sourcePO,
  onReview,
}: {
  invoice: StoreInvoice;
  sourcePO?: StorePurchaseOrder;
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
        aria-expanded={expanded}
        title={expanded ? 'Hide invoice details' : 'View invoice details'}
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
            {invoice.editedAt && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200 flex items-center gap-0.5">
                ✎ Edited{invoice.editCount && invoice.editCount > 1 ? ` ×${invoice.editCount}` : ''}
              </span>
            )}
            {invoice.poNumber && (
              <span className="text-[9px] font-body font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                From {invoice.poNumber}
              </span>
            )}
          </div>
          <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">
            {invoice.supplierName} · ₹{invoice.grandTotal.toFixed(2)} · {new Date(invoice.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </p>
        </div>
        <span className="hidden sm:flex items-center gap-1 text-[10px] font-body font-semibold text-muted-foreground shrink-0">
          <Eye className="size-3.5" /> {expanded ? 'Hide' : 'View'}
        </span>
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

          {sourcePO && <LinkedPOBlock po={sourcePO} />}

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
          {invoice.editedAt && (
            <p className="text-[11px] font-body text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              ✎ Last edited {new Date(invoice.editedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {invoice.editCount && invoice.editCount > 1 && ` · ${invoice.editCount} edits total`}
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
  const { invoices, loaded, loading, error, load, updateStatus } = useInvoiceStore();
  const { orders: purchaseOrders, loaded: poLoaded, load: loadPOs } = useStorePurchaseOrderStore();
  const [reviewInvoice, setReviewInvoice] = useState<StoreInvoice | null>(null);
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  // Admin's own PO-status tab already loads this same store; loading it here
  // too (idempotent — `load` no-ops while in flight) lets each GRN card show
  // its originating, Owner-approved PO without a second round of clicks.
  useEffect(() => { if (!poLoaded) void loadPOs(); }, [poLoaded, loadPOs]);

  const poById = useMemo(() => {
    const map = new Map<string, StorePurchaseOrder>();
    for (const po of purchaseOrders) map.set(po.id, po);
    return map;
  }, [purchaseOrders]);

  // EGRESS FIX (2026-08-15): dropped the interval, keeping just the
  // visibilitychange refresh below — a timer ticking the whole time this
  // tab sits open added nothing a refetch-on-return doesn't already cover.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

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
    return updateStatus(id, status, note);
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

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl" role="alert">
          <AlertCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-body font-bold text-red-800">Unable to load invoices</p>
            <p className="text-[11px] font-body text-red-700 mt-0.5 break-words">{error}</p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="h-8 px-3 rounded-lg border border-red-200 bg-white text-[11px] font-body font-bold text-red-700 disabled:opacity-50"
          >
            Retry
          </button>
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
            <AdminInvoiceCard
              key={inv.id}
              invoice={inv}
              sourcePO={inv.sourcePoId ? poById.get(inv.sourcePoId) : undefined}
              onReview={setReviewInvoice}
            />
          ))}
        </div>
      )}

      {reviewInvoice && (
        <ReviewModal
          invoice={reviewInvoice}
          sourcePO={reviewInvoice.sourcePoId ? poById.get(reviewInvoice.sourcePoId) : undefined}
          onClose={() => setReviewInvoice(null)}
          onReview={handleReview}
        />
      )}
    </div>
  );
}
