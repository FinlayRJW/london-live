import { useMapStore } from "../../stores/mapStore.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { FilterPanelContent } from "./FilterPanelContent.tsx";

export function FilterPanel() {
  const toggleSidebar = useMapStore((s) => s.toggleSidebar);

  return (
    <div className="w-80 h-full bg-sidebar-bg border-r border-border flex flex-col overflow-hidden shrink-0">
      <FilterPanelContent
        headerAction={
          <>
            <ThemeToggle />
            <button
              onClick={toggleSidebar}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover-bg text-text-muted shrink-0"
              title="Collapse sidebar"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </>
        }
      />
    </div>
  );
}
