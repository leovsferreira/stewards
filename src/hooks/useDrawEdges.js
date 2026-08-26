import { useEffect, useRef } from "react";
import { isDrawingEdgesRef } from "./drawingState";
import { NODE_LAYER } from "./useNetworkEditor";

const DRAW_SOURCE = "draw-edge-source";
const DRAW_LINE   = "draw-edge-line";

export function useDrawEdges(mapRef, isDrawing, editor, onCancel, networkData, brushActive) {
  const prevNodeRef   = useRef(null);
  const chainNodesRef = useRef([]);
  const cursorRef     = useRef(null);
  const addedRef      = useRef(false);
  const editorRef     = useRef(editor);
  const onCancelRef   = useRef(onCancel);
  const brushRef      = useRef(brushActive);
  editorRef.current   = editor;
  onCancelRef.current = onCancel;
  brushRef.current    = brushActive;

  useEffect(() => {
    isDrawingEdgesRef.current = isDrawing;
    return () => { isDrawingEdgesRef.current = false; };
  }, [isDrawing]);

  // networkData is a dependency on purpose: a save/reload rebuilds the editor's
  // network with fresh node ids, so the active chain must reset with it.
  useEffect(() => {
    if (!isDrawing) return;
    const map = mapRef.current;
    if (!map) return;

    prevNodeRef.current   = null;
    chainNodesRef.current = [];
    cursorRef.current     = null;

    const h = {};
    let pendingClick = null;

    const sync = () => {
      const src = map.getSource(DRAW_SOURCE);
      if (!src) return;
      const prev = prevNodeRef.current
        ? editorRef.current.getNodeLngLat(prevNodeRef.current)
        : null;
      const cursor = cursorRef.current;
      src.setData({
        type: "FeatureCollection",
        features: prev && cursor
          ? [{
              type: "Feature",
              geometry: { type: "LineString", coordinates: [prev, cursor] },
              properties: {},
            }]
          : [],
      });
    };

    const commitClick = (lngLat) => {
      const ed = editorRef.current;

      // re-project so the snap query is correct even if the map moved meanwhile
      const point = map.project({ lng: lngLat[0], lat: lngLat[1] });
      const hits = map.getLayer(NODE_LAYER)
        ? map.queryRenderedFeatures(point, { layers: [NODE_LAYER] })
        : [];
      let nodeId = hits[0]?.properties?.id ?? null;

      if (nodeId == null) {
        nodeId = ed.addDrawnNode(lngLat[0], lngLat[1]);
        if (nodeId == null) return;
        chainNodesRef.current.push(nodeId);
      }

      // the previous node may have been deleted or replaced by a network
      // reload; a vanished node starts a new chain instead of dropping a segment
      let prev = prevNodeRef.current;
      if (prev && ed.getNodeLngLat(prev) == null) prev = null;

      if (prev && prev !== nodeId) ed.addDrawnEdge(prev, nodeId);
      prevNodeRef.current = nodeId;
      sync();
    };

    h.click = (e) => {
      if (brushRef.current) return;

      const point  = e.point;
      const lngLat = [e.lngLat.lng, e.lngLat.lat];

      if (pendingClick !== null) {
        clearTimeout(pendingClick.timer);
        const prev = pendingClick;
        pendingClick = null;
        const dist = Math.hypot(prev.point.x - point.x, prev.point.y - point.y);
        if (dist < 8) return; // double-click precursor: h.dblclick handles it
        commitClick(prev.lngLat); // two distinct fast clicks: keep both
      }

      pendingClick = {
        point,
        lngLat,
        timer: setTimeout(() => {
          pendingClick = null;
          commitClick(lngLat);
        }, 220),
      };
    };

    h.dblclick = (e) => {
      e.preventDefault();
      if (pendingClick !== null) { clearTimeout(pendingClick.timer); pendingClick = null; }
      prevNodeRef.current = null;
      sync();
    };

    h.mousemove = (e) => {
      cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
      if (!brushRef.current && map.getCanvas().style.cursor !== "crosshair") {
        map.getCanvas().style.cursor = "crosshair";
      }
      sync();
    };

    h.keydown = (e) => {
      if (e.key === "Escape") onCancelRef.current?.();
    };

    const setup = () => {
      if (!map.getSource(DRAW_SOURCE)) {
        map.addSource(DRAW_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: DRAW_LINE, type: "line", source: DRAW_SOURCE,
          paint: {
            "line-color":     "#e85d04",
            "line-width":     2,
            "line-dasharray": [3, 3],
            "line-opacity":   0.85,
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

    // "idle" (not "load"): load fires only once per map lifetime, while the
    // style can be transiently un-loaded here (e.g. a source reprocessing)
    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);

    return () => {
      if (pendingClick !== null) { clearTimeout(pendingClick.timer); pendingClick = null; }

      for (const nid of chainNodesRef.current) editorRef.current.removeNodeIfOrphan(nid);
      chainNodesRef.current = [];
      prevNodeRef.current   = null;
      cursorRef.current     = null;

      const m = mapRef.current;
      if (m) {
        m.off("idle",      setup);
        m.off("click",     h.click);
        m.off("dblclick",  h.dblclick);
        m.off("mousemove", h.mousemove);
        if (addedRef.current) {
          m.getCanvas().style.cursor = "";
          try {
            if (m.getLayer(DRAW_LINE))    m.removeLayer(DRAW_LINE);
            if (m.getSource(DRAW_SOURCE)) m.removeSource(DRAW_SOURCE);
          } catch { /* map may be gone */ }
        }
      }
      document.removeEventListener("keydown", h.keydown);
      addedRef.current = false;
    };
  }, [mapRef, isDrawing, networkData]);
}
