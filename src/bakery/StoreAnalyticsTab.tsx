// src/bakery/StoreAnalyticsTab.tsx
// Price analytics for the Store dashboard.
// Computes purchase-to-purchase price diffs, month-over-month trends,
// and supplier price comparisons — all from existing invoice data, no new DB table.

import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, BarChart3, Search,
  ArrowUpRight, ArrowDownRight, ShoppingCart, Calendar,
  Users, Info,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useInvoiceStore, type StoreInvoice, type InvoiceLineItem } from './invoiceStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PurchasePoint {
  date: string;         // ISO date
  dateLabel: string;    // "12 May 2025"
  supplier: string;
  pricePerUnit: number;
  quantity: number;
  unit: string;
  invoiceNumber: string;
  diff: number | null;  // difference from previous purchase (null for first)
  diffPct: number | null;
}

interface MonthlyAvg {
  month: string;        // "May 2025"
  monthKey: string;     // "2025-05"
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  count: number;
}

interface SupplierSummary {
  supplier: string;
  latestPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  purchaseCount: number;
  lastDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `₹${n % 1 === 0 ? n.toLocaleString('en-IN') : n.toFixed(2)}`;
}

function diffColor(diff: number | null) {
  if (diff === null) return 'text-muted-foreground';
  if (diff > 0) return 'text-red-600';
  if (diff < 0) return 'text-emerald-600';
  return 'text-muted-foreground';
}

function diffBg(diff: number | null) {
  if (diff === null) return 'bg-muted/40';
  if (diff > 0) return 'bg-red-50 border-red-100';
  if (diff < 0) return 'bg-emerald-50 border-emerald-100';
  return 'bg-muted/30';
}

