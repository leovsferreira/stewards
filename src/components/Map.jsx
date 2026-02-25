import { useState } from "react";
import { useMap } from "../hooks/useMap";
import { useHeatmap } from "../hooks/useHeatmap";

function formatValue(v) {
  if (v === undefined || v === null) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function MapView({ meta2x2, sortKey, children }) {
  const { mapContainerRef, mapRef, bounds, mapZoom, flyToTile, fitToTile } = useMap();
  const [heatmapOn, setHeatmapOn] = useState(true);

  const valueRange = useHeatmap(mapRef, meta2x2, sortKey, heatmapOn);

  return (
    <>
      <div className="leftPane">
        <div ref={mapContainerRef} className="map" />

        {/* Heatmap toggle */}
        <div className="mapOverlayControl">
          <label className="toggleLabel">
            <span className="toggleIcon">🌡</span>
            <span className="toggleText">Heatmap</span>
            <span
              className={`toggleTrack ${heatmapOn ? "on" : ""}`}
              onClick={() => setHeatmapOn((v) => !v)}
            >
              <span className="toggleThumb" />
            </span>
          </label>
        </div>

        {/* Colour scale legend */}
        {heatmapOn && (
          <div className="mapLegend">
            <div className="legendTitle">{sortKey}</div>
            <div className="legendBar" />
            <div className="legendLabels">
              <span>{formatValue(valueRange.min)}</span>
              <span>{formatValue(valueRange.max)}</span>
            </div>
          </div>
        )}
      </div>

      {children({ bounds, mapZoom, flyToTile, fitToTile })}
    </>
  );
}