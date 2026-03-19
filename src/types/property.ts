export type PropertyType = "D" | "S" | "T" | "F" | "O";
export type Tenure = "F" | "L";

export interface PropertyRecord {
  /** Sale price in GBP */
  p: number;
  /** Date as YYYY-MM */
  d: string;
  /** Property type: D=Detached, S=Semi, T=Terraced, F=Flat, O=Other */
  t: PropertyType;
  /** New build */
  n: boolean;
  /** Tenure: F=Freehold, L=Leasehold */
  te: Tenure;
  /** Short address */
  a: string;
  /** Floor area in m2 (from EPC, may be null) */
  fa: number | null;
  /** Number of habitable rooms (from EPC, may be null) */
  r: number | null;
  /** EPC energy rating A-G (from EPC, may be null) */
  er: string | null;
}

export interface PostcodeGroup {
  lat: number;
  lng: number;
  sales: PropertyRecord[];
}

/** Property data grouped by full postcode, with lat/lng per postcode */
export type PropertyData = Record<string, PostcodeGroup>;

export interface PropertyFilters {
  enabled: boolean;
  minPrice: number;
  maxPrice: number;
  minFloorArea: number;
  maxFloorArea: number;
  types: PropertyType[];
  tenure: Tenure | "both";
  /** Months back from now */
  dateRange: 6 | 12 | 24;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat",
  O: "Other",
};
