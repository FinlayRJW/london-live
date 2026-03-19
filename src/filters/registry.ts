import type { FilterPlugin } from "../types/filter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plugins = new Map<string, FilterPlugin<any>>();

export function registerFilter<TConfig>(plugin: FilterPlugin<TConfig>): void {
  plugins.set(plugin.typeId, plugin);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFilterPlugin(typeId: string): FilterPlugin<any> | undefined {
  return plugins.get(typeId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllFilterPlugins(): FilterPlugin<any>[] {
  return Array.from(plugins.values());
}
