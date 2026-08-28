import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// BUG FIX (2026-08-09): "Owner Dashboard page is keep on refreshing 10
// times per sec, we are unable to do anything" — root cause, found after
// two rounds of chasing this as a React re-render problem (it wasn't).
// This is a REAL, literal page-reload loop: three separate places auto-
// reload the tab on a stale-deploy chunk-load error (a lazy-loaded page's
// JS file 404ing because the browser is holding a cached index.html that
// points at an asset hash the last deploy replaced). Only ONE of the three
// — ErrorBoundary.componentDidCatch — checked a one-shot sessionStorage
// guard before reloading; these two here reloaded unconditionally. If the
// underlying fetch keeps failing (which it will, since nothing changes
// between reloads unless the stale index.html itself gets evicted), each
// reload immediately re-triggers the same error, calling reload() again —
// as fast as the browser can complete a navigation, easily several times a
// second, and the page never finishes loading long enough to be usable.
// Same guard as ErrorBoundary now applied here too: reload at most once per
// session, then stop and let the visible error UI/banner take over instead
// of looping forever.
// BUG FIX (2026-08-26): "still hitting the stale-chunk error, stuck on the
// fallback screen" — the guard below used to be a pure boolean, set once
// and never cleared except by a successful mount 5s later. In a single
// long-running session (a receiver terminal left open all day, exactly
// the kind of tab this app is meant to run in), if the guard was already
// used by an EARLIER stale-chunk event and the app is currently between
// mounts (e.g. navigating to a fresh lazy route right as another new
// deploy just went out), a second, entirely separate stale-chunk event
// found the guard still set and gave up immediately — showing the
// fallback error instead of attempting the one reload that would have
// fixed it. Storing a timestamp instead of a bare flag still blocks the
// original bug (a tight reload loop firing many times a second), but lets
// a new attempt through once enough time has passed for it to plausibly
// be a different, later deploy event rather than the same loop.
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;
function reloadOnceForStaleChunk() {
  const lastAttempt = Number(sessionStorage.getItem('cafe:chunk-reload-attempted-at') || 0);
  if (lastAttempt && Date.now() - lastAttempt < CHUNK_RELOAD_COOLDOWN_MS) {
    // Already tried the one-shot auto-reload this session and the same
    // error fired again — reloading again would just resume the loop this
    // fix exists to stop. Surface the visible error banner instead of
    // silently doing nothing, so the page isn't left frozen with no
    // explanation of what's wrong or what to do about it.
    window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: {
      message: 'This page failed to load the latest app files and could not recover automatically. Please close this tab and reopen the app.',
      module: 'App update',
      severity: 'fatal',
      at: Date.now(),
    } }));
    return;
  }
  sessionStorage.setItem('cafe:chunk-reload-attempted-at', String(Date.now()));
  window.location.reload();
}

// Auto-reload on stale chunk error (happens after a new deploy invalidates old hashed assets)
window.addEventListener('vite:preloadError', () => {
  reloadOnceForStaleChunk();
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.message ?? '';
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    reloadOnceForStaleChunk();
    return;
  }
  window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: {
    message: msg || 'An unexpected background operation failed',
    code: e?.reason?.code,
    details: e?.reason?.details,
    hint: e?.reason?.hint,
    module: 'Background operation',
    severity: 'error',
    at: Date.now(),
  } }));
});
window.addEventListener('error', (event) => {
  // Resource load errors have no useful Error object and are commonly caused
  // by browser extensions; React render errors are handled by ErrorBoundary.
  if (!event.error) return;
  window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: {
    message: event.error instanceof Error ? event.error.message : event.message,
    details: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    module: 'Browser runtime',
    severity: 'error',
    at: Date.now(),
  } }));
});

// BUG FIX (audit 2026-08-27): "if we use the mouse to scroll the number
// fields are also changing — this is causing issue in quantity and price."
// Real, well-known browser behaviour: a focused <input type="number">
// intercepts the mouse wheel and increments/decrements its own value
// instead of letting the page scroll — so simply scrolling past a qty or
// price field (never intending to touch it) silently corrupts it. This
// bites every dashboard in the app (Store inventory/PO/GRN, Planner's
// dispatch/GST invoice qty+rate+GST%, branch billing, stock counts, order
// quantities — anywhere a number input exists), so fixing it per-input
// across dozens of files would be enormous and easy to miss one. One
// global, always-on listener covers every number input everywhere,
// present and future, with no per-form changes needed: on any wheel event,
// if the currently focused element is a number input, blur it first —
// blurring before the browser's native wheel-driven increment logic runs
// is what stops the value from changing, and the page/container underneath
// then scrolls completely normally since focus has already moved away.
document.addEventListener('wheel', () => {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.type === 'number') {
    active.blur();
  }
}, { passive: true });

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  // Mount succeeded — clear the one-shot stale-chunk reload guard (see
  // ErrorBoundary.tsx) so a future deploy's stale-chunk error can trigger
  // one more auto-reload instead of silently giving up because a flag from
  // a previous session/incident was still sitting in sessionStorage.
  window.setTimeout(() => sessionStorage.removeItem('cafe:chunk-reload-attempted-at'), 5000);
} catch (err) {
  // If React fails to mount (e.g. module-level crash in a dependency),
  // show a visible error instead of a blank white page.
  const root = document.getElementById('root');
  if (root) {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:24px;background:#fdf8f3">
        <div style="max-width:480px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h1 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#1a0f0a">App failed to start</h1>
          <p style="color:#666;font-size:14px;margin-bottom:16px">${msg}</p>
          <p style="color:#999;font-size:12px;background:#f5f0ea;padding:12px;border-radius:8px">
            Check Vercel → Settings → Environment Variables → ensure
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set for Preview, then Redeploy.
          </p>
          <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#2D7D6F;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">
            Reload
          </button>
        </div>
      </div>`;
  }
  console.error('[CafeAadvikam] Fatal mount error:', err);
}
