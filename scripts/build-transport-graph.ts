/**
 * Build the transport graph from stations + centroids.
 *
 * Node types:
 * - Station nodes (id = station TfL id)
 * - Centroid nodes (id = "centroid:<postcodeId>")
 *
 * Edge types:
 * - Station-to-station on same line: weighted by distance-based travel time
 * - Interchange: nearby stations, different lines = walking edge (no line)
 * - Centroid-to-station: walking distance
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

interface StationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lines: string[];
  modes: string[];
}

interface Centroid {
  id: string;
  lat: number;
  lng: number;
}

interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  type: "station" | "centroid";
  name?: string;
  lines?: string[];
}

interface GraphEdge {
  target: string;
  weight: number;
  line?: string;
  mode: string;
}

interface TransportGraph {
  nodes: Record<string, GraphNode>;
  adjacency: Record<string, GraphEdge[]>;
}

// Haversine distance in meters
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

const WALKING_SPEED = 5000 / 3600; // m/s
const WALKING_DETOUR = 1.3;
const MAX_WALK_M = 2000;

// Interchange walking edges get a small walking weight (2 min to walk
// between platforms). The main interchange cost (waiting for next train)
// is handled by INTERCHANGE_PENALTY in Dijkstra when the line changes.
const INTERCHANGE_WALK_TIME = 120; // seconds

// Track detour factor (tracks curve more than straight-line distance)
const TRACK_DETOUR = 1.35;

// Station dwell time in seconds (doors open/close, passenger flow)
const STATION_DWELL = 30;

// Average line speed in km/h (conservative, includes accel/decel)
const LINE_SPEED_KMH: Record<string, number> = {
  tube: 33,
  overground: 40,
  dlr: 30,
  elizabeth_line: 45,
};

/**
 * Compute realistic travel time between two stations on a rail line.
 * Uses distance-based calculation: (distance * track_detour) / speed + dwell
 */
function computeSegmentTime(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string,
): number {
  const dist = haversineM(fromLat, fromLng, toLat, toLng);
  const trackDist = dist * TRACK_DETOUR;
  const speedMs = ((LINE_SPEED_KMH[mode] ?? 33) * 1000) / 3600;
  const travelTime = trackDist / speedMs;
  return Math.round(travelTime + STATION_DWELL);
}

interface TfLRouteSequence {
  lineId: string;
  lineName: string;
  direction: string;
  orderedLineRoutes: {
    name: string;
    naptanIds: string[];
    serviceType: string;
  }[];
}

async function fetchLineRouteSequences(lineId: string): Promise<string[][]> {
  const url = `https://api.tfl.gov.uk/Line/${lineId}/Route/Sequence/inbound`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: TfLRouteSequence = await res.json();
    return data.orderedLineRoutes
      ?.filter((r) => r.serviceType === "Regular")
      .map((r) => r.naptanIds) ?? [];
  } catch {
    return [];
  }
}

// Bus constants
const BUS_SPEED_KMH = 12;
const BUS_DETOUR = 1.4;
const MAX_BUS_EDGE_DISTANCE = 5000; // 5km
const MIN_BUS_EDGE_DISTANCE = 500; // ignore very short bus edges (walkable)

interface BusStop {
  naptanId: string;
  commonName: string;
  lat: number;
  lon: number;
  lines: { id: string }[];
}

/**
 * Fetch all London bus stops from TfL API (paginated).
 * Results are cached to data/bus-stops.json.
 */
