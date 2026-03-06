import { useMemo } from "react";
import { tilesForBounds } from "../utils/tileUtils";

/**
 * View levels:
 *   "macro" — zoom < 16  → z16 (8×8) tiles, no suggestions
 *   "meso"  — 16 ≤ zoom < 18.5 → z18 (2×2) tiles + suggestions
 *   "micro" — zoom ≥ 18.5 → z18 (2×2) tiles + suggestions (single-tile focus)
 */
const MESO_ZOOM  = 16;
const MICRO_ZOOM = 18.5;

function getViewLevel(zoom) {
  if (zoom >= MICRO_ZOOM) return "micro";
  if (zoom >= MESO_ZOOM)  return "meso";
  return "macro";
}

/**
 * @param {object}        bounds       – map viewport bounds
 * @param {number}        mapZoom      – current map zoom level
 * @param {Array|null}    meta8x8      – z16 metadata array
 * @param {Array|null}    meta2x2      – z18 metadata array
 * @param {string}        sortKey      – active metric key for ordering
 * @param {Set<string>|null} filteredIds – tile_ids passing PCP filter (null = show all)
 */
export function useTiles({ bounds, mapZoom, meta8x8, meta2x2, sortKey, filteredIds }) {
  const viewLevel  = getViewLevel(mapZoom);
  const activeZ    = viewLevel === "macro" ? 16 : 18;
  const activeMeta = viewLevel === "macro" ? meta8x8 : meta2x2;

  const activeAvailable = useMemo(() => {
    if (!activeMeta) return null;
    return new Set(activeMeta.map((r) => r.tile_id));
  }, [activeMeta]);

  const activeMetaById = useMemo(() => {
    if (!activeMeta) return null;
    const m = new Map();
    for (const r of activeMeta) m.set(r.tile_id, r);
    return m;
  }, [activeMeta]);

  // Viewport tiles BEFORE applying PCP filter — stable reference for PCP lines
  const viewportTiles = useMemo(() => {
    if (!bounds || !activeAvailable || !activeMetaById) return [];
    return tilesForBounds(bounds, activeZ).filter((t) => activeAvailable.has(t.id));
  }, [bounds, activeAvailable, activeMetaById, activeZ]);

  const viewportTileIds = useMemo(
    () => new Set(viewportTiles.map((t) => t.id)),
    [viewportTiles]
  );

  const tiles = useMemo(() => {
    let visible = viewportTiles;

    // Apply PCP filter only in macro view
    if (viewLevel === "macro" && filteredIds !== null) {
      visible = visible.filter((t) => filteredIds.has(t.id));
    }

    return [...visible].sort((a, b) => {
      const va = Number(activeMetaById?.get(a.id)?.[sortKey] ?? -Infinity);
      const vb = Number(activeMetaById?.get(b.id)?.[sortKey] ?? -Infinity);
      return vb - va; // descending
    });
  }, [viewportTiles, viewLevel, filteredIds, activeMetaById, sortKey]);

  return { tiles, viewportTileIds, activeMeta, activeMetaById, activeZ, viewLevel };
}