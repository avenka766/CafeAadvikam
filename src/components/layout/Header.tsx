import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Leaf } from 'lucide-react';
import { CAFE_CONFIG } from '@/constants/config';

export default function Header() {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = ['/', '/login', '/menu', '/digital-menu'].includes(location.pathname);
  const isQROrder = location.pathname === '/order';
  const isTracking = location.pathname === '/order/track';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Hide header on QR order page and tracking page — they have their own headers
  if (isQROrder || isTracking) return null;

  if (isPublic) {
    return (
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <div className="size-8 rounded-full cafe-gradient flex items-center justify-center">
              <Leaf className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold text-foreground">
              {CAFE_CONFIG.name}
            </span>
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 text-sm font-semibold font-body cafe-gradient text-primary-foreground rounded-lg active:scale-95 transition-transform"
          >
            Staff Login
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 cafe-gradient text-primary-foreground">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-white/15 flex items-center justify-center">
            <Leaf className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base font-semibold">{CAFE_CONFIG.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1.5">
            <User className="size-3.5" />
            <span className="text-xs font-body font-medium">
              {currentUser?.displayName}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="size-9 rounded-lg bg-white/15 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Logout"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
