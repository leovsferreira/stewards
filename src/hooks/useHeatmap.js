import { useEffect, useRef } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

const HEATMAP_SOURCE = "heatmap-source";
const HEATMAP_LAYER = "heatmap-layer";

/**
 * Get the center lon/lat of a 2x2 tile.
 *
 * tile_id values (e.g. "79299_96990") are z18 XY coordinates.
 * Each groups 4 z19 children.  We just need the center of that z18 cell.
 */
function tileIdToCenter(tileId) {
  const [xStr, yStr] = tileId.split("_");
  const x = Number(xStr);
  const y = Number(yStr);
  const [w, s, e, n] = tileToLngLatBounds(x, y, 18);
  return [(w + e) / 2, (s + n) / 2];
}

/**
 * Build a GeoJSON FeatureCollection of Points, one per 2x2 tile,
 * with a normalised `weight` property (0–1) for the selected attribute.
 */
function buildGeoJSON(meta2x2, sortKey) {
  if (!meta2x2 || meta2x2.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const rawValues = meta2x2.map((r) => Number(r[sortKey] ?? 0));
  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  const range = max - min || 1;

  const features = meta2x2.map((r, i) => {
    const norm = (rawValues[i] - min) / range;
    const [lng, lat] = tileIdToCenter(r.tile_id);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        weight: norm,
        raw: rawValues[i],
      },
    };
  });

  return { type: "FeatureCollection", features };
}

/**
 * Hook: renders a MapLibre native heatmap layer driven by 2x2 tile values.
 *
 * Key design choices:
 * ───────────────────
 * • heatmap-weight  = normalised attribute value → shows values, not density.
 * • heatmap-radius  = exponential zoom stops tracking the geographic size of
 *   a 2×2 tile in pixels (~256·2^(z−17)), so each point's blob covers
 *   roughly one tile at every zoom level.
 * • heatmap-intensity = reduced at low zoom to counteract additive overlap of
 *   many on-screen points, keeping the visual impression consistent.
 * • Inserted below "myOrthoLayer" so orthophoto renders on top at z≥16.
 */
export function useHeatmap(mapRef, meta2x2, sortKey) {
  const layerAdded = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !meta2x2 || meta2x2.length === 0) return;

    const geojson = buildGeoJSON(meta2x2, sortKey);

    // ── First paint: add source + layer ────────────────────────────────
    if (!layerAdded.current) {
      const addLayer = () => {
        if (map.getSource(HEATMAP_SOURCE)) {
          map.getSource(HEATMAP_SOURCE).setData(geojson);
          layerAdded.current = true;
          return;
        }

        map.addSource(HEATMAP_SOURCE, { type: "geojson", data: geojson });

        const beforeLayer = map.getLayer("myOrthoLayer")
          ? "myOrthoLayer"
          : undefined;

        map.addLayer(
          {
            id: HEATMAP_LAYER,
            type: "heatmap",
            source: HEATMAP_SOURCE,
            paint: {
              // Weight: pre-normalised value so the heatmap represents
              // attribute magnitude, NOT point density.
              "heatmap-weight": ["get", "weight"],

              // Radius: track geographic tile size so each point's blob
              // covers roughly one 2×2 tile at every zoom.
              // A 2×2 tile ≈ 1 z17 tile = 256·2^(z−17) px.
              // Exponential base-2 interpolation lets MapLibre compute
              // intermediate zooms correctly.
              "heatmap-radius": [
                "interpolate",
                ["exponential", 2],
                ["zoom"],
                8,  4,
                10, 4,
                12, 10,
                14, 35,
                16, 130,
                18, 500,
              ],

              // Intensity: pull back at low zoom to counteract additive
              // overlap of many tile-centers on screen.
              "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,  0.15,
                10, 0.2,
                12, 0.4,
                14, 0.7,
                16, 1,
                18, 1,
              ],

              // Color ramp (applied to the 0–1 density after weight and
              // intensity are resolved).
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,    "rgba(0,0,0,0)",
                0.05, "#2166ac",       // blue  – low
                0.25, "#67a9cf",
                0.50, "#fddbc7",       // light – mid
                0.75, "#ef8a62",
                1,    "#b2182b",        // red   – high
              ],

              // Opacity: slightly transparent so basemap stays legible;
              // fade at high zoom where ortho takes over.
              "heatmap-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15, 0.7,
                17, 0.45,
                19, 0.25,
              ],
            },
          },
          beforeLayer
        );

        layerAdded.current = true;
      };

      if (map.isStyleLoaded()) {
        addLayer();
      } else {
        map.once("load", addLayer);
      }
      return;
    }

    // ── Subsequent attribute changes: swap data ────────────────────────
    const src = map.getSource(HEATMAP_SOURCE);
    if (src) src.setData(geojson);
  }, [mapRef, meta2x2, sortKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;
      try {
        if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
        if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);
      } catch {
        /* map may already be destroyed */
      }
      layerAdded.current = false;
    };
  }, [mapRef]);
}