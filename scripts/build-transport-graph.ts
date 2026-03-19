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
import { readFileSync, writeFileSync, mkdirSync } from "fs";

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

  // Fetch line route sequences and add station-to-station edges
  const allLines = new Set(stations.flatMap((s) => s.lines));
  console.log(`Fetching route sequences for ${allLines.size} lines...`);

  for (const lineId of allLines) {
    console.log(`  Line: ${lineId}`);
    const sequences = await fetchLineRouteSequences(lineId);

    // Determine mode from any station on this line
    let mode = "tube";
    for (const s of stations) {
      if (s.lines.includes(lineId)) {
        if (s.modes.includes("overground")) mode = "overground";
        else if (s.modes.includes("dlr")) mode = "dlr";
        else if (s.modes.includes("elizabeth_line")) mode = "elizabeth_line";
        break;
      }
    }

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

  // Connect centroids to nearest stations via walking
  console.log("Connecting centroids to stations...");
  let walkEdgeCount = 0;
  for (const c of centroids) {
    const centroidId = `centroid:${c.id}`;

    const nearby: { id: string; dist: number }[] = [];
    for (const s of stations) {
      const dist = haversineM(c.lat, c.lng, s.lat, s.lng);
      if (dist <= MAX_WALK_M) {
        nearby.push({ id: s.id, dist });
      }
    }

    nearby.sort((a, b) => a.dist - b.dist);
    const toConnect = nearby.slice(0, 5);

    for (const { id, dist } of toConnect) {
      const walkTime = (dist * WALKING_DETOUR) / WALKING_SPEED;
      addBidirectional(centroidId, id, Math.round(walkTime), "walking");
      walkEdgeCount++;
    }
  }
  console.log(`  Added ${walkEdgeCount} centroid-to-station walking edges`);

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
}

main().catch(console.error);
