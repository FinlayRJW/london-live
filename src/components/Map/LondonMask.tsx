import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Loads the precomputed London boundary and draws a mask that
 * greys out everything outside London.
 */
export function LondonMask() {
  const map = useMap();
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/data/london-boundary.geojson")
      .then((r) => r.json())
      .then(setBoundary)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!boundary || boundary.features.length === 0) return;

    const geom = boundary.features[0].geometry as Polygon | MultiPolygon;

    // World bounds as outer ring (lat, lng for Leaflet)
    const worldBounds: [number, number][] = [
      [-90, -180],
      [-90, 180],
      [90, 180],
      [90, -180],
    ];

    // Extract London outer rings as holes (GeoJSON is [lng, lat], Leaflet is [lat, lng])
    const londonRings: [number, number][][] = [];
    if (geom.type === "Polygon") {
      londonRings.push(
        geom.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]),
      );
    } else {
      for (const polygon of geom.coordinates) {
        londonRings.push(
          polygon[0].map(([lng, lat]) => [lat, lng] as [number, number]),
        );
      }
    }

    const mask = L.polygon([worldBounds, ...londonRings], {
      color: "none",
      fillColor: "#f0f0f0",
      fillOpacity: 0.85,
      interactive: false,
    });

    mask.addTo(map);
    return () => {
      map.removeLayer(mask);
    };
  }, [map, boundary]);

  return null;
}
