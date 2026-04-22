import { useState, useMemo, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { useOrderStore } from '@/stores/orderStore';
import { Search, ShoppingBag, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import OrderCart from '@/components/features/OrderCart';

export default function OrderPad() {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, getCartTotal, getCartCount } = useOrderStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);

  // Load menu from DB on mount
  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const filteredItems = useMemo(() => {
    let filtered = items.filter((item) => item.enabled);
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((item) => item.name.toLowerCase().includes(q));
    }
    return filtered;
  }, [items, selectedCategory, search]);

  const cartCount = getCartCount();
  const cartTotal = getCartTotal();

  const getItemQuantity = (itemId: string) => {
    const ci = cart.find((c) => c.menuItem.id === itemId);
    return ci ? ci.quantity : 0;
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-32">
      <div className="sticky top-14 z-30 bg-background border-b border-border">
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <CategoryFilter selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      <div className="px-4 py-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-body text-muted-foreground">No items found</p>
            <button onClick={() => { setSearch(''); setSelectedCategory('all'); }} className="mt-2 text-sm font-body text-primary font-semibold">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                quantity={getItemQuantity(item.id)}
                onAdd={() => addToCart(item)}
                onRemove={() => updateCartQuantity(item.id, getItemQuantity(item.id) - 1)}
              />
            ))}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-[68px] left-0 right-0 z-30 px-4 pb-2">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full py-3.5 px-5 rounded-2xl cafe-gradient text-primary-foreground flex items-center justify-between shadow-xl active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="size-5" />
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-accent text-[10px] font-bold flex items-center justify-center text-accent-foreground">{cartCount}</span>
              </div>
              <span className="font-body font-bold text-sm">{cartCount} item{cartCount !== 1 ? 's' : ''} added</span>
            </div>
            <span className="font-display text-lg font-bold tabular-nums">{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      )}

      <OrderCart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
