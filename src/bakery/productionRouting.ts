import type { BakeryOrderItem } from './types';

export const PRODUCTION_DESTINATIONS = [
  'sweet_master',
  'savouries_master',
  'cookies_master',
  'puffs_master',
  'bakery_master',
  'baker',
] as const;

export type ProductionDestination = typeof PRODUCTION_DESTINATIONS[number];
export type ProductionCategory = 'Sweets' | 'Savouries' | 'Cookies' | 'Puffs' | 'Bakery' | 'Others';

export const PRODUCTION_LABELS: Record<ProductionDestination, string> = {
  sweet_master: 'Sweet Master',
  savouries_master: 'Savouries Master',
  cookies_master: 'Cookies Master',
  puffs_master: 'Puffs Master',
  bakery_master: 'Bakery Master',
  baker: 'Baker',
};

export function normalizeProductionCategory(category: string | undefined, itemName: string): ProductionCategory {
  const normalizedCategory = (category || '').trim().toLowerCase();
  const normalizedName = itemName.trim().toLowerCase();
  if (normalizedCategory === 'sweets') return 'Sweets';
  if (normalizedCategory === 'savouries') return 'Savouries';
  if (normalizedCategory === 'cookies') return 'Cookies';
  if (normalizedCategory === 'puffs' || /\bpuff(s)?\b/.test(normalizedName)) return 'Puffs';
  if (normalizedCategory === 'bakery') return 'Bakery';
  return 'Others';
}

export function destinationForCategory(category: ProductionCategory): ProductionDestination {
  switch (category) {
    case 'Sweets': return 'sweet_master';
    case 'Savouries': return 'savouries_master';
    case 'Cookies': return 'cookies_master';
    case 'Puffs': return 'puffs_master';
    case 'Bakery': return 'bakery_master';
    default: return 'baker';
  }
}

export function destinationForItem(
  item: BakeryOrderItem,
  category: string | undefined,
): ProductionDestination {
  return destinationForCategory(normalizeProductionCategory(category, item.itemName));
}
