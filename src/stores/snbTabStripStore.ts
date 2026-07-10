import { create } from 'zustand';

interface SnbTabStripState {
  expanded: boolean;
  toggle: () => void;
  collapse: () => void;
}

// Lightweight, non-persisted UI toggle shared between Header.tsx (the button)
// and BranchDashboard.tsx (the tab strip it shows/hides). Kept in its own
// store since the two components don't otherwise share a parent that can
// hold this state.
export const useSnbTabStripStore = create<SnbTabStripState>((set) => ({
  expanded: false,
  toggle: () => set((s) => ({ expanded: !s.expanded })),
  collapse: () => set({ expanded: false }),
}));
