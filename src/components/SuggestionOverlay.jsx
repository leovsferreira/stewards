import { useMemo } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

function ringToPathSegment(ring, west, north, geoW, geoH, size) {
  const pts = ring.map(([lon, lat]) => {
    const px = ((lon - west) / geoW) * size;
    const py = ((north - lat) / geoH) * size; // Y-axis flipped
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

export function SuggestionOverlay({
  tile,
  features,
  size = 160,
  fill = false,
  fillColor   = "rgba(59, 130, 246, 0.22)",
  strokeColor = "#3b82f6",
}) {
  const paths = useMemo(() => {
    if (!features?.length) return [];

    const [west, south, east, north] = tileToLngLatBounds(tile.x, tile.y, tile.z);
    const geoW = east - west;
    const geoH = north - south;

    const result = [];

    for (const f of features) {
      const { type, coordinates } = f.geometry;

      if (type === "Polygon") {
        const d = coordinates
          .map((ring) => ringToPathSegment(ring, west, north, geoW, geoH, size))
          .join(" ");
        result.push(d);

      } else if (type === "MultiPolygon") {
        for (const polygon of coordinates) {
          const d = polygon
            .map((ring) => ringToPathSegment(ring, west, north, geoW, geoH, size))
            .join(" ");
          result.push(d);
        }
      }
    }

    return result;
  }, [tile.x, tile.y, tile.z, features, size]);

  if (paths.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top:    0,
        left:   0,
        pointerEvents: "none",
        width:  fill ? "100%" : size,
        height: fill ? "100%" : size,
      }}
      viewBox={`0 0 ${size} ${size}`}
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      preserveAspectRatio="none"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      ))}
    </svg>
  );
}