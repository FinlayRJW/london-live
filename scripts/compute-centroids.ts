/**
 * Compute centroid for each postcode district polygon.
 * Reads data/districts.geojson, writes data/district-centroids.json.
 */
import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

interface Centroid {
  id: string;
  lat: number;
  lng: number;
}

function main() {
  console.log("Reading districts.geojson...");
  const raw = readFileSync("data/districts.geojson", "utf-8");
  const fc: FeatureCollection = JSON.parse(raw);

  const centroids: Centroid[] = [];

  for (const feature of fc.features) {
    const id = (feature.properties as { id: string }).id;
    try {
      const centroid = turf.centroid(feature as Feature<Polygon | MultiPolygon>);
      const [lng, lat] = centroid.geometry.coordinates;
      centroids.push({ id, lat, lng });
    } catch (e) {
      console.warn(`  Failed to compute centroid for ${id}:`, e);
    }
  }

  console.log(`  Computed ${centroids.length} centroids`);
  writeFileSync("data/district-centroids.json", JSON.stringify(centroids, null, 2));
  console.log("Written data/district-centroids.json");
}

main();
