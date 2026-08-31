import { useState, useEffect, useRef } from "react";
import { useMap } from "../hooks/useMap";
import { useHeatmap } from "../hooks/useHeatmap";
import { useNetworkEditor } from "../hooks/useNetworkEditor";
import { useDrawEdges } from "../hooks/useDrawEdges";
import { useDeleteNodes } from "../hooks/useDeleteNodes";
import { undoHistory, redoHistory, useHistorySnapshot } from "../hooks/history";
import { isGestureActiveRef } from "../hooks/drawingState";
import { useNetworkData } from "../hooks/useNetworkData";
import { useStreetView } from "../hooks/useStreetView";
import { NetworkEditorMenu } from "./NetworkEditorMenu";
import { StreetViewPanel } from "./StreetViewPanel";
import { tileToLngLatBounds } from "../utils/tileUtils";

import { MICRO_ZOOM } from "../utils/viewConfig";

function formatValue(v) {
  if (v === undefined || v === null) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

function TileSelectorOverlay({ mapRef, selectedTiles, previewTiles, brushActive }) {
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const map = mapRef.current;
    const allTiles = brushActive
      ? new Set([...selectedTiles, ...previewTiles])
      : selectedTiles;

    if (!map || allTiles.size === 0) {
      setPositions([]);
      return;
    }

    const reproject = () => {
      const pts = [];
      for (const tid of allTiles) {
        const [x, y] = tid.split("_").map(Number);
        const [w, , , n] = tileToLngLatBounds(x, y, 18);
        const px = map.project([w, n]);
        pts.push({
          tid,
          px: px.x,
          py: px.y,
          isPreview: previewTiles.has(tid) && !selectedTiles.has(tid),
        });
      }
      setPositions(pts);
    };

    reproject();
    map.on("move", reproject);
    map.on("zoom", reproject);
    return () => {
      map.off("move", reproject);
      map.off("zoom", reproject);
    };
  }, [mapRef, selectedTiles, previewTiles, brushActive]);

  if (positions.length === 0) return null;

  return (
    <>
      {positions.map(({ tid, px, py, isPreview }) => (
        <div
          key={tid}
          style={{
            position:       "absolute",
            left:           px + 5,
            top:            py + 5,
            width:          16,
            height:         16,
            borderRadius:   4,
            background:     isPreview ? "rgba(74,144,217,0.25)" : "#4a90d9",
            border:         isPreview ? "1.5px solid #4a90d9" : "1.5px solid #fff",
            boxShadow:      "0 1px 4px rgba(0,0,0,0.2)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            pointerEvents:  "none",
            zIndex:         10,
            transition:     "background 0.1s",
          }}
        >
          {!isPreview && (
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path
                d="M2.5 6l2.5 2.5 4.5-5"
                fill="none" stroke="#fff"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      ))}
    </>
  );
}


export function MapView({
  meta2x2,
  sortKey,
  filterIds   = null,
  brushActive = false,
  selectedTiles,
  previewTiles,
  isDrawing   = false,
  onToggleDraw,
  isDrawingEdges = false,
  onToggleDrawEdges,
  onCancelDrawEdges,
  isDeletingNodes = false,
  onToggleDeleteNodes,
  onCancelDeleteNodes,
  children,
}) {
  const { mapContainerRef, mapRef, bounds, mapZoom, flyToTile, fitToTile } = useMap();
  const [heatmapOn, setHeatmapOn] = useState(true);

  const valueRange = useHeatmap(mapRef, meta2x2, sortKey, heatmapOn && mapZoom < 16, filterIds);

  const { data: networkData, reload: reloadNetwork } = useNetworkData();
  const {
    contextMenu, setContextMenu, splitEdge, deleteNode, deleteNodes, saveNetwork, dirty, saving,
    addDrawnNode, addDrawnEdge, removeNodeIfOrphan, getNodeLngLat, getNodeDegree,
  } = useNetworkEditor(mapRef, networkData);

  useDrawEdges(
    mapRef,
    isDrawingEdges,
    { addDrawnNode, addDrawnEdge, removeNodeIfOrphan, getNodeLngLat, getNodeDegree },
    onCancelDrawEdges,
    networkData,
    brushActive,
  );

  useDeleteNodes(
    mapRef,
    isDeletingNodes,
    { deleteNodes, getNodeLngLat },
    onCancelDeleteNodes,
    brushActive,
  );

  const isMicro = mapZoom >= MICRO_ZOOM;

  // both modes depend on the rendered node layer (minzoom 18.5), so neither
  // can outlive the microview
  useEffect(() => {
    if (isDrawingEdges && !isMicro) onCancelDrawEdges?.();
    if (isDeletingNodes && !isMicro) onCancelDeleteNodes?.();
  }, [isDrawingEdges, isDeletingNodes, isMicro, onCancelDrawEdges, onCancelDeleteNodes]);

  const { canUndo, canRedo } = useHistorySnapshot();
  const isMicroRef = useRef(isMicro);
  isMicroRef.current = isMicro;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  // closes any open context menu (its target may have been undone away) and
  // pans to the reverted edit when it happened off-screen, so undo is never
  // an invisible change
  const applyHistory = (fn) => {
    // checked here (not only in the keydown guard) so the arrow buttons are
    // also blocked during a live gesture or an in-flight save
    if (isGestureActiveRef.current || savingRef.current) return;
    const entry = fn();
    if (!entry) return;
    setContextMenu(null);
    const map = mapRef.current;
    if (map && entry.at && !map.getBounds().contains(entry.at)) {
      map.easeTo({ center: entry.at, duration: 400 });
    }
  };
  const applyHistoryRef = useRef(applyHistory);
  applyHistoryRef.current = applyHistory;

  const togglesRef = useRef({});
  togglesRef.current = {
    draw: onToggleDraw,
    drawEdges: onToggleDrawEdges,
    deleteNodes: onToggleDeleteNodes,
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!isMicroRef.current) return;
      const t = e.target;
      if (t instanceof HTMLElement &&
          (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (isGestureActiveRef.current || savingRef.current) return;
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          applyHistoryRef.current(undoHistory);
        } else if (k === "y" || (k === "z" && e.shiftKey)) {
          e.preventDefault();
          applyHistoryRef.current(redoHistory);
        }
        return;
      }

      // plain-letter mode toggles: p = draw polygon, l = draw edges,
      // d = delete nodes in an area (shift is the tile-brush modifier)
      if (e.altKey || e.shiftKey || e.repeat) return;
      if (isGestureActiveRef.current) return;
      if (k === "p")      togglesRef.current.draw?.();
      else if (k === "l") togglesRef.current.drawEdges?.();
      else if (k === "d") togglesRef.current.deleteNodes?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { panel: svPanel, closePanel: closeSV, onPanoChange } =
    useStreetView(mapRef, mapZoom, brushActive);

  const handleSave = async () => {
    const ok = await saveNetwork();
    // reloading after a failed save would wipe the unsaved edits and clear dirty
    if (ok) {
      reloadNetwork().catch((err) => {
        console.error("Reload after save failed:", err);
        alert("Saved, but reloading the network failed — please refresh the page.");
      });
    }
  };

  return (
    <>
      <div className="leftPane" style={{ position: "relative" }}>
        <div ref={mapContainerRef} className="map" />

        <TileSelectorOverlay
          mapRef={mapRef}
          selectedTiles={selectedTiles ?? new Set()}
          previewTiles={previewTiles   ?? new Set()}
          brushActive={brushActive}
        />

        <NetworkEditorMenu
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          splitEdge={splitEdge}
          deleteNode={deleteNode}
        />

        {mapZoom < 16 && (
          <div className="mapOverlayControl">
            <label className="toggleLabel">
              <span className="toggleText">Heatmap</span>
              <span
                className={`toggleTrack ${heatmapOn ? "on" : ""}`}
                onClick={() => setHeatmapOn((v) => !v)}
              >
                <span className="toggleThumb" />
              </span>
            </label>
          </div>
        )}

        {heatmapOn && mapZoom < 16 && (
          <div className="mapLegend">
            <div className="legendTitle">{sortKey}</div>
            <div className="legendBar" />
            <div className="legendLabels">
              <span>{formatValue(valueRange.min)}</span>
              <span>{formatValue(valueRange.max)}</span>
            </div>
          </div>
        )}

        {isMicro && (
          <button
            className={`drawPolygonBtn${isDrawing ? " active" : ""}`}
            onClick={onToggleDraw}
            title={isDrawing ? "Cancel drawing (Esc)" : "Draw polygon (P)"}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <polygon points="8,1 14,5 14,11 8,15 2,11 2,5" />
              <circle cx="8"  cy="1"  r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="5"  r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="11" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="8"  cy="15" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="2"  cy="11" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="2"  cy="5"  r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}

        {isMicro && (
          <button
            className={`drawEdgeBtn${isDrawingEdges ? " active" : ""}`}
            onClick={onToggleDrawEdges}
            title={isDrawingEdges ? "Cancel edge drawing (Esc)" : "Draw edges (L)"}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <polyline points="2,13 8,9 14,3" />
              <circle cx="2"  cy="13" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="8"  cy="9"  r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="3"  r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}

        {isMicro && (
          <button
            className={`deleteNodesBtn${isDeletingNodes ? " active" : ""}`}
            onClick={onToggleDeleteNodes}
            title={isDeletingNodes ? "Cancel node deletion (Esc)" : "Delete nodes in an area (D)"}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M2.5 4.5h11" />
              <path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
              <path d="M3.5 4.5l.7 8.6a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-8.6" />
              <path d="M6.3 7.5v3.5" />
              <path d="M9.7 7.5v3.5" />
            </svg>
          </button>
        )}

        {isMicro && (
          <button
            className="historyBtn undoBtn"
            onClick={() => applyHistory(undoHistory)}
            disabled={!canUndo || saving}
            title="Undo (Ctrl+Z)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M6.5 3.5 3 7l3.5 3.5" />
              <path d="M3 7h6a4 4 0 0 1 4 4v1.5" />
            </svg>
          </button>
        )}

        {isMicro && (
          <button
            className="historyBtn redoBtn"
            onClick={() => applyHistory(redoHistory)}
            disabled={!canRedo || saving}
            title="Redo (Ctrl+Y)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M9.5 3.5 13 7l-3.5 3.5" />
              <path d="M13 7H7a4 4 0 0 0-4 4v1.5" />
            </svg>
          </button>
        )}

        <StreetViewPanel panel={svPanel} onClose={closeSV} onPanoChange={onPanoChange} />
      </div>

      {children({ bounds, mapZoom, flyToTile, fitToTile, networkData, mapRef, reloadNetwork, dirty, saving, handleSave })}
    </>
  );
}