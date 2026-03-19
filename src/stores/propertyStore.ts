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
  /** Property data keyed by postcode (merged from loaded districts) */
  data: PropertyData;
  /** Which districts have been loaded */
  loadedDistricts: Set<string>;
  /** Districts currently being fetched */
  loadingDistricts: Set<string>;
  /** Total districts requested in current batch */
  loadingTotal: number;
  /** Districts completed in current batch */
  loadingDone: number;
  /** Filter settings (persisted) */
  filters: PropertyFilters;

  mergeDistrictData: (district: string, data: PropertyData) => void;
  setLoadingDistricts: (districts: Set<string>) => void;
  setLoadingProgress: (done: number, total: number) => void;
  setEnabled: (enabled: boolean) => void;
  setMinPrice: (price: number) => void;
  setMaxPrice: (price: number) => void;
  setMinFloorArea: (area: number) => void;
  setMaxFloorArea: (area: number) => void;
  setTypes: (types: PropertyType[]) => void;
  setTenure: (tenure: Tenure | "both") => void;
  setDateRange: (range: 6 | 12 | 24) => void;
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      data: {},
      loadedDistricts: new Set(),
      loadingDistricts: new Set(),
      loadingTotal: 0,
      loadingDone: 0,
      filters: {
        enabled: false,
        minPrice: 0,
        maxPrice: 2_000_000,
        minFloorArea: 0,
        maxFloorArea: 300,
        types: ["D", "S", "T", "F"],
        tenure: "both",
        dateRange: 24,
      },

      mergeDistrictData: (district, districtData) =>
        set((s) => {
          const newLoaded = new Set(s.loadedDistricts);
          newLoaded.add(district);
          const newLoading = new Set(s.loadingDistricts);
          newLoading.delete(district);
          return {
            data: { ...s.data, ...districtData },
            loadedDistricts: newLoaded,
            loadingDistricts: newLoading,
            loadingDone: s.loadingDone + 1,
          };
        }),
      setLoadingDistricts: (districts) =>
        set({ loadingDistricts: districts }),
      setLoadingProgress: (loadingDone, loadingTotal) =>
        set({ loadingDone, loadingTotal }),
      setEnabled: (enabled) =>
        set((s) => ({ filters: { ...s.filters, enabled } })),
      setMinPrice: (minPrice) =>
        set((s) => ({ filters: { ...s.filters, minPrice } })),
      setMaxPrice: (maxPrice) =>
        set((s) => ({ filters: { ...s.filters, maxPrice } })),
      setMinFloorArea: (minFloorArea) =>
        set((s) => ({ filters: { ...s.filters, minFloorArea } })),
      setMaxFloorArea: (maxFloorArea) =>
        set((s) => ({ filters: { ...s.filters, maxFloorArea } })),
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
  // Floor area filter - only apply to properties that have EPC data
  if (record.fa !== null) {
    if (record.fa < filters.minFloorArea || record.fa > filters.maxFloorArea) return false;
  }
  return true;
}

export interface FilteredProperty {
  postcode: string;
  lat: number;
  lng: number;
  record: PropertyRecord;
}

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
