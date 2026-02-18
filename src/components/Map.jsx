import { useMap } from "../hooks/useMap";

export function MapView({ children }) {
  const { mapContainerRef, bounds, mapZoom, flyToTile } = useMap();

  return (
    <>
      <div className="leftPane">
        <div ref={mapContainerRef} className="map" />
      </div>

      {children({ bounds, mapZoom, flyToTile })}
    </>
  );
}