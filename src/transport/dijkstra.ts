import type { DijkstraConstraints, TransportMode } from "../types/transport.ts";
import type { Graph } from "./graph.ts";
import { INTERCHANGE_PENALTY, BOARDING_WAIT, BUS_BOARDING_WAIT } from "./constants.ts";

export interface ParentInfo {
  fromNode: string;
  fromStateKey: string;
  mode: TransportMode;
  line?: string;
}

export interface DijkstraOutput {
  times: Map<string, number>;
  /** Parent info keyed by state key (not node ID) for consistent path reconstruction. */
  parents: Map<string, ParentInfo>;
  /** Maps each node ID to the state key that achieved its best cost. */
  bestState: Map<string, string>;
}

interface DijkstraState {
  nodeId: string;
  changesUsed: number;
  currentLine: string | null;
  currentBusLine: string | null;
  busRidesUsed: number;
  busTimeUsed: number;
}

// Maximum change count we track in state - beyond this we don't differentiate
const MAX_TRACKED_CHANGES = 10;

// Maximum bus rides we track in state
const MAX_TRACKED_BUS_RIDES = 10;

// Bus time bucket granularity in seconds (limits state space)
const BUS_TIME_BUCKET = 60;

function stateKey(
  s: DijkstraState,
  trackChanges: boolean,
  trackBusRides: boolean,
  trackBusTime: boolean,
): string {
  let key = s.nodeId;
  if (trackChanges) {
    key += `|c${Math.min(s.changesUsed, MAX_TRACKED_CHANGES)}`;
  }
  if (trackBusRides) {
    key += `|b${Math.min(s.busRidesUsed, MAX_TRACKED_BUS_RIDES)}`;
    key += `|bl${s.currentBusLine ?? ""}`;
  }
  if (trackBusTime) {
    key += `|bt${Math.floor(s.busTimeUsed / BUS_TIME_BUCKET)}`;
  }
  key += `|${s.currentLine ?? ""}`;
  return key;
}

interface HeapEntry {
  cost: number;
  state: DijkstraState;
}

class MinHeap {
  private data: HeapEntry[] = [];

  push(entry: HeapEntry): void {
    this.data.push(entry);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].cost >= this.data[parent].cost) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].cost < this.data[smallest].cost)
        smallest = left;
      if (right < n && this.data[right].cost < this.data[smallest].cost)
        smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/**
 * Modified Dijkstra that runs from a single source to all reachable nodes.
 * State includes (nodeId, changesUsed, currentLine) to support constraints
 * on maximum interchanges and allowed transport modes.
 *
 * Costs include:
 * - Edge weight (distance-based travel time for rail, walk time for walking)
 * - Boarding wait (BOARDING_WAIT) when first stepping onto a rail line
 *   (i.e. currentLine is null and we take a rail edge)
 * - Interchange penalty (INTERCHANGE_PENALTY) when switching between rail lines
 * - Walking edges reset currentLine to null to prevent double-counting
 *   the interchange penalty
 *
 * Returns times (nodeId -> best travel time in seconds) and
 * parents (nodeId -> ParentInfo for path reconstruction).
 */
