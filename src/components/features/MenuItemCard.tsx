import { Plus, Minus, Leaf } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  compact?: boolean;
  hideImage?: boolean;
}

export default function MenuItemCard({ item, quantity, onAdd, onRemove, compact, hideImage }: MenuItemCardProps) {
  if (compact) {
    return (
      <article className={cn('pos-menu-card pos-menu-card-compact', hideImage && 'pos-menu-card-no-image pos-menu-card-compact-no-image', quantity > 0 && 'pos-menu-card-selected', !item.enabled && 'pos-menu-card-disabled')}>
        {!hideImage && (
        <div className="pos-menu-thumb pos-menu-thumb-compact">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} loading="lazy" />
          ) : (
            <span aria-hidden="true">🍽️</span>
          )}
          <span className="pos-menu-veg-dot" aria-label="Vegetarian item" />
          {quantity > 0 && <strong className="pos-menu-qty-badge">{quantity}</strong>}
        </div>
        )}
        <div className="pos-menu-body pos-menu-body-compact">
          <h3>{item.name}</h3>
          <div className="pos-menu-footer">
            <span className="pos-menu-price">{formatCurrency(item.price)}</span>
            {quantity === 0 ? (
              <button onClick={onAdd} className="pos-menu-add-small" aria-label={`Add ${item.name}`}>
                <Plus className="size-4" />
              </button>
            ) : (
              <div className="pos-menu-stepper-small" aria-label={`${item.name} quantity ${quantity}`}>
                <button onClick={onRemove} aria-label={`Remove ${item.name}`}><Minus className="size-3.5" /></button>
                <span>{quantity}</span>
                <button onClick={onAdd} aria-label={`Add more ${item.name}`}><Plus className="size-3.5" /></button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn('pos-menu-card', hideImage && 'pos-menu-card-no-image', quantity > 0 && 'pos-menu-card-selected', !item.enabled && 'pos-menu-card-disabled')}>
      {!hideImage && (
      <div className="pos-menu-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} loading="lazy" />
        ) : (
          <span aria-hidden="true">🍽️</span>
        )}

        <div className="pos-menu-badges">
          <span><Leaf className="size-3" /> VEG</span>
        </div>

        {quantity > 0 && <strong className="pos-menu-qty-badge">{quantity}</strong>}

        {!item.enabled && (
          <div className="pos-menu-unavailable">
            <span>Unavailable</span>
          </div>
        )}
      </div>
      )}

      <div className="pos-menu-body">
        <h3>{item.name}</h3>
        <div className="pos-menu-footer">
          <span className="pos-menu-price">{formatCurrency(item.price)}</span>
          {quantity === 0 ? (
            <button onClick={onAdd} className="pos-menu-add" aria-label={`Add ${item.name}`}>
              <Plus className="size-5" />
              <span>Add</span>
            </button>
          ) : (
            <div className="pos-menu-stepper" aria-label={`${item.name} quantity ${quantity}`}>
              <button onClick={onRemove} aria-label={`Remove ${item.name}`}><Minus className="size-4" /></button>
              <span>{quantity}</span>
              <button onClick={onAdd} aria-label={`Add more ${item.name}`}><Plus className="size-4" /></button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
