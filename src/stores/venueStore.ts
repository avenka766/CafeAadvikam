import { create } from 'zustand';

interface VenueState {
  activeVenue: 'cafe' | 'bakery';
  setVenue: (v: 'cafe' | 'bakery') => void;
}

export const useVenueStore = create<VenueState>()((set) => ({
  activeVenue: 'cafe',
  setVenue: (v) => set({ activeVenue: v }),
}));
