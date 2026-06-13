// src/components/admin/SnbItemsTab.tsx
// Admin → Items → Bakery → SNB Items
// Shows all SNB price-list items for admin item management.

import { useEffect, useState, useMemo } from 'react';
import { AlertCircle, Search, X, Scale, Hash, Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/branch/branchStore';
import { useItemPriceStore } from '@/stores/itemPriceStore';
import { useAuthStore } from '@/stores/authStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '@/branch/snbItems';
import type { SnbCategory } from '@/branch/snbItems';

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const normal = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
            <p className="text-[10px] text-muted-foreground mt-0.5">Barcode #{nextBarcode}</p>
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
  const { stock, fetchBranchData } = useBranchStore();
  const { fetchOverrides, saveOverride, overrides } = useItemPriceStore();
  const { currentUser: user } = useAuthStore();
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState<SnbCategory | 'All'>('All');
  const [showAddModal, setShowAddModal]   = useState(false);
  const [customItems, setCustomItems]     = useState<CustomSnbItem[]>([]);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [editTarget, setEditTarget]       = useState<(typeof SNB_ITEMS[0]) | CustomSnbItem | null>(null);
  // priceOverrides are read from itemPriceStore (Supabase-backed) — not local state

  useEffect(() => {
    fetchOverrides('SNB');
    fetchBranchData('SNB');
  }, []);

  const nextBarcode = useMemo(() => {
    const allBarcodes = [...SNB_ITEMS.map(i => i.barcode), ...customItems.map(i => i.barcode)];
    return Math.max(...allBarcodes) + 1;
  }, [customItems]);

  const snbOverrides = overrides['SNB'];
  const allItems = useMemo(() => [
    ...SNB_ITEMS.map(i => ({
      ...i,
      name:  snbOverrides[i.barcode]?.name  ?? i.name,
      price: snbOverrides[i.barcode]?.price ?? i.price,
    })),
    ...customItems,
  ], [customItems, snbOverrides]);

  const stockStatus = useMemo(() => {
    const branches = ['SNB'] as const;
    const map = new Map<string, {
      totalQty: number;
      minLevel: number;
      missingBranches: string[];
      lowBranches: string[];
      outBranches: string[];
      unit: string;
      lastUpdated: string;
    }>();

    allItems.forEach((item) => {
      const rows = branches.map((branch) => ({
        branch,
        row: stock[branch]?.find((s) => normal(s.itemName) === normal(item.name)),
      }));
      const totalQty = rows.reduce((sum, entry) => sum + Number(entry.row?.quantity ?? 0), 0);
      const minLevel = rows.reduce((sum, entry) => sum + Number(entry.row?.minThreshold ?? 0), 0);
      const missingBranches = rows.filter((entry) => !entry.row).map((entry) => entry.branch);
      const outBranches = rows.filter((entry) => entry.row && Number(entry.row.quantity) <= 0).map((entry) => entry.branch);
      const lowBranches = rows.filter((entry) => {
        const qty = Number(entry.row?.quantity ?? 0);
        const min = Number(entry.row?.minThreshold ?? 0);
        return entry.row && qty > 0 && min > 0 && qty <= min;
      }).map((entry) => entry.branch);
      map.set(item.name, {
        totalQty,
        minLevel,
        missingBranches,
        lowBranches,
        outBranches,
        unit: item.uom === 'Kgs' ? 'kg' : 'pcs',
        lastUpdated: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      });
    });
    return map;
  }, [allItems, stock]);

  const alertCounts = useMemo(() => {
    let missing = 0, out = 0, low = 0, available = 0;
    stockStatus.forEach((s) => {
      if (s.missingBranches.length) missing += 1;
      else if (s.totalQty <= 0 || s.outBranches.length) out += 1;
      else if (s.lowBranches.length || (s.minLevel > 0 && s.totalQty <= s.minLevel)) low += 1;
      else available += 1;
    });
    return { missing, out, low, available };
  }, [stockStatus]);

  const handleSaveEdit = async (barcode: number, updates: { name: string; price: number }) => {
    setSaveError(null);
    const existing = SNB_ITEMS.find(i => i.barcode === barcode);
    const oldPrice = snbOverrides[barcode]?.price ?? existing?.price ?? 0;
    const oldName  = snbOverrides[barcode]?.name  ?? existing?.name  ?? '';
    const updatedBy = user?.displayName ?? user?.username ?? 'Admin';

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

      <div className="hidden">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-bold uppercase text-emerald-700">Available</p>
          <p className="text-xl font-bold text-emerald-800 tabular-nums">{alertCounts.available}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-bold uppercase text-amber-700">Low Stock</p>
          <p className="text-xl font-bold text-amber-800 tabular-nums">{alertCounts.low}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-[10px] font-bold uppercase text-red-700">Out of Stock</p>
          <p className="text-xl font-bold text-red-800 tabular-nums">{alertCounts.out}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase text-slate-600">Stock Missing</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{alertCounts.missing}</p>
        </div>
      </div>

      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {allItems.length} items
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
              const status = stockStatus.get(item.name);
              const isMissing = Boolean(status?.missingBranches.length);
              const isOut = !isMissing && Boolean((status?.totalQty ?? 0) <= 0 || status?.outBranches.length);
              const isLow = !isMissing && !isOut && Boolean(status?.lowBranches.length || ((status?.minLevel ?? 0) > 0 && (status?.totalQty ?? 0) <= (status?.minLevel ?? 0)));
              const isCustom = 'isCustom' in item;
              return (
                <div key={item.barcode}
                  className={cn('flex items-center gap-3 px-4 py-3', (isOut || isMissing) && 'bg-red-50/40', isLow && 'bg-amber-50/40', isCustom && 'bg-blue-50/30')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{item.name}</p>
                      {isMissing && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-full">
                          Stock Not Available
                        </span>
                      )}
                      {isOut && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
                          Out of Stock
                        </span>
                      )}
                      {isLow && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                          Low Stock
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
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                      <span>Stock: <b className={cn(isOut || isMissing ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-700')}>{status ? `${status.totalQty} ${status.unit}` : 'Not available'}</b></span>
                      {status && status.minLevel > 0 && <span>Min: {status.minLevel} {status.unit}</span>}
                      {status?.missingBranches.length ? <span>Missing: {status.missingBranches.join(', ')}</span> : null}
                      {status?.lowBranches.length ? <span>Low: {status.lowBranches.join(', ')}</span> : null}
                      {status?.outBranches.length ? <span>Out: {status.outBranches.join(', ')}</span> : null}
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
