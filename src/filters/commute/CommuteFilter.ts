import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import type { DijkstraConstraints, TransportMode } from "../../types/transport.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { useRouteStore } from "../../stores/routeStore.ts";
import { Graph } from "../../transport/graph.ts";
import { getPostcodeTimes } from "../../transport/dijkstra.ts";
import {
  WALKING_SPEED,
  CYCLING_SPEED,
  WALKING_DETOUR,
  MAX_WALK_TO_STATION,
  MAX_WALK_TO_BUS_STOP,
} from "../../transport/constants.ts";
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

function evaluateWalkOrCycle(
  config: CommuteConfigData,
  postcodes: string[],
): FilterResultMap {
  const results: FilterResultMap = new Map();
  const maxTimeSec = config.maxTimeMinutes * 60;
  const speed = config.travelMethod === "cycle" ? CYCLING_SPEED : WALKING_SPEED;

  // Load centroids from the graph to get lat/lng per postcode
  const graphData = useTransportStore.getState().graph;
  if (!graphData || config.destinationLat === null || config.destinationLng === null) {
    for (const pc of postcodes) {
      results.set(pc, { pass: true });
    }
    return results;
  }

  for (const pc of postcodes) {
    const node = graphData.nodes[`centroid:${pc}`];
    if (!node) {
      results.set(pc, { pass: false, detail: "No data" });
      continue;
    }

    const dist = haversineM(
      config.destinationLat, config.destinationLng,
      node.lat, node.lng,
    );
    const travelTime = (dist * WALKING_DETOUR) / speed;

    if (travelTime > maxTimeSec) {
      results.set(pc, { pass: false, detail: "Too far" });
    } else {
      const minutes = Math.round(travelTime / 60);
      results.set(pc, {
        pass: true,
        score: 1 - travelTime / maxTimeSec,
        detail: `${minutes} min ${config.travelMethod}`,
      });
    }
  }

  return results;
}

function evaluatePublicTransport(
  config: CommuteConfigData,
  postcodes: string[],
  filterId?: string,
): FilterResultMap {
  const results: FilterResultMap = new Map();

  const graphData = useTransportStore.getState().graph;
  if (!graphData || config.destinationLat === null || config.destinationLng === null) {
    for (const pc of postcodes) {
      results.set(pc, { pass: true });
    }
    return results;
  }

  const graph = Graph.fromJSON(graphData);
  const maxTimeSec = config.maxTimeMinutes * 60;

  // Add temporary destination node connected to nearby stations via walking
  const destId = "__destination__";
  graph.addNode({
    id: destId,
    lat: config.destinationLat,
    lng: config.destinationLng,
    type: "station",
    name: "Destination",
  });

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
  const maxBusRides = config.maxBusRides ?? 0;

  // Connect destination to nearby bus stops when buses are enabled
  if (maxBusRides > 0) {
    for (const [nodeId, node] of graph.nodes) {
      if (node.type !== "bus_stop" || nodeId === destId) continue;
      const dist = haversineM(
        config.destinationLat, config.destinationLng,
        node.lat, node.lng,
      );
      if (dist <= MAX_WALK_TO_BUS_STOP) {
        const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
        graph.addBidirectionalEdge(destId, nodeId, walkTime, "walking");
      }
    }
  }
  const allowedModes = new Set<TransportMode>([...railModes, "walking"]);
  if (maxBusRides > 0) {
    allowedModes.add("bus");
  }

  // Explore 50% beyond the time limit so sectors slightly over still
  // have route data and times (shown as orange "maybe reachable").
  const exploreTimeSec = Math.round(maxTimeSec * 1.5);

  const constraints: DijkstraConstraints = {
    maxChanges: config.maxChanges >= 99 ? Infinity : config.maxChanges,
    allowedModes,
    maxTime: exploreTimeSec,
    maxBusRides: maxBusRides >= 99 ? Infinity : maxBusRides,
    maxBusTime: maxBusRides > 0 ? (config.maxBusTimeMinutes ?? 10) * 60 : 0,
  };

  const { times, parents, bestState } = getPostcodeTimes(graph, destId, constraints);

  if (config.showRoute && filterId) {
    useRouteStore.getState().setRouteData(filterId, {
      parents,
      bestState,
      nodes: graph.nodes,
      sourceId: destId,
    });
  } else if (filterId) {
    useRouteStore.getState().clearRouteData(filterId);
  }

  for (const pc of postcodes) {
    const centroidId = `centroid:${pc}`;
    const time = times.get(centroidId);

    if (time === undefined) {
      results.set(pc, {
        pass: false,
        detail: "Not reachable",
      });
    } else if (time > maxTimeSec) {
      const minutes = Math.round(time / 60);
      results.set(pc, {
        pass: false,
        score: 0,
        detail: `~${minutes} min (over limit)`,
      });
    } else {
      const score = 1 - time / maxTimeSec;
      const minutes = Math.round(time / 60);
      results.set(pc, { pass: true, score, detail: `${minutes} min` });
    }
  }

  return results;
}

export const commuteFilter: FilterPlugin<CommuteConfigData> = {
  typeId: "commute",
  displayName: "Commute Time",
  description: "Filter by travel time to a destination address",

  isConfigured(config: CommuteConfigData): boolean {
    return config.destinationLat !== null && config.destinationLng !== null;
  },

  defaultConfig(): CommuteConfigData {
    return {
      destinationAddress: "",
      destinationLat: null,
      destinationLng: null,
      maxTimeMinutes: 45,
      maxChanges: 99,
      travelMethod: "public_transport",
      allowedModes: ["tube", "overground", "dlr", "elizabeth_line"],
      maxBusRides: 0,
      maxBusTimeMinutes: 10,
      showRoute: false,
    };
  },

  evaluate(
    config: CommuteConfigData,
    postcodes: string[],
    _level: PostcodeLevel,
    filterId?: string,
  ): FilterResultMap {
    if (config.destinationLat === null || config.destinationLng === null) {
      const results: FilterResultMap = new Map();
      for (const pc of postcodes) {
        results.set(pc, { pass: true });
      }
      return results;
    }

    if (config.travelMethod === "walk" || config.travelMethod === "cycle") {
      if (filterId) {
        useRouteStore.getState().clearRouteData(filterId);
      }
      return evaluateWalkOrCycle(config, postcodes);
    }

    return evaluatePublicTransport(config, postcodes, filterId);
  },

  ConfigComponent: CommuteConfig,
};
