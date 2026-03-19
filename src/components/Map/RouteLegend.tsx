import { useFilterStore } from "../../stores/filterStore.ts";
import { useRouteStore } from "../../stores/routeStore.ts";
import type { CommuteConfigData } from "../../filters/commute/CommuteConfig.tsx";

const TUBE_LINES = [
  { name: "Bakerloo", color: "#B36305" },
  { name: "Central", color: "#E32017" },
  { name: "Circle", color: "#FFD300" },
  { name: "District", color: "#00782A" },
  { name: "H&C", color: "#F3A9BB" },
  { name: "Jubilee", color: "#A0A5A9" },
  { name: "Metropolitan", color: "#9B0056" },
  { name: "Northern", color: "#000000" },
  { name: "Piccadilly", color: "#003688" },
  { name: "Victoria", color: "#0098D4" },
  { name: "W&C", color: "#95CDBA" },
];

const OTHER_MODES = [
  { name: "DLR", color: "#00A4A7", dashed: false },
  { name: "Elizabeth", color: "#6950A1", dashed: false },
  { name: "Overground", color: "#EE7C0E", dashed: false },
  { name: "National Rail", color: "#1D3A6B", dashed: false },
  { name: "Bus", color: "#CE312D", dashed: true },
  { name: "Walking", color: "#666", dashed: true },
];

export function RouteLegend() {
  const filters = useFilterStore((s) => s.filters);
  const routeDataByFilter = useRouteStore((s) => s.routeDataByFilter);

  const hasActiveRouteDisplay = filters.some((f) => {
    if (!f.enabled || f.typeId !== "commute") return false;
    const config = f.config as CommuteConfigData;
    return config.showRoute && routeDataByFilter.has(f.id);
  });

  if (!hasActiveRouteDisplay) return null;

  return (
    <div className="absolute bottom-16 right-3 z-[1000] bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-medium text-text mb-1.5">Route colours</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {TUBE_LINES.map((line) => (
          <div key={line.name} className="flex items-center gap-1.5">
            <div
              className="w-4 h-1 rounded-full flex-shrink-0"
              style={{ backgroundColor: line.color }}
            />
            <span className="text-text-muted">{line.name}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 mt-1.5 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {OTHER_MODES.map((mode) => (
          <div key={mode.name} className="flex items-center gap-1.5">
            <div className="w-4 h-1 flex-shrink-0 relative">
              {mode.dashed ? (
                <svg width="16" height="4" viewBox="0 0 16 4">
                  <line
                    x1="0" y1="2" x2="16" y2="2"
                    stroke={mode.color}
                    strokeWidth="3"
                    strokeDasharray={mode.name === "Walking" ? "3,3" : "1,3"}
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <div
                  className="w-4 h-1 rounded-full"
                  style={{ backgroundColor: mode.color }}
                />
              )}
            </div>
            <span className="text-text-muted">{mode.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
