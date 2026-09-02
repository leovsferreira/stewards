import { useEffect, useRef } from "react";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

let gmapsPromise = null;

function loadGoogleMaps() {
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve) => {
    if (window.google?.maps?.StreetViewPanorama) { resolve(); return; }
    const script    = document.createElement("script");
    script.src      = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`;
    script.async    = true;
    script.onload   = resolve;
    document.head.appendChild(script);
  });
  return gmapsPromise;
}

export function StreetViewPanel({ panel, onClose, onPanoChange }) {
  const containerRef = useRef(null);
  const panoRef      = useRef(null);

  useEffect(() => {
    if (!panel.open || !panel.location) return;

    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;

      // Reuse the existing panorama. Creating a new one on every update leaks
      // WebGL contexts (browsers cap them per page; past the cap the oldest
      // context is lost and the canvas goes black — can even kill the main map).
      if (panoRef.current) {
        const pano = panoRef.current;
        const pos = pano.getPosition();
        if (!pos ||
            Math.abs(pos.lat() - panel.location.lat) > 1e-9 ||
            Math.abs(pos.lng() - panel.location.lng) > 1e-9) {
          pano.setPosition({ lat: panel.location.lat, lng: panel.location.lng });
        }
        // small epsilon: pov_changed -> onPanoChange -> re-render feeds heading
        // straight back here; without it, setPov would loop forever
        if (Math.abs(pano.getPov().heading - panel.heading) > 0.5) {
          pano.setPov({ heading: panel.heading, pitch: pano.getPov().pitch ?? 0 });
        }
        pano.setVisible(true);
        return;
      }

      const pano = new window.google.maps.StreetViewPanorama(containerRef.current, {
        position:              { lat: panel.location.lat, lng: panel.location.lng },
        pov:                   { heading: panel.heading, pitch: 0 },
        addressControl:        false,
        zoomControl:           false,
        fullscreenControl:     false,
        panControl:            false,
        linksControl:          true,
        showRoadLabels:        false,
        motionTracking:        false,
        motionTrackingControl: false,
      });

      pano.addListener("pov_changed", () => {
        onPanoChange({
          heading: pano.getPov().heading,
          lat:     pano.getPosition()?.lat(),
          lng:     pano.getPosition()?.lng(),
        });
      });

      pano.addListener("position_changed", () => {
        onPanoChange({
          heading: pano.getPov().heading,
          lat:     pano.getPosition()?.lat(),
          lng:     pano.getPosition()?.lng(),
        });
      });

      panoRef.current = pano;
    });

    return () => {
      cancelled = true;   // keep the panorama alive across effect re-runs — reused above
    };
  }, [panel.location, panel.heading, panel.open]);

  // dispose only when the panel actually unmounts (closed)
  useEffect(() => () => {
    if (panoRef.current) {
      window.google.maps.event.clearInstanceListeners(panoRef.current);
      panoRef.current.setVisible(false);
      panoRef.current = null;
    }
  }, []);

  if (!panel.open) return null;

  return (
    <div className="svPanel">
      <div className="svHeader">
        <span className="svTitle">Street View</span>
        <button className="svClose" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="svBody">
        {panel.loading && (
          <div className="svMessage">
            <span className="svSpinner" />
            Looking for imagery…
          </div>
        )}

        {!panel.loading && panel.error && (
          <div className="svMessage svError">{panel.error}</div>
        )}

        <div
          ref={containerRef}
          className="svViewer"
          style={{ display: panel.location ? "block" : "none" }}
        />
      </div>
    </div>
  );
}