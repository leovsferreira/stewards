import { useEffect, useRef, useState, useCallback } from "react";
import { isDrawingEdgesRef, isDeletingNodesRef } from "./drawingState";

const EDGE_SOURCE = "editor-edges-source";
const EDGE_LAYER  = "editor-edges-layer";
const EDGE_HIT    = "editor-edges-hit";
const NODE_SOURCE = "editor-nodes-source";
export const NODE_LAYER = "editor-nodes-layer";
const MESO_ZOOM   = 16;
const MICRO_ZOOM = 18.5;

function parseNetwork(geojson) {
  const byKey = new Map();
  const edges = new Map();
  const nodeEdgeIndex = new Map();
  let nc = 0, ec = 0;

  const getNode = (lng, lat) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    if (!byKey.has(key)) {
      const id = `n${nc++}`;
      byKey.set(key, { id, lng, lat });
    }
    return byKey.get(key).id;
  };

  for (const f of geojson?.features ?? []) {
    const rings =
      f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    for (const ring of rings) {
      const nodeIds = ring.map(([lng, lat]) => getNode(lng, lat));
      if (nodeIds.length < 2) continue;
      const id = `e${ec++}`;
      edges.set(id, { id, nodeIds });
      for (const nid of nodeIds) {
        if (!nodeEdgeIndex.has(nid)) nodeEdgeIndex.set(nid, new Set());
        nodeEdgeIndex.get(nid).add(id);
      }
    }
  }

  const nodes = new Map([...byKey.values()].map((n) => [n.id, n]));
  return { nodes, edges, nodeEdgeIndex };
}

function buildCaches({ nodes, edges }) {
  const nodeFeatMap = new Map();
  const edgeFeatMap = new Map();

  const nodeFC = {
    type: "FeatureCollection",
    features: [...nodes.values()].map((n) => {
      const f = {
        type: "Feature",
        properties: { id: n.id },
        geometry: { type: "Point", coordinates: [n.lng, n.lat] },
      };
      nodeFeatMap.set(n.id, f);
      return f;
    }),
  };

  const edgeFC = {
    type: "FeatureCollection",
    features: [...edges.values()].flatMap((e) => {
      const coords = e.nodeIds.map((id) => nodes.get(id)).filter(Boolean).map((n) => [n.lng, n.lat]);
      if (coords.length < 2) return [];
      const f = {
        type: "Feature",
        properties: { id: e.id },
        geometry: { type: "LineString", coordinates: coords },
      };
      edgeFeatMap.set(e.id, f);
      return f;
    }),
  };

  return { nodeFC, edgeFC, nodeFeatMap, edgeFeatMap };
}


function closestSegmentIdx(nodeIds, nodes, lng, lat) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const a = nodes.get(nodeIds[i]);
    const b = nodes.get(nodeIds[i + 1]);
    if (!a || !b) continue;
    const d = ((a.lng + b.lng) / 2 - lng) ** 2 + ((a.lat + b.lat) / 2 - lat) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}


