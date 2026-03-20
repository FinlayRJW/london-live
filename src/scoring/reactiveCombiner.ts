import { useFilterResultStore } from "../stores/filterResultStore.ts";
import { useFilterStore } from "../stores/filterStore.ts";
import { useScoreStore } from "../stores/scoreStore.ts";
import { getFilterPlugin } from "../filters/registry.ts";
import { combineScores } from "./combiner.ts";

let currentPostcodes: string[] = [];

/** Called when the set of postcodes changes (boundary/zoom change). */
export function setPostcodesForCombination(postcodes: string[]): void {
  currentPostcodes = postcodes;
  recombine();
}

function recombine(): void {
  const { results, evaluating } = useFilterResultStore.getState();
  const { filters } = useFilterStore.getState();
  const { setScores, setComputing } = useScoreStore.getState();

  // Only count filters that are enabled AND configured (have enough config to produce results)
  const enabledConfigured = filters.filter((f) => {
    if (!f.enabled) return false;
    const plugin = getFilterPlugin(f.typeId);
    if (!plugin) return false;
    if (plugin.scoringNoOp) return false;
    return plugin.isConfigured(f.config);
  });

  if (enabledConfigured.length === 0 || currentPostcodes.length === 0) {
    setScores(new Map());
    setComputing(false);
    return;
  }

  // Only include filters that have results ready
  const availableResults = new Map<string, (typeof results extends Map<string, infer V> ? V : never)>();
  for (const filter of enabledConfigured) {
    const result = results.get(filter.id);
    if (result) {
      availableResults.set(filter.id, result);
    }
  }

  // If no results are ready yet, don't render partial scores — wait for at least one
  if (availableResults.size === 0) {
    setScores(new Map());
    setComputing(evaluating.size > 0);
    return;
  }

  // Only pass filters that have results to the combiner — filters still
  // evaluating should not participate (otherwise they implicitly pass all
  // postcodes, showing everything green before results arrive).
  const filtersWithResults = filters.filter((f) => availableResults.has(f.id));
  const combined = combineScores(availableResults, filtersWithResults, currentPostcodes);
  setScores(combined);
  setComputing(evaluating.size > 0);
}

// Subscribe to filterResultStore changes (new results arriving, results removed)
useFilterResultStore.subscribe(recombine);

// Subscribe to filterStore changes (weight/enabled/add/remove)
useFilterStore.subscribe(recombine);
