import { useEffect, useRef } from "react";
import { usePropertyStore } from "../stores/propertyStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { usePropertyFilters } from "./usePropertyFilters.ts";
import { getPropertyIndex } from "./usePropertyIndex.ts";
import type { PropertyData } from "../types/property.ts";

const BASE = import.meta.env.BASE_URL;

/** Module-level cache for the full property bundle. */
let bundleCache: Record<string, PropertyData> | null = null;
let bundleFetchPromise: Promise<Record<string, PropertyData>> | null = null;

function fetchBundle(
  signal: AbortSignal,
): Promise<Record<string, PropertyData>> {
  if (bundleCache) return Promise.resolve(bundleCache);
  if (!bundleFetchPromise) {
    bundleFetchPromise = fetch(`${BASE}data/properties-all.json`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`properties-all.json: ${res.status}`);
        return res.json() as Promise<Record<string, PropertyData>>;
      })
      .then((data) => {
        bundleCache = data;
        return data;
      })
      .catch((err) => {
        bundleFetchPromise = null;
        throw err;
      });
  }
  return bundleFetchPromise;
}

/**
 * Loads property data from a single bundled JSON file.
 * Only fetches districts that haven't been loaded yet, using the cached bundle.
 */
export function usePropertyData() {
  const propertyFilters = usePropertyFilters();
  const enabled = propertyFilters !== null;
  const data = usePropertyStore((s) => s.data);
  const loadingTotal = usePropertyStore((s) => s.loadingTotal);
  const loadingDone = usePropertyStore((s) => s.loadingDone);
  const mergeDistrictData = usePropertyStore((s) => s.mergeDistrictData);
  const markDistrictEmpty = usePropertyStore((s) => s.markDistrictEmpty);
  const setLoadingProgress = usePropertyStore((s) => s.setLoadingProgress);
  const scores = useScoreStore((s) => s.scores);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const { loadedDistricts, loadingDistricts } =
      usePropertyStore.getState();

    // Determine which districts are needed from reachable postcodes
    const neededDistricts = new Set<string>();
    for (const [postcode, score] of scores) {
      if (score.pass) {
        const district = postcode.split(" ")[0];
        neededDistricts.add(district);
      }
    }

    if (neededDistricts.size === 0) return;

    // Filter to districts not yet loaded or in-flight
    const toLoad = [...neededDistricts].filter(
      (d) => !loadedDistricts.has(d) && !loadingDistricts.has(d),
    );

    if (toLoad.length === 0) {
      setLoadingProgress(0, 0);
      return;
    }

    // Abort previous batch if still running
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoadingProgress(0, toLoad.length);

    // Use property index to know which districts have data
    const index = getPropertyIndex();

    fetchBundle(abort.signal)
      .then((bundle) => {
        if (abort.signal.aborted) return;

        for (const district of toLoad) {
          if (abort.signal.aborted) return;

          const districtData = bundle[district];
          if (districtData) {
            mergeDistrictData(district, districtData);
          } else if (index && !(district in index)) {
            // District has no property data at all
            markDistrictEmpty(district);
          } else {
            // District not in bundle (shouldn't happen, but handle gracefully)
            markDistrictEmpty(district);
          }
        }
      })
      .catch(() => {
        // Aborted or network error — ignore
      });

    return () => {
      abort.abort();
    };
  }, [
    enabled,
    scores,
    mergeDistrictData,
    markDistrictEmpty,
    setLoadingProgress,
  ]);

  const isLoading = loadingDone < loadingTotal && loadingTotal > 0;

  return { data, isLoading, enabled, loadingDone, loadingTotal };
}
