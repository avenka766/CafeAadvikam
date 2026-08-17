import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import * as XLSX from '@/lib/safeSpreadsheet';
import { Calendar, Download, FileText, Loader2, MinusCircle, Package, Receipt, RefreshCw, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useInvoiceStore } from './invoiceStore';
import { matForItem } from './materialCalc';
import type { ProductionCategory } from './productionRouting';
import { storeOrderCategory } from './productionRouting';
import { useBakeryItemsStore } from './bakeryItemsStore';
import type { BakeryOrder } from './types';

type PeriodKey = 'today' | '7d' | '30d' | 'custom';

interface MaterialDeduction {
  id: string;
  orderId: string;
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

interface CategoryMaterialRow { material: string; quantity: number; unit: string; price: number | null; value: number }
interface CategoryItemRow { itemName: string; totalQuantity: number; unit: string; orderCount: number; materials: CategoryMaterialRow[]; materialsValue: number }
interface CategoryGroup { category: ProductionCategory; items: CategoryItemRow[]; totalValue: number }

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
  const [view, setView] = useState<'overview' | 'price' | 'category'>('overview');
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
          .select('id, order_id, order_number, material_name, quantity_deducted, unit, stock_before, stock_after, deducted_by, deducted_at')
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
        orderId: String(r.order_id ?? ''),
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

  // Latest known price per item name, taken from all invoices (not just the selected range).
  const priceMap = useMemo(() => {
    const map = new Map<string, { price: number; at: number }>();
    for (const inv of invoices) {
      const at = new Date(inv.createdAt).getTime();
      for (const li of inv.lineItems) {
        const key = li.itemName.trim().toLowerCase();
        const existing = map.get(key);
        if (!existing || at > existing.at) map.set(key, { price: li.pricePerUnit, at });
      }
    }
    return map;
  }, [invoices]);

  const [priceSource, setPriceSource] = useState<'all' | 'recipe' | 'custom'>('all');

  // ── Category-wise report ──────────────────────────────────────────────────
  // "Bakery -> Bread 100 pcs -> raw materials deducted for this, and their
  // price." store_material_deductions only records materials at the ORDER
  // level (one flat list per order), but a single order routinely bundles
  // many different items together (some real orders have 30-50+ items) —
  // so that log alone can't say which material went to which specific item.
  // Recomputing per item with matForItem (the exact same function the real
  // deduction pipeline itself uses — see materialCalc.ts) gives item-level
  // attribution instead of order-level aggregation.
  const { items: bakeryItems, loadAllItems, subscribe: subscribeBakeryItems } = useBakeryItemsStore();
  useEffect(() => { void loadAllItems(); return subscribeBakeryItems(); }, [loadAllItems, subscribeBakeryItems]);

