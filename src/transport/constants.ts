// Travel speeds in m/s
export const WALKING_SPEED = 5000 / 3600; // 5 km/h
export const CYCLING_SPEED = 15000 / 3600; // 15 km/h

// Walking distance multiplier (roads aren't straight lines)
export const WALKING_DETOUR = 1.3;

// Average time between stations in seconds, by mode
export const INTER_STATION_TIME: Record<string, number> = {
  tube: 120,
  overground: 150,
  dlr: 120,
  elizabeth_line: 150,
};

// Penalty for changing lines at an interchange (seconds)
export const INTERCHANGE_PENALTY = 300; // 5 minutes

// Maximum walking distance to a station (meters)
export const MAX_WALK_TO_STATION = 2000;

// Maximum cycling distance to a station (meters)
export const MAX_CYCLE_TO_STATION = 5000;
