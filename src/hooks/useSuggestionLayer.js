import { useEffect, useRef } from "react";

const SOURCE_ID = "suggestions-source";
const FILL_ID   = "suggestions-fill";
const LINE_ID   = "suggestions-line";

/**
 * Manages a MapLibre fill+line layer for the original (n_suggestion=0)
 * suggestion polygons of the focused tile.
 *
 * Visible only at micro zoom, updates reactively when focusTile changes.
 *
 * @param {React.RefObject} mapRef
 * @param {GeoJSON.Feature[]|null} originalFeatures – n_suggestion=0 features for the focused tile
 * @param {string} viewLevel – "macro" | "meso" | "micro"
 */
export function useSuggestionLayer(mapRef, originalFeatures, viewLevel) {
  const addedRef  = useRef(false);
  // Snapshot latest values so the async setup callback can read them without stale closure
  const latestRef = useRef({ originalFeatures, viewLevel });
  latestRef.current = { originalFeatures, viewLevel };

  // ── Effect 1: one-time setup — add source + layers when map/style is ready ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => {
      if (addedRef.current) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id:     FILL_ID,
        type:   "fill",
        source: SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-color":   "#3b82f6",
          "fill-opacity": 0.2,
        },
      });

      map.addLayer({
        id:     LINE_ID,
        type:   "line",
        source: SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "line-color":   "#3b82f6",
          "line-width":   1.8,
          "line-opacity": 0.85,
        },
      });

      addedRef.current = true;

      // Immediately push whatever data is current after layers are added
      syncData(map, latestRef.current.originalFeatures, latestRef.current.viewLevel);
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);

    return () => {
      const m = mapRef.current;
      if (!m || !addedRef.current) return;
      try {
        if (m.getLayer(LINE_ID))    m.removeLayer(LINE_ID);
        if (m.getLayer(FILL_ID))    m.removeLayer(FILL_ID);
        if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
      } catch { /* map may be gone */ }
      addedRef.current = false;
    };
  }, [mapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: sync data + visibility whenever features or view level change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !addedRef.current) return;
    syncData(map, originalFeatures, viewLevel);
  }, [mapRef, originalFeatures, viewLevel]);
}

function syncData(map, originalFeatures, viewLevel) {
  const isVisible = viewLevel === "micro" && !!originalFeatures?.length;
  try {
    map.getSource(SOURCE_ID)?.setData({
      type: "FeatureCollection",
      features: isVisible ? originalFeatures : [],
    });
    const vis = isVisible ? "visible" : "none";
    map.setLayoutProperty(FILL_ID, "visibility", vis);
    map.setLayoutProperty(LINE_ID, "visibility", vis);
  } catch { /* layers may not be added yet — setup will call syncData when ready */ }
}