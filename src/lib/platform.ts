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
export function isNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}
