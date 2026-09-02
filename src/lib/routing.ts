// src/lib/routing.ts
// Single source of truth for role → default path mapping.
// Previously this was copy-pasted in App.tsx, Login.tsx (twice), and ProtectedRoute.tsx.
// Fix: UX-02

import type { UserRole } from '@/types';

export function getRoleDefaultPath(role: UserRole): string {
  switch (role) {
    case 'order_taker':    return '/order-pad';
    case 'admin':          return '/admin-dashboard';
    case 'kitchen':        return '/kitchen';
    case 'receiver_vrsnb':  return '/bakery/receive/vrsnb';
    case 'receiver_snb':    return '/bakery/receive/snb';
    case 'store':          return '/bakery/store';
    case 'cake_master':    return '/bakery/cake-master';
    case 'planner':        return '/bakery/planner';
    case 'branch_vrsnb':   return '/branch/vrsnb';
    case 'branch_snb':     return '/branch/snb';
    // AUDIT FIX (2026-09-02): '/branch/hosur' was retired (see App.tsx —
    // "Hosur billing/shops now embedded in Planner") but this mapping was
    // never updated. Since the catch-all route redirects any unmatched path
    // back to getRoleDefaultPath(role), this sent every 'branch_hosur' login
    // into an infinite redirect loop — confirmed 3 real active staff accounts
    // (Bargavi, hosur, Shilpa) carry this role today and were completely
    // locked out. WorkspaceChrome.tsx's own 'branch_hosur' sidebar nav
    // already assumes this exact destination (?tab=hosur&hosurTab=place) —
    // this mapping was just never updated to match it.
    case 'branch_hosur':   return '/bakery/planner?tab=hosur&hosurTab=place';
    case 'admin_vrsnb':    return '/admin-vrsnb';
    case 'admin_snb':      return '/admin-snb';
    case 'owner':          return '/owner';
    case 'billing':
    default:               return '/billing';
  }
}
