import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useMapStore } from "../../stores/mapStore.ts";

const MASK_COLORS = {
  light: "#ffffff",
  dark: "#1a1a1a",
};

function getEffectiveMaskColor(theme: "light" | "dark" | "system"): string {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? MASK_COLORS.dark
      : MASK_COLORS.light;
  }
  return MASK_COLORS[theme];
}

/**
 * Draws a solid mask over everything outside London.
 * Color adapts to light/dark theme.
 *
 * Uses an SVG polygon in a custom Leaflet pane (z-index between tiles and
 * overlays). The world-bounds rectangle is 10× oversized so that even during
 * zoom-out animations (where Leaflet applies a CSS scale < 1) the mask edges
 * never enter the viewport.
 */
export function LondonMask() {
  const map = useMap();
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  const theme = useMapStore((s) => s.theme);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/london-boundary.geojson`)
      .then((r) => r.json())
      .then(setBoundary)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!boundary || boundary.features.length === 0) return;

    // Create custom pane between tiles (200) and overlays (400)
    if (!map.getPane("maskPane")) {
      const pane = map.createPane("maskPane");
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }

    const maskColor = getEffectiveMaskColor(theme);

    // Set container background as belt-and-suspenders fallback
    const container = map.getContainer();
    container.style.backgroundColor = maskColor;

    const geom = boundary.features[0].geometry as Polygon | MultiPolygon;

    // 10× oversized world bounds so zoom-out CSS scale never reveals edges
    const worldBounds: [number, number][] = [
      [-900, -1800],
      [-900, 1800],
      [900, 1800],
      [900, -1800],
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
      fillColor: maskColor,
      fillOpacity: 1,
      interactive: false,
      pane: "maskPane",
      // padding=10 makes the SVG viewBox extend 10× the viewport in every
      // direction so the mask polygon is never clipped during drag/pan.
      renderer: L.svg({ pane: "maskPane", padding: 10 }),
    });

    mask.addTo(map);

    return () => {
      map.removeLayer(mask);
      container.style.backgroundColor = "";
    };
  }, [map, boundary, theme]);

  return null;
}
