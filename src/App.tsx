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

function AppRoutes() {
  const { currentUser } = useAuthStore();

  const getDefaultRoute = () => {
    if (!currentUser) return '/';
    if (currentUser.role === 'order_taker') return '/order-pad';
    if (currentUser.role === 'admin') return '/admin-dashboard';
    return '/billing';
  };

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/digital-menu" element={<DigitalMenu />} />
        <Route path="/order" element={<QROrderPage />} />
        <Route
          path="/order-pad"
          element={
            <ProtectedRoute allowedRoles={['order_taker']}>
              <OrderPad />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute allowedRoles={['billing']}>
              <BillingDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute allowedRoles={['billing', 'admin']}>
              <KitchenDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/menu-management"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MenuManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales-report"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <SalesReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff-management"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <StaffManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/qr-menu"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <QRMenuPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/order-history"
          element={
            <ProtectedRoute allowedRoles={['order_taker', 'billing', 'admin']}>
              <OrderHistory />
            </ProtectedRoute>
          }
        />
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
