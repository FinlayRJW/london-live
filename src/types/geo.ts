import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type PostcodeLevel = "district" | "sector";

export interface PostcodeProperties {
  id: string; // e.g. "SW1" or "SW1 1"
  name?: string;
}

export type PostcodeFeature = Feature<Polygon | MultiPolygon, PostcodeProperties>;
export type PostcodeCollection = FeatureCollection<
  Polygon | MultiPolygon,
  PostcodeProperties
>;

export interface Centroid {
  id: string;
  lat: number;
  lng: number;
}
