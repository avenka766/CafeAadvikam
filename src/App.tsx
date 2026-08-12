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
import { isNativeApp } from '@/lib/platform';
import { useMenuStore } from '@/stores/menuStore';
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
const CakeMasterDashboard = lazy(() => import('@/bakery/CakeMasterDashboard'));
const PlannerDashboard = lazy(() => import('@/bakery/PlannerDashboard'));
const BakeryItemManagement = lazy(() => import('@/bakery/BakeryItemManagement'));
const RecipeManagement = lazy(() => import('@/bakery/RecipeManagement'));
const VRSNBDashboard = lazy(() => import('@/pages/VRSNBDashboard'));
const SNBDashboard = lazy(() => import('@/pages/SNBDashboard'));
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



// Owner Android app — silent auto-login (2026-08-12, explicit owner request:
// "I don't want the app to have a login screen... they should see the
// data"). This is a genuine security tradeoff, made knowingly: these
// credentials ship inside the .apk itself, so anyone who obtains the app
// package file (not just the phone) could extract them and authenticate as
// this account remotely. To limit the blast radius of that:
//   - This is a DEDICATED account ("owner-app-device"), not either real
//     Owner's personal login — their own usernames/passwords are never
//     embedded anywhere and keep working independently.
//   - If this credential ever needs to be revoked, delete/reset just this
//     one staff record server-side (Staff Management) — it doesn't touch
//     the real Owner accounts.
// Only wired in for the native build; the web dashboard (used by every
// other role, on shared/less-trusted devices) is completely unaffected and
// still requires a real login.
const OWNER_AUTOLOGIN_USERNAME = 'owner-app-device';
const OWNER_AUTOLOGIN_PASSWORD = 'UaUs36zfZmL-MYxlMsYMRMYwE4zP3kKU';

function LiveMenuSync() {
  const { loadMenu, subscribe } = useMenuStore();
  useEffect(() => {
    void loadMenu();
    return subscribe();
  }, [loadMenu, subscribe]);
  return null;
}

function AppRoutes() {
  const location = useLocation();
  const isLandingRoute = location.pathname === '/';
  const publicRoutes = ['/', '/login', '/menu', '/digital-menu', '/order', '/order/track', '/cafe-order', '/cafe-order/track'];
  const isPublicRoute = publicRoutes.includes(location.pathname);
  const { currentUser } = useAuthStore();
  const native = isNativeApp();
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

  // Owner Android app — silent auto-login. Runs once, after the persisted
  // session has finished hydrating, only when native and no session was
  // restored (i.e. a genuinely fresh install, or a wiped one during
  // testing). See OWNER_AUTOLOGIN_USERNAME/PASSWORD above for the reasoning.
  // `status` gates rendering below so the real login screen never flashes
  // on screen while this is in flight — 'done' covers both "logged in
  // already" and "auto-login finished" (success or failure), the latter
  // falling through to the normal login screen as a safety net.
  const [autoLoginStatus, setAutoLoginStatus] = useState<'idle' | 'trying' | 'done'>('idle');
  useEffect(() => {
    if (!hydrated) return;
    if (!native || currentUser) { setAutoLoginStatus('done'); return; }
    if (autoLoginStatus !== 'idle') return;
    setAutoLoginStatus('trying');
    void useAuthStore.getState().login(OWNER_AUTOLOGIN_USERNAME, OWNER_AUTOLOGIN_PASSWORD)
      .finally(() => setAutoLoginStatus('done'));
  }, [hydrated, native, currentUser, autoLoginStatus]);

  if (!hydrated || (native && autoLoginStatus !== 'done')) return (
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
        <Route path="/admin-dashboard/planning" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/staff-management" element={<ProtectedRoute allowedRoles={['admin']}><StaffManagement /></ProtectedRoute>} />
        <Route path="/qr-menu"          element={<ProtectedRoute allowedRoles={['admin']}><QRMenuPage /></ProtectedRoute>} />
        <Route path="/attendance-salary"element={<ProtectedRoute allowedRoles={['admin', 'admin_snb', 'admin_vrsnb', 'owner']}><AttendanceSalary /></ProtectedRoute>} />
        <Route path="/order-history"    element={<ProtectedRoute allowedRoles={['order_taker','billing','admin','kitchen']}><OrderHistory /></ProtectedRoute>} />

        <Route path="/bakery/receive/vrsnb" element={<ProtectedRoute allowedRoles={['receiver_vrsnb']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/receive/snb"   element={<ProtectedRoute allowedRoles={['receiver_snb']}><OrderReceiverDashboard /></ProtectedRoute>} />
        <Route path="/bakery/store"   element={<ProtectedRoute allowedRoles={['store']}><StoreDashboard /></ProtectedRoute>} />
        <Route path="/bakery/cake-master" element={<ProtectedRoute allowedRoles={['cake_master']}><CakeMasterDashboard /></ProtectedRoute>} />
        <Route path="/bakery/planner" element={<ProtectedRoute allowedRoles={['planner', 'owner']}><PlannerDashboard /></ProtectedRoute>} />
        <Route path="/bakery/items"   element={<ProtectedRoute allowedRoles={['admin']}><BakeryItemManagement /></ProtectedRoute>} />
        <Route path="/bakery/recipes" element={<ProtectedRoute allowedRoles={['admin']}><RecipeManagement /></ProtectedRoute>} />

        <Route path="/branch/vrsnb"  element={<ProtectedRoute allowedRoles={['branch_vrsnb','admin','admin_vrsnb','owner']}><VRSNBDashboard /></ProtectedRoute>} />
        <Route path="/branch/snb"    element={<ProtectedRoute allowedRoles={['branch_snb','admin','admin_snb','owner']}><SNBDashboard /></ProtectedRoute>} />
        {/* /branch/hosur retired — Hosur billing/shops now embedded in Planner */}

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

  // Owner Android app (2026-08-07): this build is single-purpose (Owner
  // only, appId com.cafeaadvikam.owner) — the public marketing Landing page
  // and the multi-app WorkspaceChrome sidebar (built for switching between
  // Cafe billing, Planner, Store, Admin, etc. on a desktop) don't belong in
  // it. Not logged in → straight to the login screen, no Landing detour.
  // Logged in → OwnerDashboard renders its own dedicated native top bar and
  // tab strip (see OwnerDashboard.tsx), so Header/WorkspaceChrome/BottomNav
  // are skipped entirely rather than stacking a second, desktop-oriented
  // layer of navigation on top. None of this touches the web build, which
  // keeps its existing Header/WorkspaceChrome/BottomNav exactly as before.
  if (native && !currentUser && location.pathname === '/') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {!native && !isLandingRoute && <Header />}
      {!native && currentUser && !isPublicRoute ? (
        <WorkspaceChrome>{routes}</WorkspaceChrome>
      ) : routes}
      {!native && currentUser && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <DataHealthBanner />
      <BrowserRouter>
        <LiveMenuSync />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
