import { GeoJSON, useMap } from "react-leaflet";
import { useCallback, useRef, useEffect } from "react";
import L from "leaflet";
import type { PostcodeCollection } from "../../types/geo.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { GREYED_COLOR } from "./colorScale.ts";
import { PostcodeTooltip } from "./PostcodeTooltip.tsx";
import { createRoot } from "react-dom/client";

const REACHABLE_COLOR = "#4ade80"; // green-400
const BORDER_COLOR = "#555";

interface Props {
  data: PostcodeCollection;
}

export function DistrictLayer({ data }: Props) {
  const map = useMap();
  const scores = useScoreStore((s) => s.scores);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const tooltipRef = useRef<L.Tooltip | null>(null);

  const hasScores = scores.size > 0;

  const getStyle = useCallback(
    (postcodeId: string): L.PathOptions => {
      if (!hasScores) {
        return {
          fillColor: "transparent",
          fillOpacity: 0,
          color: BORDER_COLOR,
          weight: 1.5,
          opacity: 0.7,
        };
      }

      const score = scores.get(postcodeId);
      const pass = score?.pass ?? false;

      return {
        fillColor: pass ? REACHABLE_COLOR : GREYED_COLOR,
        fillOpacity: pass ? 0.45 : 0.5,
        color: BORDER_COLOR,
        weight: 1,
        opacity: 0.7,
      };
    },
    [scores, hasScores],
  );

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const id = (feature.properties as { id: string }).id;
      const pathLayer = layer as L.Path;

      pathLayer.on({
        mouseover: (e: L.LeafletMouseEvent) => {
          const target = e.target as L.Path;
          // Only change border on hover, keep the fill intact
          const current = getStyle(id);
          target.setStyle({ ...current, weight: 3, color: "#333" });
          target.bringToFront();

          const container = document.createElement("div");
          const root = createRoot(container);
          root.render(<PostcodeTooltip postcodeId={id} />);
          const tooltip = L.tooltip({
            permanent: false,
            sticky: true,
            className: "!p-0 !bg-transparent !border-0 !shadow-none",
          })
            .setContent(container)
            .setLatLng(e.latlng);
          tooltip.addTo(map);
          tooltipRef.current = tooltip;
        },
        mouseout: () => {
          pathLayer.setStyle(getStyle(id));
          if (tooltipRef.current) {
            map.removeLayer(tooltipRef.current);
            tooltipRef.current = null;
          }
        },
        mousemove: (e: L.LeafletMouseEvent) => {
          tooltipRef.current?.setLatLng(e.latlng);
        },
      });
    },
    [getStyle, map],
  );

  // Update styles when scores change
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        const feature = (layer as L.GeoJSON & { feature: GeoJSON.Feature }).feature;
        if (feature) {
          const id = (feature.properties as { id: string }).id;
          (layer as L.Path).setStyle(getStyle(id));
        }
      });
    }
  }, [scores, getStyle]);

  return (
    <GeoJSON
      ref={(ref) => {
        geoJsonRef.current = ref;
      }}
      key={`districts-${data.features.length}`}
      data={data}
      style={(feature) => {
        const id = (feature?.properties as { id: string })?.id ?? "";
        return getStyle(id);
      }}
      onEachFeature={onEachFeature}
    />
  );
}
