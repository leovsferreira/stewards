import { useEffect, useRef } from "react";
import { isDeletingNodesRef, isGestureActiveRef } from "./drawingState";
import { NODE_LAYER } from "./useNetworkEditor";

const RECT_SOURCE = "delete-rect-source";
const RECT_FILL   = "delete-rect-fill";
const RECT_LINE   = "delete-rect-line";

export function useDeleteNodes(mapRef, isActive, editor, onCancel, brushActive) {
  const addedRef    = useRef(false);
  const editorRef   = useRef(editor);
  const onCancelRef = useRef(onCancel);
  const brushRef    = useRef(brushActive);
  editorRef.current   = editor;
  onCancelRef.current = onCancel;
  brushRef.current    = brushActive;

  useEffect(() => {
    isDeletingNodesRef.current = isActive;
    return () => { isDeletingNodesRef.current = false; };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const map = mapRef.current;
    if (!map) return;

    // geographic anchor, so the rectangle stays consistent with the query even
    // if the camera zooms mid-drag
    let dragStart = null;

    const h = {};

    // built from screen corners so the rectangle stays screen-aligned even
    // when the map is rotated
    const rectPolygon = (a, b) => {
      const corners = [
        map.unproject([a.x, a.y]),
        map.unproject([b.x, a.y]),
        map.unproject([b.x, b.y]),
        map.unproject([a.x, b.y]),
      ].map((c) => [c.lng, c.lat]);
      return {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[...corners, corners[0]]] },
          properties: {},
        }],
      };
    };

    const endDrag = () => {
      dragStart = null;
      isGestureActiveRef.current = false;
      map.dragPan.enable();
      map.getSource(RECT_SOURCE)?.setData({ type: "FeatureCollection", features: [] });
    };

    const finishDrag = (b) => {
      const a = map.project(dragStart);
      endDrag();

      // a plain click is not a selection
      if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3) return;

      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      const hits = map.getLayer(NODE_LAYER)
        ? map.queryRenderedFeatures([[minX, minY], [maxX, maxY]], { layers: [NODE_LAYER] })
        : [];
      const ids = [...new Set(hits.map((f) => f.properties?.id).filter(Boolean))];

      // the hit test buffers each circle by its rendered radius; keep only
      // nodes whose center actually lies inside the rectangle
      const inside = ids.filter((id) => {
        const ll = editorRef.current.getNodeLngLat(id);
        if (!ll) return false;
        const p = map.project({ lng: ll[0], lat: ll[1] });
        return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      });
      if (inside.length > 0) editorRef.current.deleteNodes(inside);
    };

    h.mousedown = (e) => {
      if (brushRef.current) return;
      if (e.originalEvent?.button !== 0) return;
      e.preventDefault();
      dragStart = e.lngLat;
      isGestureActiveRef.current = true;
      map.dragPan.disable();
    };

    h.mousemove = (e) => {
      if (!brushRef.current && map.getCanvas().style.cursor !== "crosshair") {
        map.getCanvas().style.cursor = "crosshair";
      }
      if (!dragStart) return;
      map.getSource(RECT_SOURCE)?.setData(rectPolygon(map.project(dragStart), e.point));
    };

    h.mouseup = (e) => {
      if (!dragStart) return;
      if (e.originalEvent?.button !== 0) return;
      finishDrag(e.point);
    };

    // the map-level "mouseup" only fires inside the canvas container, so a
    // sweep released over the sidebar/controls would otherwise strand the drag
    h.docMouseUp = (ev) => {
      if (!dragStart || ev.button !== 0) return;
      const r = map.getCanvasContainer().getBoundingClientRect();
      finishDrag({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    };

    h.dblclick = (e) => {
      e.preventDefault(); // keep doubleClickZoom from firing in this mode
    };

    h.keydown = (e) => {
      if (e.key !== "Escape") return;
      if (dragStart) endDrag();
      else onCancelRef.current?.();
    };

    const ensureLayers = () => {
      if (!map.getSource(RECT_SOURCE)) {
        map.addSource(RECT_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: RECT_FILL, type: "fill", source: RECT_SOURCE,
          paint: { "fill-color": "#dc2626", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: RECT_LINE, type: "line", source: RECT_SOURCE,
          paint: {
            "line-color":     "#dc2626",
            "line-width":     1.5,
            "line-dasharray": [3, 3],
          },
        });
      }
      addedRef.current = true;
    };

    // handlers attach immediately so the mode works even while the style is
    // busy; only the marquee layers need a loaded style
    map.getCanvas().style.cursor = "crosshair";
    map.on("mousedown", h.mousedown);
    map.on("mousemove", h.mousemove);
    map.on("mouseup",   h.mouseup);
    map.on("dblclick",  h.dblclick);
    document.addEventListener("mouseup",  h.docMouseUp);
    document.addEventListener("keydown",  h.keydown);

    if (map.isStyleLoaded()) ensureLayers();
    else map.once("idle", ensureLayers);

    return () => {
      if (dragStart) isGestureActiveRef.current = false;
      const m = mapRef.current;
      if (m) {
        m.off("idle",      ensureLayers);
        m.off("mousedown", h.mousedown);
        m.off("mousemove", h.mousemove);
        m.off("mouseup",   h.mouseup);
        m.off("dblclick",  h.dblclick);
        if (dragStart) { dragStart = null; m.dragPan.enable(); }
        // the shift-brush also uses a crosshair; don't wipe it if it's active
        m.getCanvas().style.cursor = brushRef.current ? "crosshair" : "";
        if (addedRef.current) {
          try {
            if (m.getLayer(RECT_LINE))    m.removeLayer(RECT_LINE);
            if (m.getLayer(RECT_FILL))    m.removeLayer(RECT_FILL);
            if (m.getSource(RECT_SOURCE)) m.removeSource(RECT_SOURCE);
          } catch { /* map may be gone */ }
        }
      }
      document.removeEventListener("mouseup", h.docMouseUp);
      document.removeEventListener("keydown", h.keydown);
      addedRef.current = false;
    };
  }, [mapRef, isActive]);
}
