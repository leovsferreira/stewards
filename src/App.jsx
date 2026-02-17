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

function TileRowIfExists({ tile }) {
  const imgUrl = `/tiles/${tile.z}/${tile.x}/${tile.y}.jpg`;
  const [exists, setExists] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const img = new Image();
    img.onload = () => !cancelled && setExists(true);
    img.onerror = () => !cancelled && setExists(false);
    img.src = imgUrl;

    return () => {
      cancelled = true;
    };
  }, [imgUrl]);

  if (exists === null) return null;
  if (exists === false) return null;

  return (
    <div className="row">
      <div className="thumbWrap">
        <img src={imgUrl} alt={`tile ${tile.id}`} className="thumb" loading="lazy" />
        <div className="tileLabel">{tile.id}</div>
      </div>

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

  // This is the zoom level for 2x2 tiles (since your base is z=19 1x1)
  const zFor2x2 = 18;

  // Build a fast lookup set of available 2x2 tile ids "x_y"
  const available2x2 = useMemo(() => {
    if (!meta2x2) return null;
    return new Set(meta2x2.map((r) => r.tile_id));
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

  // Compute tiles in view (ONLY those that exist in your metadata)
  const tiles = useMemo(() => {
    if (!bounds) return [];
    if (!available2x2) return [];

    const all = tilesForBounds(bounds, zFor2x2);
    const onlyMine = all.filter((t) => available2x2.has(t.id));

    // still cap to avoid UI blow-up if you're zoomed way out
    //return onlyMine.slice(0, 300);
    return onlyMine;
  }, [bounds, available2x2]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;

    const style = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          maxzoom: 19,
        },
      },
      layers: [
        { id: "osm", type: "raster", source: "osm" },
      ],
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-71.06, 42.30],
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("error", (e) => console.error("MAP ERROR:", e?.error || e));

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
      // 🔥 YOUR TILE PYRAMID (z=16..19) on top of OSM
      map.addSource("myOrthoTiles", {
        type: "raster",
        tiles: [
          // IMPORTANT:
          // Use "/tiles/..." so Vite proxy forwards to http://localhost:8000
          "/tiles/{z}/{x}/{y}.jpg",
        ],
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
        paint: {
          "raster-opacity": 1.0,
        },
      });

      // initial bounds
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
            <div className="title">My 2x2 Tiles in View (z=18)</div>
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

          <div className="count">{tiles.length} tiles</div>
        </div>

        <div className="list">
          {tiles.map((t) => (
            <TileRowIfExists key={t.id} tile={t} />
          ))}
          {meta2x2 && bounds && tiles.length === 0 && (
            <div style={{ color: "#666", padding: 12 }}>
              No 2×2 tiles from your dataset are inside the current view.
              (Try panning/zooming closer to Dorchester.)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
