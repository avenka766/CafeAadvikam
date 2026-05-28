// src/components/ui/EmptyState.tsx
// UX-02: Shared empty-state component — use everywhere instead of bare text like "No items found."
// Each empty state gets a contextual icon, a human-readable message, and an optional action button.
//
// Usage:
//   <EmptyState icon="🍽️" message="No orders found" />
//   <EmptyState icon="📦" message="No items in stock" cta="Add Item" onCta={() => ...} />
//   <EmptyState icon="🔍" message="No results for your search" cta="Clear filters" onCta={() => setSearch('')} />

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: string;           // emoji or short string; defaults to 📭
  message: string;         // primary text
  sub?: string;            // optional secondary text
  cta?: string;            // CTA button label
  onCta?: () => void;      // CTA click handler
  className?: string;
}

export default function EmptyState({ icon = '📭', message, sub, cta, onCta, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-6 text-center', className)}>
      <span className="text-4xl mb-3" role="img" aria-hidden="true">{icon}</span>
      <p className="font-body font-semibold text-foreground text-sm">{message}</p>
      {sub && (
        <p className="font-body text-xs text-muted-foreground mt-1 max-w-xs">{sub}</p>
      )}
      {cta && onCta && (
        <button
          onClick={onCta}
          className="mt-4 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-body font-semibold active:scale-95 transition-transform"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
