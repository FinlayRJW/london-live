/**
 * Fetch Land Registry Price Paid Data for the last 2 years, filter to Greater London,
 * and output a compact JSON file grouped by postcode.
 *
 * Optionally enriches with EPC data (floor area, habitable rooms, energy rating)
 * if EPC CSV files are placed in data/epc/.
 *
 * Usage:
 *   npx tsx scripts/fetch-property-prices.ts
 *
 * EPC enrichment (optional):
 *   1. Register at https://epc.opendatacommunities.org/
 *   2. Download domestic EPC CSVs for London boroughs into data/epc/
 *   3. Re-run this script - it will automatically pick them up
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

interface RawProperty {
  price: number;
  date: string;
  postcode: string;
  type: string;
  newBuild: boolean;
  tenure: string;
  address: string;
}

interface EpcRecord {
  floorArea: number | null;
  rooms: number | null;
  energyRating: string | null;
}

// -------------------------------------------------------------------
// Land Registry CSV parsing
// -------------------------------------------------------------------

function parseLandRegistryRow(line: string): RawProperty | null {
  // CSV format: all fields double-quoted, comma-separated, no header
  // Strip surrounding quotes and split
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      if (end === -1) break;
      fields.push(line.slice(i + 1, end));
      i = end + 2; // skip closing quote and comma
    } else if (line[i] === ',') {
      fields.push("");
      i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }

  if (fields.length < 16) return null;

  const county = fields[13];
  if (county !== "GREATER LONDON") return null;

  const postcode = fields[3].trim();
  if (!postcode) return null;

  const price = parseInt(fields[1], 10);
  if (isNaN(price) || price <= 0) return null;

  // Date format: "2024-03-15 00:00" -> "2024-03"
  const rawDate = fields[2];
  const date = rawDate.slice(0, 7);

  const type = fields[4]; // D/S/T/F/O
  const newBuild = fields[5] === "Y";
  const tenure = fields[6]; // F/L

  // Build short address from SAON + PAON + Street
  const saon = fields[8].trim();
  const paon = fields[7].trim();
  const street = fields[9].trim();
  const parts = [saon, paon, street].filter(Boolean);
  const address = parts.join(", ");

  return { price, date, postcode, type, newBuild, tenure, address };
}

async function downloadAndParse(year: number): Promise<RawProperty[]> {
  const url = `https://price-paid-data.publicdata.landregistry.gov.uk/pp-${year}.csv`;
  console.log(`Downloading Land Registry data for ${year}...`);

  const cacheDir = join("data", "cache");
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `pp-${year}.csv`);

  let text: string;
  if (existsSync(cachePath)) {
    console.log(`  Using cached file: ${cachePath}`);
    text = readFileSync(cachePath, "utf-8");
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    text = await res.text();
    writeFileSync(cachePath, text);
    console.log(`  Downloaded and cached: ${cachePath}`);
  }

  const lines = text.split("\n");
  console.log(`  ${lines.length} rows in file`);

  const properties: RawProperty[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const prop = parseLandRegistryRow(line);
    if (prop) properties.push(prop);
  }

  console.log(`  ${properties.length} London properties`);
  return properties;
}

// -------------------------------------------------------------------
// EPC data loading (optional)
// -------------------------------------------------------------------

function normaliseAddress(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/[,.\-/]/g, " ")
    .replace(/\bFLAT\b/g, "")
    .replace(/\bAPARTMENT\b/g, "")
    .replace(/\bUNIT\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadEpcData(): Map<string, EpcRecord[]> {
  const epcDir = join("data", "epc");
  const epcMap = new Map<string, EpcRecord[]>();

  if (!existsSync(epcDir)) {
    console.log("No EPC data directory (data/epc/) found - skipping EPC enrichment");
    console.log("To add EPC data:");
    console.log("  1. Register at https://epc.opendatacommunities.org/");
    console.log("  2. Download domestic EPC CSVs for London boroughs into data/epc/");
    console.log("  3. Re-run this script");
    return epcMap;
  }

  const files = readdirSync(epcDir).filter(f => f.endsWith(".csv"));
  if (files.length === 0) {
    console.log("No CSV files found in data/epc/ - skipping EPC enrichment");
    return epcMap;
  }

  console.log(`Loading EPC data from ${files.length} files...`);

  for (const file of files) {
    const text = readFileSync(join(epcDir, file), "utf-8");
    const lines = text.split("\n");
    if (lines.length < 2) continue;

    // Parse header to find column indices
    const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const postcodeIdx = header.indexOf("POSTCODE");
    const addressIdx = header.indexOf("ADDRESS");
    const floorAreaIdx = header.indexOf("TOTAL_FLOOR_AREA");
    const roomsIdx = header.indexOf("NUMBER_HABITABLE_ROOMS");
    const ratingIdx = header.indexOf("CURRENT_ENERGY_RATING");

    if (postcodeIdx === -1 || addressIdx === -1) continue;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(f => f.trim().replace(/"/g, ""));
      const postcode = row[postcodeIdx]?.trim();
      if (!postcode) continue;

      const floorArea = floorAreaIdx >= 0 ? parseFloat(row[floorAreaIdx]) : NaN;
      const rooms = roomsIdx >= 0 ? parseInt(row[roomsIdx], 10) : NaN;
      const rating = ratingIdx >= 0 ? row[ratingIdx]?.trim() : null;

      const record: EpcRecord = {
        floorArea: isNaN(floorArea) ? null : floorArea,
        rooms: isNaN(rooms) ? null : rooms,
        energyRating: rating && /^[A-G]$/.test(rating) ? rating : null,
      };

      // Key by postcode + normalised address for matching
      const addr = addressIdx >= 0 ? normaliseAddress(row[addressIdx]) : "";
      const key = `${postcode}|${addr}`;

      const existing = epcMap.get(key);
      if (existing) {
        existing.push(record);
      } else {
        epcMap.set(key, [record]);
      }
    }
  }

  console.log(`  Loaded ${epcMap.size} EPC address records`);
  return epcMap;
}

function matchEpc(
  epcMap: Map<string, EpcRecord[]>,
  postcode: string,
  address: string,
): EpcRecord | null {
  if (epcMap.size === 0) return null;

  const normAddr = normaliseAddress(address);
  const key = `${postcode}|${normAddr}`;
  const records = epcMap.get(key);
  if (records && records.length > 0) {
    // Return the most recent (last in array) or first with data
    return records[records.length - 1];
  }

  return null;
}

// -------------------------------------------------------------------
// Postcodes.io geocoding
// -------------------------------------------------------------------

interface PostcodeCoord {
  lat: number;
  lng: number;
}

async function geocodePostcodes(
  postcodes: string[],
): Promise<Map<string, PostcodeCoord>> {
  const coords = new Map<string, PostcodeCoord>();

  // Check for cached geocoding results
  const cacheDir = join("data", "cache");
  const cachePath = join(cacheDir, "postcode-coords.json");
  if (existsSync(cachePath)) {
    console.log("Loading cached postcode coordinates...");
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as Record<string, [number, number]>;
    for (const [pc, [lat, lng]] of Object.entries(cached)) {
      coords.set(pc, { lat, lng });
    }
    // Find which postcodes still need geocoding
    const missing = postcodes.filter((pc) => !coords.has(pc));
    if (missing.length === 0) {
      console.log(`  All ${postcodes.length} postcodes found in cache`);
      return coords;
    }
    console.log(`  ${coords.size} cached, ${missing.length} to geocode`);
    postcodes = missing;
  }

  console.log(`Geocoding ${postcodes.length} postcodes via Postcodes.io...`);

  const BATCH_SIZE = 100;
  const CONCURRENCY = 5;
  let completed = 0;

  for (let i = 0; i < postcodes.length; i += BATCH_SIZE * CONCURRENCY) {
    const batchPromises: Promise<void>[] = [];

    for (let j = 0; j < CONCURRENCY && i + j * BATCH_SIZE < postcodes.length; j++) {
      const start = i + j * BATCH_SIZE;
      const batch = postcodes.slice(start, start + BATCH_SIZE);

      batchPromises.push(
        fetch("https://api.postcodes.io/postcodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcodes: batch }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Postcodes.io error: ${res.status}`);
            return res.json();
          })
          .then((data: { result: Array<{ query: string; result: { latitude: number; longitude: number } | null }> }) => {
            for (const entry of data.result) {
              if (entry.result) {
                coords.set(entry.query, {
                  lat: entry.result.latitude,
                  lng: entry.result.longitude,
                });
              }
            }
            completed += batch.length;
          }),
      );
    }

    await Promise.all(batchPromises);

    if (completed % 5000 < BATCH_SIZE * CONCURRENCY) {
      console.log(`  ${completed}/${postcodes.length} geocoded`);
    }
  }

  console.log(`  Geocoded ${coords.size} postcodes (${postcodes.length - coords.size + (coords.size - postcodes.length)} not found)`);

  // Cache results
  const cacheObj: Record<string, [number, number]> = {};
  for (const [pc, c] of coords) {
    cacheObj[pc] = [c.lat, c.lng];
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cacheObj));
  console.log(`  Cached coordinates to ${cachePath}`);

  return coords;
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

interface PostcodeGroup {
  lat: number;
  lng: number;
  sales: unknown[];
}

async function main() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear];

  // Download Land Registry data
  const allProperties: RawProperty[] = [];
  for (const year of years) {
    const props = await downloadAndParse(year);
    allProperties.push(...props);
  }

  console.log(`\nTotal London properties: ${allProperties.length}`);

  // Collect unique postcodes and geocode them
  const uniquePostcodes = [...new Set(allProperties.map((p) => p.postcode))];
  const coords = await geocodePostcodes(uniquePostcodes);

  // Load EPC data if available
  const epcMap = loadEpcData();
  let epcMatches = 0;

  // Group by postcode and build output
  const output: Record<string, PostcodeGroup> = {};
  let skippedNoCoords = 0;

  for (const prop of allProperties) {
    const coord = coords.get(prop.postcode);
    if (!coord) {
      skippedNoCoords++;
      continue;
    }

    const epc = matchEpc(epcMap, prop.postcode, prop.address);
    if (epc) epcMatches++;

    const record = {
      p: prop.price,
      d: prop.date,
      t: prop.type,
      n: prop.newBuild,
      te: prop.tenure,
      a: prop.address,
      fa: epc?.floorArea ?? null,
      r: epc?.rooms ?? null,
      er: epc?.energyRating ?? null,
    };

    if (!output[prop.postcode]) {
      output[prop.postcode] = { lat: coord.lat, lng: coord.lng, sales: [] };
    }
    output[prop.postcode].sales.push(record);
  }

  const postcodeCount = Object.keys(output).length;
  console.log(`\nGrouped into ${postcodeCount} postcodes`);
  if (skippedNoCoords > 0) {
    console.log(`Skipped ${skippedNoCoords} properties with no geocoded postcode`);
  }
  if (epcMap.size > 0) {
    console.log(`EPC matches: ${epcMatches}/${allProperties.length} (${Math.round(100 * epcMatches / allProperties.length)}%)`);
  }

  // Write output
  mkdirSync(join("public", "data"), { recursive: true });
  const outPath = join("public", "data", "property-prices.json");
  const json = JSON.stringify(output);
  writeFileSync(outPath, json);

  const sizeMB = (Buffer.byteLength(json, "utf-8") / 1024 / 1024).toFixed(1);
  console.log(`\nWritten ${outPath} (${sizeMB} MB)`);
}

main().catch(console.error);
