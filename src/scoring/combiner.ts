import type { FilterInstance, FilterResultMap } from "../types/filter.ts";
import type { PostcodeScore } from "../stores/scoreStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";

/**
 * Combine results from multiple filters into a single score per postcode.
 * - If any filter returns pass=false, the postcode is greyed out
 * - Passing postcodes get a weighted average of filter scores
 * - Filters marked scoringNoOp are excluded from scoring
 */
export function combineScores(
  filterResults: Map<string, FilterResultMap>,
  filters: FilterInstance[],
  postcodes: string[],
): Map<string, PostcodeScore> {
  const scores = new Map<string, PostcodeScore>();

  const enabledFilters = filters.filter((f) => {
    if (!f.enabled) return false;
    const plugin = getFilterPlugin(f.typeId);
    return !plugin?.scoringNoOp;
  });
  const totalWeight = enabledFilters.reduce((sum, f) => sum + f.weight, 0);

  for (const pc of postcodes) {
    const perFilter = new Map<string, { pass: boolean; score?: number; detail?: string }>();
    let pass = true;
    let weightedSum = 0;
    let scoreWeight = 0;

    for (const filter of enabledFilters) {
      const resultMap = filterResults.get(filter.id);
      const result = resultMap?.get(pc);

      if (result) {
        perFilter.set(filter.id, result);
        if (!result.pass) {
          pass = false;
        }
        if (result.score !== undefined) {
          weightedSum += result.score * filter.weight;
          scoreWeight += filter.weight;
        }
      }
    }

    const combined =
      scoreWeight > 0 && totalWeight > 0 ? weightedSum / scoreWeight : 0;

    scores.set(pc, { combined, pass, perFilter });
  }

  return scores;
}
