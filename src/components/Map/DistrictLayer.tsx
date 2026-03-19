import { GeoJSON, useMap } from "react-leaflet";
import { useCallback, useRef, useEffect } from "react";
import L from "leaflet";
import type { PostcodeCollection } from "../../types/geo.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { useRouteStore } from "../../stores/routeStore.ts";
import { usePropertyStore } from "../../stores/propertyStore.ts";
import { GREYED_COLOR } from "./colorScale.ts";
import { PostcodeTooltip } from "./PostcodeTooltip.tsx";
import { createRoot } from "react-dom/client";

const REACHABLE_COLOR = "#4ade80";
const BORDER_COLOR = "#555";

function getStyleForPostcode(postcodeId: string): L.PathOptions {
  const scores = useScoreStore.getState().scores;
  if (scores.size === 0) {
    return {
      fillColor: "transparent",
      fillOpacity: 0,
      color: BORDER_COLOR,
      weight: 1.5,
      opacity: 0.7,
    };
  }

  const score = scores.get(postcodeId);
  let pass = score?.pass ?? false;

  // If properties layer is active, also require matching properties
  const propState = usePropertyStore.getState();
  if (pass && propState.filters.enabled && propState.postcodesWithProperties.size > 0) {
    if (!propState.postcodesWithProperties.has(postcodeId)) {
      pass = false;
    }
  }

  return {
    fillColor: pass ? REACHABLE_COLOR : GREYED_COLOR,
    fillOpacity: pass ? 0.25 : 0.5,
    color: BORDER_COLOR,
    weight: 1,
    opacity: 0.7,
  };
}

interface Props {
  data: PostcodeCollection;
}

export function DistrictLayer({ data }: Props) {
  const map = useMap();
  const scores = useScoreStore((s) => s.scores);
  const postcodesWithProperties = usePropertyStore(
    (s) => s.postcodesWithProperties,
  );
  const propertyEnabled = usePropertyStore((s) => s.filters.enabled);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const tooltipRef = useRef<L.Tooltip | null>(null);

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const id = (feature.properties as { id: string }).id;
      const pathLayer = layer as L.Path;

      pathLayer.on({
        mouseover: (e: L.LeafletMouseEvent) => {
          const target = e.target as L.Path;
          const current = getStyleForPostcode(id);
          target.setStyle({ ...current, weight: 3, color: "#333" });
          target.bringToFront();
          useRouteStore.getState().setHoveredPostcode(id);

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
          pathLayer.setStyle(getStyleForPostcode(id));
          if (tooltipRef.current) {
            map.removeLayer(tooltipRef.current);
            tooltipRef.current = null;
          }
          useRouteStore.getState().setHoveredPostcode(null);
        },
        mousemove: (e: L.LeafletMouseEvent) => {
          tooltipRef.current?.setLatLng(e.latlng);
        },
      });
    },
    [map],
  );

  // Update styles when scores or property filter changes
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        const feature = (layer as L.GeoJSON & { feature: GeoJSON.Feature }).feature;
        if (feature) {
          const id = (feature.properties as { id: string }).id;
          (layer as L.Path).setStyle(getStyleForPostcode(id));
        }
      });
    }
  }, [scores, postcodesWithProperties, propertyEnabled]);

  return (
    <GeoJSON
      ref={(ref) => {
        geoJsonRef.current = ref;
      }}
      key={`districts-${data.features.length}`}
      data={data}
      style={(feature) => {
        const id = (feature?.properties as { id: string })?.id ?? "";
        return getStyleForPostcode(id);
      }}
      onEachFeature={onEachFeature}
    />
  );
}
