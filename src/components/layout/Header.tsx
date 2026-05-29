import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { CAFE_CONFIG } from '@/constants/config';
import { useVenueStore } from '@/stores/venueStore';
import cafeLogo from '@/assets/cafe-logo.png';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', order_taker: 'Order Staff', billing: 'Billing',
  kitchen: 'Kitchen', receiver_vrsnb: 'VRSNB Receiver', receiver_snb: 'SNB Receiver', receiver_hosur: 'Hosur Receiver', store: 'Store',
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
  owner: 'bg-rose-500/20 text-rose-700 border-rose-400/30',
};

export default function Header() {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeVenue } = useVenueStore();

  const isPublic = ['/', '/login', '/menu', '/digital-menu'].includes(location.pathname);
  const isQROrder = location.pathname === '/order';
  const isTracking = location.pathname === '/order/track';
  if (isQROrder || isTracking) return null;

  // N-12: venue-aware brand name — differentiate VRSNB vs SNB routes
  const isVrsnbRoute = location.pathname.startsWith('/admin-vrsnb') || location.pathname.startsWith('/branch/vrsnb');
  const isSnbRoute = location.pathname.startsWith('/admin-snb') || location.pathname.startsWith('/branch/snb') || location.pathname.startsWith('/bakery');
  const isBakeryRoute = isVrsnbRoute || isSnbRoute;
  const headerName = isVrsnbRoute ? 'VRSNB' : (activeVenue === 'bakery' || isSnbRoute) ? 'SNB Bakery' : CAFE_CONFIG.name;

  /* ── Public header ── */
  if (isPublic) {
    return (
      <header className="fixed top-0 left-0 right-0 z-40 glass border-b border-white/30">
        <div className="flex items-center justify-between px-4 h-14">
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
    <header className="fixed top-0 left-0 right-0 z-40 espresso-gradient text-white border-b border-white/8"
      style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.25)' }}>
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left — logo + name */}
        <div className="flex items-center gap-2.5">
          <img src={cafeLogo} alt="logo" className="size-8 rounded-xl object-cover border border-white/20" />
          <div className="leading-none">
            <p className="font-display text-base font-semibold text-white/95">{headerName}</p>
            <p className="text-[10px] font-body text-white/45 uppercase tracking-widest">{isVrsnbRoute ? 'VRSNB Admin Portal' : 'Staff Portal'}</p>
          </div>
        </div>

        {/* Right — user + logout */}
        <div className="flex items-center gap-2">
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
            onClick={() => { logout(); navigate('/'); }}
            className="size-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Logout"
          >
            <LogOut className="size-4 text-white/80" />
          </button>
        </div>
      </div>
    </header>
  );
}
