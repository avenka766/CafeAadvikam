// src/stores/authStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

interface AuthState {
  currentUser: User | null;
  staffList: User[];
  staffLoaded: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadStaff: () => Promise<void>;
  addStaff: (user: Omit<User, 'id'>) => Promise<boolean>;
  updateStaffPassword: (userId: string, newPassword: string) => Promise<void>;
  updateStaffDetails: (userId: string, updates: { username?: string; displayName?: string }) => Promise<string | null>;
  removeStaff: (userId: string) => Promise<void>;
}

function rowToUser(d: Record<string, unknown>): User {
  return {
    id:          d.id as string,
    username:    d.username as string,
    password:    d.password as string,
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

      // FIX: Password sent in POST body via .rpc(), never in a GET URL.
      // The old .eq('password', password) exposed passwords in server logs + browser history.
      login: async (username, password) => {
        const { data, error } = await supabase
          .rpc('login_staff', { p_username: username, p_password: password });
        if (error || !data || data.length === 0) return false;
        set({ currentUser: rowToUser(data[0] as Record<string, unknown>) });
        return true;
      },

      logout: () => set({ currentUser: null }),

      loadStaff: async () => {
        const { data, error } = await supabase
          .from('staff_users').select('*').eq('is_active', true)
          .order('created_at', { ascending: true });
        if (!error && data) {
          set({ staffList: data.map((d) => rowToUser(d as Record<string, unknown>)), staffLoaded: true });
        }
      },

      addStaff: async (user) => {
        const { data, error } = await supabase
          .from('staff_users')
          .insert({ username: user.username, password: user.password, display_name: user.displayName, role: user.role })
          .select().single();
        if (error || !data) return false;
        const newUser = rowToUser(data as Record<string, unknown>);
        set((s) => ({ staffList: [...s.staffList, newUser] }));
        return true;
      },

      updateStaffPassword: async (userId, newPassword) => {
        const { error } = await supabase.from('staff_users').update({ password: newPassword }).eq('id', userId);
        if (!error) {
          set((s) => ({
            staffList: s.staffList.map((u) => u.id === userId ? { ...u, password: newPassword } : u),
            currentUser: s.currentUser?.id === userId ? { ...s.currentUser, password: newPassword } : s.currentUser,
          }));
        }
      },

      updateStaffDetails: async (userId, updates) => {
        const payload: Record<string, string> = {};
        if (updates.username)    payload.username     = updates.username.trim();
        if (updates.displayName) payload.display_name = updates.displayName.trim();
        if (Object.keys(payload).length === 0) return null;

        if (payload.username) {
          const existing = get().staffList.find(
            (u) => u.username.toLowerCase() === payload.username.toLowerCase() && u.id !== userId
          );
          if (existing) return 'Username already taken';
        }

        const { error } = await supabase.from('staff_users').update(payload).eq('id', userId);
        if (error) return 'Failed to update. Please try again.';

        set((s) => {
          const updated = s.staffList.map((u) =>
            u.id === userId
              ? { ...u, username: payload.username ?? u.username, displayName: payload.display_name ?? u.displayName }
              : u
          );
          const updatedUser = updated.find((u) => u.id === userId)!;
          return {
            staffList: updated,
            currentUser: s.currentUser?.id === userId ? updatedUser : s.currentUser,
          };
        });
        return null;
      },

      removeStaff: async (userId) => {
        const { error } = await supabase
          .from('staff_users')
          .update({ is_active: false })
          .eq('id', userId);
        if (!error) {
          set((s) => ({ staffList: s.staffList.filter((u) => u.id !== userId) }));
        }
      },
    }),
    {
      name: 'cafe-aadvikam-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, password: '' }
          : null,
      }),
    }
  )
);
