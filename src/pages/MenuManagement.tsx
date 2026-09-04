import { useState, useMemo, useRef, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import {
  Search, X, Camera, ToggleLeft, ToggleRight, ImageOff,
  Edit3, Check, Plus, ChevronDown, Loader2, Tag, Pencil, RefreshCw,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import CategoryFilter from '@/components/features/CategoryFilter';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { useMenuCategoryStore, type MenuCategory } from '@/stores/menuCategoryStore';
import { useAuthStore } from '@/stores/authStore';
import EmptyState from '@/components/ui/EmptyState';

// EGRESS FIX (2026-09-03): menu item photos used to go straight from
// FileReader.readAsDataURL() into menu_items.image_url as raw, full-
// resolution base64 — every menu_items row with a photo then re-transmitted
// that full file on EVERY loadMenu() call (every customer's QR menu, every
// staff dashboard, every realtime patch), forever. Two independent fixes:
// (1) resize/compress here before upload so the file itself is small,
// (2) upload to Supabase Storage (see uploadMenuItemImage) so image_url is a
// short CDN URL instead of the image data itself, only fetched by an actual
// <img> render, never inline with unrelated menu queries.
async function resizeImageToJpegBlob(file: File, maxDim = 800, quality = 0.82): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That file could not be read as an image.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image resizing is not supported in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

async function uploadMenuItemImage(itemId: string, file: File): Promise<string> {
  const blob = await resizeImageToJpegBlob(file);
  const path = `${itemId}-${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage.from('menu-item-images').upload(path, blob, {
    cacheControl: '31536000', // 1 year — the path is unique per upload, so a stale cache is never served
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  const { data } = supabase.storage.from('menu-item-images').getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Could not get a URL for the uploaded image.');
  return data.publicUrl;
}

// ─── Manage Categories Sheet ─────────────────────────────────────────────────
// FEATURE (2026-08-10): "allow the VRSNB Admin and Admin to add a new
// category and edit the category this should sync with Admin if VRSNB Admin
// makes changes and vice versa" — categories used to be a hardcoded array,
// so nobody could add one at all. This is rendered from the same
// MenuManagement component both Admin's own "Menu Studio" and VRSNB Admin's
// "Items → Cafe Items" screen use, backed by the same `menu_categories`
// table with realtime sync — so a category added here shows up in the other
// dashboard within seconds, no separate wiring needed per dashboard.
function ManageCategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useMenuCategories();
  const { addCategory, updateCategory } = useMenuCategoryStore();
  const { currentUser } = useAuthStore();
  const updatedBy = currentUser?.displayName || currentUser?.username || 'Admin';

  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🍽️');
  const [newTiming, setNewTiming] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editTiming, setEditTiming] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setNewName(''); setNewIcon('🍽️'); setNewTiming(''); setAddError(null); setEditing(null); }
  }, [open]);

  const startEdit = (cat: MenuCategory) => {
    setEditing(cat); setEditName(cat.name); setEditIcon(cat.icon); setEditTiming(cat.timing); setEditError(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) { setAddError('Category name is required.'); return; }
    setAdding(true); setAddError(null);
    const { error } = await addCategory({ name: newName.trim(), icon: newIcon.trim() || '🍽️', timing: newTiming.trim() }, updatedBy);
    setAdding(false);
    if (error) { setAddError(error); return; }
    setNewName(''); setNewIcon('🍽️'); setNewTiming('');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) { setEditError('Category name is required.'); return; }
    setSavingEdit(true); setEditError(null);
    const error = await updateCategory(editing.id, { name: editName.trim(), icon: editIcon.trim() || '🍽️', timing: editTiming.trim() }, updatedBy);
    setSavingEdit(false);
    if (error) { setEditError(error); return; }
    setEditing(null);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl safe-area-inset-bottom animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-1.5"><Tag className="size-4" />Manage Categories</h2>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground"><X className="size-4" /></button>
        </div>

        <div className="px-4 pb-8 space-y-4">
          {/* Add new category */}
          <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add a new category</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Icon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)}
                className="w-14 px-2 py-2.5 rounded-xl border border-border bg-card text-center text-lg" maxLength={4} />
              <input type="text" placeholder="Category name (e.g. Desserts)" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body" />
            </div>
            <input type="text" placeholder="Available timing (e.g. 3PM - 10PM)" value={newTiming} onChange={(e) => setNewTiming(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body" />
            {addError && <p className="text-xs text-destructive font-medium bg-destructive/10 rounded-lg px-3 py-2">{addError}</p>}
            <button onClick={handleAdd} disabled={adding}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all">
              {adding ? <><Loader2 className="size-4 animate-spin" />Adding…</> : <><Plus className="size-4" />Add Category</>}
            </button>
          </div>

          {/* Existing categories */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Existing categories ({categories.length})</p>
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-xl border border-border bg-card p-2.5">
                {editing?.id === cat.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input type="text" value={editIcon} onChange={(e) => setEditIcon(e.target.value)}
                        className="w-14 px-2 py-2 rounded-lg border border-border bg-background text-center text-lg" maxLength={4} />
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm font-body" autoFocus />
                    </div>
                    <input type="text" value={editTiming} onChange={(e) => setEditTiming(e.target.value)}
                      placeholder="Available timing" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-body" />
                    {editError && <p className="text-xs text-destructive font-medium bg-destructive/10 rounded-lg px-3 py-2">{editError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} disabled={savingEdit}
                        className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                        {savingEdit ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Save
                      </button>
                      <button onClick={() => setEditing(null)} disabled={savingEdit}
                        className="flex-1 h-9 rounded-lg bg-muted text-muted-foreground text-sm font-semibold flex items-center justify-center gap-1.5">
                        <X className="size-3.5" />Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl shrink-0">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{cat.name}</p>
                      {cat.timing && <p className="text-[10px] text-muted-foreground">{cat.timing}</p>}
                    </div>
                    <button onClick={() => startEdit(cat)} className="shrink-0 size-8 rounded-lg bg-muted flex items-center justify-center" aria-label={`Edit ${cat.name}`}>
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Add Item Sheet ──────────────────────────────────────────────────────────
function AddItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addItem } = useMenuStore();
  const menuCategories = useMenuCategories();

  const [name,     setName]     = useState('');
  const [price,    setPrice]    = useState('');
  const [category, setCategory] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Reset form when opened
  useEffect(() => {
    if (open) { setName(''); setPrice(''); setCategory(menuCategories[0]?.id ?? ''); setError(null); }
  }, [open, menuCategories]);

  const selectedCat = menuCategories.find(c => c.id === category);

  const handleSave = async () => {
    const trimmedName = name.trim();
    // AUDIT FIX (2026-09-02): parseInt() silently truncated any paise/decimal
    // amount (e.g. "45.50" -> 45) instead of rejecting or rounding it.
    const parsedPrice = Math.round(parseFloat(price) * 100) / 100;

    if (!trimmedName)          return setError('Item name is required.');
    if (!parsedPrice || parsedPrice <= 0) return setError('Enter a valid price.');
    if (!category)             return setError('Select a category.');

    setSaving(true);
    setError(null);

    const err = await addItem({
      name:     trimmedName,
      price:    parsedPrice,
      category: category,
      timing:   selectedCat?.timing ?? '',
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
        className="fixed inset-0 z-40 bg-black/55"
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
                {menuCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
            {/* Timing preview */}
            {selectedCat?.timing && (
              <p className="text-[11px] text-muted-foreground pl-1">
                ⏰ Available: {selectedCat.timing}
              </p>
            )}
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
  const [savingPrice,      setSavingPrice]      = useState(false);
  const [priceError,       setPriceError]       = useState<string | null>(null);
  const [showAddSheet,     setShowAddSheet]     = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const menuCategories = useMenuCategories();

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await loadMenu(true); } finally { setRefreshing(false); }
  };

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
    menuCategories.find(c => c.id === catId)?.name || catId;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTarget;
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadTarget(null);
    if (!file || !target) return;
    setUploadingImageFor(target);
    setImageUploadError(null);
    try {
      const url = await uploadMenuItemImage(target, file);
      await setItemImage(target, url);
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingImageFor(null);
    }
  };

  const startEditPrice = (id: string, currentPrice: number) => {
    setEditingId(id); setEditPrice(String(currentPrice)); setPriceError(null);
  };

  const savePrice = async (id: string) => {
    // AUDIT FIX (2026-09-02): same fix as handleSave above — parseInt()
    // silently truncated paise.
    const val = Math.round(parseFloat(editPrice) * 100) / 100;
    if (isNaN(val) || val <= 0) { setPriceError('Enter a valid price.'); return; }
    setSavingPrice(true);
    setPriceError(null);
    try {
      await updateItem(id, { price: val });
      setEditingId(null);
      setEditPrice('');
    } catch (err: unknown) {
      setPriceError(err instanceof Error ? err.message : 'Failed to save price.');
    } finally {
      setSavingPrice(false);
    }
  };

  const enabledCount  = items.filter(i => i.enabled).length;
  const disabledCount = items.filter(i => !i.enabled).length;

  return (
    <div className={cn(embedded ? 'pb-4' : 'dashboard-screen min-h-screen bg-transparent pt-0 pb-6')}>

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

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 size-10 rounded-xl bg-muted text-foreground flex items-center justify-center active:scale-95 transition-all border border-border disabled:opacity-60"
            aria-label="Refresh menu"
            title="Refresh menu"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>
          {/* Manage Categories button */}
          <button
            onClick={() => setShowCategorySheet(true)}
            className="shrink-0 h-10 px-3 rounded-xl bg-muted text-foreground text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-all border border-border"
            aria-label="Manage categories"
          >
            <Tag className="size-4" />
            Categories
          </button>
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
        {imageUploadError && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
            <span>{imageUploadError}</span>
            <button onClick={() => setImageUploadError(null)} className="shrink-0"><X className="size-3.5" /></button>
          </div>
        )}
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
              disabled={uploadingImageFor === item.id}
              className="relative size-14 rounded-lg bg-muted shrink-0 overflow-hidden group disabled:opacity-70"
              aria-label="Upload image"
            >
              {item.imageUrl
                ? <img src={item.imageUrl} alt="" className="size-full object-cover" />
                : <div className="size-full flex items-center justify-center text-muted-foreground/40"><ImageOff className="size-5" /></div>
              }
              {uploadingImageFor === item.id ? (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-white" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity">
                  <Camera className="size-5 text-white" />
                </div>
              )}
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
              <p className="text-[10px] font-body text-muted-foreground">{categoryName(item.category)}</p>
              <div className="mt-1 flex items-center gap-2">
                {editingId === item.id ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">₹</span>
                      <input
                        type="number"
                        value={editPrice}
                        onChange={e => { setEditPrice(e.target.value); setPriceError(null); }}
                        className="w-16 px-1.5 py-0.5 border border-border rounded text-sm font-body tabular-nums"
                        autoFocus
                        disabled={savingPrice}
                        onKeyDown={e => e.key === 'Enter' && savePrice(item.id)}
                      />
                      <button
                        onClick={() => savePrice(item.id)}
                        disabled={savingPrice}
                        className="size-6 rounded bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                        aria-label="Save price"
                      >
                        {savingPrice ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditPrice(''); setPriceError(null); }}
                        disabled={savingPrice}
                        className="size-6 rounded bg-muted text-muted-foreground flex items-center justify-center"
                        aria-label="Cancel"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    {priceError && (
                      <p className="text-[10px] text-destructive font-medium pl-4">{priceError}</p>
                    )}
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
      {/* Manage Categories sheet */}
      <ManageCategoriesSheet open={showCategorySheet} onClose={() => setShowCategorySheet(false)} />
    </div>
  );
}
