import { MapContainer as LeafletMap, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useMapStore } from "../../stores/mapStore.ts";
import { DistrictLayer } from "./DistrictLayer.tsx";
import { RouteOverlay } from "./RouteOverlay.tsx";
import { PropertyLayer } from "./PropertyLayer.tsx";
import { ZoomController } from "./ZoomController.tsx";
import { LondonMask } from "./LondonMask.tsx";
import { Legend } from "./Legend.tsx";
import { RouteLegend } from "./RouteLegend.tsx";
import { usePostcodeBoundaries } from "../../hooks/usePostcodeBoundaries.ts";
import "leaflet/dist/leaflet.css";

// Generous bounds around London - allows panning but keeps London in view
const LONDON_BOUNDS = L.latLngBounds(
  L.latLng(51.0, -1.0),  // SW corner
  L.latLng(52.0, 0.8),   // NE corner
);

export function MapView() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const { boundaries, isLoading } = usePostcodeBoundaries();

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
        {boundaries && <DistrictLayer data={boundaries} />}
        <RouteOverlay />
        <PropertyLayer />
      </LeafletMap>
      <Legend />
      <RouteLegend />
      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1 text-sm text-text-muted">
          Loading boundaries...
        </div>
      )}
    </div>
  );
}
