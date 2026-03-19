import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Draws a solid white mask over everything outside London.
 * Uses a Leaflet polygon on a custom pane with CSS that prevents
 * it from being hidden during zoom animations.
 */
export function LondonMask() {
  const map = useMap();
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/london-boundary.geojson`)
      .then((r) => r.json())
      .then(setBoundary)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!boundary || boundary.features.length === 0) return;

    // Create custom pane between tiles and overlays
    if (!map.getPane("maskPane")) {
      const pane = map.createPane("maskPane");
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }

    // Inject CSS to prevent the mask pane from being hidden during zoom
    const style = document.createElement("style");
    style.textContent = `
      .leaflet-zoom-animated .leaflet-pane.leaflet-maskPane-pane,
      .leaflet-maskPane-pane,
      .leaflet-pane[style*="z-index: 350"] {
        transition: none !important;
      }
      .leaflet-zoom-anim .leaflet-pane[style*="z-index: 350"] {
        opacity: 1 !important;
        visibility: visible !important;
      }
    `;
    document.head.appendChild(style);

    const geom = boundary.features[0].geometry as Polygon | MultiPolygon;

    const worldBounds: [number, number][] = [
      [-90, -180],
      [-90, 180],
      [90, 180],
      [90, -180],
    ];

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
      fillColor: "#ffffff",
      fillOpacity: 1,
      interactive: false,
      pane: "maskPane",
      // Use SVG renderer (not canvas) so the polygon stays during canvas redraws
      renderer: L.svg({ pane: "maskPane" }),
    });

    mask.addTo(map);

    return () => {
      map.removeLayer(mask);
      document.head.removeChild(style);
    };
  }, [map, boundary]);

  return null;
}
