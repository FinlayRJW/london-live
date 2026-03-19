import { create } from "zustand";
import type { ParentInfo } from "../transport/dijkstra.ts";
import type { TransportMode, GraphNode } from "../types/transport.ts";

export interface RouteSegment {
  from: { lat: number; lng: number; nodeId: string };
  to: { lat: number; lng: number; nodeId: string };
  mode: TransportMode;
  line?: string;
}

export interface RouteData {
  /** Parent info keyed by state key. */
  parents: Map<string, ParentInfo>;
  /** Maps node ID to the state key that achieved its best cost. */
  bestState: Map<string, string>;
  nodes: Map<string, GraphNode>;
  sourceId: string;
}

interface RouteState {
  hoveredPostcode: string | null;
  routeDataByFilter: Map<string, RouteData>;
  setHoveredPostcode: (postcode: string | null) => void;
  setRouteData: (filterId: string, data: RouteData) => void;
  clearRouteData: (filterId: string) => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  hoveredPostcode: null,
  routeDataByFilter: new Map(),
  setHoveredPostcode: (postcode) => set({ hoveredPostcode: postcode }),
  setRouteData: (filterId, data) =>
    set((state) => {
      const next = new Map(state.routeDataByFilter);
      next.set(filterId, data);
      return { routeDataByFilter: next };
    }),
  clearRouteData: (filterId) =>
    set((state) => {
      const next = new Map(state.routeDataByFilter);
      next.delete(filterId);
      return { routeDataByFilter: next };
    }),
}));

/**
 * Reconstruct the route from a centroid node back to the source
 * by walking the state-keyed parent chain. This ensures the path
 * is consistent with the actual Dijkstra state transitions (respecting
 * change constraints, line choices, etc.).
 */
export function reconstructRoute(
  routeData: RouteData,
  centroidId: string,
): RouteSegment[] {
  const { parents, bestState, nodes, sourceId } = routeData;
  const segments: RouteSegment[] = [];

  let currentStateKey = bestState.get(centroidId);
  let currentNodeId = centroidId;
  const visited = new Set<string>();

  while (currentNodeId !== sourceId && currentStateKey && !visited.has(currentStateKey)) {
    visited.add(currentStateKey);
    const parent = parents.get(currentStateKey);
    if (!parent) break;

    const fromNode = nodes.get(parent.fromNode);
    const toNode = nodes.get(currentNodeId);
    if (fromNode && toNode) {
      segments.push({
        from: { lat: fromNode.lat, lng: fromNode.lng, nodeId: parent.fromNode },
        to: { lat: toNode.lat, lng: toNode.lng, nodeId: currentNodeId },
        mode: parent.mode,
        line: parent.line,
      });
    }

    currentNodeId = parent.fromNode;
    currentStateKey = parent.fromStateKey;
  }

  // Segments are from centroid->source, reverse to get source->centroid
  segments.reverse();
  return segments;
}
