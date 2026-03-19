import { useEffect, useRef } from "react";
import { usePropertyStore } from "../stores/propertyStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import type { PropertyData } from "../types/property.ts";

const BASE = import.meta.env.BASE_URL;
const CONCURRENCY = 6;

/**
 * Loads property data per-district, driven by which postcodes pass
 * the active filters. Only fetches districts that haven't been loaded yet.
 */
export function usePropertyData() {
  const enabled = usePropertyStore((s) => s.filters.enabled);
  const data = usePropertyStore((s) => s.data);
  const loadedDistricts = usePropertyStore((s) => s.loadedDistricts);
  const loadingDistricts = usePropertyStore((s) => s.loadingDistricts);
  const loadingTotal = usePropertyStore((s) => s.loadingTotal);
  const loadingDone = usePropertyStore((s) => s.loadingDone);
  const mergeDistrictData = usePropertyStore((s) => s.mergeDistrictData);
  const setLoadingProgress = usePropertyStore((s) => s.setLoadingProgress);
  const scores = useScoreStore((s) => s.scores);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

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

    if (toLoad.length === 0) return;

    // Abort previous batch if still running
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoadingProgress(0, toLoad.length);

    // Fetch districts with concurrency limit
    let idx = 0;
    const fetchNext = async (): Promise<void> => {
      while (idx < toLoad.length) {
        if (abort.signal.aborted) return;
        const district = toLoad[idx++];
        try {
          const res = await fetch(
            `${BASE}data/properties/${district}.json`,
            { signal: abort.signal },
          );
          if (!res.ok) continue;
          const districtData = (await res.json()) as PropertyData;
          if (!abort.signal.aborted) {
            mergeDistrictData(district, districtData);
          }
        } catch {
          // Aborted or network error - skip
        }
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => fetchNext());
    Promise.all(workers);

    return () => {
      abort.abort();
    };
  }, [
    enabled,
    scores,
    loadedDistricts,
    loadingDistricts,
    mergeDistrictData,
    setLoadingProgress,
  ]);

  const isLoading = loadingDone < loadingTotal && loadingTotal > 0;

  return { data, isLoading, enabled, loadingDone, loadingTotal };
}
