import { useEffect, useRef } from "react";
import { useFilterStore } from "../stores/filterStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { useFilterResultStore } from "../stores/filterResultStore.ts";
import { usePostcodeBoundaries } from "./usePostcodeBoundaries.ts";
import { useMapStore } from "../stores/mapStore.ts";
import { useAmenityStore } from "../stores/amenityStore.ts";
import { useTransportStore } from "../stores/transportStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";
import { setPostcodesForCombination } from "../scoring/reactiveCombiner.ts";
import type { FilterInstance, FilterResultMap } from "../types/filter.ts";

interface CachedFilterResult {
  configJson: string;
  postcodeCount: number;
  result: FilterResultMap;
}

interface PrevFilterSnapshot {
  configJson: string;
  enabled: boolean;
  weight: number;
  typeId: string;
}

export function useScoreComputation() {
  const filters = useFilterStore((s) => s.filters);
  const activeLevel = useMapStore((s) => s.activeLevel);
  const { districts, sectors } = usePostcodeBoundaries();
  const { setComputing } = useScoreStore();
  const amenityData = useAmenityStore((s) => s.data);
  const transportLoaded = useTransportStore((s) => s.isLoaded);

  const cacheRef = useRef<Map<string, CachedFilterResult>>(new Map());
  const prevFiltersRef = useRef<Map<string, PrevFilterSnapshot>>(new Map());
  const prevPostcodesRef = useRef<string[]>([]);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  // Effect 1: When postcodes change, update the combiner and re-evaluate all filters
  useEffect(() => {
    const districtPcs = districts?.features.map((f) => f.properties.id) ?? [];
    const sectorPcs = sectors?.features.map((f) => f.properties.id) ?? [];
    const allPostcodes = [...districtPcs, ...sectorPcs];

    const postcodesChanged =
      allPostcodes.length !== prevPostcodesRef.current.length ||
      allPostcodes.some((pc, i) => pc !== prevPostcodesRef.current[i]);

    prevPostcodesRef.current = allPostcodes;
    setPostcodesForCombination(allPostcodes);

    if (postcodesChanged && allPostcodes.length > 0) {
      // Invalidate all caches (postcode set changed) and re-evaluate all
      cacheRef.current.clear();
      useFilterResultStore.getState().clearAll();
      for (const filter of filters) {
        scheduleEvaluation(filter, allPostcodes);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, sectors]);

  // Effect 2: Diff filters to detect what changed
  useEffect(() => {
    const allPostcodes = prevPostcodesRef.current;
    if (allPostcodes.length === 0) return;

    const prevMap = prevFiltersRef.current;
    const currentMap = new Map<string, PrevFilterSnapshot>();
    const { removeFilterResult } = useFilterResultStore.getState();

    for (const filter of filters) {
      const configJson = JSON.stringify(filter.config);
      currentMap.set(filter.id, {
        configJson,
        enabled: filter.enabled,
        weight: filter.weight,
        typeId: filter.typeId,
      });

      const prev = prevMap.get(filter.id);

      if (!prev) {
        // New filter added
        scheduleEvaluation(filter, allPostcodes);
        continue;
      }

      if (!filter.enabled && prev.enabled) {
        // Toggled off
        cancelEvaluation(filter.id);
        removeFilterResult(filter.id);
        continue;
      }

      if (filter.enabled && !prev.enabled) {
        // Toggled on - use cache if available, otherwise re-evaluate
        const cached = cacheRef.current.get(filter.id);
        if (
          cached &&
          cached.configJson === configJson &&
          cached.postcodeCount === allPostcodes.length
        ) {
          useFilterResultStore.getState().setFilterResult(filter.id, cached.result);
        } else {
          scheduleEvaluation(filter, allPostcodes);
        }
        continue;
      }

      if (prev.configJson !== configJson) {
        // Config changed - re-evaluate
        scheduleEvaluation(filter, allPostcodes);
        continue;
      }

      // Weight-only change: reactive combiner handles it, no re-evaluation
    }

    // Detect removed filters
    for (const [id] of prevMap) {
      if (!currentMap.has(id)) {
        cancelEvaluation(id);
        removeFilterResult(id);
        cacheRef.current.delete(id);
      }
    }

    prevFiltersRef.current = currentMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, amenityData, transportLoaded]);

  function scheduleEvaluation(filter: FilterInstance, postcodes: string[]) {
    if (!filter.enabled) return;
    const plugin = getFilterPlugin(filter.typeId);
    if (!plugin || !plugin.isConfigured(filter.config)) return;

    // Skip evaluation for scoringNoOp filters
    if (plugin.scoringNoOp) return;

    // Cancel any pending evaluation for this filter
    cancelEvaluation(filter.id);

    const timer = setTimeout(async () => {
      debounceTimers.current.delete(filter.id);

      const controller = new AbortController();
      abortControllers.current.set(filter.id, controller);

      setComputing(true);
      useFilterResultStore.getState().setEvaluating(filter.id, true);

      try {
        const result = await plugin.evaluate(
          filter.config,
          postcodes,
          activeLevel,
          filter.id,
        );

        // Check if this evaluation was cancelled
        if (controller.signal.aborted) return;

        // Cache the result
        cacheRef.current.set(filter.id, {
          configJson: JSON.stringify(filter.config),
          postcodeCount: postcodes.length,
          result,
        });

        useFilterResultStore.getState().setFilterResult(filter.id, result);
      } catch {
        // Evaluation failed or was aborted - remove from evaluating
        if (!controller.signal.aborted) {
          useFilterResultStore.getState().setEvaluating(filter.id, false);
        }
      } finally {
        abortControllers.current.delete(filter.id);
      }
    }, 150);

    debounceTimers.current.set(filter.id, timer);
  }

  function cancelEvaluation(filterId: string) {
    const timer = debounceTimers.current.get(filterId);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.current.delete(filterId);
    }

    const controller = abortControllers.current.get(filterId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(filterId);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    const controllers = abortControllers.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      for (const controller of controllers.values()) {
        controller.abort();
      }
    };
  }, []);
}
