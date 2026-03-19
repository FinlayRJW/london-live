// Travel speeds in m/s
export const WALKING_SPEED = 5000 / 3600; // 5 km/h
export const CYCLING_SPEED = 15000 / 3600; // 15 km/h

// Walking distance multiplier (roads aren't straight lines)
export const WALKING_DETOUR = 1.3;

// Average speed by mode in km/h (used for distance-based segment times)
// These are conservative averages including acceleration/deceleration
export const LINE_SPEED_KMH: Record<string, number> = {
  tube: 33,        // average tube speed including stops
  overground: 40,  // slightly faster, fewer stops
  dlr: 30,         // similar to tube
  elizabeth_line: 45, // faster, longer gaps
};

// Dwell time at each station in seconds (doors open/close)
export const STATION_DWELL = 30;

// Track detour factor (tracks aren't straight lines between stations)
export const TRACK_DETOUR = 1.35;

// Average wait time when first boarding a train (half headway)
export const BOARDING_WAIT = 120; // 2 minutes

// Penalty for changing lines at a same-node interchange (seconds).
// This is just the wait for the next train - any physical walking
// between stations is already in the interchange edge weights.
export const INTERCHANGE_PENALTY = 120; // 2 minutes

// Maximum walking distance to a station (meters)
export const MAX_WALK_TO_STATION = 2000;

// Maximum cycling distance to a station (meters)
export const MAX_CYCLE_TO_STATION = 5000;
