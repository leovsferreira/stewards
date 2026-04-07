import { useEffect, useRef } from "react";

const SOURCE_ID = "suggestions-source";
const FILL_ID   = "suggestions-fill";
const LINE_ID   = "suggestions-line";

export function useSuggestionLayer(mapRef, originalFeatures, viewLevel) {
  const addedRef  = useRef(false);
  const latestRef = useRef({ originalFeatures, viewLevel });
  latestRef.current = { originalFeatures, viewLevel };

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
  }, [mapRef]); 

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