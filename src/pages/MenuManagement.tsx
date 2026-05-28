import { useState, useMemo, useRef, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import {
  Search, X, Camera, ToggleLeft, ToggleRight, ImageOff,
  Edit3, Check, Plus, ChevronDown, Loader2,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import CategoryFilter from '@/components/features/CategoryFilter';
import { MENU_CATEGORIES } from '@/constants/config';
import EmptyState from '@/components/ui/EmptyState';

// ─── Add Item Sheet ──────────────────────────────────────────────────────────
function AddItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addItem } = useMenuStore();

  const [name,     setName]     = useState('');
  const [price,    setPrice]    = useState('');
  const [category, setCategory] = useState(MENU_CATEGORIES[0].id);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Reset form when opened
  useEffect(() => {
    if (open) { setName(''); setPrice(''); setCategory(MENU_CATEGORIES[0].id); setError(null); }
  }, [open]);

  const selectedCat = MENU_CATEGORIES.find(c => c.id === category)!;

  const handleSave = async () => {
    const trimmedName = name.trim();
    const parsedPrice = parseInt(price);

    if (!trimmedName)          return setError('Item name is required.');
    if (!parsedPrice || parsedPrice <= 0) return setError('Enter a valid price.');

    setSaving(true);
    setError(null);

    const err = await addItem({
      name:     trimmedName,
      price:    parsedPrice,
      category: category,
      timing:   selectedCat.timing,
    });

    setSaving(false);
    if (err) { setError(err); return; }
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl safe-area-inset-bottom animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-foreground">Add New Item</h2>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-8 space-y-4">

          {/* Item Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Item Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Masala Dosa"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Price (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
              <input
                type="number"
                min={1}
                placeholder="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Category *
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40 pr-8"
              >
                {MENU_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
            {/* Timing preview */}
            <p className="text-[11px] text-muted-foreground pl-1">
              ⏰ Available: {selectedCat.timing}
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {saving
              ? <><Loader2 className="size-4 animate-spin" /> Adding…</>
              : <><Plus className="size-4" /> Add to Menu</>
            }
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MenuManagement({ embedded = false }: { embedded?: boolean }) {
  const { items, toggleItem, updateItem, setItemImage, loadMenu } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search,           setSearch]           = useState('');
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [editPrice,        setEditPrice]        = useState('');
  const [showAddSheet,     setShowAddSheet]     = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (selectedCategory !== 'all') list = list.filter(i => i.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCategory, search]);

  const categoryName = (catId: string) =>
    MENU_CATEGORIES.find(c => c.id === catId)?.name || catId;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadTarget) {
      const reader = new FileReader();
      reader.onloadend = () => { setItemImage(uploadTarget, reader.result as string); setUploadTarget(null); };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEditPrice = (id: string, currentPrice: number) => {
    setEditingId(id); setEditPrice(String(currentPrice));
  };

  const savePrice = (id: string) => {
    const val = parseInt(editPrice);
    if (!isNaN(val) && val > 0) updateItem(id, { price: val });
    setEditingId(null); setEditPrice('');
  };

  const enabledCount  = items.filter(i => i.enabled).length;
  const disabledCount = items.filter(i => !i.enabled).length;

  return (
    <div className={cn(embedded ? 'pb-4' : 'min-h-screen bg-background pt-14 pb-24')}>

      {/* Stats row */}
      <div className="px-4 pt-4 pb-2 flex gap-3">
        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-emerald-700 tabular-nums">{enabledCount}</p>
          <p className="text-[10px] font-body font-semibold text-emerald-600 uppercase">Active</p>
        </div>
        <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-red-700 tabular-nums">{disabledCount}</p>
          <p className="text-[10px] font-body font-semibold text-red-600 uppercase">Disabled</p>
        </div>
        <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-foreground tabular-nums">{items.length}</p>
          <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Total</p>
        </div>
      </div>

      {/* Sticky search + filters */}
      <div className={cn(embedded ? 'mb-2' : 'sticky top-14 z-30 bg-background border-b border-border')}>
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Add Item button */}
          <button
            onClick={() => setShowAddSheet(true)}
            className="shrink-0 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            aria-label="Add new menu item"
          >
            <Plus className="size-4" />
            Add
          </button>
        </div>
        <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} showAll />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Item list */}
      <div className="px-4 py-4 space-y-2">
        {filtered.length === 0 && (
          <EmptyState
            icon="🍽️"
            message="No items found"
            sub={search || selectedCategory !== 'all' ? 'Try a different category or clear your search' : 'Add your first menu item to get started'}
            cta={search || selectedCategory !== 'all' ? 'Clear filters' : 'Add item'}
            onCta={search || selectedCategory !== 'all'
              ? () => { setSearch(''); setSelectedCategory('all'); }
              : () => setShowAddSheet(true)
            }
          />
        )}

        {filtered.map(item => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 bg-card rounded-xl border p-3 transition-opacity',
              item.enabled ? 'border-border' : 'border-red-200 opacity-60',
            )}
          >
            {/* Image */}
            <button
              onClick={() => { setUploadTarget(item.id); fileInputRef.current?.click(); }}
              className="relative size-14 rounded-lg bg-muted shrink-0 overflow-hidden group"
              aria-label="Upload image"
            >
              {item.imageUrl
                ? <img src={item.imageUrl} alt="" className="size-full object-cover" />
                : <div className="size-full flex items-center justify-center text-muted-foreground/40"><ImageOff className="size-5" /></div>
              }
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity">
                <Camera className="size-5 text-white" />
              </div>
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
              <p className="text-[10px] font-body text-muted-foreground">{categoryName(item.category)}</p>
              <div className="mt-1 flex items-center gap-2">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">₹</span>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      className="w-16 px-1.5 py-0.5 border border-border rounded text-sm font-body tabular-nums"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && savePrice(item.id)}
                    />
                    <button
                      onClick={() => savePrice(item.id)}
                      className="size-6 rounded bg-primary text-primary-foreground flex items-center justify-center"
                      aria-label="Save price"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEditPrice(item.id, item.price)}
                    className="flex items-center gap-1 text-sm font-body font-bold text-accent-foreground bg-accent/20 px-2 py-0.5 rounded-md tabular-nums active:scale-95"
                  >
                    {formatCurrency(item.price)}<Edit3 className="size-3 ml-0.5 opacity-50" />
                  </button>
                )}
              </div>
            </div>

            {/* Toggle */}
            <button
              onClick={() => toggleItem(item.id)}
              className="shrink-0 active:scale-90 transition-transform"
              aria-label={item.enabled ? 'Disable item' : 'Enable item'}
            >
              {item.enabled
                ? <ToggleRight className="size-8 text-primary" />
                : <ToggleLeft  className="size-8 text-muted-foreground" />
              }
            </button>
          </div>
        ))}
      </div>

      {/* Add Item sheet */}
      <AddItemSheet open={showAddSheet} onClose={() => setShowAddSheet(false)} />
    </div>
  );
}
