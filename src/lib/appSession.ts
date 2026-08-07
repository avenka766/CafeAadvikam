import { isNativeApp } from '@/lib/platform';

export const APP_SESSION_STORAGE_KEY = 'cafe-aadvikam-app-session';

// Owner Android app (2026-08-07): sessionStorage is cleared whenever Android
// kills the app's WebView/process (routine under memory pressure, or just
// swiping the app away), which would force a fresh login every time it
// reopens — exactly what "no login screen" is asking us to avoid. On the
// native build only, use localStorage instead, which survives a full app
// restart; the web build keeps sessionStorage unchanged (safer default on a
// possibly-shared browser/terminal). See authStore.ts for the matching
// change to the persisted currentUser, and extend_staff_session_secure for
// how the underlying session is kept from expiring server-side too.
const sessionStore = () => (isNativeApp() ? localStorage : sessionStorage);

export function getAppSessionToken(): string | null {
  try {
    const store = sessionStore();
    const raw = store.getItem(APP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      store.removeItem(APP_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function saveAppSession(token: string, expiresAt: string): void {
  sessionStore().setItem(APP_SESSION_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

export function clearAppSession(): void {
  // Clear both storages defensively — harmless on either platform, and
  // guards against a leftover copy in the other storage from earlier builds.
  try { sessionStorage.removeItem(APP_SESSION_STORAGE_KEY); } catch { /* unavailable */ }
  try { localStorage.removeItem(APP_SESSION_STORAGE_KEY); } catch { /* unavailable */ }
}
