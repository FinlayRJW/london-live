import { create } from "zustand";
import type { FilterResultMap } from "../types/filter.ts";

interface FilterResultState {
  /** Per-filter evaluation results keyed by filter ID. */
  results: Map<string, FilterResultMap>;
  /** Filter IDs currently being evaluated. */
  evaluating: Set<string>;

  setFilterResult: (filterId: string, result: FilterResultMap) => void;
  removeFilterResult: (filterId: string) => void;
  setEvaluating: (filterId: string, isEvaluating: boolean) => void;
  clearAll: () => void;
}

export const useFilterResultStore = create<FilterResultState>((set) => ({
  results: new Map(),
  evaluating: new Set(),

  setFilterResult: (filterId, result) =>
    set((state) => {
      const results = new Map(state.results);
      results.set(filterId, result);
      const evaluating = new Set(state.evaluating);
      evaluating.delete(filterId);
      return { results, evaluating };
    }),

  removeFilterResult: (filterId) =>
    set((state) => {
      const results = new Map(state.results);
      results.delete(filterId);
      const evaluating = new Set(state.evaluating);
      evaluating.delete(filterId);
      return { results, evaluating };
    }),

  setEvaluating: (filterId, isEvaluating) =>
    set((state) => {
      const evaluating = new Set(state.evaluating);
      if (isEvaluating) {
        evaluating.add(filterId);
      } else {
        evaluating.delete(filterId);
      }
      return { evaluating };
    }),

  clearAll: () => set({ results: new Map(), evaluating: new Set() }),
}));
