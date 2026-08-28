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
    let pendingCreated = []; // nodes created since the last committed segment

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

      // snapping onto a still-unconnected node this session created (a chain
      // start abandoned by a double-click) adopts it into the next segment's
      // history entry, so undoing that segment removes it too
      if (nodeId != null &&
          chainNodesRef.current.includes(nodeId) &&
          !pendingCreated.includes(nodeId) &&
          (ed.getNodeDegree?.(nodeId) ?? 0) === 0) {
        pendingCreated.push(nodeId);
      }

      if (nodeId == null) {
        nodeId = ed.addDrawnNode(lngLat[0], lngLat[1]);
        if (nodeId == null) return;
        chainNodesRef.current.push(nodeId);
        pendingCreated.push(nodeId);
      }

      // the previous node may have been deleted or replaced by a network
      // reload; a vanished node starts a new chain instead of dropping a segment
      let prev = prevNodeRef.current;
      if (prev && ed.getNodeLngLat(prev) == null) prev = null;

      if (prev && prev !== nodeId) {
        const edgeId = ed.addDrawnEdge(prev, nodeId, pendingCreated);
        if (edgeId != null) pendingCreated = [];
      }
      prevNodeRef.current = nodeId;
      sync();
    };

    const armPending = () => {
      pendingClick.timer = setTimeout(() => {
        const p = pendingClick;
        pendingClick = null;
        for (const c of p.clicks) commitClick(c.lngLat);
      }, 220);
    };

    h.click = (e) => {
      if (brushRef.current) return;

      const click = { point: e.point, lngLat: [e.lngLat.lng, e.lngLat.lat] };

      if (pendingClick !== null) {
        clearTimeout(pendingClick.timer);
        const last = pendingClick.clicks[pendingClick.clicks.length - 1];
        const dist = Math.hypot(last.point.x - click.point.x, last.point.y - click.point.y);
        if (dist < 8) {
          // possible double-click pair: held until either the dblclick event
          // cancels it or the timer commits both (browser slop can be < 8px)
          pendingClick.clicks.push(click);
          armPending();
          return;
        }
        const p = pendingClick;
        pendingClick = null;
        for (const c of p.clicks) commitClick(c.lngLat); // distinct fast clicks: keep them
      }

      pendingClick = { clicks: [click] };
      armPending();
    };

    h.dblclick = (e) => {
      e.preventDefault();
      if (pendingClick !== null) {
        clearTimeout(pendingClick.timer);
        const rest = pendingClick.clicks.slice(0, -2); // drop the double-click pair
        pendingClick = null;
        for (const c of rest) commitClick(c.lngLat);
      }
      prevNodeRef.current = null;
      pendingCreated = []; // a leftover chain-start node is orphan-cleaned on mode end
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

    const ensureLayers = () => {
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
    };

    // handlers attach immediately so clicks/Esc work even while the style is
    // busy; only the preview layer needs a loaded style. "idle" (not "load"):
    // load fires once per map lifetime, idle after every settle.
    map.getCanvas().style.cursor = "crosshair";
    map.on("click",     h.click);
    map.on("dblclick",  h.dblclick);
    map.on("mousemove", h.mousemove);
    document.addEventListener("keydown", h.keydown);

    if (map.isStyleLoaded()) ensureLayers();
    else map.once("idle", ensureLayers);

    return () => {
      if (pendingClick !== null) { clearTimeout(pendingClick.timer); pendingClick = null; }

      for (const nid of chainNodesRef.current) editorRef.current.removeNodeIfOrphan(nid);
      chainNodesRef.current = [];
      prevNodeRef.current   = null;
      cursorRef.current     = null;

      const m = mapRef.current;
      if (m) {
        m.off("idle",      ensureLayers);
        m.off("click",     h.click);
        m.off("dblclick",  h.dblclick);
        m.off("mousemove", h.mousemove);
        // the shift-brush also uses a crosshair; don't wipe it if it's active
        m.getCanvas().style.cursor = brushRef.current ? "crosshair" : "";
        if (addedRef.current) {
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
