import { usePropertyStore } from "../../stores/propertyStore.ts";
import { usePropertyFilters } from "../../hooks/usePropertyFilters.ts";
import { PROPERTY_TYPE_LABELS } from "../../types/property.ts";
import type { PropertyType } from "../../types/property.ts";
import { TYPE_COLORS, CLUSTER_COLOR } from "./PropertyLayer.tsx";

const LEGEND_TYPES: PropertyType[] = ["F", "T", "S", "D"];

export function PropertyLegend() {
  const filters = usePropertyFilters();
  const data = usePropertyStore((s) => s.data);

  if (!filters || Object.keys(data).length === 0) return null;
  if (!(filters.showMarkers ?? true)) return null;

  return (
    <div className="bg-overlay-bg/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-medium text-text mb-1.5">Sold properties</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {LEGEND_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: TYPE_COLORS[type],
                border: "2px solid #333",
              }}
            />
            <span className="text-text-muted">{PROPERTY_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border mt-1.5 pt-1.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "#6366f1",
              border: "2px solid #333",
              opacity: 0.45,
            }}
          />
          <span className="text-text-muted">No floor area data</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-white"
            style={{
              backgroundColor: CLUSTER_COLOR,
              border: "2px solid #333",
              fontSize: "7px",
              fontWeight: 600,
            }}
          >
            n
          </div>
          <span className="text-text-muted">Cluster (zoom in)</span>
        </div>
      </div>
    </div>
  );
}
