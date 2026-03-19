import { Polyline, CircleMarker, Marker, Pane } from "react-leaflet";
import L from "leaflet";
import { useRouteStore, reconstructRoute, type RouteSegment } from "../../stores/routeStore.ts";
import { useFilterStore } from "../../stores/filterStore.ts";
import type { CommuteConfigData } from "../../filters/commute/CommuteConfig.tsx";
import type { TransportMode } from "../../types/transport.ts";
import { useMemo } from "react";

// Official TfL tube line colours
const TUBE_LINE_COLORS: Record<string, string> = {
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith-city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo-city": "#95CDBA",
};

// Overground sub-line colours (2024 rebrand)
const OVERGROUND_LINE_COLORS: Record<string, string> = {
  liberty: "#6E7E91",
  lioness: "#FECB00",
  mildmay: "#004D82",
  suffragette: "#00A166",
  weaver: "#823B53",
  windrush: "#E4131A",
};

const FALLBACK_OVERGROUND = "#EE7C0E";
const DLR_COLOR = "#00A4A7";
const ELIZABETH_COLOR = "#6950A1";
const BUS_COLOR = "#CE312D";
const NATIONAL_RAIL_COLOR = "#1D3A6B";
const WALKING_COLOR = "#666";

function getSegmentColor(mode: TransportMode, line?: string): string {
  if (mode === "tube" && line) {
    return TUBE_LINE_COLORS[line] ?? "#0019A8";
  }
  if (mode === "overground" && line) {
    return OVERGROUND_LINE_COLORS[line] ?? FALLBACK_OVERGROUND;
  }
  if (mode === "dlr") return DLR_COLOR;
  if (mode === "elizabeth_line") return ELIZABETH_COLOR;
  if (mode === "national_rail") return NATIONAL_RAIL_COLOR;
  if (mode === "bus") return BUS_COLOR;
  if (mode === "walking") return WALKING_COLOR;
  return "#999";
}

interface BusLabel {
  routeNumber: string;
  lat: number;
  lng: number;
}

/** Group consecutive bus segments with the same line (route ID) and return a label at each group's midpoint. */
function getBusLabels(segs: RouteSegment[]): BusLabel[] {
  const labels: BusLabel[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    if (seg.mode !== "bus" || !seg.line) {
      i++;
      continue;
    }
    // Collect consecutive bus segments with the same route
    const routeId = seg.line;
    const groupStart = i;
    while (i < segs.length && segs[i].mode === "bus" && segs[i].line === routeId) {
      i++;
    }
    // Pick the midpoint segment
    const midIdx = groupStart + Math.floor((i - groupStart) / 2);
    const midSeg = segs[midIdx];
    labels.push({
      routeNumber: routeId.toUpperCase(),
      lat: (midSeg.from.lat + midSeg.to.lat) / 2,
      lng: (midSeg.from.lng + midSeg.to.lng) / 2,
    });
  }
  return labels;
}

export function RouteOverlay() {
  const hoveredPostcode = useRouteStore((s) => s.hoveredPostcode);
  const routeDataByFilter = useRouteStore((s) => s.routeDataByFilter);
  const filters = useFilterStore((s) => s.filters);

  const segments = useMemo(() => {
    if (!hoveredPostcode) return [];

    const allSegments: { filterId: string; segments: ReturnType<typeof reconstructRoute> }[] = [];

    for (const filter of filters) {
      if (!filter.enabled || filter.typeId !== "commute") continue;
      const config = filter.config as CommuteConfigData;
      if (!config.showRoute) continue;

      const routeData = routeDataByFilter.get(filter.id);
      if (!routeData) continue;

      const centroidId = `centroid:${hoveredPostcode}`;
      let route = reconstructRoute(routeData, centroidId);
      // Fall back to parent district route for orange (approximate) sectors
      if (route.length === 0 && hoveredPostcode.includes(" ")) {
        const parentId = hoveredPostcode.substring(0, hoveredPostcode.lastIndexOf(" "));
        route = reconstructRoute(routeData, `centroid:${parentId}`);
      }
      if (route.length > 0) {
        allSegments.push({ filterId: filter.id, segments: route });
      }
    }

    return allSegments;
  }, [hoveredPostcode, routeDataByFilter, filters]);

  // Compute bus route labels from grouped consecutive bus segments
  const busLabels = useMemo(() => {
    const labels: (BusLabel & { filterId: string })[] = [];
    for (const { filterId, segments: segs } of segments) {
      for (const label of getBusLabels(segs)) {
        labels.push({ ...label, filterId });
      }
    }
    return labels;
  }, [segments]);

  if (segments.length === 0) return null;

  // Collect unique station nodes for markers (exclude centroids and destination)
  const stationNodes = new Map<string, { lat: number; lng: number }>();
  for (const { segments: segs } of segments) {
    for (const seg of segs) {
      if (!seg.from.nodeId.startsWith("centroid:") && seg.from.nodeId !== "__destination__") {
        stationNodes.set(seg.from.nodeId, { lat: seg.from.lat, lng: seg.from.lng });
      }
      if (!seg.to.nodeId.startsWith("centroid:") && seg.to.nodeId !== "__destination__") {
        stationNodes.set(seg.to.nodeId, { lat: seg.to.lat, lng: seg.to.lng });
      }
    }
  }

  return (
    <>
    <Pane name="route-overlay" style={{ zIndex: 620, pointerEvents: "none" }}>
      {/* White outline behind coloured lines for contrast */}
      {segments.flatMap(({ filterId, segments: segs }) =>
        segs.map((seg, i) => (
          <Polyline
            key={`${filterId}-outline-${i}`}
            positions={[
              [seg.from.lat, seg.from.lng],
              [seg.to.lat, seg.to.lng],
            ]}
            pathOptions={{
              color: "#fff",
              weight: 7,
              opacity: 0.8,
            }}
            interactive={false}
          />
        )),
      )}
      {/* Coloured route segments */}
      {segments.flatMap(({ filterId, segments: segs }) =>
        segs.map((seg, i) => (
          <Polyline
            key={`${filterId}-${i}`}
            positions={[
              [seg.from.lat, seg.from.lng],
              [seg.to.lat, seg.to.lng],
            ]}
            pathOptions={{
              color: getSegmentColor(seg.mode, seg.line),
              weight: seg.mode === "bus" ? 5 : 4,
              opacity: 0.9,
              dashArray: seg.mode === "walking" ? "6, 8" : seg.mode === "bus" ? "2, 6" : undefined,
              lineCap: seg.mode === "bus" ? "round" : "round",
            }}
          />
        )),
      )}
      {/* Station dots */}
      {Array.from(stationNodes.entries()).map(([nodeId, pos]) => (
        <CircleMarker
          key={`station-${nodeId}`}
          center={[pos.lat, pos.lng]}
          radius={4}
          pathOptions={{
            color: "#333",
            fillColor: "#fff",
            fillOpacity: 1,
            weight: 2,
          }}
        />
      ))}
    </Pane>
    {/* Bus route number badges — separate pane so they render above lines */}
    <Pane name="bus-labels" style={{ zIndex: 625, pointerEvents: "none" }}>
      {busLabels.map((label, i) => (
        <Marker
          key={`bus-label-${label.filterId}-${i}`}
          position={[label.lat, label.lng]}
          interactive={false}
          icon={L.divIcon({
            className: "",
            html: `<div style="background:#CE312D;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:bold;white-space:nowrap;border:1.5px solid #fff;line-height:1.3;text-align:center;transform:translate(-50%,-50%);width:fit-content">${label.routeNumber}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      ))}
    </Pane>
    </>
  );
}
