import { useFilterStore } from "../../stores/filterStore.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { FilterCard } from "./FilterCard.tsx";
import { AddFilterButton } from "./AddFilterButton.tsx";
import { PropertyPanel } from "./PropertyPanel.tsx";

export function FilterPanel() {
  const filters = useFilterStore((s) => s.filters);
  const isComputing = useScoreStore((s) => s.isComputing);

  return (
    <div className="w-80 h-full bg-sidebar-bg border-r border-border flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-text">London Living Finder</h1>
        <p className="text-xs text-text-muted mt-1">
          Add filters to find your ideal area
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <PropertyPanel />

        {filters.length === 0 && (
          <div className="text-sm text-text-muted text-center py-8">
            No filters active.
            <br />
            Add a filter to get started.
          </div>
        )}

        {filters.map((filter) => (
          <FilterCard key={filter.id} filter={filter} />
        ))}
      </div>

      <div className="p-4 border-t border-border">
        {isComputing && (
          <div className="text-xs text-text-muted mb-2 text-center">
            Computing scores...
          </div>
        )}
        <AddFilterButton />
      </div>
    </div>
  );
}
