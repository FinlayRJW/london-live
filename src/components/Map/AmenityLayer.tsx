import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { useAmenityStore, type AmenityType, type AmenityLocation } from "../../stores/amenityStore.ts";
import { useFilterStore } from "../../stores/filterStore.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import type { AmenitiesConfigData } from "../../filters/amenities/AmenitiesConfig.tsx";

const AMENITY_COLORS: Record<AmenityType, string> = {
  supermarket: "#22c55e", // green
  cinema: "#a855f7",      // purple
  gym: "#f97316",         // orange
};

const AMENITY_LABELS: Record<AmenityType, string> = {
  supermarket: "S",
  cinema: "C",
  gym: "G",
};

function makeAmenityIcon(type: AmenityType): L.DivIcon {
  const color = AMENITY_COLORS[type];
  const label = AMENITY_LABELS[type];
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;font-family:system-ui;">${label}</div>`,
  });
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AmenityLayer() {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const amenityData = useAmenityStore((s) => s.data);
  const filters = useFilterStore((s) => s.filters);
  const scores = useScoreStore((s) => s.scores);
  const graphData = useTransportStore((s) => s.graph);

  // Find the active amenities filter config
  const amenitiesConfig = useMemo(() => {
    const f = filters.find((f) => f.typeId === "amenities" && f.enabled);
    return f?.config as AmenitiesConfigData | undefined;
  }, [filters]);

  // Collect reachable postcode centroids
  const reachableCentroids = useMemo(() => {
    if (!graphData) return [];
    const centroids: { lat: number; lng: number }[] = [];
    for (const [postcode, score] of scores) {
      if (!score.pass) continue;
      const node = graphData.nodes[`centroid:${postcode}`];
      if (node) centroids.push({ lat: node.lat, lng: node.lng });
    }
    return centroids;
  }, [scores, graphData]);

  // Filter amenities to those near any reachable postcode centroid
  const visibleAmenities = useMemo(() => {
    if (!amenityData || !amenitiesConfig) return [];

    const types: AmenityType[] = ["supermarket", "cinema", "gym"];
    const enabledTypes = types.filter((t) => amenitiesConfig[t].enabled);
    if (enabledTypes.length === 0) return [];

    // If no scores yet (no other filters), show all amenities of enabled types
    if (scores.size === 0) {
      const result: { amenity: AmenityLocation; type: AmenityType }[] = [];
      for (const type of enabledTypes) {
        for (const a of amenityData[type]) {
          result.push({ amenity: a, type });
        }
      }
      return result;
    }

    if (reachableCentroids.length === 0) return [];

    // Max radius to check: largest configured time * generous speed
    const maxRadiusM = 30 * 60 * (15000 / 3600) * 1.3; // 30 min cycling with detour

    const result: { amenity: AmenityLocation; type: AmenityType }[] = [];
    for (const type of enabledTypes) {
      for (const a of amenityData[type]) {
        // Check if this amenity is near any reachable centroid
        for (const c of reachableCentroids) {
          if (haversineM(a.lat, a.lng, c.lat, c.lng) <= maxRadiusM) {
            result.push({ amenity: a, type });
            break;
          }
        }
      }
    }
    return result;
  }, [amenityData, amenitiesConfig, scores, reachableCentroids]);

  const enabled = amenitiesConfig !== undefined && visibleAmenities.length > 0;

  useEffect(() => {
    if (!enabled) {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
      return;
    }

    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius: 30,
        disableClusteringAtZoom: 14,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? "26px" : count < 50 ? "32px" : "38px";
          return L.divIcon({
            html: `<div style="width:${size};height:${size};border-radius:50%;background:rgba(100,100,100,0.7);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;font-family:system-ui;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${count}</div>`,
            className: "",
            iconSize: L.point(parseInt(size), parseInt(size)),
          });
        },
      });
      map.addLayer(clusterRef.current);
    }

    clusterRef.current.clearLayers();

    const markers: L.Marker[] = [];
    for (const { amenity, type } of visibleAmenities) {
      const marker = L.marker([amenity.lat, amenity.lng], {
        icon: makeAmenityIcon(type),
      });
      marker.bindPopup(
        `<div style="font-family:system-ui;"><strong>${amenity.name}</strong><br/><span style="color:#666;font-size:12px;">${amenity.brand} &middot; ${type}</span></div>`,
        { maxWidth: 200 },
      );
      markers.push(marker);
    }

    clusterRef.current.addLayers(markers);

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map, enabled, visibleAmenities]);

  return null;
}
