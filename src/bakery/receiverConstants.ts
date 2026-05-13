// ─── Shared constants for Order Receiver screens ─────────────────────────────
import type { Branch } from './types';

export const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700 border-amber-200',
  baking:     'bg-orange-100 text-orange-700 border-orange-200',
  packed:     'bg-purple-100 text-purple-700 border-purple-200',
  dispatched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'At Store', baking: 'Baking', packed: 'Packed', dispatched: 'Dispatched',
};

export const CATEGORY_LABEL: Record<string, string> = {
  Sweets: '🍬 Sweets', Savouries: '🥜 Savouries', Bakery: '🍞 Bakery', Cookies: '🍪 Cookies',
};

export const BRANCH_COLOR: Record<Branch, {
  tab:    string;
  active: string;
  badge:  string;
  banner: string;
}> = {
  VRSNB: {
    tab:    'hover:text-blue-600 hover:bg-blue-50/50',
    active: 'border-b-2 border-blue-600 text-blue-700 font-bold bg-blue-50/60',
    badge:  'bg-blue-100 text-blue-700 border-blue-200',
    banner: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  SNB: {
    tab:    'hover:text-amber-600 hover:bg-amber-50/50',
    active: 'border-b-2 border-amber-500 text-amber-700 font-bold bg-amber-50/60',
    badge:  'bg-amber-100 text-amber-700 border-amber-200',
    banner: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  Hosur: {
    tab:    'hover:text-emerald-600 hover:bg-emerald-50/50',
    active: 'border-b-2 border-emerald-600 text-emerald-700 font-bold bg-emerald-50/60',
    badge:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    banner: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
};
