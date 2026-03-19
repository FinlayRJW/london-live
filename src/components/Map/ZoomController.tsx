import { useMapEvents } from "react-leaflet";
import { useMapStore } from "../../stores/mapStore.ts";

export function ZoomController() {
  const setZoom = useMapStore((s) => s.setZoom);
  const setCenter = useMapStore((s) => s.setCenter);

  useMapEvents({
    zoomend: (e) => {
      setZoom(e.target.getZoom());
    },
    moveend: (e) => {
      const center = e.target.getCenter();
      setCenter([center.lat, center.lng]);
    },
  });

  return null;
}
