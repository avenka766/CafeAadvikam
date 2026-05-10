import { useState, useMemo, useRef, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { Search, X, Camera, ToggleLeft, ToggleRight, ImageOff, Edit3, Check } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import CategoryFilter from '@/components/features/CategoryFilter';
import { MENU_CATEGORIES } from '@/constants/config';

export default function MenuManagement() {
  const { items, toggleItem, updateItem, setItemImage, loadMenu } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (selectedCategory !== 'all') list = list.filter((item) => item.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCategory, search]);

  const categoryName = (catId: string) => MENU_CATEGORIES.find((c) => c.id === catId)?.name || catId;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadTarget) {
      const reader = new FileReader();
      reader.onloadend = () => { setItemImage(uploadTarget, reader.result as string); setUploadTarget(null); };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEditPrice = (id: string, currentPrice: number) => { setEditingId(id); setEditPrice(String(currentPrice)); };

  const savePrice = (id: string) => {
    const val = parseInt(editPrice);
    if (!isNaN(val) && val > 0) updateItem(id, { price: val });
    setEditingId(null); setEditPrice('');
  };

  const enabledCount = items.filter((i) => i.enabled).length;
  const disabledCount = items.filter((i) => !i.enabled).length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-4 border-b border-border">
        <h1 className="font-display text-2xl font-bold text-foreground mb-4">Menu Management</h1>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center shadow-soft">
            <p className="font-display text-2xl font-bold text-emerald-700 tabular-nums leading-none">{enabledCount}</p>
            <p className="text-[10px] font-body font-bold text-emerald-600 uppercase tracking-wide mt-1">Active</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-center shadow-soft">
            <p className="font-display text-2xl font-bold text-red-600 tabular-nums leading-none">{disabledCount}</p>
            <p className="text-[10px] font-body font-bold text-red-500 uppercase tracking-wide mt-1">Disabled</p>
          </div>
          <div className="kpi-card text-center">
            <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{items.length}</p>
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide mt-1">Total</p>
          </div>
        </div>
      </div>

      {/* ── Sticky search + filter ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="text" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} showAll />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      <div className="px-4 py-4 space-y-2">
        {filtered.map((item) => (
          <div key={item.id}
            className={cn('flex items-center gap-3 bg-card rounded-2xl border p-3.5 transition-all shadow-soft',
              item.enabled ? 'border-border' : 'border-red-200/60 opacity-60')}>
            {/* Image thumbnail */}
            <button
              onClick={() => { setUploadTarget(item.id); fileInputRef.current?.click(); }}
              className="relative size-16 rounded-xl bg-muted shrink-0 overflow-hidden group border border-border"
              aria-label="Upload image">
              {item.imageUrl
                ? <img src={item.imageUrl} alt="" className="size-full object-cover" />
                : <div className="size-full flex items-center justify-center"><ImageOff className="size-5 text-muted-foreground/40" /></div>}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity rounded-xl"
                style={{ background: 'rgba(0,0,0,0.45)' }}>
                <Camera className="size-5 text-white" />
              </div>
            </button>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
              <p className="text-[10px] font-body text-muted-foreground mt-0.5">{categoryName(item.category)}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-body text-muted-foreground">₹</span>
                    <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                      className="w-20 px-2 py-1 border border-primary/40 rounded-lg text-sm font-body tabular-nums bg-card focus:outline-none focus:ring-2 focus:ring-primary/40"
                      autoFocus onKeyDown={(e) => e.key === 'Enter' && savePrice(item.id)} />
                    <button onClick={() => savePrice(item.id)}
                      className="size-7 rounded-lg cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90" aria-label="Save">
                      <Check className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEditPrice(item.id, item.price)}
                    className="inline-flex items-center gap-1 text-sm font-body font-bold px-2.5 py-1 rounded-lg active:scale-95 transition-all"
                    style={{ background: 'hsl(var(--accent)/0.15)', color: 'hsl(var(--accent))' }}>
                    {formatCurrency(item.price)}
                    <Edit3 className="size-3 opacity-60" />
                  </button>
                )}
              </div>
            </div>

            {/* Toggle */}
            <button onClick={() => toggleItem(item.id)}
              className="shrink-0 active:scale-90 transition-transform"
              aria-label={item.enabled ? 'Disable item' : 'Enable item'}>
              {item.enabled
                ? <ToggleRight className="size-9 text-primary" />
                : <ToggleLeft  className="size-9 text-muted-foreground" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
