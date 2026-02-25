import { useEffect, useRef } from "react";
import shp from "shpjs";

const SOURCE_ID = "network-source";
const LAYER_ID = "network-layer";
const MESO_ZOOM = 16;

/**
 * Loads the sidewalk network from shapefile components served in public/
 * and renders it as a line layer visible at meso + micro zoom levels (>= 16).
 *
 * shpjs fetches .shp, .dbf, .prj, .cpg automatically from the base URL.
 */
export function useNetwork(mapRef) {
  const added = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const addLayer = async () => {
      if (added.current) return;

      const baseUrl = `${window.location.origin}/original/original_network`;
      const geojson = await shp(baseUrl);

      if (cancelled || !map || map._removed) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: geojson,
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
            16, 0.9,
            18, 0.9,
          ],
        },
      });

      added.current = true;
    };

    const init = () => {
      addLayer().catch((err) =>
        console.error("Failed to load network shapefile:", err)
      );
    };

    if (map.isStyleLoaded()) init();
    else map.once("load", init);

    return () => {
      cancelled = true;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* map may already be gone */
      }
      added.current = false;
    };
  }, [mapRef]);
}