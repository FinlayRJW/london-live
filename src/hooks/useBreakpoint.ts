import { useSyncExternalStore } from "react";

interface Breakpoint {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const mobileQuery = window.matchMedia("(max-width: 767px)");
const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1024px)");

function getSnapshot(): Breakpoint {
  return {
    isMobile: mobileQuery.matches,
    isTablet: tabletQuery.matches,
    isDesktop: !mobileQuery.matches && !tabletQuery.matches,
  };
}

let cached = getSnapshot();

function subscribe(callback: () => void): () => void {
  const onChange = () => {
    cached = getSnapshot();
    callback();
  };
  mobileQuery.addEventListener("change", onChange);
  tabletQuery.addEventListener("change", onChange);
  return () => {
    mobileQuery.removeEventListener("change", onChange);
    tabletQuery.removeEventListener("change", onChange);
  };
}

function getCachedSnapshot(): Breakpoint {
  return cached;
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getCachedSnapshot);
}
