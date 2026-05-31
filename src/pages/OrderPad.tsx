import { useState, useMemo, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { useOrderStore } from '@/stores/orderStore';
import { Search, ShoppingBag, X, UtensilsCrossed } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import OrderCart from '@/components/features/OrderCart';
import EmptyState from '@/components/ui/EmptyState';

export default function OrderPad() {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, getCartTotal, getCartCount } = useOrderStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const filteredItems = useMemo(() => {
    let f = items.filter((item) => item.enabled);
    if (selectedCategory !== 'all') f = f.filter((item) => item.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter((item) => item.name.toLowerCase().includes(q));
    }
    return f;
  }, [items, selectedCategory, search]);

  const cartCount = getCartCount();
  const cartTotal = getCartTotal();
  const getQty = (id: string) => cart.find((c) => c.menuItem.id === id)?.quantity ?? 0;

  return (
    <div className="page-wrapper">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 pt-3 pb-1">
          {/* Page title */}
          <div className="flex items-center gap-2 mb-3">
            <UtensilsCrossed className="size-4 text-primary" />
            <h1 className="font-display text-xl font-bold text-foreground">Order Pad</h1>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm font-body bg-muted/50 border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        {/* U-16 FIX: clear search when category changes so both filters never stack silently */}
        <CategoryFilter
          selectedCategory={selectedCategory}
          onSelect={(cat) => { setSelectedCategory(cat); setSearch(''); }}
        />
      </div>

      {/* ── Menu grid ── */}
      <div className="px-4 py-4">
        {filteredItems.length === 0 ? (
          <EmptyState
            icon="🍽️"
            message="No items found"
            sub="Try a different category or clear your search"
            cta="Clear filters"
            onCta={() => { setSearch(''); setSelectedCategory('all'); }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                quantity={getQty(item.id)}
                onAdd={() => addToCart(item)}
                onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Floating cart bar ── */}
      {cartCount > 0 && (
        <div className="fixed left-0 right-0 z-40 px-4 animate-slide-up" style={{ bottom: 'calc(var(--nav-h, 5.25rem) + 0.5rem)' }}>
          <button
            onClick={() => setCartOpen(true)}
            className="w-full py-4 px-5 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, hsl(164 52% 28%), hsl(164 52% 20%))',
              boxShadow: '0 8px 32px rgba(30,100,70,0.45)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="size-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <ShoppingBag className="size-5 text-white" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: 'hsl(var(--accent))' }}>
                  {cartCount}
                </span>
              </div>
              <div>
                <p className="font-body font-semibold text-white text-sm leading-none">
                  {cartCount} item{cartCount !== 1 ? 's' : ''}
                </p>
                <p className="font-body text-white/60 text-xs mt-0.5">Tap to review</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-white tabular-nums">{formatCurrency(cartTotal)}</p>
            </div>
          </button>
        </div>
      )}

      <OrderCart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
