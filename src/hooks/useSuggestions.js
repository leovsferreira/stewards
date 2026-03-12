import { useState, useEffect } from "react";

/**
 * Loads /polygon_suggestions_zoom18.geojson and returns a nested index:
 *   suggestions: Map<tileId, Map<nSuggestion, GeoJSON.Feature[]>>
 *
 * n_suggestion=0  → original polygons
 * n_suggestion>0  → suggestion variant
 */
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState(null);

  useEffect(() => {
    fetch("/polygons.geojson")
      .then((r) => r.json())
      .then((fc) => {
        const byTile = new Map();
        for (const feature of fc.features) {
          const { tile_id, n_suggestion } = feature.properties;
          if (!byTile.has(tile_id)) byTile.set(tile_id, new Map());
          const byN = byTile.get(tile_id);
          if (!byN.has(n_suggestion)) byN.set(n_suggestion, []);
          byN.get(n_suggestion).push(feature);
        }
        setSuggestions(byTile);
      })
      .catch((err) => console.error("Failed to load suggestions:", err));
  }, []);

  return { suggestions };
}