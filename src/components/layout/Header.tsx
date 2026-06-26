import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Wifi, ShieldCheck } from 'lucide-react';
import { CAFE_CONFIG } from '@/constants/config';
import { useVenueStore } from '@/stores/venueStore';
import cafeLogo from '@/assets/cafe-logo.png';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', order_taker: 'Order Staff', billing: 'Billing',
  kitchen: 'Kitchen', receiver_vrsnb: 'VRSNB Receiver', receiver_snb: 'SNB Receiver', store: 'Store',
  baker: 'Baker', packing: 'Packing', branch_vrsnb: 'VR SNB Branch',
  branch_snb: 'SNB Branch', branch_hosur: 'Hosur Branch',
  // N-04: previously missing role labels
  admin_vrsnb: 'VRSNB Admin', admin_snb: 'SNB Admin', owner: 'Owner',
};
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-amber-500/20 text-amber-700 border-amber-400/30',
  order_taker: 'bg-blue-500/20 text-blue-700 border-blue-400/30',
  billing: 'bg-emerald-500/20 text-emerald-700 border-emerald-400/30',
  kitchen: 'bg-orange-500/20 text-orange-700 border-orange-400/30',
  // N-04: previously missing role colors
  admin_vrsnb: 'bg-purple-500/20 text-purple-700 border-purple-400/30',
  admin_snb: 'bg-indigo-500/20 text-indigo-700 border-indigo-400/30',
  branch_hosur: 'bg-emerald-500/20 text-emerald-700 border-emerald-400/30',
  owner: 'bg-rose-500/20 text-rose-700 border-rose-400/30',
};

export default function Header() {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeVenue } = useVenueStore();

  const handleLogout = () => {
    logout();
    // Force a clean document navigation so no dashboard state, pending route
    // transition, or stale persisted store can immediately restore the session.
    window.location.replace('/login');
  };

  const isPublic = ['/', '/login', '/menu', '/digital-menu'].includes(location.pathname);
  const isCustomerOrder = ['/order', '/order/track', '/cafe-order', '/cafe-order/track'].includes(location.pathname);
  if (isCustomerOrder) return null;

  // N-12: venue-aware brand name — differentiate VRSNB vs SNB routes
  const isVrsnbRoute = location.pathname.startsWith('/admin-vrsnb') || location.pathname.startsWith('/branch/vrsnb');
  const isSnbRoute = location.pathname.startsWith('/admin-snb') || location.pathname.startsWith('/branch/snb') || location.pathname.startsWith('/bakery');
  const isBakeryRoute = isVrsnbRoute || isSnbRoute;
  const headerName = isVrsnbRoute ? 'VRSNB' : (activeVenue === 'bakery' || isSnbRoute) ? 'SNB Bakery' : CAFE_CONFIG.name;

  /* ── Public header ── */
  if (isPublic) {
    return (
      <header className="app-header fixed top-0 left-0 right-0 z-[70] glass border-b border-white/30">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 active:opacity-80 transition-opacity">
            <img src={cafeLogo} alt="logo" className="size-8 rounded-xl object-cover border border-white/40 shadow-sm" />
            <div className="leading-tight">
              <p className="font-display text-base font-bold text-foreground">{headerName}</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 text-xs font-body font-semibold cafe-gradient text-primary-foreground rounded-xl shadow-teal active:scale-95 transition-all"
          >
            Staff Login
          </button>
        </div>
      </header>
    );
  }

  /* ── Staff header ── */
  const roleColor = ROLE_COLORS[currentUser?.role || ''] || 'bg-primary/15 text-primary border-primary/20';

  return (
    <header className="app-header fixed top-0 left-0 right-0 lg:left-[288px] z-[70] text-white border-b border-white/10"
      style={{
        background: 'linear-gradient(135deg, rgba(28,16,8,0.96), rgba(14,57,46,0.96))',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        boxShadow: '0 12px 40px rgba(30,18,6,0.18)',
      }}>
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Left — logo + name */}
        <div className="flex items-center gap-2.5">
          <img src={cafeLogo} alt="logo" className="size-8 rounded-xl object-cover border border-white/20" />
          <div className="leading-none">
            <p className="font-display text-base font-semibold text-white/95">{headerName}</p>
            <p className="text-[10px] font-body text-white/50 uppercase tracking-[0.22em]">{isBakeryRoute ? 'Bakery operations' : 'Cafe operations'}</p>
          </div>
        </div>

        {/* Right — status + user + logout */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-bold text-white/70">
            <Wifi className="size-3.5 text-emerald-300" /> Online
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-bold text-white/70">
            <ShieldCheck className="size-3.5 text-amber-300" /> Role secured
          </div>
          {currentUser && (
            <div className="flex flex-col items-end">
              <span className="text-xs font-body font-semibold text-white/90 leading-none">
                {currentUser.displayName || currentUser.username}
              </span>
              <span className={cn(
                'text-[9px] font-body font-bold px-1.5 py-0.5 rounded-full border mt-0.5 uppercase tracking-wide',
                roleColor
              )}>
                {ROLE_LABELS[currentUser.role] || currentUser.role.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="size-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Exit dashboard"
            title="Exit dashboard"
          >
            <LogOut className="size-4 text-white/80" />
          </button>
        </div>
      </div>
    </header>
  );
}
