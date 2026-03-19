import { useTransportStore } from "../../stores/transportStore.ts";
import type { TransportMode } from "../../types/transport.ts";

export interface CommuteConfigData {
  destinationStationId: string | null;
  maxTimeMinutes: number;
  maxChanges: number;
  allowedModes: TransportMode[];
}

const ALL_RAIL_MODES: { id: TransportMode; label: string }[] = [
  { id: "tube", label: "Tube" },
  { id: "overground", label: "Overground" },
  { id: "dlr", label: "DLR" },
  { id: "elizabeth_line", label: "Elizabeth Line" },
];

interface Props {
  config: CommuteConfigData;
  onChange: (config: CommuteConfigData) => void;
}

export function CommuteConfig({ config, onChange }: Props) {
  const stations = useTransportStore((s) => s.stations);

  const sortedStations = [...stations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Destination Station
        </label>
        <select
          className="w-full border border-border rounded px-2 py-1.5 text-sm bg-card-bg"
          value={config.destinationStationId ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              destinationStationId: e.target.value || null,
            })
          }
        >
          <option value="">Select a station...</option>
          {sortedStations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Max commute time: {config.maxTimeMinutes} min
        </label>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={config.maxTimeMinutes}
          onChange={(e) =>
            onChange({ ...config, maxTimeMinutes: Number(e.target.value) })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Max changes: {config.maxChanges === 5 ? "Unlimited" : config.maxChanges}
        </label>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={config.maxChanges}
          onChange={(e) =>
            onChange({ ...config, maxChanges: Number(e.target.value) })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Transport modes
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_RAIL_MODES.map((mode) => {
            const checked = config.allowedModes.includes(mode.id);
            return (
              <label
                key={mode.id}
                className="flex items-center gap-1 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? config.allowedModes.filter((m) => m !== mode.id)
                      : [...config.allowedModes, mode.id];
                    onChange({ ...config, allowedModes: next });
                  }}
                />
                {mode.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
