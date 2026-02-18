import { useMemo } from "react";
import { tilesForBounds } from "../utils/tileUtils";

export function useTiles({ bounds, mapZoom, meta8x8, meta2x2, sortKey }) {
  const isDetailMode = mapZoom >= 16;
  const activeZ = isDetailMode ? 18 : 16;
  const activeMeta = isDetailMode ? meta2x2 : meta8x8;

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

  return { tiles, activeMeta, activeMetaById, activeZ, isDetailMode };
}