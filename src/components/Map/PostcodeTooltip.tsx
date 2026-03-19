import { useScoreStore } from "../../stores/scoreStore.ts";
import { getFilterPlugin } from "../../filters/registry.ts";
import { useFilterStore } from "../../stores/filterStore.ts";

interface Props {
  postcodeId: string | null;
}

export function PostcodeTooltip({ postcodeId }: Props) {
  const scores = useScoreStore((s) => s.scores);
  const filters = useFilterStore((s) => s.filters);

  if (!postcodeId) return null;

  const score = scores.get(postcodeId);

  return (
    <div className="bg-white shadow-lg rounded-lg px-3 py-2 text-sm border border-border pointer-events-none">
      <div className="font-semibold text-text mb-1">{postcodeId}</div>
      {score && (
        <div className="space-y-0.5">
          {!score.pass && (
            <div className="text-red-600 text-xs">Filtered out</div>
          )}
          {score.pass && score.combined > 0 && (
            <div className="text-xs text-text-muted">
              Score: {(score.combined * 100).toFixed(0)}%
            </div>
          )}
          {filters
            .filter((f) => f.enabled)
            .map((f) => {
              const result = score.perFilter.get(f.id);
              const plugin = getFilterPlugin(f.typeId);
              if (!result?.detail) return null;
              return (
                <div key={f.id} className="text-xs text-text-muted">
                  {plugin?.displayName}: {result.detail}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
