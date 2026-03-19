import { usePropertyStore, getFilteredProperties } from "../../stores/propertyStore.ts";
import { useMemo } from "react";
import type { PropertyType, Tenure } from "../../types/property.ts";
import { PROPERTY_TYPE_LABELS } from "../../types/property.ts";

const ALL_TYPES: PropertyType[] = ["F", "T", "S", "D"];
const DATE_RANGES: { value: 6 | 12 | 24; label: string }[] = [
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 24, label: "2 years" },
];
const TENURE_OPTIONS: { value: Tenure | "both"; label: string }[] = [
  { value: "both", label: "Any" },
  { value: "F", label: "Freehold" },
  { value: "L", label: "Leasehold" },
];

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `\u00a3${(price / 1_000_000).toFixed(1)}m`;
  if (price >= 1_000) return `\u00a3${Math.round(price / 1_000)}k`;
  return `\u00a3${price}`;
}

export function PropertyPanel() {
  const filters = usePropertyStore((s) => s.filters);
  const data = usePropertyStore((s) => s.data);
  const isLoading = usePropertyStore((s) => s.isLoading);
  const setEnabled = usePropertyStore((s) => s.setEnabled);
  const setMinPrice = usePropertyStore((s) => s.setMinPrice);
  const setMaxPrice = usePropertyStore((s) => s.setMaxPrice);
  const setTypes = usePropertyStore((s) => s.setTypes);
  const setTenure = usePropertyStore((s) => s.setTenure);
  const setDateRange = usePropertyStore((s) => s.setDateRange);

  const count = useMemo(() => {
    if (!data || !filters.enabled) return 0;
    return getFilteredProperties(data, filters).length;
  }, [data, filters]);

  return (
    <div className="border border-border rounded-lg bg-card-bg">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-text">Sold Properties</span>
          </label>
        </div>
        {filters.enabled && data && (
          <span className="text-xs text-text-muted">
            {count.toLocaleString()} shown
          </span>
        )}
      </div>

      {filters.enabled && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {isLoading && !data && (
            <div className="text-xs text-text-muted text-center py-2">
              Loading property data...
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Price: {formatPrice(filters.minPrice)} &ndash; {formatPrice(filters.maxPrice)}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="range"
                min={0}
                max={2_000_000}
                step={25_000}
                value={filters.minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="range"
                min={0}
                max={2_000_000}
                step={25_000}
                value={filters.maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Property type
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_TYPES.map((type) => {
                const checked = filters.types.includes(type);
                return (
                  <label
                    key={type}
                    className="flex items-center gap-1 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? filters.types.filter((t) => t !== type)
                          : [...filters.types, type];
                        setTypes(next);
                      }}
                    />
                    {PROPERTY_TYPE_LABELS[type]}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Period
            </label>
            <div className="flex gap-1">
              {DATE_RANGES.map((opt) => (
                <button
                  key={opt.value}
                  className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                    filters.dateRange === opt.value
                      ? "bg-primary text-white border-primary"
                      : "bg-card-bg text-text border-border hover:bg-gray-50"
                  }`}
                  onClick={() => setDateRange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Tenure
            </label>
            <div className="flex gap-1">
              {TENURE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                    filters.tenure === opt.value
                      ? "bg-primary text-white border-primary"
                      : "bg-card-bg text-text border-border hover:bg-gray-50"
                  }`}
                  onClick={() => setTenure(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
