import { useMap } from "../hooks/useMap";
import { useHeatmap } from "../hooks/useHeatmap";

export function MapView({ meta2x2, sortKey, children }) {
  const { mapContainerRef, mapRef, bounds, mapZoom, flyToTile } = useMap();

  useHeatmap(mapRef, meta2x2, sortKey);

  return (
    <>
      <div className="leftPane">
        <div ref={mapContainerRef} className="map" />
      </div>

      {children({ bounds, mapZoom, flyToTile })}
    </>
  );
}