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
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className="px-4 pt-4 pb-2 flex gap-3">
        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="font-display text-xl font-bold text-emerald-700 tabular-nums">{enabledCount}</p>
          <p className="text-[10px] font-body font-semibold text-emerald-600 uppercase">Active Items</p>
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

      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="text" placeholder="Search menu items..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear"><X className="size-4 text-muted-foreground" /></button>}
          </div>
        </div>
        <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} showAll />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      <div className="px-4 py-4 space-y-2">
        {filtered.map((item) => (
          <div key={item.id} className={cn('flex items-center gap-3 bg-card rounded-xl border p-3 transition-opacity', item.enabled ? 'border-border' : 'border-red-200 opacity-60')}>
            <button onClick={() => { setUploadTarget(item.id); fileInputRef.current?.click(); }} className="relative size-14 rounded-lg bg-muted shrink-0 overflow-hidden group" aria-label="Upload image">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : <div className="size-full flex items-center justify-center text-muted-foreground/40"><ImageOff className="size-5" /></div>}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity"><Camera className="size-5 text-white" /></div>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
              <p className="text-[10px] font-body text-muted-foreground">{categoryName(item.category)}</p>
              <div className="mt-1 flex items-center gap-2">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">₹</span>
                    <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-16 px-1.5 py-0.5 border border-border rounded text-sm font-body tabular-nums" autoFocus onKeyDown={(e) => e.key === 'Enter' && savePrice(item.id)} />
                    <button onClick={() => savePrice(item.id)} className="size-6 rounded bg-primary text-primary-foreground flex items-center justify-center" aria-label="Save price"><Check className="size-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => startEditPrice(item.id, item.price)} className="flex items-center gap-1 text-sm font-body font-bold text-accent-foreground bg-accent/20 px-2 py-0.5 rounded-md tabular-nums active:scale-95">
                    {formatCurrency(item.price)}<Edit3 className="size-3 ml-0.5 opacity-50" />
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => toggleItem(item.id)} className="shrink-0 active:scale-90 transition-transform" aria-label={item.enabled ? 'Disable item' : 'Enable item'}>
              {item.enabled ? <ToggleRight className="size-8 text-primary" /> : <ToggleLeft className="size-8 text-muted-foreground" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
