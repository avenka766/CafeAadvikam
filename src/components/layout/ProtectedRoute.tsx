// src/components/layout/ProtectedRoute.tsx  ← REPLACE EXISTING FILE
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { currentUser } = useAuthStore();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    const defaultPath =
      currentUser.role === 'order_taker'    ? '/order-pad'
      : currentUser.role === 'admin'        ? '/admin-dashboard'
      : currentUser.role === 'kitchen'      ? '/kitchen'
      : currentUser.role === 'order_receiver' ? '/bakery/receive'
      : currentUser.role === 'store'        ? '/bakery/store'
      : currentUser.role === 'baker'        ? '/bakery/baker'
      : currentUser.role === 'packing'      ? '/bakery/packing'
      // ── NEW ─────────────────────────────────────────────────────────────
      : currentUser.role === 'branch_vrsnb' ? '/branch/vrsnb'
      : currentUser.role === 'branch_snb'   ? '/branch/snb'
      : currentUser.role === 'branch_hosur' ? '/branch/hosur'
      // ────────────────────────────────────────────────────────────────────
      : '/billing';
    return <Navigate to={defaultPath} replace />;
  }

  return <>{children}</>;
}
