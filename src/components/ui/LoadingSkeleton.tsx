// src/components/ui/LoadingSkeleton.tsx
// UX-01: Shared skeleton loader — use instead of spinners, blank screens, or raw text placeholders.
// Variants: 'card' | 'table' | 'list'
// Usage:
//   <LoadingSkeleton />                      — 3 list rows (default)
//   <LoadingSkeleton variant="card" count={4} />
//   <LoadingSkeleton variant="table" count={5} />

import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  variant?: 'list' | 'card' | 'table';
  count?: number;
  className?: string;
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-muted',
        'after:absolute after:inset-0 after:translate-x-[-100%]',
        'after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent',
        'after:animate-[shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
    />
  );
}

// Single list-row skeleton
function ListRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <Shimmer className="size-10 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3.5 w-2/3 rounded" />
        <Shimmer className="h-3 w-1/3 rounded" />
      </div>
      <Shimmer className="h-4 w-12 rounded" />
    </div>
  );
}

// Single card skeleton
function CardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Shimmer className="size-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/2 rounded" />
          <Shimmer className="h-3 w-1/3 rounded" />
        </div>
      </div>
      <Shimmer className="h-3 w-full rounded" />
      <Shimmer className="h-3 w-4/5 rounded" />
      <div className="flex gap-2 pt-1">
        <Shimmer className="h-8 flex-1 rounded-xl" />
        <Shimmer className="h-8 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

// Single table-row skeleton
function TableRow() {
  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-border/40 last:border-0">
      <Shimmer className="h-3.5 w-24 rounded" />
      <Shimmer className="h-3.5 flex-1 rounded" />
      <Shimmer className="h-3.5 w-16 rounded" />
      <Shimmer className="h-3.5 w-20 rounded" />
    </div>
  );
}

export default function LoadingSkeleton({ variant = 'list', count = 3, className }: LoadingSkeletonProps) {
  const rows = Array.from({ length: count }, (_, i) => i);

  if (variant === 'card') {
    return (
      <div className={cn('grid grid-cols-1 gap-3', className)}>
        {rows.map(i => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn('bg-card border border-border rounded-2xl px-4 py-2 animate-pulse', className)}>
        {rows.map(i => <TableRow key={i} />)}
      </div>
    );
  }

  // default: list
  return (
    <div className={cn('bg-card border border-border rounded-2xl px-4 animate-pulse', className)}>
      {rows.map(i => <ListRow key={i} />)}
    </div>
  );
}
