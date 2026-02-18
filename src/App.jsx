import { useState } from "react";
import { MapView } from "./components/Map";
import { useMetadata } from "./hooks/useMetadata";
import { useTiles } from "./hooks/useTiles";
import { TileRow } from "./components/TileRow";
import "./App.css";

export default function App() {
  const [sortKey, setSortKey] = useState("n_uncertain");
  const { meta8x8, meta2x2 } = useMetadata();

  return (
    <div className="page">
      <MapView meta2x2={meta2x2} sortKey={sortKey}>
        {({ bounds, mapZoom, flyToTile }) => {
          const { tiles, activeMeta, activeMetaById, isDetailMode } = useTiles({
            bounds,
            mapZoom,
            meta8x8,
            meta2x2,
            sortKey,
          });

          const titleText = isDetailMode ? "2 x 2 Tiles" : "8 x 8 Tiles";
          const loadingText = isDetailMode
            ? "Loading 2 x 2 metadata..."
            : "Loading 8 x 8 metadata...";

          return (
            <div className="rightPane">
              <div className="header">
                <div>
                  <div className="title">{titleText}</div>
                  <div className="sub">
                    {!activeMeta
                      ? loadingText
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
                    clickable={!isDetailMode}
                    onClick={!isDetailMode ? () => flyToTile(t) : undefined}
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