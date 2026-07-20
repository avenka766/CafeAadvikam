import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clipboard, LogIn, RefreshCw, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  createClientDiagnostic,
  diagnosticText,
  reportClientDiagnostic,
  type ClientDiagnostic,
  type DiagnosticInput,
} from '@/lib/errorDiagnostics';

export default function DataHealthBanner() {
  const [diagnostic, setDiagnostic] = useState<ClientDiagnostic | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    const failed = (event: Event) => {
      const next = createClientDiagnostic((event as CustomEvent<DiagnosticInput>).detail);
      setDiagnostic(next);
      setDetailsOpen(false);
      setCopied(false);
      void reportClientDiagnostic(next);
    };
    const recovered = () => setDiagnostic(null);
    const expired = () => {
      setDiagnostic(null);
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

  const copyDetails = async () => {
    if (!diagnostic) return;
    try {
      await navigator.clipboard.writeText(diagnosticText(diagnostic));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (sessionExpired) {
    return <div role="alert" className="fixed inset-x-0 top-0 z-[200] flex min-h-12 items-center gap-3 bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-xl">
      <LogIn className="size-5 shrink-0" />
      <span className="flex-1">Your session has expired. Please log in again to continue.</span>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => location.reload()}><RefreshCw className="size-4"/>Reload</button>
    </div>;
  }

  if (!diagnostic) return null;
  return <div role="alert" className="fixed inset-x-0 top-0 z-[200] bg-red-800 px-4 py-2 text-sm font-bold text-white shadow-xl">
    <div className="mx-auto flex max-w-7xl items-center gap-3">
      <AlertTriangle className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        Live business data may be incomplete: {diagnostic.message}
        <span className="ml-2 whitespace-nowrap text-white/70">{diagnostic.reference}</span>
      </span>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => setDetailsOpen((open) => !open)}>
        {detailsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} Details
      </button>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3" onClick={() => location.reload()}><RefreshCw className="size-4"/>Retry</button>
      <button aria-label="Dismiss" className="grid size-10 place-items-center rounded-xl bg-white/10" onClick={() => setDiagnostic(null)}><X className="size-4"/></button>
    </div>
    {detailsOpen && (
      <div className="mx-auto mt-2 max-w-7xl border-t border-white/20 pt-2 font-normal">
        <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <p><strong>User:</strong> {diagnostic.user ? `${diagnostic.user.displayName} (${diagnostic.user.username})` : 'Not logged in'}</p>
          <p><strong>Role:</strong> {diagnostic.user?.role || '-'}</p>
          <p><strong>Page:</strong> {diagnostic.route}</p>
          <p><strong>Time:</strong> {new Date(diagnostic.occurredAt).toLocaleString('en-IN')}</p>
          <p><strong>Module:</strong> {diagnostic.module || '-'}</p>
          <p><strong>Status:</strong> {diagnostic.status ?? '-'}</p>
          <p><strong>Code:</strong> {diagnostic.code || '-'}</p>
          <p><strong>Connection:</strong> {diagnostic.online ? 'Online' : 'Offline'}</p>
        </div>
        {diagnostic.details && <p className="mt-2 break-words text-xs"><strong>Details:</strong> {diagnostic.details}</p>}
        {diagnostic.hint && <p className="mt-1 break-words text-xs"><strong>Hint:</strong> {diagnostic.hint}</p>}
        <button type="button" onClick={() => void copyDetails()} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-bold">
          <Clipboard className="size-3.5" /> {copied ? 'Copied' : 'Copy Details'}
        </button>
      </div>
    )}
  </div>;
}
