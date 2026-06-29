import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CreditCard,
  FileText,
  History,
  ShoppingCart,
  WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CafeNavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  active: (pathname: string, search: string) => boolean;
  tone: string;
  activeTone: string;
};

const NAV_ITEMS: CafeNavItem[] = [
  {
    label: 'New Bill',
    path: '/billing',
    icon: <ShoppingCart className="size-3.5" />,
    active: (pathname, search) => pathname === '/billing' && !new URLSearchParams(search).get('tab'),
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    activeTone: 'border-emerald-700 bg-emerald-700 text-white shadow-sm',
  },
  {
    label: 'Advance',
    path: '/billing?tab=advance',
    icon: <FileText className="size-3.5" />,
    active: (pathname, search) => pathname === '/billing' && new URLSearchParams(search).get('tab') === 'advance',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    activeTone: 'border-amber-500 bg-amber-500 text-white shadow-sm',
  },
  {
    label: 'History',
    path: '/billing?tab=history',
    icon: <History className="size-3.5" />,
    active: (pathname, search) => pathname === '/billing' && new URLSearchParams(search).get('tab') === 'history',
    tone: 'border-slate-200 bg-white text-slate-700',
    activeTone: 'border-slate-800 bg-slate-800 text-white shadow-sm',
  },
  {
    label: 'Payment Mode Edit',
    path: '/billing?tab=payment-edit',
    icon: <CreditCard className="size-3.5" />,
    active: (pathname, search) => pathname === '/billing' && new URLSearchParams(search).get('tab') === 'payment-edit',
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    activeTone: 'border-blue-700 bg-blue-700 text-white shadow-sm',
  },
  {
    label: 'Closure',
    path: '/daily-closure',
    icon: <WalletCards className="size-3.5" />,
    active: (pathname) => pathname === '/daily-closure',
    tone: 'border-violet-200 bg-violet-50 text-violet-800',
    activeTone: 'border-violet-700 bg-violet-700 text-white shadow-sm',
  },
  {
    label: 'Alerts',
    path: '/billing?tab=alerts',
    icon: <Bell className="size-3.5" />,
    active: (pathname, search) => pathname === '/billing' && new URLSearchParams(search).get('tab') === 'alerts',
    tone: 'border-rose-200 bg-rose-50 text-rose-800',
    activeTone: 'border-rose-600 bg-rose-600 text-white shadow-sm',
  },
];

export default function CafeBillerTopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="cafe-biller-top-nav shrink-0 border-b border-amber-100/90 bg-[#fffaf1] px-2 py-1.5 sm:px-3" aria-label="Cafe biller navigation">
      <div className="cafe-biller-top-nav-scroll flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-wrap">
        {NAV_ITEMS.map((item) => {
          const isActive = item.active(location.pathname, location.search);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                'cafe-biller-top-nav-button inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black transition active:scale-[0.97]',
                isActive ? item.activeTone : item.tone,
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
