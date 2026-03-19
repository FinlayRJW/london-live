# London Living Finder

An interactive web app that helps you find the best areas to live in London based on customisable filters like commute time. Postcodes are scored and visualised on a colour-coded map so you can explore trade-offs at a glance.

## How It Works

### Transport Routing

A modified Dijkstra's algorithm runs over a pre-built transport network graph that includes Tube, Overground, DLR, Elizabeth line, bus, and walking edges. The algorithm tracks multi-dimensional state (current line, number of interchanges, bus usage) so filters can constrain routes — for example "at most 1 change" or "no buses".

Travel times are estimated from real distances between stations with mode-specific speeds (Tube 33 km/h, Overground 40 km/h, DLR 30 km/h, Elizabeth line 45 km/h) plus dwell, boarding, and interchange penalties.

### Filter System

Filters follow a plugin architecture. Each filter evaluates every postcode and returns a pass/fail result plus a normalised score (0–1). Multiple filters are combined via weighted average — if any filter fails a postcode, that postcode is greyed out on the map.

Current filters:
- **Commute** — travel time to a destination by walking, cycling, or public transport with configurable constraints (max time, max changes, allowed modes)

### Scoring & Visualisation

Passing postcodes are colour-coded from red (worst) to green (best) based on their combined weighted score. Hovering a postcode draws the fastest transport route on the map. The detail level switches between postal districts (zoomed out) and sectors (zoomed in).

### Data Pipeline

Raw data is fetched from the TfL API and UK postcode datasets, then processed into:
- `districts.geojson` — postcode boundary polygons
- `district-centroids.json` — lat/lng centroids for routing
- `stations.json` — TfL station metadata
- `transport-graph.json` — the full routing network (stations + centroids + edges)
- `london-boundary.geojson` — city boundary for the map mask

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Leaflet** / **React-Leaflet** — interactive map
- **Zustand** — state management (persisted to localStorage)
- **Tailwind CSS** — styling
- **D3 scales** — colour interpolation
- **Turf.js** — geospatial processing (data scripts)

## Getting Started

```bash
npm install
```

### Generate data

The transport graph and boundary data must be built before the app will work:

```bash
npm run data:all
```

This runs the individual data scripts in order (`data:boundaries`, `data:centroids`, `data:stations`, `data:graph`, `data:boundary`). You only need to re-run this if the underlying data sources change.

### Development

```bash
npm run dev
```

Opens a local dev server with hot reload.

### Production build

```bash
npm run build
npm run preview   # preview the production build locally
```

### Tests & linting

```bash
npm test
npm run lint
```
