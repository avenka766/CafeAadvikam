// src/components/admin/SnbItemsTab.tsx
// Admin → Items → Bakery → SNB Items
// Shows all 196 SNB price-list items + stock mismatch alerts from SNB & Hosur branches.

import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Search, X, Scale, Hash, ChevronDown, ChevronUp, Plus, Pencil, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/branch/branchStore';
import { useItemPriceStore } from '@/stores/itemPriceStore';
import { useAuthStore } from '@/stores/authStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '@/branch/snbItems';
import type { SnbCategory } from '@/branch/snbItems';

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface CustomSnbItem {
  barcode: number;
  name: string;
  price: number;
  uom: 'Nos' | 'Kgs';
  category: SnbCategory;
  isCustom: true;
}

const BLANK_FORM = {
  name: '',
  category: SNB_CATEGORIES[0] as SnbCategory,
  price: '' as string | number,
  uom: 'Nos' as 'Nos' | 'Kgs',
};

// ── Add Item Modal ─────────────────────────────────────────────────────────────
function AddItemModal({
  onClose,
  onAdd,
  nextBarcode,
}: {
  onClose: () => void;
  onAdd: (item: CustomSnbItem) => void;
  nextBarcode: number;
}) {
  const [form, setForm] = useState(BLANK_FORM);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    const price = Number(form.price);
    if (!form.price || isNaN(price) || price <= 0) { setError('Enter a valid price.'); return; }
    setError('');
    onAdd({
      barcode: nextBarcode,
      name: form.name.trim(),
      price,
      uom: form.uom,
      category: form.category,
      isCustom: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-24 sm:pb-4">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-display font-bold text-foreground text-base">Add SNB Item</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Barcode #{nextBarcode} · SNB &amp; Hosur</p>
          </div>
          <button onClick={onClose} className="size-8 rounded-xl hover:bg-muted flex items-center justify-center transition">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Item Name *</label>
            <input
              type="text"
              placeholder="e.g. Cashew Barfi (200g)"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category *</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as SnbCategory }))}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {SNB_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Price + UOM row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Price (₹) *</label>
              <input
                type="number"
                placeholder="0"
                min={0}
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Unit</label>
              <div className="flex gap-1.5">
                {(['Nos', 'Kgs'] as const).map(u => (
                  <button
                    key={u}
                    onClick={() => setForm(f => ({ ...f, uom: u }))}
                    className={cn(
                      'px-3 py-2.5 rounded-xl border text-sm font-semibold transition',
                      form.uom === u
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">⚠ {error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Item Modal ─────────────────────────────────────────────────────────────
function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: (typeof SNB_ITEMS[0]) | CustomSnbItem;
  onClose: () => void;
  onSave: (barcode: number, updates: { name: string; price: number }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setError('Item name is required.'); return; }
    const p = Number(price);
    if (!price || isNaN(p) || p <= 0) { setError('Enter a valid price.'); return; }
    setError('');
    onSave(item.barcode, { name: name.trim(), price: p });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-24 sm:pb-4">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-display font-bold text-foreground text-base">Edit SNB Item</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Barcode #{item.barcode}</p>
          </div>
          <button onClick={onClose} className="size-8 rounded-xl hover:bg-muted flex items-center justify-center transition">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Item Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Price (₹) *</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} min={0}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {error && <p className="text-xs text-destructive flex items-center gap-1">⚠ {error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition">Save</button>
        </div>
      </div>
    </div>
  );
}


export default function SnbItemsTab() {
  const { stockMismatches, fetchStockMismatches } = useBranchStore();
  const { fetchOverrides, saveOverride, overrides } = useItemPriceStore();
  const { user } = useAuthStore();
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState<SnbCategory | 'All'>('All');
  const [mismatchExpanded, setMismatchExpanded] = useState(true);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [customItems, setCustomItems]     = useState<CustomSnbItem[]>([]);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [editTarget, setEditTarget]       = useState<(typeof SNB_ITEMS[0]) | CustomSnbItem | null>(null);
  // priceOverrides are read from itemPriceStore (Supabase-backed) — not local state

  useEffect(() => {
    fetchStockMismatches();
    fetchOverrides('SNB');
  }, []);

  const nextBarcode = useMemo(() => {
    const allBarcodes = [...SNB_ITEMS.map(i => i.barcode), ...customItems.map(i => i.barcode)];
    return Math.max(...allBarcodes) + 1;
  }, [customItems]);

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

  const snbOverrides = overrides['SNB'];
  const allItems = useMemo(() => [
    ...SNB_ITEMS.map(i => ({
      ...i,
      name:  snbOverrides[i.barcode]?.name  ?? i.name,
      price: snbOverrides[i.barcode]?.price ?? i.price,
    })),
    ...customItems,
  ], [customItems, snbOverrides]);

  const handleSaveEdit = async (barcode: number, updates: { name: string; price: number }) => {
    setSaveError(null);
    const existing = SNB_ITEMS.find(i => i.barcode === barcode);
    const oldPrice = snbOverrides[barcode]?.price ?? existing?.price ?? 0;
    const oldName  = snbOverrides[barcode]?.name  ?? existing?.name  ?? '';
    const updatedBy = user?.name ?? user?.email ?? 'Admin';

    const err = await saveOverride('SNB', barcode, updates.name, updates.price, updatedBy, oldPrice, oldName);
    if (err) {
      setSaveError(err);
    } else {
      setCustomItems(prev => prev.map(c => c.barcode === barcode ? { ...c, ...updates } : c));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((item) => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchQ   = !q || item.name.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [search, activeCategory, allItems]);

  return (
    <div className="space-y-4">

      {saveError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0 text-red-500" />
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="shrink-0"><X className="size-3.5" /></button>
        </div>
      )}

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
            {allItems.length} items · SNB &amp; Hosur branches · same price list
            {customItems.length > 0 && (
              <span className="ml-1.5 text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                +{customItems.length} added
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition"
          >
            <Plus className="size-3.5" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${allItems.length} items…`}
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
        {filtered.length === allItems.length
          ? `${allItems.length} items`
          : `${filtered.length} of ${allItems.length} items`}
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
              const isCustom = 'isCustom' in item;
              return (
                <div key={item.barcode}
                  className={cn('flex items-center gap-3 px-4 py-3', hasMismatch && 'bg-red-50/40', isCustom && 'bg-blue-50/30')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{item.name}</p>
                      {hasMismatch && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="size-2.5" /> Stock alert
                        </span>
                      )}
                      {isCustom && (
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                          New
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                      {fmt(item.price)}{item.uom === 'Kgs' ? '/kg' : ''}
                    </span>
                    <button
                      onClick={() => setEditTarget(item)}
                      className="size-7 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition"
                    >
                      <Pencil className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Item Modal ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={(item) => setCustomItems(prev => [...prev, item])}
          nextBarcode={nextBarcode}
        />
      )}
      {editTarget && (
        <EditItemModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
