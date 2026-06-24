// src/pages/AdminInvoicesPage.tsx
// CHANGE 16: Improved UI — the underlying AdminInvoicesTab already has search,
// status filter, card layout, approve/reject and Excel. This page adds a clean
// header with summary strip and passes through to the tab.

import { useMemo } from 'react';
import AdminInvoicesTab from '@/bakery/AdminInvoicesTab';
import { useInvoiceStore } from '@/bakery/invoiceStore';
import { FileText, Clock, CheckCircle2, XCircle, IndianRupee } from 'lucide-react';

function SummaryPill({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 ${tone}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
        <p className="text-lg font-black tabular-nums leading-none">{value}</p>
      </div>
    </div>
  );
}

export default function AdminInvoicesPage() {
  const { invoices } = useInvoiceStore();

  const summary = useMemo(() => ({
    total: invoices.length,
    pending: invoices.filter(i => i.status === 'pending_review').length,
    approved: invoices.filter(i => i.status === 'approved').length,
    rejected: invoices.filter(i => i.status === 'rejected').length,
    totalValue: invoices.reduce((s, i) => s + (i.grandTotal || 0), 0),
    pendingValue: invoices.filter(i => i.status === 'pending_review').reduce((s, i) => s + (i.grandTotal || 0), 0),
  }), [invoices]);

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      {/* Header */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">Admin Portal</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Invoices</h1>
            <p className="text-xs font-body text-muted-foreground mt-1">Review, approve or reject supplier invoices submitted by the store team.</p>
          </div>
          <p className="text-xs font-body text-muted-foreground pb-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryPill icon={<FileText className="size-5 text-slate-600" />} label="Total Invoices" value={summary.total} tone="bg-slate-50 border-slate-200 text-slate-800" />
        <SummaryPill icon={<Clock className="size-5 text-amber-600" />} label="Pending" value={summary.pending} tone="bg-amber-50 border-amber-200 text-amber-800" />
        <SummaryPill icon={<CheckCircle2 className="size-5 text-emerald-600" />} label="Approved" value={summary.approved} tone="bg-emerald-50 border-emerald-200 text-emerald-800" />
        <SummaryPill icon={<IndianRupee className="size-5 text-blue-600" />} label="Total Value" value={fmt(summary.totalValue)} tone="bg-blue-50 border-blue-200 text-blue-800" />
      </div>

      {summary.pendingValue > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="size-4 text-amber-600 shrink-0" />
          <p className="text-sm font-body text-amber-800">
            <span className="font-bold">{fmt(summary.pendingValue)}</span> awaiting review across {summary.pending} pending invoice{summary.pending !== 1 ? 's' : ''}.
          </p>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        <AdminInvoicesTab />
      </div>
    </div>
  );
}
