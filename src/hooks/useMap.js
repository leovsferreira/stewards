import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { tileToLngLatBounds } from "../utils/tileUtils";
import { STUDY_TILES } from "../utils/studyTiles";
import { MICRO_ZOOM } from "../utils/viewConfig";

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;

const MAP_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© <a href='https://carto.com/'>CARTO</a> © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const CITY_CENTERS = {
  boston: [-71.06, 42.3],   // Dorchester
  recife: [-34.8745, -8.0535],
};

// ?tile=1A (study code) or ?tile=105645_136968 (raw z18 tile id) -> start the
// map fitted to that tile, which puts it straight into the micro view
function initialBoundsFromUrl() {
  const code = new URLSearchParams(window.location.search).get("tile");
  if (!code) return null;
  const id = STUDY_TILES[code.toUpperCase()] ?? (/^\d+_\d+$/.test(code) ? code : null);
  if (!id) {
    console.warn(`Unknown tile code in URL: ${code}`);
    return null;
  }
  const [x, y] = id.split("_").map(Number);
  const [w, s, e, n] = tileToLngLatBounds(x, y, 18);
  return [[w, s], [e, n]];
}

export function useMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const [bounds, setBounds] = useState(null);
  const [mapZoom, setMapZoom] = useState(12);

  useEffect(() => {
    if (mapRef.current) return;

    const startBounds = initialBoundsFromUrl();
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      ...(startBounds
        ? { bounds: startBounds, fitBoundsOptions: { padding: 10 } }
        : {
            // center: [-71.06, 42.3], // Dorchester / Boston area
            center: CITY_CENTERS[import.meta.env.VITE_CITY] ?? CITY_CENTERS.boston,
            zoom: 13,
          }),
    });

    // a ?tile= link must always land inside the micro view, whatever the
    // threshold and viewport size
    if (startBounds && map.getZoom() < MICRO_ZOOM) {
      map.jumpTo({ zoom: MICRO_ZOOM + 0.1 });
    }

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("error", (e) => {
      console.error("MAP ERROR:", e?.error || e);
    });

    const syncState = () => {
      const b = map.getBounds();
      setBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
      setMapZoom(map.getZoom());
    };

    map.on("load", () => {
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
        paint: { "raster-opacity": 1.0 },
      });

      syncState();
    });

    map.on("moveend", syncState);
    map.on("zoomend", syncState);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const flyToTile = (tile) => {
    const map = mapRef.current;
    if (!map) return;

    const [w, s, e, n] = tileToLngLatBounds(tile.x, tile.y, tile.z);
    map.fitBounds([[w, s], [e, n]], {
      padding: 10,
      duration: 600,
      maxZoom: 16.99,
    });
  };

  const fitToTile = (tile) => {
    const map = mapRef.current;
    if (!map) return;

    const [w, s, e, n] = tileToLngLatBounds(tile.x, tile.y, tile.z);
    map.fitBounds([[w, s], [e, n]], {
      padding: 10,
      duration: 600
    });
  };

  return { mapContainerRef, mapRef, bounds, mapZoom, flyToTile, fitToTile };
}