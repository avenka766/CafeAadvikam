// src/components/admin/SnbItemsTab.tsx
// Admin → Items → Bakery → SNB Items
// Shows all 196 SNB price-list items + stock mismatch alerts from SNB & Hosur branches.

import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Search, X, FileSpreadsheet, Scale, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/branch/branchStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '@/branch/snbItems';
import type { SnbCategory } from '@/branch/snbItems';

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function SnbItemsTab() {
  const { stockMismatches, fetchStockMismatches } = useBranchStore();
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState<SnbCategory | 'All'>('All');
  const [mismatchExpanded, setMismatchExpanded] = useState(true);

  useEffect(() => { fetchStockMismatches(); }, []);

  // Deduplicate mismatches by item — sum shortage per item
  const mismatchSummary = useMemo(() => {
    const map: Record<string, { branch: string; totalShortage: number; lastDate: string }> = {};
    stockMismatches.forEach((m) => {
      const key = `${m.branch}::${m.itemName}`;
      if (!map[key]) {
        map[key] = { branch: m.branch, totalShortage: 0, lastDate: m.soldAt };
      }
      map[key].totalShortage += m.shortage;
      if (m.soldAt > map[key].lastDate) map[key].lastDate = m.soldAt;
    });
    return Object.entries(map).map(([key, v]) => ({
      itemName: key.split('::')[1],
      branch: v.branch,
      totalShortage: Math.round(v.totalShortage * 1000) / 1000,
      lastDate: new Date(v.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    }));
  }, [stockMismatches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SNB_ITEMS.filter((item) => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchQ   = !q || item.name.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [search, activeCategory]);

  return (
    <div className="space-y-4">

      {/* ── Mismatch alerts ─────────────────────────────────────────────────── */}
      {mismatchSummary.length > 0 && (
        <div className="rounded-xl border border-red-200 overflow-hidden">
          <button
            onClick={() => setMismatchExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 transition text-left"
          >
            <div className="size-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertCircle className="size-4 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                Stock mismatch alerts — SNB &amp; Hosur
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {mismatchSummary.length} item{mismatchSummary.length > 1 ? 's' : ''} sold without sufficient stock (last 30 days)
              </p>
            </div>
            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full mr-1">
              {mismatchSummary.length}
            </span>
            {mismatchExpanded
              ? <ChevronUp className="size-4 text-red-400 shrink-0" />
              : <ChevronDown className="size-4 text-red-400 shrink-0" />}
          </button>

          {mismatchExpanded && (
            <div className="divide-y divide-red-50 bg-white">
              {mismatchSummary.map((m, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <AlertTriangle className="size-3.5 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.itemName}</p>
                    <p className="text-[10px] text-muted-foreground">{m.branch} · Last: {m.lastDate}</p>
                  </div>
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap">
                    −{m.totalShortage} short
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            196 items · SNB &amp; Hosur branches · same price list
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
          <FileSpreadsheet className="size-3.5" />
          Re-upload Excel
        </button>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search 196 items…"
          className="w-full pl-8 pr-8 py-2.5 rounded-xl bg-card border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Category pills ───────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
        {(['All', ...SNB_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat as SnbCategory | 'All')}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition whitespace-nowrap',
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-transparent shadow-sm'
                : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {filtered.length === SNB_ITEMS.length
          ? `${SNB_ITEMS.length} items`
          : `${filtered.length} of ${SNB_ITEMS.length} items`}
      </p>

      {/* ── Items table ─────────────────────────────────────────────────────── */}
      <div className="bg-card border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No items match your search.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => {
              const hasMismatch = mismatchSummary.some(
                (m) => m.itemName.toLowerCase() === item.name.toLowerCase(),
              );
              return (
                <div key={item.barcode}
                  className={cn('flex items-center gap-3 px-4 py-3', hasMismatch && 'bg-red-50/40')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{item.name}</p>
                      {hasMismatch && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="size-2.5" /> Stock alert
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">#{item.barcode}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        {item.uom === 'Kgs'
                          ? <><Scale className="size-2.5" /> by kg</>
                          : <><Hash className="size-2.5" /> per pc</>}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{item.category}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 tabular-nums shrink-0">
                    {fmt(item.price)}{item.uom === 'Kgs' ? '/kg' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
