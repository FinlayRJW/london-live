import { create } from "zustand";
import type { PostcodeLevel } from "../types/geo.ts";

interface MapState {
  center: [number, number];
  zoom: number;
  activeLevel: PostcodeLevel;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setActiveLevel: (level: PostcodeLevel) => void;
}

const DISTRICT_TO_SECTOR_ZOOM = 13;
const SECTOR_TO_DISTRICT_ZOOM = 12;

export const useMapStore = create<MapState>((set) => ({
  center: [51.505, -0.09],
  zoom: 11,
  activeLevel: "district",
  setCenter: (center) => set({ center }),
  setZoom: (zoom) =>
    set((state) => {
      let activeLevel = state.activeLevel;
      if (zoom >= DISTRICT_TO_SECTOR_ZOOM && state.activeLevel === "district") {
        activeLevel = "sector";
      } else if (zoom <= SECTOR_TO_DISTRICT_ZOOM && state.activeLevel === "sector") {
        activeLevel = "district";
      }
      return { zoom, activeLevel };
    }),
  setActiveLevel: (activeLevel) => set({ activeLevel }),
}));
