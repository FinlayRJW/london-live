import { useEffect, useRef } from "react";
import { useFilterStore } from "../stores/filterStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { usePostcodeBoundaries } from "./usePostcodeBoundaries.ts";
import { useMapStore } from "../stores/mapStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";
import { combineScores } from "../scoring/combiner.ts";
import type { FilterResultMap } from "../types/filter.ts";

export function useScoreComputation() {
  const filters = useFilterStore((s) => s.filters);
  const activeLevel = useMapStore((s) => s.activeLevel);
  const { districts } = usePostcodeBoundaries();
  const { setScores, setComputing } = useScoreStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
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

      const postcodes = districts.features.map(
        (f) => f.properties.id,
      );

      const filterResults = new Map<string, FilterResultMap>();

      for (const filter of enabledFilters) {
        const plugin = getFilterPlugin(filter.typeId);
        if (!plugin) continue;

        const result = await plugin.evaluate(
          filter.config,
          postcodes,
          activeLevel,
          filter.id,
        );
        filterResults.set(filter.id, result);
      }

      const combined = combineScores(filterResults, filters, postcodes);
      setScores(combined);
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filters, districts, activeLevel, setScores, setComputing]);
}
