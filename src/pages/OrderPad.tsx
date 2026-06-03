import { useState, useMemo, useEffect } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { useOrderStore } from '@/stores/orderStore';
import {
  ShoppingBag,
  UtensilsCrossed,
  Sparkles,
  ClipboardCheck,
  ArrowRight,
  Plus,
  Minus,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import OrderCart from '@/components/features/OrderCart';
import EmptyState from '@/components/ui/EmptyState';
import { MENU_CATEGORIES } from '@/constants/config';

export default function OrderPad() {
  const { items, loadMenu } = useMenuStore();
  const { cart, addToCart, updateCartQuantity, getCartTotal, getCartCount } = useOrderStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter((item) => item.enabled), [items]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return enabledItems;
    return enabledItems.filter((item) => item.category === selectedCategory);
  }, [enabledItems, selectedCategory]);

  const cartCount = getCartCount();
  const cartTotal = getCartTotal();
  const getQty = (id: string) => cart.find((c) => c.menuItem.id === id)?.quantity ?? 0;
  const activeCategoryName = selectedCategory === 'all'
    ? 'All menu items'
    : MENU_CATEGORIES.find((category) => category.id === selectedCategory)?.name ?? 'Selected menu';

  return (
    <div className="orderpad-screen dashboard-screen">
      <section className="orderpad-command-card">
        <div className="orderpad-title-block">
          <span className="orderpad-kicker"><Sparkles className="size-4" /> Rush-hour order taking</span>
          <h2>Fast Order Pad</h2>
        </div>
        <div className="orderpad-metrics">
          <div>
            <span>Menu</span>
            <strong>{enabledItems.length}</strong>
            <small>Active items</small>
          </div>
          <div>
            <span>Showing</span>
            <strong>{filteredItems.length}</strong>
            <small>{activeCategoryName}</small>
          </div>
          <div>
            <span>Ticket</span>
            <strong>{cartCount}</strong>
            <small>{formatCurrency(cartTotal)}</small>
          </div>
        </div>
      </section>

      <div className="orderpad-layout">
        <main className="orderpad-catalog-panel">
          <div className="orderpad-toolbar">
            <div className="orderpad-toolbar-heading">
              <div className="orderpad-toolbar-icon"><UtensilsCrossed className="size-5" /></div>
              <div>
                <h3>Menu catalogue</h3>
              </div>
            </div>
          </div>

          <CategoryFilter
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
          />

          {filteredItems.length === 0 ? (
            <div className="orderpad-empty-wrap">
              <EmptyState
                icon="🍽️"
                message="No items found"
                sub="Try a different category"
                cta="Show all items"
                onCta={() => setSelectedCategory('all')}
              />
            </div>
          ) : (
            <div className="orderpad-menu-grid">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantity={getQty(item.id)}
                  onAdd={() => addToCart(item)}
                  onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)}
                  hideImage
                />
              ))}
            </div>
          )}
        </main>

        <aside className="orderpad-ticket-panel" aria-label="Current ticket">
          <div className="orderpad-ticket-header">
            <div>
              <span>Current ticket</span>
              <h3>{cartCount} item{cartCount !== 1 ? 's' : ''}</h3>
            </div>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>

          {cart.length === 0 ? (
            <div className="orderpad-ticket-empty">
              <ShoppingBag className="size-12" />
              <h4>No items yet</h4>
            </div>
          ) : (
            <div className="orderpad-ticket-list">
              {cart.map((cartItem) => (
                <div key={cartItem.menuItem.id} className="orderpad-ticket-row">
                  <div>
                    <h4>{cartItem.menuItem.name}</h4>
                    <p>{formatCurrency(cartItem.menuItem.price)} × {cartItem.quantity}</p>
                  </div>
                  <div className="orderpad-ticket-stepper">
                    <button type="button" onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity - 1)} aria-label={`Remove ${cartItem.menuItem.name}`}>
                      <Minus className="size-3.5" />
                    </button>
                    <span>{cartItem.quantity}</span>
                    <button type="button" onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity + 1)} aria-label={`Add ${cartItem.menuItem.name}`}>
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="orderpad-ticket-footer">
            <div className="orderpad-total-line">
              <span>Total amount</span>
              <strong>{formatCurrency(cartTotal)}</strong>
            </div>
            <button type="button" disabled={cartCount === 0} onClick={() => setCartOpen(true)}>
              <ClipboardCheck className="size-5" /> Review & send order <ArrowRight className="size-5" />
            </button>
          </div>
        </aside>
      </div>

      {cartCount > 0 && (
        <div className="orderpad-mobile-cart-bar">
          <button type="button" onClick={() => setCartOpen(true)}>
            <div className="orderpad-mobile-cart-left">
              <span><ShoppingBag className="size-5" /></span>
              <div>
                <strong>{cartCount} item{cartCount !== 1 ? 's' : ''}</strong>
                <small>Review ticket</small>
              </div>
            </div>
            <b>{formatCurrency(cartTotal)}</b>
          </button>
        </div>
      )}

      <OrderCart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
