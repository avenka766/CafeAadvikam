// src/App.tsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import OfflineBanner from '@/components/layout/OfflineBanner';
import WorkspaceChrome from '@/components/layout/WorkspaceChrome';
import { getRoleDefaultPath } from '@/lib/routing';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import MenuPage from '@/pages/MenuPage';
import OrderPad from '@/pages/OrderPad';
import BillingDashboard from '@/pages/BillingDashboard';
import DailyClosure from '@/pages/DailyClosure';
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
import VRSNBDashboard from '@/pages/VRSNBDashboard';
import SNBDashboard   from '@/pages/SNBDashboard';
import HosurDashboard from '@/pages/HosurDashboard';
import AdminVRSNBDashboard from '@/pages/AdminVRSNBDashboard';
import AdminSNBDashboard   from '@/pages/AdminSNBDashboard';
import OwnerDashboard      from '@/pages/OwnerDashboard';
import VRSNBItemsPage      from '@/pages/VRSNBItemsPage';
import SNBItemsPage        from '@/pages/SNBItemsPage';
import VRSNBHistoryPage    from '@/pages/VRSNBHistoryPage';
import SNBHistoryPage      from '@/pages/SNBHistoryPage';
import AdminInvoicesPage   from '@/pages/AdminInvoicesPage';
import AdminAlertsPage     from '@/pages/AdminAlertsPage';

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
  const publicRoutes = ['/', '/login', '/menu', '/digital-menu', '/order', '/order/track'];
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
      <Routes>
        <Route path="/"             element={<Landing />} />
        <Route path="/login"        element={<Login />} />
        <Route path="/menu"         element={<MenuPage />} />
        <Route path="/digital-menu" element={<DigitalMenu />} />
        <Route path="/order"        element={<QROrderPage />} />
        <Route path="/order/track"  element={<OrderTrackingPage />} />

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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
