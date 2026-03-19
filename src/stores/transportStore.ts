import { create } from "zustand";
import type { TransportGraph, StationInfo } from "../types/transport.ts";

interface TransportState {
  graph: TransportGraph | null;
  stations: StationInfo[];
  isLoaded: boolean;
  setGraph: (graph: TransportGraph) => void;
  setStations: (stations: StationInfo[]) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  graph: null,
  stations: [],
  isLoaded: false,
  setGraph: (graph) => set({ graph, isLoaded: true }),
  setStations: (stations) => set({ stations }),
}));
