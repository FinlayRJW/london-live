import { useEffect } from "react";
import { usePropertyStore } from "../stores/propertyStore.ts";
import type { PropertyData } from "../types/property.ts";

/**
 * Lazily loads property price data when the property layer is enabled.
 * Only fetches once - subsequent enables reuse the cached data.
 */
export function usePropertyData() {
  const enabled = usePropertyStore((s) => s.filters.enabled);
  const data = usePropertyStore((s) => s.data);
  const isLoading = usePropertyStore((s) => s.isLoading);
  const setData = usePropertyStore((s) => s.setData);
  const setLoading = usePropertyStore((s) => s.setLoading);

  useEffect(() => {
    if (!enabled || data || isLoading) return;

    let cancelled = false;
    setLoading(true);

    fetch(`${import.meta.env.BASE_URL}data/property-prices.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PropertyData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load property data:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, data, isLoading, setData, setLoading]);

  return { data, isLoading, enabled };
}
