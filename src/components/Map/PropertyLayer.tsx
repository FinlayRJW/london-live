import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { usePropertyStore } from "../../stores/propertyStore.ts";
import { usePropertyData } from "../../hooks/usePropertyData.ts";
import { usePropertyFilters } from "../../hooks/usePropertyFilters.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import type { PropertyRecord, PropertyType } from "../../types/property.ts";
import { PROPERTY_TYPE_LABELS } from "../../types/property.ts";

export const TYPE_COLORS: Record<PropertyType, string> = {
  F: "#6366f1", // indigo - flats
  T: "#f59e0b", // amber - terraced
  S: "#10b981", // emerald - semi
  D: "#ef4444", // red - detached
  O: "#6b7280", // grey - other
};

export const CLUSTER_COLOR = "rgba(30, 64, 110, 0.55)";

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `£${(price / 1_000_000).toFixed(2)}m`;
  }
  return `£${(price / 1_000).toFixed(0)}k`;
}

function makeIcon(type: PropertyType, hasEpc: boolean): L.DivIcon {
  const color = TYPE_COLORS[type];
  const size = 12;
  const outline = hasEpc
    ? `border:2px solid #333;`
    : `border:2px solid #333;opacity:0.45;`;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};${outline}box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
  });
}

function buildPopupHtml(postcode: string, sale: PropertyRecord): string {
  const lines: string[] = [];
  lines.push(`<div style="font-family:system-ui;min-width:200px;">`);
  lines.push(`<div style="font-weight:700;font-size:14px;margin-bottom:4px;">${formatPrice(sale.p)}</div>`);
  lines.push(`<div style="font-size:12px;color:#555;margin-bottom:8px;">${sale.a}</div>`);

  lines.push(`<table style="font-size:12px;border-collapse:collapse;width:100%;">`);

  const row = (label: string, value: string) =>
    `<tr><td style="color:#888;padding:2px 8px 2px 0;white-space:nowrap;">${label}</td><td style="padding:2px 0;">${value}</td></tr>`;

  lines.push(row("Postcode", postcode));
  lines.push(row("Date", sale.d));
  lines.push(row("Type", PROPERTY_TYPE_LABELS[sale.t] ?? sale.t));
  lines.push(row("Tenure", sale.te === "F" ? "Freehold" : "Leasehold"));
  if (sale.n) lines.push(row("", "New build"));

  if (sale.fa !== null) {
    lines.push(row("Floor area", `${sale.fa} m²`));
    const ppsqm = Math.round(sale.p / sale.fa);
    lines.push(row("Price/m²", `£${ppsqm.toLocaleString()}`));
  } else {
    lines.push(row("Floor area", `<span style="color:#ccc;">—</span>`));
  }
  lines.push(row("Habitable rooms", sale.r !== null
    ? `${sale.r}`
    : `<span style="color:#ccc;">—</span>`));
  if (sale.er) {
    lines.push(row("EPC rating", sale.er));
  }

  lines.push(`</table>`);

  // Rightmove link
  const rmPostcode = postcode.replace(/\s+/g, "-");
  lines.push(
    `<a href="https://www.rightmove.co.uk/house-prices/${rmPostcode}.html" ` +
      `target="_blank" rel="noopener noreferrer" ` +
      `style="display:block;margin-top:8px;font-size:11px;color:#6366f1;text-decoration:none;">` +
      `View area on Rightmove →</a>`,
  );

  lines.push(`</div>`);
  return lines.join("");
}

/**
 * Extract the sector prefix from a full postcode.
 * Full postcode "E1 6AB" -> sector "E1 6"
 */
function postcodeToSector(postcode: string): string {
  const parts = postcode.split(" ");
  if (parts.length < 2 || parts[1].length === 0) return parts[0];
  return `${parts[0]} ${parts[1][0]}`;
}

