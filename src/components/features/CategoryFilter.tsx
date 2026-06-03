import { cn } from '@/lib/utils';
import { MENU_CATEGORIES } from '@/constants/config';

interface CategoryFilterProps {
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
  showAll?: boolean;
}

export default function CategoryFilter({ selectedCategory, onSelect, showAll = true }: CategoryFilterProps) {
  const categories = showAll
    ? [{ id: 'all', name: 'All Items', timing: '', icon: '📋' }, ...MENU_CATEGORIES]
    : MENU_CATEGORIES;

  return (
    <div className="order-category-rail" aria-label="Menu categories">
      {categories.map((cat) => {
        const isActive = selectedCategory === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn('order-category-chip', isActive && 'order-category-chip-active')}
            aria-pressed={isActive}
          >
            <span className="order-category-icon" aria-hidden="true">{cat.icon}</span>
            <span className="order-category-name">{cat.id === 'all' ? 'All Items' : cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
