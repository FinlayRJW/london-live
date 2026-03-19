import type { FilterResult, FilterResultMap } from "../types/filter.ts";
import type { ParentInfo } from "../transport/dijkstra.ts";
import type { TransportGraph, TransportMode, GraphNode } from "../types/transport.ts";
import type { RouteData } from "../stores/routeStore.ts";

interface EvaluateConfig {
  destinationLat: number;
  destinationLng: number;
  maxTimeMinutes: number;
  maxChanges: number;
  allowedModes: TransportMode[];
  maxBusRides: number;
  maxBusTimeMinutes: number;
  showRoute: boolean;
}

interface WorkerResultMessage {
  type: "result";
  requestId: number;
  results: [string, FilterResult][];
  routeData?: {
    parents: [string, ParentInfo][];
    bestState: [string, string][];
    nodes: [string, GraphNode][];
    sourceId: string;
  };
}

interface EvaluateResult {
  results: FilterResultMap;
  routeData?: RouteData;
}

function configCacheKey(config: EvaluateConfig): string {
  return JSON.stringify({
    lat: config.destinationLat,
    lng: config.destinationLng,
    time: config.maxTimeMinutes,
    changes: config.maxChanges,
    modes: [...config.allowedModes].sort(),
    busRides: config.maxBusRides,
    busTime: config.maxBusTimeMinutes,
    route: config.showRoute,
  });
}

class CommuteWorkerClient {
  private worker: Worker;
  private nextRequestId = 0;
  private pendingResolve: ((result: EvaluateResult) => void) | null = null;
  private pendingRequestId = -1;

  /** Cache keyed by config hash, stores the last result per unique config. */
  private resultCache = new Map<string, EvaluateResult>();
  private lastCacheKey: string | null = null;

  constructor() {
    this.worker = new Worker(
      new URL("./commuteWorker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e: MessageEvent<WorkerResultMessage>) => {
      this.handleMessage(e.data);
    };
  }

  initGraph(graphData: TransportGraph): void {
    this.worker.postMessage({ type: "init", graphData });
    // Graph changed — invalidate cache
    this.resultCache.clear();
    this.lastCacheKey = null;
  }

  evaluate(
    config: EvaluateConfig,
    postcodes: string[],
    filterId?: string,
  ): Promise<EvaluateResult> {
    // Check cache — if same config, return cached result immediately
    const cacheKey = configCacheKey(config);
    const cached = this.resultCache.get(cacheKey);
    if (cached && cached.results.size >= postcodes.length) {
      return Promise.resolve(cached);
    }

    const requestId = ++this.nextRequestId;

    // Discard any pending request — only the latest matters
    if (this.pendingResolve) {
      this.pendingResolve({
        results: new Map(),
      });
    }

    this.lastCacheKey = cacheKey;

    return new Promise<EvaluateResult>((resolve) => {
      this.pendingResolve = resolve;
      this.pendingRequestId = requestId;
      this.worker.postMessage({
        type: "evaluate",
        requestId,
        config,
        postcodes,
        filterId,
      });
    });
  }

  private handleMessage(msg: WorkerResultMessage): void {
    if (msg.type !== "result") return;

    // Ignore stale results
    if (msg.requestId !== this.pendingRequestId || !this.pendingResolve) return;

    const resolve = this.pendingResolve;
    this.pendingResolve = null;

    // Deserialize entry arrays back to Maps
    const results: FilterResultMap = new Map(msg.results);

    let routeData: RouteData | undefined;
    if (msg.routeData) {
      routeData = {
        parents: new Map(msg.routeData.parents),
        bestState: new Map(msg.routeData.bestState),
        nodes: new Map(msg.routeData.nodes),
        sourceId: msg.routeData.sourceId,
      };
    }

    const evalResult = { results, routeData };

    // Cache the result
    if (this.lastCacheKey) {
      // Only keep one cached entry to limit memory
      this.resultCache.clear();
      this.resultCache.set(this.lastCacheKey, evalResult);
    }

    resolve(evalResult);
  }
}

let instance: CommuteWorkerClient | null = null;

export function getCommuteWorker(): CommuteWorkerClient {
  if (!instance) {
    instance = new CommuteWorkerClient();
  }
  return instance;
}
