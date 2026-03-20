import { useState, useEffect } from "react";
import type { PostcodeCollection } from "../types/geo.ts";

export function usePostcodeBoundaries() {
  const [sectors, setSectors] = useState<PostcodeCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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
  }, []);

  return { sectors, isLoading, error };
}
