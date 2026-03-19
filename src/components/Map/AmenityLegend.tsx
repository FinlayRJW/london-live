import { useFilterStore } from "../../stores/filterStore.ts";
import { useAmenityStore, type AmenityType } from "../../stores/amenityStore.ts";
import type { AmenitiesConfigData } from "../../filters/amenities/AmenitiesConfig.tsx";

const AMENITY_COLORS: Record<AmenityType, string> = {
  supermarket: "#22c55e",
  cinema: "#a855f7",
  gym: "#f97316",
};

const AMENITY_NAMES: Record<AmenityType, string> = {
  supermarket: "Supermarket",
  cinema: "Cinema",
  gym: "Gym",
};

const AMENITY_LABELS: Record<AmenityType, string> = {
  supermarket: "S",
  cinema: "C",
  gym: "G",
};

const TYPES: AmenityType[] = ["supermarket", "cinema", "gym"];

export function AmenityLegend() {
  const filters = useFilterStore((s) => s.filters);
  const data = useAmenityStore((s) => s.data);

  const amenityFilter = filters.find(
    (f) => f.typeId === "amenities" && f.enabled,
  );
  if (!amenityFilter || !data) return null;

  const config = amenityFilter.config as AmenitiesConfigData;
  const enabledTypes = TYPES.filter((t) => config[t].enabled);
  if (enabledTypes.length === 0) return null;
  if (!(config.showMarkers ?? true)) return null;

  return (
    <div className="bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-medium text-text mb-1.5">Nearby amenities</div>
      <div className="space-y-1">
        {enabledTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white"
              style={{
                backgroundColor: AMENITY_COLORS[type],
                border: "2px solid white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                fontSize: "8px",
                fontWeight: 700,
              }}
            >
              {AMENITY_LABELS[type]}
            </div>
            <span className="text-text-muted">{AMENITY_NAMES[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
