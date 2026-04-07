import { useState } from "react";
import { NetworkOverlay } from "./NetworkOverlay";
import { SuggestionOverlay } from "./SuggestionOverlay";

export function TileRow({
  tile,
  meta,
  sortKey,
  onClick,
  showSuggestions,
  networkData,
  thumbSize = 160,
  tileSuggestions = null,
  selectedKeys = new Set(),
  onToggleSuggestion,
}) {
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

  const suggestionEntries = tileSuggestions
    ? [...tileSuggestions.entries()]
        .filter(([n]) => n > 0)
        .sort(([a], [b]) => a - b)
    : [];

  const originalFeatures = tileSuggestions?.get(0) ?? null;

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
          {originalFeatures && (
            <SuggestionOverlay tile={tile} features={originalFeatures} size={thumbSize} />
          )}
        </div>
        <div className="tileLabel">
          {tile.id} · {valStr}
        </div>
      </div>

      {showSuggestions && (
        <div className="suggestionsWrap">
          <div className="suggestionsScroller">
            {suggestionEntries.length > 0
              ? suggestionEntries.map(([n, features]) => {
                  const isSelected = selectedKeys.has(`${tile.id}:${n}`);
                  return (
                    <div
                      key={n}
                      className={`suggestionCard ${isSelected ? "suggestionSelected" : ""}`}
                      style={{
                        padding: 0,
                        overflow: "hidden",
                        minWidth: thumbSize,
                        width: thumbSize,
                        height: thumbSize,
                        borderRadius: 8,
                        flexShrink: 0,
                        cursor: "pointer",
                      }}
                      onClick={() => onToggleSuggestion?.(tile.id, n)}
                    >
                      <div
                        className="thumbContainer"
                        style={{ width: thumbSize, height: thumbSize, borderRadius: 0 }}
                      >
                        <img
                          src={imgUrl}
                          style={{ width: thumbSize, height: thumbSize, display: "block" }}
                          loading="lazy"
                        />
                        {networkData && (
                          <NetworkOverlay tile={tile} networkData={networkData} size={thumbSize} />
                        )}
                        <SuggestionOverlay
                          tile={tile}
                          features={features}
                          size={thumbSize}
                          fillColor="rgba(34, 197, 94, 0.22)"
                          strokeColor="#22c55e"
                        />

                        <span className={`suggestionCheckbox ${isSelected ? "checked" : ""}`}>
                          {isSelected && (
                            <svg viewBox="0 0 12 12" width="10" height="10">
                              <path d="M2.5 6l2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              : (
                  <div className="mesoNoSuggestions">
                    No suggestions for this area
                  </div>
                )}
          </div>
        </div>
      )}
    </div>
  );
}