async function fetchBusStops(): Promise<BusStop[]> {
  const cachePath = "data/bus-stops.json";
  if (existsSync(cachePath)) {
    console.log("  Using cached bus stops from data/bus-stops.json");
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  }

  console.log("  Fetching bus stops from TfL API (this may take a moment)...");
  const allStops: BusStop[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.tfl.gov.uk/StopPoint/Mode/bus?page=${page}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  Failed to fetch bus stops page ${page}: ${res.status}`);
      break;
    }
    const data = await res.json();
    const stops: BusStop[] = (data.stopPoints ?? []).map((s: any) => ({
      naptanId: s.naptanId,
      commonName: s.commonName,
      lat: s.lat,
      lon: s.lon,
      lines: (s.lines ?? []).map((l: any) => ({ id: l.id })),
    }));

    if (stops.length === 0) break;
    allStops.push(...stops);
    console.log(`    Page ${page}: ${stops.length} stops (total: ${allStops.length})`);
    page++;
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(cachePath, JSON.stringify(allStops));
  console.log(`  Cached ${allStops.length} bus stops to ${cachePath}`);
  return allStops;
}

/**
 * Generate virtual bus edges between graph nodes that share bus routes.
 * Each bus stop is mapped to its nearest graph node within 500m.
 * Node pairs sharing a bus route get a mode:"bus" edge.
 */
function generateBusEdges(
  graph: TransportGraph,
  addBidirectional: (from: string, to: string, weight: number, mode: string, line?: string) => void,
  busStops: BusStop[],
): number {
  // Build list of all graph nodes with coordinates
  const graphNodes = Object.values(graph.nodes);

  // Map each bus stop to its nearest graph node within 500m
  const stopToNode = new Map<string, string>();
  for (const stop of busStops) {
    let bestNodeId: string | undefined;
    let bestDist = 500; // max 500m mapping distance

    for (const node of graphNodes) {
      const dist = haversineM(stop.lat, stop.lon, node.lat, node.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestNodeId = node.id;
      }
    }

    if (bestNodeId) {
      stopToNode.set(stop.naptanId, bestNodeId);
    }
  }

  console.log(`  Mapped ${stopToNode.size}/${busStops.length} bus stops to graph nodes`);

  // Build: bus route -> set of graph node IDs
  const routeToNodes = new Map<string, Set<string>>();
  for (const stop of busStops) {
    const nodeId = stopToNode.get(stop.naptanId);
    if (!nodeId) continue;

    for (const line of stop.lines) {
      let nodes = routeToNodes.get(line.id);
      if (!nodes) {
        nodes = new Set();
        routeToNodes.set(line.id, nodes);
      }
      nodes.add(nodeId);
    }
  }

  console.log(`  Found ${routeToNodes.size} bus routes mapped to graph nodes`);

  // For each bus route, add edges between all pairs of nodes on that route
  const addedPairs = new Set<string>();
  let edgeCount = 0;

  for (const [_routeId, nodeIds] of routeToNodes) {
    const nodes = Array.from(nodeIds);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const pairKey = [a, b].sort().join("|");
        if (addedPairs.has(pairKey)) continue;

        const nodeA = graph.nodes[a];
        const nodeB = graph.nodes[b];
        const dist = haversineM(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);

        // Skip very short (walkable) and very long edges
        if (dist < MIN_BUS_EDGE_DISTANCE || dist > MAX_BUS_EDGE_DISTANCE) continue;

        addedPairs.add(pairKey);

        // Weight: road distance / bus speed
        const roadDist = dist * BUS_DETOUR;
        const speedMs = (BUS_SPEED_KMH * 1000) / 3600;
        const travelTime = Math.round(roadDist / speedMs);

        addBidirectional(a, b, travelTime, "bus");
        edgeCount++;
      }
    }
  }

  return edgeCount;
}

async function main() {
  console.log("Reading stations and centroids...");
  const stations: StationInfo[] = JSON.parse(
    readFileSync("data/stations.json", "utf-8"),
  );
  const centroids: Centroid[] = JSON.parse(
    readFileSync("data/district-centroids.json", "utf-8"),
  );

  const stationMap = new Map(stations.map((s) => [s.id, s]));

  const graph: TransportGraph = { nodes: {}, adjacency: {} };

  function addNode(node: GraphNode) {
    graph.nodes[node.id] = node;
    if (!graph.adjacency[node.id]) {
      graph.adjacency[node.id] = [];
    }
  }

  function addEdge(from: string, edge: GraphEdge) {
    if (!graph.adjacency[from]) graph.adjacency[from] = [];
    graph.adjacency[from].push(edge);
  }

  function addBidirectional(from: string, to: string, weight: number, mode: string, line?: string) {
    addEdge(from, { target: to, weight, mode, line });
    addEdge(to, { target: from, weight, mode, line });
  }

  // Add station nodes
  console.log("Adding station nodes...");
  for (const s of stations) {
    addNode({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      type: "station",
      name: s.name,
      lines: s.lines,
    });
  }

  // Add centroid nodes
  console.log("Adding centroid nodes...");
  for (const c of centroids) {
    addNode({
      id: `centroid:${c.id}`,
      lat: c.lat,
      lng: c.lng,
      type: "centroid",
    });
  }

  // Known rail lines - only these have usable route sequences.
  // Skipping bus routes (numeric IDs, night buses) avoids TfL API rate limits.
  const KNOWN_RAIL_LINES: Record<string, string> = {
    // Tube
    "northern": "tube",
    "piccadilly": "tube",
    "district": "tube",
    "hammersmith-city": "tube",
    "circle": "tube",
    "metropolitan": "tube",
    "central": "tube",
    "victoria": "tube",
    "jubilee": "tube",
    "waterloo-city": "tube",
    "bakerloo": "tube",
    // DLR
    "dlr": "dlr",
    // Elizabeth line
    "elizabeth": "elizabeth_line",
    // Overground (rebranded named lines)
    "lioness": "overground",
    "mildmay": "overground",
    "suffragette": "overground",
    "windrush": "overground",
    "weaver": "overground",
    "liberty": "overground",
    // National Rail that TfL has route data for
    "southern": "overground",
    "thameslink": "overground",
    "southeastern": "overground",
    "great-northern": "overground",
  };

  // Only fetch route sequences for known rail lines
  const allLines = new Set(stations.flatMap((s) => s.lines));
  const railLines = [...allLines].filter((l) => l in KNOWN_RAIL_LINES);
  console.log(`Fetching route sequences for ${railLines.length} rail lines (skipping ${allLines.size - railLines.length} bus/other)...`);

  for (const lineId of railLines) {
    const mode = KNOWN_RAIL_LINES[lineId];
    console.log(`  Line: ${lineId} (${mode})`)
    const sequences = await fetchLineRouteSequences(lineId);

    const addedPairs = new Set<string>();

    for (const seq of sequences) {
      for (let i = 0; i < seq.length - 1; i++) {
        const from = seq[i];
        const to = seq[i + 1];

        if (!stationMap.has(from) || !stationMap.has(to)) continue;

        const pairKey = [from, to].sort().join("|");
        if (addedPairs.has(pairKey)) continue;
        addedPairs.add(pairKey);

        const fromStation = stationMap.get(from)!;
        const toStation = stationMap.get(to)!;
        const segmentTime = computeSegmentTime(
          fromStation.lat, fromStation.lng,
          toStation.lat, toStation.lng,
          mode,
        );

        addBidirectional(from, to, segmentTime, mode, lineId);
      }
    }
    console.log(`    Added ${addedPairs.size} edges`);
  }

  // Add interchange edges (nearby stations, different lines)
  // These are walking-only edges with NO line property, so Dijkstra
  // will reset currentLine to null and detect the line change on
  // the next rail edge (applying the interchange penalty once).
  console.log("Adding interchange edges...");
  const stationList = Array.from(stationMap.values());
  let interchangeCount = 0;
  for (let i = 0; i < stationList.length; i++) {
    for (let j = i + 1; j < stationList.length; j++) {
      const a = stationList[i];
      const b = stationList[j];
      const dist = haversineM(a.lat, a.lng, b.lat, b.lng);
      if (dist < 200 && a.id !== b.id) {
        const aLines = new Set(a.lines);
        const bLines = new Set(b.lines);
        const hasDiffLine = [...bLines].some((l) => !aLines.has(l)) ||
                            [...aLines].some((l) => !bLines.has(l));
        if (hasDiffLine) {
          // Small walking time only - interchange penalty applied by Dijkstra
          addBidirectional(a.id, b.id, INTERCHANGE_WALK_TIME, "walking");
          interchangeCount++;
        }
      }
    }
  }
  console.log(`  Added ${interchangeCount} interchange edges`);

  // Connect centroids to nearest stations via walking.
  // Every centroid must connect to at least 3 stations so no postcode
  // is permanently unreachable. For distant stations the walk time
  // will be high, which naturally penalises those routes.
  console.log("Connecting centroids to stations...");
  let walkEdgeCount = 0;
  const MIN_STATION_CONNECTIONS = 3;
  for (const c of centroids) {
    const centroidId = `centroid:${c.id}`;

    // Compute distance to ALL stations, sorted by distance
    const allDists: { id: string; dist: number }[] = [];
    for (const s of stations) {
      const dist = haversineM(c.lat, c.lng, s.lat, s.lng);
      allDists.push({ id: s.id, dist });
    }
    allDists.sort((a, b) => a.dist - b.dist);

    // Take all within 2km, or at least MIN_STATION_CONNECTIONS
    const withinWalk = allDists.filter((d) => d.dist <= MAX_WALK_M);
    const toConnect = withinWalk.length >= MIN_STATION_CONNECTIONS
      ? withinWalk.slice(0, 5)
      : allDists.slice(0, MIN_STATION_CONNECTIONS);

    for (const { id, dist } of toConnect) {
      const walkTime = (dist * WALKING_DETOUR) / WALKING_SPEED;
      addBidirectional(centroidId, id, Math.round(walkTime), "walking");
      walkEdgeCount++;
    }
  }
  console.log(`  Added ${walkEdgeCount} centroid-to-station walking edges`);

  // Add virtual bus edges
  console.log("Generating bus edges...");
  const busStops = await fetchBusStops();
  const busEdgeCount = generateBusEdges(graph, addBidirectional, busStops);
  console.log(`  Added ${busEdgeCount} bus edges`);

  // Summary
  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = Object.values(graph.adjacency).reduce(
    (sum, edges) => sum + edges.length,
    0,
  );
  console.log(`\nGraph summary: ${nodeCount} nodes, ${edgeCount} edges`);

  mkdirSync("data", { recursive: true });
  writeFileSync("data/transport-graph.json", JSON.stringify(graph));
  console.log("Written data/transport-graph.json");

  // Also write to public/ so the dev server picks it up immediately
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/transport-graph.json", JSON.stringify(graph));
  console.log("Written public/data/transport-graph.json");
}

main().catch(console.error);
