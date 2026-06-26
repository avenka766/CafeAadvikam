// src/stores/authStore.ts
// Fixes: SM-02 (no password column), SEC-12 (session expiry), SEC-11 (min pw length)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { clearAppSession, saveAppSession } from '@/lib/appSession';
import type { User, UserRole } from '@/types';

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const AUTH_STORAGE_KEY = 'cafe-aadvikam-auth';

interface AuthState {
  currentUser: User | null;
  sessionExpiresAt: string | null;
  staffList: User[];
  staffLoaded: boolean;
  _sessionTimer: ReturnType<typeof setTimeout> | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadStaff: () => Promise<void>;
  addStaff: (user: Omit<User, 'id'>) => Promise<string | null>;
  updateStaffPassword: (userId: string, newPassword: string) => Promise<string | null>;
  updateStaffDetails: (userId: string, updates: { username?: string; displayName?: string }) => Promise<string | null>;
  removeStaff: (userId: string) => Promise<void>;
  _resetSessionTimer: () => void;
}

function rowToUser(d: Record<string, unknown>): User {
  return {
    id:          d.id as string,
    username:    d.username as string,
    password:    '',   // SM-02: never stored client-side
    displayName: d.display_name as string,
    role:        d.role as UserRole,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      sessionExpiresAt: null,
      staffList: [],
      staffLoaded: false,
      _sessionTimer: null,

      _resetSessionTimer: () => {
        const existing = get()._sessionTimer;
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => { get().logout(); }, SESSION_TIMEOUT_MS);
        set({ _sessionTimer: timer });
      },

      login: async (username, password) => {
        const { data, error } = await supabase.rpc('login_staff_secure', {
          p_username: username,
          p_password: password,
          p_device_info: navigator.userAgent,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) return false;
        const record = row as Record<string, unknown>;
        const token = String(record.session_token ?? '');
        const expiresAt = String(record.expires_at ?? '');
        if (!token || !expiresAt) return false;
        const user = rowToUser(record);
        saveAppSession(token, expiresAt);
        set({ currentUser: user, sessionExpiresAt: expiresAt });
        get()._resetSessionTimer();
        _attachActivityListeners();
        return true;
      },

      logout: () => {
        const timer = get()._sessionTimer;
        if (timer) clearTimeout(timer);

        // Clear the browser session first. A remote logout failure must never keep the
        // user trapped inside a dashboard. PostgREST builders are PromiseLike but do
        // not reliably expose .catch(), so calling `.catch()` directly can throw before
        // the local state is cleared.
        _detachActivityListeners();
        clearAppSession();
        set({ currentUser: null, sessionExpiresAt: null, _sessionTimer: null });

        try {
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
          // Remove the key from localStorage as well for installations upgraded from
          // older builds that persisted auth outside sessionStorage.
          localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {
          // Storage may be unavailable in private/restricted browser contexts.
        }

        // Best-effort server invalidation. Local logout is already complete.
        void (async () => {
          try {
            await supabase.rpc('logout_staff_secure');
          } catch {
            // The local session remains cleared even if the network is unavailable.
          }
        })();
      },

      // SM-02: never fetch the password column
      loadStaff: async () => {
        const { data, error } = await supabase.rpc('list_staff_secure');
        if (!error && data) {
          set({ staffList: data.map((d) => rowToUser(d as Record<string, unknown>)), staffLoaded: true });
        }
      },

      // SEC-11: enforce min password length
      addStaff: async (user) => {
        if (user.password.trim().length < 6) return 'Password must be at least 6 characters';
        // C-02 FIX: hash password server-side via RPC; never write plaintext to staff_users directly.
        // The DB RPC add_staff_hashed() runs pgcrypto.crypt() before inserting.
        const { data, error } = await supabase
          .rpc('add_staff_hashed', {
            p_username:     user.username,
            p_password:     user.password,
            p_display_name: user.displayName,
            p_role:         user.role,
          });
        if (error) return error.code === '23505' ? 'Username already taken' : error.message;
        if (!data) return 'Failed to add staff member';
        set((s) => ({ staffList: [...s.staffList, rowToUser(data as Record<string, unknown>)] }));
        return null;
      },

      updateStaffPassword: async (userId, newPassword) => {
        if (newPassword.trim().length < 6) return 'Password must be at least 6 characters';

        const { error } = await supabase
          .rpc('update_staff_password_hashed', {
            p_user_id: userId,
            p_new_password: newPassword,
          });

        if (error) {
          console.error('Password update error:', error);
          return error.message;
        }

        return null;
      },

      updateStaffDetails: async (userId, updates) => {
        const payload: Record<string, string> = {};
        if (updates.username)    payload.username     = updates.username.trim();
        if (updates.displayName) payload.display_name = updates.displayName.trim();
        if (Object.keys(payload).length === 0) return null;

        if (payload.username) {
          const existing = get().staffList.find(
            (u) => u.username.toLowerCase() === payload.username.toLowerCase() && u.id !== userId,
          );
          if (existing) return 'Username already taken';
        }

        const { error } = await supabase.rpc('update_staff_details_secure', {
          p_user_id: userId,
          p_username: payload.username ?? null,
          p_display_name: payload.display_name ?? null,
        });
        if (error) return error.code === '23505' ? 'Username already taken' : 'Failed to update. Please try again.';

        set((s) => {
          const updated = s.staffList.map((u) =>
            u.id === userId
              ? { ...u, username: payload.username ?? u.username, displayName: payload.display_name ?? u.displayName }
              : u,
          );
          const updatedUser = updated.find((u) => u.id === userId)!;
          return { staffList: updated, currentUser: s.currentUser?.id === userId ? updatedUser : s.currentUser };
        });
        return null;
      },

      removeStaff: async (userId) => {
        const { error } = await supabase.rpc('deactivate_staff_secure', { p_user_id: userId, p_reason: 'Deactivated by administrator' });
        if (error) throw error;
        set((s) => ({ staffList: s.staffList.filter((u) => u.id !== userId) }));
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ currentUser: state.currentUser ? { ...state.currentUser, password: '' } : null, sessionExpiresAt: state.sessionExpiresAt }),
      // BUG #21 FIX: _sessionTimer is not persisted (correctly excluded by partialize),
      // but that means after a page reload the 8-hour auto-logout timer is never restarted.
      // onRehydrateStorage fires once after sessionStorage is loaded; restart the timer here
      // if the user session was restored (so they are still auto-logged out after 8 hours).
      onRehydrateStorage: () => (state) => {
        if (state?.currentUser) {
          state._resetSessionTimer();
          // M-03 FIX: attach sliding-session activity listeners after rehydration so that
          // staff who are actively using the app never get kicked mid-shift.
          _attachActivityListeners();
        }
      },
    },
  ),
);

// M-03 FIX: sliding session; reset the timeout on meaningful user interactions.
// Throttled to at most once per minute to avoid hammering clearTimeout/setTimeout.
let _activityListenersAttached = false;
let _lastActivityReset = 0;
// HYGIENE FIX: keep a reference to the handler so it can be removed on logout,
// preventing stale listeners from accumulating across login/logout cycles on a shared terminal.
let _activityHandler: (() => void) | null = null;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'visibilitychange'] as const;

export function _detachActivityListeners() {
  if (!_activityHandler) return;
  ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, _activityHandler!));
  _activityHandler = null;
  _activityListenersAttached = false;
  _lastActivityReset = 0;
}

function _attachActivityListeners() {
  if (_activityListenersAttached) return;
  _activityListenersAttached = true;

  const THROTTLE_MS = 60_000; // reset at most once per minute

  const handleActivity = () => {
    const store = useAuthStore.getState();
    if (!store.currentUser) return; // not logged in; nothing to reset
    const now = Date.now();
    if (now - _lastActivityReset < THROTTLE_MS) return;
    _lastActivityReset = now;
    store._resetSessionTimer();
  };

  _activityHandler = handleActivity;
  ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
}
