import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PropertyData,
  PropertyFilters,
  PropertyRecord,
  PropertyType,
  Tenure,
} from "../types/property.ts";

interface PropertyState {
  /** Raw property data keyed by postcode */
  data: PropertyData | null;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Filter settings (persisted) */
  filters: PropertyFilters;

  setData: (data: PropertyData) => void;
  setLoading: (loading: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setMinPrice: (price: number) => void;
  setMaxPrice: (price: number) => void;
  setTypes: (types: PropertyType[]) => void;
  setTenure: (tenure: Tenure | "both") => void;
  setDateRange: (range: 6 | 12 | 24) => void;
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      data: null,
      isLoading: false,
      filters: {
        enabled: false,
        minPrice: 0,
        maxPrice: 5_000_000,
        types: ["D", "S", "T", "F"],
        tenure: "both",
        dateRange: 24,
      },

      setData: (data) => set({ data }),
      setLoading: (isLoading) => set({ isLoading }),
      setEnabled: (enabled) =>
        set((s) => ({ filters: { ...s.filters, enabled } })),
      setMinPrice: (minPrice) =>
        set((s) => ({ filters: { ...s.filters, minPrice } })),
      setMaxPrice: (maxPrice) =>
        set((s) => ({ filters: { ...s.filters, maxPrice } })),
      setTypes: (types) =>
        set((s) => ({ filters: { ...s.filters, types } })),
      setTenure: (tenure) =>
        set((s) => ({ filters: { ...s.filters, tenure } })),
      setDateRange: (dateRange) =>
        set((s) => ({ filters: { ...s.filters, dateRange } })),
    }),
    {
      name: "london-live-properties",
      partialize: (state) => ({ filters: state.filters }),
    },
  ),
);

/** Get the cutoff date string (YYYY-MM) for a given months-back value */
function getCutoffDate(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function matchesFilters(record: PropertyRecord, filters: PropertyFilters): boolean {
  if (record.p < filters.minPrice || record.p > filters.maxPrice) return false;
  if (!filters.types.includes(record.t)) return false;
  if (filters.tenure !== "both" && record.te !== filters.tenure) return false;
  const cutoff = getCutoffDate(filters.dateRange);
  if (record.d < cutoff) return false;
  return true;
}

export interface FilteredProperty {
  postcode: string;
  lat: number;
  lng: number;
  record: PropertyRecord;
}

/** Get all filtered properties as a flat array with location data */
export function getFilteredProperties(
  data: PropertyData,
  filters: PropertyFilters,
): FilteredProperty[] {
  const results: FilteredProperty[] = [];
  for (const [postcode, group] of Object.entries(data)) {
    for (const record of group.sales) {
      if (matchesFilters(record, filters)) {
        results.push({ postcode, lat: group.lat, lng: group.lng, record });
      }
    }
  }
  return results;
}
