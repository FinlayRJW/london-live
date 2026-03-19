import type { PropertyType, Tenure } from "../../types/property.ts";
import { PROPERTY_TYPE_LABELS } from "../../types/property.ts";
import { DualRangeSlider } from "../../components/FilterPanel/DualRangeSlider.tsx";

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

export interface PropertyConfigData {
  minPrice: number;
  maxPrice: number;
  minFloorArea: number;
  maxFloorArea: number;
  hideNoFloorArea: boolean;
  types: PropertyType[];
  tenure: Tenure | "both";
  dateRange: 6 | 12 | 24;
}

interface Props {
  config: PropertyConfigData;
  onChange: (config: PropertyConfigData) => void;
}

export function PropertyConfig({ config, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-text mb-1">
          Price: {formatPrice(config.minPrice)} &ndash; {formatPrice(config.maxPrice)}
        </label>
        <DualRangeSlider
          min={0}
          max={2_000_000}
          step={25_000}
          valueLow={config.minPrice}
          valueHigh={config.maxPrice}
          onChangeLow={(v) => onChange({ ...config, minPrice: v })}
          onChangeHigh={(v) => onChange({ ...config, maxPrice: v })}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text mb-1">
          Floor area: {config.minFloorArea} &ndash; {config.maxFloorArea} m&sup2;
        </label>
        <DualRangeSlider
          min={0}
          max={300}
          step={5}
          valueLow={config.minFloorArea}
          valueHigh={config.maxFloorArea}
          onChangeLow={(v) => onChange({ ...config, minFloorArea: v })}
          onChangeHigh={(v) => onChange({ ...config, maxFloorArea: v })}
        />
        <label className="flex items-center gap-1.5 mt-1 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={config.hideNoFloorArea}
            onChange={(e) => onChange({ ...config, hideNoFloorArea: e.target.checked })}
          />
          Hide properties with no floor area
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium text-text mb-1">
          Property type
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((type) => {
            const checked = config.types.includes(type);
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
                      ? config.types.filter((t) => t !== type)
                      : [...config.types, type];
                    onChange({ ...config, types: next });
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
                config.dateRange === opt.value
                  ? "bg-primary text-white border-primary"
                  : "bg-card-bg text-text border-border hover:bg-gray-50"
              }`}
              onClick={() => onChange({ ...config, dateRange: opt.value })}
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
                config.tenure === opt.value
                  ? "bg-primary text-white border-primary"
                  : "bg-card-bg text-text border-border hover:bg-gray-50"
              }`}
              onClick={() => onChange({ ...config, tenure: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
