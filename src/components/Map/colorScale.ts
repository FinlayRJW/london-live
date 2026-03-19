import { scaleSequential } from "d3-scale";
import { interpolateRdYlGn } from "d3-scale-chromatic";

const scale = scaleSequential(interpolateRdYlGn).domain([0, 1]);

export const GREYED_COLOR = "#d1d5db";
export const DEFAULT_COLOR = "#e5e7eb";

export function scoreToColor(score: number | undefined, pass: boolean): string {
  if (!pass) return GREYED_COLOR;
  if (score === undefined) return DEFAULT_COLOR;
  return scale(score) as string;
}

export function scoreLegendStops(steps = 10): { color: string; label: string }[] {
  const stops: { color: string; label: string }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stops.push({
      color: scale(t) as string,
      label: i === 0 ? "Worst" : i === steps ? "Best" : "",
    });
  }
  return stops;
}
