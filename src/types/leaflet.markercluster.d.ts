import "leaflet";

declare module "leaflet" {
  class MarkerClusterGroup extends FeatureGroup {
    constructor(options?: MarkerClusterGroupOptions);
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    clearLayers(): this;
    addLayers(layers: Layer[]): this;
    removeLayers(layers: Layer[]): this;
    getVisibleParent(marker: Marker): Marker;
  }

  interface MarkerClusterGroupOptions extends LayerOptions {
    maxClusterRadius?: number;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    spiderfyOnMaxZoom?: boolean;
    removeOutsideVisibleBounds?: boolean;
    animate?: boolean;
    animateAddingMarkers?: boolean;
    disableClusteringAtZoom?: number;
    chunkedLoading?: boolean;
    chunkInterval?: number;
    chunkDelay?: number;
    iconCreateFunction?: (cluster: MarkerCluster) => Icon | DivIcon;
  }

  interface MarkerCluster extends Marker {
    getChildCount(): number;
    getAllChildMarkers(): Marker[];
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
