// src/bakery/activityLogStore.ts
// Staff activity audit log — every significant action is recorded here.
// Displayed in AdminDashboard → Bakery → Activity Log tab.

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface ActivityEntry {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  action: string;       // e.g. "Submitted Order", "Dispatched Items"
  detail: string;       // human-readable detail
  branch?: string;
  createdAt: string;
}

interface ActivityLogState {
  entries: ActivityEntry[];
  loaded: boolean;
  loading: boolean;
  load: (limit?: number) => Promise<void>;
  log: (entry: Omit<ActivityEntry, 'id' | 'createdAt'>) => Promise<void>;
}

function mapRow(r: Record<string, unknown>): ActivityEntry {
  return {
    id:        r.id as string,
    staffId:   r.staff_id as string,
    staffName: r.staff_name as string,
    role:      r.role as string,
    action:    r.action as string,
    detail:    r.detail as string,
    branch:    (r.branch as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

export const useActivityLogStore = create<ActivityLogState>((set, get) => ({
  entries: [],
  loaded:  false,
  loading: false,

  load: async (limit = 200) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('staff_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error && data) {
        set({ entries: data.map(r => mapRow(r as Record<string, unknown>)), loaded: true });
      }
    } finally {
      set({ loading: false });
    }
  },

  log: async (entry) => {
    const { error } = await supabase.from('staff_activity_log').insert({
      staff_id:   entry.staffId,
      staff_name: entry.staffName,
      role:       entry.role,
      action:     entry.action,
      detail:     entry.detail,
      branch:     entry.branch ?? null,
    });
    if (!error) {
      // Optimistically prepend
      const optimistic: ActivityEntry = {
        ...entry,
        id:        crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      set(s => ({ entries: [optimistic, ...s.entries] }));
    }
  },
}));
