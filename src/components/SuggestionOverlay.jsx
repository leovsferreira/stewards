import { useMemo } from "react";
import { tileToLngLatBounds } from "../utils/tileUtils";

/**
 * Projects a single coordinate ring to an SVG path segment string.
 * Returns a closed "M x,y L x,y ... Z" segment.
 */
function ringToPathSegment(ring, west, north, geoW, geoH, size) {
  const pts = ring.map(([lon, lat]) => {
    const px = ((lon - west) / geoW) * size;
    const py = ((north - lat) / geoH) * size; // Y-axis flipped
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

/**
 * Renders GeoJSON polygon features (Polygon / MultiPolygon, including holes)
 * as an SVG overlay positioned absolutely over a tile thumbnail.
 *
 * Props:
 *   tile     – { z, x, y, id }
 *   features – GeoJSON Feature[] (Polygon | MultiPolygon)
 *   size     – coordinate space for path math (default 160)
 *   fill     – if true, SVG stretches to 100%×100% of its container
 *   fillColor   – CSS color string (default semi-transparent blue)
 *   strokeColor – CSS color string (default blue)
 */
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
        // coordinates = [outerRing, ...holeRings]
        // All rings concatenated into one path; fillRule="evenodd" handles holes.
        const d = coordinates
          .map((ring) => ringToPathSegment(ring, west, north, geoW, geoH, size))
          .join(" ");
        result.push(d);

      } else if (type === "MultiPolygon") {
        // coordinates = [polygon1, polygon2, ...]
        // Each polygon = [outerRing, ...holeRings]
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