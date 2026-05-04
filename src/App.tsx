// src/App.tsx  ← REPLACE EXISTING FILE
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
import OrderReceiverDashboard from '@/bakery/OrderReceiverDashboard';
import StoreDashboard from '@/bakery/StoreDashboard';
import BakerDashboard from '@/bakery/BakerDashboard';
import PackingDashboard from '@/bakery/PackingDashboard';
import BakeryItemManagement from '@/bakery/BakeryItemManagement';
import RecipeManagement from '@/bakery/RecipeManagement';
// ── NEW ──────────────────────────────────────────────────────────────────────
import VRSNBDashboard from '@/pages/VRSNBDashboard';
import SNBDashboard   from '@/pages/SNBDashboard';
import HosurDashboard from '@/pages/HosurDashboard';
// ─────────────────────────────────────────────────────────────────────────────

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
    if (!currentUser) return '/';
    if (currentUser.role === 'order_taker')   return '/order-pad';
    if (currentUser.role === 'admin')          return '/admin-dashboard';
    if (currentUser.role === 'kitchen')        return '/kitchen';
    if (currentUser.role === 'order_receiver') return '/bakery/receive';
    if (currentUser.role === 'store')          return '/bakery/store';
    if (currentUser.role === 'baker')          return '/bakery/baker';
    if (currentUser.role === 'packing')        return '/bakery/packing';
    // ── NEW ──────────────────────────────────────────────────────────────────
    if (currentUser.role === 'branch_vrsnb')   return '/branch/vrsnb';
    if (currentUser.role === 'branch_snb')     return '/branch/snb';
    if (currentUser.role === 'branch_hosur')   return '/branch/hosur';
    // ─────────────────────────────────────────────────────────────────────────
    return '/billing';
  };

  return (
    <>
      <Header />
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/menu"            element={<MenuPage />} />
        <Route path="/digital-menu"    element={<DigitalMenu />} />
        <Route path="/order"           element={<QROrderPage />} />
        <Route path="/order/track"     element={<OrderTrackingPage />} />

        <Route path="/order-pad"       element={<ProtectedRoute allowedRoles={['order_taker']}><OrderPad /></ProtectedRoute>} />
        <Route path="/billing"         element={<ProtectedRoute allowedRoles={['billing']}><BillingDashboard /></ProtectedRoute>} />
        <Route path="/kitchen"         element={<ProtectedRoute allowedRoles={['kitchen']}><KitchenDashboard /></ProtectedRoute>} />
        <Route path="/menu-management" element={<ProtectedRoute allowedRoles={['admin']}><MenuManagement /></ProtectedRoute>} />
        <Route path="/sales-report"    element={<ProtectedRoute allowedRoles={['admin']}><SalesReport /></ProtectedRoute>} />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/staff-management"element={<ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>} />
        <Route path="/qr-menu"         element={<ProtectedRoute allowedRoles={['admin']}><QRMenuPage /></ProtectedRoute>} />
        <Route path="/attendance-salary" element={<ProtectedRoute allowedRoles={['admin']}><AttendanceSalary /></ProtectedRoute>} />
        <Route path="/order-history"   element={<ProtectedRoute allowedRoles={['order_taker','billing','admin','kitchen']}><OrderHistory /></ProtectedRoute>} />

        <Route path="/bakery/receive"  element={<ProtectedRoute allowedRoles={['order_receiver']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/store"    element={<ProtectedRoute allowedRoles={['store']}><StoreDashboard /></ProtectedRoute>} />
        <Route path="/bakery/baker"    element={<ProtectedRoute allowedRoles={['baker']}><BakerDashboard /></ProtectedRoute>} />
        <Route path="/bakery/packing"  element={<ProtectedRoute allowedRoles={['packing']}><PackingDashboard /></ProtectedRoute>} />
        <Route path="/bakery/items"    element={<ProtectedRoute allowedRoles={['admin']}><BakeryItemManagement /></ProtectedRoute>} />
        <Route path="/bakery/recipes"  element={<ProtectedRoute allowedRoles={['admin']}><RecipeManagement /></ProtectedRoute>} />

        {/* ── NEW BRANCH ROUTES ─────────────────────────────────────────── */}
        <Route path="/branch/vrsnb"    element={<ProtectedRoute allowedRoles={['branch_vrsnb','admin']}><VRSNBDashboard /></ProtectedRoute>} />
        <Route path="/branch/snb"      element={<ProtectedRoute allowedRoles={['branch_snb','admin']}><SNBDashboard /></ProtectedRoute>} />
        <Route path="/branch/hosur"    element={<ProtectedRoute allowedRoles={['branch_hosur','admin']}><HosurDashboard /></ProtectedRoute>} />
        {/* ─────────────────────────────────────────────────────────────── */}

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
