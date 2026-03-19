import { useScoreStore } from "../../stores/scoreStore.ts";
import { getFilterPlugin } from "../../filters/registry.ts";
import { useFilterStore } from "../../stores/filterStore.ts";
import { usePropertyStore } from "../../stores/propertyStore.ts";

interface Props {
  postcodeId: string | null;
}

export function PostcodeTooltip({ postcodeId }: Props) {
  const scores = useScoreStore((s) => s.scores);
  const filters = useFilterStore((s) => s.filters);

  if (!postcodeId) return null;

  const score = scores.get(postcodeId);

  // Check if this is an approximate (orange) sector: failed but parent district passed
  let approximate = false;
  let parentScore = null;
  if (score && !score.pass && postcodeId.includes(" ")) {
    const parentId = postcodeId.substring(0, postcodeId.lastIndexOf(" "));
    parentScore = scores.get(parentId);
    if (parentScore?.pass) {
      approximate = true;
    }
  }

  // Check if property filter is active and this postcode has no matching properties
  const propState = usePropertyStore.getState();
  const propertyFilterActive = filters.some(
    (f) => f.typeId === "property" && f.enabled,
  );
  let propertyGreyed = false;
  if (propertyFilterActive && postcodeId) {
    const district = postcodeId.split(" ")[0];
    const districtLoaded = propState.loadedDistricts.has(district);
    if (districtLoaded && !propState.postcodesWithProperties.has(postcodeId)) {
      // For approximate sectors, also check parent
      if (approximate) {
        const parentId = postcodeId.substring(0, postcodeId.lastIndexOf(" "));
        if (!propState.postcodesWithProperties.has(parentId)) {
          propertyGreyed = true;
        }
      } else {
        propertyGreyed = true;
      }
    }
  }

  return (
    <div className="bg-overlay-bg shadow-lg rounded-lg px-3 py-2 text-sm border border-border pointer-events-none">
      <div className="font-semibold text-text mb-1">{postcodeId}</div>
      {propertyGreyed && (
        <div className="text-red-600 text-xs">No matching properties</div>
      )}
      {score && !propertyGreyed && (
        <div className="space-y-0.5">
          {!score.pass && !approximate && (
            <div className="text-red-600 text-xs">Not reachable</div>
          )}
          {approximate && (
            <div className="text-orange-600 text-xs">Maybe reachable</div>
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
