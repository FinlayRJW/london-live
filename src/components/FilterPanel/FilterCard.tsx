import { useState } from "react";
import { useFilterStore } from "../../stores/filterStore.ts";
import { getFilterPlugin } from "../../filters/registry.ts";
import type { FilterInstance } from "../../types/filter.ts";

function getFilterSummary(filter: FilterInstance): string | null {
  const config = filter.config as Record<string, unknown>;
  if (filter.typeId === "commute") {
    const addr = config.destinationAddress as string;
    if (!addr) return null;
    const method = config.travelMethod as string;
    const time = config.maxTimeMinutes as number;
    const label = method === "public_transport" ? "transit" : method;
    return `${addr} · ${time} min ${label}`;
  }
  return null;
}

interface Props {
  filter: FilterInstance;
}

export function FilterCard({ filter }: Props) {
  const { removeFilter, updateConfig } = useFilterStore();
  const plugin = getFilterPlugin(filter.typeId);
  const summary = getFilterSummary(filter);
  const [collapsed, setCollapsed] = useState(!!summary);

  if (!plugin) return null;

  const ConfigComponent = plugin.ConfigComponent;

  return (
    <div
      className={`border border-border rounded-lg bg-card-bg p-3 ${
        !filter.enabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          <svg
            className={`w-3 h-3 text-text-muted shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}
            viewBox="0 0 6 10"
            fill="currentColor"
          >
            <path d="M0 0 L6 5 L0 10 Z" />
          </svg>
          <span className="font-medium text-sm text-text truncate">
            {plugin.displayName}
          </span>
        </div>
        <button
          onClick={() => removeFilter(filter.id)}
          className="text-text-muted hover:text-red-500 text-sm px-1 shrink-0"
          title="Remove filter"
        >
          &times;
        </button>
      </div>

      {collapsed && summary && (
        <div
          className="text-xs text-text-muted mt-1 truncate cursor-pointer"
          onClick={() => setCollapsed(false)}
        >
          {summary}
        </div>
      )}

      {!collapsed && filter.enabled && (
        <div className="mt-2">
          <ConfigComponent
            config={filter.config as never}
            onChange={(config: unknown) => updateConfig(filter.id, config)}
          />
        </div>
      )}
    </div>
  );
}
