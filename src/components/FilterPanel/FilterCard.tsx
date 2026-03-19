import { useFilterStore } from "../../stores/filterStore.ts";
import { getFilterPlugin } from "../../filters/registry.ts";
import type { FilterInstance } from "../../types/filter.ts";

interface Props {
  filter: FilterInstance;
}

export function FilterCard({ filter }: Props) {
  const { removeFilter, updateConfig, toggleEnabled, setWeight } =
    useFilterStore();
  const plugin = getFilterPlugin(filter.typeId);

  if (!plugin) return null;

  const ConfigComponent = plugin.ConfigComponent;

  return (
    <div
      className={`border border-border rounded-lg bg-card-bg p-3 ${
        !filter.enabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filter.enabled}
            onChange={() => toggleEnabled(filter.id)}
            className="cursor-pointer"
          />
          <span className="font-medium text-sm text-text">
            {plugin.displayName}
          </span>
        </div>
        <button
          onClick={() => removeFilter(filter.id)}
          className="text-text-muted hover:text-red-500 text-sm px-1"
          title="Remove filter"
        >
          &times;
        </button>
      </div>

      {filter.enabled && (
        <>
          <ConfigComponent
            config={filter.config as never}
            onChange={(config: unknown) => updateConfig(filter.id, config)}
          />
          <div className="mt-3 pt-2 border-t border-border">
            <label className="block text-xs text-text-muted mb-0.5">
              Weight: {filter.weight.toFixed(1)}
            </label>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={filter.weight}
              onChange={(e) => setWeight(filter.id, Number(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}