function getFilteredSales(
  data: Record<string, { lat: number; lng: number; sales: PropertyRecord[] }>,
  filters: {
    minPrice: number;
    maxPrice: number;
    minFloorArea: number;
    maxFloorArea: number;
    hideNoFloorArea: boolean;
    types: PropertyType[];
    tenure: "F" | "L" | "both";
    dateRange: 6 | 12 | 24;
  },
  reachablePostcodes: Set<string>,
): Array<{ postcode: string; lat: number; lng: number; sale: PropertyRecord }> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - filters.dateRange);
  const cutoff = cutoffDate.toISOString().slice(0, 7); // YYYY-MM
  const toPrefix = postcodeToSector;

  const results: Array<{
    postcode: string;
    lat: number;
    lng: number;
    sale: PropertyRecord;
  }> = [];

  for (const [postcode, group] of Object.entries(data)) {
    // Only show properties in reachable areas at the current zoom level
    const prefix = toPrefix(postcode);
    if (reachablePostcodes.size > 0 && !reachablePostcodes.has(prefix)) continue;

    for (const sale of group.sales) {
      if (sale.p < filters.minPrice || sale.p > filters.maxPrice) continue;
      if (!filters.types.includes(sale.t)) continue;
      if (filters.tenure !== "both" && sale.te !== filters.tenure) continue;
      if (sale.d < cutoff) continue;
      if (sale.fa !== null) {
        if (sale.fa < filters.minFloorArea || sale.fa > filters.maxFloorArea) continue;
      } else if (filters.hideNoFloorArea) {
        continue;
      }
      results.push({ postcode, lat: group.lat, lng: group.lng, sale });
    }
  }

  return results;
}

export function PropertyLayer() {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const { data, enabled } = usePropertyData();
  const filters = usePropertyFilters();
  const scores = useScoreStore((s) => s.scores);

  // Collect reachable postcode IDs from scores (district or sector level).
  // Also include "approximate" sectors whose parent district passes — these
  // show as orange on the map and should still display properties.
  const reachablePostcodes = useMemo(() => {
    const reachable = new Set<string>();
    for (const [postcode, score] of scores) {
      if (score.pass) {
        reachable.add(postcode);
      }
    }
    for (const [postcode, score] of scores) {
      if (!score.pass && postcode.includes(" ")) {
        const parentId = postcode.substring(0, postcode.lastIndexOf(" "));
        if (reachable.has(parentId)) {
          reachable.add(postcode);
        }
      }
    }
    return reachable;
  }, [scores]);

  const setPostcodesWithProperties = usePropertyStore(
    (s) => s.setPostcodesWithProperties,
  );

  const filteredSales = useMemo(() => {
    if (!data || !enabled || !filters) return [];
    return getFilteredSales(data, filters, reachablePostcodes);
  }, [data, enabled, filters, reachablePostcodes]);

  // Compute which postcode prefixes have matching properties and store it
  // so DistrictLayer can grey out areas with no properties
  useEffect(() => {
    if (!enabled) {
      setPostcodesWithProperties(new Set());
      return;
    }
    const prefixes = new Set<string>();
    for (const { postcode } of filteredSales) {
      prefixes.add(postcodeToSector(postcode));
    }
    setPostcodesWithProperties(prefixes);
  }, [filteredSales, enabled, setPostcodesWithProperties]);

  const showMarkers = filters?.showMarkers ?? true;

  useEffect(() => {
    if (!enabled || !showMarkers) {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
      return;
    }

    // Create or clear cluster group
    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius: 40,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          let size: string;
          let className: string;
          if (count < 10) {
            size = "30px";
            className = "small";
          } else if (count < 100) {
            size = "36px";
            className = "medium";
          } else {
            size = "42px";
            className = "large";
          }
          return L.divIcon({
            html: `<div style="width:${size};height:${size};border-radius:50%;background:${CLUSTER_COLOR};color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;font-family:system-ui;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${count}</div>`,
            className: className,
            iconSize: L.point(parseInt(size), parseInt(size)),
          });
        },
      });
      map.addLayer(clusterRef.current);
    }

    clusterRef.current.clearLayers();

    // Add markers with small jitter for same-postcode properties
    const postcodeCount = new Map<string, number>();
    const markers: L.Marker[] = [];

    for (const { postcode, lat, lng, sale } of filteredSales) {
      const idx = postcodeCount.get(postcode) ?? 0;
      postcodeCount.set(postcode, idx + 1);

      // Deterministic jitter based on index within postcode
      const angle = (idx * 137.508) * (Math.PI / 180); // golden angle
      const radius = 0.0001 * Math.sqrt(idx + 1);
      const jLat = lat + radius * Math.cos(angle);
      const jLng = lng + radius * Math.sin(angle);

      const marker = L.marker([jLat, jLng], {
        icon: makeIcon(sale.t, sale.fa !== null),
      });

      marker.bindPopup(buildPopupHtml(postcode, sale), {
        maxWidth: 280,
        className: "property-popup",
      });

      markers.push(marker);
    }

    clusterRef.current.addLayers(markers);

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map, enabled, showMarkers, filteredSales]);

  return null;
}
