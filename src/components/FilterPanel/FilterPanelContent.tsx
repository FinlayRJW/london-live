import type { ReactNode } from "react";
import { useFilterStore } from "../../stores/filterStore.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { FilterCard } from "./FilterCard.tsx";
import { AddFilterButton } from "./AddFilterButton.tsx";

interface FilterPanelContentProps {
  headerAction: ReactNode;
}

export function FilterPanelContent({ headerAction }: FilterPanelContentProps) {
  const filters = useFilterStore((s) => s.filters);
  const isComputing = useScoreStore((s) => s.isComputing);

  return (
    <>
      <div className="p-4 border-b border-border flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-text">London Living Finder</h1>
          <p className="text-xs text-text-muted mt-1">
            Add filters to find your ideal area
          </p>
        </div>
        {headerAction}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
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
        <div className="h-4 mb-1">
          {isComputing && (
            <div className="text-xs text-text-muted text-center animate-pulse">
              Computing scores...
            </div>
          )}
        </div>
        <AddFilterButton />
      </div>
    </>
  );
}
