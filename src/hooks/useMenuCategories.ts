// src/hooks/useMenuCategories.ts
//
// Drop-in replacement for importing the old hardcoded MENU_CATEGORIES array.
// Loads the live `menu_categories` table once per app session and keeps
// subscribing to realtime changes for as long as any component using this
// hook is mounted, so a category added/renamed in Admin or VRSNB Admin's
// Menu Management screen shows up immediately in the Biller dashboard's
// category chips, the QR ordering page, Digital Menu, and the public
// Landing page menu preview — everywhere the old static array used to be
// read from directly.
import { useEffect } from 'react';
import { useMenuCategoryStore, type MenuCategory } from '@/stores/menuCategoryStore';

export function useMenuCategories(): MenuCategory[] {
  const categories = useMenuCategoryStore((s) => s.categories);
  const loadCategories = useMenuCategoryStore((s) => s.loadCategories);
  const subscribe = useMenuCategoryStore((s) => s.subscribe);

  useEffect(() => {
    void loadCategories();
    return subscribe();
  }, [loadCategories, subscribe]);

  return categories;
}
