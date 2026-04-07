import { useState, useEffect } from "react";

export function useValidMeta(meta8x8) {
  const [validMeta8x8, setValidMeta8x8] = useState(null);
  const [validating, setValidating]     = useState(false);

  useEffect(() => {
    if (!meta8x8 || meta8x8.length === 0) return;

    let cancelled = false;
    setValidating(true);

    const probes = meta8x8.map((record) => {
      const [x, y] = record.tile_id.split("_");
      const url = `/tiles/16/${x}/${y}.jpg`;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve(record); 
        img.onerror = () => resolve(null); 
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
  }, [meta8x8]); 

  return { validMeta8x8, validating };
}