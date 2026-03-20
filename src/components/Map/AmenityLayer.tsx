import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { useAmenityStore, type AmenityType, type AmenityLocation } from "../../stores/amenityStore.ts";
import { useFilterStore } from "../../stores/filterStore.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { useTransportStore } from "../../stores/transportStore.ts";
import { usePropertyStore } from "../../stores/propertyStore.ts";
import type { AmenitiesConfigData } from "../../filters/amenities/AmenitiesConfig.tsx";
import { WALKING_SPEED, CYCLING_SPEED, WALKING_DETOUR } from "../../transport/constants.ts";
import { haversineM } from "../../utils/geo.ts";

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

  // Track property filter state so amenities respect property-greyed postcodes
  const propertyFilterActive = useFilterStore(
    (s) => s.filters.some((f) => f.typeId === "property" && f.enabled),
  );
  const postcodesWithProperties = usePropertyStore(
    (s) => s.postcodesWithProperties,
  );
  const propertyLoadedCount = usePropertyStore(
    (s) => s.loadedDistricts.size,
  );

  // Collect reachable postcode centroids (respecting property filter)
  const reachableCentroids = useMemo(() => {
    if (!graphData) return [];
    const centroids: { lat: number; lng: number }[] = [];
    const propState = usePropertyStore.getState();
    for (const [postcode, score] of scores) {
      if (!score.pass) continue;

      // If property filter is active, skip postcodes with no matching properties
      if (propertyFilterActive) {
        const district = postcode.split(" ")[0];
        const districtLoaded = propState.loadedDistricts.has(district);
        if (!districtLoaded) continue;
        if (!propState.postcodesWithProperties.has(postcode)) {
          // For sectors, check parent district
          if (postcode.includes(" ")) {
            const parentId = postcode.substring(0, postcode.lastIndexOf(" "));
            if (!propState.postcodesWithProperties.has(parentId)) continue;
          } else {
            continue;
          }
        }
      }

      const node = graphData.nodes[`centroid:${postcode}`];
      if (node) centroids.push({ lat: node.lat, lng: node.lng });
    }
    return centroids;
  }, [scores, graphData, propertyFilterActive, postcodesWithProperties, propertyLoadedCount]);

  // Filter amenities to only those near a passing (green/orange) postcode centroid
  const visibleAmenities = useMemo(() => {
    if (!amenityData || !amenitiesConfig) return [];
    if (reachableCentroids.length === 0) return [];

    const types: AmenityType[] = ["supermarket", "cinema", "gym"];
    const enabledTypes = types.filter((t) => amenitiesConfig[t].enabled);
    if (enabledTypes.length === 0) return [];

    // For each type, use its configured max time + speed to compute a radius
    const result: { amenity: AmenityLocation; type: AmenityType }[] = [];
    for (const type of enabledTypes) {
      const tc = amenitiesConfig[type];
      const speed = tc.travelMethod === "cycle" ? CYCLING_SPEED : WALKING_SPEED;
      const maxRadiusM = tc.maxTimeMinutes * 60 * speed / WALKING_DETOUR;

      for (const a of amenityData[type]) {
        for (const c of reachableCentroids) {
          if (haversineM(a.lat, a.lng, c.lat, c.lng) <= maxRadiusM) {
            result.push({ amenity: a, type });
            break;
          }
        }
      }
    }
    return result;
  }, [amenityData, amenitiesConfig, reachableCentroids]);

  const showMarkers = amenitiesConfig?.showMarkers ?? true;
  const enabled = amenitiesConfig !== undefined && visibleAmenities.length > 0;

  useEffect(() => {
    if (!enabled || !showMarkers) {
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
            html: `<div style="width:${size};height:${size};border-radius:6px;background:rgba(168,85,247,0.8);color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;font-family:system-ui;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${count}</div>`,
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
  }, [map, enabled, showMarkers, visibleAmenities]);

  return null;
}
