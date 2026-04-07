import { useMemo } from "react";
import { tilesForBounds } from "../utils/tileUtils";

const MESO_ZOOM  = 16;
const MICRO_ZOOM = 18.5;

function getViewLevel(zoom) {
  if (zoom >= MICRO_ZOOM) return "micro";
  if (zoom >= MESO_ZOOM)  return "meso";
  return "macro";
}

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

    if (viewLevel === "macro" && filteredIds !== null) {
      visible = visible.filter((t) => filteredIds.has(t.id));
    }

    return [...visible].sort((a, b) => {
      const va = Number(activeMetaById?.get(a.id)?.[sortKey] ?? -Infinity);
      const vb = Number(activeMetaById?.get(b.id)?.[sortKey] ?? -Infinity);
      return vb - va;
    });
  }, [viewportTiles, viewLevel, filteredIds, activeMetaById, sortKey]);

  return { tiles, viewportTileIds, activeMeta, activeMetaById, activeZ, viewLevel };
}