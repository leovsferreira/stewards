import { useState } from "react";
import { NetworkOverlay } from "./NetworkOverlay";

/**
 * TileRow displays a tile thumbnail with optional network overlay + suggestion cards.
 *
 * Props:
 *   tile            – { z, x, y, id }
 *   meta            – metadata record for the tile (or undefined)
 *   sortKey         – active metric key
 *   onClick         – click handler for the thumbnail
 *   showSuggestions – whether to render the suggestion cards
 *   networkData     – parsed GeoJSON FeatureCollection (or null)
 *   thumbSize       – thumbnail pixel size (default 160)
 */
export function TileRow({ tile, meta, sortKey, onClick, showSuggestions, networkData, thumbSize = 160 }) {
  const imgUrl = `/tiles/${tile.z}/${tile.x}/${tile.y}.jpg`;
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const val = meta?.[sortKey];
  const valStr =
    val === undefined || val === null
      ? "—"
      : sortKey.startsWith("mean_")
      ? Number(val).toFixed(2)
      : String(Number(val));

  return (
    <div className="row">
      <div
        className={`thumbWrap ${onClick ? "tileClickable" : ""}`}
        onClick={onClick}
        style={{ width: thumbSize, minWidth: thumbSize }}
      >
        <div className="thumbContainer" style={{ width: thumbSize, height: thumbSize }}>
          <img
            src={imgUrl}
            className="thumb"
            style={{ width: thumbSize, height: thumbSize }}
            loading="lazy"
            onError={() => setHidden(true)}
          />
          {networkData && (
            <NetworkOverlay tile={tile} networkData={networkData} size={thumbSize} />
          )}
        </div>
        <div className="tileLabel">
          {tile.id} · {valStr}
        </div>
      </div>

      {showSuggestions && (
        <div className="suggestionsWrap">
          <div className="suggestionsScroller">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="suggestionCard">
                Suggestion {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}