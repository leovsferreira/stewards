import { useEffect, useRef, useCallback, useState } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

const SOURCE_ID = "heatmap-field-source";
const LAYER_ID = "heatmap-field-layer";

/* ── colour ramp (blue → light → red) ──────────────────────────────── */

function lerpColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const STOPS = [
  { t: 0.0, rgb: [33, 102, 172] },   // blue
  { t: 0.25, rgb: [103, 169, 207] },
  { t: 0.5, rgb: [253, 219, 199] },  // light
  { t: 0.75, rgb: [239, 138, 98] },
  { t: 1.0, rgb: [178, 24, 43] },    // red
];

function colorForValue(t) {
  if (t <= 0) return STOPS[0].rgb;
  if (t >= 1) return STOPS[STOPS.length - 1].rgb;
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      const local = (t - STOPS[i].t) / (STOPS[i + 1].t - STOPS[i].t);
      return lerpColor(STOPS[i].rgb, STOPS[i + 1].rgb, local);
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

/* ── Bilinear grid interpolation on a canvas ────────────────────────── */

/**
 * Build a regular 2D grid from tile metadata and render a bilinearly
 * interpolated field to a canvas.
 *
 * The tiles sit on a regular grid (integer x/y at z18), so we:
 *   1. Map tile_id → (ix, iy) grid indices and store the normalised value.
 *   2. For each canvas pixel, find its floating-point grid position.
 *   3. Bilinear-interpolate from the four surrounding grid nodes.
 *
 * No singularities, no bullseye artifacts — perfectly smooth.
 *
 * @param {Array}  meta2x2   – raw metadata array
 * @param {string} sortKey   – attribute name
 * @param {number} canvasW   – output pixel width
 * @param {number} canvasH   – output pixel height
 * @param {number} opacity   – 0-255
 * @returns {{ dataUrl: string, bounds: [w,s,e,n] }} | null
 */
function renderBilinear(meta2x2, sortKey, canvasW, canvasH, opacity = 170) {
  if (!meta2x2 || meta2x2.length === 0) return null;

  // ── 1. Parse grid coords and normalise values ───────────────────────
  const rawValues = meta2x2.map((r) => Number(r[sortKey] ?? 0));
  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  const range = max - min || 1;

  const parsed = meta2x2.map((r, i) => {
    const [xStr, yStr] = r.tile_id.split("_");
    return { gx: Number(xStr), gy: Number(yStr), v: (rawValues[i] - min) / range };
  });

  // Grid extent
  const gxs = parsed.map((p) => p.gx);
  const gys = parsed.map((p) => p.gy);
  const gxMin = Math.min(...gxs);
  const gxMax = Math.max(...gxs);
  const gyMin = Math.min(...gys);
  const gyMax = Math.max(...gys);
  const cols = gxMax - gxMin + 1; // number of grid columns
  const rows = gyMax - gyMin + 1; // number of grid rows

  // ── 2. Fill 2D grid (row-major). NaN = missing cell ─────────────────
  const grid = new Float32Array(rows * cols).fill(NaN);
  for (const p of parsed) {
    const ix = p.gx - gxMin;
    const iy = p.gy - gyMin;
    grid[iy * cols + ix] = p.v;
  }

  // Helper: read grid with clamping (edges repeat the border value)
  const gridAt = (ix, iy) => {
    ix = Math.max(0, Math.min(cols - 1, ix));
    iy = Math.max(0, Math.min(rows - 1, iy));
    const v = grid[iy * cols + ix];
    return Number.isNaN(v) ? 0 : v;
  };

  // ── 3. Geographic bounds (centre of corner tiles ± half a tile) ─────
  //    We extend by 0.5 grid steps on each side so the colour field
  //    covers each tile fully rather than starting at tile centres.
  const tileGeoW =
    (tileToLngLatBounds(gxMin + 1, gyMin, 18)[0] -
      tileToLngLatBounds(gxMin, gyMin, 18)[0]);
  const tileGeoH =
    (tileToLngLatBounds(gxMin, gyMin, 18)[3] -
      tileToLngLatBounds(gxMin, gyMin + 1, 18)[3]);

  const [wOrig, , , nOrig] = tileToLngLatBounds(gxMin, gyMin, 18);
  const [, sOrig, eOrig] = tileToLngLatBounds(gxMax, gyMax, 18);

  // centre of corner tiles
  const centreW = wOrig + tileGeoW * 0.5;
  const centreE = eOrig - tileGeoW * 0.5;
  const centreN = nOrig - tileGeoH * 0.5;
  const centreS = sOrig + tileGeoH * 0.5;

  // extend by half a tile
  const west = centreW - tileGeoW * 0.5;
  const east = centreE + tileGeoW * 0.5;
  const north = centreN + tileGeoH * 0.5;
  const south = centreS - tileGeoH * 0.5;

  const geoW = east - west;
  const geoH = north - south;

  // ── 4. Render bilinear interpolation ────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(canvasW, canvasH);
  const data = imgData.data;

  for (let row = 0; row < canvasH; row++) {
    for (let col = 0; col < canvasW; col++) {
      // Map pixel → grid-space (0 = first tile centre, cols-1 = last)
      const gxF = ((col + 0.5) / canvasW) * (cols - 1 + 1) - 0.5;
      const gyF = ((row + 0.5) / canvasH) * (rows - 1 + 1) - 0.5;

      // Four surrounding grid nodes
      const ix0 = Math.floor(gxF);
      const iy0 = Math.floor(gyF);
      const ix1 = ix0 + 1;
      const iy1 = iy0 + 1;

      const fx = gxF - ix0; // fractional x (0-1)
      const fy = gyF - iy0; // fractional y (0-1)

      // Bilinear blend
      const v00 = gridAt(ix0, iy0);
      const v10 = gridAt(ix1, iy0);
      const v01 = gridAt(ix0, iy1);
      const v11 = gridAt(ix1, iy1);

      const t =
        v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy;

      const [r, g, b] = colorForValue(t);
      const idx = (row * canvasW + col) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = opacity;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return { dataUrl: canvas.toDataURL(), bounds: [west, south, east, north], min, max };
}

/* ── Hook ───────────────────────────────────────────────────────────── */

/**
 * Adds a georeferenced bilinear-interpolated field overlay to the map.
 *
 * • Tiles form a regular grid → bilinear interpolation is exact, smooth,
 *   and free of the bullseye artifacts that plague IDW.
 * • Appearance is zoom-independent (the image is fixed in geographic space).
 * • Changing `sortKey` re-renders the canvas and swaps the image source.
 */
export function useHeatmap(mapRef, meta2x2, sortKey, visible = true) {
  const layerAdded = useRef(false);
  const prevBoundsRef = useRef(null);
  const [valueRange, setValueRange] = useState({ min: 0, max: 1 });

  // ── Toggle visibility without tearing down the layer ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerAdded.current) return;
    if (map.getLayer(LAYER_ID)) {
      map.setLayoutProperty(
        LAYER_ID,
        "visibility",
        visible ? "visible" : "none"
      );
    }
  }, [mapRef, visible]);

  const render = useCallback(() => {
    const map = mapRef.current;
    if (!map || !meta2x2 || meta2x2.length === 0) return;

    // Canvas resolution — proportional to grid extent, higher res for smooth output
    const xs = [...new Set(meta2x2.map((r) => r.tile_id.split("_")[0]))];
    const ys = [...new Set(meta2x2.map((r) => r.tile_id.split("_")[1]))];
    const gridW = xs.length;
    const gridH = ys.length;
    const scale = 8; // 8 px per grid cell → smooth bilinear gradients
    const canvasW = Math.max(64, Math.min(gridW * scale, 1024));
    const canvasH = Math.max(64, Math.min(gridH * scale, 1024));

    const result = renderBilinear(meta2x2, sortKey, canvasW, canvasH, 170);
    if (!result) return;

    setValueRange({ min: result.min, max: result.max });

    const { dataUrl, bounds: geoBounds } = result;
    const [w, s, e, n] = geoBounds;
    const coords = [
      [w, n], // top-left
      [e, n], // top-right
      [e, s], // bottom-right
      [w, s], // bottom-left
    ];

    // ── First time: add source + layer ────────────────────────────────
    if (!layerAdded.current) {
      const addLayer = () => {
        if (map.getSource(SOURCE_ID)) {
          map.getSource(SOURCE_ID).updateImage({ url: dataUrl, coordinates: coords });
          layerAdded.current = true;
          prevBoundsRef.current = coords;
          return;
        }

        map.addSource(SOURCE_ID, {
          type: "image",
          url: dataUrl,
          coordinates: coords,
        });

        // No beforeLayer → renders on top of everything including ortho
        map.addLayer({
          id: LAYER_ID,
          type: "raster",
          source: SOURCE_ID,
          paint: {
            "raster-opacity": 0.65,
            "raster-fade-duration": 0,
          },
          layout: {
            visibility: visible ? "visible" : "none",
          },
        });

        layerAdded.current = true;
        prevBoundsRef.current = coords;
      };

      if (map.isStyleLoaded()) addLayer();
      else map.once("load", addLayer);
      return;
    }

    // ── Subsequent updates: swap image ────────────────────────────────
    const src = map.getSource(SOURCE_ID);
    if (src) {
      src.updateImage({ url: dataUrl, coordinates: coords });
    }
  }, [mapRef, meta2x2, sortKey, visible]);

  useEffect(() => {
    render();
  }, [render]);

  // Cleanup
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* map may already be gone */
      }
      layerAdded.current = false;
    };
  }, [mapRef]);

  return valueRange;
}