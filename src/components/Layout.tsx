import { FilterPanel } from "./FilterPanel/FilterPanel.tsx";
import { MapView } from "./Map/MapContainer.tsx";

export function Layout() {
  return (
    <div className="flex h-full">
      <FilterPanel />
      <MapView />
    </div>
  );
}
