// src/components/admin/AdminDispatchDetailsTab.tsx
// FEATURE (2026-09-03): "Create a new tab called Dispatch details — they
// should clearly see all the details of the planner dispatch details, they
// should be able to download the invoice clearly same like branch sales
// they should be able to download excel and pdf reports."
//
// Covers every invoice Planner's Dispatch tab produces, grouped the same way
// the new invoice-numbering scheme groups them:
//   TO    — SNB + VRSNB dispatch invoices (shared TO/26-27/N sequence)
//   SALES — Hosur dispatch invoices + Sales (New Bill/Sample Bill) walk-in
//           bills (shared SALES/26-27/N sequence)
//   Cake  — cake dispatch invoices (own Cake/26-27/N sequence)
// Reuses the exact same billing/print/export infrastructure already proven
// elsewhere (dispatchInvoice.ts's printDispatchInvoice, exportAdminReport.ts's
// exportWorkbook/exportReportPdf) rather than re-implementing any of it.
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, FileSpreadsheet, FileDown, Printer, IndianRupee, Receipt,
  Truck, Cake as CakeIcon, ShoppingBag, Loader2, Filter, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, cn } from '@/lib/utils';
import {
  listDispatchInvoices, printDispatchInvoice, mapWalkinBill, walkinBillToInvoiceRecord,
  type DispatchInvoiceRecord, type WalkinBillRow,
} from '@/bakery/dispatchInvoice';
import { useSortableRows, SortableTh } from '@/components/admin/SortableTable';

type Bucket = 'TO' | 'SALES' | 'Cake';
const BUCKET_LABEL: Record<Bucket, string> = { TO: 'TO — SNB & VRSNB', SALES: 'SALES — Hosur & Sales', Cake: 'Cake' };
const BUCKET_TONE: Record<Bucket, string> = {
  TO: 'bg-blue-50 text-blue-700 ring-blue-200',
  SALES: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Cake: 'bg-pink-50 text-pink-700 ring-pink-200',
};
function bucketFor(scope: string): Bucket {
  if (scope === 'SNB' || scope === 'VRSNB') return 'TO';
  if (scope === 'Cake') return 'Cake';
  return 'SALES'; // Hosur (dispatch invoices) + Sales (walk-in bills, tagged 'Sales' below)
}

interface Row {
  key: string;
  bucket: Bucket;
  scopeLabel: string; // real branch/source for display: SNB / VRSNB / Hosur / Sales / Cake
  invoiceNo: string;
  party: string;
  date: string;
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  dispatchedBy: string;
  status: DispatchInvoiceRecord['status'];
  record: DispatchInvoiceRecord;
  // FEATURE (2026-09-04): only 'Sales' (walk-in bill) rows carry a real
  // payment mode — a TO/Cake dispatch invoice is an internal stock
  // movement, nothing was collected at a counter for it. Left undefined
  // for those rather than guessing a mode, so the bill-wise sheet's
  // Cash/UPI/Card columns honestly show 0 rather than a fabricated split.
  paymentMode?: string;
}

function todayInput(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayInput(d);
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// FEATURE (2026-09-04): the standardized bill-wise Excel sheet wants Date
// and Time as their own columns, not one combined string.
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }

function KpiCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <div className="mt-2 font-display text-2xl font-black leading-none text-slate-950 tabular-nums">{value}</div>
          {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={cn('grid size-11 shrink-0 place-items-center rounded-2xl ring-1', tone)}>{icon}</div>
      </div>
    </div>
  );
}

