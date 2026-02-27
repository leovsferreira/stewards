import { useEffect, useRef, useState } from "react";

const EDGE_SOURCE   = "editor-edges-source";
const EDGE_LAYER    = "editor-edges-layer";
const EDGE_HIT      = "editor-edges-hit";   // transparent wide layer for easier right-click
const NODE_SOURCE   = "editor-nodes-source";
const NODE_LAYER    = "editor-nodes-layer";
const MESO_ZOOM     = 16;

// ── Parse raw GeoJSON into a node/edge graph ─────────────────────────────────
// Nodes are unique coordinates (keyed by rounded lng,lat).
// Edges are the LineString segments, referencing node IDs.

function parseNetwork(geojson) {
  const byKey = new Map(); // "lng,lat" → node
  const edges = [];
  let nc = 0, ec = 0;

  const getNode = (lng, lat) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    if (!byKey.has(key)) byKey.set(key, { id: `n${nc++}`, lng, lat });
    return byKey.get(key).id;
  };

  for (const f of geojson?.features ?? []) {
    const rings =
      f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    for (const ring of rings) {
      const nodeIds = ring.map(([lng, lat]) => getNode(lng, lat));
      if (nodeIds.length >= 2) edges.push({ id: `e${ec++}`, nodeIds });
    }
  }

  return {
    nodes: new Map([...byKey.values()].map((n) => [n.id, n])),
    edges: new Map(edges.map((e) => [e.id, e])),
  };
}

// ── Build GeoJSON for MapLibre sources ───────────────────────────────────────

function buildEdgesGeoJSON({ nodes, edges }) {
  return {
    type: "FeatureCollection",
    features: [...edges.values()].flatMap((e) => {
      const coords = e.nodeIds
        .map((id) => nodes.get(id))
        .filter(Boolean)
        .map((n) => [n.lng, n.lat]);
      if (coords.length < 2) return [];
      return [{
        type: "Feature",
        properties: { id: e.id },
        geometry: { type: "LineString", coordinates: coords },
      }];
    }),
  };
}

function buildNodesGeoJSON({ nodes }) {
  return {
    type: "FeatureCollection",
    features: [...nodes.values()].map((n) => ({
      type: "Feature",
      properties: { id: n.id },
      geometry: { type: "Point", coordinates: [n.lng, n.lat] },
    })),
  };
}

// ── Push latest data to MapLibre sources ─────────────────────────────────────

function syncData(map, net) {
  if (!map) return;
  map.getSource(EDGE_SOURCE)?.setData(buildEdgesGeoJSON(net));
  map.getSource(NODE_SOURCE)?.setData(buildNodesGeoJSON(net));
}

// ── Find which segment of a polyline is closest to a lng/lat point ───────────

function closestSegmentIdx(nodeIds, nodes, lng, lat) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const a = nodes.get(nodeIds[i]);
    const b = nodes.get(nodeIds[i + 1]);
    if (!a || !b) continue;
    const mx = (a.lng + b.lng) / 2;
    const my = (a.lat + b.lat) / 2;
    const d = (mx - lng) ** 2 + (my - lat) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Replaces useNetwork with an interactive editor.
 *
 * Interactions:
 *   • Drag node   → move it; all connected edges follow.
 *   • Drag node onto another node → snap back + create a new edge between them.
 *   • Right-click edge → context menu → Split Edge (inserts node at click point).
 *
 * Returns { contextMenu, setContextMenu, splitEdge } for the overlay component.
 */
