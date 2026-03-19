import { useFilterStore } from "../../stores/filterStore.ts";
import { getFilterPlugin } from "../../filters/registry.ts";
import type { FilterInstance } from "../../types/filter.ts";

interface Props {
  filter: FilterInstance;
}

export function FilterCard({ filter }: Props) {
  const { removeFilter, updateConfig, toggleEnabled } = useFilterStore();
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
        <ConfigComponent
          config={filter.config as never}
          onChange={(config: unknown) => updateConfig(filter.id, config)}
        />
      )}
    </div>
  );
}