export function dijkstraOneToAll(
  graph: Graph,
  sourceId: string,
  constraints: DijkstraConstraints = {},
): DijkstraOutput {
  const {
    maxChanges = Infinity,
    allowedModes,
    maxTime = Infinity,
    maxBusRides = Infinity,
    maxBusTime = Infinity,
  } = constraints;

  // Only track changes in state if there's a meaningful constraint
  const trackChanges = maxChanges < MAX_TRACKED_CHANGES;
  // Only track bus rides/time in state if there's a meaningful constraint
  const trackBusRides = maxBusRides < MAX_TRACKED_BUS_RIDES;
  const trackBusTime = maxBusTime < Infinity;

  const dist = new Map<string, number>(); // stateKey -> cost
  const bestPerNode = new Map<string, number>(); // nodeId -> best cost
  const parentPerState = new Map<string, ParentInfo>(); // stateKey -> parent info
  const bestStatePerNode = new Map<string, string>(); // nodeId -> stateKey

  const heap = new MinHeap();
  const startState: DijkstraState = {
    nodeId: sourceId,
    changesUsed: 0,
    currentLine: null,
    currentBusLine: null,
    busRidesUsed: 0,
    busTimeUsed: 0,
  };

  const startKey = stateKey(startState, trackChanges, trackBusRides, trackBusTime);
  dist.set(startKey, 0);
  bestPerNode.set(sourceId, 0);
  bestStatePerNode.set(sourceId, startKey);
  heap.push({ cost: 0, state: startState });

  while (heap.size > 0) {
    const { cost, state } = heap.pop()!;

    if (cost > maxTime) continue;

    const sk = stateKey(state, trackChanges, trackBusRides, trackBusTime);
    const known = dist.get(sk);
    if (known !== undefined && cost > known) continue;

    for (const edge of graph.getEdges(state.nodeId)) {
      // Check mode constraint
      if (allowedModes && !allowedModes.has(edge.mode)) continue;

      let changes = state.changesUsed;
      let busRides = state.busRidesUsed;
      let busTime = state.busTimeUsed;
      let penalty = 0;

      if (edge.mode === "bus") {
        // Bus edge: independent of rail changes
        busTime += edge.weight;
        // Only charge boarding wait when boarding a new bus (different line or not on a bus)
        if (state.currentBusLine === null || state.currentBusLine !== edge.line) {
          busRides += 1;
          penalty = BUS_BOARDING_WAIT;
        }

        if (busRides > maxBusRides) continue;
        if (busTime > maxBusTime) continue;
      } else if (edge.line) {
        // Rail edge
        if (state.currentLine === null) {
          // First time boarding a train (or re-boarding after walking interchange)
          penalty = BOARDING_WAIT;
        } else if (edge.line !== state.currentLine) {
          // Changing lines at a same-node interchange
          changes += 1;
          penalty = INTERCHANGE_PENALTY;
        }
      }

      if (changes > maxChanges) continue;

      const newCost = cost + edge.weight + penalty;

      if (newCost > maxTime) continue;

      // Rail edges set currentLine to their line.
      // Walking edges preserve currentLine so that boarding a different
      // line after an interchange walk correctly triggers the interchange
      // penalty (not a second boarding wait).
      // Bus edges reset currentLine to null (next rail edge pays boarding wait).
      const newLine = edge.mode === "bus" ? null : (edge.line ?? state.currentLine);

      // Track current bus line: set to edge.line on bus edges, null otherwise
      const newBusLine = edge.mode === "bus" ? (edge.line ?? null) : null;

      const newState: DijkstraState = {
        nodeId: edge.target,
        changesUsed: changes,
        currentLine: newLine,
        currentBusLine: newBusLine,
        busRidesUsed: busRides,
        busTimeUsed: busTime,
      };

      const nsk = stateKey(newState, trackChanges, trackBusRides, trackBusTime);
      const prevCost = dist.get(nsk);
      if (prevCost === undefined || newCost < prevCost) {
        dist.set(nsk, newCost);
        heap.push({ cost: newCost, state: newState });
        parentPerState.set(nsk, {
          fromNode: state.nodeId,
          fromStateKey: sk,
          mode: edge.mode,
          line: edge.line,
        });

        const prevBest = bestPerNode.get(edge.target);
        if (prevBest === undefined || newCost < prevBest) {
          bestPerNode.set(edge.target, newCost);
          bestStatePerNode.set(edge.target, nsk);
        }
      }
    }
  }

  return { times: bestPerNode, parents: parentPerState, bestState: bestStatePerNode };
}

/**
 * Get travel times from source to all postcode centroids.
 * Filters bestPerNode to only include centroid nodes.
 * Returns the full DijkstraOutput (times filtered to centroids, all parents).
 */
export function getPostcodeTimes(
  graph: Graph,
  sourceId: string,
  constraints: DijkstraConstraints = {},
): DijkstraOutput {
  const { times: allTimes, parents, bestState } = dijkstraOneToAll(graph, sourceId, constraints);
  const postcodeTimes = new Map<string, number>();

  for (const [nodeId, time] of allTimes) {
    const node = graph.getNode(nodeId);
    if (node?.type === "centroid") {
      postcodeTimes.set(nodeId, time);
    }
  }

  return { times: postcodeTimes, parents, bestState };
}

export function isRailMode(mode: TransportMode): boolean {
  return mode === "tube" || mode === "overground" || mode === "dlr" || mode === "elizabeth_line" || mode === "national_rail";
}
