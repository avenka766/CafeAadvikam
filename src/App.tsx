import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import MenuPage from '@/pages/MenuPage';
import OrderPad from '@/pages/OrderPad';
import BillingDashboard from '@/pages/BillingDashboard';
import MenuManagement from '@/pages/MenuManagement';
import OrderHistory from '@/pages/OrderHistory';
import SalesReport from '@/pages/SalesReport';
import AdminDashboard from '@/pages/AdminDashboard';
import StaffManagement from '@/pages/StaffManagement';
import QRMenuPage from '@/pages/QRMenuPage';
import QROrderPage from '@/pages/QROrderPage';
import KitchenDashboard from '@/pages/KitchenDashboard';
import DigitalMenu from '@/pages/DigitalMenu';
import OrderTrackingPage from '@/pages/OrderTrackingPage';
import AttendanceSalary from '@/pages/AttendanceSalary';

function AppRoutes() {
  const { currentUser } = useAuthStore();
  const [hydrated, setHydrated] = useState(
    // Zustand persist may already be done synchronously on first call
    () => useAuthStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
      // Double-check in case it fired before we subscribed
      if (useAuthStore.persist.hasHydrated()) setHydrated(true);
      return unsub;
    }
  }, [hydrated]);

  // Show nothing until localStorage is read — prevents flash to login on reload
  if (!hydrated) return null;

  const getDefaultRoute = () => {
    if (!currentUser) return '/login';
    if (currentUser.role === 'order_taker') return '/order-pad';
    if (currentUser.role === 'admin') return '/admin-dashboard';
    if (currentUser.role === 'kitchen') return '/kitchen';
    return '/billing';
  };

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/digital-menu" element={<DigitalMenu />} />
        <Route path="/order" element={<QROrderPage />} />
        <Route path="/order/track" element={<OrderTrackingPage />} />
        <Route path="/order-pad" element={<ProtectedRoute allowedRoles={['order_taker']}><OrderPad /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute allowedRoles={['billing']}><BillingDashboard /></ProtectedRoute>} />
        <Route path="/kitchen" element={<ProtectedRoute allowedRoles={['kitchen']}><KitchenDashboard /></ProtectedRoute>} />
        <Route path="/menu-management" element={<ProtectedRoute allowedRoles={['admin']}><MenuManagement /></ProtectedRoute>} />
        <Route path="/sales-report" element={<ProtectedRoute allowedRoles={['admin']}><SalesReport /></ProtectedRoute>} />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/staff-management" element={<ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>} />
        <Route path="/qr-menu" element={<ProtectedRoute allowedRoles={['admin']}><QRMenuPage /></ProtectedRoute>} />
        <Route path="/attendance-salary" element={<ProtectedRoute allowedRoles={['admin']}><AttendanceSalary /></ProtectedRoute>} />
        <Route path="/order-history" element={<ProtectedRoute allowedRoles={['order_taker', 'billing', 'admin', 'kitchen']}><OrderHistory /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
      </Routes>
      {currentUser && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
