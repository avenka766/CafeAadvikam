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
    case 'order_receiver': return '/bakery/receive';
    case 'store':          return '/bakery/store';
    case 'baker':          return '/bakery/baker';
    case 'packing':        return '/bakery/packing';
    case 'branch_vrsnb':   return '/branch/vrsnb';
    case 'branch_snb':     return '/branch/snb';
    case 'branch_hosur':   return '/branch/hosur';
    case 'admin_vrsnb':    return '/admin-vrsnb';
    case 'admin_snb':      return '/admin-snb';
    case 'owner':          return '/owner';
    case 'billing':
    default:               return '/billing';
  }
}