export function useNetworkEditor(mapRef, networkData) {
  const addedRef    = useRef(false);
  const netRef      = useRef({ nodes: new Map(), edges: new Map() });
  const draggingRef = useRef(null); // { nodeId, origLng, origLat }

  const [contextMenu, setContextMenu] = useState(null); // { edgeId, x, y, lng, lat }

  // ── Parse data when it arrives ──────────────────────────────────────────────
  useEffect(() => {
    if (!networkData) return;
    netRef.current = parseNetwork(networkData);
    const map = mapRef.current;
    if (map && addedRef.current) syncData(map, netRef.current);
  }, [networkData, mapRef]);

  // ── Mount: add MapLibre layers + attach events ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // All handlers close over mapRef/netRef/draggingRef — always see latest values.

    const onNodeMouseDown = (e) => {
      e.preventDefault();
      const nodeId = e.features?.[0]?.properties?.id;
      if (!nodeId) return;
      const n = netRef.current.nodes.get(nodeId);
      if (!n) return;
      draggingRef.current = { nodeId, origLng: n.lng, origLat: n.lat };
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };

    const onMouseMove = (e) => {
      if (!draggingRef.current) return;
      const { lng, lat } = e.lngLat;
      const { nodes, edges } = netRef.current;
      const node = nodes.get(draggingRef.current.nodeId);
      if (!node) return;
      const newNodes = new Map(nodes);
      newNodes.set(node.id, { ...node, lng, lat });
      netRef.current = { nodes: newNodes, edges };
      syncData(map, netRef.current);
    };

    const onMouseUp = (e) => {
      if (!draggingRef.current) return;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";

      // Check if dropped onto a different node → create edge, snap back
      const hits = map.queryRenderedFeatures(e.point, { layers: [NODE_LAYER] });
      const target = hits.find((f) => f.properties.id !== draggingRef.current.nodeId);

      if (target) {
        const { nodeId: fromId, origLng, origLat } = draggingRef.current;
        const toId = target.properties.id;

        // Snap dragged node back to its original position
        const nodes = new Map(netRef.current.nodes);
        const orig = nodes.get(fromId);
        if (orig) nodes.set(fromId, { ...orig, lng: origLng, lat: origLat });

        // Add new edge
        const edges = new Map(netRef.current.edges);
        const newEId = `e_conn_${Date.now()}`;
        edges.set(newEId, { id: newEId, nodeIds: [fromId, toId] });

        netRef.current = { nodes, edges };
        syncData(map, netRef.current);
      }

      draggingRef.current = null;
    };

    const onEdgeContextMenu = (e) => {
      e.preventDefault();
      const edgeId = e.features?.[0]?.properties?.id;
      if (!edgeId) return;
      setContextMenu({
        edgeId,
        x: e.point.x,
        y: e.point.y,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    };

    const onMapClick = () => setContextMenu(null);

    const onNodeEnter = () => { if (!draggingRef.current) map.getCanvas().style.cursor = "grab"; };
    const onNodeLeave = () => { if (!draggingRef.current) map.getCanvas().style.cursor = ""; };
    const onEdgeEnter = () => { if (!draggingRef.current) map.getCanvas().style.cursor = "pointer"; };
    const onEdgeLeave = () => { if (!draggingRef.current) map.getCanvas().style.cursor = ""; };

    let cancelled = false;

    const init = () => {
      if (cancelled || addedRef.current) return;

      const net = netRef.current;

      // ── Edge visual layer ──────────────────────────────────────────
      map.addSource(EDGE_SOURCE, { type: "geojson", data: buildEdgesGeoJSON(net) });
      map.addLayer({
        id: EDGE_LAYER,
        type: "line",
        source: EDGE_SOURCE,
        minzoom: MESO_ZOOM,
        paint: {
          "line-color": "#e85d04",
          "line-width": ["interpolate", ["linear"], ["zoom"], 16, 1, 18, 2, 20, 3],
          "line-opacity": 1,
        },
      });

      // ── Edge hit layer (transparent, wider — easier to right-click) ──
      map.addLayer({
        id: EDGE_HIT,
        type: "line",
        source: EDGE_SOURCE,
        minzoom: MESO_ZOOM,
        paint: { "line-width": 14, "line-opacity": 0 },
      });

      // ── Node layer ─────────────────────────────────────────────────
      map.addSource(NODE_SOURCE, { type: "geojson", data: buildNodesGeoJSON(net) });
      map.addLayer({
        id: NODE_LAYER,
        type: "circle",
        source: NODE_SOURCE,
        minzoom: MESO_ZOOM,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 2.5, 18, 4.5, 20, 7],
          "circle-color": "#ffffff",
          "circle-stroke-color": "#e85d04",
          "circle-stroke-width": 1.5,
          "circle-opacity": 1,
        },
      });

      addedRef.current = true;

      map.on("mousedown", NODE_LAYER, onNodeMouseDown);
      map.on("mousemove",             onMouseMove);
      map.on("mouseup",               onMouseUp);
      map.on("contextmenu", EDGE_HIT, onEdgeContextMenu);
      map.on("click",                 onMapClick);
      map.on("mouseenter", NODE_LAYER, onNodeEnter);
      map.on("mouseleave", NODE_LAYER, onNodeLeave);
      map.on("mouseenter", EDGE_HIT,  onEdgeEnter);
      map.on("mouseleave", EDGE_HIT,  onEdgeLeave);
    };

    if (map.isStyleLoaded()) init();
    else map.once("load", init);

    return () => {
      cancelled = true;
      draggingRef.current = null;
      map.off("load", init);
      map.off("mousedown", NODE_LAYER, onNodeMouseDown);
      map.off("mousemove",             onMouseMove);
      map.off("mouseup",               onMouseUp);
      map.off("contextmenu", EDGE_HIT, onEdgeContextMenu);
      map.off("click",                 onMapClick);
      map.off("mouseenter", NODE_LAYER, onNodeEnter);
      map.off("mouseleave", NODE_LAYER, onNodeLeave);
      map.off("mouseenter", EDGE_HIT,  onEdgeEnter);
      map.off("mouseleave", EDGE_HIT,  onEdgeLeave);
      try {
        [NODE_LAYER, EDGE_HIT, EDGE_LAYER].forEach((l) => { if (map.getLayer(l)) map.removeLayer(l); });
        [NODE_SOURCE, EDGE_SOURCE].forEach((s) => { if (map.getSource(s)) map.removeSource(s); });
      } catch { /* map may be gone */ }
      addedRef.current = false;
    };
  }, [mapRef]); // intentionally only mapRef — handlers read state via refs

  // ── Split edge action (called from context menu) ──────────────────────────
  const splitEdge = (edgeId, lng, lat) => {
    const { nodes, edges } = netRef.current;
    const edge = edges.get(edgeId);
    if (!edge) return;

    const idx = closestSegmentIdx(edge.nodeIds, nodes, lng, lat);
    const ts  = Date.now();
    const newNodeId = `n_split_${ts}`;

    const newNodes = new Map(nodes);
    newNodes.set(newNodeId, { id: newNodeId, lng, lat });

    const newEdges = new Map(edges);
    newEdges.delete(edgeId);
    const eA = { id: `e_${ts}a`, nodeIds: [...edge.nodeIds.slice(0, idx + 1), newNodeId] };
    const eB = { id: `e_${ts}b`, nodeIds: [newNodeId, ...edge.nodeIds.slice(idx + 1)] };
    newEdges.set(eA.id, eA);
    newEdges.set(eB.id, eB);

    netRef.current = { nodes: newNodes, edges: newEdges };
    const map = mapRef.current;
    if (map) syncData(map, netRef.current);
    setContextMenu(null);
  };

  return { contextMenu, setContextMenu, splitEdge };
}