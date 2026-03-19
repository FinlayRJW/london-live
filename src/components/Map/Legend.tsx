import { scoreLegendStops, GREYED_COLOR } from "./colorScale.ts";

export function Legend() {
  const stops = scoreLegendStops(10);

  return (
    <div className="absolute bottom-6 right-3 z-[1000] bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="font-medium mb-1 text-text">Score</div>
      <div className="flex items-center gap-0">
        {stops.map((s, i) => (
          <div
            key={i}
            className="w-4 h-3"
            style={{ backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex justify-between text-text-muted mt-0.5">
        <span>Worst</span>
        <span>Best</span>
      </div>
      <div className="flex items-center gap-1 mt-1 text-text-muted">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GREYED_COLOR }} />
        <span>Filtered out</span>
      </div>
    </div>
  );
}