function exportToGeoJSON({ nodes, edges }) {
  const features = [];
  for (const edge of edges.values()) {
    const coords = edge.nodeIds
      .map((id) => nodes.get(id))
      .filter(Boolean)
      .map((n) => [n.lng, n.lat]);
    if (coords.length < 2) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection", features };
}


export function useNetworkEditor(mapRef, networkData) {
  const addedRef       = useRef(false);
  const netRef         = useRef({ nodes: new Map(), edges: new Map(), nodeEdgeIndex: new Map() });
  const cacheRef       = useRef({ nodeFC: null, edgeFC: null, nodeFeatMap: new Map(), edgeFeatMap: new Map() });
  const draggingRef    = useRef(null);
  const hoveredNodeRef = useRef(null);
  const drawSeqRef     = useRef(0);

  const [contextMenu, setContextMenu] = useState(null);
  const [dirty, setDirty]             = useState(false);
  const [saving, setSaving]           = useState(false);

  const rebuild = (map, geojson) => {
    const net = parseNetwork(geojson);
    const cache = buildCaches(net);
    netRef.current = net;
    cacheRef.current = cache;
    setDirty(false);
    if (map && addedRef.current) {
      map.getSource(EDGE_SOURCE)?.setData(cache.edgeFC);
      map.getSource(NODE_SOURCE)?.setData(cache.nodeFC);
    }
  };

  useEffect(() => {
    if (!networkData) return;
    rebuild(mapRef.current, networkData);
  }, [networkData, mapRef]);

  const markDirty = () => setDirty(true);

  const saveNetwork = useCallback(async () => {
    const geojson = exportToGeoJSON(netRef.current);
    setSaving(true);
    try {
      const res = await fetch("/api/save-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geojson),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Save failed (${res.status}): ${text}`);
      }
      const { file } = await res.json().catch(() => ({}));
      setDirty(false);
      console.log(`Network saved successfully${file ? ` as ${file}` : ""}`);
      return true;
    } catch (err) {
      console.error("Failed to save network:", err);
      alert(`Failed to save network: ${err.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMouseMove = (e) => {
      if (!draggingRef.current) return;
      const { nodeId } = draggingRef.current;
      const { lng, lat } = e.lngLat;
      const { nodes, edges, nodeEdgeIndex } = netRef.current;
      const { nodeFeatMap, edgeFeatMap, nodeFC, edgeFC } = cacheRef.current;

      const node = nodes.get(nodeId);
      if (!node) return;
      node.lng = lng;
      node.lat = lat;

      const nodeFeat = nodeFeatMap.get(nodeId);
      if (nodeFeat) nodeFeat.geometry.coordinates = [lng, lat];

      const connectedEdgeIds = nodeEdgeIndex.get(nodeId) ?? new Set();
      for (const eid of connectedEdgeIds) {
        const edge = edges.get(eid);
        const feat = edgeFeatMap.get(eid);
        if (!edge || !feat) continue;
        feat.geometry.coordinates = edge.nodeIds
          .map((id) => nodes.get(id))
          .filter(Boolean)
          .map((n) => [n.lng, n.lat]);
      }

      map.getSource(NODE_SOURCE)?.setData(nodeFC);
      map.getSource(EDGE_SOURCE)?.setData(edgeFC);
    };

    const onNodeMouseDown = (e) => {
      if (isDrawingEdgesRef.current || isDeletingNodesRef.current) return;
      if (e.originalEvent?.button !== 0) return;
      e.preventDefault();
      const nodeId = e.features?.[0]?.properties?.id;
      if (!nodeId) return;
      const n = netRef.current.nodes.get(nodeId);
      if (!n) return;
      draggingRef.current = { nodeId, origLng: n.lng, origLat: n.lat };
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
      map.setFeatureState({ source: NODE_SOURCE, id: nodeId }, { dragging: true, hover: false });
    };

    const onMouseUp = (e) => {
      if (!draggingRef.current) return;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
      map.setFeatureState({ source: NODE_SOURCE, id: draggingRef.current.nodeId }, { dragging: false });

      const hits = map.queryRenderedFeatures(e.point, { layers: [NODE_LAYER] });
      const target = hits.find((f) => f.properties.id !== draggingRef.current.nodeId);

      if (target) {
        const { nodeId: fromId, origLng, origLat } = draggingRef.current;
        const node = netRef.current.nodes.get(fromId);
        if (node) {
          node.lng = origLng;
          node.lat = origLat;
          const feat = cacheRef.current.nodeFeatMap.get(fromId);
          if (feat) feat.geometry.coordinates = [origLng, origLat];
          const { edges, nodeEdgeIndex } = netRef.current;
          for (const eid of nodeEdgeIndex.get(fromId) ?? []) {
            const edge = edges.get(eid);
            const edgeFeat = cacheRef.current.edgeFeatMap.get(eid);
            if (edge && edgeFeat) {
              edgeFeat.geometry.coordinates = edge.nodeIds
                .map((id) => netRef.current.nodes.get(id))
                .filter(Boolean)
                .map((n) => [n.lng, n.lat]);
            }
          }
        }

        const toId = target.properties.id;
        const newEId = `e_conn_${Date.now()}`;
        const newEdge = { id: newEId, nodeIds: [fromId, toId] };
        netRef.current.edges.set(newEId, newEdge);
        for (const nid of [fromId, toId]) {
          if (!netRef.current.nodeEdgeIndex.has(nid)) netRef.current.nodeEdgeIndex.set(nid, new Set());
          netRef.current.nodeEdgeIndex.get(nid).add(newEId);
        }
        const coords = [fromId, toId]
          .map((id) => netRef.current.nodes.get(id))
          .filter(Boolean)
          .map((n) => [n.lng, n.lat]);
        const newFeat = { type: "Feature", properties: { id: newEId }, geometry: { type: "LineString", coordinates: coords } };
        cacheRef.current.edgeFeatMap.set(newEId, newFeat);
        cacheRef.current.edgeFC.features.push(newFeat);
      }

      const { nodeId: dragId, origLng, origLat } = draggingRef.current;
      const draggedNode = netRef.current.nodes.get(dragId);
      if (draggedNode && (draggedNode.lng !== origLng || draggedNode.lat !== origLat)) {
        markDirty();
      }
      if (target) markDirty();

      map.getSource(NODE_SOURCE)?.setData(cacheRef.current.nodeFC);
      map.getSource(EDGE_SOURCE)?.setData(cacheRef.current.edgeFC);
      draggingRef.current = null;
    };

    const onEdgeContextMenu = (e) => {
      e.preventDefault();
      if (isDrawingEdgesRef.current || isDeletingNodesRef.current) return;
      const edgeId = e.features?.[0]?.properties?.id;
      if (!edgeId) return;
      setContextMenu({ type: "edge", edgeId, x: e.point.x, y: e.point.y, lng: e.lngLat.lng, lat: e.lngLat.lat });
    };

    const onNodeContextMenu = (e) => {
      e.preventDefault();
      if (isDrawingEdgesRef.current || isDeletingNodesRef.current) return;
      if (draggingRef.current) return;
      const nodeId = e.features?.[0]?.properties?.id;
      if (!nodeId) return;
      setContextMenu({ type: "node", nodeId, x: e.point.x, y: e.point.y });
    };

    const onMapClick = () => setContextMenu(null);

    const onNodeEnter = (e) => {
      if (draggingRef.current) return;
      const nodeId = e.features?.[0]?.properties?.id;
      if (!nodeId) return;
      hoveredNodeRef.current = nodeId;
      map.setFeatureState({ source: NODE_SOURCE, id: nodeId }, { hover: true });
      if (!isDrawingEdgesRef.current && !isDeletingNodesRef.current) map.getCanvas().style.cursor = "grab";
    };
    const onNodeLeave = () => {
      if (draggingRef.current) return;
      if (hoveredNodeRef.current) {
        map.setFeatureState({ source: NODE_SOURCE, id: hoveredNodeRef.current }, { hover: false });
        hoveredNodeRef.current = null;
      }
      if (!isDrawingEdgesRef.current && !isDeletingNodesRef.current) map.getCanvas().style.cursor = "";
    };
    const onEdgeEnter = () => { if (!draggingRef.current && !isDrawingEdgesRef.current && !isDeletingNodesRef.current) map.getCanvas().style.cursor = "pointer"; };
    const onEdgeLeave = () => { if (!draggingRef.current && !isDrawingEdgesRef.current && !isDeletingNodesRef.current) map.getCanvas().style.cursor = ""; };

    let cancelled = false;

    const init = () => {
      if (cancelled || addedRef.current) return;
      const { nodeFC, edgeFC } = cacheRef.current;

      map.addSource(EDGE_SOURCE, { type: "geojson", data: edgeFC ?? { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: EDGE_LAYER, type: "line", source: EDGE_SOURCE, minzoom: MESO_ZOOM,
        paint: {
          "line-color": "#e85d04",
          "line-width": ["interpolate", ["linear"], ["zoom"], 16, 3, 18, 4, 20, 5],
          "line-opacity": 1,
        },
      });
      map.addLayer({
        id: EDGE_HIT, type: "line", source: EDGE_SOURCE, minzoom: MICRO_ZOOM,
        paint: { "line-width": 14, "line-opacity": 0 },
      });

      map.addSource(NODE_SOURCE, { type: "geojson", promoteId: "id", data: nodeFC ?? { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: NODE_LAYER, type: "circle", source: NODE_SOURCE, minzoom: MICRO_ZOOM,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 18, 4, 20, 7],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "dragging"], false], "#ff0000",
            ["boolean", ["feature-state", "hover"],    false], "#ffcc00",
            "#e85d04",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      addedRef.current = true;

      map.on("mousedown",   NODE_LAYER, onNodeMouseDown);
      map.on("mousemove",              onMouseMove);
      map.on("mouseup",                onMouseUp);
      map.on("contextmenu", EDGE_HIT,  onEdgeContextMenu);
      map.on("contextmenu", NODE_LAYER, onNodeContextMenu);
      map.on("click",                  onMapClick);
      map.on("mouseenter", NODE_LAYER, onNodeEnter);
      map.on("mouseleave", NODE_LAYER, onNodeLeave);
      map.on("mouseenter", EDGE_HIT,   onEdgeEnter);
      map.on("mouseleave", EDGE_HIT,   onEdgeLeave);
    };

    if (map.isStyleLoaded()) init();
    else map.once("load", init);

    return () => {
      cancelled = true;
      draggingRef.current = null;
      map.off("load", init);
      map.off("mousedown",   NODE_LAYER, onNodeMouseDown);
      map.off("mousemove",              onMouseMove);
      map.off("mouseup",                onMouseUp);
      map.off("contextmenu", EDGE_HIT,  onEdgeContextMenu);
      map.off("contextmenu", NODE_LAYER, onNodeContextMenu);
      map.off("click",                  onMapClick);
      map.off("mouseenter", NODE_LAYER, onNodeEnter);
      map.off("mouseleave", NODE_LAYER, onNodeLeave);
      map.off("mouseenter", EDGE_HIT,   onEdgeEnter);
      map.off("mouseleave", EDGE_HIT,   onEdgeLeave);
      try {
        [NODE_LAYER, EDGE_HIT, EDGE_LAYER].forEach((l) => { if (map.getLayer(l)) map.removeLayer(l); });
        [NODE_SOURCE, EDGE_SOURCE].forEach((s) => { if (map.getSource(s)) map.removeSource(s); });
      } catch { /* map may be gone */ }
      addedRef.current = false;
    };
  }, [mapRef]);

  const splitEdge = (edgeId, lng, lat) => {
    const { nodes, edges, nodeEdgeIndex } = netRef.current;
    const { edgeFeatMap, edgeFC, nodeFeatMap, nodeFC } = cacheRef.current;
    const edge = edges.get(edgeId);
    if (!edge) return;

    const idx = closestSegmentIdx(edge.nodeIds, nodes, lng, lat);
    const ts = Date.now();
    const newNodeId = `n_split_${ts}`;
    const newNode = { id: newNodeId, lng, lat };
    nodes.set(newNodeId, newNode);

    const newNodeFeat = { type: "Feature", properties: { id: newNodeId }, geometry: { type: "Point", coordinates: [lng, lat] } };
    nodeFeatMap.set(newNodeId, newNodeFeat);
    nodeFC.features.push(newNodeFeat);

    const eA = { id: `e_${ts}a`, nodeIds: [...edge.nodeIds.slice(0, idx + 1), newNodeId] };
    const eB = { id: `e_${ts}b`, nodeIds: [newNodeId, ...edge.nodeIds.slice(idx + 1)] };
    edges.delete(edgeId);
    edges.set(eA.id, eA);
    edges.set(eB.id, eB);

    for (const nid of edge.nodeIds) nodeEdgeIndex.get(nid)?.delete(edgeId);
    nodeEdgeIndex.set(newNodeId, new Set([eA.id, eB.id]));
    for (const e of [eA, eB]) {
      for (const nid of e.nodeIds) {
        if (!nodeEdgeIndex.has(nid)) nodeEdgeIndex.set(nid, new Set());
        nodeEdgeIndex.get(nid).add(e.id);
      }
    }

    const oldFeatIdx = edgeFC.features.findIndex((f) => f.properties.id === edgeId);
    if (oldFeatIdx !== -1) edgeFC.features.splice(oldFeatIdx, 1);
    edgeFeatMap.delete(edgeId);

    for (const e of [eA, eB]) {
      const coords = e.nodeIds.map((id) => nodes.get(id)).filter(Boolean).map((n) => [n.lng, n.lat]);
      const f = { type: "Feature", properties: { id: e.id }, geometry: { type: "LineString", coordinates: coords } };
      edgeFeatMap.set(e.id, f);
      edgeFC.features.push(f);
    }

    const map = mapRef.current;
    if (map) {
      map.getSource(NODE_SOURCE)?.setData(nodeFC);
      map.getSource(EDGE_SOURCE)?.setData(edgeFC);
    }
    setContextMenu(null);
    markDirty();
  };

  const deleteNode = (nodeId) => {
    deleteNodes([nodeId]);
    setContextMenu(null);
  };

  const getNodeLngLat = useCallback((nodeId) => {
    const n = netRef.current.nodes.get(nodeId);
    return n ? [n.lng, n.lat] : null;
  }, []);

  const addDrawnNode = useCallback((lng, lat) => {
    const { nodes, nodeEdgeIndex } = netRef.current;
    const { nodeFeatMap, nodeFC } = cacheRef.current;
    if (!nodeFC) return null;

    const id = `n_draw_${Date.now()}_${drawSeqRef.current++}`;
    nodes.set(id, { id, lng, lat });
    nodeEdgeIndex.set(id, new Set());

    const f = { type: "Feature", properties: { id }, geometry: { type: "Point", coordinates: [lng, lat] } };
    nodeFeatMap.set(id, f);
    nodeFC.features.push(f);
    mapRef.current?.getSource(NODE_SOURCE)?.setData(nodeFC);
    return id;
  }, [mapRef]);

  const addDrawnEdge = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return null;
    const { nodes, edges, nodeEdgeIndex } = netRef.current;
    const { edgeFeatMap, edgeFC } = cacheRef.current;
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    if (!from || !to || !edgeFC) return null;

    for (const eid of nodeEdgeIndex.get(fromId) ?? []) {
      const ids = edges.get(eid)?.nodeIds ?? [];
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === fromId && (ids[i - 1] === toId || ids[i + 1] === toId)) return null;
      }
    }

    const id = `e_draw_${Date.now()}_${drawSeqRef.current++}`;
    edges.set(id, { id, nodeIds: [fromId, toId] });
    for (const nid of [fromId, toId]) {
      if (!nodeEdgeIndex.has(nid)) nodeEdgeIndex.set(nid, new Set());
      nodeEdgeIndex.get(nid).add(id);
    }

    const f = {
      type: "Feature",
      properties: { id },
      geometry: { type: "LineString", coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    };
    edgeFeatMap.set(id, f);
    edgeFC.features.push(f);
    mapRef.current?.getSource(EDGE_SOURCE)?.setData(edgeFC);
    markDirty();
    return id;
  }, [mapRef]);

  const removeNodeIfOrphan = useCallback((nodeId) => {
    const { nodes, nodeEdgeIndex } = netRef.current;
    const { nodeFeatMap, nodeFC } = cacheRef.current;
    if (!nodes.has(nodeId)) return;
    if ((nodeEdgeIndex.get(nodeId)?.size ?? 0) > 0) return;

    nodes.delete(nodeId);
    nodeEdgeIndex.delete(nodeId);
    nodeFeatMap.delete(nodeId);
    const idx = nodeFC ? nodeFC.features.findIndex((f) => f.properties.id === nodeId) : -1;
    if (idx !== -1) nodeFC.features.splice(idx, 1);
    mapRef.current?.getSource(NODE_SOURCE)?.setData(nodeFC);
  }, [mapRef]);

  const deleteNodes = useCallback((nodeIds) => {
    const { nodes, edges, nodeEdgeIndex } = netRef.current;
    const { nodeFeatMap, nodeFC, edgeFeatMap, edgeFC } = cacheRef.current;
    if (!nodeFC || !edgeFC) return 0;

    const removedNodes = new Set();
    const removedEdges = new Set();
    for (const nodeId of nodeIds) {
      if (!nodes.has(nodeId)) continue;
      removedNodes.add(nodeId);
      for (const eid of nodeEdgeIndex.get(nodeId) ?? []) removedEdges.add(eid);
    }
    if (removedNodes.size === 0) return 0;

    const touched = new Set();
    for (const eid of removedEdges) {
      const edge = edges.get(eid);
      if (edge) {
        for (const nid of edge.nodeIds) {
          nodeEdgeIndex.get(nid)?.delete(eid);
          if (!removedNodes.has(nid)) touched.add(nid);
        }
      }
      edges.delete(eid);
      edgeFeatMap.delete(eid);
    }
    // removing whole edges can orphan out-of-rectangle member nodes; drop them
    // too, since exportToGeoJSON persists edges only and they would silently
    // vanish on the next save/reload anyway
    for (const nid of touched) {
      if ((nodeEdgeIndex.get(nid)?.size ?? 0) === 0) removedNodes.add(nid);
    }
    for (const nodeId of removedNodes) {
      nodes.delete(nodeId);
      nodeEdgeIndex.delete(nodeId);
      nodeFeatMap.delete(nodeId);
    }
    edgeFC.features = edgeFC.features.filter((f) => !removedEdges.has(f.properties.id));
    nodeFC.features = nodeFC.features.filter((f) => !removedNodes.has(f.properties.id));

    const map = mapRef.current;
    if (map) {
      map.getSource(NODE_SOURCE)?.setData(nodeFC);
      map.getSource(EDGE_SOURCE)?.setData(edgeFC);
    }
    markDirty();
    return removedNodes.size;
  }, [mapRef]);

  return {
    contextMenu, setContextMenu, splitEdge, deleteNode, deleteNodes, saveNetwork, dirty, saving,
    addDrawnNode, addDrawnEdge, removeNodeIfOrphan, getNodeLngLat,
  };
}