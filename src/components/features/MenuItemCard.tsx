import { Plus, Minus, ImageOff } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/types';

interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

export default function MenuItemCard({ item, quantity, onAdd, onRemove }: MenuItemCardProps) {
  return (
    <div
      className={cn(
        'relative bg-card rounded-xl border overflow-hidden transition-all',
        quantity > 0 ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border',
        !item.enabled && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex flex-col items-center justify-center text-muted-foreground/40">
            <ImageOff className="size-8" />
          </div>
        )}
        {!item.enabled && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <span className="text-xs font-body font-bold text-destructive bg-destructive/10 px-2 py-1 rounded">
              Unavailable
            </span>
          </div>
        )}
        {quantity > 0 && (
          <div className="absolute top-1.5 right-1.5 size-6 rounded-full cafe-gradient flex items-center justify-center">
            <span className="text-xs font-bold text-primary-foreground">{quantity}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <h3 className="text-sm font-body font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.5rem]">
          {item.name}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-base font-display font-bold text-accent-foreground bg-accent/90 px-2 py-0.5 rounded-md tabular-nums">
            {formatCurrency(item.price)}
          </span>
          {quantity === 0 ? (
            <button
              onClick={onAdd}
              className="size-8 rounded-lg cafe-gradient flex items-center justify-center text-primary-foreground active:scale-90 transition-transform shadow-sm"
              aria-label={`Add ${item.name}`}
            >
              <Plus className="size-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={onRemove}
                className="size-8 rounded-lg bg-muted flex items-center justify-center text-foreground active:scale-90 transition-transform"
                aria-label={`Remove ${item.name}`}
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-5 text-center text-sm font-bold tabular-nums">{quantity}</span>
              <button
                onClick={onAdd}
                className="size-8 rounded-lg cafe-gradient flex items-center justify-center text-primary-foreground active:scale-90 transition-transform"
                aria-label={`Add more ${item.name}`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
