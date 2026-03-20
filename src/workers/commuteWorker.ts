import { Graph } from "../transport/graph.ts";
import { getPostcodeTimes } from "../transport/dijkstra.ts";
import type { ParentInfo } from "../transport/dijkstra.ts";
import type {
  TransportGraph,
  TransportMode,
  DijkstraConstraints,
  GraphNode,
} from "../types/transport.ts";
import {
  WALKING_SPEED,
  WALKING_DETOUR,
  MAX_WALK_TO_STATION,
  MAX_WALK_TO_BUS_STOP,
} from "../transport/constants.ts";
import { haversineM } from "../utils/geo.ts";

// --- Message types ---

interface InitMessage {
  type: "init";
  graphData: TransportGraph;
}

interface EvaluateMessage {
  type: "evaluate";
  requestId: number;
  config: {
    destinationLat: number;
    destinationLng: number;
    maxTimeMinutes: number;
    maxChanges: number;
    allowedModes: TransportMode[];
    maxBusRides: number;
    maxBusTimeMinutes: number;
    showRoute: boolean;
  };
  postcodes: string[];
  filterId?: string;
}

type WorkerMessage = InitMessage | EvaluateMessage;

interface ResultEntry {
  pass: boolean;
  score?: number;
  detail?: string;
}

interface WorkerResult {
  type: "result";
  requestId: number;
  results: [string, ResultEntry][];
  routeData?: {
    parents: [string, ParentInfo][];
    bestState: [string, string][];
    nodes: [string, GraphNode][];
    sourceId: string;
  };
}

// --- Spatial grid for fast node lookup ---

const GRID_DEG = 0.01; // ~1.1 km cells

interface NodeGrid {
  stations: Map<string, { nodeId: string; node: GraphNode }[]>;
  busStops: Map<string, { nodeId: string; node: GraphNode }[]>;
}

function nodeGridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_DEG)},${Math.floor(lng / GRID_DEG)}`;
}

function buildNodeGrid(graph: Graph): NodeGrid {
  const stations = new Map<string, { nodeId: string; node: GraphNode }[]>();
  const busStops = new Map<string, { nodeId: string; node: GraphNode }[]>();
  for (const [nodeId, node] of graph.nodes) {
    const key = nodeGridKey(node.lat, node.lng);
    const target = node.type === "bus_stop" ? busStops : node.type === "station" ? stations : null;
    if (!target) continue;
    let cell = target.get(key);
    if (!cell) {
      cell = [];
      target.set(key, cell);
    }
    cell.push({ nodeId, node });
  }
  return { stations, busStops };
}

function findNearbyNodes(
  grid: Map<string, { nodeId: string; node: GraphNode }[]>,
  lat: number,
  lng: number,
  radiusM: number,
): { nodeId: string; dist: number }[] {
  const radiusDeg = radiusM / 111_000 + GRID_DEG;
  const cellRadius = Math.ceil(radiusDeg / GRID_DEG);
  const cLat = Math.floor(lat / GRID_DEG);
  const cLng = Math.floor(lng / GRID_DEG);
  const results: { nodeId: string; dist: number }[] = [];
  for (let dlat = -cellRadius; dlat <= cellRadius; dlat++) {
    for (let dlng = -cellRadius; dlng <= cellRadius; dlng++) {
      const cell = grid.get(`${cLat + dlat},${cLng + dlng}`);
      if (!cell) continue;
      for (const { nodeId, node } of cell) {
        const dist = haversineM(lat, lng, node.lat, node.lng);
        if (dist <= radiusM) {
          results.push({ nodeId, dist });
        }
      }
    }
  }
  return results;
}

// --- Worker state ---

let cachedGraph: Graph | null = null;
let cachedNodeGrid: NodeGrid | null = null;

function handleInit(msg: InitMessage) {
  cachedGraph = Graph.fromJSON(msg.graphData);
  cachedNodeGrid = buildNodeGrid(cachedGraph);
}

function handleEvaluate(msg: EvaluateMessage): WorkerResult {
  const { requestId, config, postcodes, filterId } = msg;
  const results: [string, ResultEntry][] = [];

  if (!cachedGraph || !cachedNodeGrid) {
    for (const pc of postcodes) {
      results.push([pc, { pass: true }]);
    }
    return { type: "result", requestId, results };
  }

  const graph = cachedGraph.shallowClone();
  const maxTimeSec = config.maxTimeMinutes * 60;

  // Add temporary destination node
  const destId = "__destination__";
  graph.addNode({
    id: destId,
    lat: config.destinationLat,
    lng: config.destinationLng,
    type: "station",
    name: "Destination",
  });

  // Connect to nearby stations via walking (using spatial grid)
  let nearbyStations = findNearbyNodes(
    cachedNodeGrid.stations,
    config.destinationLat,
    config.destinationLng,
    MAX_WALK_TO_STATION,
  );

  // Widen radius if no stations found
  if (nearbyStations.length === 0) {
    nearbyStations = findNearbyNodes(
      cachedNodeGrid.stations,
      config.destinationLat,
      config.destinationLng,
      MAX_WALK_TO_STATION * 2,
    );
  }

  for (const { nodeId, dist } of nearbyStations) {
    const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
    graph.addBidirectionalEdge(destId, nodeId, walkTime, "walking");
  }

  const maxBusRides = config.maxBusRides ?? 0;

  // Connect destination to nearby bus stops when buses are enabled
  if (maxBusRides > 0) {
    const nearbyBusStops = findNearbyNodes(
      cachedNodeGrid.busStops,
      config.destinationLat,
      config.destinationLng,
      MAX_WALK_TO_BUS_STOP,
    );
    for (const { nodeId, dist } of nearbyBusStops) {
      const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
      graph.addBidirectionalEdge(destId, nodeId, walkTime, "walking");
    }
  }

  const allowedModes = new Set<TransportMode>([
    ...config.allowedModes,
    "walking",
  ]);
  if (maxBusRides > 0) {
    allowedModes.add("bus");
  }

  const exploreTimeSec = Math.round(maxTimeSec * 1.3);

  const constraints: DijkstraConstraints = {
    maxChanges: config.maxChanges >= 99 ? Infinity : config.maxChanges,
    allowedModes,
    maxTime: exploreTimeSec,
    maxBusRides: maxBusRides >= 99 ? Infinity : maxBusRides,
    maxBusTime:
      maxBusRides > 0 ? (config.maxBusTimeMinutes ?? 10) * 60 : 0,
  };

  const { times, parents, bestState } = getPostcodeTimes(
    graph,
    destId,
    constraints,
  );

  // Build route data if showRoute is enabled
  let routeData: WorkerResult["routeData"] | undefined;
  if (config.showRoute && filterId) {
    routeData = {
      parents: Array.from(parents),
      bestState: Array.from(bestState),
      nodes: Array.from(graph.nodes),
      sourceId: destId,
    };
  }

  // Build results
  for (const pc of postcodes) {
    const centroidId = `centroid:${pc}`;
    const time = times.get(centroidId);

    if (time === undefined) {
      results.push([pc, { pass: false, detail: "Not reachable" }]);
    } else if (time > maxTimeSec) {
      const minutes = Math.round(time / 60);
      results.push([
        pc,
        { pass: false, score: 0, detail: `~${minutes} min (over limit)` },
      ]);
    } else {
      const score = 1 - time / maxTimeSec;
      const minutes = Math.round(time / 60);
      results.push([pc, { pass: true, score, detail: `${minutes} min` }]);
    }
  }

  return { type: "result", requestId, results, routeData };
}

// --- Message handler ---

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  if (msg.type === "init") {
    handleInit(msg);
  } else if (msg.type === "evaluate") {
    const result = handleEvaluate(msg);
    self.postMessage(result);
  }
};
