import type { BakeryOrderItem } from './types';

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
