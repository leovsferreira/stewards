import { useEffect, useRef } from "react";

const HANDLE_SOURCE = "sugg-edit-handles-source";
const VERT_LAYER    = "sugg-edit-vertex-layer";
const EDGE_LAYER    = "sugg-edit-edge-layer";
const SEL_SOURCE    = "selected-suggestions-source";

// ── Geometry helpers ─────────────────────────────────────────────────────────

function getPolygonRing(feature) {
  if (!feature) return null;
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon")      return coordinates[0];
  if (type === "MultiPolygon") return coordinates[0]?.[0] ?? null;
  return null;
}

/**
 * Build a FeatureCollection of all handles for every feature in the map.
 * Each handle carries a `featureKey` property so the drag handler knows
 * which feature it belongs to.
 *
 * @param {Map<string, GeoJSON.Feature>} featuresMap
 */
function buildHandleFC(featuresMap) {
  const out = [];
  if (!featuresMap) return { type: "FeatureCollection", features: out };

  for (const [key, feature] of featuresMap) {
    const ring = getPolygonRing(feature);
    if (!ring || ring.length < 3) continue;
    const n = ring.length - 1;

    for (let i = 0; i < n; i++) {
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: ring[i] },
        properties: { kind: "vertex", idx: i, featureKey: key },
      });
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [(a[0]+b[0])/2, (a[1]+b[1])/2] },
        properties: { kind: "edge", idx: i, featureKey: key },
      });
    }
  }
  return { type: "FeatureCollection", features: out };
}

