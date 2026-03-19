import { FilterPanel } from "./FilterPanel/FilterPanel.tsx";
import { FilterPanelContent } from "./FilterPanel/FilterPanelContent.tsx";
import { MapView } from "./Map/MapContainer.tsx";
import { BottomSheet } from "./BottomSheet.tsx";
import { useMapStore } from "../stores/mapStore.ts";
import { useFilterStore } from "../stores/filterStore.ts";
import { useBreakpoint } from "../hooks/useBreakpoint.ts";
import { ThemeToggle } from "./FilterPanel/ThemeToggle.tsx";

function FilterFAB() {
  const setOpen = useMapStore((s) => s.setBottomSheetOpen);
  const filterCount = useFilterStore((s) => s.filters.length);

  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-6 left-4 z-[1000] w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-transform"
      title="Open filters"
    >
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      {filterCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
          {filterCount}
        </span>
      )}
    </button>
  );
}

export function Layout() {
  const { isDesktop } = useBreakpoint();
  const sidebarCollapsed = useMapStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useMapStore((s) => s.toggleSidebar);
  const setBottomSheetOpen = useMapStore((s) => s.setBottomSheetOpen);

  if (!isDesktop) {
    return (
      <div className="flex h-full">
        <MapView />
        <FilterFAB />
        <BottomSheet>
          <FilterPanelContent
            headerAction={
              <>
                <ThemeToggle />
                <button
                  onClick={() => setBottomSheetOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover-bg text-text-muted shrink-0"
                  title="Close filters"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            }
          />
        </BottomSheet>
      </div>
    );
  }

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
