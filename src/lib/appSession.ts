export const APP_SESSION_STORAGE_KEY = 'cafe-aadvikam-app-session';

export function getAppSessionToken(): string | null {
  try {
    const raw = sessionStorage.getItem(APP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function saveAppSession(token: string, expiresAt: string): void {
  sessionStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

export function clearAppSession(): void {
  sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
}
