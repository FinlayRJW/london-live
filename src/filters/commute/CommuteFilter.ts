import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { useRouteStore } from "../../stores/routeStore.ts";
import { getCommuteWorker } from "../../workers/commuteWorkerClient.ts";
import {
  WALKING_SPEED,
  CYCLING_SPEED,
  WALKING_DETOUR,
} from "../../transport/constants.ts";
import { CommuteConfig, type CommuteConfigData } from "./CommuteConfig.tsx";
import { haversineM } from "../../utils/geo.ts";

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

async function evaluatePublicTransport(
  config: CommuteConfigData,
  postcodes: string[],
  filterId?: string,
): Promise<FilterResultMap> {
  const graphData = useTransportStore.getState().graph;
  if (!graphData || config.destinationLat === null || config.destinationLng === null) {
    const results: FilterResultMap = new Map();
    for (const pc of postcodes) {
      results.set(pc, { pass: true });
    }
    return results;
  }

  const worker = getCommuteWorker();
  const { results, routeData } = await worker.evaluate(
    {
      destinationLat: config.destinationLat,
      destinationLng: config.destinationLng,
      maxTimeMinutes: config.maxTimeMinutes,
      maxChanges: config.maxChanges,
      allowedModes: config.allowedModes,
      maxBusRides: config.maxBusRides,
      maxBusTimeMinutes: config.maxBusTimeMinutes,
      showRoute: true, // always fetch route data so toggling showRoute is instant
    },
    postcodes,
    filterId,
  );

  if (routeData && filterId) {
    useRouteStore.getState().setRouteData(filterId, routeData);
  }

  return results;
}

export const commuteFilter: FilterPlugin<CommuteConfigData> = {
  typeId: "commute",
  displayName: "Commute Time",
  description: "Filter by travel time to a destination address",

  configForScoring(config: CommuteConfigData): unknown {
    const { showRoute: _, ...scoring } = config;
    return scoring;
  },

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
      allowedModes: ["tube", "overground", "dlr", "elizabeth_line", "national_rail"],
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
  ): FilterResultMap | Promise<FilterResultMap> {
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
