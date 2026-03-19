import { create } from "zustand";
import type { FilterResult } from "../types/filter.ts";

export interface PostcodeScore {
  combined: number; // 0-1
  pass: boolean;
  perFilter: Map<string, FilterResult>; // filterId -> result
}

interface ScoreState {
  scores: Map<string, PostcodeScore>;
  isComputing: boolean;
  setScores: (scores: Map<string, PostcodeScore>) => void;
  setComputing: (computing: boolean) => void;
}

export const useScoreStore = create<ScoreState>((set) => ({
  scores: new Map(),
  isComputing: false,
  setScores: (scores) => set({ scores, isComputing: false }),
  setComputing: (isComputing) => set({ isComputing }),
}));
