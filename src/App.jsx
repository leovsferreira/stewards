import { useState } from "react";
import { MapView } from "./components/Map";
import { useMetadata } from "./hooks/useMetadata";
import { useTiles } from "./hooks/useTiles";
import { TileRow } from "./components/TileRow";
import "./App.css";

const VIEW_LABELS = {
  macro: "8 × 8 Tiles",
  meso: "2 × 2 Tiles",
  micro: "2 × 2 Tiles",
};

const LOADING_LABELS = {
  macro: "Loading 8 × 8 metadata...",
  meso: "Loading 2 × 2 metadata...",
  micro: "Loading 2 × 2 metadata...",
};

const LEVEL_BADGES = {
  macro: "MACRO",
  meso: "MESO",
  micro: "MICRO",
};

export default function App() {
  const [sortKey, setSortKey] = useState("n_uncertain");
  const { meta8x8, meta2x2 } = useMetadata();

  return (
    <div className="page">
      <MapView meta2x2={meta2x2} sortKey={sortKey}>
        {({ bounds, mapZoom, flyToTile, fitToTile, networkData }) => {
          const { tiles, activeMeta, activeMetaById, viewLevel } = useTiles({
            bounds,
            mapZoom,
            meta8x8,
            meta2x2,
            sortKey,
          });

          // Determine click handler per view level
          const getClickHandler = (tile) => {
            switch (viewLevel) {
              case "macro":
                // Clicking 8×8 tile → fly to it (enters meso)
                return () => flyToTile(tile);
              case "meso":
              case "micro":
                // Clicking 2×2 tile → fit exactly (enters/stays micro)
                return () => fitToTile(tile);
              default:
                return undefined;
            }
          };

          // Suggestions visible at meso + micro, hidden at macro
          const showSuggestions = viewLevel !== "macro";

          return (
            <div className={`rightPane ${viewLevel}`}>
              <div className="header">
                <div>
                  <div className="title">
                    {VIEW_LABELS[viewLevel]}
                    <span className="levelBadge">{LEVEL_BADGES[viewLevel]}</span>
                  </div>
                  <div className="sub">
                    {!activeMeta
                      ? LOADING_LABELS[viewLevel]
                      : bounds
                      ? `Zoom ${mapZoom.toFixed(2)} · W ${bounds.west.toFixed(4)} · S ${bounds.south.toFixed(4)} · E ${bounds.east.toFixed(4)} · N ${bounds.north.toFixed(4)}`
                      : "Waiting for map..."}
                  </div>
                </div>

                <div className="controls">
                  <label className="controlLabel">
                    Sort:
                    <select
                      className="select"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value)}
                    >
                      <option value="n_uncertain">n_uncertain</option>
                      <option value="n_uncertain_not_sw">n_uncertain_not_sw</option>
                      <option value="mean_conf_uncertain">mean_conf_uncertain</option>
                      <option value="mean_conf_uncertain_not_sw">
                        mean_conf_uncertain_not_sw
                      </option>
                    </select>
                  </label>
                  <div className="count">{tiles.length} tiles</div>
                </div>
              </div>

              <div className="list">
                {tiles.map((t) => (
                  <TileRow
                    key={`${t.z}_${t.id}`}
                    tile={t}
                    meta={activeMetaById?.get(t.id)}
                    sortKey={sortKey}
                    onClick={getClickHandler(t)}
                    showSuggestions={showSuggestions}
                    networkData={networkData}
                    thumbSize={viewLevel === "macro" ? 300 : 160}
                  />
                ))}
              </div>
            </div>
          );
        }}
      </MapView>
    </div>
  );
}