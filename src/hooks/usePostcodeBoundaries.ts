import { useState, useEffect } from "react";
import type { PostcodeCollection } from "../types/geo.ts";
import { useMapStore } from "../stores/mapStore.ts";

export function usePostcodeBoundaries() {
  const activeLevel = useMapStore((s) => s.activeLevel);
  const [districts, setDistricts] = useState<PostcodeCollection | null>(null);
  const [sectors, setSectors] = useState<PostcodeCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always load districts on mount
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
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load sectors when activeLevel switches to "sector"
  useEffect(() => {
    if (activeLevel !== "sector" || sectors) return;
    let cancelled = false;
    setIsLoading(true);

    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/sectors.geojson`);
        if (!res.ok) throw new Error(`Failed to load sectors: ${res.status}`);
        const data: PostcodeCollection = await res.json();
        if (!cancelled) {
          setSectors(data);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeLevel, sectors]);

  // Return sector data when at sector level, fall back to districts while loading
  const boundaries = activeLevel === "sector" ? (sectors ?? districts) : districts;

  return { boundaries, isLoading, error };
}
