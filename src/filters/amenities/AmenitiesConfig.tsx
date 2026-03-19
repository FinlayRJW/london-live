import { useEffect } from "react";
import { useAmenityStore, type AmenityType } from "../../stores/amenityStore.ts";

export interface AmenityTypeConfig {
  enabled: boolean;
  travelMethod: "walk" | "cycle";
  maxTimeMinutes: number;
}

export interface AmenitiesConfigData {
  supermarket: AmenityTypeConfig;
  cinema: AmenityTypeConfig;
  gym: AmenityTypeConfig;
}

interface Props {
  config: AmenitiesConfigData;
  onChange: (config: AmenitiesConfigData) => void;
}

const AMENITY_ROWS: { type: AmenityType; label: string; defaultMax: number }[] = [
  { type: "supermarket", label: "Supermarket", defaultMax: 15 },
  { type: "cinema", label: "Cinema", defaultMax: 20 },
  { type: "gym", label: "Gym", defaultMax: 15 },
];

export function AmenitiesConfig({ config, onChange }: Props) {
  const { data, isLoading, load } = useAmenityStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      {isLoading && !data && (
        <div className="text-xs text-text-muted">Loading amenity data...</div>
      )}

      {AMENITY_ROWS.map(({ type, label }) => {
        const typeConfig = config[type];
        const count = data?.[type]?.length;

        return (
          <div key={type} className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={typeConfig.enabled}
                onChange={() =>
                  onChange({
                    ...config,
                    [type]: { ...typeConfig, enabled: !typeConfig.enabled },
                  })
                }
              />
              <span className="font-medium text-text">{label}</span>
              {count !== undefined && (
                <span className="text-xs text-text-muted">({count} locations)</span>
              )}
            </label>

            {typeConfig.enabled && (
              <div className="ml-6 space-y-1.5">
                <div className="flex gap-1">
                  {(["walk", "cycle"] as const).map((method) => (
                    <button
                      key={method}
                      className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                        typeConfig.travelMethod === method
                          ? "bg-primary text-white border-primary"
                          : "bg-card-bg text-text border-border hover:bg-gray-50"
                      }`}
                      onClick={() =>
                        onChange({
                          ...config,
                          [type]: { ...typeConfig, travelMethod: method },
                        })
                      }
                    >
                      {method === "walk" ? "Walk" : "Cycle"}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-0.5">
                    Max time: {typeConfig.maxTimeMinutes} min
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={typeConfig.travelMethod === "cycle" ? 30 : 30}
                    step={5}
                    value={typeConfig.maxTimeMinutes}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        [type]: {
                          ...typeConfig,
                          maxTimeMinutes: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
