import { useMemo } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

/**
 * Renders network line segments as an SVG overlay on a tile thumbnail.
 *
 * Props:
 *   tile         – { z, x, y, id }
 *   networkData  – parsed GeoJSON FeatureCollection
 *   size         – thumbnail pixel size (default 160)
 */
export function NetworkOverlay({ tile, networkData, size = 160 }) {
  const paths = useMemo(() => {
    if (!networkData?.features) return [];

    const [west, south, east, north] = tileToLngLatBounds(tile.x, tile.y, tile.z);
    const geoW = east - west;
    const geoH = north - south;

    // Filter features whose bbox intersects the tile
    const lines = [];

    for (const f of networkData.features) {
      const coords =
        f.geometry.type === "LineString"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates; // MultiLineString

      for (const ring of coords) {
        // Quick bbox check on the line segment
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const [lon, lat] of ring) {
          if (lon < minX) minX = lon;
          if (lon > maxX) maxX = lon;
          if (lat < minY) minY = lat;
          if (lat > maxY) maxY = lat;
        }

        // Skip if completely outside tile
        if (maxX < west || minX > east || maxY < south || minY > north) continue;

        // Project to pixel coords
        const pts = ring.map(([lon, lat]) => {
          const px = ((lon - west) / geoW) * size;
          const py = ((north - lat) / geoH) * size; // Y flipped
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        });

        lines.push(pts.join(" "));
      }
    }

    return lines;
  }, [tile.x, tile.y, tile.z, networkData, size]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="networkOverlay"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
    >
      {paths.map((d, i) => (
        <polyline
          key={i}
          points={d}
          fill="none"
          stroke="#e85d04"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        />
      ))}
    </svg>
  );
}