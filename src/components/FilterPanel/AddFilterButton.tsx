import { useState } from "react";
import { getAllFilterPlugins } from "../../filters/registry.ts";
import { useFilterStore } from "../../stores/filterStore.ts";

export function AddFilterButton() {
  const [isOpen, setIsOpen] = useState(false);
  const addFilter = useFilterStore((s) => s.addFilter);
  const plugins = getAllFilterPlugins();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-primary text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
      >
        + Add Filter
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-card-bg border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {plugins.map((plugin) => (
            <button
              key={plugin.typeId}
              onClick={() => {
                addFilter(plugin.typeId, plugin.defaultConfig());
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-hover-bg border-b border-border last:border-b-0"
            >
              <div className="font-medium text-text">{plugin.displayName}</div>
              <div className="text-xs text-text-muted">{plugin.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
