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
  type: "station" | "centroid" | "bus_stop";
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
const BUS_STOP_DWELL = 15; // seconds per intermediate bus stop
const MAX_WALK_TO_BUS_STOP = 500; // meters

interface BusRouteSequence {
  routeId: string;
  stops: { naptanId: string; name: string; lat: number; lon: number }[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch ordered bus stop sequences from TfL API for all daytime bus routes.
 * Results are cached to data/bus-route-sequences.json.
 */
async function fetchBusRouteSequences(
  knownRailLines: Record<string, string>,
): Promise<BusRouteSequence[]> {
  const cachePath = "data/bus-route-sequences.json";
  if (existsSync(cachePath)) {
    console.log("  Using cached bus route sequences from data/bus-route-sequences.json");
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  }

  console.log("  Fetching bus route list from TfL API...");
  const listRes = await fetch("https://api.tfl.gov.uk/Line/Mode/bus");
  if (!listRes.ok) {
    console.error(`  Failed to fetch bus lines: ${listRes.status}`);
    return [];
  }
  const allBusLines: { id: string }[] = await listRes.json();

  // Filter: skip night buses (n + digit), skip known rail lines
  const nightBusRegex = /^n\d/i;
  const dayRoutes = allBusLines
    .map((l) => l.id)
    .filter((id) => !nightBusRegex.test(id) && !(id in knownRailLines));

  console.log(`  Found ${dayRoutes.length} daytime bus routes (filtered from ${allBusLines.length} total)`);

  // Fetch in batches with pauses to avoid TfL rate limits (no API key)
  const BATCH_SIZE = 10;
  const DELAY_WITHIN_BATCH = 600; // ms between requests in a batch
  const DELAY_BETWEEN_BATCHES = 5000; // ms pause between batches

  const sequences: BusRouteSequence[] = [];
  for (let i = 0; i < dayRoutes.length; i++) {
    const routeId = dayRoutes[i];
    if (i > 0 && i % 50 === 0) {
      console.log(`    Progress: ${i}/${dayRoutes.length} routes (${sequences.length} successful)...`);
    }

    try {
      const url = `https://api.tfl.gov.uk/Line/${routeId}/Route/Sequence/inbound`;
      let res = await fetch(url);

      // Retry on rate limit with exponential backoff
      if (res.status === 429) {
        for (const backoff of [5000, 15000, 30000]) {
          console.warn(`    Rate limited on ${routeId}, retrying in ${backoff / 1000}s...`);
          await delay(backoff);
          res = await fetch(url);
          if (res.status !== 429) break;
        }
      }

      if (!res.ok) {
        console.warn(`    Warning: failed to fetch route ${routeId}: ${res.status}`);
        await delay(DELAY_WITHIN_BATCH);
        continue;
      }
      const data: TfLRouteSequence = await res.json();

      // Use the first Regular route sequence (inbound direction)
      const regularRoutes = data.orderedLineRoutes?.filter(
        (r) => r.serviceType === "Regular",
      ) ?? [];
      if (regularRoutes.length === 0 || !data.stopPointSequences) {
        await delay(DELAY_WITHIN_BATCH);
        continue;
      }

      // stopPointSequences has the full stop details (lat/lon/name)
      const stopSequences: any[] = (data as any).stopPointSequences ?? [];
      const regularSeq = stopSequences.find(
        (s: any) => s.serviceType === "Regular",
      );
      if (!regularSeq?.stopPoint?.length) {
        await delay(DELAY_WITHIN_BATCH);
        continue;
      }

      const stops = (regularSeq.stopPoint as any[]).map((sp: any) => ({
        naptanId: sp.id as string,
        name: (sp.name ?? sp.commonName ?? "") as string,
        lat: sp.lat as number,
        lon: sp.lon as number,
      }));

      if (stops.length >= 2) {
        sequences.push({ routeId, stops });
      }
    } catch (err) {
      console.warn(`    Warning: error fetching route ${routeId}: ${err}`);
    }

    // Longer pause between batches to stay under rate limits
    if ((i + 1) % BATCH_SIZE === 0) {
      await delay(DELAY_BETWEEN_BATCHES);
    } else {
      await delay(DELAY_WITHIN_BATCH);
    }
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(cachePath, JSON.stringify(sequences));
  console.log(`  Cached ${sequences.length} bus route sequences to ${cachePath}`);
  return sequences;
}

/**
 * Generate sequential stop-to-stop bus edges from route sequences.
 * Adds bus stop nodes to the graph and connects them to nearby stations/centroids.
 */
function generateSequentialBusEdges(
  graph: TransportGraph,
  addNode: (node: GraphNode) => void,
  addBidirectional: (from: string, to: string, weight: number, mode: string, line?: string) => void,
  routeSequences: BusRouteSequence[],
  stations: StationInfo[],
  centroids: Centroid[],
): { busEdgeCount: number; busStopCount: number; walkEdgeCount: number } {
  const busSpeedMs = (BUS_SPEED_KMH * 1000) / 3600;
  const addedStops = new Set<string>();
  const addedBusEdges = new Set<string>();
  let busEdgeCount = 0;

  // Collect all unique bus stops from route sequences and add as nodes
  for (const seq of routeSequences) {
    for (const stop of seq.stops) {
      if (!addedStops.has(stop.naptanId)) {
        addedStops.add(stop.naptanId);
        addNode({
          id: stop.naptanId,
          lat: stop.lat,
          lng: stop.lon,
          type: "bus_stop",
          name: stop.name,
        });
      }
    }
  }

  console.log(`  Added ${addedStops.size} bus stop nodes`);

  // Create sequential edges between consecutive stops on each route
  for (const seq of routeSequences) {
    for (let i = 0; i < seq.stops.length - 1; i++) {
      const from = seq.stops[i];
      const to = seq.stops[i + 1];

      // Deduplicate: same pair on same route (bidirectional key)
      const edgeKey = `${seq.routeId}|${[from.naptanId, to.naptanId].sort().join("|")}`;
      if (addedBusEdges.has(edgeKey)) continue;
      addedBusEdges.add(edgeKey);

      const dist = haversineM(from.lat, from.lon, to.lat, to.lon);
      const roadDist = dist * BUS_DETOUR;
      const travelTime = Math.round(roadDist / busSpeedMs + BUS_STOP_DWELL);

      addBidirectional(from.naptanId, to.naptanId, travelTime, "bus", seq.routeId);
      busEdgeCount++;
    }
  }

  // Connect bus stops to nearby stations via walking edges
  let walkEdgeCount = 0;
  const busStopNodes = [...addedStops].map((id) => graph.nodes[id]).filter(Boolean);

  for (const busStop of busStopNodes) {
    for (const station of stations) {
      const dist = haversineM(busStop.lat, busStop.lng, station.lat, station.lng);
      if (dist <= MAX_WALK_TO_BUS_STOP) {
        const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
        addBidirectional(busStop.id, station.id, walkTime, "walking");
        walkEdgeCount++;
      }
    }
  }

  // Connect bus stops to nearby centroids via walking edges
  for (const busStop of busStopNodes) {
    for (const centroid of centroids) {
      const centroidId = `centroid:${centroid.id}`;
      const dist = haversineM(busStop.lat, busStop.lng, centroid.lat, centroid.lng);
      if (dist <= MAX_WALK_TO_BUS_STOP) {
        const walkTime = Math.round((dist * WALKING_DETOUR) / WALKING_SPEED);
        addBidirectional(busStop.id, centroidId, walkTime, "walking");
        walkEdgeCount++;
      }
    }
  }

  return { busEdgeCount, busStopCount: addedStops.size, walkEdgeCount };
}

async function main() {
  console.log("Reading stations and centroids...");
  const stations: StationInfo[] = JSON.parse(
    readFileSync("data/stations.json", "utf-8"),
  );
  const centroids: Centroid[] = JSON.parse(
    readFileSync("data/district-centroids.json", "utf-8"),
  );
  const sectorCentroids: Centroid[] = existsSync("data/sector-centroids.json")
    ? JSON.parse(readFileSync("data/sector-centroids.json", "utf-8"))
    : [];

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

  // Add district centroid nodes
  console.log("Adding district centroid nodes...");
  for (const c of centroids) {
    addNode({
      id: `centroid:${c.id}`,
      lat: c.lat,
      lng: c.lng,
      type: "centroid",
    });
  }

  // Add sector centroid nodes
  if (sectorCentroids.length > 0) {
    console.log(`Adding ${sectorCentroids.length} sector centroid nodes...`);
    for (const c of sectorCentroids) {
      addNode({
        id: `centroid:${c.id}`,
        lat: c.lat,
        lng: c.lng,
        type: "centroid",
      });
    }
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
  const allCentroids = [...centroids, ...sectorCentroids];
  console.log(`Connecting ${allCentroids.length} centroids to stations (${centroids.length} district + ${sectorCentroids.length} sector)...`);
  let walkEdgeCount = 0;
  const MIN_STATION_CONNECTIONS = 3;
  for (const c of allCentroids) {
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

  // Add sequential bus stop-to-stop edges
  console.log("Generating sequential bus edges...");
  const busRouteSequences = await fetchBusRouteSequences(KNOWN_RAIL_LINES);
  const { busEdgeCount, busStopCount, walkEdgeCount: busWalkEdges } =
    generateSequentialBusEdges(graph, addNode, addBidirectional, busRouteSequences, stations, allCentroids);
  console.log(`  Added ${busStopCount} bus stop nodes, ${busEdgeCount} bus edges, ${busWalkEdges} bus-walk edges`);

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
