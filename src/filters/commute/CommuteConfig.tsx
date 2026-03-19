import { useState, useCallback, useRef } from "react";
import type { TransportMode } from "../../types/transport.ts";

export interface CommuteConfigData {
  destinationAddress: string;
  destinationLat: number | null;
  destinationLng: number | null;
  maxTimeMinutes: number;
  maxChanges: number;
  allowedModes: TransportMode[];
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
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
  const [query, setQuery] = useState(config.destinationAddress);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const geocode = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          q: `${q}, London, UK`,
          format: "json",
          limit: "5",
          viewbox: "-0.52,51.28,0.34,51.7",
          bounded: "1",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "Accept-Language": "en" } },
        );
        if (res.ok) {
          const results: NominatimResult[] = await res.json();
          setSuggestions(results);
        }
      } catch {
        // Ignore geocoding errors
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const selectAddress = (result: NominatimResult) => {
    const shortName = result.display_name.split(",").slice(0, 3).join(",");
    setQuery(shortName);
    setSuggestions([]);
    onChange({
      ...config,
      destinationAddress: shortName,
      destinationLat: parseFloat(result.lat),
      destinationLng: parseFloat(result.lon),
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="block text-sm font-medium text-text mb-1">
          Destination
        </label>
        <input
          type="text"
          className="w-full border border-border rounded px-2 py-1.5 text-sm bg-card-bg"
          placeholder="Type an address..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            geocode(e.target.value);
          }}
        />
        {isSearching && (
          <div className="absolute right-2 top-8 text-xs text-text-muted">...</div>
        )}
        {config.destinationLat && (
          <div className="text-xs text-green-600 mt-0.5">
            Location set
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card-bg border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50 border-b border-border last:border-b-0"
                onClick={() => selectAddress(s)}
              >
                {s.display_name}
              </button>
            ))}
          </div>
        )}
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
