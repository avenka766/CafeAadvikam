// src/components/layout/BottomNav.tsx  ← REPLACE EXISTING FILE
import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, Receipt, UtensilsCrossed, History, BarChart3,
  LayoutDashboard, Users, QrCode, ChefHat, CalendarCheck,
  Inbox, Store, Flame, Package, ShoppingCart,  // ShoppingCart = branch sales icon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

export default function BottomNav() {
  const { currentUser } = useAuthStore();
  const navigate  = useNavigate();
  const location  = useLocation();

  if (!currentUser) return null;

  const navItems: NavItem[] = [];

  // ── Cafe roles ──────────────────────────────────────────────────────────────
  if (currentUser.role === 'order_taker') {
    navItems.push(
      { label: 'Order Pad', icon: <ClipboardList className="size-5" />, path: '/order-pad' },
      { label: 'History',   icon: <History       className="size-5" />, path: '/order-history' },
    );
  } else if (currentUser.role === 'billing') {
    navItems.push(
      { label: 'Orders',  icon: <Receipt  className="size-5" />, path: '/billing' },
      { label: 'History', icon: <History  className="size-5" />, path: '/order-history' },
    );
  } else if (currentUser.role === 'kitchen') {
    navItems.push(
      { label: 'Kitchen', icon: <ChefHat className="size-5" />, path: '/kitchen' },
      { label: 'History', icon: <History className="size-5" />, path: '/order-history' },
    );
  } else if (currentUser.role === 'admin') {
    navItems.push(
      { label: 'Dashboard',  icon: <LayoutDashboard className="size-5" />, path: '/admin-dashboard' },
      { label: 'Menu',       icon: <UtensilsCrossed  className="size-5" />, path: '/menu-management' },
      { label: 'QR Code',    icon: <QrCode           className="size-5" />, path: '/qr-menu' },
      { label: 'Reports',    icon: <BarChart3         className="size-5" />, path: '/sales-report' },
      { label: 'Attendance', icon: <CalendarCheck     className="size-5" />, path: '/attendance-salary' },
      { label: 'Staff',      icon: <Users             className="size-5" />, path: '/staff-management' },
      { label: 'History',    icon: <History           className="size-5" />, path: '/order-history' },
    );

  // ── Bakery workflow roles ────────────────────────────────────────────────────
  } else if (currentUser.role === 'order_receiver') {
    navItems.push(
      { label: 'Receive Orders', icon: <Inbox    className="size-5" />, path: '/bakery/receive' },
    );
  } else if (currentUser.role === 'store') {
    navItems.push(
      { label: 'Store',   icon: <Store   className="size-5" />, path: '/bakery/store' },
    );
  } else if (currentUser.role === 'baker') {
    navItems.push(
      { label: 'Baker',   icon: <Flame   className="size-5" />, path: '/bakery/baker' },
    );
  } else if (currentUser.role === 'packing') {
    navItems.push(
      { label: 'Packing', icon: <Package className="size-5" />, path: '/bakery/packing' },
    );

  // ── NEW: Branch sales roles ──────────────────────────────────────────────────
  } else if (currentUser.role === 'branch_vrsnb') {
    navItems.push(
      { label: 'VR SNB', icon: <ShoppingCart className="size-5" />, path: '/branch/vrsnb' },
    );
  } else if (currentUser.role === 'branch_snb') {
    navItems.push(
      { label: 'SNB', icon: <ShoppingCart className="size-5" />, path: '/branch/snb' },
    );
  } else if (currentUser.role === 'branch_hosur') {
    navItems.push(
      { label: 'Hosur', icon: <ShoppingCart className="size-5" />, path: '/branch/hosur' },
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors min-h-[56px] justify-center relative',
                isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
              )}
            >
              {item.icon}
              <span className="text-[10px] font-body font-semibold">{item.label}</span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
