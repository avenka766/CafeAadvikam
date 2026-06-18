import { useAuthStore } from "@/stores/authStore";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ClipboardList,
  Receipt,
  UtensilsCrossed,
  History,
  LayoutDashboard,
  Users,
  QrCode,
  ChefHat,
  CalendarCheck,
  Inbox,
  Store,
  Flame,
  Package,
  ShoppingCart,
  Settings2,
  BarChart3,
  FileText,
  Bell,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/bakery/notificationStore";
import { useInvoiceStore } from "@/bakery/invoiceStore";
import { useEffect } from "react";

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

  const {
    unreadCount,
    loaded: notifLoaded,
    load: loadNotifs,
  } = useNotificationStore();
  const { invoices, loaded: invLoaded, load: loadInvoices } = useInvoiceStore();

  const isAdmin = currentUser?.role === "admin";
  const isAdminVrsnb = currentUser?.role === "admin_vrsnb";
  const isAnyAdmin = isAdmin || isAdminVrsnb;

  useEffect(() => {
    if (!isAnyAdmin) return;
    if (!notifLoaded) loadNotifs();
    if (isAdmin && !invLoaded) loadInvoices();
    const id = setInterval(() => {
      loadNotifs();
      if (isAdmin) loadInvoices();
    }, 20_000);
    return () => clearInterval(id);
  }, [isAnyAdmin, isAdmin, notifLoaded, invLoaded, loadNotifs, loadInvoices]);

  const unread = isAnyAdmin ? unreadCount() : 0;
  const pendingInvoices = isAdmin
    ? invoices.filter((i) => i.status === "pending_review").length
    : 0;

  if (!currentUser) return null;

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
  } else if (currentUser.role === "billing") {
    navItems.push(
      {
        label: "Orders",
        icon: <Receipt className="size-5" />,
        path: "/billing",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/order-history",
      },
      {
        label: "Counter",
        icon: <WalletCards className="size-5" />,
        path: "/daily-closure",
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
        path: "/admin/invoices",
        badge: pendingInvoices || undefined,
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
  } else if (currentUser.role === "receiver_vrsnb") {
    navItems.push(
      {
        label: "Order",
        icon: <Inbox className="size-5" />,
        path: "/bakery/receive/vrsnb",
      },
      {
        label: "Placed",
        icon: <FileText className="size-5" />,
        path: "/bakery/receive/vrsnb?tab=placed",
      },
      {
        label: "Alerts",
        icon: <Bell className="size-5" />,
        path: "/bakery/receive/vrsnb?tab=alerts",
      },
      {
        label: "Stock",
        icon: <Package className="size-5" />,
        path: "/bakery/receive/vrsnb?tab=stock",
      },
      {
        label: "Count",
        icon: <ClipboardList className="size-5" />,
        path: "/bakery/receive/vrsnb?tab=stock-count",
      },
    );
  } else if (currentUser.role === "receiver_snb") {
    navItems.push(
      {
        label: "Order",
        icon: <Inbox className="size-5" />,
        path: "/bakery/receive/snb",
      },
      {
        label: "Placed",
        icon: <FileText className="size-5" />,
        path: "/bakery/receive/snb?tab=placed",
      },
      {
        label: "Alerts",
        icon: <Bell className="size-5" />,
        path: "/bakery/receive/snb?tab=alerts",
      },
      {
        label: "Stock",
        icon: <Package className="size-5" />,
        path: "/bakery/receive/snb?tab=stock",
      },
      {
        label: "PO",
        icon: <ShoppingCart className="size-5" />,
        path: "/bakery/receive/snb?tab=po",
      },
      {
        label: "Count",
        icon: <ClipboardList className="size-5" />,
        path: "/bakery/receive/snb?tab=stock-count",
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
      { label: "Done", icon: <History className="size-5" />, path: "/bakery/baker?tab=completed" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/baker?tab=closure" },
    );
  } else if (currentUser.role === "packing") {
    navItems.push(
      { label: "Orders", icon: <Package className="size-5" />, path: "/bakery/packing" },
      { label: "Dispatch", icon: <History className="size-5" />, path: "/bakery/packing?tab=dispatched" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/bakery/packing?tab=closure" },
    );
  } else if (currentUser.role === "branch_vrsnb") {
    navItems.push(
      { label: "Bill", icon: <ShoppingCart className="size-5" />, path: "/branch/vrsnb" },
      { label: "Advance", icon: <FileText className="size-5" />, path: "/branch/vrsnb?tab=advance" },
      { label: "Returns", icon: <History className="size-5" />, path: "/branch/vrsnb?tab=returns" },
      { label: "History", icon: <History className="size-5" />, path: "/branch/vrsnb?tab=history" },
      { label: "Closure", icon: <WalletCards className="size-5" />, path: "/branch/vrsnb?tab=closure" },
      { label: "Alerts", icon: <Bell className="size-5" />, path: "/branch/vrsnb?tab=alerts" },
    );
  } else if (currentUser.role === "branch_snb") {
    navItems.push(
      { label: "Bill", icon: <ShoppingCart className="size-5" />, path: "/branch/snb" },
      { label: "Advance", icon: <FileText className="size-5" />, path: "/branch/snb?tab=advance" },
      { label: "Returns", icon: <History className="size-5" />, path: "/branch/snb?tab=returns" },
      { label: "History", icon: <History className="size-5" />, path: "/branch/snb?tab=history" },
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
        label: "Credit",
        icon: <WalletCards className="size-5" />,
        path: "/admin-vrsnb?tab=credit",
      },
      {
        label: "Items",
        icon: <Settings2 className="size-5" />,
        path: "/admin-vrsnb/items",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/admin-vrsnb/history",
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
        label: "Items",
        icon: <Settings2 className="size-5" />,
        path: "/admin-snb/items",
      },
      {
        label: "History",
        icon: <History className="size-5" />,
        path: "/admin-snb/history",
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
      {/* Frosted floating nav bar — z-50 (N-08: was z-40, modals are z-50 so nav must match or be above) */}
      <nav
        className="app-bottom-nav fixed bottom-0 left-0 right-0 z-[65] md:hidden"
        data-safe-bottom
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div
          className="mx-3 mb-3 rounded-2xl overflow-hidden"
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
