import { useEffect, useRef } from "react";
import { useFilterStore } from "../stores/filterStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { usePostcodeBoundaries } from "./usePostcodeBoundaries.ts";
import { useMapStore } from "../stores/mapStore.ts";
import { useAmenityStore } from "../stores/amenityStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";
import { combineScores } from "../scoring/combiner.ts";
import type { FilterResultMap } from "../types/filter.ts";

export function useScoreComputation() {
  const filters = useFilterStore((s) => s.filters);
  const activeLevel = useMapStore((s) => s.activeLevel);
  const { districts, sectors } = usePostcodeBoundaries();
  const { setScores, setComputing } = useScoreStore();
  const amenityData = useAmenityStore((s) => s.data);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      const generation = ++generationRef.current;

      const enabledFilters = filters.filter((f) => {
        if (!f.enabled) return false;
        const plugin = getFilterPlugin(f.typeId);
        if (!plugin) return false;
        return plugin.isConfigured(f.config);
      });

      if (enabledFilters.length === 0 || !districts) {
        setScores(new Map());
        return;
      }

      setComputing(true);

      // Evaluate ALL postcodes (district + sector) so both layers always
      // have scores ready. The Dijkstra already explores all centroid nodes
      // — the extra mapping cost is negligible.
      const districtPcs = districts.features.map((f) => f.properties.id);
      const sectorPcs = sectors?.features.map((f) => f.properties.id) ?? [];
      const allPostcodes = [...districtPcs, ...sectorPcs];

      const filterResults = new Map<string, FilterResultMap>();

      for (const filter of enabledFilters) {
        const plugin = getFilterPlugin(filter.typeId);
        if (!plugin) continue;

        const result = await plugin.evaluate(
          filter.config,
          allPostcodes,
          activeLevel,
          filter.id,
        );

        // Discard stale results if a newer evaluation started
        if (generation !== generationRef.current) return;

        filterResults.set(filter.id, result);
      }

      const combined = combineScores(filterResults, filters, allPostcodes);
      setScores(combined);
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filters, districts, sectors, amenityData, setScores, setComputing]);
}
