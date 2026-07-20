import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import * as XLSX from '@/lib/safeSpreadsheet';
import { Calendar, Download, FileText, Loader2, MinusCircle, Package, Receipt, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useInvoiceStore } from './invoiceStore';

type PeriodKey = 'today' | '7d' | '30d' | 'custom';

interface MaterialDeduction {
  id: string;
  orderNumber: string;
  materialName: string;
  quantity: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
  deductedBy: string;
  deductedAt: string;
}

interface CustomDeduction {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  reason: string;
  deductedBy: string;
  createdAt: string;
}

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: 'custom', label: 'Custom', days: null },
];

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(period: PeriodKey, customFrom: string, customTo: string) {
  if (period === 'custom') {
    return {
      from: new Date(`${customFrom}T00:00:00`).toISOString(),
      to: new Date(`${customTo}T23:59:59.999`).toISOString(),
      fromDate: customFrom,
      toDate: customTo,
    };
  }

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  const days = PERIODS.find(p => p.key === period)?.days ?? 0;
  if (days > 0) from.setDate(from.getDate() - (days - 1));
  return { from: from.toISOString(), to: to.toISOString(), fromDate: toInputDate(from), toDate: toInputDate(to) };
}

function money(value: number) {
  return `Rs ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prettyDate(value: string) {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ icon: Icon, label, value, sub }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-bold text-foreground mt-1">{value}</p>
          <p className="text-[10px] font-body text-muted-foreground mt-1">{sub}</p>
        </div>
      </div>
    </div>
  );
}

export default function StoreReportTab() {
  const { invoices, loaded: invoicesLoaded, load: loadInvoices } = useInvoiceStore();
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(toInputDate(new Date()));
  const [materials, setMaterials] = useState<MaterialDeduction[]>([]);
  const [custom, setCustom] = useState<CustomDeduction[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => dateRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [materialRes, customRes] = await Promise.all([
        supabase
          .from('store_material_deductions')
          .select('id, order_number, material_name, quantity_deducted, unit, stock_before, stock_after, deducted_by, deducted_at')
          .gte('deducted_at', range.from)
          .lte('deducted_at', range.to)
          .order('deducted_at', { ascending: false }),
        supabase
          .from('store_custom_deductions')
          .select('id, item_name, quantity, unit, reason, deducted_by, created_at')
          .gte('created_at', range.from)
          .lte('created_at', range.to)
          .order('created_at', { ascending: false }),
      ]);

      setMaterials((materialRes.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        orderNumber: String(r.order_number ?? ''),
        materialName: String(r.material_name ?? ''),
        quantity: Number(r.quantity_deducted ?? 0),
        unit: String(r.unit ?? ''),
        stockBefore: Number(r.stock_before ?? 0),
        stockAfter: Number(r.stock_after ?? 0),
        deductedBy: String(r.deducted_by ?? 'Store'),
        deductedAt: String(r.deducted_at ?? ''),
      })));

      setCustom((customRes.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        itemName: String(r.item_name ?? ''),
        quantity: Number(r.quantity ?? 0),
        unit: String(r.unit ?? ''),
        reason: String(r.reason ?? ''),
        deductedBy: String(r.deducted_by ?? 'Store'),
        createdAt: String(r.created_at ?? ''),
      })));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { if (!invoicesLoaded) loadInvoices(); }, [invoicesLoaded, loadInvoices]);
  useEffect(() => { loadReports(); }, [loadReports]);

  const reportInvoices = invoices.filter(inv => {
    const created = new Date(inv.createdAt).getTime();
    return created >= new Date(range.from).getTime() && created <= new Date(range.to).getTime();
  });
  const invoiceTotal = reportInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materials.map(row => ({
      Date: prettyDate(row.deductedAt),
      Order: row.orderNumber,
      Material: row.materialName,
      Quantity: row.quantity,
      Unit: row.unit,
      'Stock Before': row.stockBefore,
      'Stock After': row.stockAfter,
      By: row.deductedBy,
    }))), 'Deductions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custom.map(row => ({
      Date: prettyDate(row.createdAt),
      Item: row.itemName,
      Quantity: row.quantity,
      Unit: row.unit,
      Reason: row.reason,
      By: row.deductedBy,
    }))), 'Custom Deductions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportInvoices.map(inv => ({
      Date: prettyDate(inv.createdAt),
      Invoice: inv.invoiceNumber,
      Supplier: inv.supplierName,
      Items: inv.lineItems.length,
      Amount: inv.grandTotal,
      Status: inv.status.replace('_', ' '),
    }))), 'Invoices');
    XLSX.writeFile(wb, `store-report-${range.fromDate}-to-${range.toDate}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <h3 className="font-display text-lg font-bold text-foreground">Store Reports</h3>
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1">Focused report for deductions, custom deductions and invoices.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                  className={cn('h-9 rounded-xl border px-3 text-xs font-body font-bold', period === option.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button onClick={loadReports} className="size-9 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-muted">
              <RefreshCw className={cn('size-4 text-muted-foreground', loading && 'animate-spin')} />
            </button>
            <button onClick={downloadExcel} className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-body font-bold text-white flex items-center gap-2 hover:bg-emerald-700">
              <Download className="size-4" /> Excel
            </button>
          </div>
        </div>

        {period === 'custom' && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
              From
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
            </label>
            <label className="text-[10px] font-body font-bold uppercase text-muted-foreground">
              To
              <input type="date" value={customTo} min={customFrom} max={toInputDate(new Date())} onChange={e => setCustomTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-body text-foreground" />
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Deductions" value={materials.length} sub="Recipe based stock cuts" />
        <StatCard icon={MinusCircle} label="Custom Deductions" value={custom.length} sub="Manual stock removals" />
        <StatCard icon={Receipt} label="Invoices" value={reportInvoices.length} sub="Bills entered in range" />
        <StatCard icon={Calendar} label="Invoice Total" value={money(invoiceTotal)} sub={`${range.fromDate} to ${range.toDate}`} />
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <ReportSection title="Deductions" empty="No recipe deductions found.">
            {materials.map(row => (
              <ReportRow key={row.id} title={row.materialName} right={`-${row.quantity} ${row.unit}`} lines={[`Order #${row.orderNumber}`, `Stock ${row.stockBefore} -> ${row.stockAfter} ${row.unit}`, prettyDate(row.deductedAt)]} />
            ))}
          </ReportSection>
          <ReportSection title="Custom Deductions" empty="No custom deductions found.">
            {custom.map(row => (
              <ReportRow key={row.id} title={row.itemName} right={`-${row.quantity} ${row.unit}`} lines={[row.reason, row.deductedBy, prettyDate(row.createdAt)]} />
            ))}
          </ReportSection>
          <ReportSection title="Invoices" empty="No invoices found.">
            {reportInvoices.map(inv => (
              <ReportRow key={inv.id} title={inv.invoiceNumber} right={money(inv.grandTotal)} lines={[inv.supplierName, `${inv.lineItems.length} items`, inv.status.replace('_', ' ')]} />
            ))}
          </ReportSection>
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <h4 className="text-sm font-body font-bold text-foreground">{title}</h4>
      <div className="mt-3 space-y-2">
        {Array.isArray(children) && children.length === 0 ? <p className="py-10 text-center text-xs font-body text-muted-foreground">{empty}</p> : children}
      </div>
    </section>
  );
}

function ReportRow({ title, right, lines }: { title: string; right: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-body font-bold text-foreground">{title}</p>
        <p className="text-xs font-body font-bold text-foreground whitespace-nowrap">{right}</p>
      </div>
      <div className="mt-1 space-y-0.5">
        {lines.map(line => <p key={line} className="text-[10px] font-body text-muted-foreground">{line}</p>)}
      </div>
    </div>
  );
}
