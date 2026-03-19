import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useFilterStore } from "../../stores/filterStore.ts";
import type { CommuteConfigData } from "../../filters/commute/CommuteConfig.tsx";

const MARKER_ICON = L.divIcon({
  className: "",
  html: `<svg width="16" height="24" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#e53e3e"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [16, 24],
  iconAnchor: [8, 24],
});

export function CommuteMarkers() {
  const filters = useFilterStore((s) => s.filters);

  const commuteDestinations = filters
    .filter((f) => f.enabled && f.typeId === "commute")
    .map((f) => ({ id: f.id, config: f.config as CommuteConfigData }))
    .filter((d) => d.config.destinationLat != null && d.config.destinationLng != null);

  if (commuteDestinations.length === 0) return null;

  return (
    <>
      {commuteDestinations.map((d) => (
        <Marker
          key={d.id}
          position={[d.config.destinationLat!, d.config.destinationLng!]}
          icon={MARKER_ICON}
          interactive={true}
        >
          <Tooltip direction="top" offset={[0, -24]}>
            {d.config.destinationAddress || "Commute destination"}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
