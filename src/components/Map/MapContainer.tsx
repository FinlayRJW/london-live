import { MapContainer as LeafletMap, TileLayer } from "react-leaflet";
import { useMapStore } from "../../stores/mapStore.ts";
import { DistrictLayer } from "./DistrictLayer.tsx";
import { ZoomController } from "./ZoomController.tsx";
import { Legend } from "./Legend.tsx";
import { usePostcodeBoundaries } from "../../hooks/usePostcodeBoundaries.ts";
import "leaflet/dist/leaflet.css";

export function MapView() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const { districts, isLoading } = usePostcodeBoundaries();

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
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomController />
        {districts && <DistrictLayer data={districts} />}
      </LeafletMap>
      <Legend />
      {isLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1 text-sm text-text-muted">
          Loading boundaries...
        </div>
      )}
    </div>
  );
}
