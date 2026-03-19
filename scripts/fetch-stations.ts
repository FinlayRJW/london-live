/**
 * Fetch TfL station data (tube, overground, DLR, Elizabeth line, National Rail).
 * Uses the TfL unified API (no key needed for basic access).
 *
 * Filters to NaPTAN group stations (IDs starting with 940G, 910G, HUB)
 * to avoid duplicate platform/entrance entries.
 *
 * Writes data/stations.json.
 */
import { writeFileSync, mkdirSync } from "fs";

interface TfLStopPoint {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  modes: string[];
  lines: { id: string; name: string }[];
  stationNaptan?: string;
  stopType?: string;
  children?: TfLStopPoint[];
}

interface StationInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lines: string[];
  modes: string[];
}

const MODE_MAP: Record<string, string> = {
  tube: "tube",
  overground: "overground",
  dlr: "dlr",
  "elizabeth-line": "elizabeth_line",
  "national-rail": "national_rail",
};

// London bounding box to filter out far-flung stations
const LONDON_BBOX = { minLat: 51.28, maxLat: 51.7, minLng: -0.52, maxLng: 0.34 };

function isInLondon(lat: number, lng: number): boolean {
  return (
    lat >= LONDON_BBOX.minLat && lat <= LONDON_BBOX.maxLat &&
    lng >= LONDON_BBOX.minLng && lng <= LONDON_BBOX.maxLng
  );
}

async function fetchStationsForMode(mode: string): Promise<TfLStopPoint[]> {
  const url = `https://api.tfl.gov.uk/StopPoint/Mode/${mode}`;
  console.log(`  Fetching ${mode} stations...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL API error for ${mode}: ${res.status}`);
  const data = await res.json();
  return (data.stopPoints ?? data) as TfLStopPoint[];
}

/**
 * Fetch National Rail stations by discovering all NR lines from TfL
 * and fetching stop points per line. The StopPoint/Mode/national-rail
 * endpoint often returns 503 due to result set size, so we go per-line.
 */
async function fetchNationalRailStations(): Promise<TfLStopPoint[]> {
  console.log("  Discovering National Rail lines...");
  const listRes = await fetch("https://api.tfl.gov.uk/Line/Mode/national-rail");
  if (!listRes.ok) {
    console.error(`  Failed to fetch NR line list: ${listRes.status}`);
    return [];
  }
  const nrLines: { id: string }[] = await listRes.json();
  console.log(`  Found ${nrLines.length} National Rail lines`);

  const allStops = new Map<string, TfLStopPoint>();
  for (const line of nrLines) {
    try {
      const url = `https://api.tfl.gov.uk/Line/${line.id}/StopPoints`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`    Warning: failed to fetch stops for ${line.id}: ${res.status}`);
        continue;
      }
      const stops: TfLStopPoint[] = await res.json();
      for (const stop of stops) {
        if (!allStops.has(stop.id)) {
          allStops.set(stop.id, stop);
        }
      }
    } catch (e) {
      console.warn(`    Warning: error fetching stops for ${line.id}:`, e);
    }
  }
  console.log(`    ${allStops.size} unique NR stop points across all lines`);
  return Array.from(allStops.values());
}

function isGroupStation(stop: TfLStopPoint): boolean {
  // NaPTAN group stations, or hub stations
  return (
    stop.id.startsWith("940G") ||
    stop.id.startsWith("910G") ||
    stop.id.startsWith("HUB")
  );
}

function addStopsToMap(
  stationMap: Map<string, StationInfo>,
  stops: TfLStopPoint[],
  mappedMode: string,
): void {
  const groupStations = stops.filter(isGroupStation);
  console.log(`    ${stops.length} total, ${groupStations.length} group stations`);

  for (const stop of groupStations) {
    if (!isInLondon(stop.lat, stop.lon)) continue;

    const existing = stationMap.get(stop.id);
    const lines = stop.lines?.map((l) => l.id) ?? [];

    if (existing) {
      for (const line of lines) {
        if (!existing.lines.includes(line)) existing.lines.push(line);
      }
      if (!existing.modes.includes(mappedMode)) {
        existing.modes.push(mappedMode);
      }
    } else {
      stationMap.set(stop.id, {
        id: stop.id,
        name: stop.commonName
          .replace(/ (Underground|DLR|Rail|ELL) Station$/i, "")
          .replace(/ Station$/i, ""),
        lat: stop.lat,
        lng: stop.lon,
        lines,
        modes: [mappedMode],
      });
    }
  }
}

async function main() {
  const modes = ["tube", "overground", "dlr", "elizabeth-line"];
  const stationMap = new Map<string, StationInfo>();

  for (const mode of modes) {
    try {
      const stops = await fetchStationsForMode(mode);
      const mappedMode = MODE_MAP[mode] ?? mode;
      addStopsToMap(stationMap, stops, mappedMode);
    } catch (e) {
      console.error(`  Error fetching ${mode}:`, e);
    }
  }

  // National Rail: fetch per-line (the StopPoint/Mode endpoint is unreliable)
  try {
    const nrStops = await fetchNationalRailStations();
    addStopsToMap(stationMap, nrStops, "national_rail");
  } catch (e) {
    console.error("  Error fetching national-rail:", e);
  }

  const stations = Array.from(stationMap.values());
  console.log(`\nTotal unique group stations in London: ${stations.length}`);

  mkdirSync("data", { recursive: true });
  writeFileSync("data/stations.json", JSON.stringify(stations, null, 2));
  console.log("Written data/stations.json");
}

main().catch(console.error);
