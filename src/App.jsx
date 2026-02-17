import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "./App.css";

/* Convert lon/lat -> XYZ tile coords (Web Mercator) */
function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);

  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  return { x, y, z };
}

/* Compute all tiles intersecting bounds at zoom z */
function tilesForBounds(bounds, z) {
  const nw = lonLatToTile(bounds.west, bounds.north, z);
  const se = lonLatToTile(bounds.east, bounds.south, z);

  const xMin = Math.min(nw.x, se.x);
  const xMax = Math.max(nw.x, se.x);
  const yMin = Math.min(nw.y, se.y);
  const yMax = Math.max(nw.y, se.y);

  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y, id: `${x}_${y}` });
    }
  }

  // stable order (top-to-bottom, left-to-right)
  tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return tiles;
}

/* Tile row component that only renders if the image exists */
function TileRowIfExists({ tile, meta, sortKey }) {
  const imgUrl = `/tiles/${tile.z}/${tile.x}/${tile.y}.jpg`;
  const [exists, setExists] = useState(null); // null=checking, true/false decided

  useEffect(() => {
    let cancelled = false;
    setExists(null);

    const img = new Image();
    img.onload = () => !cancelled && setExists(true);
    img.onerror = () => !cancelled && setExists(false);
    img.src = imgUrl;

    return () => {
      cancelled = true;
    };
  }, [imgUrl]);

  if (exists !== true) return null; // ✅ skip missing tiles (and while loading)

  const val = meta?.[sortKey];
  const valStr =
    val === undefined || val === null
      ? "—"
      : sortKey.startsWith("mean_")
      ? Number(val).toFixed(2)
      : String(Number(val));

  return (
    <div className="row">
      {/* Column 1: tile thumbnail */}
      <div className="thumbWrap">
        <img src={imgUrl} alt={`tile ${tile.id}`} className="thumb" loading="lazy" />
        <div className="tileLabel">
          {tile.id} · {valStr}
        </div>
      </div>

      {/* Column 2: horizontal suggestions */}
      <div className="suggestionsWrap">
        <div className="suggestionsScroller">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="suggestionCard">
              Suggestion {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const [bounds, setBounds] = useState(null);

  // Load z=18 metadata (your 2x2 tiles)
  const [meta2x2, setMeta2x2] = useState(null);

  // Sort key (descending)
  const [sortKey, setSortKey] = useState("n_uncertain");

  // 2x2 tiles are z=18 (since base 1x1 is z=19)
  const zFor2x2 = 18;

  // Fast lookup: available tile ids
  const available2x2 = useMemo(() => {
    if (!meta2x2) return null;
    return new Set(meta2x2.map((r) => r.tile_id));
  }, [meta2x2]);

  // Fast lookup: tile_id -> metadata record
  const metaByTileId = useMemo(() => {
    if (!meta2x2) return null;
    const m = new Map();
    for (const r of meta2x2) m.set(r.tile_id, r);
    return m;
  }, [meta2x2]);

  // Fetch metadata once
  useEffect(() => {
    fetch("/meta/meta_z18_2x2.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setMeta2x2)
      .catch((err) => console.error("Failed to load meta_z18_2x2:", err));
  }, []);

  // Compute tiles in view (ONLY those that exist in your metadata) and sort desc
  const tiles = useMemo(() => {
    if (!bounds) return [];
    if (!available2x2 || !metaByTileId) return [];

    const all = tilesForBounds(bounds, zFor2x2);
    const onlyMine = all.filter((t) => available2x2.has(t.id));

    // Desc sort: max at top
    onlyMine.sort((a, b) => {
      const ma = metaByTileId.get(a.id);
      const mb = metaByTileId.get(b.id);

      const va = Number(ma?.[sortKey] ?? -Infinity);
      const vb = Number(mb?.[sortKey] ?? -Infinity);

      return vb - va;
    });

    // return onlyMine.slice(0, 300);
    return onlyMine;
  }, [bounds, available2x2, metaByTileId, sortKey]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;

    const style = {
      version: 8,
      sources: {
        // Humanitarian OSM (HOT) basemap
        hot: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          maxzoom: 19,
        },
      },
      layers: [{ id: "hot", type: "raster", source: "hot" }],
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-71.06, 42.30], // Dorchester/Boston area
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("error", (e) => {
      console.error("MAP ERROR:", e?.error || e);
    });

    const updateBounds = () => {
      const b = map.getBounds();
      setBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    };

    map.on("load", () => {
      // Optional: overlay YOUR tile pyramid (z=16..19) on the map
      // Remove this block if you don't want your ortho tiles on the map yet.
      map.addSource("myOrthoTiles", {
        type: "raster",
        tiles: ["/tiles/{z}/{x}/{y}.jpg"], // via Vite proxy -> localhost:8000
        tileSize: 256,
        minzoom: 16,
        maxzoom: 19,
      });

      map.addLayer({
        id: "myOrthoLayer",
        type: "raster",
        source: "myOrthoTiles",
        minzoom: 16,
        maxzoom: 19,
        paint: { "raster-opacity": 1.0 },
      });

      updateBounds();
    });

    map.on("moveend", updateBounds);
    map.on("zoomend", updateBounds);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="page">
      {/* Left: Map */}
      <div className="leftPane">
        <div ref={mapContainerRef} className="map" />
      </div>

      {/* Right: Tile list */}
      <div className="rightPane">
        <div className="header">
          <div>
            <div className="title">2 x 2 Tiles</div>
            <div className="sub">
              {!meta2x2
                ? "Loading metadata…"
                : bounds
                ? `W ${bounds.west.toFixed(4)} · S ${bounds.south.toFixed(
                    4
                  )} · E ${bounds.east.toFixed(4)} · N ${bounds.north.toFixed(4)}`
                : "Waiting for map…"}
            </div>
          </div>

          <div className="controls">
            <label className="controlLabel">
              Sort:
              <select
                className="select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
              >
                <option value="n_uncertain">n_uncertain</option>
                <option value="n_uncertain_not_sw">n_uncertain_not_sw</option>
                <option value="mean_conf_uncertain">mean_conf_uncertain</option>
                <option value="mean_conf_uncertain_not_sw">
                  mean_conf_uncertain_not_sw
                </option>
              </select>
            </label>
            <div className="count">{tiles.length} tiles</div>
          </div>
        </div>

        <div className="list">
          {tiles.map((t) => (
            <TileRowIfExists
              key={t.id}
              tile={t}
              meta={metaByTileId?.get(t.id)}
              sortKey={sortKey}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
