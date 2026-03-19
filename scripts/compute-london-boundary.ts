/**
 * Compute the outer boundary of all London postcode districts.
 * Merges all district polygons into one, simplifies, and writes
 * data/london-boundary.geojson for use as a mask on the map.
 */
import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";
import type { FeatureCollection, Feature, MultiPolygon, Polygon } from "geojson";

function main() {
  console.log("Reading districts.geojson...");
  const fc: FeatureCollection = JSON.parse(
    readFileSync("data/districts.geojson", "utf-8"),
  );

  console.log("Merging district polygons...");
  let merged: Feature<Polygon | MultiPolygon> | null = null;
  let failed = 0;

  for (const feature of fc.features) {
    if (!merged) {
      merged = feature as Feature<Polygon | MultiPolygon>;
    } else {
      try {
        const result = turf.union(
          turf.featureCollection([
            merged,
            feature as Feature<Polygon | MultiPolygon>,
          ]),
        );
        if (result) merged = result;
      } catch {
        failed++;
      }
    }
  }

  if (!merged) {
    console.error("Failed to merge any polygons");
    process.exit(1);
  }

  if (failed > 0) {
    console.warn(`  ${failed} features failed to merge (skipped)`);
  }

  // Simplify for smaller file size
  merged = turf.simplify(merged, { tolerance: 0.001, highQuality: true });

  const output: FeatureCollection = {
    type: "FeatureCollection",
    features: [merged],
  };

  writeFileSync("data/london-boundary.geojson", JSON.stringify(output));
  console.log("Written data/london-boundary.geojson");
}

main();
