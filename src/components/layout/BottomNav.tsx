import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, Receipt, UtensilsCrossed, History,
  LayoutDashboard, Users, QrCode, ChefHat, CalendarCheck,
  Inbox, Store, Flame, Package, ShoppingCart, Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem { label: string; icon: React.ReactNode; path: string; }

export default function BottomNav() {
  const { currentUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  if (!currentUser) return null;

  const navItems: NavItem[] = [];

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
      { label: 'QR',         icon: <QrCode           className="size-5" />, path: '/qr-menu' },
      { label: 'Attendance', icon: <CalendarCheck     className="size-5" />, path: '/attendance-salary' },
      { label: 'Staff',      icon: <Users             className="size-5" />, path: '/staff-management' },
      { label: 'Items',      icon: <Settings2         className="size-5" />, path: '/bakery/items'  },
      { label: 'Recipes',    icon: <ChefHat           className="size-5" />, path: '/bakery/recipes' },
      { label: 'History',    icon: <History           className="size-5" />, path: '/order-history' },
    );
  } else if (currentUser.role === 'order_receiver') {
    navItems.push({ label: 'Receive', icon: <Inbox    className="size-5" />, path: '/bakery/receive' });
  } else if (currentUser.role === 'store') {
    navItems.push({ label: 'Store',   icon: <Store   className="size-5" />, path: '/bakery/store' });
  } else if (currentUser.role === 'baker') {
    navItems.push({ label: 'Baker',   icon: <Flame   className="size-5" />, path: '/bakery/baker' });
  } else if (currentUser.role === 'packing') {
    navItems.push({ label: 'Packing', icon: <Package className="size-5" />, path: '/bakery/packing' });
  } else if (currentUser.role === 'branch_vrsnb') {
    navItems.push({ label: 'VR SNB',  icon: <ShoppingCart className="size-5" />, path: '/branch/vrsnb' });
  } else if (currentUser.role === 'branch_snb') {
    navItems.push({ label: 'SNB',     icon: <ShoppingCart className="size-5" />, path: '/branch/snb' });
  } else if (currentUser.role === 'branch_hosur') {
    navItems.push({ label: 'Hosur',   icon: <ShoppingCart className="size-5" />, path: '/branch/hosur' });
  }

  if (navItems.length === 0) return null;

  return (
    <>
      {/* Frosted floating nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="mx-3 mb-3 rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(18,12,6,0.88)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <div className="flex items-stretch">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 relative transition-all duration-200 active:scale-90',
                    isActive ? 'text-white' : 'text-white/40 hover:text-white/70',
                  )}
                >
                  {/* Active glow bg */}
                  {isActive && (
                    <span
                      className="absolute inset-1 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.08)' }}
                    />
                  )}
                  {/* Active top indicator */}
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                      style={{ width: 28, height: 2, background: 'linear-gradient(90deg, hsl(164 52% 50%), hsl(164 52% 38%))' }}
                    />
                  )}
                  <span className={cn('relative z-10 transition-transform duration-200', isActive && 'scale-110')}>
                    {item.icon}
                  </span>
                  <span className={cn(
                    'relative z-10 font-body font-semibold transition-all duration-200',
                    navItems.length > 5 ? 'text-[8px]' : 'text-[10px]',
                    isActive && 'text-primary',
                  )}>
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
