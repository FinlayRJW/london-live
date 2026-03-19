import { GREYED_COLOR } from "./colorScale.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";

const REACHABLE_COLOR = "#4ade80";

export function Legend() {
  const hasScores = useScoreStore((s) => s.scores.size > 0);

  if (!hasScores) return null;

  return (
    <div className="absolute bottom-6 right-3 z-[1000] bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: REACHABLE_COLOR, opacity: 0.7 }} />
          <span className="text-text-muted">Reachable</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GREYED_COLOR }} />
          <span className="text-text-muted">Not reachable</span>
        </div>
      </div>
    </div>
  );
}
