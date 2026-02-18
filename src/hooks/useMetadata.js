import { useEffect, useState } from "react";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

export function useMetadata() {
  const [meta8x8, setMeta8x8] = useState(null);
  const [meta2x2, setMeta2x2] = useState(null);

  useEffect(() => {
    fetchJson("/meta/meta_z16_8x8.json")
      .then(setMeta8x8)
      .catch((err) => console.error("Failed to load meta_z16_8x8:", err));

    fetchJson("/meta/meta_z18_2x2.json")
      .then(setMeta2x2)
      .catch((err) => console.error("Failed to load meta_z18_2x2:", err));
  }, []);

  return { meta8x8, meta2x2 };
}