export default function AdminDispatchDetailsTab() {
  const [fromDate, setFromDate] = useState(daysAgoInput(6));
  const [toDate, setToDate] = useState(todayInput());
  const [invoices, setInvoices] = useState<DispatchInvoiceRecord[]>([]);
  const [sales, setSales] = useState<WalkinBillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bucketFilter, setBucketFilter] = useState<'All' | Bucket>('All');
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const fromIso = `${fromDate}T00:00:00+05:30`;
      const toIso = new Date(new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();
      const [invoiceRows, salesRes] = await Promise.all([
        listDispatchInvoices({ fromDate: fromIso, toDate: toIso }),
        supabase.from('bakery_walkin_bills').select('*').gte('created_at', fromIso).lt('created_at', toIso).order('created_at', { ascending: false }).limit(2000),
      ]);
      if (salesRes.error) throw salesRes.error;
      setInvoices(invoiceRows.filter(r => r.status !== 'cancelled'));
      setSales(((salesRes.data ?? []) as Record<string, unknown>[]).map(mapWalkinBill).filter(b => b.status !== 'cancelled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dispatch details.');
      setInvoices([]); setSales([]);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [fromDate, toDate]);

  const rows: Row[] = useMemo(() => {
    const fromInvoices: Row[] = invoices.map(r => ({
      key: r.id, bucket: bucketFor(r.scope),
      scopeLabel: r.scope,
      invoiceNo: r.invoiceNo,
      party: r.hosurShopName || r.customerName || `${r.scope} Branch`,
      date: r.createdAt, itemCount: r.items.length,
      subtotal: r.subtotal, discountAmount: r.discountAmount, total: r.total,
      dispatchedBy: r.dispatchedBy, status: r.status, record: r,
    }));
    const fromSales: Row[] = sales.map(b => ({
      key: `wb-${b.id}`, bucket: 'SALES',
      scopeLabel: 'Sales',
      invoiceNo: b.billNo,
      party: b.customerName || 'Walk-in Customer',
      date: b.createdAt, itemCount: b.items.length,
      subtotal: b.subtotal, discountAmount: b.discountAmount, total: b.total,
      dispatchedBy: b.cashierName || 'Planner', status: 'paid', record: walkinBillToInvoiceRecord(b),
      paymentMode: b.paymentMode,
    }));
    return [...fromInvoices, ...fromSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, sales]);

  const filteredRows = useMemo(() => {
    let list = bucketFilter === 'All' ? rows : rows.filter(r => r.bucket === bucketFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r => r.invoiceNo.toLowerCase().includes(q) || r.party.toLowerCase().includes(q) || r.dispatchedBy.toLowerCase().includes(q));
    return list;
  }, [rows, bucketFilter, search]);

  // FEATURE (2026-09-05): "Also allow sort in all the tab" — click any
  // column header to sort; defaults to newest-first same as before.
  const { sorted: sortedRows, sortKey, sortDir, toggleSort } = useSortableRows<Row>(
    filteredRows,
    (r, key) => {
      switch (key) {
        case 'invoiceNo': return r.invoiceNo;
        case 'group': return r.scopeLabel;
        case 'party': return r.party;
        case 'items': return r.itemCount;
        case 'total': return r.total;
        case 'dispatchedBy': return r.dispatchedBy;
        case 'time': return new Date(r.date).getTime();
        default: return new Date(r.date).getTime();
      }
    },
    'date',
    'desc',
  );

  const totalsByBucket = useMemo(() => {
    const map: Record<Bucket, { count: number; value: number }> = { TO: { count: 0, value: 0 }, SALES: { count: 0, value: 0 }, Cake: { count: 0, value: 0 } };
    for (const r of rows) { map[r.bucket].count += 1; map[r.bucket].value += r.total; }
    return map;
  }, [rows]);
  const grandTotal = totalsByBucket.TO.value + totalsByBucket.SALES.value + totalsByBucket.Cake.value;
  const grandCount = totalsByBucket.TO.count + totalsByBucket.SALES.count + totalsByBucket.Cake.count;

  const exportExcel = async () => {
    const XLSX = await import('@/lib/exportAdminReport');
    const sheetFor = (bucket: Bucket) => {
      const bucketRows = rows.filter(r => r.bucket === bucket);
      const itemRows = bucketRows.flatMap(r => r.record.items.map(i => ({
        invoiceNo: r.invoiceNo, source: r.scopeLabel, party: r.party, date: fmtDateTime(r.date),
        itemName: i.itemName, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal,
        invoiceTotal: r.total, dispatchedBy: r.dispatchedBy,
      })));
      return {
        name: `${bucket} Items`, title: `${BUCKET_LABEL[bucket]} — Item Detail (${fromDate} to ${toDate})`,
        columns: [
          { header: 'Invoice No', key: 'invoiceNo', width: 16 }, { header: 'Source', key: 'source', width: 10 },
          { header: 'Party', key: 'party', width: 22 }, { header: 'Date', key: 'date', width: 20 },
          { header: 'Item', key: 'itemName', width: 28 }, { header: 'Unit', key: 'unit' }, { header: 'Qty', key: 'quantity' },
          { header: 'Unit Price', key: 'unitPrice' }, { header: 'Line Total', key: 'lineTotal' },
          { header: 'Invoice Total', key: 'invoiceTotal' }, { header: 'Dispatched By', key: 'dispatchedBy', width: 16 },
        ],
        rows: itemRows,
      };
    };
    await XLSX.exportWorkbook(`Admin_Dispatch_Details_${fromDate}_${toDate}`, [
      {
        name: 'Summary', title: `Dispatch Details — Summary (${fromDate} to ${toDate})`,
        columns: [{ header: 'Group', key: 'group', width: 26 }, { header: 'Invoices', key: 'count' }, { header: 'Total Value', key: 'value' }],
        rows: [
          { group: 'TO — SNB & VRSNB', count: totalsByBucket.TO.count, value: totalsByBucket.TO.value },
          { group: 'SALES — Hosur & Sales', count: totalsByBucket.SALES.count, value: totalsByBucket.SALES.value },
          { group: 'Cake', count: totalsByBucket.Cake.count, value: totalsByBucket.Cake.value },
          { group: 'Grand Total', count: grandCount, value: grandTotal },
        ],
      },
      {
        // FEATURE (2026-09-04): standardized bill-wise column set across
        // Cafe Control / Branch Sales / Hosur Sales / Dispatch Details —
        // Branch, Bill No, Date, Time, Total Sales, Cash, UPI, Card,
        // Salesperson, Biller. Cash/UPI/Card only apply to 'Sales'
        // (walk-in bill) rows — a TO/Cake dispatch invoice moves stock
        // internally, nothing was collected at a counter for it, so those
        // stay 0 rather than a fabricated split. "Group"/"Items"/"Subtotal"/
        // "Discount"/"Status" (dropped from this sheet) are still fully
        // covered by the Summary sheet and the per-bucket Item sheets below.
        name: 'Bill-wise (All)', title: `Dispatch Details — Bill-wise (${fromDate} to ${toDate})`,
        columns: [
          { header: 'Branch', key: 'branch', width: 10 }, { header: 'Bill No', key: 'billNo', width: 16 }, { header: 'Date', key: 'date', width: 14 }, { header: 'Time', key: 'time', width: 12 },
          { header: 'Total Sales', key: 'totalSales' }, { header: 'Cash', key: 'cash' }, { header: 'UPI', key: 'upi' }, { header: 'Card', key: 'card' },
          { header: 'Salesperson', key: 'salesperson', width: 14 }, { header: 'Biller', key: 'biller', width: 16 },
        ],
        rows: rows.map(r => {
          const mode = (r.paymentMode || '').toLowerCase();
          const cash = mode === 'cash' ? r.total : 0;
          const upi = mode === 'upi' ? r.total : 0;
          const card = mode && mode !== 'cash' && mode !== 'upi' ? r.total : 0;
          return {
            branch: r.scopeLabel, billNo: r.invoiceNo, date: fmtDate(r.date), time: fmtTime(r.date),
            totalSales: r.total, cash, upi, card, salesperson: '—', biller: r.dispatchedBy,
          };
        }),
      },
      sheetFor('TO'), sheetFor('SALES'), sheetFor('Cake'),
    ]);
  };

  const exportPdf = async () => {
    const { exportReportPdf, pdfMoney } = await import('@/lib/exportAdminReport');
    const PDF_CAP = 300;
    await exportReportPdf({
      filename: `Admin_Dispatch_Details_${fromDate}_${toDate}`,
      title: 'Dispatch Details',
      subtitle: `${fromDate} to ${toDate}`,
      kpis: [
        { label: 'Total Invoices', value: String(grandCount) },
        { label: 'Total Value', value: pdfMoney(grandTotal) },
        { label: 'TO (SNB/VRSNB)', value: pdfMoney(totalsByBucket.TO.value) },
        { label: 'SALES (Hosur/Sales)', value: pdfMoney(totalsByBucket.SALES.value) },
        { label: 'Cake', value: pdfMoney(totalsByBucket.Cake.value) },
      ],
      sections: [
        {
          heading: rows.length > PDF_CAP ? `Bill-wise (first ${PDF_CAP} of ${rows.length})` : 'Bill-wise',
          columns: [
            { header: 'Invoice No', width: 30 }, { header: 'Group', width: 18 }, { header: 'Party', width: 40 },
            { header: 'Items', width: 16, align: 'right' }, { header: 'Total', width: 24, align: 'right' }, { header: 'Date', width: 34 },
          ],
          rows: rows.slice(0, PDF_CAP).map(r => [r.invoiceNo, BUCKET_LABEL[r.bucket], r.party, String(r.itemCount), pdfMoney(r.total), fmtDateTime(r.date)]),
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
          {[{ label: 'Today', days: 0 }, { label: '7 Days', days: 6 }, { label: '30 Days', days: 29 }].map(p => (
            <button key={p.label} onClick={() => { setFromDate(daysAgoInput(p.days)); setToDate(todayInput()); }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-100">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void exportExcel()} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
            <FileSpreadsheet className="size-3.5" /> Excel
          </button>
          <button onClick={() => void exportPdf()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            <FileDown className="size-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Dispatched" value={formatCurrency(grandTotal)} icon={<IndianRupee className="size-5" />} tone="bg-slate-50 text-slate-700 ring-slate-200" sub={`${grandCount} invoices`} />
        <KpiCard label="TO — SNB & VRSNB" value={formatCurrency(totalsByBucket.TO.value)} icon={<Truck className="size-5" />} tone={BUCKET_TONE.TO} sub={`${totalsByBucket.TO.count} invoices`} />
        <KpiCard label="SALES — Hosur & Sales" value={formatCurrency(totalsByBucket.SALES.value)} icon={<ShoppingBag className="size-5" />} tone={BUCKET_TONE.SALES} sub={`${totalsByBucket.SALES.count} invoices`} />
        <KpiCard label="Cake" value={formatCurrency(totalsByBucket.Cake.value)} icon={<CakeIcon className="size-5" />} tone={BUCKET_TONE.Cake} sub={`${totalsByBucket.Cake.count} invoices`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <Filter className="size-4 text-slate-400" />
        {(['All', 'TO', 'SALES', 'Cake'] as const).map(b => (
          <button key={b} onClick={() => setBucketFilter(b)}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-black transition', bucketFilter === b ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100')}>
            {b === 'All' ? 'All' : BUCKET_LABEL[b]}
          </button>
        ))}
        <div className="relative ml-auto min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice no, party, dispatched by…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none" />
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="p-3 w-8" />
                <SortableTh label="Invoice No" sortKey="invoiceNo" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                {/* BUG FIX (2026-09-05): "still unable to see the date column"
                    — Date/Time sat near the end of this wide table, past the
                    right edge on a normal viewport. Moved right after Invoice
                    No so they're visible without scrolling. */}
                <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Time" sortKey="time" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Group" sortKey="group" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Party" sortKey="party" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Items" sortKey="items" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Total" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Dispatched By" sortKey="dispatchedBy" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="p-3 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={10} className="p-8 text-center text-sm font-semibold text-slate-500"><Loader2 className="mx-auto mb-2 size-5 animate-spin" /> Loading dispatch details…</td></tr>
              )}
              {!loading && sortedRows.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-sm font-semibold text-slate-500">No dispatch invoices in this range.</td></tr>
              )}
              {!loading && sortedRows.map(r => {
                const expanded = expandedKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr onClick={() => setExpandedKey(expanded ? null : r.key)} className="cursor-pointer hover:bg-slate-50">
                      <td className="p-3"><ChevronDown className={cn('size-4 text-slate-400 transition-transform', expanded && 'rotate-180')} /></td>
                      <td className="p-3 font-black text-slate-900">{r.invoiceNo}</td>
                      <td className="p-3 text-slate-500">{fmtDate(r.date)}</td>
                      <td className="p-3 text-slate-500">{fmtTime(r.date)}</td>
                      <td className="p-3"><span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1', BUCKET_TONE[r.bucket])}>{r.scopeLabel}</span></td>
                      <td className="p-3 text-slate-700">{r.party}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{r.itemCount}</td>
                      <td className="p-3 text-right font-black text-slate-900">{formatCurrency(r.total)}</td>
                      <td className="p-3 text-slate-500">{r.dispatchedBy}</td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex gap-1.5">
                          <button onClick={() => void printDispatchInvoice(r.record, 'thermal')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-100">
                            <Printer className="size-3" /> Thermal
                          </button>
                          <button onClick={() => void printDispatchInvoice(r.record, 'a4')} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-black text-white hover:bg-slate-800">
                            <Printer className="size-3" /> A4
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="bg-slate-50/70 p-4">
                          <table className="w-full text-xs">
                            <thead><tr className="text-left uppercase text-slate-400"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5">Unit</th><th className="py-1.5 text-right">Unit Price</th><th className="py-1.5 text-right">Line Total</th></tr></thead>
                            <tbody className="divide-y divide-slate-200">
                              {r.record.items.map((i, idx) => (
                                <tr key={idx}>
                                  <td className="py-1.5 font-semibold text-slate-700">{i.itemName}{i.isExtra && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-black text-amber-700">EXTRA</span>}</td>
                                  <td className="py-1.5 text-right tabular-nums">{i.quantity}</td>
                                  <td className="py-1.5 text-slate-500">{i.unit}</td>
                                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(i.unitPrice)}</td>
                                  <td className="py-1.5 text-right font-bold">{formatCurrency(i.lineTotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                            <span>Subtotal: <b className="text-slate-800">{formatCurrency(r.subtotal)}</b></span>
                            <span>Discount: <b className="text-slate-800">{formatCurrency(r.discountAmount)}</b></span>
                            <span>Total: <b className="text-slate-800">{formatCurrency(r.total)}</b></span>
                            {r.record.notes && <span className="flex items-center gap-1"><Receipt className="size-3" /> {r.record.notes}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
