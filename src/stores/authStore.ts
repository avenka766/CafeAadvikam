import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      staffList: [],
      staffLoaded: false,

      login: async (username: string, password: string) => {
        const { data, error } = await supabase
          .from('staff_users')
          .select('*')
          .ilike('username', username)
          .eq('password', password)
          .eq('is_active', true)
          .single();

        if (error || !data) return false;

        const user: User = {
          id: data.id,
          username: data.username,
          password: data.password,
          displayName: data.display_name,
          role: data.role as UserRole,
        };
        set({ currentUser: user });
        return true;
      },

      logout: () => set({ currentUser: null }),

      loadStaff: async () => {
        const { data, error } = await supabase
          .from('staff_users')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const staff: User[] = data.map((d) => ({
            id: d.id,
            username: d.username,
            password: d.password,
            displayName: d.display_name,
            role: d.role as UserRole,
          }));
          set({ staffList: staff, staffLoaded: true });
        }
      },

      addStaff: async (user) => {
        const { data, error } = await supabase
          .from('staff_users')
          .insert({
            username: user.username,
            password: user.password,
            display_name: user.displayName,
            role: user.role,
          })
          .select()
          .single();

        if (error || !data) return false;

        const newUser: User = {
          id: data.id,
          username: data.username,
          password: data.password,
          displayName: data.display_name,
          role: data.role as UserRole,
        };
        set((state) => ({ staffList: [...state.staffList, newUser] }));
        return true;
      },

      updateStaffPassword: async (userId: string, newPassword: string) => {
        const { error } = await supabase
          .from('staff_users')
          .update({ password: newPassword })
          .eq('id', userId);

        if (!error) {
          set((state) => ({
            staffList: state.staffList.map((u) =>
              u.id === userId ? { ...u, password: newPassword } : u
            ),
          }));
        }
      },

      removeStaff: async (userId: string) => {
        const { error } = await supabase
          .from('staff_users')
          .delete()
          .eq('id', userId);

        if (!error) {
          set((state) => ({
            staffList: state.staffList.filter((u) => u.id !== userId),
          }));
        }
      },
    }),
    {
      name: 'cafe-aadvikam-auth',
      partialize: (state) => ({ currentUser: state.currentUser }),
    }
  )
);
