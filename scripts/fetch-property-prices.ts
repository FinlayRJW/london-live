/**
 * Fetch Land Registry Price Paid Data for the last 2 years, filter to Greater London,
 * enrich with EPC data (floor area, habitable rooms, energy rating), geocode postcodes,
 * and output per-district JSON files.
 *
 * Usage:
 *   EPC_EMAIL=you@email.com EPC_API_KEY=abc123 npx tsx scripts/fetch-property-prices.ts
 *
 * EPC enrichment (requires free registration):
 *   1. Register at https://epc.opendatacommunities.org/
 *   2. Set EPC_EMAIL and EPC_API_KEY environment variables
 *   3. The script downloads EPC data automatically via the API
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
// EPC data (floor area, habitable rooms, energy rating)
// -------------------------------------------------------------------

// All 33 London borough ONS codes
const LONDON_BOROUGHS: Record<string, string> = {
  E09000001: "City of London", E09000002: "Barking and Dagenham",
  E09000003: "Barnet", E09000004: "Bexley", E09000005: "Brent",
  E09000006: "Bromley", E09000007: "Camden", E09000008: "Croydon",
  E09000009: "Ealing", E09000010: "Enfield", E09000011: "Greenwich",
  E09000012: "Hackney", E09000013: "Hammersmith and Fulham",
  E09000014: "Haringey", E09000015: "Harrow", E09000016: "Havering",
  E09000017: "Hillingdon", E09000018: "Hounslow", E09000019: "Islington",
  E09000020: "Kensington and Chelsea", E09000021: "Kingston upon Thames",
  E09000022: "Lambeth", E09000023: "Lewisham", E09000024: "Merton",
  E09000025: "Newham", E09000026: "Redbridge",
  E09000027: "Richmond upon Thames", E09000028: "Southwark",
  E09000029: "Sutton", E09000030: "Tower Hamlets",
  E09000031: "Waltham Forest", E09000032: "Wandsworth",
  E09000033: "Westminster",
};

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

/**
 * Download EPC bulk yearly files, extract CSVs, filter to London postcodes.
 * Much faster than the search API (~2 downloads vs hundreds of paginated queries).
 */
