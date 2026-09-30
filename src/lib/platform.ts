// src/lib/platform.ts
// Owner Android app (2026-08-07).
//
// Synchronous, safe-on-web native-platform check. Capacitor's native runtime
// injects `window.Capacitor` before any page script runs, so this is
// reliable even at module-eval time — needed by things like zustand's
// `persist` middleware, whose `storage` option must be resolved
// synchronously and can't wait on an async dynamic import the way
// src/lib/nativeNotifications.ts does for the plugin calls themselves.
//
// On a plain browser (including this same app's Vercel deployment),
// window.Capacitor is simply undefined, so this safely returns false —
// no @capacitor/core import needed here at all, and nothing about the web
// build's behavior changes.
//
// Deliberately Capacitor-only — do NOT fold Electron detection into this
// one. isNativeApp() also drives the Owner app's silent auto-login, the
// per-app native role gate (both call @capacitor/app's getInfo(), which
// isn't available in Electron), and swaps the whole Header/BottomNav chrome
// for the mobile-style NativeNav — none of which the Windows desktop app
// should get. See isElectronApp() below for the narrow "are we the .exe"
// check used just for the landing-page redirect in App.tsx.
export function isNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

// Single declaration for window.cafeAadvikamDesktop (electron/preload.cjs) —
// keep this the one source of truth for its shape; a second, differently-
// shaped `declare global` for the same property elsewhere would conflict.
declare global {
  interface Window {
    cafeAadvikamDesktop?: {
      isElectron: boolean;
      // FEATURE (2026-09-30): see desktopSilentPrint() below.
      silentPrint?: (html: string) => Promise<{ success: boolean; errorType?: string | null }>;
    };
  }
}

// BUG FIX (2026-09-30): "the .exe should not show the landing page, only
// the login page" — electron/preload.cjs exposes window.cafeAadvikamDesktop
// (already used by ElectronRefreshButton) for exactly this kind of "are we
// the packaged Windows app" check.
export function isElectronApp(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.cafeAadvikamDesktop?.isElectron);
  } catch {
    return false;
  }
}

// FEATURE (2026-09-30): "the bill should print without showing the print
// preview" — a renderer's own window.print()/iframe.print() call always
// opens Electron's native OS print dialog; true silent printing needs the
// MAIN process (electron/main.cjs's 'silent-print' IPC handler) to call
// webContents.print({silent:true}) instead. Returns null (not a function a
// caller has to feature-detect itself) when not running in the packaged
// Windows app, or on a build old enough not to expose it yet — callers
// (printViaIframe.ts, printUtils.ts) fall back to their existing
// browser-print path in that case, so this is a pure addition, never a
// behavior change for the web deployment or either phone app.
export function desktopSilentPrint(html: string): Promise<{ success: boolean; errorType?: string | null }> | null {
  try {
    const fn = typeof window !== 'undefined' ? window.cafeAadvikamDesktop?.silentPrint : undefined;
    return typeof fn === 'function' ? fn(html) : null;
  } catch {
    return null;
  }
}
