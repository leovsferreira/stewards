import { useEffect, useRef } from "react";
import { isDrawingRef } from "./drawingState";

const DRAW_SOURCE = "draw-poly-source";
const DRAW_LINE   = "draw-poly-line";
const DRAW_VERTS  = "draw-poly-verts";

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Activates a polygon drawing mode on the map when isDrawing is true.
 * Click to add vertices; double-click or click near the first vertex to close.
 * Press Escape to cancel.
 *
 * @param {React.RefObject} mapRef
 * @param {boolean}         isDrawing
 * @param {Function}        onComplete  (closedRing: [lng,lat][]) => void
 * @param {Function}        onCancel    () => void  – called on Escape / cancel
 */
export function useDrawPolygon(mapRef, isDrawing, onComplete, onCancel) {
  const ringRef      = useRef([]);
  const cursorRef    = useRef(null);
  const addedRef     = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef   = useRef(onCancel);
  onCompleteRef.current = onComplete;
  onCancelRef.current   = onCancel;

  useEffect(() => {
    isDrawingRef.current = isDrawing;
    return () => { isDrawingRef.current = false; };
  }, [isDrawing]);

  useEffect(() => {
    if (!isDrawing) return;
    const map = mapRef.current;
    if (!map) return;

    ringRef.current   = [];
    cursorRef.current = null;

    const h = {};
    let clickTimer = null; // debounce for single-click vs double-click

    // ── Build GeoJSON for the temp drawing layer ────────────────────────────

    const buildFC = () => {
      const ring   = ringRef.current;
      const cursor = cursorRef.current;
      const features = [];

      // Preview line: ring vertices + cursor position
      if (ring.length >= 1 && cursor) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [...ring, cursor] },
          properties: { kind: "preview" },
        });
      }
      // Closing segment: last vertex → first vertex (once we have ≥ 3 points)
      if (ring.length >= 3 && cursor) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [ring[ring.length - 1], ring[0]] },
          properties: { kind: "close" },
        });
      }
      // Committed ring (solid)
      if (ring.length >= 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: ring },
          properties: { kind: "ring" },
        });
      }
      // Vertex dots
      for (const pt of ring) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pt },
          properties: { kind: "vertex" },
        });
      }
      return { type: "FeatureCollection", features };
    };

    const sync = () => map.getSource(DRAW_SOURCE)?.setData(buildFC());

    // ── Finish polygon ──────────────────────────────────────────────────────

    const finish = () => {
      const ring = ringRef.current;
      if (ring.length >= 3) {
        const closed = [...ring, ring[0]]; // GeoJSON ring closure
        onCompleteRef.current(closed);
      }
    };

    const cancel = () => {
      onCancelRef.current?.();
    };

    // ── Event handlers ──────────────────────────────────────────────────────

    h.click = (e) => {
      // Debounce: ignore if a double-click timer is about to fire
      if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; return; }

      clickTimer = setTimeout(() => {
        clickTimer = null;
        const ring = ringRef.current;

        // Close polygon if clicking near the first vertex (within 12px)
        if (ring.length >= 3) {
          const [firstLng, firstLat] = ring[0];
          const firstPx = map.project([firstLng, firstLat]);
          const clickPx = map.project([e.lngLat.lng, e.lngLat.lat]);
          const dist = Math.hypot(firstPx.x - clickPx.x, firstPx.y - clickPx.y);
          if (dist < 12) { finish(); return; }
        }

        ringRef.current = [...ring, [e.lngLat.lng, e.lngLat.lat]];
        sync();
      }, 220); // slightly longer than dblclick interval detection
    };

    h.dblclick = (e) => {
      e.preventDefault(); // prevent map zoom on dblclick
      if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
      finish();
    };

    h.mousemove = (e) => {
      cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
      sync();
    };

    h.keydown = (e) => {
      if (e.key === "Escape") cancel();
    };

    // ── Setup ───────────────────────────────────────────────────────────────

    const setup = () => {
      if (!map.getSource(DRAW_SOURCE)) {
        map.addSource(DRAW_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // Dashed preview / close lines
        map.addLayer({
          id: DRAW_LINE, type: "line", source: DRAW_SOURCE,
          paint: {
            "line-color":      "#22c55e",
            "line-width":      2,
            "line-dasharray":  [3, 3],
            "line-opacity":    0.85,
          },
        });

        // Vertex dots
        map.addLayer({
          id: DRAW_VERTS, type: "circle", source: DRAW_SOURCE,
          filter: ["==", ["get", "kind"], "vertex"],
          paint: {
            "circle-radius":       5,
            "circle-color":        "#22c55e",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
      }

      addedRef.current = true;
      map.getCanvas().style.cursor = "crosshair";

      map.on("click",     h.click);
      map.on("dblclick",  h.dblclick);
      map.on("mousemove", h.mousemove);
      document.addEventListener("keydown", h.keydown);
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);

    return () => {
      if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
      ringRef.current   = [];
      cursorRef.current = null;

      const m = mapRef.current;
      if (m) {
        m.off("click",     h.click);
        m.off("dblclick",  h.dblclick);
        m.off("mousemove", h.mousemove);
        if (addedRef.current) {
          m.getCanvas().style.cursor = "";
          try {
            if (m.getLayer(DRAW_VERTS))  m.removeLayer(DRAW_VERTS);
            if (m.getLayer(DRAW_LINE))   m.removeLayer(DRAW_LINE);
            if (m.getSource(DRAW_SOURCE)) m.removeSource(DRAW_SOURCE);
          } catch { /* map may be gone */ }
        }
      }
      document.removeEventListener("keydown", h.keydown);
      addedRef.current = false;
    };
  }, [mapRef, isDrawing]); // eslint-disable-line react-hooks/exhaustive-deps
}