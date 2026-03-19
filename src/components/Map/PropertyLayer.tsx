import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { usePropertyStore } from "../../stores/propertyStore.ts";
import { usePropertyData } from "../../hooks/usePropertyData.ts";
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

const TYPE_ICONS: Record<PropertyType, string> = {
  F: "&#127970;", // 🏢 office/apartment building
  T: "&#127969;", // 🏡 house with garden
  S: "&#127968;", // 🏠 house
  D: "&#127960;", // 🏘 houses
  O: "&#127959;", // 🏗 building
};

export const CLUSTER_COLOR = "rgba(30, 64, 110, 0.85)";

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `£${(price / 1_000_000).toFixed(2)}m`;
  }
  return `£${(price / 1_000).toFixed(0)}k`;
}

function makeIcon(type: PropertyType): L.DivIcon {
  const color = TYPE_COLORS[type];
  const icon = TYPE_ICONS[type];
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;">${icon}</div>`,
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

function getFilteredSales(
  data: Record<string, { lat: number; lng: number; sales: PropertyRecord[] }>,
  filters: {
    minPrice: number;
    maxPrice: number;
    minFloorArea: number;
    maxFloorArea: number;
    types: PropertyType[];
    tenure: "F" | "L" | "both";
    dateRange: 6 | 12 | 24;
  },
  reachableDistricts: Set<string>,
): Array<{ postcode: string; lat: number; lng: number; sale: PropertyRecord }> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - filters.dateRange);
  const cutoff = cutoffDate.toISOString().slice(0, 7); // YYYY-MM
  const results: Array<{
    postcode: string;
    lat: number;
    lng: number;
    sale: PropertyRecord;
  }> = [];

  for (const [postcode, group] of Object.entries(data)) {
    // Only show properties in reachable districts
    const district = postcode.split(" ")[0];
    if (reachableDistricts.size > 0 && !reachableDistricts.has(district)) continue;

    for (const sale of group.sales) {
      if (sale.p < filters.minPrice || sale.p > filters.maxPrice) continue;
      if (!filters.types.includes(sale.t)) continue;
      if (filters.tenure !== "both" && sale.te !== filters.tenure) continue;
      if (sale.d < cutoff) continue;
      if (sale.fa !== null) {
        if (sale.fa < filters.minFloorArea || sale.fa > filters.maxFloorArea) continue;
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
  const filters = usePropertyStore((s) => s.filters);
  const scores = useScoreStore((s) => s.scores);

  // Compute which districts are currently reachable
  const reachableDistricts = useMemo(() => {
    const districts = new Set<string>();
    for (const [postcode, score] of scores) {
      if (score.pass) {
        districts.add(postcode.split(" ")[0]);
      }
    }
    return districts;
  }, [scores]);

  const filteredSales = useMemo(() => {
    if (!data || !enabled) return [];
    return getFilteredSales(data, filters, reachableDistricts);
  }, [data, enabled, filters, reachableDistricts]);

  useEffect(() => {
    if (!enabled) {
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
        icon: makeIcon(sale.t),
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
  }, [map, enabled, filteredSales]);

  return null;
}
