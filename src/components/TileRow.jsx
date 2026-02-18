import { useState } from "react";

export function TileRow({ tile, meta, sortKey, clickable, onClick }) {
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
        className={`thumbWrap ${clickable ? "tileClickable" : ""}`}
        onClick={clickable ? onClick : undefined}
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

      <div className="suggestionsWrap">
        <div className="suggestionsScroller">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="suggestionCard">
              Suggestion {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}