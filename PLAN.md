# Property Prices on the Map - Implementation Plan

## Overview

Add sold property data (last 2 years) to the map as clickable markers. Each marker shows sale price, floor area, habitable rooms, property type, and links to Rightmove's sold-prices page. Properties can be filtered by price range, property type, and date.

## Data Sources

### Land Registry Price Paid Data (free, open government licence)
- **Download**: `https://price-paid-data.publicdata.landregistry.gov.uk/pp-2025.csv` + `pp-2024.csv`
- **Fields used**: price, date, postcode, property type (D/S/T/F/O), old/new, tenure (F/L), address (PAON + SAON + street + locality + town)
- **No header row**. 16 CSV columns, all double-quoted.
- **London filter**: `county = "GREATER LONDON"` (column 14)

### EPC Register (free, requires API key registration)
- **Bulk download**: By local authority from `https://epc.opendatacommunities.org/`
- **Fields used**: `TOTAL_FLOOR_AREA` (m2), `NUMBER_HABITABLE_ROOMS`, `CURRENT_ENERGY_RATING` (A-G), `CONSTRUCTION_AGE_BAND`
- **Match to Land Registry**: by postcode + normalised address

### Important limitation: bedrooms & bathrooms
The EPC data does **not** have a bedroom count or bathroom count:
- `NUMBER_HABITABLE_ROOMS` = all habitable rooms (bedrooms + living rooms + studies). NOT just bedrooms.
- Bathrooms are explicitly excluded from all EPC room counts.
- There is no free, legal data source for bedroom/bathroom counts.

We'll show "habitable rooms" and be clear about what it means in the UI.

### Geocoding
Properties don't have lat/lng. We'll use the **postcode centroids** already in `public/data/district-centroids.json` rather than calling Postcodes.io - we already have this data. Properties within the same postcode will cluster at the centroid, which is fine when combined with marker clustering.

## Architecture

### This is NOT a filter plugin

The existing filter system scores postcodes on a 0-1 scale and colours them. Property markers are fundamentally different - they're point data. This will be implemented as:

1. **A separate data layer** on the map (like RouteOverlay or LondonMask)
2. **Its own store** for property data and filter state
3. **Its own UI panel** (toggle in sidebar to show/hide, with filter controls)

### Data pipeline (build-time script)

New script: `scripts/fetch-property-prices.ts`

1. Download `pp-2024.csv` and `pp-2025.csv` from Land Registry
2. Filter to `county = "GREATER LONDON"`
3. Download EPC bulk data for London local authorities
4. Match EPC records to Land Registry by postcode + normalised address
5. Output `public/data/property-prices.json`

**Output format** - grouped by postcode for compact storage:
```json
{
  "SW1A 1AA": [
    {
      "p": 500000,        // price
      "d": "2024-03",     // date (year-month)
      "t": "F",           // type: D/S/T/F/O
      "n": false,         // new build
      "te": "L",          // tenure: F/L
      "a": "FLAT 5, 10 HIGH STREET",  // short address
      "fa": 45,           // floor area m2 (from EPC, nullable)
      "r": 2              // habitable rooms (from EPC, nullable)
    }
  ]
}
```

**Estimated size**: ~150-250k London transactions over 2 years. At ~80 bytes per record compressed, ~15-20MB raw JSON, ~3-5MB gzipped (Vite serves gzipped).

### Frontend components

#### 1. Store: `src/stores/propertyStore.ts`
- Holds the loaded property data
- Holds filter state: price range, property types, date range, tenure
- Computed filtered count

#### 2. Hook: `src/hooks/usePropertyData.ts`
- Fetches `property-prices.json` on mount (lazy - only when layer is enabled)
- Parses and stores in propertyStore

#### 3. Map layer: `src/components/Map/PropertyLayer.tsx`
- Leaflet marker cluster group (uses `leaflet.markercluster`)
- One marker per property, positioned at postcode centroid with slight jitter for same-postcode overlap
- Markers coloured by property type or price band
- Only renders when the property layer is toggled on

#### 4. Popup: `src/components/Map/PropertyPopup.tsx`
- Shown on marker click
- Displays: price (formatted), date, address, property type, tenure, floor area, habitable rooms, energy rating
- Price per sq ft (computed from price / floor area if available)
- Link: "View area on Rightmove" -> `https://www.rightmove.co.uk/house-prices/{postcode}.html`

#### 5. Panel: `src/components/Sidebar/PropertyPanel.tsx`
- Toggle to show/hide property layer
- Filters:
  - Price range (min/max slider or inputs)
  - Property type checkboxes (Flat, Terraced, Semi, Detached)
  - Date range (last 6mo / 1yr / 2yr)
  - Tenure (Freehold / Leasehold / Both)
- Shows count of visible properties

## Implementation Steps

### Step 1: Data pipeline script
- Create `scripts/fetch-property-prices.ts`
- Download and parse Land Registry CSVs
- Filter to Greater London
- Download and parse EPC bulk data for London boroughs
- Match EPC to Land Registry by postcode + normalised address
- Output `public/data/property-prices.json`
- Add `npm run data:properties` to package.json

### Step 2: Property store and data hook
- Create `src/stores/propertyStore.ts` (Zustand)
- Create `src/hooks/usePropertyData.ts`
- Create `src/types/property.ts` for type definitions

### Step 3: Install leaflet.markercluster
- `npm install leaflet.markercluster @types/leaflet.markercluster`

### Step 4: Property map layer
- Create `src/components/Map/PropertyLayer.tsx`
- Add marker clustering
- Add property popups with details
- Wire into MapContainer

### Step 5: Property filter panel
- Create `src/components/Sidebar/PropertyPanel.tsx`
- Add filter controls (price, type, date, tenure)
- Add toggle to show/hide layer
- Wire into sidebar

### Step 6: Run pipeline and test
- Register for EPC API key
- Run the data pipeline
- Test the full flow end-to-end

## Dependencies to add
- `leaflet.markercluster` + `@types/leaflet.markercluster` (marker clustering)
- No other new deps needed (csv parsing can be done with simple string splitting in the build script)

## Open questions
- Do you want to proceed without bedroom/bathroom counts (using "habitable rooms" instead)?
- Is the EPC API key registration something you can do, or should we skip EPC enrichment for now and add it later?
- Any preference on marker colours (by price band vs by property type)?
