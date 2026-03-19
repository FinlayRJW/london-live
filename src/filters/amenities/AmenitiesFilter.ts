import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { useAmenityStore } from "../../stores/amenityStore.ts";
import type { AmenityType, AmenityLocation } from "../../stores/amenityStore.ts";
import {
  WALKING_SPEED,
  CYCLING_SPEED,
  WALKING_DETOUR,
} from "../../transport/constants.ts";
import { AmenitiesConfig, type AmenitiesConfigData } from "./AmenitiesConfig.tsx";

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

function findNearestTime(
  lat: number,
  lng: number,
  amenities: AmenityLocation[],
  speed: number,
): number | null {
  let minTime = Infinity;
  for (const a of amenities) {
    const dist = haversineM(lat, lng, a.lat, a.lng);
    const time = (dist * WALKING_DETOUR) / speed;
    if (time < minTime) minTime = time;
  }
  return minTime === Infinity ? null : minTime;
}

const AMENITY_TYPES: AmenityType[] = ["supermarket", "cinema", "gym"];

export const amenitiesFilter: FilterPlugin<AmenitiesConfigData> = {
  typeId: "amenities",
  displayName: "Nearby Amenities",
  description: "Filter by proximity to supermarkets, cinemas, and gyms",

  isConfigured(config: AmenitiesConfigData): boolean {
    return AMENITY_TYPES.some((t) => config[t].enabled);
  },

  defaultConfig(): AmenitiesConfigData {
    return {
      supermarket: { enabled: false, travelMethod: "walk", maxTimeMinutes: 15 },
      cinema: { enabled: false, travelMethod: "walk", maxTimeMinutes: 20 },
      gym: { enabled: false, travelMethod: "walk", maxTimeMinutes: 15 },
    };
  },

  evaluate(
    config: AmenitiesConfigData,
    postcodes: string[],
    _level: PostcodeLevel,
  ): FilterResultMap {
    const results: FilterResultMap = new Map();

    const graphData = useTransportStore.getState().graph;
    const amenityData = useAmenityStore.getState().data;

    if (!graphData || !amenityData) {
      // Trigger lazy load if not yet loaded
      if (!amenityData) {
        useAmenityStore.getState().load();
      }
      for (const pc of postcodes) {
        results.set(pc, { pass: true });
      }
      return results;
    }

    const enabledTypes = AMENITY_TYPES.filter((t) => config[t].enabled);
    if (enabledTypes.length === 0) {
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

      let allPass = true;
      let scoreSum = 0;
      const details: string[] = [];

      for (const type of enabledTypes) {
        const typeConfig = config[type];
        const speed = typeConfig.travelMethod === "cycle" ? CYCLING_SPEED : WALKING_SPEED;
        const maxTimeSec = typeConfig.maxTimeMinutes * 60;
        const amenities = amenityData[type];

        const nearestTime = findNearestTime(node.lat, node.lng, amenities, speed);

        if (nearestTime === null || nearestTime > maxTimeSec) {
          allPass = false;
          details.push(`${type}: too far`);
        } else {
          const minutes = Math.round(nearestTime / 60);
          const typeScore = 1 - nearestTime / maxTimeSec;
          scoreSum += typeScore;
          details.push(`${type}: ${minutes} min`);
        }
      }

      if (allPass) {
        results.set(pc, {
          pass: true,
          score: scoreSum / enabledTypes.length,
          detail: details.join(", "),
        });
      } else {
        results.set(pc, {
          pass: false,
          detail: details.join(", "),
        });
      }
    }

    return results;
  },

  ConfigComponent: AmenitiesConfig,
};
