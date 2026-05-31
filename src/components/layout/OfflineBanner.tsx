// src/components/layout/OfflineBanner.tsx
// FIX: no-offline-UX — shows a sticky banner at the top of the screen when
// the device loses network connectivity, and hides it automatically on reconnect.
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-body font-semibold text-white"
      style={{ background: '#854F0B' }}
    >
      <WifiOff className="size-4 shrink-0" />
      No internet connection — some features may be unavailable
    </div>
  );
}