async function fetchEpcData(londonPostcodes: Set<string>): Promise<Map<string, EpcRecord[]>> {
  const epcMap = new Map<string, EpcRecord[]>();

  const email = process.env.EPC_EMAIL;
  const apiKey = process.env.EPC_API_KEY;

  if (!email || !apiKey) {
    console.log("No EPC credentials - skipping EPC enrichment");
    console.log("  To enable: set EPC_EMAIL and EPC_API_KEY env vars");
    console.log("  Register free at https://epc.opendatacommunities.org/");
    return epcMap;
  }

  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");

  // Check cache
  const cacheDir = join("data", "cache");
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, "epc-london.json");

  if (existsSync(cachePath)) {
    console.log("Loading cached EPC data...");
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as
      Record<string, { fa: number | null; r: number | null; er: string | null }>;
    for (const [key, rec] of Object.entries(cached)) {
      epcMap.set(key, [{ floorArea: rec.fa, rooms: rec.r, energyRating: rec.er }]);
    }
    console.log(`  ${epcMap.size} cached EPC records`);
    return epcMap;
  }

  // Download yearly bulk files via the API files endpoint
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }

  for (const year of years) {
    const zipPath = join(cacheDir, `epc-domestic-${year}.zip`);

    if (!existsSync(zipPath)) {
      const fileName = `domestic-${year}.zip`;
      console.log(`Downloading EPC bulk file: ${fileName}...`);
      const res = await fetch(
        `https://epc.opendatacommunities.org/api/v1/files/${fileName}`,
        {
          headers: { Authorization: `Basic ${auth}` },
          redirect: "follow",
        },
      );
      if (!res.ok) {
        console.log(`  Skipping ${fileName}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(zipPath, buf);
      console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    } else {
      console.log(`Using cached EPC file: ${zipPath}`);
    }

    // Extract certificates.csv from zip using built-in unzip
    const { execSync } = await import("child_process");
    const tmpDir = join(cacheDir, `epc-${year}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      execSync(`unzip -o -j "${zipPath}" "certificates.csv" -d "${tmpDir}" 2>/dev/null || true`);
    } catch {
      // Some zips may have different structure
    }

    const csvPath = join(tmpDir, "certificates.csv");
    if (!existsSync(csvPath)) {
      // Try alternate extraction - some zips nest the CSV
      try {
        execSync(`unzip -o "${zipPath}" -d "${tmpDir}" 2>/dev/null || true`);
        // Find the CSV anywhere in the extracted dir
        const { execSync: exec2 } = await import("child_process");
        const found = exec2(`find "${tmpDir}" -name "certificates.csv" -type f 2>/dev/null`).toString().trim().split("\n")[0];
        if (found && existsSync(found)) {
          // Read from wherever it was found
          await parseEpcCsv(found, londonPostcodes, epcMap);
          continue;
        }
      } catch {
        // skip
      }
      console.log(`  No certificates.csv found in ${zipPath}`);
      continue;
    }

    await parseEpcCsv(csvPath, londonPostcodes, epcMap);
  }

  console.log(`Total EPC records for London: ${epcMap.size}`);

  // Cache
  const cacheObj: Record<string, { fa: number | null; r: number | null; er: string | null }> = {};
  for (const [key, records] of epcMap) {
    const rec = records[records.length - 1];
    cacheObj[key] = { fa: rec.floorArea, r: rec.rooms, er: rec.energyRating };
  }
  writeFileSync(cachePath, JSON.stringify(cacheObj));
  console.log(`Cached to ${cachePath}`);

  return epcMap;
}

async function parseEpcCsv(
  csvPath: string,
  londonPostcodes: Set<string>,
  epcMap: Map<string, EpcRecord[]>,
): Promise<void> {
  const { createReadStream } = await import("fs");
  const { createInterface } = await import("readline");

  console.log(`  Parsing ${csvPath} (streaming)...`);

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let header: string[] | null = null;
  let postcodeIdx = -1;
  let addressIdx = -1;
  let faIdx = -1;
  let roomsIdx = -1;
  let ratingIdx = -1;
  let matched = 0;
  let total = 0;

  for await (const line of rl) {
    if (!header) {
      header = line.split(",").map((h) => h.trim().replace(/"/g, "").toUpperCase());
      postcodeIdx = header.indexOf("POSTCODE");
      addressIdx = header.indexOf("ADDRESS");
      faIdx = header.indexOf("TOTAL_FLOOR_AREA");
      roomsIdx = header.indexOf("NUMBER_HABITABLE_ROOMS");
      ratingIdx = header.indexOf("CURRENT_ENERGY_RATING");
      if (postcodeIdx === -1) { console.log(`    No POSTCODE column`); return; }
      continue;
    }

    total++;
    if (!line.trim()) continue;

    // Simple CSV split
    const fields: string[] = [];
    let fi = 0;
    while (fi < line.length) {
      if (line[fi] === '"') {
        const end = line.indexOf('"', fi + 1);
        if (end === -1) { fields.push(line.slice(fi + 1)); break; }
        fields.push(line.slice(fi + 1, end));
        fi = end + 2;
      } else {
        const end = line.indexOf(',', fi);
        if (end === -1) { fields.push(line.slice(fi)); break; }
        fields.push(line.slice(fi, end));
        fi = end + 1;
      }
    }

    const pc = (fields[postcodeIdx] ?? "").trim();
    if (!pc || !londonPostcodes.has(pc)) continue;

    const addr = addressIdx >= 0 ? (fields[addressIdx] ?? "").trim() : "";
    const fa = faIdx >= 0 ? parseFloat(fields[faIdx]) : NaN;
    const r = roomsIdx >= 0 ? parseInt(fields[roomsIdx], 10) : NaN;
    const er = ratingIdx >= 0 ? (fields[ratingIdx] ?? "").trim() : "";

    const key = `${pc}|${normaliseAddress(addr)}`;
    const record: EpcRecord = {
      floorArea: isNaN(fa) ? null : fa,
      rooms: isNaN(r) ? null : r,
      energyRating: /^[A-G]$/.test(er) ? er : null,
    };
    epcMap.set(key, [record]);
    matched++;

    if (total % 500000 === 0) {
      console.log(`    ${total} rows scanned, ${matched} London matches...`);
    }
  }
  console.log(`    ${total} rows total, ${matched} London EPC records`);
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

  // Load EPC data (downloads bulk yearly files if credentials provided)
  const epcMap = await fetchEpcData(new Set(uniquePostcodes));
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

  // Split by postcode district (outward code) and write individual files
  const districtDir = join("public", "data", "properties");
  mkdirSync(districtDir, { recursive: true });

  // Group postcodes by district
  const byDistrict = new Map<string, Record<string, PostcodeGroup>>();
  for (const [postcode, group] of Object.entries(output)) {
    const district = postcode.split(" ")[0];
    if (!byDistrict.has(district)) {
      byDistrict.set(district, {});
    }
    byDistrict.get(district)![postcode] = group;
  }

  // Write each district file + index
  const index: Record<string, number> = {};
  let totalSize = 0;

  for (const [district, data] of byDistrict) {
    const json = JSON.stringify(data);
    const filePath = join(districtDir, `${district}.json`);
    writeFileSync(filePath, json);
    const size = Buffer.byteLength(json, "utf-8");
    totalSize += size;

    let salesCount = 0;
    for (const group of Object.values(data)) {
      salesCount += group.sales.length;
    }
    index[district] = salesCount;
  }

  // Write index file (district -> sale count)
  const indexPath = join("public", "data", "property-index.json");
  writeFileSync(indexPath, JSON.stringify(index));

  console.log(`\nWritten ${byDistrict.size} district files to ${districtDir}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Index: ${indexPath} (${Object.keys(index).length} districts)`);
}

main().catch(console.error);
