import type { DijkstraConstraints, TransportMode } from "../types/transport.ts";
import type { Graph } from "./graph.ts";
import { INTERCHANGE_PENALTY } from "./constants.ts";

interface DijkstraState {
  nodeId: string;
  changesUsed: number;
  currentLine: string | null;
}

// Maximum change count we track in state - beyond this we don't differentiate
const MAX_TRACKED_CHANGES = 10;

function stateKey(s: DijkstraState, trackChanges: boolean): string {
  if (!trackChanges) {
    return `${s.nodeId}|${s.currentLine ?? ""}`;
  }
  return `${s.nodeId}|${Math.min(s.changesUsed, MAX_TRACKED_CHANGES)}|${s.currentLine ?? ""}`;
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
 * Returns a Map from nodeId to best travel time in seconds.
 */
export function dijkstraOneToAll(
  graph: Graph,
  sourceId: string,
  constraints: DijkstraConstraints = {},
): Map<string, number> {
  const { maxChanges = Infinity, allowedModes, maxTime = Infinity } = constraints;

  // Only track changes in state if there's a meaningful constraint
  const trackChanges = maxChanges < MAX_TRACKED_CHANGES;

  const dist = new Map<string, number>(); // stateKey -> cost
  const bestPerNode = new Map<string, number>(); // nodeId -> best cost

  const heap = new MinHeap();
  const startState: DijkstraState = {
    nodeId: sourceId,
    changesUsed: 0,
    currentLine: null,
  };

  dist.set(stateKey(startState, trackChanges), 0);
  bestPerNode.set(sourceId, 0);
  heap.push({ cost: 0, state: startState });

  while (heap.size > 0) {
    const { cost, state } = heap.pop()!;

    if (cost > maxTime) continue;

    const sk = stateKey(state, trackChanges);
    const known = dist.get(sk);
    if (known !== undefined && cost > known) continue;

    for (const edge of graph.getEdges(state.nodeId)) {
      // Check mode constraint
      if (allowedModes && !allowedModes.has(edge.mode)) continue;

      // Compute changes
      let changes = state.changesUsed;
      let isInterchange = false;
      if (edge.line && state.currentLine && edge.line !== state.currentLine) {
        changes += 1;
        isInterchange = true;
      }
      if (changes > maxChanges) continue;

      const penalty = isInterchange ? INTERCHANGE_PENALTY : 0;
      const newCost = cost + edge.weight + penalty;

      if (newCost > maxTime) continue;

      const newState: DijkstraState = {
        nodeId: edge.target,
        changesUsed: changes,
        currentLine: edge.line ?? state.currentLine,
      };

      const nsk = stateKey(newState, trackChanges);
      const prevCost = dist.get(nsk);
      if (prevCost === undefined || newCost < prevCost) {
        dist.set(nsk, newCost);
        heap.push({ cost: newCost, state: newState });

        const prevBest = bestPerNode.get(edge.target);
        if (prevBest === undefined || newCost < prevBest) {
          bestPerNode.set(edge.target, newCost);
        }
      }
    }
  }

  return bestPerNode;
}

/**
 * Get travel times from source to all postcode centroids.
 * Filters bestPerNode to only include centroid nodes.
 */
export function getPostcodeTimes(
  graph: Graph,
  sourceId: string,
  constraints: DijkstraConstraints = {},
): Map<string, number> {
  const allTimes = dijkstraOneToAll(graph, sourceId, constraints);
  const postcodeTimes = new Map<string, number>();

  for (const [nodeId, time] of allTimes) {
    const node = graph.getNode(nodeId);
    if (node?.type === "centroid") {
      postcodeTimes.set(nodeId, time);
    }
  }

  return postcodeTimes;
}

export function isRailMode(mode: TransportMode): boolean {
  return mode === "tube" || mode === "overground" || mode === "dlr" || mode === "elizabeth_line";
}
