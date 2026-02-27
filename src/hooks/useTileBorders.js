import { useEffect, useRef } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

const SOURCE_ID = "tile-borders-source";
const LAYER_ID  = "tile-borders-layer";

const FOCUS_SOURCE = "tile-focus-source";
const FOCUS_FRAME  = "tile-focus-frame";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

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

function buildFrameGeoJSON(tile) {
  if (!tile) return EMPTY_FC;

  const [w, s, e, n] = tileToLngLatBounds(tile.x, tile.y, tile.z);

  const padLng = (e - w) * 0.015;
  const padLat = (n - s) * 0.015;

  const outer = [
    [w - padLng, n + padLat],
    [e + padLng, n + padLat],
    [e + padLng, s - padLat],
    [w - padLng, s - padLat],
    [w - padLng, n + padLat],
  ];

  const inner = [
    [w, n],
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ];

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [outer, inner],
        },
        properties: {},
      },
    ],
  };
}

/**
 * Adds thin border lines around each visible tile on the map,
 * plus a red frame highlight for the focus tile at micro zoom.
 *
 * @param {React.RefObject} mapRef     – map instance ref
 * @param {Array}           tiles      – visible tiles
 * @param {Object|null}     focusTile  – dominant tile at micro zoom (or null)
 */
export function useTileBorders(mapRef, tiles, focusTile = null) {
  const addedRef    = useRef(false);
  const tilesRef    = useRef(tiles);
  const focusRef    = useRef(focusTile);
  tilesRef.current  = tiles;
  focusRef.current  = focusTile;

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
        minzoom: 14,
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.55,
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            14, 0.5,
            18, 1.0,
            20, 1.5,
          ],
        },
      });

      map.addSource(FOCUS_SOURCE, {
        type: "geojson",
        data: buildFrameGeoJSON(focusRef.current),
      });

      map.addLayer({
        id: FOCUS_FRAME,
        type: "fill",
        source: FOCUS_SOURCE,
        minzoom: 18,
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.7,
        },
      });

      addedRef.current = true;
    };

    if (map.isStyleLoaded()) init();
    else map.once("load", init);

    return () => {
      try {
        if (map.getLayer(FOCUS_FRAME))  map.removeLayer(FOCUS_FRAME);
        if (map.getSource(FOCUS_SOURCE)) map.removeSource(FOCUS_SOURCE);
        if (map.getLayer(LAYER_ID))     map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID))   map.removeSource(SOURCE_ID);
      } catch { /* map may be gone */ }
      addedRef.current = false;
    };
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !addedRef.current) return;
    const src = map.getSource(SOURCE_ID);
    if (src) src.setData(buildGeoJSON(tiles));
  }, [mapRef, tiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !addedRef.current) return;
    const src = map.getSource(FOCUS_SOURCE);
    if (src) src.setData(buildFrameGeoJSON(focusTile));
  }, [mapRef, focusTile]);
}