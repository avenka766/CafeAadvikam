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
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-body font-semibold whitespace-nowrap transition-all duration-200 active:scale-90 shrink-0',
              isActive
                ? 'text-primary-foreground shadow-teal'
                : 'bg-card text-foreground border border-border hover:border-primary/30',
            )}
            style={isActive ? {
              background: 'linear-gradient(135deg, hsl(164 52% 32%), hsl(164 52% 22%))',
            } : {}}
          >
            <span className="text-xs leading-none">{cat.icon}</span>
            <span>{cat.id === 'all' ? 'All' : cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
