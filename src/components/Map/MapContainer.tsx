import { MapContainer as LeafletMap, TileLayer, Pane, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { useMapStore } from "../../stores/mapStore.ts";
import { DistrictLayer } from "./DistrictLayer.tsx";
import { RouteOverlay } from "./RouteOverlay.tsx";
import { PropertyLayer } from "./PropertyLayer.tsx";
import { AmenityLayer } from "./AmenityLayer.tsx";
import { ZoomController } from "./ZoomController.tsx";
import { LondonMask } from "./LondonMask.tsx";
import { Legend } from "./Legend.tsx";
import { RouteLegend } from "./RouteLegend.tsx";
import { PropertyLegend } from "./PropertyLegend.tsx";
import { usePostcodeBoundaries } from "../../hooks/usePostcodeBoundaries.ts";
import type { PostcodeLevel } from "../../types/geo.ts";
import "leaflet/dist/leaflet.css";

/** Imperatively toggle a Leaflet pane's visibility + pointer-events. */
function PaneVisibility({ name, visible }: { name: string; visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    const pane = map.getPane(name);
    if (pane) {
      pane.style.display = visible ? "" : "none";
      pane.style.pointerEvents = visible ? "auto" : "none";
    }
  }, [map, name, visible]);
  return null;
}

// Generous bounds around London - allows panning but keeps London in view
const LONDON_BOUNDS = L.latLngBounds(
  L.latLng(51.0, -1.0),  // SW corner
  L.latLng(52.0, 0.8),   // NE corner
);

export function MapView() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const activeLevel = useMapStore((s) => s.activeLevel);
  const { districts, sectors, isLoading } = usePostcodeBoundaries();

  return (
    <div className="relative flex-1 h-full">
      <LeafletMap
        center={center}
        zoom={zoom}
        className="h-full w-full"
        preferCanvas={true}
        zoomControl={true}
        maxZoom={16}
        minZoom={9}
        maxBounds={LONDON_BOUNDS}
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomController />
        <LondonMask />
        {/* Both layers stay mounted; display toggled so only active level is visible.
            Scores are pre-computed for both levels so no flicker on switch. */}
        <PaneVisibility name="district-boundaries" visible={activeLevel === "district"} />
        <PaneVisibility name="sector-boundaries" visible={activeLevel === "sector"} />
        <Pane name="district-boundaries" style={{ zIndex: 400 }}>
          {districts && <DistrictLayer data={districts} />}
        </Pane>
        <Pane name="sector-boundaries" style={{ zIndex: 400 }}>
          {sectors && <DistrictLayer data={sectors} />}
        </Pane>
        <RouteOverlay />
        <PropertyLayer />
        <AmenityLayer />
      </LeafletMap>
      <Legend />
      <RouteLegend />
      <PropertyLegend />
      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1 text-sm text-text-muted">
          Loading boundaries...
        </div>
      )}
    </div>
  );
}
