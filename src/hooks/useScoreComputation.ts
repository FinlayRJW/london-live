import { useEffect, useRef } from "react";
import { useFilterStore } from "../stores/filterStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { usePostcodeBoundaries } from "./usePostcodeBoundaries.ts";
import { useMapStore } from "../stores/mapStore.ts";
import { useAmenityStore } from "../stores/amenityStore.ts";
import { useTransportStore } from "../stores/transportStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";
import { combineScores } from "../scoring/combiner.ts";
import type { FilterResultMap } from "../types/filter.ts";

interface CachedFilterResult {
  configJson: string;
  postcodeCount: number;
  result: FilterResultMap;
}

export function useScoreComputation() {
  const filters = useFilterStore((s) => s.filters);
  const activeLevel = useMapStore((s) => s.activeLevel);
  const { districts, sectors } = usePostcodeBoundaries();
  const { setScores, setComputing } = useScoreStore();
  const amenityData = useAmenityStore((s) => s.data);
  const transportLoaded = useTransportStore((s) => s.isLoaded);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generationRef = useRef(0);
  const cacheRef = useRef<Map<string, CachedFilterResult>>(new Map());

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

      const districtPcs = districts.features.map((f) => f.properties.id);
      const sectorPcs = sectors?.features.map((f) => f.properties.id) ?? [];
      const allPostcodes = [...districtPcs, ...sectorPcs];

      const filterResults = new Map<string, FilterResultMap>();
      const cache = cacheRef.current;

      // Clean stale cache entries for filters that no longer exist
      const enabledIds = new Set(enabledFilters.map((f) => f.id));
      for (const key of cache.keys()) {
        if (!enabledIds.has(key)) cache.delete(key);
      }

      for (const filter of enabledFilters) {
        const plugin = getFilterPlugin(filter.typeId);
        if (!plugin) continue;

        // Check if we can reuse cached results for this filter
        const configJson = JSON.stringify(filter.config);
        const cached = cache.get(filter.id);
        if (
          cached &&
          cached.configJson === configJson &&
          cached.postcodeCount === allPostcodes.length
        ) {
          filterResults.set(filter.id, cached.result);
          continue;
        }

        const result = await plugin.evaluate(
          filter.config,
          allPostcodes,
          activeLevel,
          filter.id,
        );

        if (generation !== generationRef.current) return;

        // Cache this result
        cache.set(filter.id, {
          configJson,
          postcodeCount: allPostcodes.length,
          result,
        });

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
  }, [filters, districts, sectors, amenityData, transportLoaded, setScores, setComputing]);
}
