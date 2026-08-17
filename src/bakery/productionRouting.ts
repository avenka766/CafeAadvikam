import type { BakeryOrderItem, BakeryOrder } from './types';
import { BAKERY_ITEMS } from './types';
import type { BakeryItem } from './bakeryItemsStore';
import { itemNamesMatch } from './itemMatcher';
import { SNB_ITEMS } from '@/branch/snbItems';
import { VRSNB_ITEMS } from '@/branch/vrsnbItems';

// NOTE: Production-desk destination routing (sweet_master/savouries_master/etc.)
// was removed with the old Production stage. This file now only classifies
// items into categories, used for grouping in Store and the Planner's
// Merged Summary tab.
export type ProductionCategory = 'Sweets' | 'Savouries' | 'Cookies' | 'Puffs' | 'Bakery' | 'Others';

export function normalizeProductionCategory(category: string | undefined, itemName: string): ProductionCategory {
  const normalizedCategory = (category || '').trim().toLowerCase();
  const normalizedName = itemName.trim().toLowerCase();
  if (normalizedCategory === 'sweets'
    || /(halwa|jamun|mysore pak|baklava|burfi|peda|laddu)/.test(normalizedCategory)
    || normalizedCategory.includes('sweet')) return 'Sweets';
  if (normalizedCategory === 'savouries'
    || /(chips|muruk|mixture|pakoda|nippat|namkeen|packaged snack)/.test(normalizedCategory)
    || normalizedCategory === 'dal') return 'Savouries';
  if (normalizedCategory === 'cookies'
    || normalizedCategory.includes('cookie')
    || normalizedCategory.includes('biscuit')) return 'Cookies';
  if (normalizedCategory === 'puffs' || /\bpuff(s)?\b/.test(normalizedName)) return 'Puffs';
  if (normalizedCategory === 'bakery'
    || normalizedCategory.includes('bread')
    || normalizedCategory.includes('bun')
    || normalizedCategory.includes('pastr')) return 'Bakery';
  return 'Others';
}

export function itemCategory(item: BakeryOrderItem, liveCategory?: string): ProductionCategory {
  return normalizeProductionCategory(liveCategory, item.itemName);
}

// MOVED (2026-08-16) from StoreDashboard.tsx to this neutral shared module
// so StoreReportTab.tsx's category-wise report can reuse the exact same
// resolution — importing it directly from StoreDashboard.tsx would be a
// circular import, since StoreDashboard.tsx renders StoreReportTab.
export const CORE_RECIPE_CATEGORIES: ProductionCategory[] = ['Sweets', 'Savouries', 'Bakery', 'Cookies', 'Others'];
export type StoreOrderCategory = ProductionCategory;

export function storeOrderCategory(item: BakeryOrder['items'][number], liveItems: BakeryItem[]): StoreOrderCategory {
  const liveCategory = liveItems.find(entry => entry.id === item.itemId || itemNamesMatch(entry.name, item.itemName))?.category;
  const fallbackCategory = BAKERY_ITEMS.find(entry => entry.id === item.itemId || itemNamesMatch(entry.name, item.itemName))?.category;
  const idMatch = item.itemId.toLowerCase().match(/^(snb|vrsnb)-(\d+)$/);
  const barcode = idMatch ? Number(idMatch[2]) : 0;
  const branchCategory = idMatch?.[1] === 'snb'
    ? SNB_ITEMS.find(entry => entry.barcode === barcode)?.category
    : idMatch?.[1] === 'vrsnb'
      ? VRSNB_ITEMS.find(entry => entry.barcode === barcode)?.category
      : undefined;
  return normalizeProductionCategory(liveCategory || fallbackCategory || branchCategory, item.itemName);
}
