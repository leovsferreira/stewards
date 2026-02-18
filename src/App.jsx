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

/* Convert XYZ tile -> lon/lat bounds [W,S,E,N] */
function tileToLngLatBounds(x, y, z) {
  const n = 2 ** z;

  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;

  const latRadNorth = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latRadSouth = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));

  const north = (latRadNorth * 180) / Math.PI;
  const south = (latRadSouth * 180) / Math.PI;

  return [west, south, east, north];
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

/* ---------- UI components ---------- */
function TileRow({ tile, meta, sortKey, clickable, onClick }) {
  const imgUrl = `/tiles/${tile.z}/${tile.x}/${tile.y}.jpg`;
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const val = meta?.[sortKey];
  const valStr =
    val === undefined || val === null
      ? "—"
      : sortKey.startsWith("mean_")
      ? Number(val).toFixed(2)
      : String(Number(val));

  return (
    <div className="row">
      <div
        className={`thumbWrap ${clickable ? "tileClickable" : ""}`}
        onClick={clickable ? onClick : undefined}
      >
        <img
          src={imgUrl}
          className="thumb"
          loading="lazy"
          onError={() => setHidden(true)}
        />
        <div className="tileLabel">{tile.id} · {valStr}</div>
      </div>

      <div className="suggestionsWrap">
        <div className="suggestionsScroller">
          {Array.from({ length: 5 }).map((_, i) => (
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
  const [mapZoom, setMapZoom] = useState(12);

  // Sorting dropdown (descending)
  const [sortKey, setSortKey] = useState("n_uncertain");

  // Metadata for 8x8 (z=16) and 2x2 (z=18)
  const [meta8x8, setMeta8x8] = useState(null);
  const [meta2x2, setMeta2x2] = useState(null);

  // Mode switch:
  // zoom < 16  => show 8x8 tiles (z=16)
  // zoom >= 16 => show 2x2 tiles (z=18)
  const isDetailMode = mapZoom >= 16;
  const activeZ = isDetailMode ? 18 : 16;
  const activeMeta = isDetailMode ? meta2x2 : meta8x8;

  // Lookups for active mode
  const activeAvailable = useMemo(() => {
    if (!activeMeta) return null;
    return new Set(activeMeta.map((r) => r.tile_id));
  }, [activeMeta]);

  const activeMetaById = useMemo(() => {
    if (!activeMeta) return null;
    const m = new Map();
    for (const r of activeMeta) m.set(r.tile_id, r);
    return m;
  }, [activeMeta]);

  // Fetch metadata once (put these files in public/meta/)
  useEffect(() => {
    fetch("/meta/meta_z16_8x8.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setMeta8x8)
      .catch((err) => console.error("Failed to load meta_z16_8x8:", err));

    fetch("/meta/meta_z18_2x2.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setMeta2x2)
      .catch((err) => console.error("Failed to load meta_z18_2x2:", err));
  }, []);

  // Compute tiles in view for the active mode and sort desc by sortKey
  const tiles = useMemo(() => {
    if (!bounds) return [];
    if (!activeAvailable || !activeMetaById) return [];

    const all = tilesForBounds(bounds, activeZ);
    const onlyMine = all.filter((t) => activeAvailable.has(t.id));

    onlyMine.sort((a, b) => {
      const ma = activeMetaById.get(a.id);
      const mb = activeMetaById.get(b.id);

      const va = Number(ma?.[sortKey] ?? -Infinity);
      const vb = Number(mb?.[sortKey] ?? -Infinity);

      return vb - va;
    });

    return onlyMine;
  }, [bounds, activeAvailable, activeMetaById, activeZ, sortKey]);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const style = {
      version: 8,
      sources: {
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

    const updateStateFromMap = () => {
      const b = map.getBounds();
      setBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
      console.log(map.getZoom())
      setMapZoom(map.getZoom());
    };

    map.on("load", () => {
      // Overlay tile pyramid (z=16..19) on the map
      map.addSource("myOrthoTiles", {
        type: "raster",
        tiles: ["/tiles/{z}/{x}/{y}.jpg"],
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

      updateStateFromMap();
    });

    map.on("moveend", updateStateFromMap);
    map.on("zoomend", updateStateFromMap);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const handleClickTile = (tile) => {
    const map = mapRef.current;
    if (!map) return;

    const [w, s, e, n] = tileToLngLatBounds(tile.x, tile.y, tile.z);

    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: 10,
        duration: 600,
        maxZoom: 16.99,
      }
    );
  };


  const titleText = isDetailMode ? "2 x 2 Tiles" : "8 x 8 Tiles";
  const loadingText = isDetailMode
    ? "Loading 2 x 2 metadata..."
    : "Loading 8 x 8 metadata...";

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
            <div className="title">
              {titleText}{" "}
              <span style={{ fontWeight: 400, color: "#666", fontSize: 12 }}>
                (mode switches at zoom 16)
              </span>
            </div>
            <div className="sub">
              {!activeMeta
                ? loadingText
                : bounds
                ? `Zoom ${mapZoom.toFixed(2)} · W ${bounds.west.toFixed(
                    4
                  )} · S ${bounds.south.toFixed(4)} · E ${bounds.east.toFixed(
                    4
                  )} · N ${bounds.north.toFixed(4)}`
                : "Waiting for map..."}
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
            <TileRow
              key={`${t.z}_${t.id}`}
              tile={t}
              meta={activeMetaById?.get(t.id)}
              sortKey={sortKey}
              clickable={!isDetailMode}
              onClick={!isDetailMode ? () => handleClickTile(t) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
