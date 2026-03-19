import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Draws a solid white mask over everything outside London using a
 * dedicated SVG overlay that is immune to Leaflet's zoom animations.
 *
 * Instead of using a Leaflet layer (which blinks during zoom transitions),
 * this renders into a raw SVG element positioned over the map and manually
 * projects the London boundary coordinates on every move/zoom.
 */
export function LondonMask() {
  const map = useMap();
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  // Load boundary data
  useEffect(() => {
    fetch("/data/london-boundary.geojson")
      .then((r) => r.json())
      .then(setBoundary)
      .catch(console.error);
  }, []);

  // Create SVG overlay element
  useEffect(() => {
    const container = map.getContainer();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.zIndex = "350";
    svg.style.pointerEvents = "none";
    svg.style.overflow = "hidden";
    container.appendChild(svg);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "#ffffff");
    path.setAttribute("fill-rule", "evenodd");
    svg.appendChild(path);

    svgRef.current = svg;
    pathRef.current = path;

    return () => {
      container.removeChild(svg);
    };
  }, [map]);

  // Update path on every map move/zoom
  useEffect(() => {
    if (!boundary || boundary.features.length === 0) return;

    const geom = boundary.features[0].geometry as Polygon | MultiPolygon;

    function update() {
      const path = pathRef.current;
      const svg = svgRef.current;
      if (!path || !svg) return;

      const size = map.getSize();
      svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);

      // Outer rect covering the entire viewport
      let d = `M0,0 L${size.x},0 L${size.x},${size.y} L0,${size.y} Z `;

      // Cut out London as hole(s)
      const rings: number[][][] =
        geom.type === "Polygon"
          ? [geom.coordinates[0]]
          : geom.coordinates.map((p) => p[0]);

      for (const ring of rings) {
        const points = ring.map(([lng, lat]) => {
          const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
          return `${pt.x},${pt.y}`;
        });
        d += `M${points[0]} ` + points.slice(1).map((p) => `L${p}`).join(" ") + " Z ";
      }

      path.setAttribute("d", d);
    }

    update();
    map.on("move zoom viewreset resize", update);
    return () => {
      map.off("move zoom viewreset resize", update);
    };
  }, [map, boundary]);

  return null;
}
