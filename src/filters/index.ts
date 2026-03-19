import { registerFilter } from "./registry.ts";
import { commuteFilter } from "./commute/CommuteFilter.ts";
import { amenitiesFilter } from "./amenities/AmenitiesFilter.ts";

export function registerAllFilters(): void {
  registerFilter(commuteFilter);
  registerFilter(amenitiesFilter);
}
