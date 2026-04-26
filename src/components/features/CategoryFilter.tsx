import { cn } from '@/lib/utils';
import { MENU_CATEGORIES } from '@/constants/config';

interface CategoryFilterProps {
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
  showAll?: boolean;
}

export default function CategoryFilter({ selectedCategory, onSelect, showAll = true }: CategoryFilterProps) {
  const categories = showAll
    ? [{ id: 'all', name: 'All', timing: '', icon: '📋' }, ...MENU_CATEGORIES]
    : MENU_CATEGORIES;

  return (
    <div className="flex flex-wrap gap-1.5 py-2 px-3">
      {categories.map((cat) => {
        const isActive = selectedCategory === cat.id;
        // Shorten "All Items" → "All", strip long names for compact display
        const label = cat.id === 'all' ? 'All' : cat.name;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-body font-semibold whitespace-nowrap transition-all active:scale-95',
              isActive
                ? 'cafe-gradient text-primary-foreground shadow-sm'
                : 'bg-card text-foreground border border-border hover:bg-muted'
            )}
          >
            <span className="text-sm leading-none">{cat.icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
