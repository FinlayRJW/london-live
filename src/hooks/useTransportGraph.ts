import { useEffect } from "react";
import { useTransportStore } from "../stores/transportStore.ts";
import type { TransportGraph, StationInfo } from "../types/transport.ts";

export function useTransportGraph() {
  const { isLoaded, setGraph, setStations } = useTransportStore();

  useEffect(() => {
    if (isLoaded) return;
    let cancelled = false;

    async function load() {
      try {
        const [graphRes, stationsRes] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/transport-graph.json`),
          fetch(`${import.meta.env.BASE_URL}data/stations.json`),
        ]);

        if (!graphRes.ok || !stationsRes.ok) {
          console.error("Failed to load transport data");
          return;
        }

        const graph: TransportGraph = await graphRes.json();
        const stations: StationInfo[] = await stationsRes.json();

        if (!cancelled) {
          setGraph(graph);
          setStations(stations);
        }
      } catch (e) {
        console.error("Error loading transport data:", e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, setGraph, setStations]);
}
