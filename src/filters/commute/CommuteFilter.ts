import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import type { DijkstraConstraints, TransportMode } from "../../types/transport.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { Graph } from "../../transport/graph.ts";
import { getPostcodeTimes } from "../../transport/dijkstra.ts";
import { WALKING_SPEED, WALKING_DETOUR, MAX_WALK_TO_STATION } from "../../transport/constants.ts";
import { CommuteConfig, type CommuteConfigData } from "./CommuteConfig.tsx";

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const commuteFilter: FilterPlugin<CommuteConfigData> = {
  typeId: "commute",
  displayName: "Commute Time",
  description: "Filter by travel time to a destination address",

  defaultConfig(): CommuteConfigData {
    return {
      destinationAddress: "",
      destinationLat: null,
      destinationLng: null,
      maxTimeMinutes: 45,
      maxChanges: 5,
      allowedModes: ["tube", "overground", "dlr", "elizabeth_line"],
    };
  },

  evaluate(
    config: CommuteConfigData,
    postcodes: string[],
    _level: PostcodeLevel,
  ): FilterResultMap {
    const results: FilterResultMap = new Map();

    if (config.destinationLat === null || config.destinationLng === null) {
      for (const pc of postcodes) {
        results.set(pc, { pass: true });
      }
      return results;
    }

    const graphData = useTransportStore.getState().graph;
    if (!graphData) {
      for (const pc of postcodes) {
        results.set(pc, { pass: true });
      }
      return results;
    }

    const graph = Graph.fromJSON(graphData);
    const maxTimeSec = config.maxTimeMinutes * 60;

    // Add a temporary "destination" node at the geocoded lat/lng
    // and connect it to nearby stations via walking
    const destId = "__destination__";
    graph.addNode({
      id: destId,
      lat: config.destinationLat,
      lng: config.destinationLng,
      type: "station",
      name: "Destination",
    });

    // Find nearby stations and connect via walking
    let connectedStations = 0;
    for (const [nodeId, node] of graph.nodes) {
      if (node.type !== "station" || nodeId === destId) continue;
      const dist = haversineM(
        config.destinationLat, config.destinationLng,
        node.lat, node.lng,
      );
      if (dist <= MAX_WALK_TO_STATION) {
        const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
        graph.addBidirectionalEdge(destId, nodeId, walkTime, "walking");
        connectedStations++;
      }
    }

    // If no stations nearby, try a wider radius
    if (connectedStations === 0) {
      const widerRadius = MAX_WALK_TO_STATION * 2;
      for (const [nodeId, node] of graph.nodes) {
        if (node.type !== "station" || nodeId === destId) continue;
        const dist = haversineM(
          config.destinationLat, config.destinationLng,
          node.lat, node.lng,
        );
        if (dist <= widerRadius) {
          const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
          graph.addBidirectionalEdge(destId, nodeId, walkTime, "walking");
        }
      }
    }

    const railModes: TransportMode[] = config.allowedModes;
    const allowedModes = new Set<TransportMode>([
      ...railModes,
      "walking",
      "cycling",
    ]);

    const constraints: DijkstraConstraints = {
      maxChanges: config.maxChanges >= 5 ? Infinity : config.maxChanges,
      allowedModes,
      maxTime: maxTimeSec,
    };

    const times = getPostcodeTimes(graph, destId, constraints);

    for (const pc of postcodes) {
      const centroidId = `centroid:${pc}`;
      const time = times.get(centroidId);

      if (time === undefined || time > maxTimeSec) {
        results.set(pc, {
          pass: false,
          detail: "Not reachable within time limit",
        });
      } else {
        const score = 1 - time / maxTimeSec;
        const minutes = Math.round(time / 60);
        results.set(pc, {
          pass: true,
          score,
          detail: `${minutes} min`,
        });
      }
    }

    return results;
  },

  ConfigComponent: CommuteConfig,
};
