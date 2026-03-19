import { useState } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint.ts";
import { Legend } from "./Legend.tsx";
import { RouteLegend } from "./RouteLegend.tsx";
import { PropertyLegend } from "./PropertyLegend.tsx";
import { AmenityLegend } from "./AmenityLegend.tsx";

export function LegendStack() {
  const { isDesktop } = useBreakpoint();
  const [expanded, setExpanded] = useState(false);

  if (isDesktop) {
    return (
      <div className="absolute bottom-6 right-3 z-[1000] flex flex-col items-end gap-2">
        <RouteLegend />
        <AmenityLegend />
        <PropertyLegend />
        <Legend />
      </div>
    );
  }

  return (
    <div className="absolute top-16 right-3 z-[1000] flex flex-col items-end gap-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-10 h-10 rounded-lg bg-overlay-bg/95 shadow-md flex items-center justify-center text-text-muted"
        title={expanded ? "Hide legends" : "Show legends"}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {expanded ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </>
          )}
        </svg>
      </button>
      {expanded && (
        <>
          <RouteLegend />
          <AmenityLegend />
          <PropertyLegend />
          <Legend />
        </>
      )}
    </div>
  );
}
