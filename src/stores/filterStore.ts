import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FilterInstance } from "../types/filter.ts";

interface FilterState {
  filters: FilterInstance[];
  addFilter: (typeId: string, config: unknown) => string;
  removeFilter: (id: string) => void;
  updateConfig: (id: string, config: unknown) => void;
  setWeight: (id: string, weight: number) => void;
  toggleEnabled: (id: string) => void;
}

let nextId = 1;

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      filters: [],
      addFilter: (typeId, config) => {
        const id = `filter-${nextId++}`;
        set((state) => ({
          filters: [
            ...state.filters,
            { id, typeId, config, weight: 1, enabled: true },
          ],
        }));
        return id;
      },
      removeFilter: (id) =>
        set((state) => ({
          filters: state.filters.filter((f) => f.id !== id),
        })),
      updateConfig: (id, config) =>
        set((state) => ({
          filters: state.filters.map((f) =>
            f.id === id ? { ...f, config } : f,
          ),
        })),
      setWeight: (id, weight) =>
        set((state) => ({
          filters: state.filters.map((f) =>
            f.id === id ? { ...f, weight } : f,
          ),
        })),
      toggleEnabled: (id) =>
        set((state) => ({
          filters: state.filters.map((f) =>
            f.id === id ? { ...f, enabled: !f.enabled } : f,
          ),
        })),
    }),
    {
      name: "london-live-filters",
    },
  ),
);