  const [categoryOrders, setCategoryOrders] = useState<Pick<BakeryOrder, 'id' | 'orderNumber' | 'items'>[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  const deductionOrderIds = useMemo(
    () => Array.from(new Set(materials.map(m => m.orderId).filter(Boolean))),
    [materials],
  );

  const loadCategoryOrders = useCallback(async () => {
    if (deductionOrderIds.length === 0) { setCategoryOrders([]); return; }
    setCategoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('bakery_orders')
        .select('id, order_number, items')
        .in('id', deductionOrderIds);
      if (error) { console.error('[StoreReportTab] category orders fetch:', error.message); setCategoryOrders([]); return; }
      setCategoryOrders((data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        orderNumber: Number(r.order_number ?? 0),
        items: Array.isArray(r.items) ? (r.items as BakeryOrder['items']) : [],
      })));
    } finally {
      setCategoryLoading(false);
    }
  }, [deductionOrderIds]);

  const [categoryViewVisited, setCategoryViewVisited] = useState(false);
  useEffect(() => { if (categoryViewVisited) void loadCategoryOrders(); }, [categoryViewVisited, loadCategoryOrders]);

  const categoryReport = useMemo<CategoryGroup[]>(() => {
    if (categoryOrders.length === 0) return [];
    // category -> itemName(lowercased) -> accumulator
    const groups = new Map<ProductionCategory, Map<string, {
      itemName: string; totalQuantity: number; unit: string; orderCount: number;
      materials: Map<string, { name: string; quantity: number; unit: string }>;
    }>>();

    for (const order of categoryOrders) {
      for (const item of order.items) {
        const category = storeOrderCategory(item, bakeryItems);
        const itemMaterials = matForItem(item);
        if (itemMaterials.length === 0) continue; // no recipe linked — nothing to attribute

        if (!groups.has(category)) groups.set(category, new Map());
        const itemMap = groups.get(category)!;
        const key = item.itemName.trim().toLowerCase();
        const displayQty = item.dispatchUnit === 'pcs' ? (item.originalPcs ?? item.quantity) : item.quantity;
        const displayUnit = item.dispatchUnit ?? (item.originalPcs != null ? 'pcs' : 'kg');

        let entry = itemMap.get(key);
        if (!entry) {
          entry = { itemName: item.itemName, totalQuantity: 0, unit: displayUnit, orderCount: 0, materials: new Map() };
          itemMap.set(key, entry);
        }
        entry.totalQuantity += displayQty;
        entry.orderCount += 1;
        for (const m of itemMaterials) {
          const mKey = m.material.trim().toLowerCase();
          const existing = entry.materials.get(mKey);
          if (existing) existing.quantity += m.quantity;
          else entry.materials.set(mKey, { name: m.material, quantity: m.quantity, unit: m.unit });
        }
      }
    }

    const result: CategoryGroup[] = [];
    for (const [category, itemMap] of groups) {
      const items: CategoryItemRow[] = [];
      for (const entry of itemMap.values()) {
        const materialRows: CategoryMaterialRow[] = [];
        for (const [mKey, mVal] of entry.materials) {
          const price = priceMap.get(mKey)?.price ?? null;
          const qty = Number(mVal.quantity.toFixed(4));
          materialRows.push({ material: mVal.name, quantity: qty, unit: mVal.unit, price, value: price !== null ? price * qty : 0 });
        }
        materialRows.sort((a, b) => b.value - a.value);
        items.push({
          itemName: entry.itemName,
          totalQuantity: Number(entry.totalQuantity.toFixed(3)),
          unit: entry.unit,
          orderCount: entry.orderCount,
          materials: materialRows,
          materialsValue: materialRows.reduce((s, m) => s + m.value, 0),
        });
      }
      items.sort((a, b) => b.materialsValue - a.materialsValue);
      result.push({ category, items, totalValue: items.reduce((s, i) => s + i.materialsValue, 0) });
    }
    result.sort((a, b) => b.totalValue - a.totalValue);
    return result;
  }, [categoryOrders, bakeryItems, priceMap]);

  const categoryReportTotal = categoryReport.reduce((s, g) => s + g.totalValue, 0);

  const priceRows = useMemo(() => {
    type Row = { id: string; itemName: string; quantity: number; unit: string; source: 'Recipe' | 'Custom'; date: string; price: number | null; value: number };
    const rows: Row[] = [];
    for (const m of materials) {
      const price = priceMap.get(m.materialName.trim().toLowerCase())?.price ?? null;
      rows.push({ id: `m-${m.id}`, itemName: m.materialName, quantity: m.quantity, unit: m.unit, source: 'Recipe', date: m.deductedAt, price, value: price !== null ? price * m.quantity : 0 });
    }
    for (const c of custom) {
      const price = priceMap.get(c.itemName.trim().toLowerCase())?.price ?? null;
      rows.push({ id: `c-${c.id}`, itemName: c.itemName, quantity: c.quantity, unit: c.unit, source: 'Custom', date: c.createdAt, price, value: price !== null ? price * c.quantity : 0 });
    }
    const filtered = priceSource === 'all' ? rows : rows.filter(r => r.source.toLowerCase() === priceSource);
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [materials, custom, priceMap, priceSource]);

  const priceTotal = priceRows.reduce((sum, r) => sum + r.value, 0);
  const priceMissing = priceRows.filter(r => r.price === null).length;

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
    // BUG FIX: the "Invoices" sheet above only ever had one summary row per
    // invoice (just an item COUNT, never what those items actually were).
    // This adds the missing detail — every line item from every invoice in
    // range, sorted by supplier then invoice so all of one supplier's
    // deliveries and exactly what was in each of them sit together.
    const invoiceItemRows = reportInvoices
      .flatMap(inv => inv.lineItems.map(li => ({
        Supplier: inv.supplierName,
        Date: prettyDate(inv.createdAt),
        Invoice: inv.invoiceNumber,
        Item: li.itemName,
        Quantity: li.quantity,
        Unit: li.unit,
        'Price/Unit': li.pricePerUnit,
        'Line Total': li.totalPrice,
        Status: inv.status.replace('_', ' '),
      })))
      .sort((a, b) => a.Supplier.localeCompare(b.Supplier) || a.Invoice.localeCompare(b.Invoice));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceItemRows), 'Invoice Items by Supplier');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(priceRows.map(r => ({
      Date: prettyDate(r.date),
      Item: r.itemName,
      Source: r.source,
      Quantity: r.quantity,
      Unit: r.unit,
      'Price/Unit': r.price ?? '',
      Value: r.value,
    }))), 'Price Consumption');
    const categoryRows = categoryReport.flatMap(group =>
      group.items.flatMap(item =>
        item.materials.map(m => ({
          Category: group.category,
          Item: item.itemName,
          'Item Qty': item.totalQuantity,
          'Item Unit': item.unit,
          'Raw Material': m.material,
          'Material Qty': m.quantity,
          'Material Unit': m.unit,
          'Price/Unit': m.price ?? '',
          Value: m.value,
        }))
      )
    );
    if (categoryRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoryRows), 'Category Wise');
    }
    XLSX.writeFile(wb, `store-report-${range.fromDate}-to-${range.toDate}.xlsx`);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex gap-1.5">
        {(['overview', 'price', 'category'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => { setView(v); if (v === 'category') setCategoryViewVisited(true); }}
            className={cn('h-9 rounded-xl border px-4 text-xs font-body font-bold capitalize', view === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted')}
          >
            {v === 'price' ? 'Price' : v === 'category' ? 'Category Wise' : 'Overview'}
          </button>
        ))}
      </div>

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
      ) : view === 'price' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Calendar} label="Stock Value Consumed" value={money(priceTotal)} sub={`${range.fromDate} to ${range.toDate}`} />
            <StatCard icon={Package} label="Line Items" value={priceRows.length} sub="Recipe + custom deductions" />
            <StatCard icon={MinusCircle} label="Missing Price" value={priceMissing} sub="No invoice rate found yet" />
          </div>

          <div className="flex gap-1.5">
            {(['all', 'recipe', 'custom'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setPriceSource(s)}
                className={cn('h-8 rounded-lg border px-3 text-[11px] font-body font-bold capitalize', priceSource === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted')}
              >
                {s}
              </button>
            ))}
          </div>

          <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <h4 className="text-sm font-body font-bold text-foreground mb-3">Amount consumed from stock</h4>
            {priceRows.length === 0 ? (
              <p className="py-10 text-center text-xs font-body text-muted-foreground">No stock consumption found for this range.</p>
            ) : (
              <div className="space-y-2">
                {priceRows.map(r => (
                  <ReportRow
                    key={r.id}
                    title={r.itemName}
                    right={r.price !== null ? money(r.value) : 'No price'}
                    lines={[`${r.source} · ${r.quantity} ${r.unit}${r.price !== null ? ` @ Rs ${r.price.toFixed(2)}` : ''}`, prettyDate(r.date)]}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : view === 'category' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={LayoutGrid} label="Stock Value by Category" value={money(categoryReportTotal)} sub={`${range.fromDate} to ${range.toDate}`} />
            <StatCard icon={Package} label="Categories" value={categoryReport.length} sub="With items sent to baker" />
            <StatCard icon={Calendar} label="Orders Covered" value={categoryOrders.length} sub={`Of ${deductionOrderIds.length} with deductions`} />
          </div>

          <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <h4 className="text-sm font-body font-bold text-foreground mb-1">Raw materials by category</h4>
            <p className="text-[11px] font-body text-muted-foreground mb-3">Items sent to the baker in this range, grouped by category, with the raw materials and cost each one drew from stock.</p>
            {categoryLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : categoryReport.length === 0 ? (
              <p className="py-10 text-center text-xs font-body text-muted-foreground">No production found for this range.</p>
            ) : (
              <div className="space-y-2">
                {categoryReport.map(group => (
                  <CategoryGroupCard key={group.category} group={group} />
                ))}
              </div>
            )}
          </section>
        </div>
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

// ─── Category Wise report cards ────────────────────────────────────────────────
// Category -> Item -> Materials, matching the requested "Bakery -> Bread 100 pcs
// -> raw materials + price" shape. Two nesting levels, each independently
// collapsible so a category with 20 items doesn't force-expand all of them.
function CategoryGroupCard({ group }: { group: CategoryGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left bg-background hover:bg-muted/40"
      >
        <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <LayoutGrid className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-bold text-foreground">{group.category}</p>
          <p className="text-[11px] font-body text-muted-foreground">{group.items.length} item{group.items.length !== 1 ? 's' : ''} sent to baker</p>
        </div>
        <p className="text-sm font-body font-bold text-foreground whitespace-nowrap">{money(group.totalValue)}</p>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/10">
          {group.items.map(item => (
            <CategoryItemCard key={item.itemName} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryItemCard({ item }: { item: CategoryItemRow }) {
  const [expanded, setExpanded] = useState(false);
  const missingPrice = item.materials.some(m => m.price === null);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-muted/30"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-body font-bold text-foreground">{item.itemName}</p>
            <span className="text-[10px] font-body font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
              {item.totalQuantity} {item.unit}
            </span>
          </div>
          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
            {item.materials.length} raw material{item.materials.length !== 1 ? 's' : ''} · from {item.orderCount} order{item.orderCount !== 1 ? 's' : ''}
            {missingPrice && <span className="text-amber-600"> · some prices missing</span>}
          </p>
        </div>
        <p className="text-xs font-body font-bold text-foreground whitespace-nowrap">{money(item.materialsValue)}</p>
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[11px] font-body">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-2.5 py-1.5 font-bold text-muted-foreground">Raw Material</th>
                  <th className="text-right px-2.5 py-1.5 font-bold text-muted-foreground">Qty</th>
                  <th className="text-right px-2.5 py-1.5 font-bold text-muted-foreground">Price</th>
                  <th className="text-right px-2.5 py-1.5 font-bold text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {item.materials.map(m => (
                  <tr key={m.material} className="border-b border-border/40 last:border-0">
                    <td className="px-2.5 py-1.5 text-foreground capitalize">{m.material}</td>
                    <td className="px-2.5 py-1.5 text-right text-foreground">{m.quantity} {m.unit}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{m.price !== null ? `Rs ${m.price.toFixed(2)}` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-right font-bold text-foreground">{m.price !== null ? money(m.value) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
