// src/bakery/AdminPurchaseOrdersTab.tsx
// Admin view — read-only visibility into Store's Purchase Orders. Approving
// or rejecting a PO is Owner-only (review_store_purchase_order_secure is
// gated to the 'owner' role); Admin can see exactly where each one stands
// (pending / approved / rejected / converted to GRN) but has no action
// buttons here by design.
import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Clock, Search, RefreshCw, AlertCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStorePurchaseOrderStore, type StorePurchaseOrder } from './storePurchaseOrderStore';

function POCard({ po }: { po: StorePurchaseOrder }) {
  const [expanded, setExpanded] = useState(false);

  const statusMeta = {
    pending_approval: { label: 'Pending Owner Approval', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', Icon: Clock },
    approved: { label: 'Approved by Owner', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', Icon: CheckCircle2 },
    rejected: { label: 'Rejected by Owner', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', Icon: XCircle },
    converted: { label: 'Approved · Converted to GRN', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', Icon: CheckCircle2 },
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
            {po.supplierName} · {po.lineItems.length} item{po.lineItems.length === 1 ? '' : 's'} · ₹{po.grandTotal.toFixed(2)} · raised {new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{po.createdByName ? ` by ${po.createdByName}` : ''}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          {po.supplierAddress && (
            <p className="text-[11px] font-body text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">{po.supplierAddress}</p>
          )}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-5">Item</span>
              <span className="col-span-3 text-right">Quantity</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Amt</span>
            </div>
            {po.lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-border/50 text-xs font-body">
                <span className="col-span-5 font-semibold text-foreground truncate">{li.itemName}{li.itemCode ? ` (${li.itemCode})` : ''}</span>
                <span className="col-span-3 text-right text-muted-foreground">{li.quantity} {li.unit}</span>
                <span className="col-span-2 text-right text-muted-foreground">₹{li.pricePerUnit}</span>
                <span className="col-span-2 text-right font-bold text-foreground">₹{li.totalPrice.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2.5 bg-primary/5 border-t border-primary/20">
              <span className="text-xs font-body font-bold">Grand Total</span>
              <span className="text-sm font-display font-bold text-primary">₹{po.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {po.notes && (
            <p className="text-xs font-body text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              <span className="font-bold text-foreground">Store notes: </span>{po.notes}
            </p>
          )}
          {po.reviewNote && (
            <p className={cn('text-xs font-body rounded-xl px-3 py-2', po.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
              <span className="font-bold">Owner{po.reviewedByName ? ` (${po.reviewedByName})` : ''}: </span>{po.reviewNote}
            </p>
          )}
          {po.status === 'pending_approval' && (
            <p className="text-xs font-body text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              Waiting on the Owner to approve or reject — this cannot be actioned from the Admin Dashboard.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminPurchaseOrdersTab() {
  const { orders, loaded, loading, error, load } = useStorePurchaseOrderStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_approval' | 'approved' | 'rejected' | 'converted'>('all');

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);

  const pending = orders.filter(po => po.status === 'pending_approval').length;
  const approved = orders.filter(po => po.status === 'approved' || po.status === 'converted').length;
  const rejected = orders.filter(po => po.status === 'rejected').length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(po => {
      if (filterStatus !== 'all' && po.status !== filterStatus) return false;
      if (q && !po.poNumber.toLowerCase().includes(q) && !po.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, filterStatus]);

  return (
    <div className="space-y-4">
      {pending > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-2xl">
          <AlertCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-body font-bold text-amber-800">{pending} purchase order{pending > 1 ? 's' : ''} waiting on the Owner</p>
            <p className="text-[11px] font-body text-amber-700 mt-0.5">Only the Owner can approve or reject these — this view is read-only.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending', value: pending, color: pending > 0 ? 'text-amber-600' : 'text-muted-foreground' },
          { label: 'Approved', value: approved, color: 'text-emerald-600' },
          { label: 'Rejected', value: rejected, color: rejected > 0 ? 'text-red-600' : 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
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
        <button onClick={() => void load()} className="h-10 px-3 rounded-xl border border-border bg-card text-xs font-body font-bold flex items-center gap-1.5 text-foreground">
          <RefreshCw className="size-3.5" /> Refresh
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

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-body text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {loading && !loaded ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <ClipboardList className="size-10 opacity-20" />
          <p className="text-sm font-body">{orders.length === 0 ? 'No purchase orders yet' : 'No matches'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(po => <POCard key={po.id} po={po} />)}
        </div>
      )}
    </div>
  );
}
