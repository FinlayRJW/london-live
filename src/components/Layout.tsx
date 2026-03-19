import { FilterPanel } from "./FilterPanel/FilterPanel.tsx";
import { MapView } from "./Map/MapContainer.tsx";
import { useMapStore } from "../stores/mapStore.ts";
import { ThemeToggle } from "./FilterPanel/ThemeToggle.tsx";

export function Layout() {
  const sidebarCollapsed = useMapStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useMapStore((s) => s.toggleSidebar);

  return (
    <div className="flex h-full">
      {sidebarCollapsed ? (
        <div className="w-12 h-full bg-sidebar-bg border-r border-border flex flex-col items-center py-3 gap-2 shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover-bg text-text-muted"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      ) : (
        <FilterPanel />
      )}
      <MapView />
    </div>
  );
}
