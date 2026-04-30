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
  removeStaff: (userId: string) => Promise<void>;
}

function rowToUser(d: Record<string, unknown>): User {
  return {
    id: d.id as string,
    username: d.username as string,
    password: d.password as string,
    displayName: d.display_name as string,
    role: d.role as UserRole,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      staffList: [],
      staffLoaded: false,

      login: async (username, password) => {
        const { data, error } = await supabase
          .from('staff_users')
          .select('*')
          .ilike('username', username)
          .eq('password', password)
          .eq('is_active', true)
          .single();
        if (error || !data) return false;
        set({ currentUser: rowToUser(data as Record<string, unknown>) });
        return true;
      },

      logout: () => set({ currentUser: null }),

      loadStaff: async () => {
        const { data, error } = await supabase
          .from('staff_users').select('*').eq('is_active', true).order('created_at', { ascending: true });
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
          set((s) => ({ staffList: s.staffList.map((u) => u.id === userId ? { ...u, password: newPassword } : u) }));
        }
      },

      removeStaff: async (userId) => {
        const { error } = await supabase.from('staff_users').delete().eq('id', userId);
        if (!error) {
          set((s) => ({ staffList: s.staffList.filter((u) => u.id !== userId) }));
        }
      },
    }),
    {
      name: 'cafe-aadvikam-auth',
      // ✅ sessionStorage clears when browser/tab is closed
      // Previously used localStorage (default) which persisted forever
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ currentUser: state.currentUser }),
    }
  )
);