function applyDrag(feature, drag, lngLat) {
  const { kind, idx, startLng, startLat, origRing } = drag;
  const dLng    = lngLat.lng - startLng;
  const dLat    = lngLat.lat - startLat;
  const n       = origRing.length - 1;
  const newRing = origRing.map((pt) => [...pt]);

  if (kind === "vertex") {
    newRing[idx][0] += dLng;
    newRing[idx][1] += dLat;
    if (idx === 0) { newRing[n][0] = newRing[0][0]; newRing[n][1] = newRing[0][1]; }
  } else {
    const next = (idx + 1) % n;
    newRing[idx][0]  += dLng; newRing[idx][1]  += dLat;
    newRing[next][0] += dLng; newRing[next][1] += dLat;
    newRing[n][0] = newRing[0][0]; newRing[n][1] = newRing[0][1];
  }

  const { type } = feature.geometry;
  if (type === "Polygon") {
    return { ...feature, geometry: { type, coordinates: [newRing, ...feature.geometry.coordinates.slice(1)] } };
  }
  const polys = feature.geometry.coordinates.map((poly, pi) =>
    pi === 0 ? [newRing, ...poly.slice(1)] : poly
  );
  return { ...feature, geometry: { type, coordinates: polys } };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Always-mounted handle layers for editing suggestion polygons.
 * Renders handles for ALL features in editingFeaturesMap simultaneously.
 * Dragging any handle commits just that feature via onCommit(key, updatedFeature).
 *
 * @param {React.RefObject}           mapRef
 * @param {Map<string,GeoJSON.Feature>|null} editingFeaturesMap  key → feature
 * @param {Function}                  onCommit  (key, newFeature) => void
 */
export function useSuggestionEditor(mapRef, editingFeaturesMap, onCommit) {
  const addedRef       = useRef(false);
  const dragRef        = useRef(null); // { featureKey, kind, idx, startLng, startLat, origRing }
  const featuresMapRef = useRef(editingFeaturesMap);
  const onCommitRef    = useRef(onCommit);
  featuresMapRef.current = editingFeaturesMap;
  onCommitRef.current    = onCommit;

  // ── Effect 1: one-time layer setup + event binding ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const h = {};

    const setup = () => {
      if (addedRef.current) return;

      map.addSource(HANDLE_SOURCE, {
        type: "geojson",
        data: buildHandleFC(featuresMapRef.current),
      });

      // Edge midpoints — added first so vertices render on top
      map.addLayer({
        id: EDGE_LAYER, type: "circle", source: HANDLE_SOURCE,
        filter: ["==", ["get", "kind"], "edge"],
        paint: {
          "circle-radius":       5,
          "circle-color":        "rgba(34,197,94,0.25)",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#22c55e",
        },
      });

      map.addLayer({
        id: VERT_LAYER, type: "circle", source: HANDLE_SOURCE,
        filter: ["==", ["get", "kind"], "vertex"],
        paint: {
          "circle-radius":       6,
          "circle-color":        "#22c55e",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-opacity":      0.95,
        },
      });

      h.mousedown = (e) => {
        if (e.originalEvent?.button !== 0) return;
        if (!e.features?.length) return;
        const { kind, idx, featureKey } = e.features[0].properties;
        const feature = featuresMapRef.current?.get(featureKey);
        if (!feature) return;
        const ring = getPolygonRing(feature);
        if (!ring) return;
        e.preventDefault();
        map.dragPan.disable();
        dragRef.current = {
          featureKey, kind, idx,
          startLng: e.lngLat.lng,
          startLat: e.lngLat.lat,
          origRing: ring.map((pt) => [...pt]),
        };
        map.getCanvas().style.cursor = "grabbing";
      };

      h.mousemove = (e) => {
        if (!dragRef.current) return;
        const { featureKey } = dragRef.current;
        const feature = featuresMapRef.current?.get(featureKey);
        if (!feature) return;

        const updated = applyDrag(feature, dragRef.current, e.lngLat);

        // Build a temporary map with the updated feature for live handle redraw
        const tmpMap = new Map(featuresMapRef.current);
        tmpMap.set(featureKey, updated);
        map.getSource(HANDLE_SOURCE)?.setData(buildHandleFC(tmpMap));

        // Push all selected features (with the in-progress edit) to the fill layer
        map.getSource(SEL_SOURCE)?.setData({
          type: "FeatureCollection",
          features: [...tmpMap.values()],
        });
      };

      h.mouseup = (e) => {
        if (!dragRef.current) return;
        const { featureKey } = dragRef.current;
        const feature = featuresMapRef.current?.get(featureKey);
        if (!feature) { dragRef.current = null; return; }
        const updated = applyDrag(feature, dragRef.current, e.lngLat);
        dragRef.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = "";
        onCommitRef.current?.(featureKey, updated);
      };

      h.enterHandle = () => { if (!dragRef.current) map.getCanvas().style.cursor = "grab"; };
      h.leaveHandle = () => { if (!dragRef.current) map.getCanvas().style.cursor = ""; };

      map.on("mousedown",  VERT_LAYER, h.mousedown);
      map.on("mousedown",  EDGE_LAYER, h.mousedown);
      map.on("mousemove",             h.mousemove);
      map.on("mouseup",               h.mouseup);
      map.on("mouseenter", VERT_LAYER, h.enterHandle);
      map.on("mouseleave", VERT_LAYER, h.leaveHandle);
      map.on("mouseenter", EDGE_LAYER, h.enterHandle);
      map.on("mouseleave", EDGE_LAYER, h.leaveHandle);

      addedRef.current = true;
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);

    return () => {
      const m = mapRef.current;
      if (dragRef.current) {
        dragRef.current = null;
        m?.dragPan.enable();
        if (m?.getCanvas) m.getCanvas().style.cursor = "";
      }
      if (m && h.mousedown) {
        m.off("mousedown",  VERT_LAYER, h.mousedown);
        m.off("mousedown",  EDGE_LAYER, h.mousedown);
        m.off("mousemove",             h.mousemove);
        m.off("mouseup",               h.mouseup);
        m.off("mouseenter", VERT_LAYER, h.enterHandle);
        m.off("mouseleave", VERT_LAYER, h.leaveHandle);
        m.off("mouseenter", EDGE_LAYER, h.enterHandle);
        m.off("mouseleave", EDGE_LAYER, h.leaveHandle);
      }
      if (m && addedRef.current) {
        try {
          if (m.getLayer(VERT_LAYER))     m.removeLayer(VERT_LAYER);
          if (m.getLayer(EDGE_LAYER))     m.removeLayer(EDGE_LAYER);
          if (m.getSource(HANDLE_SOURCE)) m.removeSource(HANDLE_SOURCE);
        } catch { /* map may be gone */ }
      }
      addedRef.current = false;
    };
  }, [mapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: sync handles whenever the set of editing features changes ───
  useEffect(() => {
    if (!addedRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    // Cancel any in-flight drag if the dragged feature was removed
    if (dragRef.current && !editingFeaturesMap?.has(dragRef.current.featureKey)) {
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    }
    map.getSource(HANDLE_SOURCE)?.setData(buildHandleFC(editingFeaturesMap));
  }, [mapRef, editingFeaturesMap]);
}