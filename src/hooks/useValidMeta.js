import { useState, useEffect } from "react";

/**
 * useValidMeta
 *
 * Given the full meta8x8 array, probes each tile's image URL once at startup
 * and returns only the records whose image actually exists (HTTP 200).
 *
 * Returns:
 *   validMeta8x8  – filtered array (null while still loading)
 *   validating    – true while the probes are in flight
 */
export function useValidMeta(meta8x8) {
  const [validMeta8x8, setValidMeta8x8] = useState(null);
  const [validating, setValidating]     = useState(false);

  useEffect(() => {
    if (!meta8x8 || meta8x8.length === 0) return;

    let cancelled = false;
    setValidating(true);

    // Probe all tile image URLs in parallel.
    // tile_id format: "x_y" at z=16
    const probes = meta8x8.map((record) => {
      const [x, y] = record.tile_id.split("_");
      const url = `/tiles/16/${x}/${y}.jpg`;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve(record);   // image exists
        img.onerror = () => resolve(null);      // 404 or other error → exclude
        img.src = url;
      });
    });

    Promise.all(probes).then((results) => {
      if (cancelled) return;
      const valid = results.filter(Boolean);
      setValidMeta8x8(valid);
      setValidating(false);
    });

    return () => { cancelled = true; };
  }, [meta8x8]); // only re-runs if the metadata array reference changes (i.e. on load)

  return { validMeta8x8, validating };
}