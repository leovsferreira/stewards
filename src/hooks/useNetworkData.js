import { useEffect, useState } from "react";
import shp from "shpjs";

let cachedData = null;
let loadingPromise = null;

/**
 * Loads the sidewalk network shapefile once and caches the parsed GeoJSON.
 * Shared across all consumers — only one fetch happens.
 */
export function useNetworkData() {
  const [data, setData] = useState(cachedData);

  useEffect(() => {
    if (cachedData) {
      setData(cachedData);
      return;
    }

    if (!loadingPromise) {
      const baseUrl = `${window.location.origin}/original/original_network`;
      loadingPromise = shp(baseUrl).then((geojson) => {
        // shpjs may return a single FeatureCollection or an array
        const fc = Array.isArray(geojson) ? geojson[0] : geojson;
        cachedData = fc;
        return fc;
      });
    }

    loadingPromise
      .then((fc) => setData(fc))
      .catch((err) => console.error("Failed to load network data:", err));
  }, []);

  return data;
}