import { usePropertyStore } from "../../stores/propertyStore.ts";
import { PROPERTY_TYPE_LABELS } from "../../types/property.ts";
import type { PropertyType } from "../../types/property.ts";
import { TYPE_COLORS, CLUSTER_COLOR } from "./PropertyLayer.tsx";

const LEGEND_TYPES: PropertyType[] = ["F", "T", "S", "D"];

export function PropertyLegend() {
  const enabled = usePropertyStore((s) => s.filters.enabled);
  const data = usePropertyStore((s) => s.data);

  if (!enabled || Object.keys(data).length === 0) return null;

  return (
    <div className="absolute bottom-6 left-3 z-[1000] bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-medium text-text mb-1.5">Sold properties</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {LEGEND_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: TYPE_COLORS[type],
                border: "2px solid white",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
              }}
            />
            <span className="text-text-muted">{PROPERTY_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 mt-1.5 pt-1.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "#6366f1",
              border: "2px dashed rgba(180,180,180,0.8)",
              opacity: 0.6,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
            }}
          />
          <span className="text-text-muted">No floor area data</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-white"
            style={{
              backgroundColor: CLUSTER_COLOR,
              border: "2px solid white",
              fontSize: "7px",
              fontWeight: 600,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
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
