// src/bakery/AdminInvoicesTab.tsx
// Admin view – Store's submitted GRNs (goods received notes), for the Admin
// to look over.
//
// FEATURE (2026-08-30): "The GRN should not go for approval with the Admin
// it should just go for Admin for Review" — stock is already synced to
// inventory the moment Store submits a GRN (create_store_invoice_secure
// calls apply_store_invoice_stock_delta unconditionally, before Admin ever
// sees it), so the old Approve/Reject buttons here never actually gated
// anything — they only ever flipped a status label with no functional
// effect. Removed entirely: this is now a plain, read-only list for Admin
// to browse and print. No action, no review timestamp, nothing recorded.
import { useState, useEffect, useMemo } from 'react';
import {
  FileText, ChevronDown, ChevronUp,
  Printer, Search, RefreshCw,
  AlertCircle, Eye, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvoiceStore, type StoreInvoice } from './invoiceStore';
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

// ─── Admin Invoice Card ───────────────────────────────────────────────────────
function AdminInvoiceCard({
  invoice,
  sourcePO,
}: {
  invoice: StoreInvoice;
  sourcePO?: StorePurchaseOrder;
}) {
  const [expanded, setExpanded] = useState(false);

  // Legacy 'approved'/'rejected' rows (reviewed before this became a
  // read-only list) still show their historical outcome for audit purposes.
  // Everything going forward stays 'pending_review' forever (nothing sets it
  // anymore) — shown as a neutral "Submitted" tag, not an alarm.
  const statusMeta = {
    pending_review: { label: 'Submitted',  cardBorder: 'border-border', headerBg: 'bg-card', badgeCls: 'bg-muted text-muted-foreground border-border' },
    approved:       { label: 'Approved',   cardBorder: 'border-border', headerBg: 'bg-card', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected:       { label: 'Rejected',   cardBorder: 'border-border', headerBg: 'bg-card', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
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
          <FileText className="size-4 text-muted-foreground" />
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

          <button
            onClick={() => printInvoice(invoice)}
            className="w-full h-10 rounded-xl border border-border bg-muted/30 text-foreground text-xs font-body font-semibold flex items-center justify-center gap-1.5 hover:bg-muted active:scale-[0.98]"
          >
            <Printer className="size-3.5" /> Print
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Invoices Tab ──────────────────────────────────────────────────
export default function AdminInvoicesTab() {
  const { invoices, loaded, loading, error, load } = useInvoiceStore();
  const { orders: purchaseOrders, loaded: poLoaded, load: loadPOs } = useStorePurchaseOrderStore();
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');

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

  const total    = invoices.length;
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

  return (
    <div className="space-y-4">
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
          { label: 'Total',    value: total,    color: 'text-foreground', bg: '' },
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
          { id: 'all',            label: 'All' },
          { id: 'pending_review', label: 'Submitted' },
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
          <p className="text-sm font-body">{invoices.length === 0 ? 'No GRNs submitted yet' : 'No matches'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => (
            <AdminInvoiceCard
              key={inv.id}
              invoice={inv}
              sourcePO={inv.sourcePoId ? poById.get(inv.sourcePoId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
