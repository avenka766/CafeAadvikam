import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

// Only the session token (a random UUID) is stored in localStorage.
// The actual user data always comes from the DB — never cached locally.
const SESSION_KEY = 'cafe-session-token';

interface AuthState {
  currentUser: User | null;
  staffList: User[];
  staffLoaded: boolean;
  sessionChecked: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
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

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  staffList: [],
  staffLoaded: false,
  sessionChecked: false,

  restoreSession: async () => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) { set({ sessionChecked: true }); return; }

    const { data } = await supabase
      .from('staff_sessions')
      .select('staff_users(*)')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    const userData = data?.staff_users as Record<string, unknown> | null;
    if (userData) {
      set({ currentUser: rowToUser(userData), sessionChecked: true });
    } else {
      localStorage.removeItem(SESSION_KEY);
      set({ sessionChecked: true });
    }
  },

  login: async (username, password) => {
    const { data, error } = await supabase
      .from('staff_users')
      .select('*')
      .ilike('username', username)
      .eq('password', password)
      .eq('is_active', true)
      .single();

    if (error || !data) return false;

    const user = rowToUser(data as Record<string, unknown>);
    const token = crypto.randomUUID();

    await supabase.from('staff_sessions').insert({
      token,
      staff_user_id: user.id,
      is_active: true,
    });
    localStorage.setItem(SESSION_KEY, token);
    set({ currentUser: user });
    return true;
  },

  logout: async () => {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
      await supabase.from('staff_sessions').update({ is_active: false }).eq('token', token);
      localStorage.removeItem(SESSION_KEY);
    }
    set({ currentUser: null });
  },

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
}));
