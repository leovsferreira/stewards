import { useEffect, useRef } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

const SOURCE_ID = "tile-borders-source";
const LAYER_ID  = "tile-borders-layer";

function buildGeoJSON(tiles) {
  return {
    type: "FeatureCollection",
    features: (tiles || []).map((t) => {
      const [w, s, e, n] = tileToLngLatBounds(t.x, t.y, t.z);
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]],
        },
        properties: {},
      };
    }),
  };
}

/**
 * Adds thin border lines around each visible tile on the map.
 *
 * • Source + layer are created once on mount and cleaned up on unmount.
 * • When `tiles` changes the GeoJSON data is hot-swapped via setData —
 *   no layer teardown needed.
 */
export function useTileBorders(mapRef, tiles) {
  const addedRef  = useRef(false);
  const tilesRef  = useRef(tiles);
  tilesRef.current = tiles;

  // ── Mount: create source + layer once ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const init = () => {
      if (addedRef.current) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: buildGeoJSON(tilesRef.current),
      });

      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        minzoom: 14,           // only show at meso / micro
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.55,
          "line-width": [      // thinner at far zoom, stays 1px up close
            "interpolate", ["linear"], ["zoom"],
            14, 0.5,
            18, 1.0,
            20, 1.5,
          ],
        },
      });

      addedRef.current = true;
    };

    if (map.isStyleLoaded()) init();
    else map.once("load", init);

    return () => {
      try {
        if (map.getLayer(LAYER_ID))  map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* map may be gone */ }
      addedRef.current = false;
    };
  }, [mapRef]);

  // ── Update: hot-swap GeoJSON when tiles list changes ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !addedRef.current) return;
    const src = map.getSource(SOURCE_ID);
    if (src) src.setData(buildGeoJSON(tiles));
  }, [mapRef, tiles]);
}