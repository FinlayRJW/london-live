import type { FilterPlugin, FilterResultMap } from "../../types/filter.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import { PropertyConfig, type PropertyConfigData } from "./PropertyConfig.tsx";

export const propertyFilter: FilterPlugin<PropertyConfigData> = {
  typeId: "property",
  displayName: "Sold Properties",
  description: "Show sold property prices on the map",
  scoringNoOp: true,

  defaultConfig(): PropertyConfigData {
    return {
      minPrice: 0,
      maxPrice: 2_000_000,
      minFloorArea: 0,
      maxFloorArea: 300,
      hideNoFloorArea: false,
      types: ["D", "S", "T", "F"],
      tenure: "both",
      dateRange: 24,
      showMarkers: true,
    };
  },

  isConfigured(): boolean {
    return true;
  },

  evaluate(
    _config: PropertyConfigData,
    postcodes: string[],
    _level: PostcodeLevel,
  ): FilterResultMap {
    // Property filter doesn't score postcodes - it filters individual sales.
    // Return pass for all so it doesn't affect area scoring.
    const results: FilterResultMap = new Map();
    for (const pc of postcodes) {
      results.set(pc, { pass: true, score: 1 });
    }
    return results;
  },

  ConfigComponent: PropertyConfig,
};
