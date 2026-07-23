import { useAuthStore } from "@/stores/authStore";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ClipboardList,
  Receipt,
  RotateCcw,
  UtensilsCrossed,
  History,
  LayoutDashboard,
  Users,
  QrCode,
  ChefHat,
  CalendarCheck,
  Store,
  Flame,
  Package,
  PackageCheck,
  ShoppingCart,
  Settings2,
  BarChart3,
  FileText,
  Bell,
  WalletCards,
  CreditCard,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/bakery/notificationStore";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

export default function BottomNav() {
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isBranchBillingRole = currentUser?.role === 'branch_snb' || currentUser?.role === 'branch_vrsnb';
  const [branchNavVisible, setBranchNavVisible] = useState(false);
  const branchNavRef = useRef<HTMLElement | null>(null);
  const branchNavHideTimerRef = useRef<number | null>(null);

  const {
    unreadCount,
    loaded: notifLoaded,
    load: loadNotifs,
  } = useNotificationStore();

  const isAdmin = currentUser?.role === "admin";
  const isAdminVrsnb = currentUser?.role === "admin_vrsnb";
  const isAnyAdmin = isAdmin || isAdminVrsnb;

  useEffect(() => {
    if (!isAnyAdmin) return;
    if (!notifLoaded) loadNotifs();
    // EGRESS FIX: Raised from 20 s → 90 s. Notification badges don't need
    // sub-minute freshness; a 90 s cadence is invisible to users while cutting
    // BottomNav egress by ~78 %.
    const id = setInterval(() => {
      if (document.hidden) return;
      loadNotifs();
    }, 90_000);
    return () => clearInterval(id);
  }, [isAnyAdmin, notifLoaded, loadNotifs]);

  const clearBranchNavHideTimer = useCallback(() => {
    if (branchNavHideTimerRef.current !== null) {
      window.clearTimeout(branchNavHideTimerRef.current);
      branchNavHideTimerRef.current = null;
    }
  }, []);

  const showBranchNav = useCallback(() => {
    if (!isBranchBillingRole) return;
    clearBranchNavHideTimer();
    setBranchNavVisible(true);
  }, [clearBranchNavHideTimer, isBranchBillingRole]);

  const scheduleBranchNavHide = useCallback(() => {
    if (!isBranchBillingRole) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!finePointer) return;
    clearBranchNavHideTimer();
    branchNavHideTimerRef.current = window.setTimeout(() => {
      setBranchNavVisible(false);
      branchNavHideTimerRef.current = null;
    }, 180);
  }, [clearBranchNavHideTimer, isBranchBillingRole]);

  useEffect(() => {
    clearBranchNavHideTimer();
    if (!isBranchBillingRole) {
      setBranchNavVisible(true);
      return;
    }

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    setBranchNavVisible(!finePointer);

    const hideOnWindowBlur = () => {
      if (finePointer) setBranchNavVisible(false);
    };
    window.addEventListener('blur', hideOnWindowBlur);
    return () => {
      clearBranchNavHideTimer();
      window.removeEventListener('blur', hideOnWindowBlur);
    };
  }, [clearBranchNavHideTimer, isBranchBillingRole, location.pathname, location.search]);

  useLayoutEffect(() => {
    if (!isBranchBillingRole) {
      document.documentElement.style.removeProperty('--branch-nav-reserved-h');
      return;
    }

    const nav = branchNavRef.current;
    const updateReservedHeight = () => {
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const shouldReserve = branchNavVisible || !finePointer;
      const height = shouldReserve && nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--branch-nav-reserved-h', `${height}px`);
    };

    updateReservedHeight();
    const observer = nav && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateReservedHeight)
      : null;
    if (nav) observer?.observe(nav);
    window.addEventListener('resize', updateReservedHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateReservedHeight);
      document.documentElement.style.removeProperty('--branch-nav-reserved-h');
    };
  }, [branchNavVisible, isBranchBillingRole]);

  const unread = isAnyAdmin ? unreadCount() : 0;

  if (!currentUser) return null;
  // Cafe Biller navigation is rendered in the compact top command bar.
  if (currentUser.role === 'billing') return null;
  // SNB branch billing now has its own in-page tab strip (Bill/Advance/Returns/
  // History/Payment/Closure/Alerts) in the billing top bar, so the floating
  // bottom nav is redundant here. VRSNB keeps the bottom nav unchanged.
  if (currentUser.role === 'branch_snb') return null;

  const navItems: NavItem[] = [];

  if (currentUser.role === "order_taker") {
    navItems.push(
      {
        label: "Order Pad",
        icon: <ClipboardList className="size-5" />,
        path: "/order-pad",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/order-history",
      },
    );
  } else if (currentUser.role === "kitchen") {
    navItems.push(
      {
        label: "Kitchen",
        icon: <ChefHat className="size-5" />,
        path: "/kitchen",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/order-history",
      },
    );
  } else if (currentUser.role === "admin") {
    navItems.push(
      {
        label: "Dashboard",
        icon: <LayoutDashboard className="size-5" />,
        path: "/admin-dashboard",
      },
      { label: "QR", icon: <QrCode className="size-5" />, path: "/qr-menu" },
      {
        label: "Attendance",
        icon: <CalendarCheck className="size-5" />,
        path: "/attendance-salary",
      },
      {
        label: "Staff",
        icon: <Users className="size-5" />,
        path: "/staff-management",
      },
      {
        label: "Items",
        icon: <Settings2 className="size-5" />,
        path: "/bakery/items",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/order-history",
      },
      {
        label: "Invoices",
        icon: <FileText className="size-5" />,
        path: "/admin-dashboard?tab=invoices",
      },
      {
        label: "Disputes",
        icon: <ClipboardList className="size-5" />,
        path: "/admin-dashboard?tab=stock-disputes",
      },
      {
        label: "Alerts",
        icon: <Bell className="size-5" />,
        path: "/admin/alerts",
        badge: unread || undefined,
      },
    );
  } else if (currentUser.role === "store") {
    navItems.push(
      { label: "Orders", icon: <Package className="size-5" />, path: "/bakery/store" },
      { label: "History", icon: <History className="size-5" />, path: "/bakery/store?tab=history" },
      { label: "Stock", icon: <Store className="size-5" />, path: "/bakery/store?tab=inventory" },
      { label: "Invoices", icon: <FileText className="size-5" />, path: "/bakery/store?tab=invoices" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/store?tab=closure" },
      { label: "Reports", icon: <BarChart3 className="size-5" />, path: "/bakery/store?tab=report" },
    );
  } else if (currentUser.role === "baker") {
    navItems.push(
      { label: "Orders", icon: <Flame className="size-5" />, path: "/bakery/baker" },
      { label: "Corrections", icon: <RotateCcw className="size-5" />, path: "/bakery/baker?tab=corrections" },
      { label: "Done", icon: <History className="size-5" />, path: "/bakery/baker?tab=completed" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/baker?tab=closure" },
    );
  } else if (["sweet_master", "savouries_master", "cookies_master", "puffs_master", "bakery_master"].includes(currentUser.role)) {
    navItems.push(
      { label: "Orders", icon: <Flame className="size-5" />, path: "/bakery/production" },
      { label: "Corrections", icon: <RotateCcw className="size-5" />, path: "/bakery/production?tab=corrections" },
      { label: "Done", icon: <History className="size-5" />, path: "/bakery/production?tab=completed" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/production?tab=closure" },
    );
  } else if (currentUser.role === "packing") {
    navItems.push(
      { label: "Orders", icon: <Package className="size-5" />, path: "/bakery/packing" },
      { label: "Transfer In", icon: <History className="size-5" />, path: "/bakery/packing?tab=transfer-in" },
      { label: "Billing", icon: <ShoppingCart className="size-5" />, path: "/bakery/packing?tab=billing" },
      { label: "Leftover", icon: <History className="size-5" />, path: "/bakery/packing?tab=leftover" },
      { label: "Dispatched", icon: <History className="size-5" />, path: "/bakery/packing?tab=dispatched" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/packing?tab=closure" },
    );
  } else if (currentUser.role === "branch_vrsnb") {
    navItems.push(
      { label: "Bill", icon: <ShoppingCart className="size-5" />, path: "/branch/vrsnb" },
      { label: "Advance", icon: <FileText className="size-5" />, path: "/branch/vrsnb?tab=advance" },
      { label: "Returns", icon: <History className="size-5" />, path: "/branch/vrsnb?tab=returns" },
      { label: "History", icon: <History className="size-5" />, path: "/branch/vrsnb?tab=history" },
      { label: "Payment Edit", icon: <CreditCard className="size-5" />, path: "/branch/vrsnb?tab=payment-edit" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/branch/vrsnb?tab=closure" },
      { label: "Alerts", icon: <Bell className="size-5" />, path: "/branch/vrsnb?tab=alerts" },
    );
  } else if (currentUser.role === "branch_snb") {
    navItems.push(
      { label: "Bill", icon: <ShoppingCart className="size-5" />, path: "/branch/snb" },
      { label: "Advance", icon: <FileText className="size-5" />, path: "/branch/snb?tab=advance" },
      { label: "Returns", icon: <History className="size-5" />, path: "/branch/snb?tab=returns" },
      { label: "History", icon: <History className="size-5" />, path: "/branch/snb?tab=history" },
      { label: "Payment Edit", icon: <CreditCard className="size-5" />, path: "/branch/snb?tab=payment-edit" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/branch/snb?tab=closure" },
      { label: "Alerts", icon: <Bell className="size-5" />, path: "/branch/snb?tab=alerts" },
    );
  } else if (currentUser.role === "branch_hosur") {
    navItems.push(
      { label: "Shops", icon: <Store className="size-5" />, path: "/branch/hosur?tab=shops" },
      { label: "Order", icon: <ShoppingCart className="size-5" />, path: "/branch/hosur?tab=newOrder" },
      { label: "Receive", icon: <Package className="size-5" />, path: "/branch/hosur?tab=receiving" },
      { label: "Billing", icon: <FileText className="size-5" />, path: "/branch/hosur?tab=billing" },
      { label: "Reports", icon: <History className="size-5" />, path: "/branch/hosur?tab=reports" },
    );
  } else if (currentUser.role === "admin_vrsnb") {
    navItems.push(
      {
        label: "Dashboard",
        icon: <LayoutDashboard className="size-5" />,
        path: "/admin-vrsnb",
      },
      {
        label: "Sales",
        icon: <Receipt className="size-5" />,
        path: "/admin-vrsnb?tab=sales",
      },
      {
        label: "Stock",
        icon: <Package className="size-5" />,
        path: "/admin-vrsnb?tab=stock",
      },
      {
        label: "Stock Synced",
        icon: <PackageCheck className="size-5" />,
        path: "/admin-vrsnb?tab=stock-synced",
      },
      {
        label: "Update Stock",
        icon: <Settings2 className="size-5" />,
        path: "/admin-vrsnb?tab=update-stock",
      },
      {
        label: "Expenses",
        icon: <WalletCards className="size-5" />,
        path: "/admin-vrsnb?tab=expenses",
      },
      {
        label: "Credit",
        icon: <WalletCards className="size-5" />,
        path: "/admin-vrsnb?tab=credit",
      },
      {
        label: "Closure",
        icon: <CalendarCheck className="size-5" />,
        path: "/admin-vrsnb?tab=cashier-closure",
      },
      {
        label: "Reports",
        icon: <BarChart3 className="size-5" />,
        path: "/admin-vrsnb?tab=reports",
      },
      {
        label: "Items",
        icon: <Settings2 className="size-5" />,
        path: "/admin-vrsnb/items",
      },
      {
        label: "Audit",
        icon: <ClipboardList className="size-5" />,
        path: "/admin-vrsnb?tab=audit-stock",
      },
      {
        label: "Alerts",
        icon: <Bell className="size-5" />,
        path: "/admin/alerts",
        badge: unread || undefined,
      },
    );
  } else if (currentUser.role === "admin_snb") {
    navItems.push(
      {
        label: "Dashboard",
        icon: <LayoutDashboard className="size-5" />,
        path: "/admin-snb",
      },
      {
        label: "Sales",
        icon: <Receipt className="size-5" />,
        path: "/admin-snb?tab=sales",
      },
      {
        label: "Stock",
        icon: <Package className="size-5" />,
        path: "/admin-snb?tab=stock",
      },
      {
        label: "Stock Synced",
        icon: <PackageCheck className="size-5" />,
        path: "/admin-snb?tab=stock-synced",
      },
      {
        label: "Update Stock",
        icon: <Settings2 className="size-5" />,
        path: "/admin-snb?tab=update-stock",
      },
      {
        label: "Suppliers",
        icon: <Truck className="size-5" />,
        path: "/admin-snb?tab=suppliers",
      },
      {
        label: "Expenses",
        icon: <WalletCards className="size-5" />,
        path: "/admin-snb?tab=expenses",
      },
      {
        label: "Invoices",
        icon: <FileText className="size-5" />,
        path: "/admin-snb?tab=invoices",
      },
      {
        label: "Returns",
        icon: <RotateCcw className="size-5" />,
        path: "/admin-snb?tab=purchase-returns",
      },
      {
        label: "Payments",
        icon: <WalletCards className="size-5" />,
        path: "/admin-snb?tab=payments",
      },
      {
        label: "Credit",
        icon: <WalletCards className="size-5" />,
        path: "/admin-snb?tab=credit",
      },
      {
        label: "Closure",
        icon: <CalendarCheck className="size-5" />,
        path: "/admin-snb?tab=cashier-closure",
      },
      {
        label: "Reports",
        icon: <BarChart3 className="size-5" />,
        path: "/admin-snb?tab=reports",
      },
      {
        label: "Audit",
        icon: <ClipboardList className="size-5" />,
        path: "/admin-snb?tab=audit-stock",
      },
      {
        label: "Items",
        icon: <Settings2 className="size-5" />,
        path: "/admin-snb/items",
      },
      {
        label: "Alerts",
        icon: <Bell className="size-5" />,
        path: "/admin/alerts",
        badge: unread || undefined,
      },
    );
  } else if (currentUser.role === "owner") {
    navItems.push({
      label: "Sales",
      icon: <BarChart3 className="size-5" />,
      path: "/owner",
    });
  }

  // N-10: don't render nav on login/public routes — avoids flash after logout
  const publicPaths = [
    "/",
    "/login",
    "/menu",
    "/digital-menu",
    "/order",
    "/order/track",
  ];
  if (navItems.length === 0 || publicPaths.includes(location.pathname))
    return null;

  // N-03 / U-03: admin has 8 items — use scrollable nav instead of compressing flex-1
  const useScrollableNav = navItems.length > 5;

  return (
    <>
      {isBranchBillingRole && (
        <div
          className="fixed inset-x-0 bottom-0 z-[64] hidden h-3 md:block"
          onMouseEnter={showBranchNav}
          onMouseLeave={scheduleBranchNavHide}
          aria-hidden="true"
        />
      )}
      {/* Frosted floating nav bar — z-50 (N-08: was z-40, modals are z-50 so nav must match or be above) */}
      <nav
        ref={branchNavRef}
        onMouseEnter={showBranchNav}
        onMouseLeave={scheduleBranchNavHide}
        className={cn(
          "app-bottom-nav fixed bottom-0 left-0 right-0 z-[65] px-3 pt-0 transition-[transform,opacity] duration-200 ease-out",
          isBranchBillingRole ? "block" : "md:hidden",
          isBranchBillingRole && !branchNavVisible && "md:translate-y-full md:opacity-0 md:pointer-events-none",
          isBranchBillingRole && branchNavVisible && "md:translate-y-0 md:opacity-100",
        )}
        data-safe-bottom
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(18,12,6,0.88)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {/* N-03/U-03: scrollable for >5 items so buttons keep readable width */}
          <div
            className={cn(
              "flex items-stretch",
              useScrollableNav && "overflow-x-auto",
            )}
          >
            {navItems.map((item) => {
              // N-13: use startsWith so sub-routes (/admin-vrsnb/items) still show active state.
              // Query-based receiver tabs must match the full route so Order, Placed, and Alerts don't all highlight together.
              const currentRoute = `${location.pathname}${location.search}`;
              const isQueryRoute = item.path.includes("?");
              const isActive = isQueryRoute
                ? currentRoute === item.path
                : (location.pathname === item.path && !location.search) ||
                  location.pathname.startsWith(item.path + "/");
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    // N-03/U-03: shrink-0 on scrollable nav keeps tap targets at full width
                    useScrollableNav
                      ? "shrink-0 flex flex-col items-center justify-center gap-1 py-3 px-4 relative transition-all duration-200 active:scale-90"
                      : "flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 relative transition-all duration-200 active:scale-90",
                    isActive
                      ? "text-white"
                      : "text-white/40 hover:text-white/70",
                  )}
                >
                  {/* Active glow bg */}
                  {isActive && (
                    <span
                      className="absolute inset-1 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    />
                  )}
                  {/* Active top indicator */}
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                      style={{
                        width: 28,
                        height: 2,
                        background:
                          "linear-gradient(90deg, hsl(164 52% 50%), hsl(164 52% 38%))",
                      }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 transition-transform duration-200",
                      isActive && "scale-110",
                    )}
                  >
                    {item.icon}
                    {/* Badge dot */}
                    {item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </span>
                  {/* U-03: label always at least 10px; 8px only used as fallback for edge cases */}
                  <span
                    className={cn(
                      "relative z-10 font-body font-semibold transition-all duration-200 text-[10px]",
                      isActive && "text-primary",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
