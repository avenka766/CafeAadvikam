import { useEffect, useState } from 'react';
import { AlertTriangle, LogIn, RefreshCw, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

type Health = { message: string; at: number; status?: number } | null;

export default function DataHealthBanner() {
  const [health, setHealth] = useState<Health>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    const failed = (event: Event) => setHealth((event as CustomEvent<NonNullable<Health>>).detail);
    const recovered = () => setHealth(null);
    const expired = () => {
      // Clear the stale local session immediately so the app drops back to the
      // login screen — staying "logged in" with a session the server no longer
      // recognizes just produces a wall of confusing raw-error toasts.
      setHealth(null);
      setSessionExpired(true);
      logout();
    };
    window.addEventListener('cafe:data-error', failed);
    window.addEventListener('cafe:data-recovered', recovered);
    window.addEventListener('cafe:session-expired', expired);
    return () => {
      window.removeEventListener('cafe:data-error', failed);
      window.removeEventListener('cafe:data-recovered', recovered);
      window.removeEventListener('cafe:session-expired', expired);
    };
  }, [logout]);

  if (sessionExpired) {
    return <div role="alert" className="fixed inset-x-0 top-0 z-[200] flex min-h-12 items-center gap-3 bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-xl">
      <LogIn className="size-5 shrink-0" />
      <span className="flex-1">Your session has expired. Please log in again to continue.</span>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => location.reload()}><RefreshCw className="size-4"/>Reload</button>
    </div>;
  }

  if (!health) return null;
  return <div role="alert" className="fixed inset-x-0 top-0 z-[200] flex min-h-12 items-center gap-3 bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-xl">
    <AlertTriangle className="size-5 shrink-0" />
    <span className="flex-1">Live business data may be incomplete: {health.message}. Last error {new Date(health.at).toLocaleTimeString('en-IN')}.</span>
    <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => location.reload()}><RefreshCw className="size-4"/>Retry</button>
    <button aria-label="Dismiss" className="grid size-10 place-items-center rounded-xl bg-white/10" onClick={() => setHealth(null)}><X className="size-4"/></button>
  </div>;
}
