export type TransportMode = "tube" | "overground" | "dlr" | "elizabeth_line" | "national_rail" | "bus" | "walking" | "cycling";

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  type: "station" | "centroid" | "bus_stop";
  name?: string;
  lines?: string[];
}

export interface GraphEdge {
  target: string;
  weight: number; // seconds
  line?: string; // rail line name, undefined for walk/cycle
  mode: TransportMode;
}

export interface TransportGraph {
  nodes: Record<string, GraphNode>;
  adjacency: Record<string, GraphEdge[]>;
}

export interface StationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lines: string[];
  modes: TransportMode[];
}

export interface DijkstraResult {
  times: Map<string, number>; // nodeId -> seconds
  parents: Map<string, string>; // for path reconstruction
}

export interface DijkstraConstraints {
  maxChanges?: number;
  allowedModes?: Set<TransportMode>;
  maxTime?: number; // seconds
  maxBusRides?: number;
  maxBusTime?: number; // seconds
}
