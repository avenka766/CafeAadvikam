// src/stores/authStore.ts
// Fixes: SM-02 (no password column), SEC-12 (session expiry), SEC-11 (min pw length)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

interface AuthState {
  currentUser: User | null;
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
        const { data, error } = await supabase
          .rpc('login_staff', { p_username: username, p_password: password });
        if (error || !data || data.length === 0) return false;
        const user = rowToUser(data[0] as Record<string, unknown>);
        set({ currentUser: user });
        get()._resetSessionTimer();
        return true;
      },

      logout: () => {
        const timer = get()._sessionTimer;
        if (timer) clearTimeout(timer);
        set({ currentUser: null, _sessionTimer: null });
      },

      // SM-02: never fetch the password column
      loadStaff: async () => {
        const { data, error } = await supabase
          .from('staff_users')
          .select('id, username, display_name, role, is_active, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: true });
        if (!error && data) {
          set({ staffList: data.map((d) => rowToUser(d as Record<string, unknown>)), staffLoaded: true });
        }
      },

      // SEC-11: enforce min password length
      addStaff: async (user) => {
        if (user.password.trim().length < 6) return 'Password must be at least 6 characters';
        const { data, error } = await supabase
          .from('staff_users')
          .insert({ username: user.username, password: user.password, display_name: user.displayName, role: user.role })
          .select('id, username, display_name, role')
          .single();
        if (error) return error.code === '23505' ? 'Username already taken' : error.message;
        if (!data) return 'Failed to add staff member';
        set((s) => ({ staffList: [...s.staffList, rowToUser(data as Record<string, unknown>)] }));
        return null;
      },

      updateStaffPassword: async (userId, newPassword) => {
        if (newPassword.trim().length < 6) return 'Password must be at least 6 characters';
        const { error } = await supabase.from('staff_users').update({ password: newPassword }).eq('id', userId);
        if (error) return 'Failed to update password';
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

        const { error } = await supabase.from('staff_users').update(payload).eq('id', userId);
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
        const { error } = await supabase.from('staff_users').update({ is_active: false }).eq('id', userId);
        if (error) throw error;
        set((s) => ({ staffList: s.staffList.filter((u) => u.id !== userId) }));
      },
    }),
    {
      name: 'cafe-aadvikam-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ currentUser: state.currentUser ? { ...state.currentUser, password: '' } : null }),
      // BUG #21 FIX: _sessionTimer is not persisted (correctly excluded by partialize),
      // but that means after a page reload the 8-hour auto-logout timer is never restarted.
      // onRehydrateStorage fires once after sessionStorage is loaded — restart the timer here
      // if the user session was restored (so they are still auto-logged out after 8 hours).
      onRehydrateStorage: () => (state) => {
        if (state?.currentUser) {
          state._resetSessionTimer();
        }
      },
    },
  ),
);
