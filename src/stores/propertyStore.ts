import { create } from "zustand";
import type { PropertyData } from "../types/property.ts";

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
  /** Postcode prefixes (district/sector) that have matching properties */
  postcodesWithProperties: Set<string>;

  mergeDistrictData: (district: string, data: PropertyData) => void;
  setLoadingDistricts: (districts: Set<string>) => void;
  setLoadingProgress: (done: number, total: number) => void;
  setPostcodesWithProperties: (postcodes: Set<string>) => void;
}

export const usePropertyStore = create<PropertyState>()((set) => ({
  data: {},
  loadedDistricts: new Set(),
  loadingDistricts: new Set(),
  loadingTotal: 0,
  loadingDone: 0,
  postcodesWithProperties: new Set(),

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
  setPostcodesWithProperties: (postcodesWithProperties) =>
    set({ postcodesWithProperties }),
}));
