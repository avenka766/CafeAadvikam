import { useState, useMemo, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { MENU_CATEGORIES } from '@/constants/config';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function MenuPage() {
  const { items, loadMenu, loading } = useMenuStore();
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter((i) => i.enabled), [items]);

  const categories = useMemo(() => {
    if (selectedCategory === 'all') return MENU_CATEGORIES;
    return MENU_CATEGORIES.filter((c) => c.id === selectedCategory);
  }, [selectedCategory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-14 flex items-center justify-center">
        <p className="font-body text-muted-foreground">Loading menu...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-14 pb-8">
      <div className="px-4 pt-4 pb-2">
        <h1 className="font-display text-3xl font-bold text-foreground">Our Menu</h1>
        <p className="text-sm font-body text-muted-foreground mt-0.5">Pure vegetarian delights</p>
      </div>

      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-hide px-4 py-2 gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn('px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap shrink-0 transition-all', selectedCategory === 'all' ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card border border-border text-foreground')}
          >
            All
          </button>
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn('px-3.5 py-2 rounded-full text-sm font-body font-semibold whitespace-nowrap shrink-0 transition-all', selectedCategory === cat.id ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card border border-border text-foreground')}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {categories.map((cat) => {
          const catItems = enabledItems.filter((i) => i.category === cat.id);
          if (catItems.length === 0) return null;
          return (
            <div key={cat.id}>
              <div className="mb-3">
                <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                  <span>{cat.icon}</span> {cat.name}
                </h2>
                <p className="text-xs font-body text-muted-foreground">{cat.timing}</p>
              </div>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.imageUrl && <img src={item.imageUrl} alt="" className="size-10 rounded-lg object-cover shrink-0" />}
                      <span className="text-sm font-body text-foreground truncate">{item.name}</span>
                    </div>
                    <span className="text-sm font-body font-bold text-accent-foreground tabular-nums shrink-0 ml-2">
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
