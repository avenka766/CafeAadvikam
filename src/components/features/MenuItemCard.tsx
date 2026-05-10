import { Plus, Minus, Leaf } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

export default function MenuItemCard({ item, quantity, onAdd, onRemove }: MenuItemCardProps) {
  return (
    <div className={cn(
      'relative bg-card rounded-2xl overflow-hidden transition-all duration-200',
      quantity > 0
        ? 'shadow-lifted ring-2 ring-primary/30'
        : 'shadow-soft border border-border',
      !item.enabled && 'opacity-50 pointer-events-none',
    )}>
      {/* Image */}
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name}
            className="size-full object-cover transition-transform duration-500 hover:scale-105" />
        ) : (
          <div className="size-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(36 30% 92%), hsl(36 25% 88%))' }}>
            <span className="text-3xl opacity-30">🍽️</span>
          </div>
        )}

        {/* Veg badge */}
        <div className="absolute top-2 left-2">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-body font-bold"
            style={{ background: 'rgba(255,255,255,0.92)', color: '#1a7a50', border: '1px solid rgba(26,122,80,0.25)' }}>
            <Leaf className="size-2.5" />VEG
          </span>
        </div>

        {/* Qty badge */}
        {quantity > 0 && (
          <div className="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center text-xs font-bold text-white animate-scale-in"
            style={{ background: 'linear-gradient(135deg, hsl(164 52% 32%), hsl(164 52% 22%))', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
            {quantity}
          </div>
        )}

        {!item.enabled && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.65)' }}>
            <span className="text-xs font-body font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-body font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">
          {item.name}
        </h3>
        <div className="flex items-center justify-between mt-2.5 gap-2">
          <span className="text-sm font-body font-bold tabular-nums"
            style={{ color: 'hsl(var(--accent))' }}>
            {formatCurrency(item.price)}
          </span>
          {quantity === 0 ? (
            <button onClick={onAdd}
              className="size-8 rounded-xl flex items-center justify-center text-white active:scale-75 transition-transform"
              style={{ background: 'linear-gradient(135deg, hsl(164 52% 32%), hsl(164 52% 22%))', boxShadow: '0 2px 8px rgba(30,100,70,0.3)' }}
              aria-label={`Add ${item.name}`}>
              <Plus className="size-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={onRemove}
                className="size-8 rounded-xl bg-muted flex items-center justify-center text-foreground active:scale-75 transition-transform"
                aria-label={`Remove ${item.name}`}>
                <Minus className="size-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-bold tabular-nums">{quantity}</span>
              <button onClick={onAdd}
                className="size-8 rounded-xl flex items-center justify-center text-white active:scale-75 transition-transform"
                style={{ background: 'linear-gradient(135deg, hsl(164 52% 32%), hsl(164 52% 22%))' }}
                aria-label={`Add more ${item.name}`}>
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
