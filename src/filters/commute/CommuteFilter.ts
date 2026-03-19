import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel, } from "../../types/geo.ts";
import type { DijkstraConstraints, TransportMode } from "../../types/transport.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { Graph } from "../../transport/graph.ts";
import { getPostcodeTimes } from "../../transport/dijkstra.ts";
import { CommuteConfig, type CommuteConfigData } from "./CommuteConfig.tsx";

export const commuteFilter: FilterPlugin<CommuteConfigData> = {
  typeId: "commute",
  displayName: "Commute Time",
  description: "Filter by travel time to a destination station",

  defaultConfig(): CommuteConfigData {
    return {
      destinationStationId: null,
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

    if (!config.destinationStationId) {
      // No destination selected - everything passes with no score
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

    const railModes: TransportMode[] = config.allowedModes;
    // Always allow walking and cycling to reach stations
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

    const times = getPostcodeTimes(
      graph,
      config.destinationStationId,
      constraints,
    );

    for (const pc of postcodes) {
      const centroidId = `centroid:${pc}`;
      const time = times.get(centroidId);

      if (time === undefined || time > maxTimeSec) {
        results.set(pc, {
          pass: false,
          detail: "Not reachable within time limit",
        });
      } else {
        // Score: 1.0 at 0 min, 0.0 at maxTime
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
