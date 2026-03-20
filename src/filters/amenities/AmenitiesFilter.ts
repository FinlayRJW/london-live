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
import { haversineM } from "../../utils/geo.ts";

// --- Spatial grid for fast nearest-amenity lookup ---

const GRID_SIZE_DEG = 0.02; // ~2.2 km cells — covers typical max walk radius

interface SpatialGrid {
  cells: Map<string, AmenityLocation[]>;
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_SIZE_DEG)},${Math.floor(lng / GRID_SIZE_DEG)}`;
}

function buildGrid(amenities: AmenityLocation[]): SpatialGrid {
  const cells = new Map<string, AmenityLocation[]>();
  for (const a of amenities) {
    const key = gridKey(a.lat, a.lng);
    let cell = cells.get(key);
    if (!cell) {
      cell = [];
      cells.set(key, cell);
    }
    cell.push(a);
  }
  return { cells };
}

// Cache grids per amenity type so we only build once
const gridCache = new Map<AmenityType, SpatialGrid>();

function getGrid(type: AmenityType, amenities: AmenityLocation[]): SpatialGrid {
  let grid = gridCache.get(type);
  if (!grid) {
    grid = buildGrid(amenities);
    gridCache.set(type, grid);
  }
  return grid;
}

function findNearestTime(
  lat: number,
  lng: number,
  amenities: AmenityLocation[],
  speed: number,
  maxTimeSec: number,
  type: AmenityType,
): number | null {
  const grid = getGrid(type, amenities);

  // Search radius in degrees (overestimate for grid cell lookup)
  const maxDistM = maxTimeSec * speed / WALKING_DETOUR;
  const radiusDeg = maxDistM / 111_000 + GRID_SIZE_DEG; // ~111km per degree
  const cellRadius = Math.ceil(radiusDeg / GRID_SIZE_DEG);

  const centerCellLat = Math.floor(lat / GRID_SIZE_DEG);
  const centerCellLng = Math.floor(lng / GRID_SIZE_DEG);

  let minTime = Infinity;
  for (let dlat = -cellRadius; dlat <= cellRadius; dlat++) {
    for (let dlng = -cellRadius; dlng <= cellRadius; dlng++) {
      const key = `${centerCellLat + dlat},${centerCellLng + dlng}`;
      const cell = grid.cells.get(key);
      if (!cell) continue;
      for (const a of cell) {
        const dist = haversineM(lat, lng, a.lat, a.lng);
        const time = (dist * WALKING_DETOUR) / speed;
        if (time < minTime) minTime = time;
      }
    }
  }
  return minTime === Infinity ? null : minTime;
}

const AMENITY_TYPES: AmenityType[] = ["supermarket", "cinema", "gym"];

export const amenitiesFilter: FilterPlugin<AmenitiesConfigData> = {
  typeId: "amenities",
  displayName: "Nearby Amenities",
  description: "Filter by proximity to supermarkets, cinemas, and gyms",

  configForScoring(config: AmenitiesConfigData): unknown {
    const { showMarkers: _, ...scoring } = config;
    return scoring;
  },

  isConfigured(config: AmenitiesConfigData): boolean {
    return AMENITY_TYPES.some((t) => config[t].enabled);
  },

  defaultConfig(): AmenitiesConfigData {
    return {
      supermarket: { enabled: false, travelMethod: "walk", maxTimeMinutes: 15 },
      cinema: { enabled: false, travelMethod: "walk", maxTimeMinutes: 20 },
      gym: { enabled: false, travelMethod: "walk", maxTimeMinutes: 15 },
      showMarkers: true,
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

        const nearestTime = findNearestTime(node.lat, node.lng, amenities, speed, maxTimeSec, type);

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
