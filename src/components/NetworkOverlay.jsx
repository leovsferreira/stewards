import { useMemo } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

export function NetworkOverlay({ tile, networkData, size = 160, fill = false }) {
  const paths = useMemo(() => {
    if (!networkData?.features) return [];

    const [west, south, east, north] = tileToLngLatBounds(tile.x, tile.y, tile.z);
    const geoW = east - west;
    const geoH = north - south;

    const lines = [];

    for (const f of networkData.features) {
      const coords =
        f.geometry.type === "LineString"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates; // MultiLineString

      for (const ring of coords) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const [lon, lat] of ring) {
          if (lon < minX) minX = lon;
          if (lon > maxX) maxX = lon;
          if (lat < minY) minY = lat;
          if (lat > maxY) maxY = lat;
        }

        if (maxX < west || minX > east || maxY < south || minY > north) continue;

        const pts = ring.map(([lon, lat]) => {
          const px = ((lon - west) / geoW) * size;
          const py = ((north - lat) / geoH) * size;
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
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      preserveAspectRatio="none"
      style={fill ? {
        position: "absolute",
        top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
      } : undefined}
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