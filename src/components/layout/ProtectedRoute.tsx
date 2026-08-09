// src/components/layout/ProtectedRoute.tsx
// Fix: UX-02 — centralized role routing
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getRoleDefaultPath } from '@/lib/routing';
import type { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  // Selector instead of a whole-store destructure — every route in the app
  // is wrapped in this component, so subscribing to the entire authStore
  // here means ANY field change anywhere in that store re-renders every
  // mounted ProtectedRoute (and therefore its whole page) app-wide. Same
  // class of bug fixed in Owner Dashboard's useOrderStore usage.
  const currentUser = useAuthStore((s) => s.currentUser);

  if (!currentUser) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(currentUser.role)) {
    return <Navigate to={getRoleDefaultPath(currentUser.role)} replace />;
  }

  return <>{children}</>;
}
