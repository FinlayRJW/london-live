import { create } from "zustand";

export interface AmenityLocation {
  id: number;
  name: string;
  brand: string;
  lat: number;
  lng: number;
}

export type AmenityType = "supermarket" | "cinema" | "gym";

export type AmenityData = Record<AmenityType, AmenityLocation[]>;

interface AmenityState {
  data: AmenityData | null;
  isLoading: boolean;
  load: () => Promise<void>;
}

export const useAmenityStore = create<AmenityState>((set, get) => ({
  data: null,
  isLoading: false,

  load: async () => {
    if (get().data || get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/amenities.json`);
      if (!res.ok) throw new Error(`Failed to load amenities: ${res.status}`);
      const data: AmenityData = await res.json();
      set({ data, isLoading: false });
    } catch (e) {
      console.error("Failed to load amenity data:", e);
      set({ isLoading: false });
    }
  },
}));
