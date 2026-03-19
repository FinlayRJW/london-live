import { useFilterStore } from "../stores/filterStore.ts";
import type { PropertyConfigData } from "../filters/property/PropertyConfig.tsx";

/**
 * Returns the property filter config from the filter store, or null if no
 * property filter has been added.
 */
export function usePropertyFilters(): PropertyConfigData | null {
  return useFilterStore((s) => {
    const instance = s.filters.find(
      (f) => f.typeId === "property" && f.enabled,
    );
    return (instance?.config as PropertyConfigData) ?? null;
  });
}

/** Non-hook version for use outside React components. */
export function getPropertyFilters(): PropertyConfigData | null {
  const instance = useFilterStore
    .getState()
    .filters.find((f) => f.typeId === "property" && f.enabled);
  return (instance?.config as PropertyConfigData) ?? null;
}
