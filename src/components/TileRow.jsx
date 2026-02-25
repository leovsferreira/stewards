import { useState } from "react";

/**
 * TileRow displays a tile thumbnail + optional suggestion cards.
 *
 * Props:
 *   tile        – { z, x, y, id }
 *   meta        – metadata record for the tile (or undefined)
 *   sortKey     – active metric key
 *   onClick     – click handler for the thumbnail (always provided now)
 *   showSuggestions – whether to render the suggestion cards
 */
export function TileRow({ tile, meta, sortKey, onClick, showSuggestions }) {
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
      >
        <img
          src={imgUrl}
          className="thumb"
          loading="lazy"
          onError={() => setHidden(true)}
        />
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