import { registerFilter } from "./registry.ts";
import { commuteFilter } from "./commute/CommuteFilter.ts";

export function registerAllFilters(): void {
  registerFilter(commuteFilter);
}
