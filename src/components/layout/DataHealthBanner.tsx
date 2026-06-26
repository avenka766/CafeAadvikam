import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

type Health = { message: string; at: number; status?: number } | null;

export default function DataHealthBanner() {
  const [health, setHealth] = useState<Health>(null);
  useEffect(() => {
    const failed = (event: Event) => setHealth((event as CustomEvent<NonNullable<Health>>).detail);
    const recovered = () => setHealth(null);
    window.addEventListener('cafe:data-error', failed);
    window.addEventListener('cafe:data-recovered', recovered);
    return () => { window.removeEventListener('cafe:data-error', failed); window.removeEventListener('cafe:data-recovered', recovered); };
  }, []);
  if (!health) return null;
  return <div role="alert" className="fixed inset-x-0 top-0 z-[200] flex min-h-12 items-center gap-3 bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-xl">
    <AlertTriangle className="size-5 shrink-0" />
    <span className="flex-1">Live business data may be incomplete: {health.message}. Last error {new Date(health.at).toLocaleTimeString('en-IN')}.</span>
    <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => location.reload()}><RefreshCw className="size-4"/>Retry</button>
    <button aria-label="Dismiss" className="grid size-10 place-items-center rounded-xl bg-white/10" onClick={() => setHealth(null)}><X className="size-4"/></button>
  </div>;
}
