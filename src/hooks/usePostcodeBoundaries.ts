import { useState, useEffect } from "react";
import type { PostcodeCollection } from "../types/geo.ts";
import { useMapStore } from "../stores/mapStore.ts";

export function usePostcodeBoundaries() {
  const activeLevel = useMapStore((s) => s.activeLevel);
  const [districts, setDistricts] = useState<PostcodeCollection | null>(null);
  const [sectors, setSectors] = useState<PostcodeCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load both datasets on mount. Districts first, then sectors in background.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/districts.geojson`);
        if (!res.ok) throw new Error(`Failed to load districts: ${res.status}`);
        const data: PostcodeCollection = await res.json();
        if (!cancelled) {
          setDistricts(data);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
          setIsLoading(false);
        }
      }

      // Pre-load sectors in background
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/sectors.geojson`);
        if (!res.ok) return;
        const data: PostcodeCollection = await res.json();
        if (!cancelled) {
          setSectors(data);
        }
      } catch {
        // Sectors are optional — failing silently is fine
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The active boundaries for score computation
  const boundaries = activeLevel === "sector" ? (sectors ?? districts) : districts;

  return { districts, sectors, boundaries, isLoading, error };
}
