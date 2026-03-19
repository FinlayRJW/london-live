/**
 * Fetch amenity locations (supermarkets, cinemas, premium gyms) from OpenStreetMap
 * via the Overpass API. Filters to known chains only.
 *
 * Writes public/data/amenities.json.
 */
import { writeFileSync, mkdirSync } from "fs";

// London bounding box
const BBOX = "51.28,-0.51,51.69,0.33";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface AmenityLocation {
  id: number;
  name: string;
  brand: string;
  lat: number;
  lng: number;
}

type AmenityType = "supermarket" | "cinema" | "gym";

interface AmenityData {
  supermarket: AmenityLocation[];
  cinema: AmenityLocation[];
  gym: AmenityLocation[];
}

// Brand matching patterns (case-insensitive substrings)
const BRAND_FILTERS: Record<AmenityType, string[]> = {
  supermarket: [
    "tesco", "sainsbury", "waitrose", "marks & spencer", "m&s",
    "aldi", "lidl", "co-op", "coop", "cooperative", "asda", "morrisons",
  ],
  cinema: [
    "odeon", "cineworld", "vue", "curzon", "picturehouse", "everyman",
  ],
  gym: [
    "virgin active", "nuffield", "david lloyd", "third space", "equinox",
    "gymbox", "bannatyne",
  ],
};

// Canonical brand names
const BRAND_CANONICAL: Record<string, string> = {
  tesco: "Tesco",
  sainsbury: "Sainsbury's",
  waitrose: "Waitrose",
  "marks & spencer": "M&S",
  "m&s": "M&S",
  aldi: "Aldi",
  lidl: "Lidl",
  "co-op": "Co-op",
  coop: "Co-op",
  cooperative: "Co-op",
  asda: "Asda",
  morrisons: "Morrisons",
  odeon: "Odeon",
  cineworld: "Cineworld",
  vue: "Vue",
  curzon: "Curzon",
  picturehouse: "Picturehouse",
  everyman: "Everyman",
  "virgin active": "Virgin Active",
  nuffield: "Nuffield Health",
  "david lloyd": "David Lloyd",
  "third space": "Third Space",
  equinox: "Equinox",
  gymbox: "Gymbox",
  bannatyne: "Bannatyne",
};

function matchBrand(element: OverpassElement, type: AmenityType): string | null {
  const tags = element.tags ?? {};
  const searchFields = [
    tags.brand, tags.name, tags.operator, tags["brand:wikidata"],
  ].filter(Boolean).map(s => s!.toLowerCase());

  for (const pattern of BRAND_FILTERS[type]) {
    for (const field of searchFields) {
      if (field.includes(pattern)) {
        return BRAND_CANONICAL[pattern] ?? pattern;
      }
    }
  }
  return null;
}

function getCoords(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const url = "https://overpass-api.de/api/interpreter";
  const res = await fetch(url, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.elements as OverpassElement[];
}

async function main() {
  console.log("Fetching amenities from Overpass API...");

  // Single query for all three types, using out:center for ways/relations
  const query = `
[out:json][timeout:120];
(
  // Supermarkets
  nwr["shop"="supermarket"](${BBOX});
  // Cinemas
  nwr["amenity"="cinema"](${BBOX});
  // Gyms / fitness centres
  nwr["leisure"="fitness_centre"](${BBOX});
);
out center;
`;

  const elements = await fetchOverpass(query);
  console.log(`  Received ${elements.length} raw elements`);

  const result: AmenityData = { supermarket: [], cinema: [], gym: [] };
  const seen = new Set<string>(); // dedupe by type+id

  for (const el of elements) {
    const tags = el.tags ?? {};
    const coords = getCoords(el);
    if (!coords) continue;

    // Determine which type this element belongs to
    let type: AmenityType | null = null;
    if (tags.shop === "supermarket") type = "supermarket";
    else if (tags.amenity === "cinema") type = "cinema";
    else if (tags.leisure === "fitness_centre") type = "gym";
    if (!type) continue;

    const brand = matchBrand(el, type);
    if (!brand) continue;

    const key = `${type}:${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result[type].push({
      id: el.id,
      name: tags.name ?? brand,
      brand,
      lat: Math.round(coords.lat * 1e6) / 1e6,
      lng: Math.round(coords.lng * 1e6) / 1e6,
    });
  }

  console.log(`  Supermarkets: ${result.supermarket.length}`);
  console.log(`  Cinemas: ${result.cinema.length}`);
  console.log(`  Gyms: ${result.gym.length}`);

  mkdirSync("public/data", { recursive: true });
  writeFileSync(
    "public/data/amenities.json",
    JSON.stringify(result, null, 2),
  );
  console.log("Written public/data/amenities.json");
}

main().catch(console.error);
