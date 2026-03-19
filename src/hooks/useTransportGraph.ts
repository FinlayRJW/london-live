import { useEffect } from "react";
import { useTransportStore } from "../stores/transportStore.ts";
import { useFilterStore } from "../stores/filterStore.ts";
import { getCommuteWorker } from "../workers/commuteWorkerClient.ts";
import type { TransportGraph, StationInfo } from "../types/transport.ts";

export function useTransportGraph() {
  const { isLoaded, setGraph, setStations } = useTransportStore();
  const hasCommuteFilter = useFilterStore((s) =>
    s.filters.some((f) => f.typeId === "commute"),
  );

  useEffect(() => {
    if (isLoaded || !hasCommuteFilter) return;
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
          getCommuteWorker().initGraph(graph);
        }
      } catch (e) {
        console.error("Error loading transport data:", e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, hasCommuteFilter, setGraph, setStations]);
}
