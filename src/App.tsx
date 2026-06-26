// src/App.tsx
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import OfflineBanner from '@/components/layout/OfflineBanner';
import DataHealthBanner from '@/components/layout/DataHealthBanner';
import WorkspaceChrome from '@/components/layout/WorkspaceChrome';
import { getRoleDefaultPath } from '@/lib/routing';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
const MenuPage = lazy(() => import('@/pages/MenuPage'));
const OrderPad = lazy(() => import('@/pages/OrderPad'));
const BillingDashboard = lazy(() => import('@/pages/BillingDashboard'));
const DailyClosure = lazy(() => import('@/pages/DailyClosure'));
const MenuManagement = lazy(() => import('@/pages/MenuManagement'));
const OrderHistory = lazy(() => import('@/pages/OrderHistory'));
const SalesReport = lazy(() => import('@/pages/SalesReport'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const StaffManagement = lazy(() => import('@/pages/StaffManagement'));
const QRMenuPage = lazy(() => import('@/pages/QRMenuPage'));
const BakeryOrderPage = lazy(() => import('@/pages/BakeryOrderPage'));
const QROrderPage = lazy(() => import('@/pages/QROrderPage'));
const KitchenDashboard = lazy(() => import('@/pages/KitchenDashboard'));
const DigitalMenu = lazy(() => import('@/pages/DigitalMenu'));
const OrderTrackingPage = lazy(() => import('@/pages/OrderTrackingPage'));
const CafeOrderTrackingPage = lazy(() => import('@/pages/CafeOrderTrackingPage'));
const AttendanceSalary = lazy(() => import('@/pages/AttendanceSalary'));
const OrderReceiverDashboard = lazy(() => import('@/bakery/OrderReceiverDashboard'));
const StoreDashboard = lazy(() => import('@/bakery/StoreDashboard'));
const BakerDashboard = lazy(() => import('@/bakery/BakerDashboard'));
const PackingDashboard = lazy(() => import('@/bakery/PackingDashboard'));
const BakeryItemManagement = lazy(() => import('@/bakery/BakeryItemManagement'));
const RecipeManagement = lazy(() => import('@/bakery/RecipeManagement'));
const VRSNBDashboard = lazy(() => import('@/pages/VRSNBDashboard'));
const SNBDashboard = lazy(() => import('@/pages/SNBDashboard'));
const HosurDashboard = lazy(() => import('@/pages/HosurDashboard'));
const AdminVRSNBDashboard = lazy(() => import('@/pages/AdminVRSNBDashboard'));
const AdminSNBDashboard = lazy(() => import('@/pages/AdminSNBDashboard'));
const OwnerDashboard = lazy(() => import('@/pages/OwnerDashboard'));
const VRSNBItemsPage = lazy(() => import('@/pages/VRSNBItemsPage'));
const SNBItemsPage = lazy(() => import('@/pages/SNBItemsPage'));
const VRSNBHistoryPage = lazy(() => import('@/pages/VRSNBHistoryPage'));
const SNBHistoryPage = lazy(() => import('@/pages/SNBHistoryPage'));
const AdminInvoicesPage = lazy(() => import('@/pages/AdminInvoicesPage'));
const AdminAlertsPage = lazy(() => import('@/pages/AdminAlertsPage'));

// ── INFRASTRUCTURE NOTE (MD Bug #4) ──────────────────────────────────────────
// The following Supabase RPCs and tables are required for a clean deployment.
// Keep supabase/migrations/ in sync with the live project before staging/restore.
// A fresh deployment still needs the atomic checkout migration installed:
//   complete_branch_checkout, stock decrement, credit settlement, and sequence RPCs.
// Required RPCs: complete_branch_checkout, get_next_bill_number, get_next_order_number,
//   settle_branch_credit_sale, decrement_branch_stock_strict, decrement_branch_stock,
//   increment_branch_stock, confirm_incoming_stock, archive_old_branch_sales,
//   verify_staff_password
// Required tables: branch_bill_headers, branch_daily_closure_ledger, branch_daily_closures,
//   branch_operation_records, app_state, branch_credit_sales, branch_credit_payments,
//   branch_stock_mismatches, store_invoices, branch_stock_adjustments (new — Bug #13)
// TODO: Export full schema from live Supabase and reconcile with supabase/migrations/.
// ─────────────────────────────────────────────────────────────────────────────


function AppRoutes() {
  const location = useLocation();
  const isLandingRoute = location.pathname === '/';
  const publicRoutes = ['/', '/login', '/menu', '/digital-menu', '/order', '/order/track', '/cafe-order', '/cafe-order/track'];
  const isPublicRoute = publicRoutes.includes(location.pathname);
  const { currentUser } = useAuthStore();
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
      if (useAuthStore.persist.hasHydrated()) setHydrated(true);
      const fallback = setTimeout(() => setHydrated(true), 300);
      return () => { unsub(); clearTimeout(fallback); };
    }
  }, [hydrated]);

  if (!hydrated) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 rounded-2xl bg-primary/10 animate-pulse" />
        <p className="text-sm font-body text-muted-foreground animate-pulse">Loading...</p>
      </div>
    </div>
  );

  const getDefaultRoute = () =>
    currentUser ? getRoleDefaultPath(currentUser.role) : '/';

  const routes = (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading workspace…</div>}>
      <Routes>
        <Route path="/"             element={<Landing />} />
        <Route path="/login"        element={<Login />} />
        <Route path="/menu"         element={<MenuPage />} />
        <Route path="/digital-menu" element={<DigitalMenu />} />
        <Route path="/order"             element={<BakeryOrderPage />} />
        <Route path="/order/track"       element={<OrderTrackingPage />} />
        <Route path="/cafe-order"        element={<QROrderPage />} />
        <Route path="/cafe-order/track"  element={<CafeOrderTrackingPage />} />

        <Route path="/order-pad"        element={<ProtectedRoute allowedRoles={['order_taker']}><OrderPad /></ProtectedRoute>} />
        <Route path="/billing"          element={<ProtectedRoute allowedRoles={['billing']}><BillingDashboard /></ProtectedRoute>} />
        <Route path="/daily-closure"    element={<ProtectedRoute allowedRoles={['billing', 'admin']}><DailyClosure /></ProtectedRoute>} />
        <Route path="/kitchen"          element={<ProtectedRoute allowedRoles={['kitchen']}><KitchenDashboard /></ProtectedRoute>} />
        <Route path="/menu-management"  element={<ProtectedRoute allowedRoles={['admin']}><MenuManagement /></ProtectedRoute>} />
        <Route path="/sales-report"     element={<ProtectedRoute allowedRoles={['admin']}><SalesReport /></ProtectedRoute>} />
        <Route path="/admin-dashboard"  element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/staff-management" element={<ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>} />
        <Route path="/qr-menu"          element={<ProtectedRoute allowedRoles={['admin']}><QRMenuPage /></ProtectedRoute>} />
        <Route path="/attendance-salary"element={<ProtectedRoute allowedRoles={['admin', 'admin_snb', 'admin_vrsnb', 'owner']}><AttendanceSalary /></ProtectedRoute>} />
        <Route path="/order-history"    element={<ProtectedRoute allowedRoles={['order_taker','billing','admin','kitchen']}><OrderHistory /></ProtectedRoute>} />

        <Route path="/bakery/receive/vrsnb" element={<ProtectedRoute allowedRoles={['receiver_vrsnb']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/receive/snb"   element={<ProtectedRoute allowedRoles={['receiver_snb']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/store"   element={<ProtectedRoute allowedRoles={['store']}><StoreDashboard /></ProtectedRoute>} />
        <Route path="/bakery/baker"   element={<ProtectedRoute allowedRoles={['baker']}><BakerDashboard /></ProtectedRoute>} />
        <Route path="/bakery/packing" element={<ProtectedRoute allowedRoles={['packing']}><PackingDashboard /></ProtectedRoute>} />
        <Route path="/bakery/items"   element={<ProtectedRoute allowedRoles={['admin']}><BakeryItemManagement /></ProtectedRoute>} />
        <Route path="/bakery/recipes" element={<ProtectedRoute allowedRoles={['admin']}><RecipeManagement /></ProtectedRoute>} />

        <Route path="/branch/vrsnb"  element={<ProtectedRoute allowedRoles={['branch_vrsnb','admin','admin_vrsnb','owner']}><VRSNBDashboard /></ProtectedRoute>} />
        <Route path="/branch/snb"    element={<ProtectedRoute allowedRoles={['branch_snb','admin','admin_snb','owner']}><SNBDashboard /></ProtectedRoute>} />
        <Route path="/branch/hosur"  element={<ProtectedRoute allowedRoles={['branch_hosur','admin','owner']}><HosurDashboard /></ProtectedRoute>} />

        <Route path="/admin-vrsnb"         element={<ProtectedRoute allowedRoles={['admin_vrsnb', 'admin', 'owner']}><AdminVRSNBDashboard /></ProtectedRoute>} />
        <Route path="/admin-vrsnb/items"   element={<ProtectedRoute allowedRoles={['admin_vrsnb', 'admin', 'owner']}><VRSNBItemsPage /></ProtectedRoute>} />
        <Route path="/admin-vrsnb/history" element={<ProtectedRoute allowedRoles={['admin_vrsnb', 'admin', 'owner']}><VRSNBHistoryPage /></ProtectedRoute>} />
        <Route path="/admin-snb"           element={<ProtectedRoute allowedRoles={['admin_snb', 'admin', 'owner']}><AdminSNBDashboard /></ProtectedRoute>} />
        <Route path="/admin-snb/items"     element={<ProtectedRoute allowedRoles={['admin_snb', 'admin', 'owner']}><SNBItemsPage /></ProtectedRoute>} />
        <Route path="/admin-snb/history"   element={<ProtectedRoute allowedRoles={['admin_snb', 'admin', 'owner']}><SNBHistoryPage /></ProtectedRoute>} />
        <Route path="/admin/invoices"      element={<ProtectedRoute allowedRoles={['admin']}><AdminInvoicesPage /></ProtectedRoute>} />
        <Route path="/admin/alerts"        element={<ProtectedRoute allowedRoles={['admin', 'admin_vrsnb', 'admin_snb']}><AdminAlertsPage /></ProtectedRoute>} />
        <Route path="/owner"               element={<ProtectedRoute allowedRoles={['owner']}><OwnerDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
      </Routes>
    </Suspense>
  );

  return (
    <>
      {!isLandingRoute && <Header />}
      {currentUser && !isPublicRoute ? (
        <WorkspaceChrome>{routes}</WorkspaceChrome>
      ) : routes}
      {currentUser && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <DataHealthBanner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}