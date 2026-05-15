// src/bakery/BakeryItemManagement.tsx
//
// Unified Items management page for admin.
// Accessible at /bakery/items
//
// ── Cafe toggle   → full cafe menu management (MenuManagement UI)
// ── Bakery toggle → two sub-tabs:
//      • Items            (bakery item list, add/edit/delete/toggle)
//      • Recipe management (RecipeManagement UI)
//
import { useState, useEffect, useMemo } from 'react';
import {
  Settings2, Plus, Trash2, Pencil, Check, X,
  ToggleLeft, ToggleRight, Loader2, Search,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { useBakeryItemsStore, BAKERY_CATEGORIES } from './bakeryItemsStore';
import type { BakeryItem } from './bakeryItemsStore';
import { cn } from '@/lib/utils';

// ── Lazy-import the two sibling pages so this file stays self-contained ────────
import MenuManagement   from '@/pages/MenuManagement';
import RecipeManagement from './RecipeManagement';

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { emoji: string; color: string; bg: string }> = {
  Sweets:    { emoji: '🍬', color: 'text-pink-700',   bg: 'bg-pink-50 border-pink-200'   },
  Savouries: { emoji: '🥜', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  Bakery:    { emoji: '🍞', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'  },
  Cookies:   { emoji: '🍪', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
};

const DEFAULT_ICONS: Record<string, string> = {
  Sweets: '🍬', Savouries: '🥜', Bakery: '🍞', Cookies: '🍪',
};

// ── sub-components (bakery items UI) ──────────────────────────────────────────

function ItemRow({
  item, onToggle, onEdit, onDelete,
}: {
  item: BakeryItem;
  onToggle: (id: string) => void;
  onEdit:   (item: BakeryItem) => void;
  onDelete: (item: BakeryItem) => void;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2.5 transition-colors',
      !item.enabled && 'opacity-50 bg-muted/30',
    )}>
      <span className="text-base w-6 text-center shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-body font-semibold truncate',
          item.enabled ? 'text-foreground' : 'text-muted-foreground line-through',
        )}>
          {item.name}
        </p>
        <p className="text-[10px] font-body text-muted-foreground">
          {item.price != null
            ? <span className="text-emerald-600 font-semibold">₹{item.price}</span>
            : <span className="text-amber-500 font-medium">⚠ Price not set</span>
          }
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onToggle(item.id)}
          className={cn(
            'size-8 rounded-lg flex items-center justify-center transition-colors active:scale-95',
            item.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-muted',
          )}
          title={item.enabled ? 'Disable item' : 'Enable item'}
        >
          {item.enabled ? <ToggleRight className="size-5" /> : <ToggleLeft className="size-5" />}
        </button>
        <button
          onClick={() => onEdit(item)}
          className="size-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors active:scale-95"
          title="Edit item"
        >
          <Pencil className="size-4" />
        </button>
        <button
          onClick={() => onDelete(item)}
          className="size-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors active:scale-95"
          title="Delete item"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function EditSheet({
  item, onSave, onSavePrice, onClose,
}: {
  item: BakeryItem;
  onSave: (id: string, updates: { name?: string; icon?: string; category?: string }) => Promise<string | null>;
  onSavePrice: (id: string, price: number | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name,     setName]     = useState(item.name);
  const [icon,     setIcon]     = useState(item.icon);
  const [category, setCategory] = useState(item.category);
  const [priceStr, setPriceStr] = useState(item.price != null ? String(item.price) : '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const dirty = name !== item.name || icon !== item.icon || category !== item.category
    || priceStr !== (item.price != null ? String(item.price) : '');

  const handleSave = async () => {
    setSaving(true); setError(null);
    const priceVal = priceStr.trim() === '' ? null : Number(priceStr);
    if (priceStr.trim() !== '' && (isNaN(priceVal!) || priceVal! <= 0)) {
      setError('Enter a valid price greater than 0, or leave blank.');
      setSaving(false); return;
    }
    const err = await onSave(item.id, {
      name:     name     !== item.name     ? name     : undefined,
      icon:     icon     !== item.icon     ? icon     : undefined,
      category: category !== item.category ? category : undefined,
    });
    if (err) { setError(err); setSaving(false); return; }
    const currentPrice = item.price != null ? String(item.price) : '';
    if (priceStr !== currentPrice) {
      const priceErr = await onSavePrice(item.id, priceVal);
      if (priceErr) { setError(priceErr); setSaving(false); return; }
    }
    setSaving(false); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-2xl border-t border-border p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-foreground">Edit Item</h3>
          <button onClick={onClose} className="size-8 rounded-full bg-muted flex items-center justify-center"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Icon Emoji</label>
            <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4} className="w-20 h-10 text-center text-xl rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
              {BAKERY_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c]?.emoji} {c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Selling Price (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">₹</span>
              <input type="number" min={1} value={priceStr} onChange={e => setPriceStr(e.target.value)} placeholder="e.g. 30" className="w-full h-10 pl-7 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Leave blank if price is not yet decided.</p>
          </div>
        </div>
        {error && <p className="text-xs font-body text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-body font-semibold text-muted-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving || !dirty || !name.trim()} className="flex-1 h-10 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ item, onConfirm, onClose, error }: { item: BakeryItem; onConfirm: () => void; onClose: () => void; error?: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-background rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Delete Item?</h3>
            <p className="text-sm font-body text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{item.icon} {item.name}</span> will be permanently removed.
            </p>
          </div>
        </div>
        {error && <p className="text-xs font-body text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-body font-semibold">Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-body font-bold active:scale-95 transition">Delete</button>
        </div>
      </div>
    </div>
  );
}

function AddItemSheet({ onClose }: { onClose: () => void }) {
  const { addItem } = useBakeryItemsStore();
  const [name,     setName]     = useState('');
  const [category, setCategory] = useState<string>(BAKERY_CATEGORIES[0]);
  const [icon,     setIcon]     = useState(DEFAULT_ICONS[BAKERY_CATEGORIES[0]]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleCategoryChange = (cat: string) => { setCategory(cat); setIcon(DEFAULT_ICONS[cat] || '🍬'); };

  const handleAdd = async () => {
    setSaving(true); setError(null);
    const err = await addItem({ name, category, icon });
    setSaving(false);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-2xl border-t border-border p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-foreground">Add New Item</h3>
          <button onClick={onClose} className="size-8 rounded-full bg-muted flex items-center justify-center"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Category</label>
            <select value={category} onChange={e => handleCategoryChange(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
              {BAKERY_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c]?.emoji} {c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Icon Emoji</label>
            <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4} className="w-20 h-10 text-center text-xl rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 block">Item Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cashew Katli" className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        {error && <p className="text-xs font-body text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-body font-semibold text-muted-foreground">Cancel</button>
          <button onClick={handleAdd} disabled={saving || !name.trim()} className="flex-1 h-10 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

function CategorySection({ category, items, onToggle, onEdit, onDelete }: {
  category: string; items: BakeryItem[];
  onToggle: (id: string) => void; onEdit: (item: BakeryItem) => void; onDelete: (item: BakeryItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = CATEGORY_META[category] ?? { emoji: '📦', color: 'text-foreground', bg: 'bg-muted' };
  const enabledCount = items.filter(i => i.enabled).length;
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-body font-bold px-2 py-0.5 rounded-full border', meta.bg, meta.color)}>
            {meta.emoji} {category}
          </span>
          <span className="text-[10px] font-body text-muted-foreground">{enabledCount}/{items.length} active</span>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border/40">
          {items.map(item => (
            <ItemRow key={item.id} item={item} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {items.length === 0 && (
            <p className="text-center text-sm font-body text-muted-foreground py-6">No items in this category.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bakery Items inner panel ───────────────────────────────────────────────────

function BakeryItemsPanel() {
  const { items, loading, loadAllItems, toggleItem, updateItem, updatePrice, deleteItem } = useBakeryItemsStore();
  const [search,       setSearch]       = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<BakeryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BakeryItem | null>(null);
  const [showDisabled, setShowDisabled] = useState(true);
  const [deleteError,  setDeleteError]  = useState<string | null>(null);

  useEffect(() => { loadAllItems(); }, [loadAllItems]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(item => {
      if (!showDisabled && !item.enabled) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [items, search, showDisabled]);

  const byCategory = useMemo(() => {
    const map: Record<string, BakeryItem[]> = {};
    BAKERY_CATEGORIES.forEach(c => { map[c] = []; });
    filtered.forEach(item => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, [filtered]);

  const totalEnabled  = items.filter(i => i.enabled).length;
  const totalDisabled = items.filter(i => !i.enabled).length;
  const unpricedCount = items.filter(i => i.enabled && i.price == null).length;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteItem(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteError('Failed to delete — please try again.');
    }
  };

  return (
    <div className="pb-4">
      {/* header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-body text-muted-foreground">Manage the item list shown to order receivers</p>
        <button
          onClick={() => setShowAdd(true)}
          className="h-9 px-4 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition"
        >
          <Plus className="size-4" /> Add
        </button>
      </div>

      {/* summary pills */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display font-bold text-xl text-primary tabular-nums">{items.length}</p>
          <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase mt-0.5">Total</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display font-bold text-xl text-emerald-600 tabular-nums">{totalEnabled}</p>
          <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase mt-0.5">Active</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display font-bold text-xl text-muted-foreground tabular-nums">{totalDisabled}</p>
          <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase mt-0.5">Disabled</p>
        </div>
      </div>

      {unpricedCount > 0 && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">
            <span className="font-bold">{unpricedCount} active item{unpricedCount > 1 ? 's' : ''}</span> {unpricedCount > 1 ? 'have' : 'has'} no price set.
          </p>
        </div>
      )}

      {/* search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button
          onClick={() => setShowDisabled(v => !v)}
          className={cn('h-10 px-3 rounded-xl border text-xs font-body font-semibold transition', showDisabled ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border text-muted-foreground')}
        >
          {showDisabled ? 'All' : 'Active only'}
        </button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}

      {!loading && (
        <div className="space-y-3">
          {BAKERY_CATEGORIES.map(cat => {
            const catItems = byCategory[cat] ?? [];
            if (catItems.length === 0 && search) return null;
            return (
              <CategorySection key={cat} category={cat} items={catItems} onToggle={toggleItem} onEdit={setEditTarget} onDelete={setDeleteTarget} />
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12"><p className="text-sm font-body text-muted-foreground">No items match your search.</p></div>
          )}
        </div>
      )}

      {showAdd && <AddItemSheet onClose={() => setShowAdd(false)} />}
      {editTarget && <EditSheet item={editTarget} onSave={updateItem} onSavePrice={updatePrice} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteDialog item={deleteTarget} onConfirm={handleDelete} onClose={() => { setDeleteTarget(null); setDeleteError(null); }} error={deleteError} />}
    </div>
  );
}

// ── Bakery section: Items + SNB Items + Recipe management sub-tabs ─────────────

import SnbItemsTab from '@/components/admin/SnbItemsTab';
import VrsnbItemsTab from '@/components/admin/VrsnbItemsTab';

function BakerySection() {
  const [subTab, setSubTab] = useState<'items' | 'snb' | 'vrsnb' | 'recipes'>('items');

  const SUBTABS = [
    { id: 'items'   as const, label: 'Items' },
    { id: 'snb'     as const, label: 'SNB items' },
    { id: 'vrsnb'   as const, label: 'VRSNB items' },
    { id: 'recipes' as const, label: 'Recipe management' },
  ];

  return (
    <div>
      {/* sub-tabs */}
      <div className="flex gap-1.5 p-1 rounded-2xl mb-5" style={{ background: 'hsl(var(--muted))' }}>
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              'flex-1 py-2 rounded-xl text-sm font-body font-semibold transition-all duration-200',
              subTab === t.id ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.id === 'snb' && (
              <span className="ml-1.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">196</span>
            )}
            {t.id === 'vrsnb' && (
              <span className="ml-1.5 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">199</span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'items'   && <BakeryItemsPanel />}
      {subTab === 'snb'     && <SnbItemsTab />}
      {subTab === 'vrsnb'   && <VrsnbItemsTab />}
      {subTab === 'recipes' && <RecipeManagement />}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function BakeryItemManagement() {
  const [mode, setMode] = useState<'cafe' | 'bakery'>('cafe');

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      {/* page header */}
      <div className="pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="size-6 text-primary" /> Items
        </h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">
          Manage cafe menu items and bakery items & recipes
        </p>
      </div>

      {/* Cafe / Bakery toggle */}
      <div className="flex gap-1.5 p-1 rounded-2xl mb-5" style={{ background: 'hsl(var(--muted))' }}>
        <button
          onClick={() => setMode('cafe')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'cafe' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          ☕ Cafe
        </button>
        <button
          onClick={() => setMode('bakery')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            mode === 'bakery' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          🥐 Bakery
        </button>
      </div>

      {/* Content */}
      {mode === 'cafe'   && <MenuManagement embedded />}
      {mode === 'bakery' && <BakerySection />}
    </div>
  );
}
