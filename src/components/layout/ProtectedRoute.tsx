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
  const { currentUser } = useAuthStore();

  if (!currentUser) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(currentUser.role)) {
    return <Navigate to={getRoleDefaultPath(currentUser.role)} replace />;
  }

  return <>{children}</>;
}
