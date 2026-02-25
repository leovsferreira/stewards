import { useEffect, useRef } from "react";

const SOURCE_ID = "network-source";
const LAYER_ID = "network-layer";
const MESO_ZOOM = 16;

/**
 * Adds the sidewalk network as a MapLibre line layer visible at meso + micro.
 * Accepts the already-parsed GeoJSON from useNetworkData().
 */
export function useNetwork(mapRef, networkData) {
  const added = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !networkData) return;

    const addLayer = () => {
      if (added.current) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: networkData,
      });

      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        minzoom: MESO_ZOOM,
        paint: {
          "line-color": "#e85d04",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16, 1,
            18, 2,
            20, 3,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16, 1,
            18, 1,
          ],
        },
      });

      added.current = true;
    };

    if (map.isStyleLoaded()) addLayer();
    else map.once("load", addLayer);

    return () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* map may already be gone */
      }
      added.current = false;
    };
  }, [mapRef, networkData]);
}