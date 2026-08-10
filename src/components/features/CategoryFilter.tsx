import { cn } from '@/lib/utils';
import { useMenuCategories } from '@/hooks/useMenuCategories';

interface CategoryFilterProps {
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
  showAll?: boolean;
}

export default function CategoryFilter({ selectedCategory, onSelect, showAll = true }: CategoryFilterProps) {
  const menuCategories = useMenuCategories();
  const categories = showAll
    ? [{ id: 'all', name: 'All Items', timing: '', icon: '📋' }, ...menuCategories]
    : menuCategories;

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
