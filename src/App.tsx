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
// Bakery workflow
import OrderReceiverDashboard from '@/bakery/OrderReceiverDashboard';
import StoreDashboard from '@/bakery/StoreDashboard';
import BakerDashboard from '@/bakery/BakerDashboard';
import PackingDashboard from '@/bakery/PackingDashboard';

function AppRoutes() {
  const { currentUser } = useAuthStore();
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
      if (useAuthStore.persist.hasHydrated()) setHydrated(true);
      return unsub;
    }
  }, [hydrated]);

  if (!hydrated) return null;

  const getDefaultRoute = () => {
    if (!currentUser) return '/login';
    switch (currentUser.role) {
      case 'order_taker':    return '/order-pad';
      case 'admin':          return '/admin-dashboard';
      case 'kitchen':        return '/kitchen';
      case 'billing':        return '/billing';
      case 'order_receiver': return '/bakery/receive';
      case 'store':          return '/bakery/store';
      case 'baker':          return '/bakery/baker';
      case 'packing':        return '/bakery/packing';
      default:               return '/billing';
    }
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

        {/* Cafe roles */}
        <Route path="/order-pad" element={<ProtectedRoute allowedRoles={['order_taker']}><OrderPad /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute allowedRoles={['billing']}><BillingDashboard /></ProtectedRoute>} />
        <Route path="/kitchen" element={<ProtectedRoute allowedRoles={['kitchen']}><KitchenDashboard /></ProtectedRoute>} />
        <Route path="/order-history" element={<ProtectedRoute allowedRoles={['order_taker', 'billing', 'admin', 'kitchen']}><OrderHistory /></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/menu-management" element={<ProtectedRoute allowedRoles={['admin']}><MenuManagement /></ProtectedRoute>} />
        <Route path="/sales-report" element={<ProtectedRoute allowedRoles={['admin']}><SalesReport /></ProtectedRoute>} />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/staff-management" element={<ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>} />
        <Route path="/qr-menu" element={<ProtectedRoute allowedRoles={['admin']}><QRMenuPage /></ProtectedRoute>} />
        <Route path="/attendance-salary" element={<ProtectedRoute allowedRoles={['admin']}><AttendanceSalary /></ProtectedRoute>} />

        {/* Bakery workflow */}
        <Route path="/bakery/receive" element={<ProtectedRoute allowedRoles={['order_receiver']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/store" element={<ProtectedRoute allowedRoles={['store']}><StoreDashboard /></ProtectedRoute>} />
        <Route path="/bakery/baker" element={<ProtectedRoute allowedRoles={['baker']}><BakerDashboard /></ProtectedRoute>} />
        <Route path="/bakery/packing" element={<ProtectedRoute allowedRoles={['packing']}><PackingDashboard /></ProtectedRoute>} />

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