function DiffBadge({ diff, pct }: { diff: number | null; pct: number | null }) {
  if (diff === null) return <span className="text-[10px] text-muted-foreground font-body">First purchase</span>;
  if (diff === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-body font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
      <Minus className="size-2.5" /> No change
    </span>
  );
  const up = diff > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-body font-bold px-1.5 py-0.5 rounded-full',
      up ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
    )}>
      {up ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
      {up ? '+' : ''}{fmt(diff)} ({pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''})
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StoreAnalyticsTab() {
  const { invoices, loaded, load } = useInvoiceStore();
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  // Build a deduplicated list of all item names across all approved invoices
  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const inv of invoices) {
      if (inv.status === 'rejected') continue; // skip rejected
      for (const li of inv.lineItems) {
        const name = li.itemName.trim();
        const key = name.toLowerCase();
        if (name && !seen.has(key)) {
          seen.add(key);
          items.push(name);
        }
      }
    }
    return items.sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const storeSummary = useMemo(() => {
    const activeInvoices = invoices.filter(inv => inv.status !== 'rejected');
    const totalSpend = activeInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);
    const supplierSpend = activeInvoices.reduce<Record<string, number>>((acc, inv) => {
      acc[inv.supplierName] = (acc[inv.supplierName] ?? 0) + Number(inv.grandTotal || 0);
      return acc;
    }, {});
    const topSupplier = Object.entries(supplierSpend).sort((a, b) => b[1] - a[1])[0];
    return {
      invoiceCount: activeInvoices.length,
      totalSpend,
      avgInvoice: activeInvoices.length > 0 ? totalSpend / activeInvoices.length : 0,
      topSupplierName: topSupplier?.[0] ?? 'No supplier yet',
      topSupplierSpend: topSupplier?.[1] ?? 0,
    };
  }, [invoices]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return q ? allItems.filter(i => i.toLowerCase().includes(q)) : allItems;
  }, [allItems, search]);

  useEffect(() => {
    if (!selectedItem && allItems.length > 0) setSelectedItem(allItems[0]);
  }, [allItems, selectedItem]);

  // All purchase points for the selected item, sorted oldest→newest
  const purchasePoints = useMemo((): PurchasePoint[] => {
    if (!selectedItem) return [];
    const key = selectedItem.toLowerCase();
    const raw: { date: string; supplier: string; li: InvoiceLineItem; inv: StoreInvoice }[] = [];

    for (const inv of invoices) {
      if (inv.status === 'rejected') continue;
      for (const li of inv.lineItems) {
        if (li.itemName.trim().toLowerCase() === key) {
          raw.push({ date: inv.deliveryDate, supplier: inv.supplierName, li, inv });
        }
      }
    }

    raw.sort((a, b) => a.date.localeCompare(b.date));

    return raw.map((r, i) => {
      const prev = i > 0 ? raw[i - 1].li.pricePerUnit : null;
      const diff = prev !== null ? parseFloat((r.li.pricePerUnit - prev).toFixed(2)) : null;
      const diffPct = prev !== null && prev > 0
        ? parseFloat(((diff! / prev) * 100).toFixed(1))
        : null;
      return {
        date: r.date,
        dateLabel: new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        supplier: r.supplier,
        pricePerUnit: r.li.pricePerUnit,
        quantity: r.li.quantity,
        unit: r.li.unit,
        invoiceNumber: r.inv.invoiceNumber,
        diff,
        diffPct,
      };
    });
  }, [selectedItem, invoices]);

  // Month-over-month averages
  const monthlyAvgs = useMemo((): MonthlyAvg[] => {
    const byMonth: Record<string, number[]> = {};
    for (const p of purchasePoints) {
      const key = p.date.slice(0, 7); // "2025-05"
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(p.pricePerUnit);
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, prices]) => {
        const [year, month] = key.split('-');
        return {
          monthKey: key,
          month: new Date(Number(year), Number(month) - 1, 1)
            .toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
          avgPrice: parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)),
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          count: prices.length,
        };
      });
  }, [purchasePoints]);

  // Per-supplier summary
  const supplierSummary = useMemo((): SupplierSummary[] => {
    const bySupplier: Record<string, PurchasePoint[]> = {};
    for (const p of purchasePoints) {
      if (!bySupplier[p.supplier]) bySupplier[p.supplier] = [];
      bySupplier[p.supplier].push(p);
    }
    return Object.entries(bySupplier)
      .map(([supplier, pts]) => {
        const prices = pts.map(p => p.pricePerUnit);
        const sorted = [...pts].sort((a, b) => b.date.localeCompare(a.date));
        return {
          supplier,
          latestPrice: sorted[0].pricePerUnit,
          avgPrice: parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)),
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          purchaseCount: pts.length,
          lastDate: new Date(sorted[0].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        };
      })
      .sort((a, b) => a.latestPrice - b.latestPrice);
  }, [purchasePoints]);

  const cheapestSupplier = supplierSummary[0]?.supplier;
  const mostExpensiveSupplier = supplierSummary[supplierSummary.length - 1]?.supplier;
  const latestPrice = purchasePoints.at(-1)?.pricePerUnit ?? null;
  const firstPrice = purchasePoints[0]?.pricePerUnit ?? null;
  const overallDiff = latestPrice !== null && firstPrice !== null
    ? parseFloat((latestPrice - firstPrice).toFixed(2))
    : null;
  const overallDiffPct = overallDiff !== null && firstPrice !== null && firstPrice > 0
    ? parseFloat(((overallDiff / firstPrice) * 100).toFixed(1))
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <div className="size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 overflow-hidden">

      {/* Header */}
      <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="size-4 text-primary" />
          <h2 className="font-display font-bold text-foreground">Store Analytics</h2>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Review purchase spend first, then drill into item-wise price changes across months and suppliers.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Invoice Spend', value: fmt(storeSummary.totalSpend), sub: 'Approved and pending bills', icon: ShoppingCart },
          { label: 'Invoices', value: storeSummary.invoiceCount, sub: `Average ${fmt(storeSummary.avgInvoice)}`, icon: Calendar },
          { label: 'Tracked Items', value: allItems.length, sub: 'Items found in invoices', icon: BarChart3 },
          { label: 'Top Supplier', value: storeSummary.topSupplierName, sub: fmt(storeSummary.topSupplierSpend), icon: Users },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-body font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
                  <p className="font-display text-lg font-bold text-foreground mt-0.5 truncate">{card.value}</p>
                  <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{card.sub}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Item selector */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">Select Item to Analyse</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {filteredItems.length === 0 && (
            <p className="text-xs font-body text-muted-foreground py-2">
              {allItems.length === 0 ? 'No invoices found — create invoices to see analytics.' : 'No items match your search.'}
            </p>
          )}
          {filteredItems.map(item => (
            <button
              key={item}
              onClick={() => { setSelectedItem(item); setSearch(''); }}
              className={cn(
                'text-[11px] font-body font-semibold px-3 py-1.5 rounded-xl border transition-all active:scale-95',
                selectedItem === item
                  ? 'cafe-gradient text-primary-foreground border-transparent shadow-sm'
                  : 'bg-muted/40 border-border text-foreground hover:border-primary/40'
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* No item selected */}
      {!selectedItem && (
        <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
          <BarChart3 className="size-10 opacity-20" />
          <p className="text-sm font-body text-center">Select an item above to see price analytics</p>
        </div>
      )}

      {/* No data for item */}
      {selectedItem && purchasePoints.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <Info className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm font-body text-amber-800">
            No purchase records found for <strong>{selectedItem}</strong>. Create invoices containing this item to see analytics.
          </p>
        </div>
      )}

      {selectedItem && purchasePoints.length > 0 && (
        <>
          {/* ── KPI Summary ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {[
              {
                label: 'Latest Price',
                value: fmt(latestPrice!),
                sub: purchasePoints.at(-1)!.dateLabel,
                color: 'text-foreground',
                bg: 'bg-card',
              },
              {
                label: 'Total Change',
                value: overallDiff !== null
                  ? `${overallDiff > 0 ? '+' : ''}${fmt(overallDiff)}`
                  : '—',
                sub: overallDiffPct !== null
                  ? `${overallDiffPct > 0 ? '+' : ''}${overallDiffPct}% since first buy`
                  : 'since first purchase',
                color: overallDiff === null ? 'text-muted-foreground' : overallDiff > 0 ? 'text-red-600' : overallDiff < 0 ? 'text-emerald-600' : 'text-muted-foreground',
                bg: 'bg-card',
              },
              {
                label: 'Purchases',
                value: String(purchasePoints.length),
                sub: `across ${supplierSummary.length} supplier${supplierSummary.length !== 1 ? 's' : ''}`,
                color: 'text-primary',
                bg: 'bg-card',
              },
              {
                label: 'Price Range',
                value: `${fmt(Math.min(...purchasePoints.map(p => p.pricePerUnit)))} – ${fmt(Math.max(...purchasePoints.map(p => p.pricePerUnit)))}`,
                sub: 'min – max across all buys',
                color: 'text-foreground',
                bg: 'bg-card',
              },
            ].map(({ label, value, sub, color, bg }) => (
              <div key={label} className={cn('border border-border rounded-2xl p-3', bg)}>
                <p className={cn('font-display font-bold text-lg tabular-nums leading-tight', color)}>{value}</p>
                <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{label}</p>
                <p className="text-[10px] font-body text-muted-foreground mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── Section A: Purchase-to-purchase price diff ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-primary" />
                <h3 className="font-display font-bold text-sm text-foreground">Purchase History — {selectedItem}</h3>
              </div>
              <p className="text-[10px] font-body text-muted-foreground mt-0.5">Price change between each consecutive purchase</p>
            </div>

            {/* Price line chart */}
            {purchasePoints.length >= 2 && (
              <div className="px-2 pt-3 pb-1">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={purchasePoints} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 8, fontFamily: 'inherit' }}
                      tickFormatter={v => v.slice(0, 6)}
                    />
                    <YAxis
                      tick={{ fontSize: 8, fontFamily: 'inherit' }}
                      tickFormatter={v => `₹${v}`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [`₹${v}`, name]}
                      labelFormatter={l => `Date: ${l}`}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <ReferenceLine
                      y={purchasePoints[0].pricePerUnit}
                      stroke="#94A3B8"
                      strokeDasharray="4 4"
                      label={{ value: 'First', fontSize: 9, fill: '#94A3B8' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pricePerUnit"
                      name="Price/Unit"
                      stroke="#E07A3A"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#E07A3A', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-purchase rows */}
            <div className="divide-y divide-border/40">
              {[...purchasePoints].reverse().map((p, i) => (
                <div key={i} className={cn('px-4 py-3 flex items-start gap-3 border-b border-border/30', diffBg(p.diff))}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-body font-bold text-foreground">{p.dateLabel}</span>
                      <span className="text-[10px] font-body text-muted-foreground">{p.supplier}</span>
                      <span className="text-[9px] font-body text-muted-foreground opacity-60">{p.invoiceNumber}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={cn('text-sm font-display font-bold tabular-nums', diffColor(p.diff))}>
                        {fmt(p.pricePerUnit)} <span className="text-[10px] font-body font-normal text-muted-foreground">/ {p.unit}</span>
                      </span>
                      <span className="text-[10px] font-body text-muted-foreground">{p.quantity} {p.unit}</span>
                    </div>
                  </div>
                  <DiffBadge diff={p.diff} pct={p.diffPct} />
                </div>
              ))}
            </div>
          </div>

          {/* ── Section B: Month-over-month ── */}
          {monthlyAvgs.length >= 2 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-blue-600" />
                  <h3 className="font-display font-bold text-sm text-foreground">Month-over-Month</h3>
                </div>
                <p className="text-[10px] font-body text-muted-foreground mt-0.5">Average price per unit across months</p>
              </div>
              <div className="px-2 pt-3 pb-2">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={monthlyAvgs} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fontFamily: 'inherit' }} />
                    <YAxis tick={{ fontSize: 8, fontFamily: 'inherit' }} tickFormatter={v => `₹${v}`} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(v: number) => [`₹${v}`, 'Avg Price']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Bar dataKey="avgPrice" name="Avg ₹/unit" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="divide-y divide-border/40">
                {[...monthlyAvgs].reverse().map((m, i, arr) => {
                  const prev = arr[i + 1];
                  const diff = prev ? parseFloat((m.avgPrice - prev.avgPrice).toFixed(2)) : null;
                  const diffPct = diff !== null && prev && prev.avgPrice > 0
                    ? parseFloat(((diff / prev.avgPrice) * 100).toFixed(1))
                    : null;
                  return (
                    <div key={m.monthKey} className={cn('px-4 py-3 flex items-center gap-3', diffBg(diff))}>
                      <div className="flex-1">
                        <p className="text-xs font-body font-bold text-foreground">{m.month}</p>
                        <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                          {m.count} purchase{m.count !== 1 ? 's' : ''} · min {fmt(m.minPrice)} · max {fmt(m.maxPrice)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-sm font-display font-bold tabular-nums', diffColor(diff))}>{fmt(m.avgPrice)}</p>
                        {diff !== null && <DiffBadge diff={diff} pct={diffPct} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Section C: Supplier comparison ── */}
          {supplierSummary.length >= 1 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-emerald-600" />
                  <h3 className="font-display font-bold text-sm text-foreground">Supplier Price Comparison</h3>
                </div>
                <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                  Latest & average price per supplier for <strong>{selectedItem}</strong>
                </p>
              </div>

              {supplierSummary.length === 1 && (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-body text-muted-foreground flex items-center gap-1.5">
                    <Info className="size-3.5 shrink-0" />
                    Only one supplier for this item. Add more suppliers to compare prices.
                  </p>
                </div>
              )}

              {supplierSummary.length >= 2 && (
                <div className="px-4 pt-3 pb-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                    <TrendingDown className="size-3.5 text-emerald-600 shrink-0" />
                    <p className="text-[11px] font-body text-emerald-800">
                      <strong>{cheapestSupplier}</strong> offers the lowest latest price.
                      {cheapestSupplier !== mostExpensiveSupplier && (
                        <> <strong>{mostExpensiveSupplier}</strong> is the most expensive — difference of{' '}
                          {fmt(supplierSummary[supplierSummary.length - 1].latestPrice - supplierSummary[0].latestPrice)}/unit.</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/40">
                {supplierSummary.map((s, i) => {
                  const isCheapest = s.supplier === cheapestSupplier && supplierSummary.length > 1;
                  const isMostExp = s.supplier === mostExpensiveSupplier && supplierSummary.length > 1;
                  return (
                    <div key={s.supplier} className={cn(
                      'px-4 py-3',
                      isCheapest && 'bg-emerald-50/60',
                      isMostExp && 'bg-red-50/40',
                    )}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-body font-bold text-foreground truncate">{s.supplier}</p>
                            {isCheapest && (
                              <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                Cheapest
                              </span>
                            )}
                            {isMostExp && (
                              <span className="text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                Most Expensive
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                            {s.purchaseCount} purchase{s.purchaseCount !== 1 ? 's' : ''} · last {s.lastDate}
                          </p>
                          <p className="text-[10px] font-body text-muted-foreground">
                            Range: {fmt(s.minPrice)} – {fmt(s.maxPrice)} · Avg: {fmt(s.avgPrice)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn(
                            'font-display font-bold text-base tabular-nums',
                            isCheapest ? 'text-emerald-700' : isMostExp ? 'text-red-600' : 'text-foreground'
                          )}>
                            {fmt(s.latestPrice)}
                          </p>
                          <p className="text-[9px] font-body text-muted-foreground">latest/unit</p>
                        </div>
                      </div>
                      {/* Visual bar showing relative price */}
                      {supplierSummary.length > 1 && (() => {
                        const allLatest = supplierSummary.map(x => x.latestPrice);
                        const min = Math.min(...allLatest);
                        const max = Math.max(...allLatest);
                        const pct = max === min ? 100 : Math.round(((s.latestPrice - min) / (max - min)) * 100);
                        return (
                          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', isCheapest ? 'bg-emerald-500' : isMostExp ? 'bg-red-400' : 'bg-blue-400')}
                              style={{ width: `${Math.max(8, pct)}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Section D: Price volatility insight ── */}
          {purchasePoints.length >= 3 && (() => {
            const prices = purchasePoints.map(p => p.pricePerUnit);
            const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
            const variance = prices.reduce((a, b) => a + (b - avg) ** 2, 0) / prices.length;
            const stdDev = Math.sqrt(variance);
            const volatility = avg > 0 ? (stdDev / avg) * 100 : 0;
            const isVolatile = volatility > 10;
            return (
              <div className={cn(
                'border rounded-2xl p-4 flex gap-3',
                isVolatile ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
              )}>
                {isVolatile
                  ? <TrendingUp className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  : <TrendingDown className="size-4 text-blue-600 shrink-0 mt-0.5" />
                }
                <div>
                  <p className={cn('text-xs font-body font-bold', isVolatile ? 'text-amber-800' : 'text-blue-800')}>
                    {isVolatile ? 'High Price Volatility' : 'Stable Pricing'}
                  </p>
                  <p className={cn('text-[11px] font-body mt-0.5', isVolatile ? 'text-amber-700' : 'text-blue-700')}>
                    Price std. deviation is ₹{stdDev.toFixed(2)} ({volatility.toFixed(1)}% of avg ₹{avg.toFixed(2)}).
                    {isVolatile
                      ? ' Consider locking in prices with your cheapest supplier.'
                      : ' Prices are relatively consistent across purchases.'}
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
