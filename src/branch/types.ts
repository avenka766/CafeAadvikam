// src/branch/types.ts  ← NEW FILE
export type Branch = 'VRSNB' | 'SNB' | 'Hosur';
export const BRANCHES: Branch[] = ['VRSNB', 'SNB', 'Hosur'];

export const BRANCH_LABELS: Record<Branch, string> = {
  VRSNB: 'VR SNB',
  SNB:   'SNB',
  Hosur: 'Hosur',
};

export const BRANCH_COLORS: Record<Branch, {
  text: string; bg: string; badge: string; bar: string;
}> = {
  VRSNB: {
    text:  'text-blue-700',
    bg:    'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    bar:   'bg-blue-500',
  },
  SNB: {
    text:  'text-amber-700',
    bg:    'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    bar:   'bg-amber-500',
  },
  Hosur: {
    text:  'text-emerald-700',
    bg:    'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
    bar:   'bg-emerald-500',
  },
};
