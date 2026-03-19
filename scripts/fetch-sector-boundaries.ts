/**
 * Generate postcode sector boundaries by reverse-geocoding a grid of
 * points within each district polygon via postcodes.io.
 *
 * Approach:
 * 1. For each district polygon, create a point grid (~200m spacing)
 * 2. Reverse-geocode grid points to determine which sector each belongs to
 * 3. Create Voronoi tessellation, group cells by sector, clip to district
 * 4. Output data/sectors.geojson and data/sector-centroids.json
 *
 * Results are cached so re-runs skip already-geocoded points.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";

// ── Config ──────────────────────────────────────────────────────────
const GRID_SPACING_KM = 0.2; // 200m between grid points
const API_BATCH_SIZE = 100; // postcodes.io max per request
const BATCH_DELAY_MS = 600; // delay between API calls
const CACHE_DIR = "data/sectors";
const CACHE_PATH = `${CACHE_DIR}/geocode-cache.json`;

// ── Types ───────────────────────────────────────────────────────────
interface SectorPoint {
  lat: number;
  lng: number;
  sector: string;
}

// ── Cache ───────────────────────────────────────────────────────────
let cache: Record<string, string | null> = {};

function loadCache() {
  if (existsSync(CACHE_PATH)) {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  }
}

function saveCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

// ── API ─────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bulk reverse-geocode an array of lat/lng points via postcodes.io.
 * Returns the sector ID (outcode + first incode digit) or null.
 */
async function reverseGeocodeBatch(
  points: { lat: number; lng: number }[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(points.length);
  const uncached: { lat: number; lng: number; idx: number }[] = [];

  // Fill from cache
  for (let i = 0; i < points.length; i++) {
    const key = cacheKey(points[i].lat, points[i].lng);
    if (key in cache) {
      results[i] = cache[key];
    } else {
      uncached.push({ ...points[i], idx: i });
    }
  }

  if (uncached.length === 0) return results;

  // Call API in batches
  for (let b = 0; b < uncached.length; b += API_BATCH_SIZE) {
    const batch = uncached.slice(b, b + API_BATCH_SIZE);
    const geolocations = batch.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
      limit: 1,
      radius: 500,
    }));

    let data: any;
    try {
      let res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geolocations }),
      });

      // Retry on rate limit
      if (res.status === 429) {
        for (const backoff of [3000, 10000, 30000]) {
          console.warn(`    Rate limited, retrying in ${backoff / 1000}s...`);
          await delay(backoff);
          res = await fetch("https://api.postcodes.io/postcodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geolocations }),
          });
          if (res.status !== 429) break;
        }
      }

      if (!res.ok) {
        console.error(`    API error: ${res.status}`);
        for (const p of batch) {
          results[p.idx] = null;
          cache[cacheKey(p.lat, p.lng)] = null;
        }
        await delay(BATCH_DELAY_MS);
        continue;
      }

      data = await res.json();
    } catch (err) {
      console.error(`    Fetch error: ${err}`);
      for (const p of batch) {
        results[p.idx] = null;
        cache[cacheKey(p.lat, p.lng)] = null;
      }
      await delay(BATCH_DELAY_MS);
      continue;
    }

    for (let i = 0; i < data.result.length; i++) {
      const r = data.result[i];
      const p = batch[i];
      let sector: string | null = null;

      if (r.result?.[0]) {
        const outcode: string = r.result[0].outcode;
        const incode: string = r.result[0].incode;
        sector = `${outcode} ${incode[0]}`;
      }

      results[p.idx] = sector;
      cache[cacheKey(p.lat, p.lng)] = sector;
    }

    if (b + API_BATCH_SIZE < uncached.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return results;
}

// ── Polygon helpers ─────────────────────────────────────────────────

/**
 * Create sector polygons within a district using Voronoi tessellation.
 * Each Voronoi cell inherits its source point's sector; cells are
 * grouped by sector, unioned, and clipped to the district boundary.
 */
