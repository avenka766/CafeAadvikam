import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { MENU_CATEGORIES } from '@/constants/config';

interface CategoryFilterProps {
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
  showAll?: boolean;
}

export default function CategoryFilter({ selectedCategory, onSelect, showAll = true }: CategoryFilterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const categories = showAll
    ? [{ id: 'all', name: 'All Items', timing: '', icon: '📋' }, ...MENU_CATEGORIES]
    : MENU_CATEGORIES;

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-4"
    >
      {categories.map((cat) => {
        const isActive = selectedCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-body font-medium whitespace-nowrap transition-all shrink-0',
              isActive
                ? 'cafe-gradient text-primary-foreground shadow-md'
                : 'bg-card text-foreground border border-border active:scale-95'
            )}
          >
            <span className="text-base">{cat.icon}</span>
            <span>{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
