import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL;

let cachedIndex: Record<string, number> | null = null;
let fetchPromise: Promise<Record<string, number>> | null = null;

function fetchIndex(): Promise<Record<string, number>> {
  if (!fetchPromise) {
    fetchPromise = fetch(`${BASE}data/property-index.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`property-index.json: ${res.status}`);
        return res.json() as Promise<Record<string, number>>;
      })
      .then((data) => {
        cachedIndex = data;
        return data;
      });
  }
  return fetchPromise;
}

// Start fetching eagerly on module load
fetchIndex();

/** Returns the property index (district -> sale count) or null if not yet loaded. */
export function getPropertyIndex(): Record<string, number> | null {
  return cachedIndex;
}

/** React hook that returns the property index once loaded. */
export function usePropertyIndex(): Record<string, number> | null {
  const [index, setIndex] = useState(cachedIndex);

  useEffect(() => {
    if (cachedIndex) {
      setIndex(cachedIndex);
      return;
    }
    fetchIndex().then(setIndex);
  }, []);

  return index;
}
