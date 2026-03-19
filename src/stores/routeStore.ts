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
  parents: Map<string, ParentInfo>;
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
 * by walking the parent chain.
 */
export function reconstructRoute(
  routeData: RouteData,
  centroidId: string,
): RouteSegment[] {
  const { parents, nodes, sourceId } = routeData;
  const segments: RouteSegment[] = [];

  let current = centroidId;
  const visited = new Set<string>();

  while (current !== sourceId && !visited.has(current)) {
    visited.add(current);
    const parent = parents.get(current);
    if (!parent) break;

    const fromNode = nodes.get(parent.fromNode);
    const toNode = nodes.get(current);
    if (fromNode && toNode) {
      segments.push({
        from: { lat: fromNode.lat, lng: fromNode.lng, nodeId: parent.fromNode },
        to: { lat: toNode.lat, lng: toNode.lng, nodeId: current },
        mode: parent.mode,
        line: parent.line,
      });
    }

    current = parent.fromNode;
  }

  // Segments are from centroid->source, reverse to get source->centroid
  segments.reverse();
  return segments;
}
