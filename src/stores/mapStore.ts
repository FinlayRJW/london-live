import { create } from "zustand";
import type { PostcodeLevel } from "../types/geo.ts";

type Theme = "light" | "dark" | "system";

function getEffectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const effective = getEffectiveTheme(theme);
  document.documentElement.dataset.theme = effective;
}

interface MapState {
  center: [number, number];
  zoom: number;
  activeLevel: PostcodeLevel;
  theme: Theme;
  sidebarCollapsed: boolean;
  bottomSheetOpen: boolean;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setActiveLevel: (level: PostcodeLevel) => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setBottomSheetOpen: (open: boolean) => void;
}

const DISTRICT_TO_SECTOR_ZOOM = 13;
const SECTOR_TO_DISTRICT_ZOOM = 12;

function loadTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function loadSidebarCollapsed(): boolean {
  return localStorage.getItem("sidebarCollapsed") === "true";
}

const initialTheme = loadTheme();
applyTheme(initialTheme);

// Listen for system theme changes when in "system" mode
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useMapStore.getState();
  if (theme === "system") applyTheme("system");
});

export const useMapStore = create<MapState>((set) => ({
  center: [51.505, -0.09],
  zoom: 11,
  activeLevel: "district",
  theme: initialTheme,
  sidebarCollapsed: loadSidebarCollapsed(),
  bottomSheetOpen: false,
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
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      localStorage.setItem("sidebarCollapsed", String(next));
      return { sidebarCollapsed: next };
    }),
  setBottomSheetOpen: (open) => set({ bottomSheetOpen: open }),
}));
