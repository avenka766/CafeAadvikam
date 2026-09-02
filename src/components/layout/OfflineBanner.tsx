// src/components/layout/OfflineBanner.tsx
// FIX: no-offline-UX — shows a sticky banner at the top of the screen when
// the device loses network connectivity, and hides it automatically on reconnect.
//
// OFFLINE FIX (2026-09-01): this used to be purely cosmetic — it only ever
// reflected navigator.onLine, with no idea whether anything the user did
// while offline was actually waiting to sync. Now also shows how many
// changes are queued (src/lib/offlineQueue.ts) and switches to a "syncing"
// state once the connection comes back but the queue hasn't drained yet, so
// staff get a clear signal that a screen isn't done syncing rather than
// assuming everything they did offline made it to the server the instant
// the banner disappears.
//
// Failure view added the same day once real business-logic RPCs (stock
// decrements, credit settlement) started going through the queue, not just
// simple idempotent upserts — a queued write can now genuinely fail on
// replay for a real reason (e.g. two offline tills both sold the last unit
// of an item; whichever syncs second gets a real "insufficient stock"
// rejection), and flush() stops at the first failure to preserve ordering.
// Silently stuck forever with no visibility would be worse than the
// original "some features may be unavailable" gap this component started
// from — staff need to see exactly what failed and why, and be able to
// clear a genuinely unrecoverable one so the rest of the queue can proceed.
import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useOfflineQueueStore } from '@/lib/offlineQueue';

// Human-readable labels for the `kind` strings registered via
// registerReplayHandler across the app — kept here (not in offlineQueue.ts)
// so that module stays generic/dependency-free of any particular store.
const KIND_LABELS: Record<string, string> = {
  cafe_order_submit: 'Cafe order',
  cafe_advance_order_submit: 'Cafe advance order',
  branch_operation_record: 'Branch record',
  branch_threshold_update: 'Stock threshold update',
  branch_record_sale: 'Sale',
  branch_record_snb_sale: 'SNB sale',
  branch_manual_stock_delta: 'Manual stock update',
  branch_record_advance_order: 'Advance order',
  branch_collect_advance_balance: 'Advance balance collection',
  branch_confirm_incoming: 'Incoming stock confirmation',
  branch_record_credit_sale: 'Credit sale',
  branch_settle_credit_sale: 'Credit settlement',
  branch_checkout: 'SNB/VRSNB bill',
  branch_apply_credit_discount: 'Credit discount',
};

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [expanded, setExpanded] = useState(false);
  const pending = useOfflineQueueStore((s) => s.pending);
  const flushing = useOfflineQueueStore((s) => s.flushing);
  const flush = useOfflineQueueStore((s) => s.flush);
  const discard = useOfflineQueueStore((s) => s.discard);

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

  const pendingCount = pending.length;
  const failed = pending.filter((e) => e.attempts > 0);

  if (!offline && pendingCount === 0) return null;

  const syncingWhileOnline = !offline && pendingCount > 0;
  const hasFailure = failed.length > 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999]">
      <div
        role="alert"
        aria-live="assertive"
        className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-body font-semibold text-white"
        style={{ background: hasFailure ? '#B91C1C' : syncingWhileOnline ? '#1D4ED8' : '#854F0B' }}
      >
        {hasFailure ? (
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            {failed.length} change{failed.length === 1 ? '' : 's'} failed to sync — needs attention
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : syncingWhileOnline ? (
          <>
            <RefreshCw className={`size-4 shrink-0 ${flushing ? 'animate-spin' : ''}`} />
            Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'} made while offline…
          </>
        ) : (
          <>
            <WifiOff className="size-4 shrink-0" />
            No internet connection{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued, will sync automatically` : ' — some features may be unavailable'}
          </>
        )}
      </div>

      {hasFailure && expanded && (
        <div className="max-h-[50vh] overflow-y-auto bg-white border-b-2 border-red-700 shadow-lg">
          {failed.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-red-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{KIND_LABELS[entry.kind] || entry.kind}</p>
                <p className="mt-0.5 text-xs text-red-700">{entry.lastError || 'Unknown error'}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Queued {new Date(entry.createdAt).toLocaleString('en-IN')} · {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void flush()}
                  disabled={flushing || !navigator.onLine}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Discard this queued ${KIND_LABELS[entry.kind] || entry.kind}? This cannot be undone — the change it represents will NOT be saved.`)) {
                      void discard(entry.id);
                    }
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