function buildSectorPolygons(
  districtFeature: Feature<Polygon | MultiPolygon>,
  sectorPoints: Map<string, { lat: number; lng: number }[]>,
): Map<string, Feature<Polygon | MultiPolygon>> {
  const result = new Map<string, Feature<Polygon | MultiPolygon>>();

  if (sectorPoints.size === 0) return result;

  // Single sector: use entire district polygon
  if (sectorPoints.size === 1) {
    const sectorId = [...sectorPoints.keys()][0];
    result.set(sectorId, districtFeature);
    return result;
  }

  // Multiple sectors: Voronoi approach
  const allPoints: SectorPoint[] = [];
  for (const [sector, points] of sectorPoints) {
    for (const p of points) {
      allPoints.push({ ...p, sector });
    }
  }

  if (allPoints.length < 3) {
    // Too few points for Voronoi; assign whole district to majority sector
    const largest = [...sectorPoints.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    result.set(largest[0], districtFeature);
    return result;
  }

  const pointsFC = turf.featureCollection(
    allPoints.map((p) => turf.point([p.lng, p.lat])),
  );

  // Expand bbox slightly so edge Voronoi cells extend beyond the district
  const [minX, minY, maxX, maxY] = turf.bbox(districtFeature);
  const pad = 0.002; // ~200m
  const vBbox: [number, number, number, number] = [
    minX - pad,
    minY - pad,
    maxX + pad,
    maxY + pad,
  ];

  let voronoi: FeatureCollection<Polygon>;
  try {
    voronoi = turf.voronoi(pointsFC, { bbox: vBbox });
  } catch {
    // Fallback: concave hull per sector
    return buildSectorPolygonsFallback(districtFeature, sectorPoints);
  }

  // Group Voronoi cells by sector
  const sectorCells = new Map<string, Feature<Polygon>[]>();
  for (let i = 0; i < voronoi.features.length; i++) {
    const cell = voronoi.features[i];
    if (!cell) continue;
    const sector = allPoints[i].sector;
    if (!sectorCells.has(sector)) sectorCells.set(sector, []);
    sectorCells.get(sector)!.push(cell);
  }

  // Union cells per sector, clip to district
  for (const [sectorId, cells] of sectorCells) {
    try {
      let merged: Feature<Polygon | MultiPolygon> | null;
      if (cells.length === 1) {
        merged = cells[0];
      } else {
        merged = turf.union(turf.featureCollection(cells));
      }
      if (!merged) continue;

      const clipped = turf.intersect(
        turf.featureCollection([
          merged as Feature<Polygon | MultiPolygon>,
          districtFeature as Feature<Polygon | MultiPolygon>,
        ]),
      );
      if (!clipped) continue;

      const simplified = turf.simplify(clipped as Feature<Polygon | MultiPolygon>, {
        tolerance: 0.0003,
        highQuality: true,
      });
      result.set(sectorId, simplified as Feature<Polygon | MultiPolygon>);
    } catch (e) {
      console.warn(`      Voronoi merge failed for ${sectorId}: ${e}`);
    }
  }

  return result;
}

/** Fallback: concave hull per sector, clipped to district. */
function buildSectorPolygonsFallback(
  districtFeature: Feature<Polygon | MultiPolygon>,
  sectorPoints: Map<string, { lat: number; lng: number }[]>,
): Map<string, Feature<Polygon | MultiPolygon>> {
  const result = new Map<string, Feature<Polygon | MultiPolygon>>();

  for (const [sectorId, points] of sectorPoints) {
    if (points.length < 3) continue;
    try {
      const pts = turf.featureCollection(
        points.map((p) => turf.point([p.lng, p.lat])),
      );
      let hull: Feature<Polygon> | null = null;
      if (points.length >= 4) {
        hull = turf.concave(pts, { maxEdge: 1, units: "kilometers" });
      }
      if (!hull) {
        hull = turf.convex(pts);
      }
      if (!hull) continue;

      // Buffer slightly to fill gaps
      const buffered = turf.buffer(hull, 0.1, { units: "kilometers" });
      if (!buffered) continue;

      const clipped = turf.intersect(
        turf.featureCollection([
          buffered as Feature<Polygon | MultiPolygon>,
          districtFeature as Feature<Polygon | MultiPolygon>,
        ]),
      );
      if (clipped) {
        const simplified = turf.simplify(
          clipped as Feature<Polygon | MultiPolygon>,
          { tolerance: 0.0003, highQuality: true },
        );
        result.set(sectorId, simplified as Feature<Polygon | MultiPolygon>);
      }
    } catch {
      /* skip */
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading districts.geojson...");
  const districts: FeatureCollection<Polygon | MultiPolygon> = JSON.parse(
    readFileSync("data/districts.geojson", "utf-8"),
  );

  loadCache();
  console.log(`  Geocode cache: ${Object.keys(cache).length} entries`);

  const sectorFeatures: Feature[] = [];
  const sectorCentroids: { id: string; lat: number; lng: number }[] = [];
  let totalApiCalls = 0;

  for (let d = 0; d < districts.features.length; d++) {
    const feature = districts.features[d];
    const districtId = (feature.properties as { id: string }).id;

    // Create a grid of points inside the district polygon
    const bbox = turf.bbox(feature);
    const grid = turf.pointGrid(bbox, GRID_SPACING_KM, {
      units: "kilometers",
    });

    const insidePoints: { lat: number; lng: number }[] = [];
    for (const pt of grid.features) {
      if (turf.booleanPointInPolygon(pt, feature)) {
        const [lng, lat] = pt.geometry.coordinates;
        insidePoints.push({ lat, lng });
      }
    }

    // Ensure at least one point (use centroid as fallback)
    if (insidePoints.length === 0) {
      const c = turf.centroid(feature);
      insidePoints.push({
        lat: c.geometry.coordinates[1],
        lng: c.geometry.coordinates[0],
      });
    }

    const uncachedCount = insidePoints.filter(
      (p) => !(cacheKey(p.lat, p.lng) in cache),
    ).length;
    if (uncachedCount > 0) {
      totalApiCalls += Math.ceil(uncachedCount / API_BATCH_SIZE);
    }

    console.log(
      `  [${d + 1}/${districts.features.length}] ${districtId}: ` +
        `${insidePoints.length} grid points (${uncachedCount} uncached)`,
    );

    // Reverse geocode all grid points
    const sectors = await reverseGeocodeBatch(insidePoints);

    // Group points by sector, keeping only those matching this district
    const sectorPoints = new Map<string, { lat: number; lng: number }[]>();
    for (let i = 0; i < insidePoints.length; i++) {
      const sector = sectors[i];
      if (!sector) continue;
      const sectorOutcode = sector.split(" ")[0];
      if (sectorOutcode !== districtId) continue;

      if (!sectorPoints.has(sector)) sectorPoints.set(sector, []);
      sectorPoints.get(sector)!.push(insidePoints[i]);
    }

    // Handle the case where no valid sectors were found
    if (sectorPoints.size === 0) {
      console.log(`    No sectors resolved, using district polygon`);
      const sectorId = `${districtId} 0`;
      sectorFeatures.push({
        ...feature,
        properties: { id: sectorId, name: sectorId },
      });
      const c = turf.centroid(feature);
      sectorCentroids.push({
        id: sectorId,
        lat: c.geometry.coordinates[1],
        lng: c.geometry.coordinates[0],
      });
      continue;
    }

    console.log(
      `    Sectors: ${[...sectorPoints.keys()].join(", ")} ` +
        `(${sectorPoints.size} total)`,
    );

    // Build sector polygons
    const polygons = buildSectorPolygons(feature, sectorPoints);

    for (const [sectorId, polygon] of polygons) {
      sectorFeatures.push({
        ...polygon,
        properties: { id: sectorId, name: sectorId },
      });
      try {
        const c = turf.centroid(polygon);
        sectorCentroids.push({
          id: sectorId,
          lat: c.geometry.coordinates[1],
          lng: c.geometry.coordinates[0],
        });
      } catch {
        // If centroid fails, use average of sector points
        const pts = sectorPoints.get(sectorId) ?? [];
        if (pts.length > 0) {
          const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
          const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
          sectorCentroids.push({ id: sectorId, lat: avgLat, lng: avgLng });
        }
      }
    }

    // Save cache every 20 districts
    if ((d + 1) % 20 === 0) {
      saveCache();
    }
  }

  // Final cache save
  saveCache();

  console.log(`\nTotal API batches made: ~${totalApiCalls}`);
  console.log(`Sectors generated: ${sectorFeatures.length}`);
  console.log(`Sector centroids: ${sectorCentroids.length}`);

  // Write outputs
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: sectorFeatures,
  };

  mkdirSync("data", { recursive: true });
  writeFileSync("data/sectors.geojson", JSON.stringify(collection));
  console.log("Written data/sectors.geojson");

  writeFileSync(
    "data/sector-centroids.json",
    JSON.stringify(sectorCentroids, null, 2),
  );
  console.log("Written data/sector-centroids.json");

  // Also write to public/ for dev server
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/sectors.geojson", JSON.stringify(collection));
  writeFileSync(
    "public/data/sector-centroids.json",
    JSON.stringify(sectorCentroids, null, 2),
  );
  console.log("Written to public/data/ as well");
}

main().catch(console.error);
