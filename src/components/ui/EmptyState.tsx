import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  message?: string;
  title?: string;
  sub?: string;
  description?: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
  className?: string;
}

export default function EmptyState({
  icon = 'Empty',
  message,
  title,
  sub,
  description,
  subtitle,
  cta,
  onCta,
  className,
}: EmptyStateProps) {
  const primary = message ?? title ?? 'No records found';
  const secondary = sub ?? description ?? subtitle;

  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-3 text-4xl" role="img" aria-hidden="true">{icon}</span>
      <p className="text-sm font-semibold text-foreground">{primary}</p>
      {secondary && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{secondary}</p>}
      {cta && onCta && (
        <button
          onClick={onCta}
          className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
