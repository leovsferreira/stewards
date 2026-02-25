import { useMemo } from "react";
import { tilesForBounds } from "../utils/tileUtils";

/**
 * View levels:
 *   "macro" — zoom < 16  → z16 (8×8) tiles, no suggestions
 *   "meso"  — 16 ≤ zoom < 18.5 → z18 (2×2) tiles + suggestions
 *   "micro" — zoom ≥ 18.5 → z18 (2×2) tiles + suggestions (single-tile focus)
 */
const MESO_ZOOM = 16;
const MICRO_ZOOM = 18.5;

function getViewLevel(zoom) {
  if (zoom >= MICRO_ZOOM) return "micro";
  if (zoom >= MESO_ZOOM) return "meso";
  return "macro";
}

export function useTiles({ bounds, mapZoom, meta8x8, meta2x2, sortKey }) {
  const viewLevel = getViewLevel(mapZoom);
  const activeZ = viewLevel === "macro" ? 16 : 18;
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

  const tiles = useMemo(() => {
    if (!bounds || !activeAvailable || !activeMetaById) return [];

    const all = tilesForBounds(bounds, activeZ);
    const visible = all.filter((t) => activeAvailable.has(t.id));

    visible.sort((a, b) => {
      const va = Number(activeMetaById.get(a.id)?.[sortKey] ?? -Infinity);
      const vb = Number(activeMetaById.get(b.id)?.[sortKey] ?? -Infinity);
      return vb - va;
    });

    return visible;
  }, [bounds, activeAvailable, activeMetaById, activeZ, sortKey]);

  return { tiles, activeMeta, activeMetaById, activeZ, viewLevel };
}