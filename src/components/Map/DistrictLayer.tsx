import { GeoJSON, useMap } from "react-leaflet";
import { useCallback, useRef, useEffect } from "react";
import L from "leaflet";
import type { PostcodeCollection } from "../../types/geo.ts";
import { useScoreStore } from "../../stores/scoreStore.ts";
import { useRouteStore } from "../../stores/routeStore.ts";
import { usePropertyStore } from "../../stores/propertyStore.ts";
import { useFilterStore } from "../../stores/filterStore.ts";
import { GREYED_COLOR } from "./colorScale.ts";
import { PostcodeTooltip } from "./PostcodeTooltip.tsx";
import { createRoot } from "react-dom/client";

const REACHABLE_COLOR = "#4ade80";
const APPROXIMATE_COLOR = "#fb923c"; // orange — sector inherits from parent district
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
  if (!score) {
    // Postcode not in current scores (e.g., during level transition) — neutral
    return {
      fillColor: "transparent",
      fillOpacity: 0,
      color: BORDER_COLOR,
      weight: 1.5,
      opacity: 0.7,
    };
  }

  let pass = score.pass;
  let approximate = false;

  // If this sector failed, check if its parent district passed
  if (!pass && postcodeId.includes(" ")) {
    const parentId = postcodeId.substring(0, postcodeId.lastIndexOf(" "));
    const parentScore = scores.get(parentId);
    if (parentScore?.pass) {
      pass = true;
      approximate = true;
    }
  }

  // If properties layer is active and data has been loaded, require matching properties
  const propState = usePropertyStore.getState();
  const propertyFilterActive = useFilterStore.getState().filters.some(
    (f) => f.typeId === "property" && f.enabled,
  );
  if (pass && propertyFilterActive && propState.loadedDistricts.size > 0) {
    if (!propState.postcodesWithProperties.has(postcodeId)) {
      pass = false;
      approximate = false;
    }
  }

  return {
    fillColor: pass ? (approximate ? APPROXIMATE_COLOR : REACHABLE_COLOR) : GREYED_COLOR,
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
  const propertyEnabled = useFilterStore(
    (s) => s.filters.some((f) => f.typeId === "property" && f.enabled),
  );
  const propertyDataLoaded = usePropertyStore((s) => s.loadedDistricts.size > 0);
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
  }, [scores, postcodesWithProperties, propertyEnabled, propertyDataLoaded]);

  return (
    <GeoJSON
      ref={(ref) => {
        geoJsonRef.current = ref;
      }}
      key="boundary-layer"
      data={data}
      style={(feature) => {
        const id = (feature?.properties as { id: string })?.id ?? "";
        return getStyleForPostcode(id);
      }}
      onEachFeature={onEachFeature}
    />
  );
}
