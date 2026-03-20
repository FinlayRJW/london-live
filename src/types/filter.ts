import type React from "react";
import type { PostcodeLevel } from "./geo.ts";

export interface FilterResult {
  pass: boolean;
  score?: number; // 0-1, higher is better
  detail?: string; // tooltip text
}

export type FilterResultMap = Map<string, FilterResult>;

export interface FilterPlugin<TConfig = unknown> {
  typeId: string;
  displayName: string;
  description: string;
  /** If true, this filter is excluded from scoring (always pass=true, score=1). */
  scoringNoOp?: boolean;
  defaultConfig(): TConfig;
  /** Returns true if the filter has enough config to produce meaningful results. */
  isConfigured(config: TConfig): boolean;
  /** Returns the config subset that affects scoring. Display-only fields
   *  (e.g. showRoute, showMarkers) should be stripped so toggling them
   *  doesn't trigger re-evaluation. Defaults to the full config. */
  configForScoring?(config: TConfig): unknown;
  evaluate(
    config: TConfig,
    postcodes: string[],
    level: PostcodeLevel,
    filterId?: string,
  ): FilterResultMap | Promise<FilterResultMap>;
  ConfigComponent: React.ComponentType<{
    config: TConfig;
    onChange: (config: TConfig) => void;
  }>;
}

export interface FilterInstance {
  id: string;
  typeId: string;
  config: unknown;
  weight: number;
  enabled: boolean;
}
