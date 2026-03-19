/**
 * Fetch postcode district boundaries for London from the
 * uk-postcode-polygons GitHub repository (community-maintained dataset).
 *
 * Downloads per-area GeoJSON files for London postcode areas,
 * filters to London bbox, simplifies, and writes data/districts.geojson.
 */
import { writeFileSync, mkdirSync } from "fs";
import * as turf from "@turf/turf";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

// London postcode areas (the letter prefix)
const LONDON_AREAS = [
  "E", "EC", "N", "NW", "SE", "SW", "W", "WC",
  // Outer London areas that partially cover Greater London
  "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB",
];

// Rough London bounding box
const LONDON_BBOX: [number, number, number, number] = [-0.52, 51.28, 0.34, 51.7];

const BASE_URL =
  "https://raw.githubusercontent.com/missinglink/uk-postcode-polygons/master/geojson";

async function fetchArea(area: string): Promise<FeatureCollection | null> {
  const url = `${BASE_URL}/${area}.geojson`;
  console.log(`  Fetching ${area}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`    Failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as FeatureCollection;
  } catch (e) {
    console.warn(`    Error:`, e);
    return null;
  }
}

function isInLondon(feature: Feature): boolean {
  try {
    const centroid = turf.centroid(feature as Feature<Polygon | MultiPolygon>);
    const [lng, lat] = centroid.geometry.coordinates;
    return (
      lng >= LONDON_BBOX[0] &&
      lng <= LONDON_BBOX[2] &&
      lat >= LONDON_BBOX[1] &&
      lat <= LONDON_BBOX[3]
    );
  } catch {
    return false;
  }
}

function getDistrictId(feature: Feature): string {
  const props = feature.properties ?? {};
  // The repo uses "name" or the feature may have a district identifier
  return (
    props.name ?? props.Name ?? props.NAME ?? props.id ?? props.ID ?? "unknown"
  );
}

async function main() {
  console.log("Fetching London postcode district boundaries...");

  const allFeatures: Feature[] = [];

  for (const area of LONDON_AREAS) {
    const data = await fetchArea(area);
    if (!data) continue;

    for (const feature of data.features) {
      // For outer London areas, filter to London bbox
      if (
        ["BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB"].includes(area)
      ) {
        if (!isInLondon(feature)) continue;
      }

      const id = getDistrictId(feature);

      // Simplify geometry to reduce file size
      let simplified: Feature<Polygon | MultiPolygon>;
      try {
        simplified = turf.simplify(
          feature as Feature<Polygon | MultiPolygon>,
          { tolerance: 0.0003, highQuality: true },
        );
      } catch {
        simplified = feature as Feature<Polygon | MultiPolygon>;
      }

      allFeatures.push({
        ...simplified,
        properties: { id, name: id },
      });
    }
  }

  console.log(`\nTotal London districts: ${allFeatures.length}`);

  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: allFeatures,
  };

  mkdirSync("data", { recursive: true });
  writeFileSync("data/districts.geojson", JSON.stringify(collection));
  console.log("Written data/districts.geojson");
}

main().catch(console.error);
